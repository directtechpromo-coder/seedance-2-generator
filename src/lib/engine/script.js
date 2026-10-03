// src/lib/engine/script.js
// Script Engine: one prompt -> a full long-form episode, split into scenes.
//
// Two stages so a 10-minute script stays coherent and never hits token limits:
//   1. Outline: title, SEO, style guide, Character Bible (looks + outfit), and
//      ~90-second story segments.
//   2. Each segment is expanded into scenes, in order, with the previous
//      scenes passed along for continuity.

import { LANGUAGES, LIMITS } from "./config.js";
import { llmJSON } from "./llm.js";

const SAFETY_RULES = `Content rules (the image/video models will REJECT violations):
- No gore, blood, wounds, dead bodies shown, or weapons aimed at people. For crime/horror, imply danger with shadows, reactions, aftermath objects, police tape, silhouettes.
- No real brand names, logos, celebrities or real public figures.
- No written text, signs, captions or letters inside the visuals.`;

function slug(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 24) || "char";
}

export function normalizeOutline(raw, { targetMinutes }) {
  const chars = Array.isArray(raw?.characters) ? raw.characters.slice(0, 6) : [];
  const seen = new Set();
  const characters = chars
    .map((c) => {
      let key = slug(c.key || c.name);
      while (seen.has(key)) key = `${key}_2`;
      seen.add(key);
      return {
        key,
        name: String(c.name || key),
        gender: String(c.gender || "male"),
        ageGroup: String(c.ageGroup || "adult"),
        appearance: String(c.appearance || ""),
        outfit: String(c.outfit || ""),
        personality: String(c.personality || ""),
      };
    })
    .filter((c) => c.appearance);

  const totalSec = targetMinutes * 60;
  let segments = Array.isArray(raw?.segments) ? raw.segments : [];
  if (!segments.length) segments = [{ summary: String(raw?.logline || "The story"), targetSeconds: totalSec }];
  // Re-scale segment lengths so they add up to the requested runtime.
  const sum = segments.reduce((a, s) => a + (Number(s.targetSeconds) || 90), 0) || 1;
  segments = segments.map((s, i) => ({
    index: i + 1,
    summary: String(s.summary || ""),
    targetSeconds: Math.max(20, Math.round(((Number(s.targetSeconds) || 90) / sum) * totalSec)),
  }));

  const locSeen = new Set();
  const locations = (Array.isArray(raw?.locations) ? raw.locations : [])
    .slice(0, 8)
    .map((l) => {
      let key = slug(l.key || l.name);
      while (locSeen.has(key)) key = `${key}_2`;
      locSeen.add(key);
      return { key, description: String(l.description || "").trim() };
    })
    .filter((l) => l.description);

  const seo = raw?.seo || {};
  return {
    title: String(raw?.title || "Untitled"),
    logline: String(raw?.logline || ""),
    narratorGender: String(raw?.narratorGender || "male").toLowerCase().startsWith("f") ? "female" : "male",
    styleGuide: String(raw?.styleGuide || ""),
    seo: {
      title: String(seo.title || raw?.title || "").slice(0, 100),
      description: String(seo.description || ""),
      tags: Array.isArray(seo.tags) ? seo.tags.map(String).slice(0, 30) : [],
    },
    characters,
    locations,
    segments,
  };
}

export function normalizeScenes(rawScenes, characterKeys, locations = []) {
  const keys = new Set(characterKeys);
  const locByKey = Object.fromEntries(locations.map((l) => [l.key, l.description]));
  const list = Array.isArray(rawScenes) ? rawScenes : [];
  return list
    .map((s) => {
      const dialogue = (Array.isArray(s.dialogue) ? s.dialogue : [])
        .map((d) => ({ character: slug(d.character), line: String(d.line || "").trim() }))
        .filter((d) => d.line && keys.has(d.character));
      const characters = [...new Set((Array.isArray(s.characters) ? s.characters : []).map(slug))].filter((k) =>
        keys.has(k)
      );
      // A speaker who is NOT in `characters` is treated as off-screen voiceover
      // (never lip-synced). The planner relies on this.
      // Locked location: the same fixed description is put in front of every
      // scene set there, so the garden stays the same garden all episode.
      const loc = locByKey[slug(s.location)];
      const visual = String(s.visual || "").trim();
      return {
        narration: String(s.narration || "").trim(),
        dialogue,
        visual: visual && loc ? `Location: ${loc}. ${visual}` : visual,
        characters,
        shot: ["wide", "medium", "close-up"].includes(s.shot) ? s.shot : "medium",
        action: String(s.action || "").trim(),
        mood: String(s.mood || "").trim(),
      };
    })
    .filter((s) => s.visual);
}

