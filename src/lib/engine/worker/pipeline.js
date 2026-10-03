// src/lib/engine/worker/pipeline.js
// The orchestrator. Runs one VideoProject through every stage:
//   SCRIPT → CHARACTERS (lock looks + voices) → APPROVAL (optional pause)
//   → VOICE → PLAN → IMAGES (+QA) → MOTION (+QA) → LIPSYNC → ASSEMBLE → DONE
//
// Every stage skips work that is already saved, so re-running a project after a
// crash/restart continues from where it stopped and never pays twice.

import fs from "node:fs/promises";
import path from "node:path";
import { LIMITS, PLANS, ASPECTS } from "../config.js";
import { CostLedger } from "../cost.js";
import { generateScript } from "../script.js";
import { assignVoices } from "../voices.js";
import { storyPlan, cinemaPlan, baseAudioType } from "../planner.js";
import { speak } from "./tts.js";
import { normalizeEmotion } from "../emotion.js";
import { generateMaster, generateSceneImage, generateMotion, generateLipsync } from "./media.js";
import { checkSceneImage, checkClipFrame } from "./qa.js";
import { download, upload, extFromUrl } from "./storage.js";
import * as F from "./ffmpeg.js";

const MAX_ATTEMPTS = 3;

/** Small concurrency-limited map. */
export async function pMap(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

class Canceled extends Error {}

/**
 * @param {import("../repo.js").PrismaRepo} repo
 * @param {string} projectId
 * @param {{workRoot:string, log?:Function, mocks?:object}} opts
 * @returns {Promise<"DONE"|"PAUSED"|"CANCELED"|"RETRY"|"FAILED">}
 */
export async function runProject(repo, projectId, { workRoot, log = console.log, mocks = {} } = {}) {
  let p = await repo.getProject(projectId);
  if (!p) throw new Error(`Project ${projectId} not found`);
  const workDir = path.join(workRoot, projectId);
  await fs.mkdir(workDir, { recursive: true });
  const ledger = new CostLedger(p.costLedger || []);
  const say = (m) => log(`[${projectId.slice(-6)}] ${m}`);

  const save = (data = {}) =>
    repo.updateProject(projectId, { ...data, costLedger: ledger.entries, costUsd: ledger.total(), lockedAt: new Date() });
  const stage = async (name, progress) => {
    const cur = await repo.getProject(projectId);
    if (cur.status === "CANCELED") throw new Canceled();
    await save({ stage: name, progress });
    say(`→ ${name} (${progress}%)`);
  };
  const reload = async () => (p = await repo.getProject(projectId));

  try {
    // ── 1. SCRIPT ────────────────────────────────────────────────────────────
    if (!p.outline) {
      await stage("SCRIPT", 2);
      const { outline, scenes, cost } = await generateScript({
        prompt: p.prompt,
        language: p.language,
        targetMinutes: p.targetMinutes,
        style: p.style || "",
        mock: mocks.script,
      });
      ledger.add("script", cost);
      // Voices are assigned ONCE here and locked on the character rows.
      const provider = mocks.ttsProvider || p.ttsProvider;
      const voices = assignVoices({ provider, language: p.language, narratorGender: outline.narratorGender, characters: outline.characters });
      await repo.saveScript(projectId, {
        outline,
        scenes,
        characters: outline.characters.map((c) => ({ ...c, voice: voices.byKey[c.key] })),
        narratorVoice: voices.narrator,
      });
      await save();
      say(`script: "${outline.title}" — ${scenes.length} scenes, ${outline.characters.length} characters`);
      await reload();
    }
    const styleGuide = p.outline.styleGuide || p.style || "cinematic, high detail";
    const { width: W, height: H } = ASPECTS[p.aspect] || ASPECTS["16:9"];

    // ── 2. CHARACTERS: lock master images ─────────────────────────────────────
    const missingMasters = p.characters.filter((c) => !c.masterImageUrl);
    if (missingMasters.length) {
      await stage("CHARACTERS", 8);
      await pMap(missingMasters, LIMITS.concurrency, async (c) => {
        const r = await generateMaster(c, styleGuide, { workDir });
        ledger.add("images", r.cost, `master ${c.key}`);
        await repo.updateCharacter(projectId, c.key, { masterImageUrl: r.url, locked: true });
      });
      await save();
      await reload();
    }

    // ── 3. APPROVAL (optional) ───────────────────────────────────────────────
    if (!p.autoApprove && !p.charactersApproved) {
      await save({ status: "AWAITING_APPROVAL", stage: "APPROVAL", progress: 12 });
      say("waiting for the user to approve characters");
      return "PAUSED";
    }

    // ── 4. VOICE: one audio track per scene, locked voices ────────────────────
    const needVoice = p.scenes.filter((s) => !s.audioUrl);
    if (needVoice.length) {
      await stage("VOICE", 14);
      const byKey = Object.fromEntries(p.characters.map((c) => [c.key, c]));
      let done = 0;
      await pMap(needVoice, LIMITS.concurrency, async (s) => {
        const dir = path.join(workDir, "voice", String(s.index));
        await fs.mkdir(dir, { recursive: true });
        const parts = [];
        let cost = 0;
        if (s.narration?.trim()) {
          const r = await speak(s.narration, p.narratorVoice, path.join(dir, "n.mp3"), normalizeEmotion(s.mood));
          parts.push(r.file);
          cost += r.cost;
        }
        for (const [i, d] of (s.dialogue || []).entries()) {
          const profile = byKey[d.character]?.voice || p.narratorVoice;
          const r = await speak(d.line, profile, path.join(dir, `d${i}.mp3`), d.emotion);
          parts.push(r.file);
          cost += r.cost;
        }
        const out = path.join(dir, "scene.mp3");
        if (parts.length) await F.joinSpeech(parts, out);
        else await F.makeSilence(LIMITS.silentSceneSeconds, out);
        const dur = Math.max(LIMITS.minSceneSeconds, await F.probeDuration(out));
        const url = await upload(out);
        ledger.add("voice", cost);
        await repo.updateScene(projectId, s.index, { audioUrl: url, durationSec: dur });
        done++;
        if (done % 5 === 0) await save({ progress: 14 + Math.round((done / needVoice.length) * 10) });
      });
      await save();
      await reload();
    }

    // ── 5. PLAN: STILL vs MOTION, audio type, camera ──────────────────────────
    if (!p.planned) {
      await stage("PLAN", 26);
      let plan;
      if (p.mode === "story") plan = storyPlan(p.scenes);
      else {
        const r = await cinemaPlan(p.scenes, { planKey: p.plan, mock: mocks.planner });
        ledger.add("planning", r.cost);
        plan = r.plan;
      }
      for (const d of plan) {
        await repo.updateScene(projectId, d.index, {
          visualType: d.visualType,
          audioType: d.audioType,
          camera: d.camera,
          motionScore: Math.round(d.motionScore),
          motionPrompt: d.motionPrompt,
          clipSeconds: d.clipSeconds,
        });
      }
      const motionSec = plan.reduce((a, d) => a + d.clipSeconds, 0);
      say(`plan: ${plan.filter((d) => d.visualType === "MOTION").length} motion scenes (${motionSec}s), ${plan.filter((d) => d.audioType === "LIPSYNC").length} lip-sync`);
      await save({ planned: true });
      await reload();
    }

    // ── 6. IMAGES (+ Phase 3 QA with automatic regeneration) ──────────────────
    const needImg = p.scenes.filter((s) => !s.imageUrl);
    if (needImg.length) {
      await stage("IMAGES", 30);
      let done = 0;
      await pMap(needImg, LIMITS.concurrency, async (s) => {
        const cast = s.characters.map((k) => p.characters.find((c) => c.key === k)).filter((c) => c?.masterImageUrl).slice(0, 3);
        let best = null;
        let fixHint = "";
        const tries = p.qaEnabled ? 1 + LIMITS.qaMaxRetries : 1;
        for (let attempt = 0; attempt < tries; attempt++) {
          let img;
          try {
            img = await generateSceneImage(s, p.characters, { styleGuide, aspect: p.aspect, workDir, fixHint, attempt });
          } catch (e) {
            say(`scene ${s.index} image attempt ${attempt} failed: ${e.message}`);
            continue;
          }
          ledger.add("images", img.cost, `scene ${s.index}`);
          if (!p.qaEnabled || !cast.length) {
            best = { url: img.url, score: null, issues: [] };
            break;
          }
          const qa = await checkSceneImage({ scene: s, cast, imageUrl: img.url, attempt });
          ledger.add("qa", qa.cost);
          if (!best || (qa.score ?? 0) > (best.score ?? -1)) best = { url: img.url, score: qa.score, issues: qa.issues };
          if (qa.pass) break;
          fixHint = qa.issues.join("; ");
          say(`scene ${s.index} QA ${qa.score}/10 → regenerating (${fixHint || "low score"})`);
        }
        if (!best) {
          // Last resort: never fail a 10-minute video because of one image.
          const prev = (await repo.getProject(projectId)).scenes.filter((x) => x.imageUrl && x.index < s.index).pop();
          if (!prev) throw new Error(`Scene ${s.index}: image generation failed`);
          best = { url: prev.imageUrl, score: null, issues: ["image failed, reused previous scene image"] };
          // A reused image can't carry motion/lip sync for this scene.
          await repo.updateScene(projectId, s.index, { visualType: "STILL", clipSeconds: 0, audioType: s.audioType === "LIPSYNC" ? "DIALOGUE" : s.audioType || baseAudioType(s) });
        }
        await repo.updateScene(projectId, s.index, { imageUrl: best.url, qaScore: best.score, qaNotes: best.issues.join("; ") || null });
        done++;
        if (done % 4 === 0) await save({ progress: 30 + Math.round((done / needImg.length) * 30) });
      });
      await save();
      await reload();
    }

    // ── 7. MOTION (+ QA, falls back to STILL instead of failing) ──────────────
    const plan = PLANS[p.plan] || PLANS.standard;
    const needMotion = p.scenes.filter((s) => s.visualType === "MOTION" && !s.videoUrl);
    if (needMotion.length) {
      await stage("MOTION", 60);
      let done = 0;
      await pMap(needMotion, LIMITS.concurrency, async (s) => {
        const tries = p.qaEnabled ? 2 : 1;
        let accepted = null;
        for (let attempt = 0; attempt < tries && !accepted; attempt++) {
          let clip;
          try {
            clip = await generateMotion(s, s.imageUrl, { clipSeconds: s.clipSeconds, resolution: plan.videoResolution, styleGuide, workDir });
          } catch (e) {
            say(`scene ${s.index} motion attempt ${attempt} failed: ${e.message}`);
            continue;
          }
          ledger.add("motion", clip.cost, `scene ${s.index} ${s.clipSeconds}s`);
          if (!p.qaEnabled) {
            accepted = clip.url;
            break;
          }
          const local = await download(clip.url, path.join(workDir, "qa", `clip-${s.index}-${attempt}.mp4`));
          const dur = await F.probeDuration(local);
          const mid = await F.extractFrameAt(local, dur * 0.5, path.join(workDir, "qa", `mid-${s.index}-${attempt}.jpg`));
          const end = await F.extractFrameAt(local, Math.max(0, dur - 0.3), path.join(workDir, "qa", `end-${s.index}-${attempt}.jpg`));
          const frameUrls = [await upload(mid), await upload(end)];
          const cast = s.characters.map((k) => p.characters.find((c) => c.key === k)).filter((c) => c?.masterImageUrl).slice(0, 3);
          const qa = await checkClipFrame({ scene: s, cast, imageUrl: s.imageUrl, frameUrls, attempt });
          ledger.add("qa", qa.cost);
          if (qa.pass) accepted = clip.url;
          else say(`scene ${s.index} clip QA ${qa.score}/10 (${qa.issues.join("; ")})`);
        }
        if (accepted) {
          await repo.updateScene(projectId, s.index, { videoUrl: accepted });
        } else {
          say(`scene ${s.index}: motion unusable → falling back to STILL`);
          await repo.updateScene(projectId, s.index, {
            visualType: "STILL",
            clipSeconds: 0,
            audioType: s.audioType === "LIPSYNC" ? "DIALOGUE" : s.audioType,
            qaNotes: [s.qaNotes, "motion failed QA, used still"].filter(Boolean).join("; "),
          });
        }
        done++;
        await save({ progress: 60 + Math.round((done / needMotion.length) * 20) });
      });
      await save();
      await reload();
    }

    // ── 8. LIPSYNC (close-up dialogue only) ───────────────────────────────────
    const needLip = p.scenes.filter((s) => s.audioType === "LIPSYNC" && s.videoUrl && !s.lipsyncUrl);
    if (needLip.length) {
      await stage("LIPSYNC", 80);
      await pMap(needLip, Math.min(2, LIMITS.concurrency), async (s) => {
        try {
          const r = await generateLipsync(s, s.videoUrl, s.audioUrl, { audioSeconds: s.durationSec, workDir });
          ledger.add("lipsync", r.cost, `scene ${s.index}`);
          await repo.updateScene(projectId, s.index, { lipsyncUrl: r.url });
        } catch (e) {
          say(`scene ${s.index}: lip sync failed (${e.message}) → voiceover instead`);
          await repo.updateScene(projectId, s.index, { audioType: "DIALOGUE" });
        }
      });
      await save();
      await reload();
    }

    // ── 9. ASSEMBLE ──────────────────────────────────────────────────────────
    if (!p.finalVideoUrl) {
      await stage("ASSEMBLE", 86);
      const segDir = path.join(workDir, "segments");
      const assetDir = path.join(workDir, "assets");
      await fs.mkdir(segDir, { recursive: true });
      const renderLimit = Number(process.env.ENGINE_RENDER_CONCURRENCY || 2);
      let done = 0;
      const segments = await pMap(p.scenes, renderLimit, async (s) => {
        const out = path.join(segDir, `seg-${String(s.index).padStart(4, "0")}.mp4`);
        const audio = await download(s.audioUrl, path.join(assetDir, `a-${s.index}${extFromUrl(s.audioUrl, ".mp3")}`));
        const image = await download(s.imageUrl, path.join(assetDir, `i-${s.index}${extFromUrl(s.imageUrl, ".png")}`));
        const dur = s.durationSec;
        if (s.audioType === "LIPSYNC" && s.lipsyncUrl) {
          const v = await download(s.lipsyncUrl, path.join(assetDir, `l-${s.index}.mp4`));
          await F.renderLipsync({ video: v, audio, duration: dur, w: W, h: H, out });
        } else if (s.visualType === "MOTION" && s.videoUrl) {
          const v = await download(s.videoUrl, path.join(assetDir, `v-${s.index}.mp4`));
          const last = await F.extractLastFrame(v, path.join(assetDir, `last-${s.index}.jpg`));
          await F.renderMotion({ clip: v, lastFrame: last, audio, duration: dur, clipSeconds: s.clipSeconds || 6, w: W, h: H, out });
        } else {
          await F.renderStill({ image, audio, duration: dur, camera: s.camera || "zoom_in", w: W, h: H, out });
        }
        done++;
        if (done % 5 === 0) await save({ progress: 86 + Math.round((done / p.scenes.length) * 9) });
        return out;
      });

      const joined = await F.concatSegments(segments, path.join(workDir, "joined.mp4"), workDir);

      // Captions (always exported as .srt; optionally burned in).
      let t = 0;
      const timeline = p.scenes.map((s) => {
        const seg = { start: t, duration: s.durationSec, lines: [s.narration, ...(s.dialogue || []).map((d) => d.line)].filter(Boolean) };
        t += s.durationSec;
        return seg;
      });
      const srtFile = path.join(workDir, "captions.srt");
      await fs.writeFile(srtFile, F.buildSrt(timeline));

      const musicFile = p.musicUrl ? await download(p.musicUrl, path.join(assetDir, `music${extFromUrl(p.musicUrl, ".mp3")}`)) : null;
      const finalFile = await F.finalize({
        input: joined,
        out: path.join(workDir, "final.mp4"),
        musicFile,
        srtFile,
        burnCaptions: p.burnCaptions,
        language: p.language,
      });
      const durationSec = await F.probeDuration(finalFile);
      await save({ progress: 97 });
      const finalVideoUrl = await upload(finalFile);
      const captionsUrl = await upload(srtFile);
      const hero = [...p.scenes].sort((a, b) => (b.motionScore || 0) - (a.motionScore || 0))[0];
      await save({ finalVideoUrl, captionsUrl, durationSec, thumbnailUrl: hero?.imageUrl || p.scenes[0]?.imageUrl || null });
      await reload();
    }

    await save({ status: "DONE", stage: "DONE", progress: 100, error: null });
    say(`DONE — ${Math.round(p.durationSec)}s video, cost $${ledger.total()}`);
    if (!process.env.ENGINE_KEEP_WORKDIR) await fs.rm(workDir, { recursive: true, force: true });
    return "DONE";
  } catch (e) {
    if (e instanceof Canceled) {
      say("canceled");
      await repo.refundCredits(projectId);
      return "CANCELED";
    }
    const cur = await repo.getProject(projectId);
    const msg = e?.message || String(e);
    say(`error: ${msg}`);
    if ((cur?.attempts || 0) < MAX_ATTEMPTS && e?.kind !== "config") {
      // Progress is saved — put it back in the queue and resume later.
      await repo.updateProject(projectId, { status: "QUEUED", error: `Retrying after: ${msg}`, costLedger: ledger.entries, costUsd: ledger.total() });
      return "RETRY";
    }
    await repo.updateProject(projectId, { status: "FAILED", error: msg, costLedger: ledger.entries, costUsd: ledger.total() });
    await repo.refundCredits(projectId);
    return "FAILED";
  }
}
