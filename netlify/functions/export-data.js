// netlify/functions/export-data.js
// Admin-only: exports all Supabase tables as a single JSON blob for backup.
// Returns a JSON object with keys: store_listings, orders, order_items,
// collection, matches, and exported_at.

const ADMIN_EMAIL = 'mtgvaultedsingles@gmail.com'

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  const SUPABASE_URL = process.env.VITE_SUPABASE_URL
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY

  if (!SUPABASE_URL || !SERVICE_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Server not configured' }) }
  }

  // ── Verify the caller is the admin ────────────────────────────────────────
  const authHeader = event.headers['authorization'] || ''
  const userJwt    = authHeader.replace(/^Bearer\s+/i, '').trim()

  if (!userJwt) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Missing auth token' }) }
  }

  let callerEmail
  try {
    const verifyRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        'apikey':        SERVICE_KEY,
        'Authorization': `Bearer ${userJwt}`,
      },
    })
    if (!verifyRes.ok) throw new Error('invalid token')
    const verifyJson = await verifyRes.json()
    callerEmail = verifyJson.email
  } catch {
    return { statusCode: 401, body: JSON.stringify({ error: 'Invalid or expired token' }) }
  }

  if (callerEmail !== ADMIN_EMAIL) {
    return { statusCode: 403, body: JSON.stringify({ error: 'Forbidden' }) }
  }

  // ── Fetch all tables in parallel ──────────────────────────────────────────
  const h = {
    'apikey':        SERVICE_KEY,
    'Authorization': `Bearer ${SERVICE_KEY}`,
    'Content-Type':  'application/json',
  }

  async function fetchAll(path) {
    // Supabase paginates at 1000 rows by default; loop with range headers
    const rows = []
    let from = 0
    const PAGE = 1000
    while (true) {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
        headers: { ...h, 'Range': `${from}-${from + PAGE - 1}`, 'Range-Unit': 'items', 'Prefer': 'count=none' },
      })
      const data = await res.json()
      if (!Array.isArray(data) || data.length === 0) break
      rows.push(...data)
      if (data.length < PAGE) break
      from += PAGE
    }
    return rows
  }

  try {
    const [storeListing, orders, orderItems, collection, matches] = await Promise.all([
      fetchAll('store_listings?select=*&order=created_at.asc'),
      fetchAll('orders?select=*&order=created_at.asc'),
      fetchAll('order_items?select=*&order=id.asc'),
      fetchAll('collection?select=*&order=id.asc'),
      fetchAll('matches?select=*&order=created_at.asc'),
    ])

    const backup = {
      exported_at:    new Date().toISOString(),
      exported_by:    callerEmail,
      store_listings: storeListing,
      orders,
      order_items:    orderItems,
      collection,
      matches,
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type':                'application/json',
        'Content-Disposition':         `attachment; filename="vaulted-singles-backup-${new Date().toISOString().slice(0,10)}.json"`,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control':               'no-store',
      },
      body: JSON.stringify(backup, null, 2),
    }
  } catch (err) {
    console.error('[export-data]', err)
    return { statusCode: 500, body: JSON.stringify({ error: err.message || 'Export failed' }) }
  }
}
