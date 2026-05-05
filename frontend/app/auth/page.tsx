"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";

type Tab = "signin" | "signup";

export default function AuthPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [tab, setTab] = useState<Tab>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirmSent, setConfirmSent] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace("/study");
  }, [user, loading, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      if (tab === "signup") {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setConfirmSent(true);
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.replace("/study");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return null;

  return (
    <div className="min-h-screen bg-[#0a1628] flex">
      {/* Left panel — branding */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 relative overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-1/3 left-1/3 w-96 h-96 bg-brand-600/15 rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-brand-400/10 rounded-full blur-3xl" />
        </div>

        <Link href="/" className="flex items-center gap-2">
          <div className="w-9 h-9 bg-brand-600 rounded-xl flex items-center justify-center shadow-lg shadow-brand-900/50">
            <span className="text-white font-bold">CR</span>
          </div>
          <span className="text-white font-bold text-lg">CaseRoom</span>
        </Link>

        <div className="space-y-8">
          <div>
            <h2 className="text-3xl font-extrabold text-white leading-tight">
              Your personal senior
              <br />
              resident. Always on.
            </h2>
            <p className="mt-4 text-white/50 leading-relaxed">
              Infinite adaptive cases. Socratic dialogue. Real imaging. Everything you need to master Step 2 CK.
            </p>
          </div>

          <div className="space-y-4">
            {[
              "Adapts to your weakest topics automatically",
              "Real NIH chest X-rays in relevant cases",
              "Ask your AI resident anything, anytime",
            ].map((point) => (
              <div key={point} className="flex items-center gap-3">
                <div className="w-5 h-5 rounded-full bg-brand-600/30 border border-brand-500/40 flex items-center justify-center shrink-0">
                  <span className="text-brand-400 text-xs">✓</span>
                </div>
                <span className="text-sm text-white/60">{point}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="text-xs text-white/20">For educational use only — not a substitute for clinical judgment.</p>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        {/* Mobile logo */}
        <Link href="/" className="flex items-center gap-2 mb-10 lg:hidden">
          <div className="w-8 h-8 bg-brand-600 rounded-xl flex items-center justify-center">
            <span className="text-white font-bold text-sm">CR</span>
          </div>
          <span className="text-white font-bold text-lg">CaseRoom</span>
        </Link>

        <div className="w-full max-w-sm animate-slide-up">
          {confirmSent ? (
            <div className="text-center space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-brand-900/50 flex items-center justify-center mx-auto text-3xl">
                📬
              </div>
              <h2 className="text-xl font-bold text-white">Check your email</h2>
              <p className="text-sm text-white/50 leading-relaxed">
                We sent a confirmation link to <span className="text-white/80 font-medium">{email}</span>. Click it to activate your account.
              </p>
              <button
                onClick={() => { setConfirmSent(false); setTab("signin"); }}
                className="text-sm text-brand-400 hover:text-brand-300 transition-colors"
              >
                Back to sign in
              </button>
            </div>
          ) : (
            <>
              <div className="mb-8">
                <h1 className="text-2xl font-bold text-white">
                  {tab === "signin" ? "Welcome back" : "Create your account"}
                </h1>
                <p className="text-sm text-white/40 mt-1">
                  {tab === "signin"
                    ? "Sign in to continue your study sessions."
                    : "Start with 10 free cases per day."}
                </p>
              </div>

              {/* Tabs */}
              <div className="flex rounded-xl bg-white/5 p-1 mb-6 border border-white/10">
                {(["signin", "signup"] as Tab[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => { setTab(t); setError(""); }}
                    className={[
                      "flex-1 py-2 text-sm font-semibold rounded-lg transition-all duration-200",
                      tab === t
                        ? "bg-brand-600 text-white shadow-sm"
                        : "text-white/40 hover:text-white/70",
                    ].join(" ")}
                  >
                    {t === "signin" ? "Sign In" : "Sign Up"}
                  </button>
                ))}
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-white/50 mb-1.5 uppercase tracking-wider">
                    Email
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-white/25 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-white/50 mb-1.5 uppercase tracking-wider">
                    Password
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-white/25 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all"
                  />
                  {tab === "signup" && (
                    <p className="text-xs text-white/30 mt-1.5">Minimum 6 characters</p>
                  )}
                </div>

                {error && (
                  <div className="p-3.5 bg-rose-900/30 border border-rose-500/30 rounded-xl">
                    <p className="text-sm text-rose-300">{error}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3.5 bg-brand-600 hover:bg-brand-500 active:bg-brand-700 text-white font-bold rounded-xl text-sm transition-all duration-150 shadow-lg shadow-brand-900/40 disabled:bg-white/10 disabled:text-white/30 mt-2"
                >
                  {submitting ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      {tab === "signin" ? "Signing in..." : "Creating account..."}
                    </span>
                  ) : tab === "signin" ? "Sign In" : "Create Account — Free"}
                </button>
              </form>

              <p className="mt-6 text-center text-xs text-white/25">
                By continuing you agree to our terms of use.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
