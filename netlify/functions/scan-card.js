// netlify/functions/scan-card.js
// Accepts a base64 JPEG of a MTG card and returns name + set code + collector number via Claude Vision.

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
        model: 'claude-3-5-haiku-20241022',
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

    // Helper to return a parsed result
    function makeResult(parsed) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: stripped || 'unknown', setCode: null, collectorNumber: null }),
    }
  } catch (err) {
    console.error('[scan-card] fetch error:', err)
    return { statusCode: 500, body: JSON.stringify({ error: 'Internal error' }) }
  }
}
