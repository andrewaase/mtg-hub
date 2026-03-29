// netlify/functions/ebay-callback.js
// eBay redirects here after the user approves the app.
// We exchange the authorization code for access + refresh tokens,
// then redirect back to the app with the tokens in the URL hash
// (hash fragments never reach servers, so tokens stay client-side).

exports.handler = async (event) => {
  const { code, error } = event.queryStringParameters || {}
  const appUrl = process.env.URL || 'https://idyllic-hotteok-3d7656.netlify.app'

  if (error || !code) {
    return {
      statusCode: 302,
      headers: { Location: `${appUrl}/#ebay-error?reason=${encodeURIComponent(error || 'no_code')}` }
    }
  }

  const clientId     = process.env.EBAY_CLIENT_ID
  const clientSecret = process.env.EBAY_CLIENT_SECRET
  const ruName       = process.env.EBAY_RUNAME

  if (!clientId || !clientSecret || !ruName) {
    return {
      statusCode: 302,
      headers: { Location: `${appUrl}/#ebay-error?reason=missing_credentials` }
    }
  }

  try {
    // Exchange auth code for access + refresh tokens
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
    const body = new URLSearchParams({
      grant_type:   'authorization_code',
      code,
      redirect_uri: ruName
    })

    const res = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
      method:  'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type':  'application/x-www-form-urlencoded'
      },
      body: body.toString()
    })

    const data = await res.json()

    if (!res.ok || !data.access_token) {
      console.error('eBay token exchange failed:', data)
      return {
        statusCode: 302,
        headers: { Location: `${appUrl}/#ebay-error?reason=token_exchange_failed` }
      }
    }

    // Pass tokens back to the app via URL hash (never sent to any server)
    const params = new URLSearchParams({
      access_token:  data.access_token,
      refresh_token: data.refresh_token,
      expires_in:    data.expires_in   // seconds until access token expires
    })

    return {
      statusCode: 302,
      headers: { Location: `${appUrl}/#ebay-connected?${params.toString()}` }
    }
  } catch (err) {
    console.error('eBay callback error:', err)
    return {
      statusCode: 302,
      headers: { Location: `${appUrl}/#ebay-error?reason=server_error` }
    }
  }
}
