"use client";

import { createContext, useContext, ReactNode } from "react";
import { EXAM_ID } from "@/lib/examConfig";

// Single-exam stub — CaseRoom is focused on USMLE Step 2 CK.
// ExamContext is retained as a no-op so any legacy imports don't break.

interface ExamContextType {
  examMode: string;
}

const ExamContext = createContext<ExamContextType>({ examMode: EXAM_ID });

export function ExamProvider({ children }: { children: ReactNode }) {
  return (
    <ExamContext.Provider value={{ examMode: EXAM_ID }}>
      {children}
    </ExamContext.Provider>
  );
}

export function useExam() {
  return useContext(ExamContext);
}
