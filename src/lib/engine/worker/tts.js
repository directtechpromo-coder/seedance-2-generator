// src/lib/engine/worker/tts.js
// Text-to-speech with LOCKED voice profiles.
//   edge       — Microsoft Edge neural voices (free, good Urdu/Hindi). Default.
//   elevenlabs — ElevenLabs Multilingual v2 via fal (paid, premium quality).
//   mock       — offline tone, used by the self-test.
// The profile object always comes from the Character Bible / narrator — this
// module never chooses a voice on its own.

import fs from "node:fs/promises";
import { createWriteStream } from "node:fs";
import path from "node:path";
import { ENGINE_MODELS, PRICES } from "../config.js";
import { falRun } from "../fal.js";
import { download } from "./storage.js";
import { run } from "./ffmpeg.js";

async function edgeTTS(text, profile, out) {
  const { MsEdgeTTS, OUTPUT_FORMAT } = await import("msedge-tts");
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    const tts = new MsEdgeTTS();
    try {
      await tts.setMetadata(profile.voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
      const { audioStream } = tts.toStream(text, { pitch: profile.pitch || "+0Hz", rate: profile.rate || "+0%" });
      await new Promise((resolve, reject) => {
        const ws = createWriteStream(out);
        audioStream.on("error", reject);
        ws.on("error", reject);
        ws.on("finish", resolve);
        audioStream.pipe(ws);
      });
      const st = await fs.stat(out);
      if (st.size < 1000) throw new Error("Edge TTS returned empty audio");
      return { file: out, cost: 0 };
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    } finally {
      try {
        tts.close();
      } catch {}
    }
  }
  throw new Error(`Edge TTS failed for voice ${profile.voice}: ${lastErr?.message}`);
}

async function elevenTTS(text, profile, out) {
  const data = await falRun(
    ENGINE_MODELS.elevenlabs,
    {
      text,
      voice: profile.voice,
      stability: profile.stability ?? 0.6,
      similarity_boost: profile.similarityBoost ?? 0.8,
      speed: profile.speed ?? 1,
    },
    { label: "elevenlabs" }
  );
  const url = data?.audio?.url || data?.audio_url?.url || data?.url;
  if (!url) throw new Error("ElevenLabs returned no audio URL");
  await download(url, out);
  return { file: out, cost: (text.length / 1000) * PRICES.elevenlabsPer1kChars };
}

async function mockTTS(text, profile, out) {
  // Duration roughly follows text length so timing logic is exercised realistically.
  const words = text.split(/\s+/).filter(Boolean).length;
  const dur = Math.max(1, Math.min(14, words / 2.4));
  const freq = 180 + (Math.abs([...profile.voice].reduce((a, c) => a + c.charCodeAt(0), 0)) % 300);
  await run("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", `sine=frequency=${freq}:duration=${dur.toFixed(2)}`, "-ac", "1", "-ar", "24000", out], {
    label: "mockTTS",
  });
  return { file: out, cost: 0 };
}

/** Speak `text` with a locked voice profile into `out` (.mp3). Returns { file, cost }. */
export async function speak(text, profile, out) {
  await fs.mkdir(path.dirname(out), { recursive: true });
  const clean = String(text).replace(/\s+/g, " ").trim();
  if (!clean) throw new Error("speak(): empty text");
  switch (profile.provider) {
    case "mock":
      return mockTTS(clean, profile, out);
    case "elevenlabs":
      return elevenTTS(clean, profile, out);
    case "edge":
    default:
      return edgeTTS(clean, profile, out);
  }
}
