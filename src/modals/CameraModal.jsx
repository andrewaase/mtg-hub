import { useRef, useState, useEffect } from 'react'
import { createWorker } from 'tesseract.js'
import { addCard } from '../lib/db'

/**
 * CameraModal — dual-region auto-scanner.
 *
 * Scans two strips every 2 s:
 *   • TOP strip   → card name        (blue guide box)
 *   • BOTTOM strip → collector number (amber guide box)
 *
 * Layout notes:
 *   - Does NOT use the global .modal-box class because that class uses
 *     position:fixed + transform:translate(-50%,-50%), which clips the modal
 *     top/bottom on short viewports.  We use a scrollable flex overlay instead.
 *   - Close (✕) button is pinned at the top-right corner of the overlay so
 *     it is always reachable regardless of content height.
 */

// ── helpers ──────────────────────────────────────────────────────────────────

function cropRegion(video, xPct, yPct, wPct, hPct) {
  const vw = video.videoWidth, vh = video.videoHeight
  const sx = Math.floor(vw * xPct), sy = Math.floor(vh * yPct)
  const sw = Math.floor(vw * wPct), sh = Math.floor(vh * hPct)
  const c = document.createElement('canvas')
  c.width = sw * 3; c.height = sh * 3
  c.getContext('2d').drawImage(video, sx, sy, sw, sh, 0, 0, sw * 3, sh * 3)
  return c
}

