// src/lib/engine/worker/media.js
// Image / motion / lip-sync generation.
//
// Consistency rules implemented here:
//   1. Each character gets ONE master image (generateMaster). It is locked.
//   2. Every scene that shows a character is made with the EDIT model and the
//      character's master image(s) as references — never from scratch.
//   3. Motion clips start FROM the scene image (image-to-video), so the moving
//      character is the same character as in the still scenes.
//   4. Every prompt ends with the project's fixed style guide.

import path from "node:path";
import { pathToFileURL } from "node:url";
import { ENGINE_MODELS, PRICES, isMockMode } from "../config.js";
import { EngineError, falRun } from "../fal.js";
import { llmJSON } from "../llm.js";
import { run } from "./ffmpeg.js";

const NO_TEXT = "No text, no letters, no captions, no watermark, no logo.";

function ratioFor(aspect) {
  return aspect === "9:16" ? "9:16" : "16:9";
}

export function masterPrompt(c, styleGuide) {
  return `Character reference sheet of ONE character, full body, standing, facing the camera, neutral relaxed pose, plain light grey studio background, even soft lighting. ${c.name}: ${c.ageGroup} ${c.gender}. Appearance: ${c.appearance}. Outfit: ${c.outfit}. Style: ${styleGuide}. ${NO_TEXT}`;
}

export function scenePrompt(scene, cast, styleGuide, aspect, fixHint = "") {
  const shot = scene.shot === "close-up" ? "close-up shot" : scene.shot === "wide" ? "wide establishing shot" : "medium shot";
  const frame = aspect === "9:16" ? "vertical 9:16" : "horizontal 16:9";
  if (!cast.length) {
    return `Cinematic ${frame} frame, ${shot}. ${scene.visual} Mood: ${scene.mood || "cinematic"}. Style: ${styleGuide}. ${NO_TEXT}${fixHint ? ` Fix: ${fixHint}` : ""}`;
  }
  const refs = cast.map((c, i) => `reference image ${i + 1} is ${c.name}`).join("; ");
  return `Create a new ${frame} cinematic frame (${shot}). In the references, ${refs}. Keep each character's face, hairstyle, skin tone, body proportions and outfit EXACTLY the same as in their reference image — same person, same clothes. Do not copy the reference background or pose. Scene: ${scene.visual} Mood: ${scene.mood || "cinematic"}. Style: ${styleGuide}. Only the listed characters appear; no extra people unless the scene describes them. ${NO_TEXT}${fixHint ? ` Fix these problems from the last attempt: ${fixHint}` : ""}`;
}

/** Ask the LLM to rewrite a prompt that tripped a safety filter. */
async function soften(prompt) {
  const r = await llmJSON({
    system: "You rewrite image/video prompts so they pass strict content filters while keeping the story beat. Strict JSON only.",
    prompt: `This prompt was blocked by a content safety filter:\n"""${prompt}"""\nRewrite it to be family-friendly and non-graphic: no blood, injuries, weapons aimed at people, nudity, or real brands. Imply danger through mood, shadows, reactions. Keep characters, setting and style. Return {"prompt":"..."}`,
    maxTokens: 1500,
    temperature: 0.3,
    mock: () => ({ prompt }),
  });
  return { prompt: String(r.json?.prompt || prompt), cost: r.cost };
}

/** Run a fal call; on a safety block, soften the prompt once and retry. */
async function withSafetyRetry(fn, prompt) {
  try {
    return { ...(await fn(prompt)), extraCost: 0 };
  } catch (e) {
    if (!(e instanceof EngineError) || e.kind !== "safety") throw e;
    const s = await soften(prompt);
    return { ...(await fn(s.prompt)), extraCost: s.cost, softened: s.prompt };
  }
}

