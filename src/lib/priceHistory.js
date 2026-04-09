// priceHistory.js
// Stores daily portfolio value snapshots and per-card price history in localStorage.
// Used for the collection value chart (Dashboard) and gainers/losers tracking.

const KEY = 'mtg-hub-price-history'

function load() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') } catch { return {} }
}

function save(data) {
  try { localStorage.setItem(KEY, JSON.stringify(data)) } catch { /* storage full */ }
}

// Call once per app session after collection is loaded.
// Writes a new portfolio snapshot if today hasn't been recorded yet.
// Also updates per-card price records used for gainers/losers.
export function takeSnapshot(collection) {
  if (!collection || collection.length === 0) return

  const today = new Date().toISOString().slice(0, 10)
  const hist  = load()
  const snapshots  = hist.snapshots  || []
  const cardPrices = hist.cardPrices || {}

  // Portfolio snapshot — one per calendar day
  const isNewDay = snapshots.length === 0 || snapshots[snapshots.length - 1].date !== today
  if (isNewDay) {
    const totalMid = collection.reduce((s, c) => s + (parseFloat(c.price) || 0) * (c.qty || 1), 0)
    snapshots.push({
      date:      today,
      totalMid:  Math.round(totalMid * 100) / 100,
      totalLow:  Math.round(totalMid * 0.80 * 100) / 100,
      totalHigh: Math.round(totalMid * 1.25 * 100) / 100,
    })
    if (snapshots.length > 90) snapshots.shift()
  }

  // Per-card price history — used for gainers/losers
  collection.forEach(c => {
    const price = parseFloat(c.price) || 0
    if (price === 0) return
    const key = `${c.name}__${c.collectorNum || ''}`
    const entries = cardPrices[key] || []
    const last = entries[entries.length - 1]
    if (last?.date === today) {
      last.price = price // update today's entry in-place
    } else {
      entries.push({ date: today, price })
      if (entries.length > 30) entries.shift()
    }
    cardPrices[key] = entries
  })

  save({ ...hist, snapshots, cardPrices })
}

// Returns last N daily portfolio snapshots (oldest first).
export function getSnapshots(days = 30) {
  return (load().snapshots || []).slice(-days)
}

// Returns { gainers, losers } based on price change since the earliest recorded price.
// Only cards with >= 1% change are included.
export function getGainersLosers(collection) {
  if (!collection || collection.length === 0) return { gainers: [], losers: [] }
  const cardPrices = load().cardPrices || {}
  const deltas = []

  collection.forEach(c => {
    const key  = `${c.name}__${c.collectorNum || ''}`
    const hist = cardPrices[key]
    if (!hist || hist.length < 2) return

    const oldPrice = hist[0].price
    const newPrice = parseFloat(c.price) || 0
    if (oldPrice <= 0 || newPrice <= 0) return

    const pctChange    = ((newPrice - oldPrice) / oldPrice) * 100
    const dollarChange = (newPrice - oldPrice) * (c.qty || 1)
    if (Math.abs(pctChange) < 1) return

    deltas.push({
      name:        c.name,
      img:         c.img,
      qty:         c.qty || 1,
      pctChange:   Math.round(pctChange * 10) / 10,
      dollarChange: Math.round(dollarChange * 100) / 100,
      oldPrice:    Math.round(oldPrice * 100) / 100,
      newPrice:    Math.round(newPrice * 100) / 100,
      daysTracked: hist.length,
    })
  })

  // Sort by absolute dollar impact first (most meaningful to the user)
  deltas.sort((a, b) => Math.abs(b.dollarChange) - Math.abs(a.dollarChange))

  return {
    gainers: deltas.filter(d => d.pctChange > 0).slice(0, 5),
    losers:  deltas.filter(d => d.pctChange < 0).slice(0, 5),
  }
}

// Returns the price history array for a single card (for per-card sparklines).
export function getCardPriceHistory(cardName, collectorNum = '') {
  const key = `${cardName}__${collectorNum}`
  return (load().cardPrices || {})[key] || []
}

// Returns top movers sorted by % change over last 7 days (or all available history).
// Each item: { name, img, qty, pct7d, dollar7d, daysTracked, currentPrice }
export function getVelocity(collection) {
  if (!collection || collection.length === 0) return { gainers: [], losers: [] }
  const cardPrices = load().cardPrices || {}
  const results = []

  collection.forEach(c => {
    const key  = `${c.name}__${c.collectorNum || ''}`
    const hist = cardPrices[key]
    if (!hist || hist.length < 2) return

    const currentPrice = parseFloat(c.price) || 0
    if (currentPrice <= 0) return

    // Find a price ~7 days ago (or earliest available)
    const target = new Date()
    target.setDate(target.getDate() - 7)
    const targetStr = target.toISOString().slice(0, 10)
    const oldEntry = hist.find(h => h.date <= targetStr) || hist[0]
    if (!oldEntry || oldEntry.price <= 0) return

    const pct = ((currentPrice - oldEntry.price) / oldEntry.price) * 100
    if (Math.abs(pct) < 2) return // ignore tiny moves

    const dollar7d = (currentPrice - oldEntry.price) * (c.qty || 1)

    results.push({
      name:         c.name,
      img:          c.img,
      qty:          c.qty || 1,
      pct7d:        Math.round(pct * 10) / 10,
      dollar7d:     Math.round(dollar7d * 100) / 100,
      currentPrice: Math.round(currentPrice * 100) / 100,
      daysTracked:  hist.length,
    })
  })

  results.sort((a, b) => Math.abs(b.dollar7d) - Math.abs(a.dollar7d))
  return {
    gainers: results.filter(r => r.pct7d > 0).slice(0, 5),
    losers:  results.filter(r => r.pct7d < 0).slice(0, 5),
  }
}