function cleanName(raw) {
  return (raw || '').replace(/[^a-zA-Z ',\-]/g, '').replace(/\s+/g, ' ').trim()
}

function extractCollector(raw) {
  const m = (raw || '').match(/\b(\d{1,4})(?:\/\d+)?\b/)
  return m ? m[1] : null
}

// ── component ─────────────────────────────────────────────────────────────────

export default function CameraModal({ onClose, showToast, user, setCollection, openAddCard }) {
  const videoRef    = useRef(null)
  const workerRef   = useRef(null)
  const scanningRef = useRef(false)
  const foundRef    = useRef(null)
  const ocrReadyRef = useRef(false)

  const [cameraReady, setCameraReady] = useState(false)
  const [cameraError, setCameraError] = useState(null)
  const [ocrStatus,   setOcrStatus]   = useState('loading')

  const [nameRead,      setNameRead]      = useState('')
  const [collectorRead, setCollectorRead] = useState('')

  const [foundCard,  setFoundCard]  = useState(null)
  const [addedCards, setAddedCards] = useState([])
  const [adding,     setAdding]     = useState(false)

  useEffect(() => { foundRef.current = foundCard }, [foundCard])

  // ── Tesseract (npm, not CDN) ──────────────────────────────────────────────
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
        console.error('[Scanner] Tesseract init:', e)
        if (active) setOcrStatus('error')
      }
    })()
    return () => { active = false; workerRef.current?.terminate().catch(() => {}) }
  }, [])

  // ── Camera ────────────────────────────────────────────────────────────────
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

  // ── Scan loop — intentionally does NOT include ocrStatus in deps ──────────
  // Including ocrStatus caused the interval to self-destruct every time a scan
  // started (because scanFrame changes ocrStatus → effect cleanup → interval gone).
  useEffect(() => {
    if (!cameraReady) return
    const id = setInterval(scanFrame, 2000)
    return () => clearInterval(id)
  }, [cameraReady]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── OCR + lookup ──────────────────────────────────────────────────────────
  async function scanFrame() {
    if (scanningRef.current || foundRef.current || !ocrReadyRef.current) return
    const video = videoRef.current
    if (!video?.videoWidth) return

    scanningRef.current = true
    setOcrStatus('scanning')

    try {
      // Two regions — percentages match the guide box overlays in the UI
      const nameCanvas = cropRegion(video, 0.05, 0.05, 0.78, 0.13)
      const collCanvas = cropRegion(video, 0.05, 0.84, 0.84, 0.10)

      const { data: nd } = await workerRef.current.recognize(nameCanvas)
      const { data: cd } = await workerRef.current.recognize(collCanvas)

      const name   = cleanName(nd.text)
      const colNum = extractCollector(cd.text)

      setNameRead(name)
      setCollectorRead(colNum ? `#${colNum}` : '')

      let card = null

      // Priority 1: name + collector number → exact printing
      if (name.length >= 3 && colNum) {
        const q   = `"${name}" cn:${colNum}`
        const res = await fetch(`https://api.scryfall.com/cards/search?q=${encodeURIComponent(q)}&unique=prints`)
        if (res.ok) {
          const json = await res.json()
          if (json.data?.length > 0) card = json.data[0]
        }
      }

      // Priority 2: fuzzy name only
      if (!card && name.length >= 3) {
        const res = await fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(name)}`)
        if (res.ok) {
          const json = await res.json()
          if (json.object === 'card') card = json
        }
      }

      if (card) setFoundCard(card)

    } catch (e) {
      console.warn('[Scanner] frame error:', e)
    }

    setOcrStatus('ready')
    scanningRef.current = false
  }

  // ── Add card — with error handling so the button never silently fails ─────
  async function handleAdd() {
    if (!foundCard || adding) return
    setAdding(true)

    try {
      const card = {
        name:         foundCard.name,
        qty:          1,
        condition:    'NM',
        setName:      foundCard.set_name,
        img:          foundCard.image_uris?.small
                        || foundCard.card_faces?.[0]?.image_uris?.small
                        || null,
        colors:       foundCard.color_identity || [],
        price:        foundCard.prices?.usd ? parseFloat(foundCard.prices.usd) : null,
        tcgplayerUrl: foundCard.purchase_uris?.tcgplayer || null,
      }

      // Save to storage (localStorage or Supabase)
      const saved = await addCard(card, user?.id)

      // Sync React state — use the saved card so the id matches storage
      setCollection(prev => {
        const i = prev.findIndex(c => c.name.toLowerCase() === card.name.toLowerCase())
        if (i >= 0) {
          const next = [...prev]
          next[i] = { ...next[i], qty: next[i].qty + 1 }
          return next
        }
        return [...prev, saved || { ...card, id: Date.now() }]
      })

      setAddedCards(prev => [...prev, foundCard.name])
      showToast(`✓ Added ${foundCard.name} to collection`)

    } catch (err) {
      console.error('[Scanner] add failed:', err)
      showToast('Could not add card — please try again')
    }

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

  function handleClose() {
    stopTracks()
    onClose()
  }

  // ── Colours for guide boxes ───────────────────────────────────────────────
  const nameColor = foundCard ? '#4caf50' : '#4a9eff'
  const collColor = foundCard ? '#4caf50' : '#f59e0b'

  // ── Render ────────────────────────────────────────────────────────────────
  // We use a custom scrollable overlay instead of the global .modal-box class.
  // .modal-box uses position:fixed + translate(-50%,-50%) which clips tall
  // modals on short phone screens and hides both the header and footer buttons.

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) handleClose() }}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,.88)',
        zIndex: 200,
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '12px 12px 24px',
      }}
    >
      <div style={{
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        borderRadius: '16px',
        padding: '16px',
        width: '100%',
        maxWidth: '480px',
        position: 'relative',
        marginTop: '8px',
      }}>

        {/* ── Header ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <h3 style={{ margin: 0, fontSize: '1rem' }}>📷 Scan Card</h3>
          {/* ✕ button — always visible because it's inside the scrollable container */}
          <button
            onClick={handleClose}
            style={{
              background: 'var(--bg-primary)', border: '1px solid var(--border)',
              borderRadius: '50%', width: '32px', height: '32px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', fontSize: '1rem', color: 'var(--text)',
              flexShrink: 0,
            }}
          >✕</button>
        </div>

        {/* ── Camera view ── */}
        {cameraError ? (
          <div style={{
            padding: '32px', textAlign: 'center',
            background: 'var(--bg-primary)', borderRadius: '10px', marginBottom: '12px',
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
              style={{ width: '100%', display: 'block', minHeight: '160px' }} />

            {/* Blue box — card name (top 5–18%) */}
            <div style={{
              position: 'absolute', left: '5%', top: '5%', width: '78%', height: '13%',
              border: `2px solid ${nameColor}`, borderRadius: '4px',
              transition: 'border-color .3s', pointerEvents: 'none',
            }} />
            <div style={{
              position: 'absolute', left: '5%', top: 'calc(5% + 14%)',
              fontSize: '0.6rem', color: 'rgba(255,255,255,0.6)', pointerEvents: 'none',
            }}>Card name</div>

            {/* Amber box — collector number (bottom 84–94%) */}
            <div style={{
              position: 'absolute', left: '5%', top: '84%', width: '84%', height: '10%',
              border: `2px solid ${collColor}`, borderRadius: '4px',
              transition: 'border-color .3s', pointerEvents: 'none',
            }} />
            <div style={{
              position: 'absolute', left: '5%', top: 'calc(84% - 15px)',
              fontSize: '0.6rem', color: 'rgba(255,255,255,0.6)', pointerEvents: 'none',
            }}>Collector #</div>

            {/* Status pill */}
            {(ocrStatus === 'loading' || ocrStatus === 'scanning' || ocrStatus === 'error') && (
              <div style={{
                position: 'absolute', bottom: '8px', left: '50%', transform: 'translateX(-50%)',
                background: 'rgba(0,0,0,0.7)',
                color: ocrStatus === 'loading' ? '#c084fc' : ocrStatus === 'error' ? '#f87171' : '#4a9eff',
                padding: '3px 14px', borderRadius: '20px', fontSize: '0.72rem', whiteSpace: 'nowrap',
                pointerEvents: 'none',
              }}>
                {ocrStatus === 'loading'  && '⏳ Loading OCR…'}
                {ocrStatus === 'scanning' && '🔍 Reading…'}
                {ocrStatus === 'error'    && '⚠ OCR unavailable'}
              </div>
            )}
          </div>
        )}

        {/* ── Instructions ── */}
        <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', margin: '0 0 10px', lineHeight: 1.5 }}>
          Hold card so the <span style={{ color: '#4a9eff' }}>blue box</span> covers the card name and the <span style={{ color: '#f59e0b' }}>amber box</span> covers the collector number at the bottom.
        </p>

        {/* ── Live OCR readout ── */}
        {(nameRead || collectorRead) && !foundCard && (
          <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', fontSize: '0.72rem' }}>
            {nameRead && (
              <div style={{
                flex: 1, padding: '5px 9px',
                background: 'rgba(74,158,255,0.1)', borderRadius: '6px',
                border: '1px solid rgba(74,158,255,0.25)',
                color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                Name: <span style={{ color: 'var(--text)' }}>{nameRead}</span>
              </div>
            )}
            {collectorRead && (
              <div style={{
                padding: '5px 9px',
                background: 'rgba(245,158,11,0.1)', borderRadius: '6px',
                border: '1px solid rgba(245,158,11,0.25)',
                color: '#f59e0b', whiteSpace: 'nowrap',
              }}>
                {collectorRead}
              </div>
            )}
          </div>
        )}

        {/* ── Card preview + action buttons ── */}
        {foundCard && (
          <div style={{
            display: 'flex', gap: '12px', alignItems: 'center',
            marginBottom: '12px', padding: '12px',
            background: 'var(--bg-primary)', borderRadius: '10px',
            border: '1px solid rgba(74,222,128,0.35)',
          }}>
            {(foundCard.image_uris?.small || foundCard.card_faces?.[0]?.image_uris?.small) && (
              <img
                src={foundCard.image_uris?.small || foundCard.card_faces?.[0]?.image_uris?.small}
                alt={foundCard.name}
                style={{ width: '58px', borderRadius: '5px', flexShrink: 0 }}
              />
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: '.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {foundCard.name}
              </div>
              <div style={{ fontSize: '.76rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                {foundCard.set_name}
                {foundCard.collector_number && ` · #${foundCard.collector_number}`}
              </div>
              <div style={{ fontSize: '.76rem', color: 'var(--text-muted)', textTransform: 'capitalize' }}>
                {foundCard.rarity}
                {foundCard.prices?.usd && <span style={{ color: '#4ade80', marginLeft: '8px', fontWeight: 500 }}>${foundCard.prices.usd}</span>}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', flexShrink: 0 }}>
              <button
                onClick={handleAdd}
                disabled={adding}
                style={{
                  background: '#4ade80', color: '#000', border: 'none',
                  borderRadius: '8px', padding: '7px 14px',
                  fontWeight: 700, fontSize: '.82rem', cursor: adding ? 'wait' : 'pointer',
                  opacity: adding ? 0.7 : 1,
                }}
              >
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

        {/* ── Session log ── */}
        {addedCards.length > 0 && (
          <div style={{
            padding: '8px 12px', marginBottom: '12px',
            background: 'rgba(74,222,128,0.08)', borderRadius: '8px',
            border: '1px solid rgba(74,222,128,0.2)', fontSize: '.78rem',
          }}>
            <span style={{ color: 'var(--text-muted)' }}>Added: </span>
            <span style={{ color: '#4ade80' }}>{addedCards.join(' · ')}</span>
          </div>
        )}

        {/* ── Footer ── */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
          <button
            onClick={handleClose}
            style={{
              background: 'var(--bg-primary)', border: '1px solid var(--border)',
              borderRadius: '8px', padding: '8px 20px',
              color: 'var(--text)', cursor: 'pointer', fontSize: '.88rem',
            }}
          >
            Done
          </button>
        </div>

      </div>
    </div>
  )
}
