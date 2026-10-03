// src/lib/engine/validate.js
// Input validation for new Long-Video projects (shared by the API routes).

import { ASPECTS, LANGUAGES, LIMITS, PLANS } from "./config.js";

export function parseProjectInput(body = {}) {
  const errors = [];
  const prompt = String(body.prompt || "").trim();
  if (prompt.length < 10) errors.push("Describe your video in at least 10 characters.");
  if (prompt.length > 4000) errors.push("Prompt is too long (max 4000 characters).");

  const mode = body.mode === "story" ? "story" : "cinema";
  const plan = PLANS[body.plan] ? body.plan : "standard";
  const language = LANGUAGES[body.language] ? body.language : "ur";
  const aspect = ASPECTS[body.aspect] ? body.aspect : "16:9";
  const ttsProvider = body.ttsProvider === "elevenlabs" ? "elevenlabs" : "edge";
  const minutes = Math.round(Number(body.minutes ?? body.targetMinutes ?? 10));
  if (!Number.isFinite(minutes) || minutes < LIMITS.minMinutes || minutes > LIMITS.maxMinutes)
    errors.push(`Length must be ${LIMITS.minMinutes}-${LIMITS.maxMinutes} minutes.`);

  let musicUrl = null;
  if (body.musicUrl) {
    try {
      const u = new URL(String(body.musicUrl));
      if (u.protocol !== "https:") throw new Error();
      musicUrl = u.href;
    } catch {
      errors.push("Music URL must be a valid https link.");
    }
  }

  return {
    errors,
    data: {
      prompt,
      mode,
      plan,
      language,
      aspect,
      ttsProvider,
      targetMinutes: minutes,
      style: String(body.style || "").trim().slice(0, 300) || null,
      autoApprove: body.autoApprove !== false,
      burnCaptions: Boolean(body.burnCaptions),
      qaEnabled: body.qaEnabled !== false,
      musicUrl,
    },
  };
}
