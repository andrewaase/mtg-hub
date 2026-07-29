// netlify/functions/deals-admin.js
// Admin-only management of the sealed-deals store directory: add a store (with
// platform auto-detection), toggle active, or remove. Writes use the service key.
const { corsHeaders } = require('./_cors')
const { verifyAdmin } = require('./_admin')

// Fingerprint a store domain. Shopify (incl. BinderPOS) exposes /products.json;
// BigCommerce serves cdn11.bigcommerce.com assets. Anything else = unsupported.
async function detectPlatform(domain) {
  try {
    const r = await fetch(`https://${domain}/products.json?limit=1`, { headers: { 'User-Agent': 'ManaMint/1.0 (deals)' } })
    if (r.ok) {
      const j = await r.json().catch(() => null)
      if (j && Array.isArray(j.products)) return 'shopify'
    }
  } catch { /* fall through */ }
  try {
    const html = await (await fetch(`https://${domain}`, { headers: { 'User-Agent': 'ManaMint/1.0 (deals)' } })).text()
    if (/cdn11\.bigcommerce\.com|bigcommerce/i.test(html)) return 'bigcommerce'
  } catch { /* ignore */ }
  return 'unsupported'
}

async function storeName(domain) {
  try {
    const html = await (await fetch(`https://${domain}`, { headers: { 'User-Agent': 'ManaMint/1.0 (deals)' } })).text()
    const m = html.match(/<title[^>]*>([^<]+)<\/title>/i)
    if (m) return m[1].split(/[|\-–—·]/)[0].trim().slice(0, 80)
  } catch { /* ignore */ }
  return domain
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders(event) }
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) }

  const ADMIN_EMAIL  = process.env.ADMIN_EMAIL
  const SUPABASE_URL = process.env.VITE_SUPABASE_URL
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY
  if (!SUPABASE_URL || !SERVICE_KEY || !ADMIN_EMAIL) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Server not configured' }) }
  }

  const admin = await verifyAdmin(SUPABASE_URL, SERVICE_KEY, ADMIN_EMAIL, (event.headers || {})['authorization'])
  if (!admin.ok) {
    return { statusCode: admin.statusCode, headers: corsHeaders(event), body: JSON.stringify({ error: admin.error }) }
  }

  const H = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' }
  let body
  try { body = JSON.parse(event.body || '{}') } catch { return { statusCode: 400, headers: corsHeaders(event), body: JSON.stringify({ error: 'Invalid JSON' }) } }
  const { action } = body

  try {
    if (action === 'add') {
      const domain = String(body.domain || '').trim().toLowerCase()
        .replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '')
      if (!domain || !domain.includes('.')) return { statusCode: 400, headers: corsHeaders(event), body: JSON.stringify({ error: 'Enter a valid store domain' }) }
      const platform = await detectPlatform(domain)
      const name = await storeName(domain)
      const res = await fetch(`${SUPABASE_URL}/rest/v1/deal_stores?on_conflict=domain`, {
        method: 'POST',
        headers: { ...H, Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify([{ name, domain, platform, active: platform === 'shopify', status: platform === 'shopify' ? 'ready' : `unsupported (${platform})` }]),
      })
      if (!res.ok) throw new Error(await res.text())
      const [store] = await res.json()
      return { statusCode: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders(event) }, body: JSON.stringify({ store }) }
    }

    if (action === 'toggle') {
      await fetch(`${SUPABASE_URL}/rest/v1/deal_stores?id=eq.${body.id}`, { method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify({ active: !!body.active }) })
      return { statusCode: 200, headers: corsHeaders(event), body: JSON.stringify({ ok: true }) }
    }

    if (action === 'remove') {
      await fetch(`${SUPABASE_URL}/rest/v1/deal_stores?id=eq.${body.id}`, { method: 'DELETE', headers: H })
      return { statusCode: 200, headers: corsHeaders(event), body: JSON.stringify({ ok: true }) }
    }

    return { statusCode: 400, headers: corsHeaders(event), body: JSON.stringify({ error: 'Unknown action' }) }
  } catch (e) {
    return { statusCode: 500, headers: corsHeaders(event), body: JSON.stringify({ error: e.message }) }
  }
}
