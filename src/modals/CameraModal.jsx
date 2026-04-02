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

async function lookupCard(name, setCode = null, collectorNumber = null) {
  // 0 — exact printing via set code + collector number (best for alt-art/foil/showcase)
  if (setCode && collectorNumber) {
    try {
      const res = await fetch(
        `https://api.scryfall.com/cards/${encodeURIComponent(setCode)}/${encodeURIComponent(collectorNumber)}`
      )
      if (res.ok) {
        const json = await res.json()
        if (json.object === 'card') return { card: json, quality: 'exact' }
      }
    } catch { /* continue */ }
  }

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
  onClose, showToast, user, collection, setCollection, openAddCard, setPage
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
  const [detailTab,   setDetailTab]   = useState('versions') // 'versions' | 'ruling'
  const [priceMode,   setPriceMode]   = useState('normal')   // 'normal' | 'foil'
  const [printings,   setPrintings]   = useState([])
  const [rulings,     setRulings]     = useState([])
  const [loadingDetail, setLoadingDetail] = useState(false)

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
      const { name, setCode, collectorNumber } = await res.json()

      if (name && name.toLowerCase() !== 'unknown' && name.length >= 2) {
        setNameRead(name)
        const { card, quality } = await lookupCard(name, setCode, collectorNumber)
        if (card) {
          frozenRef.current = true
          stableRef.current = 0
          setFoundCard(card)
          setMatchQuality(quality)
          setPriceMode('normal')
          setDetailTab('versions')
          if (navigator.vibrate) navigator.vibrate(40)
          // Fetch printings and rulings in background
          setLoadingDetail(true)
          Promise.all([
            fetch(`https://api.scryfall.com/cards/search?q=${encodeURIComponent(`!"${card.name}"`)}&unique=prints&order=released`).then(r => r.ok ? r.json() : null),
            card.rulings_uri ? fetch(card.rulings_uri).then(r => r.ok ? r.json() : null) : Promise.resolve(null),
          ]).then(([printsData, rulingsData]) => {
            setPrintings(printsData?.data?.slice(0, 12) || [])
            setRulings(rulingsData?.data?.slice(0, 8) || [])
          }).catch(() => {}).finally(() => setLoadingDetail(false))
        }
      }
    } catch (e) {
      console.warn('[Scanner] scan error:', e)
    }

    setScanStatus('ready')
    scanningRef.current = false
  }

  // ── Add to collection ─────────────────────────────────────────────────────
  async function handleAdd(options = {}) {
    if (!foundCard || adding) return
    const snap = foundCard
    setAdding(true)
    try {
      const priceUsd     = snap.prices?.usd     ? parseFloat(snap.prices.usd)     : null
      const priceUsdFoil = snap.prices?.usd_foil ? parseFloat(snap.prices.usd_foil) : null
      const card = {
        name:         snap.name,
        qty:          1,
        condition:    'NM',
        setName:      snap.set_name,
        img:          snap.image_uris?.small || snap.card_faces?.[0]?.image_uris?.small || null,
        colors:       snap.color_identity || [],
        price:        priceUsdFoil ?? priceUsd,
        isFoil:       priceUsdFoil != null && priceUsdFoil > 0,
        forSale:      options.forSale || false,
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

      if (options.forSale && setPage) {
        stopTracks(); onClose()
        setPage('collection')
        return
      }

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
    setPrintings([])
    setRulings([])
  }

  function handleCustomize() {
    if (!foundCard) return
    stopTracks(); onClose()
    openAddCard({ name: foundCard.name })
  }

  function handleClose() { stopTracks(); onClose() }

  // ── Derived display ───────────────────────────────────────────────────────
  const artImg       = foundCard?.image_uris?.normal || foundCard?.card_faces?.[0]?.image_uris?.normal
  const smallImg     = foundCard?.image_uris?.small  || foundCard?.card_faces?.[0]?.image_uris?.small
  const priceUsd     = foundCard?.prices?.usd     ? parseFloat(foundCard.prices.usd)     : null
  const priceUsdFoil = foundCard?.prices?.usd_foil ? parseFloat(foundCard.prices.usd_foil) : null
  const displayPrice = priceMode === 'foil' && priceUsdFoil != null ? priceUsdFoil : priceUsd
  const alreadyOwned = foundCard
    ? (collection || []).find(c => c.name.toLowerCase() === foundCard.name.toLowerCase())
    : null

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) handleClose() }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,.92)',
        zIndex: 200, overflowY: 'auto', WebkitOverflowScrolling: 'touch',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '0 0 24px',
      }}
    >
      <div style={{ width: '100%', maxWidth: '480px', background: 'var(--bg-secondary)', minHeight: '100dvh' }}>

        {/* ── If card found: full-bleed detail view ── */}
        {foundCard ? (
          <>
            {/* Full-bleed card art */}
            <div style={{ position: 'relative' }}>
              {artImg
                ? <img src={artImg} alt={foundCard.name} className="card-detail-art" />
                : <div style={{ width: '100%', aspectRatio: '5/4', background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '3rem' }}>🃏</div>
              }
              {/* Close */}
              <button onClick={handleClose} style={{
                position: 'absolute', top: '12px', left: '12px',
                background: 'rgba(0,0,0,.6)', border: 'none', borderRadius: '50%',
                width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', fontSize: '.9rem', color: '#fff',
              }}>✕</button>
              {/* Rescan */}
              <button onClick={doRescan} style={{
                position: 'absolute', top: '12px', right: '12px',
                background: 'rgba(0,0,0,.6)', border: 'none', borderRadius: '20px',
                padding: '6px 12px', cursor: 'pointer', fontSize: '.72rem', color: '#fff',
              }}>🔄 Rescan</button>
              {/* Already owned badge */}
              {alreadyOwned && (
                <div style={{
                  position: 'absolute', bottom: '12px', left: '12px',
                  background: 'rgba(0,0,0,.7)', borderRadius: '20px', padding: '4px 10px',
                  fontSize: '.68rem', color: '#93c5fd', fontWeight: 600,
                }}>Own ×{alreadyOwned.qty}</div>
              )}
            </div>

            {/* Card info */}
            <div className="card-detail-body">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                <div>
                  <div className="card-detail-name">{foundCard.name}</div>
                  <div className="card-detail-type">{foundCard.type_line}</div>
                  <div style={{ fontSize: '.72rem', color: 'var(--text-muted)', marginTop: '3px' }}>
                    {foundCard.set_name}{foundCard.collector_number ? ` · #${foundCard.collector_number}` : ''}
                  </div>
                </div>
                {foundCard.power != null && (
                  <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px', padding: '6px 10px', fontSize: '.9rem', fontWeight: 800, flexShrink: 0, color: 'var(--text-primary)' }}>
                    {foundCard.power}/{foundCard.toughness}
                  </div>
                )}
              </div>

              {/* Price toggle */}
              <div className="price-toggle">
                <button className={`price-toggle-btn ${priceMode === 'normal' ? 'active' : ''}`} onClick={() => setPriceMode('normal')}>
                  Normal{priceUsd != null ? ` · $${priceUsd.toFixed(2)}` : ''}
                </button>
                <button className={`price-toggle-btn ${priceMode === 'foil' ? 'active' : ''}`} onClick={() => setPriceMode('foil')}
                  disabled={priceUsdFoil == null} style={{ opacity: priceUsdFoil == null ? 0.4 : 1 }}>
                  ✦ Foil{priceUsdFoil != null ? ` · $${priceUsdFoil.toFixed(2)}` : ''}
                </button>
              </div>

              {/* Oracle text */}
              {foundCard.oracle_text && (
                <div className="card-detail-oracle">{foundCard.oracle_text}</div>
              )}

              {/* Versions / Ruling tabs */}
              <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', margin: '14px -16px 0', padding: '0 16px' }}>
                {[['versions', 'Versions'], ['ruling', 'Ruling']].map(([key, label]) => (
                  <button key={key} onClick={() => setDetailTab(key)} style={{
                    padding: '8px 16px', background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: '.82rem', fontWeight: 600,
                    color: detailTab === key ? 'var(--accent-teal)' : 'var(--text-muted)',
                    borderBottom: detailTab === key ? '2px solid var(--accent-teal)' : '2px solid transparent',
                    marginBottom: '-1px',
                  }}>{label}</button>
                ))}
              </div>

              {/* Tab content */}
              <div style={{ marginTop: '14px', minHeight: '80px' }}>
                {loadingDetail && <div style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>Loading…</div>}
                {!loadingDetail && detailTab === 'versions' && (
                  printings.length > 0 ? (
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {printings.map(p => (
                        <div key={p.id} style={{ textAlign: 'center', width: '56px' }}>
                          {p.image_uris?.small
                            ? <img src={p.image_uris.small} alt={p.set_name} style={{ width: '56px', borderRadius: '4px', border: p.id === foundCard.id ? '2px solid var(--accent-teal)' : '2px solid transparent' }} />
                            : <div style={{ width: '56px', height: '78px', background: 'var(--bg-card)', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.6rem', color: 'var(--text-muted)' }}>{p.set?.toUpperCase()}</div>
                          }
                          <div style={{ fontSize: '.58rem', color: 'var(--text-muted)', marginTop: '2px' }}>{p.set?.toUpperCase()}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>No other printings found</div>
                  )
                )}
                {!loadingDetail && detailTab === 'ruling' && (
                  rulings.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {rulings.map((r, i) => (
                        <div key={i} style={{ fontSize: '.78rem', color: 'var(--text-secondary)', lineHeight: 1.5, paddingBottom: '10px', borderBottom: i < rulings.length - 1 ? '1px solid var(--border)' : 'none' }}>
                          <div style={{ fontSize: '.62rem', color: 'var(--text-muted)', marginBottom: '3px' }}>{r.published_at}</div>
                          {r.comment}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>No rulings found</div>
                  )
                )}
              </div>
            </div>

            {/* Added cards log */}
            {addedCards.length > 0 && (
              <div style={{ margin: '0 16px 12px', padding: '8px 12px', background: 'rgba(74,222,128,0.07)', borderRadius: '8px', border: '1px solid rgba(74,222,128,0.18)', fontSize: '.78rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Added: </span>
                <span style={{ color: '#4ade80' }}>{addedCards.join(' · ')}</span>
              </div>
            )}

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: '10px', padding: '0 16px 16px' }}>
              <button onClick={() => handleAdd()} disabled={adding} style={{
                flex: 1, background: 'var(--accent-teal)', color: '#000', border: 'none',
                borderRadius: '12px', padding: '14px',
                fontWeight: 800, fontSize: '.9rem', cursor: adding ? 'wait' : 'pointer',
                opacity: adding ? 0.7 : 1,
              }}>{adding ? '…' : '+ Add to Collection'}</button>
              <button onClick={() => handleAdd({ forSale: true })} disabled={adding} style={{
                flex: 1, background: 'rgba(245,158,11,0.15)', color: 'var(--accent-teal)',
                border: '1px solid rgba(245,158,11,0.35)',
                borderRadius: '12px', padding: '14px',
                fontWeight: 700, fontSize: '.9rem', cursor: adding ? 'wait' : 'pointer',
                opacity: adding ? 0.7 : 1,
              }}>Add &amp; List</button>
            </div>
          </>
        ) : (
          /* ── Camera view (no card found yet) ── */
          <div>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px 10px' }}>
              <div>
                <h3 style={{ margin: '0 0 2px', fontSize: '1rem' }}>📷 Scan Card</h3>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Fill card to the white frame · powered by Claude Vision</div>
              </div>
              <button onClick={handleClose} style={{
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                borderRadius: '50%', width: '32px', height: '32px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', fontSize: '1rem', color: 'var(--text-primary)', flexShrink: 0,
              }}>✕</button>
            </div>

            {cameraError ? (
              <div style={{ padding: '32px', textAlign: 'center' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '10px' }}>📷</div>
                <p style={{ margin: 0, color: 'var(--text-muted)' }}>{cameraError}</p>
              </div>
            ) : (
              <div style={{ position: 'relative', background: '#000' }}>
                <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', display: 'block', minHeight: '260px' }} />

                {torchSupported && (
                  <button onClick={toggleTorch} style={{
                    position: 'absolute', top: '10px', right: '10px',
                    background: torchOn ? 'rgba(255,220,50,0.9)' : 'rgba(0,0,0,0.55)',
                    border: '1px solid ' + (torchOn ? 'rgba(255,220,50,0.5)' : 'rgba(255,255,255,0.2)'),
                    borderRadius: '50%', width: '36px', height: '36px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', fontSize: '1.1rem', zIndex: 10,
                  }}>{torchOn ? '🔦' : '💡'}</button>
                )}

                {/* Card guide outline */}
                <div style={{
                  position: 'absolute',
                  left: `${GUIDE.x * 100}%`, top: `${GUIDE.y * 100}%`,
                  width: `${GUIDE.w * 100}%`, height: `${GUIDE.h * 100}%`,
                  border: '2px dashed rgba(255,255,255,0.55)', borderRadius: '6px',
                  pointerEvents: 'none', boxSizing: 'border-box',
                }} />

                {!foundCard && scanStatus === 'ready' && (
                  <div style={{
                    position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
                    color: 'rgba(255,255,255,0.35)', fontSize: '0.72rem',
                    textAlign: 'center', pointerEvents: 'none', lineHeight: 1.5,
                  }}>Fill card to white outline</div>
                )}

                {scanStatus === 'scanning' && (
                  <div style={{
                    position: 'absolute', bottom: '10px', left: '50%', transform: 'translateX(-50%)',
                    background: 'rgba(0,0,0,0.72)', color: '#f59e0b',
                    padding: '4px 16px', borderRadius: '20px', fontSize: '0.72rem',
                    whiteSpace: 'nowrap', pointerEvents: 'none',
                  }}>✦ Reading card…</div>
                )}
              </div>
            )}

            {nameRead && (
              <div style={{ margin: '10px 16px 0', padding: '5px 9px', fontSize: '0.7rem', background: 'rgba(245,158,11,0.08)', borderRadius: '6px', border: '1px solid rgba(245,158,11,0.2)', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                Identified: <span style={{ color: 'var(--accent-teal)' }}>{nameRead}</span>
              </div>
            )}

            {addedCards.length > 0 && (
              <div style={{ margin: '10px 16px 0', padding: '7px 11px', background: 'rgba(74,222,128,0.07)', borderRadius: '8px', border: '1px solid rgba(74,222,128,0.18)', fontSize: '.78rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Added: </span>
                <span style={{ color: '#4ade80' }}>{addedCards.join(' · ')}</span>
              </div>
            )}

            <div style={{ padding: '14px 16px', fontSize: '0.65rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
              Hold steady · Works with foil &amp; alt-art · After scanning tap <strong style={{ color: 'var(--text-secondary)' }}>Add &amp; List</strong> to mark for sale
            </div>

            <div style={{ padding: '0 16px 20px', display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={handleClose} style={{
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                borderRadius: '10px', padding: '10px 24px',
                color: 'var(--text-primary)', cursor: 'pointer', fontSize: '.88rem', fontWeight: 600,
              }}>Done</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
