// src/lib/services/ai.js
// AI video generation service — async queue-based submission via FAL.ai
//
// CHANGES IN THIS VERSION:
//   1. seed is generated once per generate() call and passed to every clip
//      (Wan + Veo), so Part A and Part B use the same seed instead of random ones.
//   2. When a request auto-splits into 2 clips (audio + duration > 8s), Clip B is
//      NO LONGER an independent text-to-video generation. Instead:
//        - Clip A is submitted and we POLL until it completes
//        - We extract the LAST FRAME of Clip A's output video
//        - That frame is uploaded to MuAPI (same service your /api/upload route
//          already uses) and used as the starting image for Clip B, submitted
//          in image-to-video mode
//      This gives real visual continuity (same character/scene) between parts,
//      instead of two unrelated generations that merely share a text prompt.
//
// IMPORTANT — TIMEOUT: because generate() now waits for Clip A to fully finish
// before submitting Clip B, this request can take 30-90+ seconds. Make sure
// src/app/api/seedance/route.js exports:
//   export const maxDuration = 120; // or higher, depending on your Vercel plan
// otherwise Vercel will kill the function before Clip B is even submitted.

import { fal } from "@fal-ai/client"; // npm install @fal-ai/client

const FAL_API_KEY = process.env.SEEDANCE_V2_API_KEY; // must be set in Vercel env vars

// Configure the FAL SDK client once with our existing API key.
fal.config({ credentials: FAL_API_KEY });

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
const WAN_MAX_DURATION = 10; // Wan 2.2 a14b hard limit: 161 frames / 16fps ≈ 10.06s

// NEW: Reference Video Editing — user pastes a link to their own video + a prompt
// describing what to change (swap an object, change background, alter style, etc).
// Uses ByteDance's Seedance 2.0 reference-to-video endpoint, which is purpose-built
// for this and preserves the original motion/camera work while applying edits.
const REFERENCE_EDIT_ENDPOINT = "https://queue.fal.run/bytedance/seedance-2.0/reference-to-video";
const REFERENCE_EDIT_MODEL_ID = "bytedance/seedance-2.0/reference-to-video";

function resolveModelAndMode({ generate_audio, mode }) {
  const modelKey = generate_audio ? "veo" : "wan";
  const modeKey = QUEUE_ENDPOINTS[modelKey][mode] ? mode : "text-to-video";
  return { modelKey, modeKey };
}

/** Generate one seed to reuse across all clips in a single generate() call. */
function generateSeed() {
  return Math.floor(Math.random() * 2 ** 31);
}

/**
 * Submit a single clip generation job to FAL's queue. Does NOT wait for completion.
 */
async function submitClip({
  modelKey,
  modeKey,
  prompt,
  negative_prompt,
  images_list,
  aspect_ratio,
  resolution,
  clipDuration,
  seed,
}) {
  const endpoint = QUEUE_ENDPOINTS[modelKey][modeKey];
  const modelId = MODEL_IDS[modelKey][modeKey];

  let body;

  if (modelKey === "veo") {
    const VALID_VEO_DURATIONS = [4, 6, 8];
    const snappedDuration = VALID_VEO_DURATIONS.reduce((closest, val) =>
      Math.abs(val - clipDuration) < Math.abs(closest - clipDuration) ? val : closest
    );

    body = {
      prompt,
      aspect_ratio,
      duration: `${snappedDuration}s`,
      resolution: resolution === "1080p" ? "1080p" : "720p",
      generate_audio: true,
    };
    if (negative_prompt) body.negative_prompt = negative_prompt;
    if (images_list && images_list.length > 0) body.image_url = images_list[0];
    // NOTE: not all FAL model versions of Veo 3.1 Fast expose a `seed` param —
    // if FAL errors on this field, remove it here. Test once and confirm.
    if (seed !== undefined) body.seed = seed;
  } else {
    const FPS = 16;
    const numFrames = Math.min(Math.max(Math.round(clipDuration * FPS), 17), 161);

    const validResolutions = ["480p", "580p", "720p"];
    const wanResolution = validResolutions.includes(resolution) ? resolution : "720p";
    body = {
      prompt,
      num_frames: numFrames,
      frames_per_second: FPS,
      aspect_ratio,
      resolution: wanResolution,
    };
    if (negative_prompt) body.negative_prompt = negative_prompt;
    if (images_list && images_list.length > 0) body.image_url = images_list[0];
    if (seed !== undefined) body.seed = seed;
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
  const actualRequestId = data?.request_id;
  const statusUrl = data?.status_url;
  const responseUrl = data?.response_url;

  if (!actualRequestId) {
    throw new Error(`No request_id returned from FAL.ai: ${JSON.stringify(data)}`);
  }

  const encodedId = [modelId, actualRequestId, statusUrl || "", responseUrl || ""].join("|||");

  return {
    request_id: encodedId,
    status_url: statusUrl,
    response_url: responseUrl,
    model: modelKey,
    mode: modeKey,
    duration: clipDuration,
    seed,
  };
}

/**
 * Poll a submitted clip's status_url until it completes, then fetch response_url
 * for the final result (which includes the output video URL).
 */
async function pollClipUntilComplete({ status_url, response_url }, { maxWaitMs = 100000, intervalMs = 2500 } = {}) {
  if (!status_url || !response_url) {
    throw new Error("Cannot poll clip: missing status_url or response_url from submission.");
  }

  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    const statusRes = await fetch(status_url, {
      headers: { Authorization: `Key ${FAL_API_KEY}` },
    });
    if (!statusRes.ok) {
      throw new Error(`Status check failed (${statusRes.status}): ${await statusRes.text()}`);
    }
    const statusData = await statusRes.json();

    if (statusData.status === "COMPLETED") {
      const resultRes = await fetch(response_url, {
        headers: { Authorization: `Key ${FAL_API_KEY}` },
      });
      if (!resultRes.ok) {
        throw new Error(`Result fetch failed (${resultRes.status}): ${await resultRes.text()}`);
      }
      const resultData = await resultRes.json();
      const videoUrl = resultData?.video?.url || resultData?.video_url;
      if (!videoUrl) {
        throw new Error(`No video URL found in FAL result: ${JSON.stringify(resultData)}`);
      }
      return { videoUrl, raw: resultData };
    }

    if (statusData.status === "ERROR" || statusData.status === "FAILED") {
      throw new Error(`Clip generation failed: ${JSON.stringify(statusData)}`);
    }

    await new Promise((r) => setTimeout(r, intervalMs));
  }

  throw new Error("Timed out waiting for Clip A to complete before submitting Clip B.");
}

