import { useRef, useState, useEffect } from 'react'
import { createWorker } from 'tesseract.js'
import { addCard } from '../lib/db'

// ─────────────────────────────────────────────────────────────────────────────
// Card layout constants
//
// All percentages are relative to the FULL VIDEO FRAME.
// Three name zones cover every major card frame family:
//   STD  — name at very top (standard, extended-art, borderless)
//   ALT1 — mid-card banner (TMNT showcase, some full-art treatments)
//   ALT2 — lower art area (anime showcase, some promo frames)
//
// Collector strip is wider to capture set code alongside the number,
// enabling the highest-accuracy lookup: /cards/{set}/{number}.
// ─────────────────────────────────────────────────────────────────────────────
const GUIDE = { x: 0.04, y: 0.01, w: 0.92, h: 0.98 }

// Crops: [xPct, yPct, wPct, hPct] within the video frame
const CROP_NAME_STD  = [0.05, 0.02, 0.82, 0.11]  // top  2–13%  standard frames
const CROP_NAME_ALT1 = [0.05, 0.36, 0.82, 0.18]  // mid 36–54%  showcase banners
const CROP_NAME_ALT2 = [0.05, 0.56, 0.82, 0.14]  // mid 56–70%  anime / promo frames

// Wider strip to capture both set abbreviation and collector number
const CROP_COLLECTOR = [0.03, 0.84, 0.80, 0.12]  // bot 84–96%

