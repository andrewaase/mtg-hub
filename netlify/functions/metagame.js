// netlify/functions/metagame.js
// Scrapes MTGTop8 format metagame breakdown page.
// Usage: /.netlify/functions/metagame?format=modern&window=2weeks
// Returns: { format, window, totalDecks, categories: [{name, pct, archetypes: [{id, name, pct, trend}]}], updatedAt }

const FORMAT_MAP = {
  standard: 'ST',
  modern:   'MO',
  pioneer:  'PI',
  legacy:   'LE',
  pauper:   'PAU',
  vintage:  'VI',
}

// MTGTop8 uses numeric meta IDs to filter time windows
const META_MAP = {
  '2weeks':  58,
  'month':   44,
  'alltime':  0,
}

// Known category labels on MTGTop8 metagame pages
const CATEGORY_NAMES = new Set([
  'AGGRO', 'CONTROL', 'COMBO', 'MIDRANGE', 'AGGRO-COMBO',
  'RAMP', 'TEMPO', 'PRISON', 'HYBRID', 'OTHER',
])

exports.handler = async (event) => {
  const params  = event.queryStringParameters || {}
  const format  = (params.format || 'modern').toLowerCase()
  const win     = params.window || '2weeks'

  const fCode   = FORMAT_MAP[format]
  if (!fCode) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid format' }) }
  }

  const metaId  = win in META_MAP ? META_MAP[win] : 58

  try {
    const url = `https://www.mtgtop8.com/format?f=${fCode}&meta=${metaId}`

    const res = await fetch(url, {
      headers: {
        'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer':         'https://www.mtgtop8.com/',
        'Cache-Control':   'max-age=0',
      },
    })

    if (!res.ok) {
      return {
        statusCode: 502,
        body: JSON.stringify({ error: `MTGTop8 returned HTTP ${res.status}` }),
      }
    }

    const html = await res.text()

    // Sanity-check: real pages contain "mtgtop8"
    if (!html.toLowerCase().includes('mtgtop8') || html.length < 2000) {
      return {
        statusCode: 422,
        body: JSON.stringify({ error: 'Received unexpected response — possibly blocked or redirected' }),
      }
    }

    // ── Parse total deck count ─────────────────────────────────────────────
    // Appears as e.g.  "3,425 decks"  or  "3425 decks"
    const totalMatch = html.match(/(\d[\d,]+)\s+deck/i)
    const totalDecks = totalMatch ? parseInt(totalMatch[1].replace(/,/g, ''), 10) : null

    // ── Parse categories + archetypes ──────────────────────────────────────
    // Strategy: split on <tr blocks, classify each row as:
    //   (a) category header  – contains one of CATEGORY_NAMES in all-caps
    //   (b) archetype row    – contains a link matching archetype?a=\d+
    const categories  = []
    let   currentCat  = null

    // Split HTML on <tr> open-tags (captures the following content up to </tr>)
    const trPattern = /<tr[\s\S]*?<\/tr>/gi
    let   trMatch

    while ((trMatch = trPattern.exec(html)) !== null) {
      const block = trMatch[0]

      // ── (a) Category header detection ──────────────────────────────────
      // MTGTop8 puts category labels in a <td class="Cat"> or similar bold cell.
      // Match ALL-CAPS category labels as standalone text (not inside a URL).
      const catLabelMatch = block.match(
        /[>\s](AGGRO(?:-COMBO)?|CONTROL|COMBO|MIDRANGE|RAMP|TEMPO|PRISON|HYBRID|OTHER)[<\s]/
      )
      if (catLabelMatch && CATEGORY_NAMES.has(catLabelMatch[1])) {
        // Extract category percentage (e.g. "62%")
        const catPctMatch = block.match(/([\d.]+)\s*%/)
        currentCat = {
          name:       catLabelMatch[1].trim(),
          pct:        catPctMatch ? parseFloat(catPctMatch[1]) : null,
          archetypes: [],
        }
        categories.push(currentCat)
        continue
      }

      // ── (b) Archetype row detection ────────────────────────────────────
      const archLinkMatch = block.match(/archetype\?a=(\d+)/)
      if (!archLinkMatch) continue

      const id = archLinkMatch[1]

      // Card name: text content of the archetype link
      // Pattern:  <a href="archetype?a=123&...">Boros Energy</a>
      const nameLinkMatch = block.match(/archetype\?[^"']*['"]\s*>([^<]{2,50})<\/a>/i)
      const name = nameLinkMatch ? nameLinkMatch[1].trim() : null
      if (!name) continue

      // Percentage
      const pctMatch = block.match(/([\d.]+)\s*%/)
      const pct = pctMatch ? parseFloat(pctMatch[1]) : null

      // Trend: UP.gif / DOWN.gif / STABLE.gif  (case-insensitive)
      let trend = 'stable'
      if (/\bUP\b.*\.gif/i.test(block) || /arrow.*up/i.test(block))   trend = 'up'
      else if (/\bDOWN\b.*\.gif/i.test(block) || /arrow.*down/i.test(block)) trend = 'down'

      // If no category has been seen yet, create an implicit "OTHER"
      if (!currentCat) {
        currentCat = { name: 'OTHER', pct: null, archetypes: [] }
        categories.push(currentCat)
      }

      currentCat.archetypes.push({ id, name, pct, trend })
    }

    // ── Validation ──────────────────────────────────────────────────────────
    const totalArchetypes = categories.reduce((n, c) => n + c.archetypes.length, 0)
    if (totalArchetypes === 0) {
      return {
        statusCode: 422,
        body: JSON.stringify({
          error: 'No archetype data found — MTGTop8 may be blocking server-side requests',
        }),
      }
    }

    // Remove empty categories
    const nonEmpty = categories.filter(c => c.archetypes.length > 0)

    return {
      statusCode: 200,
      headers: {
        'Content-Type':              'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control':             'public, max-age=1800', // 30-min CDN cache
      },
      body: JSON.stringify({
        format,
        window:     win,
        totalDecks,
        categories: nonEmpty,
        updatedAt:  new Date().toISOString(),
      }),
    }
  } catch (err) {
    console.error('[metagame]', err.message)
    return { statusCode: 500, body: JSON.stringify({ error: 'Internal error: ' + err.message }) }
  }
}
