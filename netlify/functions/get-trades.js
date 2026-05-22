// netlify/functions/get-trades.js
// Returns all trade proposals (sent and received) for the authenticated user.
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

  const adminHeaders = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }

  const tradesRes = await fetch(
    `${SUPABASE_URL}/rest/v1/trades?or=(sender_id.eq.${caller.id},recipient_id.eq.${caller.id})&order=created_at.desc`,
    { headers: adminHeaders }
  )
  const trades = tradesRes.ok ? await tradesRes.json() : []
  if (!trades.length) {
    return { statusCode: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders(event) }, body: JSON.stringify({ trades: [] }) }
  }

  const tradeIds = trades.map(t => t.id).join(',')
  const [itemsRes, usersRes, profilesRes] = await Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/trade_items?trade_id=in.(${tradeIds})&order=id.asc`, { headers: adminHeaders }),
    fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=1000`, { headers: adminHeaders }),
    fetch(`${SUPABASE_URL}/rest/v1/profiles?select=id,username`, { headers: adminHeaders }),
  ])
  const items    = itemsRes.ok    ? await itemsRes.json()    : []
  const allUsers = usersRes.ok    ? (await usersRes.json()).users || [] : []
  const profiles = profilesRes.ok ? await profilesRes.json() : []

  const userMap    = Object.fromEntries(allUsers.map(u => [u.id, u.email?.split('@')[0] || 'Unknown']))
  const profileMap = Object.fromEntries(profiles.map(p => [p.id, p.username]))

  const buildName = id => profileMap[id] || userMap[id] || 'Unknown'

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(event) },
    body: JSON.stringify({
      trades: trades.map(t => ({
        ...t,
        items: items.filter(i => i.trade_id === t.id),
        senderName:    buildName(t.sender_id),
        recipientName: buildName(t.recipient_id),
      })),
    }),
  }
}
