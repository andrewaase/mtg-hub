import { useRef, useState, useEffect } from 'react'
import { addCard, upsertStoreListing, updateCollectionCard, removeCard } from '../lib/db'
import { supabase } from '../lib/supabase'
import UpgradeModal from '../components/UpgradeModal'

const RAPID_DELAY_MS = 1000  // pause before auto-adding in Rapid Mode

const GUIDE = { x: 0.04, y: 0.01, w: 0.92, h: 0.98 }

// Strip crop fractions — what slice of the card region we actually send to Claude.
// Card titles live in the top ~14% and set/collector code in the bottom ~7%.
// We add a margin to each for tilt/framing tolerance.
const TITLE_STRIP_FRAC  = 0.20   // top 20% of guide
const BOTTOM_STRIP_FRAC = 0.12   // bottom 12% of guide
const STRIP_TARGET_W    = 600    // px width sent to API
const JPEG_QUALITY      = 0.72   // OCR-grade quality (was 0.85)
const SHARPNESS_MIN     = 90     // gradient-variance threshold; below = too blurry to scan

// Module-level cache of recent Scryfall results so repeat scans of the same card
// don't re-hit the network. Cleared on hard refresh; survives modal open/close.
const LOOKUP_CACHE     = new Map()
const LOOKUP_CACHE_MAX = 50

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

// Capture title-bar + bottom-strip composition. Returns the canvas so callers can
// run a sharpness check before encoding to JPEG.
function captureCardCanvas(video) {
  const vw = video.videoWidth, vh = video.videoHeight
  const sx = Math.floor(vw * GUIDE.x)
  const sw = Math.floor(vw * GUIDE.w)

  // Source rectangles in video coords
  const titleSrcY = Math.floor(vh * GUIDE.y)
  const titleSrcH = Math.floor(vh * GUIDE.h * TITLE_STRIP_FRAC)
  const bottomSrcY = Math.floor(vh * (GUIDE.y + GUIDE.h * (1 - BOTTOM_STRIP_FRAC)))
  const bottomSrcH = Math.floor(vh * GUIDE.h * BOTTOM_STRIP_FRAC)

  // Destination dims (scale so width ≤ STRIP_TARGET_W)
  const scale = Math.min(1, STRIP_TARGET_W / sw)
  const outW       = Math.floor(sw * scale)
  const outTitleH  = Math.floor(titleSrcH * scale)
  const outBottomH = Math.floor(bottomSrcH * scale)
  const gap        = 8

  const c = document.createElement('canvas')
  c.width  = outW
  c.height = outTitleH + gap + outBottomH
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, c.width, c.height)
  ctx.drawImage(video, sx, titleSrcY,  sw, titleSrcH,  0, 0,                   outW, outTitleH)
  ctx.drawImage(video, sx, bottomSrcY, sw, bottomSrcH, 0, outTitleH + gap,     outW, outBottomH)
  return c
}

// Gradient-variance sharpness metric (cheap proxy for Laplacian variance).
// Higher = sharper. Samples every 3rd pixel for speed.
function imageVariance(canvas) {
  const w = canvas.width, h = canvas.height
  const data = canvas.getContext('2d').getImageData(0, 0, w, h).data
  let sum = 0, sumSq = 0, count = 0
  const rowBytes = w * 4
  for (let y = 1; y < h - 1; y += 3) {
    for (let x = 1; x < w - 1; x += 3) {
      const i  = (y * w + x) * 4
      const c  = (data[i]                + data[i + 1]                + data[i + 2])              / 3
      const r  = (data[i + 12]           + data[i + 13]               + data[i + 14])             / 3
      const d  = (data[i + rowBytes * 3] + data[i + rowBytes * 3 + 1] + data[i + rowBytes * 3 + 2]) / 3
      const g  = Math.abs(c - r) + Math.abs(c - d)
      sum   += g
      sumSq += g * g
      count++
    }
  }
  const mean = sum / count
  return sumSq / count - mean * mean
}

function canvasToBase64(canvas) {
  return canvas.toDataURL('image/jpeg', JPEG_QUALITY).split(',')[1]
}

function cacheKeyFor(name, setCode, collectorNumber) {
  return `${(setCode || '').toLowerCase()}|${collectorNumber || ''}|${(name || '').toLowerCase()}`
}

// ─────────────────────────────────────────────────────────────────────────────
// Scryfall lookup
// ─────────────────────────────────────────────────────────────────────────────

