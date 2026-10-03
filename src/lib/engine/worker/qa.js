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
3. All listed characters are present; no duplicated or extra copies of them.
4. No visible text/letters, no deformed faces/hands/limbs.

Return ONLY JSON: {"score": 0-10 (10 = perfect continuity, below 7 = must regenerate), "issues": ["short concrete problems, e.g. 'Raza's shirt is blue instead of red'"]}`,
    imageUrls: [...cast.map((c) => c.masterImageUrl), imageUrl],
    mock: async () => mockScore("image", scene.index, attempt),
  });
  const score = Math.max(0, Math.min(10, Number(json?.score) || 0));
  const issues = Array.isArray(json?.issues) ? json.issues.map(String).slice(0, 5) : [];
  return { pass: score >= LIMITS.qaPassScore, score, issues, cost };
}

/** Compare a frame from the middle of a motion clip with the scene's start image. */
export async function checkClipFrame({ scene, imageUrl, frameUrl, attempt = 0 }) {
  const { json, cost } = await visionJSON({
    system: SYSTEM,
    prompt: `Image 1 is the start frame of an AI video clip. Image 2 is a frame from the middle of the clip.
Intended motion: ${scene.motionPrompt || scene.action || "subtle motion"}.
Check that the characters keep the same identity/outfit, nothing melts or morphs, no extra limbs, no warped faces, and the motion makes sense.
Return ONLY JSON: {"score": 0-10 (below 7 = unusable), "issues": ["short problems"]}`,
    imageUrls: [imageUrl, frameUrl],
    mock: async () => mockScore("clip", scene.index, attempt),
  });
  const score = Math.max(0, Math.min(10, Number(json?.score) || 0));
  const issues = Array.isArray(json?.issues) ? json.issues.map(String).slice(0, 5) : [];
  return { pass: score >= LIMITS.qaPassScore, score, issues, cost };
}
