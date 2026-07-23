import { useRef, useState, useEffect } from 'react'
import { addCard, upsertStoreListing, updateCollectionCard, removeCard } from '../lib/db'
import { supabase } from '../lib/supabase'
import { CONDITIONS, LANGUAGES } from '../lib/utils'
import UpgradeModal from '../components/UpgradeModal'

const RAPID_DELAY_MS = 1000  // pause before auto-adding in Rapid Mode

// The scan guide is a user-adjustable crop rectangle stored as fractions of the
// on-screen camera preview. It is BOTH what the user frames AND the exact region
// cropped for OCR — so what you box is what gets scanned (no hidden offset).
const DEFAULT_GUIDE = { x: 0.13, y: 0.05, w: 0.74, h: 0.6 }
const GUIDE_LS_KEY  = 'mtg-scan-guide-v1'
const MIN_GUIDE     = 0.15  // smallest guide side, as a fraction of the preview

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

// 
// Image helpers
// 

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
function captureCardCanvas(video, guide) {
  const vw = video.videoWidth, vh = video.videoHeight
  // Map the guide (fractions of the on-screen preview) to source pixels in the
  // video. The preview uses object-fit: cover, so the video is scaled to fill the
  // preview box and the overflow is cropped evenly on the long axis.
  const rect = video.getBoundingClientRect()
  const cw = rect.width  || vw
  const ch = rect.height || vh
  const scale = Math.max(cw / vw, ch / vh)
  const offX  = (vw * scale - cw) / 2
  const offY  = (vh * scale - ch) / 2

  const sx = ((guide.x * cw) + offX) / scale
  const sy = ((guide.y * ch) + offY) / scale
  const sw = (guide.w * cw) / scale
  const sh = (guide.h * ch) / scale

  // Source strips within the guide: title band up top, set/collector band bottom.
  const sxi        = Math.max(0, Math.floor(sx))
  const swi        = Math.max(1, Math.floor(sw))
  const titleSrcY  = Math.max(0, Math.floor(sy))
  const titleSrcH  = Math.max(1, Math.floor(sh * TITLE_STRIP_FRAC))
  const bottomSrcY = Math.floor(sy + sh * (1 - BOTTOM_STRIP_FRAC))
  const bottomSrcH = Math.max(1, Math.floor(sh * BOTTOM_STRIP_FRAC))

  // Destination dims (scale so width ≤ STRIP_TARGET_W)
  const outScale   = Math.min(1, STRIP_TARGET_W / swi)
  const outW       = Math.max(1, Math.floor(swi * outScale))
  const outTitleH  = Math.max(1, Math.floor(titleSrcH * outScale))
  const outBottomH = Math.max(1, Math.floor(bottomSrcH * outScale))
  const gap        = 8

  const c = document.createElement('canvas')
  c.width  = outW
  c.height = outTitleH + gap + outBottomH
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, c.width, c.height)
  ctx.drawImage(video, sxi, titleSrcY,  swi, titleSrcH,  0, 0,               outW, outTitleH)
  ctx.drawImage(video, sxi, bottomSrcY, swi, bottomSrcH, 0, outTitleH + gap, outW, outBottomH)
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

// 
// Scryfall lookup
// 

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
  // This is the key fallback for special treatments where the collector number is off.
  // include:multilingual so foreign printings (e.g. Japanese Mystical Archive) match too.
  if (setCode) {
    try {
      const q = `!"${name}" set:${setCode} include:multilingual`
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
              const diff     = Math.abs(parseInt(c.collector_number, 10) - target)
              const bestDiff = Math.abs(parseInt(best.collector_number, 10) - target)
              if (diff !== bestDiff) return diff < bestDiff ? c : best
              // Tie on collector number (e.g. EN printing + its translations):
              // prefer English, then a printing that actually has a USD price.
              if (c.lang === 'en' && best.lang !== 'en') return c
              if (c.lang === best.lang && c.prices?.usd && !best.prices?.usd) return c
              return best
            })
            return cacheAndReturn(closest, 'exact')
          }
          // Single-result fallback: prefer the English printing if present
          const en = json.data.find(c => c.lang === 'en')
          return cacheAndReturn(en || json.data[0], 'exact')
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