async function lookupCard(name, setCode = null, collectorNumber = null) {
  // Cache hit — skip every network call
  const key = cacheKeyFor(name, setCode, collectorNumber)
  if (LOOKUP_CACHE.has(key)) {
    return { card: LOOKUP_CACHE.get(key), quality: 'cached' }
  }

  // Helper: cache a successful result and return it
  function cacheAndReturn(card, quality) {
    if (card) {
      LOOKUP_CACHE.set(key, card)
      if (LOOKUP_CACHE.size > LOOKUP_CACHE_MAX) {
        LOOKUP_CACHE.delete(LOOKUP_CACHE.keys().next().value)
      }
    }
    return { card, quality }
  }

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
    if (card) return cacheAndReturn(card, 'exact')

    // Tier 0b — same but strip leading zeros (foil cards often print "0300", Scryfall stores "300")
    const stripped = collectorNumber.replace(/^0+(\d)/, '$1')
    if (stripped !== collectorNumber) {
      const card2 = await tryScryfallCard(
        `https://api.scryfall.com/cards/${encodeURIComponent(setCode)}/${encodeURIComponent(stripped)}`
      )
      if (card2) return cacheAndReturn(card2, 'exact')
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
            return cacheAndReturn(closest, 'exact')
          }
          return cacheAndReturn(json.data[0], 'exact')
        }
      }
    } catch { /* continue */ }
  }

  // Tier 2 — exact name (default/most-recent printing)
  const byName = await tryScryfallCard(
    `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}`
  )
  if (byName) return cacheAndReturn(byName, 'exact')

  // Tier 3 — fuzzy name
  const byFuzzy = await tryScryfallCard(
    `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(name)}`
  )
  if (byFuzzy) return cacheAndReturn(byFuzzy, 'fuzzy')

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
        if (card) return cacheAndReturn(card, 'fuzzy')
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
  onClose, showToast, user, isAdmin, collection, setCollection, openAddCard, setPage, membership
}) {
  const scanningRef    = useRef(false)
  const frozenRef      = useRef(false)
  const prevThumbRef   = useRef(null)
  const stableRef      = useRef(0)
  const unknownCountRef = useRef(0)  // consecutive "unknown" responses
  const MAX_UNKNOWN     = 2
  const STABLE_NEEDED   = 2
  const [showUpgrade, setShowUpgrade] = useState(false)

  const videoRef  = useRef(null)
  const streamRef = useRef(null)
  const [cameraReady,    setCameraReady]    = useState(false)
  const [cameraError,    setCameraError]    = useState(null)
  const [scanStatus,     setScanStatus]     = useState('ready')
  const [torchOn,        setTorchOn]        = useState(false)
  const [torchSupported, setTorchSupported] = useState(false)

  const [nameRead,      setNameRead]      = useState('')
  const [foundCard,     setFoundCard]     = useState(null)
  const [addedCards,    setAddedCards]    = useState([])   // [{ name, img, collectionId, qtyBefore }]
  const [adding,        setAdding]        = useState(false)
  const [lookingUp,     setLookingUp]     = useState(false)
  const [lookupFailed,  setLookupFailed]  = useState(false)
  const [scanError,     setScanError]     = useState(null) // visible function error
  const [priceMode,      setPriceMode]      = useState('normal')
  const [printings,      setPrintings]      = useState([])
  const [showPrintings,  setShowPrintings]  = useState(false)
  const [editingName,    setEditingName]    = useState(false)
  const [editValue,      setEditValue]      = useState('')
  const [dfcFlipped,     setDfcFlipped]     = useState(false)

  // Rapid Mode — auto-adds the identified card after a short delay so users
  // can bulk-catalog without tapping. Persisted across sessions.
  const [rapidMode, setRapidMode] = useState(() => {
    try { return localStorage.getItem('scanner.rapidMode') === '1' } catch { return false }
  })
  const [rapidCountdown, setRapidCountdown] = useState(0)
  const rapidTimerRef = useRef(null)
  useEffect(() => {
    try { localStorage.setItem('scanner.rapidMode', rapidMode ? '1' : '0') } catch {}
  }, [rapidMode])

  // Store mode (admin only)
  const [storeMode,        setStoreMode]        = useState(false)
  const [listingCondition, setListingCondition] = useState('NM')
  const [listingPrice,     setListingPrice]     = useState('')

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

  // ── Sync listing price when card or foil mode changes ─────────────────────
  useEffect(() => {
    if (!foundCard) { setListingPrice(''); return }
    const pUsd     = foundCard.prices?.usd      ? parseFloat(foundCard.prices.usd)      : null
    const pUsdFoil = foundCard.prices?.usd_foil ? parseFloat(foundCard.prices.usd_foil) : null
    const p = priceMode === 'foil' && pUsdFoil != null ? pUsdFoil : pUsd
    setListingPrice(p != null ? p.toFixed(2) : '')
  }, [foundCard, priceMode])

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
    setScanError(null)

    try {
      // Capture title+bottom strip composition, then verify it's sharp enough.
      // Skipping a blurry frame here saves a Claude API call.
      const canvas = captureCardCanvas(video)
      const sharpness = imageVariance(canvas)
      if (sharpness < SHARPNESS_MIN) {
        // Reset stability so next still+sharp frame triggers a fresh scan.
        stableRef.current = 0
        prevThumbRef.current = null
        scanningRef.current = false
        setScanStatus('ready')
        return
      }

      const image = canvasToBase64(canvas)
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/.netlify/functions/scan-card', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { 'Authorization': `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ image }),
      })

      if (!res.ok) {
        // 429 = daily scan limit reached
        if (res.status === 429) {
          frozenRef.current = true
          setShowUpgrade(true)
          setScanStatus('ready')
          scanningRef.current = false
          return
        }
        // Try to surface a human-readable error from the function body
        let msg = `Scan service error (${res.status})`
        try {
          const errJson = await res.json()
          if (errJson?.error) {
            msg = errJson.error === 'ANTHROPIC_API_KEY not configured'
              ? 'Scan API key not set — check Netlify env vars'
              : errJson.error
          }
        } catch { /* ignore parse failure */ }
        setScanError(msg)
        throw new Error(msg)
      }

      const { name, setCode, collectorNumber } = await res.json()

      const cleanName = (name || '').trim().replace(/["""]/g, '"').replace(/[''']/g, "'")
      const isUsable = cleanName && cleanName.toLowerCase() !== 'unknown' && cleanName.length >= 2

      if (isUsable) {
        unknownCountRef.current = 0
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
          setScanError(null)
          if (navigator.vibrate) navigator.vibrate(40)
          // Fetch all printings in background.
          // Sort: same-set prints first (so STA / Secret Lair / etc. variants
          // surface immediately), then everything else by release date.
          // Auto-open the printings panel when the *same set* has multiple
          // variants — this is the Strixhaven-Mystical-Archive case where the
          // scanner picks one print but the user actually scanned a Japanese
          // alt-art / etched / showcase version.
          fetch(`https://api.scryfall.com/cards/search?q=${encodeURIComponent(`!"${card.name}"`)}&unique=prints&order=released`)
            .then(r => r.ok ? r.json() : null)
            .then(data => {
              const all       = data?.data || []
              const sameSet   = all.filter(p => p.set === card.set)
              const otherSets = all.filter(p => p.set !== card.set)
              const sorted    = [...sameSet, ...otherSets].slice(0, 30)
              setPrintings(sorted)
              if (sameSet.length > 1 && !rapidMode) setShowPrintings(true)
            })
            .catch(() => {})
        } else {
          setLookupFailed(true)
        }
      } else {
        // Claude couldn't read a name — count it. After MAX_UNKNOWN consecutive
        // failures, freeze so we stop burning API calls and prompt the user.
        unknownCountRef.current++
        if (unknownCountRef.current >= MAX_UNKNOWN) {
          frozenRef.current = true
          setNameRead('')
          setLookupFailed(true)
        } else {
          // Reset stability so a fresh stable+sharp frame retries automatically.
          stableRef.current = 0
          prevThumbRef.current = null
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
      const isFoil       = priceMode === 'foil' && priceUsdFoil != null
      const cardPrice    = isFoil ? priceUsdFoil : (priceUsd ?? priceUsdFoil)
      const thumbImg     = snap.image_uris?.small || snap.card_faces?.[0]?.image_uris?.small || null

      const card = {
        name:         snap.name,
        qty:          1,
        condition:    'NM',
        setName:      snap.set_name,
        img:          thumbImg,
        colors:       snap.color_identity || [],
        price:        cardPrice,
        isFoil,
        forSale:      options.forSale || false,
        tcgplayerUrl: snap.purchase_uris?.tcgplayer || null,
        scryfallId:   snap.id || null,
      }

      // Capture pre-add qty so undo can restore it (rather than always removing)
      const existingInCollection = (collection || []).find(
        c => c.name.toLowerCase() === card.name.toLowerCase()
      )
      const qtyBefore = existingInCollection?.qty || 0

      const saved = await addCard(card, user?.id)
      setCollection(prev => {
        const i = prev.findIndex(c => c.name.toLowerCase() === card.name.toLowerCase())
        if (i >= 0) {
          const next = [...prev]; next[i] = { ...next[i], qty: next[i].qty + 1 }; return next
        }
        return [...prev, saved || { ...card, id: Date.now() }]
      })

      // If "Add & List" and user is admin, upsert a store listing
      if (options.forSale && isAdmin) {
        const { merged } = await upsertStoreListing({
          name:        snap.name,
          set_name:    snap.set_name || null,
          condition:   'NM',
          is_foil:     isFoil,
          price:       cardPrice ?? 0,
          img_url:     snap.image_uris?.normal || snap.card_faces?.[0]?.image_uris?.normal || null,
          scryfall_id: snap.id || null,
        })
        showToast(merged ? `✓ Added & stocked +1 ${snap.name}` : `✓ Added & listed ${snap.name}`)
      } else {
        showToast(`✓ Added ${snap.name}`)
      }

      setAddedCards(prev => [
        ...prev,
        {
          name:         snap.name,
          img:          thumbImg,
          collectionId: saved?.id || existingInCollection?.id || null,
          qtyBefore,
        },
      ].slice(-5))
      if (navigator.vibrate) navigator.vibrate([40, 20, 80])
      doRescan()
    } catch (err) {
      console.error('[Scanner] add failed:', err)
      showToast(`Could not save — ${err.message || 'try again'}`)
    }
    setAdding(false)
  }

  // ── Undo a recent add ────────────────────────────────────────────────────
  async function handleUndo(entry, index) {
    if (!entry?.collectionId) {
      setAddedCards(prev => prev.filter((_, i) => i !== index))
      return
    }
    try {
      if (entry.qtyBefore === 0) {
        await removeCard(entry.collectionId, user?.id)
        setCollection(prev => prev.filter(c => c.id !== entry.collectionId))
      } else {
        await updateCollectionCard(entry.collectionId, { qty: entry.qtyBefore }, user?.id)
        setCollection(prev => prev.map(c =>
          c.id === entry.collectionId ? { ...c, qty: entry.qtyBefore } : c
        ))
      }
      setAddedCards(prev => prev.filter((_, i) => i !== index))
      showToast(`↩ Removed ${entry.name}`)
    } catch (err) {
      console.error('[Scanner] undo failed:', err)
      showToast('Could not undo')
    }
  }

  // ── Manual name correction (re-lookup with a corrected name) ─────────────
  async function handleManualCorrect() {
    setEditingName(false)
    const newName = (editValue || '').trim()
    if (!newName || !foundCard || newName.toLowerCase() === foundCard.name.toLowerCase()) return
    setLookingUp(true)
    const { card } = await lookupCard(newName)
    setLookingUp(false)
    if (card) {
      setFoundCard(card)
      setNameRead(newName)
      setDfcFlipped(false)
      setPriceMode('normal')
      // Refresh printings panel for the new card
      fetch(`https://api.scryfall.com/cards/search?q=${encodeURIComponent(`!"${card.name}"`)}&unique=prints&order=released`)
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          const all     = data?.data || []
          const sameSet = all.filter(p => p.set === card.set)
          const others  = all.filter(p => p.set !== card.set)
          setPrintings([...sameSet, ...others].slice(0, 30))
        })
        .catch(() => {})
    } else {
      showToast(`Couldn't find "${newName}"`)
    }
  }

  // ── Add to store inventory (admin only) ──────────────────────────────────
  async function handleAddToStore() {
    if (!foundCard || adding) return
    const price = parseFloat(listingPrice)
    if (!listingPrice || isNaN(price) || price <= 0) {
      showToast('Enter a valid price'); return
    }
    const snap = foundCard
    setAdding(true)
    try {
      const isFoil = priceMode === 'foil' && snap.prices?.usd_foil != null
      const { merged } = await upsertStoreListing({
        name:        snap.name,
        set_name:    snap.set_name || null,
        condition:   listingCondition,
        is_foil:     isFoil,
        price,
        img_url:     snap.image_uris?.normal || snap.card_faces?.[0]?.image_uris?.normal || null,
        scryfall_id: snap.id || null,
      })
      setAddedCards(prev => [...prev, snap.name].slice(-5))
      showToast(merged ? `🏪 +1 stock: ${snap.name}` : `🏪 Listed ${snap.name}`)
      if (navigator.vibrate) navigator.vibrate([40, 20, 80])
      doRescan()
    } catch (err) {
      console.error('[Scanner] store insert failed:', err)
      showToast('Could not list card — try again')
    }
    setAdding(false)
  }

  function doRescan() {
    frozenRef.current = false
    stableRef.current = 0
    prevThumbRef.current = null
    unknownCountRef.current = 0
    setFoundCard(null)
    setNameRead('')
    setLookingUp(false)
    setLookupFailed(false)
    setPrintings([])
    setShowPrintings(false)
    setListingCondition('NM')
    setListingPrice('')
    setEditingName(false)
    setDfcFlipped(false)
    setRapidCountdown(0)
    if (rapidTimerRef.current) { clearInterval(rapidTimerRef.current); rapidTimerRef.current = null }
  }

  // ── Rapid Mode auto-add ──────────────────────────────────────────────────
  // When enabled, auto-adds the identified card after RAPID_DELAY_MS so the
  // user can bulk-catalog without tapping. Cancels if foundCard changes or
  // mode toggles off.
  useEffect(() => {
    if (!foundCard || !rapidMode || storeMode) { setRapidCountdown(0); return }
    const startedAt = Date.now()
    setRapidCountdown(RAPID_DELAY_MS)
    rapidTimerRef.current = setInterval(() => {
      const remaining = RAPID_DELAY_MS - (Date.now() - startedAt)
      if (remaining <= 0) {
        clearInterval(rapidTimerRef.current)
        rapidTimerRef.current = null
        setRapidCountdown(0)
        handleAdd()
      } else {
        setRapidCountdown(remaining)
      }
    }, 60)
    return () => {
      if (rapidTimerRef.current) { clearInterval(rapidTimerRef.current); rapidTimerRef.current = null }
      setRapidCountdown(0)
    }
  }, [foundCard, rapidMode, storeMode]) // eslint-disable-line

  function cancelRapid() {
    if (rapidTimerRef.current) { clearInterval(rapidTimerRef.current); rapidTimerRef.current = null }
    setRapidCountdown(0)
  }

  function handleClose() { stopTracks(); onClose() }

  // ── Derived ───────────────────────────────────────────────────────────────
  const DFC_LAYOUTS  = ['transform', 'modal_dfc', 'reversible_card', 'double_faced_token']
  const isDFC        = !!foundCard && DFC_LAYOUTS.includes(foundCard.layout) && (foundCard.card_faces?.length || 0) >= 2
  const faceIdx      = isDFC && dfcFlipped ? 1 : 0
  const activeFace   = isDFC ? foundCard.card_faces[faceIdx] : foundCard
  const artImg       = activeFace?.image_uris?.normal || foundCard?.image_uris?.normal || foundCard?.card_faces?.[0]?.image_uris?.normal
  const smallImg     = activeFace?.image_uris?.small  || foundCard?.image_uris?.small  || foundCard?.card_faces?.[0]?.image_uris?.small
  const displayName  = isDFC ? activeFace?.name : foundCard?.name
  const priceUsd     = foundCard?.prices?.usd      ? parseFloat(foundCard.prices.usd)      : null
  const priceUsdFoil = foundCard?.prices?.usd_foil ? parseFloat(foundCard.prices.usd_foil) : null
  const displayPrice = priceMode === 'foil' && priceUsdFoil != null ? priceUsdFoil : priceUsd
  const alreadyOwned = foundCard
    ? (collection || []).find(c => c.name.toLowerCase() === foundCard.name.toLowerCase())
    : null
  const sameSetVariants = foundCard ? printings.filter(p => p.set === foundCard.set).length : 0
  const extraPrints     = printings.length > 1 ? printings.length - 1 : 0

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

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            onClick={() => setRapidMode(r => !r)}
            title={rapidMode ? 'Rapid Mode ON — auto-adds after each scan' : 'Enable Rapid Mode for bulk-cataloging'}
            style={{
              background: rapidMode ? 'rgba(74,222,128,0.9)' : 'rgba(0,0,0,0.5)',
              border: `1.5px solid ${rapidMode ? '#4ade80' : 'rgba(255,255,255,0.15)'}`,
              borderRadius: '50%', width: '38px', height: '38px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', fontSize: '1rem', backdropFilter: 'blur(8px)',
              color: rapidMode ? '#000' : '#fff',
            }}
          >⚡</button>
          {torchSupported && (
            <button onClick={toggleTorch} style={{
              background: torchOn ? 'rgba(255,220,50,0.85)' : 'rgba(0,0,0,0.5)',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: '50%', width: '38px', height: '38px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', fontSize: '1.1rem', backdropFilter: 'blur(8px)',
            }}>{torchOn ? '🔦' : '💡'}</button>
          )}
          {isAdmin && (
            <button
              onClick={() => setStoreMode(p => !p)}
              title={storeMode ? 'Store Mode ON — tap to switch to Collection' : 'Switch to Store Mode'}
              style={{
                background: storeMode ? 'rgba(201,168,76,0.9)' : 'rgba(0,0,0,0.5)',
                border: `1.5px solid ${storeMode ? '#c9a84c' : 'rgba(255,255,255,0.15)'}`,
                borderRadius: '50%', width: '38px', height: '38px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', fontSize: '1rem', backdropFilter: 'blur(8px)',
              }}
            >🏪</button>
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

      {/* ── Scan function error (API key missing, server error, etc.) ── */}
      {scanError && !foundCard && (
        <div style={{
          position: 'absolute', top: '60px', left: '16px', right: '16px',
          background: 'rgba(239,68,68,0.9)', borderRadius: '10px',
          padding: '10px 14px', backdropFilter: 'blur(8px)', zIndex: 10,
          display: 'flex', alignItems: 'center', gap: '8px',
        }}>
          <span style={{ fontSize: '1rem' }}>⚠️</span>
          <span style={{ fontSize: '.75rem', color: '#fff', fontWeight: 600 }}>{scanError}</span>
          <button
            onClick={() => setScanError(null)}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', fontSize: '.9rem' }}
          >✕</button>
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
            alt={displayName}
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

      {/* ── Rapid Mode countdown bar (visible during auto-add) ── */}
      {rapidCountdown > 0 && foundCard && (
        <div
          onClick={cancelRapid}
          style={{
            position: 'absolute', top: 'calc(8% + 52% + 36px)',
            left: '50%', transform: 'translateX(-50%)',
            background: 'rgba(74,222,128,0.95)', color: '#000',
            borderRadius: '20px', padding: '6px 14px',
            display: 'flex', alignItems: 'center', gap: '8px',
            cursor: 'pointer', boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
            fontSize: '.72rem', fontWeight: 700, whiteSpace: 'nowrap',
          }}
        >
          <span>⚡ Auto-adding in {(rapidCountdown / 1000).toFixed(1)}s</span>
          <span style={{ opacity: .65, fontSize: '.65rem' }}>· tap to cancel</span>
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

      {lookupFailed && !foundCard && !lookingUp && (
        <div
          onClick={doRescan}
          style={{
            position: 'absolute', bottom: '200px', left: '50%', transform: 'translateX(-50%)',
            background: 'rgba(0,0,0,0.7)', borderRadius: '20px',
            padding: '6px 16px', backdropFilter: 'blur(8px)', textAlign: 'center',
            cursor: 'pointer',
          }}
        >
          <div style={{ fontSize: '.72rem', color: '#f87171' }}>
            {nameRead ? `Could not find "${nameRead}"` : "Couldn't read card"}
          </div>
          <div style={{ fontSize: '.62rem', color: 'rgba(255,255,255,0.5)', marginTop: '2px' }}>
            Tap here to try again
          </div>
        </div>
      )}

      {/* ── Recent scans strip (thumbnails with per-card undo) ── */}
      {addedCards.length > 0 && (
        <div style={{
          position: 'absolute', bottom: foundCard ? '230px' : '130px',
          left: '16px', right: '16px',
          padding: '8px 10px', background: 'rgba(74,222,128,0.12)', borderRadius: '12px',
          border: '1px solid rgba(74,222,128,0.25)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', gap: '8px',
          overflowX: 'auto',
        }}>
          <div style={{
            fontSize: '.55rem', fontWeight: 800, textTransform: 'uppercase',
            letterSpacing: '.5px', color: '#4ade80', flexShrink: 0, paddingRight: '4px',
          }}>
            +{addedCards.length}
          </div>
          {addedCards.map((c, i) => (
            <div key={i} style={{ position: 'relative', flexShrink: 0 }}>
              {c.img ? (
                <img
                  src={c.img}
                  alt={c.name}
                  title={c.name}
                  style={{
                    width: '32px', height: '44px', objectFit: 'cover',
                    borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)',
                  }}
                />
              ) : (
                <div title={c.name} style={{
                  width: '32px', height: '44px', borderRadius: '4px',
                  background: 'rgba(255,255,255,0.1)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '.55rem', color: 'rgba(255,255,255,0.7)',
                  padding: '2px', overflow: 'hidden',
                }}>{c.name.slice(0, 3)}</div>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); handleUndo(c, i) }}
                title={`Undo ${c.name}`}
                style={{
                  position: 'absolute', top: '-5px', right: '-5px',
                  width: '16px', height: '16px', borderRadius: '50%',
                  background: 'rgba(239,68,68,0.95)', color: '#fff',
                  border: '1.5px solid rgba(0,0,0,0.5)', cursor: 'pointer',
                  fontSize: '.6rem', fontWeight: 700, lineHeight: 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: 0,
                }}
              >×</button>
            </div>
          ))}
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
                <img src={smallImg} alt={displayName}
                  style={{ width: '44px', borderRadius: '6px', flexShrink: 0, boxShadow: '0 2px 8px rgba(0,0,0,0.5)' }} />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                {editingName ? (
                  <input
                    autoFocus
                    value={editValue}
                    onChange={e => setEditValue(e.target.value)}
                    onBlur={handleManualCorrect}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleManualCorrect()
                      if (e.key === 'Escape') setEditingName(false)
                    }}
                    style={{
                      width: '100%', background: 'rgba(255,255,255,0.1)',
                      border: '1.5px solid var(--accent-teal)',
                      borderRadius: '6px', padding: '5px 8px',
                      color: '#fff', fontSize: '.9rem', fontWeight: 700,
                      outline: 'none',
                    }}
                  />
                ) : (
                  <div
                    onClick={() => { setEditValue(displayName || ''); setEditingName(true) }}
                    title="Tap to correct name"
                    style={{
                      fontWeight: 700, fontSize: '.9rem', color: '#fff', lineHeight: 1.2,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      cursor: 'pointer',
                    }}
                  >
                    {displayName}
                    <span style={{ opacity: 0.4, marginLeft: 6, fontSize: '.7rem' }}>✎</span>
                  </div>
                )}
                <div style={{ fontSize: '.7rem', color: 'rgba(255,255,255,0.45)', marginTop: '2px' }}>
                  {foundCard.set_name}
                  {alreadyOwned && <span style={{ color: '#93c5fd', marginLeft: '6px' }}>Own ×{alreadyOwned.qty}</span>}
                  {sameSetVariants > 1 && (
                    <span style={{ color: '#fbbf24', marginLeft: '6px', fontWeight: 700 }}>
                      ✦ {sameSetVariants} variants
                    </span>
                  )}
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

            {/* Chips row: Normal | Foil | Flip (DFC) | #Collector | +X prints */}
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '12px' }}>
              <Chip active={priceMode === 'normal'} onClick={() => setPriceMode('normal')}>Normal</Chip>
              <Chip
                active={priceMode === 'foil'}
                onClick={() => setPriceMode('foil')}
                disabled={priceUsdFoil == null}
              >✦ Foil</Chip>
              {isDFC && (
                <Chip active={dfcFlipped} onClick={() => setDfcFlipped(f => !f)}>
                  ↻ {dfcFlipped ? 'Front' : 'Flip'}
                </Chip>
              )}
              {foundCard.collector_number && (
                <Chip>#{foundCard.collector_number}</Chip>
              )}
              {extraPrints > 0 && (
                <Chip
                  active={showPrintings}
                  onClick={() => setShowPrintings(p => !p)}
                >+{extraPrints} prints {showPrintings ? '▲' : '▼'}</Chip>
              )}
            </div>

            {/* Printings panel */}
            {showPrintings && printings.length > 0 && (
              <div style={{
                marginBottom: '12px',
                maxHeight: '220px', overflowY: 'auto',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '12px',
                background: 'rgba(255,255,255,0.04)',
              }}>
                {printings.map((p, i) => {
                  const pNormal = p.prices?.usd      ? parseFloat(p.prices.usd)      : null
                  const pFoil   = p.prices?.usd_foil ? parseFloat(p.prices.usd_foil) : null
                  const isSelected = p.id === foundCard.id
                  return (
                    <button
                      key={p.id}
                      onClick={() => {
                        setFoundCard(p)
                        setPriceMode('normal')
                        setShowPrintings(false)
                      }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '10px',
                        width: '100%', padding: '9px 12px',
                        background: isSelected ? 'rgba(245,158,11,0.1)' : 'transparent',
                        border: 'none',
                        borderBottom: i < printings.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                        cursor: 'pointer', textAlign: 'left',
                      }}
                    >
                      {/* Card thumbnail */}
                      {p.image_uris?.small
                        ? <img src={p.image_uris.small} alt={p.set_name}
                            style={{ width: '36px', borderRadius: '4px', flexShrink: 0,
                              border: isSelected ? '1.5px solid var(--accent-teal)' : '1.5px solid transparent' }} />
                        : <div style={{ width: '36px', height: '50px', borderRadius: '4px',
                            background: 'rgba(255,255,255,0.08)', flexShrink: 0 }} />
                      }
                      {/* Set info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '.76rem', fontWeight: 600, color: isSelected ? 'var(--accent-teal)' : '#fff',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {p.set_name}
                        </div>
                        <div style={{ fontSize: '.62rem', color: 'rgba(255,255,255,0.4)', marginTop: '1px' }}>
                          #{p.collector_number} · {p.set?.toUpperCase()}
                          {p.finishes?.includes('foil') && !p.finishes?.includes('nonfoil') &&
                            <span style={{ color: '#c084fc', marginLeft: '4px' }}>✦ Foil only</span>}
                        </div>
                      </div>
                      {/* Prices */}
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        {pNormal != null && (
                          <div style={{ fontSize: '.75rem', fontWeight: 700, color: 'var(--accent-teal)' }}>
                            ${pNormal.toFixed(2)}
                          </div>
                        )}
                        {pFoil != null && (
                          <div style={{ fontSize: '.65rem', color: '#c084fc' }}>
                            ✦ ${pFoil.toFixed(2)}
                          </div>
                        )}
                        {pNormal == null && pFoil == null && (
                          <div style={{ fontSize: '.65rem', color: 'rgba(255,255,255,0.3)' }}>—</div>
                        )}
                      </div>
                      {isSelected && (
                        <div style={{ fontSize: '.7rem', color: 'var(--accent-teal)', flexShrink: 0 }}>✓</div>
                      )}
                    </button>
                  )
                })}
              </div>
            )}

            {/* Action buttons — store mode vs collection mode */}
            {storeMode ? (
              <div>
                {/* Store mode label */}
                <div style={{
                  fontSize: '.68rem', fontWeight: 700, color: '#c9a84c',
                  marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '5px',
                }}>
                  <span>🏪</span> Store Mode — adds directly to shop inventory
                </div>

                {/* Condition chips */}
                <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
                  {['NM', 'LP', 'MP', 'HP'].map(c => (
                    <Chip key={c} active={listingCondition === c} onClick={() => setListingCondition(c)}>{c}</Chip>
                  ))}
                </div>

                {/* Price input */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                  <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '.8rem', flexShrink: 0 }}>Price $</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={listingPrice}
                    onChange={e => setListingPrice(e.target.value)}
                    placeholder="0.00"
                    style={{
                      flex: 1, background: 'rgba(255,255,255,0.08)',
                      border: '1px solid rgba(255,255,255,0.15)',
                      borderRadius: '8px', padding: '8px 12px',
                      color: '#fff', fontSize: '.95rem', fontWeight: 700,
                      outline: 'none',
                    }}
                  />
                </div>

                {/* Add to Store button */}
                <button
                  onClick={handleAddToStore}
                  disabled={adding}
                  style={{
                    width: '100%', background: '#c9a84c', color: '#000', border: 'none',
                    borderRadius: '12px', padding: '13px 8px',
                    fontWeight: 800, fontSize: '.88rem', cursor: adding ? 'wait' : 'pointer',
                    opacity: adding ? 0.7 : 1,
                  }}
                >{adding ? '…' : '🏪 Add to Store'}</button>
              </div>
            ) : (
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
            )}
          </div>
        ) : (
          /* Idle / scanning state */
          <div style={{ padding: '10px 16px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
            <div>
              <div style={{ fontSize: '.82rem', color: '#fff', fontWeight: 600, marginBottom: '2px' }}>
                {cameraError ? 'Camera unavailable' : 'Ready to scan'}
              </div>
              <div style={{ fontSize: '.68rem', color: 'rgba(255,255,255,0.4)' }}>
                {cameraError
                  ? cameraError
                  : membership?.isPro
                  ? 'Unlimited scans · Pro'
                  : membership?.loaded
                  ? `${membership.scansLeft ?? '?'} scans remaining today`
                  : 'Hold card steady within the frame'}
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

      {showUpgrade && (
        <UpgradeModal
          reason="scan"
          onClose={() => { setShowUpgrade(false); handleClose() }}
          setPage={(p) => { handleClose(); setPage?.(p) }}
        />
      )}
    </div>
  )
}
