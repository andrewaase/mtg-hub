// netlify/functions/ebay-auth.js
// Redirects the user to eBay's OAuth authorization page.
// Called when the user clicks "Connect eBay Account" in the app.

exports.handler = async () => {
  const clientId = process.env.EBAY_CLIENT_ID
  const ruName   = process.env.EBAY_RUNAME   // The RuName from eBay developer portal

  if (!clientId || !ruName) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'eBay credentials not configured. Add EBAY_CLIENT_ID and EBAY_RUNAME to your Netlify environment variables.' })
    }
  }

  // Scopes needed: basic + sell.listing (for item drafts)
  const scopes = [
    'https://api.ebay.com/oauth/api_scope',
    'https://api.ebay.com/oauth/api_scope/sell.listing',
    'https://api.ebay.com/oauth/api_scope/sell.inventory'
  ].join(' ')

  const authUrl =
    `https://auth.ebay.com/oauth2/authorize` +
    `?client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(ruName)}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent(scopes)}`

  return {
    statusCode: 302,
    headers: { Location: authUrl }
  }
}
