import { useEffect, useRef, useState, useCallback } from 'react'
import { scanImageNative, parseCardName, scryfallFuzzy } from '../lib/textScanner'
import { hapticSuccess, hapticTap } from '../lib/native'

// Frames per second we sample for OCR (Vision is fast, but we throttle to save battery)
const SCAN_FPS      = 3
const SCAN_INTERVAL = 1000 / SCAN_FPS

// How many consecutive matching reads before committing to a card
const CONFIRM_NEEDED = 2

export default function NativeScanner({ onCard, onClose }) {
  const videoRef      = useRef(null)
  const canvasRef     = useRef(null)
  const scanLoopRef   = useRef(null)
  const lastScanRef   = useRef(0)
  const scanningRef   = useRef(false)

  const [status,       setStatus]      = useState('starting') // starting|scanning|confirming|found|error
  const [card,         setCard]        = useState(null)
  const [lastName,     setLastName]    = useState('')
  const [confirmCount, setConfirmCount]= useState(0)
  const [hint,         setHint]        = useState('Hold a Magic card in the frame')
  const [camError,     setCamError]    = useState(null)

  // refs for values used inside rAF loop (avoid stale closure)
  const lastNameRef    = useRef('')
  const confirmRef     = useRef(0)

  // ── Camera setup ───────────────────────────────────────────────────────────
  useEffect(() => {
    let stream = null

    async function startCamera() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode:  { ideal: 'environment' }, // rear camera
            width:       { ideal: 1280 },
            height:      { ideal: 720 },
          },
          audio: false,
        })
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
          setStatus('scanning')
          setHint('Hold a Magic card in the frame')
          startScanLoop()
        }
      } catch (err) {
        setCamError('Camera access denied — please allow camera in Settings')
        setStatus('error')
      }
    }

    startCamera()

    return () => {
      stopScanLoop()
      if (stream) stream.getTracks().forEach(t => t.stop())
    }
  }, []) // eslint-disable-line

  // ── Continuous scan loop ───────────────────────────────────────────────────
  function startScanLoop() {
    const loop = () => {
      scanLoopRef.current = requestAnimationFrame(loop)
      const now = Date.now()
      if (now - lastScanRef.current < SCAN_INTERVAL) return
      if (scanningRef.current) return
      lastScanRef.current = now
      runScan()
    }
    scanLoopRef.current = requestAnimationFrame(loop)
  }

  function stopScanLoop() {
    if (scanLoopRef.current) cancelAnimationFrame(scanLoopRef.current)
    scanLoopRef.current = null
  }

  // ── Core scan (runs 3× per second) ────────────────────────────────────────
  const runScan = useCallback(async () => {
    const video  = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || video.readyState < 2) return
    if (scanningRef.current) return
    scanningRef.current = true

    try {
      // Capture current frame to canvas → base64
      const ctx = canvas.getContext('2d')
      canvas.width  = video.videoWidth
      canvas.height = video.videoHeight
      ctx.drawImage(video, 0, 0)

      // Crop top 35% of frame — card name is always in the top third of the card
      const cropH = Math.floor(canvas.height * 0.35)
      const cropCanvas = document.createElement('canvas')
      cropCanvas.width  = canvas.width
      cropCanvas.height = cropH
      cropCanvas.getContext('2d').drawImage(canvas, 0, 0, canvas.width, cropH, 0, 0, canvas.width, cropH)
      const base64 = cropCanvas.toDataURL('image/jpeg', 0.8).split(',')[1]

      // Vision OCR
      const ocr  = await scanImageNative(base64)
      const name = parseCardName(ocr)

      if (!name) {
        setHint('Hold a Magic card in the frame')
        lastNameRef.current = ''
        confirmRef.current  = 0
        setLastName('')
        setConfirmCount(0)
        scanningRef.current = false
        return
      }

      // Consensus: need CONFIRM_NEEDED matching reads in a row
      if (name.toLowerCase() === lastNameRef.current.toLowerCase()) {
        confirmRef.current++
        const c = confirmRef.current
        setConfirmCount(c)
        setHint(`Confirming: "${name}"…`)
        setStatus('confirming')

        if (c >= CONFIRM_NEEDED) {
          // Confirmed — stop scanning and look up
          stopScanLoop()
          setHint(`Looking up "${name}"…`)
          setStatus('scanning')
          const result = await scryfallFuzzy(name)
          if (result) {
            await hapticSuccess()
            setCard(result)
            setStatus('found')
          } else {
            setHint(`"${name}" not found — try again`)
            lastNameRef.current = ''
            confirmRef.current  = 0
            setLastName('')
            setConfirmCount(0)
            setStatus('scanning')
            startScanLoop()
          }
        }
      } else {
        lastNameRef.current = name
        confirmRef.current  = 1
        setLastName(name)
        setConfirmCount(1)
        setHint(`Saw: "${name}"`)
        setStatus('scanning')
      }
    } catch (e) {
      // Silent — keep scanning on error
    } finally {
      scanningRef.current = false
    }
  }, [])

  // ── Accept card ────────────────────────────────────────────────────────────
  const handleAccept = () => {
    hapticTap()
    if (card) onCard(card)
  }

  const handleScanAgain = () => {
    setCard(null)
    setStatus('scanning')
    setHint('Hold a Magic card in the frame')
    lastNameRef.current = ''
    confirmRef.current  = 0
    setLastName('')
    setConfirmCount(0)
    startScanLoop()
  }

  const isConfirming = status === 'confirming'
  const isFound      = status === 'found'

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 800,
      background: '#000',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Live camera feed — full screen */}
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        style={{
          position: 'absolute', inset: 0,
          width: '100%', height: '100%',
          objectFit: 'cover',
        }}
      />

      {/* Hidden canvas for frame capture */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {/* Dark gradient at top for header legibility */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        height: 120,
        background: 'linear-gradient(to bottom, rgba(0,0,0,.75) 0%, transparent 100%)',
      }} />

      {/* Header */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        paddingTop: 'calc(var(--safe-top, 0px) + 14px)',
        paddingBottom: 14, paddingLeft: 20, paddingRight: 20,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        zIndex: 10,
      }}>
        <div style={{ fontSize: '1rem', fontWeight: 700, color: '#fff' }}>
          🌿 Card Scanner
        </div>
        <button onClick={onClose} style={{
          background: 'rgba(0,0,0,.45)', border: '1px solid rgba(255,255,255,.25)',
          color: '#fff', borderRadius: '50%', width: 34, height: 34,
          cursor: 'pointer', fontSize: '1rem',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>✕</button>
      </div>

      {/* Viewfinder overlay — only shown while scanning */}
      {!isFound && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 5,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            width: '80%', maxWidth: 300,
            aspectRatio: '1.4',
            position: 'relative',
          }}>
            {/* Corner brackets */}
            {['tl','tr','bl','br'].map(c => (
              <div key={c} style={{
                position: 'absolute', width: 28, height: 28,
                borderColor: isConfirming ? '#1ec4a6' : 'rgba(255,255,255,.8)',
                borderStyle: 'solid',
                borderWidth: c.includes('t') ? '3px 0 0' : '0 0 3px',
                ...(c.includes('l')
                  ? { left: 0, borderLeftWidth: 3, borderRightWidth: 0 }
                  : { right: 0, borderRightWidth: 3, borderLeftWidth: 0 }),
                ...(c.includes('t') ? { top: 0 } : { bottom: 0 }),
                borderRadius: c==='tl'?'4px 0 0 0':c==='tr'?'0 4px 0 0':c==='bl'?'0 0 0 4px':'0 0 4px 0',
                transition: 'border-color .2s',
              }} />
            ))}

            {/* Scanning line animation */}
            {!isConfirming && (
              <div style={{
                position: 'absolute', left: 0, right: 0, height: 2,
                background: 'linear-gradient(90deg, transparent, #1ec4a6, transparent)',
                animation: 'scanLine 2s ease-in-out infinite',
              }} />
            )}

            {/* Confirm pulse */}
            {isConfirming && (
              <div style={{
                position: 'absolute', inset: 0,
                border: '2px solid #1ec4a6',
                borderRadius: 8,
                animation: 'pulse .5s ease-in-out infinite alternate',
              }} />
            )}
          </div>
        </div>
      )}

      {/* Bottom hint bar — scanning state */}
      {!isFound && (
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          paddingBottom: 'calc(var(--safe-bottom, 0px) + 24px)',
          paddingTop: 24, paddingLeft: 20, paddingRight: 20,
          background: 'linear-gradient(to top, rgba(0,0,0,.8) 0%, transparent 100%)',
          zIndex: 10, textAlign: 'center',
        }}>
          {camError ? (
            <div style={{ color: '#f87171', fontSize: '.88rem' }}>{camError}</div>
          ) : (
            <div style={{
              color: isConfirming ? '#1ec4a6' : 'rgba(255,255,255,.85)',
              fontSize: '.88rem', fontWeight: isConfirming ? 700 : 400,
              transition: 'color .2s',
            }}>{hint}</div>
          )}
        </div>
      )}

      {/* Found card overlay */}
      {isFound && card && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 20,
          background: 'rgba(2,31,78,.92)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          padding: '20px 24px',
          paddingTop: 'calc(var(--safe-top, 0px) + 60px)',
          paddingBottom: 'calc(var(--safe-bottom, 0px) + 24px)',
        }}>
          <div style={{
            fontSize: '.7rem', fontWeight: 700, letterSpacing: '.12em',
            color: '#1ec4a6', textTransform: 'uppercase', marginBottom: 16,
          }}>✓ Card Found</div>

          {card.image_uris?.normal && (
            <img
              src={card.image_uris.normal}
              alt={card.name}
              style={{
                width: 'min(260px, 70vw)', borderRadius: 14,
                boxShadow: '0 16px 48px rgba(0,0,0,.7)', marginBottom: 20,
              }}
            />
          )}

          <div style={{ fontWeight: 800, fontSize: '1.15rem', color: '#fff', marginBottom: 4, textAlign: 'center' }}>
            {card.name}
          </div>
          <div style={{ fontSize: '.78rem', color: 'rgba(255,255,255,.5)', marginBottom: 24, textAlign: 'center' }}>
            {card.set_name}
            {card.prices?.usd ? ` · $${card.prices.usd}` : ''}
          </div>

          <div style={{ display: 'flex', gap: 10, width: '100%', maxWidth: 320 }}>
            <button onClick={handleScanAgain} style={{
              flex: 1, padding: '13px', borderRadius: 12,
              background: 'rgba(255,255,255,.1)', border: '1px solid rgba(255,255,255,.2)',
              color: '#fff', fontWeight: 700, fontSize: '.88rem', cursor: 'pointer',
            }}>Scan Again</button>
            <button onClick={handleAccept} style={{
              flex: 2, padding: '13px', borderRadius: 12,
              background: '#1ec4a6', border: 'none',
              color: '#fff', fontWeight: 800, fontSize: '.88rem', cursor: 'pointer',
            }}>+ Add to Collection</button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes scanLine {
          0%   { top: 10%; }
          50%  { top: 85%; }
          100% { top: 10%; }
        }
        @keyframes pulse {
          from { opacity: .5; box-shadow: 0 0 0 0 rgba(30,196,166,.5); }
          to   { opacity: 1;  box-shadow: 0 0 0 8px rgba(30,196,166,0); }
        }
      `}</style>
    </div>
  )
}
