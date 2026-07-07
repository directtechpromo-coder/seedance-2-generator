"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signIn, signOut, useSession } from "next-auth/react";
import {
  FaCoins,
  FaSignOutAlt,
  FaMagic,
  FaBars,
  FaTimes,
  FaGoogle,
} from "react-icons/fa";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export function Navbar() {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const navLinks = [
    { name: "Generation", href: "/" },
    { name: "Gallery", href: "/creations" },
    { name: "Pricing", href: "/pricing" },
  ];

  return (
    <nav className="h-20 border-b border-glass-border bg-glass-bg backdrop-blur-3xl sticky top-0 z-[100] px-4 md:px-12 flex items-center justify-between">
      <Link href="/" className="flex items-center gap-3 group shrink-0">
        <div className="w-10 h-10 rounded-xl bg-primary-500 flex items-center justify-center shadow-lg shadow-primary-500/20 group-hover:scale-110 transition-transform">
          <FaMagic className="text-white text-lg" />
        </div>
        <div className="flex flex-col">
          <span className="font-black text-lg tracking-tighter leading-none italic uppercase text-foreground drop-shadow-sm">
            VIDRO
          </span>
          <span className="text-[10px] font-black tracking-[0.3em] text-primary-500/80 uppercase">
            AI Video Studio
          </span>
        </div>
      </Link>

      <div className="hidden lg:flex items-center gap-1 bg-glass-hover p-1 rounded-2xl border border-glass-border absolute left-1/2 -translate-x-1/2">
        {navLinks.map((link) => {
          const isActive = pathname === link.href;
          return (
            <Link
              key={link.name}
              href={link.href}
              className={`px-5 py-2 text-[10px] font-black uppercase tracking-[0.1em] transition-all rounded-xl ${
                isActive
                  ? "bg-primary-500 text-white shadow-md shadow-primary-500/20"
                  : "text-muted hover:text-foreground hover:bg-glass-hover"
              }`}
            >
              {link.name}
            </Link>
          );
        })}
      </div>

      <div className="flex items-center gap-3 shrink-0">
        {status === "loading" ? (
          <div className="w-8 h-8 rounded-full border-2 border-primary-500/30 border-t-primary-500 animate-spin" />
        ) : session?.user ? (
          <>
            <div className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-xl bg-glass-hover border border-glass-border text-[11px] font-black text-primary-400">
              <FaCoins />
              {session.user.credits === "admin" ? "UNLIMITED" : session.user.credits}
            </div>
            {session.user.image && (
              <img
                src={session.user.image}
                alt={session.user.name || "User"}
                className="w-9 h-9 rounded-full border border-glass-border"
              />
            )}
            <button
              onClick={() => signOut()}
              className="p-2 text-muted hover:text-foreground transition-colors"
              title="Sign out"
            >
              <FaSignOutAlt />
            </button>
          </>
        ) : (
          <button
            onClick={() => signIn("google")}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary-600 hover:bg-primary-500 text-white font-black text-[11px] uppercase tracking-widest transition-all shadow-lg shadow-primary-500/20"
          >
            <FaGoogle />
            <span className="hidden sm:inline">Sign in</span>
          </button>
        )}

        <button
          className="lg:hidden ml-1 p-2 text-muted hover:text-foreground transition-colors"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        >
          {isMobileMenuOpen ? <FaTimes className="text-xl" /> : <FaBars className="text-xl" />}
        </button>
      </div>

      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute top-20 left-0 right-0 bg-[var(--solid-bg)]/90 backdrop-blur-2xl border-b border-glass-border shadow-2xl flex flex-col lg:hidden z-50 p-4 gap-2"
          >
            {navLinks.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.name}
                  href={link.href}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={`p-4 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${
                    isActive ? "bg-primary-500 text-white shadow-lg" : "text-muted hover:bg-glass-bg"
                  }`}
                >
                  {link.name}
                </Link>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
