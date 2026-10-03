// src/lib/engine/cost.js
// Up-front cost estimate (shown to the user + used to reserve credits) and
// credit conversion. Real spend is tracked per call in the project's cost ledger.

import { LIMITS, MARKUP, PLANS, PRICES, USD_PER_CREDIT } from "./config.js";

const round = (n) => Math.round(n * 1000) / 1000;

/**
 * @param {{mode:"story"|"cinema", planKey?:string, minutes:number, ttsProvider?:string, language?:string, qa?:boolean}} p
 */
export function estimateProject({ mode = "cinema", planKey = "standard", minutes = 10, ttsProvider = "edge", language = "ur", qa = true }) {
  const plan = PLANS[planKey] || PLANS.standard;
  const scenes = Math.ceil((minutes * 60) / LIMITS.avgSceneSeconds);
  const characters = 3;
  const retryFactor = qa ? 1.15 : 1;

  const images = (scenes + characters) * PRICES.imagePerImage * retryFactor;

  const motionSec = mode === "cinema" ? Math.max(plan.minMotionSeconds || 0, (plan.motionSecondsPer10Min * minutes) / 10) : 0;
  const motion = motionSec * (PRICES.i2vPerSecond[plan.videoResolution] || 0.045) * (qa ? 1.1 : 1);

  const lipsyncScenes = mode === "cinema" ? plan.maxLipsyncScenes : 0;
  const lipsync = lipsyncScenes * 8 * PRICES.lipsyncPerSecond;

  const chars = minutes * 60 * (LIMITS.wordsPerSecond[language] || 2.4) * 6;
  const tts = ttsProvider === "elevenlabs" ? (chars / 1000) * PRICES.elevenlabsPer1kChars : 0;

  const llmCalls = 1 + Math.round((minutes * 60) / 90) + Math.ceil(scenes / 30) + 1;
  const llm = llmCalls * PRICES.llmPerCall;
  const vision = qa ? scenes * 0.75 * 1.2 * PRICES.visionPerCall + (motionSec / 6) * PRICES.visionPerCall : 0;

  const totalUsd = images + motion + lipsync + tts + llm + vision;
  return {
    scenes,
    motionSeconds: Math.round(motionSec),
    lipsyncScenes,
    breakdown: {
      images: round(images),
      motion: round(motion),
      lipsync: round(lipsync),
      voice: round(tts),
      script: round(llm),
      qualityChecks: round(vision),
    },
    totalUsd: round(totalUsd),
    credits: usdToCredits(totalUsd),
  };
}

export function usdToCredits(usd) {
  return Math.max(1, Math.ceil((usd * MARKUP) / USD_PER_CREDIT));
}

/** Cost ledger helper: keeps a running list of what each step actually cost. */
export class CostLedger {
  constructor(entries = []) {
    this.entries = Array.isArray(entries) ? entries : [];
  }
  add(kind, usd, note = "") {
    if (!usd) return;
    this.entries.push({ kind, usd: round(usd), note, at: new Date().toISOString() });
  }
  total() {
    return round(this.entries.reduce((a, e) => a + (e.usd || 0), 0));
  }
  byKind() {
    const out = {};
    for (const e of this.entries) out[e.kind] = round((out[e.kind] || 0) + e.usd);
    return out;
  }
}
