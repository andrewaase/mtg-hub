// netlify/functions/news-feed.js
// Fetches and parses MTG RSS feeds server-side, avoiding browser CORS restrictions.
// Supports: mtggoldfish, edhrec, community (r/magicTCG)
const { corsHeaders } = require('./_cors')

const FEEDS = {
  mtggoldfish: 'https://www.mtggoldfish.com/feed',
  edhrec:      'https://edhrec.com/articles/feed',
  community:   'https://www.reddit.com/r/magicTCG/.rss',
}

// Minimal RSS/Atom XML parser — no dependencies
function parseFeed(xml, source) {
  const items = []

  // Try RSS <item> tags first, then Atom <entry> tags
  const itemRe = /<item[\s>]([\s\S]*?)<\/item>/gi
  const entryRe = /<entry[\s>]([\s\S]*?)<\/entry>/gi

  function txt(block, tag) {
    // handles <tag>value</tag> and <tag><![CDATA[value]]></tag>
    const re = new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, 'i')
    const m = block.match(re)
    return m ? m[1].trim() : ''
  }

  function attr(block, tag, attribute) {
    const re = new RegExp(`<${tag}[^>]*${attribute}=["']([^"']+)["']`, 'i')
    const m = block.match(re)
    return m ? m[1] : ''
  }

  function extractImage(block) {
    // media:thumbnail
    const mt = block.match(/<media:thumbnail[^>]+url=["']([^"']+)["']/i)
    if (mt) return mt[1]
    // media:content
    const mc = block.match(/<media:content[^>]+url=["']([^"']+)["']/i)
    if (mc) return mc[1]
    // enclosure
    const enc = block.match(/<enclosure[^>]+url=["']([^"']+)["'][^>]+type=["']image/i)
    if (enc) return enc[1]
    // first <img> in description/content
    const img = block.match(/<img[^>]+src=["']([^"']+)["']/i)
    if (img) return img[1]
    return null
  }

  const blocks = []
  let m
  while ((m = itemRe.exec(xml))  !== null) blocks.push(m[1])
  while ((m = entryRe.exec(xml)) !== null) blocks.push(m[1])

  for (const block of blocks.slice(0, 12)) {
    const title = txt(block, 'title') || 'Untitled'
    // RSS: <link>url</link> or Atom: <link href="url"/>
    const link = txt(block, 'link') || attr(block, 'link', 'href') || ''
    const pubDate = txt(block, 'pubDate') || txt(block, 'published') || txt(block, 'updated') || ''
    const image = extractImage(block)
    items.push({ title, link, source, pubDate, image })
  }

  return items
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(event) }
  }
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers: corsHeaders(event), body: 'Method Not Allowed' }
  }

  const source = (event.queryStringParameters?.source || 'mtggoldfish').toLowerCase()
  const feedUrl = FEEDS[source]

  if (!feedUrl) {
    return { statusCode: 400, headers: corsHeaders(event), body: JSON.stringify({ error: 'Unknown source' }) }
  }

  try {
    const controller = new AbortController()
    const timeout    = setTimeout(() => controller.abort(), 8000)

    const res = await fetch(feedUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'VaultedSingles/1.0 (MTG news aggregator; +https://www.vaultedsingles.com)',
        'Accept':     'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
      },
    })
    clearTimeout(timeout)

    if (!res.ok) {
      console.error(`[news-feed] upstream ${source} returned ${res.status}`)
      return { statusCode: 502, headers: corsHeaders(event), body: JSON.stringify({ error: `Feed returned ${res.status}` }) }
    }

    const xml   = await res.text()
    const items = parseFeed(xml, source)

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=600', // cache 10 min at CDN
        ...corsHeaders(event),
      },
      body: JSON.stringify({ items }),
    }
  } catch (err) {
    console.error('[news-feed] fetch error:', err.message)
    return {
      statusCode: 502,
      headers: corsHeaders(event),
      body: JSON.stringify({ error: 'Failed to fetch feed' }),
    }
  }
}
