// src/lib/engine/llm.js
// LLM + vision calls (OpenRouter through fal) that must return JSON.
// Robust to markdown fences and leading/trailing chatter, and retries once
// with a "fix your JSON" nudge when the model returns something unparseable.

import { ENGINE_MODELS, PRICES, isMockMode } from "./config.js";
import { falRun } from "./fal.js";

/** Pull the first complete JSON object/array out of arbitrary model text. */
export function extractJSON(text) {
  if (text == null) throw new Error("Empty LLM output");
  const cleaned = String(text).replace(/```(?:json)?/gi, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    // fall through to bracket scanning
  }
  const starts = [cleaned.indexOf("{"), cleaned.indexOf("[")].filter((i) => i >= 0);
  if (!starts.length) throw new Error("No JSON found in LLM output");
  const start = Math.min(...starts);
  const open = cleaned[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return JSON.parse(cleaned.slice(start, i + 1));
    }
  }
  throw new Error("Unterminated JSON in LLM output");
}

function usageCost(data, fallback) {
  const c = data?.usage?.cost ?? data?.usage?.total_cost;
  return typeof c === "number" && Number.isFinite(c) ? c : fallback;
}

/**
 * Ask the LLM for JSON. Returns { json, cost }.
 * @param {{system?:string, prompt:string, maxTokens?:number, temperature?:number, mock?:Function}} args
 */
export async function llmJSON({ system, prompt, maxTokens = 8000, temperature = 0.7, mock }) {
  if (isMockMode()) {
    if (!mock) throw new Error("llmJSON called in mock mode without a mock handler");
    return { json: await mock(), cost: 0 };
  }
  let cost = 0;
  let lastErr;
  let currentPrompt = prompt;
  for (let attempt = 0; attempt < 2; attempt++) {
    const data = await falRun(
      ENGINE_MODELS.llmEndpoint,
      {
        model: ENGINE_MODELS.llmModel,
        system_prompt: system,
        prompt: currentPrompt,
        temperature,
        max_tokens: maxTokens,
      },
      { label: "llm" }
    );
    cost += usageCost(data, PRICES.llmPerCall);
    if (data?.error) lastErr = new Error(String(data.error));
    try {
      return { json: extractJSON(data?.output), cost };
    } catch (e) {
      lastErr = e;
      currentPrompt = `${prompt}\n\nIMPORTANT: Your previous answer was not valid JSON. Reply with ONLY the JSON, nothing else.`;
    }
  }
  throw new Error(`LLM did not return valid JSON: ${lastErr?.message}`);
}

/**
 * Ask a vision model about one or more images. Returns { json, cost }.
 */
export async function visionJSON({ system, prompt, imageUrls, maxTokens = 800, mock }) {
  if (isMockMode()) {
    if (!mock) throw new Error("visionJSON called in mock mode without a mock handler");
    return { json: await mock(), cost: 0 };
  }
  const data = await falRun(
    ENGINE_MODELS.visionEndpoint,
    {
      model: ENGINE_MODELS.visionModel,
      system_prompt: system,
      prompt,
      image_urls: imageUrls,
      temperature: 0.1,
      max_tokens: maxTokens,
    },
    { label: "vision" }
  );
  const cost = usageCost(data, PRICES.visionPerCall);
  return { json: extractJSON(data?.output), cost };
}
