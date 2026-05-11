// netlify/functions/is-admin.js
// Lightweight server-side admin check.
// Returns { isAdmin: true } if the caller's JWT belongs to the admin account,
// { isAdmin: false } for everyone else — including unauthenticated requests.
// Never leaks the admin email to the client.
const { corsHeaders } = require('./_cors')

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(event) }
  }
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  const ADMIN_EMAIL  = process.env.ADMIN_EMAIL
  const SUPABASE_URL = process.env.VITE_SUPABASE_URL
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY

  const notAdmin = {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(event) },
    body: JSON.stringify({ isAdmin: false }),
  }

  if (!SUPABASE_URL || !SERVICE_KEY || !ADMIN_EMAIL) return notAdmin

  const authHeader = (event.headers || {})['authorization'] || ''
  const userJwt    = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!userJwt) return notAdmin

  try {
    const verifyRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${userJwt}` },
    })
    if (!verifyRes.ok) return notAdmin
    const { email } = await verifyRes.json()
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(event) },
      body: JSON.stringify({ isAdmin: email === ADMIN_EMAIL }),
    }
  } catch {
    return notAdmin
  }
}
