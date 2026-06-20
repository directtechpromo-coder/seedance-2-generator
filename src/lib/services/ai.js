// src/lib/services/ai.js
// AI video generation service — supports Seedance 2.0 and Wan 2.2 via FAL.ai
//
// Called from route.js as:
//   AIService.generate(userId, { mode, prompt, images_list, aspect_ratio, resolution, duration, quality, model })
//
// `model` controls which backend is used: "seedance" (default, original behavior) or "wan" (Wan 2.2, cheaper).
// `mode` controls which type of generation: "text-to-video", "image-to-video", or "reference-to-video".

const FAL_API_KEY = process.env.SEEDANCE_V2_API_KEY; // must be set in Vercel env vars

// Endpoint map: [model][mode] -> FAL endpoint URL
const ENDPOINTS = {
  seedance: {
    "text-to-video": {
      fast: "https://fal.run/bytedance/seedance-2.0/fast/text-to-video",
      standard: "https://fal.run/bytedance/seedance-2.0/text-to-video",
    },
    "image-to-video": {
      fast: "https://fal.run/bytedance/seedance-2.0/fast/image-to-video",
      standard: "https://fal.run/bytedance/seedance-2.0/image-to-video",
    },
    "reference-to-video": {
      fast: "https://fal.run/bytedance/seedance-2.0/fast/reference-to-video",
      standard: "https://fal.run/bytedance/seedance-2.0/reference-to-video",
    },
  },
  wan: {
    // Wan 2.2 — text-to-video confirmed available. image/reference-to-video endpoints
    // may differ; using best-known fal-ai/wan paths. If these 404, tell me and I'll correct them.
    "text-to-video": {
      standard: "https://fal.run/fal-ai/wan/v2.2-a14b/text-to-video",
    },
    "image-to-video": {
      standard: "https://fal.run/fal-ai/wan/v2.2-a14b/image-to-video",
    },
    "reference-to-video": {
      standard: "https://fal.run/fal-ai/wan/v2.2-a14b/image-to-video", // wan a14b doesn't have a dedicated reference endpoint; falls back to image-to-video
    },
  },
};

function pickEndpoint({ model, mode, quality }) {
  const modelKey = model === "wan" ? "wan" : "seedance"; // default to seedance if unspecified
  const modeKey = ENDPOINTS[modelKey][mode] ? mode : "text-to-video"; // fallback safety
  const tierKey = modelKey === "wan" ? "standard" : (quality === "standard" ? "standard" : "fast");
  const endpoint = ENDPOINTS[modelKey][modeKey][tierKey];
  return { endpoint, modelKey, modeKey, tierKey };
}

/**
 * Core generation function. Matches the call signature used in route.js:
 *   AIService.generate(userId, options)
 *
 * @param {string} userId - currently unused (no per-user billing/db lookup), kept for compatibility
 * @param {Object} options
 * @param {string} options.mode - "text-to-video" | "image-to-video" | "reference-to-video"
 * @param {string} options.prompt
 * @param {string[]} [options.images_list] - required for image-to-video / reference-to-video
 * @param {string} [options.aspect_ratio="16:9"]
 * @param {string} [options.resolution="720p"]
 * @param {number} [options.duration=5]
 * @param {string} [options.quality="fast"] - "fast" or "standard" (Seedance only; ignored for Wan)
 * @param {string} [options.model="seedance"] - "seedance" or "wan"
 * @param {boolean} [options.generate_audio=true]
 */
async function generate(userId, options = {}) {
  const {
    mode = "text-to-video",
    prompt,
    images_list,
    aspect_ratio = "16:9",
    resolution = "720p",
    duration = 5,
    quality = "fast",
    generate_audio = true,
  } = options;

  // Hardcoded: always use Wan 2.2 regardless of what the frontend/route sends.
  // To switch back to Seedance later, change this line to: const model = "seedance";
  const model = "wan";

  if (!FAL_API_KEY) {
    throw new Error("FAL_API_KEY is not set in environment variables");
  }

  if (mode === "text-to-video" && (!prompt || prompt.trim().length === 0)) {
    throw new Error("Prompt is required for text-to-video");
  }

  if (
    (mode === "image-to-video" || mode === "reference-to-video") &&
    (!images_list || images_list.length === 0)
  ) {
    throw new Error(`images_list is required for ${mode}`);
  }

  const { endpoint, modelKey, tierKey } = pickEndpoint({ model, mode, quality });

  const clipDuration = Math.min(Math.max(Number(duration) || 5, 1), 15);

  // Build request body per model
  let body;

  if (modelKey === "seedance") {
    body = {
      prompt,
      duration: clipDuration,
      aspect_ratio,
      generate_audio, // Seedance bills the same whether true or false
      resolution: resolution === "1080p" ? "1080p" : "720p",
    };
    if (images_list && images_list.length > 0) {
      body.image_urls = images_list;
    }
  } else {
    // wan
    const validResolutions = ["480p", "580p", "720p"];
    const wanResolution = validResolutions.includes(resolution) ? resolution : "720p";

    body = {
      prompt,
      duration: clipDuration,
      aspect_ratio,
      resolution: wanResolution,
      generate_audio,
    };
    if (images_list && images_list.length > 0) {
      body.image_url = images_list[0]; // wan image-to-video typically takes a single image_url
    }
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Key ${FAL_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`FAL.ai request failed (${response.status}) at ${endpoint}: ${errorText}`);
  }

  const data = await response.json();

  const video_url = data?.video?.url || data?.video_url || data?.url || null;

  if (!video_url) {
    throw new Error(`No video URL found in FAL.ai response: ${JSON.stringify(data)}`);
  }

  return {
    video_url,
    model: modelKey,
    tier: tierKey,
    mode,
    resolution,
    duration: clipDuration,
    generate_audio,
    raw: data,
  };
}

/**
 * Estimate cost in USD before calling the API. Used for UI cost previews.
 */
function estimateCost({ model = "wan", tier = "fast", resolution = "720p", duration = 5 }) {
  const clipDuration = Math.min(Math.max(Number(duration) || 5, 1), 15);

  if (model === "seedance") {
    const ratePerSecond = tier === "standard" ? 0.3034 : 0.2419;
    return +(ratePerSecond * clipDuration).toFixed(4);
  }

  if (model === "wan") {
    const rates = { "480p": 0.04, "580p": 0.06, "720p": 0.08 };
    const rate = rates[resolution] ?? rates["720p"];
    return +(rate * clipDuration).toFixed(4);
  }

  return null;
}

export const AIService = {
  generate,
  estimateCost,
};

// Also export individually in case other files import these by name
export { generate, estimateCost };
