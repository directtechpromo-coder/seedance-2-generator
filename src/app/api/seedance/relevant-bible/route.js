import { NextResponse } from 'next/server'
import { fal } from '@fal-ai/client'

fal.config({ credentials: process.env.SEEDANCE_V2_API_KEY })

// Smart Character Bible Trimming.
//
// The problem this solves: customers write ONE big Character Bible for an
// entire movie/series (hero, heroine, child, five villains, a dragon, egg
// specs, etc — sometimes 500+ words). But any single 8-10s scene usually
// only features 2-3 of those characters. Sending the ENTIRE bible with
// every scene means the video model has to read pages of irrelevant
// character descriptions (wrong gender, wrong costume, wrong species)
// alongside the ones that actually matter — which is a common cause of
// characters randomly changing gender/face/costume between scenes, or the
// model losing track of what the scene is actually about.
//
// This route reads the full bible + one scene's text, and returns ONLY the
// character blocks (extracted verbatim, not paraphrased, so exact physical
// details stay precise) that are actually relevant to that scene, plus any
// scene-independent global style/continuity rules (e.g. "cinematic
// realistic Hollywood visual style"). Runs once per scene, right before
// that scene is generated.
//
// Fails open: if the bible is short, or the model call fails, or nothing
// gets trimmed, the caller should fall back to sending the full bible
// untouched — this is a quality optimization, never a blocker.
export async function POST(req) {
  try {
    const { characterBible, sceneText } = await req.json()
    if (!characterBible || !characterBible.trim() || !sceneText || !sceneText.trim()) {
      return NextResponse.json({ error: 'Missing characterBible or sceneText.' }, { status: 400 })
    }

    const result = await fal.subscribe('fal-ai/any-llm', {
      input: {
        model: 'anthropic/claude-3.5-sonnet',
        prompt: `A customer has a full Character Bible describing every character/creature in their movie (it may include a hero, heroine, child character, multiple named villains, a creature, object specs, etc). They are about to generate ONE short scene, and the video model works better when it only receives the characters that actually appear in that scene — not the entire cast bible every time.

FULL CHARACTER BIBLE:
"""
${characterBible.trim()}
"""

THIS SCENE'S TEXT:
"""
${sceneText.trim()}
"""

Task: identify which named characters/creatures from the bible are actually present, referenced, or clearly implied in this scene's text (by name, or by unambiguous role like "the pilot" if only one pilot exists in the bible). Extract their FULL description blocks from the bible VERBATIM — do not paraphrase, summarize, or reword any physical detail, just copy the relevant blocks exactly as written. Also always include any scene-independent global rules from the bible that apply regardless of which characters appear (overall visual style, colour grading, physics realism, "no cartoon" type universal directives) — but do NOT include a specific character's or creature's continuity rule if that character/creature doesn't appear in this scene.

Respond with ONLY valid JSON, no markdown, no explanation outside the JSON:
{"relevantBible": "the trimmed bible text, verbatim excerpts only, ready to prepend to this scene's video prompt"}

If truly no character-specific detail applies (e.g. an establishing shot with no characters), return {"relevantBible": ""} plus only the global style rules if any exist.`,
      },
    })

    const rawText = result?.data?.output || ''
    const cleaned = rawText.replace(/```json|```/g, '').trim()

    let parsed
    try {
      parsed = JSON.parse(cleaned)
    } catch {
      // Model didn't return valid JSON — fail open with the untouched full bible.
      return NextResponse.json({ relevantBible: characterBible.trim() })
    }

    const relevantBible = typeof parsed.relevantBible === 'string' ? parsed.relevantBible.trim() : ''
    return NextResponse.json({ relevantBible: relevantBible || characterBible.trim() })
  } catch (err) {
    console.error('relevant-bible error', err)
    // Fail open — never block generation over a trimming optimization.
    return NextResponse.json({ error: 'trim failed' }, { status: 500 })
  }
}
