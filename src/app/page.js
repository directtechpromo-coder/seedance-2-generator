"use client";

import { useState, useRef, useEffect } from "react";
import {
  FaBolt, FaMagic, FaChevronDown, FaPlus, FaTrash, FaSyncAlt, FaVideo, FaMusic, FaFilm,
} from "react-icons/fa";
import { IoImageOutline } from "react-icons/io5";
import { FiDownload } from "react-icons/fi";
import { motion, AnimatePresence } from "framer-motion";
import { downloadMedia } from "@/lib/utils";

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

  const handleStitchAndDownload = async () => {
    if (stitchList.length < 2) return;
    try {
      setStitching(true);
      setError(null);
      const res = await fetch("/api/stitch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoUrls: stitchList }),
      });
      if (!res.ok) throw new Error("Stitch failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `final-video-${Date.now()}.mp4`;
      a.click();
    } catch (err) {
      setError(err.message);
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

          {stitchList.length >= 2 && (
            <button onClick={handleStitchAndDownload} disabled={stitching}
              className="w-full bg-green-500 text-white rounded-md py-2 text-sm font-medium hover:bg-green-600 active:scale-[0.98] transition-all disabled:opacity-60 flex items-center justify-center gap-2">
              {stitching
                ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
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
