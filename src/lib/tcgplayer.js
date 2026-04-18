// TCGPlayer affiliate links via Impact
// Deep-link format: https://partner.tcgplayer.com/c/7200332/1780961/21018?u={encodedDestUrl}

const AFFILIATE_BASE = 'https://partner.tcgplayer.com/c/7200332/1780961/21018'

/**
 * Returns a TCGPlayer affiliate link.
 *
 * Pass a direct TCGPlayer product URL (e.g. from Scryfall's purchase_uris.tcgplayer)
 * and it will deep-link straight to that listing.
 * Pass a plain card name and it falls back to a search page.
 *
 * @param {string} cardNameOrDirectUrl
 * @returns {string}
 */
export function getTCGPlayerLink(cardNameOrDirectUrl) {
  const dest = cardNameOrDirectUrl?.startsWith('https://www.tcgplayer.com/')
    ? cardNameOrDirectUrl
    : `https://www.tcgplayer.com/search/magic/product?q=${encodeURIComponent(cardNameOrDirectUrl)}&Language=English`
  return `${AFFILIATE_BASE}?u=${encodeURIComponent(dest)}`
}
