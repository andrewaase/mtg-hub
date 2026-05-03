// Fetches and caches CardKingdom buy/sell prices.
// Public API: https://api.cardkingdom.com/api/pricelist
// Returns JSON: { data: [{name, foil, buy_price, sell_price, ...}] }

let _ckMap = null // in-memory session cache

export async function getCKPriceMap() {
  if (_ckMap) return _ckMap
  try {
    const res = await fetch('/.netlify/functions/ck-prices')
    if (!res.ok) return {}
    const { data } = await res.json()
    const map = {}
    for (const item of (data || [])) {
      const key = (item.name || '').toLowerCase().trim()
      if (!map[key]) map[key] = {}
      if (item.foil) {
        map[key].buyFoil  = parseFloat(item.buy_price)  || 0
        map[key].sellFoil = parseFloat(item.sell_price) || 0
      } else {
        map[key].buyNormal  = parseFloat(item.buy_price)  || 0
        map[key].sellNormal = parseFloat(item.sell_price) || 0
      }
    }
    _ckMap = map
    return map
  } catch { return {} }
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
