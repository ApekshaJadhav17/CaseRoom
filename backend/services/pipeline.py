"""
8-node LangGraph case generation pipeline for USMLE Step 2 CK.

Node order:
  topic_selector → knowledge_retriever → image_retriever → clinical_builder
  → question_designer → validator → explanation_writer → followup_generator

Model strategy:
  SMALL (llama-3.1-8b-instant): all nodes except question_designer
  LARGE (llama-3.3-70b-versatile): question_designer only
  On 429: parse retry-after header, sleep, retry up to 3× before cascading to LARGE.
"""

import os
import re
import json
import time
import random
from typing import Optional

from groq import Groq, RateLimitError
from langgraph.graph import StateGraph, END
from typing_extensions import TypedDict

from services import qdrant_service, image_service
from services.exam_config import get_exam, QUESTION_STEMS

client = Groq(api_key=os.getenv("GROQ_API_KEY"))

LARGE = "llama-3.3-70b-versatile"
SMALL = "llama-3.1-8b-instant"


# ── State ─────────────────────────────────────────────────────────────────────

class CaseState(TypedDict, total=False):
    student_id: str
    requested_topic: Optional[str]
    weak_topic: Optional[str]
    difficulty: str          # "easy" | "medium" | "hard"
    question_type: str       # "next_step" | "diagnosis" | "management" | "investigation"
    rag_context: str
    image_url: Optional[str]
    topic: str
    subtopic: str
    clinical_focus: str
    patient: str
    chief_complaint: str
    vitals: dict
    history: str
    physical_exam: str
    labs: Optional[str]
    question: str
    options: list
    correct_answer: str
    explanation: str
    teaching_points: list
    follow_up_question: str
    is_valid: bool
    validation_feedback: str
    retry_count: int


# ── LLM helpers ───────────────────────────────────────────────────────────────

def _parse_retry_delay(err: RateLimitError) -> float:
    """Extract 'try again in X.XXs' from a Groq 429 error message."""
    m = re.search(r"try again in ([0-9.]+)s", str(err), re.IGNORECASE)
    return float(m.group(1)) + 0.5 if m else 5.0


def _groq_call(model: str, messages: list, max_tokens: int, json_mode: bool = True) -> str:
    """Single Groq call with up to 3 in-model retries on TPM rate limit."""
    from groq import BadRequestError
    for attempt in range(4):
        try:
            kwargs: dict = dict(model=model, messages=messages,
                                temperature=0.7, max_tokens=max_tokens)
            if json_mode:
                kwargs["response_format"] = {"type": "json_object"}
            resp = client.chat.completions.create(**kwargs)
            return resp.choices[0].message.content
        except RateLimitError as e:
            if attempt == 3:
                raise
            time.sleep(_parse_retry_delay(e))
        except BadRequestError:
            raise


def llm_json(system: str, user: str, model: str = SMALL, max_tokens: int = 700) -> dict:
    """Call Groq in JSON mode. SMALL by default; cascades to LARGE if SMALL is exhausted."""
    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]
    candidates = [SMALL, LARGE] if model == LARGE else [SMALL]
    last_err: Exception = RuntimeError("LLM call failed")
    for m in candidates:
        try:
            return json.loads(_groq_call(m, messages, max_tokens, json_mode=True))
        except RateLimitError as e:
            last_err = e
            continue
    raise last_err


# ── State helpers ─────────────────────────────────────────────────────────────

def _s(state: CaseState, key: str, default: str = "") -> str:
    val = state.get(key, default)
    return str(val) if val is not None else default

def _d(state: CaseState, key: str) -> dict:
    val = state.get(key, {})
    return val if isinstance(val, dict) else {}

def _l(state: CaseState, key: str) -> list:
    val = state.get(key, [])
    return val if isinstance(val, list) else []


# ── Difficulty instructions ───────────────────────────────────────────────────

_DIFFICULTY_INSTRUCTIONS = {
    "easy": (
        "Classic, textbook presentation. All findings clearly point to the diagnosis. "
        "Typical patient demographics. Distractors ruled out by a single stated finding."
    ),
    "medium": (
        "Slightly atypical presentation with 1–2 findings that could suggest an alternative "
        "diagnosis but are ultimately explained by the primary condition."
    ),
    "hard": (
        "Complicated or atypical presentation requiring multi-step reasoning. Include "
        "comorbidities that complicate management. Distractors require careful reasoning to exclude."
    ),
}


# ── Node 1: Topic Selector (SMALL, 120 tok) ───────────────────────────────────

