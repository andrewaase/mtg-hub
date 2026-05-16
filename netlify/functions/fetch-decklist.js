// fetch-decklist.js
// Server-side proxy that fetches a decklist from MTGGoldfish (bypasses browser CORS).
//
// Supports:
//   Archetype pages:  https://www.mtggoldfish.com/archetype/SLUG#paper
//   Specific decks:   https://www.mtggoldfish.com/deck/DECKID#paper
//
// Returns: { text: "<arena-format decklist>" }
// Errors:  { error: "<message>" }  (non-2xx status)

const BROWSER_HEADERS = {
  'User-Agent':      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
}

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  // ── Parse & validate URL ────────────────────────────────────────────────────
  let url
  try {
    ;({ url } = JSON.parse(event.body || '{}'))
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) }
  }

  if (!url?.trim()) {
    return { statusCode: 400, body: JSON.stringify({ error: 'url is required' }) }
  }

  let parsed
  try { parsed = new URL(url.trim()) } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid URL' }) }
  }

  const host = parsed.hostname.toLowerCase().replace(/^www\./, '')
  if (host !== 'mtggoldfish.com') {
    return { statusCode: 400, body: JSON.stringify({ error: 'Only MTGGoldfish URLs are currently supported (mtggoldfish.com)' }) }
  }

  // ── Route by URL pattern ────────────────────────────────────────────────────
  try {

    // Specific deck: /deck/DECKID  (numeric ID only)
    const deckNumMatch = parsed.pathname.match(/^\/deck\/(\d+)/)
    if (deckNumMatch) {
      const text = await downloadDeck(deckNumMatch[1])
      return ok(text)
    }

    // Archetype page: /archetype/SLUG
    if (parsed.pathname.startsWith('/archetype/')) {
      const cleanUrl = `https://www.mtggoldfish.com${parsed.pathname}`
      const htmlRes  = await fetch(cleanUrl, { headers: BROWSER_HEADERS })

      if (htmlRes.status === 404) {
        throw new Error('Archetype page not found on MTGGoldfish — check the URL')
      }
      if (!htmlRes.ok) {
        throw new Error(`MTGGoldfish returned HTTP ${htmlRes.status}`)
      }

      const html = await htmlRes.text()

      // The first /deck/download/ID link in the page is the sample deck shown at top
      const m = html.match(/href="\/deck\/download\/(\d+)"/)
      if (!m) {
        throw new Error('No downloadable decklist found on this archetype page — the deck may require a login or may not have a sample build')
      }

      const text = await downloadDeck(m[1])
      return ok(text)
    }

    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Unrecognized MTGGoldfish URL — expected /archetype/... or /deck/DECKID' }),
    }

  } catch (err) {
    return {
      statusCode: 502,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message }),
    }
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function downloadDeck(deckId) {
  const res = await fetch(`https://www.mtggoldfish.com/deck/download/${deckId}`, {
    headers: BROWSER_HEADERS,
  })
  if (!res.ok) throw new Error(`Could not download deck ${deckId} (HTTP ${res.status})`)
  const text = await res.text()
  if (!text?.trim()) throw new Error('MTGGoldfish returned an empty decklist')
  return text
}

function ok(text) {
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  }
}
