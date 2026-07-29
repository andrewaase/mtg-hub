// netlify/functions/harvest-deals-background.js
// Harvests sealed MTG products from each active Shopify store in deal_stores
// (via the public /products.json feed), attaches a ManaPool market price where
// it can match, and refreshes sealed_listings. Scheduled daily + manual admin POST.
const { corsHeaders } = require('./_cors')
const { isScheduledInvocation, verifyAdmin } = require('./_admin')

const SEALED_TYPE   = /sealed/i
const SINGLE_TYPE   = /single/i
const SEALED_TITLE  = /(booster box|booster display|play booster|draft booster|collector booster|set booster|booster pack|bundle|commander deck|prerelease|gift edition|starter kit|fat pack|jumpstart)/i
const MAX_PAGES     = 100

function normKey(title) {
  return (title || '').toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\b(new|sealed|english|en|preorder|pre order|in stock|nib|factory|mtg|magic the gathering|the gathering)\b/g, ' ')
    .replace(/\s+/g, ' ').trim()
}
function isSealed(p) {
  const type = p.product_type || ''
  if (SINGLE_TYPE.test(type)) return false
  if (SEALED_TYPE.test(type)) return true
  return SEALED_TITLE.test(p.title || '')
}

async function harvestShopify(domain) {
  const rows = []
  for (let page = 1; page <= MAX_PAGES; page++) {
    let res
    try { res = await fetch(`https://${domain}/products.json?limit=250&page=${page}`, { headers: { 'User-Agent': 'ManaMint/1.0 (deals)' } }) }
    catch { break }
    if (!res.ok) break
    const products = (await res.json()).products || []
    if (!products.length) break
    for (const p of products) {
      if (!isSealed(p)) continue
      const variants = p.variants || []
      const inStock  = variants.filter(v => v.available)
      const pick = (inStock.length ? inStock : variants)
        .reduce((a, b) => (parseFloat(b.price) || 1e9) < (parseFloat(a?.price) ?? 1e9) ? b : a, null)
      const price = pick ? parseFloat(pick.price) : null
      if (price == null || !(price > 0)) continue
      rows.push({
        title:    p.title,
        norm_key: normKey(p.title),
        price,
        in_stock: inStock.length > 0,
        url:      `https://${domain}/products/${p.handle}`,
        image:    p.images?.[0]?.src || null,
      })
    }
    if (products.length < 250) break
    await new Promise(r => setTimeout(r, 250)) // be polite
  }
  return rows
}

// ManaPool sealed market prices keyed by normalized name (prices are in cents).
async function manapoolMarket(email, token) {
  const map = {}
  try {
    const res = await fetch('https://manapool.com/api/v1/prices/sealed', {
      headers: { ...(email && token ? { 'X-ManaPool-Email': email, 'X-ManaPool-Access-Token': token } : {}), Accept: 'application/json' },
    })
    if (!res.ok) return map
    for (const it of ((await res.json()).data || [])) {
      const cents = it.price_market != null && typeof it.price_market === 'number' ? it.price_market : it.low_price
      if (cents == null) continue
      const k = normKey(it.name)
      if (k && (map[k] == null || cents < map[k])) map[k] = Number(cents) / 100
    }
  } catch { /* ignore */ }
  return map
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders(event) }

  const scheduled = isScheduledInvocation(event)
  if (!scheduled && event.httpMethod && event.httpMethod !== 'POST') return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) }

  const ADMIN_EMAIL  = process.env.ADMIN_EMAIL
  const SUPABASE_URL = process.env.VITE_SUPABASE_URL
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY
  if (!SUPABASE_URL || !SERVICE_KEY || !ADMIN_EMAIL) return { statusCode: 500, body: JSON.stringify({ error: 'Server not configured' }) }

  if (!scheduled) {
    const admin = await verifyAdmin(SUPABASE_URL, SERVICE_KEY, ADMIN_EMAIL, (event.headers || {})['authorization'])
    if (!admin.ok) return { statusCode: admin.statusCode, headers: corsHeaders(event), body: JSON.stringify({ error: admin.error }) }
  }

  const H = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' }

  const stores = await (await fetch(`${SUPABASE_URL}/rest/v1/deal_stores?select=*&active=eq.true&platform=eq.shopify`, { headers: H })).json()
  const market = await manapoolMarket(process.env.MANAPOOL_API_EMAIL, process.env.MANAPOOL_API_TOKEN)
  const summary = { stores: (stores || []).length, listings: 0, matched: 0, errors: [] }

  for (const store of (stores || [])) {
    try {
      const rows = await harvestShopify(store.domain)
      // Replace this store's listings
      await fetch(`${SUPABASE_URL}/rest/v1/sealed_listings?store_id=eq.${store.id}`, { method: 'DELETE', headers: H })
      const now = new Date().toISOString()
      const payload = rows.map(r => {
        const mkt = market[r.norm_key] ?? null
        if (mkt != null) summary.matched++
        return { ...r, store_id: store.id, store_name: store.name, market_price: mkt, harvested_at: now }
      })
      for (let i = 0; i < payload.length; i += 500) {
        await fetch(`${SUPABASE_URL}/rest/v1/sealed_listings`, { method: 'POST', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify(payload.slice(i, i + 500)) })
      }
      await fetch(`${SUPABASE_URL}/rest/v1/deal_stores?id=eq.${store.id}`, { method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify({ last_harvested_at: now, product_count: rows.length, status: `ok · ${rows.length} sealed` }) })
      summary.listings += rows.length
    } catch (e) {
      summary.errors.push(`${store.domain}: ${e.message}`)
      await fetch(`${SUPABASE_URL}/rest/v1/deal_stores?id=eq.${store.id}`, { method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify({ status: `error: ${e.message}`.slice(0, 200) }) })
    }
  }

  console.log('[harvest-deals]', JSON.stringify(summary))
  return { statusCode: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders(event) }, body: JSON.stringify(summary) }
}
