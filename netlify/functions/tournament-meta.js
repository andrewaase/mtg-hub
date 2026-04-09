// Proxies MTGGoldfish format staples data.
// Usage: /.netlify/functions/tournament-meta?format=standard
// Returns: { format, cards: [{name, pct, price}], updatedAt }

exports.handler = async (event) => {
  const params = event.queryStringParameters || {}
  const format = (params.format || 'standard').toLowerCase()
  const valid  = ['standard', 'modern', 'pioneer', 'legacy', 'pauper']
  if (!valid.includes(format)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid format' }) }
  }

  try {
    const url = `https://www.mtggoldfish.com/format-staples/${format}/full`
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
    })
    if (!res.ok) {
      return { statusCode: 502, body: JSON.stringify({ error: 'Failed to fetch' }) }
    }

    const html = await res.text()

    // Parse table rows: each row has card name link, % of decks, price
    const cards = []
    // Match <tr> blocks
    const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
    let trMatch
    while ((trMatch = trRegex.exec(html)) !== null) {
      const row = trMatch[1]

      // Card name from anchor href containing /price/
      const nameMatch = row.match(/href="\/price\/[^"]*">([^<]+)<\/a>/)
      if (!nameMatch) continue
      const name = nameMatch[1].trim()
      if (!name || name.length < 2) continue

      // % of decks
      const pctMatch = row.match(/([\d.]+)%/)
      const pct = pctMatch ? parseFloat(pctMatch[1]) : null
      if (pct === null || pct < 1) continue

      // Price — look for $X.XX pattern
      const priceMatch = row.match(/\$([\d,]+\.[\d]{2})/)
      const price = priceMatch ? parseFloat(priceMatch[1].replace(',', '')) : null

      cards.push({ name, pct, price })
    }

    // Sort by pct descending, remove duplicates
    const seen = new Set()
    const unique = cards
      .filter(c => { if (seen.has(c.name)) return false; seen.add(c.name); return true })
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 25)

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=3600',
      },
      body: JSON.stringify({ format, cards: unique, updatedAt: new Date().toISOString() }),
    }
  } catch (err) {
    console.error('[tournament-meta]', err.message)
    return { statusCode: 500, body: JSON.stringify({ error: 'Internal error' }) }
  }
}
