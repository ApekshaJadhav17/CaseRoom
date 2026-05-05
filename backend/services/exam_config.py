"""
Exam configuration for USMLE Step 2 CK.
Single-exam design — everything is hardcoded around Step 2 CK clinical vignettes.
"""

from dataclasses import dataclass, field
from typing import List


@dataclass
class ExamConfig:
    id: str
    name: str
    short: str
    vignette_style: str
    question_style: str
    guideline_note: str
    topic_guidance: str
    teaching_style: str
    question_types: List[str] = field(default_factory=list)


STEP2 = ExamConfig(
    id="usmle_step2",
    name="USMLE Step 2 CK",
    short="Step 2 CK",
    vignette_style=(
        "Write a detailed USMLE-style clinical vignette with patient demographics, "
        "presenting symptoms, relevant history, physical exam findings, and key labs/imaging. "
        "All findings must be internally consistent and clearly point to the diagnosis."
    ),
    question_style=(
        "Write a USMLE Step 2 CK question with 4–5 answer choices. "
        "Each distractor must be plausible but ruled out by a specific case finding. "
        "The correct answer must be definitively supported by a stated finding."
    ),
    guideline_note="Follow AHA/ACC, IDSA, and major US society clinical guidelines.",
    topic_guidance=(
        "Pick a high-yield USMLE Step 2 CK topic. Rotate across: cardiology, pulmonology, "
        "gastroenterology, nephrology, neurology, infectious disease, psychiatry, "
        "OB/GYN, pediatrics, surgery, endocrinology, hematology."
    ),
    teaching_style=(
        "Explain why the correct answer is right using specific case findings. "
        "Address each distractor. Provide 3 high-yield board-relevant teaching points."
    ),
    question_types=["next_step", "diagnosis", "management", "investigation"],
)

# Question stem templates keyed by question_type
QUESTION_STEMS = {
    "next_step":    "What is the most appropriate next step in management?",
    "diagnosis":    "What is the most likely diagnosis?",
    "management":   "Which of the following is the best initial treatment?",
    "investigation": "Which investigation is most appropriate at this stage?",
}


def get_exam() -> ExamConfig:
    return STEP2
