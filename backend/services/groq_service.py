from services.dialogue_pipeline import respond as _dialogue_respond
from typing import Optional


def generate_follow_up(
    case_data: dict,
    question: str,
    conversation_history: list,
    selected_answer: Optional[str] = None,
) -> str:
    return _dialogue_respond(case_data, question, conversation_history, selected_answer=selected_answer)
