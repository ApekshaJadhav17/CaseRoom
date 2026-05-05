"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { EXAM_SHORT } from "@/lib/examConfig";

interface NavProps {
  streak?: number;
  casesToday?: number;
  planInfo?: { plan: string; cases_remaining: number } | null;
}

function Avatar({ email }: { email: string }) {
  const initials = email
    .split("@")[0]
    .replace(/[^a-zA-Z]/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0].toUpperCase())
    .slice(0, 2)
    .join("");
  return (
    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center text-white text-xs font-bold shadow-sm select-none">
      {initials || "?"}
    </div>
  );
}

export default function Nav({ streak = 0, casesToday = 0, planInfo }: NavProps) {
  const { user, signOut } = useAuth();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const isActive = (href: string) => pathname === href;

  return (
    <>
    <nav className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-100 shadow-sm">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-4">

        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 shrink-0 group">
          <div className="w-8 h-8 bg-brand-600 rounded-xl flex items-center justify-center shadow-sm group-hover:bg-brand-700 transition-colors">
            <span className="text-white font-bold text-xs tracking-tight">CR</span>
          </div>
          <span className="font-bold text-slate-900 text-base">CaseRoom</span>
        </Link>

        {/* Centre nav links — logged in */}
        {user && (
          <div className="hidden sm:flex items-center gap-1">
            {[
              { href: "/study", label: "Study" },
              { href: "/performance", label: "Performance" },
              { href: "/pricing", label: "Pricing" },
            ].map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={[
                  "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                  isActive(href)
                    ? "bg-brand-50 text-brand-700"
                    : "text-slate-500 hover:text-slate-900 hover:bg-slate-50",
                ].join(" ")}
              >
                {label}
              </Link>
            ))}
          </div>
        )}

        {/* Right section */}
        <div className="flex items-center gap-3">
          {/* Step badge */}
          {user && (
            <span className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 bg-brand-50 border border-brand-100 rounded-full text-xs font-semibold text-brand-700">
              {EXAM_SHORT}
            </span>
          )}

          {/* Streak chip */}
          {user && streak > 0 && (
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 bg-orange-50 border border-orange-100 rounded-full">
              <span className="text-base leading-none">🔥</span>
              <span className="text-xs font-bold text-orange-600">{streak}</span>
              <span className="text-xs text-orange-400 font-medium">day streak</span>
            </div>
          )}

          {/* Cases today chip */}
          {user && casesToday > 0 && (
            <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 bg-brand-50 border border-brand-100 rounded-full">
              <span className="text-xs font-bold text-brand-600">{casesToday}</span>
              <span className="text-xs text-brand-400 font-medium">today</span>
            </div>
          )}

          {/* Plan badge */}
          {user && planInfo?.plan === "pro" && (
            <span className="hidden sm:inline badge bg-gradient-to-r from-brand-600 to-brand-500 text-white text-xs px-2.5 py-1 shadow-sm">
              Pro
            </span>
          )}

          {/* Logged-out links */}
          {!user && (
            <>
              <Link href="/pricing" className="text-sm text-slate-500 hover:text-slate-900 transition-colors hidden sm:block">
                Pricing
              </Link>
              <Link href="/auth" className="btn-primary text-xs py-2 px-4">
                Sign In
              </Link>
            </>
          )}

          {/* User avatar + dropdown */}
          {user && (
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen((o) => !o)}
                className="flex items-center gap-2 p-1 rounded-xl hover:bg-slate-50 transition-colors"
              >
                <Avatar email={user.email ?? ""} />
                <svg
                  className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-150 ${menuOpen ? "rotate-180" : ""}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {menuOpen && (
                <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-2xl shadow-xl border border-slate-100 py-1.5 animate-scale-in origin-top-right z-50">
                  {/* User info */}
                  <div className="px-4 py-3 border-b border-slate-50">
                    <p className="text-xs font-semibold text-slate-900 truncate">{user.email}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {planInfo?.plan === "pro" ? "Pro plan" : "Free plan"}
                      {planInfo?.plan === "free" && ` · ${planInfo.cases_remaining ?? 10} cases left`}
                    </p>
                  </div>

                  {/* Menu items */}
                  <div className="py-1">
                    {[
                      { href: "/study", label: "Study", icon: "📚" },
                      { href: "/performance", label: "My Performance", icon: "📊" },
                      { href: "/pricing", label: "Upgrade to Pro", icon: "⚡" },
                    ].map(({ href, label, icon }) => (
                      <Link
                        key={href}
                        href={href}
                        onClick={() => setMenuOpen(false)}
                        className="flex items-center gap-3 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                      >
                        <span className="text-base">{icon}</span>
                        {label}
                      </Link>
                    ))}
                  </div>

                  {/* Streak in mobile dropdown */}
                  {streak > 0 && (
                    <div className="mx-3 my-1 px-3 py-2 bg-orange-50 rounded-xl flex items-center gap-2">
                      <span>🔥</span>
                      <span className="text-xs font-semibold text-orange-700">{streak}-day study streak</span>
                    </div>
                  )}

                  <div className="border-t border-slate-50 mt-1 pt-1">
                    <button
                      onClick={() => { setMenuOpen(false); signOut(); }}
                      className="w-full flex items-center gap-3 px-4 py-2 text-sm text-rose-500 hover:bg-rose-50 transition-colors"
                    >
                      <span className="text-base">→</span>
                      Sign out
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </nav>
    </>
  );
}
