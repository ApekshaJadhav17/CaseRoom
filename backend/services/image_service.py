import os
import random
from typing import Optional

_TOPIC_KEYWORDS = {
    # Pulmonary
    "pneumonia": ["Pneumonia", "Consolidation"],
    "consolidation": ["Consolidation", "Pneumonia"],
    "pneumothorax": ["Pneumothorax"],
    "atelectasis": ["Atelectasis"],
    "ards": ["Edema", "Consolidation"],
    "asthma": ["Atelectasis"],
    "copd": ["Atelectasis"],
    "pleural effusion": ["Atelectasis"],       # mapped to available diagnosis
    "effusion": ["Atelectasis"],
    "pleural": ["Atelectasis"],
    "pulmonary embolism": ["Atelectasis"],     # PE can show Westermark/Hampton on CXR
    "pulmonary edema": ["Edema"],
    "edema": ["Edema"],
    # Cardiac — cardiomegaly or pulmonary edema are visible on CXR
    "heart failure": ["Cardiomegaly", "Edema"],
    "cardiomegaly": ["Cardiomegaly"],
    "cardiac tamponade": ["Cardiomegaly"],
    "pericardial": ["Cardiomegaly"],
    "stemi": ["Cardiomegaly"],
    "nstemi": ["Cardiomegaly"],
    "myocardial infarction": ["Cardiomegaly"],
    "atrial fibrillation": ["Cardiomegaly"],
    "aortic dissection": ["Cardiomegaly"],
    # Infectious / inflammatory
    "sepsis": ["Consolidation", "Edema"],
    "endocarditis": ["Consolidation"],
    "meningitis": ["Consolidation"],
}


def is_available() -> bool:
    """Images are available once the Supabase images table has been populated."""
    try:
        from services.db import get_client
        db = get_client()
        result = db.table("images").select("id").limit(1).execute()
        return len(result.data) > 0
    except Exception:
        return False


def _diagnoses_for_subtopic(subtopic: str) -> list[str]:
    lower = subtopic.lower()
    for keyword, diagnoses in _TOPIC_KEYWORDS.items():
        if keyword in lower:
            return diagnoses
    return []


def get_image_url(subtopic: str) -> Optional[str]:
    """Return a matching Supabase Storage image URL for the given subtopic, or None."""
    diagnoses = _diagnoses_for_subtopic(subtopic)
    if not diagnoses:
        return None

    try:
        from services.db import get_client
        db = get_client()

        for diagnosis in diagnoses:
            result = (
                db.table("images")
                .select("r2_url")
                .ilike("diagnosis", f"%{diagnosis}%")
                .limit(20)
                .execute()
            )
            if result.data:
                return random.choice(result.data)["r2_url"]
    except Exception:
        pass

    return None
