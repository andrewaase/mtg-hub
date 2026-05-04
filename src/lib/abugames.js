// Fetches and caches ABU Games buylist prices.
// Data comes from our Netlify proxy (/.netlify/functions/abu-prices)
// which queries their public Solr API at data.abugames.com.
// Only NM non-foil cards with buy_price >= $1 are included.

let _abuMap = null // name-keyed map: cardName.toLowerCase() → { buyCash, buyTrade }

export async function getABUPriceMap() {
  if (_abuMap) return _abuMap
  try {
    const res = await fetch('/.netlify/functions/abu-prices').catch(() => null)
    if (!res || !res.ok) return {}

    const { data = [] } = await res.json()
    console.log(`[ABU] loaded ${data.length} entries`)

    const map = {}
    for (const item of data) {
      const key = (item.name || '').toLowerCase().trim()
      // Keep the best (highest) cash buy price in case of duplicates
      if (!map[key] || (item.buyCash || 0) > map[key].buyCash) {
        map[key] = {
          buyCash:  item.buyCash  || 0,
          buyTrade: item.buyTrade || 0,
        }
      }
    }

    _abuMap = map
    return _abuMap
  } catch (err) {
    console.error('[ABU] failed to load price map:', err)
    return {}
  }
}

// Returns the NM cash buy price or null if ABU isn't buying this card.
export function getABUBuyPrice(abuMap, cardName) {
  const entry = abuMap[(cardName || '').toLowerCase().trim()]
  return entry && entry.buyCash > 0 ? entry.buyCash : null
}

// Deep-link into the ABU buylist filtered to this card name.
export function getABUBuylistLink(cardName) {
  // ABU uses JSON-array encoded filter params: display_title=["Lightning Bolt"]
  const encoded = encodeURIComponent(JSON.stringify([cardName]))
  return `https://www.abugames.com/buylist/magic-the-gathering/singles?display_title=${encoded}`
}
