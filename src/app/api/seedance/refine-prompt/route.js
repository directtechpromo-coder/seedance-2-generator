import { NextResponse } from 'next/server'
import { fal } from '@fal-ai/client'

// NOTE: use SEEDANCE_V2_API_KEY (same var the rest of the codebase uses for FAL),
// not FAL_KEY — verify-video/route.js uses FAL_KEY which isn't set anywhere else
// in this project and silently no-ops if that var is missing in Vercel.
fal.config({ credentials: process.env.SEEDANCE_V2_API_KEY })

// Prompt clarity check — called once before generation starts (Text-to-Video
// and Multi-Scene). Asks a text LLM whether the prompt/scene script is
// ambiguous, and if so, suggests a clearer rewrite. Purely advisory: the
// frontend treats any failure here (non-200, timeout, bad JSON) as "skip the
// check and generate anyway" (see checkPromptClarity in page.js), so this
// route should fail safely rather than throwing.
export async function POST(req) {
  try {
    const { prompt } = await req.json()
    if (!prompt || !prompt.trim()) {
      return NextResponse.json({ error: 'Missing prompt.' }, { status: 400 })
    }

    const result = await fal.subscribe('fal-ai/any-llm', {
      input: {
        model: 'anthropic/claude-3.5-sonnet',
        prompt: `A customer is about to generate an AI video from this prompt/scene script:

"""
${prompt.trim()}
"""

Check if it's clear enough for an AI video generator to act on reliably (specific enough about subject, action, setting, camera — not vague or contradictory). Respond with ONLY valid JSON, no markdown, no explanation outside the JSON:
{"clear": true or false, "issues": ["short issue 1", "short issue 2"], "improvedPrompt": "a rewritten, clearer version of the full prompt — only if clear is false, otherwise repeat the original"}`,
      },
    })

    const rawText = result?.data?.output || ''
    const cleaned = rawText.replace(/```json|```/g, '').trim()

    let parsed
    try {
      parsed = JSON.parse(cleaned)
    } catch {
      // Model didn't return valid JSON — treat as "clear", don't block the customer.
      return NextResponse.json({ clear: true, issues: [], improvedPrompt: prompt })
    }

    return NextResponse.json({
      clear: parsed.clear !== false,
      issues: Array.isArray(parsed.issues) ? parsed.issues : [],
      improvedPrompt: typeof parsed.improvedPrompt === 'string' ? parsed.improvedPrompt : prompt,
    })
  } catch (err) {
    console.error('refine-prompt error', err)
    // Fail open — a broken clarity check should never block generation.
    return NextResponse.json({ clear: true, issues: [], improvedPrompt: '' })
  }
}