def topic_selector(state: CaseState) -> dict:
    exam = get_exam()
    hint = state.get("requested_topic") or state.get("weak_topic")
    guidance = (
        f"The student needs practice on: {hint}. "
        f"Pick a specific subtopic within '{hint}' for USMLE Step 2 CK."
        if hint else exam.topic_guidance
    )
    q_type = random.choice(exam.question_types)

    result = llm_json(
        system=(
            "You select topics for a USMLE Step 2 CK practice case. "
            "Respond with JSON containing EXACTLY three keys: topic, subtopic, clinical_focus. "
            "No other keys. No nested objects."
        ),
        user=(
            f"{guidance}\n\n"
            "Return JSON with exactly these three fields "
            "(the example below shows format only — pick a different, specific topic):\n"
            '{"topic":"Pulmonology","subtopic":"Community-Acquired Pneumonia",'
            '"clinical_focus":"Choosing empiric antibiotic based on severity and comorbidities"}'
        ),
        model=SMALL,
        max_tokens=120,
    )

    return {
        "topic": result.get("topic", "General Medicine"),
        "subtopic": result.get("subtopic", "Clinical Presentation"),
        "clinical_focus": result.get("clinical_focus", ""),
        "question_type": q_type,
    }


# ── Node 2: Knowledge Retriever ───────────────────────────────────────────────

def knowledge_retriever(state: CaseState) -> dict:
    subtopic = _s(state, "subtopic")
    query = f"{subtopic} clinical presentation diagnosis management"
    chunks = qdrant_service.search(query, top_k=5)
    return {"rag_context": "\n\n".join(chunks)}


# ── Node 3: Image Retriever ───────────────────────────────────────────────────

def image_retriever(state: CaseState) -> dict:
    return {"image_url": image_service.get_image_url(_s(state, "subtopic"))}


# ── Node 4: Clinical Builder (SMALL, 900 tok) ─────────────────────────────────

def _flatten(value) -> Optional[str]:
    """Flatten any LLM output (str, dict, list) into a plain string."""
    if value is None or value == "":
        return None
    if isinstance(value, str):
        return value.strip() or None
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, list):
        return "\n".join(filter(None, (_flatten(v) for v in value)))
    if isinstance(value, dict):
        lines = []
        for k, v in value.items():
            flat = _flatten(v)
            if flat:
                lines.append(f"{k}: {flat}")
        return "\n".join(lines) or None
    return str(value)


def clinical_builder(state: CaseState) -> dict:
    rag = _s(state, "rag_context")
    rag_section = f"\n[Reference]\n{rag[:900]}\n[/Reference]" if rag else ""

    difficulty = state.get("difficulty", "medium")
    diff_instr = _DIFFICULTY_INSTRUCTIONS.get(difficulty, _DIFFICULTY_INSTRUCTIONS["medium"])

    retry_note = ""
    if feedback := _s(state, "validation_feedback"):
        retry_note = f"\n\nPREVIOUS VALIDATION ISSUES TO FIX:\n{feedback}"

    result = llm_json(
        system=(
            "Build a USMLE Step 2 CK clinical vignette. "
            "Write a detailed scenario with patient demographics, presenting symptoms, "
            "relevant history, physical exam findings, and key labs. "
            "All vitals, history, exam, and labs must be internally consistent. "
            "Use specific numbers throughout.\n"
            f"Difficulty: {difficulty.upper()} — {diff_instr}\n"
            "The 'labs' field must be a plain string of 'Key: Value' pairs separated by newlines. "
            "The 'history' and 'physical_exam' fields must be plain prose strings, never dicts. "
            "Follow AHA/ACC, IDSA, and US society guidelines. "
            "Respond ONLY with valid JSON."
        ),
        user=(
            f"Topic: {_s(state, 'topic')} — {_s(state, 'subtopic')}\n"
            f"Focus: {_s(state, 'clinical_focus')}"
            f"{rag_section}"
            f"{retry_note}\n\n"
            "Required JSON schema:\n"
            '{"patient":"52yo male, HTN, DM","chief_complaint":"Chest pain 2h",'
            '"vitals":{"bp":"158/94 mmHg","hr":102,"rr":20,"temp":"98.4°F","o2_sat":"94%"},'
            '"history":"HPI: 2-hour substernal chest pain radiating to left arm. PMH: HTN, DM. '
            'Meds: metformin, lisinopril. Smoker 20 pack-years.",'
            '"physical_exam":"Diaphoretic, mild distress. S1/S2 regular. No murmurs. Lungs clear.",'
            '"labs":"Troponin I: 2.8 ng/mL (elevated)\\nWBC: 11.2 K/uL\\nECG: ST elevation V1-V4"}'
        ),
        model=SMALL,
        max_tokens=900,
    )

    return {
        "patient": result.get("patient", ""),
        "chief_complaint": result.get("chief_complaint", ""),
        "vitals": result.get("vitals", {}),
        "history": _flatten(result.get("history")) or "",
        "physical_exam": _flatten(result.get("physical_exam")) or "",
        "labs": _flatten(result.get("labs")),
        "validation_feedback": "",
    }


