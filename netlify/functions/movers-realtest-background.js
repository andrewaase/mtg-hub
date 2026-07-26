// netlify/functions/movers-realtest-background.js
// TEMPORARY: exercises the EXACT deployed fetchAllCardPrices() from
// compute-market-movers-background.js inside the real Netlify environment
// (not my local sandbox), writing timing/result to an isolated debug row.
// No auth needed — read-only against Scryfall, writes only to a sentinel
// snapshot_date that the real app never reads. Delete after diagnosis.
const { corsHeaders } = require('./_cors')
const { fetchAllCardPrices } = require('./compute-market-movers-background')

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders(event) }

  const SUPABASE_URL = process.env.VITE_SUPABASE_URL
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY
  const startedAt = Date.now()
  let result

  try {
    const priceMap = await fetchAllCardPrices()
    result = { ok: true, cardCount: Object.keys(priceMap).length, elapsedMs: Date.now() - startedAt }
  } catch (e) {
    result = { ok: false, error: e.message, stack: e.stack?.slice(0, 500), elapsedMs: Date.now() - startedAt }
  }

  try {
    const h = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' }
    await fetch(`${SUPABASE_URL}/rest/v1/price_daily_snapshots`, {
      method: 'POST',
      headers: { ...h, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ snapshot_date: '1999-04-04', prices: { realtest: result }, card_count: result.cardCount || -1 }),
    })
  } catch (e) { /* best-effort */ }

  return { statusCode: 200, headers: corsHeaders(event), body: JSON.stringify(result) }
}
