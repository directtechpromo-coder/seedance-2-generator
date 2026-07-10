"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";

function StatCard({ label, value, sublabel }) {
  return (
    <div style={{ background: "rgba(26,18,69,0.8)", border: "1px solid rgba(139,92,246,0.25)", borderRadius: "14px", padding: "18px" }}>
      <div style={{ fontSize: "11px", fontWeight: 700, color: "#9080cc", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "8px" }}>{label}</div>
      <div style={{ fontSize: "28px", fontWeight: 800, color: "#fff" }}>{value}</div>
      {sublabel && <div style={{ fontSize: "11px", color: "#9080cc", marginTop: "4px" }}>{sublabel}</div>}
    </div>
  );
}

function QuickCreateCard({ title, description, href, icon }) {
  return (
    <Link href={href} style={{ textDecoration: "none" }}>
      <div style={{
        background: "rgba(26,18,69,0.8)", border: "1px solid rgba(139,92,246,0.25)", borderRadius: "14px", padding: "20px",
        display: "flex", alignItems: "center", gap: "14px", cursor: "pointer", transition: "border-color .15s",
      }}>
        <div style={{ width: "44px", height: "44px", borderRadius: "11px", background: "rgba(139,92,246,0.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          {icon}
        </div>
        <div>
          <div style={{ fontSize: "14px", fontWeight: 700, color: "#fff", marginBottom: "3px" }}>{title}</div>
          <div style={{ fontSize: "12px", color: "#9080cc" }}>{description}</div>
        </div>
      </div>
    </Link>
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
    <div style={{ padding: "28px 32px", maxWidth: "1200px", margin: "0 auto" }}>
      <h1 style={{ fontSize: "24px", fontWeight: 900, color: "#fff", marginBottom: "4px" }}>
        Welcome back, {session.user.name?.split(" ")[0] || "there"} 👋
      </h1>
      <p style={{ fontSize: "13px", color: "#9080cc", marginBottom: "24px" }}>Let's bring your ideas to life.</p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "14px", marginBottom: "28px" }}>
        <StatCard label="Videos Generated" value={loading ? "…" : totalVideos} />
        <StatCard label="Credits Remaining" value={session.user.credits === "admin" ? "⚡ Unlimited" : session.user.credits} />
        <StatCard label="Success Rate" value={loading ? "…" : successRate !== null ? `${successRate}%` : "—"} />
      </div>

      <div style={{ fontSize: "14px", fontWeight: 700, color: "#fff", marginBottom: "12px" }}>Quick Create</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "14px", marginBottom: "28px" }}>
        <QuickCreateCard
          title="Text to Video"
          description="Transform your ideas into cinematic videos."
          href="/"
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#c4b5fd" strokeWidth="1.8"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>}
        />
        <QuickCreateCard
          title="Multi-Scene Story"
          description="Create and stitch multiple scenes together."
          href="/"
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#c4b5fd" strokeWidth="1.8"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>}
        />
        <QuickCreateCard
          title="Reference Video"
          description="Use your own video to guide the generation."
          href="/"
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#c4b5fd" strokeWidth="1.8"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>}
        />
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
        <div style={{ fontSize: "14px", fontWeight: 700, color: "#fff" }}>Recent Creations</div>
        <Link href="/creations" style={{ fontSize: "12px", color: "#a78bfa", textDecoration: "none" }}>View all →</Link>
      </div>

      {loading ? (
        <div style={{ color: "#9080cc", fontSize: "13px" }}>Loading...</div>
      ) : recent.length === 0 ? (
        <div style={{ background: "rgba(26,18,69,0.6)", border: "1px solid rgba(139,92,246,0.2)", borderRadius: "12px", padding: "30px", textAlign: "center", color: "#9080cc", fontSize: "13px" }}>
          No videos yet — <Link href="/" style={{ color: "#a78bfa" }}>create your first one</Link>.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "12px" }}>
          {recent.map((item) => (
            <Link key={item.id} href="/creations" style={{ textDecoration: "none" }}>
              <div style={{ borderRadius: "10px", overflow: "hidden", background: "#000", aspectRatio: "1", border: "1px solid rgba(139,92,246,0.2)" }}>
                {item.status === "completed" && item.imageUrl ? (
                  <video src={item.imageUrl} muted autoPlay loop playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", color: item.status === "failed" ? "#f87171" : "#9080cc" }}>
                    {item.status === "failed" ? "Failed" : "Processing..."}
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
