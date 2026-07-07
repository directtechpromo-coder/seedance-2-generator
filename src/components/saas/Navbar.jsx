"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signIn, signOut, useSession } from "next-auth/react";

export function Navbar() {
  const pathname = usePathname();
  const { data: session, status } = useSession();

  const navLinks = [
    { name: "Generation", href: "/" },
    { name: "Gallery", href: "/creations" },
    { name: "Pricing", href: "/pricing" },
  ];

  return (
    <nav
      style={{
        height: "60px",
        background: "rgba(15,10,46,0.97)",
        borderBottom: "1px solid rgba(139,92,246,0.25)",
        display: "flex",
        alignItems: "center",
        padding: "0 28px",
        position: "sticky",
        top: 0,
        zIndex: 100,
      }}
    >
      <Link
        href="/"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          textDecoration: "none",
          flex: 1,
        }}
      >
        <div
          style={{
            width: "34px",
            height: "34px",
            borderRadius: "9px",
            background: "#8b5cf6",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
            <path d="M6 5L18 12L6 19V5Z" fill="white" />
            <path d="M15 12L20 9V15L15 12Z" fill="rgba(255,255,255,0.5)" />
          </svg>
        </div>
        <span style={{ fontSize: "20px", fontWeight: 900, color: "#fff", letterSpacing: "-.5px" }}>
          Vid<span style={{ color: "#a78bfa" }}>ro</span>
        </span>
      </Link>

      <div style={{ display: "flex", gap: "4px", marginRight: "16px" }}>
        {navLinks.map((link) => (
          <Link
            key={link.name}
            href={link.href}
            style={{
              padding: "7px 14px",
              fontSize: "13px",
              fontWeight: 600,
              color: pathname === link.href ? "#fff" : "#c8c0ff",
              background: pathname === link.href ? "rgba(139,92,246,0.25)" : "transparent",
              borderRadius: "8px",
              textDecoration: "none",
            }}
          >
            {link.name}
          </Link>
        ))}
      </div>

      <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
        {status === "loading" ? (
          <div
            style={{
              width: "20px",
              height: "20px",
              borderRadius: "50%",
              border: "2px solid rgba(139,92,246,0.3)",
              borderTopColor: "#8b5cf6",
              animation: "spin 1s linear infinite",
            }}
          />
        ) : session?.user ? (
          <>
            <div
              style={{
                padding: "7px 14px",
                fontSize: "12px",
                fontWeight: 800,
                color: "#a78bfa",
                border: "1px solid rgba(139,92,246,0.3)",
                borderRadius: "9px",
                whiteSpace: "nowrap",
              }}
            >
              {session.user.credits === "admin" ? "⚡ UNLIMITED" : `${session.user.credits} credits`}
            </div>
            {session.user.image && (
              <img
                src={session.user.image}
                alt={session.user.name || "User"}
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "50%",
                  border: "1px solid rgba(139,92,246,0.3)",
                }}
              />
            )}
            <button
              onClick={() => signOut()}
              style={{
                padding: "8px 14px",
                fontSize: "13px",
                fontWeight: 600,
                color: "#c8c0ff",
                borderRadius: "9px",
                border: "1px solid rgba(139,92,246,0.3)",
                background: "transparent",
                cursor: "pointer",
              }}
            >
              Log out
            </button>
          </>
        ) : (
          <button
            onClick={() => signIn("google")}
            style={{
              padding: "8px 20px",
              fontSize: "13px",
              fontWeight: 800,
              color: "#fff",
              borderRadius: "9px",
              border: "none",
              background: "#8b5cf6",
              cursor: "pointer",
            }}
          >
            Sign in
          </button>
        )}
      </div>
    </nav>
  );
}
