import { useRef, useState, useEffect } from 'react'
import { createWorker } from 'tesseract.js'
import { addCard } from '../lib/db'

/**
 * CameraModal — dual-region auto-scanner.
 *
 * Scans TWO strips every 2 s:
 *   • TOP strip  → card name (blue guide box)
 *   • BOTTOM strip → collector number, e.g. "147/272" (amber guide box)
 *
 * Lookup priority:
 *   1. Name + collector number  → Scryfall search with cn: filter (exact printing)
 *   2. Name only                → Scryfall fuzzy /cards/named
 *
 * Why npm tesseract.js instead of CDN:
 *   The CDN version often can't locate its own worker/wasm files in bundled
 *   environments and fails silently.  The npm package resolves everything at
 *   build time; Netlify installs it automatically on every deploy.
 */

// ── helpers ──────────────────────────────────────────────────────────────────

/** Draw a region of the live video onto a small canvas, scale 3×, return the canvas. */
function cropRegion(video, xPct, yPct, wPct, hPct) {
  const vw = video.videoWidth
  const vh = video.videoHeight
  const sx = Math.floor(vw * xPct)
  const sy = Math.floor(vh * yPct)
  const sw = Math.floor(vw * wPct)
  const sh = Math.floor(vh * hPct)
  const c = document.createElement('canvas')
  c.width  = sw * 3
  c.height = sh * 3
  const ctx = c.getContext('2d')
  // 3× upscale — no CSS filter (canvas filter support is inconsistent on mobile)
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, sw * 3, sh * 3)
  return c
}

