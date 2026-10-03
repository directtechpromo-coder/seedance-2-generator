// src/lib/engine/worker/ffmpeg.js
// All video/audio assembly. Runs ONLY in the worker (needs the ffmpeg binary,
// which Vercel functions don't have). Every segment is encoded with identical
// settings so the final concat is a fast stream copy.

import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";
const FFPROBE = process.env.FFPROBE_PATH || "ffprobe";
export const FPS = Number(process.env.ENGINE_FPS || 30);

const VIDEO_ENC = ["-c:v", "libx264", "-preset", process.env.ENGINE_X264_PRESET || "veryfast", "-crf", "21", "-pix_fmt", "yuv420p", "-r", String(FPS)];
const AUDIO_ENC = ["-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2"];
// Scene voice tracks are stored as MP3: every external API (lip sync etc.) accepts it.
const audioEncFor = (out) => (out.endsWith(".mp3") ? ["-c:a", "libmp3lame", "-b:a", "192k", "-ar", "48000", "-ac", "2"] : AUDIO_ENC);

export function run(bin, args, { label = "ffmpeg" } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => {
      err += d;
      if (err.length > 20000) err = err.slice(-10000);
    });
    p.on("error", reject);
    p.on("close", (code) =>
      code === 0 ? resolve(out) : reject(new Error(`${label} exited ${code}: ${err.slice(-1500)}`))
    );
  });
}

const ff = (args, label) => run(FFMPEG, ["-y", "-hide_banner", "-loglevel", "error", ...args], { label });

export async function probeDuration(file) {
  const out = await run(FFPROBE, ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file], {
    label: "ffprobe",
  });
  const d = parseFloat(out.trim());
  if (!Number.isFinite(d)) throw new Error(`Could not read duration of ${file}`);
  return d;
}

const f3 = (n) => Number(n).toFixed(3);

/** zoompan expressions for a camera move over N frames. */
function kenBurns(camera, frames, w, h) {
  const N = Math.max(1, frames - 1);
  const center = `x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`;
  let expr;
  switch (camera) {
    case "zoom_out":
      expr = `z='1.15-0.15*on/${N}':${center}`;
      break;
    case "pan_left":
      expr = `z='1.12':x='(iw-iw/zoom)*(1-on/${N})':y='ih/2-(ih/zoom/2)'`;
      break;
    case "pan_right":
      expr = `z='1.12':x='(iw-iw/zoom)*on/${N}':y='ih/2-(ih/zoom/2)'`;
      break;
    case "none":
      expr = `z='1.0':${center}`;
      break;
    case "zoom_in":
    default:
      expr = `z='1+0.15*on/${N}':${center}`;
  }
  // Render at 2x then zoompan down: removes the classic zoompan jitter.
  return `scale=${w * 2}:${h * 2}:force_original_aspect_ratio=increase,crop=${w * 2}:${h * 2},zoompan=${expr}:d=${frames}:s=${w}x${h}:fps=${FPS},setsar=1`;
}

/** Fill-frame scaling for clips whose aspect differs slightly from the output. */
const fill = (w, h) => `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},setsar=1,fps=${FPS}`;

const audioFit = (dur) => `aresample=48000,apad,atrim=0:${f3(dur)},asetpts=N/SR/TB`;

/** STILL scene: image + camera move + scene audio. */
export async function renderStill({ image, audio, duration, camera, w, h, out }) {
  const frames = Math.max(2, Math.round(duration * FPS));
  await ff(
    [
      "-i", image,
      "-i", audio,
      "-filter_complex", `[0:v]${kenBurns(camera, frames, w, h)},trim=end_frame=${frames}[v];[1:a]${audioFit(duration)}[a]`,
      "-map", "[v]", "-map", "[a]",
      ...VIDEO_ENC, ...AUDIO_ENC,
      "-frames:v", String(frames), "-t", f3(duration),
      out,
    ],
    "renderStill"
  );
}

/**
 * MOTION scene: the generated clip, and if the narration is longer than the
 * clip, a slow camera move on the clip's last frame covers the rest.
 */
