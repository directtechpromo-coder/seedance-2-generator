"use client";

// src/app/studio/page.js
// Long-Video Studio — one prompt → full 1-15 minute episode.
//   Story Mode:  images + camera moves + locked voices (cheapest)
//   Cinema Mode: AI decides which scenes get real motion / lip sync (main product)

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession, signIn } from "next-auth/react";

const C = {
  card: { background: "rgba(26,18,69,0.8)", border: "1px solid rgba(139,92,246,0.25)", borderRadius: 14, padding: 18 },
  label: { fontSize: 11, fontWeight: 700, color: "#9080cc", textTransform: "uppercase", letterSpacing: ".6px", marginBottom: 6, display: "block" },
  input: { width: "100%", background: "#1a1245", border: "1px solid rgba(139,92,246,0.3)", borderRadius: 10, padding: "10px 12px", color: "#fff", fontSize: 13, outline: "none" },
  muted: { fontSize: 12, color: "#9080cc" },
};

const STYLE_PRESETS = [
  "3D Pixar-style animation, soft warm lighting, rich colors",
  "Realistic cinematic film still, moody lighting, shallow depth of field",
  "2D anime style, clean line art, vibrant colors",
  "Dark true-crime documentary look, desaturated, dramatic shadows",
];

const STATUS_COLOR = {
  QUEUED: "#fbbf24",
  RUNNING: "#22d3ee",
  AWAITING_APPROVAL: "#f472b6",
  DONE: "#34d399",
  FAILED: "#f87171",
  CANCELED: "#9080cc",
};

const STAGE_LABEL = {
  SCRIPT: "Writing script",
  CHARACTERS: "Locking characters",
  APPROVAL: "Waiting for your approval",
  VOICE: "Recording voices",
  PLAN: "Planning motion vs stills",
  IMAGES: "Drawing scenes",
  MOTION: "Animating key scenes",
  LIPSYNC: "Lip-syncing close-ups",
  ASSEMBLE: "Editing final video",
  DONE: "Finished",
};

function Pill({ children, color = "#a78bfa" }) {
  return (
    <span style={{ fontSize: 10, fontWeight: 800, color, border: `1px solid ${color}55`, background: `${color}18`, padding: "2px 7px", borderRadius: 6, whiteSpace: "nowrap" }}>
      {children}
    </span>
  );
}

function Segmented({ value, onChange, options }) {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          style={{
            flex: "1 1 0",
            minWidth: 90,
            padding: "9px 10px",
            borderRadius: 10,
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 700,
            textAlign: "left",
            color: value === o.value ? "#fff" : "#c8c0ff",
            background: value === o.value ? "rgba(139,92,246,0.35)" : "#1a1245",
            border: `1px solid ${value === o.value ? "#8b5cf6" : "rgba(139,92,246,0.25)"}`,
          }}
        >
          {o.label}
          {o.hint && <div style={{ fontSize: 10, fontWeight: 500, color: "#9080cc", marginTop: 2 }}>{o.hint}</div>}
        </button>
      ))}
    </div>
  );
}

function Toggle({ checked, onChange, label }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#c8c0ff", cursor: "pointer" }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} style={{ accentColor: "#8b5cf6" }} />
      {label}
    </label>
  );
}

function ProgressBar({ value }) {
  return (
    <div style={{ height: 6, background: "#241a58", borderRadius: 4, overflow: "hidden" }}>
      <div style={{ width: `${Math.max(2, value)}%`, height: "100%", background: "linear-gradient(90deg,#8b5cf6,#f472b6)", transition: "width .5s" }} />
    </div>
  );
}

