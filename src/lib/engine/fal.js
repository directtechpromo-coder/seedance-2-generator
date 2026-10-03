// src/lib/engine/fal.js
// Thin fal.ai wrapper for the engine: one configured client, retries with
// backoff for transient failures, and clear error tagging so the pipeline can
// react (e.g. rewrite a prompt after a safety block, or fall back to STILL).

import { fal } from "@fal-ai/client";
import { falKey } from "./config.js";

let configured = false;
function client() {
  if (!configured) {
    const key = falKey();
    if (!key) throw new EngineError("config", "FAL key missing: set FAL_KEY or SEEDANCE_V2_API_KEY.");
    fal.config({ credentials: key });
    configured = true;
  }
  return fal;
}

export class EngineError extends Error {
  /** @param {"config"|"safety"|"validation"|"rate"|"server"|"timeout"|"unknown"} kind */
  constructor(kind, message, cause) {
    super(message);
    this.kind = kind;
    this.cause = cause;
  }
}

function classify(err) {
  const status = err?.status ?? err?.response?.status;
  const body = err?.body ?? err?.response?.data;
  const text = typeof body === "string" ? body : JSON.stringify(body || {});
  const msg = `${err?.message || ""} ${text}`.toLowerCase();
  if (msg.includes("content_policy") || msg.includes("safety") || msg.includes("nsfw") || msg.includes("moderation"))
    return new EngineError("safety", "Blocked by the model's safety filter.", err);
  if (status === 422 || status === 400) return new EngineError("validation", `Invalid input: ${text.slice(0, 300)}`, err);
  if (status === 429) return new EngineError("rate", "Rate limited by fal.", err);
  if (status >= 500) return new EngineError("server", `fal server error ${status}.`, err);
  if (msg.includes("timeout") || msg.includes("timed out")) return new EngineError("timeout", "fal request timed out.", err);
  return new EngineError("unknown", err?.message || "Unknown fal error", err);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Run a fal endpoint and return result.data. Retries rate/server/timeout errors.
 * Safety and validation errors are thrown immediately (retrying won't help).
 */
export async function falRun(endpoint, input, { retries = 3, label = endpoint } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await client().subscribe(endpoint, { input, logs: false });
      return res?.data ?? res;
    } catch (err) {
      lastErr = err instanceof EngineError ? err : classify(err);
      if (lastErr.kind === "safety" || lastErr.kind === "validation" || lastErr.kind === "config") throw lastErr;
      if (attempt < retries) {
        const wait = Math.min(30000, 2000 * 2 ** attempt) + Math.floor(Math.random() * 1000);
        console.warn(`[engine] ${label} failed (${lastErr.kind}), retry ${attempt + 1}/${retries} in ${wait}ms`);
        await sleep(wait);
      }
    }
  }
  throw lastErr;
}

/** Upload a Buffer to fal storage and return a public URL. */
export async function falUpload(buffer, contentType, fileName = "file") {
  const blob = new Blob([buffer], { type: contentType });
  // File gives fal a filename (helps extension detection); fall back to Blob.
  const file = typeof File !== "undefined" ? new File([blob], fileName, { type: contentType }) : blob;
  return client().storage.upload(file);
}