export async function renderMotion({ clip, lastFrame, audio, duration, clipSeconds, w, h, out }) {
  const clipDur = Math.min(clipSeconds, duration);
  const tail = duration - clipDur;
  const frames = Math.max(2, Math.round(duration * FPS));
  if (tail < 0.2) {
    await ff(
      [
        "-i", clip,
        "-i", audio,
        "-filter_complex", `[0:v]${fill(w, h)},trim=0:${f3(duration)},setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration=2[v];[1:a]${audioFit(duration)}[a]`,
        "-map", "[v]", "-map", "[a]",
        ...VIDEO_ENC, ...AUDIO_ENC,
        "-frames:v", String(frames), "-t", f3(duration),
        out,
      ],
      "renderMotion"
    );
    return;
  }
  const tailFrames = Math.max(2, Math.round(tail * FPS));
  await ff(
    [
      "-i", clip,
      "-i", lastFrame,
      "-i", audio,
      "-filter_complex",
      `[0:v]${fill(w, h)},trim=0:${f3(clipDur)},setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration=1,trim=0:${f3(clipDur)}[c];` +
        `[1:v]${kenBurns("zoom_in", tailFrames, w, h)},trim=end_frame=${tailFrames},setpts=PTS-STARTPTS[t];` +
        `[c][t]concat=n=2:v=1:a=0[v];[2:a]${audioFit(duration)}[a]`,
      "-map", "[v]", "-map", "[a]",
      ...VIDEO_ENC, ...AUDIO_ENC,
      "-frames:v", String(frames), "-t", f3(duration),
      out,
    ],
    "renderMotionTail"
  );
}

/** LIPSYNC scene: lip-synced video (its own audio is replaced by our master scene audio). */
export async function renderLipsync({ video, audio, duration, w, h, out }) {
  const frames = Math.max(2, Math.round(duration * FPS));
  await ff(
    [
      "-i", video,
      "-i", audio,
      "-filter_complex", `[0:v]${fill(w, h)},setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration=${f3(duration)}[v];[1:a]${audioFit(duration)}[a]`,
      "-map", "[v]", "-map", "[a]",
      ...VIDEO_ENC, ...AUDIO_ENC,
      "-frames:v", String(frames), "-t", f3(duration),
      out,
    ],
    "renderLipsync"
  );
}

export async function extractLastFrame(video, out) {
  // -sseof seeks from the end; grab the final decodable frame.
  await ff(["-sseof", "-0.25", "-i", video, "-update", "1", "-frames:v", "1", "-q:v", "2", out], "lastFrame");
  return out;
}

export async function extractFrameAt(video, seconds, out) {
  await ff(["-ss", f3(seconds), "-i", video, "-frames:v", "1", "-q:v", "2", out], "frameAt");
  return out;
}

/** Silence of a given length (for silent / SFX-only scenes). */
export async function makeSilence(duration, out) {
  await ff(["-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-t", f3(duration), ...audioEncFor(out), out], "silence");
  return out;
}

/** Join several speech clips into one scene track with short pauses, loudness-normalised. */
// Strip leading/trailing silence that TTS engines add (Edge adds ~0.7s at the end),
// so scenes don't have dead air before the cut.
// Also shortens every pause INSIDE a clip (Edge pauses ~1s after each sentence) to 0.3s.
const TRIM_SILENCE =
  "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05," +
  "areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.08,areverse," +
  "silenceremove=stop_periods=-1:stop_duration=0.05:stop_threshold=-45dB:stop_silence=0.25:detection=peak";

// No per-scene loudness normalisation here: it flattened the emotion (an excited line and a
// whisper ended up equally loud). Loudness is set once for the whole video in finalize().
export async function joinSpeech(parts, out, { gapMs = 220, leadMs = 60, tailMs = 150 } = {}) {
  if (!parts.length) throw new Error("joinSpeech: no parts");
  const inputs = parts.flatMap((p) => ["-i", p]);
  const gap = gapMs / 1000;
  const chains = parts
    .map((_, i) => `[${i}:a]aresample=48000,aformat=channel_layouts=stereo,${TRIM_SILENCE},apad=pad_dur=${i === parts.length - 1 ? 0 : gap}[p${i}]`)
    .join(";");
  const labels = parts.map((_, i) => `[p${i}]`).join("");
  await ff(
    [
      ...inputs,
      "-filter_complex",
      `${chains};${labels}concat=n=${parts.length}:v=0:a=1,adelay=${leadMs}|${leadMs},apad=pad_dur=${tailMs / 1000},aresample=48000[a]`,
      "-map", "[a]", ...audioEncFor(out), out,
    ],
    "joinSpeech"
  );
  return out;
}

