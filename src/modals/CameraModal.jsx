import { useRef, useState, useEffect } from 'react'
import { createWorker } from 'tesseract.js'
import { addCard } from '../lib/db'

// ── OCR / frame helpers ───────────────────────────────────────────────────────

/** Crop a region of the live video onto a new canvas scaled 3× for better OCR. */
function cropRegion(video, xPct, yPct, wPct, hPct) {
  const vw = video.videoWidth, vh = video.videoHeight
  const sx = Math.floor(vw * xPct), sy = Math.floor(vh * yPct)
  const sw = Math.floor(vw * wPct), sh = Math.floor(vh * hPct)
  const c = document.createElement('canvas')
  c.width = sw * 3; c.height = sh * 3
  c.getContext('2d').drawImage(video, sx, sy, sw, sh, 0, 0, sw * 3, sh * 3)
  return c
}

/** Capture a tiny 32×32 thumbnail for motion detection — very cheap. */
function thumbCanvas(video) {
  const c = document.createElement('canvas')
  c.width = 32; c.height = 32
  c.getContext('2d').drawImage(video, 0, 0, 32, 32)
  return c
}

/** Average pixel difference between two 32×32 canvases (0–255). */
function frameDiff(c1, c2) {
  const d1 = c1.getContext('2d').getImageData(0, 0, 32, 32).data
  const d2 = c2.getContext('2d').getImageData(0, 0, 32, 32).data
  let total = 0
  // Sample every 4th pixel (red channel) — fast enough for 300 ms polling
  for (let i = 0; i < d1.length; i += 16) total += Math.abs(d1[i] - d2[i])
  return total / (d1.length / 16)
}

