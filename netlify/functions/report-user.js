// netlify/functions/report-user.js
// Stores a user report, notifies the admin in-app, and optionally sends email.
const { corsHeaders } = require('./_cors')

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders(event) }
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' }

  const SUPABASE_URL   = process.env.VITE_SUPABASE_URL
  const SERVICE_KEY    = process.env.SUPABASE_SERVICE_KEY
  const ADMIN_EMAIL    = process.env.ADMIN_EMAIL
  const RESEND_API_KEY = process.env.RESEND_API_KEY
  const FROM_EMAIL     = process.env.FROM_EMAIL || 'onboarding@resend.dev'

  const fail = (msg, status = 400) => ({
    statusCode: status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(event) },
    body: JSON.stringify({ error: msg }),
  })
  if (!SUPABASE_URL || !SERVICE_KEY) return fail('Server misconfigured', 500)

  const authHeader = (event.headers || {})['authorization'] || ''
  const userJwt = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!userJwt) return fail('Unauthorized', 401)

  const verifyRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${userJwt}` },
  })
  if (!verifyRes.ok) return fail('Unauthorized', 401)
  const caller = await verifyRes.json()

  let body
  try { body = JSON.parse(event.body || '{}') } catch { return fail('Invalid JSON') }
  const { reportedUserId, reportedEmail, reason } = body
  if (!reason?.trim()) return fail('Reason is required')

  const adminHeaders = {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
  }

  // Store the report
  await fetch(`${SUPABASE_URL}/rest/v1/reports`, {
    method: 'POST',
    headers: { ...adminHeaders, Prefer: 'return=minimal' },
    body: JSON.stringify({
      reporter_id:      caller.id,
      reporter_email:   caller.email,
      reported_user_id: reportedUserId || null,
      reported_email:   reportedEmail  || null,
      reason:           reason.trim(),
    }),
  })

  // Look up admin user ID so we can send an in-app notification
  let adminUserId = null
  if (ADMIN_EMAIL) {
    const usersRes  = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=1000`, { headers: adminHeaders })
    const usersJson = usersRes.ok ? await usersRes.json() : {}
    const adminUser = (usersJson.users || []).find(u => u.email === ADMIN_EMAIL)
    adminUserId = adminUser?.id || null
  }

  if (adminUserId) {
    await fetch(`${SUPABASE_URL}/rest/v1/notifications`, {
      method: 'POST',
      headers: { ...adminHeaders, Prefer: 'return=minimal' },
      body: JSON.stringify({
        user_id: adminUserId,
        type:    'report_received',
        title:   `⚠️ User reported: ${reportedEmail || 'Unknown'}`,
        body:    `By ${caller.email} — ${reason.trim().slice(0, 160)}`,
        data:    { reporterEmail: caller.email, reportedUserId, reportedEmail },
        read:    false,
      }),
    })
  }

  // Email via Resend (optional — configure RESEND_API_KEY + FROM_EMAIL in Netlify env)
  if (RESEND_API_KEY && ADMIN_EMAIL) {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from:    process.env.ORDER_FROM_EMAIL || `Mana Mint <${FROM_EMAIL}>`,
        to:      [ADMIN_EMAIL],
        subject: `[Report] ${reportedEmail || reportedUserId || 'Unknown user'} reported`,
        html: `
          <h2 style="color:#1ec4a6">User Report Received</h2>
          <p><strong>Reported by:</strong> ${caller.email}</p>
          <p><strong>Reported user:</strong> ${reportedEmail || reportedUserId || 'Unknown'}</p>
          <p><strong>Reason:</strong></p>
          <blockquote style="border-left:3px solid #1ec4a6;padding-left:12px;color:#555">${reason.trim()}</blockquote>
          <p style="color:#888;font-size:12px">Mana Mint Admin</p>
        `,
      }),
    }).catch(() => {})
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(event) },
    body: JSON.stringify({ ok: true }),
  }
}
