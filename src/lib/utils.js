export function formatDate(dateStr) {
  if (!dateStr) return 'N/A'
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function colorPips(colorStr) {
  if (!colorStr) return ''
  const map = { W: '⚪', U: '🔵', B: '⚫', R: '🔴', G: '🟢' }
  return colorStr.split('').map(c => map[c] || '').join('')
}

export function rarityColor(rarity) {
  const colors = {
    'common': '#999999',
    'uncommon': '#a8a8a8',
    'rare': '#ffd700',
    'mythic': '#ff8c00'
  }
  return colors[rarity?.toLowerCase()] || '#999999'
}

export function formatNumber(num) {
  return num?.toLocaleString() || '0'
}

export function calculateWinRate(matches) {
  if (!matches || matches.length === 0) return 0
  const wins = matches.filter(m => m.result === 'win').length
  return Math.round((wins / matches.length) * 100)
}

export function calculateStreak(matches) {
  if (!matches || matches.length === 0) return { type: 'none', count: 0 }
  let count = 0
  let type = matches[0]?.result === 'win' ? 'win' : matches[0]?.result === 'loss' ? 'loss' : 'draw'

  for (const m of matches) {
    if (m.result === type) {
      count++
    } else {
      break
    }
  }

  return { type, count }
}

export async function fetchWithTimeout(url, timeout = 8000) {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeout)
  try {
    const res = await fetch(url, { signal: controller.signal })
    clearTimeout(id)
    return res
  } catch (e) {
    clearTimeout(id)
    throw e
  }
}

export async function searchScryfall(query) {
  try {
    const res = await fetchWithTimeout(`https://api.scryfall.com/cards/autocomplete?q=${encodeURIComponent(query)}`)
    const data = await res.json()
    return data.data || []
  } catch {
    return []
  }
}

export async function getCardDetails(cardName) {
  try {
    const res = await fetchWithTimeout(`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(cardName)}`)
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

export async function getAllPrintings(cardName) {
  try {
    // unique=prints returns every distinct printing including alternate art treatments
    // (showcase, borderless, extended art, promo, retro frame, etc.)
    // sorted by price descending so most valuable versions appear first
    const res = await fetchWithTimeout(
      `https://api.scryfall.com/cards/search?q=!"${encodeURIComponent(cardName)}"&unique=prints&order=usd&dir=desc`
    )
    const data = await res.json()
    return data.data || []
  } catch {
    return []
  }
}

function parseRssXml(xmlText, source) {
  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(xmlText, 'text/xml')
    const items = Array.from(doc.querySelectorAll('item'))
    if (items.length === 0) return null
    return items.slice(0, 10).map(item => {
      // Try multiple ways to get the image
      const enclosure = item.querySelector('enclosure')
      const mediaContent = item.querySelector('content') || item.querySelector('thumbnail')
      const img = enclosure?.getAttribute('url') ||
        mediaContent?.getAttribute('url') ||
        item.getElementsByTagNameNS('http://search.yahoo.com/mrss/', 'thumbnail')[0]?.getAttribute('url') ||
        item.getElementsByTagNameNS('http://search.yahoo.com/mrss/', 'content')[0]?.getAttribute('url') ||
        null

      // Get link — sometimes it's a CDATA node, not a standard element
      const linkEl = item.querySelector('link')
      const link = linkEl?.textContent?.trim() || linkEl?.nextSibling?.nodeValue?.trim() || ''

      return {
        title: item.querySelector('title')?.textContent?.trim() || 'Untitled',
        link,
        source,
        pubDate: item.querySelector('pubDate')?.textContent || new Date().toISOString(),
        image: img,
        description: item.querySelector('description')?.textContent?.trim() || ''
      }
    })
  } catch {
    return null
  }
}

export async function fetchNews(source) {
  let feedUrl = ''

  if (source === 'community') {
    // Wizards removed their RSS feed in their 2024 site redesign.
    // r/magicTCG covers official announcements, spoilers, and tournament results.
    feedUrl = 'https://www.reddit.com/r/magicTCG/.rss'
  } else if (source === 'mtggoldfish') {
    feedUrl = 'https://www.mtggoldfish.com/feed'
  } else if (source === 'edhrec') {
    feedUrl = 'https://edhrec.com/articles/feed'
  }

  if (!feedUrl) return []

  // 1. Try rss2json (returns JSON items directly) — correct API URL
  try {
    const rss2jsonUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feedUrl)}`
    const res = await fetchWithTimeout(rss2jsonUrl, 6000)
    if (res.ok) {
      const data = await res.json()
      if (data.status === 'ok' && data.items && data.items.length > 0) {
        return data.items.slice(0, 10).map(item => ({
          title: item.title || 'Untitled',
          link: item.link || item.url || '',
          source,
          pubDate: item.pubDate || item.published || new Date().toISOString(),
          image: item.thumbnail || item.enclosure?.link || null,
          description: item.description || item.content || ''
        }))
      }
    }
  } catch { /* fall through */ }

  // 2. Try allorigins (returns raw XML in `contents` field) — parse with DOMParser
  try {
    const alloriginsUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(feedUrl)}`
    const res = await fetchWithTimeout(alloriginsUrl, 6000)
    if (res.ok) {
      const data = await res.json()
      if (data.contents) {
        const parsed = parseRssXml(data.contents, source)
        if (parsed && parsed.length > 0) return parsed
      }
    }
  } catch { /* fall through */ }

  // 3. Try corsproxy (returns raw XML) — parse with DOMParser
  try {
    const corsproxyUrl = `https://corsproxy.io/?${encodeURIComponent(feedUrl)}`
    const res = await fetchWithTimeout(corsproxyUrl, 6000)
    if (res.ok) {
      const text = await res.text()
      const parsed = parseRssXml(text, source)
      if (parsed && parsed.length > 0) return parsed
    }
  } catch { /* fall through */ }

  return []
}

export async function fetchBrawlTrending() {
  try {
    const res = await fetchWithTimeout('https://edhrec.com/api/meta')
    const data = await res.json()
    return data.commanders?.slice(0, 15) || []
  } catch {
    return []
  }
}

export function delay(ms) {
  return new Promise(r => setTimeout(r, ms))
}
