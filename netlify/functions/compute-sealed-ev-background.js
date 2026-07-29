// netlify/functions/compute-sealed-ev-background.js
const { corsHeaders } = require('./_cors')
const { isScheduledInvocation, verifyAdmin } = require('./_admin')
// Computes accurate sealed Expected Value (EV) for recent sets using MTGJSON
// booster configurations (real slot sheets + pull weights) priced with live
// Scryfall market data, plus the real box price from the ManaPool API, and
// stores the result in the sealed_ev table.
//
// EV of one pack of a booster type:
//   EV = Σ_variations (variation.weight / boostersTotalWeight)
//          × Σ_(sheet,count) count × sheetEV(sheet)
//   sheetEV(sheet) = Σ_cards (cardWeight / sheet.totalWeight) × price(card, sheet.foil)
//
// Triggered by the weekly Netlify schedule, or a manual admin POST.

const YEARS_BACK    = 3
const SET_TYPES     = new Set(['expansion', 'core', 'draft_innovation', 'masters'])
const PACKS_PER_BOX = { draft: 36, play: 30, set: 30, collector: 12, jumpstart: 24 }
// Shared bonus / special-guest sheets that modern boosters pull from. Their
// cards live in these separate MTGJSON sets, not the main set file, so we fetch
// them once and merge their uuid→scryfallId maps in for pricing.
const BONUS_SETS    = ['SPG', 'PLST', 'WOT', 'MUL', 'BIG', 'OTP', 'REX']
// Box name patterns for matching ManaPool sealed products to a booster type.
const BOX_NAME = {
  play:      /play booster box/i,
  draft:     /draft booster box/i,
  collector: /collector booster box/i,
  set:       /set booster box/i,
  jumpstart: /jumpstart booster box/i,
}

async function scryfallPrices(scryfallIds) {
  const priceById = {}
  const ids = [...new Set(scryfallIds)].filter(Boolean)
  for (let i = 0; i < ids.length; i += 75) {
    const identifiers = ids.slice(i, i + 75).map(id => ({ id }))
    try {
      const res = await fetch('https://api.scryfall.com/cards/collection', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': 'ManaMint/1.0 (mtgvaultedsingles@gmail.com)' },
        body:    JSON.stringify({ identifiers }),
      })
      if (!res.ok) continue
      const { data } = await res.json()
      for (const c of (data || [])) {
        priceById[c.id] = {
          usd:      c.prices?.usd      != null ? parseFloat(c.prices.usd)      : null,
          usd_foil: c.prices?.usd_foil != null ? parseFloat(c.prices.usd_foil) : null,
          name:     c.name,
        }
      }
    } catch { /* skip batch */ }
    if (i + 75 < ids.length) await new Promise(r => setTimeout(r, 120))
  }
  return priceById
}

// Build a shared uuid→scryfallId map from the bonus/special-guest sets.
async function buildBonusMap() {
  const map = {}
  for (const code of BONUS_SETS) {
    try {
      const r = await fetch(`https://mtgjson.com/api/v5/${code}.json`)
      if (!r.ok) continue
      const d = (await r.json()).data
      for (const c of (d?.cards || [])) {
        if (c.identifiers?.scryfallId) map[c.uuid] = c.identifiers.scryfallId
      }
    } catch { /* skip */ }
  }
  return map
}

// Pull all sealed-product prices from ManaPool (public/price endpoint).
async function fetchSealedPrices(email, token) {
  try {
    const res = await fetch('https://manapool.com/api/v1/prices/sealed', {
      headers: {
        ...(email && token ? { 'X-ManaPool-Email': email, 'X-ManaPool-Access-Token': token } : {}),
        'Accept': 'application/json',
      },
    })
    if (!res.ok) return []
    return (await res.json()).data || []
  } catch { return [] }
}

