// netlify/functions/scan-card.js
// Accepts a base64 JPEG of a MTG card and returns name + set code + collector number via Claude Vision.
// Free users are limited to FREE_SCAN_LIMIT scans per day (midnight reset). Pro users have no limit.
const { corsHeaders } = require('./_cors')

// ~5 MB of base64 ≈ ~3.75 MB actual image — well above any real card scan
const MAX_BASE64_CHARS = 5 * 1024 * 1024

// Valid base64 prefixes for JPEG, PNG, and WebP magic bytes
const VALID_IMAGE_PREFIXES = ['/9j/', 'iVBOR', 'UklGR']

const FREE_SCAN_LIMIT = 100

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(event) }
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  const apiKey      = process.env.ANTHROPIC_API_KEY
  const SUPABASE_URL = process.env.VITE_SUPABASE_URL
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY

  if (!apiKey || !SUPABASE_URL || !SERVICE_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Server not configured' }) }
  }

  // Require a logged-in user — prevents anonymous API quota drain
  const authHeader = (event.headers || {})['authorization'] || ''
  const userJwt    = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!userJwt) {
    return { statusCode: 401, headers: corsHeaders(event), body: JSON.stringify({ error: 'Authentication required' }) }
  }

  const adminHeaders = {
    apikey:         SERVICE_KEY,
    Authorization:  `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
  }

  let userId
  try {
    const verifyRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${userJwt}` },
    })
    if (!verifyRes.ok) throw new Error('invalid token')
    const userData = await verifyRes.json()
    userId = userData.id
  } catch {
    return { statusCode: 401, headers: corsHeaders(event), body: JSON.stringify({ error: 'Invalid or expired token' }) }
  }

  // ── Check membership tier & daily scan limit ─────────────────────────────────
  const profileRes = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=membership_tier,membership_end`,
    { headers: adminHeaders }
  )
  const profiles = await profileRes.json()
  const profile  = Array.isArray(profiles) ? profiles[0] : null
  let tier = profile?.membership_tier || 'free'

  // Treat expired pro as free
  if (tier === 'pro' && profile?.membership_end && new Date(profile.membership_end) < new Date()) {
    tier = 'free'
  }

  if (tier !== 'pro') {
    // Count today's scans
    const today = new Date().toISOString().slice(0, 10)
    const scanCountRes = await fetch(
      `${SUPABASE_URL}/rest/v1/scan_logs?user_id=eq.${userId}&scan_date=eq.${today}&select=id`,
      { headers: adminHeaders }
    )
    const scanRows   = await scanCountRes.json()
    const scansToday = Array.isArray(scanRows) ? scanRows.length : 0

    if (scansToday >= FREE_SCAN_LIMIT) {
      return {
        statusCode: 429,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(event) },
        body: JSON.stringify({
          error:      'Daily scan limit reached',
          limit:      FREE_SCAN_LIMIT,
          scansToday,
          upgradeRequired: true,
        }),
      }
    }
  }

  let image
  try {
    ;({ image } = JSON.parse(event.body))
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) }
  }

  if (!image) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing image field' }) }
  }

  // Reject oversized payloads before hitting the Anthropic API
  if (image.length > MAX_BASE64_CHARS) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Image exceeds maximum allowed size' }) }
  }

  // Reject anything that doesn't look like a real image (JPEG, PNG, or WebP)
  if (!VALID_IMAGE_PREFIXES.some(prefix => image.startsWith(prefix))) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid image format' }) }
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 120,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: 'image/jpeg', data: image },
              },
              {
                type: 'text',
                text: `This is a Magic: The Gathering card. Read the card carefully and reply with ONLY a JSON object in this exact format (no markdown, no extra text):
{"name":"<exact card name>","setCode":"<2-4 letter set code from bottom of card, lowercase>","collectorNumber":"<collector number from bottom of card>"}

The set code is the 2-4 letter abbreviation printed at the bottom of the card (e.g. "one", "bro", "mh3", "ltr", "tmt").
The collector number is the number printed at the bottom (e.g. "112", "261a").
If you cannot read a field, use null.
If this is not a Magic card, reply with: {"name":"unknown","setCode":null,"collectorNumber":null}`,
              },
            ],
          },
        ],
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      console.error('[scan-card] Claude API error:', err)
      return { statusCode: 502, body: JSON.stringify({ error: 'Claude API error' }) }
    }

    const json = await response.json()
    const raw  = json.content?.[0]?.text?.trim() || ''

    // Strip markdown code fences that Claude sometimes adds despite instructions
    // e.g. ```json {...} ``` → {...}
    const stripped = raw
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/, '')
      .trim()

    // Log this scan in scan_logs (fire-and-forget — don't block the response)
    const today = new Date().toISOString().slice(0, 10)
    fetch(`${SUPABASE_URL}/rest/v1/scan_logs`, {
      method:  'POST',
      headers: { ...adminHeaders, Prefer: 'return=minimal' },
      body:    JSON.stringify({ user_id: userId, scan_date: today }),
    }).catch(e => console.error('[scan-card] scan_log insert failed:', e.message))

    // Helper to return a parsed result
    function makeResult(parsed) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(event) },
        body: JSON.stringify({
          name:            (parsed.name            || 'unknown').trim(),
          setCode:         parsed.setCode          || null,
          collectorNumber: parsed.collectorNumber  || null,
        }),
      }
    }

    // 1 — try parsing the stripped string directly
    try {
      return makeResult(JSON.parse(stripped))
    } catch { /* continue */ }

    // 2 — try to extract a JSON object anywhere in the string
    const match = stripped.match(/\{[\s\S]*?\}/)
    if (match) {
      try {
        return makeResult(JSON.parse(match[0]))
      } catch { /* continue */ }
    }

    // 3 — last resort: the raw text is probably just the card name
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(event) },
      body: JSON.stringify({ name: stripped || 'unknown', setCode: null, collectorNumber: null }),
    }
  } catch (err) {
    console.error('[scan-card] fetch error:', err)
    return { statusCode: 500, headers: corsHeaders(event), body: JSON.stringify({ error: 'Internal error' }) }
  }
}
