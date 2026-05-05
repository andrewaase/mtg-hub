// ManaPool affiliate links
// Affiliate ref: vaultedsingles
// Deep-link format: https://manapool.com/card/{setCode}/{collectorNumber}/{nameSlug}?ref=vaultedsingles
// Fallback:        https://manapool.com/?ref=vaultedsingles

const REF  = 'vaultedsingles'
const BASE = 'https://manapool.com'

// Convert a card name to a URL slug: lowercase, spaces → hyphens, strip punctuation.
function slugify(name) {
  return (name || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
}

/**
 * Returns a ManaPool affiliate link for a card.
 *
 * Pass the Scryfall card object (or any object with `set`, `collector_number`, `name`)
 * for a direct product-page deep link.  If any of those fields are missing, falls back
 * to the ManaPool homepage with the affiliate ref attached.
 *
 * @param {{ set?: string, collector_number?: string|number, name?: string }} card
 * @returns {string}
 */
export function getManaPoolLink(card) {
  const set = card?.set
  const num = card?.collector_number
  const name = card?.name

  if (set && num && name) {
    return `${BASE}/card/${set}/${num}/${slugify(name)}?ref=${REF}`
  }

  // Fallback: homepage with affiliate ref (still credits the sale)
  return `${BASE}/?ref=${REF}`
}
