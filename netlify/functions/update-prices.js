// netlify/functions/update-prices.js
// Syncs store listing prices with current Scryfall market data.
//
// Triggered two ways:
//   1. Daily by Netlify scheduler (no auth needed — internal call)
//   2. Manually via HTTP POST from the admin panel (requires admin JWT)
//
// Uses Scryfall's POST /cards/collection endpoint to batch-fetch up to 75
// cards per request, then patches changed prices in Supabase.

const ADMIN_EMAIL = 'mtgvaultedsingles@gmail.com'

exports.handler = async (event) => {
  const SUPABASE_URL = process.env.VITE_SUPABASE_URL
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY

  if (!SUPABASE_URL || !SERVICE_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Server not configured' }) }
  }

  // ── Auth check (only for manual HTTP POST calls) ──────────────────────────
  if (event.httpMethod === 'POST') {
    const authHeader = (event.headers || {})['authorization'] || ''
    const userJwt    = authHeader.replace(/^Bearer\s+/i, '').trim()

    if (!userJwt) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Missing auth token' }) }
    }

    try {
      const verifyRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${userJwt}` },
      })
      if (!verifyRes.ok) throw new Error('invalid token')
      const { email } = await verifyRes.json()
      if (email !== ADMIN_EMAIL) {
        return { statusCode: 403, body: JSON.stringify({ error: 'Forbidden' }) }
      }
    } catch {
      return { statusCode: 401, body: JSON.stringify({ error: 'Invalid or expired token' }) }
    }
  }

  // ── Fetch all active listings ─────────────────────────────────────────────
  const adminHeaders = {
    'apikey':        SERVICE_KEY,
    'Authorization': `Bearer ${SERVICE_KEY}`,
    'Content-Type':  'application/json',
  }

  let listings
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/store_listings?select=id,scryfall_id,is_foil,price&active=eq.true&qty_available=gt.0`,
      { headers: adminHeaders }
    )
    const all = await res.json()
    // Only listings that were created with a scryfall_id (scanner + admin panel saves it)
    listings = Array.isArray(all) ? all.filter(l => l.scryfall_id) : []
  } catch (err) {
    console.error('[update-prices] Failed to fetch listings:', err)
    return { statusCode: 500, body: JSON.stringify({ error: 'Could not fetch listings' }) }
  }

  if (listings.length === 0) {
    console.log('[update-prices] No listings with Scryfall IDs — nothing to sync')
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ updated: 0, skipped: 0, total: 0, message: 'No listings linked to Scryfall yet' }),
    }
  }

  // ── Batch-fetch prices from Scryfall ──────────────────────────────────────
  // Scryfall's /cards/collection accepts up to 75 identifiers per request.
  const BATCH = 75
  const priceMap = {} // scryfall_id -> { usd, usd_foil }
  const scryfallErrors = []

  for (let i = 0; i < listings.length; i += BATCH) {
    const batch       = listings.slice(i, i + BATCH)
    const identifiers = batch.map(l => ({ id: l.scryfall_id }))

    try {
      const res = await fetch('https://api.scryfall.com/cards/collection', {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent':   'VaultedSingles/1.0 (contact: mtgvaultedsingles@gmail.com)',
        },
        body: JSON.stringify({ identifiers }),
      })

      if (!res.ok) {
        scryfallErrors.push(`Batch ${i / BATCH + 1}: HTTP ${res.status}`)
        continue
      }

      const { data: cards, not_found: missing } = await res.json()
      if (missing?.length) {
        console.warn('[update-prices] Scryfall could not find:', missing)
      }
      for (const card of (cards || [])) {
        priceMap[card.id] = {
          usd:      card.prices?.usd      != null ? parseFloat(card.prices.usd)      : null,
          usd_foil: card.prices?.usd_foil != null ? parseFloat(card.prices.usd_foil) : null,
        }
      }
    } catch (err) {
      scryfallErrors.push(`Batch ${i / BATCH + 1}: ${err.message}`)
    }

    // Respect Scryfall's rate limit (10 req/s) between batches
    if (i + BATCH < listings.length) {
      await new Promise(r => setTimeout(r, 150))
    }
  }

  // ── Patch changed prices in Supabase ─────────────────────────────────────
  let updated = 0
  let skipped = 0
  const updateErrors = []

  for (const listing of listings) {
    const prices = priceMap[listing.scryfall_id]
    if (!prices) { skipped++; continue }

    const newPrice = listing.is_foil ? prices.usd_foil : prices.usd
    if (newPrice == null)                          { skipped++; continue } // Scryfall has no price
    if (Math.abs(newPrice - listing.price) < 0.01) { skipped++; continue } // No meaningful change

    try {
      const patchRes = await fetch(
        `${SUPABASE_URL}/rest/v1/store_listings?id=eq.${listing.id}`,
        {
          method:  'PATCH',
          headers: { ...adminHeaders, 'Prefer': 'return=minimal' },
          body:    JSON.stringify({ price: newPrice }),
        }
      )
      if (!patchRes.ok) throw new Error(`HTTP ${patchRes.status}`)
      updated++
    } catch (err) {
      updateErrors.push(`${listing.id}: ${err.message}`)
    }
  }

  const summary = {
    updated,
    skipped,
    total:      listings.length,
    synced_at:  new Date().toISOString(),
    ...(scryfallErrors.length && { scryfall_errors: scryfallErrors }),
    ...(updateErrors.length   && { update_errors:   updateErrors   }),
  }

  console.log('[update-prices]', summary)
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify(summary),
  }
}
