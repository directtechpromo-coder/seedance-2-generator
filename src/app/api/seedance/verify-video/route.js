import { NextResponse } from 'next/server'
import { fal } from '@fal-ai/client'

fal.config({ credentials: process.env.FAL_KEY })

// Takes a base64 frame captured from the generated video (client-side canvas
// grab) and the original prompt, and asks a vision LLM whether the frame
// looks consistent with what was asked for. Purely informational — never
// blocks download/use, just flags likely mismatches early.
export async function POST(req) {
  try {
    const { prompt, frameDataUrl } = await req.json()
    if (!prompt || !frameDataUrl) {
      return NextResponse.json({ error: 'Missing prompt or frame.' }, { status: 400 })
    }

    const result = await fal.subscribe('fal-ai/any-llm/vision', {
      input: {
        model: 'anthropic/claude-3.5-sonnet',
        image_url: frameDataUrl,
        prompt: `A customer asked an AI video generator for this: "${prompt}"

Here is a frame from the resulting video. In 1-2 short sentences, say whether this frame looks consistent with that request. Respond with ONLY valid JSON, no markdown:
{"matches": true or false, "note": "short 1-2 sentence explanation, plain and specific"}`,
      },
    })

    const rawText = result?.data?.output || ''
    const cleaned = rawText.replace(/```json|```/g, '').trim()

    let parsed
    try {
      parsed = JSON.parse(cleaned)
    } catch {
      return NextResponse.json({ matches: true, note: null })
    }

    return NextResponse.json({
      matches: parsed.matches !== false,
      note: typeof parsed.note === 'string' ? parsed.note : null,
    })
  } catch (err) {
    console.error('verify-video error', err)
    // Fail open — a broken QA check should never block the customer's video.
    return NextResponse.json({ matches: true, note: null })
  }
}
