"use client";

interface Props {
  question: string;
  options: string[];
  selected: string | null;
  onSelect: (answer: string) => void;
  onSubmit: () => void;
  submitting: boolean;
  submitted: boolean;
  correctAnswer?: string;
}

export default function AnswerOptions({
  question,
  options,
  selected,
  onSelect,
  onSubmit,
  submitting,
  submitted,
  correctAnswer,
}: Props) {
  const letters = ["A", "B", "C", "D", "E"];

  function getState(letter: string): "correct" | "wrong" | "selected" | "dimmed" | "idle" {
    const isCorrect = submitted && correctAnswer && letter === correctAnswer.trim().toUpperCase();
    const isSelected = selected === letter;
    if (isCorrect) return "correct";
    if (submitted && isSelected && !isCorrect) return "wrong";
    if (isSelected && !submitted) return "selected";
    if (submitted) return "dimmed";
    return "idle";
  }

  const stateStyles: Record<string, { row: string; badge: string; icon: string | null }> = {
    correct: {
      row: "border-emerald-400 bg-emerald-50 shadow-sm shadow-emerald-100/50",
      badge: "bg-emerald-500 text-white",
      icon: "✓",
    },
    wrong: {
      row: "border-rose-400 bg-rose-50",
      badge: "bg-rose-400 text-white",
      icon: "✗",
    },
    selected: {
      row: "border-brand-500 bg-brand-50 shadow-md shadow-brand-100/50",
      badge: "bg-brand-600 text-white",
      icon: null,
    },
    dimmed: {
      row: "border-slate-100 bg-slate-50/60 opacity-60",
      badge: "bg-slate-200 text-slate-400",
      icon: null,
    },
    idle: {
      row: "border-slate-200 bg-white hover:border-brand-300 hover:bg-brand-50/40 hover:shadow-sm cursor-pointer active:scale-[0.99]",
      badge: "bg-slate-100 text-slate-500",
      icon: null,
    },
  };

  return (
    <div className="card overflow-hidden animate-slide-up">
      {/* Question header */}
      <div className="px-5 pt-5 pb-4 border-b border-slate-100 bg-gradient-to-br from-slate-900 to-slate-800 rounded-t-2xl">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Question</p>
        <p className="text-sm font-semibold text-white leading-relaxed">{question}</p>
      </div>

      {/* Options */}
      <div className="p-4 space-y-2.5">
        {options.map((option, idx) => {
          const letter = letters[idx] || String(idx + 1);
          const state = getState(letter);
          const s = stateStyles[state];

          return (
            <button
              key={letter}
              onClick={() => !submitted && onSelect(letter)}
              disabled={submitted}
              className={`w-full text-left px-3.5 py-3 rounded-xl border-2 text-sm font-medium transition-all duration-200 ${s.row}`}
            >
              <div className="flex items-start gap-3">
                <span className={`shrink-0 w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center transition-all duration-150 mt-px ${s.badge}`}>
                  {s.icon ?? letter}
                </span>
                <span className="leading-snug pt-0.5 flex-1">
                  {option.replace(/^[A-E]\.\s*/i, "")}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Submit */}
      {!submitted && (
        <div className="px-4 pb-4">
          <button
            onClick={onSubmit}
            disabled={!selected || submitting}
            className={`w-full py-3.5 rounded-xl font-bold text-sm transition-all duration-200 ${
              selected && !submitting
                ? "bg-brand-600 hover:bg-brand-700 active:scale-[0.99] text-white shadow-lg shadow-brand-200"
                : "bg-slate-100 text-slate-400 cursor-not-allowed"
            }`}
          >
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Checking…
              </span>
            ) : (
              "Submit Answer"
            )}
          </button>
        </div>
      )}
    </div>
  );
}
