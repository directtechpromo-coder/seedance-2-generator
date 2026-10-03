// scripts/engine-selftest.js
// Offline self-test for the Long-Video Engine. No API keys, no database, no
// network: fal/LLM/TTS are replaced with local mocks, but the REAL pipeline,
// planner, budget logic, QA retry loop and FFmpeg assembly all run.
//
//   npm run engine:selftest

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

process.env.ENGINE_MOCK = "1";
const ROOT = await fs.mkdtemp(path.join(os.tmpdir(), "engine-selftest-"));
process.env.ENGINE_MOCK_STORE = path.join(ROOT, "store");
process.env.ENGINE_FPS = "24";
process.env.ENGINE_X264_PRESET = "ultrafast";

const { enforceBudget, lipsyncEligible, storyPlan, baseAudioType } = await import("../src/lib/engine/planner.js");
const { extractJSON } = await import("../src/lib/engine/llm.js");
const { assignVoices } = await import("../src/lib/engine/voices.js");
const { estimateProject } = await import("../src/lib/engine/cost.js");
const { normalizeOutline, normalizeScenes } = await import("../src/lib/engine/script.js");
const { buildSrt, probeDuration } = await import("../src/lib/engine/worker/ffmpeg.js");
const { MemoryRepo } = await import("../src/lib/engine/repo.js");
const { runProject } = await import("../src/lib/engine/worker/pipeline.js");
const { parseProjectInput } = await import("../src/lib/engine/validate.js");

let passed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    console.error(`  ✗ ${name}\n    ${e.stack}`);
    process.exitCode = 1;
  }
}

// ─── Unit tests ─────────────────────────────────────────────────────────────
console.log("\nUnit tests");