function outlinePrompt({ prompt, language, targetMinutes, style }) {
  const nSeg = Math.max(1, Math.round((targetMinutes * 60) / 90));
  return `Create a ${targetMinutes}-minute YouTube episode from this idea:
"""${prompt}"""

Language for the spoken words: ${LANGUAGES[language].label}. ${LANGUAGES[language].scriptNote}
Visual style requested: ${style || "choose one that fits the story"}.

Return ONLY JSON:
{
  "title": "episode title in ${LANGUAGES[language].label}",
  "logline": "one sentence in English",
  "seo": {
    "title": "YouTube title, max 90 chars, curiosity-driven, includes the main keyword",
    "description": "YouTube description, 2 short paragraphs + 3 hashtags",
    "tags": ["10-20 search tags, mix of ${LANGUAGES[language].label} and English"]
  },
  "narratorGender": "male" or "female",
  "styleGuide": "ENGLISH. One fixed visual style line appended to EVERY image prompt, e.g. '3D Pixar-style animation, soft warm lighting, rich colors, cinematic depth of field'",
  "characters": [
    {
      "key": "short_lowercase_id",
      "name": "display name",
      "gender": "male|female|neutral",
      "ageGroup": "child|teen|adult|elder",
      "appearance": "ENGLISH. Exact fixed look: face shape, skin tone, eyes, hair style+color, body build, distinctive features",
      "outfit": "ENGLISH. Exact clothes + colors worn in EVERY scene",
      "personality": "short"
    }
  ],
  "locations": [
    { "key": "short_lowercase_id", "description": "ENGLISH. Fixed look of this place: layout, key objects, colors, time of day. Reused word-for-word in every scene set here." }
  ],
  "segments": [ { "summary": "what happens in this part (English)", "targetSeconds": 90 } ]
}

Rules:
- Exactly ${nSeg} segments whose targetSeconds add up to about ${targetMinutes * 60}.
- 1-6 recurring characters max. Animals/creatures allowed (gender "neutral").
- 1-6 locations. Keep the story in as few places as it needs; a place must not silently change into another.
- Strong hook in segment 1, rising tension, satisfying ending.
${SAFETY_RULES}`;
}

function segmentPrompt({ outline, segment, previous, language }) {
  const nScenes = Math.max(2, Math.round(segment.targetSeconds / LIMITS.avgSceneSeconds));
  const wps = LIMITS.wordsPerSecond[language] || 2.4;
  const words = Math.round(LIMITS.avgSceneSeconds * wps);
  const cast = outline.characters
    .map((c) => `- ${c.key} (${c.name}, ${c.ageGroup} ${c.gender}): ${c.appearance}; wears ${c.outfit}`)
    .join("\n");
  const places = (outline.locations || []).map((l) => `- ${l.key}: ${l.description}`).join("\n");
  const prev = previous.length
    ? previous.map((s) => `- ${s.visual} | ${s.narration} ${s.dialogue.map((d) => `${d.character}: ${d.line}`).join(" ")}`).join("\n")
    : "(this is the opening — start with a hook)";
  return `Episode: "${outline.title}" — ${outline.logline}
Characters (use these keys exactly):
${cast || "(no recurring characters)"}

Locations (use these keys exactly):
${places || "(none fixed)"}

Story so far (last scenes):
${prev}

Now write segment ${segment.index} of ${outline.segments.length}: ${segment.summary}
Write about ${nScenes} scenes, each ~${LIMITS.avgSceneSeconds} seconds of speech.
LENGTH IS CRITICAL: each scene needs AT LEAST ${words} spoken words (narration + dialogue combined) — about ${words * nScenes} words for this segment. Short scenes make the video too short.

Return ONLY JSON:
{
  "scenes": [
    {
      "narration": "narrator's words in ${LANGUAGES[language].label} (may be empty)",
      "dialogue": [ { "character": "key", "line": "spoken line in ${LANGUAGES[language].label}" } ],
      "visual": "ENGLISH. What the camera sees: setting, lighting, which characters (by name) and what they are doing. ONE clear action only.",
      "characters": ["keys of characters VISIBLE in this shot"],
      "location": "location key where this shot happens",
      "shot": "wide|medium|close-up",
      "action": "ENGLISH. The single physical movement in this shot, or empty string if nothing moves",
      "mood": "one word"
    }
  ]
}

Rules:
- ${LANGUAGES[language].scriptNote}
- Every scene must have narration or dialogue, except at most one short silent dramatic pause per segment.
- A character who speaks a dialogue line must be listed in that scene's "characters".
- Vary shots: establishing wides, medium action shots, close-ups for emotion and dialogue.
- Visuals never repeat the exact same composition twice in a row.
${SAFETY_RULES}`;
}

const SYSTEM =
  "You are a senior YouTube scriptwriter and storyboard artist. You write gripping, well-paced episodes and always answer with strict JSON only.";

/**
 * Generate the full script. Returns { outline, scenes, cost }.
 * @param {{prompt:string, language:"ur"|"hi"|"en", targetMinutes:number, style?:string, mock?:object}} args
 */
export async function generateScript({ prompt, language = "ur", targetMinutes = 10, style = "", mock }) {
  let cost = 0;
  const o = await llmJSON({
    system: SYSTEM,
    prompt: outlinePrompt({ prompt, language, targetMinutes, style }),
    maxTokens: 6000,
    mock: mock?.outline,
  });
  cost += o.cost;
  const outline = normalizeOutline(o.json, { targetMinutes });
  if (style && !outline.styleGuide) outline.styleGuide = style;

  const keys = outline.characters.map((c) => c.key);
  const scenes = [];
  for (const segment of outline.segments) {
    const previous = scenes.slice(-3);
    let segScenes = [];
    for (let attempt = 0; attempt < 2 && !segScenes.length; attempt++) {
      const r = await llmJSON({
        system: SYSTEM,
        prompt: segmentPrompt({ outline, segment, previous, language }),
        maxTokens: 8000,
        mock: mock?.segment ? () => mock.segment(segment) : undefined,
      });
      cost += r.cost;
      segScenes = normalizeScenes(r.json?.scenes, keys, outline.locations);
    }
    if (!segScenes.length) throw new Error(`Script writer returned no scenes for segment ${segment.index}`);
    scenes.push(...segScenes);
  }
  return { outline, scenes: scenes.map((s, i) => ({ ...s, index: i })), cost };
}