// 
// Chip component
// 

function Chip({ children, active, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '5px 12px', borderRadius: '99px',
        border: `1.5px solid ${active ? 'var(--accent-teal)' : 'rgba(255,255,255,0.15)'}`,
        background: active ? 'rgba(30,196,166,0.18)' : 'rgba(255,255,255,0.06)',
        color: active ? 'var(--accent-teal)' : 'rgba(255,255,255,0.7)',
        fontSize: '.75rem', fontWeight: active ? 700 : 400,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.35 : 1,
        transition: 'all .15s', whiteSpace: 'nowrap',
      }}
    >{children}</button>
  )
}

// 
// Component
// 

export default function CameraModal({
  onClose, showToast, user, isAdmin, collection, setCollection, openAddCard, setPage, membership
}) {
  const scanningRef         = useRef(false)
  const frozenRef           = useRef(false)
  const prevThumbRef        = useRef(null)
  const stableRef           = useRef(0)
  const unknownCountRef     = useRef(0)    // consecutive "unknown" responses
  const lastScanNameRef     = useRef('')   // last OCR name (for consensus matching)
  const consecutiveMatchRef = useRef(0)    // how many consecutive scans agree on the name
  const pendingLookupRef    = useRef(null) // { name, promise } — Scryfall started on first match
  const lastScanTimeRef     = useRef(0)    // timestamp of last scan start (cooldown gate)

  const MAX_UNKNOWN      = 2
  const STABLE_NEEDED    = 2
  const CONSENSUS_NEEDED = 2    // consecutive matching OCR reads before showing a card
  const SCAN_COOLDOWN_MS = 750  // minimum ms between scan attempts
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
  const [verifyingName,  setVerifyingName]  = useState('')   // first-scan name, awaiting consensus

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
  const [listingPrice,     setListingPrice]     = useState('')

  // Per-card attributes for the scan — apply to the collection add and, in
  // store mode, the listing too. They stay put between scans (a batch is
  // usually the same condition/language).
  const [scanQty,       setScanQty]       = useState(1)
  const [scanCondition, setScanCondition] = useState('NM')
  const [scanLanguage,  setScanLanguage]  = useState('EN')

  // User-adjustable scan guide (persisted). guideRef mirrors it so the scan loop
  // always reads the current rect without re-subscribing. adjustingRef pauses
  // scanning while the guide is being dragged/resized.
  const [guide, setGuide] = useState(() => {
    try { const s = JSON.parse(localStorage.getItem(GUIDE_LS_KEY)); if (s && s.w && s.h) return s } catch {}
    return DEFAULT_GUIDE
  })
  const guideRef    = useRef(guide)
  const adjustingRef = useRef(false)
  const dragRef     = useRef(null)
  useEffect(() => {
    guideRef.current = guide
    try { localStorage.setItem(GUIDE_LS_KEY, JSON.stringify(guide)) } catch {}
  }, [guide])

  // Last identified card — lets the user reload it to pick another variant
  // (foil / showcase / base) without rescanning.
  const [lastCard,      setLastCard]      = useState(null)
  const [lastPrintings, setLastPrintings] = useState([])

  //  Camera 
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

  // Option B: Pre-warm the Netlify function as soon as the camera is live so the
  // Lambda container is hot by the time the first real scan fires.
  useEffect(() => {
    if (!cameraReady) return
    fetch('/.netlify/functions/scan-card', { method: 'GET' }).catch(() => {})
  }, [cameraReady])

  const stopTracks = () => streamRef.current?.getTracks().forEach(t => t.stop())

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0]
    if (!track) return
    const next = !torchOn
    try { await track.applyConstraints({ advanced: [{ torch: next }] }); setTorchOn(next) }
    catch (e) { console.warn('[Scanner] torch toggle failed:', e) }
  }

  //  Sync listing price when card or foil mode changes 
  useEffect(() => {
    if (!foundCard) { setListingPrice(''); return }
    const pUsd     = foundCard.prices?.usd      ? parseFloat(foundCard.prices.usd)      : null
    const pUsdFoil = foundCard.prices?.usd_foil ? parseFloat(foundCard.prices.usd_foil) : null
    const p = priceMode === 'foil' && pUsdFoil != null ? pUsdFoil : pUsd
    setListingPrice(p != null ? p.toFixed(2) : '')
  }, [foundCard, priceMode])

  //  Stability trigger 
  useEffect(() => {
    if (!cameraReady) return
    const id = setInterval(stabilityCheck, 300)
    return () => clearInterval(id)
  }, [cameraReady]) // eslint-disable-line react-hooks/exhaustive-deps

  function stabilityCheck() {
    if (frozenRef.current || adjustingRef.current) return
    const video = videoRef.current
    if (!video?.videoWidth) return
    const curr = thumbCanvas(video)
    if (prevThumbRef.current) {
      if (frameDiff(curr, prevThumbRef.current) < 12) {
        stableRef.current++
        // Option E: scan continuously — fire once per cooldown window while the
        // frame is stable, without waiting for the user to press anything.
        const now = Date.now()
        if (stableRef.current >= STABLE_NEEDED && !scanningRef.current &&
            now - lastScanTimeRef.current >= SCAN_COOLDOWN_MS) {
          lastScanTimeRef.current = now
          scanFrame()
        }
      } else {
        // Card moved — reset stability and clear in-progress consensus so a
        // fresh card doesn't inherit votes from the previous one.
        stableRef.current = 0
        lastScanNameRef.current = ''
        consecutiveMatchRef.current = 0
        pendingLookupRef.current = null
      }
    }
    prevThumbRef.current = curr
  }

  //  Core scan — Option E (continuous) + Option B (parallel Scryfall)
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
      const canvas = captureCardCanvas(video, guideRef.current)
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
        setLookupFailed(false)
        const nameLower = cleanName.toLowerCase()

        if (nameLower === lastScanNameRef.current) {
          // Same name as last scan — increment consensus counter
          consecutiveMatchRef.current++
        } else {
          // New name seen — reset consensus and immediately kick off Scryfall
          // in the background (Option B). By the time the next scan confirms
          // the same name, the lookup is already in-flight or complete.
          lastScanNameRef.current = nameLower
          consecutiveMatchRef.current = 1
          const lookupPromise = lookupCard(cleanName, setCode, collectorNumber)
          pendingLookupRef.current = { name: nameLower, promise: lookupPromise }
          setVerifyingName(cleanName)
        }

        if (consecutiveMatchRef.current >= CONSENSUS_NEEDED) {
          // Consensus reached — lock in the card
          frozenRef.current = true
          stableRef.current = 0
          setNameRead(cleanName)
          setVerifyingName('')
          setLookingUp(true)

          // Use the already-in-flight Scryfall promise when names match, otherwise
          // fire a fresh lookup (e.g. if pendingLookupRef was cleared by frame movement).
          let card = null
          try {
            const pending = pendingLookupRef.current
            if (pending && pending.name === nameLower) {
              const { card: c } = await pending.promise
              card = c
            } else {
              const { card: c } = await lookupCard(cleanName, setCode, collectorNumber)
              card = c
            }
          } catch { card = null }

          setLookingUp(false)

          if (card) {
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
            // Lookup failed even after consensus — unfreeze so the user can try again
            frozenRef.current = false
            setLookupFailed(true)
          }
        }
        // Else: consensus not yet reached — don't freeze; the stability loop
        // will fire another scan automatically after SCAN_COOLDOWN_MS.

      } else {
        // Claude couldn't read a name — count it. After MAX_UNKNOWN consecutive
        // failures, freeze so we stop burning API calls and prompt the user.
        unknownCountRef.current++
        lastScanNameRef.current = ''
        consecutiveMatchRef.current = 0
        pendingLookupRef.current = null
        if (unknownCountRef.current >= MAX_UNKNOWN) {
          frozenRef.current = true
          setNameRead('')
          setVerifyingName('')
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

  //  Add to collection 
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

      const addQty = parseInt(scanQty, 10) || 1
      const card = {
        name:         snap.name,
        qty:          addQty,
        condition:    scanCondition,
        language:     scanLanguage,
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
          const next = [...prev]; next[i] = { ...next[i], qty: next[i].qty + addQty }; return next
        }
        return [...prev, saved || { ...card, id: Date.now() }]
      })

      // If "Add & List" and user is admin, upsert a store listing
      if (options.forSale && isAdmin) {
        const { merged } = await upsertStoreListing({
          name:        snap.name,
          set_name:    snap.set_name || null,
          condition:   scanCondition,
          is_foil:     isFoil,
          price:       cardPrice ?? 0,
          img_url:     snap.image_uris?.normal || snap.card_faces?.[0]?.image_uris?.normal || null,
          scryfall_id: snap.id || null,
          qty:         addQty,
        })
        showToast(merged ? `✓ Added & stocked +${addQty} ${snap.name}` : `✓ Added & listed ${addQty > 1 ? `${addQty}× ` : ''}${snap.name}`)
      } else {
        showToast(`✓ Added ${addQty > 1 ? `${addQty}× ` : ''}${snap.name}`)
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

  //  Undo a recent add 
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

  //  Manual name correction (re-lookup with a corrected name) 
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

  //  Add to store inventory (admin only) 
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
        condition:   scanCondition,
        is_foil:     isFoil,
        price,
        img_url:     snap.image_uris?.normal || snap.card_faces?.[0]?.image_uris?.normal || null,
        scryfall_id: snap.id || null,
        qty:         parseInt(scanQty, 10) || 1,
      })
      setAddedCards(prev => [
        ...prev,
        {
          name:         snap.name,
          img:          snap.image_uris?.small || snap.card_faces?.[0]?.image_uris?.small || null,
          collectionId: null, // store-only listing, no collection row to undo against
          qtyBefore:    0,
        },
      ].slice(-5))
      showToast(merged ? ` +1 stock: ${snap.name}` : ` Listed ${snap.name}`)
      if (navigator.vibrate) navigator.vibrate([40, 20, 80])
      doRescan()
    } catch (err) {
      console.error('[Scanner] store insert failed:', err)
      showToast('Could not list card — try again')
    }
    setAdding(false)
  }

  function doRescan() {
    // Remember what we just had so "Reload last card" can bring it back.
    if (foundCard) { setLastCard(foundCard); setLastPrintings(printings) }
    frozenRef.current = false
    stableRef.current = 0
    prevThumbRef.current = null
    unknownCountRef.current = 0
    lastScanNameRef.current = ''
    consecutiveMatchRef.current = 0
    pendingLookupRef.current = null
    lastScanTimeRef.current = 0
    setFoundCard(null)
    setNameRead('')
    setVerifyingName('')
    setLookingUp(false)
    setLookupFailed(false)
    setPrintings([])
    setShowPrintings(false)
    setScanQty(1) // reset qty each scan; condition/language persist across a batch
    setListingPrice('')
    setEditingName(false)
    setDfcFlipped(false)
    setRapidCountdown(0)
    if (rapidTimerRef.current) { clearInterval(rapidTimerRef.current); rapidTimerRef.current = null }
  }

  //  Reload the last identified card (to grab another variant without rescanning)
  function reloadLastCard() {
    if (!lastCard) return
    frozenRef.current = true          // pause auto-scan so it doesn't override
    setFoundCard(lastCard)
    setPrintings(lastPrintings)
    setShowPrintings(lastPrintings.length > 1)
    setPriceMode('normal')
    setScanError(null)
    setLookupFailed(false)
  }

  //  Scan-guide drag / resize (move whole box or pull a corner)
  function onGuideDown(mode, e) {
    e.preventDefault(); e.stopPropagation()
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch {}
    const r = videoRef.current?.getBoundingClientRect()
    if (!r) return
    adjustingRef.current = true
    dragRef.current = { mode, startX: e.clientX, startY: e.clientY, w: r.width, h: r.height, guide: { ...guide } }
  }
  function onGuideMove(e) {
    const s = dragRef.current
    if (!s) return
    const dx = (e.clientX - s.startX) / s.w
    const dy = (e.clientY - s.startY) / s.h
    let { x, y, w, h } = s.guide
    if (s.mode === 'move') {
      x = Math.max(0, Math.min(1 - w, x + dx))
      y = Math.max(0, Math.min(1 - h, y + dy))
    } else {
      if (s.mode.includes('e')) w = Math.max(MIN_GUIDE, Math.min(1 - x, w + dx))
      if (s.mode.includes('s')) h = Math.max(MIN_GUIDE, Math.min(1 - y, h + dy))
      if (s.mode.includes('w')) { const nx = Math.max(0, Math.min(x + w - MIN_GUIDE, x + dx)); w += x - nx; x = nx }
      if (s.mode.includes('n')) { const ny = Math.max(0, Math.min(y + h - MIN_GUIDE, y + dy)); h += y - ny; y = ny }
    }
    setGuide({ x, y, w, h })
  }
  function onGuideUp(e) {
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch {}
    dragRef.current = null
    adjustingRef.current = false
  }

  //  Rapid Mode auto-add 
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

  //  Derived 
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

  //  Render 
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: '#000', overflow: 'hidden' }}>

      {/*  Live camera — always visible  */}
      <video
        ref={videoRef}
        autoPlay playsInline muted
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
      />

      {/*  Dark gradient at bottom for sheet readability  */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: '65%',
        background: 'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.55) 40%, rgba(0,0,0,0.9) 100%)',
        pointerEvents: 'none',
      }} />

      {/*  Top bar: close + torch  */}
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

        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>

          {/* Rapid Mode — auto-adds after each confirmed scan */}
          <button
            onClick={() => setRapidMode(r => !r)}
            style={{
              background: rapidMode ? 'rgba(74,222,128,0.9)' : 'rgba(0,0,0,0.55)',
              border: `1.5px solid ${rapidMode ? '#4ade80' : 'rgba(255,255,255,0.18)'}`,
              borderRadius: '20px', padding: '6px 11px',
              display: 'flex', alignItems: 'center', gap: '5px',
              cursor: 'pointer', backdropFilter: 'blur(10px)',
              color: rapidMode ? '#000' : '#fff',
            }}
          >
            {/* Lightning bolt */}
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
            </svg>
            <span style={{ fontSize: '.68rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
              {rapidMode ? 'Rapid ON' : 'Rapid'}
            </span>
          </button>

          {/* Torch / Flashlight */}
          {torchSupported && (
            <button onClick={toggleTorch} style={{
              background: torchOn ? 'rgba(255,220,50,0.9)' : 'rgba(0,0,0,0.55)',
              border: `1.5px solid ${torchOn ? '#3dd6ba' : 'rgba(255,255,255,0.18)'}`,
              borderRadius: '20px', padding: '6px 11px',
              display: 'flex', alignItems: 'center', gap: '5px',
              cursor: 'pointer', backdropFilter: 'blur(10px)',
              color: torchOn ? '#000' : '#fff',
            }}>
              {/* Lightbulb */}
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21h6M12 3a6 6 0 016 6c0 2.5-1.5 4.5-3 6v1H9v-1c-1.5-1.5-3-3.5-3-6a6 6 0 016-6z"/>
              </svg>
              <span style={{ fontSize: '.68rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
                {torchOn ? 'Flash ON' : 'Flash'}
              </span>
            </button>
          )}

          {/* Store Mode (admin only) — scans go to shop inventory */}
          {isAdmin && (
            <button
              onClick={() => setStoreMode(p => !p)}
              style={{
                background: storeMode ? 'rgba(30,196,166,0.9)' : 'rgba(0,0,0,0.55)',
                border: `1.5px solid ${storeMode ? '#16a389' : 'rgba(255,255,255,0.18)'}`,
                borderRadius: '20px', padding: '6px 11px',
                display: 'flex', alignItems: 'center', gap: '5px',
                cursor: 'pointer', backdropFilter: 'blur(10px)',
                color: storeMode ? '#000' : '#fff',
              }}
            >
              {/* Price tag */}
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/>
                <circle cx="7" cy="7" r="1" fill="currentColor"/>
              </svg>
              <span style={{ fontSize: '.68rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
                {storeMode ? 'Store ON' : 'Store'}
              </span>
            </button>
          )}

        </div>
      </div>

      {/*  Camera error  */}
      {cameraError && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: '12px',
        }}>
          <div style={{ fontSize: '3rem' }}></div>
          <p style={{ color: 'rgba(255,255,255,0.7)', margin: 0, textAlign: 'center', padding: '0 32px' }}>{cameraError}</p>
        </div>
      )}

      {/*  Scan function error (API key missing, server error, etc.)  */}
      {scanError && !foundCard && (
        <div style={{
          position: 'absolute', top: '60px', left: '16px', right: '16px',
          background: 'rgba(239,68,68,0.9)', borderRadius: '10px',
          padding: '10px 14px', backdropFilter: 'blur(8px)', zIndex: 10,
          display: 'flex', alignItems: 'center', gap: '8px',
        }}>
          <span style={{ fontSize: '1rem' }}></span>
          <span style={{ fontSize: '.75rem', color: '#fff', fontWeight: 600 }}>{scanError}</span>
          <button
            onClick={() => setScanError(null)}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', fontSize: '.9rem' }}
          >✕</button>
        </div>
      )}

      {/*  Adjustable scan guide (no card yet) — drag to move, pull corners to resize.
           This exact box is what gets cropped for OCR.  */}
      {!foundCard && !cameraError && (
        <>
          <div
            onPointerDown={e => onGuideDown('move', e)}
            onPointerMove={onGuideMove}
            onPointerUp={onGuideUp}
            style={{
              position: 'absolute',
              left: `${guide.x * 100}%`, top: `${guide.y * 100}%`,
              width: `${guide.w * 100}%`, height: `${guide.h * 100}%`,
              border: '2px dashed rgba(255,255,255,0.85)', borderRadius: '8px',
              boxSizing: 'border-box', cursor: 'move', touchAction: 'none', zIndex: 6,
            }}
          >
            {/* Corner resize handles */}
            {['nw', 'ne', 'sw', 'se'].map(corner => {
              const pos = {
                top:    corner[0] === 'n' ? -12 : undefined,
                bottom: corner[0] === 's' ? -12 : undefined,
                left:   corner[1] === 'w' ? -12 : undefined,
                right:  corner[1] === 'e' ? -12 : undefined,
              }
              return (
                <div
                  key={corner}
                  onPointerDown={e => onGuideDown(corner, e)}
                  onPointerMove={onGuideMove}
                  onPointerUp={onGuideUp}
                  style={{
                    position: 'absolute', width: 26, height: 26, ...pos,
                    background: 'rgba(255,255,255,0.95)', border: '2px solid #16a389',
                    borderRadius: '50%', touchAction: 'none', cursor: `${corner}-resize`,
                    boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
                  }}
                />
              )
            })}
          </div>
          {/* Hint + reset, just below the guide */}
          <div style={{
            position: 'absolute', left: 0, right: 0,
            top: `calc(${(guide.y + guide.h) * 100}% + 10px)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, zIndex: 6,
            pointerEvents: 'none',
          }}>
            <span style={{ fontSize: '.68rem', color: 'rgba(255,255,255,0.65)' }}>Drag to move · pull corners to resize</span>
            <button
              onClick={() => setGuide(DEFAULT_GUIDE)}
              style={{
                pointerEvents: 'auto', background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: 8, color: 'rgba(255,255,255,0.8)', fontSize: '.66rem', fontWeight: 600,
                padding: '3px 8px', cursor: 'pointer',
              }}
            >Reset</button>
          </div>
        </>
      )}

      {/*  Card art overlay on camera (when identified)  */}
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
              boxShadow: '0 8px 40px rgba(0,0,0,0.8), 0 0 0 1px rgba(30,196,166,0.3)',
              filter: 'drop-shadow(0 0 24px rgba(30,196,166,0.25))',
              animation: 'scanCardIn .25s ease-out',
            }}
          />
        </div>
      )}

      {/*  Rapid Mode countdown bar (visible during auto-add)  */}
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
          <span> Auto-adding in {(rapidCountdown / 1000).toFixed(1)}s</span>
          <span style={{ opacity: .65, fontSize: '.65rem' }}>· tap to cancel</span>
        </div>
      )}

      {/*  Scanning indicator  */}
      {scanStatus === 'scanning' && !foundCard && (
        <div style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
          background: 'rgba(0,0,0,0.72)', color: '#1ec4a6',
          padding: '6px 18px', borderRadius: '20px', fontSize: '0.75rem',
          whiteSpace: 'nowrap', backdropFilter: 'blur(8px)',
        }}> Reading card…</div>
      )}

      {/*  Verifying indicator — name seen once, waiting for consensus confirmation  */}
      {verifyingName && !foundCard && !lookingUp && scanStatus !== 'scanning' && (
        <div style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
          background: 'rgba(0,0,0,0.78)', borderRadius: '20px',
          padding: '8px 20px', backdropFilter: 'blur(8px)', textAlign: 'center',
          pointerEvents: 'none',
        }}>
          <div style={{ fontSize: '.74rem', color: '#1ec4a6', fontWeight: 700 }}>"{verifyingName}"</div>
          <div style={{ fontSize: '.6rem', color: 'rgba(255,255,255,0.45)', marginTop: '3px' }}>Hold steady…</div>
        </div>
      )}

      {/*  "Tap to scan again" hint  */}
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
          <span style={{ fontSize: '.65rem' }}></span>
          <span style={{ fontSize: '.72rem', color: 'rgba(255,255,255,0.75)' }}>Tap to scan again</span>
        </div>
      )}

      {/*  Looking up indicator (name found, fetching Scryfall)  */}
      {lookingUp && !foundCard && (
        <div style={{
          position: 'absolute', bottom: '200px', left: '50%', transform: 'translateX(-50%)',
          display: 'flex', alignItems: 'center', gap: '8px',
          background: 'rgba(0,0,0,0.7)', borderRadius: '20px',
          padding: '6px 16px', backdropFilter: 'blur(8px)',
        }}>
          <span style={{ fontSize: '.68rem', color: 'var(--accent-teal)' }}></span>
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

      {/*  Recent scans strip (thumbnails with per-card undo)  */}
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

      {/*  Bottom sheet  */}
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
                    <span style={{ opacity: 0.4, marginLeft: 6, fontSize: '.7rem' }}></span>
                  </div>
                )}
                <div style={{ fontSize: '.7rem', color: 'rgba(255,255,255,0.45)', marginTop: '2px' }}>
                  {foundCard.set_name}
                  {alreadyOwned && <span style={{ color: '#93c5fd', marginLeft: '6px' }}>Own ×{alreadyOwned.qty}</span>}
                  {sameSetVariants > 1 && (
                    <span style={{ color: '#3dd6ba', marginLeft: '6px', fontWeight: 700 }}>
                       {sameSetVariants} variants
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
              > Foil</Chip>
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

            {/* Qty / Condition / Language — apply to this add (and the listing in store mode) */}
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '12px' }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: '2px',
                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)',
                borderRadius: '999px', padding: '2px 4px',
              }}>
                <button
                  type="button" aria-label="Decrease quantity"
                  onClick={() => setScanQty(q => Math.max(1, (parseInt(q, 10) || 1) - 1))}
                  style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.75)', cursor: 'pointer', fontSize: '1rem', lineHeight: 1, width: 22, height: 22 }}
                >−</button>
                <span style={{ minWidth: 26, textAlign: 'center', color: '#fff', fontSize: '.75rem', fontWeight: 800 }}>×{parseInt(scanQty, 10) || 1}</span>
                <button
                  type="button" aria-label="Increase quantity"
                  onClick={() => setScanQty(q => (parseInt(q, 10) || 1) + 1)}
                  style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.75)', cursor: 'pointer', fontSize: '1rem', lineHeight: 1, width: 22, height: 22 }}
                >+</button>
              </div>
              <select
                value={scanCondition} onChange={e => setScanCondition(e.target.value)} aria-label="Condition"
                style={{
                  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)',
                  borderRadius: '999px', color: '#fff', fontSize: '.72rem', fontWeight: 700,
                  padding: '5px 8px', cursor: 'pointer', outline: 'none',
                }}
              >
                {CONDITIONS.map(c => <option key={c} value={c} style={{ color: '#000' }}>{c}</option>)}
              </select>
              <select
                value={scanLanguage} onChange={e => setScanLanguage(e.target.value)} aria-label="Language"
                style={{
                  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)',
                  borderRadius: '999px', color: '#fff', fontSize: '.72rem', fontWeight: 700,
                  padding: '5px 8px', cursor: 'pointer', outline: 'none',
                }}
              >
                {LANGUAGES.map(l => <option key={l.code} value={l.code} style={{ color: '#000' }}>{l.code}</option>)}
              </select>
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
                        background: isSelected ? 'rgba(30,196,166,0.1)' : 'transparent',
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
                            <span style={{ color: '#c084fc', marginLeft: '4px' }}> Foil only</span>}
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
                             ${pFoil.toFixed(2)}
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
                  fontSize: '.68rem', fontWeight: 700, color: '#16a389',
                  marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '5px',
                }}>
                  <span></span> Store Mode — adds directly to shop inventory
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
                    width: '100%', background: '#16a389', color: '#000', border: 'none',
                    borderRadius: '12px', padding: '13px 8px',
                    fontWeight: 800, fontSize: '.88rem', cursor: adding ? 'wait' : 'pointer',
                    opacity: adding ? 0.7 : 1,
                  }}
                >{adding ? '…' : ' Add to Store'}</button>
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
                    flex: 1, background: 'rgba(30,196,166,0.12)', color: 'var(--accent-teal)',
                    border: '1px solid rgba(30,196,166,0.3)',
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
            <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
              {lastCard && (
                <button
                  onClick={reloadLastCard}
                  title="Bring back the last card to pick another variant"
                  style={{
                    background: 'rgba(30,196,166,0.15)', border: '1px solid rgba(30,196,166,0.4)',
                    borderRadius: '10px', padding: '9px 14px',
                    color: '#5eead4', cursor: 'pointer', fontSize: '.82rem', fontWeight: 700,
                    display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap',
                  }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.27"/></svg>
                  Reload last
                </button>
              )}
              <button
                onClick={handleClose}
                style={{
                  background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: '10px', padding: '9px 20px',
                  color: '#fff', cursor: 'pointer', fontSize: '.84rem', fontWeight: 600,
                }}
              >Done</button>
            </div>
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
