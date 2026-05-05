"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

// ── Animated counter ──────────────────────────────────────────────────────────
function Counter({ end, suffix = "", prefix = "" }: { end: number; suffix?: string; prefix?: string }) {
  const [val, setVal] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const started = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !started.current) {
        started.current = true;
        const duration = 1800;
        const steps = 60;
        const inc = end / steps;
        let cur = 0;
        const t = setInterval(() => {
          cur += inc;
          if (cur >= end) { setVal(end); clearInterval(t); }
          else setVal(Math.floor(cur));
        }, duration / steps);
      }
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [end]);

  return <span ref={ref}>{prefix}{val.toLocaleString()}{suffix}</span>;
}

// ── Topics ────────────────────────────────────────────────────────────────────
const TOPICS = [
  "Cardiology", "Pulmonology", "Nephrology", "Neurology",
  "Gastroenterology", "Infectious Disease", "Endocrinology", "Hematology",
  "Rheumatology", "Psychiatry", "OB/GYN", "Pediatrics",
  "Emergency Medicine", "Surgery", "Dermatology", "Ophthalmology",
  "Musculoskeletal", "Toxicology", "Geriatrics", "Oncology",
  "Immunology", "Biostatistics", "Ethics", "Pharmacology",
];

// ── Testimonials ──────────────────────────────────────────────────────────────
const TESTIMONIALS = [
  {
    quote: "I used to dread clinical vignettes. After two weeks with CaseRoom I actually look forward to them. The AI resident explains things like a real attending — not a textbook.",
    name: "M.D. Candidate, Year 3",
    school: "Midwest Medical School",
    accuracy: "Went from 52% → 78% accuracy",
  },
  {
    quote: "The adaptive engine is genuinely scary good. It figured out my cardiology weak spot after 4 cases and kept drilling it until I had it locked in.",
    name: "Step 2 CK Scorer",
    school: "261 on Step 2 CK",
    accuracy: "3-week prep sprint",
  },
  {
    quote: "I've tried every question bank. CaseRoom is the only one where I actually understand WHY the answer is right. The Socratic dialogue changes everything.",
    name: "Resident Physician",
    school: "Internal Medicine PGY-1",
    accuracy: "Recommends to all interns",
  },
];

