import { useRef, useState, useEffect, useCallback } from 'react'
import { addCard } from '../lib/db'

/**
 * CameraModal — auto-scans MTG card names using Tesseract OCR + Scryfall fuzzy search.
 *
 * Flow:
 *  1. Camera opens, Tesseract.js loads from CDN (cached after first load).
 *  2. Every 1.5 s a frame is captured and the card-name region (top strip) is
 *     cropped, contrast-boosted, and passed to Tesseract.
 *  3. OCR text is cleaned and sent to the Scryfall fuzzy-name endpoint.
 *  4. On a match the card preview appears; user taps "+ Add" to save.
 *  5. After adding the scanner automatically resumes for the next card.
 */
export default function CameraModal({ onClose, showToast, user, collection, setCollection, openAddCard }) {
  const videoRef     = useRef(null)
  const cropRef      = useRef(null)   // hidden canvas for the OCR crop
  const workerRef    = useRef(null)   // Tesseract worker
  const scanningRef  = useRef(false)  // re-entry guard
  const foundCardRef = useRef(null)   // mirror of foundCard state (avoids stale closure)
  const intervalRef  = useRef(null)

  const [cameraReady, setCameraReady]   = useState(false)
  const [cameraError, setCameraError]   = useState(null)
  const [ocrStatus,   setOcrStatus]     = useState('loading') // loading | ready | scanning | error
  const [detectedText, setDetectedText] = useState('')
  const [foundCard,   setFoundCard]     = useState(null)
  const [addedCards,  setAddedCards]    = useState([])
  const [adding,      setAdding]        = useState(false)

  // keep ref in sync with state so scanFrame doesn't use a stale closure
  useEffect(() => { foundCardRef.current = foundCard }, [foundCard])

  // ── 1. Load Tesseract.js from CDN ─────────────────────────────────────────
  useEffect(() => {
    let mounted = true

    const init = async () => {
      try {
        if (!window.Tesseract) {
          await new Promise((resolve, reject) => {
            const s = document.createElement('script')
            s.src = 'https://unpkg.com/tesseract.js@4/dist/tesseract.min.js'
            s.onload  = resolve
            s.onerror = reject
            document.head.appendChild(s)
          })
        }
        const worker = await window.Tesseract.createWorker('eng')
        if (mounted) { workerRef.current = worker; setOcrStatus('ready') }
      } catch (e) {
        console.error('Tesseract init failed:', e)
        if (mounted) setOcrStatus('error')
      }
    }

    init()

    return () => {
      mounted = false
      workerRef.current?.terminate().catch(() => {})
    }
  }, [])

  // ── 2. Start camera ───────────────────────────────────────────────────────
  useEffect(() => {
    let mounted = true

    const startCamera = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          setCameraError('Camera not supported on this device or browser.')
          return
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }
        })
        if (mounted && videoRef.current) {
          videoRef.current.srcObject = stream
          setCameraReady(true)
        }
      } catch {
        if (mounted) {
          setCameraError('Camera access denied. Please allow camera permissions and try again.')
          showToast('Camera access denied')
        }
      }
    }

    startCamera()
    return () => { mounted = false; stopCamera() }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── 3. Run scan loop once camera AND Tesseract are ready ──────────────────
  useEffect(() => {
    if (!cameraReady || ocrStatus !== 'ready') return

    intervalRef.current = setInterval(scanFrame, 1500)
    return () => clearInterval(intervalRef.current)
  }, [cameraReady, ocrStatus]) // eslint-disable-line react-hooks/exhaustive-deps

  const stopCamera = () => {
    clearInterval(intervalRef.current)
    if (videoRef.current?.srcObject) {
      videoRef.current.srcObject.getTracks().forEach(t => t.stop())
    }
  }

  // ── 4. Capture + OCR + Scryfall lookup ───────────────────────────────────
  const scanFrame = useCallback(async () => {
    if (scanningRef.current)      return   // already scanning
    if (foundCardRef.current)     return   // waiting for user to act
    if (!workerRef.current)       return   // Tesseract not ready
    if (!videoRef.current)        return
    const video = videoRef.current
    if (!video.videoWidth)        return

    scanningRef.current = true
    setOcrStatus('scanning')

    try {
      const vw = video.videoWidth
      const vh = video.videoHeight

      // Card name sits in the top ~14 % of the card.
      // We target: x=8%, y=4%, w=72%, h=14% of the video frame
      const sx = Math.floor(vw * 0.08)
      const sy = Math.floor(vh * 0.04)
      const sw = Math.floor(vw * 0.72)
      const sh = Math.floor(vh * 0.14)

      // Scale 2× and boost contrast for better OCR accuracy
      const canvas = cropRef.current
      canvas.width  = sw * 2
      canvas.height = sh * 2
      const ctx = canvas.getContext('2d')
      ctx.filter = 'grayscale(1) contrast(1.6) brightness(1.15)'
      ctx.drawImage(video, sx, sy, sw, sh, 0, 0, sw * 2, sh * 2)
      ctx.filter = 'none'

      const { data } = await workerRef.current.recognize(canvas)
      const raw = data.text || ''

      // Keep only letters, spaces, hyphens, apostrophes, commas
      const cleaned = raw.replace(/[^a-zA-Z ',\-]/g, '').replace(/\s+/g, ' ').trim()

      if (cleaned.length >= 3) {
        setDetectedText(cleaned)

        const res = await fetch(
          `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(cleaned)}`
        )
        if (res.ok) {
          const card = await res.json()
          if (card.object === 'card') {
            setFoundCard(card)
            clearInterval(intervalRef.current)  // pause loop while card is shown
          }
        }
      }
    } catch (e) {
      console.warn('Scan error:', e)
    }

    setOcrStatus('ready')
    scanningRef.current = false
  }, [])

  // ── 5. Add card to collection ─────────────────────────────────────────────
  const handleAdd = async () => {
    if (!foundCard || adding) return
    setAdding(true)

    const card = {
      name:        foundCard.name,
      qty:         1,
      condition:   'NM',
      setName:     foundCard.set_name,
      img:         foundCard.image_uris?.small || foundCard.card_faces?.[0]?.image_uris?.small || null,
      colors:      foundCard.color_identity || [],
      price:       foundCard.prices?.usd ? parseFloat(foundCard.prices.usd) : null,
      tcgplayerUrl: foundCard.purchase_uris?.tcgplayer || null,
    }

    await addCard(card, user?.id)

    // Update in-memory collection state
    setCollection(prev => {
      const idx = prev.findIndex(c => c.name.toLowerCase() === card.name.toLowerCase())
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = { ...next[idx], qty: next[idx].qty + 1 }
        return next
      }
      return [...prev, { ...card, id: Date.now() }]
    })

    setAddedCards(prev => [...prev, foundCard.name])
    showToast(`Added ${foundCard.name} ✓`)
    setAdding(false)

    // Reset and resume scanning
    setFoundCard(null)
    setDetectedText('')
    // scan loop restarts via interval (foundCardRef is now null)
    intervalRef.current = setInterval(scanFrame, 1500)
  }

  // ── 6. "Customize" — open AddCardModal with card pre-filled ──────────────
  const handleCustomize = () => {
    if (!foundCard) return
    stopCamera()
    onClose()
    openAddCard({ name: foundCard.name })
  }

  const handleRescan = () => {
    setFoundCard(null)
    setDetectedText('')
    intervalRef.current = setInterval(scanFrame, 1500)
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const boxColor   = foundCard ? '#4caf50' : '#4a9eff'
  const boxShadow  = foundCard ? '0 0 14px rgba(76,175,80,0.5)' : '0 0 8px rgba(74,158,255,0.35)'

  const statusLabel = {
    loading:  '⏳ Loading scanner…',
    ready:    detectedText ? `🔍 ${detectedText.slice(0, 36)}` : '🔍 Scanning…',
    scanning: '🔍 Reading…',
    error:    '⚠ Scanner unavailable',
  }[ocrStatus]

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.92)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 200, padding: '16px',
    }}>
      <div className="modal-box" style={{ maxWidth: '480px', width: '100%' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h3 style={{ margin: 0 }}>📷 Scan Card</h3>
          <button className="btn btn-ghost" style={{ padding: '4px 10px', lineHeight: 1 }}
            onClick={() => { stopCamera(); onClose() }}>✕</button>
        </div>

        {/* Camera view or error */}
        {cameraError ? (
          <div style={{
            padding: '32px', textAlign: 'center', color: 'var(--text-muted)',
            background: 'var(--bg-secondary)', borderRadius: '10px', marginBottom: '16px',
          }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '10px' }}>📷</div>
            <p style={{ margin: 0 }}>{cameraError}</p>
          </div>
        ) : (
          <div style={{ position: 'relative', borderRadius: '10px', overflow: 'hidden', background: '#000', marginBottom: '12px' }}>
            <video ref={videoRef} autoPlay playsInline muted
              style={{ width: '100%', display: 'block', minHeight: '180px' }} />

            {/* Guide box — aligns with the OCR crop region */}
            <div style={{
              position: 'absolute',
              left: '8%', top: '4%', width: '72%', height: '14%',
              border: `2px solid ${boxColor}`,
              borderRadius: '4px',
              boxShadow: boxShadow,
              pointerEvents: 'none',
              transition: 'border-color .3s, box-shadow .3s',
            }} />

            {/* "Align card name in box" label just below the guide */}
            <div style={{
              position: 'absolute',
              left: '8%', top: 'calc(4% + 15%)',
              fontSize: '0.68rem', color: 'rgba(255,255,255,0.55)',
              pointerEvents: 'none',
            }}>
              Align card name in box
            </div>

            {/* Status badge at bottom */}
            <div style={{
              position: 'absolute', bottom: '8px',
              left: '50%', transform: 'translateX(-50%)',
              background: 'rgba(0,0,0,0.72)',
              color: ocrStatus === 'loading' ? '#c084fc'
                   : ocrStatus === 'scanning' ? '#4a9eff'
                   : ocrStatus === 'error' ? '#f87171' : '#94a3b8',
              padding: '3px 14px', borderRadius: '20px',
              fontSize: '0.72rem', whiteSpace: 'nowrap',
              maxWidth: '90%', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {statusLabel}
            </div>
          </div>
        )}

        {/* Hidden canvas for OCR */}
        <canvas ref={cropRef} style={{ display: 'none' }} />

        {/* Found card preview */}
        {foundCard && (
          <div style={{
            display: 'flex', gap: '12px', alignItems: 'center',
            marginBottom: '14px', padding: '12px',
            background: 'var(--bg-secondary)', borderRadius: '10px',
            border: '1px solid rgba(74,158,255,0.35)',
          }}>
            {(foundCard.image_uris?.small || foundCard.card_faces?.[0]?.image_uris?.small) && (
              <img
                src={foundCard.image_uris?.small || foundCard.card_faces?.[0]?.image_uris?.small}
                alt={foundCard.name}
                style={{ width: '58px', borderRadius: '5px', flexShrink: 0 }}
              />
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: '.95rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {foundCard.name}
              </div>
              <div style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>
                {foundCard.set_name} · <span style={{ textTransform: 'capitalize' }}>{foundCard.rarity}</span>
              </div>
              {foundCard.prices?.usd && (
                <div style={{ fontSize: '.8rem', color: '#4ade80', fontWeight: 500, marginTop: '2px' }}>
                  ${foundCard.prices.usd}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flexShrink: 0 }}>
              <button className="btn btn-primary"
                onClick={handleAdd}
                disabled={adding}
                style={{ fontSize: '.8rem', padding: '6px 14px' }}>
                {adding ? '…' : '+ Add'}
              </button>
              <button className="btn btn-ghost"
                onClick={handleCustomize}
                style={{ fontSize: '.72rem', padding: '4px 10px' }}>
                Customize
              </button>
              <button className="btn btn-ghost"
                onClick={handleRescan}
                style={{ fontSize: '.72rem', padding: '4px 10px' }}>
                Rescan
              </button>
            </div>
          </div>
        )}

        {/* Session log — cards added so far */}
        {addedCards.length > 0 && (
          <div style={{
            marginBottom: '12px', padding: '8px 12px',
            background: 'rgba(74,222,128,0.08)', borderRadius: '8px',
            border: '1px solid rgba(74,222,128,0.2)', fontSize: '.8rem',
          }}>
            <span style={{ color: 'var(--text-muted)' }}>Added this session: </span>
            <span style={{ color: '#4ade80' }}>{addedCards.join(' · ')}</span>
          </div>
        )}

        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={() => { stopCamera(); onClose() }}>Done</button>
        </div>
      </div>
    </div>
  )
}
