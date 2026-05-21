// netlify/functions/debug-friends.js
// Returns raw friendship rows involving the authenticated user.
// Used to diagnose why friends aren't appearing.
const { corsHeaders } = require('./_cors')

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders(event) }

  const SUPABASE_URL = process.env.VITE_SUPABASE_URL
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY

  const fail = (msg, status = 400, extra = {}) => ({
    statusCode: status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(event) },
    body: JSON.stringify({ error: msg, ...extra }),
  })

  if (!SUPABASE_URL) return fail('Missing VITE_SUPABASE_URL env', 500)
  if (!SERVICE_KEY)  return fail('Missing SUPABASE_SERVICE_KEY env', 500)

  const authHeader = (event.headers || {})['authorization'] || ''
  const userJwt    = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!userJwt) return fail('Unauthorized — no Bearer token', 401)

  const verifyRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${userJwt}` },
  })
  if (!verifyRes.ok) {
    const t = await verifyRes.text()
    return fail('JWT verify failed', 401, { status: verifyRes.status, body: t })
  }
  const caller = await verifyRes.json()

  const adminHeaders = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }

  // Get every friendship row involving this user (both directions, all statuses)
  const [sentRes, recRes] = await Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/friendships?user_id=eq.${caller.id}&select=*`, { headers: adminHeaders }),
    fetch(`${SUPABASE_URL}/rest/v1/friendships?friend_id=eq.${caller.id}&select=*`, { headers: adminHeaders }),
  ])
  const sent = sentRes.ok ? await sentRes.json() : { error: await sentRes.text(), status: sentRes.status }
  const received = recRes.ok ? await recRes.json() : { error: await recRes.text(), status: recRes.status }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(event) },
    body: JSON.stringify({
      callerId: caller.id,
      callerEmail: caller.email,
      rowsWhereIAmUserId: sent,
      rowsWhereIAmFriendId: received,
    }, null, 2),
  }
}
