import { NextResponse } from 'next/server'
import { fal } from '@fal-ai/client'

fal.config({ credentials: process.env.SEEDANCE_V2_API_KEY })

// AI-powered scene splitter. Customers paste scripts in whatever format they
// wrote/generated them in (screenplay headers, "Visual Prompt:" labels,
// narrator lines, dialogue, numbered scenes, plain paragraphs — anything).
// This does NOT require [SCENE N] tags. It reads the whole script and
// returns an array of clean, self-contained visual-generation prompts, one
// per scene, ready to feed straight into the existing per-scene pipeline
// (each becomes one 8-10s clip).
//
// Design notes:
// - Each returned scene prompt folds in: visual action/setting + any
//   spoken dialogue/narration for that beat (so lip-sync/audio generation
//   still has something to voice), stripped of screenplay scaffolding like
//   "SCENE 3 — THE LANDING" headers or "Visual Prompt:" labels.
// - Fails open: on any error, or if the model can't find multiple distinct
//   scenes, returns a single-item array with the original text untouched —
//   callers should treat that the same as "no split needed."
export async function POST(req) {
  try {
    const { script } = await req.json()
    if (!script || !script.trim()) {
      return NextResponse.json({ error: 'Missing script.' }, { status: 400 })
    }

    const result = await fal.subscribe('fal-ai/any-llm', {
      input: {
        model: 'anthropic/claude-3.5-sonnet',
        prompt: `A customer pasted this script into an AI video generator. It may already use [SCENE N] tags, or it may be written in any other format — screenplay headers like "SCENE 2 — THE FIVE MEN", "Visual Prompt:" labels, narrator lines, character dialogue, numbered beats, or plain paragraphs.

Your job: split it into the distinct visual scenes/shots it describes, and for EACH scene write ONE clean, self-contained prompt an AI video generator can act on for a single ~8-10 second clip.

Each scene prompt must:
- Describe the visual action, characters, and setting for that beat in plain descriptive prose (not screenplay format)
- Include any spoken dialogue or narration for that beat, written naturally so it can be voiced/lip-synced (e.g. "Nolan says, 'The atmosphere is unstable...'" rather than a script-style "Nolan:" label)
- Drop scene headers, act titles, numbering labels, and any "Visual Prompt:" style labels — just the descriptive content
- Stand alone — someone should understand the shot from this text alone, without needing the other scenes

Script:
"""
${script.trim()}
"""

Respond with ONLY valid JSON, no markdown, no explanation outside the JSON:
{"scenes": ["scene 1 prompt text", "scene 2 prompt text", "..."]}

If the script genuinely only describes ONE visual scene, return a single-item array.`,
      },
    })

    const rawText = result?.data?.output || ''
    const cleaned = rawText.replace(/```json|```/g, '').trim()

    let parsed
    try {
      parsed = JSON.parse(cleaned)
    } catch {
      // Model didn't return valid JSON — fail open with the original text as one scene.
      return NextResponse.json({ scenes: [script.trim()] })
    }

    const scenes = Array.isArray(parsed.scenes)
      ? parsed.scenes.map((s) => String(s).trim()).filter((s) => s.length > 0)
      : []

    if (scenes.length === 0) {
      return NextResponse.json({ scenes: [script.trim()] })
    }

    return NextResponse.json({ scenes })
  } catch (err) {
    console.error('smart-scenes error', err)
    // Fail open — a broken auto-split should never block generation.
    return NextResponse.json({ error: 'auto-split failed' }, { status: 500 })
  }
}
