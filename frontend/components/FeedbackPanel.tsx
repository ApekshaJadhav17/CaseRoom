"use client";

import { useState } from "react";
import Link from "next/link";
import { Feedback, FollowUpMessage, askFollowUp } from "@/lib/api";

interface Props {
  feedback: Feedback;
  caseId: string;
  studentId: string;
  selectedAnswer?: string;   // the letter the student actually chose
  onNextCase: () => void;
}

const SUGGESTION_CHIPS = [
  "Why not the others?",
  "What labs confirm this?",
  "How do you manage this?",
  "What are the complications?",
];

function TypingDots() {
  return (
    <div className="flex items-center gap-1 px-4 py-3">
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </div>
  );
}

export default function FeedbackPanel({ feedback, caseId, studentId, selectedAnswer, onNextCase }: Props) {
  const [input, setInput] = useState("");
  const [conversation, setConversation] = useState<FollowUpMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [chipsVisible, setChipsVisible] = useState(true);

  async function handleAsk(question: string) {
    const trimmed = question.trim();
    if (!trimmed || loading) return;
    setLoading(true);
    setInput("");
    setChipsVisible(false);
    const userMsg: FollowUpMessage = { role: "user", content: trimmed };
    const next = [...conversation, userMsg];
    setConversation(next);
    try {
      const res = await askFollowUp(caseId, studentId, trimmed, next, selectedAnswer);
      setConversation([...next, { role: "assistant", content: res.answer }]);
    } catch {
      setConversation([...next, { role: "assistant", content: "Sorry, something went wrong. Please try again." }]);
    } finally {
      setLoading(false);
    }
  }

  const isCorrect = feedback.is_correct;

  return (
    <div className="space-y-3 animate-slide-up">

      {/* Result banner */}
      <div className={`card overflow-hidden ${isCorrect ? "border-emerald-200" : "border-rose-200"}`}>
        <div className={`px-5 py-4 flex items-center gap-3 ${
          isCorrect
            ? "bg-gradient-to-r from-emerald-500 to-teal-500"
            : "bg-gradient-to-r from-rose-500 to-rose-400"
        }`}>
          <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center text-white font-extrabold text-lg shrink-0">
            {isCorrect ? "✓" : "✗"}
          </div>
          <div>
            <p className="font-bold text-white text-sm">
              {isCorrect ? "Correct!" : `Incorrect — Answer: ${feedback.correct_answer}`}
            </p>
          </div>
        </div>
        <div className="px-5 py-4">
          <p className="text-sm text-slate-600 leading-relaxed">{feedback.explanation}</p>
        </div>
      </div>

      {/* Teaching points */}
      <div className="card p-5">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">Key Points</p>
        <ul className="space-y-2.5">
          {feedback.teaching_points.map((point, i) => (
            <li key={i} className="flex items-start gap-2.5">
              <span className="shrink-0 mt-0.5 w-5 h-5 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-[10px] font-bold">
                {i + 1}
              </span>
              <span className="text-sm text-slate-700 leading-relaxed">{point}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Socratic dialogue */}
      <div className="card p-5 space-y-3">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Ask Your Resident</p>

        {/* Follow-up prompt */}
        <button
          onClick={() => handleAsk(feedback.follow_up_question)}
          disabled={loading}
          className="w-full text-left p-3.5 rounded-xl border-2 border-amber-200 bg-amber-50 hover:border-amber-400 hover:bg-amber-100/60 transition-all duration-200 group disabled:cursor-not-allowed"
        >
          <p className="text-xs font-semibold text-amber-900 leading-snug">{feedback.follow_up_question}</p>
          <p className="text-[10px] text-amber-500 mt-1 group-hover:text-amber-700 transition-colors">Tap to explore →</p>
        </button>

        {/* Suggestion chips */}
        {chipsVisible && (
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTION_CHIPS.map((chip) => (
              <button
                key={chip}
                onClick={() => handleAsk(chip)}
                disabled={loading}
                className="text-[11px] px-2.5 py-1.5 rounded-full border border-slate-200 text-slate-500 hover:border-brand-300 hover:text-brand-700 hover:bg-brand-50 transition-all duration-150 disabled:opacity-40"
              >
                {chip}
              </button>
            ))}
          </div>
        )}

        {/* Chat */}
        {(conversation.length > 0 || loading) && (
          <div className="space-y-2.5 pt-2 border-t border-slate-100 max-h-64 overflow-y-auto">
            {conversation.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} animate-fade-in`}>
                {msg.role === "assistant" && (
                  <div className="shrink-0 w-6 h-6 rounded-full bg-brand-600 flex items-center justify-center mr-1.5 mt-1">
                    <span className="text-[9px] font-bold text-white">R</span>
                  </div>
                )}
                <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed whitespace-pre-wrap ${
                  msg.role === "user"
                    ? "bg-brand-600 text-white rounded-br-sm"
                    : "bg-slate-100 text-slate-800 rounded-bl-sm"
                }`}>
                  {msg.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex items-start gap-1.5">
                <div className="shrink-0 w-6 h-6 rounded-full bg-brand-600 flex items-center justify-center">
                  <span className="text-[9px] font-bold text-white">R</span>
                </div>
                <div className="bg-slate-100 rounded-2xl rounded-bl-sm">
                  <TypingDots />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Input */}
        <div className="flex gap-2 pt-1">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAsk(input)}
            placeholder="Ask anything about this case…"
            disabled={loading}
            className="input-field flex-1 text-sm py-2"
          />
          <button
            onClick={() => handleAsk(input)}
            disabled={!input.trim() || loading}
            className="btn-primary px-3.5 py-2 shrink-0 text-sm"
          >
            {loading
              ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin block" />
              : "Ask"
            }
          </button>
        </div>
      </div>

      {conversation.length >= 4 && (
        <div className="card p-4 bg-gradient-to-r from-brand-50 to-white border border-brand-100 flex items-center justify-between gap-3 animate-fade-in">
          <p className="text-xs text-brand-800">
            <span className="font-semibold">Enjoying this?</span> Upgrade for unlimited cases.
          </p>
          <Link href="/pricing" className="btn-primary text-xs py-1.5 px-3 shrink-0">Go Pro</Link>
        </div>
      )}

      {/* Next case */}
      <button
        onClick={() => onNextCase()}
        className="w-full py-4 px-4 bg-slate-900 hover:bg-slate-800 active:scale-[0.99] text-white font-bold rounded-2xl text-sm transition-all duration-200 shadow-lg flex items-center justify-center gap-2 group"
      >
        Next Case
        <span className="transition-transform duration-200 group-hover:translate-x-1">→</span>
      </button>
    </div>
  );
}