// ─────────────────────────────────────────────────────────────────────────────
// Image processing
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
  const W = c.width, H = c.height
  const npx = W * H

  // Step 1: Grayscale
  const gray = new Float32Array(npx)
  for (let i = 0; i < npx; i++) {
    gray[i] = 0.299 * data[i*4] + 0.587 * data[i*4+1] + 0.114 * data[i*4+2]
  }

  // Step 2: Min-max contrast stretch
  let lo = 255, hi = 0, sum = 0
  for (let i = 0; i < npx; i++) {
    if (gray[i] < lo) lo = gray[i]
    if (gray[i] > hi) hi = gray[i]
    sum += gray[i]
  }
  const range  = hi - lo || 1
  const avgBrt = sum / npx
  const invert = avgBrt < 110
  for (let i = 0; i < npx; i++) gray[i] = (gray[i] - lo) * 255 / range

  // Step 3: Laplacian sharpening (5×center − 4 neighbours)
  const sharp = new Float32Array(npx)
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x
      const v = 5*gray[i] - gray[i-1] - gray[i+1] - gray[i-W] - gray[i+W]
      sharp[i] = v < 0 ? 0 : v > 255 ? 255 : v
    }
  }
  // Copy border pixels unchanged
  for (let x = 0; x < W; x++) { sharp[x] = gray[x]; sharp[(H-1)*W+x] = gray[(H-1)*W+x] }
  for (let y = 0; y < H; y++) { sharp[y*W] = gray[y*W]; sharp[y*W+W-1] = gray[y*W+W-1] }

  // Step 4: Write back (optionally invert for dark cards)
  for (let i = 0; i < npx; i++) {
    const g = Math.round(invert ? 255 - sharp[i] : sharp[i])
    data[i*4] = data[i*4+1] = data[i*4+2] = g
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

// Language codes that look like set codes — filter them out
const LANG_CODES = new Set(['EN','FR','DE','ES','IT','PT','JP','KO','RU','CS','CT','TW'])

function extractCollectorAndSet(raw) {
  if (!raw) return { colNum: null, setCode: null }

  // "MOM 123/456", "WOE·123", "BRO 123" — set code adjacent to collector number
  const withSet = raw.match(/\b([A-Z]{2,5})\s*[·•\s]\s*(\d{1,4})\b/)
  if (withSet && !LANG_CODES.has(withSet[1])) {
    return { colNum: withSet[2], setCode: withSet[1].toLowerCase() }
  }

  // Collector number alone
  const slash = raw.match(/\b(\d{1,4})\/\d+\b/)
  if (slash) return { colNum: slash[1], setCode: null }

  const star = raw.match(/[★*P]\s*(\d{1,4})\b/)
  if (star) return { colNum: star[1], setCode: null }

  const bare = raw.match(/(?<![a-zA-Z])(\d{3,4})(?![a-zA-Z\/])/)
  if (bare) return { colNum: bare[1], setCode: null }

  return { colNum: null, setCode: null }
}

// ─────────────────────────────────────────────────────────────────────────────
// Scryfall lookup  (5-tier fallback chain)
// ─────────────────────────────────────────────────────────────────────────────

async function lookupCard(name, colNum, setCode) {
  let card = null
  let quality = 'fuzzy'

  // 1 — Exact printing by set + collector (identifies ANY alt-art uniquely)
  if (setCode && colNum) {
    try {
      const res = await fetch(`https://api.scryfall.com/cards/${setCode}/${colNum}`)
      if (res.ok) {
        const json = await res.json()
        if (json.object === 'card') { card = json; quality = 'exact' }
      }
    } catch { /* continue */ }
  }

  // 2 — Name + collector number (high confidence, catches same name across sets)
  if (!card && name.length >= 3 && colNum) {
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

  // 3 — Fuzzy name
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

  // 4 — Autocomplete → exact fetch (handles garbled / partial names)
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

  // 5 — Collector number only (most-recent printing first)
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
  const nameWorkerRef = useRef(null)   // scans all name zones
  const collWorkerRef = useRef(null)   // scans collector + set code strip
  const ocrReadyRef   = useRef(false)

  const scanningRef  = useRef(false)
  const frozenRef    = useRef(false)
  const prevThumbRef = useRef(null)
  const stableRef    = useRef(0)

  const videoRef = useRef(null)
  const [cameraReady, setCameraReady] = useState(false)
  const [cameraError, setCameraError] = useState(null)
  const [ocrStatus,   setOcrStatus]   = useState('loading')

  const [nameRead,      setNameRead]      = useState('')
  const [collectorRead, setCollectorRead] = useState('')

  const [foundCard,    setFoundCard]    = useState(null)
  const [matchQuality, setMatchQuality] = useState(null)
  const [addedCards,   setAddedCards]   = useState([])
  const [adding,       setAdding]       = useState(false)

  // ── Init workers ──────────────────────────────────────────────────────────
  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const [nameW, collW] = await Promise.all([
          createWorker('eng'),
          createWorker('eng'),
        ])
        if (!active) { nameW.terminate(); collW.terminate(); return }

        await nameW.setParameters({
          tessedit_pageseg_mode: '7',   // single text line
          tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 ',-.",
        })
        await collW.setParameters({
          tessedit_pageseg_mode: '6',   // uniform block — better for mixed stamp text
          tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 /·•★*',
        })

        nameWorkerRef.current = nameW
        collWorkerRef.current = collW
        ocrReadyRef.current   = true
        setOcrStatus('ready')
      } catch (e) {
        console.error('[Scanner] worker init:', e)
        if (active) setOcrStatus('error')
      }
    })()
    return () => {
      active = false
      nameWorkerRef.current?.terminate().catch(() => {})
      collWorkerRef.current?.terminate().catch(() => {})
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
        // Request higher resolution for better OCR on small collector text
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width:  { ideal: 1920 },
            height: { ideal: 1080 },
          },
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

  // ── Stability trigger ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!cameraReady) return
    const id = setInterval(stabilityCheck, 250)
    return () => clearInterval(id)
  }, [cameraReady]) // eslint-disable-line react-hooks/exhaustive-deps

  function stabilityCheck() {
    if (!ocrReadyRef.current || frozenRef.current) return
    const video = videoRef.current
    if (!video?.videoWidth) return
    const curr = thumbCanvas(video)
    if (prevThumbRef.current) {
      if (frameDiff(curr, prevThumbRef.current) < 10) {
        stableRef.current++
        if (stableRef.current >= 1 && !scanningRef.current) scanFrame()
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
      const nameW = nameWorkerRef.current

      // Name and collector run in parallel.
      // Name worker tries zones sequentially with early exit on confident reads.
      const [nameResult, collResult] = await Promise.all([
        (async () => {
          // Zone 1: standard frames (name at top) — most common, fast path
          const r1 = await nameW.recognize(cropAndProcess(video, ...CROP_NAME_STD, 4))
          const n1 = cleanName(r1.data.text)
          if (n1.length >= 5 && r1.data.confidence > 55) return n1

          // Zone 2: showcase / mid-card banner frames
          const r2 = await nameW.recognize(cropAndProcess(video, ...CROP_NAME_ALT1, 4))
          const n2 = cleanName(r2.data.text)
          if (n2.length >= 5 && r2.data.confidence > 55) return n2

          // Zone 3: anime / promo / lower-art frames
          const r3 = await nameW.recognize(cropAndProcess(video, ...CROP_NAME_ALT2, 4))
          const n3 = cleanName(r3.data.text)

          // Return whichever zone gave the most characters
          return [n1, n2, n3].reduce((best, s) => s.length > best.length ? s : best, '')
        })(),
        // 5× scale on collector strip — set code needs extra resolution
        collWorkerRef.current.recognize(cropAndProcess(video, ...CROP_COLLECTOR, 5)),
      ])

      const name = nameResult
      const { colNum, setCode } = extractCollectorAndSet(collResult.data.text)

      setNameRead(name)
      setCollectorRead(
        setCode  ? `${setCode.toUpperCase()} #${colNum}` :
        colNum   ? `#${colNum}`                          : ''
      )

      if (name.length >= 2 || colNum) {
        const { card, quality } = await lookupCard(name, colNum, setCode)
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
  }

  function handleCustomize() {
    if (!foundCard) return
    stopTracks(); onClose()
    openAddCard({ name: foundCard.name })
  }

  function handleClose() { stopTracks(); onClose() }

  // ── Derived display ───────────────────────────────────────────────────────
  const img = foundCard?.image_uris?.small || foundCard?.card_faces?.[0]?.image_uris?.small
  const alreadyOwned = foundCard
    ? (collection || []).find(c => c.name.toLowerCase() === foundCard.name.toLowerCase())
    : null

  const qualityLabel = {
    exact:     { text: '✓✓ Exact match',      color: '#4ade80', bg: 'rgba(74,222,128,0.2)'  },
    fuzzy:     { text: '✓ Name match',         color: '#fbbf24', bg: 'rgba(251,191,36,0.2)'  },
    collector: { text: '✓ Collector # match',  color: '#93c5fd', bg: 'rgba(147,197,253,0.2)' },
  }[matchQuality] || null

  const hit       = !!foundCard
  const nameColor = hit ? '#4caf50' : '#4a9eff'
  const collColor = hit ? '#4caf50' : '#f59e0b'

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

            {/* Card alignment guide */}
            <div style={{
              position: 'absolute',
              left: `${GUIDE.x * 100}%`, top: `${GUIDE.y * 100}%`,
              width: `${GUIDE.w * 100}%`, height: `${GUIDE.h * 100}%`,
              border: '2px dashed rgba(255,255,255,0.55)', borderRadius: '6px',
              pointerEvents: 'none', boxSizing: 'border-box',
            }} />

            {/* Align hint — only when idle */}
            {!foundCard && ocrStatus === 'ready' && (
              <div style={{
                position: 'absolute', left: '50%', top: '50%',
                transform: 'translate(-50%,-50%)',
                color: 'rgba(255,255,255,0.35)', fontSize: '0.72rem',
                textAlign: 'center', pointerEvents: 'none', lineHeight: 1.5,
              }}>
                Fill card to white outline
              </div>
            )}

            {/* Blue box — primary name zone (top) */}
            <div style={{
              position: 'absolute',
              left: `${CROP_NAME_STD[0]*100}%`, top: `${CROP_NAME_STD[1]*100}%`,
              width: `${CROP_NAME_STD[2]*100}%`, height: `${CROP_NAME_STD[3]*100}%`,
              border: `2px solid ${nameColor}`, borderRadius: '4px',
              transition: 'border-color .25s', pointerEvents: 'none',
              boxShadow: hit ? '0 0 8px rgba(76,175,80,0.4)' : 'none',
            }} />
            <span style={{
              position: 'absolute',
              left: `${CROP_NAME_STD[0]*100}%`,
              top: `calc(${(CROP_NAME_STD[1]+CROP_NAME_STD[3])*100}% + 2px)`,
              fontSize: '0.55rem', color: 'rgba(255,255,255,0.4)', pointerEvents: 'none',
            }}>Name</span>

            {/* Dashed box — alt name zone 1 (mid) */}
            <div style={{
              position: 'absolute',
              left: `${CROP_NAME_ALT1[0]*100}%`, top: `${CROP_NAME_ALT1[1]*100}%`,
              width: `${CROP_NAME_ALT1[2]*100}%`, height: `${CROP_NAME_ALT1[3]*100}%`,
              border: `1.5px dashed ${nameColor}`, borderRadius: '4px',
              opacity: 0.45, transition: 'border-color .25s', pointerEvents: 'none',
            }} />

            {/* Dashed box — alt name zone 2 (lower-mid) */}
            <div style={{
              position: 'absolute',
              left: `${CROP_NAME_ALT2[0]*100}%`, top: `${CROP_NAME_ALT2[1]*100}%`,
              width: `${CROP_NAME_ALT2[2]*100}%`, height: `${CROP_NAME_ALT2[3]*100}%`,
              border: `1px dashed ${nameColor}`, borderRadius: '4px',
              opacity: 0.30, transition: 'border-color .25s', pointerEvents: 'none',
            }} />

            {/* Amber box — collector / set strip */}
            <div style={{
              position: 'absolute',
              left: `${CROP_COLLECTOR[0]*100}%`, top: `${CROP_COLLECTOR[1]*100}%`,
              width: `${CROP_COLLECTOR[2]*100}%`, height: `${CROP_COLLECTOR[3]*100}%`,
              border: `2px solid ${collColor}`, borderRadius: '4px',
              transition: 'border-color .25s', pointerEvents: 'none',
              boxShadow: hit ? '0 0 8px rgba(76,175,80,0.4)' : 'none',
            }} />
            <span style={{
              position: 'absolute',
              left: `${CROP_COLLECTOR[0]*100}%`,
              top: `calc(${CROP_COLLECTOR[1]*100}% - 13px)`,
              fontSize: '0.55rem', color: 'rgba(255,255,255,0.4)', pointerEvents: 'none',
            }}>Set · Collector #</span>

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

            {/* Card preview overlay */}
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
        {(nameRead || collectorRead) && (
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
          Fill card to the white outline · Hold steady for 1 second ·
          Blue = name zones · Amber = set + collector # ·
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
