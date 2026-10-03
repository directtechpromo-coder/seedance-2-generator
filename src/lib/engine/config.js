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
  elevenlabs: "fal-ai/elevenlabs/tts/multilingual-v2",
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

// Quality plans for Cinema Mode. Story Mode ignores motion/lipsync budgets.
export const PLANS = {
  economy: {
    label: "Economy",
    motionSecondsPer10Min: 60,
    maxLipsyncScenes: 0,
    videoResolution: "512P",
  },
  standard: {
    label: "Standard",
    motionSecondsPer10Min: 150,
    maxLipsyncScenes: 3,
    videoResolution: "768P",
  },
  premium: {
    label: "Premium",
    motionSecondsPer10Min: 300,
    maxLipsyncScenes: 8,
    videoResolution: "768P",
  },
};

export const LIMITS = {
  minMinutes: 1,
  maxMinutes: 15,
  avgSceneSeconds: 9, // target scene length the script writer aims for
  minSceneSeconds: 3,
  silentSceneSeconds: 3,
  i2vClipLengths: [6, 10], // Hailuo-02 accepts "6" or "10"
  motionScoreThreshold: 6, // planner scores >= this are MOTION candidates
  qaPassScore: 7, // vision judge score (0-10) needed to accept a character image
  qaMaxRetries: 2, // extra attempts per scene when QA fails
  concurrency: Number(process.env.ENGINE_CONCURRENCY || 4),
  wordsPerSecond: { ur: 2.3, hi: 2.3, en: 2.6 },
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
