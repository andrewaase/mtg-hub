// netlify/functions/remove-friend.js
// Deletes a friendship row. Works even when the caller is friend_id (not user_id),
// which RLS would block on the client side.
const { corsHeaders } = require('./_cors')

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders(event) }
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' }

  const SUPABASE_URL = process.env.VITE_SUPABASE_URL
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY
  const fail = (msg, status = 400) => ({
    statusCode: status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(event) },
    body: JSON.stringify({ error: msg }),
  })
  if (!SUPABASE_URL || !SERVICE_KEY) return fail('Server misconfigured', 500)

  const authHeader = (event.headers || {})['authorization'] || ''
  const userJwt = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!userJwt) return fail('Unauthorized', 401)

  const verifyRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${userJwt}` },
  })
  if (!verifyRes.ok) return fail('Unauthorized', 401)
  const caller = await verifyRes.json()

  let body
  try { body = JSON.parse(event.body || '{}') } catch { return fail('Invalid JSON') }
  const { friendRowId } = body
  if (!friendRowId) return fail('Missing friendRowId')

  const adminHeaders = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }

  // Fetch the row to verify the caller is one of the parties
  const findRes = await fetch(
    `${SUPABASE_URL}/rest/v1/friends?id=eq.${friendRowId}&select=id,user_id,friend_id&limit=1`,
    { headers: adminHeaders }
  )
  const rows = findRes.ok ? await findRes.json() : []
  if (!rows.length) return fail('Not found', 404)
  const row = rows[0]
  if (row.user_id !== caller.id && row.friend_id !== caller.id) return fail('Forbidden', 403)

  // Delete both directions (in case a reverse row exists)
  await Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/friends?id=eq.${row.id}`, { method: 'DELETE', headers: adminHeaders }),
    fetch(`${SUPABASE_URL}/rest/v1/friends?user_id=eq.${row.friend_id}&friend_id=eq.${row.user_id}`, { method: 'DELETE', headers: adminHeaders }),
  ])

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(event) },
    body: JSON.stringify({ ok: true }),
  }
}
