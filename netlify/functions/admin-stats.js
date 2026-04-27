// netlify/functions/admin-stats.js
// Returns aggregated admin stats for the Vaulted Singles control panel.
// Protected — only responds to requests from the hardcoded admin email.
//
// Flow:
//   1. Client sends user's Supabase JWT in Authorization header
//   2. Function verifies JWT against Supabase → confirms email
//   3. If email matches ADMIN_EMAIL → fetch all stats and return them
//   4. Otherwise → 403

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

  // ── 1. Verify the caller's JWT ────────────────────────────────────────────
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

  // ── 2. Fetch all data in parallel ────────────────────────────────────────
  const adminHeaders = {
    'apikey':        SERVICE_KEY,
    'Authorization': `Bearer ${SERVICE_KEY}`,
    'Content-Type':  'application/json',
  }

  try {
    const [usersRes, collectionRes, matchesRes] = await Promise.all([
      // All auth users (up to 1000)
      fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=1000`, { headers: adminHeaders }),
      // All collection rows — just user_id + qty
      fetch(`${SUPABASE_URL}/rest/v1/collection?select=user_id,qty`, { headers: adminHeaders }),
      // All match rows — user_id + result + date
      fetch(`${SUPABASE_URL}/rest/v1/matches?select=user_id,result,created_at`, { headers: adminHeaders }),
    ])

    const [usersJson, collectionRaw, matchRaw] = await Promise.all([
      usersRes.json(),
      collectionRes.json(),
      matchesRes.json(),
    ])

    // Guard: Supabase returns an error object (truthy non-array) when a query fails.
    // Always use Array.isArray() before iterating.
    if (!Array.isArray(collectionRaw)) {
      console.error('[admin-stats] collection query error:', collectionRaw)
    }
    if (!Array.isArray(matchRaw)) {
      console.error('[admin-stats] matches query error:', matchRaw)
    }

    const collectionRows = Array.isArray(collectionRaw) ? collectionRaw : []
    const matchRows      = Array.isArray(matchRaw)      ? matchRaw      : []
    const rawUsers       = usersJson.users || []

    // ── 3. Aggregate ─────────────────────────────────────────────────────────

    // Collection counts per user
    const collectionByUser = {}
    const cardQtyByUser    = {}
    for (const row of collectionRows) {
      collectionByUser[row.user_id] = (collectionByUser[row.user_id] || 0) + 1
      cardQtyByUser[row.user_id]    = (cardQtyByUser[row.user_id]    || 0) + (row.qty || 1)
    }

    // Match counts per user
    const matchesByUser = {}
    for (const row of matchRows) {
      matchesByUser[row.user_id] = (matchesByUser[row.user_id] || 0) + 1
    }

    // Date thresholds
    const now     = Date.now()
    const ms7d    = 7  * 24 * 60 * 60 * 1000
    const ms30d   = 30 * 24 * 60 * 60 * 1000

    // Build enriched user list
    const users = rawUsers.map(u => ({
      id:              u.id,
      email:           u.email,
      createdAt:       u.created_at,
      lastSignIn:      u.last_sign_in_at,
      uniqueCards:     collectionByUser[u.id] || 0,
      totalCards:      cardQtyByUser[u.id]    || 0,
      matchCount:      matchesByUser[u.id]    || 0,
    })).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

    // Signup counts over last 30 days (day buckets)
    const signupsByDay = {}
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now - i * 86400000).toISOString().slice(0, 10)
      signupsByDay[d] = 0
    }
    for (const u of rawUsers) {
      const d = (u.created_at || '').slice(0, 10)
      if (signupsByDay[d] !== undefined) signupsByDay[d]++
    }

    // Totals
    const newLast7d  = rawUsers.filter(u => now - new Date(u.created_at) < ms7d).length
    const newLast30d = rawUsers.filter(u => now - new Date(u.created_at) < ms30d).length
    const usersWithCollection = Object.keys(collectionByUser).length

    const totals = {
      users:             rawUsers.length,
      newLast7d,
      newLast30d,
      usersWithCollection,
      totalUniqueCards:  collectionRows.length,
      totalCards:        collectionRows.reduce((s, r) => s + (r.qty || 1), 0),
      totalMatches:      matchRows.length,
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type':                'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control':               'no-store',
      },
      body: JSON.stringify({ totals, users, signupsByDay }),
    }
  } catch (err) {
    console.error('[admin-stats]', err)
    return { statusCode: 500, body: JSON.stringify({ error: 'Internal error' }) }
  }
}
