// src/lib/ebay.js
// Frontend helpers for eBay OAuth connection and listing management.
// Tokens are stored in localStorage under 'mtg-hub-ebay'.

const LS_KEY = 'mtg-hub-ebay'

// ─── Token Storage ─────────────────────────────────────────────────────────

export function saveEbayTokens({ access_token, refresh_token, expires_in }) {
  const expiresAt = Date.now() + (parseInt(expires_in, 10) * 1000)
  localStorage.setItem(LS_KEY, JSON.stringify({ access_token, refresh_token, expires_at: expiresAt }))
}

export function getEbayTokens() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || 'null')
  } catch {
    return null
  }
}

export function clearEbayTokens() {
  localStorage.removeItem(LS_KEY)
}

export function isEbayConnected() {
  const tokens = getEbayTokens()
  // Connected if we have a refresh token (access token can be refreshed server-side)
  return !!(tokens?.refresh_token)
}

export function isAccessTokenExpired() {
  const tokens = getEbayTokens()
  if (!tokens?.expires_at) return true
  // Treat as expired 5 minutes early to avoid edge cases
  return Date.now() > tokens.expires_at - (5 * 60 * 1000)
}

// ─── OAuth Flow ────────────────────────────────────────────────────────────

// Kicks off the eBay OAuth flow by redirecting to our Netlify function.
export function connectEbay() {
  window.location.href = '/.netlify/functions/ebay-auth'
}

// Call this on app load to handle the eBay OAuth callback hash.
// Returns true if the hash contained eBay tokens (so the app can clear the hash).
export function handleEbayCallback() {
  const hash = window.location.hash

  if (hash.includes('ebay-connected')) {
    const params = new URLSearchParams(hash.split('?')[1] || '')
    const access_token  = params.get('access_token')
    const refresh_token = params.get('refresh_token')
    const expires_in    = params.get('expires_in')

    if (access_token && refresh_token) {
      saveEbayTokens({ access_token, refresh_token, expires_in })
      // Clean the tokens out of the URL
      window.history.replaceState({}, '', window.location.pathname)
      return 'connected'
    }
  }

  if (hash.includes('ebay-error')) {
    const params = new URLSearchParams(hash.split('?')[1] || '')
    const reason = params.get('reason') || 'unknown'
    window.history.replaceState({}, '', window.location.pathname)
    return `error:${reason}`
  }

  return null
}

// ─── Listing ───────────────────────────────────────────────────────────────

// Creates a draft eBay listing for a card.
// Opens the draft URL in a new tab for the user to review and publish.
export async function listCardOnEbay(card, showToast) {
  const tokens = getEbayTokens()

  if (!tokens?.access_token) {
    showToast('Connect your eBay account first')
    return false
  }

  try {
    showToast('Creating eBay draft listing...')

    const res = await fetch('/.netlify/functions/ebay-list-item', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        card,
        accessToken:  tokens.access_token,
        refreshToken: tokens.refresh_token
      })
    })

    const data = await res.json()

    if (!res.ok || !data.success) {
      showToast(`eBay error: ${data.error || 'listing failed'}`)
      return false
    }

    // If server refreshed our token, save the new one
    if (data.newAccessToken) {
      saveEbayTokens({
        access_token:  data.newAccessToken,
        refresh_token: tokens.refresh_token,
        expires_in:    7200  // eBay access tokens last 2 hours
      })
    }

    // Open the draft on eBay for review + publishing
    window.open(data.draftUrl, '_blank', 'noopener')
    showToast('Draft created! Review and publish it on eBay ✓')
    return true
  } catch (err) {
    console.error('listCardOnEbay error:', err)
    showToast('Failed to reach eBay. Check your connection.')
    return false
  }
}
