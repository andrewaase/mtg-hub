// netlify/functions/create-trade.js
// Creates a trade proposal and its line items using the service key.
const { corsHeaders } = require('./_cors')

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders(event) }
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' }

  const SUPABASE_URL = process.env.VITE_SUPABASE_URL
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY
  const fail = (msg, status = 400) => ({
    statusCode: status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(event) },
    body: JSON.stringify({ error: msg }),
  })
  if (!SUPABASE_URL || !SERVICE_KEY) return fail('Server misconfigured', 500)

  const authHeader = (event.headers || {})['authorization'] || ''
  const userJwt = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!userJwt) return fail('Unauthorized', 401)

  const verifyRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${userJwt}` },
  })
  if (!verifyRes.ok) return fail('Unauthorized', 401)
  const caller = await verifyRes.json()

  let body
  try { body = JSON.parse(event.body || '{}') } catch { return fail('Invalid JSON') }
  const { recipientId, items, message } = body
  if (!recipientId || !Array.isArray(items) || items.length === 0) return fail('Missing required fields')

  const adminHeaders = {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  }

  // Insert trade row
  const tradeRes = await fetch(`${SUPABASE_URL}/rest/v1/trades`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      sender_id: caller.id,
      recipient_id: recipientId,
      status: 'pending',
      message: message || null,
    }),
  })
  if (!tradeRes.ok) {
    console.error('[create-trade] trade insert error:', await tradeRes.text())
    return fail('Failed to create trade', 500)
  }
  const [trade] = await tradeRes.json()

  // Insert trade items
  const itemRows = items.map(it => ({
    trade_id: trade.id,
    card_name: it.name,
    qty: it.qty || 1,
    condition: it.condition || null,
    is_foil: it.isFoil || false,
    price: it.price || null,
    img: it.img || null,
  }))
  const itemsRes = await fetch(`${SUPABASE_URL}/rest/v1/trade_items`, {
    method: 'POST',
    headers: { ...adminHeaders, Prefer: 'return=minimal' },
    body: JSON.stringify(itemRows),
  })
  if (!itemsRes.ok) {
    console.error('[create-trade] items insert error:', await itemsRes.text())
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(event) },
    body: JSON.stringify({ ok: true, tradeId: trade.id }),
  }
}
