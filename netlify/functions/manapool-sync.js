// netlify/functions/manapool-sync.js
const { corsHeaders } = require('./_cors')
const { isScheduledInvocation, verifyAdmin } = require('./_admin')
// Pulls current inventory from ManaPool (the primary sales channel) and
// reconciles Mana Mint's store_listings quantities to match — ManaPool is the
// source of truth. Any card previously sent to ManaPool that's no longer in its
// inventory is treated as sold out (qty 0, hidden). Cards never sent to ManaPool
// (last_exported_at IS NULL) are left untouched.
//
// Triggered two ways (same pattern as update-prices):
//   1. Netlify scheduler — arrives as httpMethod 'POST' with the x-nf-event:
//      schedule header (that header, not an absent httpMethod, is what marks
//      a genuine cron trigger). No auth for that path.
//   2. Manual HTTP POST from the admin "Sync now" button (requires admin JWT).

const MP_BASE = 'https://manapool.com/api/v1'

// Pull the seller's full ManaPool inventory, following the cursor pagination.
async function fetchManapoolInventory(email, token) {
  const items = []
  let cursor = ''
  for (let guard = 0; guard < 500; guard++) {
    const url = new URL(`${MP_BASE}/seller/inventory`)
    url.searchParams.set('limit', '500')
    if (cursor) url.searchParams.set('cursor', cursor)
    const res = await fetch(url.toString(), {
      headers: {
        'X-ManaPool-Email':        email,
        'X-ManaPool-Access-Token': token,
        'Accept':                  'application/json',
      },
    })
    if (!res.ok) throw new Error(`ManaPool inventory HTTP ${res.status}`)
    const data = await res.json()
    const page = data.inventory || []
    items.push(...page)
    cursor = data.next_cursor || ''
    if (!cursor || page.length === 0) break
  }
  return items
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(event) }
  }
  const scheduled = isScheduledInvocation(event)
  if (!scheduled && event.httpMethod && event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) }
  }

  const ADMIN_EMAIL  = process.env.ADMIN_EMAIL
  const SUPABASE_URL = process.env.VITE_SUPABASE_URL
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY
  const MP_EMAIL     = process.env.MANAPOOL_API_EMAIL
  const MP_TOKEN     = process.env.MANAPOOL_API_TOKEN

  if (!SUPABASE_URL || !SERVICE_KEY || !ADMIN_EMAIL) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Server not configured (Supabase)' }) }
  }
  if (!MP_EMAIL || !MP_TOKEN) {
    return { statusCode: 500, headers: corsHeaders(event), body: JSON.stringify({ error: 'ManaPool API credentials not configured' }) }
  }

  // ── Auth check (skipped for genuine scheduled invocations) ────────────────
  if (!scheduled) {
    const admin = await verifyAdmin(SUPABASE_URL, SERVICE_KEY, ADMIN_EMAIL, (event.headers || {})['authorization'])
    if (!admin.ok) {
      return { statusCode: admin.statusCode, headers: corsHeaders(event), body: JSON.stringify({ error: admin.error }) }
    }
  }

  const adminHeaders = {
    'apikey':        SERVICE_KEY,
    'Authorization': `Bearer ${SERVICE_KEY}`,
    'Content-Type':  'application/json',
  }

  // ── 1. Pull ManaPool inventory ────────────────────────────────────────────
  let mpItems
  try {
    mpItems = await fetchManapoolInventory(MP_EMAIL, MP_TOKEN)
  } catch (err) {
    console.error('[manapool-sync] ManaPool fetch failed:', err)
    return { statusCode: 502, headers: corsHeaders(event), body: JSON.stringify({ error: `ManaPool: ${err.message}` }) }
  }

  // Index by scryfall_id and by name (finish + condition included in the key).
  // finish_id: NF = nonfoil, FO/EF = foil. condition_id already matches our scale.
  const bySid = {}, byName = {}
  for (const it of mpItems) {
    if (it.product_type !== 'mtg_single') continue
    const s = it.product?.single
    if (!s) continue
    const qty    = it.quantity || 0
    const isFoil = !!s.finish_id && s.finish_id !== 'NF'
    const cond   = (s.condition_id || 'NM').toUpperCase()
    if (s.scryfall_id) { const k = `${s.scryfall_id}|${isFoil}|${cond}`; bySid[k]  = (bySid[k]  || 0) + qty }
    if (s.name)        { const k = `${s.name.toLowerCase()}|${isFoil}|${cond}`; byName[k] = (byName[k] || 0) + qty }
  }

  // ── 2. Fetch Mana Mint single listings ────────────────────────────────────
  let listings
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/store_listings?select=id,scryfall_id,name,is_foil,condition,qty_available,active,last_exported_at&or=(product_type.eq.single,product_type.is.null)&limit=10000`,
      { headers: adminHeaders }
    )
    listings = await res.json()
    if (!Array.isArray(listings)) throw new Error('unexpected listings response')
  } catch (err) {
    console.error('[manapool-sync] Failed to fetch listings:', err)
    return { statusCode: 500, headers: corsHeaders(event), body: JSON.stringify({ error: 'Could not fetch listings' }) }
  }

  // ── 3. Reconcile ──────────────────────────────────────────────────────────
  const updates = []
  for (const l of listings) {
    const cond    = l.condition || 'NM'
    const isFoil  = !!l.is_foil
    const sidKey  = l.scryfall_id ? `${l.scryfall_id}|${isFoil}|${cond}` : null
    const nameKey = `${(l.name || '').toLowerCase()}|${isFoil}|${cond}`
    const cur     = l.qty_available || 0

    let fileQty = null
    if (sidKey && sidKey in bySid) fileQty = bySid[sidKey]
    else if (nameKey in byName)    fileQty = byName[nameKey]

    if (fileQty != null) {
      if (fileQty !== cur) updates.push({ id: l.id, newQty: fileQty })
    } else if (l.last_exported_at && cur > 0) {
      updates.push({ id: l.id, newQty: 0 }) // sent to ManaPool but gone now → sold out
    }
  }

  // ── 4. Apply, grouped by target quantity ──────────────────────────────────
  let applied = 0
  const errors = []
  const byQty = {}
  for (const u of updates) { (byQty[u.newQty] ||= []).push(u.id) }

  for (const [q, ids] of Object.entries(byQty)) {
    const qn    = Number(q)
    const patch = qn === 0 ? { qty_available: 0, active: false } : { qty_available: qn }
    for (let i = 0; i < ids.length; i += 100) {
      const chunk = ids.slice(i, i + 100)
      try {
        const res = await fetch(
          `${SUPABASE_URL}/rest/v1/store_listings?id=in.(${chunk.join(',')})`,
          { method: 'PATCH', headers: { ...adminHeaders, 'Prefer': 'return=minimal' }, body: JSON.stringify(patch) }
        )
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        applied += chunk.length
      } catch (err) {
        errors.push(err.message)
      }
    }
  }

  const summary = {
    manapool_items: mpItems.length,
    listings:       listings.length,
    updated:        updates.filter(u => u.newQty > 0).length,
    sold_out:       updates.filter(u => u.newQty === 0).length,
    applied,
    synced_at:      new Date().toISOString(),
    ...(errors.length && { errors }),
  }
  console.log('[manapool-sync]', summary)

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(event) },
    body: JSON.stringify(summary),
  }
}
