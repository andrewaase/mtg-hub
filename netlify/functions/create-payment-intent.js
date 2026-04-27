// netlify/functions/create-payment-intent.js
// Creates a Stripe PaymentIntent after validating cart prices server-side.
// Never trusts client-supplied prices.

const SHIPPING_FLAT = 0

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  const STRIPE_KEY    = process.env.STRIPE_SECRET_KEY
  const SUPABASE_URL  = process.env.VITE_SUPABASE_URL
  const SERVICE_KEY   = process.env.SUPABASE_SERVICE_KEY

  if (!STRIPE_KEY || !SUPABASE_URL || !SERVICE_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Server not configured' }) }
  }

  const stripe = require('stripe')(STRIPE_KEY)

  let body
  try { body = JSON.parse(event.body || '{}') } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }
  }

  const { items, shipping } = body
  if (!items?.length || !shipping?.email || !shipping?.name || !shipping?.line1) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing required fields (items, shipping.name, shipping.email, shipping.line1)' }) }
  }

  const adminHeaders = {
    apikey:        SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
  }

  try {
    // Fetch real prices from Supabase — never trust client-supplied prices
    const ids = items.map(i => i.id).join(',')
    const listingsRes = await fetch(
      `${SUPABASE_URL}/rest/v1/store_listings?id=in.(${ids})&select=id,name,price,qty_available,active`,
      { headers: adminHeaders }
    )
    const listings = await listingsRes.json()

    if (!Array.isArray(listings) || listings.length === 0) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Could not validate cart items' }) }
    }

    // Validate availability and compute subtotal
    let subtotal = 0
    for (const item of items) {
      const listing = listings.find(l => l.id === item.id)
      if (!listing)              return { statusCode: 400, body: JSON.stringify({ error: `Item not found: ${item.id}` }) }
      if (!listing.active)       return { statusCode: 400, body: JSON.stringify({ error: `${listing.name} is no longer available` }) }
      if (listing.qty_available < (item.qty || 1)) {
        return { statusCode: 400, body: JSON.stringify({ error: `Not enough stock for ${listing.name}` }) }
      }
      subtotal += listing.price * (item.qty || 1)
    }

    const total = subtotal + SHIPPING_FLAT

    // Build a human-readable description for the Stripe receipt email
    const lineItems = items.map(item => {
      const l = listings.find(x => x.id === item.id)
      const qty = item.qty || 1
      return `${l.name}${l.condition ? ` (${l.condition})` : ''} ×${qty}  $${(l.price * qty).toFixed(2)}`
    })
    const description = [
      'Vaulted Singles — Order',
      '',
      ...lineItems,
      '',
      `Order Total: $${total.toFixed(2)}`,
    ].join('\n')

    // Create PaymentIntent — store all fulfillment data in metadata
    const paymentIntent = await stripe.paymentIntents.create({
      amount:        Math.round(total * 100), // cents
      currency:      'usd',
      description,
      receipt_email: shipping.email,
      metadata: {
        items:            JSON.stringify(items.map(i => ({ id: i.id, qty: i.qty || 1 }))),
        customer_name:    (shipping.name  || '').slice(0, 500),
        customer_email:   (shipping.email || '').slice(0, 500),
        shipping_line1:   (shipping.line1 || '').slice(0, 500),
        shipping_city:    (shipping.city  || '').slice(0, 500),
        shipping_state:   (shipping.state || '').slice(0, 500),
        shipping_zip:     (shipping.zip   || '').slice(0, 500),
        shipping_country: (shipping.country || 'US').slice(0, 500),
        subtotal:         subtotal.toFixed(2),
        shipping_cost:    SHIPPING_FLAT.toFixed(2),
      },
    })

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientSecret: paymentIntent.client_secret,
        total,
        subtotal,
        shipping: SHIPPING_FLAT,
      }),
    }
  } catch (err) {
    console.error('[create-payment-intent]', err)
    return { statusCode: 500, body: JSON.stringify({ error: err.message || 'Internal error' }) }
  }
}
