// netlify/functions/compute-market-movers.js
// Fetches every competitive paper MTG card priced $0.50+ from Scryfall via
// paginated search, stores a daily price snapshot in Supabase, then computes
// the top 100 gainers/losers vs ~7 days ago and stores them in market_movers.
//
// Triggered two ways:
//   1. Daily by Netlify scheduler at 9am UTC (after update-prices at 8am)
//   2. Manually via HTTP POST from the admin panel (requires admin JWT)
//
// Required Supabase tables:
//   price_daily_snapshots (snapshot_date DATE PK, prices JSONB, card_count INT)
//   market_movers (computed_date DATE PK, gainers JSONB, losers JSONB, ref_date DATE, days_apart INT)

const { corsHeaders } = require('./_cors')

const DELAY_MS = 120 // ~8 req/s — safely under Scryfall's 10 req/s limit

function delay(ms) {
  return new Promise(r => setTimeout(r, ms))
}

// ── Scryfall pagination ────────────────────────────────────────────────────────
// Fetches every paper card with USD price >= $0.50.
// Returns a map of { [cardName]: { price: number, img: string|null } }
async function fetchAllCardPrices() {
  const priceMap = {}
  let url =
    'https://api.scryfall.com/cards/search' +
    '?q=usd%3E%3D0.5+game%3Apaper+not%3Aextra+not%3Abasic+not%3Aart_series+lang%3Aen' +
    '&order=name&unique=cards&page=1'

  let pageCount = 0

  while (url) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'VaultedSingles/1.0 (contact: mtgvaultedsingles@gmail.com)',
          Accept: 'application/json',
        },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      const data = await res.json()
      const cards = data.data || []

      for (const card of cards) {
        const price = card.prices?.usd ? parseFloat(card.prices.usd) : null
        if (price == null || price < 0.5) continue
        const img =
          card.image_uris?.small ||
          card.card_faces?.[0]?.image_uris?.small ||
          null
        // Store legalities so format filtering works in the UI
        const leg = card.legalities || {}
        const legalities = {
          standard:  leg.standard  || 'not_legal',
          pioneer:   leg.pioneer   || 'not_legal',
          modern:    leg.modern    || 'not_legal',
          legacy:    leg.legacy    || 'not_legal',
          pauper:    leg.pauper    || 'not_legal',
          premodern: leg.premodern || 'not_legal',
        }
        priceMap[card.name] = { price, img, legalities }
      }

      pageCount++
      url = data.has_more ? data.next_page : null
      if (url) await delay(DELAY_MS)
    } catch (err) {
      console.error(`[compute-market-movers] Scryfall error on page ${pageCount + 1}:`, err.message)
      break
    }
  }

  const cardCount = Object.keys(priceMap).length
  console.log(`[compute-market-movers] Fetched ${cardCount} cards across ${pageCount} pages`)
  return priceMap
}

