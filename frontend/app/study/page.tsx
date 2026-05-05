"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Case, Feedback, PlanInfo,
  generateCase, submitAnswer, warmup, getPlanInfo,
} from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { EXAM_SHORT, QUICK_TOPICS } from "@/lib/examConfig";
import { useStreak } from "@/lib/useStreak";
import Nav from "@/components/Nav";
import CaseDisplay from "@/components/CaseDisplay";
import AnswerOptions from "@/components/AnswerOptions";
import FeedbackPanel from "@/components/FeedbackPanel";
import Link from "next/link";

type Phase = "idle" | "loading" | "answering" | "feedback" | "error";

// ── Session progress bar ─────────────────────────────────────────────────────

function SessionProgress({
  streak, casesToday, sessionCorrect, sessionTotal,
}: {
  streak: number; casesToday: number; sessionCorrect: number; sessionTotal: number;
}) {
  const accuracy = sessionTotal > 0 ? Math.round((sessionCorrect / sessionTotal) * 100) : null;
  const accColor = accuracy === null ? "" : accuracy >= 70 ? "text-emerald-600" : accuracy >= 50 ? "text-amber-500" : "text-rose-500";

  return (
    <div className="sticky top-0 z-20 bg-white/80 backdrop-blur-md border-b border-slate-100 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 py-2 flex items-center gap-5 flex-wrap">
        {streak > 0 && (
          <div className="flex items-center gap-1.5 bg-orange-50 border border-orange-100 rounded-full px-3 py-1">
            <span className="text-sm">🔥</span>
            <span className="text-xs font-bold text-orange-700">{streak}-day streak</span>
          </div>
        )}
        <div className="flex items-center gap-1.5 text-xs text-slate-500">
          <span className="font-bold text-slate-700">{casesToday}</span>
          <span>cases today</span>
        </div>
        {accuracy !== null && (
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <span>Session:</span>
            <span className={`font-bold ${accColor}`}>{accuracy}%</span>
          </div>
        )}
        {sessionTotal > 0 && (
          <div className="flex items-center gap-1 ml-auto">
            {Array.from({ length: Math.min(sessionTotal, 10) }).map((_, i) => (
              <div
                key={i}
                title={i < sessionCorrect ? "Correct" : "Incorrect"}
                className={`w-2.5 h-2.5 rounded-full transition-all ${
                  i < sessionCorrect ? "bg-emerald-400" : "bg-rose-400"
                }`}
              />
            ))}
            {sessionTotal > 10 && (
              <span className="text-xs text-slate-400 ml-1">+{sessionTotal - 10}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Idle screen ──────────────────────────────────────────────────────────────

function IdleScreen({
  onStart, planInfo, streak, sessionCorrect, sessionTotal,
}: {
  onStart: (topic?: string) => void;
  planInfo: PlanInfo | null;
  streak: number;
  sessionCorrect: number;
  sessionTotal: number;
}) {
  const sessionAccuracy = sessionTotal > 0 ? Math.round((sessionCorrect / sessionTotal) * 100) : null;

  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center gap-10 py-16 px-4 animate-fade-in">
      {/* Hero */}
      <div className="text-center space-y-5 max-w-md">
        <div className="relative mx-auto w-24 h-24">
          <div className="absolute inset-0 rounded-full bg-brand-400/20 animate-ping" style={{ animationDuration: "2.5s" }} />
          <div className="absolute inset-2 rounded-full bg-brand-400/10 animate-ping" style={{ animationDuration: "2s", animationDelay: "0.3s" }} />
          <div className="relative w-24 h-24 rounded-full bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow-2xl shadow-brand-300/40">
            <span className="text-4xl select-none">🏥</span>
          </div>
        </div>
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">
            {sessionTotal > 0 ? "Keep going?" : "Ready to practice?"}
          </h1>
          <p className="text-slate-500 mt-2 leading-relaxed">
            {sessionTotal > 0
              ? `${sessionTotal} case${sessionTotal > 1 ? "s" : ""} done this session. Each one adapts to your gaps.`
              : `AI-generated ${EXAM_SHORT} cases that adapt to what you get wrong.`}
          </p>
        </div>
      </div>

      {/* Session recap chips */}
      {sessionTotal > 0 && (
        <div className="flex items-center gap-3 animate-scale-in">
          <div className="flex flex-col items-center px-5 py-3 bg-white rounded-2xl border border-slate-100 shadow-sm">
            <span className="text-2xl font-extrabold text-slate-900">{sessionTotal}</span>
            <span className="text-xs text-slate-400 mt-0.5">Cases</span>
          </div>
          {sessionAccuracy !== null && (
            <div className={`flex flex-col items-center px-5 py-3 rounded-2xl border shadow-sm ${
              sessionAccuracy >= 70 ? "bg-emerald-50 border-emerald-100" :
              sessionAccuracy >= 50 ? "bg-amber-50 border-amber-100" :
              "bg-rose-50 border-rose-100"
            }`}>
              <span className={`text-2xl font-extrabold ${
                sessionAccuracy >= 70 ? "text-emerald-700" :
                sessionAccuracy >= 50 ? "text-amber-700" :
                "text-rose-600"
              }`}>{sessionAccuracy}%</span>
              <span className="text-xs text-slate-400 mt-0.5">Accuracy</span>
            </div>
          )}
          {streak > 0 && (
            <div className="flex flex-col items-center px-5 py-3 bg-orange-50 border border-orange-100 rounded-2xl shadow-sm">
              <span className="text-2xl font-extrabold text-orange-500">🔥 {streak}</span>
              <span className="text-xs text-slate-400 mt-0.5">Day streak</span>
            </div>
          )}
        </div>
      )}

      {/* CTA */}
      <div className="space-y-3 text-center w-full max-w-xs">
        <button
          onClick={() => onStart()}
          className="w-full py-4 text-base font-bold rounded-2xl bg-brand-600 hover:bg-brand-700 active:scale-[0.98] text-white shadow-xl shadow-brand-200 transition-all duration-200"
        >
          {sessionTotal > 0 ? "Next Case →" : "Start a Case →"}
        </button>
        {planInfo?.plan === "free" && (
          <p className="text-xs text-slate-400">
            {planInfo.cases_remaining} of 10 free cases left today ·{" "}
            <Link href="/pricing" className="text-brand-600 hover:underline font-medium">Upgrade for unlimited</Link>
          </p>
        )}
      </div>

      {/* Quick topic shortcuts */}
      <div className="w-full max-w-sm space-y-2">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest text-center">Quick practice</p>
        <div className="grid grid-cols-3 gap-2">
          {QUICK_TOPICS.map((t) => (
            <button
              key={t.label}
              onClick={() => onStart(t.label)}
              className="flex flex-col items-center gap-1.5 p-3 bg-white hover:bg-brand-50 border border-slate-100 hover:border-brand-200 rounded-2xl transition-all duration-150 group shadow-sm hover:shadow"
            >
              <span className="text-xl">{t.icon}</span>
              <span className="text-[10px] font-semibold text-slate-500 group-hover:text-brand-700 text-center leading-tight">{t.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Loading skeleton (2-col) ─────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="animate-fade-in">
      <div className="mb-4 flex items-center justify-between">
        <div className="skeleton h-4 w-20 rounded-full" />
        <div className="skeleton h-6 w-28 rounded-full" />
      </div>
      <div className="lg:grid lg:grid-cols-[1fr_400px] lg:gap-6 space-y-4 lg:space-y-0">
        {/* Left skeleton */}
        <div className="space-y-4">
          <div className="card p-6 space-y-3">
            <div className="flex justify-between items-start gap-4">
              <div className="space-y-2 flex-1">
                <div className="skeleton h-5 w-48 rounded-lg" />
                <div className="skeleton h-4 w-72 rounded-lg" />
              </div>
              <div className="flex gap-2">
                <div className="skeleton h-6 w-20 rounded-full" />
                <div className="skeleton h-6 w-24 rounded-full" />
              </div>
            </div>
          </div>
          <div className="card p-5">
            <div className="skeleton h-4 w-24 rounded mb-4" />
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {[...Array(5)].map((_, i) => <div key={i} className="skeleton h-16 rounded-xl" />)}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="card p-5 space-y-2.5">
                <div className="skeleton h-4 w-36 rounded" />
                {[...Array(4)].map((_, j) => <div key={j} className="skeleton h-3 rounded" style={{ width: `${75 + Math.random() * 25}%` }} />)}
              </div>
            ))}
          </div>
        </div>
        {/* Right skeleton */}
        <div className="card p-6 space-y-4">
          <div className="skeleton h-4 w-20 rounded" />
          <div className="space-y-2">
            <div className="skeleton h-4 w-full rounded" />
            <div className="skeleton h-4 w-5/6 rounded" />
          </div>
          <div className="space-y-2.5 pt-2">
            {[...Array(4)].map((_, i) => <div key={i} className="skeleton h-14 rounded-xl" />)}
          </div>
          <div className="skeleton h-12 rounded-xl" />
        </div>
      </div>
      <p className="text-center text-xs text-slate-400 animate-pulse-soft pt-4">
        Generating your case&hellip;
      </p>
    </div>
  );
}

// ── Error screen ─────────────────────────────────────────────────────────────

function ErrorScreen({ error, onRetry }: { error: string; onRetry: () => void }) {
  const isLimit = error.includes("Daily case limit");
  return (
    <div className="flex flex-col items-center justify-center min-h-[65vh] gap-6 text-center animate-fade-in px-4">
      <div className={`w-20 h-20 rounded-3xl flex items-center justify-center text-4xl shadow-inner ${isLimit ? "bg-amber-50" : "bg-rose-50"}`}>
        {isLimit ? "🚫" : "⚠️"}
      </div>
      <div className="space-y-2">
        <p className="font-bold text-xl text-slate-900">
          {isLimit ? "Daily limit reached" : "Something went wrong"}
        </p>
        <p className="text-sm text-slate-500 max-w-sm leading-relaxed">{error}</p>
      </div>
      {isLimit ? (
        <div className="space-y-3">
          <Link href="/pricing" className="block btn-primary px-10 py-3.5 text-base rounded-2xl">
            Upgrade to Pro — Unlimited Cases
          </Link>
          <p className="text-xs text-slate-400">Or come back tomorrow — resets at midnight</p>
        </div>
      ) : (
        <button onClick={() => onRetry()} className="btn-primary px-8 py-3 rounded-2xl">Try Again</button>
      )}
    </div>
  );
}

// ── Case header ──────────────────────────────────────────────────────────────

const DIFFICULTY_STYLES = {
  easy:   "bg-emerald-50 text-emerald-700 border-emerald-100",
  medium: "bg-amber-50 text-amber-700 border-amber-100",
  hard:   "bg-rose-50 text-rose-700 border-rose-100",
};

function CaseHeader({ topic, subtopic, caseNum, difficulty }: {
  topic: string; subtopic: string; caseNum: number; difficulty?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 animate-fade-in mb-1">
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold text-slate-300 uppercase tracking-widest">Case {caseNum}</span>
        <span className="text-slate-200">·</span>
        <span className="text-xs font-semibold text-slate-400">{subtopic}</span>
      </div>
      <div className="flex items-center gap-2">
        {difficulty && (
          <span className={`badge border text-xs font-bold uppercase ${DIFFICULTY_STYLES[difficulty as keyof typeof DIFFICULTY_STYLES] ?? ""}`}>
            {difficulty}
          </span>
        )}
        <span className="badge bg-brand-50 text-brand-700 border border-brand-100">{topic}</span>
      </div>
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

function StudyContent() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const justUpgraded = searchParams.get("upgraded") === "true";
  const { streak, casesToday, recordCase } = useStreak();

  const [phase, setPhase] = useState<Phase>("idle");
  const [currentCase, setCurrentCase] = useState<Case | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sessionCorrect, setSessionCorrect] = useState(0);
  const [sessionTotal, setSessionTotal] = useState(0);
  const [planInfo, setPlanInfo] = useState<PlanInfo | null>(null);
  const [showUpgradeBanner, setShowUpgradeBanner] = useState(justUpgraded);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/auth");
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!user) return;
    warmup(user.id);
    getPlanInfo(user.id).then(setPlanInfo).catch(() => {});
  }, [user]);

  const loadNewCase = useCallback(async (topic?: string) => {
    if (!user) return;
    setPhase("loading");
    setCurrentCase(null);
    setSelected(null);
    setFeedback(null);
    setError("");
    try {
      const c = await generateCase(user.id, topic);
      setCurrentCase(c);
      setPhase("answering");
      getPlanInfo(user.id).then(setPlanInfo).catch(() => {});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate case");
      setPhase("error");
    }
  }, [user]);

  async function handleSubmit() {
    if (!selected || !currentCase || !user) return;
    setSubmitting(true);
    try {
      const fb = await submitAnswer(currentCase.id, user.id, selected);
      setFeedback(fb);
      setPhase("feedback");
      setSessionTotal((n) => n + 1);
      if (fb.is_correct) setSessionCorrect((n) => n + 1);
      recordCase();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit answer");
      setPhase("error");
    } finally {
      setSubmitting(false);
    }
  }

  if (authLoading || !user) return null;

  const caseNum = sessionTotal + (phase === "answering" ? 1 : 0);

  return (
    <div className="min-h-screen bg-slate-50">
      <Nav streak={streak} casesToday={casesToday} planInfo={planInfo} />

      {showUpgradeBanner && (
        <div className="bg-brand-600 text-white text-sm text-center py-2.5 px-4 flex items-center justify-center gap-3">
          <span>You&apos;re now on Pro — unlimited cases unlocked!</span>
          <button onClick={() => setShowUpgradeBanner(false)} className="text-white/70 hover:text-white text-xs underline">Dismiss</button>
        </div>
      )}

      {(sessionTotal > 0 || streak > 0) && (
        <SessionProgress
          streak={streak}
          casesToday={casesToday}
          sessionCorrect={sessionCorrect}
          sessionTotal={sessionTotal}
        />
      )}

      <main className="max-w-7xl mx-auto px-4 py-8">

        {phase === "idle" && (
          <IdleScreen
            onStart={loadNewCase}
            planInfo={planInfo}
            streak={streak}
            sessionCorrect={sessionCorrect}
            sessionTotal={sessionTotal}
          />
        )}

        {phase === "loading" && <LoadingSkeleton />}

        {phase === "error" && (
          <ErrorScreen error={error} onRetry={loadNewCase} />
        )}

        {(phase === "answering" || phase === "feedback") && currentCase && (
          <div className="space-y-4 animate-fade-in">
            <CaseHeader
              topic={currentCase.topic}
              subtopic={currentCase.subtopic}
              caseNum={caseNum}
              difficulty={currentCase.difficulty}
            />

            {/* Two-column layout */}
            <div className="lg:grid lg:grid-cols-[1fr_420px] lg:gap-6 lg:items-start space-y-4 lg:space-y-0">

              {/* Left: scrollable case info */}
              <div>
                <CaseDisplay caseData={currentCase} />
              </div>

              {/* Right: sticky Q&A panel */}
              <div className="lg:sticky lg:top-[5.5rem] space-y-4">
                <AnswerOptions
                  question={currentCase.question}
                  options={currentCase.options}
                  selected={selected}
                  onSelect={setSelected}
                  onSubmit={handleSubmit}
                  submitting={submitting}
                  submitted={phase === "feedback"}
                  correctAnswer={feedback?.correct_answer}
                />

                {phase === "feedback" && feedback && (
                  <FeedbackPanel
                    feedback={feedback}
                    caseId={currentCase.id}
                    studentId={user.id}
                    selectedAnswer={selected ?? undefined}
                    onNextCase={loadNewCase}
                  />
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default function StudyPage() {
  return (
    <Suspense fallback={null}>
      <StudyContent />
    </Suspense>
  );
}
