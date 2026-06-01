// netlify/functions/is-admin.js
// Returns { isAdmin: true } if the caller is the primary admin (ADMIN_EMAIL)
// OR has is_admin = true in the profiles table.
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
    // 1. Verify JWT and get user id + email
    const verifyRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${userJwt}` },
    })
    if (!verifyRes.ok) return notAdmin
    const { id: userId, email } = await verifyRes.json()

    // 2. Primary admin check
    if (email === ADMIN_EMAIL) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(event) },
        body: JSON.stringify({ isAdmin: true }),
      }
    }

    // 3. Check profiles.is_admin for granted admins
    if (userId) {
      const profileRes = await fetch(
        `${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=is_admin`,
        { headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` } }
      )
      if (profileRes.ok) {
        const rows = await profileRes.json()
        if (Array.isArray(rows) && rows[0]?.is_admin === true) {
          return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json', ...corsHeaders(event) },
            body: JSON.stringify({ isAdmin: true }),
          }
        }
      }
    }

    return notAdmin
  } catch {
    return notAdmin
  }
}
