// TCGPlayer affiliate links via Impact
// Deep-link format: https://partner.tcgplayer.com/c/7200332/1780961/21018?u={encodedDestUrl}

const AFFILIATE_BASE = 'https://partner.tcgplayer.com/c/7200332/1780961/21018'

/**
 * Returns a TCGPlayer affiliate link wrapped with our Impact publisher ID.
 *
 * Handles three input forms:
 *  1. Scryfall's purchase_uris.tcgplayer — already an Impact link (partner.tcgplayer.com)
 *     but under Scryfall's publisher ID. We extract the inner `u` param (the real
 *     tcgplayer.com product URL) and rewrap it with our ID.
 *  2. A bare tcgplayer.com URL — used directly as the destination.
 *  3. A plain card name — falls back to a TCGPlayer search page.
 *
 * @param {string} cardNameOrUrl
 * @returns {string}
 */
export function getTCGPlayerLink(cardNameOrUrl) {
  let dest

  if (!cardNameOrUrl) {
    dest = 'https://www.tcgplayer.com/search/magic/product?Language=English'
  } else if (cardNameOrUrl.startsWith('https://partner.tcgplayer.com/')) {
    // Scryfall wraps its TCGPlayer links in their own Impact affiliate URL.
    // Pull the real product URL out of the `u` query param.
    try {
      const inner = new URL(cardNameOrUrl)
      const uParam = inner.searchParams.get('u')
      dest = uParam ? decodeURIComponent(uParam) : `https://www.tcgplayer.com/search/magic/product?Language=English`
    } catch {
      dest = `https://www.tcgplayer.com/search/magic/product?Language=English`
    }
  } else if (cardNameOrUrl.startsWith('https://www.tcgplayer.com/')) {
    dest = cardNameOrUrl
  } else {
    // Plain card name → search
    dest = `https://www.tcgplayer.com/search/magic/product?q=${encodeURIComponent(cardNameOrUrl)}&Language=English`
  }

  return `${AFFILIATE_BASE}?u=${encodeURIComponent(dest)}`
}
