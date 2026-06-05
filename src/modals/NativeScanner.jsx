import { useState, useRef, useCallback, useEffect } from 'react'
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'
import { scanImageNative, parseCardName, scryfallFuzzy } from '../lib/textScanner'
import { hapticSuccess, hapticTap } from '../lib/native'

// How many consecutive matching reads before we commit to a card
const CONFIRM_NEEDED = 2

export default function NativeScanner({ onCard, onClose, storeMode = false }) {
  const [status,      setStatus]   = useState('idle')   // idle | scanning | confirming | found | error
  const [card,        setCard]     = useState(null)
  const [lastName,    setLastName] = useState('')
  const [confirmCount,setConfirm]  = useState(0)
  const [errorMsg,    setErrorMsg] = useState('')
  const [autoMode,    setAutoMode] = useState(true)
  const [scanCount,   setScanCount] = useState(0)
  const scanningRef   = useRef(false)
  const autoTimerRef  = useRef(null)

  // ── Core scan ──────────────────────────────────────────────────────────────
  const doScan = useCallback(async () => {
    if (scanningRef.current) return
    scanningRef.current = true
    setStatus('scanning')
    setErrorMsg('')

    try {
      // 1. Capture photo with native camera
      const photo = await Camera.getPhoto({
        quality:           85,
        allowEditing:      false,
        resultType:        CameraResultType.Base64,
        source:            CameraSource.Camera,
        saveToGallery:     false,
        promptLabelHeader: 'Scan Card',
        promptLabelCancel: 'Cancel',
        width:             1200,
      })

      const base64 = photo.base64String
      if (!base64) throw new Error('No image captured')

      setScanCount(n => n + 1)

      // 2. On-device OCR via iOS Vision
      const ocr = await scanImageNative(base64)
      const name = parseCardName(ocr)

      if (!name) {
        setStatus('idle')
        setErrorMsg('No card text detected — try again')
        scanningRef.current = false
        return
      }

      // 3. Consensus check — require CONFIRM_NEEDED matching reads
      if (name.toLowerCase() === lastName.toLowerCase()) {
        const newCount = confirmCount + 1
        setConfirm(newCount)
        if (newCount < CONFIRM_NEEDED) {
          setStatus('confirming')
          setErrorMsg(`Confirming: "${name}" (${newCount}/${CONFIRM_NEEDED})`)
          scanningRef.current = false
          if (autoMode) autoTimerRef.current = setTimeout(doScan, 400)
          return
        }
      } else {
        setLastName(name)
        setConfirm(1)
        setStatus('confirming')
        setErrorMsg(`Saw: "${name}" — scan again to confirm`)
        scanningRef.current = false
        if (autoMode) autoTimerRef.current = setTimeout(doScan, 400)
        return
      }

      // 4. Confirmed — look up on Scryfall
      setStatus('scanning')
      setErrorMsg(`Looking up "${name}"…`)
      const result = await scryfallFuzzy(name)

      if (!result) {
        setStatus('idle')
        setErrorMsg(`Couldn't find "${name}" — try again`)
        setLastName('')
        setConfirm(0)
        scanningRef.current = false
        return
      }

      // 5. Found!
      await hapticSuccess()
      setCard(result)
      setStatus('found')
      setLastName('')
      setConfirm(0)

    } catch (err) {
      if (err.message?.includes('cancelled') || err.message?.includes('dismissed')) {
        setStatus('idle')
      } else {
        setStatus('error')
        setErrorMsg(err.message || 'Scan failed')
      }
    } finally {
      scanningRef.current = false
    }
  }, [lastName, confirmCount, autoMode])

  // ── Tap to scan ────────────────────────────────────────────────────────────
  const handleTap = () => {
    hapticTap()
    clearTimeout(autoTimerRef.current)
    doScan()
  }

  // ── Accept found card ──────────────────────────────────────────────────────
  const handleAccept = () => {
    if (card) onCard(card)
    resetScanner()
  }

  const resetScanner = () => {
    setCard(null)
    setStatus('idle')
    setErrorMsg('')
    setLastName('')
    setConfirm(0)
    scanningRef.current = false
  }

  useEffect(() => {
    return () => clearTimeout(autoTimerRef.current)
  }, [])

  // ── UI ─────────────────────────────────────────────────────────────────────
  const isScanning = status === 'scanning' || status === 'confirming'

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 800,
      background: '#021f4e',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '0 24px',
      paddingTop: 'var(--safe-top, 0px)',
      paddingBottom: 'var(--safe-bottom, 0px)',
    }}>

      {/* Header */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        paddingTop: 'calc(var(--safe-top, 0px) + 14px)',
        paddingBottom: 14, paddingLeft: 20, paddingRight: 20,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ fontSize: '1rem', fontWeight: 700, color: '#fff' }}>
          🌿 Card Scanner
        </div>
        <button
          onClick={onClose}
          style={{ background: 'rgba(255,255,255,.12)', border: 'none', color: '#fff',
            borderRadius: '50%', width: 34, height: 34, cursor: 'pointer',
            fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          ✕
        </button>
      </div>

      {/* Found card display */}
      {status === 'found' && card ? (
        <div style={{ width: '100%', maxWidth: 340, textAlign: 'center' }}>
          <div style={{
            fontSize: '.72rem', fontWeight: 700, letterSpacing: '.12em',
            color: '#1ec4a6', textTransform: 'uppercase', marginBottom: 12,
          }}>Card Found ✓</div>

          {card.image_uris?.normal && (
            <img
              src={card.image_uris.normal}
              alt={card.name}
              style={{ width: '100%', borderRadius: 16, boxShadow: '0 16px 48px rgba(0,0,0,.7)', marginBottom: 20 }}
            />
          )}

          <div style={{ fontWeight: 800, fontSize: '1.2rem', color: '#fff', marginBottom: 4 }}>
            {card.name}
          </div>
          <div style={{ fontSize: '.78rem', color: 'rgba(255,255,255,.55)', marginBottom: 20 }}>
            {card.set_name} · {card.rarity}
            {card.prices?.usd ? ` · $${card.prices.usd}` : ''}
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={resetScanner}
              style={{
                flex: 1, padding: '13px', borderRadius: 12,
                background: 'rgba(255,255,255,.1)', border: '1px solid rgba(255,255,255,.2)',
                color: '#fff', fontWeight: 700, fontSize: '.9rem', cursor: 'pointer',
              }}>
              Scan Again
            </button>
            <button
              onClick={handleAccept}
              style={{
                flex: 2, padding: '13px', borderRadius: 12,
                background: '#1ec4a6', border: 'none',
                color: '#fff', fontWeight: 800, fontSize: '.9rem', cursor: 'pointer',
              }}>
              {storeMode ? '+ Add to Collection' : '+ Add to Collection'}
            </button>
          </div>
        </div>
      ) : (

        /* Scan prompt */
        <div style={{ width: '100%', maxWidth: 340, textAlign: 'center' }}>

          {/* Viewfinder frame */}
          <div style={{
            width: '100%', aspectRatio: '1.4',
            border: `3px solid ${isScanning ? '#1ec4a6' : 'rgba(255,255,255,.25)'}`,
            borderRadius: 20, marginBottom: 28, position: 'relative',
            transition: 'border-color .2s',
            boxShadow: isScanning ? '0 0 24px rgba(30,196,166,.4)' : 'none',
          }}>
            {/* Corner accents */}
            {['tl','tr','bl','br'].map(c => (
              <div key={c} style={{
                position: 'absolute',
                width: 24, height: 24,
                borderColor: '#1ec4a6', borderStyle: 'solid',
                borderWidth: c.includes('t') ? '3px 0 0' : '0 0 3px',
                ...(c.includes('l') ? { left: -3, borderLeftWidth: 3, borderRightWidth: 0 } : { right: -3, borderRightWidth: 3, borderLeftWidth: 0 }),
                ...(c.includes('t') ? { top: -3 } : { bottom: -3 }),
                borderRadius: c === 'tl' ? '4px 0 0 0' : c === 'tr' ? '0 4px 0 0' : c === 'bl' ? '0 0 0 4px' : '0 0 4px 0',
              }} />
            ))}

            {/* Scanning indicator */}
            {isScanning && (
              <div style={{
                position: 'absolute', inset: 0, display: 'flex',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <div style={{
                  width: 48, height: 48, borderRadius: '50%',
                  border: '3px solid rgba(30,196,166,.3)',
                  borderTopColor: '#1ec4a6',
                  animation: 'spin .8s linear infinite',
                }} />
              </div>
            )}

            {/* Hint text inside frame */}
            {!isScanning && (
              <div style={{
                position: 'absolute', inset: 0, display: 'flex',
                flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                color: 'rgba(255,255,255,.35)', fontSize: '.8rem',
              }}>
                <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>🃏</div>
                <div>Point at a Magic card</div>
              </div>
            )}
          </div>

          {/* Status message */}
          <div style={{
            minHeight: 40, display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 24,
          }}>
            {errorMsg ? (
              <div style={{ color: 'rgba(255,255,255,.65)', fontSize: '.82rem', textAlign: 'center' }}>
                {errorMsg}
              </div>
            ) : (
              <div style={{ color: 'rgba(255,255,255,.4)', fontSize: '.78rem' }}>
                {scanCount > 0 ? `${scanCount} scan${scanCount !== 1 ? 's' : ''} this session` : 'Tap the button to scan'}
              </div>
            )}
          </div>

          {/* Scan button */}
          <button
            onClick={handleTap}
            disabled={isScanning}
            style={{
              width: 80, height: 80, borderRadius: '50%',
              background: isScanning ? 'rgba(30,196,166,.3)' : '#1ec4a6',
              border: '4px solid rgba(255,255,255,.2)',
              cursor: isScanning ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '1.8rem', margin: '0 auto',
              transition: 'background .2s, transform .1s',
              transform: isScanning ? 'scale(0.95)' : 'scale(1)',
              boxShadow: isScanning ? 'none' : '0 4px 24px rgba(30,196,166,.5)',
            }}>
            {isScanning ? '⏳' : '📷'}
          </button>

          <div style={{ marginTop: 16, color: 'rgba(255,255,255,.35)', fontSize: '.7rem' }}>
            {isScanning ? 'Scanning…' : 'Tap to scan'}
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
