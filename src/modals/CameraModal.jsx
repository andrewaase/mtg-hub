import { useRef, useState, useEffect } from 'react'
import { addCard } from '../lib/db'

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
  // Helper: try fetching a single Scryfall card URL
  async function tryScryfallCard(url) {
    try {
      const res = await fetch(url)
      if (res.ok) {
        const json = await res.json()
        if (json.object === 'card') return json
      }
    } catch { /* continue */ }
    return null
  }

  // Tier 0a — exact set + collector number (ideal for alt/showcase/foil)
  if (setCode && collectorNumber) {
    const card = await tryScryfallCard(
      `https://api.scryfall.com/cards/${encodeURIComponent(setCode)}/${encodeURIComponent(collectorNumber)}`
    )
    if (card) return { card, quality: 'exact' }

    // Tier 0b — same but strip leading zeros (foil cards often print "0300", Scryfall stores "300")
    const stripped = collectorNumber.replace(/^0+(\d)/, '$1')
    if (stripped !== collectorNumber) {
      const card2 = await tryScryfallCard(
        `https://api.scryfall.com/cards/${encodeURIComponent(setCode)}/${encodeURIComponent(stripped)}`
      )
      if (card2) return { card: card2, quality: 'exact' }
    }
  }

  // Tier 1 — search by name within the identified set (finds full-art/showcase versions)
  // This is the key fallback for special treatments where the collector number is off
  if (setCode) {
    try {
      const q = `!"${name}" set:${setCode}`
      const res = await fetch(
        `https://api.scryfall.com/cards/search?q=${encodeURIComponent(q)}&order=collector_number`
      )
      if (res.ok) {
        const json = await res.json()
        // If multiple results in set (e.g. regular + extended art), pick the one
        // whose collector number is closest to what Claude read
        if (json.data?.length > 0) {
          if (collectorNumber && json.data.length > 1) {
            const target = parseInt(collectorNumber, 10)
            const closest = json.data.reduce((best, c) => {
              const diff = Math.abs(parseInt(c.collector_number, 10) - target)
              const bestDiff = Math.abs(parseInt(best.collector_number, 10) - target)
              return diff < bestDiff ? c : best
            })
            return { card: closest, quality: 'exact' }
          }
          return { card: json.data[0], quality: 'exact' }
        }
      }
    } catch { /* continue */ }
  }

  // Tier 2 — exact name (default/most-recent printing)
  const byName = await tryScryfallCard(
    `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}`
  )
  if (byName) return { card: byName, quality: 'exact' }

  // Tier 3 — fuzzy name
  const byFuzzy = await tryScryfallCard(
    `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(name)}`
  )
  if (byFuzzy) return { card: byFuzzy, quality: 'fuzzy' }

  // Tier 4 — autocomplete (handles garbled OCR)
  try {
    const acRes = await fetch(`https://api.scryfall.com/cards/autocomplete?q=${encodeURIComponent(name)}`)
    if (acRes.ok) {
      const acJson = await acRes.json()
      const top = acJson.data?.[0]
      if (top) {
        const card = await tryScryfallCard(
          `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(top)}`
        )
        if (card) return { card, quality: 'fuzzy' }
      }
    }
  } catch { /* continue */ }

  return { card: null, quality: null }
}

// ─────────────────────────────────────────────────────────────────────────────
// Chip component
// ─────────────────────────────────────────────────────────────────────────────

