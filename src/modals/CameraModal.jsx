import { useRef, useState, useEffect } from 'react'
import { createWorker } from 'tesseract.js'
import { addCard } from '../lib/db'

// ─────────────────────────────────────────────────────────────────────────────
// Image helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Crop a region of the live video, upscale for resolution, then apply
 * per-pixel contrast normalisation so text is readable regardless of whether
 * the card is a standard frame, borderless, showcase, or full-art printing.
 *
 * Contrast normalisation:
 *   1. Grayscale     — removes colour noise from the card art
 *   2. Range stretch — darkest pixel → 0, brightest → 255
 *   3. Auto-invert   — if avg brightness < 110 the image is dark-on-dark;
 *                      invert so Tesseract always sees dark text on light bg
 */
function cropAndProcess(video, xPct, yPct, wPct, hPct, scale = 4) {
  const vw = video.videoWidth, vh = video.videoHeight
  const sx = Math.floor(vw * xPct), sy = Math.floor(vh * yPct)
  const sw = Math.floor(vw * wPct), sh = Math.floor(vh * hPct)

  const c = document.createElement('canvas')
  c.width  = sw * scale
  c.height = sh * scale
  const ctx = c.getContext('2d')
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, sw * scale, sh * scale)

  const id   = ctx.getImageData(0, 0, c.width, c.height)
  const data = id.data
  let lo = 255, hi = 0, sum = 0

  for (let i = 0; i < data.length; i += 4) {
    const g = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2])
    if (g < lo) lo = g
    if (g > hi) hi = g
    sum += g
  }
  const range  = hi - lo || 1
  const avgBrt = sum / (data.length / 4)

  const invert = avgBrt < 110
  for (let i = 0; i < data.length; i += 4) {
    let g = Math.round(((0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) - lo) * 255 / range)
    if (invert) g = 255 - g
    data[i] = data[i + 1] = data[i + 2] = g
  }
  ctx.putImageData(id, 0, 0)
  return c
}

/** Tiny 32×32 thumbnail for cheap motion detection. */
function thumbCanvas(video) {
  const c = document.createElement('canvas')
  c.width = 32; c.height = 32
  c.getContext('2d').drawImage(video, 0, 0, 32, 32)
  return c
}

/** Average per-pixel brightness difference between two 32×32 canvases. */
function frameDiff(c1, c2) {
  const d1 = c1.getContext('2d').getImageData(0, 0, 32, 32).data
  const d2 = c2.getContext('2d').getImageData(0, 0, 32, 32).data
  let total = 0
  for (let i = 0; i < d1.length; i += 16) total += Math.abs(d1[i] - d2[i])
  return total / (d1.length / 16)
}

