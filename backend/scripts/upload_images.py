"""
Phase 4 — Upload NIH Chest X-ray images to Supabase Storage.

Usage:
    cd backend
    python -m scripts.upload_images <path/to/images_dir> <path/to/Data_Entry_2017.csv>

Download the NIH dataset from:
    https://nihcc.app.box.com/v/ChestXray-NIHCC  (free, requires Box login)

Before running:
    1. Go to Supabase dashboard → Storage → Create bucket named 'medical-images' → enable Public
    2. Run supabase/migrations/002_images.sql in the SQL editor if you haven't already

The script uploads up to MAX_PER_DIAGNOSIS images per diagnosis to Supabase Storage
and inserts the public URLs into the 'images' table.
"""

import csv
import os
import random
import sys
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

BUCKET = "medical-images"
DIAGNOSES = [
    "Pneumonia",
    "Pleural Effusion",
    "Pneumothorax",
    "Cardiomegaly",
    "Edema",
    "Atelectasis",
    "Consolidation",
]
MAX_PER_DIAGNOSIS = 50


def build_diagnosis_map(csv_path: str) -> dict[str, list[str]]:
    mapping: dict[str, list[str]] = {d: [] for d in DIAGNOSES}
    with open(csv_path, newline="") as f:
        for row in csv.DictReader(f):
            filename = row["Image Index"]
            for label in row["Finding Labels"].split("|"):
                label = label.strip()
                if label in mapping:
                    mapping[label].append(filename)
    return mapping


def main(images_dir: str, csv_path: str) -> None:
    supabase_url = os.getenv("SUPABASE_URL")
    # Service role key bypasses RLS — required for server-side uploads
    supabase_key = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_ANON_KEY")
    if not supabase_url or not supabase_key:
        print("ERROR: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env")
        sys.exit(1)

    db = create_client(supabase_url, supabase_key)

    print("Parsing CSV labels...")
    diagnosis_map = build_diagnosis_map(csv_path)

    records = []
    images_path = Path(images_dir)

    for diagnosis, all_files in diagnosis_map.items():
        available = [f for f in all_files if (images_path / f).exists()]
        sample = random.sample(available, min(MAX_PER_DIAGNOSIS, len(available)))
        print(f"  {diagnosis}: uploading {len(sample)} of {len(available)} available images")

        for filename in sample:
            filepath = images_path / filename
            storage_path = f"nih/{filename}"

            try:
                with open(filepath, "rb") as f:
                    db.storage.from_(BUCKET).upload(
                        path=storage_path,
                        file=f.read(),
                        file_options={"content-type": "image/png", "upsert": "true"},
                    )

                public_url = db.storage.from_(BUCKET).get_public_url(storage_path)
                records.append({
                    "diagnosis": diagnosis,
                    "tags": [diagnosis.lower().replace(" ", "_")],
                    "r2_url": public_url,   # column name kept for compatibility
                    "source": "NIH",
                })
            except Exception as e:
                print(f"    ✗ {filename}: {e}")

    if not records:
        print("\nNo images uploaded — check your images directory path.")
        sys.exit(1)

    print(f"\nInserting {len(records)} records into Supabase images table...")
    for i in range(0, len(records), 500):
        db.table("images").insert(records[i : i + 500]).execute()

    print(f"✓ Done. {len(records)} images uploaded to Supabase Storage and indexed.")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python -m scripts.upload_images <images_dir> <Data_Entry_2017.csv>")
        sys.exit(1)
    main(sys.argv[1], sys.argv[2])
