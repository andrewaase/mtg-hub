// netlify/functions/respond-trade.js
// Accepts or declines a trade proposal. Only the recipient can respond.
// Optionally syncs both users' collections when accepting.
const { corsHeaders } = require('./_cors')

async function adjustCollection(SUPABASE_URL, adminHeaders, userId, items, delta) {
  // Fetch the user's full collection once, filter in memory (handles special chars in names)
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/collection?user_id=eq.${userId}&select=id,name,qty`,
    { headers: adminHeaders }
  )
  const existing = res.ok ? await res.json() : []
  const byName = Object.fromEntries(existing.map(r => [r.name.toLowerCase(), r]))

  for (const item of items) {
    const key  = (item.card_name || '').toLowerCase()
    const row  = byName[key]
    const diff = delta * (item.qty || 1)

    if (row) {
      const newQty = row.qty + diff
      if (newQty <= 0) {
        await fetch(`${SUPABASE_URL}/rest/v1/collection?id=eq.${row.id}`,
          { method: 'DELETE', headers: adminHeaders })
      } else {
        await fetch(`${SUPABASE_URL}/rest/v1/collection?id=eq.${row.id}`, {
          method: 'PATCH',
          headers: { ...adminHeaders, Prefer: 'return=minimal' },
          body: JSON.stringify({ qty: newQty }),
        })
      }
    } else if (delta > 0) {
      // Card doesn't exist yet — insert it
      await fetch(`${SUPABASE_URL}/rest/v1/collection`, {
        method: 'POST',
        headers: { ...adminHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify({
          user_id:   userId,
          name:      item.card_name,
          qty:       item.qty || 1,
          condition: item.condition || 'NM',
          is_foil:   item.is_foil || false,
          price:     item.price || null,
          img:       item.img || null,
        }),
      })
    }
  }
}

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
  const { tradeId, action, removeFromMine = false, addToTheirs = false } = body
  if (!tradeId || !['accepted', 'declined'].includes(action)) return fail('Invalid request')

  const adminHeaders = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' }

  // Verify caller is the recipient and fetch trade
  const findRes = await fetch(
    `${SUPABASE_URL}/rest/v1/trades?id=eq.${tradeId}&select=id,sender_id,recipient_id,status&limit=1`,
    { headers: adminHeaders }
  )
  const rows = findRes.ok ? await findRes.json() : []
  if (!rows.length) return fail('Trade not found', 404)
  const trade = rows[0]
  if (trade.recipient_id !== caller.id) return fail('Forbidden', 403)
  if (trade.status !== 'pending') return fail('Trade already resolved')

  // Update trade status
  await fetch(`${SUPABASE_URL}/rest/v1/trades?id=eq.${tradeId}`, {
    method: 'PATCH',
    headers: { ...adminHeaders, Prefer: 'return=minimal' },
    body: JSON.stringify({ status: action }),
  })

  // Sync collections if accepting and flags are set
  if (action === 'accepted' && (removeFromMine || addToTheirs)) {
    const itemsRes = await fetch(
      `${SUPABASE_URL}/rest/v1/trade_items?trade_id=eq.${tradeId}&select=*`,
      { headers: adminHeaders }
    )
    const items = itemsRes.ok ? await itemsRes.json() : []

    await Promise.all([
      removeFromMine && adjustCollection(SUPABASE_URL, adminHeaders, trade.recipient_id, items, -1),
      addToTheirs    && adjustCollection(SUPABASE_URL, adminHeaders, trade.sender_id,    items, +1),
    ].filter(Boolean))
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(event) },
    body: JSON.stringify({ ok: true, senderId: trade.sender_id }),
  }
}
