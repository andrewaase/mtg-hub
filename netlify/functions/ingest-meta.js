// netlify/functions/ingest-meta.js
const { corsHeaders } = require('./_cors')
//
// TWO modes:
//
// 1. POST with body { snapshots: [...] }
//    Called by the browser after it fetches MTGGoldfish/MTGTop8 client-side.
//    Saves the card + archetype rows to Supabase.
//    Browser fetches work; server-side fetches from cloud IPs get blocked.
//
// 2. GET (or scheduled invocation)
//    Returns the latest snapshot week stored in Supabase so the frontend
//    knows whether it needs to send a fresh snapshot.
//
// Frontend calls /.netlify/functions/ingest-meta (GET) on MetaTracker load.
// If the stored week is stale (> 6 days old), the frontend fetches fresh data
// and POSTs it back here to save.

function getWeekStart(offsetWeeks = 0) {
  const d   = new Date()
  const day = d.getUTCDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setUTCDate(d.getUTCDate() + diff + offsetWeeks * -7)
  return d.toISOString().slice(0, 10)
}

// Max rows accepted per POST to prevent payload-flooding
const MAX_CARD_ROWS      = 500
const MAX_ARCHETYPE_ROWS = 100

exports.handler = async (event) => {
  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(event) }
  }

  const SUPABASE_URL = process.env.VITE_SUPABASE_URL
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY

  if (!SUPABASE_URL || !SERVICE_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Missing Supabase env vars' }) }
  }

  const headers = {
    'Content-Type': 'application/json',
    ...corsHeaders(event),
  }

  // ── GET: return latest stored week (public, no auth required) ────────────
  if (event.httpMethod !== 'POST') {
    try {
      const res  = await fetch(
        `${SUPABASE_URL}/rest/v1/meta_card_snapshots?select=week&order=week.desc&limit=1`,
        { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
      )
      const rows = await res.json()
      const latestWeek = rows?.[0]?.week || null
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ latestWeek, currentWeek: getWeekStart() }),
      }
    } catch (err) {
      console.error('[ingest-meta]', err)
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Internal server error' }) }
    }
  }

  // ── POST: require a logged-in user to write snapshot data ───────────────
  // Any authenticated Supabase user can submit — prevents anonymous poisoning
  // while keeping the feature working for all logged-in users.
  const authHeader = (event.headers || {})['authorization'] || ''
  const userJwt    = authHeader.replace(/^Bearer\s+/i, '').trim()

  if (!userJwt) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Authentication required' }) }
  }

  try {
    const verifyRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${userJwt}` },
    })
    if (!verifyRes.ok) throw new Error('invalid token')
  } catch {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid or expired token' }) }
  }

  // ── POST: save snapshots sent from browser ───────────────────────────────
  let body
  try { body = JSON.parse(event.body || '{}') } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) }
  }

  const { cardSnapshots = [], archetypeSnapshots = [] } = body
  if (cardSnapshots.length === 0 && archetypeSnapshots.length === 0) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'No snapshot data provided' }) }
  }

  // Cap payload size to prevent flooding
  if (cardSnapshots.length > MAX_CARD_ROWS || archetypeSnapshots.length > MAX_ARCHETYPE_ROWS) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Payload exceeds maximum row limit' }) }
  }

  const results = { cardRows: 0, archetypeRows: 0, errors: [] }

  // Upsert card snapshots
  if (cardSnapshots.length > 0) {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/meta_card_snapshots`, {
        method:  'POST',
        headers: {
          apikey:          SERVICE_KEY,
          Authorization:  `Bearer ${SERVICE_KEY}`,
          'Content-Type': 'application/json',
          Prefer:         'resolution=merge-duplicates',
        },
        body: JSON.stringify(cardSnapshots),
      })
      if (res.ok) {
        results.cardRows = cardSnapshots.length
      } else {
        const errText = await res.text()
        results.errors.push(`card upsert ${res.status}: ${errText}`)
      }
    } catch (err) {
      results.errors.push(`card upsert: ${err.message}`)
    }
  }

  // Upsert archetype snapshots
  if (archetypeSnapshots.length > 0) {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/meta_archetype_snapshots`, {
        method:  'POST',
        headers: {
          apikey:          SERVICE_KEY,
          Authorization:  `Bearer ${SERVICE_KEY}`,
          'Content-Type': 'application/json',
          Prefer:         'resolution=merge-duplicates',
        },
        body: JSON.stringify(archetypeSnapshots),
      })
      if (res.ok) {
        results.archetypeRows = archetypeSnapshots.length
      } else {
        const errText = await res.text()
        results.errors.push(`archetype upsert ${res.status}: ${errText}`)
      }
    } catch (err) {
      results.errors.push(`archetype upsert: ${err.message}`)
    }
  }

  console.log('[ingest-meta] Saved:', results)
  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ ok: true, week: getWeekStart(), ...results }),
  }
}
