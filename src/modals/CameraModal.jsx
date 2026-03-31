import { useRef, useState, useEffect } from 'react'
import { addCard } from '../lib/db'

// Card outline guide — percentages relative to the full video frame.
// Tell the user to fill their card to this box.
const GUIDE = { x: 0.04, y: 0.01, w: 0.92, h: 0.98 }

// ─────────────────────────────────────────────────────────────────────────────
// Image helpers
// ─────────────────────────────────────────────────────────────────────────────

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

// Capture the card guide area as a base64 JPEG, scaled to max 800px wide.
function captureCardImage(video) {
  const vw = video.videoWidth, vh = video.videoHeight
  const sx = Math.floor(vw * GUIDE.x), sy = Math.floor(vh * GUIDE.y)
  const sw = Math.floor(vw * GUIDE.w), sh = Math.floor(vh * GUIDE.h)
  const scale = Math.min(1, 800 / sw)
  const c = document.createElement('canvas')
  c.width  = Math.floor(sw * scale)
  c.height = Math.floor(sh * scale)
  c.getContext('2d').drawImage(video, sx, sy, sw, sh, 0, 0, c.width, c.height)
  return c.toDataURL('image/jpeg', 0.85).split(',')[1]
}

// ─────────────────────────────────────────────────────────────────────────────
// Scryfall lookup
// ─────────────────────────────────────────────────────────────────────────────

async function lookupCard(name) {
  // 1 — exact name
  try {
    const res = await fetch(`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}`)
    if (res.ok) {
      const json = await res.json()
      if (json.object === 'card') return { card: json, quality: 'exact' }
    }
  } catch { /* continue */ }

  // 2 — fuzzy name
  try {
    const res = await fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(name)}`)
    if (res.ok) {
      const json = await res.json()
      if (json.object === 'card') return { card: json, quality: 'fuzzy' }
    }
  } catch { /* continue */ }

  // 3 — autocomplete (handles garbled names)
  try {
    const acRes = await fetch(`https://api.scryfall.com/cards/autocomplete?q=${encodeURIComponent(name)}`)
    if (acRes.ok) {
      const acJson = await acRes.json()
      const top = acJson.data?.[0]
      if (top) {
        const detRes = await fetch(`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(top)}`)
        if (detRes.ok) {
          const det = await detRes.json()
          if (det.object === 'card') return { card: det, quality: 'fuzzy' }
        }
      }
    }
  } catch { /* continue */ }

  return { card: null, quality: null }
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function CameraModal({
  onClose, showToast, user, collection, setCollection, openAddCard
}) {
  const scanningRef  = useRef(false)
  const frozenRef    = useRef(false)
  const prevThumbRef = useRef(null)
  const stableRef    = useRef(0)
  const STABLE_NEEDED = 2

  const videoRef  = useRef(null)
  const streamRef = useRef(null)
  const [cameraReady,    setCameraReady]    = useState(false)
  const [cameraError,    setCameraError]    = useState(null)
  const [scanStatus,     setScanStatus]     = useState('ready')   // 'ready' | 'scanning' | 'error'
  const [torchOn,        setTorchOn]        = useState(false)
  const [torchSupported, setTorchSupported] = useState(false)

  const [nameRead,    setNameRead]    = useState('')
  const [foundCard,   setFoundCard]   = useState(null)
  const [matchQuality,setMatchQuality]= useState(null)
  const [addedCards,  setAddedCards]  = useState([])
  const [adding,      setAdding]      = useState(false)

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
    if (frozenRef.current) return
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

  // ── Core scan — Claude Vision ─────────────────────────────────────────────
  async function scanFrame() {
    if (scanningRef.current || frozenRef.current) return
    const video = videoRef.current
    if (!video?.videoWidth) return

    scanningRef.current = true
    setScanStatus('scanning')

    try {
      const image = captureCardImage(video)

      const res = await fetch('/.netlify/functions/scan-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image }),
      })

      if (!res.ok) throw new Error(`scan-card ${res.status}`)
      const { name } = await res.json()

      if (name && name.toLowerCase() !== 'unknown' && name.length >= 2) {
        setNameRead(name)
        const { card, quality } = await lookupCard(name)
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

    setScanStatus('ready')
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
    exact: { text: '✓✓ Exact match', color: '#4ade80', bg: 'rgba(74,222,128,0.2)'  },
    fuzzy: { text: '✓ Name match',   color: '#fbbf24', bg: 'rgba(251,191,36,0.2)'  },
  }[matchQuality] || null

  const hit = !!foundCard

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
              Fill card to the white frame · powered by Claude Vision
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
            {!foundCard && scanStatus === 'ready' && (
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

            {/* Scanning pulse */}
            {scanStatus === 'scanning' && !foundCard && (
              <div style={{
                position: 'absolute', bottom: '8px', left: '50%', transform: 'translateX(-50%)',
                background: 'rgba(0,0,0,0.72)', color: '#818cf8',
                padding: '3px 14px', borderRadius: '20px', fontSize: '0.72rem',
                whiteSpace: 'nowrap', pointerEvents: 'none',
              }}>
                ✦ Reading card…
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

        {/* Name readout */}
        {nameRead && (
          <div style={{
            padding: '5px 9px', marginBottom: '10px', fontSize: '0.7rem',
            background: 'rgba(129,140,248,0.1)', borderRadius: '6px',
            border: '1px solid rgba(129,140,248,0.2)',
            color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            Identified: <span style={{ color: '#a5b4fc' }}>{nameRead}</span>
          </div>
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
          Fill card to the white outline · Hold steady for a moment · Works with foil, alt-art &amp; showcase frames ·
          Wrong card? Tap 🔄 Rescan
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