// ── Handler ────────────────────────────────────────────────────────────────────
exports.handler = async (event) => {
  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(event) }
  }

  // Block non-POST HTTP methods (scheduler invocations have no httpMethod)
  if (event.httpMethod && event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) }
  }

  const ADMIN_EMAIL  = process.env.ADMIN_EMAIL
  const SUPABASE_URL = process.env.VITE_SUPABASE_URL
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY

  if (!SUPABASE_URL || !SERVICE_KEY || !ADMIN_EMAIL) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Server not configured' }) }
  }

  // ── Auth check (manual HTTP POST only) ──────────────────────────────────────
  if (event.httpMethod === 'POST') {
    const authHeader = (event.headers || {})['authorization'] || ''
    const userJwt    = authHeader.replace(/^Bearer\s+/i, '').trim()
    if (!userJwt) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Missing auth token' }) }
    }
    try {
      const verifyRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${userJwt}` },
      })
      if (!verifyRes.ok) throw new Error('invalid token')
      const { email } = await verifyRes.json()
      if (email !== ADMIN_EMAIL) {
        return { statusCode: 403, body: JSON.stringify({ error: 'Forbidden' }) }
      }
    } catch {
      return { statusCode: 401, body: JSON.stringify({ error: 'Invalid or expired token' }) }
    }
  }

  const adminHeaders = {
    apikey:        SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
  }

  const today = new Date().toISOString().slice(0, 10)

  // ── 1. Snapshot today's prices (skip if already done today) ─────────────────
  const existRes = await fetch(
    `${SUPABASE_URL}/rest/v1/price_daily_snapshots?snapshot_date=eq.${today}&select=snapshot_date`,
    { headers: adminHeaders }
  )
  const existRows = await existRes.json()
  const snapshotExists = Array.isArray(existRows) && existRows.length > 0

  if (!snapshotExists) {
    console.log('[compute-market-movers] Fetching all card prices from Scryfall…')
    const priceMap  = await fetchAllCardPrices()
    const cardCount = Object.keys(priceMap).length

    if (cardCount === 0) {
      return { statusCode: 503, body: JSON.stringify({ error: 'Scryfall returned no cards' }) }
    }

    const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/price_daily_snapshots`, {
      method:  'POST',
      headers: { ...adminHeaders, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body:    JSON.stringify({ snapshot_date: today, prices: priceMap, card_count: cardCount }),
    })
    if (!insertRes.ok) {
      const txt = await insertRes.text()
      console.error('[compute-market-movers] Snapshot insert failed:', txt)
      return { statusCode: 500, body: JSON.stringify({ error: 'Failed to save snapshot' }) }
    }
    console.log(`[compute-market-movers] Saved snapshot for ${today} (${cardCount} cards)`)
  } else {
    console.log(`[compute-market-movers] Snapshot for ${today} already exists — skipping fetch`)
  }

  // ── 2. Load today's snapshot ──────────────────────────────────────────────────
  const todayRes  = await fetch(
    `${SUPABASE_URL}/rest/v1/price_daily_snapshots?snapshot_date=eq.${today}&select=prices`,
    { headers: adminHeaders }
  )
  const todayRows   = await todayRes.json()
  const todayPrices = todayRows?.[0]?.prices || {}

  // ── 3. Load reference snapshot (~7 days ago, or earliest available) ──────────
  const refTarget = new Date()
  refTarget.setDate(refTarget.getDate() - 7)
  const refTargetStr = refTarget.toISOString().slice(0, 10)

  const refRes  = await fetch(
    `${SUPABASE_URL}/rest/v1/price_daily_snapshots` +
    `?snapshot_date=lte.${refTargetStr}&select=snapshot_date,prices&order=snapshot_date.desc&limit=1`,
    { headers: adminHeaders }
  )
  const refRows = await refRes.json()
  const refRow  = refRows?.[0]

  if (!refRow) {
    console.log('[compute-market-movers] No reference snapshot found — need more history')
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(event) },
      body: JSON.stringify({ message: 'Accumulating history — movers appear after day 8', today }),
    }
  }

  const refPrices     = refRow.prices || {}
  const refDateActual = refRow.snapshot_date
  const daysApart     = Math.round(
    (new Date(today) - new Date(refDateActual)) / (1000 * 60 * 60 * 24)
  )

  // ── 4. Compute gainers / losers ───────────────────────────────────────────────
  const deltas = []
  for (const [name, { price: newPrice, img }] of Object.entries(todayPrices)) {
    const ref = refPrices[name]
    if (!ref?.price) continue
    const oldPrice = ref.price
    if (Math.abs(newPrice - oldPrice) < 0.005) continue  // skip floating-point noise

    const dollarChange = Math.round((newPrice - oldPrice) * 100) / 100
    const pctChange    = Math.round(((newPrice - oldPrice) / oldPrice) * 1000) / 10

    // Noise filter: require at least $0.10 OR 5% move
    if (Math.abs(dollarChange) < 0.10 && Math.abs(pctChange) < 5) continue

    deltas.push({ name, img, oldPrice, newPrice, dollarChange, pctChange, legalities: todayPrices[name]?.legalities || null })
  }

  const gainers = deltas
    .filter(d => d.dollarChange > 0)
    .sort((a, b) => b.dollarChange - a.dollarChange)
    .slice(0, 100)

  const losers = deltas
    .filter(d => d.dollarChange < 0)
    .sort((a, b) => a.dollarChange - b.dollarChange)
    .slice(0, 100)

  // ── 5. Upsert into market_movers ──────────────────────────────────────────────
  const moversRes = await fetch(`${SUPABASE_URL}/rest/v1/market_movers`, {
    method:  'POST',
    headers: { ...adminHeaders, Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({
      computed_date: today,
      gainers,
      losers,
      ref_date:   refDateActual,
      days_apart: daysApart,
    }),
  })

  if (!moversRes.ok) {
    const txt = await moversRes.text()
    console.error('[compute-market-movers] Movers insert failed:', txt)
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to save movers' }) }
  }

  const summary = {
    today,
    ref_date:    refDateActual,
    days_apart:  daysApart,
    gainers:     gainers.length,
    losers:      losers.length,
    total_cards: Object.keys(todayPrices).length,
  }
  console.log('[compute-market-movers]', summary)
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(event) },
    body: JSON.stringify(summary),
  }
}
