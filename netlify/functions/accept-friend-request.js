// netlify/functions/accept-friend-request.js
// Accepts or denies a pending friendship row on behalf of the authenticated user.
// Uses the service key to bypass RLS — caller can only act on requests where
// they are the recipient (friend_id = their auth.uid()).
// Body: { requesterId, action: 'accept' | 'deny' }
const { corsHeaders } = require('./_cors')

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(event) }
  }
  if (event.httpMethod !== 'POST') {
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

  // Verify the caller and get their user ID
  const authHeader = (event.headers || {})['authorization'] || ''
  const userJwt    = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!userJwt) return fail('Unauthorized', 401)

  const verifyRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${userJwt}` },
  })
  if (!verifyRes.ok) return fail('Unauthorized', 401)
  const caller = await verifyRes.json()
  const recipientId = caller.id

  let body
  try { body = JSON.parse(event.body || '{}') } catch { return fail('Invalid JSON') }
  const { requesterId, action = 'accept' } = body
  if (!requesterId) return fail('Missing requesterId')
  if (action !== 'accept' && action !== 'deny') return fail('Invalid action')

  const adminHeaders = {
    apikey:        SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
  }

  // Find the pending friendship row (requester → recipient)
  const findRes = await fetch(
    `${SUPABASE_URL}/rest/v1/friends?user_id=eq.${requesterId}&friend_id=eq.${recipientId}&status=eq.pending&select=id&limit=1`,
    { headers: adminHeaders }
  )
  if (!findRes.ok) return fail('Failed to look up friendship', 500)
  const rows = await findRes.json()
  if (!rows || rows.length === 0) {
    // Already handled (accepted elsewhere, request cancelled, etc.)
    return { statusCode: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders(event) }, body: JSON.stringify({ ok: true, alreadyGone: true }) }
  }

  const rowId = rows[0].id

  if (action === 'accept') {
    const updateRes = await fetch(
      `${SUPABASE_URL}/rest/v1/friends?id=eq.${rowId}`,
      {
        method:  'PATCH',
        headers: { ...adminHeaders, Prefer: 'return=minimal' },
        body:    JSON.stringify({ status: 'accepted' }),
      }
    )
    if (!updateRes.ok) {
      const errText = await updateRes.text()
      console.error('[accept-friend-request] update error:', errText)
      return fail('Failed to accept request', 500)
    }
  } else {
    // deny — delete the row
    const deleteRes = await fetch(
      `${SUPABASE_URL}/rest/v1/friends?id=eq.${rowId}`,
      { method: 'DELETE', headers: adminHeaders }
    )
    if (!deleteRes.ok) {
      const errText = await deleteRes.text()
      console.error('[accept-friend-request] delete error:', errText)
      return fail('Failed to deny request', 500)
    }
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(event) },
    body: JSON.stringify({ ok: true }),
  }
}
