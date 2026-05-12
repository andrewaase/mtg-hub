// netlify/functions/redeem-free-months.js
// Converts the user's banked free_months_remaining into an active Pro membership.
// Each month extends membership_end by 30 days from now (or from the current end
// date if they already have Pro remaining, so months stack properly).
const { corsHeaders } = require('./_cors')

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(event) }
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders(event), body: 'Method Not Allowed' }
  }

  const SUPABASE_URL = process.env.VITE_SUPABASE_URL
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY

  if (!SUPABASE_URL || !SERVICE_KEY) {
    return { statusCode: 500, headers: corsHeaders(event), body: JSON.stringify({ error: 'Server not configured' }) }
  }

  // Require auth
  const authHeader = (event.headers || {})['authorization'] || ''
  const userJwt    = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!userJwt) {
    return { statusCode: 401, headers: corsHeaders(event), body: JSON.stringify({ error: 'Authentication required' }) }
  }

  let userId
  try {
    const verifyRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${userJwt}` },
    })
    if (!verifyRes.ok) throw new Error('invalid token')
    const userData = await verifyRes.json()
    userId = userData.id
  } catch {
    return { statusCode: 401, headers: corsHeaders(event), body: JSON.stringify({ error: 'Invalid or expired token' }) }
  }

  const adminHeaders = {
    apikey:         SERVICE_KEY,
    Authorization:  `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
    Prefer:         'return=representation',
  }

  // Fetch current profile
  const profileRes = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=membership_tier,membership_end,free_months_remaining`,
    { headers: adminHeaders }
  )
  const profiles = await profileRes.json()
  const profile  = Array.isArray(profiles) ? profiles[0] : null

  if (!profile) {
    return { statusCode: 404, headers: corsHeaders(event), body: JSON.stringify({ error: 'Profile not found' }) }
  }

  const freeMonths = profile.free_months_remaining || 0
  if (freeMonths <= 0) {
    return { statusCode: 400, headers: corsHeaders(event), body: JSON.stringify({ error: 'No free months to redeem' }) }
  }

  // Calculate new membership_end
  // Start from today or from existing membership_end (whichever is later), then add months
  const now     = new Date()
  const baseEnd = profile.membership_end && new Date(profile.membership_end) > now
    ? new Date(profile.membership_end)
    : now
  const newEnd  = new Date(baseEnd.getTime() + freeMonths * 30 * 24 * 60 * 60 * 1000)

  // Apply to profile — zero out free months and activate pro
  await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`, {
    method:  'PATCH',
    headers: adminHeaders,
    body:    JSON.stringify({
      membership_tier:         'pro',
      membership_end:          newEnd.toISOString(),
      free_months_remaining:   0,
    }),
  })

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(event) },
    body: JSON.stringify({
      success:        true,
      monthsRedeemed: freeMonths,
      membershipEnd:  newEnd.toISOString(),
    }),
  }
}
