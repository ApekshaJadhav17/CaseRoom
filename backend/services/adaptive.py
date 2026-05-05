"""
Adaptive learning algorithm for USMLE Step 2 CK.

Implements:
  - Canonical Step 2 CK curriculum (what topics exist)
  - 6-level mastery per topic: unseen → learning → developing → proficient → due_for_review → mastered
  - Spaced repetition: mastered topics resurface after 7 days
  - Priority queue for topic selection: developing > due_for_review > learning > unseen > proficient
"""

import random
from datetime import datetime, timezone
from typing import Optional

SPACED_REPETITION_DAYS = 7

CURRICULUM = [
    # Cardiology
    "STEMI", "NSTEMI / Unstable Angina", "Heart Failure with Reduced EF",
    "Atrial Fibrillation", "Aortic Dissection", "Cardiac Tamponade",
    "Hypertensive Emergency", "Hypertrophic Cardiomyopathy",
    # Pulmonology
    "Community-Acquired Pneumonia", "COPD Exacerbation",
    "Pulmonary Embolism", "Pneumothorax", "Asthma Exacerbation", "ARDS",
    "Pleural Effusion",
    # Gastroenterology
    "Upper GI Bleed", "Lower GI Bleed", "Appendicitis",
    "Acute Cholecystitis", "Acute Pancreatitis",
    "Diverticulitis", "Bowel Obstruction", "Inflammatory Bowel Disease",
    "Hepatic Encephalopathy",
    # Nephrology
    "Acute Kidney Injury", "Hyponatremia", "Hyperkalemia",
    "Nephrotic Syndrome", "CKD Complications", "Glomerulonephritis",
    # Neurology
    "Ischemic Stroke", "Hemorrhagic Stroke", "Subarachnoid Hemorrhage",
    "Bacterial Meningitis", "Status Epilepticus", "Guillain-Barre Syndrome",
    "Transient Ischemic Attack",
    # Infectious Disease
    "Sepsis", "Infective Endocarditis", "Pyelonephritis",
    "Sexually Transmitted Infections", "HIV Management",
    "Clostridium Difficile", "Tuberculosis",
    # OB/GYN
    "Preeclampsia", "Ectopic Pregnancy", "Placenta Previa",
    "Gestational Diabetes", "Postpartum Hemorrhage", "Cervical Cancer Screening",
    # Psychiatry
    "Major Depressive Disorder", "Bipolar Disorder", "Schizophrenia",
    "Generalized Anxiety Disorder", "Substance Use Disorders",
    "Suicidal Ideation Management",
    # Pediatrics
    "Febrile Seizure", "Kawasaki Disease", "Epiglottitis",
    "Intussusception", "Congenital Heart Disease", "RSV Bronchiolitis",
    # Endocrinology
    "Diabetic Ketoacidosis", "Thyroid Storm", "Adrenal Crisis",
    "Cushing Syndrome", "Pheochromocytoma", "Hyperthyroidism",
    # Surgery / Emergency
    "Acute Abdomen", "Trauma Management", "Burn Management",
    "Tension Pneumothorax",
    # Hematology
    "Sickle Cell Crisis", "Deep Vein Thrombosis", "ITP",
    "Anemia Workup",
]


# ── Mastery logic ─────────────────────────────────────────────────────────────

def _days_since(iso_timestamp: Optional[str]) -> float:
    if not iso_timestamp:
        return 9999.0
    try:
        ts = datetime.fromisoformat(iso_timestamp.replace("Z", "+00:00"))
        return (datetime.now(timezone.utc) - ts).total_seconds() / 86400
    except Exception:
        return 9999.0


def get_mastery_level(total: int, correct: int, days_since_last: float) -> str:
    if total == 0:
        return "unseen"
    if total < 3:
        return "learning"
    acc = correct / total
    if acc < 0.60:
        return "developing"
    if acc < 0.80:
        return "proficient"
    if days_since_last > SPACED_REPETITION_DAYS:
        return "due_for_review"
    return "mastered"


def _build_topic_stats(attempts: list[dict]) -> dict[str, dict]:
    stats: dict[str, dict] = {}
    for a in attempts:
        topic = a.get("topic", "")
        if not topic:
            continue
        if topic not in stats:
            stats[topic] = {"correct": 0, "total": 0, "last_seen": None}
        stats[topic]["total"] += 1
        if a.get("is_correct"):
            stats[topic]["correct"] += 1
        ts = a.get("attempted_at")
        if ts and (stats[topic]["last_seen"] is None or ts > stats[topic]["last_seen"]):
            stats[topic]["last_seen"] = ts
    return stats


# ── Public API ────────────────────────────────────────────────────────────────

def get_adaptive_topic(attempts: list[dict]) -> Optional[str]:
    """
    Return the highest-priority topic the student should study next.

    Priority:
      1. developing  — struggling, reinforce immediately
      2. due_for_review — mastered but stale (spaced repetition)
      3. learning    — started, fewer than 3 attempts
      4. unseen      — never attempted, expand coverage
      5. proficient  — doing well, not yet mastered
    """
    topic_stats = _build_topic_stats(attempts)

    buckets: dict[str, list[str]] = {
        "developing": [], "due_for_review": [], "learning": [], "unseen": [], "proficient": [],
    }

    for topic in CURRICULUM:
        s = topic_stats.get(topic, {})
        level = get_mastery_level(
            s.get("total", 0), s.get("correct", 0), _days_since(s.get("last_seen"))
        )
        if level in buckets:
            buckets[level].append(topic)

    for priority in ["developing", "due_for_review", "learning", "unseen", "proficient"]:
        candidates = buckets[priority]
        if candidates:
            return random.choice(candidates[:8])

    return None


def get_mastery_stats(attempts: list[dict]) -> dict:
    """Return full mastery breakdown for the performance dashboard."""
    topic_stats = _build_topic_stats(attempts)

    distribution: dict[str, int] = {
        "unseen": 0, "learning": 0, "developing": 0,
        "proficient": 0, "due_for_review": 0, "mastered": 0,
    }
    due_for_review: list[str] = []
    developing: list[str] = []
    topic_details: list[dict] = []

    for topic in CURRICULUM:
        s = topic_stats.get(topic, {})
        total = s.get("total", 0)
        correct = s.get("correct", 0)
        days = _days_since(s.get("last_seen"))
        level = get_mastery_level(total, correct, days)
        distribution[level] = distribution.get(level, 0) + 1

        if level == "due_for_review":
            due_for_review.append(topic)
        if level == "developing":
            developing.append(topic)
        if total > 0:
            topic_details.append({
                "topic": topic,
                "total": total,
                "correct": correct,
                "accuracy": round(correct / total * 100),
                "mastery": level,
                "days_since": round(days, 1) if days < 9999 else None,
            })

    covered = sum(1 for t in CURRICULUM if topic_stats.get(t, {}).get("total", 0) > 0)

    return {
        "curriculum_size": len(CURRICULUM),
        "covered": covered,
        "mastery_distribution": distribution,
        "due_for_review": due_for_review[:10],
        "developing_topics": developing[:10],
        "topic_details": sorted(topic_details, key=lambda x: x["accuracy"]),
    }
