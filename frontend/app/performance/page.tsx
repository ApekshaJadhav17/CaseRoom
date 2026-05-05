"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getPerformance, getMastery, MasteryStats } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useStreak } from "@/lib/useStreak";
import Nav from "@/components/Nav";
import Link from "next/link";

// ── Types ────────────────────────────────────────────────────────────────────

interface TopicStat {
  topic: string;
  correct: number;
  total: number;
  accuracy: number;
}

interface Performance {
  total_cases: number;
  total_correct: number;
  overall_accuracy: number;
  topics: TopicStat[];
  weakest_topic: string | null;
}

// ── Mastery level config ──────────────────────────────────────────────────────

const MASTERY_CONFIG = {
  mastered:       { label: "Mastered",      color: "bg-emerald-500", text: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200" },
  proficient:     { label: "Proficient",    color: "bg-brand-400",   text: "text-brand-700",   bg: "bg-brand-50 border-brand-200" },
  developing:     { label: "Developing",    color: "bg-amber-400",   text: "text-amber-700",   bg: "bg-amber-50 border-amber-200" },
  learning:       { label: "Learning",      color: "bg-slate-300",   text: "text-slate-600",   bg: "bg-slate-50 border-slate-200" },
  due_for_review: { label: "Due for Review",color: "bg-violet-400",  text: "text-violet-700",  bg: "bg-violet-50 border-violet-200" },
  unseen:         { label: "Unseen",        color: "bg-slate-100",   text: "text-slate-400",   bg: "bg-white border-slate-100" },
};

// ── Sub-components ────────────────────────────────────────────────────────────

function CircularProgress({ value }: { value: number }) {
  const r = 36;
  const circ = 2 * Math.PI * r;
  const offset = circ - (value / 100) * circ;
  const color = value >= 75 ? "#10b981" : value >= 50 ? "#f59e0b" : "#f43f5e";
  return (
    <div className="relative w-24 h-24 mx-auto">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 80 80">
        <circle cx="40" cy="40" r={r} fill="none" stroke="#f1f5f9" strokeWidth="8" />
        <circle cx="40" cy="40" r={r} fill="none" stroke={color} strokeWidth="8"
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 1.2s ease-out" }} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-xl font-extrabold text-slate-900">{value}%</span>
      </div>
    </div>
  );
}

function CoverageBar({ covered, total }: { covered: number; total: number }) {
  const pct = total > 0 ? Math.round((covered / total) * 100) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-500 font-medium">Curriculum coverage</span>
        <span className="font-bold text-slate-700">{covered}/{total} topics</span>
      </div>
      <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-brand-500 to-brand-400 rounded-full transition-all duration-1000"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-xs text-slate-400">{pct}% of {total} curriculum topics attempted</p>
    </div>
  );
}

function MasteryDistribution({ distribution, curriculumSize }: {
  distribution: MasteryStats["mastery_distribution"];
  curriculumSize: number;
}) {
  const order: (keyof typeof MASTERY_CONFIG)[] = [
    "mastered", "proficient", "due_for_review", "developing", "learning", "unseen"
  ];
  return (
    <div className="space-y-3">
      <p className="section-label">Topic Mastery</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {order.map((key) => {
          const cfg = MASTERY_CONFIG[key];
          const count = distribution[key as keyof typeof distribution] ?? 0;
          return (
            <div key={key} className={`rounded-xl border px-3 py-2.5 ${cfg.bg}`}>
              <div className="flex items-center gap-2 mb-1">
                <div className={`w-2 h-2 rounded-full shrink-0 ${cfg.color}`} />
                <span className={`text-xs font-semibold ${cfg.text}`}>{cfg.label}</span>
              </div>
              <p className={`text-2xl font-extrabold ${cfg.text}`}>{count}</p>
            </div>
          );
        })}
      </div>
      {/* Stacked bar */}
      <div className="flex h-2.5 rounded-full overflow-hidden gap-px">
        {order.map((key) => {
          const count = distribution[key as keyof typeof distribution] ?? 0;
          const pct = curriculumSize > 0 ? (count / curriculumSize) * 100 : 0;
          return pct > 0 ? (
            <div key={key} className={MASTERY_CONFIG[key].color} style={{ width: `${pct}%` }} />
          ) : null;
        })}
      </div>
    </div>
  );
}

