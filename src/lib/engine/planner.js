// src/lib/engine/planner.js
// Scene Planner: decides, per scene,
//   - visualType: STILL (image + camera move) or MOTION (image-to-video clip)
//   - audioType:  NARRATION | DIALOGUE | LIPSYNC | SFX_ONLY | SILENT
//   - camera move for STILL parts
//
// The LLM only SCORES scenes (how much does this moment need real motion?).
// The money decision — which scenes actually get motion / lip sync — is made by
// deterministic code (enforceBudget) so the cost of a video is always capped by
// the user's plan, no matter what the LLM says.

import { LIMITS, PLANS, MAX_MOTION_RATIO, lipsyncAllowance } from "./config.js";
import { llmJSON } from "./llm.js";

export const CAMERAS = ["zoom_in", "zoom_out", "pan_left", "pan_right"];

export function hasText(scene) {
  return Boolean(scene.narration?.trim()) || (scene.dialogue || []).some((d) => d.line?.trim());
}

/** Base audio type from script content alone. */
export function baseAudioType(scene) {
  const narr = Boolean(scene.narration?.trim());
  const dlg = (scene.dialogue || []).length > 0;
  if (!narr && !dlg) return scene.action ? "SFX_ONLY" : "SILENT";
  if (dlg && !narr) return "DIALOGUE";
  if (dlg && narr) return "DIALOGUE"; // mixed: narrator + character voices, no lip sync
  return "NARRATION";
}

/** Can this scene be lip-synced? One on-screen speaker, no narrator, not a wide shot. */
export function lipsyncEligible(scene) {
  if (scene.narration?.trim()) return false;
  const speakers = [...new Set((scene.dialogue || []).map((d) => d.character))];
  if (speakers.length !== 1) return false;
  if (!(scene.characters || []).includes(speakers[0])) return false;
  return scene.shot === "close-up" || scene.shot === "medium";
}

/** Deterministic camera choice for still images. */
export function cameraFor(scene, i) {
  if (scene.shot === "close-up") return i % 2 ? "zoom_in" : "zoom_out";
  if (scene.shot === "wide") return i % 2 ? "pan_left" : "pan_right";
  return CAMERAS[i % CAMERAS.length];
}

/** Story Mode: every scene is a STILL with a camera move; no lip sync. */
export function storyPlan(scenes) {
  return scenes.map((s, i) => ({
    index: s.index ?? i,
    visualType: "STILL",
    audioType: baseAudioType(s),
    camera: cameraFor(s, i),
    motionScore: 0,
    motionPrompt: "",
    clipSeconds: 0,
    lipsync: false,
  }));
}

function plannerPrompt(scenes) {
  const lines = scenes
    .map(
      (s) =>
        `${s.index}. [${s.shot}, ${Math.round(s.durationSec || LIMITS.avgSceneSeconds)}s] visual: ${s.visual} | action: ${s.action || "-"} | speaks: ${
          (s.dialogue || []).map((d) => d.character).join(",") || "-"
        } | narration: ${s.narration ? "yes" : "no"}`
    )
    .join("\n");
  return `You are planning an AI video. Real motion video is expensive, a still image with a slow camera move is cheap.
Score how much each scene NEEDS real motion to work for the viewer.

Scoring guide (motionScore 0-10):
- 9-10: physical action is the point of the scene (running, falling, fighting, explosion, chase, something breaking, a creature moving)
- 7-8: clear character movement or emotional peak (turning around in shock, hugging, crying, door bursting open)
- 4-6: small movement would be nice (walking, talking with gestures, weather)
- 0-3: establishing shots, places, objects, documents, maps, calm narration, portraits

Also give:
- motionPrompt: ENGLISH acting direction for an image-to-video model. Every scene with characters WILL be animated, so describe how they ACT: the main action, body language, facial expression, gestures, who they look at, plus camera movement (e.g. "Raza gasps, steps back with wide scared eyes and raises his hands, Coco tilts its head curiously, slow push-in"). For talking scenes describe the speaker's expressive gestures and the listeners' reactions.
- camera: best still-image move: zoom_in | zoom_out | pan_left | pan_right
- lipsync: true only if a single visible character speaking to camera/another character in a close or medium shot would clearly benefit from moving lips

Scenes:
${lines}

Return ONLY JSON: {"scenes":[{"index":0,"motionScore":0,"motionPrompt":"","camera":"zoom_in","lipsync":false}]}
Include every scene index exactly once.`;
}

