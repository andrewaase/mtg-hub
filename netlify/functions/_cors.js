// netlify/functions/_cors.js
// Shared CORS helper — underscore prefix prevents Netlify exposing this as an endpoint.
//
// Usage:
//   const { corsHeaders } = require('./_cors')
//   // inside handler:
//   headers: { ...corsHeaders(event), 'Content-Type': 'application/json' }

const ALLOWED_ORIGINS = [
  'https://www.manamint.store',
  'https://manamint.store',
  // Local dev
  'http://localhost:5173',
  'http://localhost:5176',
  'http://localhost:5180',
]

/**
 * Returns the correct Access-Control-Allow-Origin value for the request.
 * If the request Origin is in the allowlist, echo it back (required for
 * credentialed requests). Otherwise fall back to the primary production origin.
 */
function getAllowedOrigin(event) {
  const requestOrigin = event?.headers?.origin || event?.headers?.Origin || ''
  return ALLOWED_ORIGINS.includes(requestOrigin)
    ? requestOrigin
    : 'https://www.manamint.store'
}

/**
 * Returns a headers object with the correct CORS headers for the request.
 * Spread this into your function's response headers object.
 */
function corsHeaders(event) {
  return {
    'Access-Control-Allow-Origin':  getAllowedOrigin(event),
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }
}

module.exports = { corsHeaders, getAllowedOrigin, ALLOWED_ORIGINS }
