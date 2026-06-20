// src/lib/services/ai.js
// AI video generation service — async queue-based submission via FAL.ai
//
// IMPORTANT: This uses queue.fal.run (async submit), matching the existing
// check-status/route.js which polls https://queue.fal.run/{modelId}/requests/{requestId}/status
//
// Called from route.js as:
//   AIService.generate(userId, { mode, prompt, images_list, aspect_ratio, resolution, duration, quality, generate_audio })
//
// ROUTING LOGIC:
//   generate_audio = false  -> Wan 2.2       (silent, cheap: $0.04-0.08/sec)
//   generate_audio = true   -> Veo 3.1 Fast  (native audio + lip-sync, $0.15/sec, max 8s per clip)
//
// If generate_audio = true AND duration > 8, this automatically splits the request into
// TWO separate submissions (Clip A: 8s, Clip B: remaining seconds). Both request_ids are
// returned to the frontend so they can be polled individually and added to the existing
// Stitch Queue feature for manual stitching.

const FAL_API_KEY = process.env.SEEDANCE_V2_API_KEY; // must be set in Vercel env vars

// Queue submission endpoints (async — returns a request_id, not the final video)
const QUEUE_ENDPOINTS = {
  wan: {
    "text-to-video": "https://queue.fal.run/fal-ai/wan/v2.2-a14b/text-to-video",
    "image-to-video": "https://queue.fal.run/fal-ai/wan/v2.2-a14b/image-to-video",
    "reference-to-video": "https://queue.fal.run/fal-ai/wan/v2.2-a14b/image-to-video",
  },
  veo: {
    "text-to-video": "https://queue.fal.run/fal-ai/veo3.1/fast",
    "image-to-video": "https://queue.fal.run/fal-ai/veo3.1/fast/image-to-video",
    "reference-to-video": "https://queue.fal.run/fal-ai/veo3.1/fast/image-to-video",
  },
};

// Model IDs as expected by check-status/route.js's modelId|||requestId format.
// These must be the path FAL uses for both submission and status checks.
const MODEL_IDS = {
  wan: {
    "text-to-video": "fal-ai/wan/v2.2-a14b/text-to-video",
    "image-to-video": "fal-ai/wan/v2.2-a14b/image-to-video",
    "reference-to-video": "fal-ai/wan/v2.2-a14b/image-to-video",
  },
  veo: {
    "text-to-video": "fal-ai/veo3.1/fast",
    "image-to-video": "fal-ai/veo3.1/fast/image-to-video",
    "reference-to-video": "fal-ai/veo3.1/fast/image-to-video",
  },
};

const VEO_MAX_DURATION = 8; // Veo 3.1 Fast hard limit per single generation

function resolveModelAndMode({ generate_audio, mode }) {
  const modelKey = generate_audio ? "veo" : "wan";
  const modeKey = QUEUE_ENDPOINTS[modelKey][mode] ? mode : "text-to-video";
  return { modelKey, modeKey };
}

/**
 * Submit a single clip generation job to FAL's queue. Does NOT wait for completion.
 * Returns { request_id } where request_id is encoded as "modelId|||actualRequestId"
 * to match what check-status/route.js expects.
 */
