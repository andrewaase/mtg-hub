// netlify/functions/upsert-store-listing.js
// Creates or bumps a store_listings row (scanner "Add & List", manual Add &
// List, admin Create Listing). Uses the service role key to bypass RLS —
// direct client INSERTs from the browser were being rejected with
// "new row violates row-level security policy for table store_listings"
// whenever a scanned/added card had no existing listing yet (the UPDATE path
// for bumping an existing listing's quantity apparently has a looser policy,
// which is why this only surfaced on genuinely new cards). Caller must be admin.

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
    return { statusCode: 401, headers: corsHeaders(event), body: JSON.stringify({ error: 'Missing auth token' }) }
  }

  let callerEmail
  try {
    const verifyRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${userJwt}` },
    })
    if (!verifyRes.ok) throw new Error('invalid token')
    callerEmail = (await verifyRes.json()).email
  } catch {
    return { statusCode: 401, headers: corsHeaders(event), body: JSON.stringify({ error: 'Invalid or expired token' }) }
  }

  if (callerEmail !== ADMIN_EMAIL) {
    return { statusCode: 403, headers: corsHeaders(event), body: JSON.stringify({ error: 'Forbidden' }) }
  }

  let body
  try {
    body = JSON.parse(event.body || '{}')
  } catch {
    return { statusCode: 400, headers: corsHeaders(event), body: JSON.stringify({ error: 'Invalid JSON' }) }
  }

  const { name, set_name, condition, is_foil, price, img_url, scryfall_id, qty } = body
  if (!name || price == null) {
    return { statusCode: 400, headers: corsHeaders(event), body: JSON.stringify({ error: 'name and price are required' }) }
  }
  const qtyNum = parseInt(qty, 10) || 1

  const adminHeaders = {
    apikey:         SERVICE_KEY,
    Authorization:  `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
  }

  try {
    // Dedup: same scryfall_id (or name, if none) + condition + foil, active listing
    const filters = new URLSearchParams({ select: 'id,qty_available', active: 'eq.true' })
    if (scryfall_id) {
      filters.set('scryfall_id', `eq.${scryfall_id}`)
    } else {
      filters.set('name', `eq.${name}`)
      filters.append('scryfall_id', 'is.null')
    }
    filters.append('condition', `eq.${condition || 'NM'}`)
    filters.append('is_foil', `eq.${is_foil || false}`)

    const selRes = await fetch(`${SUPABASE_URL}/rest/v1/store_listings?${filters.toString()}`, { headers: adminHeaders })
    if (!selRes.ok) throw new Error(`select failed: ${await selRes.text()}`)
    const existingRows = await selRes.json()
    const existing = existingRows?.[0]

    if (existing) {
      const updRes = await fetch(`${SUPABASE_URL}/rest/v1/store_listings?id=eq.${existing.id}`, {
        method:  'PATCH',
        headers: { ...adminHeaders, Prefer: 'return=minimal' },
        body:    JSON.stringify({ qty_available: (existing.qty_available || 0) + qtyNum, active: true }),
      })
      if (!updRes.ok) throw new Error(`update failed: ${await updRes.text()}`)
      return { statusCode: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders(event) }, body: JSON.stringify({ merged: true, id: existing.id }) }
    }

    const insRes = await fetch(`${SUPABASE_URL}/rest/v1/store_listings`, {
      method:  'POST',
      headers: { ...adminHeaders, Prefer: 'return=representation' },
      body: JSON.stringify({
        name, set_name: set_name || null, condition: condition || 'NM', is_foil: is_foil || false,
        price, qty_available: qtyNum, img_url: img_url || null, active: true, scryfall_id: scryfall_id || null,
      }),
    })
    if (!insRes.ok) throw new Error(`insert failed: ${await insRes.text()}`)
    const [row] = await insRes.json()
    return { statusCode: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders(event) }, body: JSON.stringify({ merged: false, id: row.id }) }
  } catch (e) {
    return { statusCode: 500, headers: corsHeaders(event), body: JSON.stringify({ error: e.message }) }
  }
}