// ─── Mock generators (offline self-test) ────────────────────────────────────
function colorFor(text) {
  let h = 0;
  for (const ch of String(text)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `0x${(h & 0xffffff).toString(16).padStart(6, "0")}`;
}
async function mockImage(seedText, out, w = 1280, h = 720, boxes = []) {
  const draw = boxes.map((c, i) => `drawbox=x=${120 + i * 300}:y=${h / 3}:w=200:h=${h / 2}:color=${colorFor(c)}:t=fill`).join(",");
  const args = ["-y", "-loglevel", "error", "-f", "lavfi", "-i", `color=c=${colorFor(seedText)}:s=${w}x${h}`, "-frames:v", "1"];
  if (draw) args.push("-vf", draw);
  args.push(out);
  await run("ffmpeg", args, { label: "mockImage" });
  return pathToFileURL(out).href;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/** Character master image. Returns { url, cost }. */
export async function generateMaster(character, styleGuide, { workDir }) {
  const prompt = masterPrompt(character, styleGuide);
  if (isMockMode()) {
    return { url: await mockImage(character.key, path.join(workDir, `master-${character.key}.png`), 768, 1024, [character.key]), cost: 0, prompt };
  }
  const r = await withSafetyRetry(
    async (p) => {
      const data = await falRun(ENGINE_MODELS.imageT2I, { prompt: p, num_images: 1, aspect_ratio: "3:4", output_format: "png" }, { label: "master" });
      const url = data?.images?.[0]?.url;
      if (!url) throw new Error("Image model returned no image");
      return { url };
    },
    prompt
  );
  return { url: r.url, cost: PRICES.imagePerImage + r.extraCost, prompt: r.softened || prompt };
}

/**
 * Scene image. Characters in the scene -> edit model with their LOCKED master
 * images as references. No characters -> text-to-image.
 * Returns { url, cost, prompt }.
 */
export async function generateSceneImage(scene, castAll, { styleGuide, aspect, workDir, fixHint = "", attempt = 0 }) {
  const cast = scene.characters
    .map((k) => castAll.find((c) => c.key === k))
    .filter((c) => c?.masterImageUrl)
    .slice(0, 3);
  const prompt = scenePrompt(scene, cast, styleGuide, aspect, fixHint);
  if (isMockMode()) {
    const [w, h] = aspect === "9:16" ? [720, 1280] : [1280, 720];
    const url = await mockImage(`scene-${scene.index}-${attempt}`, path.join(workDir, `scene-${scene.index}-a${attempt}.png`), w, h, cast.map((c) => c.key));
    return { url, cost: 0, prompt };
  }
  const r = await withSafetyRetry(
    async (p) => {
      const data = cast.length
        ? await falRun(
            ENGINE_MODELS.imageEdit,
            { prompt: p, image_urls: cast.map((c) => c.masterImageUrl), num_images: 1, aspect_ratio: ratioFor(aspect), output_format: "png" },
            { label: `scene ${scene.index} edit` }
          )
        : await falRun(
            ENGINE_MODELS.imageT2I,
            { prompt: p, num_images: 1, aspect_ratio: ratioFor(aspect), output_format: "png" },
            { label: `scene ${scene.index} t2i` }
          );
      const url = data?.images?.[0]?.url;
      if (!url) throw new Error("Image model returned no image");
      return { url };
    },
    prompt
  );
  return { url: r.url, cost: PRICES.imagePerImage + r.extraCost, prompt: r.softened || prompt };
}

/** Image-to-video clip for a MOTION scene. Returns { url, cost }. */
export async function generateMotion(scene, imageUrl, { clipSeconds, resolution, styleGuide, workDir }) {
  const prompt = `${scene.motionPrompt || scene.action || "subtle natural motion"}. Keep the characters' faces and outfits unchanged. Smooth, natural, realistic motion. ${styleGuide}`;
  if (isMockMode()) {
    const out = path.join(workDir, `clip-${scene.index}.mp4`);
    const src = new URL(imageUrl).pathname;
    await run(
      "ffmpeg",
      ["-y", "-loglevel", "error", "-loop", "1", "-i", src, "-t", String(clipSeconds), "-vf", "hue=h=t*60,fps=24,format=yuv420p", "-c:v", "libx264", "-preset", "ultrafast", out],
      { label: "mockMotion" }
    );
    return { url: pathToFileURL(out).href, cost: 0 };
  }
  const rate = PRICES.i2vPerSecond[resolution] || PRICES.i2vPerSecond["768P"];
  const r = await withSafetyRetry(
    async (p) => {
      const data = await falRun(
        ENGINE_MODELS.imageToVideo,
        { prompt: p, image_url: imageUrl, duration: String(clipSeconds), resolution, prompt_optimizer: true },
        { label: `scene ${scene.index} motion`, retries: 2 }
      );
      const url = data?.video?.url;
      if (!url) throw new Error("Video model returned no video");
      return { url };
    },
    prompt
  );
  return { url: r.url, cost: clipSeconds * rate + r.extraCost };
}

/** Lip sync a talking clip to the scene's dialogue audio. Returns { url, cost }. */
export async function generateLipsync(scene, videoUrl, audioUrl, { audioSeconds, workDir }) {
  if (isMockMode()) {
    const out = path.join(workDir, `lipsync-${scene.index}.mp4`);
    await run(
      "ffmpeg",
      ["-y", "-loglevel", "error", "-stream_loop", "-1", "-i", new URL(videoUrl).pathname, "-t", audioSeconds.toFixed(2), "-c:v", "libx264", "-preset", "ultrafast", "-an", out],
      { label: "mockLipsync" }
    );
    return { url: pathToFileURL(out).href, cost: 0 };
  }
  const data = await falRun(
    ENGINE_MODELS.lipsync,
    { video_url: videoUrl, audio_url: audioUrl, model: "lipsync-2", sync_mode: "bounce" },
    { label: `scene ${scene.index} lipsync`, retries: 2 }
  );
  const url = data?.video?.url;
  if (!url) throw new Error("Lip sync returned no video");
  return { url, cost: audioSeconds * PRICES.lipsyncPerSecond };
}
