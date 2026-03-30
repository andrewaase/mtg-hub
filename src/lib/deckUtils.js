// src/lib/deckUtils.js
// Deck text parsing and MTG Arena clipboard formatting.

const COMMANDER_FORMATS = ['Commander', 'Brawl', 'Historic Brawl', 'Oathbreaker']

// ── Parser ─────────────────────────────────────────────────────────────────
// Handles these common formats:
//   "4 Lightning Bolt"
//   "4 Lightning Bolt (M11) 149"
//   "4x Lightning Bolt"
//   "Commander\n1 Raffine...\n\nDeck\n1 Arcane Signet..."
//   "// comment lines"

export function parseDeckText(text, format = 'Standard') {
  const lines = text.split('\n').map(l => l.trim())
  const mainboard = []
  const sideboard = []
  let commander = null
  let section = 'main'

  for (const raw of lines) {
    const line = raw.replace(/^\uFEFF/, '') // strip BOM

    // Skip blanks and comments
    if (!line || line.startsWith('//') || line.startsWith('#')) continue

    // Section headers
    if (/^commander$/i.test(line))            { section = 'commander'; continue }
    if (/^(deck|main(board)?)$/i.test(line))  { section = 'main';      continue }
    if (/^(sideboard|side|sb)$/i.test(line))  { section = 'side';      continue }

    // Card line: "4 Name (SET) 123 *F*" — strip set code and collector number
    const match = line.match(/^(\d+)x?\s+(.+?)(?:\s+\([A-Z0-9-]+\)\s*\d*)?(?:\s+\*[A-Z]\*)*$/)
    if (!match) continue

    const qty  = parseInt(match[1], 10)
    const name = match[2].trim()

    if (section === 'commander') {
      commander = name
    } else if (section === 'side') {
      sideboard.push({ qty, name })
    } else {
      mainboard.push({ qty, name })
    }
  }

  return { mainboard, sideboard, commander }
}

// ── Arena Formatter ────────────────────────────────────────────────────────
// Produces a string ready to paste into MTG Arena's deck import.

export function toArenaFormat(deck) {
  const lines = []
  const isCommanderFmt = COMMANDER_FORMATS.includes(deck.format)

  if (isCommanderFmt && deck.commander) {
    lines.push('Commander')
    lines.push(`1 ${deck.commander}`)
    lines.push('')
  }

  lines.push('Deck')
  for (const card of (deck.mainboard || [])) {
    lines.push(`${card.qty} ${card.name}`)
  }

  if ((deck.sideboard || []).length > 0) {
    lines.push('')
    lines.push('Sideboard')
    for (const card of deck.sideboard) {
      lines.push(`${card.qty} ${card.name}`)
    }
  }

  return lines.join('\n')
}

// ── Card counts ────────────────────────────────────────────────────────────

export function countCards(deck) {
  const main = (deck.mainboard || []).reduce((s, c) => s + c.qty, 0)
  const side = (deck.sideboard || []).reduce((s, c) => s + c.qty, 0)
  const cmdr = deck.commander ? 1 : 0
  return { main: main + cmdr, side, total: main + cmdr + side }
}

export function isCommanderFormat(format) {
  return COMMANDER_FORMATS.includes(format)
}

// ── Deck text serialiser (for editing) ────────────────────────────────────
// Converts a stored deck back to pasteable text.

export function deckToText(deck) {
  const lines = []
  const isCmd = isCommanderFormat(deck.format)

  if (isCmd && deck.commander) {
    lines.push('Commander')
    lines.push(`1 ${deck.commander}`)
    lines.push('')
  }

  if ((deck.mainboard || []).length) {
    if (isCmd) lines.push('Deck')
    for (const c of deck.mainboard) lines.push(`${c.qty} ${c.name}`)
  }

  if ((deck.sideboard || []).length) {
    lines.push('')
    lines.push('Sideboard')
    for (const c of deck.sideboard) lines.push(`${c.qty} ${c.name}`)
  }

  return lines.join('\n')
}

// ── Format badge colours ───────────────────────────────────────────────────

export const FORMAT_COLORS = {
  Standard:       { bg: 'rgba(74,144,217,.15)',  color: 'var(--accent-blue)' },
  Pioneer:        { bg: 'rgba(52,168,83,.15)',   color: '#4caf50' },
  Modern:         { bg: 'rgba(255,152,0,.15)',   color: '#ff9800' },
  Legacy:         { bg: 'rgba(156,39,176,.15)',  color: '#ce93d8' },
  Vintage:        { bg: 'rgba(183,28,28,.15)',   color: '#ef9a9a' },
  Commander:      { bg: 'rgba(255,215,0,.15)',   color: '#ffd700' },
  Brawl:          { bg: 'rgba(255,215,0,.12)',   color: 'var(--accent-gold)' },
  'Historic Brawl':{ bg: 'rgba(201,168,76,.12)', color: 'var(--accent-gold)' },
  Pauper:         { bg: 'rgba(158,158,158,.15)', color: '#bdbdbd' },
  Alchemy:        { bg: 'rgba(0,188,212,.15)',   color: '#4dd0e1' },
  Explorer:       { bg: 'rgba(0,150,136,.15)',   color: '#4db6ac' },
}
