// netlify/functions/sleep-test-background.js
// TEMPORARY: proves whether -background functions actually get extended runtime
// on this Netlify account, or get silently killed at the standard sync timeout.
// Sleeps 45s (well past the 10s/26s sync limits, well under the 15min background
// limit) then writes a timestamped row. If the row never appears, background
// functions aren't getting extended execution here. Delete after diagnosis.
const { corsHeaders } = require('./_cors')

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders(event) }

  const SUPABASE_URL = process.env.VITE_SUPABASE_URL
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY
  const startedAt = new Date().toISOString()

  await new Promise(r => setTimeout(r, 45000))

  const finishedAt = new Date().toISOString()
  const h = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' }
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/price_daily_snapshots`, {
      method: 'POST',
      headers: { ...h, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ snapshot_date: '1999-02-02', prices: { sleep_test: { startedAt, finishedAt } }, card_count: -1 }),
    })
  } catch (e) { /* ignore — presence/absence of the row is the signal */ }

  return { statusCode: 200, headers: corsHeaders(event), body: JSON.stringify({ startedAt, finishedAt }) }
}
