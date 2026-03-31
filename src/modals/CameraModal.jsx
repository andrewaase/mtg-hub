import { useRef, useState, useEffect } from 'react'
import { createWorker } from 'tesseract.js'
import { addCard } from '../lib/db'

// ─────────────────────────────────────────────────────────────────────────────
// Card layout constants
//
// All percentages are relative to the FULL VIDEO FRAME.
// The dashed card-outline guide tells the user exactly where to position
// their card — when the card fills the guide, these zones land precisely
// on the right strips of the card.
//
// Two name zones handle the two dominant card frame families:
//   STANDARD   — name at very top of card  (standard, extended art, etc.)
//   SHOWCASE   — name in a mid-card banner (TMNT showcase, full-art, etc.)
// ─────────────────────────────────────────────────────────────────────────────
const GUIDE = { x: 0.04, y: 0.01, w: 0.92, h: 0.98 }  // card outline guide

// Crops are [xPct, yPct, wPct, hPct] within the video frame
const CROP_NAME_STD  = [0.05, 0.02, 0.82, 0.12]   // top  2-14%:  standard card name
const CROP_NAME_ALT  = [0.05, 0.37, 0.82, 0.20]   // mid 37-57%:  showcase / full-art name
const CROP_TYPE      = [0.04, 0.50, 0.78, 0.17]   // mid 50-67%:  type line
const CROP_COLLECTOR = [0.04, 0.86, 0.87, 0.11]   // bot 86-97%:  collector number

// ─────────────────────────────────────────────────────────────────────────────
// Image helpers
// ─────────────────────────────────────────────────────────────────────────────

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

function thumbCanvas(video) {
  const c = document.createElement('canvas')
  c.width = 32; c.height = 32
  c.getContext('2d').drawImage(video, 0, 0, 32, 32)
  return c
}

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

