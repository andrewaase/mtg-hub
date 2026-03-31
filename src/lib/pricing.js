// pricing.js
// Bulk price refresh, smart pricing suggestions, deck market value.

import { delay } from './utils'

const PRICE_CACHE_KEY = 'mtg-hub-card-price-cache'
const CACHE_TTL = 24 * 60 * 60 * 1000 // 24 hours

function loadCache() {
  try { return JSON.parse(localStorage.getItem(PRICE_CACHE_KEY) || '{}') } catch { return {} }
}

function saveCache(c) {
  try { localStorage.setItem(PRICE_CACHE_KEY, JSON.stringify(c)) } catch { /* storage full */ }
}

export function getCachedPrice(cardName) {
  const cache = loadCache()
  const entry = cache[cardName.toLowerCase()]
  if (!entry) return null
  if (Date.now() - entry.cachedAt > CACHE_TTL) return null
  return entry.price
}

function setCachedPrice(cardName, price) {
  const cache = loadCache()
  cache[cardName.toLowerCase()] = { price, cachedAt: Date.now() }
  // Prune oldest entries when cache exceeds 600 cards
  const keys = Object.keys(cache)
  if (keys.length > 600) {
    keys.sort((a, b) => cache[a].cachedAt - cache[b].cachedAt)
      .slice(0, 100)
      .forEach(k => delete cache[k])
  }
  saveCache(cache)
}

// ── Bulk refresh ──────────────────────────────────────────────────────────────
// Re-fetches Scryfall prices for every card in the collection.
// Uses set+collector for exact printings (preserves foil/alt-art prices).
// onProgress(done, total) called after each card.
// Returns array of { id, price } to apply to collection state.
export async function bulkRefreshPrices(collection, { onProgress } = {}) {
  const updates = []

  for (let i = 0; i < collection.length; i++) {
    const card = collection[i]
    try {
      let data = null

      if (card.setCode && card.collectorNum) {
        const res = await fetch(
          `https://api.scryfall.com/cards/${encodeURIComponent(card.setCode)}/${encodeURIComponent(card.collectorNum)}`
        )
        if (res.ok) data = await res.json()
      }

      if (!data) {
        const res = await fetch(
          `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(card.name)}`
        )
        if (res.ok) data = await res.json()
      }

      if (data?.prices) {
        const usd      = data.prices.usd      ? parseFloat(data.prices.usd)      : null
        const usdFoil  = data.prices.usd_foil ? parseFloat(data.prices.usd_foil) : null
        const price    = card.isFoil ? (usdFoil ?? usd) : (usd ?? usdFoil)
        if (price != null) {
          updates.push({ id: card.id, price })
          setCachedPrice(card.name, price)
        }
      }
    } catch { /* skip card */ }

    if (onProgress) onProgress(i + 1, collection.length)
    await delay(110) // ~9 req/s, Scryfall rate limit is 10
  }

  return updates
}

// ── Smart pricing ─────────────────────────────────────────────────────────────
// Returns suggested sale price at a given margin below market.
// Default: 5% below market (competitive but not the cheapest listing).
export function suggestPrice(marketPrice, margin = 0.95) {
  if (!marketPrice || marketPrice <= 0) return null
  return Math.max(0.01, Math.round(marketPrice * margin * 100) / 100)
}

// ── Deck market value ─────────────────────────────────────────────────────────
// Instant calculation using collection prices + localStorage cache.
// Returns { ownedValue, cachedValue, cardValues, unknownCards }.
export function getDeckValueSync(deck, collection) {
  const allCards = [
    ...(deck.mainboard || []),
    ...(deck.sideboard || []),
    ...(deck.commander ? [{ qty: 1, name: deck.commander }] : []),
  ]

  let ownedValue  = 0
  let cachedValue = 0
  const cardValues  = {}
  const unknownCards = []

  for (const card of allCards) {
    const owned   = collection.find(c => c.name.toLowerCase() === card.name.toLowerCase())
    const cached  = getCachedPrice(card.name)
    const price   = owned?.price ?? cached ?? null

    cardValues[card.name] = price

    if (price != null) {
      cachedValue += price * card.qty
      if (owned) ownedValue += price * card.qty
    } else {
      unknownCards.push(card.name)
    }
  }

  return { ownedValue, cachedValue, cardValues, unknownCards }
}

// Fetches market prices for cards not in collection or cache.
// onProgress(done, total) for UI feedback.
export async function fetchUnknownDeckPrices(unknownCards, { onProgress } = {}) {
  const prices = {}
  for (let i = 0; i < unknownCards.length; i++) {
    const name = unknownCards[i]
    try {
      const res = await fetch(
        `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(name)}`
      )
      if (res.ok) {
        const data = await res.json()
        const price = data.prices?.usd ? parseFloat(data.prices.usd) : null
        if (price != null) {
          prices[name] = price
          setCachedPrice(name, price)
        }
      }
    } catch { /* skip */ }
    if (onProgress) onProgress(i + 1, unknownCards.length)
    await delay(110)
  }
  return prices
}
