// netlify/functions/customer-portal.js
// Creates a Stripe Customer Portal session so Pro members can manage
// their subscription, update payment method, or cancel.
const { corsHeaders } = require('./_cors')

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(event) }
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders(event), body: 'Method Not Allowed' }
  }

  const STRIPE_KEY   = process.env.STRIPE_SECRET_KEY
  const SUPABASE_URL = process.env.VITE_SUPABASE_URL
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY
  const SITE_URL     = process.env.SITE_URL || 'https://www.vaultedsingles.com'

  if (!STRIPE_KEY || !SUPABASE_URL || !SERVICE_KEY) {
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
  }

  // Retrieve the Stripe customer ID for this user
  const profileRes = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=stripe_customer_id`,
    { headers: adminHeaders }
  )
  const profiles = await profileRes.json()
  const stripeCustomerId = profiles?.[0]?.stripe_customer_id

  if (!stripeCustomerId) {
    return {
      statusCode: 400,
      headers: corsHeaders(event),
      body: JSON.stringify({ error: 'No billing account found. Please subscribe first.' }),
    }
  }

  const stripe = require('stripe')(STRIPE_KEY)
  const portalSession = await stripe.billingPortal.sessions.create({
    customer:   stripeCustomerId,
    return_url: `${SITE_URL}/#membership`,
  })

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(event) },
    body: JSON.stringify({ url: portalSession.url }),
  }
}
