// netlify/functions/find-user-by-email.js
// Looks up a Supabase user by email using the admin API.
// Requires the caller to be authenticated (valid JWT).
// Returns only the user's profile ID and display name — never leaks the full email list.
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

  const err = (msg, status = 400) => ({
    statusCode: status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(event) },
    body: JSON.stringify({ error: msg }),
  })

  if (!SUPABASE_URL || !SERVICE_KEY) return err('Server misconfigured', 500)

  // Verify the caller is authenticated
  const authHeader = (event.headers || {})['authorization'] || ''
  const userJwt    = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!userJwt) return err('Unauthorized', 401)

  const verifyRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${userJwt}` },
  })
  if (!verifyRes.ok) return err('Unauthorized', 401)
  const caller = await verifyRes.json()

  let email
  try {
    email = JSON.parse(event.body || '{}').email?.trim().toLowerCase()
  } catch {
    return err('Invalid request body')
  }
  if (!email || !email.includes('@')) return err('Invalid email')

  // Search auth.users by email using the admin API
  const adminHeaders = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
  const listRes = await fetch(
    `${SUPABASE_URL}/auth/v1/admin/users?per_page=1000`,
    { headers: adminHeaders }
  )
  if (!listRes.ok) return err('Failed to search users', 500)
  const { users } = await listRes.json()

  const match = (users || []).find(u => u.email?.toLowerCase() === email)
  if (!match) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(event) },
      body: JSON.stringify({ found: false }),
    }
  }

  // Don't return yourself
  if (match.id === caller.id) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(event) },
      body: JSON.stringify({ found: false, self: true }),
    }
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(event) },
    body: JSON.stringify({
      found: true,
      user: {
        id:          match.id,
        displayName: match.email.split('@')[0],
        email:       match.email,
      },
    }),
  }
}
