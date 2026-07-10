"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  {
    section: null,
    items: [
      { name: "Dashboard", href: "/dashboard", icon: "grid" },
      { name: "Create Video", href: "/", icon: "video" },
      { name: "Gallery", href: "/creations", icon: "image" },
      { name: "Pricing", href: "/pricing", icon: "coin" },
    ],
  },
];

function Icon({ name }) {
  const common = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" };
  switch (name) {
    case "grid":
      return (
        <svg {...common}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>
      );
    case "video":
      return (
        <svg {...common}><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" /></svg>
      );
    case "image":
      return (
        <svg {...common}><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></svg>
      );
    case "coin":
      return (
        <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5c0-1 1-1.8 2.5-1.8s2.5.8 2.5 1.8-1 1.3-2.5 1.8-2.5.8-2.5 1.9 1 1.8 2.5 1.8 2.5-.8 2.5-1.8" /></svg>
      );
    default:
      return null;
  }
}

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside
      style={{
        width: "220px",
        minHeight: "100vh",
        background: "rgba(15,10,46,0.97)",
        borderRight: "1px solid rgba(139,92,246,0.2)",
        display: "flex",
        flexDirection: "column",
        padding: "20px 14px",
        flexShrink: 0,
      }}
    >
      <Link href="/" style={{ display: "flex", alignItems: "center", gap: "10px", textDecoration: "none", marginBottom: "28px", padding: "0 8px" }}>
        <div style={{ width: "32px", height: "32px", borderRadius: "9px", background: "#8b5cf6", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M6 5L18 12L6 19V5Z" fill="white" />
            <path d="M15 12L20 9V15L15 12Z" fill="rgba(255,255,255,0.5)" />
          </svg>
        </div>
        <span style={{ fontSize: "18px", fontWeight: 900, color: "#fff", letterSpacing: "-.5px" }}>
          Vid<span style={{ color: "#a78bfa" }}>ro</span>
        </span>
      </Link>

      {NAV_ITEMS.map((group, gi) => (
        <div key={gi} style={{ marginBottom: "12px" }}>
          {group.section && (
            <div style={{ fontSize: "10px", fontWeight: 700, color: "#6b5f9e", textTransform: "uppercase", letterSpacing: "1px", padding: "0 10px", marginBottom: "6px" }}>
              {group.section}
            </div>
          )}
          {group.items.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  display: "flex", alignItems: "center", gap: "10px", padding: "9px 10px", borderRadius: "9px", marginBottom: "2px",
                  fontSize: "13px", fontWeight: 600, textDecoration: "none",
                  color: active ? "#fff" : "#c8c0ff",
                  background: active ? "rgba(139,92,246,0.25)" : "transparent",
                }}
              >
                <Icon name={item.icon} />
                {item.name}
              </Link>
            );
          })}
        </div>
      ))}

      <div style={{ marginTop: "auto", padding: "12px", borderRadius: "10px", background: "linear-gradient(135deg,rgba(139,92,246,0.15),rgba(244,114,182,0.08))", border: "1px solid rgba(139,92,246,0.25)" }}>
        <div style={{ fontSize: "11px", fontWeight: 700, color: "#fff", marginBottom: "4px" }}>Need help?</div>
        <div style={{ fontSize: "10px", color: "#9080cc", lineHeight: 1.5 }}>
          Questions about generating videos? Reach out anytime.
        </div>
      </div>
    </aside>
  );
}