/** LLM scoring. Returns Map(index -> {motionScore, motionPrompt, camera, lipsync}) and cost. */
export async function scoreScenes(scenes, { mock } = {}) {
  const out = new Map();
  let cost = 0;
  // Batches keep the prompt small and the JSON reliable on long videos.
  const BATCH = 30;
  for (let i = 0; i < scenes.length; i += BATCH) {
    const batch = scenes.slice(i, i + BATCH);
    const r = await llmJSON({
      system: "You are a film director and cost-conscious producer. Answer with strict JSON only.",
      prompt: plannerPrompt(batch),
      maxTokens: 6000,
      temperature: 0.2,
      mock: mock ? () => mock(batch) : undefined,
    });
    cost += r.cost;
    for (const s of r.json?.scenes || []) {
      const idx = Number(s.index);
      if (!Number.isInteger(idx)) continue;
      out.set(idx, {
        motionScore: Math.max(0, Math.min(10, Number(s.motionScore) || 0)),
        motionPrompt: String(s.motionPrompt || ""),
        camera: CAMERAS.includes(s.camera) ? s.camera : null,
        lipsync: Boolean(s.lipsync),
      });
    }
  }
  return { scores: out, cost };
}

/** Motion seconds a video of `totalSec` gets on this plan (never below the plan minimum). */
/** Hailuo clip length (6 or 10s) that covers a shot of `dur` seconds. */
export function clipLengthFor(dur) {
  return dur <= 6.3 ? 6 : 10;
}

/** Default acting direction when the planner gave none. */
function actingPrompt(scene) {
  if (scene.action) return scene.action;
  const speakers = [...new Set((scene.dialogue || []).map((d) => d.character))];
  if (speakers.length) return `${speakers.join(" and ")} talking expressively with natural hand gestures, head movement and changing facial expressions, the others react`;
  if ((scene.characters || []).length) return "the characters move naturally, breathe, blink and react with expressive faces and small gestures";
  return "subtle natural movement in the scene, gentle cinematic camera movement";
}

/**
 * Cinema Mode plan. Pure function — unit tested.
 * Every shot with a character or an action is animated (characters act).
 * Empty establishing shots with a low motion score stay STILL.
 * Dialogue close-ups get lip sync up to the plan's allowance.
 * @param {{scenes:Array, scores:Map, planKey:string}} args scenes must have durationSec
 */
export function enforceBudget({ scenes, scores, planKey = "standard" }) {
  const plan = PLANS[planKey] || PLANS.standard;
  const totalSec = scenes.reduce((a, s) => a + (s.durationSec || 0), 0);
  let budget = Math.ceil(totalSec * MAX_MOTION_RATIO);
  let lipsyncLeft = lipsyncAllowance(plan, totalSec);

  const result = scenes.map((s, i) => {
    const sc = scores.get(s.index ?? i) || {};
    return {
      index: s.index ?? i,
      visualType: "STILL",
      audioType: baseAudioType(s),
      camera: sc.camera || cameraFor(s, i),
      motionScore: sc.motionScore || 0,
      motionPrompt: sc.motionPrompt || actingPrompt(s),
      clipSeconds: 0,
      lipsync: false,
    };
  });
  const sceneOf = (r) => scenes.find((s, i) => (s.index ?? i) === r.index);
  const durOf = (r) => sceneOf(r)?.durationSec || LIMITS.avgSceneSeconds;
  const needsMotion = (r) => {
    const s = sceneOf(r);
    return (s.characters || []).length > 0 || Boolean(s.action) || r.motionScore >= LIMITS.motionScoreThreshold;
  };

  // 1) Animate every shot that needs it, in story order (cap is a safety net only).
  for (const r of result) {
    if (!needsMotion(r)) continue;
    const clip = clipLengthFor(durOf(r));
    if (budget < clip) break;
    r.visualType = "MOTION";
    r.clipSeconds = clip;
    budget -= clip;
  }

  // 2) Lip sync on the best dialogue close-ups that are already animated.
  const lipCandidates = result
    .filter((r) => r.visualType === "MOTION" && lipsyncEligible(sceneOf(r)))
    .sort((a, b) => Number(scores.get(b.index)?.lipsync || 0) - Number(scores.get(a.index)?.lipsync || 0) || b.motionScore - a.motionScore || a.index - b.index);
  for (const r of lipCandidates) {
    if (lipsyncLeft <= 0) break;
    r.lipsync = true;
    r.audioType = "LIPSYNC";
    lipsyncLeft--;
  }

  return result;
}

/** Full Cinema Mode planning. Returns { plan, cost }. */
export async function cinemaPlan(scenes, { planKey, mock } = {}) {
  const { scores, cost } = await scoreScenes(scenes, { mock });
  return { plan: enforceBudget({ scenes, scores, planKey }), cost };
}
