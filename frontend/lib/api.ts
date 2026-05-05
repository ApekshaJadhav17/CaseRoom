import { supabase } from "@/lib/supabase";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export interface VitalSigns {
  bp: string;
  hr: number;
  rr?: number;
  temp?: string;
  o2_sat?: string;
}

export interface Case {
  id: string;
  patient: string;
  chief_complaint: string;
  vitals: VitalSigns;
  history: string;
  physical_exam: string;
  labs?: string;
  question: string;
  options: string[];
  topic: string;
  subtopic: string;
  difficulty?: "easy" | "medium" | "hard";
  image_url?: string;
}

export interface Feedback {
  is_correct: boolean;
  correct_answer: string;
  explanation: string;
  follow_up_question: string;
  teaching_points: string[];
}

export interface FollowUpMessage {
  role: "user" | "assistant";
  content: string;
}

export interface PlanInfo {
  plan: "free" | "pro";
  cases_today: number;
  cases_remaining: number;
}

export interface MasteryStats {
  curriculum_size: number;
  covered: number;
  mastery_distribution: {
    unseen: number;
    learning: number;
    developing: number;
    proficient: number;
    due_for_review: number;
    mastered: number;
  };
  due_for_review: string[];
  developing_topics: string[];
  topic_details: {
    topic: string;
    total: number;
    correct: number;
    accuracy: number;
    mastery: string;
    days_since: number | null;
  }[];
}

async function getAuthHeader(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) {
    return { Authorization: `Bearer ${session.access_token}` };
  }
  return {};
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const authHeader = await getAuthHeader();
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...authHeader },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Request failed");
  }
  return res.json();
}

export function warmup(studentId: string): Promise<void> {
  return apiFetch<void>("/api/cases/warmup", {
    method: "POST",
    body: JSON.stringify({ student_id: studentId }),
  }).catch(() => {});
}

export function generateCase(studentId: string, topic?: string): Promise<Case> {
  return apiFetch<Case>("/api/cases/generate", {
    method: "POST",
    body: JSON.stringify({ student_id: studentId, topic }),
  });
}

export function submitAnswer(
  caseId: string,
  studentId: string,
  selectedAnswer: string,
): Promise<Feedback> {
  return apiFetch<Feedback>("/api/cases/submit", {
    method: "POST",
    body: JSON.stringify({ case_id: caseId, student_id: studentId, selected_answer: selectedAnswer }),
  });
}

export function askFollowUp(
  caseId: string,
  studentId: string,
  question: string,
  history: FollowUpMessage[],
  selectedAnswer?: string,
): Promise<{ answer: string }> {
  return apiFetch<{ answer: string }>("/api/cases/followup", {
    method: "POST",
    body: JSON.stringify({
      case_id: caseId,
      student_id: studentId,
      question,
      conversation_history: history,
      selected_answer: selectedAnswer,
    }),
  });
}

export function getPerformance(studentId: string) {
  return apiFetch<{
    total_cases: number;
    total_correct: number;
    overall_accuracy: number;
    topics: { topic: string; correct: number; total: number; accuracy: number }[];
    weakest_topic: string | null;
  }>(`/api/performance/${studentId}`);
}

export function getMastery(studentId: string): Promise<MasteryStats> {
  return apiFetch<MasteryStats>(`/api/performance/mastery/${studentId}`);
}

export function getPlanInfo(studentId: string): Promise<PlanInfo> {
  return apiFetch<PlanInfo>(`/api/billing/plan/${studentId}`);
}

export async function createCheckoutSession(studentId: string, email: string): Promise<string> {
  const data = await apiFetch<{ url: string }>("/api/billing/checkout", {
    method: "POST",
    body: JSON.stringify({ student_id: studentId, email }),
  });
  return data.url;
}

export function getOrCreateStudentId(): string {
  if (typeof window === "undefined") return "anon";
  let id = localStorage.getItem("caseroom_student_id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("caseroom_student_id", id);
  }
  return id;
}
