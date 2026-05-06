// netlify/functions/spike-predictor.js
// Queries Supabase meta_card_snapshots for the last two weekly snapshots,
// computes week-over-week play-rate and price deltas, and returns cards
// where play rate is rising but price hasn't fully followed yet.
//
// Usage: GET /.netlify/functions/spike-predictor?format=all&limit=20
// Returns: { week, prevWeek, spikes: [{card_name, format, pct_now, pct_prev, pct_delta, price_now, price_prev, price_delta, signal}] }

function getWeekStart(offsetWeeks = 0) {
  const d   = new Date()
  const day = d.getUTCDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setUTCDate(d.getUTCDate() + diff + offsetWeeks * -7)
  return d.toISOString().slice(0, 10)
}

exports.handler = async (event) => {
  const SUPABASE_URL = process.env.VITE_SUPABASE_URL
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY

  if (!SUPABASE_URL || !SERVICE_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Missing Supabase env vars' }) }
  }

  const params   = event.queryStringParameters || {}
  const format   = (params.format || 'all').toLowerCase()
  const limit    = Math.min(parseInt(params.limit || '30', 10), 100)

  const thisWeek = getWeekStart(0)
  const lastWeek = getWeekStart(1)

  // If no data for this week yet, look back one more week (function may not have run yet)
  async function fetchWeek(week, fmt) {
    let url = `${SUPABASE_URL}/rest/v1/meta_card_snapshots?week=eq.${week}&order=pct_of_decks.desc`
    if (fmt !== 'all') url += `&format=eq.${fmt}`
    url += '&select=card_name,format,week,pct_of_decks,price'
    const res = await fetch(url, {
      headers: {
        'apikey':        SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
      },
    })
    if (!res.ok) return []
    return res.json()
  }

  try {
    let [current, previous] = await Promise.all([
      fetchWeek(thisWeek, format),
      fetchWeek(lastWeek, format),
    ])

    // If this week is empty, fall back one week (ingest hasn't run yet)
    let resolvedThisWeek = thisWeek
    let resolvedLastWeek = lastWeek
    if (current.length === 0) {
      resolvedThisWeek = lastWeek
      resolvedLastWeek = getWeekStart(2)
      ;[current, previous] = await Promise.all([
        fetchWeek(resolvedThisWeek, format),
        fetchWeek(resolvedLastWeek, format),
      ])
    }

    if (current.length === 0) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ week: resolvedThisWeek, prevWeek: resolvedLastWeek, spikes: [], noData: true }),
      }
    }

    // Build lookup map from previous week: key = "card_name|format"
    const prevMap = {}
    for (const row of previous) {
      prevMap[`${row.card_name}|${row.format}`] = row
    }

    // Compute deltas and classify signal
    const spikes = []
    for (const row of current) {
      const key  = `${row.card_name}|${row.format}`
      const prev = prevMap[key]
      if (!prev) continue  // no comparison point

      const pctNow  = parseFloat(row.pct_of_decks) || 0
      const pctPrev = parseFloat(prev.pct_of_decks) || 0
      if (pctNow < 2) continue  // filter noise (< 2% play rate)
      if (pctPrev === 0) continue

      const pctDelta   = pctNow - pctPrev           // percentage point change
      const pctRelDelta = pctPrev > 0 ? (pctDelta / pctPrev) * 100 : 0

      const priceNow  = parseFloat(row.price)  || null
      const pricePrev = parseFloat(prev.price) || null
      const priceDelta = (priceNow != null && pricePrev != null)
        ? priceNow - pricePrev : null
      const priceRelDelta = (priceDelta != null && pricePrev > 0)
        ? (priceDelta / pricePrev) * 100 : null

      // ── Signal classification ──────────────────────────────────────────
      // Strong spike: play rate up ≥20% relative, price up < 15%  → BUY WINDOW
      // Moderate:     play rate up ≥10% relative, price up < 25%  → WATCH
      // Cooling:      play rate down significantly                 → DROPPING
      let signal = null
      if (pctRelDelta >= 20 && (priceRelDelta == null || priceRelDelta < 15)) {
        signal = 'buy'
      } else if (pctRelDelta >= 10 && (priceRelDelta == null || priceRelDelta < 25)) {
        signal = 'watch'
      } else if (pctRelDelta <= -20) {
        signal = 'dropping'
      }

      if (!signal) continue  // only surface cards with a clear signal

      spikes.push({
        card_name:       row.card_name,
        format:          row.format,
        pct_now:         pctNow,
        pct_prev:        pctPrev,
        pct_delta:       Math.round(pctDelta * 10) / 10,
        pct_rel_delta:   Math.round(pctRelDelta),
        price_now:       priceNow,
        price_prev:      pricePrev,
        price_delta:     priceDelta != null ? Math.round(priceDelta * 100) / 100 : null,
        price_rel_delta: priceRelDelta != null ? Math.round(priceRelDelta) : null,
        signal,
      })
    }

    // Sort: 'buy' first, then 'watch', then by pct_rel_delta desc
    const ORDER = { buy: 0, watch: 1, dropping: 2 }
    spikes.sort((a, b) =>
      ORDER[a.signal] - ORDER[b.signal] || b.pct_rel_delta - a.pct_rel_delta
    )

    return {
      statusCode: 200,
      headers: {
        'Content-Type':                'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control':               'public, max-age=3600',
      },
      body: JSON.stringify({
        week:     resolvedThisWeek,
        prevWeek: resolvedLastWeek,
        total:    spikes.length,
        spikes:   spikes.slice(0, limit),
      }),
    }
  } catch (err) {
    console.error('[spike-predictor]', err)
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) }
  }
}
