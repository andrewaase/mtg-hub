// netlify/functions/respond-trade.js
// Accepts or declines a trade proposal. Only the recipient can respond.
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
  const { tradeId, action } = body
  if (!tradeId || !['accepted', 'declined'].includes(action)) return fail('Invalid request')

  const adminHeaders = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' }

  // Verify caller is the recipient
  const findRes = await fetch(
    `${SUPABASE_URL}/rest/v1/trades?id=eq.${tradeId}&select=id,sender_id,recipient_id,status&limit=1`,
    { headers: adminHeaders }
  )
  const rows = findRes.ok ? await findRes.json() : []
  if (!rows.length) return fail('Trade not found', 404)
  const trade = rows[0]
  if (trade.recipient_id !== caller.id) return fail('Forbidden', 403)
  if (trade.status !== 'pending') return fail('Trade already resolved')

  await fetch(`${SUPABASE_URL}/rest/v1/trades?id=eq.${tradeId}`, {
    method: 'PATCH',
    headers: { ...adminHeaders, Prefer: 'return=minimal' },
    body: JSON.stringify({ status: action }),
  })

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(event) },
    body: JSON.stringify({ ok: true, senderId: trade.sender_id }),
  }
}
