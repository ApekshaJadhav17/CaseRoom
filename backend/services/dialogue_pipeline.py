"""
Phase 6 — Socratic dialogue pipeline.

3-node graph: intent_classifier → responder → socratic_probe
Each node has a focused job so responses are intent-aware rather than generic.
"""

import re
import json
import time
from groq import Groq, RateLimitError
from langgraph.graph import StateGraph, END
from typing_extensions import TypedDict
from typing import Optional
import os

client = Groq(api_key=os.getenv("GROQ_API_KEY"))

LARGE = "llama-3.3-70b-versatile"
SMALL = "llama-3.1-8b-instant"

INTENTS = ("clarification", "misconception", "confirmation", "extension")


# ── State ────────────────────────────────────────────────────────────────────

class DialogueState(TypedDict, total=False):
    case_context: dict
    conversation_history: list
    student_question: str
    selected_answer: Optional[str]   # letter the student chose (may be wrong)
    intent: str
    response: str
    probe: str


# ── Helpers ───────────────────────────────────────────────────────────────────

def _case_summary(ctx: dict, selected_answer: Optional[str] = None) -> str:
    correct = ctx.get("correct_answer", "")
    correct_text = next(
        (o for o in ctx.get("options", []) if o.upper().startswith(correct.upper())), correct
    )
    summary = (
        f"Diagnosis: {ctx.get('subtopic', 'Unknown')}\n"
        f"Patient: {ctx.get('patient', '')}\n"
        f"Key findings: {ctx.get('physical_exam', '')[:300]}\n"
        f"Correct answer: {correct_text}"
    )
    if selected_answer and selected_answer.upper().strip() != correct.upper().strip():
        wrong_text = next(
            (o for o in ctx.get("options", []) if o.upper().startswith(selected_answer.upper())),
            selected_answer,
        )
        summary += (
            f"\nStudent chose INCORRECTLY: {wrong_text}\n"
            "→ Address why this choice was wrong using specific case findings."
        )
    return summary


def _parse_retry_delay(err: RateLimitError) -> float:
    m = re.search(r"try again in ([0-9.]+)s", str(err), re.IGNORECASE)
    return float(m.group(1)) + 0.5 if m else 5.0


def _llm(system: str, user: str, model: str = SMALL, json_mode: bool = False, max_tokens: int = 400) -> str:
    """Call Groq. Retries on TPM rate limit, then cascades SMALL→GEMMA→LARGE."""
    messages = [{"role": "system", "content": system}, {"role": "user", "content": user}]
    candidates = [SMALL, LARGE] if model == LARGE else [SMALL]

    last_err: Exception = RuntimeError("LLM call failed")
    for m in candidates:
        for attempt in range(4):
            try:
                kwargs: dict = dict(model=m, messages=messages, temperature=0.7, max_tokens=max_tokens)
                if json_mode:
                    kwargs["response_format"] = {"type": "json_object"}
                resp = client.chat.completions.create(**kwargs)
                return resp.choices[0].message.content
            except RateLimitError as e:
                if attempt == 3:
                    last_err = e
                    break
                time.sleep(_parse_retry_delay(e))

    raise last_err


# ── Node 1: Intent Classifier ─────────────────────────────────────────────────

def intent_classifier(state: DialogueState) -> dict:
    question = state.get("student_question", "")
    history_tail = state.get("conversation_history", [])[-4:]  # last 2 exchanges

    result = _llm(
        system=(
            "Classify the student's question into exactly one intent. Respond with JSON.\n"
            "Intents:\n"
            "- clarification: wants more detail or explanation on something specific\n"
            "- misconception: states something medically incorrect\n"
            "- confirmation: checking if their understanding is correct\n"
            "- extension: asking about a related topic or edge case"
        ),
        user=(
            f"Recent conversation: {json.dumps(history_tail)}\n"
            f"Student question: {question}\n\n"
            '{"intent": "clarification"}'
        ),
        model=SMALL,
        json_mode=True,
    )

    try:
        intent = json.loads(result).get("intent", "clarification")
        if intent not in INTENTS:
            intent = "clarification"
    except Exception:
        intent = "clarification"

    return {"intent": intent}


# ── Node 2: Responder ─────────────────────────────────────────────────────────

