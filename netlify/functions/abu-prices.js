// netlify/functions/abu-prices.js
// Proxies the ABU Games buylist Solr API to avoid CORS.
// Returns NM non-foil cards with buy_price >= $1.00, grouped by card name.
// Uses parallel page fetching to stay well within function timeout.
// Cached in-memory for 1 hour per warm function instance.

const ABU_BASE = 'https://data.abugames.com/solr/nodes/select'
const FQ = '+category:"Magic the Gathering Singles" -offline_item:true +language:"English" +buy_price:[1.00 TO *] +condition:NM +card_style:"Normal"'
const ROWS = 1000

let _cache    = null
let _cachedAt = 0
const TTL_MS  = 60 * 60 * 1000 // 1 hour

function makeUrl(start) {
  const p = new URLSearchParams({
    q:              '*:*',
    group:          'true',
    'group.field':  'simple_title',
    'group.ngroups':'true',
    'group.limit':  '1',
    'group.sort':   'buy_price desc',
    start:          String(start),
    rows:           String(ROWS),
    wt:             'json',
    fq:             FQ,
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

    // First page — establishes total group count
    const firstRes = await fetch(makeUrl(0))
    if (!firstRes.ok) return { statusCode: 502, body: JSON.stringify({ error: 'ABU API unavailable' }) }
    const firstJson = await firstRes.json()
    const gi0 = firstJson.grouped?.simple_title
    if (!gi0) return { statusCode: 500, body: JSON.stringify({ error: 'Unexpected ABU response shape' }) }

    const total     = gi0.ngroups || 0
    const pageCount = Math.ceil(total / ROWS)

    // Remaining pages in parallel
    const restJsons = await Promise.all(
      Array.from({ length: pageCount - 1 }, (_, i) =>
        fetch(makeUrl((i + 1) * ROWS))
          .then(r => r.ok ? r.json() : null)
          .catch(() => null)
      )
    )

    // Flatten into [{name, buyCash, buyTrade}]
    const data = []
    for (const page of [firstJson, ...restJsons]) {
      if (!page) continue
      for (const group of page.grouped?.simple_title?.groups || []) {
        const doc = group.doclist?.docs?.[0]
        if (!doc) continue
        data.push({
          name:     group.groupValue,
          buyCash:  doc.buy_price   || 0,
          buyTrade: doc.trade_price || 0,
        })
      }
    }

    const body = JSON.stringify({ data })
    _cache    = body
    _cachedAt = Date.now()

    console.log(`[ABU] fetched ${data.length} entries across ${pageCount} pages`)
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' },
      body,
    }
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) }
  }
}
