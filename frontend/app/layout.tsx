import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { ExamProvider } from "@/contexts/ExamContext";

export const metadata: Metadata = {
  title: "CaseRoom — Adaptive USMLE Step 2 CK Practice",
  description: "AI-generated USMLE Step 2 CK clinical cases that adapt to your weaknesses. LangGraph pipeline · RAG · Spaced repetition.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <ExamProvider>{children}</ExamProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
