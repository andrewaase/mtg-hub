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
    const res = await fetchWithTimeout(`https://api.scryfall.com/cards/search?q=!"${cardName}"&include_extras=false&order=released&dir=desc`)
    const data = await res.json()
    return data.data || []
  } catch {
    return []
  }
}

export async function fetchNews(source) {
  let feedUrl = ''

  if (source === 'magic.wizards.com') {
    feedUrl = 'https://feeds.wizards.com/en/feed/Magic-News'
  } else if (source === 'mtggoldfish') {
    feedUrl = 'https://www.mtggoldfish.com/feed'
  } else if (source === 'edhrec') {
    feedUrl = 'https://www.edhrec.com/feed'
  }

  if (!feedUrl) return []

  // Multi-proxy RSS fetch chain
  const proxyUrls = [
    `https://api.allorigins.win/feed?url=${encodeURIComponent(feedUrl)}`,
    `https://corsproxy.io/?${encodeURIComponent(feedUrl)}`,
    `https://rss2json.com/api.json?rss_url=${encodeURIComponent(feedUrl)}`
  ]

  for (const proxyUrl of proxyUrls) {
    try {
      const res = await fetchWithTimeout(proxyUrl, 5000)
      if (!res.ok) continue
      const data = await res.json()

      if (data.items && Array.isArray(data.items)) {
        return data.items.slice(0, 10).map(item => ({
          title: item.title || 'Untitled',
          link: item.link || item.url || '',
          source: source,
          pubDate: item.pubDate || item.published || new Date().toISOString(),
          image: item.image || item.thumbnail || null,
          description: item.description || item.summary || ''
        }))
      }
    } catch (e) {
      continue
    }
  }

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
