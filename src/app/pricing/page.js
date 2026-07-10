"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { FaBolt, FaCoins, FaCheck, FaStar } from "react-icons/fa";
import { useRouter } from "next/navigation";

export default function PricingPage() {
  const router = useRouter();
  const [loadingTier, setLoadingTier] = useState(null);

  const tiers = [
    {
      name: "Starter",
      credits: 3000,
      price: 15,
      description: "For exploring what Vidro can do.",
      features: [
        "1k – 4k resolution",
        "Full aspect ratio control",
        "Permanent storage",
        "Basic support",
      ],
      highlight: false,
    },
    {
      name: "Power Engine",
      credits: 7000,
      price: 35,
      description: "For creators shipping ads every week.",
      features: [
        "Priority generation queue",
        "Google smart search",
        "Early feature access",
        "Priority support",
      ],
      highlight: true,
    },
    {
      name: "Quantum Flow",
      credits: 24000,
      price: 120,
      description: "For agencies running video at scale.",
      features: [
        "Uncapped resolution",
        "Bulk generation",
        "Direct API access",
        "24/7 concierge support",
      ],
      highlight: false,
    },
  ];

  const maxCredits = Math.max(...tiers.map((t) => t.credits));

  const handleCheckout = async (price, credits, tierName) => {
    try {
      setLoadingTier(tierName);
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ price, credits }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch (err) {
      console.error("Stripe error", err);
    } finally {
      setLoadingTier(null);
    }
  };

  return (
    <div className="flex-1 bg-transparent overflow-y-auto custom-scrollbar px-6 md:px-16 py-14">
      <header className="max-w-6xl mx-auto mb-14 text-center space-y-5">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary-500/10 border border-primary-500/20 text-primary-400 text-[10px] font-semibold tracking-[0.3em] uppercase">
          Pricing
        </div>
        <h1 className="text-4xl md:text-[3.25rem] font-bold tracking-tight leading-[1.05] text-foreground">
          Credits that scale with
          <br className="hidden md:block" /> how much you ship.
        </h1>
        <p className="text-muted text-base max-w-lg mx-auto leading-relaxed">
          Every plan renews monthly. Unused credits roll over as long as your subscription is active.
        </p>
      </header>

      <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6 pb-16 items-stretch">
        {tiers.map((tier, index) => (
          <motion.div
            key={tier.name}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.08, duration: 0.4 }}
            className={`relative rounded-2xl border flex flex-col ${
              tier.highlight
                ? "p-8 bg-gradient-to-b from-primary-500/[0.12] to-glass-bg border-primary-500/60 shadow-[0_0_0_1px_rgba(139,92,246,0.15),0_20px_50px_-15px_rgba(139,92,246,0.35)] md:-translate-y-3"
                : "p-8 bg-glass-bg border-glass-border"
            }`}
          >
            {tier.highlight && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3.5 py-1 bg-primary-500 rounded-full text-[10px] font-semibold uppercase tracking-widest text-white shadow-lg shadow-primary-500/30">
                Most popular
              </div>
            )}

            <div className="mb-6">
              <h3 className="text-xl font-semibold text-foreground mb-1.5">
                {tier.name}
              </h3>
              <p className="text-sm text-muted leading-relaxed">
                {tier.description}
              </p>
            </div>

            <div className="mb-6 flex items-baseline gap-1.5">
              <span className="text-5xl font-bold tracking-tight text-foreground">
                ${tier.price}
              </span>
              <span className="text-sm text-muted">/ month</span>
            </div>

            <div className="mb-7">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <FaCoins className="text-amber-400 text-sm" />
                  <span className="text-sm font-semibold text-foreground">
                    {tier.credits.toLocaleString()} credits
                  </span>
                </div>
              </div>
              <div className="h-1.5 w-full rounded-full bg-white/[0.06] overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-primary-500 to-pink-400"
                  style={{ width: `${(tier.credits / maxCredits) * 100}%` }}
                />
              </div>
            </div>

            <ul className="space-y-3 mb-8 flex-1">
              {tier.features.map((feat) => (
                <li
                  key={feat}
                  className="flex items-start gap-2.5 text-sm text-text-2"
                >
                  <FaCheck className="text-primary-400 shrink-0 mt-0.5 text-[11px]" />
                  <span>{feat}</span>
                </li>
              ))}
            </ul>

            <button
              onClick={() => handleCheckout(tier.price, tier.credits, tier.name)}
              disabled={loadingTier === tier.name}
              className={`w-full h-12 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-40 ${
                tier.highlight
                  ? "bg-primary-500 text-white hover:bg-primary-400 shadow-lg shadow-primary-500/25"
                  : "bg-white/[0.04] text-foreground border border-glass-border hover:bg-white/[0.08]"
              }`}
            >
              {loadingTier === tier.name ? (
                <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  Get {tier.name} <FaBolt className="text-[11px] opacity-70" />
                </>
              )}
            </button>
          </motion.div>
        ))}
      </div>

      <footer className="max-w-6xl mx-auto pt-10 border-t border-glass-border flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3 text-sm">
          <span className="text-muted">Currently holding</span>
          <span className="text-foreground font-semibold">1,000 credits</span>
        </div>
        <div className="flex items-center gap-2 text-muted text-xs">
          <FaStar className="text-amber-400/60 text-[10px]" />
          Payments secured by Stripe
        </div>
      </footer>

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 0px;
        }
        .custom-scrollbar {
          scrollbar-width: none;
        }
      `}</style>
    </div>
  );
}
