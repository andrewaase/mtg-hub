// netlify/functions/metagame.js
// Attempts to scrape MTGTop8 for live metagame data.
// If the request is blocked (common – AWS IPs are frequently blocked),
// returns curated community-estimate fallback data tagged source:'curated'.
//
// Usage:  /.netlify/functions/metagame?format=modern&window=2weeks
// Returns: { format, window, source:'live'|'curated', totalDecks, categories, updatedAt }

const FORMAT_MAP = {
  standard: 'ST',
  modern:   'MO',
  pioneer:  'PI',
  legacy:   'LE',
  pauper:   'PAU',
  vintage:  'VI',
}

const META_MAP = { '2weeks': 58, 'month': 44, 'alltime': 0 }

const CATEGORY_NAMES = new Set([
  'AGGRO', 'CONTROL', 'COMBO', 'MIDRANGE', 'AGGRO-COMBO',
  'RAMP', 'TEMPO', 'PRISON', 'HYBRID', 'OTHER',
])

// ─── Curated fallback data (community estimates) ───────────────────────────
// Used when MTGTop8 blocks the server-side request.
// Each archetype has a keyCard field used by the frontend to fetch
// Scryfall card-art thumbnails.
const FALLBACK = {
  modern: {
    totalDecks: 1400,
    categories: [
      {
        name: 'AGGRO', pct: 36,
        archetypes: [
          { id: null, name: 'Boros Energy',    pct: 21, trend: 'up',     keyCard: 'Phlage, Titan of Fire\'s Fury' },
          { id: null, name: 'Burn',            pct: 9,  trend: 'stable', keyCard: 'Lightning Bolt' },
          { id: null, name: 'Hardened Scales', pct: 4,  trend: 'down',   keyCard: 'Hardened Scales' },
          { id: null, name: 'Prowess',         pct: 2,  trend: 'stable', keyCard: 'Monastery Swiftspear' },
        ],
      },
      {
        name: 'MIDRANGE', pct: 27,
        archetypes: [
          { id: null, name: 'Grixis Shadow',     pct: 10, trend: 'stable', keyCard: "Death's Shadow" },
          { id: null, name: 'Four-Color Omnath', pct: 9,  trend: 'up',     keyCard: 'Omnath, Locus of Creation' },
          { id: null, name: 'Jund',              pct: 5,  trend: 'down',   keyCard: 'Bloodbraid Elf' },
          { id: null, name: 'Temur Energy',      pct: 3,  trend: 'up',     keyCard: 'Amped Raptor' },
        ],
      },
      {
        name: 'COMBO', pct: 22,
        archetypes: [
          { id: null, name: 'Amulet Titan',       pct: 9,  trend: 'stable', keyCard: 'Primeval Titan' },
          { id: null, name: 'Living End',          pct: 6,  trend: 'stable', keyCard: 'Living End' },
          { id: null, name: 'Yawgmoth',            pct: 4,  trend: 'up',     keyCard: 'Yawgmoth, Thran Physician' },
          { id: null, name: 'Crashing Footfalls',  pct: 3,  trend: 'down',   keyCard: 'Crashing Footfalls' },
        ],
      },
      {
        name: 'CONTROL', pct: 15,
        archetypes: [
          { id: null, name: 'Azorius Control', pct: 9, trend: 'up',     keyCard: 'Counterspell' },
          { id: null, name: 'Jeskai Control',  pct: 6, trend: 'stable', keyCard: 'Snapcaster Mage' },
        ],
      },
    ],
  },

  standard: {
    totalDecks: 900,
    categories: [
      {
        name: 'AGGRO', pct: 40,
        archetypes: [
          { id: null, name: 'Mono-Red Aggro',  pct: 17, trend: 'up',     keyCard: 'Monastery Swiftspear' },
          { id: null, name: 'Boros Aggro',     pct: 13, trend: 'stable', keyCard: 'Emberheart Challenger' },
          { id: null, name: 'White Weenie',    pct: 7,  trend: 'stable', keyCard: 'Resolute Reinforcements' },
          { id: null, name: 'Mardu Aggro',     pct: 3,  trend: 'up',     keyCard: 'Pia Nalaar, Consul of Revival' },
        ],
      },
      {
        name: 'MIDRANGE', pct: 32,
        archetypes: [
          { id: null, name: 'Esper Midrange',   pct: 14, trend: 'up',     keyCard: 'Sheoldred, the Apocalypse' },
          { id: null, name: 'Domain Ramp',      pct: 10, trend: 'stable', keyCard: 'Atraxa, Grand Unifier' },
          { id: null, name: 'Golgari Midrange', pct: 8,  trend: 'stable', keyCard: 'Glissa Sunslayer' },
        ],
      },
      {
        name: 'CONTROL', pct: 18,
        archetypes: [
          { id: null, name: 'Dimir Control',   pct: 11, trend: 'up',     keyCard: 'Kaito, Cunning Infiltrator' },
          { id: null, name: 'Azorius Control', pct: 7,  trend: 'stable', keyCard: 'Negate' },
        ],
      },
      {
        name: 'COMBO', pct: 10,
        archetypes: [
          { id: null, name: 'Boros Convoke',  pct: 6, trend: 'down',   keyCard: 'Gleeful Demolition' },
          { id: null, name: 'Dimir Tempo',    pct: 4, trend: 'stable', keyCard: 'Faerie Mastermind' },
        ],
      },
    ],
  },

  pioneer: {
    totalDecks: 1100,
    categories: [
      {
        name: 'COMBO', pct: 30,
        archetypes: [
          { id: null, name: 'Lotus Field Combo', pct: 14, trend: 'stable', keyCard: 'Lotus Field' },
          { id: null, name: 'Hidden Strings',    pct: 8,  trend: 'up',     keyCard: 'Hidden Strings' },
          { id: null, name: 'Amalia Combo',      pct: 8,  trend: 'stable', keyCard: 'Wildgrowth Walker' },
        ],
      },
      {
        name: 'MIDRANGE', pct: 28,
        archetypes: [
          { id: null, name: 'Rakdos Midrange',   pct: 13, trend: 'stable', keyCard: 'Thoughtseize' },
          { id: null, name: 'Atraxa Reanimator', pct: 9,  trend: 'up',     keyCard: 'Atraxa, Grand Unifier' },
          { id: null, name: 'Greasefang',        pct: 6,  trend: 'down',   keyCard: 'Greasefang, Okiba Boss' },
        ],
      },
      {
        name: 'AGGRO', pct: 25,
        archetypes: [
          { id: null, name: 'Boros Heroic',   pct: 11, trend: 'up',     keyCard: 'Illuminator Virtuoso' },
          { id: null, name: 'Mono-Red Aggro', pct: 8,  trend: 'stable', keyCard: 'Kumano Faces Kakkazan' },
          { id: null, name: 'Spirits',        pct: 6,  trend: 'stable', keyCard: 'Rattlechains' },
        ],
      },
      {
        name: 'CONTROL', pct: 17,
        archetypes: [
          { id: null, name: 'Azorius Control', pct: 9, trend: 'stable', keyCard: 'Teferi, Hero of Dominaria' },
          { id: null, name: 'Izzet Phoenix',   pct: 8, trend: 'stable', keyCard: 'Arclight Phoenix' },
        ],
      },
    ],
  },

  legacy: {
    totalDecks: 650,
    categories: [
      {
        name: 'COMBO', pct: 32,
        archetypes: [
          { id: null, name: 'Sneak and Show', pct: 12, trend: 'stable', keyCard: 'Show and Tell' },
          { id: null, name: 'ANT Storm',      pct: 10, trend: 'stable', keyCard: 'Ad Nauseam' },
          { id: null, name: 'Reanimator',     pct: 10, trend: 'up',     keyCard: 'Griselbrand' },
        ],
      },
      {
        name: 'CONTROL', pct: 28,
        archetypes: [
          { id: null, name: 'Izzet Delver', pct: 14, trend: 'stable', keyCard: 'Delver of Secrets' },
          { id: null, name: 'BUG Zenith',   pct: 9,  trend: 'stable', keyCard: "Green Sun's Zenith" },
          { id: null, name: 'Doomsday',     pct: 5,  trend: 'up',     keyCard: 'Doomsday' },
        ],
      },
      {
        name: 'AGGRO', pct: 22,
        archetypes: [
          { id: null, name: 'Death and Taxes', pct: 12, trend: 'stable', keyCard: 'Thalia, Guardian of Thraben' },
          { id: null, name: 'Elves',           pct: 6,  trend: 'stable', keyCard: 'Natural Order' },
          { id: null, name: 'Burn',            pct: 4,  trend: 'down',   keyCard: 'Price of Progress' },
        ],
      },
      {
        name: 'MIDRANGE', pct: 18,
        archetypes: [
          { id: null, name: 'Lands',   pct: 10, trend: 'stable', keyCard: 'Maze of Ith' },
          { id: null, name: 'Painter', pct: 8,  trend: 'up',     keyCard: "Painter's Servant" },
        ],
      },
    ],
  },

  pauper: {
    totalDecks: 550,
    categories: [
      {
        name: 'AGGRO', pct: 38,
        archetypes: [
          { id: null, name: 'Kuldotha Red',     pct: 18, trend: 'up',     keyCard: 'Goblin Bushwhacker' },
          { id: null, name: 'Mono-White Aggro', pct: 12, trend: 'stable', keyCard: 'Battle Screech' },
          { id: null, name: 'Elves',            pct: 8,  trend: 'stable', keyCard: 'Birchlore Rangers' },
        ],
      },
      {
        name: 'CONTROL', pct: 28,
        archetypes: [
          { id: null, name: 'Caw-Gate',    pct: 14, trend: 'up',     keyCard: 'Kor Skyfisher' },
          { id: null, name: 'Faeries',     pct: 9,  trend: 'stable', keyCard: 'Spellstutter Sprite' },
          { id: null, name: 'Dimir Terror',pct: 5,  trend: 'stable', keyCard: 'Gurmag Angler' },
        ],
      },
      {
        name: 'COMBO', pct: 20,
        archetypes: [
          { id: null, name: 'Affinity',  pct: 12, trend: 'stable', keyCard: 'Frogmite' },
          { id: null, name: 'Inside Out', pct: 8, trend: 'up',     keyCard: 'Mutagenic Growth' },
        ],
      },
      {
        name: 'MIDRANGE', pct: 14,
        archetypes: [
          { id: null, name: 'Golgari Gardens', pct: 8, trend: 'stable', keyCard: 'Troll of Khazad-dum' },
          { id: null, name: 'Boros Midrange',  pct: 6, trend: 'down',   keyCard: 'Seeker of the Way' },
        ],
      },
    ],
  },

  vintage: {
    totalDecks: 160,
    categories: [
      {
        name: 'COMBO', pct: 45,
        archetypes: [
          { id: null, name: 'Paradoxical Outcome', pct: 20, trend: 'stable', keyCard: 'Paradoxical Outcome' },
          { id: null, name: 'Doomsday',            pct: 15, trend: 'up',     keyCard: 'Doomsday' },
          { id: null, name: 'Oath of Druids',      pct: 10, trend: 'stable', keyCard: 'Oath of Druids' },
        ],
      },
      {
        name: 'CONTROL', pct: 35,
        archetypes: [
          { id: null, name: 'Jeskai Control', pct: 18, trend: 'stable', keyCard: 'Mana Drain' },
          { id: null, name: 'BUG Midrange',   pct: 17, trend: 'stable', keyCard: 'Force of Will' },
        ],
      },
      {
        name: 'AGGRO', pct: 20,
        archetypes: [
          { id: null, name: 'Prison / Shops', pct: 12, trend: 'down',   keyCard: "Mishra's Workshop" },
          { id: null, name: 'Bazaar Dredge',  pct: 8,  trend: 'stable', keyCard: 'Bazaar of Baghdad' },
        ],
      },
    ],
  },
}

