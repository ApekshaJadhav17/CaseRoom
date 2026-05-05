import os
from supabase import create_client, Client
from typing import Optional
import uuid
from datetime import datetime, timezone

_client: Optional[Client] = None


def get_client() -> Client:
    global _client
    if _client is None:
        url = os.getenv("SUPABASE_URL")
        # Service role key bypasses RLS — safe for server-side use only
        key = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_ANON_KEY")
        if not url or not key:
            raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set")
        _client = create_client(url, key)
    return _client


def save_case(case_data: dict) -> str:
    db = get_client()
    case_id = str(uuid.uuid4())
    db.table("cases").insert({
        "id": case_id,
        "topic": case_data["topic"],
        "subtopic": case_data["subtopic"],
        "case_data": case_data,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }).execute()
    return case_id


def get_case(case_id: str) -> Optional[dict]:
    db = get_client()
    result = db.table("cases").select("case_data").eq("id", case_id).execute()
    if not result.data:
        return None
    return result.data[0]["case_data"]


def save_attempt(
    case_id: str,
    student_id: str,
    selected_answer: str,
    is_correct: bool,
    topic: str,
    subtopic: str,
) -> None:
    db = get_client()
    db.table("attempts").insert({
        "case_id": case_id,
        "student_id": student_id,
        "selected_answer": selected_answer,
        "is_correct": is_correct,
        "topic": topic,
        "subtopic": subtopic,
        "attempted_at": datetime.now(timezone.utc).isoformat(),
    }).execute()


def get_performance(student_id: str) -> dict:
    db = get_client()
    result = (
        db.table("attempts")
        .select("topic, subtopic, is_correct")
        .eq("student_id", student_id)
        .execute()
    )

    performance: dict[str, dict] = {}
    for attempt in result.data:
        topic = attempt["topic"]
        if topic not in performance:
            performance[topic] = {"correct": 0, "total": 0}
        performance[topic]["total"] += 1
        if attempt["is_correct"]:
            performance[topic]["correct"] += 1

    return performance


FREE_DAILY_LIMIT = 10


def get_profile(student_id: str) -> dict:
    db = get_client()
    result = db.table("profiles").select("*").eq("id", student_id).execute()
    if result.data:
        return result.data[0]
    # Auto-upsert for users created before auth was added
    db.table("profiles").upsert({"id": student_id, "plan": "free"}).execute()
    return {"id": student_id, "plan": "free", "cases_today": 0, "cases_reset_date": None}


def check_and_increment_cases(student_id: str) -> bool:
    """Returns True if allowed (and bumps the counter), False if daily limit hit."""
    from datetime import date
    db = get_client()
    today = date.today().isoformat()

    profile = get_profile(student_id)

    if profile.get("plan") == "pro":
        return True

    if profile.get("cases_reset_date") != today:
        db.table("profiles").update({"cases_today": 1, "cases_reset_date": today}).eq("id", student_id).execute()
        return True

    count = profile.get("cases_today", 0)
    if count >= FREE_DAILY_LIMIT:
        return False

    db.table("profiles").update({"cases_today": count + 1}).eq("id", student_id).execute()
    return True


def set_plan(student_id: str, plan: str, stripe_customer_id: str = None, stripe_subscription_id: str = None) -> None:
    db = get_client()
    data: dict = {"plan": plan}
    if stripe_customer_id:
        data["stripe_customer_id"] = stripe_customer_id
    if stripe_subscription_id:
        data["stripe_subscription_id"] = stripe_subscription_id
    db.table("profiles").upsert({"id": student_id, **data}).execute()


def revoke_plan_by_customer(stripe_customer_id: str) -> None:
    db = get_client()
    db.table("profiles").update({"plan": "free", "stripe_subscription_id": None}).eq(
        "stripe_customer_id", stripe_customer_id
    ).execute()


def get_raw_attempts(student_id: str) -> list[dict]:
    """Return all attempts with timestamps for adaptive algorithm."""
    db = get_client()
    result = (
        db.table("attempts")
        .select("topic, subtopic, is_correct, attempted_at")
        .eq("student_id", student_id)
        .order("attempted_at", desc=False)
        .execute()
    )
    return result.data or []


def get_weak_topic(student_id: str) -> Optional[str]:
    performance = get_performance(student_id)
    weakest = None
    lowest_rate = 1.0

    for topic, stats in performance.items():
        if stats["total"] >= 3:
            rate = stats["correct"] / stats["total"]
            if rate < lowest_rate:
                lowest_rate = rate
                weakest = topic

    return weakest
