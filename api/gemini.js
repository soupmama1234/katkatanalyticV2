export const config = { runtime: 'nodejs' }

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'Gemini API key not configured' })
  }

  try {
    const { model, contents, generationConfig } = req.body

    if (!model || !contents) {
      return res.status(400).json({ error: 'Missing required fields' })
    }

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents, generationConfig }),
      }
    )

    const data = await geminiRes.json()

    if (!geminiRes.ok) {
      return res.status(geminiRes.status).json({ error: 'Gemini API error' })
    }

    return res.status(200).json(data)

  } catch (err) {
    console.error('Gemini proxy error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
