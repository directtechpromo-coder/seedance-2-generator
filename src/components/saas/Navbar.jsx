"use client";

import { signIn, signOut, useSession } from "next-auth/react";

export function Navbar() {
  const { data: session, status } = useSession();

  return (
    <nav
      style={{
        height: "60px",
        background: "rgba(15,10,46,0.97)",
        borderBottom: "1px solid rgba(139,92,246,0.25)",
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
        padding: "0 28px",
        position: "sticky",
        top: 0,
        zIndex: 100,
        gap: "10px",
      }}
    >
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
    </nav>
  );
}