async function submitClip({ modelKey, modeKey, prompt, images_list, aspect_ratio, resolution, clipDuration }) {
  const endpoint = QUEUE_ENDPOINTS[modelKey][modeKey];
  const modelId = MODEL_IDS[modelKey][modeKey];

  let body;

  if (modelKey === "veo") {
    body = {
      prompt,
      aspect_ratio,
      duration: `${clipDuration}s`, // Veo expects a string like "8s"
      resolution: resolution === "1080p" ? "1080p" : "720p",
      generate_audio: true,
    };
    if (images_list && images_list.length > 0) {
      body.image_url = images_list[0];
    }
  } else {
    const validResolutions = ["480p", "580p", "720p"];
    const wanResolution = validResolutions.includes(resolution) ? resolution : "720p";
    body = {
      prompt,
      duration: clipDuration,
      aspect_ratio,
      resolution: wanResolution,
    };
    if (images_list && images_list.length > 0) {
      body.image_url = images_list[0];
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
    throw new Error(`FAL.ai queue submit failed (${response.status}) at ${endpoint}: ${errorText}`);
  }

  const data = await response.json();
  // queue.fal.run submission responses include a `request_id` field
  const actualRequestId = data?.request_id;

  if (!actualRequestId) {
    throw new Error(`No request_id returned from FAL.ai: ${JSON.stringify(data)}`);
  }

  return {
    request_id: `${modelId}|||${actualRequestId}`,
    model: modelKey,
    mode: modeKey,
    duration: clipDuration,
  };
}

/**
 * Core generation function, called by route.js as AIService.generate(userId, options).
 *
 * Returns:
 *   { request_id, metadata }                          — single clip (duration <= 8 or silent/Wan)
 *   { clips: [{request_id,...}, {request_id,...}] }   — auto-split into 2 clips when audio + duration > 8
 *
 * route.js should pass through whichever shape comes back; the frontend's pollStatus()
 * already handles a single request_id. For the multi-clip case, the frontend will need
 * to poll each request_id separately (see notes sent alongside this file).
 */
async function generate(userId, options = {}) {
  const {
    mode = "text-to-video",
    prompt,
    images_list,
    aspect_ratio = "16:9",
    resolution = "720p",
    duration = 5,
    generate_audio = false,
  } = options;

  if (!FAL_API_KEY) {
    throw new Error("FAL_API_KEY (SEEDANCE_V2_API_KEY) is not set in environment variables");
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

  const { modelKey, modeKey } = resolveModelAndMode({ generate_audio, mode });
  const totalDuration = Math.min(Math.max(Number(duration) || 5, 1), 15);

  // Case 1: Wan (silent) or Veo with duration <= 8 -> single submission, single request_id.
  if (modelKey === "wan" || totalDuration <= VEO_MAX_DURATION) {
    const clip = await submitClip({
      modelKey,
      modeKey,
      prompt,
      images_list,
      aspect_ratio,
      resolution,
      clipDuration: totalDuration,
    });

    return {
      request_id: clip.request_id,
      metadata: {
        model: modelKey,
        mode: modeKey,
        resolution,
        duration: totalDuration,
        generate_audio: modelKey === "veo",
      },
    };
  }

  // Case 2: Veo + duration > 8 -> auto-split into two submissions (Clip A: 8s, Clip B: remainder).
  const durationA = VEO_MAX_DURATION;
  const durationB = totalDuration - VEO_MAX_DURATION;

  const clipA = await submitClip({
    modelKey,
    modeKey,
    prompt,
    images_list,
    aspect_ratio,
    resolution,
    clipDuration: durationA,
  });

  const clipB = await submitClip({
    modelKey,
    modeKey,
    prompt,
    images_list,
    aspect_ratio,
    resolution,
    clipDuration: durationB,
  });

  return {
    clips: [
      { request_id: clipA.request_id, duration: durationA, part: "A" },
      { request_id: clipB.request_id, duration: durationB, part: "B" },
    ],
    metadata: {
      model: modelKey,
      mode: modeKey,
      resolution,
      duration: totalDuration,
      generate_audio: true,
      split: true,
      note: "Auto-split into 2 clips because Veo 3.1 caps at 8s per clip. Poll both request_ids, then use the Stitch Queue to combine them in order (A then B).",
    },
  };
}

/**
 * Estimate cost in USD before calling the API. Used for UI cost previews.
 */
function estimateCost({ generate_audio = false, resolution = "720p", duration = 5 }) {
  const totalDuration = Math.min(Math.max(Number(duration) || 5, 1), 15);

  if (generate_audio) {
    const rate = 0.15; // Veo 3.1 Fast, audio on, 720p/1080p
    return +(rate * totalDuration).toFixed(4); // cost is the same whether split into 2 calls or not — total seconds is unchanged
  }

  const rates = { "480p": 0.04, "580p": 0.06, "720p": 0.08 };
  const rate = rates[resolution] ?? rates["720p"];
  return +(rate * totalDuration).toFixed(4);
}

export const AIService = {
  generate,
  estimateCost,
};

export { generate, estimateCost };
