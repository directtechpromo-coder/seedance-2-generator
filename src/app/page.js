"use client";

import { useState, useRef, useEffect } from "react";
import {
  FaBolt, FaMagic, FaChevronDown, FaPlus, FaTrash, FaSyncAlt, FaVideo, FaMusic, FaFilm,
} from "react-icons/fa";
import { IoImageOutline } from "react-icons/io5";
import { FiDownload } from "react-icons/fi";
import { motion, AnimatePresence } from "framer-motion";
import { downloadMedia } from "@/lib/utils";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

const ASPECT_RATIOS = [
  { label: "16:9", value: "16:9" }, { label: "9:16", value: "9:16" },
  { label: "4:3", value: "4:3" }, { label: "3:4", value: "3:4" },
];
const RESOLUTIONS = [{ value: "480p", label: "480p" }, { value: "720p", label: "720p" }];
const DURATIONS = [{ value: 5, label: "5 Seconds" }, { value: 10, label: "10 Seconds" }, { value: 15, label: "15 Seconds" }];
const QUALITIES = [{ value: "basic", label: "Basic" }, { value: "high", label: "High" }];

function CustomSelect({ label, value, options, onChange, icon: Icon }) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);
  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) setIsOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);
  const selectedOption = options.find((o) => o.value === value) || options[0];
  return (
    <div className="space-y-1.5" ref={containerRef}>
      <label className="text-[10px] font-medium text-muted uppercase tracking-wider">{label}</label>
      <div className="relative">
        <button onClick={() => setIsOpen(!isOpen)}
          className="w-full flex items-center justify-between px-3 py-2 bg-glass-bg border border-glass-border rounded-md text-xs font-medium text-foreground hover:bg-glass-hover transition-colors outline-none">
          <div className="flex items-center gap-2">
            {Icon && <Icon className="text-primary-500 text-[10px]" />}
            {selectedOption.label}
          </div>
          <FaChevronDown className={`text-[10px] text-muted transition-transform ${isOpen ? "rotate-180" : ""}`} />
        </button>
        <AnimatePresence>
          {isOpen && (
            <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }}
              className="absolute bottom-10 left-0 right-0 bg-glass-bg border border-glass-border rounded-md shadow-xl z-[100] overflow-hidden backdrop-blur-xl">
              {options.map((option) => (
                <button key={option.value} onClick={() => { onChange(option.value); setIsOpen(false); }}
                  className={`w-full text-left px-3 py-2.5 text-xs transition-colors ${value === option.value ? "bg-primary-500 text-white" : "text-muted hover:bg-glass-hover hover:text-foreground"}`}>
                  {option.label}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default function Home() {
  const [mode, setMode] = useState("text-to-video");
  const [prompt, setPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState(ASPECT_RATIOS[0].value);
  const [resolution, setResolution] = useState(RESOLUTIONS[1].value);
  const [duration, setDuration] = useState(DURATIONS[0].value);
  const [quality, setQuality] = useState(QUALITIES[0].value);
  const [generateAudio, setGenerateAudio] = useState(false); // NEW: audio toggle
  const [imagesList, setImagesList] = useState([]);
  const [newImageUrl, setNewImageUrl] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [resultUrl, setResultUrl] = useState(null);
  const [error, setError] = useState(null);
  const [stitchList, setStitchList] = useState([]);
  const [stitching, setStitching] = useState(false);
  const [stitchProgress, setStitchProgress] = useState(""); // NEW: client-side stitch progress text
  const ffmpegRef = useRef(null); // NEW: holds the loaded FFmpeg.wasm instance (loaded once, reused)

  // NEW: Multi-Scene Mode (for long videos built from multiple [SCENE N] blocks)
  const [multiSceneMode, setMultiSceneMode] = useState(false);
  const [scriptText, setScriptText] = useState("");
  const [characterBible, setCharacterBible] = useState(""); // NEW: character descriptions, auto-prepended to every scene
  const [negativePrompt, setNegativePrompt] = useState(""); // NEW: helps keep style consistent across scenes
  const [sceneResults, setSceneResults] = useState([]); // [{index, status: 'pending'|'generating'|'done'|'failed', url, error}]
  const [multiSceneRunning, setMultiSceneRunning] = useState(false);
  const [multiSceneCancelRef] = useState({ current: false }); // mutable flag to allow stopping the loop

  const MODES = [
    { id: "text-to-video", label: "Text", fullLabel: "Text to Video", icon: FaBolt },
    { id: "image-to-video", label: "Image", fullLabel: "Image to Video", icon: IoImageOutline },
    { id: "reference-to-video", label: "Reference", fullLabel: "Reference to Video", icon: FaSyncAlt },
  ];

  const addImageToList = () => {
    if (newImageUrl && imagesList.length < 9) {
      setImagesList([...imagesList, newImageUrl]);
      setNewImageUrl("");
    }
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file || imagesList.length >= 9) return;
    try {
      setIsUploading(true);
      setError(null);
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      if (!res.ok) throw new Error("Upload failed.");
      const data = await res.json();
      if (data.url) setImagesList([...imagesList, data.url]);
    } catch (err) {
      setError("Upload failed.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleGenerate = async () => {
    if (mode === "text-to-video" && !prompt.trim()) return;
    try {
      setLoading(true);
      setError(null);
      setResultUrl(null);
      setStatusMessage("Starting generation...");
      const res = await fetch("/api/seedance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          prompt,
          aspect_ratio: aspectRatio,
          resolution,
          duration,
          quality,
          images_list: imagesList,
          generate_audio: generateAudio, // NEW
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed.");

      // NEW: handle auto-split response (Veo 3.1 audio clips > 8s come back as two clips)
      if (data.clips && Array.isArray(data.clips)) {
        setStatusMessage(`Audio clip split into 2 parts (Veo 3.1 max 8s/clip). Processing both...`);
        await pollMultipleClips(data.clips, data.metadata);
        return;
      }

      if (data.video_url) {
        setResultUrl(data.video_url);
        setLoading(false);
      } else {
        await pollStatus(data.request_id, data.metadata);
      }
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  // NEW: Loads FFmpeg.wasm once and caches it in ffmpegRef for reuse across multiple stitch operations.
  const loadFFmpeg = async () => {
    if (ffmpegRef.current) return ffmpegRef.current;
    const ffmpeg = new FFmpeg();
    const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";
    ffmpeg.on("log", ({ message }) => {
      console.log("[FFmpeg]", message);
    });
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
    });
    ffmpegRef.current = ffmpeg;
    return ffmpeg;
  };

  // NEW: Client-side stitching using FFmpeg.wasm. Downloads each clip, re-encodes them to a
  // consistent format, concatenates properly (not just byte-concatenation), and triggers download.
  // This runs entirely in the browser — no server timeout risk on Vercel Hobby plan.
  const handleStitchAndDownload = async () => {
    if (stitchList.length < 2) return;
    try {
      setStitching(true);
      setError(null);
      setStitchProgress("Loading video engine...");

      const ffmpeg = await loadFFmpeg();

      // Step 1: download and write each clip into FFmpeg's virtual filesystem
      const inputNames = [];
      for (let i = 0; i < stitchList.length; i++) {
        setStitchProgress(`Downloading clip ${i + 1} of ${stitchList.length}...`);
        const fileData = await fetchFile(stitchList[i]);
        const inputName = `input${i}.mp4`;
        await ffmpeg.writeFile(inputName, fileData);
        inputNames.push(inputName);
      }

      // Step 2: build a concat list file (FFmpeg's concat demuxer format)
      const concatListContent = inputNames.map((name) => `file '${name}'`).join("\n");
      await ffmpeg.writeFile("concat_list.txt", concatListContent);

      // Step 3: re-encode + concatenate. Using the concat filter (via re-encode) instead of
      // stream-copy concat demuxer, because clips may come from different models (Wan/Veo)
      // with potentially different codecs/parameters — re-encoding guarantees compatibility.
      setStitchProgress("Stitching clips together... (this may take 20-40 sec)");
      await ffmpeg.exec([
        "-f", "concat",
        "-safe", "0",
        "-i", "concat_list.txt",
        "-c:v", "libx264",
        "-c:a", "aac",
        "-movflags", "+faststart",
        "output.mp4",
      ]);

      // Step 4: read the result and trigger download
      setStitchProgress("Finalizing...");
      const data = await ffmpeg.readFile("output.mp4");
      const blob = new Blob([data.buffer], { type: "video/mp4" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `final-video-${Date.now()}.mp4`;
      a.click();
      URL.revokeObjectURL(url);

      // Cleanup virtual filesystem for next run
      for (const name of inputNames) {
        await ffmpeg.deleteFile(name).catch(() => {});
      }
      await ffmpeg.deleteFile("concat_list.txt").catch(() => {});
      await ffmpeg.deleteFile("output.mp4").catch(() => {});

      setStitchProgress("");
    } catch (err) {
      console.error("[STITCH_CLIENT]", err);
      setError(err.message || "Stitching failed. Try again.");
      setStitchProgress("");
    } finally {
      setStitching(false);
    }
  };

  const pollStatus = async (requestId, metadata) => {
    setStatusMessage("Processing... (30-60 sec)");
    try {
      const res = await fetch("/api/seedance/check-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, metadata }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Status check failed.");
      if (data.status === "completed") {
        setResultUrl(data.imageUrl);
        setLoading(false);
        return data.imageUrl;
      } else if (data.status === "failed") {
        throw new Error("Generation failed.");
      } else {
        await new Promise((r) => setTimeout(r, 3000));
        return await pollStatus(requestId, metadata);
      }
    } catch (err) {
      setError(err.message);
      setLoading(false);
      throw err;
    }
  };

  // NEW: poll two clips in parallel (for auto-split Veo audio clips), then auto-add
  // both to the Stitch Queue in correct order (A then B) once both are done.
  const pollSingleClipSilently = async (requestId, metadata) => {
    const res = await fetch("/api/seedance/check-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId, metadata }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Status check failed.");
    if (data.status === "completed") return data.imageUrl;
    if (data.status === "failed") throw new Error("Generation failed.");
    await new Promise((r) => setTimeout(r, 3000));
    return await pollSingleClipSilently(requestId, metadata);
  };

  const pollMultipleClips = async (clips, metadata) => {
    try {
      // clips is [{request_id, part: "A", duration}, {request_id, part: "B", duration}]
      const sorted = [...clips].sort((a, b) => (a.part < b.part ? -1 : 1));
      const urls = await Promise.all(
        sorted.map((c) => pollSingleClipSilently(c.request_id, metadata))
      );
      // Show the first clip as preview, and queue both for stitching in order.
      setResultUrl(urls[0]);
      setStitchList((prev) => [...prev, ...urls.filter((u) => !prev.includes(u))]);
      setStatusMessage("");
      setLoading(false);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  const getAvailableDurations = () => {
    if (mode === "reference-to-video") {
      return Array.from({ length: 8 }, (_, i) => ({ value: i + 8, label: `${i + 8} Seconds` }));
    }
    return DURATIONS;
  };

  // NEW: Parses a script with [SCENE 1] ... [SCENE 2] ... markers into an array of scene prompts.
  // Falls back to treating non-empty lines as scenes if no [SCENE] markers are found.
  const parseScenes = (text) => {
    const sceneMarkerRegex = /\[SCENE\s*\d+\]/gi;
    if (sceneMarkerRegex.test(text)) {
      return text
        .split(/\[SCENE\s*\d+\]/gi)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    }
    // Fallback: split on blank lines (paragraph breaks) if no [SCENE] tags were used.
    return text
      .split(/\n\s*\n/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  };

  // NEW: Sequentially submits each scene to Veo (8s, audio on), polls each to completion
  // before moving to the next, and updates sceneResults for live progress display.
  const handleMultiSceneGenerate = async () => {
    const scenes = parseScenes(scriptText);
    if (scenes.length === 0) {
      setError("No scenes found. Use [SCENE 1], [SCENE 2]... markers or separate scenes with a blank line.");
      return;
    }

    setMultiSceneRunning(true);
    setError(null);
    multiSceneCancelRef.current = false;
    setSceneResults(scenes.map((text, i) => ({ index: i, text, status: "pending", url: null, error: null })));

    const collectedUrls = [];

    for (let i = 0; i < scenes.length; i++) {
      if (multiSceneCancelRef.current) break;

      setSceneResults((prev) => {
        const next = [...prev];
        next[i] = { ...next[i], status: "generating" };
        return next;
      });

      try {
        // NEW: Prepend the Character Bible to every scene's prompt so character
        // descriptions stay consistent across all generations without manual repetition.
        const fullScenePrompt = characterBible.trim()
          ? `${characterBible.trim()}\n\n${scenes[i]}`
          : scenes[i];

        const res = await fetch("/api/seedance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "text-to-video",
            prompt: fullScenePrompt,
            negative_prompt: negativePrompt || undefined,
            aspect_ratio: aspectRatio,
            resolution,
            duration: 8, // fixed: each scene is a single Veo clip, capped at 8s
            generate_audio: true,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Scene generation failed to start.");

        // Single-clip path only (duration=8 never triggers the auto-split case).
        const url = await pollSingleClipSilently(data.request_id, data.metadata);

        collectedUrls.push(url);
        setSceneResults((prev) => {
          const next = [...prev];
          next[i] = { ...next[i], status: "done", url };
          return next;
        });
      } catch (err) {
        setSceneResults((prev) => {
          const next = [...prev];
          next[i] = { ...next[i], status: "failed", error: err.message };
          return next;
        });
        // Continue to next scene rather than aborting the whole run — a single failed
        // scene shouldn't block the rest; the person can retry just that scene later.
      }
    }

    // Queue all successfully generated clips for stitching, in order.
    setStitchList((prev) => [...prev, ...collectedUrls]);
    setMultiSceneRunning(false);
  };

  const handleStopMultiScene = () => {
    multiSceneCancelRef.current = true;
  };

  useEffect(() => {
    const available = getAvailableDurations();
    if (!available.find((d) => d.value === duration)) setDuration(available[0].value);
  }, [mode]);

  const creditCost = (() => {
    const isReference = mode === "reference-to-video";
    const is720p = resolution === "720p";
    let rate;
    if (isReference) {
      rate = is720p ? (quality === "high" ? 60 : 42) : (quality === "high" ? 48 : 36);
    } else {
      rate = is720p ? (quality === "high" ? 50 : 30) : (quality === "high" ? 30 : 24);
    }
    return Math.ceil(duration * rate);
  })();

  return (
    <div className="flex-1 w-full flex flex-col items-center p-4 md:p-8 overflow-y-auto custom-scrollbar">
      <div className="max-w-6xl w-full mb-10 text-center space-y-4">
        <motion.h1 initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="text-3xl md:text-5xl font-bold text-foreground tracking-tight">
          Seedance v2.0 Playground
        </motion.h1>
        <motion.p initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="text-sm md:text-base text-muted max-w-2xl mx-auto leading-relaxed">
          Experience the next generation of AI video creation. Transform your text and images into high-quality cinematic videos.
        </motion.p>
      </div>

      <div className="max-w-6xl w-full grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <div className="bg-glass-bg border border-glass-border rounded-lg p-6 flex flex-col gap-6">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-md bg-primary-500/10 flex items-center justify-center text-primary-500"><FaMagic /></div>
            <div>
              <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">Seedance Generator</h2>
              <p className="text-[10px] text-muted">Minimal Video Engine</p>
            </div>
          </div>

          <div className="grid grid-cols-3 p-1 bg-glass-hover rounded-md border border-glass-border">
            {MODES.map((m) => {
              const Icon = m.icon;
              return (
                <button key={m.id} onClick={() => setMode(m.id)}
                  className={`py-2 rounded-md text-xs sm:text-sm font-medium transition-colors flex items-center justify-center gap-2 ${mode === m.id ? "bg-primary-500 text-white shadow-sm" : "text-muted hover:text-foreground"}`}>
                  <Icon className="shrink-0" />
                  <span className="sm:hidden">{m.label}</span>
                  <span className="hidden sm:inline">{m.fullLabel}</span>
                </button>
              );
            })}
          </div>

          {/* NEW: Multi-Scene Mode toggle (for building long videos from multiple scenes) */}
          <button
            onClick={() => setMultiSceneMode(!multiSceneMode)}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-md border text-xs font-medium transition-colors ${
              multiSceneMode
                ? "bg-primary-500/10 border-primary-500/30 text-primary-500"
                : "bg-glass-bg border-glass-border text-muted hover:text-foreground"
            }`}
          >
            <span className="flex items-center gap-2">
              <FaFilm className="text-[10px]" />
              Multi-Scene Mode (long videos, e.g. 5 min)
            </span>
            <span className="text-[10px] opacity-70">{multiSceneMode ? "ON" : "OFF"}</span>
          </button>

          {multiSceneMode ? (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-medium text-muted uppercase tracking-wider">
                  Character Bible (auto-prepended to every scene — define each character once here)
                </label>
                <textarea
                  value={characterBible}
                  onChange={(e) => setCharacterBible(e.target.value)}
                  placeholder={"2D flat cartoon animation style, cel-shaded, bright colors.\nCHARACTER_RAZA: a cartoon boy with round black glasses, spiky messy orange hair, wearing a blue striped shirt and brown shorts.\nCHARACTER_SARA: a cartoon girl with two black pigtails tied with red ribbons, wearing a yellow frock with white polka dots."}
                  className="w-full h-28 bg-glass-bg border border-glass-border rounded-md p-2 text-sm outline-none focus:border-primary-500/40 resize-none transition-colors custom-scrollbar"
                />
                <p className="text-[10px] text-muted">
                  This text is automatically added to the start of every scene's prompt — write each scene below using just the character names (e.g. CHARACTER_RAZA) and the action, no need to repeat the full description.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-medium text-muted uppercase tracking-wider">
                  Script (use [SCENE 1], [SCENE 2]... to separate scenes — each becomes one 8s clip)
                </label>
                <textarea
                  value={scriptText}
                  onChange={(e) => setScriptText(e.target.value)}
                  placeholder={"[SCENE 1]\nCHARACTER_RAZA runs into a cozy living room excitedly, waving a piece of paper, speaking loudly in Urdu\n\n[SCENE 2]\nCHARACTER_SARA turns around curiously from the couch, asking a question in Urdu\n\n[SCENE 3]\nCHARACTER_RAZA shows the paper to CHARACTER_SARA, both look at it together, speaking excitedly in Urdu"}
                  className="w-full h-56 bg-glass-bg border border-glass-border rounded-md p-2 text-sm outline-none focus:border-primary-500/40 resize-none transition-colors custom-scrollbar"
                />
                <p className="text-[10px] text-muted">
                  {parseScenes(scriptText).length} scene(s) detected · ~{parseScenes(scriptText).length * 8}s total ·
                  est. ${(parseScenes(scriptText).length * 1.2).toFixed(2)}
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-medium text-muted uppercase tracking-wider">
                  Negative Prompt (keeps style consistent across all scenes)
                </label>
                <input
                  type="text"
                  value={negativePrompt}
                  onChange={(e) => setNegativePrompt(e.target.value)}
                  placeholder="e.g. realistic, photorealistic, live-action, 3D render, human skin texture"
                  className="w-full bg-glass-bg border border-glass-border rounded-md px-3 py-2 text-xs outline-none focus:border-primary-500/40"
                />
              </div>

              {sceneResults.length > 0 && (
                <div className="space-y-1 max-h-56 overflow-y-auto custom-scrollbar">
                  {sceneResults.map((s) => (
                    <div key={s.index} className="flex items-center justify-between px-2 py-1.5 bg-glass-hover rounded text-[10px] border border-glass-border">
                      <span className="text-muted truncate flex-1 mr-2">Scene {s.index + 1}: {s.text.slice(0, 40)}...</span>
                      <span className={`shrink-0 font-medium ${
                        s.status === "done" ? "text-green-400" :
                        s.status === "failed" ? "text-red-400" :
                        s.status === "generating" ? "text-primary-500" : "text-muted"
                      }`}>
                        {s.status === "generating" && <span className="inline-block w-2 h-2 rounded-full bg-primary-500 animate-pulse mr-1" />}
                        {s.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <button
                onClick={multiSceneRunning ? handleStopMultiScene : handleMultiSceneGenerate}
                disabled={!multiSceneRunning && parseScenes(scriptText).length === 0}
                className={`w-full rounded-md py-2 text-sm font-medium transition-all active:scale-[0.98] disabled:opacity-60 ${
                  multiSceneRunning ? "bg-red-500 hover:bg-red-600 text-white" : "bg-primary-500 hover:bg-primary-600 text-white"
                }`}
              >
                {multiSceneRunning
                  ? `Stop (Scene ${sceneResults.filter((s) => s.status === "done" || s.status === "failed").length}/${sceneResults.length} done)`
                  : `Generate All Scenes (${parseScenes(scriptText).length})`}
              </button>
            </div>
          ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-medium text-muted uppercase tracking-wider">Prompt</label>
              <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe your video..."
                className="w-full h-32 bg-glass-bg border border-glass-border rounded-md p-2 text-sm outline-none focus:border-primary-500/40 resize-none transition-colors custom-scrollbar" />
            </div>

            {mode !== "text-to-video" && (
              <div className="space-y-3">
                <label className="text-[10px] font-medium text-muted uppercase tracking-wider">Images ({imagesList.length}/9)</label>
                <div className="flex gap-2">
                  <input type="text" value={newImageUrl} onChange={(e) => setNewImageUrl(e.target.value)} placeholder="Image URL..."
                    className="flex-1 bg-glass-bg border border-glass-border rounded-md px-3 py-2 text-xs outline-none focus:border-primary-500/40" />
                  <input type="file" ref={fileInputRef} hidden accept=".png,.jpg,.jpeg" onChange={handleFileUpload} />
                  <button onClick={() => fileInputRef.current?.click()} disabled={isUploading || imagesList.length >= 9}
                    className="w-9 h-9 bg-primary-500/10 border border-primary-500/20 text-primary-500 rounded-md flex items-center justify-center hover:bg-primary-500 hover:text-white transition-colors">
                    {isUploading ? <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" /> : <IoImageOutline />}
                  </button>
                  <button onClick={addImageToList} disabled={!newImageUrl || imagesList.length >= 9}
                    className="w-9 h-9 bg-glass-bg border border-glass-border text-primary-500 rounded-md flex items-center justify-center hover:bg-primary-500 hover:text-white transition-colors">
                    <FaPlus />
                  </button>
                </div>
                {imagesList.length > 0 && (
                  <div className="grid grid-cols-5 gap-2">
                    {imagesList.map((url, idx) => (
                      <div key={idx} className="relative aspect-square rounded-md bg-glass-bg overflow-hidden group border border-glass-border">
                        <img src={url} className="w-full h-full object-cover" />
                        <button onClick={() => setImagesList(imagesList.filter((_, i) => i !== idx))}
                          className="absolute top-2 right-2 p-1 rounded bg-red-500/90 items-center justify-center hidden group-hover:flex">
                          <FaTrash className="text-white text-[10px]" />
                        </button>
                        <div className="absolute bottom-1 right-1 bg-black/60 px-1 rounded text-[8px] text-white font-bold">@image{idx + 1}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <CustomSelect label="Aspect Ratio" value={aspectRatio} options={ASPECT_RATIOS} onChange={setAspectRatio} />
              <CustomSelect label="Resolution" value={resolution} options={RESOLUTIONS} onChange={setResolution} />
              <CustomSelect label="Duration" value={duration} options={getAvailableDurations()} onChange={setDuration} />
              <CustomSelect label="Quality" value={quality} options={QUALITIES} onChange={setQuality} />
            </div>

            {/* NEW: Audio toggle */}
            <div className="flex items-center justify-between px-3 py-2.5 bg-glass-bg border border-glass-border rounded-md">
              <div className="flex items-center gap-2">
                <FaMusic className="text-primary-500 text-xs" />
                <div>
                  <p className="text-xs font-medium text-foreground">Generate with Audio</p>
                  <p className="text-[10px] text-muted">
                    {generateAudio
                      ? "Veo 3.1 — native audio + lip-sync (clips >8s auto-split)"
                      : "Wan 2.2 — silent, lower cost"}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setGenerateAudio(!generateAudio)}
                className={`w-11 h-6 rounded-full relative transition-colors shrink-0 ${generateAudio ? "bg-primary-500" : "bg-glass-hover border border-glass-border"}`}
              >
                <motion.div
                  className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow"
                  animate={{ left: generateAudio ? "22px" : "2px" }}
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                />
              </button>
            </div>
          </div>
          )}

          {stitchList.length >= 2 && (
            <button onClick={handleStitchAndDownload} disabled={stitching}
              className="w-full bg-green-500 text-white rounded-md py-2 text-sm font-medium hover:bg-green-600 active:scale-[0.98] transition-all disabled:opacity-60 flex items-center justify-center gap-2">
              {stitching
                ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span className="text-xs">{stitchProgress || "Processing..."}</span>
                  </>
                )
                : <><FaFilm /> Stitch & Download ({stitchList.length} clips)</>}
            </button>
          )}

          <button onClick={handleGenerate} disabled={loading || (mode === "text-to-video" && !prompt.trim())}
            className="w-full bg-primary-500 text-white rounded-md py-2 text-sm font-medium hover:bg-primary-600 active:scale-[0.98] transition-all disabled:opacity-60">
            {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mx-auto" /> : `Generate (${creditCost} Credits)`}
          </button>

          {stitchList.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] text-muted uppercase tracking-wider">Stitch Queue ({stitchList.length} clips)</p>
              {stitchList.map((url, idx) => (
                <div key={idx} className="flex items-center justify-between px-2 py-1 bg-glass-hover rounded text-[10px] text-muted border border-glass-border">
                  <span>Clip {idx + 1}</span>
                  <button onClick={() => setStitchList(stitchList.filter((_, i) => i !== idx))}
                    className="text-red-400 hover:text-red-500">✕</button>
                </div>
              ))}
            </div>
          )}

          {error && <p className="text-[10px] text-red-500 font-medium text-center">{error}</p>}
        </div>

        <div className="bg-glass-bg border border-glass-border rounded-lg p-6 flex flex-col gap-4 min-h-[500px]">
          <h2 className="text-[10px] font-medium text-muted uppercase tracking-wider">Preview</h2>
          <div className="flex-1 flex flex-col items-center justify-center bg-glass-hover rounded-md border border-glass-border relative overflow-hidden group">
            {resultUrl ? (
              <div className="w-full h-full flex flex-col items-center justify-center p-4 gap-4">
                <div className="relative w-full aspect-video rounded-md overflow-hidden bg-black shadow-inner">
                  <video src={resultUrl} className="w-full h-full object-contain" controls autoPlay muted loop playsInline />
                  <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => downloadMedia(resultUrl, `seedance-${Date.now()}.mp4`)}
                      className="p-3 bg-white/90 hover:bg-white text-black rounded-full shadow-2xl transition-all hover:scale-110">
                      <FiDownload className="text-xl" />
                    </button>
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap justify-center">
                  <span className="px-2 py-1 bg-primary-500/10 text-primary-500 text-[10px] font-medium rounded uppercase">{aspectRatio}</span>
                  <span className="px-2 py-1 bg-glass-hover text-muted text-[10px] font-medium rounded uppercase">{resolution}</span>
                  {generateAudio && <span className="px-2 py-1 bg-glass-hover text-muted text-[10px] font-medium rounded uppercase">Audio</span>}
                </div>
                <button
                  onClick={() => {
                    if (!stitchList.includes(resultUrl)) {
                      setStitchList([...stitchList, resultUrl]);
                    }
                  }}
                  className={`w-full py-2 rounded-md text-xs font-medium transition-colors border ${
                    stitchList.includes(resultUrl)
                      ? "bg-green-500/20 border-green-500/30 text-green-400"
                      : "bg-glass-bg border-glass-border text-muted hover:text-foreground hover:bg-glass-hover"
                  }`}>
                  {stitchList.includes(resultUrl) ? `✓ Added (${stitchList.length} in queue)` : `+ Add to Stitch Queue`}
                </button>
              </div>
            ) : loading ? (
              <div className="flex flex-col items-center gap-4">
                <div className="w-10 h-10 border-2 border-primary-500/20 border-t-primary-500 rounded-full animate-spin" />
                <p className="text-[10px] font-medium text-muted uppercase tracking-widest animate-pulse">{statusMessage}</p>
              </div>
            ) : (
              <div className="text-center p-8 space-y-3">
                <FaMagic className="text-2xl opacity-30 mx-auto" />
                <p className="text-[10px] text-muted uppercase tracking-widest font-medium">Video Preview</p>
              </div>
            )}
          </div>
        </div>
      </div>
      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar { width: 0px; }
        .custom-scrollbar { scrollbar-width: none; }
      `}</style>
    </div>
  );
}
