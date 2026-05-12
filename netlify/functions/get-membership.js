// netlify/functions/get-membership.js
// Returns the authenticated user's membership tier, scan count for today,
// and computed limits. Called by the useMembership hook on the frontend.
const { corsHeaders } = require('./_cors')

const FREE_SCAN_LIMIT = 100
const FREE_DECK_LIMIT = 10

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(event) }
  }
  if (event.httpMethod !== 'GET') {
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

  // Verify token and get user
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
  }

  // Fetch profile
  const profileRes = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=membership_tier,membership_end,free_months_remaining`,
    { headers: adminHeaders }
  )
  const profiles = await profileRes.json()
  const profile  = Array.isArray(profiles) ? profiles[0] : null

  let tier = profile?.membership_tier || 'free'
  const membershipEnd = profile?.membership_end || null
  const freeMonths    = profile?.free_months_remaining || 0

  // If pro membership has expired, treat as free
  if (tier === 'pro' && membershipEnd && new Date(membershipEnd) < new Date()) {
    tier = 'free'
  }

  // Fetch today's scan count
  const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
  const scanRes = await fetch(
    `${SUPABASE_URL}/rest/v1/scan_logs?user_id=eq.${userId}&scan_date=eq.${today}&select=id`,
    { headers: adminHeaders }
  )
  const scanRows  = await scanRes.json()
  const scansToday = Array.isArray(scanRows) ? scanRows.length : 0

  const isPro = tier === 'pro'

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(event) },
    body: JSON.stringify({
      tier,
      isPro,
      membershipEnd,
      freeMonthsRemaining: freeMonths,
      scansToday,
      scanLimit:  isPro ? null : FREE_SCAN_LIMIT,
      deckLimit:  isPro ? null : FREE_DECK_LIMIT,
      scansLeft:  isPro ? null : Math.max(0, FREE_SCAN_LIMIT - scansToday),
      canScan:    isPro || scansToday < FREE_SCAN_LIMIT,
    }),
  }
}