# ── Node 5: Question Designer (LARGE → SMALL, 500 tok) ───────────────────────

def question_designer(state: CaseState) -> dict:
    vitals = _d(state, "vitals")
    q_type = state.get("question_type", "next_step")
    q_stem = QUESTION_STEMS.get(q_type, QUESTION_STEMS["next_step"])
    difficulty = state.get("difficulty", "medium")

    distractor_note = {
        "easy":   "Distractors should be common but clearly ruled out by one stated finding.",
        "medium": "Distractors require careful reasoning; each ruled out by a specific finding.",
        "hard":   "Distractors are highly plausible; each needs multi-step reasoning to exclude.",
    }.get(difficulty, "")

    result = llm_json(
        system=(
            f"Write a USMLE Step 2 CK {q_type.replace('_', ' ')} question.\n"
            f"Question stem to use verbatim: '{q_stem}'\n"
            "Write 4–5 answer choices. Each distractor must be plausible but ruled out by a "
            "specific case finding. The correct answer must be clearly supported by a stated finding.\n"
            f"{distractor_note}\n"
            "Respond ONLY with valid JSON."
        ),
        user=(
            f"Patient: {_s(state, 'patient')}\n"
            f"CC: {_s(state, 'chief_complaint')}\n"
            f"Vitals: BP {vitals.get('bp','?')}, HR {vitals.get('hr','?')}, O₂ {vitals.get('o2_sat','?')}\n"
            f"Exam: {_s(state, 'physical_exam')[:280]}\n"
            f"Labs: {_s(state, 'labs', 'N/A') or 'N/A'}\n"
            f"Diagnosis: {_s(state, 'subtopic')}\n\n"
            f'{{"question":"{q_stem}",'
            '"options":["A. Option text","B. Option text","C. Option text","D. Option text"],'
            '"correct_answer":"B"}}'
        ),
        model=LARGE,
        max_tokens=500,
    )

    raw_options = result.get("options", [])
    options = [
        o for o in raw_options
        if isinstance(o, str) and len(o) > 3 and o[0].upper() in "ABCDE" and o[1] in ".)"
    ]

    return {
        "question": result.get("question", q_stem),
        "options": options,
        "correct_answer": result.get("correct_answer", "A"),
    }


# ── Node 6: Validator (SMALL, 250 tok) ────────────────────────────────────────

def validator(state: CaseState) -> dict:
    retry_count = int(state.get("retry_count", 0))
    if retry_count >= 2:
        return {"is_valid": True, "validation_feedback": "", "retry_count": retry_count}

    vitals = _d(state, "vitals")
    result = llm_json(
        system=(
            "Validate this USMLE Step 2 CK case for medical accuracy. "
            "Flag only genuine clinical errors — wrong vitals for the diagnosis, "
            "contradictory findings, or an unsupported correct answer. "
            "Respond with valid JSON."
        ),
        user=(
            f"Dx: {_s(state, 'subtopic')} | Vitals: {json.dumps(vitals)}\n"
            f"Question: {_s(state, 'question')} | Correct: {_s(state, 'correct_answer')}\n"
            f"Exam: {_s(state, 'physical_exam')[:200]}\n\n"
            '{"is_valid":true,"issues":[]}'
        ),
        model=SMALL,
        max_tokens=250,
    )

    raw_issues = result.get("issues", [])
    issues = [
        item if isinstance(item, str)
        else item.get("issue") or item.get("description") or str(item)
        for item in raw_issues
        if item
    ]

    is_valid = result.get("is_valid", True) and len(issues) == 0
    return {
        "is_valid": is_valid,
        "validation_feedback": "; ".join(issues) if issues else "",
        "retry_count": retry_count + 1,
    }


# ── Node 7: Explanation Writer (SMALL, 600 tok) ───────────────────────────────