// ─────────────────────────────────────────────────────────────────────────────
// Text helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Remove anything that could never appear in a card name. */
function cleanName(raw) {
  return (raw || '')
    .replace(/[^a-zA-Z0-9 ',\-\.]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Extract a collector number from the bottom strip.
 * Handles: "147/272"  "★147"  "P47"  "S5"  plain "147"
 */
function extractCollector(raw) {
  if (!raw) return null
  const slash = raw.match(/\b(\d{1,4})\/\d+\b/)
  if (slash) return slash[1]
  const star = raw.match(/[★*P]\s*(\d{1,4})\b/)
  if (star) return star[1]
  const bare = raw.match(/(?<![a-zA-Z])(\d{3,4})(?![a-zA-Z])/)
  if (bare) return bare[1]
  return null
}

/**
 * Parse a type line OCR result into an array of meaningful type words
 * suitable for Scryfall `t:` filters.
 *
 * Examples:
 *   "Legendary Creature — Human Wizard"  → ['legendary','creature','human','wizard']
 *   "Instant"                            → ['instant']
 *   "Enchantment — Aura"                 → ['enchantment','aura']
 */
function extractTypeWords(raw) {
  if (!raw) return []
  // Replace the em-dash and common OCR artefacts with spaces
  const clean = (raw || '').replace(/[—–\-]/g, ' ').replace(/[^a-zA-Z\s]/g, ' ').replace(/\s+/g, ' ').trim()
  const words = clean.toLowerCase().split(' ').filter(Boolean)

  // Recognised MTG type words (supertypes + card types + common subtypes)
  const KNOWN = new Set([
    'legendary','basic','snow','world',
    'creature','instant','sorcery','enchantment','artifact','planeswalker','land','battle','tribal',
    'human','wizard','elf','dragon','angel','demon','goblin','zombie','vampire','merfolk',
    'warrior','cleric','rogue','shaman','soldier','knight','druid','spirit','elemental',
    'aura','equipment','vehicle','saga','shrine',
    'mountain','forest','island','plains','swamp',
    'jace','liliana','chandra','garruk','ajani','nissa','sorin','teferi','karn','urza',
  ])
  return words.filter(w => KNOWN.has(w))
}

// ─────────────────────────────────────────────────────────────────────────────
// Scryfall lookup
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lookup priority:
 *  1. Name + collector number        →  exact printing (best for alt art)
 *  2. Name only                      →  Scryfall fuzzy /cards/named
 *  3. Name only                      →  autocomplete (handles partial/garbled OCR)
 *  4. Type words + collector number  →  when name OCR fails but type line is readable
 *  5. Collector number only          →  last resort; catches borderless where name fails
 */
async function lookupCard(name, colNum, typeWords = []) {
  let card = null
  let quality = 'fuzzy'

  // 1 — exact printing via name + collector number
  if (name.length >= 3 && colNum) {
    try {
      const res = await fetch(
        `https://api.scryfall.com/cards/search?q=${encodeURIComponent(`"${name}" cn:${colNum}`)}&unique=prints`
      )
      if (res.ok) {
        const json = await res.json()
        if (json.data?.length > 0) { card = json.data[0]; quality = 'exact' }
      }
    } catch { /* continue */ }
  }

  // 2 — fuzzy name
  if (!card && name.length >= 3) {
    try {
      const res = await fetch(
        `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(name)}`
      )
      if (res.ok) {
        const json = await res.json()
        if (json.object === 'card') card = json
      }
    } catch { /* continue */ }
  }

  // 3 — autocomplete (handles garbled / partially-read names)
  if (!card && name.length >= 3) {
    try {
      const acRes = await fetch(
        `https://api.scryfall.com/cards/autocomplete?q=${encodeURIComponent(name)}`
      )
      if (acRes.ok) {
        const acJson = await acRes.json()
        const top = acJson.data?.[0]
        if (top) {
          const detRes = await fetch(
            `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(top)}`
          )
          if (detRes.ok) {
            const det = await detRes.json()
            if (det.object === 'card') { card = det; quality = 'fuzzy' }
          }
        }
      }
    } catch { /* continue */ }
  }

  // 4 — type line + collector number
  //   Works when name OCR is completely garbled on borderless / full-art cards
  //   but the type line strip (middle of card) OCR succeeds.
  //   Most useful: "legendary creature" + cn:X narrows to very few cards.
  if (!card && typeWords.length >= 1 && colNum) {
    // Use at most the first 2 type words to avoid over-filtering
    const typeFilter = typeWords.slice(0, 2).map(t => `t:${t}`).join(' ')
    try {
      const res = await fetch(
        `https://api.scryfall.com/cards/search?q=${encodeURIComponent(`${typeFilter} cn:${colNum}`)}&unique=prints`
      )
      if (res.ok) {
        const json = await res.json()
        // Only accept if we get a single unambiguous result, or take first of few
        if (json.data?.length === 1) {
          card = json.data[0]; quality = 'type'
        } else if (json.data?.length >= 2 && json.data?.length <= 4) {
          // Prefer the result whose name most resembles what we OCR'd
          card = json.data[0]; quality = 'type'
        }
      }
    } catch { /* continue */ }
  }

  // 5 — name + type words (when collector OCR failed, use type to disambiguate fuzzy name)
  if (!card && name.length >= 3 && typeWords.length >= 1) {
    const primaryType = typeWords.find(t =>
      ['creature','instant','sorcery','enchantment','artifact','planeswalker','land','battle'].includes(t)
    )
    if (primaryType) {
      try {
        const res = await fetch(
          `https://api.scryfall.com/cards/search?q=${encodeURIComponent(`"${name}" t:${primaryType}`)}&unique=prints`
        )
        if (res.ok) {
          const json = await res.json()
          if (json.data?.length > 0) { card = json.data[0]; quality = 'fuzzy' }
        }
      } catch { /* continue */ }
    }
  }

  // 6 — collector number only (borderless / alt art where name OCR is unusable)
  if (!card && colNum) {
    try {
      const res = await fetch(
        `https://api.scryfall.com/cards/search?q=cn:${colNum}&order=released&dir=desc&unique=prints`
      )
      if (res.ok) {
        const json = await res.json()
        if (json.data?.length > 0) { card = json.data[0]; quality = 'collector' }
      }
    } catch { /* continue */ }
  }

  return { card, quality }
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function CameraModal({
  onClose, showToast, user, collection, setCollection, openAddCard
}) {
  // Three dedicated workers, each tuned for its region
  const w1Ref = useRef(null)       // card name  (top strip)
  const w2Ref = useRef(null)       // collector # (bottom strip)
  const w3Ref = useRef(null)       // type line  (middle strip)
  const ocrReadyRef = useRef(false)

  const scanningRef  = useRef(false)
  const frozenRef    = useRef(false)
  const prevThumbRef = useRef(null)
  const stableRef    = useRef(0)
  const STABLE_NEEDED = 2   // 2 × 300 ms = 600 ms hold-still

  const videoRef = useRef(null)
  const [cameraReady, setCameraReady] = useState(false)
  const [cameraError, setCameraError] = useState(null)
  const [ocrStatus,   setOcrStatus]   = useState('loading')

  const [nameRead,      setNameRead]      = useState('')
  const [collectorRead, setCollectorRead] = useState('')
  const [typeRead,      setTypeRead]      = useState('')  // type line display

  const [foundCard,    setFoundCard]    = useState(null)
  const [matchQuality, setMatchQuality] = useState(null)
  const [addedCards,   setAddedCards]   = useState([])
  const [adding,       setAdding]       = useState(false)

  // ── Init workers ──────────────────────────────────────────────────────────
  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const [w1, w2, w3] = await Promise.all([
          createWorker('eng'),
          createWorker('eng'),
          createWorker('eng'),
        ])
        if (!active) { w1.terminate(); w2.terminate(); w3.terminate(); return }

        // Name worker — letters, digits, common punctuation
        await w1.setParameters({
          tessedit_pageseg_mode: '7',
          tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 ',-.",
        })

        // Collector worker — digits and slash only
        await w2.setParameters({
          tessedit_pageseg_mode: '7',
          tessedit_char_whitelist: '0123456789/',
        })

        // Type-line worker — letters and spaces only (no digits needed for type line)
        await w3.setParameters({
          tessedit_pageseg_mode: '7',
          tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz ',
        })

        w1Ref.current = w1
        w2Ref.current = w2
        w3Ref.current = w3
        ocrReadyRef.current = true
        setOcrStatus('ready')
      } catch (e) {
        console.error('[Scanner] worker init:', e)
        if (active) setOcrStatus('error')
      }
    })()
    return () => {
      active = false
      w1Ref.current?.terminate().catch(() => {})
      w2Ref.current?.terminate().catch(() => {})
      w3Ref.current?.terminate().catch(() => {})
    }
  }, [])

  // ── Camera ────────────────────────────────────────────────────────────────
  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          setCameraError('Camera not supported on this device.'); return
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }
        })
        if (active && videoRef.current) {
          videoRef.current.srcObject = stream
          setCameraReady(true)
        }
      } catch {
        if (active) { setCameraError('Camera access denied.'); showToast('Camera access denied') }
      }
    })()
    return () => { active = false; stopTracks() }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const stopTracks = () => videoRef.current?.srcObject?.getTracks().forEach(t => t.stop())

  // ── Stability-based scan trigger ──────────────────────────────────────────
  useEffect(() => {
    if (!cameraReady) return
    const id = setInterval(stabilityCheck, 300)
    return () => clearInterval(id)
  }, [cameraReady]) // eslint-disable-line react-hooks/exhaustive-deps

  function stabilityCheck() {
    if (!ocrReadyRef.current || frozenRef.current) return
    const video = videoRef.current
    if (!video?.videoWidth) return
    const curr = thumbCanvas(video)
    if (prevThumbRef.current) {
      if (frameDiff(curr, prevThumbRef.current) < 12) {
        stableRef.current++
        if (stableRef.current === STABLE_NEEDED && !scanningRef.current) scanFrame()
      } else {
        stableRef.current = 0
      }
    }
    prevThumbRef.current = curr
  }

  // ── Core scan ─────────────────────────────────────────────────────────────
  async function scanFrame() {
    if (scanningRef.current || frozenRef.current || !ocrReadyRef.current) return
    const video = videoRef.current
    if (!video?.videoWidth) return

    scanningRef.current = true
    setOcrStatus('scanning')

    try {
      // Three regions processed and OCR'd in parallel:
      //
      //  w1 — Name strip:      y=3–28%   (top of card, covers title bar)
      //  w2 — Collector strip: y=72–97%  (bottom strip, collector number)
      //  w3 — Type line:       y=48–60%  (middle, just below the art box)
      //
      // All three run simultaneously in separate Web Worker threads.
      const [nd, cd, td] = await Promise.all([
        w1Ref.current.recognize(cropAndProcess(video, 0.03, 0.03, 0.82, 0.25, 4)),
        w2Ref.current.recognize(cropAndProcess(video, 0.03, 0.72, 0.87, 0.25, 3)),
        w3Ref.current.recognize(cropAndProcess(video, 0.02, 0.48, 0.80, 0.14, 4)),
      ])

      const name      = cleanName(nd.data.text)
      const colNum    = extractCollector(cd.data.text)
      const typeWords = extractTypeWords(td.data.text)

      setNameRead(name)
      setCollectorRead(colNum ? `#${colNum}` : '')
      setTypeRead(typeWords.length > 0 ? typeWords.join(' · ') : '')

      if (name.length >= 2 || colNum || typeWords.length > 0) {
        const { card, quality } = await lookupCard(name, colNum, typeWords)
        if (card) {
          frozenRef.current = true
          stableRef.current = 0
          setFoundCard(card)
          setMatchQuality(quality)
          if (navigator.vibrate) navigator.vibrate(40)
        }
      }
    } catch (e) {
      console.warn('[Scanner] scan error:', e)
    }

    setOcrStatus('ready')
    scanningRef.current = false
  }

  // ── Add to collection ─────────────────────────────────────────────────────
  async function handleAdd() {
    if (!foundCard || adding) return
    const snap = foundCard
    setAdding(true)
    try {
      const card = {
        name:         snap.name,
        qty:          1,
        condition:    'NM',
        setName:      snap.set_name,
        img:          snap.image_uris?.small || snap.card_faces?.[0]?.image_uris?.small || null,
        colors:       snap.color_identity || [],
        price:        snap.prices?.usd ? parseFloat(snap.prices.usd) : null,
        tcgplayerUrl: snap.purchase_uris?.tcgplayer || null,
      }
      const saved = await addCard(card, user?.id)
      setCollection(prev => {
        const i = prev.findIndex(c => c.name.toLowerCase() === card.name.toLowerCase())
        if (i >= 0) {
          const next = [...prev]; next[i] = { ...next[i], qty: next[i].qty + 1 }; return next
        }
        return [...prev, saved || { ...card, id: Date.now() }]
      })
      setAddedCards(prev => [...prev, snap.name])
      showToast(`✓ Added ${snap.name}`)
      if (navigator.vibrate) navigator.vibrate([40, 20, 80])
      doRescan()
    } catch (err) {
      console.error('[Scanner] add failed:', err)
      showToast('Could not save card — try again')
    }
    setAdding(false)
  }

  function doRescan() {
    frozenRef.current = false
    stableRef.current = 0
    prevThumbRef.current = null
    setFoundCard(null)
    setMatchQuality(null)
    setNameRead('')
    setCollectorRead('')
    setTypeRead('')
  }

  function handleCustomize() {
    if (!foundCard) return
    stopTracks(); onClose()
    openAddCard({ name: foundCard.name })
  }

  function handleClose() { stopTracks(); onClose() }

  // ── Derived display values ─────────────────────────────────────────────────
  const img          = foundCard?.image_uris?.small || foundCard?.card_faces?.[0]?.image_uris?.small
  const alreadyOwned = foundCard
    ? (collection || []).find(c => c.name.toLowerCase() === foundCard.name.toLowerCase())
    : null

  const qualityLabel = {
    exact:     { text: '✓✓ Exact match',       color: '#4ade80',  bg: 'rgba(74,222,128,0.2)'  },
    fuzzy:     { text: '✓ Name match',          color: '#fbbf24',  bg: 'rgba(251,191,36,0.2)'  },
    type:      { text: '✓ Type line match',     color: '#c084fc',  bg: 'rgba(192,132,252,0.2)' },
    collector: { text: '✓ Collector # match',   color: '#93c5fd',  bg: 'rgba(147,197,253,0.2)' },
  }[matchQuality] || null

  const nameColor = foundCard ? '#4caf50' : '#4a9eff'
  const collColor = foundCard ? '#4caf50' : '#f59e0b'
  const typeColor = foundCard ? '#4caf50' : '#c084fc'

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) handleClose() }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,.88)',
        zIndex: 200, overflowY: 'auto', WebkitOverflowScrolling: 'touch',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '12px 12px 24px',
      }}
    >
      <div style={{
        background: 'var(--bg-secondary)', border: '1px solid var(--border)',
        borderRadius: '16px', padding: '14px',
        width: '100%', maxWidth: '480px', marginTop: '8px',
      }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <div>
            <h3 style={{ margin: '0 0 2px', fontSize: '1rem' }}>📷 Scan Card</h3>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
              Hold card still · reads name, type line & collector #
            </div>
          </div>
          <button onClick={handleClose} style={{
            background: 'var(--bg-primary)', border: '1px solid var(--border)',
            borderRadius: '50%', width: '32px', height: '32px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', fontSize: '1rem', color: 'var(--text)', flexShrink: 0,
          }}>✕</button>
        </div>

        {/* Camera */}
        {cameraError ? (
          <div style={{
            padding: '32px', textAlign: 'center', background: 'var(--bg-primary)',
            borderRadius: '10px', marginBottom: '12px',
          }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '10px' }}>📷</div>
            <p style={{ margin: 0, color: 'var(--text-muted)' }}>{cameraError}</p>
          </div>
        ) : (
          <div style={{
            position: 'relative', borderRadius: '10px',
            overflow: 'hidden', background: '#000', marginBottom: '10px',
          }}>
            <video ref={videoRef} autoPlay playsInline muted
              style={{ width: '100%', display: 'block', minHeight: '200px' }} />

            {/* Blue box — card name, top 3–28% */}
            <div style={{
              position: 'absolute', left: '3%', top: '3%', width: '82%', height: '25%',
              border: `2px solid ${nameColor}`, borderRadius: '4px',
              transition: 'border-color .25s', pointerEvents: 'none',
              boxShadow: foundCard ? '0 0 10px rgba(76,175,80,0.4)' : 'none',
            }} />
            <span style={{
              position: 'absolute', left: '3%', top: 'calc(3% + 26%)',
              fontSize: '0.58rem', color: 'rgba(255,255,255,0.45)', pointerEvents: 'none',
            }}>Name</span>

            {/* Purple box — type line, 48–62% */}
            <div style={{
              position: 'absolute', left: '2%', top: '48%', width: '80%', height: '14%',
              border: `2px solid ${typeColor}`, borderRadius: '4px',
              transition: 'border-color .25s', pointerEvents: 'none',
              boxShadow: foundCard ? '0 0 8px rgba(192,132,252,0.3)' : 'none',
            }} />
            <span style={{
              position: 'absolute', left: '2%', top: 'calc(48% - 13px)',
              fontSize: '0.58rem', color: 'rgba(255,255,255,0.45)', pointerEvents: 'none',
            }}>Type</span>

            {/* Amber box — collector #, bottom 72–97% */}
            <div style={{
              position: 'absolute', left: '3%', top: '72%', width: '87%', height: '25%',
              border: `2px solid ${collColor}`, borderRadius: '4px',
              transition: 'border-color .25s', pointerEvents: 'none',
              boxShadow: foundCard ? '0 0 10px rgba(76,175,80,0.4)' : 'none',
            }} />
            <span style={{
              position: 'absolute', left: '3%', top: 'calc(72% - 14px)',
              fontSize: '0.58rem', color: 'rgba(255,255,255,0.45)', pointerEvents: 'none',
            }}>Collector #</span>

            {/* Status pill */}
            {!foundCard && (ocrStatus === 'loading' || ocrStatus === 'scanning') && (
              <div style={{
                position: 'absolute', bottom: '8px', left: '50%', transform: 'translateX(-50%)',
                background: 'rgba(0,0,0,0.72)',
                color: ocrStatus === 'loading' ? '#c084fc' : '#4a9eff',
                padding: '3px 14px', borderRadius: '20px', fontSize: '0.72rem',
                whiteSpace: 'nowrap', pointerEvents: 'none',
              }}>
                {ocrStatus === 'loading' ? '⏳ Loading OCR…' : '🔍 Reading…'}
              </div>
            )}

            {/* ── Card preview overlay (inside video, always visible) ── */}
            {foundCard && (
              <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0,
                background: 'linear-gradient(transparent, rgba(0,0,0,0.95) 28%)',
                padding: '36px 12px 12px',
                display: 'flex', gap: '10px', alignItems: 'flex-end',
              }}>
                {img && (
                  <img src={img} alt={foundCard.name} style={{
                    width: '58px', borderRadius: '5px', flexShrink: 0, alignSelf: 'center',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.7)',
                  }} />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontWeight: 700, color: '#fff', fontSize: '.9rem',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>{foundCard.name}</div>
                  <div style={{ fontSize: '.72rem', color: 'rgba(255,255,255,0.6)', marginTop: '2px' }}>
                    {foundCard.set_name}
                    {foundCard.collector_number && ` · #${foundCard.collector_number}`}
                    {foundCard.prices?.usd && (
                      <span style={{ color: '#4ade80', marginLeft: '8px', fontWeight: 600 }}>
                        ${foundCard.prices.usd}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '5px', marginTop: '4px', flexWrap: 'wrap' }}>
                    {qualityLabel && (
                      <span style={{
                        fontSize: '0.62rem', padding: '1px 7px', borderRadius: '10px',
                        fontWeight: 600, background: qualityLabel.bg, color: qualityLabel.color,
                      }}>{qualityLabel.text}</span>
                    )}
                    {alreadyOwned && (
                      <span style={{
                        fontSize: '0.62rem', padding: '1px 7px', borderRadius: '10px',
                        background: 'rgba(147,197,253,0.2)', color: '#93c5fd', fontWeight: 600,
                      }}>Own ×{alreadyOwned.qty}</span>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', flexShrink: 0 }}>
                  <button onClick={handleAdd} disabled={adding} style={{
                    background: '#4ade80', color: '#000', border: 'none',
                    borderRadius: '8px', padding: '8px 16px',
                    fontWeight: 700, fontSize: '.82rem',
                    cursor: adding ? 'wait' : 'pointer',
                    opacity: adding ? 0.7 : 1, whiteSpace: 'nowrap', minWidth: '72px',
                  }}>{adding ? '…' : '+ Add'}</button>
                  <button onClick={doRescan} style={{
                    background: 'rgba(255,255,255,0.12)', color: '#fff', border: 'none',
                    borderRadius: '6px', padding: '5px 10px',
                    fontSize: '.7rem', cursor: 'pointer', whiteSpace: 'nowrap',
                  }}>🔄 Rescan</button>
                  <button onClick={handleCustomize} style={{
                    background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)', border: 'none',
                    borderRadius: '6px', padding: '4px 10px',
                    fontSize: '.68rem', cursor: 'pointer', whiteSpace: 'nowrap',
                  }}>Customize</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* OCR readout — shows what was read in each zone */}
        {(nameRead || collectorRead || typeRead) && (
          <div style={{ display: 'flex', gap: '6px', marginBottom: '10px', fontSize: '0.7rem', flexWrap: 'wrap' }}>
            {nameRead && (
              <div style={{
                flex: '2 1 0', minWidth: '80px', padding: '5px 9px',
                background: 'rgba(74,158,255,0.1)', borderRadius: '6px',
                border: '1px solid rgba(74,158,255,0.2)',
                color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                Name: <span style={{ color: 'var(--text)' }}>{nameRead}</span>
              </div>
            )}
            {typeRead && (
              <div style={{
                flex: '2 1 0', minWidth: '80px', padding: '5px 9px',
                background: 'rgba(192,132,252,0.1)', borderRadius: '6px',
                border: '1px solid rgba(192,132,252,0.2)',
                color: '#c084fc', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                Type: <span style={{ color: '#d8b4fe' }}>{typeRead}</span>
              </div>
            )}
            {collectorRead && (
              <div style={{
                flex: '0 0 auto', padding: '5px 9px',
                background: 'rgba(245,158,11,0.1)', borderRadius: '6px',
                border: '1px solid rgba(245,158,11,0.2)',
                color: '#f59e0b', whiteSpace: 'nowrap',
              }}>{collectorRead}</div>
            )}
          </div>
        )}

        {ocrStatus === 'error' && (
          <div style={{
            padding: '10px 14px', marginBottom: '10px',
            background: 'rgba(248,113,113,0.1)', borderRadius: '8px',
            border: '1px solid rgba(248,113,113,0.2)', fontSize: '.8rem', color: '#f87171',
          }}>⚠ OCR engine failed to load. Try refreshing.</div>
        )}

        {/* Session log */}
        {addedCards.length > 0 && (
          <div style={{
            padding: '7px 11px', marginBottom: '10px',
            background: 'rgba(74,222,128,0.07)', borderRadius: '8px',
            border: '1px solid rgba(74,222,128,0.18)', fontSize: '.78rem',
          }}>
            <span style={{ color: 'var(--text-muted)' }}>Added: </span>
            <span style={{ color: '#4ade80' }}>{addedCards.join(' · ')}</span>
          </div>
        )}

        {/* Tips */}
        <div style={{
          fontSize: '0.68rem', color: 'var(--text-muted)',
          lineHeight: 1.6, marginBottom: '12px',
        }}>
          <strong style={{ color: 'var(--text-secondary)' }}>Tips:</strong>{' '}
          Fill the card to the frame · Good lighting helps · Works with any art style ·
          Blue = name · Purple = type line · Amber = collector # ·
          {' '}Wrong card? Tap 🔄 Rescan
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={handleClose} style={{
            background: 'var(--bg-primary)', border: '1px solid var(--border)',
            borderRadius: '8px', padding: '8px 20px',
            color: 'var(--text)', cursor: 'pointer', fontSize: '.88rem',
          }}>Done</button>
        </div>
      </div>
    </div>
  )
}
