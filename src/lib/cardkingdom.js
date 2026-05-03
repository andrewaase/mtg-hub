// Fetches and caches CardKingdom buy/sell prices.
// Public API: https://api.cardkingdom.com/api/pricelist
// Returns JSON: { data: [{name, is_foil, price_buy, price_retail, scryfall_id, ...}] }

let _ckMap         = null // name-based map  (cardName.toLowerCase() → {buyNormal, buyFoil, …})
let _ckScryfallMap = null // scryfall-id map (scryfallId            → {buyNormal, buyFoil, …})

export async function getCKPriceMap() {
  if (_ckMap) return _ckMap
  try {
    // Try Netlify proxy first (avoids CORS), fall back to direct if proxy errors
    let res = await fetch('/.netlify/functions/ck-prices').catch(() => null)
    if (!res || !res.ok) {
      res = await fetch('https://api.cardkingdom.com/api/pricelist')
    }
    if (!res || !res.ok) return {}

    const json = await res.json()
    const data = json.data || []
    console.log(`[CK] loaded ${data.length} entries`)

    const nameMap     = {}
    const scryfallMap = {}

    for (const item of data) {
      // CK API uses price_buy / price_retail / is_foil (string 'true'/'false')
      const buyPrice  = parseFloat(item.price_buy)    || 0
      const sellPrice = parseFloat(item.price_retail) || 0
      const isFoil    = item.is_foil === 'true' || item.is_foil === true

      // ── Name-based map (best price across all printings) ──────────────────
      const nameKey = (item.name || '').toLowerCase().trim()
      if (!nameMap[nameKey]) nameMap[nameKey] = {}
      if (isFoil) {
        nameMap[nameKey].buyFoil  = Math.max(nameMap[nameKey].buyFoil  || 0, buyPrice)
        nameMap[nameKey].sellFoil = Math.max(nameMap[nameKey].sellFoil || 0, sellPrice)
      } else {
        nameMap[nameKey].buyNormal  = Math.max(nameMap[nameKey].buyNormal  || 0, buyPrice)
        nameMap[nameKey].sellNormal = Math.max(nameMap[nameKey].sellNormal || 0, sellPrice)
      }

      // ── Scryfall-ID map (exact printing price) ────────────────────────────
      // Multiple CK entries can share a scryfall_id (e.g. foil vs non-foil of
      // the same printing), so use Math.max here too for safety.
      if (item.scryfall_id) {
        const sfKey = item.scryfall_id
        if (!scryfallMap[sfKey]) scryfallMap[sfKey] = {}
        if (isFoil) {
          scryfallMap[sfKey].buyFoil  = Math.max(scryfallMap[sfKey].buyFoil  || 0, buyPrice)
          scryfallMap[sfKey].sellFoil = Math.max(scryfallMap[sfKey].sellFoil || 0, sellPrice)
        } else {
          scryfallMap[sfKey].buyNormal  = Math.max(scryfallMap[sfKey].buyNormal  || 0, buyPrice)
          scryfallMap[sfKey].sellNormal = Math.max(scryfallMap[sfKey].sellNormal || 0, sellPrice)
        }
      }
    }

    _ckMap         = nameMap
    _ckScryfallMap = scryfallMap
    return _ckMap
  } catch (err) {
    console.error('[CK] failed to load price map:', err)
    return {}
  }
}

// scryfallId is optional — when provided, does an exact printing match first,
// then falls back to the best-price-across-all-printings name match.
export function getCKBuyPrice(ckMap, cardName, isFoil = false, scryfallId = null) {
  if (scryfallId && _ckScryfallMap) {
    const exact = _ckScryfallMap[scryfallId]
    if (exact) {
      const price = isFoil ? (exact.buyFoil || exact.buyNormal || null) : (exact.buyNormal || null)
      if (price) return price // found an exact match with a non-zero buy price
    }
  }
  // Fall back to best-across-all-printings name map
  const entry = ckMap[(cardName || '').toLowerCase().trim()]
  if (!entry) return null
  return isFoil ? (entry.buyFoil || entry.buyNormal || null) : (entry.buyNormal || null)
}

// Returns null | 'good' (≥65%) | 'strong' (≥80%)
export function getSellSignal(ckBuyPrice, marketPrice) {
  if (!ckBuyPrice || !marketPrice || marketPrice <= 0) return null
  const ratio = ckBuyPrice / marketPrice
  if (ratio >= 0.80) return 'strong'
  if (ratio >= 0.65) return 'good'
  return null
}
