// src/lib/engine/config.js
// Central config for the Long-Video Engine (Story Mode + Cinema Mode).
// Every model ID, price and plan limit lives here so it can be tuned without
// touching pipeline code. Prices are fal.ai list prices checked Oct 2026 —
// re-check https://fal.ai/pricing occasionally and update PRICES.

export const ENGINE_MODELS = {
  // LLM for script writing + scene planning (OpenRouter via fal).
  // fal-ai/any-llm is DEPRECATED — do not use it for new code.
  llmEndpoint: "openrouter/router",
  visionEndpoint: "openrouter/router/vision",
  llmModel: process.env.ENGINE_LLM_MODEL || "google/gemini-2.5-flash",
  visionModel: process.env.ENGINE_VISION_MODEL || "google/gemini-2.5-flash",

  // Images. Character master sheets + scenes WITHOUT characters use text-to-image;
  // scenes WITH characters use the edit model fed the locked master images, which
  // is what keeps faces/outfits identical across the whole video.
  imageT2I: process.env.ENGINE_IMAGE_T2I || "fal-ai/nano-banana",
  imageEdit: process.env.ENGINE_IMAGE_EDIT || "fal-ai/nano-banana/edit",

  // Image-to-video for MOTION scenes (starts from the consistent scene image).
  imageToVideo: process.env.ENGINE_I2V || "fal-ai/minimax/hailuo-02/standard/image-to-video",

  // Lip sync for close-up dialogue scenes only.
  lipsync: process.env.ENGINE_LIPSYNC || "fal-ai/sync-lipsync/v2",

  // Premium TTS option (Edge TTS is the free default, see tts.js).
  // Eleven v3: supports Urdu + Hindi and emotion audio tags. (Multilingual v2 has NO Urdu.)
  elevenlabs: process.env.ENGINE_ELEVENLABS || "fal-ai/elevenlabs/tts/eleven-v3",
};

// USD list prices. Used for estimates, the cost ledger and credit charging.
export const PRICES = {
  imagePerImage: Number(process.env.ENGINE_PRICE_IMAGE || 0.0398),
  i2vPerSecond: {
    "512P": Number(process.env.ENGINE_PRICE_I2V_512 || 0.017),
    "768P": Number(process.env.ENGINE_PRICE_I2V_768 || 0.045),
  },
  lipsyncPerSecond: Number(process.env.ENGINE_PRICE_LIPSYNC || 0.05), // $3 / minute
  elevenlabsPer1kChars: 0.1,
  edgeTtsPer1kChars: 0,
  llmPerCall: 0.004, // rough; actual cost is taken from the API usage when it is returned
  visionPerCall: 0.002,
};

// Same conversion the rest of Vidro uses (src/lib/services/ai.js): 1 credit = $0.10.
export const USD_PER_CREDIT = 0.1;
// Multiplier applied on top of raw API cost when charging credits.
// 1.0 = charge exactly the API cost (no margin). Set ENGINE_MARKUP=2 for 100% margin.
export const MARKUP = Number(process.env.ENGINE_MARKUP || 1.0);

// Quality plans for Cinema Mode. Story Mode ignores these.
// Cinema Mode animates EVERY shot that has a character or an action, so the
// characters really act. Only empty establishing shots (a place, an object)
// stay as a still image with a camera move. Plans differ in video resolution
// and how many dialogue shots get real lip sync.
export const PLANS = {
  economy: {
    label: "Economy",
    videoResolution: "512P",
    lipsyncPer10Min: 0,
    minLipsync: 0,
  },
  standard: {
    label: "Standard",
    videoResolution: "768P",
    lipsyncPer10Min: 6,
    minLipsync: 1,
  },
  premium: {
    label: "Premium",
    videoResolution: "768P",
    lipsyncPer10Min: 30,
    minLipsync: 3,
  },
};

/** How many lip-synced shots a video of `totalSec` gets on this plan. */
export function lipsyncAllowance(plan, totalSec) {
  if (!plan.lipsyncPer10Min) return 0;
  return Math.max(plan.minLipsync || 0, Math.round((plan.lipsyncPer10Min * totalSec) / 600));
}

// Safety cap: total generated clip seconds may not exceed this multiple of the
// video length (clips are 6s/10s, so they round up past the shot length).
export const MAX_MOTION_RATIO = 1.6;

export const LIMITS = {
  minMinutes: 1,
  maxMinutes: 15,
  avgSceneSeconds: 8, // target scene length the script writer aims for
  maxShotSeconds: 8, // longer scenes are split into several shots (new angle + image each)
  minSceneSeconds: 1.6, // a shot is as long as its speech; only very short lines get padded
  silentSceneSeconds: 2.5,
  i2vClipLengths: [6, 10], // Hailuo-02 accepts "6" or "10"
  motionScoreThreshold: 6, // planner scores >= this are MOTION candidates
  qaPassScore: 7, // vision judge score (0-10) needed to accept a character image
  qaMaxRetries: 2, // extra attempts per scene when QA fails
  concurrency: Number(process.env.ENGINE_CONCURRENCY || 4),
  // Tuned on live Urdu tests: 2.3 gave too-short videos, 3.0 too short once pauses were trimmed.
  wordsPerSecond: { ur: 2.6, hi: 2.6, en: 2.6 },
};

export const LANGUAGES = {
  ur: { label: "Urdu", scriptNote: "Write narration and dialogue in Urdu script (اردو), natural spoken Pakistani Urdu." },
  hi: { label: "Hindi", scriptNote: "Write narration and dialogue in Devanagari Hindi, natural spoken Hindi." },
  en: { label: "English", scriptNote: "Write narration and dialogue in natural spoken English." },
};

export const ASPECTS = {
  "16:9": { width: 1920, height: 1080 },
  "9:16": { width: 1080, height: 1920 },
};

export const STAGES = [
  "SCRIPT",
  "CHARACTERS",
  "APPROVAL",
  "VOICE",
  "PLAN",
  "IMAGES",
  "MOTION",
  "LIPSYNC",
  "ASSEMBLE",
  "DONE",
];

export function isMockMode() {
  return process.env.ENGINE_MOCK === "1";
}

export function falKey() {
  return process.env.FAL_KEY || process.env.SEEDANCE_V2_API_KEY;
}
