import re
from pydantic import BaseModel, field_validator
from typing import Optional, List


class CaseRequest(BaseModel):
    student_id: str
    topic: Optional[str] = None


class VitalSigns(BaseModel):
    bp: str
    hr: int
    rr: Optional[int] = None
    temp: Optional[str] = None
    o2_sat: Optional[str] = None

    @field_validator("hr", "rr", mode="before")
    @classmethod
    def extract_integer(cls, v):
        if v is None or isinstance(v, int):
            return v
        if isinstance(v, float):
            return int(v)
        if isinstance(v, str):
            m = re.search(r"\d+", v)
            if m:
                return int(m.group())
        return v


class CaseResponse(BaseModel):
    id: str
    patient: str
    chief_complaint: str
    vitals: VitalSigns
    history: str
    physical_exam: str
    labs: Optional[str] = None
    question: str
    options: List[str]
    topic: str
    subtopic: str
    difficulty: Optional[str] = None
    image_url: Optional[str] = None


class AnswerSubmission(BaseModel):
    case_id: str
    student_id: str
    selected_answer: str


class FeedbackResponse(BaseModel):
    is_correct: bool
    correct_answer: str
    explanation: str
    follow_up_question: str
    teaching_points: List[str]


class FollowUpRequest(BaseModel):
    case_id: str
    student_id: str
    question: str
    conversation_history: List[dict]
    selected_answer: Optional[str] = None   # the answer letter the student chose


class FollowUpResponse(BaseModel):
    answer: str
