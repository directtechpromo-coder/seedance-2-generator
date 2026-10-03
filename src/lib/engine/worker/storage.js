// src/lib/engine/worker/storage.js
// Moves files between the worker's disk and durable storage (fal storage).
// Every generated asset is uploaded right away and its URL saved on the scene,
// so a restarted worker can resume from where it stopped.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isMockMode } from "../config.js";
import { falUpload } from "../fal.js";

const MIME = {
  ".mp4": "video/mp4",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".wav": "audio/wav",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".srt": "application/x-subrip",
};

export async function download(url, dest) {
  await fs.mkdir(path.dirname(dest), { recursive: true });
  if (url.startsWith("file://")) {
    await fs.copyFile(fileURLToPath(url), dest);
    return dest;
  }
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Download failed ${res.status} for ${url}`);
      await fs.writeFile(dest, Buffer.from(await res.arrayBuffer()));
      return dest;
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
  throw lastErr;
}

export async function upload(file) {
  const ext = path.extname(file).toLowerCase();
  if (isMockMode()) {
    const store = process.env.ENGINE_MOCK_STORE || path.join(process.cwd(), ".engine-mock-store");
    await fs.mkdir(store, { recursive: true });
    const dest = path.join(store, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
    await fs.copyFile(file, dest);
    return pathToFileURL(dest).href;
  }
  const buf = await fs.readFile(file);
  return falUpload(buf, MIME[ext] || "application/octet-stream", path.basename(file));
}

export function extFromUrl(url, fallback) {
  try {
    const p = new URL(url).pathname;
    const e = path.extname(p).toLowerCase();
    return MIME[e] ? e : fallback;
  } catch {
    return fallback;
  }
}
