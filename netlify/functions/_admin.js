// netlify/functions/_admin.js
// Shared admin helpers — underscore prefix prevents Netlify exposing this as an endpoint.

// Netlify's scheduled function invocations arrive as a real POST request (NOT
// with an absent/undefined httpMethod, despite what several functions in this
// repo used to assume) carrying the header `x-nf-event: schedule`. That's the
// only reliable way to distinguish a genuine cron trigger from a real client
// call. Functions that treated "no httpMethod" as the scheduled signal were
// requiring an Authorization header the scheduler never sends, so their daily
// schedule was silently rejected with 401 every single run.
// https://docs.netlify.com/build/functions/scheduled-functions/
function isScheduledInvocation(event) {
  return (event.headers || {})['x-nf-event'] === 'schedule'
}

// Verifies the caller's JWT and checks admin status the same way as
// is-admin.js: either the primary ADMIN_EMAIL, or a granted admin via
// profiles.is_admin = true. Functions that only checked email===ADMIN_EMAIL
// incorrectly rejected granted (non-primary) admin accounts with 403 Forbidden.
// Returns { ok: true, email } or { ok: false, statusCode, error }.
async function verifyAdmin(SUPABASE_URL, SERVICE_KEY, ADMIN_EMAIL, authHeaderValue) {
  const userJwt = (authHeaderValue || '').replace(/^Bearer\s+/i, '').trim()
  if (!userJwt) return { ok: false, statusCode: 401, error: 'Missing auth token' }

  let userId, email
  try {
    const verifyRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${userJwt}` },
    })
    if (!verifyRes.ok) throw new Error('invalid token')
    ;({ id: userId, email } = await verifyRes.json())
  } catch {
    return { ok: false, statusCode: 401, error: 'Invalid or expired token' }
  }

  if (email === ADMIN_EMAIL) return { ok: true, email }

  if (userId) {
    try {
      const profileRes = await fetch(
        `${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=is_admin`,
        { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
      )
      if (profileRes.ok) {
        const rows = await profileRes.json()
        if (Array.isArray(rows) && rows[0]?.is_admin === true) return { ok: true, email }
      }
    } catch { /* fall through to Forbidden */ }
  }

  return { ok: false, statusCode: 403, error: 'Forbidden' }
}

module.exports = { isScheduledInvocation, verifyAdmin }