function CreateForm({ onCreated }) {
  const [form, setForm] = useState({
    prompt: "",
    mode: "cinema",
    plan: "standard",
    language: "ur",
    minutes: 10,
    style: STYLE_PRESETS[0],
    aspect: "16:9",
    ttsProvider: "elevenlabs",
    autoApprove: true,
    qaEnabled: true,
    burnCaptions: false,
    musicUrl: "",
  });
  const [estimate, setEstimate] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    const t = setTimeout(async () => {
      try {
        const r = await fetch("/api/engine/estimate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(form) });
        if (r.ok) setEstimate(await r.json());
      } catch {}
    }, 300);
    return () => clearTimeout(t);
  }, [form.mode, form.plan, form.minutes, form.ttsProvider, form.language, form.qaEnabled]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/engine/projects", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(form) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Failed");
      onCreated(j.project);
      setForm((f) => ({ ...f, prompt: "" }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ ...C.card, display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <span style={C.label}>Your idea</span>
        <textarea
          value={form.prompt}
          onChange={(e) => set("prompt")(e.target.value)}
          rows={5}
          placeholder="e.g. A 10-minute Urdu kids episode: Raza and Sara find a baby dragon in their garden and must hide it from Ammi…"
          style={{ ...C.input, resize: "vertical", lineHeight: 1.5 }}
        />
      </div>

      <div>
        <span style={C.label}>Mode</span>
        <Segmented
          value={form.mode}
          onChange={set("mode")}
          options={[
            { value: "story", label: "Story Mode", hint: "Images + camera moves" },
            { value: "cinema", label: "Cinema Mode", hint: "AI picks motion scenes" },
          ]}
        />
      </div>

      {form.mode === "cinema" && (
        <div>
          <span style={C.label}>Motion budget</span>
          <Segmented
            value={form.plan}
            onChange={set("plan")}
            options={[
              { value: "economy", label: "Economy", hint: "~1 min motion /10" },
              { value: "standard", label: "Standard", hint: "~2.5 min + 3 lip-sync" },
              { value: "premium", label: "Premium", hint: "~5 min + 8 lip-sync" },
            ]}
          />
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 12 }}>
        <div>
          <span style={C.label}>Language</span>
          <select value={form.language} onChange={(e) => set("language")(e.target.value)} style={C.input}>
            <option value="ur">Urdu</option>
            <option value="hi">Hindi</option>
            <option value="en">English</option>
          </select>
        </div>
        <div>
          <span style={C.label}>Length: {form.minutes} min</span>
          <input type="range" min={1} max={15} value={form.minutes} onChange={(e) => set("minutes")(Number(e.target.value))} style={{ width: "100%", accentColor: "#8b5cf6" }} />
        </div>
        <div>
          <span style={C.label}>Format</span>
          <select value={form.aspect} onChange={(e) => set("aspect")(e.target.value)} style={C.input}>
            <option value="16:9">16:9 YouTube</option>
            <option value="9:16">9:16 Shorts/Reels</option>
          </select>
        </div>
        <div>
          <span style={C.label}>Voices</span>
          <select value={form.ttsProvider} onChange={(e) => set("ttsProvider")(e.target.value)} style={C.input}>
            <option value="edge">Basic (free, flat delivery)</option>
            <option value="elevenlabs">Premium — most expressive (ElevenLabs v3)</option>
          </select>
        </div>
      </div>

      <div>
        <span style={C.label}>Visual style (stays the same in every scene)</span>
        <input value={form.style} onChange={(e) => set("style")(e.target.value)} style={C.input} />
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
          {STYLE_PRESETS.map((s) => (
            <button key={s} type="button" onClick={() => set("style")(s)} style={{ fontSize: 10, color: "#c8c0ff", background: "#241a58", border: "1px solid rgba(139,92,246,0.25)", borderRadius: 7, padding: "4px 8px", cursor: "pointer" }}>
              {s.split(",")[0]}
            </button>
          ))}
        </div>
      </div>

      <div>
        <span style={C.label}>Background music (optional https link to a royalty-free mp3)</span>
        <input value={form.musicUrl} onChange={(e) => set("musicUrl")(e.target.value)} placeholder="https://…/music.mp3" style={C.input} />
      </div>

      <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
        <Toggle checked={form.qaEnabled} onChange={set("qaEnabled")} label="Auto quality check (character consistency)" />
        <Toggle checked={!form.autoApprove} onChange={(v) => set("autoApprove")(!v)} label="Let me approve characters first" />
        <Toggle checked={form.burnCaptions} onChange={set("burnCaptions")} label="Burn captions into video" />
      </div>

      {estimate && (
        <div style={{ background: "#241a58", borderRadius: 10, padding: 12, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={C.muted}>
            ~{estimate.scenes} scenes · {estimate.motionSeconds}s motion · {estimate.lipsyncScenes} lip-sync
          </div>
          <div style={{ fontSize: 15, fontWeight: 800, color: "#fff" }}>{estimate.credits} credits</div>
        </div>
      )}

      {error && <div style={{ color: "#f87171", fontSize: 12 }}>{error}</div>}

      <button
        type="submit"
        disabled={busy || form.prompt.trim().length < 10}
        style={{ padding: "12px", borderRadius: 11, border: "none", fontWeight: 800, fontSize: 14, color: "#fff", cursor: busy ? "wait" : "pointer", background: "linear-gradient(135deg,#8b5cf6,#ec4899)", opacity: busy || form.prompt.trim().length < 10 ? 0.5 : 1 }}
      >
        {busy ? "Starting…" : "Generate episode"}
      </button>
    </form>
  );
}

function ProjectDetail({ id, onChanged }) {
  const [p, setP] = useState(null);
  const [copied, setCopied] = useState("");

  const load = useCallback(async () => {
    const r = await fetch(`/api/engine/projects/${id}`);
    if (r.ok) setP((await r.json()).project);
  }, [id]);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const t = setInterval(load, 5000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [load]);

  async function act(body) {
    await fetch(`/api/engine/projects/${id}/approve`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    load();
    onChanged();
  }
  async function cancel() {
    if (!confirm("Cancel this video? Your credits will be refunded.")) return;
    await fetch(`/api/engine/projects/${id}`, { method: "DELETE" });
    load();
    onChanged();
  }
  function copy(label, text) {
    navigator.clipboard?.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(""), 1500);
  }

  if (!p) return <div style={{ ...C.card, ...C.muted }}>Loading…</div>;
  const seo = p.outline?.seo;
  const motion = p.scenes.filter((s) => s.visualType === "MOTION").length;
  const lips = p.scenes.filter((s) => s.audioType === "LIPSYNC").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={C.card}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: "#fff" }}>{p.title || "New episode"}</div>
            <div style={{ ...C.muted, marginTop: 4 }}>
              {p.mode === "cinema" ? `Cinema · ${p.plan}` : "Story"} · {p.targetMinutes} min · {p.language.toUpperCase()} · {p.creditsCharged} credits
            </div>
          </div>
          <Pill color={STATUS_COLOR[p.status]}>{p.status.replace("_", " ")}</Pill>
        </div>
        {p.status !== "DONE" && (
          <div style={{ marginTop: 14 }}>
            <div style={{ ...C.muted, marginBottom: 6 }}>{STAGE_LABEL[p.stage] || p.stage} — {p.progress}%</div>
            <ProgressBar value={p.progress} />
          </div>
        )}
        {p.error && p.status !== "DONE" && <div style={{ color: "#fca5a5", fontSize: 12, marginTop: 10 }}>{p.error}</div>}
        {["QUEUED", "RUNNING", "AWAITING_APPROVAL"].includes(p.status) && (
          <button onClick={cancel} style={{ marginTop: 12, fontSize: 11, color: "#f87171", background: "transparent", border: "1px solid #f8717155", borderRadius: 8, padding: "5px 10px", cursor: "pointer" }}>
            Cancel & refund
          </button>
        )}
      </div>

      {p.finalVideoUrl && (
        <div style={C.card}>
          <video src={p.finalVideoUrl} controls poster={p.thumbnailUrl || undefined} style={{ width: "100%", borderRadius: 10, background: "#000" }} />
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            <a href={p.finalVideoUrl} download style={{ fontSize: 12, fontWeight: 700, color: "#fff", background: "#8b5cf6", padding: "8px 14px", borderRadius: 9, textDecoration: "none" }}>
              Download MP4
            </a>
            {p.captionsUrl && (
              <a href={p.captionsUrl} download style={{ fontSize: 12, fontWeight: 700, color: "#c8c0ff", border: "1px solid rgba(139,92,246,0.4)", padding: "8px 14px", borderRadius: 9, textDecoration: "none" }}>
                Captions (.srt)
              </a>
            )}
            <span style={{ ...C.muted, alignSelf: "center" }}>
              {Math.round(p.durationSec || 0)}s · {motion} motion · {lips} lip-sync
            </span>
          </div>
          {seo && (
            <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                ["Title", seo.title],
                ["Description", seo.description],
                ["Tags", (seo.tags || []).join(", ")],
              ].map(([k, v]) => (
                <div key={k} style={{ background: "#241a58", borderRadius: 9, padding: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={C.label}>YouTube {k}</span>
                    <button onClick={() => copy(k, v)} style={{ fontSize: 10, color: "#a78bfa", background: "none", border: "none", cursor: "pointer" }}>
                      {copied === k ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <div style={{ fontSize: 12, color: "#fff", whiteSpace: "pre-wrap" }}>{v}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {p.characters.length > 0 && (
        <div style={C.card}>
          <span style={C.label}>Characters — look & voice locked for the whole video</span>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 12, marginTop: 6 }}>
            {p.characters.map((c) => (
              <div key={c.key} style={{ background: "#241a58", borderRadius: 10, overflow: "hidden" }}>
                {c.masterImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.masterImageUrl} alt={c.name} style={{ width: "100%", aspectRatio: "3/4", objectFit: "cover", display: "block" }} />
                ) : (
                  <div style={{ aspectRatio: "3/4", display: "flex", alignItems: "center", justifyContent: "center", ...C.muted }}>Generating…</div>
                )}
                <div style={{ padding: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{c.name}</div>
                  <div style={{ fontSize: 10, color: "#9080cc", marginTop: 2 }}>🎙 {c.voice?.voice}</div>
                  {p.status === "AWAITING_APPROVAL" && (
                    <button onClick={() => act({ action: "regenerate", key: c.key })} style={{ marginTop: 6, fontSize: 10, color: "#c8c0ff", background: "transparent", border: "1px solid rgba(139,92,246,0.4)", borderRadius: 6, padding: "3px 7px", cursor: "pointer" }}>
                      Regenerate
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          {p.status === "AWAITING_APPROVAL" && (
            <button onClick={() => act({ action: "approve" })} style={{ marginTop: 14, padding: "10px 16px", borderRadius: 10, border: "none", fontWeight: 800, color: "#0f0a2e", background: "#34d399", cursor: "pointer" }}>
              Looks good — continue
            </button>
          )}
        </div>
      )}

      {p.scenes.length > 0 && (
        <div style={C.card}>
          <span style={C.label}>Scenes ({p.scenes.length})</span>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 10, marginTop: 6 }}>
            {p.scenes.map((s) => (
              <div key={s.index} style={{ background: "#241a58", borderRadius: 9, overflow: "hidden" }}>
                {s.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={s.imageUrl} alt="" style={{ width: "100%", aspectRatio: p.aspect === "9:16" ? "9/16" : "16/9", objectFit: "cover", display: "block" }} />
                ) : (
                  <div style={{ aspectRatio: "16/9", background: "#1a1245" }} />
                )}
                <div style={{ padding: 7, display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
                  <span style={{ fontSize: 10, color: "#9080cc" }}>#{s.index + 1}</span>
                  {s.visualType && <Pill color={s.visualType === "MOTION" ? "#22d3ee" : "#a78bfa"}>{s.visualType}</Pill>}
                  {s.audioType === "LIPSYNC" && <Pill color="#f472b6">LIPSYNC</Pill>}
                  {s.qaScore != null && <Pill color={s.qaScore >= 7 ? "#34d399" : "#fbbf24"}>QA {s.qaScore}</Pill>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function StudioPage() {
  const { status } = useSession();
  const [projects, setProjects] = useState([]);
  const [selected, setSelected] = useState(null);
  const loaded = useRef(false);

  const loadList = useCallback(async () => {
    const r = await fetch("/api/engine/projects");
    if (r.ok) {
      const j = await r.json();
      setProjects(j.projects);
      if (!loaded.current && j.projects[0]) setSelected(j.projects[0].id);
      loaded.current = true;
    }
  }, []);

  const anyActive = useMemo(() => projects.some((p) => ["QUEUED", "RUNNING"].includes(p.status)), [projects]);

  useEffect(() => {
    if (status !== "authenticated") return;
    const first = setTimeout(loadList, 0);
    const t = anyActive ? setInterval(loadList, 6000) : null;
    return () => {
      clearTimeout(first);
      if (t) clearInterval(t);
    };
  }, [status, anyActive, loadList]);

  if (status === "unauthenticated") {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <button onClick={() => signIn("google")} style={{ padding: "12px 20px", borderRadius: 10, border: "none", fontWeight: 800, color: "#fff", background: "#8b5cf6", cursor: "pointer" }}>
          Sign in to use Long-Video Studio
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: "24px clamp(16px,3vw,32px)", maxWidth: 1400, margin: "0 auto" }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 24, fontWeight: 900, color: "#fff", letterSpacing: "-.5px" }}>Long-Video Studio</h1>
        <p style={{ ...C.muted, marginTop: 4, fontSize: 13 }}>One prompt → a full episode with the same characters and voices from start to finish.</p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,420px),1fr))", gap: 20, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <CreateForm
            onCreated={(p) => {
              setSelected(p.id);
              loadList();
            }}
          />
          {projects.length > 0 && (
            <div style={C.card}>
              <span style={C.label}>Your episodes</span>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
                {projects.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setSelected(p.id)}
                    style={{ textAlign: "left", background: selected === p.id ? "rgba(139,92,246,0.25)" : "#241a58", border: `1px solid ${selected === p.id ? "#8b5cf6" : "transparent"}`, borderRadius: 10, padding: 10, cursor: "pointer" }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title || p.prompt}</span>
                      <Pill color={STATUS_COLOR[p.status]}>{p.status === "RUNNING" ? `${p.progress}%` : p.status.replace("_", " ")}</Pill>
                    </div>
                    {["QUEUED", "RUNNING"].includes(p.status) && (
                      <div style={{ marginTop: 8 }}>
                        <ProgressBar value={p.progress} />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <div>{selected ? <ProjectDetail key={selected} id={selected} onChanged={loadList} /> : <div style={{ ...C.card, ...C.muted }}>Your episode will appear here.</div>}</div>
      </div>
    </div>
  );
}