function cleanName(raw) {
  return (raw || '')
    .replace(/[^a-zA-Z0-9 ',\-\.]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

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

function extractTypeWords(raw) {
  if (!raw) return []
  const clean = (raw || '').replace(/[—–\-]/g, ' ').replace(/[^a-zA-Z\s]/g, ' ').replace(/\s+/g, ' ').trim()
  const words = clean.toLowerCase().split(' ').filter(Boolean)
  const KNOWN = new Set([
    'legendary','basic','snow','world',
    'creature','instant','sorcery','enchantment','artifact','planeswalker','land','battle','tribal',
    'human','wizard','elf','dragon','angel','demon','goblin','zombie','vampire','merfolk',
    'warrior','cleric','rogue','shaman','soldier','knight','druid','spirit','elemental',
    'ninja','mutant','rat','pirate','turtle',
    'aura','equipment','vehicle','saga','shrine',
    'mountain','forest','island','plains','swamp',
    'jace','liliana','chandra','garruk','ajani','nissa','sorin','teferi','karn','urza',
  ])
  return words.filter(w => KNOWN.has(w))
}

// ─────────────────────────────────────────────────────────────────────────────
// Scryfall lookup  (6-tier fallback chain)
// ─────────────────────────────────────────────────────────────────────────────

async function lookupCard(name, colNum, typeWords = []) {
  let card = null
  let quality = 'fuzzy'

  // 1 — exact printing: name + collector
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

  // 3 — autocomplete (garbled / partial names)
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

  // 4 — type words + collector (works when name OCR fails on showcase/borderless)
  if (!card && typeWords.length >= 1 && colNum) {
    const typeFilter = typeWords.slice(0, 2).map(t => `t:${t}`).join(' ')
    try {
      const res = await fetch(
        `https://api.scryfall.com/cards/search?q=${encodeURIComponent(`${typeFilter} cn:${colNum}`)}&unique=prints`
      )
      if (res.ok) {
        const json = await res.json()
        if (json.data?.length >= 1 && json.data?.length <= 4) {
          card = json.data[0]; quality = 'type'
        }
      }
    } catch { /* continue */ }
  }

  // 5 — name + primary type (when collector fails)
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

  // 6 — collector number only (last resort)
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
  const w1Ref = useRef(null)       // card name (standard + showcase positions)
  const w2Ref = useRef(null)       // collector number
  const w3Ref = useRef(null)       // type line
  const ocrReadyRef = useRef(false)

  const scanningRef  = useRef(false)
  const frozenRef    = useRef(false)
  const prevThumbRef = useRef(null)
  const stableRef    = useRef(0)
  const STABLE_NEEDED = 2

  const videoRef  = useRef(null)
  const streamRef = useRef(null)
  const [cameraReady,    setCameraReady]    = useState(false)
  const [cameraError,    setCameraError]    = useState(null)
  const [ocrStatus,      setOcrStatus]      = useState('loading')
  const [torchOn,        setTorchOn]        = useState(false)
  const [torchSupported, setTorchSupported] = useState(false)

  const [nameRead,      setNameRead]      = useState('')
  const [collectorRead, setCollectorRead] = useState('')
  const [typeRead,      setTypeRead]      = useState('')

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

        await w1.setParameters({
          tessedit_pageseg_mode: '7',
          tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 ',-.",
        })
        await w2.setParameters({
          tessedit_pageseg_mode: '7',
          tessedit_char_whitelist: '0123456789/',
        })
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
          streamRef.current = stream
          videoRef.current.srcObject = stream
          const track = stream.getVideoTracks()[0]
          if (track?.getCapabilities?.()?.torch) setTorchSupported(true)
          setCameraReady(true)
        }
      } catch {
        if (active) { setCameraError('Camera access denied.'); showToast('Camera access denied') }
      }
    })()
    return () => { active = false; stopTracks() }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const stopTracks = () => streamRef.current?.getTracks().forEach(t => t.stop())

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0]
    if (!track) return
    const next = !torchOn
    try {
      await track.applyConstraints({ advanced: [{ torch: next }] })
      setTorchOn(next)
    } catch (e) {
      console.warn('[Scanner] torch toggle failed:', e)
    }
  }

  // ── Stability trigger ─────────────────────────────────────────────────────
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
      // w1 does TWO sequential scans (standard name position, then showcase position)
      // while w2 and w3 run in parallel alongside it.
      //
      // Standard name zone  (y 2–14%):   catches top-bar names on normal frames
      // Showcase name zone  (y 37–57%):   catches mid-card banner names (TMNT, etc.)
      // Collector zone      (y 86–97%):   collector number at very bottom
      // Type line zone      (y 50–67%):   type line just below the art box
      const [nameResult, cd, td] = await Promise.all([
        // w1 — try standard position first, then showcase position
        (async () => {
          const std = await w1Ref.current.recognize(
            cropAndProcess(video, ...CROP_NAME_STD, 4)
          )
          const n1 = cleanName(std.data.text)
          // Only do the showcase scan if the standard result is weak
          if (n1.length >= 4) return { text: n1, zone: 'std' }
          const alt = await w1Ref.current.recognize(
            cropAndProcess(video, ...CROP_NAME_ALT, 4)
          )
          const n2 = cleanName(alt.data.text)
          return n1.length >= n2.length
            ? { text: n1, zone: 'std' }
            : { text: n2, zone: 'alt' }
        })(),
        w2Ref.current.recognize(cropAndProcess(video, ...CROP_COLLECTOR, 3)),
        w3Ref.current.recognize(cropAndProcess(video, ...CROP_TYPE, 4)),
      ])

      const name      = nameResult.text
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

  // ── Derived display ───────────────────────────────────────────────────────
  const img          = foundCard?.image_uris?.small || foundCard?.card_faces?.[0]?.image_uris?.small
  const alreadyOwned = foundCard
    ? (collection || []).find(c => c.name.toLowerCase() === foundCard.name.toLowerCase())
    : null

  const qualityLabel = {
    exact:     { text: '✓✓ Exact match',      color: '#4ade80',  bg: 'rgba(74,222,128,0.2)'  },
    fuzzy:     { text: '✓ Name match',         color: '#fbbf24',  bg: 'rgba(251,191,36,0.2)'  },
    type:      { text: '✓ Type line match',    color: '#c084fc',  bg: 'rgba(192,132,252,0.2)' },
    collector: { text: '✓ Collector # match',  color: '#93c5fd',  bg: 'rgba(147,197,253,0.2)' },
  }[matchQuality] || null

  const hit  = !!foundCard
  const blue   = hit ? '#4caf50' : '#4a9eff'
  const amber  = hit ? '#4caf50' : '#f59e0b'
  const purple = hit ? '#4caf50' : '#c084fc'

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
              Fill card to the white frame · works with any printing
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
              style={{ width: '100%', display: 'block', minHeight: '220px' }} />

            {/* ── Torch toggle ── */}
            {torchSupported && (
              <button
                onClick={toggleTorch}
                title={torchOn ? 'Turn off flash' : 'Turn on flash'}
                style={{
                  position: 'absolute', top: '8px', right: '8px',
                  background: torchOn ? 'rgba(255,220,50,0.9)' : 'rgba(0,0,0,0.55)',
                  border: '1px solid ' + (torchOn ? 'rgba(255,220,50,0.5)' : 'rgba(255,255,255,0.2)'),
                  borderRadius: '50%', width: '36px', height: '36px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', fontSize: '1.1rem', zIndex: 10,
                  transition: 'background .2s, border-color .2s',
                }}
              >
                {torchOn ? '🔦' : '💡'}
              </button>
            )}

            {/* ── Card alignment guide — white dashed outline ── */}
            <div style={{
              position: 'absolute',
              left: `${GUIDE.x * 100}%`,
              top:  `${GUIDE.y * 100}%`,
              width: `${GUIDE.w * 100}%`,
              height: `${GUIDE.h * 100}%`,
              border: '2px dashed rgba(255,255,255,0.55)',
              borderRadius: '6px',
              pointerEvents: 'none',
              boxSizing: 'border-box',
            }} />

            {/* Align instruction — only visible before a card is found */}
            {!foundCard && ocrStatus === 'ready' && (
              <div style={{
                position: 'absolute', left: '50%', top: '50%',
                transform: 'translate(-50%,-50%)',
                color: 'rgba(255,255,255,0.35)', fontSize: '0.72rem',
                textAlign: 'center', pointerEvents: 'none',
                lineHeight: 1.5,
              }}>
                Fill card to white outline
              </div>
            )}

            {/* Blue box — standard name, top 2–14% */}
            <div style={{
              position: 'absolute',
              left: `${CROP_NAME_STD[0] * 100}%`,
              top:  `${CROP_NAME_STD[1] * 100}%`,
              width: `${CROP_NAME_STD[2] * 100}%`,
              height:`${CROP_NAME_STD[3] * 100}%`,
              border: `2px solid ${blue}`, borderRadius: '4px',
              transition: 'border-color .25s', pointerEvents: 'none',
              boxShadow: hit ? '0 0 8px rgba(76,175,80,0.4)' : 'none',
            }} />
            <span style={{
              position: 'absolute',
              left: `${CROP_NAME_STD[0] * 100}%`,
              top: `calc(${(CROP_NAME_STD[1] + CROP_NAME_STD[3]) * 100}% + 2px)`,
              fontSize: '0.55rem', color: 'rgba(255,255,255,0.4)', pointerEvents: 'none',
            }}>Name</span>

            {/* Teal dashed box — showcase / alt-art name, 37–57% */}
            <div style={{
              position: 'absolute',
              left: `${CROP_NAME_ALT[0] * 100}%`,
              top:  `${CROP_NAME_ALT[1] * 100}%`,
              width: `${CROP_NAME_ALT[2] * 100}%`,
              height:`${CROP_NAME_ALT[3] * 100}%`,
              border: `1.5px dashed ${blue}`, borderRadius: '4px',
              opacity: 0.55,
              transition: 'border-color .25s', pointerEvents: 'none',
            }} />
            <span style={{
              position: 'absolute',
              left: `${CROP_NAME_ALT[0] * 100}%`,
              top: `calc(${CROP_NAME_ALT[1] * 100}% - 13px)`,
              fontSize: '0.55rem', color: 'rgba(255,255,255,0.35)', pointerEvents: 'none',
            }}>Alt name</span>

            {/* Purple box — type line, 50–67% */}
            <div style={{
              position: 'absolute',
              left: `${CROP_TYPE[0] * 100}%`,
              top:  `${CROP_TYPE[1] * 100}%`,
              width: `${CROP_TYPE[2] * 100}%`,
              height:`${CROP_TYPE[3] * 100}%`,
              border: `2px solid ${purple}`, borderRadius: '4px',
              transition: 'border-color .25s', pointerEvents: 'none',
              boxShadow: hit ? '0 0 6px rgba(192,132,252,0.3)' : 'none',
            }} />
            <span style={{
              position: 'absolute',
              left: `${CROP_TYPE[0] * 100}%`,
              top: `calc(${CROP_TYPE[1] * 100}% - 13px)`,
              fontSize: '0.55rem', color: 'rgba(255,255,255,0.4)', pointerEvents: 'none',
            }}>Type</span>

            {/* Amber box — collector, 86–97% */}
            <div style={{
              position: 'absolute',
              left: `${CROP_COLLECTOR[0] * 100}%`,
              top:  `${CROP_COLLECTOR[1] * 100}%`,
              width: `${CROP_COLLECTOR[2] * 100}%`,
              height:`${CROP_COLLECTOR[3] * 100}%`,
              border: `2px solid ${amber}`, borderRadius: '4px',
              transition: 'border-color .25s', pointerEvents: 'none',
              boxShadow: hit ? '0 0 8px rgba(76,175,80,0.4)' : 'none',
            }} />
            <span style={{
              position: 'absolute',
              left: `${CROP_COLLECTOR[0] * 100}%`,
              top: `calc(${CROP_COLLECTOR[1] * 100}% - 13px)`,
              fontSize: '0.55rem', color: 'rgba(255,255,255,0.4)', pointerEvents: 'none',
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

            {/* ── Card preview overlay ── */}
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

        {/* OCR readout */}
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

        <div style={{
          fontSize: '0.68rem', color: 'var(--text-muted)',
          lineHeight: 1.6, marginBottom: '12px',
        }}>
          <strong style={{ color: 'var(--text-secondary)' }}>Tips:</strong>{' '}
          Fill card to the white outline · Move closer if boxes miss the text ·
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
