// netlify/functions/get-friends.js
// Returns the caller's friends and pending incoming requests using the service key.
// Bypasses RLS so the recipient can see rows they don't own (friend_id = them).
// Body: {} — caller identified via JWT.
const { corsHeaders } = require('./_cors')

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(event) }
  }
  if (event.httpMethod !== 'POST' && event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  const SUPABASE_URL = process.env.VITE_SUPABASE_URL
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY

  const fail = (msg, status = 400) => ({
    statusCode: status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(event) },
    body: JSON.stringify({ error: msg }),
  })

  if (!SUPABASE_URL || !SERVICE_KEY) return fail('Server misconfigured', 500)

  // Verify the caller
  const authHeader = (event.headers || {})['authorization'] || ''
  const userJwt    = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!userJwt) return fail('Unauthorized', 401)

  const verifyRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${userJwt}` },
  })
  if (!verifyRes.ok) return fail('Unauthorized', 401)
  const caller = await verifyRes.json()
  const userId = caller.id

  const adminHeaders = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }

  // Fetch all friendships involving this user, plus all auth users (for emails)
  // We use the admin users endpoint so we can show emails when profile rows are missing.
  const [sentRes, receivedRes, pendingRes, usersRes, profilesRes] = await Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/friends?user_id=eq.${userId}&status=eq.accepted&select=id,status,friend_id`, { headers: adminHeaders }),
    fetch(`${SUPABASE_URL}/rest/v1/friends?friend_id=eq.${userId}&status=eq.accepted&select=id,status,user_id`, { headers: adminHeaders }),
    fetch(`${SUPABASE_URL}/rest/v1/friends?friend_id=eq.${userId}&status=eq.pending&select=id,status,user_id`, { headers: adminHeaders }),
    fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=1000`, { headers: adminHeaders }),
    fetch(`${SUPABASE_URL}/rest/v1/profiles?select=id,username,avatar_color`, { headers: adminHeaders }),
  ])

  if (!sentRes.ok || !receivedRes.ok || !pendingRes.ok) {
    return fail('Failed to fetch friendships', 500)
  }

  const sent     = await sentRes.json()
  const received = await receivedRes.json()
  const pending  = await pendingRes.json()
  const usersBody    = usersRes.ok    ? await usersRes.json()    : { users: [] }
  const profilesBody = profilesRes.ok ? await profilesRes.json() : []

  const userMap    = Object.fromEntries((usersBody.users || []).map(u => [u.id, { email: u.email }]))
  const profileMap = Object.fromEntries((profilesBody || []).map(p => [p.id, p]))

  const buildPerson = (id) => {
    const profile = profileMap[id] || {}
    const auth    = userMap[id]    || {}
    return {
      id,
      username:     profile.username     || null,
      avatar_color: profile.avatar_color || null,
      email:        auth.email           || null,
    }
  }

  const friends = [
    ...sent.map(r     => ({ id: r.id, status: r.status, friend: buildPerson(r.friend_id) })),
    ...received.map(r => ({ id: r.id, status: r.status, friend: buildPerson(r.user_id) })),
  ]

  const pendingRequests = pending.map(r => ({
    id: r.id, status: r.status, requester: buildPerson(r.user_id),
  }))

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(event) },
    body: JSON.stringify({ friends, pendingRequests }),
  }
}
