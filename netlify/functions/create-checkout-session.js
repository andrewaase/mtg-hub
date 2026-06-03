// netlify/functions/create-checkout-session.js
// Creates a Stripe Checkout Session for Pro membership subscriptions.
// Requires the user to be authenticated so we can attach their Supabase user_id
// as customer metadata and later link the subscription back to their profile.
const { corsHeaders } = require('./_cors')

const VALID_PRICE_IDS = new Set([
  'price_1TW5PM3vsGfrYNehY1OmZnFZ', // $2.99/month
  'price_1TW5PM3vsGfrYNehCP3u9HTL', // $24.99/year
  process.env.STRIPE_MONTHLY_PRICE_ID,
  process.env.STRIPE_ANNUAL_PRICE_ID,
].filter(Boolean))

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
  const SITE_URL     = process.env.SITE_URL || 'https://www.manamint.store'

  if (!STRIPE_KEY || !SUPABASE_URL || !SERVICE_KEY) {
    return { statusCode: 500, headers: corsHeaders(event), body: JSON.stringify({ error: 'Server not configured' }) }
  }

  // Require auth
  const authHeader = (event.headers || {})['authorization'] || ''
  const userJwt    = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!userJwt) {
    return { statusCode: 401, headers: corsHeaders(event), body: JSON.stringify({ error: 'Authentication required' }) }
  }

  let userId, userEmail
  try {
    const verifyRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${userJwt}` },
    })
    if (!verifyRes.ok) throw new Error('invalid token')
    const userData = await verifyRes.json()
    userId    = userData.id
    userEmail = userData.email
  } catch {
    return { statusCode: 401, headers: corsHeaders(event), body: JSON.stringify({ error: 'Invalid or expired token' }) }
  }

  // Parse body
  let priceId
  try {
    ;({ priceId } = JSON.parse(event.body || '{}'))
  } catch {
    return { statusCode: 400, headers: corsHeaders(event), body: JSON.stringify({ error: 'Invalid JSON' }) }
  }

  // Allowlist price IDs — never let the client choose an arbitrary price
  if (!priceId || !VALID_PRICE_IDS.has(priceId)) {
    return { statusCode: 400, headers: corsHeaders(event), body: JSON.stringify({ error: 'Invalid price ID' }) }
  }

  const stripe = require('stripe')(STRIPE_KEY)

  // Look up or retrieve existing Stripe customer for this user
  const adminHeaders = {
    apikey:         SERVICE_KEY,
    Authorization:  `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
  }

  const profileRes = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=stripe_customer_id`,
    { headers: adminHeaders }
  )
  const profiles = await profileRes.json()
  let stripeCustomerId = profiles?.[0]?.stripe_customer_id || null

  if (!stripeCustomerId) {
    // Create a new Stripe customer
    const customer = await stripe.customers.create({
      email:    userEmail,
      metadata: { supabase_user_id: userId },
    })
    stripeCustomerId = customer.id
    // Save to profile
    await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`, {
      method:  'PATCH',
      headers: adminHeaders,
      body:    JSON.stringify({ stripe_customer_id: stripeCustomerId }),
    })
  }

  // Create Checkout Session
  const session = await stripe.checkout.sessions.create({
    mode:               'subscription',
    customer:           stripeCustomerId,
    line_items:         [{ price: priceId, quantity: 1 }],
    success_url:        `${SITE_URL}/#membership?success=1`,
    cancel_url:         `${SITE_URL}/#membership?cancelled=1`,
    subscription_data: {
      metadata: { supabase_user_id: userId },
    },
    metadata: { supabase_user_id: userId },
    allow_promotion_codes: true,
  })

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(event) },
    body: JSON.stringify({ url: session.url }),
  }
}
