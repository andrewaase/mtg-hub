// netlify/functions/compute-commander-decks-background.js
// Builds the Commander Deck EV dataset: every official paper Commander
// preconstructed deck, grouped by set, with each card's live price and the
// deck's total "sell value" if broken up and sold as singles.
//
// Decklists come from a community-maintained catalog (MTGJSON's own DeckList
// export is currently empty on this mirror) covering every officially
// released Commander precon with full contents:
// https://github.com/taw/magic-preconstructed-decks-data
//
// Card prices come from Scryfall's /cards/collection batch endpoint, looked
// up by {set, collector_number} (exactly what each deck entry provides) —
// Scryfall's usd price is itself largely sourced from TCGPlayer market data.
//
// Deliberately does NOT try to price the sealed deck itself (no reliable
// TCGplayer API access, and scraping isn't something this app does) — the
// purchase price is a plain user-entered field (commander-ev-admin.js).
//
// Triggered by the weekly Netlify schedule, or a manual admin POST.

const { corsHeaders } = require('./_cors')
const { isScheduledInvocation, verifyAdmin } = require('./_admin')

const DECKS_URL      = 'https://raw.githubusercontent.com/taw/magic-preconstructed-decks-data/master/decks_v2.json'
const FETCH_TIMEOUT  = 20000
const MAX_RETRIES    = 3
const CONCURRENCY    = 4
const MIN_GAP_MS      = 130  // shared dispatch gate — see compute-market-movers-background.js for why

let lastDispatch = 0
function delay(ms) { return new Promise(r => setTimeout(r, ms)) }
async function throttleGate() {
  const now  = Date.now()
  const wait = Math.max(0, (lastDispatch + MIN_GAP_MS) - now)
  lastDispatch = now + wait
  if (wait) await delay(wait)
}
async function fetchWithTimeout(url, opts = {}, timeoutMs = FETCH_TIMEOUT) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...opts, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

