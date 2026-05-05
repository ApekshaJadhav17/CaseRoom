"""
Phase 3 — Ingest PubMed abstracts into Qdrant.

Usage:
    cd backend
    python -m scripts.ingest_pubmed

Requires QDRANT_URL and QDRANT_API_KEY in backend/.env
Fetches ~8 PubMed abstracts per topic (300 total), chunks them, and embeds
them into the 'medical_knowledge' Qdrant collection using fastembed.
"""

import os
import sys
import time
import uuid
import xml.etree.ElementTree as ET

import requests
from dotenv import load_dotenv
from qdrant_client import QdrantClient

load_dotenv()

NCBI = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
COLLECTION = "medical_knowledge"
CHUNK_WORDS = 350
RESULTS_PER_TOPIC = 8

TOPICS = [
    # (topic, subtopic, search_query)
    ("Cardiology", "STEMI", "ST elevation myocardial infarction management diagnosis"),
    ("Cardiology", "NSTEMI", "non-ST elevation myocardial infarction ACS management"),
    ("Cardiology", "Heart Failure", "acute heart failure clinical presentation management"),
    ("Cardiology", "Atrial Fibrillation", "atrial fibrillation diagnosis anticoagulation rate control"),
    ("Cardiology", "Aortic Dissection", "aortic dissection type A B diagnosis management"),
    ("Cardiology", "Cardiac Tamponade", "cardiac tamponade pericardial effusion diagnosis"),
    ("Pulmonology", "Community Acquired Pneumonia", "community acquired pneumonia clinical diagnosis treatment"),
    ("Pulmonology", "COPD Exacerbation", "COPD acute exacerbation management treatment"),
    ("Pulmonology", "Pulmonary Embolism", "pulmonary embolism Wells criteria diagnosis anticoagulation"),
    ("Pulmonology", "Pneumothorax", "spontaneous pneumothorax management tension"),
    ("Pulmonology", "Asthma Exacerbation", "asthma acute exacerbation management stepwise"),
    ("Pulmonology", "ARDS", "acute respiratory distress syndrome diagnosis management ventilation"),
    ("Gastroenterology", "Upper GI Bleed", "upper gastrointestinal bleeding peptic ulcer management"),
    ("Gastroenterology", "Acute Appendicitis", "acute appendicitis diagnosis presentation management"),
    ("Gastroenterology", "Acute Cholecystitis", "acute cholecystitis diagnosis management cholelithiasis"),
    ("Gastroenterology", "Acute Pancreatitis", "acute pancreatitis Ranson criteria management"),
    ("Gastroenterology", "Diverticulitis", "acute diverticulitis diagnosis management complications"),
    ("Gastroenterology", "Bowel Obstruction", "small bowel obstruction diagnosis management"),
    ("Nephrology", "Acute Kidney Injury", "acute kidney injury prerenal intrinsic postrenal diagnosis"),
    ("Nephrology", "Hyponatremia", "hyponatremia SIADH diagnosis management correction"),
    ("Nephrology", "Hyperkalemia", "hyperkalemia ECG changes treatment management"),
    ("Nephrology", "Nephrotic Syndrome", "nephrotic syndrome causes diagnosis management"),
    ("Nephrology", "CKD Complications", "chronic kidney disease complications management"),
    ("Neurology", "Ischemic Stroke", "ischemic stroke tPA thrombolysis management NIHSS"),
    ("Neurology", "Subarachnoid Hemorrhage", "subarachnoid hemorrhage thunderclap headache diagnosis"),
    ("Neurology", "Bacterial Meningitis", "bacterial meningitis lumbar puncture empiric antibiotics"),
    ("Neurology", "Status Epilepticus", "status epilepticus management benzodiazepines"),
    ("Infectious Disease", "Sepsis", "sepsis septic shock Surviving Sepsis Campaign management"),
    ("Infectious Disease", "Infective Endocarditis", "infective endocarditis Duke criteria diagnosis management"),
    ("Infectious Disease", "Pyelonephritis", "acute pyelonephritis diagnosis treatment antibiotics"),
]


def search_pubmed(query: str, max_results: int = RESULTS_PER_TOPIC) -> list[str]:
    resp = requests.get(
        f"{NCBI}/esearch.fcgi",
        params={
            "db": "pubmed",
            "term": f"{query}[Title/Abstract]",
            "retmax": max_results,
            "retmode": "json",
            "sort": "relevance",
        },
        timeout=15,
    )
    resp.raise_for_status()
    return resp.json()["esearchresult"]["idlist"]


def fetch_abstracts(pmids: list[str]) -> list[dict]:
    if not pmids:
        return []
    resp = requests.get(
        f"{NCBI}/efetch.fcgi",
        params={"db": "pubmed", "id": ",".join(pmids), "rettype": "abstract", "retmode": "xml"},
        timeout=20,
    )
    resp.raise_for_status()

    root = ET.fromstring(resp.content)
    articles = []
    for article in root.findall(".//PubmedArticle"):
        title_el = article.find(".//ArticleTitle")
        abstract_els = article.findall(".//AbstractText")
        title = "".join(title_el.itertext()) if title_el is not None else ""
        abstract = " ".join("".join(el.itertext()) for el in abstract_els)
        if abstract.strip():
            articles.append({"title": title.strip(), "abstract": abstract.strip()})
    return articles


def chunk(text: str) -> list[str]:
    words = text.split()
    return [
        " ".join(words[i : i + CHUNK_WORDS])
        for i in range(0, len(words), CHUNK_WORDS)
        if words[i : i + CHUNK_WORDS]
    ]


def main() -> None:
    url = os.getenv("QDRANT_URL")
    api_key = os.getenv("QDRANT_API_KEY")
    if not url:
        print("ERROR: QDRANT_URL not set in .env")
        sys.exit(1)

    client = QdrantClient(url=url, api_key=api_key or None)

    all_docs: list[str] = []
    all_meta: list[dict] = []

    for topic, subtopic, query in TOPICS:
        print(f"  Fetching: {topic} — {subtopic}")
        try:
            pmids = search_pubmed(query)
            articles = fetch_abstracts(pmids)
            new_chunks = 0
            for article in articles:
                full = f"{article['title']}. {article['abstract']}"
                for c in chunk(full):
                    all_docs.append(c)
                    all_meta.append({"topic": topic, "subtopic": subtopic, "title": article["title"][:120]})
                    new_chunks += 1
            print(f"    ✓ {len(articles)} articles → {new_chunks} chunks")
            time.sleep(0.35)  # NCBI rate limit: stay under 3 req/s
        except Exception as e:
            print(f"    ✗ Skipped ({e})")
            continue

    if not all_docs:
        print("\nNo documents fetched — check network and NCBI API availability.")
        sys.exit(1)

    print(f"\nUploading {len(all_docs)} chunks to Qdrant collection '{COLLECTION}'...")
    ids = [str(uuid.uuid4()) for _ in all_docs]

    # Batch upload to avoid memory issues
    BATCH = 64
    for i in range(0, len(all_docs), BATCH):
        client.add(
            collection_name=COLLECTION,
            documents=all_docs[i : i + BATCH],
            metadata=all_meta[i : i + BATCH],
            ids=ids[i : i + BATCH],
        )
        print(f"  Uploaded {min(i + BATCH, len(all_docs))}/{len(all_docs)}")

    print(f"\n✓ Done. {len(all_docs)} chunks stored in '{COLLECTION}'.")
    print("  Run this script again to add more topics — duplicate chunks are harmless.")


if __name__ == "__main__":
    main()
