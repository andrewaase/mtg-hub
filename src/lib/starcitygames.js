// Fetches and caches Star City Games buylist prices.
// Data comes from our Netlify proxy (/.netlify/functions/scg-prices)
// which queries their Meilisearch API at search.starcitygames.com.
// Only MTG singles (game_id=1, non-foil, is_buying=1) are included.

let _scgMap = null // name-keyed map: cardName.toLowerCase() → { buyCash, buyTrade, hotlist }

export async function getSCGPriceMap() {
  if (_scgMap) return _scgMap
  try {
    const res = await fetch('/.netlify/functions/scg-prices').catch(() => null)
    if (!res || !res.ok) return {}

    const { data = [] } = await res.json()
    console.log(`[SCG] loaded ${data.length} entries`)

    const map = {}
    for (const item of data) {
      const key = (item.name || '').toLowerCase().trim()
      // Keep the best (highest) cash buy price in case of duplicates
      if (!map[key] || (item.buyCash || 0) > map[key].buyCash) {
        map[key] = {
          buyCash:  item.buyCash  || 0,
          buyTrade: item.buyTrade || 0,
          hotlist:  !!item.hotlist,
        }
      }
    }

    _scgMap = map
    return _scgMap
  } catch (err) {
    console.error('[SCG] failed to load price map:', err)
    return {}
  }
}

// Returns the NM cash buy price or null if SCG isn't buying this card.
export function getSCGBuyPrice(scgMap, cardName) {
  const entry = scgMap[(cardName || '').toLowerCase().trim()]
  return entry && entry.buyCash > 0 ? entry.buyCash : null
}

// True when SCG has marked this card as a hotlist item (premium buy).
export function isSCGHotlist(scgMap, cardName) {
  return !!scgMap[(cardName || '').toLowerCase().trim()]?.hotlist
}

// Deep-link into the SCG sell page searching for this card.
export function getSCGBuylistLink(cardName) {
  return `https://sellyourcards.starcitygames.com/?q=${encodeURIComponent(cardName)}`
}
