// netlify/functions/stripe-webhook.js
// Handles Stripe webhook events.
// On payment_intent.succeeded: creates the order in Supabase and decrements inventory.

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  const STRIPE_KEY       = process.env.STRIPE_SECRET_KEY
  const WEBHOOK_SECRET   = process.env.STRIPE_WEBHOOK_SECRET
  const SUPABASE_URL     = process.env.VITE_SUPABASE_URL
  const SERVICE_KEY      = process.env.SUPABASE_SERVICE_KEY

  if (!STRIPE_KEY || !WEBHOOK_SECRET || !SUPABASE_URL || !SERVICE_KEY) {
    console.error('[stripe-webhook] Missing env vars')
    return { statusCode: 500, body: 'Server not configured' }
  }

  const stripe = require('stripe')(STRIPE_KEY)
  const sig    = event.headers['stripe-signature'] || ''

  // Raw body needed for signature verification; Netlify may base64-encode it
  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64').toString('utf-8')
    : event.body

  let stripeEvent
  try {
    stripeEvent = stripe.webhooks.constructEvent(rawBody, sig, WEBHOOK_SECRET)
  } catch (err) {
    console.error('[stripe-webhook] Signature verification failed:', err.message)
    return { statusCode: 400, body: `Webhook error: ${err.message}` }
  }

  // ── Only handle successful payments ──────────────────────────────────────────
  if (stripeEvent.type !== 'payment_intent.succeeded') {
    return { statusCode: 200, body: JSON.stringify({ received: true }) }
  }

  const pi   = stripeEvent.data.object
  const meta = pi.metadata || {}

  const adminHeaders = {
    apikey:         SERVICE_KEY,
    Authorization:  `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
    Prefer:         'return=representation',
  }

  try {
    const items = JSON.parse(meta.items || '[]')
    if (!items.length) throw new Error('No items in metadata')

    // ── 1. Create order ─────────────────────────────────────────────────────
    const orderRes = await fetch(`${SUPABASE_URL}/rest/v1/orders`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        stripe_payment_intent: pi.id,
        customer_email:  meta.customer_email || pi.receipt_email || '',
        customer_name:   meta.customer_name  || '',
        shipping_line1:  meta.shipping_line1  || '',
        shipping_city:   meta.shipping_city   || '',
        shipping_state:  meta.shipping_state  || '',
        shipping_zip:    meta.shipping_zip    || '',
        shipping_country: meta.shipping_country || 'US',
        subtotal:        parseFloat(meta.subtotal)      || 0,
        shipping_cost:   parseFloat(meta.shipping_cost) || 4.99,
        total:           pi.amount / 100,
        status:          'paid',
      }),
    })
    const [order] = await orderRes.json()
    if (!order?.id) throw new Error('Failed to create order row')

    // ── 2. Fetch listing details for order_items ─────────────────────────────
    const ids = items.map(i => i.id).join(',')
    const listingsRes = await fetch(
      `${SUPABASE_URL}/rest/v1/store_listings?id=in.(${ids})&select=id,name,set_name,condition,is_foil,img_url,price,qty_available`,
      { headers: adminHeaders }
    )
    const listings = await listingsRes.json()

    // ── 3. Insert order_items ────────────────────────────────────────────────
    const orderItems = items.map(item => {
      const l = listings.find(x => x.id === item.id) || {}
      return {
        order_id:   order.id,
        listing_id: item.id,
        name:       l.name     || 'Unknown',
        set_name:   l.set_name || null,
        condition:  l.condition || null,
        is_foil:    l.is_foil  || false,
        img_url:    l.img_url  || null,
        price:      l.price    || 0,
        qty:        item.qty   || 1,
      }
    })

    await fetch(`${SUPABASE_URL}/rest/v1/order_items`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify(orderItems),
    })

    // ── 4. Decrement inventory ───────────────────────────────────────────────
    for (const item of items) {
      const l      = listings.find(x => x.id === item.id)
      if (!l) continue
      const newQty = Math.max(0, (l.qty_available || 0) - (item.qty || 1))
      await fetch(
        `${SUPABASE_URL}/rest/v1/store_listings?id=eq.${item.id}`,
        {
          method: 'PATCH',
          headers: adminHeaders,
          body: JSON.stringify({ qty_available: newQty }),
        }
      )
    }

    console.log(`[stripe-webhook] Order ${order.id} created for PI ${pi.id}`)
    return { statusCode: 200, body: JSON.stringify({ received: true }) }

  } catch (err) {
    console.error('[stripe-webhook] Failed to process order:', err)
    // Return 500 so Stripe retries the webhook
    return { statusCode: 500, body: 'Failed to process order' }
  }
}