// ── Feature blocks ────────────────────────────────────────────────────────────
const FEATURES = [
  {
    tag: "Adaptive Learning",
    headline: "Gets harder in exactly the right places.",
    body: "CaseRoom tracks every topic you touch. After 3 attempts at any area, the engine calculates your accuracy and quietly shifts future cases toward whatever you're getting wrong. You never have to manually pick topics — the algorithm does it.",
    bullets: ["Accuracy tracked per topic, not just overall", "Weak topics automatically weighted 3× higher", "Rebalances every session based on new data"],
    visual: (
      <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-3">
        <p className="text-xs text-white/40 font-medium uppercase tracking-widest mb-4">Topic accuracy</p>
        {[
          { topic: "Cardiology", pct: 82, color: "bg-emerald-500" },
          { topic: "Pulmonology", pct: 61, color: "bg-amber-400" },
          { topic: "Nephrology", pct: 38, color: "bg-rose-400" },
          { topic: "Neurology", pct: 55, color: "bg-amber-400" },
        ].map(({ topic, pct, color }) => (
          <div key={topic}>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-white/60">{topic}</span>
              <span className="text-white/40">{pct}%</span>
            </div>
            <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
              <div className={`${color} h-full rounded-full`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        ))}
        <div className="mt-4 px-3 py-2 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-300">
          🎯 Next 4 cases weighted toward Nephrology
        </div>
      </div>
    ),
  },
  {
    tag: "Socratic Dialogue",
    headline: "An AI resident who actually teaches.",
    body: "After every case, ask anything. Your AI resident classifies what kind of question you're asking — clarification, misconception, confirmation — and responds differently for each. It ends with a follow-up question to push your thinking one level deeper.",
    bullets: ["Intent-aware responses (not generic answers)", "Corrects misconceptions directly and kindly", "Always ends with a Socratic probe"],
    visual: (
      <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-3">
        <p className="text-xs text-white/40 font-medium uppercase tracking-widest mb-3">Ask your resident</p>
        <div className="space-y-2">
          <div className="flex justify-end">
            <div className="bg-brand-600 text-white text-xs px-3 py-2 rounded-2xl rounded-br-sm max-w-[80%]">
              Why not aortic dissection here?
            </div>
          </div>
          <div className="flex gap-2">
            <div className="w-6 h-6 rounded-full bg-brand-900 flex items-center justify-center text-xs font-bold text-brand-400 shrink-0">R</div>
            <div className="bg-white/8 text-white/70 text-xs px-3 py-2 rounded-2xl rounded-bl-sm max-w-[85%] leading-relaxed">
              Good question — aortic dissection was a smart distractor. The key finding ruling it out is the ST elevation in II, III, aVF with reciprocal changes in I, aVL. Dissection rarely causes isolated inferior ST changes...
            </div>
          </div>
          <div className="flex gap-2">
            <div className="w-6 h-6 rounded-full bg-brand-900 flex items-center justify-center text-xs font-bold text-brand-400 shrink-0">R</div>
            <div className="bg-amber-500/10 border border-amber-500/20 text-amber-200 text-xs px-3 py-2 rounded-2xl max-w-[85%]">
              Now — what ECG finding would make you more worried about a right ventricular infarct here?
            </div>
          </div>
        </div>
      </div>
    ),
  },
];

// ── How it works steps ────────────────────────────────────────────────────────
const STEPS = [
  {
    n: "01",
    icon: "🏥",
    title: "Get a clinical case",
    body: "A fully AI-generated patient — complete with vitals, history, physical exam, labs, and sometimes real chest X-rays from the NIH dataset.",
  },
  {
    n: "02",
    icon: "🧠",
    title: "Answer & understand why",
    body: "Select your answer. Your AI resident then explains every option — right and wrong — using the specific findings from that case.",
  },
  {
    n: "03",
    icon: "📈",
    title: "Watch the algorithm adapt",
    body: "CaseRoom logs your accuracy per topic. The next case is weighted toward your weakest area. No manual setup. It just works.",
  },
];

export default function LandingPage() {
  const [activeTestimonial, setActiveTestimonial] = useState(0);

  return (
    <div className="min-h-screen bg-[#080f1e] text-white overflow-x-hidden">

      {/* ── Nav ── */}
      <nav className="sticky top-0 z-30 border-b border-white/5 bg-[#080f1e]/90 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-brand-600 rounded-xl flex items-center justify-center shadow-lg shadow-brand-900/40">
              <span className="font-bold text-sm text-white">CR</span>
            </div>
            <span className="font-bold text-lg tracking-tight">CaseRoom</span>
          </div>
          <div className="hidden sm:flex items-center gap-6 text-sm text-white/50">
            <a href="#features" className="hover:text-white transition-colors">Features</a>
            <a href="#how-it-works" className="hover:text-white transition-colors">How it works</a>
            <Link href="/pricing" className="hover:text-white transition-colors">Pricing</Link>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/auth" className="text-sm text-white/50 hover:text-white transition-colors hidden sm:block">
              Sign in
            </Link>
            <Link
              href="/auth"
              className="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white font-semibold text-sm rounded-xl transition-all shadow-md shadow-brand-900/40 hover:shadow-lg"
            >
              Start free →
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="relative max-w-5xl mx-auto px-6 pt-20 pb-16 text-center">
        {/* Glow */}
        <div className="absolute inset-0 pointer-events-none -z-10 flex justify-center">
          <div className="w-[700px] h-[400px] bg-brand-600/8 rounded-full blur-3xl mt-10" />
        </div>

        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-brand-900/50 border border-brand-700/40 text-brand-300 text-xs font-semibold uppercase tracking-wider mb-8">
          <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-pulse-soft" />
          USMLE Step 2 CK · LangGraph Pipeline · RAG · Adaptive
        </div>

        <h1 className="text-5xl sm:text-6xl font-extrabold leading-[1.08] tracking-tight text-balance">
          The clinical case bank
          <br />
          <span className="bg-gradient-to-r from-brand-300 via-brand-400 to-brand-500 bg-clip-text text-transparent">
            that learns with you.
          </span>
        </h1>

        <p className="mt-6 text-lg text-white/45 max-w-2xl mx-auto leading-relaxed">
          Infinite AI-generated vignettes. An AI resident who explains every decision.
          A smart engine that adapts to your weak spots — automatically, every session.
        </p>

        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/auth"
            className="px-8 py-4 bg-brand-600 hover:bg-brand-500 text-white font-bold rounded-2xl text-base transition-all shadow-xl shadow-brand-900/50 hover:shadow-2xl hover:-translate-y-0.5 duration-200"
          >
            Start studying — free
          </Link>
          <Link
            href="/pricing"
            className="px-8 py-4 bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 hover:text-white font-semibold rounded-2xl text-base transition-all duration-200"
          >
            See pricing
          </Link>
        </div>

        <p className="mt-5 text-xs text-white/25">No credit card required · 10 free cases per day · Cancel anytime</p>

        {/* ── Stats bar ── */}
        <div className="mt-16 grid grid-cols-2 sm:grid-cols-4 gap-px bg-white/5 rounded-2xl overflow-hidden border border-white/5">
          {[
            { value: 30, suffix: "+", label: "Topics covered" },
            { value: 8, suffix: " nodes", label: "AI pipeline depth" },
            { value: 500, suffix: "k", label: "Token budget/day" },
            { value: 15, suffix: "s", label: "Avg case generation" },
          ].map(({ value, suffix, label }) => (
            <div key={label} className="bg-white/[0.02] px-6 py-5">
              <p className="text-2xl font-extrabold text-white">
                <Counter end={value} suffix={suffix} />
              </p>
              <p className="text-xs text-white/35 mt-1">{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Sample case ── */}
      <section className="max-w-4xl mx-auto px-6 pb-20">
        <div className="relative bg-white/[0.03] border border-white/8 rounded-3xl p-1">
          <div className="absolute -top-3 left-6">
            <span className="bg-brand-600 text-white text-xs font-bold px-3 py-1 rounded-full">Live example</span>
          </div>
          <div className="rounded-[20px] overflow-hidden bg-[#0d1a2d]">
            {/* Case header */}
            <div className="px-6 pt-6 pb-4 border-b border-white/5 flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-bold text-white">47-year-old male, smoker, hypertensive</p>
                <p className="text-xs text-white/50 mt-1">Chief complaint: Crushing substernal chest pain × 45 min, radiating to left arm. Diaphoretic.</p>
              </div>
              <div className="flex gap-1.5 shrink-0">
                <span className="badge bg-brand-900/60 text-brand-300 border border-brand-700/30 text-xs">Cardiology</span>
                <span className="badge bg-white/5 text-white/40 text-xs">Inferior STEMI</span>
              </div>
            </div>
            {/* Vitals */}
            <div className="px-6 py-3 flex gap-4 flex-wrap border-b border-white/5">
              {[["BP", "158/96"], ["HR", "102 bpm"], ["O₂", "94%"], ["RR", "22/min"], ["Temp", "98.6°F"]].map(([k, v]) => (
                <div key={k} className="text-center">
                  <p className="text-xs text-white/30 font-medium uppercase tracking-wider">{k}</p>
                  <p className="text-sm font-bold text-white mt-0.5">{v}</p>
                </div>
              ))}
            </div>
            {/* Question */}
            <div className="px-6 py-4">
              <p className="text-xs text-white/35 font-semibold uppercase tracking-wider mb-2">Question</p>
              <p className="text-sm font-semibold text-white leading-snug">
                ECG shows ST elevation in leads II, III, and aVF. What is the most appropriate immediate next step?
              </p>
              <div className="mt-3 space-y-2">
                {[
                  { l: "A", t: "Obtain troponin and repeat ECG in 6 hours", correct: false },
                  { l: "B", t: "Emergent percutaneous coronary intervention", correct: true },
                  { l: "C", t: "IV heparin and aspirin, admit for monitoring", correct: false },
                  { l: "D", t: "CT angiography to rule out aortic dissection", correct: false },
                ].map(({ l, t, correct }) => (
                  <div
                    key={l}
                    className={[
                      "flex items-center gap-3 px-4 py-2.5 rounded-xl border text-xs transition-all",
                      correct
                        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                        : "border-white/5 bg-white/[0.02] text-white/45",
                    ].join(" ")}
                  >
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${correct ? "bg-emerald-500 text-white" : "bg-white/10 text-white/40"}`}>{correct ? "✓" : l}</span>
                    {t}
                  </div>
                ))}
              </div>
            </div>
            <div className="px-6 pb-5">
              <Link href="/auth" className="inline-flex items-center gap-2 text-sm font-semibold text-brand-400 hover:text-brand-300 transition-colors">
                Answer your own case → <span className="text-xs">Sign up free</span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" className="max-w-6xl mx-auto px-6 py-20">
        <div className="text-center mb-16">
          <p className="section-label text-brand-400 mb-3">Built for the way doctors actually learn</p>
          <h2 className="text-3xl font-extrabold text-white tracking-tight">
            Every feature has a reason.
          </h2>
        </div>

        <div className="space-y-24">
          {FEATURES.map((f, i) => (
            <div
              key={f.tag}
              className={`grid grid-cols-1 lg:grid-cols-2 gap-12 items-center ${i % 2 === 1 ? "lg:flex lg:flex-row-reverse" : ""}`}
            >
              <div className="space-y-5">
                <span className="inline-block text-xs font-bold text-brand-400 uppercase tracking-widest border border-brand-700/40 bg-brand-900/40 px-3 py-1 rounded-full">
                  {f.tag}
                </span>
                <h3 className="text-2xl font-extrabold text-white leading-tight">{f.headline}</h3>
                <p className="text-white/50 leading-relaxed">{f.body}</p>
                <ul className="space-y-2">
                  {f.bullets.map((b) => (
                    <li key={b} className="flex items-start gap-2.5 text-sm text-white/60">
                      <span className="text-brand-400 mt-0.5 shrink-0">✓</span>
                      {b}
                    </li>
                  ))}
                </ul>
              </div>
              <div>{f.visual}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Topic coverage ── */}
      <section className="max-w-4xl mx-auto px-6 py-20">
        <div className="text-center mb-10">
          <p className="section-label text-brand-400 mb-3">USMLE Step 2 CK Coverage</p>
          <h2 className="text-3xl font-extrabold text-white mb-3">Every high-yield domain.</h2>
          <p className="text-white/40 text-sm mb-5">All major specialties — cases weighted to your weak spots automatically.</p>
          <div className="flex flex-wrap justify-center gap-2">
            {TOPICS.map((t) => (
              <span
                key={t}
                className="px-3 py-1.5 bg-white/[0.04] hover:bg-white/[0.08] border border-white/8 hover:border-white/15 rounded-full text-sm text-white/55 hover:text-white/80 transition-all cursor-default"
              >
                {t}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section id="how-it-works" className="max-w-5xl mx-auto px-6 py-20">
        <div className="text-center mb-14">
          <p className="section-label text-brand-400 mb-3">The loop</p>
          <h2 className="text-3xl font-extrabold text-white">How CaseRoom works</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {STEPS.map((s, i) => (
            <div key={s.n} className="relative bg-white/[0.02] border border-white/8 rounded-2xl p-6 group hover:border-white/15 transition-all">
              {i < STEPS.length - 1 && (
                <div className="hidden sm:block absolute top-8 -right-3 text-white/20 text-lg z-10">→</div>
              )}
              <div className="text-3xl mb-4">{s.icon}</div>
              <p className="text-xs text-white/25 font-mono mb-2">{s.n}</p>
              <h3 className="font-bold text-white mb-2">{s.title}</h3>
              <p className="text-sm text-white/45 leading-relaxed">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Testimonials ── */}
      <section className="max-w-4xl mx-auto px-6 py-20">
        <div className="text-center mb-10">
          <p className="section-label text-brand-400 mb-3">Results</p>
          <h2 className="text-3xl font-extrabold text-white">What students say</h2>
        </div>

        <div className="relative">
          <div className="bg-white/[0.02] border border-white/8 rounded-3xl p-8 min-h-[180px]">
            <p className="text-lg text-white/70 leading-relaxed italic mb-6">
              &ldquo;{TESTIMONIALS[activeTestimonial].quote}&rdquo;
            </p>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-white">{TESTIMONIALS[activeTestimonial].name}</p>
                <p className="text-xs text-white/40">{TESTIMONIALS[activeTestimonial].school}</p>
              </div>
              <span className="text-xs text-brand-400 font-semibold border border-brand-700/40 bg-brand-900/30 px-3 py-1 rounded-full">
                {TESTIMONIALS[activeTestimonial].accuracy}
              </span>
            </div>
          </div>

          <div className="flex justify-center gap-2 mt-5">
            {TESTIMONIALS.map((_, i) => (
              <button
                key={i}
                onClick={() => setActiveTestimonial(i)}
                className={`w-2 h-2 rounded-full transition-all duration-200 ${i === activeTestimonial ? "bg-brand-500 w-6" : "bg-white/20 hover:bg-white/40"}`}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing teaser ── */}
      <section className="max-w-3xl mx-auto px-6 py-20">
        <div className="bg-gradient-to-b from-brand-900/30 to-transparent border border-brand-700/20 rounded-3xl p-10 text-center">
          <p className="section-label text-brand-400 mb-4">Pricing</p>
          <h2 className="text-3xl font-extrabold text-white mb-3">Free to start. $15 to go unlimited.</h2>
          <p className="text-white/45 mb-8 max-w-lg mx-auto">
            10 adaptive cases per day, free forever. Upgrade to Pro for unlimited daily cases and priority generation.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/auth" className="px-8 py-3.5 bg-brand-600 hover:bg-brand-500 text-white font-bold rounded-2xl text-sm transition-all shadow-lg shadow-brand-900/40 hover:-translate-y-0.5 duration-200">
              Start free — 10 cases/day
            </Link>
            <Link href="/pricing" className="px-8 py-3.5 border border-white/10 hover:border-white/20 text-white/60 hover:text-white font-semibold rounded-2xl text-sm transition-all">
              Compare plans →
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-white/5 py-10">
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-brand-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-xs">CR</span>
            </div>
            <span className="text-sm text-white/30 font-medium">CaseRoom</span>
          </div>
          <p className="text-xs text-white/20 text-center">
            For educational use only · Not a substitute for clinical judgment · © 2025 CaseRoom
          </p>
          <div className="flex gap-5 text-xs text-white/30">
            <Link href="/pricing" className="hover:text-white/60 transition-colors">Pricing</Link>
            <Link href="/auth" className="hover:text-white/60 transition-colors">Sign in</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
