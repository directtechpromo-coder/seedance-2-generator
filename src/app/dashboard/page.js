"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";

function StatCard({ label, value, sublabel, iconBg, icon }) {
  return (
    <div style={{ background: "rgba(26,18,69,0.8)", border: "1px solid rgba(139,92,246,0.25)", borderRadius: "14px", padding: "18px", display: "flex", gap: "14px", alignItems: "flex-start" }}>
      <div style={{ width: "40px", height: "40px", borderRadius: "10px", background: iconBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        {icon}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: "11px", fontWeight: 600, color: "#9080cc", marginBottom: "6px" }}>{label}</div>
        <div style={{ fontSize: "24px", fontWeight: 800, color: "#fff", lineHeight: 1 }}>{value}</div>
        {sublabel && <div style={{ fontSize: "11px", color: "#9080cc", marginTop: "5px" }}>{sublabel}</div>}
      </div>
    </div>
  );
}

function QuickCreateCard({ title, description, href, icon, iconBg, badge }) {
  return (
    <Link href={href} style={{ textDecoration: "none" }}>
      <div style={{
        background: "rgba(26,18,69,0.8)", border: "1px solid rgba(139,92,246,0.25)", borderRadius: "14px", padding: "20px",
        display: "flex", alignItems: "center", gap: "14px", cursor: "pointer", position: "relative",
      }}>
        {badge && (
          <span style={{ position: "absolute", top: "12px", right: "14px", fontSize: "9px", fontWeight: 800, color: "#0f0a2e", background: "#34d399", padding: "2px 6px", borderRadius: "5px" }}>{badge}</span>
        )}
        <div style={{ width: "44px", height: "44px", borderRadius: "11px", background: iconBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          {icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "14px", fontWeight: 700, color: "#fff", marginBottom: "3px" }}>{title}</div>
          <div style={{ fontSize: "12px", color: "#9080cc" }}>{description}</div>
        </div>
        <span style={{ color: "#9080cc", fontSize: "16px" }}>→</span>
      </div>
    </Link>
  );
}

// Placeholder data — no real usage-tracking backend exists yet for these.
// Swap DUMMY_ACTIVITY / DUMMY_TEMPLATES / DUMMY_USAGE for real API data later.
const DUMMY_ACTIVITY = [8, 14, 10, 22, 18, 30, 24]; // videos per day, last 7 days
const DUMMY_ACTIVITY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DUMMY_TEMPLATES = [
  { name: "Problem-Agitate-Solve", uses: "9.8K" },
  { name: "Before / After", uses: "7.2K" },
  { name: "Talking Testimonial", uses: "6.5K" },
  { name: "Unboxing / First Try", uses: "5.9K" },
];
const DUMMY_USAGE_PERCENT = 42;

function ActivityChart() {
  const max = Math.max(...DUMMY_ACTIVITY);
  const w = 480, h = 120, pad = 8;
  const stepX = (w - pad * 2) / (DUMMY_ACTIVITY.length - 1);
  const points = DUMMY_ACTIVITY.map((v, i) => {
    const x = pad + i * stepX;
    const y = h - pad - (v / max) * (h - pad * 2);
    return [x, y];
  });
  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p[0]},${p[1]}`).join(" ");
  const areaPath = `${linePath} L${points[points.length - 1][0]},${h} L${points[0][0]},${h} Z`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: "auto", display: "block" }}>
      <defs>
        <linearGradient id="activityFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#activityFill)" />
      <path d={linePath} fill="none" stroke="#a78bfa" strokeWidth="2" />
      {points.map((p, i) => (
        <circle key={i} cx={p[0]} cy={p[1]} r="2.5" fill="#c4b5fd" />
      ))}
    </svg>
  );
}

function UsageDonut({ percent }) {
  const r = 42, c = 2 * Math.PI * r;
  const offset = c - (percent / 100) * c;
  return (
    <svg width="110" height="110" viewBox="0 0 110 110">
      <circle cx="55" cy="55" r={r} fill="none" stroke="rgba(139,92,246,0.15)" strokeWidth="10" />
      <circle
        cx="55" cy="55" r={r} fill="none" stroke="#8b5cf6" strokeWidth="10" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={offset} transform="rotate(-90 55 55)"
      />
      <text x="55" y="51" textAnchor="middle" fontSize="20" fontWeight="800" fill="#fff">{percent}%</text>
      <text x="55" y="67" textAnchor="middle" fontSize="9" fill="#9080cc">of limit</text>
    </svg>
  );
}

export default function DashboardPage() {
  const { data: session } = useSession();
  const [creations, setCreations] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session?.user) return;
    fetch("/api/creations")
      .then((res) => res.json())
      .then((data) => setCreations(Array.isArray(data) ? data : []))
      .catch((e) => console.error(e))
      .finally(() => setLoading(false));
  }, [session]);

  const totalVideos = creations.length;
  const completed = creations.filter((c) => c.status === "completed").length;
  const successRate = totalVideos > 0 ? Math.round((completed / totalVideos) * 100) : null;
  const recent = creations.slice(0, 4);

  if (!session?.user) {
    return (
      <div style={{ padding: "40px", textAlign: "center", color: "#9080cc" }}>
        Sign in to see your dashboard.
      </div>
    );
  }

  return (
    <div style={{ padding: "28px 32px", maxWidth: "1360px", margin: "0 auto" }}>
      <h1 style={{ fontSize: "24px", fontWeight: 900, color: "#fff", marginBottom: "4px" }}>
        Welcome back, {session.user.name?.split(" ")[0] || "there"} 👋
      </h1>
      <p style={{ fontSize: "13px", color: "#9080cc", marginBottom: "24px" }}>Let's bring your ideas to life.</p>

      {/* Stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "14px", marginBottom: "24px" }}>
        <StatCard
          label="Videos Generated"
          value={loading ? "…" : totalVideos}
          iconBg="rgba(139,92,246,0.2)"
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#c4b5fd" strokeWidth="1.8"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>}
        />
        <StatCard
          label="Credits Remaining"
          value={session.user.credits === "admin" ? "⚡ Unlimited" : session.user.credits}
          iconBg="rgba(34,211,238,0.15)"
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#67e8f9" strokeWidth="1.8"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5c0-1 1-1.8 2.5-1.8s2.5.8 2.5 1.8-1 1.3-2.5 1.8-2.5.8-2.5 1.9 1 1.8 2.5 1.8 2.5-.8 2.5-1.8"/></svg>}
        />
        <StatCard
          label="Avg. Generation Time"
          value="1m 24s"
          sublabel="Preview — not tracked yet"
          iconBg="rgba(96,165,250,0.15)"
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#93c5fd" strokeWidth="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>}
        />
        <StatCard
          label="Success Rate"
          value={loading ? "…" : successRate !== null ? `${successRate}%` : "—"}
          iconBg="rgba(52,211,153,0.15)"
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6ee7b7" strokeWidth="1.8"><path d="M20 6L9 17l-5-5"/></svg>}
        />
      </div>

      {/* Quick Create */}
      <div style={{ fontSize: "14px", fontWeight: 700, color: "#fff", marginBottom: "3px" }}>Quick Create</div>
      <div style={{ fontSize: "12px", color: "#9080cc", marginBottom: "12px" }}>Start a new project with our most popular tools.</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "14px", marginBottom: "28px" }}>
        <QuickCreateCard
          title="Text to Video"
          description="Transform your ideas into cinematic videos."
          href="/"
          iconBg="rgba(139,92,246,0.2)"
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#c4b5fd" strokeWidth="1.8"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>}
        />
        <QuickCreateCard
          title="Reference Video"
          description="Use your own video to guide the generation."
          href="/"
          iconBg="rgba(34,211,238,0.15)"
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#67e8f9" strokeWidth="1.8"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>}
        />
        <QuickCreateCard
          title="Multi-Scene Story"
          description="Create and stitch multiple scenes together."
          href="/"
          badge="NEW"
          iconBg="rgba(52,211,153,0.15)"
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6ee7b7" strokeWidth="1.8"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>}
        />
      </div>

      {/* Recent Projects + side widgets */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: "16px", alignItems: "start" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
            <div style={{ fontSize: "14px", fontWeight: 700, color: "#fff" }}>Recent Projects</div>
            <Link href="/creations" style={{ fontSize: "12px", color: "#a78bfa", textDecoration: "none" }}>View all →</Link>
          </div>

          {loading ? (
            <div style={{ color: "#9080cc", fontSize: "13px" }}>Loading...</div>
          ) : recent.length === 0 ? (
            <div style={{ background: "rgba(26,18,69,0.6)", border: "1px solid rgba(139,92,246,0.2)", borderRadius: "12px", padding: "30px", textAlign: "center", color: "#9080cc", fontSize: "13px" }}>
              No videos yet — <Link href="/" style={{ color: "#a78bfa" }}>create your first one</Link>.
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "12px", marginBottom: "28px" }}>
              {recent.map((item) => {
                const title = item.prompt ? item.prompt.slice(0, 28) + (item.prompt.length > 28 ? "…" : "") : "Untitled";
                const date = item.createdAt ? new Date(item.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";
                return (
                  <Link key={item.id} href="/creations" style={{ textDecoration: "none" }}>
                    <div style={{ borderRadius: "10px", overflow: "hidden", background: "#000", aspectRatio: "16/10", border: "1px solid rgba(139,92,246,0.2)", position: "relative" }}>
                      {item.status === "completed" && item.imageUrl ? (
                        <video src={item.imageUrl} muted autoPlay loop playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : (
                        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", color: item.status === "failed" ? "#f87171" : "#9080cc" }}>
                          {item.status === "failed" ? "Failed" : "Processing..."}
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize: "12px", fontWeight: 600, color: "#fff", marginTop: "6px" }}>{title}</div>
                    <div style={{ fontSize: "10.5px", color: "#9080cc" }}>{date}{item.resolution ? ` · ${item.resolution}` : ""}</div>
                  </Link>
                );
              })}
            </div>
          )}

          {/* Trending Templates — placeholder */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "14px", fontWeight: 700, color: "#fff" }}>Trending Templates</span>
              <span style={{ fontSize: "9px", fontWeight: 800, color: "#9080cc", border: "1px solid rgba(139,92,246,0.3)", padding: "1.5px 6px", borderRadius: "5px" }}>SOON</span>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "10px" }}>
            {DUMMY_TEMPLATES.map((t) => (
              <div key={t.name} style={{ borderRadius: "10px", overflow: "hidden", border: "1px solid rgba(139,92,246,0.15)", opacity: 0.6 }}>
                <div style={{ aspectRatio: "1", background: "linear-gradient(145deg,#1a1245,#241a58)" }} />
                <div style={{ padding: "8px 10px" }}>
                  <div style={{ fontSize: "11.5px", fontWeight: 600, color: "#fff" }}>{t.name}</div>
                  <div style={{ fontSize: "10px", color: "#9080cc" }}>{t.uses} uses</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right column: Activity + Usage — both placeholders */}
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <div style={{ background: "rgba(26,18,69,0.8)", border: "1px solid rgba(139,92,246,0.25)", borderRadius: "14px", padding: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
              <span style={{ fontSize: "13px", fontWeight: 700, color: "#fff" }}>Generation Activity</span>
              <span style={{ fontSize: "9px", fontWeight: 800, color: "#9080cc", border: "1px solid rgba(139,92,246,0.3)", padding: "1.5px 6px", borderRadius: "5px" }}>SOON</span>
            </div>
            <ActivityChart />
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "4px" }}>
              {DUMMY_ACTIVITY_LABELS.map((l) => (
                <span key={l} style={{ fontSize: "9px", color: "#9080cc" }}>{l}</span>
              ))}
            </div>
          </div>

          <div style={{ background: "rgba(26,18,69,0.8)", border: "1px solid rgba(139,92,246,0.25)", borderRadius: "14px", padding: "16px", textAlign: "center" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", marginBottom: "10px" }}>
              <span style={{ fontSize: "13px", fontWeight: 700, color: "#fff" }}>Usage This Month</span>
              <span style={{ fontSize: "9px", fontWeight: 800, color: "#9080cc", border: "1px solid rgba(139,92,246,0.3)", padding: "1.5px 6px", borderRadius: "5px" }}>SOON</span>
            </div>
            <UsageDonut percent={DUMMY_USAGE_PERCENT} />
            <p style={{ fontSize: "10.5px", color: "#9080cc", marginTop: "8px" }}>Full usage tracking coming soon.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
