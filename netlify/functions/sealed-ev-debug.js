// netlify/functions/sealed-ev-debug.js
// TEMPORARY diagnostic for the sealed EV pipeline. Returns status of each step
// synchronously so we can see why compute-sealed-ev-background isn't writing.
// Returns no secrets. Delete after diagnosis.
const { corsHeaders } = require('./_cors')

exports.handler = async (event) => {
  const out = {}
  const SUPABASE_URL = process.env.VITE_SUPABASE_URL
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY
  out.env = {
    supabase:  !!SUPABASE_URL,
    service:   !!SERVICE_KEY,
    admin:     !!process.env.ADMIN_EMAIL,
    mp_email:  !!process.env.MANAPOOL_API_EMAIL,
    mp_token:  !!process.env.MANAPOOL_API_TOKEN,
  }

  // 1. Scryfall recent-set filter
  try {
    const r = await fetch('https://api.scryfall.com/sets')
    const all = (await r.json()).data || []
    const cutoff = new Date(); cutoff.setFullYear(cutoff.getFullYear() - 3)
    const T = new Set(['expansion', 'core', 'draft_innovation', 'masters'])
    const recent = all.filter(s => !s.digital && T.has(s.set_type) && (s.card_count || 0) >= 50 &&
      s.released_at && new Date(s.released_at) >= cutoff && new Date(s.released_at) <= new Date())
    out.scryfall_sets = { status: r.status, recent_count: recent.length, sample: recent.slice(0, 6).map(s => s.code) }
  } catch (e) { out.scryfall_sets = { error: e.message } }

  // 2. MTGJSON reachability — with and without a User-Agent
  for (const [label, headers] of [['noUA', {}], ['UA', { 'User-Agent': 'ManaMint/1.0 (mtgvaultedsingles@gmail.com)' }]]) {
    try {
      const r = await fetch('https://mtgjson.com/api/v5/FDN.json', { headers })
      const txt = await r.text()
      let hasBooster = false
      try { hasBooster = !!JSON.parse(txt).data?.booster } catch {}
      out['mtgjson_' + label] = { status: r.status, bytes: txt.length, hasBooster, snippet: txt.slice(0, 60) }
    } catch (e) { out['mtgjson_' + label] = { error: e.message } }
  }

  // 3. ManaPool sealed prices
  try {
    const r = await fetch('https://manapool.com/api/v1/prices/sealed', {
      headers: {
        'X-ManaPool-Email': process.env.MANAPOOL_API_EMAIL || '',
        'X-ManaPool-Access-Token': process.env.MANAPOOL_API_TOKEN || '',
        Accept: 'application/json',
      },
    })
    const j = await r.json().catch(() => ({}))
    out.manapool_sealed = { status: r.status, count: (j.data || []).length, sample: (j.data || []).slice(0, 2).map(x => ({ set: x.set_code, name: x.name, low: x.low_price })) }
  } catch (e) { out.manapool_sealed = { error: e.message } }

  // 4. Service-role write test (self-cleaning)
  try {
    const h = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' }
    const up = await fetch(`${SUPABASE_URL}/rest/v1/sealed_ev?on_conflict=set_code,booster_type`, {
      method: 'POST', headers: { ...h, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify([{ set_code: '__debug__', booster_type: '__debug__', ev_per_pack: 1, box_price: 1 }]),
    })
    out.write_test = { status: up.status, body: up.ok ? 'ok' : (await up.text()).slice(0, 200) }
    await fetch(`${SUPABASE_URL}/rest/v1/sealed_ev?set_code=eq.__debug__`, { method: 'DELETE', headers: h })
  } catch (e) { out.write_test = { error: e.message } }

  return { statusCode: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders(event) }, body: JSON.stringify(out, null, 1) }
}
