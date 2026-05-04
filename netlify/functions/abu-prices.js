// netlify/functions/abu-prices.js
// Proxies the ABU Games buylist Solr API to avoid CORS.
// Returns NM non-foil REGULAR (base-printing) cards with buy_price >= $1.00.
// Filters out alternate-art / extended-art / borderless via location_section:"Regular".
// Returns [{name, edition, buyCash, buyTrade}] so the frontend can match on name+set.
// Uses parallel page fetching. Cached in-memory for 1 hour.

const ABU_BASE = 'https://data.abugames.com/solr/nodes/select'
// location_section:"Regular" keeps only the standard printing, excluding
// Alternate Edition (Extended Art, Borderless, Showcase, Retro Frame, etc.)
const FQ = '+category:"Magic the Gathering Singles" -offline_item:true +language:"English" +buy_price:[1.00 TO *] +condition:NM +card_style:"Normal" +location_section:"Regular"'
const ROWS = 1000
// Only fetch the fields we actually use
const FL = 'simple_title,magic_edition,buy_price,trade_price'

let _cache    = null
let _cachedAt = 0
const TTL_MS  = 60 * 60 * 1000 // 1 hour

function makeUrl(start) {
  const p = new URLSearchParams({
    q:     '*:*',
    start: String(start),
    rows:  String(ROWS),
    wt:    'json',
    fq:    FQ,
    fl:    FL,
  })
  return `${ABU_BASE}?${p}`
}

exports.handler = async () => {
  try {
    if (_cache && Date.now() - _cachedAt < TTL_MS) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' },
        body: _cache,
      }
    }

    // First page — establishes total record count
    const firstRes = await fetch(makeUrl(0))
    if (!firstRes.ok) return { statusCode: 502, body: JSON.stringify({ error: 'ABU API unavailable' }) }
    const firstJson = await firstRes.json()
    const total     = firstJson.response?.numFound || 0
    const pageCount = Math.ceil(total / ROWS)

    // Remaining pages in parallel
    const restJsons = await Promise.all(
      Array.from({ length: pageCount - 1 }, (_, i) =>
        fetch(makeUrl((i + 1) * ROWS))
          .then(r => r.ok ? r.json() : null)
          .catch(() => null)
      )
    )

    // Flatten into [{name, edition, buyCash, buyTrade}]
    const data = []
    for (const page of [firstJson, ...restJsons]) {
      if (!page) continue
      for (const doc of page.response?.docs || []) {
        const name    = doc.simple_title
        const edition = Array.isArray(doc.magic_edition) ? doc.magic_edition[0] : (doc.magic_edition || '')
        const buyCash  = doc.buy_price   || 0
        const buyTrade = doc.trade_price || 0
        if (!name || buyCash <= 0) continue
        data.push({ name, edition, buyCash, buyTrade })
      }
    }

    const body = JSON.stringify({ data })
    _cache    = body
    _cachedAt = Date.now()

    console.log(`[ABU] fetched ${total} records → ${data.length} entries across ${pageCount} pages`)
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' },
      body,
    }
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) }
  }
}
