"use client";

import { useState, useEffect, useCallback } from "react";

interface StreakState {
  streak: number;
  casesToday: number;
  lastStudyDate: string | null;
}

function todayISO() {
  return new Date().toISOString().split("T")[0];
}

function yesterdayISO() {
  return new Date(Date.now() - 86_400_000).toISOString().split("T")[0];
}

export function useStreak() {
  const [state, setState] = useState<StreakState>({ streak: 0, casesToday: 0, lastStudyDate: null });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem("caseroom_streak_v2");
    if (!stored) return;
    try {
      const parsed: StreakState = JSON.parse(stored);
      const today = todayISO();
      const yesterday = yesterdayISO();
      // Break streak if no activity yesterday or today
      const streak =
        parsed.lastStudyDate === today || parsed.lastStudyDate === yesterday
          ? parsed.streak
          : 0;
      const casesToday = parsed.lastStudyDate === today ? parsed.casesToday : 0;
      setState({ ...parsed, streak, casesToday });
    } catch {
      // ignore corrupt data
    }
  }, []);

  const recordCase = useCallback(() => {
    setState((prev) => {
      const today = todayISO();
      const yesterday = yesterdayISO();
      const isNewDay = prev.lastStudyDate !== today;
      const streakContinues =
        prev.lastStudyDate === yesterday || prev.lastStudyDate === today;

      const next: StreakState = {
        streak: isNewDay ? (streakContinues ? prev.streak + 1 : 1) : prev.streak,
        casesToday: isNewDay ? 1 : prev.casesToday + 1,
        lastStudyDate: today,
      };

      if (typeof window !== "undefined") {
        localStorage.setItem("caseroom_streak_v2", JSON.stringify(next));
      }
      return next;
    });
  }, []);

  return { streak: state.streak, casesToday: state.casesToday, recordCase };
}
