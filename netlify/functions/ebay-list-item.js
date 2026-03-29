// netlify/functions/ebay-list-item.js
// Creates a draft eBay listing for a single MTG card.
// The draft is NOT published automatically — the seller reviews and
// publishes it on eBay's site. We return the draft URL to open in a new tab.

// Condition mapping: our app conditions → eBay condition IDs
const CONDITION_MAP = {
  NM:  { id: '1000', label: 'New'           }, // Near Mint → New
  LP:  { id: '3000', label: 'Very Good'     }, // Lightly Played → Very Good
  MP:  { id: '4000', label: 'Good'          }, // Moderately Played → Good
  HP:  { id: '5000', label: 'Acceptable'    }, // Heavily Played → Acceptable
}

// eBay category for Magic: The Gathering individual cards
const MTG_CATEGORY_ID = '2536'

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  let body
  try {
    body = JSON.parse(event.body)
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) }
  }

  const { card, accessToken, refreshToken } = body

  if (!card || !accessToken) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing card data or eBay access token' }) }
  }

  const clientId     = process.env.EBAY_CLIENT_ID
  const clientSecret = process.env.EBAY_CLIENT_SECRET
  const ruName       = process.env.EBAY_RUNAME

  if (!clientId || !clientSecret) {
    return { statusCode: 500, body: JSON.stringify({ error: 'eBay credentials not configured on server' }) }
  }

  // Helper: refresh access token if needed
  const refreshAccessToken = async (rt) => {
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
    const res = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type':  'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type:    'refresh_token',
        refresh_token: rt,
        scope: 'https://api.ebay.com/oauth/api_scope https://api.ebay.com/oauth/api_scope/sell.listing https://api.ebay.com/oauth/api_scope/sell.inventory'
      }).toString()
    })
    const data = await res.json()
    return data.access_token || null
  }

  // Build a good eBay title (max 80 chars)
  const conditionLabel = CONDITION_MAP[card.condition]?.label || 'Good'
  const rawTitle = `${card.name} MTG Magic Card ${card.condition || 'NM'} ${card.setName || ''}`.trim()
  const title = rawTitle.length > 80 ? rawTitle.slice(0, 77) + '...' : rawTitle

  // Build the description
  const description = [
    `<h2>${card.name}</h2>`,
    `<p><strong>Set:</strong> ${card.setName || 'Unknown'}</p>`,
    `<p><strong>Condition:</strong> ${conditionLabel} (${card.condition})</p>`,
    `<p><strong>Quantity:</strong> ${card.qty || 1}</p>`,
    card.type ? `<p><strong>Type:</strong> ${card.type}</p>` : '',
    `<br/>`,
    `<p>Listed via MTG Hub — your personal Magic: The Gathering collection manager.</p>`
  ].filter(Boolean).join('\n')

  // Price: use provided salePrice, fallback to Scryfall price, fallback to $0.99
  const price = (parseFloat(card.salePrice) || parseFloat(card.price) || 0.99).toFixed(2)

  // eBay item draft payload
  const draftPayload = {
    categoryId: MTG_CATEGORY_ID,
    condition:  CONDITION_MAP[card.condition]?.id || '3000',
    format:     'FIXED_PRICE',
    pricingSummary: {
      price: { currency: 'USD', value: price }
    },
    product: {
      title,
      description,
      aspects: {
        'Game':      ['Magic: The Gathering'],
        'Condition': [conditionLabel],
      },
      ...(card.img ? { imageUrls: [card.img] } : {})
    },
    quantity: card.sellQty || card.qty || 1,
  }

  // Try to create the draft listing; if token expired, refresh and retry once
  const tryCreate = async (token) => {
    return fetch('https://api.ebay.com/sell/listing/v1_beta/item_draft/', {
      method: 'POST',
      headers: {
        'Authorization':              `Bearer ${token}`,
        'Content-Type':               'application/json',
        'X-EBAY-C-MARKETPLACE-ID':   'EBAY_US',
      },
      body: JSON.stringify(draftPayload)
    })
  }

  try {
    let res = await tryCreate(accessToken)

    // If 401 (expired), try refreshing and retry once
    if (res.status === 401 && refreshToken) {
      const newToken = await refreshAccessToken(refreshToken)
      if (newToken) {
        res = await tryCreate(newToken)
        // Return the new token so the app can update its stored value
        const data = await res.json()
        if (res.ok) {
          return {
            statusCode: 200,
            body: JSON.stringify({
              success:      true,
              draftId:      data.listingDraftId,
              draftUrl:     data.listingDraftURL || `https://www.ebay.com/sell/listing?listingDraftId=${data.listingDraftId}`,
              newAccessToken: newToken   // app should save this
            })
          }
        }
      }
    }

    const data = await res.json()

    if (!res.ok) {
      console.error('eBay listing failed:', data)
      return {
        statusCode: res.status,
        body: JSON.stringify({ error: data.errors?.[0]?.message || 'eBay listing failed', details: data })
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success:  true,
        draftId:  data.listingDraftId,
        draftUrl: data.listingDraftURL || `https://www.ebay.com/sell/listing?listingDraftId=${data.listingDraftId}`
      })
    }
  } catch (err) {
    console.error('ebay-list-item error:', err)
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Server error creating eBay listing' })
    }
  }
}
