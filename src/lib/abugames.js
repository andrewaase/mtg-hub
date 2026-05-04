// Fetches and caches ABU Games buylist prices.
// Data comes from /.netlify/functions/abu-prices which queries their public Solr API.
// Only NM non-foil base-printing cards with buy_price >= $1 are included.
//
// The price map has two levels of keys:
//   "name|edition"  — exact printing match (preferred)
//   "name"          — best price across all sets (fallback)

let _nameMap    = null // cardName.lower → {buyCash, buyTrade}
let _editionMap = null // "cardName.lower|edition.lower" → {buyCash, buyTrade}

export async function getABUPriceMap() {
  if (_nameMap) return _nameMap // already loaded
  try {
    const res = await fetch('/.netlify/functions/abu-prices').catch(() => null)
    if (!res || !res.ok) return {}

    const { data = [] } = await res.json()
    console.log(`[ABU] loaded ${data.length} entries`)

    const nameMap    = {}
    const editionMap = {}

    for (const item of data) {
      const nk  = (item.name    || '').toLowerCase().trim()
      const ek  = `${nk}|${(item.edition || '').toLowerCase().trim()}`
      const val = { buyCash: item.buyCash || 0, buyTrade: item.buyTrade || 0 }

      // Name + edition (exact printing)
      if (!editionMap[ek] || val.buyCash > editionMap[ek].buyCash) {
        editionMap[ek] = val
      }
      // Name-only fallback (best across all sets)
      if (!nameMap[nk] || val.buyCash > nameMap[nk].buyCash) {
        nameMap[nk] = val
      }
    }

    _nameMap    = nameMap
    _editionMap = editionMap
    return _nameMap
  } catch (err) {
    console.error('[ABU] failed to load price map:', err)
    return {}
  }
}

// Returns the NM cash buy price for this card, or null if ABU isn't buying it.
// Requires an exact name+setName match — no name-only fallback to avoid returning
// the wrong price (e.g. Beta price) for common printings of multi-edition cards.
export function getABUBuyPrice(nameMap, cardName, setName) {
  if (_editionMap && setName) {
    const ek    = `${(cardName || '').toLowerCase().trim()}|${setName.toLowerCase().trim()}`
    const exact = _editionMap[ek]
    if (exact && exact.buyCash > 0) return exact.buyCash
  }
  return null
}

// Deep-link into the ABU buylist filtered to this card name.
// ABU uses JSON-array encoded filter params: display_title=["Lightning Bolt"]
export function getABUBuylistLink(cardName) {
  const encoded = encodeURIComponent(JSON.stringify([cardName]))
  return `https://www.abugames.com/buylist/magic-the-gathering/singles?display_title=${encoded}`
}
