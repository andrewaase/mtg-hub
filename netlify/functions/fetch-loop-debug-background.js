// netlify/functions/fetch-loop-debug-background.js
// TEMPORARY: runs the exact same paginated Scryfall fetch loop as
// compute-market-movers-background (read-only), timing it and writing the
// result to an isolated debug row (snapshot_date '1999-03-03', never read by
// the real app) so we can see whether the full loop actually completes.
// Delete after diagnosis.
const { corsHeaders } = require('./_cors')

const DELAY_MS = 120

async function fetchAllCardPrices(log) {
  const priceMap = {}
  let url =
    'https://api.scryfall.com/cards/search' +
    '?q=game%3Apaper+not%3Aextra+not%3Abasic+not%3Aart_series+lang%3Aen' +
    '+-frame%3Ashowcase+-frame%3Aextendedart+-border%3Aborderless+-is%3Apromo+-is%3Aoversized' +
    '&order=usd&dir=asc&unique=cards&page=1'
  let pageCount = 0
  const errors = []

  while (url) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'VaultedSingles/1.0 (contact: mtgvaultedsingles@gmail.com)', Accept: 'application/json' },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const cards = data.data || []
      for (const card of cards) {
        const price = card.prices?.usd ? parseFloat(card.prices.usd) : null
        if (price == null || price < 0.5) continue
        if (priceMap[card.name] && priceMap[card.name].price <= price) continue
        priceMap[card.name] = { price }
      }
      pageCount++
      if (pageCount % 20 === 0) log.push({ t: Date.now(), pageCount, mapSize: Object.keys(priceMap).length })
      url = data.has_more ? data.next_page : null
      if (url) await new Promise(r => setTimeout(r, DELAY_MS))
    } catch (err) {
      errors.push(`page ${pageCount + 1}: ${err.message}`)
      break
    }
  }
  return { priceMap, pageCount, errors }
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders(event) }

  const SUPABASE_URL = process.env.VITE_SUPABASE_URL
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY
  const startedAt = Date.now()
  const log = []
  let result = { ok: false }

  try {
    const { priceMap, pageCount, errors } = await fetchAllCardPrices(log)
    result = {
      ok: true,
      pageCount,
      cardCount: Object.keys(priceMap).length,
      errors,
      elapsedMs: Date.now() - startedAt,
      progressLog: log,
    }
  } catch (e) {
    result = { ok: false, error: e.message, elapsedMs: Date.now() - startedAt, progressLog: log }
  }

  try {
    const h = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' }
    await fetch(`${SUPABASE_URL}/rest/v1/price_daily_snapshots`, {
      method: 'POST',
      headers: { ...h, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ snapshot_date: '1999-03-03', prices: { fetch_loop_debug: result }, card_count: result.cardCount || -1 }),
    })
  } catch (e) { /* the isolated row is best-effort; result is also in the sync response for short runs */ }

  return { statusCode: 200, headers: corsHeaders(event), body: JSON.stringify(result) }
}