function buildFallback(format, win) {
  const fb = FALLBACK[format]
  if (!fb) return null
  return {
    format,
    window:     win,
    source:     'curated',
    totalDecks: fb.totalDecks,
    categories: fb.categories,
    updatedAt:  new Date().toISOString(),
  }
}

// ─── Handler ───────────────────────────────────────────────────────────────

exports.handler = async (event) => {
  const params  = event.queryStringParameters || {}
  const format  = (params.format || 'modern').toLowerCase()
  const win     = params.window  || '2weeks'

  const fCode   = FORMAT_MAP[format]
  if (!fCode) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid format' }) }
  }
  const metaId = win in META_MAP ? META_MAP[win] : 58

  // ── Attempt live scrape ────────────────────────────────────────────────
  try {
    const url = `https://www.mtgtop8.com/format?f=${fCode}&meta=${metaId}`
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: {
        'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer':         'https://www.mtgtop8.com/',
      },
    })

    if (res.ok) {
      const html = await res.text()

      if (html.toLowerCase().includes('mtgtop8') && html.length > 2000) {
        // ── Parse ──────────────────────────────────────────────────────
        const totalMatch = html.match(/(\d[\d,]+)\s+deck/i)
        const totalDecks = totalMatch ? parseInt(totalMatch[1].replace(/,/g, ''), 10) : null

        const categories = []
        let   currentCat = null
        const trPattern  = /<tr[\s\S]*?<\/tr>/gi
        let   trMatch

        while ((trMatch = trPattern.exec(html)) !== null) {
          const block = trMatch[0]

          const catLabelMatch = block.match(
            /[>\s](AGGRO(?:-COMBO)?|CONTROL|COMBO|MIDRANGE|RAMP|TEMPO|PRISON|HYBRID|OTHER)[<\s]/
          )
          if (catLabelMatch && CATEGORY_NAMES.has(catLabelMatch[1])) {
            const catPctMatch = block.match(/([\d.]+)\s*%/)
            currentCat = { name: catLabelMatch[1].trim(), pct: catPctMatch ? parseFloat(catPctMatch[1]) : null, archetypes: [] }
            categories.push(currentCat)
            continue
          }

          const archLinkMatch = block.match(/archetype\?a=(\d+)/)
          if (!archLinkMatch) continue

          const id            = archLinkMatch[1]
          const nameLinkMatch = block.match(/archetype\?[^"']*['"]\s*>([^<]{2,50})<\/a>/i)
          const name          = nameLinkMatch ? nameLinkMatch[1].trim() : null
          if (!name) continue

          const pctMatch = block.match(/([\d.]+)\s*%/)
          const pct      = pctMatch ? parseFloat(pctMatch[1]) : null
          let   trend    = 'stable'
          if (/\bUP\b.*\.gif/i.test(block))   trend = 'up'
          else if (/\bDOWN\b.*\.gif/i.test(block)) trend = 'down'

          if (!currentCat) { currentCat = { name: 'OTHER', pct: null, archetypes: [] }; categories.push(currentCat) }
          currentCat.archetypes.push({ id, name, pct, trend, keyCard: null })
        }

        const totalArch = categories.reduce((n, c) => n + c.archetypes.length, 0)
        if (totalArch > 0) {
          const nonEmpty = categories.filter(c => c.archetypes.length > 0)
          return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=1800' },
            body: JSON.stringify({ format, window: win, source: 'live', totalDecks, categories: nonEmpty, updatedAt: new Date().toISOString() }),
          }
        }
      }
    }
  } catch (_) {
    // scrape failed — fall through to curated data
  }

  // ── Return curated fallback ────────────────────────────────────────────
  const fallback = buildFallback(format, win)
  if (!fallback) {
    return { statusCode: 404, body: JSON.stringify({ error: 'No data for this format' }) }
  }
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=600' },
    body: JSON.stringify(fallback),
  }
}
