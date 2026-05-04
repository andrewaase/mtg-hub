// Fetches and caches Star City Games buylist prices.
// Data comes from /.netlify/functions/scg-prices which queries their Meilisearch API.
// Only MTG non-foil base-printing (card_style_ids=[]) is_buying=1 singles are included.
//
// Lookup strategy:
//   1. Exact "name|setName" match  — preferred (handles multi-set reprints correctly)
//   2. Name-only fallback          — only used when the card exists in exactly ONE set
//                                    in SCG's catalog (unambiguous which price to use)

let _nameMap       = null // cardName.lower → {buyCash, buyTrade, hotlist}
let _setMap        = null // "cardName.lower|setName.lower" → {buyCash, buyTrade, hotlist}
let _singleSetMap  = null // same as _nameMap but only cards with exactly 1 set

export async function getSCGPriceMap() {
  if (_nameMap) return _nameMap // already loaded
  try {
    const res = await fetch('/.netlify/functions/scg-prices').catch(() => null)
    if (!res || !res.ok) return {}

    const { data = [] } = await res.json()
    console.log(`[SCG] loaded ${data.length} entries`)

    const nameMap  = {}
    const setMap   = {}
    const setSets  = {} // cardName.lower → Set of setName keys

    for (const item of data) {
      const nk  = (item.name    || '').toLowerCase().trim()
      const sk  = `${nk}|${(item.setName || '').toLowerCase().trim()}`
      const val = { buyCash: item.buyCash || 0, buyTrade: item.buyTrade || 0, hotlist: !!item.hotlist }

      // Name + set (exact printing)
      if (!setMap[sk] || val.buyCash > setMap[sk].buyCash) {
        setMap[sk] = val
      }
      // Name-only (best across all sets — used only for single-set fallback)
      if (!nameMap[nk] || val.buyCash > nameMap[nk].buyCash) {
        nameMap[nk] = val
      }
      // Track distinct sets per card name
      if (!setSets[nk]) setSets[nk] = new Set()
      setSets[nk].add((item.setName || '').toLowerCase().trim())
    }

    // Single-set fallback map: only unambiguous cards
    const singleSetMap = {}
    for (const [nk, sets] of Object.entries(setSets)) {
      if (sets.size === 1) singleSetMap[nk] = nameMap[nk]
    }

    _nameMap      = nameMap
    _setMap       = setMap
    _singleSetMap = singleSetMap
    return _nameMap
  } catch (err) {
    console.error('[SCG] failed to load price map:', err)
    return {}
  }
}

// Returns the NM cash buy price for this card, or null if SCG isn't buying it.
// Tries exact name+setName first. Falls back to name-only ONLY when the card
// exists in exactly one set in SCG's catalog (unambiguous which price to use).
export function getSCGBuyPrice(nameMap, cardName, setName) {
  const nk = (cardName || '').toLowerCase().trim()
  if (_setMap && setName) {
    const sk    = `${nk}|${setName.toLowerCase().trim()}`
    const exact = _setMap[sk]
    if (exact && exact.buyCash > 0) return exact.buyCash
  }
  // Single-set fallback: safe because there's only one possible price
  const entry = _singleSetMap?.[nk]
  return entry && entry.buyCash > 0 ? entry.buyCash : null
}

// True when SCG has this card on their hotlist (premium buy price).
// Tries exact name+setName first, falls back to single-set entry.
export function isSCGHotlist(nameMap, cardName, setName) {
  const nk = (cardName || '').toLowerCase().trim()
  if (_setMap && setName) {
    const sk = `${nk}|${setName.toLowerCase().trim()}`
    if (_setMap[sk]) return !!_setMap[sk].hotlist
  }
  return !!_singleSetMap?.[nk]?.hotlist
}

// Links to the SCG sell portal's MTG page — no URL-based card search is supported
// since it's a client-side SPA, so we go straight to /mtg rather than the homepage.
export function getSCGBuylistLink() {
  return 'https://sellyourcards.starcitygames.com/mtg'
}