function DueForReview({ topics }: { topics: string[] }) {
  if (!topics.length) return null;
  return (
    <div className="card p-5 border-l-4 border-l-violet-400 bg-gradient-to-r from-violet-50 to-white">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <p className="text-sm font-bold text-violet-800">
            {topics.length} topic{topics.length > 1 ? "s" : ""} due for review
          </p>
          <p className="text-xs text-violet-600 mt-0.5">
            Mastered but not seen in 7+ days — spaced repetition reminder
          </p>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {topics.slice(0, 5).map((t) => (
              <span key={t} className="text-xs font-medium bg-violet-100 text-violet-700 border border-violet-200 rounded-full px-2 py-0.5">
                {t}
              </span>
            ))}
            {topics.length > 5 && (
              <span className="text-xs text-violet-400">+{topics.length - 5} more</span>
            )}
          </div>
        </div>
        <Link href="/study" className="px-4 py-2 bg-violet-500 hover:bg-violet-600 text-white rounded-xl text-xs font-bold transition-colors shrink-0">
          Review now
        </Link>
      </div>
    </div>
  );
}

function DevelopingAlert({ topics }: { topics: string[] }) {
  if (!topics.length) return null;
  return (
    <div className="card p-5 border-l-4 border-l-amber-400 bg-gradient-to-r from-amber-50 to-white">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <p className="text-sm font-bold text-amber-800">
            Struggling on {topics.length} topic{topics.length > 1 ? "s" : ""}
          </p>
          <p className="text-xs text-amber-600 mt-0.5">Below 60% — being prioritised in your next cases</p>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {topics.slice(0, 4).map((t) => (
              <span key={t} className="text-xs font-medium bg-amber-100 text-amber-700 border border-amber-200 rounded-full px-2 py-0.5">
                {t}
              </span>
            ))}
          </div>
        </div>
        <Link href="/study" className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold transition-colors shrink-0">
          Practice now
        </Link>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function PerformancePage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { streak } = useStreak();

  const [data, setData] = useState<Performance | null>(null);
  const [mastery, setMastery] = useState<MasteryStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/auth");
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    Promise.all([getPerformance(user.id), getMastery(user.id)])
      .then(([perf, mast]) => { setData(perf); setMastery(mast); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user]);

  if (authLoading || !user) return null;

  return (
    <div className="min-h-screen bg-slate-50">
      <Nav streak={streak} />

      <main className="max-w-4xl mx-auto px-4 py-10 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between animate-fade-in flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">My Performance</h1>
            <p className="text-sm text-slate-400 mt-0.5">
              Curriculum coverage · Mastery levels · Spaced repetition
            </p>
          </div>
          <Link href="/study" className="btn-primary text-sm py-2.5 px-5">
            Continue Studying →
          </Link>
        </div>

        {loading && (
          <div className="space-y-4 animate-fade-in">
            <div className="grid grid-cols-3 gap-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="card p-6 text-center">
                  <div className="skeleton h-10 w-16 rounded-lg mx-auto" />
                  <div className="skeleton h-4 w-24 rounded mx-auto mt-2" />
                </div>
              ))}
            </div>
            <div className="card p-6"><div className="skeleton h-32 rounded-xl" /></div>
          </div>
        )}

        {!loading && (!data || data.total_cases === 0) && (
          <div className="card p-14 text-center animate-scale-in">
            <div className="text-5xl mb-4">📊</div>
            <p className="font-bold text-lg text-slate-700">No data yet</p>
            <p className="text-sm text-slate-400 mt-1">Complete your first case to start tracking progress.</p>
            <Link href="/study" className="btn-primary inline-block mt-6 px-8">Start your first case</Link>
          </div>
        )}

        {!loading && data && data.total_cases > 0 && mastery && (
          <>
            {/* Summary row */}
            <div className="grid grid-cols-3 gap-4 animate-slide-up">
              <div className="card p-6 text-center">
                <p className="text-4xl font-extrabold text-slate-900">{data.total_cases}</p>
                <p className="text-sm font-semibold text-slate-500 mt-1">Cases Done</p>
                <p className="text-xs text-slate-400 mt-0.5">{data.total_correct} correct</p>
              </div>
              <div className="card p-6 text-center">
                <CircularProgress value={data.overall_accuracy} />
                <p className="text-sm font-semibold text-slate-500 mt-2">Overall Accuracy</p>
              </div>
              <div className="card p-6 text-center">
                {streak > 0 ? (
                  <>
                    <p className="text-4xl font-extrabold text-orange-500">🔥 {streak}</p>
                    <p className="text-sm font-semibold text-slate-500 mt-1">Day Streak</p>
                  </>
                ) : (
                  <>
                    <p className="text-4xl font-extrabold text-slate-300">—</p>
                    <p className="text-sm font-semibold text-slate-500 mt-1">No Streak</p>
                    <p className="text-xs text-slate-400 mt-0.5">Study today to start one</p>
                  </>
                )}
              </div>
            </div>

            {/* Curriculum coverage + mastery */}
            <div className="card p-6 space-y-5 animate-slide-up">
              <CoverageBar covered={mastery.covered} total={mastery.curriculum_size} />
              <div className="border-t border-slate-100 pt-5">
                <MasteryDistribution
                  distribution={mastery.mastery_distribution}
                  curriculumSize={mastery.curriculum_size}
                />
              </div>
            </div>

            {/* Alerts */}
            <DevelopingAlert topics={mastery.developing_topics} />
            <DueForReview topics={mastery.due_for_review} />

            {/* Topic breakdown */}
            <div className="card p-6 animate-slide-up">
              <div className="flex items-center justify-between mb-5">
                <p className="section-label">Topics Attempted</p>
                <p className="text-xs text-slate-400">{mastery.topic_details.length} topics</p>
              </div>
              <div className="space-y-4">
                {mastery.topic_details
                  .slice()
                  .sort((a, b) => a.accuracy - b.accuracy)
                  .map((t) => {
                    const cfg = MASTERY_CONFIG[t.mastery as keyof typeof MASTERY_CONFIG] ?? MASTERY_CONFIG.unseen;
                    const barColor =
                      t.accuracy >= 80 ? "bg-emerald-500" :
                      t.accuracy >= 60 ? "bg-brand-400" :
                      t.accuracy >= 40 ? "bg-amber-400" : "bg-rose-400";
                    return (
                      <div key={t.topic}>
                        <div className="flex items-center justify-between mb-1 gap-2">
                          <div className="flex items-center gap-2 min-w-0 flex-wrap">
                            <span className="text-sm font-semibold text-slate-800 truncate">{t.topic}</span>
                            <span className={`text-[10px] font-semibold border rounded-full px-2 py-0.5 ${cfg.bg} ${cfg.text}`}>
                              {cfg.label}
                            </span>
                            {t.days_since !== null && t.days_since < 2 && (
                              <span className="text-[10px] text-slate-400">recent</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className={`text-sm font-extrabold ${cfg.text}`}>{t.accuracy}%</span>
                            <span className="text-xs text-slate-300">({t.correct}/{t.total})</span>
                          </div>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                          <div className={`${barColor} h-full rounded-full`} style={{ width: `${t.accuracy}%` }} />
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>

            {/* Achievements */}
            <div className="card p-6 animate-slide-up">
              <p className="section-label mb-5">Achievements</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {[
                  { icon: "🏁", label: "First Case", sub: "Complete your first case", ok: data.total_cases >= 1 },
                  { icon: "📦", label: "10 Cases", sub: "Complete 10 cases", ok: data.total_cases >= 10 },
                  { icon: "🎯", label: "Sharp Shooter", sub: "Reach 70% accuracy", ok: data.overall_accuracy >= 70 },
                  { icon: "🔥", label: "On a Streak", sub: "Study 3 days in a row", ok: streak >= 3 },
                  { icon: "💪", label: "Topic Master", sub: "Master any 5 topics", ok: mastery.mastery_distribution.mastered >= 5 },
                  { icon: "🗺️", label: "Explorer", sub: "Cover 50% of curriculum", ok: mastery.covered / mastery.curriculum_size >= 0.5 },
                  { icon: "🌟", label: "50 Cases", sub: "Complete 50 cases", ok: data.total_cases >= 50 },
                  { icon: "🧠", label: "Well Rounded", sub: "Cover 80% of curriculum", ok: mastery.covered / mastery.curriculum_size >= 0.8 },
                  { icon: "🏆", label: "Curriculum Complete", sub: "Master 90% of topics", ok: mastery.mastery_distribution.mastered / mastery.curriculum_size >= 0.9 },
                ].map((a) => (
                  <div
                    key={a.label}
                    className={[
                      "rounded-xl p-4 flex items-start gap-3 transition-all border",
                      a.ok ? "bg-brand-50 border-brand-100" : "bg-slate-50 border-slate-100 opacity-40 grayscale",
                    ].join(" ")}
                  >
                    <span className="text-2xl leading-none shrink-0">{a.icon}</span>
                    <div>
                      <p className="text-xs font-bold text-slate-800">{a.label}</p>
                      <p className="text-xs text-slate-400 mt-0.5 leading-tight">{a.sub}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
