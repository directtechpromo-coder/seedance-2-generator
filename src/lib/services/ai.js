// src/lib/services/ai.js
// AI video generation service — supports Seedance 2.0 and Wan 2.2 via FAL.ai
// Switch models by passing `model: "seedance"` or `model: "wan"` in the request body

const FAL_API_KEY = process.env.FAL_API_KEY; // make sure this is set in Vercel env vars

// Model endpoint configuration
const MODEL_ENDPOINTS = {
  seedance: {
    fast: "https://fal.run/bytedance/seedance-2.0/fast/text-to-video",
    standard: "https://fal.run/bytedance/seedance-2.0/text-to-video",
  },
  wan: {
    // Wan 2.2 — single endpoint, resolution controlled via the `resolution` param
    standard: "https://fal.run/fal-ai/wan/v2.2-a14b/text-to-video",
  },
};

/**
 * Generate a video using either Seedance 2.0 or Wan 2.2.
 *
 * @param {Object} params
 * @param {string} params.prompt - Text prompt describing the video
 * @param {string} [params.model="wan"] - "seedance" or "wan"
 * @param {string} [params.tier="fast"] - For Seedance: "fast" or "standard". Ignored for Wan.
 * @param {string} [params.resolution="720p"] - "480p", "580p", or "720p" (Wan); "720p" or "1080p" (Seedance)
 * @param {number} [params.duration=5] - Clip duration in seconds (max 15 for both models)
 * @param {boolean} [params.generate_audio=true] - Whether to generate native audio
 * @param {string} [params.aspect_ratio="16:9"] - Aspect ratio
 * @returns {Promise<{video_url: string, raw: object}>}
 */
export async function generateVideo({
  prompt,
  model = "wan",
  tier = "fast",
  resolution = "720p",
  duration = 5,
  generate_audio = true,
  aspect_ratio = "16:9",
}) {
  if (!FAL_API_KEY) {
    throw new Error("FAL_API_KEY is not set in environment variables");
  }

  if (!prompt || prompt.trim().length === 0) {
    throw new Error("Prompt is required");
  }

  // Clamp duration to safe bounds (both models support up to 15s per clip)
  const clipDuration = Math.min(Math.max(duration, 1), 15);

  let endpoint;
  let body;

  if (model === "seedance") {
    endpoint =
      tier === "standard"
        ? MODEL_ENDPOINTS.seedance.standard
        : MODEL_ENDPOINTS.seedance.fast;

    body = {
      prompt,
      duration: clipDuration,
      aspect_ratio,
      generate_audio, // Seedance bills the same whether this is true or false
      resolution: resolution === "1080p" ? "1080p" : "720p",
    };
  } else if (model === "wan") {
    endpoint = MODEL_ENDPOINTS.wan.standard;

    // Wan 2.2 price scales with resolution: 480p / 580p / 720p
    const validResolutions = ["480p", "580p", "720p"];
    const wanResolution = validResolutions.includes(resolution)
      ? resolution
      : "720p";

    body = {
      prompt,
      duration: clipDuration,
      aspect_ratio,
      resolution: wanResolution,
      generate_audio, // if the Wan endpoint doesn't support this, it will be ignored safely
    };
  } else {
    throw new Error(`Unknown model: ${model}. Use "seedance" or "wan".`);
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
    throw new Error(
      `FAL.ai request failed (${response.status}): ${errorText}`
    );
  }

  const data = await response.json();

  // Both Seedance and Wan synchronous fal.run responses return a `video` object
  // with a `url` field. Fall back gracefully if the shape differs.
  const video_url =
    data?.video?.url || data?.video_url || data?.url || null;

  if (!video_url) {
    throw new Error(
      `No video URL found in FAL.ai response: ${JSON.stringify(data)}`
    );
  }

  return {
    video_url,
    model,
    tier: model === "seedance" ? tier : "standard",
    resolution,
    duration: clipDuration,
    generate_audio,
    raw: data,
  };
}

/**
 * Estimate cost in USD for a given generation request BEFORE calling the API.
 * Useful for showing the user a cost preview in the UI.
 */
export function estimateCost({
  model = "wan",
  tier = "fast",
  resolution = "720p",
  duration = 5,
}) {
  const clipDuration = Math.min(Math.max(duration, 1), 15);

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
