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
import { EMOTIONS, normalizeEmotion } from "./emotion.js";

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
        // Size is folded into the locked appearance so every prompt carries it.
        appearance: [String(c.appearance || "").trim(), c.size ? `Size: ${String(c.size).trim()}.` : ""].filter(Boolean).join(" "),
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
        .map((d) => ({ character: slug(d.character), line: String(d.line || "").trim(), emotion: normalizeEmotion(d.emotion) }))
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
        mood: normalizeEmotion(s.mood), // also the narrator's delivery for this scene
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
      "size": "ENGLISH. Height relative to the others, fixed for the whole episode, e.g. 'small, reaches Raza's waist'",
      "personality": "short"
    }
  ],
  "locations": [
    { "key": "short_lowercase_id", "description": "ENGLISH. Fixed look of this place: layout, key objects, colors, AND a fixed time of day + lighting (e.g. 'bright midday sun'). Reused word-for-word in every scene set here." }
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
Write ${nScenes} scenes, each ~${LIMITS.avgSceneSeconds} seconds of speech.
LENGTH IS CRITICAL — the video must match the requested runtime:
- Each scene: ${Math.round(words * 0.8)}-${Math.round(words * 1.2)} spoken words (narration + dialogue combined). NEVER more than ${Math.round(words * 1.2)}.
- Whole segment: about ${words * nScenes} words in total.
Short punchy sentences. One idea per scene; start a new scene instead of making one longer.

Return ONLY JSON:
{
  "scenes": [
    {
      "narration": "narrator's words in ${LANGUAGES[language].label} (may be empty)",
      "dialogue": [ { "character": "key", "line": "spoken line in ${LANGUAGES[language].label}", "emotion": "how it is said" } ],
      "visual": "ENGLISH. What the camera sees: setting, lighting, which characters (by name) and what they are doing. ONE clear action only.",
      "characters": ["keys of characters VISIBLE in this shot"],
      "location": "location key where this shot happens",
      "shot": "wide|medium|close-up",
      "action": "ENGLISH. The single physical movement in this shot, or empty string if nothing moves",
      "mood": "the narrator's emotion for this scene"
    }
  ]
}

Rules:
- ${LANGUAGES[language].scriptNote}
- Every scene must have narration or dialogue, except at most one short silent dramatic pause per segment.
- A character who speaks a dialogue line must be listed in that scene's "characters".
- Vary shots: establishing wides, medium action shots, close-ups for emotion and dialogue.
- "emotion" and "mood" must each be one of: ${EMOTIONS.join(", ")}. Match the moment (a scared child = scared, a joke = laughing, a secret = whisper). Avoid "neutral" unless the line is truly flat.
- Write lines the way people really talk, with natural punctuation (! ? ...) — it makes the voices more expressive.
- Visuals never repeat the exact same composition twice in a row.
${SAFETY_RULES}`;
}

export function sceneWords(s) {
  const text = [s.narration, ...(s.dialogue || []).map((d) => d.line)].join(" ");
  return text.split(/\s+/).filter(Boolean).length;
}

const SENTENCE_SPLIT = /(?<=[.!?\u06D4\u061F\u0964])\s+/; // . ! ? ۔ ؟ ।
const ANGLES = [
  { shot: "close-up", note: (who) => `Close-up on ${who}'s face showing their emotion, nobody else in front of the camera` },
  { shot: "wide", note: () => "Wide shot showing the whole setting from a different angle" },
  { shot: "medium", note: () => "Medium shot from the side, a new camera angle" },
];

/**
 * Split scenes whose speech is longer than maxShotSeconds into several shots.
 * Each extra shot gets a new camera angle (so a new image) instead of one
 * picture sitting on screen for 20 seconds. Order of speech is preserved.
 */
export function splitLongScenes(scenes, language) {
  const wps = LIMITS.wordsPerSecond[language] || 2.6;
  const maxWords = Math.max(8, Math.round(LIMITS.maxShotSeconds * wps));
  const out = [];
  for (const s of scenes) {
    if (sceneWords(s) <= maxWords * 1.15) {
      out.push(s);
      continue;
    }
    // Speech units in playback order: narration sentences, then dialogue sentences.
    const units = [];
    for (const t of s.narration ? s.narration.split(SENTENCE_SPLIT) : []) if (t.trim()) units.push({ kind: "n", text: t.trim() });
    for (const d of s.dialogue || [])
      for (const t of d.line.split(SENTENCE_SPLIT)) if (t.trim()) units.push({ kind: "d", character: d.character, emotion: d.emotion, text: t.trim() });
    const shots = [];
    let cur = [];
    let curWords = 0;
    for (const u of units) {
      const w = u.text.split(/\s+/).length;
      if (cur.length && curWords + w > maxWords) {
        shots.push(cur);
        cur = [];
        curWords = 0;
      }
      cur.push(u);
      curWords += w;
    }
    if (cur.length) shots.push(cur);
    shots.forEach((units, k) => {
      const narration = units.filter((u) => u.kind === "n").map((u) => u.text).join(" ");
      const dialogue = [];
      for (const u of units.filter((u) => u.kind === "d")) {
        const last = dialogue[dialogue.length - 1];
        if (last && last.character === u.character) last.line += ` ${u.text}`;
        else dialogue.push({ character: u.character, line: u.text, emotion: u.emotion });
      }
      if (k === 0) {
        out.push({ ...s, narration, dialogue });
        return;
      }
      const angle = ANGLES[(k - 1) % ANGLES.length];
      const speakers = dialogue.map((d) => d.character);
      out.push({
        ...s,
        narration,
        dialogue,
        characters: [...new Set([...s.characters, ...speakers.filter((c) => s.characters.includes(c))])],
        shot: angle.shot,
        visual: `${s.visual} Camera: ${angle.note(speakers[0] || s.characters[0] || "the character")}.`,
        action: "", // the scene's main action plays in its first shot
      });
    });
  }
  return out;
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
  const wps = LIMITS.wordsPerSecond[language] || 2.6;
  const scenes = [];
  for (const segment of outline.segments) {
    const previous = scenes.slice(-3);
    const targetWords = Math.round(segment.targetSeconds * wps);
    let best = null;
    let prompt = segmentPrompt({ outline, segment, previous, language });
    for (let attempt = 0; attempt < 3; attempt++) {
      const r = await llmJSON({
        system: SYSTEM,
        prompt,
        maxTokens: 8000,
        mock: mock?.segment ? () => mock.segment(segment, attempt) : undefined,
      });
      cost += r.cost;
      const segScenes = normalizeScenes(r.json?.scenes, keys, outline.locations);
      if (!segScenes.length) continue;
      const words = segScenes.reduce((a, s) => a + sceneWords(s), 0);
      const off = Math.abs(words - targetWords) / targetWords;
      if (!best || off < best.off) best = { scenes: segScenes, off, words };
      if (off <= 0.3) break;
      // Too long or too short: send it back once more with the measured numbers.
      prompt = `${segmentPrompt({ outline, segment, previous, language })}

IMPORTANT: your previous draft of this segment had ${words} spoken words but the runtime needs about ${targetWords}. ${
        words > targetWords ? "Cut it down: fewer, shorter sentences." : "Add more spoken lines."
      } Stay within ${Math.round(targetWords * 0.85)}-${Math.round(targetWords * 1.15)} words in total.`;
    }
    if (!best) throw new Error(`Script writer returned no scenes for segment ${segment.index}`);
    scenes.push(...best.scenes);
  }
  const shots = splitLongScenes(scenes, language);
  return { outline, scenes: shots.map((s, i) => ({ ...s, index: i })), cost };
}
