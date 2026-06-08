// netlify/functions/revenuecat-webhook.js
// Receives RevenueCat webhook events and mirrors the "pro" entitlement into
// Supabase profiles (membership_tier / membership_end). The RevenueCat
// appUserID is the Supabase user id (set at init), so app_user_id == profiles.id.
//
// Configure in RevenueCat dashboard → Integrations → Webhooks:
//   URL:    https://www.manamint.store/.netlify/functions/revenuecat-webhook
//   Header: Authorization: <value of REVENUECAT_WEBHOOK_SECRET env var>

const ENTITLEMENT_ID = 'pro'

// Event types that grant/extend access vs. revoke it.
const GRANT  = new Set(['INITIAL_PURCHASE', 'RENEWAL', 'UNCANCELLATION', 'PRODUCT_CHANGE', 'NON_RENEWING_PURCHASE', 'SUBSCRIPTION_EXTENDED'])
const REVOKE = new Set(['EXPIRATION', 'SUBSCRIPTION_PAUSED'])
// CANCELLATION / BILLING_ISSUE keep access until EXPIRATION — intentionally ignored.

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' }

  const SUPABASE_URL = process.env.VITE_SUPABASE_URL
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY
  const SECRET       = process.env.REVENUECAT_WEBHOOK_SECRET
  if (!SUPABASE_URL || !SERVICE_KEY || !SECRET) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Server not configured' }) }
  }

  // Verify the shared secret RevenueCat sends in the Authorization header.
  const auth = (event.headers || {})['authorization'] || (event.headers || {})['Authorization'] || ''
  if (auth !== SECRET) return { statusCode: 401, body: 'Unauthorized' }

  let body
  try { body = JSON.parse(event.body || '{}') } catch { return { statusCode: 400, body: 'Bad JSON' } }
  const ev = body.event || {}
  const type        = ev.type
  const appUserId   = ev.app_user_id
  const entitlements = ev.entitlement_ids || (ev.entitlement_id ? [ev.entitlement_id] : [])

  // Ignore anonymous IDs and events for other entitlements.
  if (!appUserId || appUserId.startsWith('$RCAnonymousID')) return { statusCode: 200, body: 'ignored (anon)' }
  if (entitlements.length && !entitlements.includes(ENTITLEMENT_ID)) {
    return { statusCode: 200, body: 'ignored (other entitlement)' }
  }

  let membership_tier, membership_end
  if (GRANT.has(type)) {
    membership_tier = 'pro'
    membership_end  = ev.expiration_at_ms ? new Date(ev.expiration_at_ms).toISOString() : null
  } else if (REVOKE.has(type)) {
    membership_tier = 'free'
    membership_end  = null
  } else {
    return { statusCode: 200, body: `ignored (${type})` }
  }

  const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates',
    },
    body: JSON.stringify({ id: appUserId, membership_tier, membership_end }),
  })

  if (!res.ok) {
    console.error('[revenuecat-webhook] profile upsert failed:', await res.text())
    return { statusCode: 500, body: 'upsert failed' }
  }
  console.log(`[revenuecat-webhook] ${type} → ${appUserId} = ${membership_tier}`)
  return { statusCode: 200, body: JSON.stringify({ ok: true }) }
}