function Chip({ children, active, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '5px 12px', borderRadius: '99px',
        border: `1.5px solid ${active ? 'var(--accent-teal)' : 'rgba(255,255,255,0.15)'}`,
        background: active ? 'rgba(245,158,11,0.18)' : 'rgba(255,255,255,0.06)',
        color: active ? 'var(--accent-teal)' : 'rgba(255,255,255,0.7)',
        fontSize: '.75rem', fontWeight: active ? 700 : 400,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.35 : 1,
        transition: 'all .15s', whiteSpace: 'nowrap',
      }}
    >{children}</button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function CameraModal({
  onClose, showToast, user, collection, setCollection, openAddCard, setPage
}) {
  const scanningRef   = useRef(false)
  const frozenRef     = useRef(false)
  const prevThumbRef  = useRef(null)
  const stableRef     = useRef(0)
  const STABLE_NEEDED = 2

  const videoRef  = useRef(null)
  const streamRef = useRef(null)
  const [cameraReady,    setCameraReady]    = useState(false)
  const [cameraError,    setCameraError]    = useState(null)
  const [scanStatus,     setScanStatus]     = useState('ready')
  const [torchOn,        setTorchOn]        = useState(false)
  const [torchSupported, setTorchSupported] = useState(false)

  const [nameRead,      setNameRead]      = useState('')
  const [foundCard,     setFoundCard]     = useState(null)
  const [addedCards,    setAddedCards]    = useState([])
  const [adding,        setAdding]        = useState(false)
  const [lookingUp,     setLookingUp]     = useState(false)
  const [lookupFailed,  setLookupFailed]  = useState(false)
  const [priceMode,     setPriceMode]     = useState('normal')
  const [printings,     setPrintings]     = useState([])

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
    try { await track.applyConstraints({ advanced: [{ torch: next }] }); setTorchOn(next) }
    catch (e) { console.warn('[Scanner] torch toggle failed:', e) }
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

  // ── Core scan ─────────────────────────────────────────────────────────────
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

      const cleanName = (name || '').trim().replace(/["""]/g, '"').replace(/[''']/g, "'")
      if (cleanName && cleanName.toLowerCase() !== 'unknown' && cleanName.length >= 2) {
        setNameRead(cleanName)
        setLookingUp(true)
        setLookupFailed(false)
        const { card } = await lookupCard(cleanName, setCode, collectorNumber)
        setLookingUp(false)
        if (card) {
          frozenRef.current = true
          stableRef.current = 0
          setFoundCard(card)
          setPriceMode('normal')
          if (navigator.vibrate) navigator.vibrate(40)
          // Fetch all printings in background
          fetch(`https://api.scryfall.com/cards/search?q=${encodeURIComponent(`!"${card.name}"`)}&unique=prints&order=released`)
            .then(r => r.ok ? r.json() : null)
            .then(data => setPrintings(data?.data?.slice(0, 20) || []))
            .catch(() => {})
        } else {
          setLookupFailed(true)
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
      const priceUsd     = snap.prices?.usd      ? parseFloat(snap.prices.usd)      : null
      const priceUsdFoil = snap.prices?.usd_foil ? parseFloat(snap.prices.usd_foil) : null
      const isFoil = priceMode === 'foil' && priceUsdFoil != null
      const card = {
        name:         snap.name,
        qty:          1,
        condition:    'NM',
        setName:      snap.set_name,
        img:          snap.image_uris?.small || snap.card_faces?.[0]?.image_uris?.small || null,
        colors:       snap.color_identity || [],
        price:        isFoil ? priceUsdFoil : (priceUsd ?? priceUsdFoil),
        isFoil,
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
      if (options.forSale && setPage) { stopTracks(); onClose(); setPage('collection'); return }
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
    setNameRead('')
    setLookingUp(false)
    setLookupFailed(false)
    setPrintings([])
  }

  function handleClose() { stopTracks(); onClose() }

  // ── Derived ───────────────────────────────────────────────────────────────
  const artImg       = foundCard?.image_uris?.normal || foundCard?.card_faces?.[0]?.image_uris?.normal
  const smallImg     = foundCard?.image_uris?.small  || foundCard?.card_faces?.[0]?.image_uris?.small
  const priceUsd     = foundCard?.prices?.usd      ? parseFloat(foundCard.prices.usd)      : null
  const priceUsdFoil = foundCard?.prices?.usd_foil ? parseFloat(foundCard.prices.usd_foil) : null
  const displayPrice = priceMode === 'foil' && priceUsdFoil != null ? priceUsdFoil : priceUsd
  const alreadyOwned = foundCard
    ? (collection || []).find(c => c.name.toLowerCase() === foundCard.name.toLowerCase())
    : null
  const extraPrints  = printings.length > 1 ? printings.length - 1 : 0

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: '#000', overflow: 'hidden' }}>

      {/* ── Live camera — always visible ── */}
      <video
        ref={videoRef}
        autoPlay playsInline muted
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
      />

      {/* ── Dark gradient at bottom for sheet readability ── */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: '65%',
        background: 'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.55) 40%, rgba(0,0,0,0.9) 100%)',
        pointerEvents: 'none',
      }} />

      {/* ── Top bar: close + torch ── */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        padding: 'env(safe-area-inset-top, 16px) 16px 0',
        paddingTop: 'max(env(safe-area-inset-top), 16px)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        zIndex: 10,
      }}>
        <button onClick={handleClose} style={{
          background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: '50%', width: '38px', height: '38px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', fontSize: '1rem', color: '#fff', backdropFilter: 'blur(8px)',
        }}>✕</button>

        <div style={{ display: 'flex', gap: '8px' }}>
          {torchSupported && (
            <button onClick={toggleTorch} style={{
              background: torchOn ? 'rgba(255,220,50,0.85)' : 'rgba(0,0,0,0.5)',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: '50%', width: '38px', height: '38px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', fontSize: '1.1rem', backdropFilter: 'blur(8px)',
            }}>{torchOn ? '🔦' : '💡'}</button>
          )}
        </div>
      </div>

      {/* ── Camera error ── */}
      {cameraError && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: '12px',
        }}>
          <div style={{ fontSize: '3rem' }}>📷</div>
          <p style={{ color: 'rgba(255,255,255,0.7)', margin: 0, textAlign: 'center', padding: '0 32px' }}>{cameraError}</p>
        </div>
      )}

      {/* ── Card guide outline (no card yet) ── */}
      {!foundCard && !cameraError && (
        <div style={{
          position: 'absolute',
          left: `${GUIDE.x * 100}%`, top: '8%',
          width: `${GUIDE.w * 100}%`, height: '55%',
          border: '2px dashed rgba(255,255,255,0.4)', borderRadius: '8px',
          pointerEvents: 'none', boxSizing: 'border-box',
        }} />
      )}

      {/* ── Card art overlay on camera (when identified) ── */}
      {foundCard && artImg && (
        <div
          onClick={doRescan}
          style={{
            position: 'absolute', top: '8%', left: '50%', transform: 'translateX(-50%)',
            width: '82%', maxHeight: '52%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          <img
            src={artImg}
            alt={foundCard.name}
            style={{
              width: '100%', height: '100%', objectFit: 'contain',
              borderRadius: '10px',
              boxShadow: '0 8px 40px rgba(0,0,0,0.8), 0 0 0 1px rgba(245,158,11,0.3)',
              filter: 'drop-shadow(0 0 24px rgba(245,158,11,0.25))',
              animation: 'scanCardIn .25s ease-out',
            }}
          />
        </div>
      )}

      {/* ── Scanning indicator ── */}
      {scanStatus === 'scanning' && !foundCard && (
        <div style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
          background: 'rgba(0,0,0,0.72)', color: '#f59e0b',
          padding: '6px 18px', borderRadius: '20px', fontSize: '0.75rem',
          whiteSpace: 'nowrap', backdropFilter: 'blur(8px)',
        }}>✦ Reading card…</div>
      )}

      {/* ── "Tap to scan again" hint ── */}
      {foundCard && (
        <div style={{
          position: 'absolute',
          top: 'calc(8% + 52% + 8px)',
          left: '50%', transform: 'translateX(-50%)',
          display: 'flex', alignItems: 'center', gap: '6px',
          background: 'rgba(0,0,0,0.55)', borderRadius: '20px',
          padding: '5px 14px', backdropFilter: 'blur(8px)',
          cursor: 'pointer', whiteSpace: 'nowrap',
        }} onClick={doRescan}>
          <span style={{ fontSize: '.65rem' }}>💡</span>
          <span style={{ fontSize: '.72rem', color: 'rgba(255,255,255,0.75)' }}>Tap to scan again</span>
        </div>
      )}

      {/* ── Looking up indicator (name found, fetching Scryfall) ── */}
      {lookingUp && !foundCard && (
        <div style={{
          position: 'absolute', bottom: '200px', left: '50%', transform: 'translateX(-50%)',
          display: 'flex', alignItems: 'center', gap: '8px',
          background: 'rgba(0,0,0,0.7)', borderRadius: '20px',
          padding: '6px 16px', backdropFilter: 'blur(8px)',
        }}>
          <span style={{ fontSize: '.68rem', color: 'var(--accent-teal)' }}>✦</span>
          <span style={{ fontSize: '.72rem', color: 'rgba(255,255,255,0.8)' }}>
            {nameRead ? `Found "${nameRead}"…` : 'Looking up…'}
          </span>
        </div>
      )}

      {lookupFailed && !foundCard && !lookingUp && nameRead && (
        <div style={{
          position: 'absolute', bottom: '200px', left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(0,0,0,0.7)', borderRadius: '20px',
          padding: '6px 16px', backdropFilter: 'blur(8px)', textAlign: 'center',
        }}>
          <div style={{ fontSize: '.72rem', color: '#f87171' }}>Could not find "{nameRead}"</div>
          <div style={{ fontSize: '.62rem', color: 'rgba(255,255,255,0.5)', marginTop: '2px' }}>Hold card steadier and try again</div>
        </div>
      )}

      {/* ── Added cards log (floats above sheet) ── */}
      {addedCards.length > 0 && (
        <div style={{
          position: 'absolute', bottom: foundCard ? '230px' : '130px',
          left: '16px', right: '16px',
          padding: '7px 12px', background: 'rgba(74,222,128,0.15)', borderRadius: '10px',
          border: '1px solid rgba(74,222,128,0.25)', backdropFilter: 'blur(8px)',
          fontSize: '.75rem',
        }}>
          <span style={{ color: 'rgba(255,255,255,0.5)' }}>Added: </span>
          <span style={{ color: '#4ade80', fontWeight: 600 }}>{addedCards.join(' · ')}</span>
        </div>
      )}

      {/* ── Bottom sheet ── */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        background: 'rgba(18,18,20,0.97)',
        borderRadius: '20px 20px 0 0',
        backdropFilter: 'blur(20px)',
        paddingBottom: 'max(env(safe-area-inset-bottom), 16px)',
        borderTop: '1px solid rgba(255,255,255,0.08)',
      }}>
        {/* Drag handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 2px' }}>
          <div style={{ width: '32px', height: '3px', borderRadius: '99px', background: 'rgba(255,255,255,0.15)' }} />
        </div>

        {foundCard ? (
          <div style={{ padding: '10px 16px 16px' }}>
            {/* Card row */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: '12px',
              paddingBottom: '12px', borderBottom: '1px solid rgba(255,255,255,0.08)',
              marginBottom: '10px',
            }}>
              {smallImg && (
                <img src={smallImg} alt={foundCard.name}
                  style={{ width: '44px', borderRadius: '6px', flexShrink: 0, boxShadow: '0 2px 8px rgba(0,0,0,0.5)' }} />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: '.9rem', color: '#fff', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {foundCard.name}
                </div>
                <div style={{ fontSize: '.7rem', color: 'rgba(255,255,255,0.45)', marginTop: '2px' }}>
                  {foundCard.set_name}
                  {alreadyOwned && <span style={{ color: '#93c5fd', marginLeft: '6px' }}>Own ×{alreadyOwned.qty}</span>}
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: '.58rem', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '.5px' }}>Market</div>
                <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--accent-teal)' }}>
                  {displayPrice != null ? `$${displayPrice.toFixed(2)}` : '—'}
                </div>
              </div>
              <button
                onClick={() => { stopTracks(); onClose(); openAddCard({ name: foundCard.name }) }}
                style={{
                  background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '50%', width: '30px', height: '30px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', color: 'rgba(255,255,255,0.6)', fontSize: '1rem', flexShrink: 0,
                }}
              >›</button>
            </div>

            {/* Chips row: Normal | Foil | #Collector | +X prints */}
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '14px' }}>
              <Chip active={priceMode === 'normal'} onClick={() => setPriceMode('normal')}>Normal</Chip>
              <Chip
                active={priceMode === 'foil'}
                onClick={() => setPriceMode('foil')}
                disabled={priceUsdFoil == null}
              >✦ Foil</Chip>
              {foundCard.collector_number && (
                <Chip>#{foundCard.collector_number}</Chip>
              )}
              {extraPrints > 0 && (
                <Chip>+{extraPrints} prints</Chip>
              )}
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => handleAdd()}
                disabled={adding}
                style={{
                  flex: 1, background: 'var(--accent-teal)', color: '#000', border: 'none',
                  borderRadius: '12px', padding: '13px 8px',
                  fontWeight: 800, fontSize: '.88rem', cursor: adding ? 'wait' : 'pointer',
                  opacity: adding ? 0.7 : 1,
                }}
              >{adding ? '…' : '+ Add to Collection'}</button>
              <button
                onClick={() => handleAdd({ forSale: true })}
                disabled={adding}
                style={{
                  flex: 1, background: 'rgba(245,158,11,0.12)', color: 'var(--accent-teal)',
                  border: '1px solid rgba(245,158,11,0.3)',
                  borderRadius: '12px', padding: '13px 8px',
                  fontWeight: 700, fontSize: '.88rem', cursor: adding ? 'wait' : 'pointer',
                  opacity: adding ? 0.7 : 1,
                }}
              >Add &amp; List</button>
            </div>
          </div>
        ) : (
          /* Idle / scanning state */
          <div style={{ padding: '10px 16px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
            <div>
              <div style={{ fontSize: '.82rem', color: '#fff', fontWeight: 600, marginBottom: '2px' }}>
                {cameraError ? 'Camera unavailable' : 'Ready to scan'}
              </div>
              <div style={{ fontSize: '.68rem', color: 'rgba(255,255,255,0.4)' }}>
                {cameraError ? cameraError : 'Hold card steady within the frame'}
              </div>
            </div>
            <button
              onClick={handleClose}
              style={{
                background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: '10px', padding: '9px 20px', flexShrink: 0,
                color: '#fff', cursor: 'pointer', fontSize: '.84rem', fontWeight: 600,
              }}
            >Done</button>
          </div>
        )}
      </div>

      <style>{`
        @keyframes scanCardIn {
          from { opacity: 0; transform: scale(0.94); }
          to   { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  )
}
