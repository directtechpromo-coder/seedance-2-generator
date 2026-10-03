// src/lib/engine/worker/qa.js
// Phase 3 — automatic quality checks with a vision model.
//   checkSceneImage: does every character in the scene still look like their
//                    LOCKED master image? Any text/deformities?
//   checkClipFrame:  did the motion clip drift away from the scene image?
// Scores are 0-10. The pipeline regenerates below LIMITS.qaPassScore.

import { LIMITS } from "../config.js";
import { visionJSON } from "../llm.js";

const SYSTEM = "You are a strict visual continuity supervisor for an animated series. Answer with strict JSON only.";

function mockScore(kind, sceneIndex, attempt) {
  const fail = (process.env.ENGINE_MOCK_QA_FAIL || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const failing = fail.includes(`${kind}:${sceneIndex}`) && attempt === 0;
  return failing
    ? { score: 3, issues: ["mock: face does not match reference"] }
    : { score: 9, issues: [] };
}

/** Returns { pass, score, issues, cost }. */
export async function checkSceneImage({ scene, cast, imageUrl, attempt = 0 }) {
  if (!cast.length) return { pass: true, score: null, issues: [], cost: 0 };
  const names = cast.map((c, i) => `image ${i + 1} = ${c.name}`).join(", ");
  const { json, cost } = await visionJSON({
    system: SYSTEM,
    prompt: `The first ${cast.length} image(s) are LOCKED character references (${names}). The LAST image is a newly generated scene that should show: ${cast
      .map((c) => c.name)
      .join(", ")}.
Scene description: ${scene.visual}

Check:
1. Identity: is each character clearly the SAME person as their reference — face, hairstyle, skin tone, age, body type?
2. Outfit: same clothes and colors as the reference?
3. All listed characters are present EXACTLY ONCE — a second copy of any character (twin, over-the-shoulder duplicate, reflection) is a severe error (score 3 or less).
4. Relative sizes match the references/description (a small creature must not be as tall as a child).
5. The image shows what the scene describes — the key action/effect in the right place (e.g. fire coming from a mouth, not from bushes).
6. No visible text/letters, no deformed faces/hands/limbs.

Return ONLY JSON: {"score": 0-10 (10 = perfect continuity, below 7 = must regenerate), "issues": ["short concrete problems, e.g. 'Raza's shirt is blue instead of red'"]}`,
    imageUrls: [...cast.map((c) => c.masterImageUrl), imageUrl],
    mock: async () => mockScore("image", scene.index, attempt),
  });
  const score = Math.max(0, Math.min(10, Number(json?.score) || 0));
  const issues = Array.isArray(json?.issues) ? json.issues.map(String).slice(0, 5) : [];
  return { pass: score >= LIMITS.qaPassScore, score, issues, cost };
}

/**
 * Check a motion clip for identity drift: compares frames from the middle AND the
 * end of the clip with the character references and the clip's start image.
 * (Drift usually shows up near the end, so the end frame matters most.)
 */
export async function checkClipFrame({ scene, cast = [], imageUrl, frameUrls, attempt = 0 }) {
  const refs = cast.map((c, i) => `image ${i + 1} = ${c.name} reference`).join(", ");
  const n = cast.length;
  const { json, cost } = await visionJSON({
    system: SYSTEM,
    prompt: `${n ? `The first ${n} image(s) are LOCKED character references (${refs}). ` : ""}Image ${n + 1} is the START frame of an AI video clip. Image ${n + 2} is from the MIDDLE and image ${n + 3} is from the END of the clip.
Intended motion: ${scene.motionPrompt || scene.action || "subtle motion"}.
Fail the clip (score below 7) if ANY of these happen in the middle or end frame:
- a character's face, hair color, skin tone, age or clothes change (even slightly — e.g. black hair turning brown)
- a character is duplicated, a new person appears, or a character disappears
- melting, morphing, extra limbs, warped faces
Return ONLY JSON: {"score": 0-10, "issues": ["short problems, say which frame"]}`,
    imageUrls: [...cast.map((c) => c.masterImageUrl), imageUrl, ...frameUrls],
    mock: async () => mockScore("clip", scene.index, attempt),
  });
  const score = Math.max(0, Math.min(10, Number(json?.score) || 0));
  const issues = Array.isArray(json?.issues) ? json.issues.map(String).slice(0, 5) : [];
  return { pass: score >= LIMITS.qaPassScore, score, issues, cost };
}