/**
 * Extracts the last frame of a video using FAL.ai's own hosted ffmpeg endpoint
 * (fal-ai/ffmpeg-api/extract-frame) and returns a public image URL for it.
 * No local ffmpeg binary needed — this runs entirely on FAL's servers, which
 * avoids the "ffmpeg binary not found" issue that happens with ffmpeg-static
 * on Vercel's serverless functions.
 */
async function getLastFrameUrl(videoUrl) {
  const result = await fal.subscribe("fal-ai/ffmpeg-api/extract-frame", {
    input: {
      video_url: videoUrl,
      frame_type: "last",
    },
  });

  const frameUrl = result?.data?.images?.[0]?.url;
  if (!frameUrl) {
    throw new Error(`No frame URL returned from fal-ai/ffmpeg-api/extract-frame: ${JSON.stringify(result)}`);
  }
  return frameUrl;
}

/**
 * Core generation function, called by route.js as AIService.generate(userId, options).
 */
async function generate(userId, options = {}) {
  const {
    mode = "text-to-video",
    prompt,
    negative_prompt,
    images_list,
    aspect_ratio = "16:9",
    resolution = "720p",
    duration = 5,
    generate_audio = false,
    seed: incomingSeed, // NEW: caller can pass a seed to reuse across scenes
    previous_video_url, // NEW: if provided, this call's clip continues visually from this video's last frame
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
  const maxPerClip = modelKey === "veo" ? VEO_MAX_DURATION : WAN_MAX_DURATION;
  const seed = incomingSeed !== undefined ? incomingSeed : generateSeed(); // reuse if passed in, else generate fresh

  // Case 1: fits in a single clip -> single submission.
  // NEW: if previous_video_url is provided (multi-scene chaining), we extract that
  // video's last frame, upload it, and submit THIS scene as image-to-video starting
  // from that frame — so consecutive scenes stay visually continuous, not just
  // "same seed" but literally continuing from where the last scene ended.
  if (totalDuration <= maxPerClip) {
    let finalImagesList = images_list;
    let finalModeKey = modeKey;

    if (previous_video_url) {
      finalImagesList = [await getLastFrameUrl(previous_video_url)];
      finalModeKey = QUEUE_ENDPOINTS[modelKey]["image-to-video"] ? "image-to-video" : modeKey;
    }

    const clip = await submitClip({
      modelKey,
      modeKey: finalModeKey,
      prompt,
      negative_prompt,
      images_list: finalImagesList,
      aspect_ratio,
      resolution,
      clipDuration: totalDuration,
      seed,
    });

    return {
      request_id: clip.request_id,
      metadata: {
        model: modelKey,
        mode: finalModeKey,
        resolution,
        duration: totalDuration,
        generate_audio: modelKey === "veo",
        seed, // NEW: frontend should capture this and pass it back in for the next scene
        chainedFrom: previous_video_url ? true : false,
      },
    };
  }

  // Case 2: exceeds per-clip cap -> Clip A (text-to-video), wait for it, extract
  // last frame, upload it, then Clip B (image-to-video) chained from that frame.
  let durationA = maxPerClip;
  let durationB = totalDuration - maxPerClip;

  if (modelKey === "veo") {
    const VALID_VEO_DURATIONS = [4, 6, 8];
    durationB = VALID_VEO_DURATIONS.reduce((closest, val) =>
      Math.abs(val - durationB) < Math.abs(closest - durationB) ? val : closest
    );
  }

  // --- Clip A: normal text-to-video (or image-to-video if the user supplied a starting image) ---
  const clipASubmission = await submitClip({
    modelKey,
    modeKey,
    prompt,
    negative_prompt,
    images_list,
    aspect_ratio,
    resolution,
    clipDuration: durationA,
    seed,
  });

  // --- Wait for Clip A to finish so we can grab its last frame ---
  const clipAResult = await pollClipUntilComplete({
    status_url: clipASubmission.status_url,
    response_url: clipASubmission.response_url,
  });

  const lastFrameUrl = await getLastFrameUrl(clipAResult.videoUrl);

  // --- Clip B: image-to-video, starting from Clip A's last frame, same seed ---
  const clipBModeKey = QUEUE_ENDPOINTS[modelKey]["image-to-video"] ? "image-to-video" : modeKey;

  const clipBSubmission = await submitClip({
    modelKey,
    modeKey: clipBModeKey,
    prompt,
    negative_prompt,
    images_list: [lastFrameUrl],
    aspect_ratio,
    resolution,
    clipDuration: durationB,
    seed,
  });

  return {
    clips: [
      { request_id: clipASubmission.request_id, duration: durationA, part: "A" },
      { request_id: clipBSubmission.request_id, duration: durationB, part: "B" },
    ],
    metadata: {
      model: modelKey,
      mode: modeKey,
      resolution,
      duration: totalDuration,
      generate_audio: true,
      split: true,
      seed,
      chained: true,
      note: `Auto-split into 2 clips because ${modelKey === "veo" ? "Veo 3.1 caps at 8s" : "Wan 2.2 caps at ~10s"} per clip. Clip B was generated from Clip A's last frame (image-to-video) with the same seed for visual continuity. Poll both request_ids, then use the Stitch Queue to combine them in order (A then B).`,
    },
  };
}

/**
 * Reference Generation — the general-purpose FAL Seedance 2.0 reference-to-video
 * endpoint. Accepts EITHER a reference video_url (Reference Video Editing feature)
 * OR reference image_urls (Product/Character Reference feature for Multi-Scene ads),
 * or both. Reference this endpoint's inputs in the prompt using @Image1, @Video1, etc.
 */
async function generateReferenceEdit(userId, options = {}) {
  const {
    prompt,
    video_url,
    image_urls,
    resolution = "720p",
    aspect_ratio = "auto",
    duration = "auto",
    generate_audio = false,
  } = options;

  if (!FAL_API_KEY) {
    throw new Error("FAL_API_KEY (SEEDANCE_V2_API_KEY) is not set in environment variables");
  }
  if (!prompt || !prompt.trim()) {
    throw new Error("Prompt is required — describe the scene, referencing @Image1/@Video1 as needed.");
  }
  const hasVideo = !!video_url;
  const hasImages = Array.isArray(image_urls) && image_urls.length > 0;
  if (!hasVideo && !hasImages) {
    throw new Error("At least one reference video or image is required.");
  }

  const body = {
    prompt,
    resolution,
    aspect_ratio,
    duration,
  };
  if (hasVideo) body.video_urls = [video_url];
  if (hasImages) body.image_urls = image_urls;
  if (generate_audio) body.generate_audio = true;

  const response = await fetch(REFERENCE_EDIT_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Key ${FAL_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`FAL reference-to-video submit failed (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const actualRequestId = data?.request_id;
  const statusUrl = data?.status_url;
  const responseUrl = data?.response_url;

  if (!actualRequestId) {
    throw new Error(`No request_id returned from FAL.ai: ${JSON.stringify(data)}`);
  }

  const encodedId = [REFERENCE_EDIT_MODEL_ID, actualRequestId, statusUrl || "", responseUrl || ""].join("|||");

  return {
    request_id: encodedId,
    metadata: {
      model: "seedance-2.0-reference-edit",
      mode: "reference-edit",
      resolution,
      duration,
      aspect_ratio,
    },
  };
}

/**
 * Estimate cost in USD before calling the API. Used for UI cost previews.
 */
function estimateCost({ generate_audio = false, resolution = "720p", duration = 5 }) {
  const totalDuration = Math.min(Math.max(Number(duration) || 5, 1), 15);

  if (generate_audio) {
    const rate = 0.15;
    return +(rate * totalDuration).toFixed(4);
  }

  const rates = { "480p": 0.04, "580p": 0.06, "720p": 0.08 };
  const rate = rates[resolution] ?? rates["720p"];
  return +(rate * totalDuration).toFixed(4);
}

export const AIService = {
  generate,
  generateReferenceEdit,
  estimateCost,
};

export { generate, generateReferenceEdit, estimateCost };
