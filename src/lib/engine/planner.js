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

import { LIMITS, PLANS } from "./config.js";
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
- motionPrompt: ENGLISH, describes ONLY the movement for an image-to-video model, one action, plus camera movement (e.g. "the boy sprints toward the gate, camera tracks left, natural motion")
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

/**
 * Deterministic budget enforcement. Pure function — unit tested.
 * @param {{scenes:Array, scores:Map, planKey:string}} args scenes must have durationSec
 */
export function enforceBudget({ scenes, scores, planKey = "standard" }) {
  const plan = PLANS[planKey] || PLANS.standard;
  const totalSec = scenes.reduce((a, s) => a + (s.durationSec || 0), 0);
  let budget = Math.round((plan.motionSecondsPer10Min * totalSec) / 600);
  let lipsyncLeft = plan.maxLipsyncScenes;

  const result = scenes.map((s, i) => {
    const sc = scores.get(s.index ?? i) || {};
    return {
      index: s.index ?? i,
      visualType: "STILL",
      audioType: baseAudioType(s),
      camera: sc.camera || cameraFor(s, i),
      motionScore: sc.motionScore || 0,
      motionPrompt: sc.motionPrompt || s.action || "",
      clipSeconds: 0,
      lipsync: false,
    };
  });

  const clipFor = (dur) => (dur <= 7.5 ? 6 : 10);
  // Opening scenes decide retention — give them a bonus.
  const effScore = (r) => r.motionScore + (r.index <= 2 ? 2 : 0);

  // 1) Lip sync picks (each also needs a motion clip under it).
  const lipCandidates = result
    .filter((r, i) => lipsyncEligible(scenes[i]) && (scores.get(r.index)?.lipsync || r.motionScore >= 5))
    .sort((a, b) => effScore(b) - effScore(a));
  for (const r of lipCandidates) {
    if (lipsyncLeft <= 0) break;
    const clip = 6; // talking clips are short; lip sync loops/bounces to cover the audio
    if (budget < clip) break;
    r.visualType = "MOTION";
    r.clipSeconds = clip;
    r.lipsync = true;
    r.audioType = "LIPSYNC";
    if (!r.motionPrompt) r.motionPrompt = "the character talks naturally with subtle head and hand movement, steady camera";
    budget -= clip;
    lipsyncLeft--;
  }

  // 2) Motion by score.
  const motionCandidates = result
    .filter((r) => r.visualType === "STILL" && effScore(r) >= LIMITS.motionScoreThreshold)
    .sort((a, b) => effScore(b) - effScore(a) || a.index - b.index);
  for (const r of motionCandidates) {
    const dur = scenes.find((s, i) => (s.index ?? i) === r.index)?.durationSec || LIMITS.avgSceneSeconds;
    let clip = clipFor(dur);
    if (budget < clip) clip = budget >= 6 ? 6 : 0;
    if (!clip) continue;
    r.visualType = "MOTION";
    r.clipSeconds = clip;
    if (!r.motionPrompt) r.motionPrompt = "subtle natural motion, cinematic camera movement";
    budget -= clip;
  }

  return result;
}

/** Full Cinema Mode planning. Returns { plan, cost }. */
export async function cinemaPlan(scenes, { planKey, mock } = {}) {
  const { scores, cost } = await scoreScenes(scenes, { mock });
  return { plan: enforceBudget({ scenes, scores, planKey }), cost };
}
