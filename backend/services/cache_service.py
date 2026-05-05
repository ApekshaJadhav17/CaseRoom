import os
import json
import logging
from typing import Optional
from upstash_redis import Redis

logger = logging.getLogger(__name__)

_redis: Optional[Redis] = None
CACHE_TTL = 1800  # 30 minutes


def get_redis() -> Optional[Redis]:
    global _redis
    if _redis is None:
        url = os.getenv("UPSTASH_REDIS_REST_URL", "")
        token = os.getenv("UPSTASH_REDIS_REST_TOKEN", "")
        if not url or not token:
            return None
        _redis = Redis(url=url, token=token)
    return _redis


def is_available() -> bool:
    return bool(
        os.getenv("UPSTASH_REDIS_REST_URL")
        and os.getenv("UPSTASH_REDIS_REST_TOKEN")
    )


def store_next_case(student_id: str, case_data: dict) -> None:
    r = get_redis()
    if not r:
        return
    try:
        r.set(f"next_case:{student_id}", json.dumps(case_data), ex=CACHE_TTL)
        logger.info("Pre-generated case cached for student %s", student_id)
    except Exception:
        logger.warning("Redis cache write failed", exc_info=True)


def pop_next_case(student_id: str) -> Optional[dict]:
    """Retrieve and delete the pre-generated case for this student."""
    r = get_redis()
    if not r:
        return None
    try:
        key = f"next_case:{student_id}"
        data = r.get(key)
        if data:
            r.delete(key)
            return json.loads(data)
    except Exception:
        logger.warning("Redis cache read failed", exc_info=True)
    return None
