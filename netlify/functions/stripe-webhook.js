// netlify/functions/stripe-webhook.js
// Handles Stripe webhook events.
// On payment_intent.succeeded: creates the order in Supabase, decrements inventory,
// and sends an itemized HTML confirmation email via Resend.

// ── HTML confirmation email ──────────────────────────────────────────────────
async function sendOrderEmail({ to, firstName, name, items, subtotal, shippingCost, total, address }, resendKey) {
  const itemRows = items.map(item => `
    <tr>
      <td style="padding:10px 8px;border-bottom:1px solid #1e293b;vertical-align:middle;width:46px;">
        ${item.img_url
          ? `<img src="${item.img_url}" width="36" style="border-radius:4px;display:block;" alt="">`
          : `<div style="width:36px;height:50px;background:#1e293b;border-radius:4px;"></div>`
        }
      </td>
      <td style="padding:10px 8px;border-bottom:1px solid #1e293b;vertical-align:middle;">
        <div style="font-weight:600;font-size:14px;color:#f1f5f9;">${item.name}</div>
        <div style="font-size:12px;color:#64748b;margin-top:2px;">${[item.set_name, item.is_foil ? '✦ Foil' : ''].filter(Boolean).join(' · ')}</div>
      </td>
      <td style="padding:10px 8px;border-bottom:1px solid #1e293b;text-align:center;color:#94a3b8;font-size:13px;">${item.condition || 'NM'}</td>
      <td style="padding:10px 8px;border-bottom:1px solid #1e293b;text-align:center;font-size:13px;color:#e2e8f0;">${item.qty}</td>
      <td style="padding:10px 8px;border-bottom:1px solid #1e293b;text-align:right;font-weight:700;font-size:14px;color:#c9a84c;">$${(item.price * item.qty).toFixed(2)}</td>
    </tr>`).join('')

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0d0d0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0d0d0f;padding:32px 16px;">
<tr><td align="center">
<table width="580" cellpadding="0" cellspacing="0" style="background:#0d0d0f;border:1px solid #1e293b;border-radius:12px;overflow:hidden;max-width:580px;">

  <!-- Header -->
  <tr>
    <td style="background:linear-gradient(135deg,#0f172a,#1a1200);padding:28px 36px;text-align:center;border-bottom:1px solid rgba(201,168,76,.3);">
      <div style="color:#c9a84c;font-size:22px;font-weight:800;letter-spacing:3px;">⚡ VAULTED SINGLES</div>
      <div style="color:#94a3b8;font-size:13px;margin-top:6px;">Order Confirmed</div>
    </td>
  </tr>

  <!-- Greeting -->
  <tr>
    <td style="padding:28px 36px 4px;">
      <p style="color:#f1f5f9;font-size:18px;font-weight:700;margin:0 0 10px;">Thanks, ${firstName}! Your order is confirmed 🎉</p>
      <p style="color:#94a3b8;font-size:14px;line-height:1.7;margin:0;">Your payment was successful. We'll get your cards packed up and send a shipping notification within 1–2 business days.</p>
    </td>
  </tr>

  <!-- Items table -->
  <tr>
    <td style="padding:20px 36px 0;">
      <table width="100%" cellpadding="0" cellspacing="0" style="border-radius:8px;overflow:hidden;border:1px solid #1e293b;">
        <thead>
          <tr style="background:#1e293b;">
            <th style="padding:10px 8px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:#64748b;text-align:left;"></th>
            <th style="padding:10px 8px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:#64748b;text-align:left;">Card</th>
            <th style="padding:10px 8px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:#64748b;text-align:center;">Cond</th>
            <th style="padding:10px 8px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:#64748b;text-align:center;">Qty</th>
            <th style="padding:10px 8px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:#64748b;text-align:right;">Price</th>
          </tr>
        </thead>
        <tbody>
          ${itemRows}
          ${shippingCost > 0 ? `
          <tr>
            <td colspan="4" style="padding:10px 8px;border-bottom:1px solid #1e293b;color:#94a3b8;font-size:13px;">Shipping</td>
            <td style="padding:10px 8px;border-bottom:1px solid #1e293b;text-align:right;color:#94a3b8;font-size:13px;">$${shippingCost.toFixed(2)}</td>
          </tr>` : ''}
          <tr style="background:#1e293b;">
            <td colspan="4" style="padding:12px 8px;font-weight:700;font-size:15px;color:#f1f5f9;">Order Total</td>
            <td style="padding:12px 8px;text-align:right;font-weight:800;font-size:17px;color:#c9a84c;">$${total.toFixed(2)}</td>
          </tr>
        </tbody>
      </table>
    </td>
  </tr>

  <!-- Shipping address -->
  <tr>
    <td style="padding:16px 36px 0;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;border:1px solid #1e293b;border-radius:8px;">
        <tr>
          <td style="padding:14px 16px;">
            <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#64748b;margin-bottom:8px;">📦 Shipping To</div>
            <div style="color:#e2e8f0;font-size:14px;line-height:1.7;">${name}<br>${address.line1}<br>${address.city}, ${address.state} ${address.zip}</div>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- Footer -->
  <tr>
    <td style="padding:24px 36px;text-align:center;border-top:1px solid #1e293b;margin-top:8px;">
      <p style="color:#64748b;font-size:13px;margin:0 0 6px;">Questions about your order?</p>
      <a href="mailto:mtgvaultedsingles@gmail.com" style="color:#c9a84c;font-size:14px;font-weight:600;text-decoration:none;">mtgvaultedsingles@gmail.com</a>
      <p style="color:#475569;font-size:11px;margin:14px 0 0;">© ${new Date().getFullYear()} Vaulted Singles &nbsp;·&nbsp; <a href="https://www.vaultedsingles.com" style="color:#64748b;text-decoration:none;">vaultedsingles.com</a></p>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body>
</html>`

  const res = await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from:    'Vaulted Singles <orders@vaultedsingles.com>',
      to:      [to],
      subject: `🎴 Your Vaulted Singles order is confirmed!`,
      html,
    }),
  })
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`)
  return res.json()
}

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

    // ── 5. Send itemised confirmation email ────────────────────────────────────
    const RESEND_KEY = process.env.RESEND_API_KEY
    if (RESEND_KEY && meta.customer_email) {
      try {
        await sendOrderEmail({
          to:           meta.customer_email,
          firstName:    (meta.customer_name || 'Customer').split(' ')[0],
          name:         meta.customer_name  || '',
          items:        orderItems,
          subtotal:     parseFloat(meta.subtotal)      || 0,
          shippingCost: parseFloat(meta.shipping_cost) || 0,
          total:        pi.amount / 100,
          address: {
            line1: meta.shipping_line1  || '',
            city:  meta.shipping_city   || '',
            state: meta.shipping_state  || '',
            zip:   meta.shipping_zip    || '',
          },
        }, RESEND_KEY)
        console.log(`[stripe-webhook] Confirmation email sent to ${meta.customer_email}`)
      } catch (emailErr) {
        // Log but don't fail — the order is already created
        console.error('[stripe-webhook] Email send failed:', emailErr.message)
      }
    }

    console.log(`[stripe-webhook] Order ${order.id} created for PI ${pi.id}`)
    return { statusCode: 200, body: JSON.stringify({ received: true }) }

  } catch (err) {
    console.error('[stripe-webhook] Failed to process order:', err)
    // Return 500 so Stripe retries the webhook
    return { statusCode: 500, body: 'Failed to process order' }
  }
}
