// netlify/functions/sealed-ev-admin.js
// Admin-only: set or clear a manual box-price override on a sealed_ev row.
// Stored in box_price_override (separate from the auto box_price) so it survives
// the weekly recompute, which only writes box_price.
const { corsHeaders } = require('./_cors')
const { verifyAdmin } = require('./_admin')

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders(event) }
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) }

  const ADMIN_EMAIL  = process.env.ADMIN_EMAIL
  const SUPABASE_URL = process.env.VITE_SUPABASE_URL
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY
  if (!SUPABASE_URL || !SERVICE_KEY || !ADMIN_EMAIL) return { statusCode: 500, body: JSON.stringify({ error: 'Server not configured' }) }

  const admin = await verifyAdmin(SUPABASE_URL, SERVICE_KEY, ADMIN_EMAIL, (event.headers || {})['authorization'])
  if (!admin.ok) {
    return { statusCode: admin.statusCode, headers: corsHeaders(event), body: JSON.stringify({ error: admin.error }) }
  }

  let body
  try { body = JSON.parse(event.body || '{}') } catch { return { statusCode: 400, headers: corsHeaders(event), body: JSON.stringify({ error: 'Invalid JSON' }) } }
  const { id } = body
  if (!id) return { statusCode: 400, headers: corsHeaders(event), body: JSON.stringify({ error: 'Missing id' }) }

  // price === null clears the override (back to the auto/market value)
  const raw = body.price
  let override = null
  if (raw !== null && raw !== undefined && raw !== '') {
    const n = parseFloat(raw)
    if (isNaN(n) || n < 0) return { statusCode: 400, headers: corsHeaders(event), body: JSON.stringify({ error: 'Invalid price' }) }
    override = Math.round(n * 100) / 100
  }

  const res = await fetch(`${SUPABASE_URL}/rest/v1/sealed_ev?id=eq.${encodeURIComponent(id)}`, {
    method:  'PATCH',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body:    JSON.stringify({ box_price_override: override }),
  })
  if (!res.ok) return { statusCode: 500, headers: corsHeaders(event), body: JSON.stringify({ error: await res.text() }) }

  return { statusCode: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders(event) }, body: JSON.stringify({ ok: true, box_price_override: override }) }
}
