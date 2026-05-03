// Fetches and caches CardKingdom buy/sell prices.
// Public API: https://api.cardkingdom.com/api/pricelist
// Returns JSON: { data: [{name, foil, buy_price, sell_price, ...}] }

let _ckMap = null // in-memory session cache

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

    const map = {}
    for (const item of data) {
      const key = (item.name || '').toLowerCase().trim()
      if (!map[key]) map[key] = {}
      // CK API uses price_buy / price_retail / is_foil (string 'true'/'false')
      const buyPrice  = parseFloat(item.price_buy)    || 0
      const sellPrice = parseFloat(item.price_retail) || 0
      const isFoil    = item.is_foil === 'true' || item.is_foil === true
      // Use Math.max so a card with multiple printings keeps the best buylist price
      if (isFoil) {
        map[key].buyFoil  = Math.max(map[key].buyFoil  || 0, buyPrice)
        map[key].sellFoil = Math.max(map[key].sellFoil || 0, sellPrice)
      } else {
        map[key].buyNormal  = Math.max(map[key].buyNormal  || 0, buyPrice)
        map[key].sellNormal = Math.max(map[key].sellNormal || 0, sellPrice)
      }
    }
    _ckMap = map
    return map
  } catch (err) {
    console.error('[CK] failed to load price map:', err)
    return {}
  }
}

export function getCKBuyPrice(ckMap, cardName, isFoil = false) {
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
