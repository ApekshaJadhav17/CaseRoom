import logging
from fastapi import APIRouter, BackgroundTasks, HTTPException
from models.schemas import (
    CaseRequest, CaseResponse, AnswerSubmission,
    FeedbackResponse, FollowUpRequest, FollowUpResponse,
)
from services import groq_service, pipeline, db, cache_service, adaptive

router = APIRouter()
logger = logging.getLogger(__name__)


def _build_response(case_data: dict, case_id: str) -> CaseResponse:
    return CaseResponse(
        id=case_id,
        patient=case_data["patient"],
        chief_complaint=case_data["chief_complaint"],
        vitals=case_data["vitals"],
        history=case_data["history"],
        physical_exam=case_data["physical_exam"],
        labs=case_data.get("labs"),
        question=case_data["question"],
        options=case_data["options"],
        topic=case_data["topic"],
        subtopic=case_data["subtopic"],
        difficulty=case_data.get("difficulty"),
        image_url=case_data.get("image_url"),
    )


def _pregenerate(student_id: str) -> None:
    """Background task: generate the next case and cache it in Redis."""
    try:
        attempts = db.get_raw_attempts(student_id)
        weak_topic = adaptive.get_adaptive_topic(attempts) or db.get_weak_topic(student_id)
        case_data = pipeline.generate_case(weak_topic=weak_topic, student_id=student_id)
        cache_service.store_next_case(student_id, case_data)
    except Exception:
        logger.warning("Background pre-generation failed for %s", student_id, exc_info=True)


@router.post("/warmup", status_code=202)
async def warmup(request: CaseRequest, background_tasks: BackgroundTasks):
    """Pre-generates the first case on page load so the first request is instant."""
    if cache_service.is_available():
        existing = cache_service.pop_next_case(request.student_id)
        if existing:
            cache_service.store_next_case(request.student_id, existing)
        else:
            background_tasks.add_task(_pregenerate, request.student_id)
    return {"status": "warming up"}


@router.get("/cache-status")
async def cache_status():
    return {"redis_available": cache_service.is_available()}


@router.post("/generate", response_model=CaseResponse)
async def generate_case(request: CaseRequest):
    try:
        if not db.check_and_increment_cases(request.student_id):
            raise HTTPException(
                status_code=429,
                detail="Daily case limit reached. Upgrade to Pro for unlimited cases.",
            )

        # Serve from cache for adaptive (no topic) requests
        if not request.topic:
            cached = cache_service.pop_next_case(request.student_id)
            if cached:
                logger.info("Cache hit for student %s", request.student_id)
                case_id = db.save_case(cached)
                return _build_response(cached, case_id)

        # Determine weak topic via adaptive algorithm
        weak_topic = None
        if not request.topic:
            attempts = db.get_raw_attempts(request.student_id)
            weak_topic = adaptive.get_adaptive_topic(attempts) or db.get_weak_topic(request.student_id)

        case_data = pipeline.generate_case(
            topic=request.topic,
            weak_topic=weak_topic,
            student_id=request.student_id,
        )
        case_id = db.save_case(case_data)
        return _build_response(case_data, case_id)

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Case generation failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/submit", response_model=FeedbackResponse)
async def submit_answer(submission: AnswerSubmission, background_tasks: BackgroundTasks):
    try:
        case_data = db.get_case(submission.case_id)
        if not case_data:
            raise HTTPException(status_code=404, detail="Case not found")

        is_correct = (
            submission.selected_answer.upper().strip()
            == case_data["correct_answer"].upper().strip()
        )

        db.save_attempt(
            case_id=submission.case_id,
            student_id=submission.student_id,
            selected_answer=submission.selected_answer,
            is_correct=is_correct,
            topic=case_data["topic"],
            subtopic=case_data["subtopic"],
        )

        if cache_service.is_available():
            background_tasks.add_task(_pregenerate, submission.student_id)

        return FeedbackResponse(
            is_correct=is_correct,
            correct_answer=case_data["correct_answer"],
            explanation=case_data["explanation"],
            follow_up_question=case_data["follow_up_question"],
            teaching_points=case_data["teaching_points"],
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Answer submission failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/followup", response_model=FollowUpResponse)
async def follow_up(request: FollowUpRequest):
    try:
        case_data = db.get_case(request.case_id)
        if not case_data:
            raise HTTPException(status_code=404, detail="Case not found")

        answer = groq_service.generate_follow_up(
            case_data,
            request.question,
            request.conversation_history,
            selected_answer=request.selected_answer,
        )
        return FollowUpResponse(answer=answer)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Follow-up generation failed")
        raise HTTPException(status_code=500, detail=str(e))
