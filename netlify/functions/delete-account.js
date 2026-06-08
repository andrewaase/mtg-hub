// netlify/functions/delete-account.js
// Lets a signed-in user permanently delete THEIR OWN account and personal data.
// Required by App Store Guideline 5.1.1(v). Auth: the caller's own JWT (no admin).
const { corsHeaders } = require('./_cors')

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders(event) }
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: corsHeaders(event), body: 'Method Not Allowed' }

  const SUPABASE_URL = process.env.VITE_SUPABASE_URL
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY

  const fail = (msg, status = 400) => ({
    statusCode: status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(event) },
    body: JSON.stringify({ error: msg }),
  })
  if (!SUPABASE_URL || !SERVICE_KEY) return fail('Server misconfigured', 500)

  // Verify the caller and get THEIR user id — we only ever delete the caller.
  const userJwt = ((event.headers || {})['authorization'] || '').replace(/^Bearer\s+/i, '').trim()
  if (!userJwt) return fail('Authentication required', 401)

  const meRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${userJwt}` },
  })
  if (!meRes.ok) return fail('Invalid or expired session', 401)
  const me = await meRes.json()
  const userId = me.id
  if (!userId) return fail('Could not resolve user', 401)

  const adminHeaders = {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
  }

  // Best-effort delete of personal rows (service key bypasses RLS). A single
  // table failing must not block auth-user deletion, so we ignore per-table errors.
  async function del(table, filter) {
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, { method: 'DELETE', headers: adminHeaders })
    } catch (e) { console.warn(`[delete-account] ${table} cleanup failed:`, e.message) }
  }

  const uid = encodeURIComponent(userId)
  await del('collection',   `user_id=eq.${uid}`)
  await del('decks',        `user_id=eq.${uid}`)
  await del('wishlist',     `user_id=eq.${uid}`)
  await del('matches',      `user_id=eq.${uid}`)
  await del('trade_wants',  `user_id=eq.${uid}`)
  await del('notifications', `user_id=eq.${uid}`)
  await del('friends',      `user_id=eq.${uid}`)
  await del('friends',      `friend_id=eq.${uid}`)
  await del('profiles',     `id=eq.${uid}`)

  // Finally, delete the auth user itself. This is the critical step.
  const delRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${uid}`, {
    method: 'DELETE',
    headers: adminHeaders,
  })
  if (!delRes.ok) {
    const err = await delRes.json().catch(() => ({}))
    return fail(err.message || err.msg || 'Failed to delete account', 500)
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(event) },
    body: JSON.stringify({ ok: true }),
  }
}
