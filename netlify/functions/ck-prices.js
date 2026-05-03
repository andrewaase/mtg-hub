// netlify/functions/ck-prices.js
// Proxies the Card Kingdom pricelist to avoid CORS issues.
// Cached in-memory for 1 hour per warm function instance.

let _cache   = null
let _cachedAt = 0
const TTL_MS  = 60 * 60 * 1000 // 1 hour

exports.handler = async () => {
  try {
    if (_cache && Date.now() - _cachedAt < TTL_MS) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' },
        body: _cache,
      }
    }

    const res = await fetch('https://api.cardkingdom.com/api/pricelist')
    if (!res.ok) {
      return { statusCode: 502, body: JSON.stringify({ error: 'CK API unavailable' }) }
    }

    const body = await res.text()
    _cache    = body
    _cachedAt = Date.now()

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' },
      body,
    }
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) }
  }
}
