import { useRef, useState, useEffect } from 'react'
import { createWorker } from 'tesseract.js'
import { addCard } from '../lib/db'

// ── helpers ───────────────────────────────────────────────────────────────────

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
  const scanningRef = useRef(false)   // re-entry guard only — does NOT stop the loop
  const ocrReadyRef = useRef(false)

  const [cameraReady, setCameraReady] = useState(false)
  const [cameraError, setCameraError] = useState(null)
  const [ocrStatus,   setOcrStatus]   = useState('loading') // loading|ready|scanning|error

  const [nameRead,      setNameRead]      = useState('')
  const [collectorRead, setCollectorRead] = useState('')

  const [foundCard,  setFoundCard]  = useState(null)
  const [addedCards, setAddedCards] = useState([])
  const [adding,     setAdding]     = useState(false)

  // ── Tesseract (npm) ──────────────────────────────────────────────────────
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

  // ── Camera ───────────────────────────────────────────────────────────────
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

  const stopTracks = () =>
    videoRef.current?.srcObject?.getTracks().forEach(t => t.stop())

  // ── Scan loop ─────────────────────────────────────────────────────────────
  // Key design: the loop NEVER stops due to foundCard.
  // The scanner keeps running so it self-corrects on alternate art misreads.
  // The re-entry guard (scanningRef) prevents overlap; ocrStatus is display-only
  // and intentionally NOT included in effect deps (that was the original bug).
  useEffect(() => {
    if (!cameraReady) return
    const id = setInterval(scanFrame, 2000)
    return () => clearInterval(id)
  }, [cameraReady]) // eslint-disable-line react-hooks/exhaustive-deps

  async function scanFrame() {
    if (scanningRef.current || !ocrReadyRef.current) return
    const video = videoRef.current
    if (!video?.videoWidth) return

    scanningRef.current = true
    setOcrStatus('scanning')

    try {
      // Name strip: top 5–25% of frame (wider than before for alternate art)
      // Collector strip: bottom 84–94% of frame
      const nameCanvas = cropRegion(video, 0.05, 0.05, 0.78, 0.20)
      const collCanvas = cropRegion(video, 0.05, 0.84, 0.84, 0.10)

      const { data: nd } = await workerRef.current.recognize(nameCanvas)
      const { data: cd } = await workerRef.current.recognize(collCanvas)

      const name   = cleanName(nd.text)
      const colNum = extractCollector(cd.text)

      setNameRead(name)
      setCollectorRead(colNum ? `#${colNum}` : '')

      let card = null

      // Try name + collector number first (most precise — identifies exact printing)
      if (name.length >= 3 && colNum) {
        const q   = `"${name}" cn:${colNum}`
        const res = await fetch(
          `https://api.scryfall.com/cards/search?q=${encodeURIComponent(q)}&unique=prints`
        )
        if (res.ok) {
          const json = await res.json()
          if (json.data?.length > 0) card = json.data[0]
        }
      }

      // Fall back to fuzzy name search
      if (!card && name.length >= 3) {
        const res = await fetch(
          `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(name)}`
        )
        if (res.ok) {
          const json = await res.json()
          if (json.object === 'card') card = json
        }
      }

      // Always update foundCard — clears stale results when card moves out of frame
      setFoundCard(card || null)

    } catch (e) {
      console.warn('[Scanner] frame error:', e)
    }

    setOcrStatus('ready')
    scanningRef.current = false
  }

  // ── Add ───────────────────────────────────────────────────────────────────
  async function handleAdd() {
    if (!foundCard || adding) return
    const cardToAdd = foundCard  // snapshot before any async state changes
    setAdding(true)
    try {
      const card = {
        name:         cardToAdd.name,
        qty:          1,
        condition:    'NM',
        setName:      cardToAdd.set_name,
        img:          cardToAdd.image_uris?.small
                        || cardToAdd.card_faces?.[0]?.image_uris?.small
                        || null,
        colors:       cardToAdd.color_identity || [],
        price:        cardToAdd.prices?.usd ? parseFloat(cardToAdd.prices.usd) : null,
        tcgplayerUrl: cardToAdd.purchase_uris?.tcgplayer || null,
      }
      const saved = await addCard(card, user?.id)
      setCollection(prev => {
        const i = prev.findIndex(c => c.name.toLowerCase() === card.name.toLowerCase())
        if (i >= 0) {
          const next = [...prev]
          next[i] = { ...next[i], qty: next[i].qty + 1 }
          return next
        }
        return [...prev, saved || { ...card, id: Date.now() }]
      })
      setAddedCards(prev => [...prev, cardToAdd.name])
      showToast(`✓ Added ${cardToAdd.name} to collection`)
      setFoundCard(null)
    } catch (err) {
      console.error('[Scanner] add failed:', err)
      showToast('Could not add card — please try again')
    }
    setAdding(false)
  }

  function handleCustomize() {
    if (!foundCard) return
    stopTracks()
    onClose()
    openAddCard({ name: foundCard.name })
  }

  function handleClose() {
    stopTracks()
    onClose()
  }

  // ── Render ────────────────────────────────────────────────────────────────
  // Card preview is an overlay INSIDE the video container so it is always
  // visible without scrolling — previously it rendered below the video and was
  // completely off-screen on phones, making the scanner appear broken.

  const hasCard = !!foundCard
  const img     = foundCard?.image_uris?.small || foundCard?.card_faces?.[0]?.image_uris?.small

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
        padding: '14px',
        width: '100%',
        maxWidth: '480px',
        marginTop: '8px',
      }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <h3 style={{ margin: 0, fontSize: '1rem' }}>📷 Scan Card</h3>
          <button
            onClick={handleClose}
            style={{
              background: 'var(--bg-primary)', border: '1px solid var(--border)',
              borderRadius: '50%', width: '32px', height: '32px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', fontSize: '1rem', color: 'var(--text)', flexShrink: 0,
            }}
          >✕</button>
        </div>

        {/* Camera + overlay */}
        {cameraError ? (
          <div style={{
            padding: '32px', textAlign: 'center',
            background: 'var(--bg-primary)', borderRadius: '10px', marginBottom: '12px',
          }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '10px' }}>📷</div>
            <p style={{ margin: 0, color: 'var(--text-muted)' }}>{cameraError}</p>
          </div>
        ) : (
          <div style={{ position: 'relative', borderRadius: '10px', overflow: 'hidden', background: '#000', marginBottom: '10px' }}>
            <video ref={videoRef} autoPlay playsInline muted
              style={{ width: '100%', display: 'block', minHeight: '200px' }} />

            {/* Blue box: card name — top 5–25% */}
            <div style={{
              position: 'absolute', left: '5%', top: '5%', width: '78%', height: '20%',
              border: `2px solid ${hasCard ? '#4caf50' : '#4a9eff'}`,
              borderRadius: '4px', transition: 'border-color .3s', pointerEvents: 'none',
            }} />
            <span style={{
              position: 'absolute', left: '5%', top: 'calc(5% + 21%)',
              fontSize: '0.58rem', color: 'rgba(255,255,255,0.55)', pointerEvents: 'none',
            }}>Card name</span>

            {/* Amber box: collector number — bottom 84–94% */}
            <div style={{
              position: 'absolute', left: '5%', top: '84%', width: '84%', height: '10%',
              border: `2px solid ${hasCard ? '#4caf50' : '#f59e0b'}`,
              borderRadius: '4px', transition: 'border-color .3s', pointerEvents: 'none',
            }} />
            <span style={{
              position: 'absolute', left: '5%', top: 'calc(84% - 14px)',
              fontSize: '0.58rem', color: 'rgba(255,255,255,0.55)', pointerEvents: 'none',
            }}>Collector #</span>

            {/* OCR status pill — centre of frame, only when actively working */}
            {(ocrStatus === 'loading' || ocrStatus === 'scanning') && !hasCard && (
              <div style={{
                position: 'absolute', bottom: '8px', left: '50%', transform: 'translateX(-50%)',
                background: 'rgba(0,0,0,0.7)',
                color: ocrStatus === 'loading' ? '#c084fc' : '#4a9eff',
                padding: '3px 14px', borderRadius: '20px', fontSize: '0.72rem', whiteSpace: 'nowrap',
                pointerEvents: 'none',
              }}>
                {ocrStatus === 'loading' ? '⏳ Loading OCR…' : '🔍 Reading…'}
              </div>
            )}

            {/* ── Card preview overlay ── */}
            {/* Rendered INSIDE the video container so it is always on-screen. */}
            {hasCard && (
              <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0,
                background: 'linear-gradient(transparent 0%, rgba(0,0,0,0.92) 25%)',
                padding: '28px 12px 12px',
                display: 'flex', gap: '10px', alignItems: 'flex-end',
              }}>
                {img && (
                  <img src={img} alt={foundCard.name}
                    style={{ width: '54px', borderRadius: '5px', flexShrink: 0, alignSelf: 'center' }} />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, color: '#fff', fontSize: '.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {foundCard.name}
                  </div>
                  <div style={{ fontSize: '.72rem', color: 'rgba(255,255,255,0.65)', marginTop: '1px' }}>
                    {foundCard.set_name}
                    {foundCard.collector_number && ` · #${foundCard.collector_number}`}
                    {foundCard.prices?.usd && (
                      <span style={{ color: '#4ade80', marginLeft: '8px' }}>${foundCard.prices.usd}</span>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', flexShrink: 0 }}>
                  <button
                    onClick={handleAdd}
                    disabled={adding}
                    style={{
                      background: '#4ade80', color: '#000', border: 'none',
                      borderRadius: '8px', padding: '7px 16px',
                      fontWeight: 700, fontSize: '.82rem',
                      cursor: adding ? 'wait' : 'pointer',
                      opacity: adding ? 0.7 : 1, whiteSpace: 'nowrap',
                    }}
                  >{adding ? '…' : '+ Add'}</button>
                  <button
                    onClick={handleCustomize}
                    style={{
                      background: 'rgba(255,255,255,0.1)', color: '#fff', border: 'none',
                      borderRadius: '6px', padding: '4px 10px',
                      fontSize: '.7rem', cursor: 'pointer', whiteSpace: 'nowrap',
                    }}
                  >Customize</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Instructions */}
        <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', margin: '0 0 10px', lineHeight: 1.5 }}>
          Align the card so the <span style={{ color: '#4a9eff' }}>blue box</span> covers the card name and the <span style={{ color: '#f59e0b' }}>amber box</span> covers the bottom collector number. Scanner keeps running — hold still until it turns green.
        </p>

        {/* Live OCR readout */}
        {(nameRead || collectorRead) && (
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

        {/* Session log */}
        {addedCards.length > 0 && (
          <div style={{
            padding: '7px 11px', marginBottom: '10px',
            background: 'rgba(74,222,128,0.07)', borderRadius: '8px',
            border: '1px solid rgba(74,222,128,0.2)', fontSize: '.78rem',
          }}>
            <span style={{ color: 'var(--text-muted)' }}>Added: </span>
            <span style={{ color: '#4ade80' }}>{addedCards.join(' · ')}</span>
          </div>
        )}

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={handleClose}
            style={{
              background: 'var(--bg-primary)', border: '1px solid var(--border)',
              borderRadius: '8px', padding: '8px 20px',
              color: 'var(--text)', cursor: 'pointer', fontSize: '.88rem',
            }}
          >Done</button>
        </div>

      </div>
    </div>
  )
}