/** Concatenate identical-format segments (stream copy). */
export async function concatSegments(files, out, workDir) {
  const list = path.join(workDir, "concat.txt");
  await fs.writeFile(list, files.map((f) => `file '${path.resolve(f).replace(/'/g, "'\\''")}'`).join("\n"));
  await ff(["-f", "concat", "-safe", "0", "-i", list, "-c", "copy", "-movflags", "+faststart", out], "concat");
  return out;
}

/**
 * Final pass: optional background music (auto-ducked under speech) and
 * optional burned-in captions. Without either, just copies.
 */
async function measurePeak(file) {
  return new Promise((resolve) => {
    const p = spawn(FFMPEG, ["-hide_banner", "-i", file, "-vn", "-af", "volumedetect", "-f", "null", "-"]);
    let err = "";
    p.stderr.on("data", (d) => (err += d));
    p.on("close", () => {
      const m = err.match(/max_volume:\s*(-?[\d.]+) dB/);
      resolve(m ? parseFloat(m[1]) : null);
    });
    p.on("error", () => resolve(null));
  });
}

/**
 * Final pass:
 *   - one linear gain for the whole voice track so the loudest moment peaks at -1.5 dB
 *     (keeps the difference between whispers and shouts — emotion survives)
 *   - optional background music, auto-ducked under speech
 *   - optional burned-in captions
 */
export async function finalize({ input, out, musicFile, srtFile, burnCaptions, language }) {
  const peak = await measurePeak(input);
  const gain = peak == null ? 0 : Math.max(-20, Math.min(20, -1.5 - peak));
  const args = ["-i", input];
  if (musicFile) args.push("-stream_loop", "-1", "-i", musicFile);
  const filters = [];
  let vMap = "0:v";
  let vCodec = ["-c:v", "copy"];
  if (burnCaptions && srtFile) {
    const font = language === "ur" ? "Noto Nastaliq Urdu" : language === "hi" ? "Noto Sans Devanagari" : "Noto Sans";
    const esc = srtFile.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
    filters.push(
      `[0:v]subtitles='${esc}':force_style='FontName=${font},FontSize=22,PrimaryColour=&H00FFFFFF,OutlineColour=&H80000000,BorderStyle=1,Outline=2,Shadow=0,MarginV=40'[v]`
    );
    vMap = "[v]";
    vCodec = VIDEO_ENC;
  }
  filters.push(`[0:a]volume=${gain.toFixed(2)}dB[vo]`);
  if (musicFile) {
    filters.push(
      `[vo]asplit=2[voice][sc];[1:a]aresample=48000,aformat=channel_layouts=stereo,volume=0.18[m];` +
        `[m][sc]sidechaincompress=threshold=0.02:ratio=10:attack=15:release=400[duck];` +
        `[voice][duck]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.89[a]`
    );
  } else {
    filters.push(`[vo]anull[a]`);
  }
  await ff(
    [...args, "-filter_complex", filters.join(";"), "-map", vMap, "-map", "[a]", ...vCodec, ...AUDIO_ENC, "-shortest", "-movflags", "+faststart", out],
    "finalize"
  );
  return out;
}

// ─── Captions ───────────────────────────────────────────────────────────────
function srtTime(t) {
  const ms = Math.max(0, Math.round(t * 1000));
  const h = String(Math.floor(ms / 3600000)).padStart(2, "0");
  const m = String(Math.floor((ms % 3600000) / 60000)).padStart(2, "0");
  const s = String(Math.floor((ms % 60000) / 1000)).padStart(2, "0");
  const r = String(ms % 1000).padStart(3, "0");
  return `${h}:${m}:${s},${r}`;
}

/**
 * Build an SRT from scenes. Each scene's spoken text is split into short
 * chunks spread across the scene time in proportion to their length.
 * @param {Array<{start:number, duration:number, lines:string[]}>} timeline
 */
export function buildSrt(timeline, { maxWords = 8 } = {}) {
  const cues = [];
  for (const seg of timeline) {
    const words = seg.lines.join(" ").split(/\s+/).filter(Boolean);
    if (!words.length) continue;
    const chunks = [];
    for (let i = 0; i < words.length; i += maxWords) chunks.push(words.slice(i, i + maxWords).join(" "));
    const total = chunks.reduce((a, c) => a + c.length, 0) || 1;
    const speak = Math.max(0.5, seg.duration - 0.4);
    let t = seg.start + 0.15;
    for (const c of chunks) {
      const d = (c.length / total) * speak;
      cues.push({ start: t, end: t + d, text: c });
      t += d;
    }
  }
  return cues.map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${c.text}\n`).join("\n");
}