_INTENT_INSTRUCTIONS = {
    "clarification": (
        "The student wants a clearer explanation. Break it down step by step. "
        "Reference specific findings from the case. Be thorough but concise (4-5 sentences)."
    ),
    "misconception": (
        "The student has a misconception. Gently but clearly correct it. "
        "Explain WHY they're wrong using specific case findings or medical principles. "
        "Don't just say 'that's incorrect' — teach the right reasoning (3-4 sentences)."
    ),
    "confirmation": (
        "The student is checking their understanding. Validate what's correct, "
        "gently correct what isn't, and add one clinical pearl they may have missed (3-4 sentences)."
    ),
    "extension": (
        "The student is asking about a related topic or edge case. Give a focused answer "
        "that connects back to the case. Keep it high-yield and exam-relevant (4-5 sentences)."
    ),
}


def responder(state: DialogueState) -> dict:
    ctx = state.get("case_context", {})
    intent = state.get("intent", "clarification")
    history = state.get("conversation_history", [])
    question = state.get("student_question", "")
    selected = state.get("selected_answer")

    messages = [
        {
            "role": "system",
            "content": (
                f"You are a brilliant senior medical resident teaching a student.\n"
                f"Case context:\n{_case_summary(ctx, selected)}\n\n"
                f"Instruction: {_INTENT_INSTRUCTIONS[intent]}\n"
                "Speak directly and educationally. Never be condescending."
            ),
        }
    ]
    messages.extend(history)
    messages.append({"role": "user", "content": question})

    from groq import RateLimitError
    candidates = [SMALL, LARGE]
    last_err: Exception = RuntimeError("LLM call failed")
    for m in candidates:
        try:
            resp = client.chat.completions.create(
                model=m,
                messages=messages,
                temperature=0.7,
                max_tokens=400,
            )
            return {"response": resp.choices[0].message.content}
        except RateLimitError as e:
            last_err = e
            continue
    raise last_err


# ── Node 3: Socratic Probe ────────────────────────────────────────────────────

def socratic_probe(state: DialogueState) -> dict:
    ctx = state.get("case_context", {})
    response = state.get("response", "")
    intent = state.get("intent", "clarification")
    selected = state.get("selected_answer")
    correct = ctx.get("correct_answer", "")
    is_wrong = bool(selected and selected.upper().strip() != correct.upper().strip())

    # Don't add a probe if the response already ends with a question
    if response.rstrip().endswith("?"):
        return {"probe": ""}

    wrong_context = ""
    if is_wrong:
        wrong_text = next(
            (o for o in ctx.get("options", []) if o.upper().startswith((selected or "").upper())),
            selected or "",
        )
        wrong_context = f"The student chose '{wrong_text}' instead of the correct answer. "

    result = _llm(
        system=(
            "You are a Socratic medical teacher. Write one short follow-up question "
            "(one sentence) that pushes the student to think one level deeper. "
            "Make it specific to the case findings. Respond with JSON."
        ),
        user=(
            f"Case: {ctx.get('subtopic', '')}\n"
            f"{wrong_context}"
            f"Teaching response: {response[:400]}\n"
            f"Intent: {intent}\n\n"
            '{"probe": "What specific finding in this case rules out your initial choice?"}'
        ),
        model=SMALL,
        json_mode=True,
    )

    try:
        probe = json.loads(result).get("probe", "")
    except Exception:
        probe = ""

    return {"probe": probe}


# ── Build graph ───────────────────────────────────────────────────────────────

def _build():
    g = StateGraph(DialogueState)

    g.add_node("intent_classifier", intent_classifier)
    g.add_node("responder", responder)
    g.add_node("socratic_probe", socratic_probe)

    g.set_entry_point("intent_classifier")
    g.add_edge("intent_classifier", "responder")
    g.add_edge("responder", "socratic_probe")
    g.add_edge("socratic_probe", END)

    return g.compile()


_graph = _build()


# ── Public API ────────────────────────────────────────────────────────────────

def respond(
    case_context: dict,
    question: str,
    conversation_history: list,
    selected_answer: Optional[str] = None,
) -> str:
    final = _graph.invoke({
        "case_context": case_context,
        "student_question": question,
        "conversation_history": conversation_history,
        "selected_answer": selected_answer,
    })

    response = final.get("response", "")
    probe = final.get("probe", "")

    if probe and not response.rstrip().endswith("?"):
        return f"{response}\n\n{probe}"
    return response
