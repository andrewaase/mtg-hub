// netlify/functions/set-admin.js
// Allows the primary admin to grant or revoke admin status for other users.
// Stores admin status in the profiles table (is_admin boolean column).
//
// Required: profiles table must have an `is_admin` boolean column.
// Run in Supabase SQL editor:
//   ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_admin boolean DEFAULT false;

const { corsHeaders } = require('./_cors')

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(event) }
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  const ADMIN_EMAIL  = process.env.ADMIN_EMAIL
  const SUPABASE_URL = process.env.VITE_SUPABASE_URL
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY

  if (!SUPABASE_URL || !SERVICE_KEY || !ADMIN_EMAIL) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Server not configured' }) }
  }

  // Verify caller is the primary admin
  const authHeader = event.headers['authorization'] || ''
  const userJwt    = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!userJwt) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Missing auth token' }) }
  }

  let callerEmail
  try {
    const verifyRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${userJwt}` },
    })
    if (!verifyRes.ok) throw new Error('invalid token')
    const json = await verifyRes.json()
    callerEmail = json.email
  } catch {
    return { statusCode: 401, body: JSON.stringify({ error: 'Invalid or expired token' }) }
  }

  if (callerEmail !== ADMIN_EMAIL) {
    return { statusCode: 403, body: JSON.stringify({ error: 'Forbidden' }) }
  }

  // Parse body
  let targetUserId, makeAdmin
  try {
    const body = JSON.parse(event.body || '{}')
    targetUserId = body.userId
    makeAdmin    = Boolean(body.makeAdmin)
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) }
  }

  if (!targetUserId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'userId is required' }) }
  }

  const headers = {
    'apikey':        SERVICE_KEY,
    'Authorization': `Bearer ${SERVICE_KEY}`,
    'Content-Type':  'application/json',
    'Prefer':        'return=minimal',
  }

  // Upsert is_admin on profiles row
  const upsertRes = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?id=eq.${targetUserId}`,
    {
      method:  'PATCH',
      headers,
      body: JSON.stringify({ is_admin: makeAdmin }),
    }
  )

  if (!upsertRes.ok) {
    const err = await upsertRes.text()
    return { statusCode: 500, body: JSON.stringify({ error: err }) }
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(event) },
    body: JSON.stringify({ success: true, userId: targetUserId, is_admin: makeAdmin }),
  }
}
