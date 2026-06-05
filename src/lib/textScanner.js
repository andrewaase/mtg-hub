// src/lib/textScanner.js
// JavaScript bridge to the native iOS Vision text-recognition plugin.
// Falls back to the existing Claude-based scanner on web/Android.

import { isNative, isIOS } from './native'

let _plugin = null

async function getPlugin() {
  if (_plugin) return _plugin
  if (!isIOS) return null
  try {
    const { registerPlugin } = await import('@capacitor/core')
    _plugin = registerPlugin('TextScanner')
    return _plugin
  } catch {
    return null
  }
}

/**
 * Scan a base64-encoded image using on-device iOS Vision OCR.
 * Returns { text, lines, topText } or null if unavailable.
 *
 * @param {string} base64 - base64 image string (no data: prefix)
 */
export async function scanImageNative(base64) {
  const plugin = await getPlugin()
  if (!plugin) return null
  // Let errors propagate so the scanner UI can surface a real failure
  // (e.g. plugin not registered) instead of silently showing nothing.
  return await plugin.scanBase64({ base64 })
}

/**
 * Parse the most likely MTG card name from Vision OCR output.
 *
 * MTG card anatomy:
 *   - Card name is on the very first line at the top of the card
 *   - It's typically 1-4 words, capitalised, with no punctuation except //' and -
 *   - Mana cost symbols follow on the same line but Vision may split them
 *
 * Strategy:
 *   1. Use topText (top 30% of image) as primary source
 *   2. Take the first "word-like" line — filter out pure symbol noise
 *   3. Strip trailing mana-cost characters {W}{U}{B}{R}{G}{X}{0-9}
 */
export function parseCardName(ocr) {
  if (!ocr) return null

  // Prefer topText, fall back to first non-empty line of full text
  const candidates = [
    ...(ocr.topText || '').split(/[\n|]/).map(s => s.trim()),
    ...(ocr.lines  || []).map(s => s.trim()),
  ].filter(Boolean)

  for (const line of candidates) {
    // Strip mana symbols and numeric noise from the right
    const cleaned = line
      .replace(/\{[^}]*\}/g, '')       // {W} {U} {3} etc
      .replace(/[0-9X✦✧]+$/g, '')      // trailing numbers
      .replace(/[^\w\s',\-\/]/g, '')    // non-word chars except common name punctuation
      .trim()

    // Must be at least 3 chars and contain at least one letter
    if (cleaned.length >= 3 && /[a-zA-Z]/.test(cleaned)) {
      return cleaned
    }
  }
  return null
}

// ── Scryfall fuzzy-name lookup with caching ────────────────────────────────

const nameCache = new Map()

/**
 * Look up a card by name on Scryfall using fuzzy matching.
 * Returns the full card object or null.
 */
export async function scryfallFuzzy(name) {
  if (!name) return null
  const key = name.toLowerCase().trim()
  if (nameCache.has(key)) return nameCache.get(key)

  try {
    const res = await fetch(
      `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(key)}`
    )
    if (!res.ok) return null
    const card = await res.json()
    if (card.object === 'error') return null
    nameCache.set(key, card)
    return card
  } catch {
    return null
  }
}