await test("extractJSON handles fences and chatter", () => {
  assert.deepEqual(extractJSON('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(extractJSON('Sure! Here it is: {"a":"x}y","b":[1,2]} hope it helps'), { a: "x}y", b: [1, 2] });
  assert.deepEqual(extractJSON("[1,2,3]"), [1, 2, 3]);
  assert.throws(() => extractJSON("no json here"));
});

await test("voices are locked, deterministic and distinct", () => {
  const chars = [
    { key: "raza", gender: "male", ageGroup: "child" },
    { key: "bilal", gender: "male", ageGroup: "adult" },
    { key: "abbu", gender: "male", ageGroup: "adult" },
    { key: "sara", gender: "female", ageGroup: "child" },
  ];
  const a = assignVoices({ provider: "edge", language: "ur", characters: chars });
  const b = assignVoices({ provider: "edge", language: "ur", characters: chars });
  assert.deepEqual(a, b, "same input must give same voices");
  const sig = Object.values(a.byKey).map((v) => `${v.voice}|${v.pitch}|${v.rate}`);
  sig.push(`${a.narrator.voice}|${a.narrator.pitch}|${a.narrator.rate}`);
  assert.equal(new Set(sig).size, sig.length, "every speaker must sound different");
  assert.ok(a.byKey.sara.voice.includes("Uzma") || a.byKey.sara.voice.includes("Gul"), "female child gets a female Urdu voice");
});

await test("lip sync eligibility rules", () => {
  assert.equal(lipsyncEligible({ narration: "", dialogue: [{ character: "raza", line: "hi" }], characters: ["raza"], shot: "close-up" }), true);
  assert.equal(lipsyncEligible({ narration: "x", dialogue: [{ character: "raza", line: "hi" }], characters: ["raza"], shot: "close-up" }), false, "narrator present");
  assert.equal(lipsyncEligible({ narration: "", dialogue: [{ character: "raza", line: "hi" }], characters: [], shot: "close-up" }), false, "speaker off-screen");
  assert.equal(lipsyncEligible({ narration: "", dialogue: [{ character: "raza", line: "hi" }], characters: ["raza"], shot: "wide" }), false, "wide shot");
  assert.equal(
    lipsyncEligible({ narration: "", dialogue: [{ character: "raza", line: "a" }, { character: "sara", line: "b" }], characters: ["raza", "sara"], shot: "medium" }),
    false,
    "two speakers"
  );
});

await test("budget is never exceeded and highest scores win", () => {
  const scenes = Array.from({ length: 60 }, (_, i) => ({
    index: i,
    durationSec: 10,
    narration: i % 7 === 0 ? "" : "text",
    dialogue: i % 7 === 0 ? [{ character: "raza", line: "hello" }] : [],
    characters: ["raza"],
    shot: i % 7 === 0 ? "close-up" : "medium",
    action: "",
  }));
  const scores = new Map(scenes.map((s) => [s.index, { motionScore: (s.index * 37) % 11, lipsync: s.index % 7 === 0, motionPrompt: "m", camera: "zoom_in" }]));
  for (const planKey of ["economy", "standard", "premium"]) {
    const plan = enforceBudget({ scenes, scores, planKey });
    const used = plan.reduce((a, p) => a + p.clipSeconds, 0);
    const cap = { economy: 60, standard: 150, premium: 300 }[planKey]; // 600s video: scaled budget > minimum
    assert.ok(used <= cap, `${planKey}: used ${used}s > cap ${cap}s`);
    const lips = plan.filter((p) => p.lipsync).length;
    assert.ok(lips <= { economy: 0, standard: 3, premium: 8 }[planKey], `${planKey}: too many lipsync (${lips})`);
    for (const p of plan) {
      if (p.lipsync) assert.equal(p.visualType, "MOTION", "lipsync needs a motion clip");
      if (p.visualType === "STILL") assert.equal(p.clipSeconds, 0);
    }
    // Every motion scene must score at least as high as every skipped candidate that would have fit.
    const motion = plan.filter((p) => p.visualType === "MOTION" && !p.lipsync).map((p) => p.motionScore + (p.index <= 2 ? 2 : 0));
    const skipped = plan.filter((p) => p.visualType === "STILL" && p.motionScore + (p.index <= 2 ? 2 : 0) >= 6).map((p) => p.motionScore + (p.index <= 2 ? 2 : 0));
    if (motion.length && skipped.length) assert.ok(Math.min(...motion) >= Math.max(...skipped), `${planKey}: a lower score got motion over a higher one`);
  }
});

await test("short cinema videos still get motion (plan minimum)", () => {
  const scenes = Array.from({ length: 6 }, (_, i) => ({ index: i, durationSec: 8, narration: "x", dialogue: [], characters: [], shot: "medium", action: "runs" }));
  const scores = new Map(scenes.map((s) => [s.index, { motionScore: 8, motionPrompt: "m", camera: "zoom_in", lipsync: false }]));
  const eco = enforceBudget({ scenes, scores, planKey: "economy" }); // 48s video
  const used = eco.reduce((a, p) => a + p.clipSeconds, 0);
  assert.equal(eco.filter((p) => p.visualType === "MOTION").length, 2, "economy gets 2 moving scenes in a short video");
  assert.ok(used <= 12, `economy minimum is 12s, used ${used}`);
});

await test("story plan is all stills with camera moves", () => {
  const plan = storyPlan([{ index: 0, shot: "wide", narration: "x", dialogue: [] }, { index: 1, shot: "close-up", narration: "", dialogue: [] }]);
  assert.ok(plan.every((p) => p.visualType === "STILL" && p.clipSeconds === 0 && p.camera));
  assert.equal(baseAudioType({ narration: "", dialogue: [], action: "" }), "SILENT");
});

await test("script normalization drops unknown characters and keeps off-screen speakers", () => {
  const o = normalizeOutline({ characters: [{ name: "Raza", appearance: "boy" }, { name: "Raza", appearance: "dup" }], segments: [{ targetSeconds: 30 }, { targetSeconds: 30 }] }, { targetMinutes: 2 });
  assert.equal(o.characters.length, 2);
  assert.notEqual(o.characters[0].key, o.characters[1].key);
  assert.equal(o.segments.reduce((a, s) => a + s.targetSeconds, 0), 120);
  const sc = normalizeScenes([{ visual: "v", characters: ["raza", "ghost"], dialogue: [{ character: "Raza", line: "x" }, { character: "ghost", line: "y" }] }], ["raza"]);
  assert.deepEqual(sc[0].characters, ["raza"]);
  assert.equal(sc[0].dialogue.length, 1);
});

await test("locations are locked into every scene set there", () => {
  const o = normalizeOutline({ characters: [], locations: [{ key: "Garden", description: "small home garden with a red brick wall and a mango tree" }], segments: [] }, { targetMinutes: 1 });
  const sc = normalizeScenes([{ visual: "Raza kicks a ball", location: "garden" }, { visual: "Night sky", location: "unknown" }], [], o.locations);
  assert.match(sc[0].visual, /^Location: small home garden with a red brick wall/);
  assert.equal(sc[1].visual, "Night sky");
});

await test("estimate scales with plan and mode", () => {
  const story = estimateProject({ mode: "story", minutes: 10 });
  const eco = estimateProject({ mode: "cinema", planKey: "economy", minutes: 10 });
  const std = estimateProject({ mode: "cinema", planKey: "standard", minutes: 10 });
  const pre = estimateProject({ mode: "cinema", planKey: "premium", minutes: 10 });
  assert.ok(story.totalUsd < eco.totalUsd && eco.totalUsd < std.totalUsd && std.totalUsd < pre.totalUsd);
  assert.equal(story.motionSeconds, 0);
  console.log(`      10-min estimates: story $${story.totalUsd} · economy $${eco.totalUsd} · standard $${std.totalUsd} · premium $${pre.totalUsd}`);
});

await test("input validation", () => {
  assert.ok(parseProjectInput({ prompt: "short" }).errors.length);
  assert.ok(parseProjectInput({ prompt: "a long enough prompt", minutes: 99 }).errors.length);
  assert.ok(parseProjectInput({ prompt: "a long enough prompt", musicUrl: "http://insecure" }).errors.length);
  const ok = parseProjectInput({ prompt: "a long enough prompt", mode: "story", plan: "bogus" });
  assert.equal(ok.errors.length, 0);
  assert.equal(ok.data.plan, "standard");
});

await test("SRT timing stays inside each scene", () => {
  const srt = buildSrt([
    { start: 0, duration: 5, lines: ["one two three four five six seven eight nine ten"] },
    { start: 5, duration: 3, lines: [] },
    { start: 8, duration: 4, lines: ["hello"] },
  ]);
  assert.match(srt, /00:00:00,150 --> /);
  assert.match(srt, /00:00:08,150 --> /);
  assert.equal((srt.match(/-->/g) || []).length, 3);
});

// ─── End-to-end with mocks + real FFmpeg ───────────────────────────────────
console.log("\nEnd-to-end (mock models, real FFmpeg)");

const CAST = [
  { key: "raza", name: "Raza", gender: "male", ageGroup: "child", appearance: "8-year-old boy, short black hair", outfit: "red t-shirt, blue shorts" },
  { key: "sara", name: "Sara", gender: "female", ageGroup: "child", appearance: "10-year-old girl, two braids", outfit: "yellow frock" },
  { key: "coco", name: "Coco", gender: "neutral", ageGroup: "child", appearance: "small green baby dragon", outfit: "none" },
];
const BEATS = [
  { narration: "Ek din bagh mein kuch ajeeb hua.", dialogue: [], characters: [], shot: "wide", action: "" },
  { narration: "", dialogue: [{ character: "raza", line: "Sara! Idhar aao, dekho yeh kya hai!" }], characters: ["raza"], shot: "close-up", action: "Raza points excitedly" },
  { narration: "Jhaadiyon ke peeche ek chhota sa dragon chhupa tha.", dialogue: [], characters: ["coco"], shot: "medium", action: "the dragon peeks out and flaps tiny wings" },
  { narration: "", dialogue: [{ character: "sara", line: "Yeh to bohat pyara hai!" }, { character: "raza", line: "Ammi ko mat batana." }], characters: ["sara", "raza"], shot: "medium", action: "" },
  { narration: "", dialogue: [], characters: ["coco"], shot: "wide", action: "Coco sneezes a puff of fire and jumps back" },
  { narration: "Bachon ne faisla kiya ke woh Coco ka khayal rakhenge.", dialogue: [], characters: ["raza", "sara", "coco"], shot: "wide", action: "" },
];
const mocks = {
  ttsProvider: "mock",
  script: {
    outline: async () => ({
      title: "Coco ka Raaz",
      logline: "Two kids hide a baby dragon",
      narratorGender: "female",
      styleGuide: "3D Pixar style",
      seo: { title: "Coco ka Raaz | Urdu Cartoon", description: "desc", tags: ["urdu cartoon", "dragon"] },
      characters: CAST,
      segments: [{ summary: "discovery", targetSeconds: 30 }, { summary: "decision", targetSeconds: 30 }],
    }),
    segment: async (seg) => ({ scenes: seg.index === 1 ? BEATS.slice(0, 3).map((b) => ({ ...b, visual: `v${seg.index}`, mood: "fun" })) : BEATS.slice(3).map((b) => ({ ...b, visual: `v${seg.index}`, mood: "fun" })) }),
  },
  planner: async (batch) => ({
    scenes: batch.map((s) => ({
      index: s.index,
      motionScore: s.action ? 8 : 2,
      motionPrompt: s.action || "",
      camera: "zoom_in",
      lipsync: s.shot === "close-up" && s.dialogue.length > 0,
    })),
  }),
};

function newProject(repo, id, extra = {}) {
  return repo.create({
    id,
    userId: "u1",
    mode: "cinema",
    plan: "standard",
    prompt: "Urdu kids episode about a baby dragon",
    language: "ur",
    targetMinutes: 1,
    style: "3D Pixar style",
    aspect: "16:9",
    ttsProvider: "mock",
    creditsCharged: 40,
    ...extra,
  });
}
const quiet = () => {};

await test("cinema mode: full episode renders, budget + lipsync + QA regeneration work", async () => {
  process.env.ENGINE_MOCK_QA_FAIL = "image:3,clip:2";
  const repo = new MemoryRepo();
  newProject(repo, "cinema1", { plan: "premium", musicUrl: null, burnCaptions: false });
  const logs = [];
  process.env.ENGINE_KEEP_WORKDIR = "1";
  const result = await runProject(repo, "cinema1", { workRoot: ROOT, log: (m) => logs.push(m), mocks });
  assert.equal(result, "DONE", logs.join("\n"));
  const p = await repo.getProject("cinema1");
  assert.equal(p.status, "DONE");
  assert.equal(p.progress, 100);
  assert.equal(p.scenes.length, 6);
  assert.ok(p.characters.every((c) => c.masterImageUrl && c.locked), "every character has a locked master");

  const sum = p.scenes.reduce((a, s) => a + s.durationSec, 0);
  const final = new URL(p.finalVideoUrl).pathname;
  const dur = await probeDuration(final);
  assert.ok(Math.abs(dur - sum) < 0.6, `final ${dur.toFixed(2)}s vs scenes ${sum.toFixed(2)}s`);

  const motion = p.scenes.filter((s) => s.visualType === "MOTION");
  assert.ok(motion.length >= 2, "action scenes became motion");
  const budget = Math.max(24, Math.round((300 * sum) / 600)); // premium = 300s per 10 min, min 24s
  const used = p.scenes.reduce((a, s) => a + (s.clipSeconds || 0), 0);
  assert.ok(used <= budget, `motion ${used}s exceeds budget ${budget}s`);
  assert.ok(p.scenes.filter((s) => !s.action && s.audioType !== "LIPSYNC").every((s) => s.visualType === "STILL"), "calm scenes stay still");
  assert.ok(motion.every((s) => s.videoUrl));
  const lip = p.scenes.find((s) => s.audioType === "LIPSYNC");
  assert.ok(lip && lip.lipsyncUrl && lip.index === 1, "close-up single-speaker dialogue got lip sync");
  assert.equal(p.scenes[3].audioType, "DIALOGUE", "two-speaker scene stays voiceover");
  assert.ok(logs.some((l) => l.includes("scene 3 QA 3/10 → regenerating")), "failed QA triggers regeneration");
  assert.equal(p.scenes[3].qaScore, 9, "regenerated image accepted");
  assert.ok(logs.some((l) => l.includes("scene 2 clip QA 3/10")), "clip QA ran");
  assert.ok(p.scenes[2].videoUrl, "clip regenerated after QA fail");
  assert.equal(p.scenes[4].visualType, "MOTION", "plan minimum gives every action scene motion in a short video");
  assert.ok(p.captionsUrl && p.thumbnailUrl);
  const srt = await fs.readFile(new URL(p.captionsUrl).pathname, "utf8");
  assert.match(srt, /Sara! Idhar aao/);
  console.log(`      ${p.scenes.length} scenes, ${dur.toFixed(1)}s, ${motion.length} motion, 1 lipsync → ${final}`);
  delete process.env.ENGINE_MOCK_QA_FAIL;
});

await test("story mode: all stills, no motion spend, music + burned captions", async () => {
  const repo = new MemoryRepo();
  // Generate a short royalty-free test tone as "music".
  const music = path.join(ROOT, "music.mp3");
  const { run } = await import("../src/lib/engine/worker/ffmpeg.js");
  await run("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=330:duration=4", music]);
  newProject(repo, "story1", { mode: "story", musicUrl: `file://${music}`, burnCaptions: true, language: "en" });
  const result = await runProject(repo, "story1", { workRoot: ROOT, log: quiet, mocks });
  assert.equal(result, "DONE");
  const p = await repo.getProject("story1");
  assert.ok(p.scenes.every((s) => s.visualType === "STILL" && !s.videoUrl));
  assert.ok(!p.costLedger.some((e) => e.kind === "motion" || e.kind === "lipsync"));
  const dur = await probeDuration(new URL(p.finalVideoUrl).pathname);
  const sum = p.scenes.reduce((a, s) => a + s.durationSec, 0);
  assert.ok(Math.abs(dur - sum) < 0.6, `music loop must not change length (${dur} vs ${sum})`);
});

await test("approval pause → approve → resumes without redoing locked characters", async () => {
  const repo = new MemoryRepo();
  newProject(repo, "appr1", { autoApprove: false, mode: "story" });
  assert.equal(await runProject(repo, "appr1", { workRoot: ROOT, log: quiet, mocks }), "PAUSED");
  let p = await repo.getProject("appr1");
  assert.equal(p.status, "AWAITING_APPROVAL");
  const masters = p.characters.map((c) => c.masterImageUrl);
  assert.ok(p.scenes.every((s) => !s.audioUrl), "nothing expensive before approval");
  await repo.updateProject("appr1", { charactersApproved: true, status: "QUEUED" });
  assert.equal(await runProject(repo, "appr1", { workRoot: ROOT, log: quiet, mocks }), "DONE");
  p = await repo.getProject("appr1");
  assert.deepEqual(p.characters.map((c) => c.masterImageUrl), masters, "locked masters reused");
});

await test("crash mid-way → RETRY → resumes, nothing regenerated twice", async () => {
  const repo = new MemoryRepo();
  newProject(repo, "crash1");
  let calls = 0;
  const flaky = {
    ...mocks,
    planner: async (batch) => {
      calls++;
      if (calls === 1) throw new Error("simulated network failure");
      return mocks.planner(batch);
    },
  };
  await repo.updateProject("crash1", { attempts: 1 });
  assert.equal(await runProject(repo, "crash1", { workRoot: ROOT, log: quiet, mocks: flaky }), "RETRY");
  let p = await repo.getProject("crash1");
  assert.equal(p.status, "QUEUED");
  const audio = p.scenes.map((s) => s.audioUrl);
  assert.ok(audio.every(Boolean), "voices were saved before the crash");
  await repo.updateProject("crash1", { attempts: 2 });
  assert.equal(await runProject(repo, "crash1", { workRoot: ROOT, log: quiet, mocks: flaky }), "DONE");
  p = await repo.getProject("crash1");
  assert.deepEqual(p.scenes.map((s) => s.audioUrl), audio, "voices not re-generated");
});

await test("repeated failure → FAILED + credits refunded once", async () => {
  const repo = new MemoryRepo();
  newProject(repo, "fail1", { attempts: 3 });
  const broken = { ...mocks, script: { ...mocks.script, outline: async () => { throw new Error("LLM down"); } } };
  assert.equal(await runProject(repo, "fail1", { workRoot: ROOT, log: quiet, mocks: broken }), "FAILED");
  const p = await repo.getProject("fail1");
  assert.equal(p.status, "FAILED");
  assert.equal(p.creditsRefunded, true);
  assert.equal(await repo.refundCredits("fail1"), 0, "second refund is a no-op");
});

await test("canceled project stops and refunds", async () => {
  const repo = new MemoryRepo();
  newProject(repo, "cancel1");
  const cancelling = {
    ...mocks,
    planner: async (batch) => {
      await repo.updateProject("cancel1", { status: "CANCELED" });
      return mocks.planner(batch);
    },
  };
  assert.equal(await runProject(repo, "cancel1", { workRoot: ROOT, log: quiet, mocks: cancelling }), "CANCELED");
  const p = await repo.getProject("cancel1");
  assert.equal(p.creditsRefunded, true);
  assert.ok(p.scenes.every((s) => !s.imageUrl), "no images generated after cancel");
});

console.log(`\n${passed} passed${process.exitCode ? ", SOME FAILED" : ""}. Artifacts in ${ROOT}`);