function cleanName(raw) {
  return (raw || '').replace(/[^a-zA-Z ',\-]/g, '').replace(/\s+/g, ' ').trim()
}

function extractCollector(raw) {
  const m = (raw || '').match(/\b(\d{1,4})(?:\/\d+)?\b/)
  return m ? m[1] : null
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CameraModal({
  onClose, showToast, user, collection, setCollection, openAddCard
}) {
  // Two workers run in parallel: one per OCR region → ~2× faster than sequential
  const w1Ref = useRef(null)      // name strip
  const w2Ref = useRef(null)      // collector strip
  const ocrReadyRef = useRef(false)

  // Scan control
  const scanningRef  = useRef(false)  // re-entry guard
  const frozenRef    = useRef(false)  // true once a card is confirmed — display stays put
  const prevThumbRef = useRef(null)
  const stableRef    = useRef(0)      // consecutive stable frames
  const STABLE_NEEDED = 2             // × 300 ms = 600 ms hold-still before scan fires

  const videoRef = useRef(null)
  const [cameraReady, setCameraReady] = useState(false)
  const [cameraError, setCameraError] = useState(null)
  const [ocrStatus,   setOcrStatus]   = useState('loading') // loading|ready|scanning|error

  const [nameRead,      setNameRead]      = useState('')
  const [collectorRead, setCollectorRead] = useState('')

  const [foundCard,    setFoundCard]    = useState(null)
  const [matchQuality, setMatchQuality] = useState(null)  // 'exact' | 'fuzzy'
  const [addedCards,   setAddedCards]   = useState([])
  const [adding,       setAdding]       = useState(false)

  // ── Init two Tesseract workers in parallel ────────────────────────────────
  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const [w1, w2] = await Promise.all([createWorker('eng'), createWorker('eng')])
        if (!active) { w1.terminate(); w2.terminate(); return }
        w1Ref.current = w1
        w2Ref.current = w2
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
    }
  }, [])

  // ── Camera ────────────────────────────────────────────────────────────────
  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          setCameraError('Camera not supported on this device or browser.'); return
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }
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

  // ── Stability-based scan trigger (polls every 300 ms) ────────────────────
  // Fires OCR only once the frame has been still for STABLE_NEEDED × 300 ms.
  // This means scanning starts almost instantly after the user holds the card
  // steady, instead of waiting for a fixed 2-second blind timer.
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
      const diff = frameDiff(curr, prevThumbRef.current)
      if (diff < 12) {
        // Frame is stable
        stableRef.current++
        if (stableRef.current === STABLE_NEEDED && !scanningRef.current) {
          scanFrame()
        }
      } else {
        // Frame is moving — reset stability counter
        stableRef.current = 0
      }
    }
    prevThumbRef.current = curr
  }

  // ── Core OCR scan ─────────────────────────────────────────────────────────
  async function scanFrame() {
    if (scanningRef.current || frozenRef.current || !ocrReadyRef.current) return
    const video = videoRef.current
    if (!video?.videoWidth) return

    scanningRef.current = true
    setOcrStatus('scanning')

    try {
      // Both OCR regions run in parallel via two independent workers
      const [nd, cd] = await Promise.all([
        w1Ref.current.recognize(cropRegion(video, 0.05, 0.05, 0.78, 0.20)),
        w2Ref.current.recognize(cropRegion(video, 0.05, 0.84, 0.84, 0.10)),
      ])

      const name   = cleanName(nd.data.text)
      const colNum = extractCollector(cd.data.text)

      setNameRead(name)
      setCollectorRead(colNum ? `#${colNum}` : '')

      let card    = null
      let quality = 'fuzzy'

      // Priority 1 — exact printing via name + collector number
      if (name.length >= 3 && colNum) {
        const res = await fetch(
          `https://api.scryfall.com/cards/search?q=${encodeURIComponent(`"${name}" cn:${colNum}`)}&unique=prints`
        )
        if (res.ok) {
          const json = await res.json()
          if (json.data?.length > 0) { card = json.data[0]; quality = 'exact' }
        }
      }

      // Priority 2 — fuzzy name only
      if (!card && name.length >= 3) {
        const res = await fetch(
          `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(name)}`
        )
        if (res.ok) {
          const json = await res.json()
          if (json.object === 'card') card = json
        }
      }

      if (card) {
        frozenRef.current = true   // freeze display — won't update until Rescan
        stableRef.current = 0
        setFoundCard(card)
        setMatchQuality(quality)
        if (navigator.vibrate) navigator.vibrate(40)
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
      doRescan()   // immediately ready for next card
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

  // ── Derived display values ────────────────────────────────────────────────
  const img = foundCard?.image_uris?.small || foundCard?.card_faces?.[0]?.image_uris?.small
  const alreadyOwned = foundCard
    ? (collection || []).find(c => c.name.toLowerCase() === foundCard.name.toLowerCase())
    : null

  const nameBoxColor = foundCard ? '#4caf50' : '#4a9eff'
  const collBoxColor = foundCard ? '#4caf50' : '#f59e0b'

  // ── Render ────────────────────────────────────────────────────────────────
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

        {/* ── Header ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <div>
            <h3 style={{ margin: '0 0 2px', fontSize: '1rem' }}>📷 Scan Card</h3>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
              Hold card still · blue = name · amber = collector #
            </div>
          </div>
          <button onClick={handleClose} style={{
            background: 'var(--bg-primary)', border: '1px solid var(--border)',
            borderRadius: '50%', width: '32px', height: '32px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', fontSize: '1rem', color: 'var(--text)', flexShrink: 0,
          }}>✕</button>
        </div>

        {/* ── Camera + overlays ── */}
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
              style={{ width: '100%', display: 'block', minHeight: '200px' }} />

            {/* Card name guide — blue, top 5–25% */}
            <div style={{
              position: 'absolute', left: '5%', top: '5%', width: '78%', height: '20%',
              border: `2px solid ${nameBoxColor}`, borderRadius: '4px',
              transition: 'border-color .25s', pointerEvents: 'none',
              boxShadow: foundCard ? '0 0 10px rgba(76,175,80,0.5)' : 'none',
            }} />
            <span style={{
              position: 'absolute', left: '5%', top: 'calc(5% + 21%)',
              fontSize: '0.58rem', color: 'rgba(255,255,255,0.5)', pointerEvents: 'none',
            }}>Card name</span>

            {/* Collector # guide — amber, bottom 84–94% */}
            <div style={{
              position: 'absolute', left: '5%', top: '84%', width: '84%', height: '10%',
              border: `2px solid ${collBoxColor}`, borderRadius: '4px',
              transition: 'border-color .25s', pointerEvents: 'none',
              boxShadow: foundCard ? '0 0 10px rgba(76,175,80,0.5)' : 'none',
            }} />
            <span style={{
              position: 'absolute', left: '5%', top: 'calc(84% - 14px)',
              fontSize: '0.58rem', color: 'rgba(255,255,255,0.5)', pointerEvents: 'none',
            }}>Collector #</span>

            {/* Status pill — only while loading or scanning, hidden once found */}
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

            {/* ── Card preview overlay (always on-screen, inside video) ── */}
            {foundCard && (
              <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0,
                background: 'linear-gradient(transparent, rgba(0,0,0,0.94) 30%)',
                padding: '32px 12px 12px',
                display: 'flex', gap: '10px', alignItems: 'flex-end',
              }}>
                {/* Card image thumbnail */}
                {img && (
                  <img src={img} alt={foundCard.name}
                    style={{ width: '56px', borderRadius: '5px', flexShrink: 0, alignSelf: 'center',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.6)' }} />
                )}

                {/* Card info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, color: '#fff', fontSize: '.9rem',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {foundCard.name}
                  </div>
                  <div style={{ fontSize: '.72rem', color: 'rgba(255,255,255,0.6)', marginTop: '2px' }}>
                    {foundCard.set_name}
                    {foundCard.collector_number && ` · #${foundCard.collector_number}`}
                    {foundCard.prices?.usd && (
                      <span style={{ color: '#4ade80', marginLeft: '8px', fontWeight: 600 }}>
                        ${foundCard.prices.usd}
                      </span>
                    )}
                  </div>
                  {/* Confidence + already-owned badges */}
                  <div style={{ display: 'flex', gap: '5px', marginTop: '4px', flexWrap: 'wrap' }}>
                    <span style={{
                      fontSize: '0.62rem', padding: '1px 7px', borderRadius: '10px', fontWeight: 600,
                      background: matchQuality === 'exact' ? 'rgba(74,222,128,0.25)' : 'rgba(251,191,36,0.25)',
                      color: matchQuality === 'exact' ? '#4ade80' : '#fbbf24',
                    }}>
                      {matchQuality === 'exact' ? '✓✓ Exact match' : '✓ Name match'}
                    </span>
                    {alreadyOwned && (
                      <span style={{
                        fontSize: '0.62rem', padding: '1px 7px', borderRadius: '10px',
                        background: 'rgba(147,197,253,0.2)', color: '#93c5fd', fontWeight: 600,
                      }}>
                        Own ×{alreadyOwned.qty}
                      </span>
                    )}
                  </div>
                </div>

                {/* Action buttons */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', flexShrink: 0 }}>
                  <button onClick={handleAdd} disabled={adding} style={{
                    background: '#4ade80', color: '#000', border: 'none',
                    borderRadius: '8px', padding: '8px 16px',
                    fontWeight: 700, fontSize: '.82rem',
                    cursor: adding ? 'wait' : 'pointer', opacity: adding ? 0.7 : 1,
                    whiteSpace: 'nowrap', minWidth: '72px',
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

        {/* ── Live OCR readout (shows what each strip is reading) ── */}
        {(nameRead || collectorRead) && (
          <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', fontSize: '0.72rem' }}>
            {nameRead && (
              <div style={{
                flex: 1, padding: '5px 9px',
                background: 'rgba(74,158,255,0.1)', borderRadius: '6px',
                border: '1px solid rgba(74,158,255,0.2)',
                color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                Name: <span style={{ color: 'var(--text)' }}>{nameRead}</span>
              </div>
            )}
            {collectorRead && (
              <div style={{
                padding: '5px 9px',
                background: 'rgba(245,158,11,0.1)', borderRadius: '6px',
                border: '1px solid rgba(245,158,11,0.2)',
                color: '#f59e0b', whiteSpace: 'nowrap',
              }}>{collectorRead}</div>
            )}
          </div>
        )}

        {/* ── OCR error state ── */}
        {ocrStatus === 'error' && (
          <div style={{
            padding: '10px 14px', marginBottom: '10px',
            background: 'rgba(248,113,113,0.1)', borderRadius: '8px',
            border: '1px solid rgba(248,113,113,0.2)', fontSize: '.8rem', color: '#f87171',
          }}>
            ⚠ OCR engine failed to load. Try refreshing.
          </div>
        )}

        {/* ── Session log ── */}
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

        {/* ── Footer ── */}
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
