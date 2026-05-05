"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { createCheckoutSession } from "@/lib/api";
import Nav from "@/components/Nav";

const FREE_FEATURES = [
  "10 adaptive cases per day",
  "Performance dashboard",
  "Socratic AI dialogue",
  "Real NIH imaging",
  "Topic-based adaptation",
];

const PRO_FEATURES = [
  "Unlimited cases daily",
  "Everything in Free",
  "Priority case generation",
  "Cancel anytime",
];

const FAQS = [
  {
    q: "How is this different from question banks?",
    a: "CaseRoom generates new cases on the fly using real medical literature — you'll never see a repeated question. It also adapts in real-time to your weaknesses and lets you have a dialogue with your AI resident after every case.",
  },
  {
    q: "Is this a replacement for UWorld?",
    a: "No — think of it as a complement. Use UWorld for curated board-style questions. Use CaseRoom for infinite adaptive practice and deeper clinical reasoning between study sessions.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. Cancel from your Stripe billing portal at any time. You keep Pro access until the end of your billing period.",
  },
];

export default function PricingPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  async function handleUpgrade() {
    if (!user) { router.push("/auth"); return; }
    setLoading(true);
    try {
      const url = await createCheckoutSession(user.id, user.email ?? "");
      window.location.href = url;
    } catch {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Nav />

      <main className="max-w-4xl mx-auto px-4 py-16 space-y-20">
        {/* Header */}
        <div className="text-center space-y-3 animate-fade-in">
          <p className="section-label">Pricing</p>
          <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight">
            Start free. Go unlimited when ready.
          </h1>
          <p className="text-slate-500 max-w-md mx-auto">
            10 adaptive cases per day, free forever. Upgrade to remove all limits.
          </p>
        </div>

        {/* Plans */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-2xl mx-auto animate-slide-up">
          {/* Free */}
          <div className="card p-7 flex flex-col">
            <div className="space-y-1 mb-6">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Free</p>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-extrabold text-slate-900">$0</span>
                <span className="text-slate-400 text-sm">/ forever</span>
              </div>
            </div>
            <ul className="space-y-3 flex-1 mb-7">
              {FREE_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-sm text-slate-600">
                  <span className="text-emerald-500 mt-px shrink-0">✓</span>
                  {f}
                </li>
              ))}
            </ul>
            <Link
              href={user ? "/study" : "/auth"}
              className="btn-secondary text-center block"
            >
              {user ? "Continue studying" : "Get started free"}
            </Link>
          </div>

          {/* Pro */}
          <div className="relative card p-7 flex flex-col border-2 border-brand-500 bg-gradient-to-b from-brand-50/50 to-white">
            <div className="absolute -top-4 left-1/2 -translate-x-1/2">
              <span className="bg-brand-600 text-white text-xs font-bold px-4 py-1.5 rounded-full shadow-md shadow-brand-200">
                MOST POPULAR
              </span>
            </div>
            <div className="space-y-1 mb-6">
              <p className="text-xs font-bold text-brand-600 uppercase tracking-widest">Pro</p>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-extrabold text-slate-900">$15</span>
                <span className="text-slate-400 text-sm">/ month</span>
              </div>
            </div>
            <ul className="space-y-3 flex-1 mb-7">
              {PRO_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-sm text-slate-700 font-medium">
                  <span className="text-brand-500 mt-px shrink-0">✓</span>
                  {f}
                </li>
              ))}
            </ul>
            <button
              onClick={handleUpgrade}
              disabled={loading}
              className="btn-primary w-full text-center py-3"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Redirecting...
                </span>
              ) : user ? "Upgrade to Pro" : "Start with Pro"}
            </button>
          </div>
        </div>

        {/* Trust signals */}
        <div className="flex flex-wrap items-center justify-center gap-8 text-sm text-slate-400 animate-fade-in">
          {[
            { icon: "🔒", text: "Secure checkout via Stripe" },
            { icon: "↩", text: "Cancel anytime, no questions" },
            { icon: "📧", text: "Support via email" },
          ].map(({ icon, text }) => (
            <div key={text} className="flex items-center gap-2">
              <span>{icon}</span>
              <span>{text}</span>
            </div>
          ))}
        </div>

        {/* FAQ */}
        <div className="max-w-2xl mx-auto space-y-3 animate-slide-up">
          <p className="section-label text-center mb-6">Frequently asked</p>
          {FAQS.map((faq, i) => (
            <div key={i} className="card overflow-hidden">
              <button
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                className="w-full px-6 py-4 text-left flex items-center justify-between gap-4 hover:bg-slate-50 transition-colors"
              >
                <span className="text-sm font-semibold text-slate-800">{faq.q}</span>
                <span className={`text-slate-400 transition-transform duration-200 shrink-0 ${openFaq === i ? "rotate-45" : ""}`}>
                  +
                </span>
              </button>
              {openFaq === i && (
                <div className="px-6 pb-5 animate-slide-up">
                  <p className="text-sm text-slate-500 leading-relaxed">{faq.a}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </main>

      <footer className="border-t border-slate-100 py-8 mt-12">
        <p className="text-center text-xs text-slate-400">
          © 2025 CaseRoom · For educational use only · Not a substitute for clinical judgment
        </p>
      </footer>
    </div>
  );
}
