// Fetches and caches Star City Games buylist prices.
// Data comes from /.netlify/functions/scg-prices which queries their Meilisearch API.
// Only MTG non-foil base-printing (card_style_ids=[]) is_buying=1 singles are included.
//
// The price map has two levels of keys:
//   "name|setName"  — exact printing match (preferred)
//   "name"          — best price across all sets (fallback)

let _nameMap  = null // cardName.lower → {buyCash, buyTrade, hotlist}
let _setMap   = null // "cardName.lower|setName.lower" → {buyCash, buyTrade, hotlist}

export async function getSCGPriceMap() {
  if (_nameMap) return _nameMap // already loaded
  try {
    const res = await fetch('/.netlify/functions/scg-prices').catch(() => null)
    if (!res || !res.ok) return {}

    const { data = [] } = await res.json()
    console.log(`[SCG] loaded ${data.length} entries`)

    const nameMap = {}
    const setMap  = {}

    for (const item of data) {
      const nk  = (item.name    || '').toLowerCase().trim()
      const sk  = `${nk}|${(item.setName || '').toLowerCase().trim()}`
      const val = { buyCash: item.buyCash || 0, buyTrade: item.buyTrade || 0, hotlist: !!item.hotlist }

      // Name + set (exact printing)
      if (!setMap[sk] || val.buyCash > setMap[sk].buyCash) {
        setMap[sk] = val
      }
      // Name-only fallback
      if (!nameMap[nk] || val.buyCash > nameMap[nk].buyCash) {
        nameMap[nk] = val
      }
    }

    _nameMap = nameMap
    _setMap  = setMap
    return _nameMap
  } catch (err) {
    console.error('[SCG] failed to load price map:', err)
    return {}
  }
}

// Returns the NM cash buy price for this card, or null if SCG isn't buying it.
// Requires an exact name+setName match — no name-only fallback to avoid returning
// the wrong price for common printings of multi-edition cards.
export function getSCGBuyPrice(nameMap, cardName, setName) {
  if (_setMap && setName) {
    const sk    = `${(cardName || '').toLowerCase().trim()}|${setName.toLowerCase().trim()}`
    const exact = _setMap[sk]
    if (exact && exact.buyCash > 0) return exact.buyCash
  }
  return null
}

// True when SCG has this card on their hotlist (premium buy price).
// Requires an exact name+setName match — no name-only fallback.
export function isSCGHotlist(nameMap, cardName, setName) {
  if (_setMap && setName) {
    const sk = `${(cardName || '').toLowerCase().trim()}|${setName.toLowerCase().trim()}`
    if (_setMap[sk]) return !!_setMap[sk].hotlist
  }
  return false
}

// Links to the SCG sell portal's MTG page — no URL-based card search is supported
// since it's a client-side SPA, so we go straight to /mtg rather than the homepage.
export function getSCGBuylistLink() {
  return 'https://sellyourcards.starcitygames.com/mtg'
}
