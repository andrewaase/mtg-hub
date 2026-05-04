// netlify/functions/scg-prices.js
// Proxies the Star City Games buylist API to avoid CORS.
// The bearer token is the public key embedded in sellyourcards.starcitygames.com/js/app.js
// Filters to base-printing only (card_style_ids = []) to avoid returning extended art /
// borderless / showcase prices for standard cards.
// Returns [{name, setName, buyCash, buyTrade, hotlist}] for name+set matching.
// Uses parallel page fetching. Cached in-memory for 1 hour.

const SCG_SEARCH = 'https://search.starcitygames.com/indexes/sell_list_products_v2/search'
const SCG_BEARER = '93ea1c4b1d97ce79e8cb8b860a3b20b1493b2d3eb0fb647590409bf03bf2ffca'
const LIMIT = 1000

let _cache    = null
let _cachedAt = 0
const TTL_MS  = 60 * 60 * 1000 // 1 hour

function fetchPage(offset) {
  return fetch(SCG_SEARCH, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${SCG_BEARER}`,
    },
    body: JSON.stringify({
      // finish=1 = non-foil; card_style_ids IS EMPTY = base printing only
      filter: 'is_buying = 1 AND game_id = 1 AND finish = 1 AND card_style_ids IS EMPTY',
      limit:  LIMIT,
      offset,
    }),
  }).then(r => r.ok ? r.json() : null).catch(() => null)
}

function hitsToData(hits) {
  const data = []
  for (const hit of hits || []) {
    const nmVariant = (hit.variants || []).find(v => v.variant_value === 'NM')
    const buyCash   = nmVariant?.buy_price  ?? hit.primary_buy_price ?? 0
    const buyTrade  = nmVariant?.trade_price ?? 0
    if (buyCash <= 0) continue
    data.push({
      name:    hit.name,
      setName: hit.set_name || '',
      buyCash,
      buyTrade,
      hotlist: !!hit.hotlist,
    })
  }
  return data
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

    // First page — establishes total count
    const first = await fetchPage(0)
    if (!first) return { statusCode: 502, body: JSON.stringify({ error: 'SCG API unavailable' }) }

    const total     = first.estimatedTotalHits || first.totalHits || 0
    const pageCount = Math.ceil(total / LIMIT)

    // Remaining pages in parallel
    const restPages = await Promise.all(
      Array.from({ length: pageCount - 1 }, (_, i) => fetchPage((i + 1) * LIMIT))
    )

    // Flatten all hits
    const data = []
    for (const page of [first, ...restPages]) {
      if (!page) continue
      data.push(...hitsToData(page.hits))
    }

    const body = JSON.stringify({ data })
    _cache    = body
    _cachedAt = Date.now()

    console.log(`[SCG] fetched ${total} base-printing records → ${data.length} buying entries across ${pageCount} pages`)
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' },
      body,
    }
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) }
  }
}
