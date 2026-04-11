/**
 *  * Vercel Serverless Function — Gemini Proxy
  * POST /api/gemini
   * Body: { model, contents, generationConfig }
    * 
     * GEMINI_API_KEY เก็บใน Vercel Environment Variable (ไม่ออก browser)
      */
      export default async function handler(req, res) {
        // รับเฉพาะ POST
          if (req.method !== 'POST') {
              return res.status(405).json({ error: 'Method not allowed' })
                }

                  const apiKey = process.env.GEMINI_API_KEY
                    if (!apiKey) {
                        return res.status(500).json({ error: 'Gemini API key not configured' })
                          }

                            try {
                                const { model, contents, generationConfig } = req.body

                                    // validate ขั้นต้น
                                        if (!model || !contents) {
                                              return res.status(400).json({ error: 'Missing required fields: model, contents' })
                                                  }

                                                      // ส่งต่อไป Gemini — key อยู่ฝั่ง server เท่านั้น
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
                                                                                                                      // ส่ง status กลับแต่ไม่ expose detail ของ key
                                                                                                                            return res.status(geminiRes.status).json({
                                                                                                                                    error: 'Gemini API error',
                                                                                                                                            status: geminiRes.status,
                                                                                                                                                  })
                                                                                                                                                      }

                                                                                                                                                          return res.status(200).json(data)

                                                                                                                                                            } catch (err) {
                                                                                                                                                                console.error('Gemini proxy error:', err)
                                                                                                                                                                    return res.status(500).json({ error: 'Internal server error' })
                                                                                                                                                                      }
                                                                                                                                                                      }
                                                                                                                                                                      
 */