def explanation_writer(state: CaseState) -> dict:
    options = _l(state, "options")
    correct = _s(state, "correct_answer")
    correct_option = next(
        (o for o in options if o.upper().startswith(correct.upper())), correct
    )

    result = llm_json(
        system=(
            "You are a senior USMLE Step 2 CK faculty member debriefing a student after a practice case. "
            "Explain why the correct answer is right using specific case findings. "
            "Address each distractor briefly. Provide 3 board-relevant teaching points. "
            "Respond ONLY with valid JSON."
        ),
        user=(
            f"Diagnosis: {_s(state, 'subtopic')}\n"
            f"Correct answer: {correct_option}\n"
            f"All options: {json.dumps(options)}\n"
            f"Key findings: {_s(state, 'physical_exam')[:200]}\n\n"
            '{"explanation":"3-4 sentences explaining correct answer and ruling out distractors",'
            '"teaching_points":["High-yield point 1","High-yield point 2","High-yield point 3"]}'
        ),
        model=SMALL,
        max_tokens=600,
    )

    return {
        "explanation": result.get("explanation", ""),
        "teaching_points": result.get("teaching_points", []),
    }


# ── Node 8: Follow-up Generator (SMALL, 120 tok) ─────────────────────────────

def followup_generator(state: CaseState) -> dict:
    result = llm_json(
        system=(
            "Write one Socratic follow-up question probing a common misconception "
            "about this diagnosis. Respond with valid JSON."
        ),
        user=(
            f"Diagnosis: {_s(state, 'subtopic')} | Correct answer: {_s(state, 'correct_answer')}\n"
            '{"follow_up_question":"Why would you NOT choose X first in this case?"}'
        ),
        model=SMALL,
        max_tokens=120,
    )
    return {"follow_up_question": result.get("follow_up_question", "")}


# ── Routing ───────────────────────────────────────────────────────────────────

def _route_after_validation(state: CaseState) -> str:
    if not state.get("is_valid", True) and int(state.get("retry_count", 0)) < 2:
        return "retry"
    return "continue"


# ── Graph assembly ────────────────────────────────────────────────────────────

def _build_graph() -> any:
    g = StateGraph(CaseState)

    g.add_node("topic_selector",     topic_selector)
    g.add_node("knowledge_retriever", knowledge_retriever)
    g.add_node("image_retriever",    image_retriever)
    g.add_node("clinical_builder",   clinical_builder)
    g.add_node("question_designer",  question_designer)
    g.add_node("validator",          validator)
    g.add_node("explanation_writer", explanation_writer)
    g.add_node("followup_generator", followup_generator)

    g.set_entry_point("topic_selector")
    g.add_edge("topic_selector",      "knowledge_retriever")
    g.add_edge("knowledge_retriever", "image_retriever")
    g.add_edge("image_retriever",     "clinical_builder")
    g.add_edge("clinical_builder",    "question_designer")
    g.add_edge("question_designer",   "validator")
    g.add_conditional_edges(
        "validator",
        _route_after_validation,
        {"retry": "clinical_builder", "continue": "explanation_writer"},
    )
    g.add_edge("explanation_writer",  "followup_generator")
    g.add_edge("followup_generator",  END)

    return g.compile()


_pipeline = _build_graph()


# ── Public API ────────────────────────────────────────────────────────────────

def _compute_difficulty(student_id: str) -> str:
    """Derive easy/medium/hard from the student's overall accuracy."""
    try:
        from services import db
        perf = db.get_performance(student_id)
        total = sum(v["total"] for v in perf.values())
        correct = sum(v["correct"] for v in perf.values())
        if total < 5:
            return "easy"
        accuracy = correct / total * 100
        if accuracy < 50:
            return "easy"
        if accuracy < 72:
            return "medium"
        return "hard"
    except Exception:
        return "medium"


def generate_case(
    topic: Optional[str] = None,
    weak_topic: Optional[str] = None,
    student_id: str = "anon",
) -> dict:
    difficulty = _compute_difficulty(student_id)

    final = _pipeline.invoke({
        "student_id": student_id,
        "requested_topic": topic,
        "weak_topic": weak_topic,
        "difficulty": difficulty,
        "retry_count": 0,
        "is_valid": False,
        "validation_feedback": "",
        "rag_context": "",
        "image_url": None,
    })

    return {
        "patient":           _s(final, "patient"),
        "chief_complaint":   _s(final, "chief_complaint"),
        "vitals":            _d(final, "vitals"),
        "history":           _s(final, "history"),
        "physical_exam":     _s(final, "physical_exam"),
        "labs":              final.get("labs"),
        "question":          _s(final, "question"),
        "options":           _l(final, "options"),
        "correct_answer":    _s(final, "correct_answer"),
        "explanation":       _s(final, "explanation"),
        "teaching_points":   _l(final, "teaching_points"),
        "follow_up_question": _s(final, "follow_up_question"),
        "topic":             _s(final, "topic"),
        "subtopic":          _s(final, "subtopic"),
        "difficulty":        final.get("difficulty", difficulty),
        "question_type":     final.get("question_type", "next_step"),
        "image_url":         final.get("image_url"),
    }
