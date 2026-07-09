// src/lib/falErrors.js
// Converts raw FAL API error responses into clear, customer-facing English
// messages, so failures are understandable instead of generic "timed out" or
// "something went wrong" text. Used by both the generation service (ai.js)
// and the status-polling route (check-status/route.js).

export function classifyFalError(rawErrorText, statusCode) {
  let parsed = null
  try {
    parsed = JSON.parse(rawErrorText)
  } catch {
    // not JSON — leave parsed as null, fall through to generic handling below
  }

  // FAL validation errors typically come as { detail: [{ loc, msg, type }] }
  const detail = Array.isArray(parsed?.detail) ? parsed.detail[0] : null

  if (detail?.type === "content_policy_violation") {
    return {
      code: "content_policy_violation",
      message:
        "This scene's content was blocked by the AI model's safety filter. This can happen with content involving weapons, drugs, violence, real brand names, or similar sensitive topics. Please rewrite this scene's description and try again.",
    }
  }

  if (statusCode === 401 || statusCode === 403) {
    return {
      code: "auth_error",
      message: "There was an authentication problem generating this video. Please try again — if this keeps happening, contact support.",
    }
  }

  if (statusCode === 429) {
    return {
      code: "rate_limited",
      message: "Too many requests right now. Please wait a moment and try again.",
    }
  }

  if (statusCode && statusCode >= 500) {
    return {
      code: "server_error",
      message: "The video generation service is temporarily having issues. Please try again in a few minutes.",
    }
  }

  if (detail?.msg) {
    return {
      code: "validation_error",
      message: `There was a problem with this scene: ${detail.msg}`,
    }
  }

  return {
    code: "unknown_error",
    message: "Something went wrong generating this scene. Please try again — if it keeps failing, try rewording the scene.",
  }
}