// POST a batch of {set, collector_number} identifiers to Scryfall's collection
// endpoint (max 75/request), paced + retried the same way as market movers.
async function priceBatch(identifiers) {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    await throttleGate()
    try {
      const res = await fetchWithTimeout('https://api.scryfall.com/cards/collection', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': 'ManaMint/1.0 (commander-ev)', Accept: 'application/json' },
        body:    JSON.stringify({ identifiers }),
      })
      if (res.status === 429) {
        const retryAfter = parseFloat(res.headers.get('retry-after')) || 2
        if (attempt < MAX_RETRIES) { await delay(retryAfter * 1000 + 300); continue }
        throw new Error('rate limited, retries exhausted')
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.json()
    } catch (err) {
      const msg = err.name === 'AbortError' ? 'timed out' : err.message
      if (attempt < MAX_RETRIES) { await delay(500 * (attempt + 1)); continue }
      console.error('[commander-ev] price batch failed:', msg)
      return { data: [] }
    }
  }
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders(event) }

  const scheduled = isScheduledInvocation(event)
  if (!scheduled && event.httpMethod && event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) }
  }

  const ADMIN_EMAIL  = process.env.ADMIN_EMAIL
  const SUPABASE_URL = process.env.VITE_SUPABASE_URL
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY
  if (!SUPABASE_URL || !SERVICE_KEY || !ADMIN_EMAIL) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Server not configured' }) }
  }

  if (!scheduled) {
    const admin = await verifyAdmin(SUPABASE_URL, SERVICE_KEY, ADMIN_EMAIL, (event.headers || {})['authorization'])
    if (!admin.ok) return { statusCode: admin.statusCode, headers: corsHeaders(event), body: JSON.stringify({ error: admin.error }) }
  }

  const adminHeaders = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' }
  const summary = { decksFound: 0, decksComputed: 0, cardspriced: 0, errors: [] }

  // 1. Fetch the deck catalog and keep only paper Commander preconstructed decks.
  let decks
  try {
    const res = await fetchWithTimeout(DECKS_URL, { headers: { 'User-Agent': 'ManaMint/1.0 (commander-ev)' } }, 30000)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const all = await res.json()
    decks = all.filter(d => d.type === 'Commander Deck' && Array.isArray(d.cards) && d.cards.length > 0)
  } catch (e) {
    return { statusCode: 502, headers: corsHeaders(event), body: JSON.stringify({ error: `Deck catalog fetch failed: ${e.message}` }) }
  }
  summary.decksFound = decks.length

  // 2. Collect every unique (set, number) across ALL decks and price them once —
  // basic lands and reprinted staples repeat across dozens of decks.
  const cardKey = (c) => `${c.set_code}#${c.number}`.toLowerCase()
  const uniqueCards = new Map()
  for (const deck of decks) {
    for (const c of deck.cards) uniqueCards.set(cardKey(c), { set: c.set_code, collector_number: c.number })
  }
  const identifiers = [...uniqueCards.values()]

  const priceByKey = {} // "set#number" -> { name, usd, usd_foil }
  for (let i = 0; i < identifiers.length; i += 75) {
    const batch = identifiers.slice(i, i + 75)
    const { data } = await priceBatch(batch)
    for (const c of (data || [])) {
      const k = `${c.set}#${c.collector_number}`.toLowerCase()
      priceByKey[k] = {
        name:     c.name,
        usd:      c.prices?.usd      != null ? parseFloat(c.prices.usd)      : null,
        usd_foil: c.prices?.usd_foil != null ? parseFloat(c.prices.usd_foil) : null,
      }
    }
  }
  summary.cardsPriced = Object.keys(priceByKey).length

  // 2b. ManaPool has no per-set/bulk-lookup endpoint — /prices/singles always
  // returns its entire ~100k-card catalog in one shot. Pull it once and keep
  // only the rows this deck set actually needs, so the big array can be GC'd
  // immediately rather than held onto for the rest of the run.
  const mpPriceByKey = {} // "set#number" -> { market, marketFoil } in dollars
  // TEMP diagnostics — this whole block's outcome gets written to a
  // queryable sentinel row below so a failure is visible without Netlify
  // function-log access. Remove once ManaPool pricing is confirmed working.
  const mpDebug = { attempted: true, ok: false, httpStatus: null, rawRows: 0, matchedRows: 0, error: null, ms: 0 }
  const mpStart = Date.now()
  try {
    const res = await fetchWithTimeout('https://manapool.com/api/v1/prices/singles', {
      headers: { 'User-Agent': 'ManaMint/1.0 (commander-ev)', Accept: 'application/json' },
    }, 120000)
    mpDebug.httpStatus = res.status
    if (res.ok) {
      const { data } = await res.json()
      mpDebug.rawRows = (data || []).length
      for (const c of (data || [])) {
        const k = `${c.set_code}#${c.number}`.toLowerCase()
        if (!uniqueCards.has(k)) continue
        const market     = c.price_market      != null ? c.price_market      / 100 : (c.price_cents      != null ? c.price_cents      / 100 : null)
        const marketFoil = c.price_market_foil != null ? c.price_market_foil / 100 : (c.price_cents_foil != null ? c.price_cents_foil / 100 : null)
        mpPriceByKey[k] = { market, marketFoil }
      }
      mpDebug.matchedRows = Object.keys(mpPriceByKey).length
      mpDebug.ok = true
    } else {
      summary.errors.push(`ManaPool prices fetch: HTTP ${res.status}`)
    }
  } catch (e) {
    mpDebug.error = `${e.name}: ${e.message}`
    summary.errors.push(`ManaPool prices fetch: ${e.message}`)
  }
  mpDebug.ms = Date.now() - mpStart

  // 3. Build each deck's card list + sell value (both platforms), and upsert.
  const rows = []
  for (const deck of decks) {
    let sellValue = 0
    let sellValueMp = 0
    const cardRows = []
    for (const c of deck.cards) {
      const p  = priceByKey[cardKey(c)]
      const mp = mpPriceByKey[cardKey(c)]
      const price   = p  ? (c.foil ? (p.usd_foil ?? p.usd ?? 0) : (p.usd ?? 0)) : 0
      const mpPrice = mp ? (c.foil ? (mp.marketFoil ?? mp.market ?? 0) : (mp.market ?? 0)) : 0
      sellValue   += price * (c.count || 1)
      sellValueMp += mpPrice * (c.count || 1)
      cardRows.push({
        name: c.name, count: c.count || 1, foil: !!c.foil,
        set: c.set_code, number: c.number,
        price: Math.round(price * 100) / 100,
        mpPrice: Math.round(mpPrice * 100) / 100,
      })
    }
    cardRows.sort((a, b) => (b.price * b.count) - (a.price * a.count))

    rows.push({
      set_code:         deck.set_code,
      set_name:         deck.set_name || deck.set_code,
      released_at:      deck.release_date || null,
      deck_name:        deck.name,
      commander_names:  (deck.commander || []).map(c => c.name).join(' / ') || null,
      card_count:        deck.cards.reduce((s, c) => s + (c.count || 1), 0),
      sell_value:        Math.round(sellValue * 100) / 100,
      sell_value_mp:     Math.round(sellValueMp * 100) / 100,
      cards:             cardRows,
      computed_at:       new Date().toISOString(),
    })
  }

  // TEMP diagnostics sentinel row — queryable via the public read policy
  // without needing Netlify function-log access. Remove alongside mpDebug above.
  rows.push({
    set_code: '_debug', set_name: '_debug', deck_name: '_diagnostics',
    card_count: 0, sell_value: 0, sell_value_mp: 0,
    cards: { mpDebug, uniqueCardCount: uniqueCards.size, decksFound: summary.decksFound },
    computed_at: new Date().toISOString(),
  })

  try {
    for (let i = 0; i < rows.length; i += 100) {
      const res = await fetchWithTimeout(`${SUPABASE_URL}/rest/v1/commander_deck_ev?on_conflict=set_code,deck_name`, {
        method:  'POST',
        headers: { ...adminHeaders, Prefer: 'resolution=merge-duplicates,return=minimal' },
        body:    JSON.stringify(rows.slice(i, i + 100)),
      }, 20000)
      if (!res.ok) { summary.errors.push(`upsert batch ${i}: ${await res.text()}`); continue }
      summary.decksComputed += rows.slice(i, i + 100).length
    }
  } catch (e) {
    summary.errors.push(e.message)
  }

  console.log('[commander-ev]', summary)
  return { statusCode: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders(event) }, body: JSON.stringify(summary) }
}
