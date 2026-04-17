// TCGPlayer affiliate links via Impact
// Deep-link format: https://partner.tcgplayer.com/c/7200332/1780961/21018?u={encodedDestUrl}

const AFFILIATE_BASE = 'https://partner.tcgplayer.com/c/7200332/1780961/21018'

/**
 * Returns a TCGPlayer affiliate link that searches for the given card name.
 * @param {string} cardName
 * @returns {string}
 */
export function getTCGPlayerLink(cardName) {
  const dest = `https://www.tcgplayer.com/search/magic/product?q=${encodeURIComponent(cardName)}&Language=English`
  return `${AFFILIATE_BASE}?u=${encodeURIComponent(dest)}`
}
