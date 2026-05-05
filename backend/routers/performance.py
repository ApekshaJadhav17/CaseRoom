from fastapi import APIRouter
from services import db, adaptive

router = APIRouter()


@router.get("/{student_id}")
async def get_performance(student_id: str):
    performance = db.get_performance(student_id)

    total_correct = sum(p["correct"] for p in performance.values())
    total_attempts = sum(p["total"] for p in performance.values())

    topics = [
        {
            "topic": topic,
            "correct": stats["correct"],
            "total": stats["total"],
            "accuracy": round(stats["correct"] / stats["total"] * 100, 1) if stats["total"] > 0 else 0,
        }
        for topic, stats in performance.items()
    ]
    topics.sort(key=lambda x: x["accuracy"])

    return {
        "student_id": student_id,
        "total_cases": total_attempts,
        "total_correct": total_correct,
        "overall_accuracy": round(total_correct / total_attempts * 100, 1) if total_attempts > 0 else 0,
        "topics": topics,
        "weakest_topic": topics[0]["topic"] if topics else None,
    }


@router.get("/mastery/{student_id}")
async def get_mastery(student_id: str):
    attempts = db.get_raw_attempts(student_id)
    return adaptive.get_mastery_stats(attempts)
