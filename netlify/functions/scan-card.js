// netlify/functions/scan-card.js
// Accepts a base64 JPEG of a MTG card and returns the card name via Claude Vision.

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }),
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
        max_tokens: 64,
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
                text: 'What is the name of this Magic: The Gathering card? Reply with only the exact card name, nothing else. If you cannot identify a Magic card in the image, reply with exactly: unknown',
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
    const name = json.content?.[0]?.text?.trim() || 'unknown'

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    }
  } catch (err) {
    console.error('[scan-card] fetch error:', err)
    return { statusCode: 500, body: JSON.stringify({ error: 'Internal error' }) }
  }
}
