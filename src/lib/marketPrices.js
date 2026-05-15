// marketPrices.js
// Tracks daily market prices for popular MTG staples, independent of the user's collection.
// Used for the Dashboard Market Movers section.
//
// Flow:
//   1. updateMarketPrices()   — call on Dashboard mount (no-op if already run today)
//   2. getMarketMovers()      — computes gainers/losers from stored history

const HISTORY_KEY = 'vs-market-history'
const FETCHED_KEY = 'vs-market-fetched-date'

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '{}') } catch { return {} }
}
function saveHistory(h) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(h)) } catch {}
}

// Fetch the top paper cards by USD price from Scryfall (one API call).
// Returns [{ name, price, img }] – cards priced $2+ that are physically playable.
async function fetchWatchlist() {
  try {
    const res = await fetch(
      'https://api.scryfall.com/cards/search' +
      '?q=usd%3E%3D2+game%3Apaper+not%3Aextra+not%3Aart_series' +
      '&order=usd&dir=desc&unique=cards'
    )
    if (!res.ok) return []
    const data = await res.json()
    return (data.data || []).map(c => ({
      name:  c.name,
      price: parseFloat(c.prices?.usd) || null,
      img:   c.image_uris?.small || c.card_faces?.[0]?.image_uris?.small || null,
    })).filter(c => c.price != null && c.price >= 2)
  } catch {
    return []
  }
}

/**
 * Fetch today's watchlist prices and append them to the stored history.
 * No-op if prices have already been fetched today (checked via localStorage key).
 * Call once on Dashboard mount.
 */
export async function updateMarketPrices() {
  const today = new Date().toISOString().slice(0, 10)
  if (localStorage.getItem(FETCHED_KEY) === today) return   // already done today

  const watchlist = await fetchWatchlist()
  if (watchlist.length === 0) return                        // Scryfall unreachable

  const history = loadHistory()
  history[today] = {}
  for (const card of watchlist) {
    history[today][card.name] = { price: card.price, img: card.img }
  }

  // Prune older than 30 days
  const allDates = Object.keys(history).sort()
  allDates.slice(0, Math.max(0, allDates.length - 30)).forEach(d => delete history[d])

  saveHistory(history)
  localStorage.setItem(FETCHED_KEY, today)
}

/**
 * Compute market movers comparing today vs ~7 days ago (or earliest available).
 * Returns:
 *   { gainers, losers, daysTracked }
 * Each item: { name, img, oldPrice, newPrice, dollarChange, pctChange }
 */
export function getMarketMovers() {
  const history    = loadHistory()
  const dates      = Object.keys(history).sort()
  const daysTracked = dates.length

  if (daysTracked < 2) return { gainers: [], losers: [], daysTracked }

  const todayDate = dates[dates.length - 1]

  // Find the reference date ~7 days back; use earliest available when history is short
  const target = new Date()
  target.setDate(target.getDate() - 7)
  const targetStr = target.toISOString().slice(0, 10)
  const refDate = [...dates].reverse().find(d => d <= targetStr) ?? dates[0]

  const todayMap = history[todayDate] ?? {}
  const refMap   = history[refDate]   ?? {}

  const deltas = []
  for (const [name, { price: newPrice, img }] of Object.entries(todayMap)) {
    const ref = refMap[name]
    if (!ref?.price) continue
    const oldPrice = ref.price
    if (oldPrice === newPrice) continue

    const dollarChange = Math.round((newPrice - oldPrice) * 100) / 100
    const pctChange    = Math.round(((newPrice - oldPrice) / oldPrice) * 1000) / 10

    deltas.push({ name, img, oldPrice, newPrice, dollarChange, pctChange })
  }

  return {
    gainers:      deltas.filter(d => d.dollarChange > 0),
    losers:       deltas.filter(d => d.dollarChange < 0),
    daysTracked,
  }
}
