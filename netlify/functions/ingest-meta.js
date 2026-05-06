// netlify/functions/ingest-meta.js
// Scheduled weekly — snapshots MTGGoldfish format staples + MTGTop8 archetype share
// into Supabase so the spike predictor has a time-series to work with.
//
// Schedule: every Sunday at 06:00 UTC  →  netlify.toml [functions."ingest-meta"] schedule = "0 6 * * 0"
// Manual trigger: POST /.netlify/functions/ingest-meta  (no body needed)

const FORMATS = ['modern', 'standard', 'pioneer', 'legacy', 'pauper']

const FORMAT_MAP_TOP8 = {
  standard: 'ST', modern: 'MO', pioneer: 'PI', legacy: 'LE', pauper: 'PAU',
}

// Returns the Monday (start of week) for a given date as a YYYY-MM-DD string
function getWeekStart(d = new Date()) {
  const day = d.getUTCDay()            // 0=Sun … 6=Sat
  const diff = day === 0 ? -6 : 1 - day  // shift to Monday
  const mon  = new Date(d)
  mon.setUTCDate(d.getUTCDate() + diff)
  return mon.toISOString().slice(0, 10)
}

// ── MTGGoldfish scraper (same logic as tournament-meta.js) ──────────────────

async function fetchGoldfishStaples(format) {
  const url = `https://www.mtggoldfish.com/format-staples/${format}/full`
  const res  = await fetch(url, {
    signal:  AbortSignal.timeout(12000),
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Accept':     'text/html,application/xhtml+xml',
    },
  })
  if (!res.ok) return []

  const html = await res.text()
  const cards = []
  const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
  let   trMatch
  const seen = new Set()

  while ((trMatch = trRegex.exec(html)) !== null) {
    const row = trMatch[1]
    const nameMatch  = row.match(/href="\/price\/[^"]*">([^<]+)<\/a>/)
    if (!nameMatch) continue
    const name = nameMatch[1].trim()
    if (!name || name.length < 2 || seen.has(name)) continue

    const pctMatch   = row.match(/([\d.]+)%/)
    const priceMatch = row.match(/\$([\d,]+\.[\d]{2})/)
    const pct   = pctMatch   ? parseFloat(pctMatch[1])                : null
    const price = priceMatch ? parseFloat(priceMatch[1].replace(',','')) : null
    if (!pct || pct < 1) continue

    seen.add(name)
    cards.push({ name, pct, price })
  }

  return cards.slice(0, 40) // top 40 per format
}

// ── MTGTop8 archetype scraper (same logic as metagame.js) ──────────────────

const CATEGORY_NAMES = new Set([
  'AGGRO','CONTROL','COMBO','MIDRANGE','AGGRO-COMBO','RAMP','TEMPO','PRISON','HYBRID','OTHER',
])

async function fetchTop8Archetypes(format) {
  const fCode = FORMAT_MAP_TOP8[format]
  if (!fCode) return []

  const url = `https://www.mtgtop8.com/format?f=${fCode}&meta=58` // 2-week window
  try {
    const res = await fetch(url, {
      signal:  AbortSignal.timeout(10000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept':     'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Referer':    'https://www.mtgtop8.com/',
      },
    })
    if (!res.ok) return []
    const html = await res.text()
    if (!html.toLowerCase().includes('mtgtop8') || html.length < 2000) return []

    const archetypes = []
    let currentCat   = 'OTHER'
    const trPattern  = /<tr[\s\S]*?<\/tr>/gi
    let   trMatch

    while ((trMatch = trPattern.exec(html)) !== null) {
      const block = trMatch[0]
      const catMatch = block.match(/[>\s](AGGRO(?:-COMBO)?|CONTROL|COMBO|MIDRANGE|RAMP|TEMPO|PRISON|HYBRID|OTHER)[<\s]/)
      if (catMatch && CATEGORY_NAMES.has(catMatch[1])) {
        currentCat = catMatch[1].trim()
        continue
      }
      const archLink = block.match(/archetype\?a=(\d+)/)
      if (!archLink) continue
      const nameMatch = block.match(/archetype\?[^"']*['"]\s*>([^<]{2,50})<\/a>/i)
      const name      = nameMatch ? nameMatch[1].trim() : null
      if (!name) continue
      const pctMatch  = block.match(/([\d.]+)\s*%/)
      const pct       = pctMatch ? parseFloat(pctMatch[1]) : null
      let   trend     = 'stable'
      if (/\bUP\b.*\.gif/i.test(block))   trend = 'up'
      else if (/\bDOWN\b.*\.gif/i.test(block)) trend = 'down'

      archetypes.push({ name, category: currentCat, pct, trend })
    }
    return archetypes
  } catch {
    return []
  }
}

