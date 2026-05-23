// netlify/functions/ban-user.js
// Admin-only: bans or unbans a user via the Supabase auth admin API.
const { corsHeaders } = require('./_cors')

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders(event) }
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' }

  const SUPABASE_URL = process.env.VITE_SUPABASE_URL
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY
  const ADMIN_EMAIL  = process.env.ADMIN_EMAIL

  const fail = (msg, status = 400) => ({
    statusCode: status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(event) },
    body: JSON.stringify({ error: msg }),
  })
  if (!SUPABASE_URL || !SERVICE_KEY || !ADMIN_EMAIL) return fail('Server misconfigured', 500)

  const authHeader = (event.headers || {})['authorization'] || ''
  const userJwt = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!userJwt) return fail('Unauthorized', 401)

  const verifyRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${userJwt}` },
  })
  if (!verifyRes.ok) return fail('Unauthorized', 401)
  const caller = await verifyRes.json()
  if (caller.email !== ADMIN_EMAIL) return fail('Forbidden', 403)

  let body
  try { body = JSON.parse(event.body || '{}') } catch { return fail('Invalid JSON') }
  const { userId, banned } = body
  if (!userId) return fail('Missing userId')

  const adminHeaders = {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
  }

  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
    method: 'PUT',
    headers: adminHeaders,
    body: JSON.stringify({ ban_duration: banned ? '87600h' : 'none' }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    return fail(err.message || 'Failed to update user', 500)
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(event) },
    body: JSON.stringify({ ok: true }),
  }
}