/** Strip everything except letters, spaces, hyphens, apostrophes, commas. */
function cleanName(raw) {
  return (raw || '').replace(/[^a-zA-Z ',\-]/g, '').replace(/\s+/g, ' ').trim()
}

/** Extract the first run of digits that looks like a collector number (1–4 digits). */
function extractCollector(raw) {
  const m = (raw || '').match(/\b(\d{1,4})(?:\/\d+)?\b/)
  return m ? m[1] : null
}

// ── component ─────────────────────────────────────────────────────────────────

export default function CameraModal({ onClose, showToast, user, setCollection, openAddCard }) {
  const videoRef    = useRef(null)
  const workerRef   = useRef(null)
  const scanningRef = useRef(false)   // re-entry guard
  const foundRef    = useRef(null)    // stale-closure-safe mirror of foundCard
  const ocrReadyRef = useRef(false)   // stale-closure-safe flag — avoids ocrStatus in effect deps

  const [cameraReady, setCameraReady] = useState(false)
  const [cameraError, setCameraError] = useState(null)
  const [ocrStatus,   setOcrStatus]   = useState('loading')  // loading|ready|scanning|error

  const [nameRead,      setNameRead]      = useState('')  // what OCR read from top strip
  const [collectorRead, setCollectorRead] = useState('')  // what OCR read from bottom strip

  const [foundCard, setFoundCard] = useState(null)
  const [addedCards, setAddedCards] = useState([])
  const [adding, setAdding] = useState(false)

  // keep ref in sync with state
  useEffect(() => { foundRef.current = foundCard }, [foundCard])

  // ── 1. Init Tesseract worker (npm, not CDN) ──────────────────────────────
  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const w = await createWorker('eng')
        if (!active) { w.terminate(); return }
        workerRef.current = w
        ocrReadyRef.current = true
        setOcrStatus('ready')
      } catch (e) {
        console.error('[Scanner] Tesseract init failed:', e)
        if (active) setOcrStatus('error')
      }
    })()
    return () => {
      active = false
      workerRef.current?.terminate().catch(() => {})
    }
  }, [])

  // ── 2. Start camera ──────────────────────────────────────────────────────
  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          setCameraError('Camera not supported on this device or browser.')
          return
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }
        })
        if (active && videoRef.current) {
          videoRef.current.srcObject = stream
          setCameraReady(true)
        }
      } catch {
        if (active) {
          setCameraError('Camera access denied. Please allow camera permissions.')
          showToast('Camera access denied')
        }
      }
    })()
    return () => { active = false; stopTracks() }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const stopTracks = () => {
    videoRef.current?.srcObject?.getTracks().forEach(t => t.stop())
  }

  // ── 3. Scan loop — only depends on cameraReady, NOT on ocrStatus ─────────
  //   (This was the main bug: ocrStatus in deps caused the interval to restart
  //    every time scanFrame flipped it, breaking the loop mid-scan.)
  useEffect(() => {
    if (!cameraReady) return
    const id = setInterval(scanFrame, 2000)
    return () => clearInterval(id)
  }, [cameraReady]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── 4. Core scan function ────────────────────────────────────────────────
  async function scanFrame() {
    if (scanningRef.current)    return
    if (foundRef.current)       return  // card already found, waiting for user
    if (!ocrReadyRef.current)   return  // Tesseract still loading
    const video = videoRef.current
    if (!video?.videoWidth)     return

    scanningRef.current = true
    setOcrStatus('scanning')

    try {
      // OCR region percentages
      //   Top strip  (card name):        x=5–83%, y= 5–18%
      //   Bottom strip (collector num):  x=5–89%, y=84–94%
      const [nameCanvas, collCanvas] = [
        cropRegion(video, 0.05, 0.05, 0.78, 0.13),
        cropRegion(video, 0.05, 0.84, 0.84, 0.10),
      ]

      // Run OCR sequentially (one Tesseract worker can only handle one job at a time)
      const { data: nameData } = await workerRef.current.recognize(nameCanvas)
      const { data: collData } = await workerRef.current.recognize(collCanvas)

      const name  = cleanName(nameData.text)
      const colNum = extractCollector(collData.text)

      setNameRead(name)
      setCollectorRead(colNum ? `#${colNum}` : '')

      let card = null

      // Priority 1: name + collector number → exact printing via Scryfall search
      if (name.length >= 3 && colNum) {
        const q = `"${name}" cn:${colNum}`
        const res = await fetch(
          `https://api.scryfall.com/cards/search?q=${encodeURIComponent(q)}&unique=prints`
        )
        if (res.ok) {
          const json = await res.json()
          if (json.data?.length > 0) card = json.data[0]
        }
      }

      // Priority 2: fuzzy name fallback
      if (!card && name.length >= 3) {
        const res = await fetch(
          `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(name)}`
        )
        if (res.ok) {
          const json = await res.json()
          if (json.object === 'card') card = json
        }
      }

      if (card) setFoundCard(card)

    } catch (e) {
      console.warn('[Scanner] scan error:', e)
    }

    setOcrStatus('ready')
    scanningRef.current = false
  }

  // ── 5. Add card ──────────────────────────────────────────────────────────
  async function handleAdd() {
    if (!foundCard || adding) return
    setAdding(true)

    const card = {
      name:         foundCard.name,
      qty:          1,
      condition:    'NM',
      setName:      foundCard.set_name,
      img:          foundCard.image_uris?.small || foundCard.card_faces?.[0]?.image_uris?.small || null,
      colors:       foundCard.color_identity || [],
      price:        foundCard.prices?.usd ? parseFloat(foundCard.prices.usd) : null,
      tcgplayerUrl: foundCard.purchase_uris?.tcgplayer || null,
    }

    await addCard(card, user?.id)
    setCollection(prev => {
      const i = prev.findIndex(c => c.name.toLowerCase() === card.name.toLowerCase())
      if (i >= 0) {
        const next = [...prev]
        next[i] = { ...next[i], qty: next[i].qty + 1 }
        return next
      }
      return [...prev, { ...card, id: Date.now() }]
    })
    setAddedCards(prev => [...prev, foundCard.name])
    showToast(`Added ${foundCard.name} ✓`)

    setAdding(false)
    setFoundCard(null)
    setNameRead('')
    setCollectorRead('')
  }

  function handleCustomize() {
    if (!foundCard) return
    stopTracks()
    onClose()
    openAddCard({ name: foundCard.name })
  }

  function handleRescan() {
    setFoundCard(null)
    setNameRead('')
    setCollectorRead('')
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const nameBoxColor   = foundCard ? '#4caf50' : '#4a9eff'
  const collBoxColor   = foundCard ? '#4caf50' : '#f59e0b'

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.92)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 200, padding: '12px',
    }}>
      <div className="modal-box" style={{ maxWidth: '480px', width: '100%' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <h3 style={{ margin: 0 }}>📷 Scan Card</h3>
          <button className="btn btn-ghost" style={{ padding: '4px 10px' }}
            onClick={() => { stopTracks(); onClose() }}>✕</button>
        </div>

        {/* Camera / error */}
        {cameraError ? (
          <div style={{
            padding: '32px', textAlign: 'center',
            background: 'var(--bg-secondary)', borderRadius: '10px', marginBottom: '12px',
          }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '10px' }}>📷</div>
            <p style={{ margin: 0, color: 'var(--text-muted)' }}>{cameraError}</p>
          </div>
        ) : (
          <div style={{ position: 'relative', borderRadius: '10px', overflow: 'hidden', background: '#000', marginBottom: '10px' }}>
            <video ref={videoRef} autoPlay playsInline muted
              style={{ width: '100%', display: 'block', minHeight: '160px' }} />

            {/* ── Card name guide (blue) — top 5–18% ── */}
            <div style={{
              position: 'absolute', left: '5%', top: '5%', width: '78%', height: '13%',
              border: `2px solid ${nameBoxColor}`,
              borderRadius: '4px',
              transition: 'border-color .3s',
              pointerEvents: 'none',
            }} />
            <div style={{
              position: 'absolute', left: '5%', top: 'calc(5% + 14%)',
              fontSize: '0.62rem', color: 'rgba(255,255,255,0.55)',
              pointerEvents: 'none',
            }}>
              Card name
            </div>

            {/* ── Collector number guide (amber) — bottom 84–94% ── */}
            <div style={{
              position: 'absolute', left: '5%', top: '84%', width: '84%', height: '10%',
              border: `2px solid ${collBoxColor}`,
              borderRadius: '4px',
              transition: 'border-color .3s',
              pointerEvents: 'none',
            }} />
            <div style={{
              position: 'absolute', left: '5%', top: 'calc(84% - 14px)',
              fontSize: '0.62rem', color: 'rgba(255,255,255,0.55)',
              pointerEvents: 'none',
            }}>
              Collector number
            </div>

            {/* Status badge */}
            <div style={{
              position: 'absolute', top: '50%', left: '50%',
              transform: 'translate(-50%,-50%)',
              background: 'rgba(0,0,0,0.65)',
              color: ocrStatus === 'loading' ? '#c084fc'
                   : ocrStatus === 'scanning' ? '#4a9eff'
                   : ocrStatus === 'error'    ? '#f87171'
                   : 'transparent',
              padding: '4px 14px', borderRadius: '20px', fontSize: '0.75rem',
              pointerEvents: 'none',
              display: (ocrStatus === 'loading' || ocrStatus === 'scanning' || ocrStatus === 'error') ? 'block' : 'none',
            }}>
              {ocrStatus === 'loading'  && '⏳ Loading OCR engine…'}
              {ocrStatus === 'scanning' && '🔍 Reading…'}
              {ocrStatus === 'error'    && '⚠ OCR unavailable'}
            </div>
          </div>
        )}

        {/* Live OCR debug — shows what each strip is reading */}
        {(nameRead || collectorRead) && !foundCard && (
          <div style={{
            display: 'flex', gap: '8px', marginBottom: '10px',
            fontSize: '0.72rem',
          }}>
            {nameRead && (
              <div style={{
                flex: 1, padding: '5px 9px',
                background: 'rgba(74,158,255,0.1)', borderRadius: '6px',
                border: '1px solid rgba(74,158,255,0.25)',
                color: 'var(--text-muted)', whiteSpace: 'nowrap',
                overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                Name: <span style={{ color: 'var(--text)' }}>{nameRead}</span>
              </div>
            )}
            {collectorRead && (
              <div style={{
                padding: '5px 9px',
                background: 'rgba(245,158,11,0.1)', borderRadius: '6px',
                border: '1px solid rgba(245,158,11,0.25)',
                color: 'var(--text-muted)', whiteSpace: 'nowrap',
              }}>
                <span style={{ color: '#f59e0b' }}>{collectorRead}</span>
              </div>
            )}
          </div>
        )}

        {/* Found card preview */}
        {foundCard && (
          <div style={{
            display: 'flex', gap: '12px', alignItems: 'center',
            marginBottom: '12px', padding: '12px',
            background: 'var(--bg-secondary)', borderRadius: '10px',
            border: '1px solid rgba(74,222,128,0.3)',
          }}>
            {(foundCard.image_uris?.small || foundCard.card_faces?.[0]?.image_uris?.small) && (
              <img
                src={foundCard.image_uris?.small || foundCard.card_faces?.[0]?.image_uris?.small}
                alt={foundCard.name}
                style={{ width: '56px', borderRadius: '5px', flexShrink: 0 }}
              />
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: '.93rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {foundCard.name}
              </div>
              <div style={{ fontSize: '.76rem', color: 'var(--text-muted)' }}>
                {foundCard.set_name}
                {foundCard.collector_number && ` · #${foundCard.collector_number}`}
                {' · '}<span style={{ textTransform: 'capitalize' }}>{foundCard.rarity}</span>
              </div>
              {foundCard.prices?.usd && (
                <div style={{ fontSize: '.8rem', color: '#4ade80', fontWeight: 500 }}>
                  ${foundCard.prices.usd}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', flexShrink: 0 }}>
              <button className="btn btn-primary" onClick={handleAdd} disabled={adding}
                style={{ fontSize: '.8rem', padding: '6px 12px' }}>
                {adding ? '…' : '+ Add'}
              </button>
              <button className="btn btn-ghost" onClick={handleCustomize}
                style={{ fontSize: '.72rem', padding: '4px 8px' }}>
                Customize
              </button>
              <button className="btn btn-ghost" onClick={handleRescan}
                style={{ fontSize: '.72rem', padding: '4px 8px' }}>
                Rescan
              </button>
            </div>
          </div>
        )}

        {/* Session log */}
        {addedCards.length > 0 && (
          <div style={{
            marginBottom: '10px', padding: '7px 11px',
            background: 'rgba(74,222,128,0.07)', borderRadius: '8px',
            border: '1px solid rgba(74,222,128,0.2)', fontSize: '.78rem',
          }}>
            <span style={{ color: 'var(--text-muted)' }}>Added: </span>
            <span style={{ color: '#4ade80' }}>{addedCards.join(' · ')}</span>
          </div>
        )}

        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '10px', lineHeight: 1.5 }}>
          Hold the card so the <span style={{ color: '#4a9eff' }}>blue box</span> covers the card name and the <span style={{ color: '#f59e0b' }}>amber box</span> covers the collector number at the bottom.
        </div>

        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={() => { stopTracks(); onClose() }}>Done</button>
        </div>
      </div>
    </div>
  )
}
