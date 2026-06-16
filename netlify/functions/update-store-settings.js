// netlify/functions/update-store-settings.js
// Upserts shipping_cost and handling_fee in the store_settings table.
// Uses the service role key to bypass RLS; caller must be the admin.

const { corsHeaders } = require('./_cors')

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(event) }
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) }
  }

  const ADMIN_EMAIL  = process.env.ADMIN_EMAIL
  const SUPABASE_URL = process.env.VITE_SUPABASE_URL
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY

  if (!SUPABASE_URL || !SERVICE_KEY || !ADMIN_EMAIL) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Server not configured' }) }
  }

  // Verify the caller is the admin
  const authHeader = (event.headers || {})['authorization'] || ''
  const userJwt    = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!userJwt) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Missing auth token' }) }
  }

  let callerEmail
  try {
    const verifyRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${userJwt}` },
    })
    if (!verifyRes.ok) throw new Error('invalid token')
    callerEmail = (await verifyRes.json()).email
  } catch {
    return { statusCode: 401, body: JSON.stringify({ error: 'Invalid or expired token' }) }
  }

  if (callerEmail !== ADMIN_EMAIL) {
    return { statusCode: 403, body: JSON.stringify({ error: 'Forbidden' }) }
  }

  let body
  try {
    body = JSON.parse(event.body || '{}')
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }
  }

  const { shipping_cost, handling_fee } = body
  if (shipping_cost == null || handling_fee == null) {
    return { statusCode: 400, body: JSON.stringify({ error: 'shipping_cost and handling_fee required' }) }
  }

  const adminHeaders = {
    apikey:          SERVICE_KEY,
    Authorization:   `Bearer ${SERVICE_KEY}`,
    'Content-Type':  'application/json',
    Prefer:          'resolution=merge-duplicates,return=minimal',
  }

  const now = new Date().toISOString()
  const upsertRes = await fetch(`${SUPABASE_URL}/rest/v1/store_settings`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify([
      { key: 'shipping_cost', value: String(shipping_cost), updated_at: now },
      { key: 'handling_fee',  value: String(handling_fee),  updated_at: now },
    ]),
  })

  if (!upsertRes.ok) {
    const txt = await upsertRes.text()
    return {
      statusCode: 500,
      headers: corsHeaders(event),
      body: JSON.stringify({ error: txt }),
    }
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(event) },
    body: JSON.stringify({ ok: true }),
  }
}