// ── Supabase upsert helpers ─────────────────────────────────────────────────

async function upsertCardSnapshots(rows, supabaseUrl, serviceKey) {
  if (!rows.length) return 0
  const res = await fetch(`${supabaseUrl}/rest/v1/meta_card_snapshots`, {
    method:  'POST',
    headers: {
      'apikey':        serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
      'Content-Type':  'application/json',
      'Prefer':        'resolution=merge-duplicates',
    },
    body: JSON.stringify(rows),
  })
  return res.ok ? rows.length : 0
}

async function upsertArchetypeSnapshots(rows, supabaseUrl, serviceKey) {
  if (!rows.length) return 0
  const res = await fetch(`${supabaseUrl}/rest/v1/meta_archetype_snapshots`, {
    method:  'POST',
    headers: {
      'apikey':        serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
      'Content-Type':  'application/json',
      'Prefer':        'resolution=merge-duplicates',
    },
    body: JSON.stringify(rows),
  })
  return res.ok ? rows.length : 0
}

// ── Handler ─────────────────────────────────────────────────────────────────

exports.handler = async () => {
  const SUPABASE_URL  = process.env.VITE_SUPABASE_URL
  const SERVICE_KEY   = process.env.SUPABASE_SERVICE_KEY

  if (!SUPABASE_URL || !SERVICE_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Missing Supabase env vars' }) }
  }

  const week    = getWeekStart()
  const results = { week, formats: {} }

  for (const format of FORMATS) {
    console.log(`[ingest-meta] Processing ${format}…`)
    const formatResults = { cardRows: 0, archetypeRows: 0, errors: [] }

    // ── MTGGoldfish staples ──
    try {
      const cards    = await fetchGoldfishStaples(format)
      const cardRows = cards.map(c => ({
        card_name:    c.name,
        format,
        week,
        pct_of_decks: c.pct,
        price:        c.price,
        source:       'mtggoldfish',
      }))
      formatResults.cardRows = await upsertCardSnapshots(cardRows, SUPABASE_URL, SERVICE_KEY)
      console.log(`[ingest-meta] ${format}: ${formatResults.cardRows} card rows upserted`)
    } catch (err) {
      console.error(`[ingest-meta] Goldfish fetch failed for ${format}:`, err.message)
      formatResults.errors.push(`goldfish: ${err.message}`)
    }

    // ── MTGTop8 archetypes ──
    try {
      const archetypes    = await fetchTop8Archetypes(format)
      const archetypeRows = archetypes.map(a => ({
        archetype_name: a.name,
        category:       a.category,
        format,
        week,
        pct:            a.pct,
        trend:          a.trend,
        source:         'mtgtop8',
      }))
      formatResults.archetypeRows = await upsertArchetypeSnapshots(archetypeRows, SUPABASE_URL, SERVICE_KEY)
      console.log(`[ingest-meta] ${format}: ${formatResults.archetypeRows} archetype rows upserted`)
    } catch (err) {
      console.error(`[ingest-meta] Top8 fetch failed for ${format}:`, err.message)
      formatResults.errors.push(`mtgtop8: ${err.message}`)
    }

    // Be a polite scraper
    await new Promise(r => setTimeout(r, 500))

    results.formats[format] = formatResults
  }

  console.log('[ingest-meta] Done.', JSON.stringify(results))
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ok: true, ...results }),
  }
}
