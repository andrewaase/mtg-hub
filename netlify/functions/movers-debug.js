// netlify/functions/movers-debug.js
// TEMPORARY diagnostic for the market-movers pipeline. Synchronous (not
// -background) so we get a real HTTP response with details. No secrets in output.
// Delete after diagnosis.
const { corsHeaders } = require('./_cors')

exports.handler = async (event) => {
  const out = {}
  const SUPABASE_URL = process.env.VITE_SUPABASE_URL
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY
  out.env = { supabase: !!SUPABASE_URL, service: !!SERVICE_KEY, admin: !!process.env.ADMIN_EMAIL }

  // 1. Scryfall — first page of the real query
  try {
    const url = 'https://api.scryfall.com/cards/search' +
      '?q=game%3Apaper+not%3Aextra+not%3Abasic+not%3Aart_series+lang%3Aen' +
      '+-frame%3Ashowcase+-frame%3Aextendedart+-border%3Aborderless+-is%3Apromo+-is%3Aoversized' +
      '&order=usd&dir=asc&unique=cards&page=1'
    const r = await fetch(url, { headers: { 'User-Agent': 'VaultedSingles/1.0 (contact: mtgvaultedsingles@gmail.com)', Accept: 'application/json' } })
    const txt = await r.text()
    let json = null
    try { json = JSON.parse(txt) } catch {}
    out.scryfall = { status: r.status, total_cards: json?.total_cards, has_more: json?.has_more, page_len: json?.data?.length, snippet: r.ok ? undefined : txt.slice(0, 200) }
  } catch (e) { out.scryfall = { error: e.message } }

  // 2. Supabase write test to price_daily_snapshots (self-cleaning)
  try {
    const h = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' }
    const probeDate = '1999-01-01'
    const up = await fetch(`${SUPABASE_URL}/rest/v1/price_daily_snapshots`, {
      method: 'POST', headers: { ...h, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ snapshot_date: probeDate, prices: { probe: { price: 1, img: null } }, card_count: 1 }),
    })
    out.write_test = { status: up.status, body: up.ok ? 'ok' : (await up.text()).slice(0, 300) }
    await fetch(`${SUPABASE_URL}/rest/v1/price_daily_snapshots?snapshot_date=eq.${probeDate}`, { method: 'DELETE', headers: h })
  } catch (e) { out.write_test = { error: e.message } }

  // 3. Does today's snapshot already exist? (would cause the fetch to be skipped)
  try {
    const today = new Date().toISOString().slice(0, 10)
    const h = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
    const r = await fetch(`${SUPABASE_URL}/rest/v1/price_daily_snapshots?snapshot_date=eq.${today}&select=snapshot_date,card_count`, { headers: h })
    out.today_snapshot = { today, rows: await r.json().catch(() => null) }
  } catch (e) { out.today_snapshot = { error: e.message } }

  // 4. Estimate total runtime: total_cards / 175 per page * (fetch time + delay)
  if (out.scryfall?.total_cards) {
    const pages = Math.ceil(out.scryfall.total_cards / 175)
    out.estimate = { pages, rough_seconds: Math.round(pages * 0.4) }
  }

  return { statusCode: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders(event) }, body: JSON.stringify(out, null, 1) }
}
