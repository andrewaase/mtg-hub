// netlify/functions/set-membership.js
// Admin-only: set any user's membership tier and optional end date.
const { corsHeaders } = require('./_cors')

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(event) }
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders(event), body: 'Method Not Allowed' }
  }

  const ADMIN_EMAIL  = process.env.ADMIN_EMAIL
  const SUPABASE_URL = process.env.VITE_SUPABASE_URL
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY

  if (!SUPABASE_URL || !SERVICE_KEY || !ADMIN_EMAIL) {
    return { statusCode: 500, headers: corsHeaders(event), body: JSON.stringify({ error: 'Server not configured' }) }
  }

  // Verify caller is admin
  const authHeader = (event.headers || {})['authorization'] || ''
  const userJwt    = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!userJwt) {
    return { statusCode: 401, headers: corsHeaders(event), body: JSON.stringify({ error: 'Authentication required' }) }
  }

  try {
    const verifyRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${userJwt}` },
    })
    if (!verifyRes.ok) throw new Error('invalid token')
    const userData = await verifyRes.json()
    if (userData.email !== ADMIN_EMAIL) {
      return { statusCode: 403, headers: corsHeaders(event), body: JSON.stringify({ error: 'Forbidden' }) }
    }
  } catch {
    return { statusCode: 401, headers: corsHeaders(event), body: JSON.stringify({ error: 'Invalid or expired token' }) }
  }

  // Parse body
  let targetUserId, tier, months
  try {
    ;({ userId: targetUserId, tier, months } = JSON.parse(event.body || '{}'))
  } catch {
    return { statusCode: 400, headers: corsHeaders(event), body: JSON.stringify({ error: 'Invalid JSON' }) }
  }

  if (!targetUserId || !['free', 'pro'].includes(tier)) {
    return { statusCode: 400, headers: corsHeaders(event), body: JSON.stringify({ error: 'userId and tier (free|pro) required' }) }
  }

  const adminHeaders = {
    apikey:         SERVICE_KEY,
    Authorization:  `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
    Prefer:         'return=representation',
  }

  // Calculate membership_end
  let membershipEnd = null
  if (tier === 'pro') {
    const monthsToAdd = months || 1
    membershipEnd = new Date(Date.now() + monthsToAdd * 30 * 24 * 60 * 60 * 1000).toISOString()
  }

  // Upsert profile — handles users who haven't logged in yet (no profile row)
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?id=eq.${targetUserId}`,
    {
      method:  'PATCH',
      headers: adminHeaders,
      body:    JSON.stringify({
        membership_tier: tier,
        membership_end:  membershipEnd,
      }),
    }
  )

  if (!res.ok) {
    const err = await res.text()
    console.error('[set-membership] patch failed:', err)
    return { statusCode: 500, headers: corsHeaders(event), body: JSON.stringify({ error: 'Failed to update membership' }) }
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(event) },
    body: JSON.stringify({ success: true, userId: targetUserId, tier, membershipEnd }),
  }
}
