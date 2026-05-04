// Fetches and caches ABU Games buylist prices.
// Data comes from /.netlify/functions/abu-prices which queries their public Solr API.
// Only NM non-foil base-printing cards with buy_price >= $1 are included.
//
// Lookup strategy:
//   1. Exact "name|edition" match  — preferred (handles multi-edition reprints correctly)
//   2. Name-only fallback          — only used when the card exists in exactly ONE edition
//                                    in ABU's catalog (unambiguous which price to use)

let _nameMap          = null // cardName.lower → {buyCash, buyTrade}
let _editionMap       = null // "cardName.lower|edition.lower" → {buyCash, buyTrade}
let _singleEditionMap = null // same as _nameMap but only cards with exactly 1 edition

export async function getABUPriceMap() {
  if (_nameMap) return _nameMap // already loaded
  try {
    const res = await fetch('/.netlify/functions/abu-prices').catch(() => null)
    if (!res || !res.ok) return {}

    const { data = [] } = await res.json()
    console.log(`[ABU] loaded ${data.length} entries`)

    const nameMap    = {}
    const editionMap = {}
    const editionSets = {} // cardName.lower → Set of edition keys

    for (const item of data) {
      const nk  = (item.name    || '').toLowerCase().trim()
      const ek  = `${nk}|${(item.edition || '').toLowerCase().trim()}`
      const val = { buyCash: item.buyCash || 0, buyTrade: item.buyTrade || 0 }

      // Name + edition (exact printing)
      if (!editionMap[ek] || val.buyCash > editionMap[ek].buyCash) {
        editionMap[ek] = val
      }
      // Name-only (best across all sets — used only for single-edition fallback)
      if (!nameMap[nk] || val.buyCash > nameMap[nk].buyCash) {
        nameMap[nk] = val
      }
      // Track distinct editions per card name
      if (!editionSets[nk]) editionSets[nk] = new Set()
      editionSets[nk].add((item.edition || '').toLowerCase().trim())
    }

    // Single-edition fallback map: only unambiguous cards
    const singleEditionMap = {}
    for (const [nk, editions] of Object.entries(editionSets)) {
      if (editions.size === 1) singleEditionMap[nk] = nameMap[nk]
    }

    _nameMap          = nameMap
    _editionMap       = editionMap
    _singleEditionMap = singleEditionMap
    return _nameMap
  } catch (err) {
    console.error('[ABU] failed to load price map:', err)
    return {}
  }
}

// Returns the NM cash buy price for this card, or null if ABU isn't buying it.
// Tries exact name+edition first. Falls back to name-only ONLY when the card
// exists in exactly one edition in ABU's catalog (no risk of showing the wrong
// edition's price, e.g. Beta price for a common reprint).
export function getABUBuyPrice(nameMap, cardName, setName) {
  const nk = (cardName || '').toLowerCase().trim()
  if (_editionMap && setName) {
    const ek    = `${nk}|${setName.toLowerCase().trim()}`
    const exact = _editionMap[ek]
    if (exact && exact.buyCash > 0) return exact.buyCash
  }
  // Single-edition fallback: safe because there's only one possible price
  const entry = _singleEditionMap?.[nk]
  return entry && entry.buyCash > 0 ? entry.buyCash : null
}

// Deep-link into the ABU buylist filtered to this card name.
// ABU uses JSON-array encoded filter params: display_title=["Lightning Bolt"]
export function getABUBuylistLink(cardName) {
  const encoded = encodeURIComponent(JSON.stringify([cardName]))
  return `https://www.abugames.com/buylist/magic-the-gathering/singles?display_title=${encoded}`
}