function boxPriceFor(sealedItems, setCode, boosterType) {
  const pat = BOX_NAME[boosterType]
  if (!pat) return null
  const prices = sealedItems
    .filter(it => (it.set_code || '').toLowerCase() === setCode.toLowerCase() && pat.test(it.name || ''))
    .map(it => (it.low_price != null ? Number(it.low_price) : (typeof it.price_market === 'number' ? it.price_market : null)))
    .filter(v => v != null && v > 0)
    .map(v => v / 100) // ManaPool prices are in cents
  return prices.length ? Math.min(...prices) : null
}

// Compute EV for every booster type in one MTGJSON set object.
function computeSetEV(setData, priceById, uuidToScryfall) {
  const results = []
  for (const [boosterType, cfg] of Object.entries(setData.booster || {})) {
    const sheets = cfg.sheets || {}
    const totalW = cfg.boostersTotalWeight || (cfg.boosters || []).reduce((s, b) => s + (b.weight || 0), 0)
    if (!totalW || !(cfg.boosters || []).length) continue

    const sheetEV = {}
    const cardContrib = []
    for (const [name, sheet] of Object.entries(sheets)) {
      const sw = sheet.totalWeight || Object.values(sheet.cards || {}).reduce((s, w) => s + w, 0)
      if (!sw) { sheetEV[name] = 0; continue }
      let ev = 0
      for (const [uuid, weight] of Object.entries(sheet.cards || {})) {
        const sid   = uuidToScryfall[uuid]
        const p     = sid ? priceById[sid] : null
        const price = p ? (sheet.foil ? (p.usd_foil ?? p.usd ?? 0) : (p.usd ?? 0)) : 0
        const prob  = weight / sw
        ev += prob * price
        if (price >= 3 && p) cardContrib.push({ name: p.name, foil: !!sheet.foil, price, per_pack_prob: prob })
      }
      sheetEV[name] = ev
    }

    let evPerPack = 0
    for (const variation of cfg.boosters) {
      const vw = (variation.weight || 0) / totalW
      let vEV = 0
      for (const [sheetName, count] of Object.entries(variation.contents || {})) {
        vEV += count * (sheetEV[sheetName] || 0)
      }
      evPerPack += vw * vEV
    }

    const packsPerBox = PACKS_PER_BOX[boosterType] ?? null
    const topMap = {}
    for (const c of cardContrib) {
      const k = `${c.name}|${c.foil}`
      if (!topMap[k] || c.price > topMap[k].price) topMap[k] = c
    }
    const topCards = Object.values(topMap)
      .sort((a, b) => b.price - a.price)
      .slice(0, 12)
      .map(c => ({ name: c.name, foil: c.foil, price: Math.round(c.price * 100) / 100 }))

    // Per-slot breakdown: expected count of each sheet per pack × that sheet's
    // average card value = the slot's contribution to pack EV (they sum to EV).
    const slotAgg = {}
    for (const variation of cfg.boosters) {
      const vw = (variation.weight || 0) / totalW
      for (const [sheetName, count] of Object.entries(variation.contents || {})) {
        slotAgg[sheetName] = (slotAgg[sheetName] || 0) + vw * count
      }
    }
    const slots = Object.entries(slotAgg).map(([name, avgCount]) => ({
      name,
      foil:         !!sheets[name]?.foil,
      avg_count:    Math.round(avgCount * 100) / 100,
      avg_value:    Math.round((sheetEV[name] || 0) * 100) / 100,
      contribution: Math.round(avgCount * (sheetEV[name] || 0) * 100) / 100,
      pool:         Object.keys(sheets[name]?.cards || {}).length,
    })).sort((a, b) => b.contribution - a.contribution)

    results.push({
      booster_type:  boosterType,
      ev_per_pack:   Math.round(evPerPack * 100) / 100,
      packs_per_box: packsPerBox,
      ev_per_box:    packsPerBox ? Math.round(evPerPack * packsPerBox * 100) / 100 : null,
      top_cards:     topCards,
      detail:        { slots },
    })
  }
  return results
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders(event) }

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
    return { statusCode: 500, body: JSON.stringify({ error: 'Server not configured' }) }
  }

  if (!scheduled) {
    const admin = await verifyAdmin(SUPABASE_URL, SERVICE_KEY, ADMIN_EMAIL, (event.headers || {})['authorization'])
    if (!admin.ok) {
      return { statusCode: admin.statusCode, headers: corsHeaders(event), body: JSON.stringify({ error: admin.error }) }
    }
  }

  const adminHeaders = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' }

  // Recent, paper, draftable sets from Scryfall.
  const cutoff = new Date(); cutoff.setFullYear(cutoff.getFullYear() - YEARS_BACK)
  let sets
  try {
    const res = await fetch('https://api.scryfall.com/sets', { headers: { 'User-Agent': 'ManaMint/1.0 (mtgvaultedsingles@gmail.com)' } })
    const all = (await res.json()).data || []
    sets = all.filter(s =>
      !s.digital && SET_TYPES.has(s.set_type) && (s.card_count || 0) >= 50 &&
      s.released_at && new Date(s.released_at) >= cutoff && new Date(s.released_at) <= new Date()
    )
  } catch {
    return { statusCode: 502, headers: corsHeaders(event), body: JSON.stringify({ error: 'Scryfall sets fetch failed' }) }
  }

  // Shared bonus-card map + sealed box prices (fetched once, reused per set).
  const bonusMap     = await buildBonusMap()
  const sealedPrices = await fetchSealedPrices(MP_EMAIL, MP_TOKEN)

  const summary = { sets_considered: sets.length, sets_computed: 0, rows_upserted: 0, box_prices: 0, skipped: [], errors: [] }

  for (const set of sets) {
    try {
      const mj = await fetch(`https://mtgjson.com/api/v5/${set.code.toUpperCase()}.json`)
      if (!mj.ok) { summary.skipped.push(`${set.code}: no MTGJSON (${mj.status})`); continue }
      const data = (await mj.json()).data
      if (!data?.booster || !Object.keys(data.booster).length) { summary.skipped.push(`${set.code}: no booster data`); continue }

      // uuid → scryfallId: bonus sheets first, then this set's own cards.
      const uuidToScryfall = { ...bonusMap }
      for (const c of (data.cards || [])) {
        if (c.identifiers?.scryfallId) uuidToScryfall[c.uuid] = c.identifiers.scryfallId
      }
      const needed = new Set()
      for (const cfg of Object.values(data.booster)) {
        for (const sheet of Object.values(cfg.sheets || {})) {
          for (const uuid of Object.keys(sheet.cards || {})) {
            const sid = uuidToScryfall[uuid]
            if (sid) needed.add(sid)
          }
        }
      }

      const priceById = await scryfallPrices([...needed])
      const evRows = computeSetEV(data, priceById, uuidToScryfall)
      if (!evRows.length) { summary.skipped.push(`${set.code}: no computable boosters`); continue }

      const payload = evRows.map(r => {
        const box_price = boxPriceFor(sealedPrices, set.code, r.booster_type)
        if (box_price != null) summary.box_prices++
        return { set_code: set.code, set_name: set.name, released_at: set.released_at, computed_at: new Date().toISOString(), box_price, ...r }
      })
      const up = await fetch(`${SUPABASE_URL}/rest/v1/sealed_ev?on_conflict=set_code,booster_type`, {
        method:  'POST',
        headers: { ...adminHeaders, Prefer: 'resolution=merge-duplicates,return=minimal' },
        body:    JSON.stringify(payload),
      })
      if (!up.ok) { summary.errors.push(`${set.code}: upsert ${up.status} ${await up.text()}`); continue }

      summary.sets_computed++
      summary.rows_upserted += payload.length
    } catch (err) {
      summary.errors.push(`${set.code}: ${err.message}`)
    }
  }

  console.log('[compute-sealed-ev]', JSON.stringify(summary))
  return { statusCode: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders(event) }, body: JSON.stringify(summary) }
}
