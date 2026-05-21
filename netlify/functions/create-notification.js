// netlify/functions/create-notification.js
// Inserts a notification row for any target user.
// Uses the service key so it can write to another user's row (bypasses RLS).
// Caller must be authenticated — we verify their JWT before accepting the request.
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

  // Verify the caller is a real authenticated user
  const authHeader = (event.headers || {})['authorization'] || ''
  const userJwt    = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!userJwt) return fail('Unauthorized', 401)

  const verifyRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${userJwt}` },
  })
  if (!verifyRes.ok) return fail('Unauthorized', 401)

  let body
  try { body = JSON.parse(event.body || '{}') } catch { return fail('Invalid JSON') }

  const { targetUserId, type, title, bodyText, data } = body
  if (!targetUserId || !type || !title) return fail('Missing required fields')

  const adminHeaders = {
    apikey:        SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
    Prefer:        'return=minimal',
  }

  const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/notifications`, {
    method:  'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      user_id: targetUserId,
      type,
      title,
      body:    bodyText || null,
      data:    data || {},
      read:    false,
    }),
  })

  if (!insertRes.ok) {
    const errText = await insertRes.text()
    console.error('[create-notification] insert error:', errText)
    return fail('Failed to create notification', 500)
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(event) },
    body: JSON.stringify({ ok: true }),
  }
}
