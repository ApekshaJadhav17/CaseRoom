"""
Ingest USPSTF guidelines + StatPearls outpatient content for USMLE Step 3
into Qdrant 'step3_knowledge' collection.

Step 3 is heavily preventive medicine and ambulatory care. This script pulls:
  - StatPearls articles on outpatient chronic disease management
  - USPSTF screening recommendation content (via PubMed)
  - Biostatistics and study design content

Usage:
    cd backend
    python -m scripts.ingest_guidelines_step3

Requires QDRANT_URL and QDRANT_API_KEY in backend/.env
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
COLLECTION = "step3_knowledge"
CHUNK_WORDS = 300
RESULTS_PER_TOPIC = 6
NCBI_API_KEY = os.getenv("NCBI_API_KEY")
_REQ_DELAY = 0.15 if NCBI_API_KEY else 0.5

# ── Step 3 topic list ─────────────────────────────────────────────────────────
# (display_subject, display_subtopic, pubmed_search_query)

STEP3_TOPICS = [
    # ── USPSTF screening recommendations ─────────────────────────────────────
    ("Screening", "Colorectal Cancer Screening", "colorectal cancer screening colonoscopy USPSTF recommendation"),
    ("Screening", "Breast Cancer Screening", "breast cancer mammography screening USPSTF age"),
    ("Screening", "Cervical Cancer Screening", "cervical cancer Pap smear HPV screening interval"),
    ("Screening", "Lung Cancer Screening", "lung cancer low dose CT screening smoker USPSTF"),
    ("Screening", "Prostate Cancer Screening", "prostate cancer PSA screening USPSTF recommendation"),
    ("Screening", "AAA Screening", "abdominal aortic aneurysm ultrasound screening smoker"),
    ("Screening", "Osteoporosis Screening", "osteoporosis DEXA screening postmenopausal USPSTF"),
    ("Screening", "Hypertension Screening", "hypertension blood pressure screening ambulatory"),
    ("Screening", "Diabetes Type 2 Screening", "diabetes type 2 screening fasting glucose USPSTF"),
    ("Screening", "Lipid and Statin Screening", "hyperlipidemia statin cardiovascular risk screening"),
    ("Screening", "Depression Screening", "depression PHQ-9 screening primary care"),
    ("Screening", "Obesity Screening", "obesity BMI screening weight loss counseling"),
    ("Screening", "Alcohol Use Screening", "alcohol use disorder AUDIT screening brief intervention"),
    ("Screening", "HIV Screening", "HIV screening USPSTF recommendation testing"),
    ("Screening", "STI Screening", "sexually transmitted infection chlamydia gonorrhea screening"),
    ("Screening", "Fall Prevention", "fall prevention elderly older adults screening intervention"),
    # ── Chronic disease outpatient management ────────────────────────────────
    ("Chronic Disease", "Diabetes Outpatient Management", "type 2 diabetes mellitus outpatient HbA1c glycemic target"),
    ("Chronic Disease", "Hypertension Management", "hypertension outpatient treatment goal JNC antihypertensive"),
    ("Chronic Disease", "Heart Failure GDMT", "heart failure guideline directed medical therapy outpatient"),
    ("Chronic Disease", "CKD Outpatient Management", "chronic kidney disease outpatient management progression"),
    ("Chronic Disease", "COPD Maintenance", "COPD GOLD guidelines maintenance inhaler exacerbation prevention"),
    ("Chronic Disease", "Asthma Step Therapy", "asthma stepwise therapy NAEPP outpatient controller"),
    ("Chronic Disease", "Atrial Fibrillation Anticoagulation", "atrial fibrillation CHA2DS2 anticoagulation outpatient"),
    ("Chronic Disease", "Secondary Prevention CAD", "coronary artery disease secondary prevention aspirin statin"),
    ("Chronic Disease", "Hypothyroidism Management", "hypothyroidism levothyroxine TSH goal outpatient"),
    ("Chronic Disease", "Obesity Management", "obesity pharmacotherapy GLP-1 lifestyle outpatient"),
    # ── Immunizations ────────────────────────────────────────────────────────
    ("Prevention", "Adult Immunization Schedule", "adult immunization schedule CDC ACIP vaccine"),
    ("Prevention", "Pneumococcal Vaccine", "pneumococcal vaccine PCV PPSV23 high risk indication"),
    ("Prevention", "Herpes Zoster Vaccine", "herpes zoster shingrix recombinant vaccine indication"),
    ("Prevention", "HPV Vaccine", "HPV human papillomavirus vaccine cervical cancer prevention"),
    ("Prevention", "Smoking Cessation", "smoking cessation varenicline NRT counseling pharmacotherapy"),
    ("Prevention", "Aspirin Primary Prevention", "aspirin primary prevention cardiovascular USPSTF"),
    # ── Biostatistics ─────────────────────────────────────────────────────────
    ("Biostatistics", "Sensitivity and Specificity", "sensitivity specificity screening test performance"),
    ("Biostatistics", "Positive Predictive Value", "positive predictive value negative prevalence Bayes"),
    ("Biostatistics", "Likelihood Ratios", "likelihood ratio positive negative ROC curve"),
    ("Biostatistics", "NNT and NNH", "number needed to treat NNT NNH absolute risk reduction"),
    ("Biostatistics", "Relative Risk and Odds Ratio", "relative risk odds ratio cohort case control study"),
    ("Biostatistics", "Confidence Intervals", "confidence interval p value statistical significance"),
    ("Biostatistics", "Study Design", "randomized controlled trial cohort case control study design"),
    ("Biostatistics", "Bias and Confounding", "bias confounding selection information observational"),
    ("Biostatistics", "Meta-Analysis", "meta-analysis systematic review heterogeneity"),
    # ── Ambulatory / outpatient medicine ─────────────────────────────────────
    ("Ambulatory", "Outpatient Headache", "migraine tension headache outpatient management prevention"),
    ("Ambulatory", "Low Back Pain", "low back pain outpatient conservative management"),
    ("Ambulatory", "Outpatient Depression", "major depressive disorder outpatient antidepressant therapy"),
    ("Ambulatory", "Outpatient Anxiety", "generalized anxiety disorder outpatient pharmacotherapy SSRI"),
    ("Ambulatory", "GERD Outpatient", "GERD gastroesophageal reflux outpatient PPI management"),
    ("Ambulatory", "Irritable Bowel Syndrome", "irritable bowel syndrome outpatient diagnosis management"),
    ("Ambulatory", "Outpatient UTI", "urinary tract infection uncomplicated outpatient antibiotic"),
    ("Ambulatory", "Outpatient Pneumonia", "community acquired pneumonia outpatient PORT PSI treatment"),
    ("Ambulatory", "Insomnia", "insomnia cognitive behavioral therapy sleep hygiene outpatient"),
    ("Ambulatory", "Knee and Hip Osteoarthritis", "osteoarthritis knee hip outpatient conservative management"),
    # ── Geriatrics (high-yield Step 3) ───────────────────────────────────────
    ("Geriatrics", "Delirium vs Dementia", "delirium dementia differential diagnosis elderly"),
    ("Geriatrics", "Polypharmacy", "polypharmacy Beers criteria elderly adverse drug events"),
    ("Geriatrics", "Advance Care Planning", "advance directive living will healthcare proxy"),
    ("Geriatrics", "Elder Abuse", "elder abuse neglect recognition mandatory reporting"),
    # ── Ethics and legal (Step 3 high-yield) ─────────────────────────────────
    ("Ethics", "Informed Consent", "informed consent capacity competence autonomy"),
    ("Ethics", "Medical Error Disclosure", "medical error disclosure apology transparency"),
    ("Ethics", "End of Life Care", "palliative care hospice goals of care end of life"),
]


def _ncbi_get(url: str, params: dict, retries: int = 4) -> dict:
    if NCBI_API_KEY:
        params["api_key"] = NCBI_API_KEY
    for attempt in range(retries):
        time.sleep(_REQ_DELAY)
        try:
            resp = requests.get(url, params=params, timeout=20)
            if resp.status_code == 429:
                wait = 2 ** attempt + 2
                print(f"    ⏳ 429 rate limit — waiting {wait}s")
                time.sleep(wait)
                continue
            resp.raise_for_status()
            return resp.json()
        except requests.RequestException as exc:
            if attempt == retries - 1:
                raise
            time.sleep(2 ** attempt)
    return {}


def search_pubmed(query: str, max_results: int = RESULTS_PER_TOPIC) -> list[str]:
    # Try StatPearls first
    data = _ncbi_get(
        f"{NCBI}/esearch.fcgi",
        {
            "db": "pubmed",
            "term": f"{query} AND StatPearls[Journal]",
            "retmax": max_results,
            "retmode": "json",
            "sort": "relevance",
        },
    )
    pmids = data.get("esearchresult", {}).get("idlist", [])

    # Fall back to general PubMed guideline/review articles
    if not pmids:
        data = _ncbi_get(
            f"{NCBI}/esearch.fcgi",
            {
                "db": "pubmed",
                "term": f"{query}[Title/Abstract] AND (guideline[pt] OR review[pt])",
                "retmax": max_results,
                "retmode": "json",
                "sort": "relevance",
            },
        )
        pmids = data.get("esearchresult", {}).get("idlist", [])

    return pmids


def fetch_abstracts(pmids: list[str]) -> list[dict]:
    if not pmids:
        return []
    params: dict = {"db": "pubmed", "id": ",".join(pmids), "rettype": "abstract", "retmode": "xml"}
    if NCBI_API_KEY:
        params["api_key"] = NCBI_API_KEY
    time.sleep(_REQ_DELAY)
    resp = requests.get(f"{NCBI}/efetch.fcgi", params=params, timeout=25)
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


def chunk(text: str, max_words: int = CHUNK_WORDS) -> list[str]:
    words = text.split()
    return [
        " ".join(words[i: i + max_words])
        for i in range(0, len(words), max_words)
        if words[i: i + max_words]
    ]


# ── Static USPSTF core facts ──────────────────────────────────────────────────
# These don't come from PubMed — they're the exact screening recommendations
# that Step 3 tests. Embedded directly so the LLM has them verbatim.

USPSTF_FACTS = [
    ("Screening", "Colorectal Cancer", "USPSTF recommends colorectal cancer screening for all adults aged 45-75. Options: annual FIT/FOBT, flexible sigmoidoscopy every 5 years, CT colonography every 5 years, or colonoscopy every 10 years. For age 76-85, individualize based on health status. Stop screening after age 85."),
    ("Screening", "Breast Cancer", "USPSTF recommends biennial mammography starting at age 40 (Grade B). Women aged 40-49 should individualize based on preference. High-risk women (BRCA1/2, family history) may need earlier/more frequent screening with MRI."),
    ("Screening", "Cervical Cancer", "USPSTF: Pap smear alone every 3 years for ages 21-29. Co-testing (Pap + HPV) or HPV testing alone every 5 years for ages 30-65. Discontinue after 65 in adequately screened women."),
    ("Screening", "Lung Cancer", "USPSTF recommends annual low-dose CT for adults aged 50-80 with 20+ pack-year history who currently smoke or quit within 15 years. Discontinue if patient has not smoked for 15 years or develops a health condition limiting curative treatment."),
    ("Screening", "AAA", "USPSTF recommends one-time abdominal ultrasound for AAA in men aged 65-75 who have ever smoked (Grade B). No recommendation for women."),
    ("Screening", "Osteoporosis", "USPSTF recommends DEXA screening in women aged 65+. Screen younger postmenopausal women at elevated risk (use FRAX score). No recommendation for men."),
    ("Screening", "Diabetes", "USPSTF recommends screening for prediabetes and type 2 diabetes in adults aged 35-70 who are overweight or obese. Use fasting plasma glucose, HbA1c, or OGTT."),
    ("Screening", "Hypertension", "USPSTF recommends blood pressure screening in adults 18+. Confirm elevated BP readings with ambulatory blood pressure monitoring (ABPM) before diagnosis."),
    ("Screening", "Depression", "USPSTF recommends screening for depression in general adult population including pregnant/postpartum women (Grade B). Use PHQ-2 then PHQ-9 if positive."),
    ("Screening", "Lipids", "ACC/AHA: Initiate statin therapy in adults 40-75 with LDL 70-189 and 10-year ASCVD risk ≥10% (moderate-intensity). High intensity for ASCVD risk ≥20%. Use Pooled Cohort Equation."),
    ("Screening", "HIV", "USPSTF recommends HIV screening for all adults aged 15-65. Screen more frequently in high-risk individuals. One-time screening in adults outside this range if at increased risk."),
    ("Prevention", "Aspirin Primary Prevention", "USPSTF 2022: Do NOT routinely recommend aspirin for primary prevention of CVD in adults 60+. For adults 40-59 with 10-year CVD risk ≥10%, individualize the decision (Grade C)."),
    ("Screening", "Prostate Cancer", "USPSTF: PSA screening is an individual decision for men aged 55-69 after discussing benefits and harms. Do not screen men 70+. Harms include overdiagnosis and overtreatment."),
    ("Prevention", "Smoking Cessation", "USPSTF recommends clinicians ask all adults about tobacco use and provide cessation interventions (Grade A). First-line: varenicline > combination NRT > bupropion. Always combine pharmacotherapy with behavioral counseling."),
    ("Biostatistics", "Key Formulas", "Sensitivity = TP/(TP+FN). Specificity = TN/(TN+FP). PPV = TP/(TP+FP). NPV = TN/(TN+FN). Likelihood Ratio+ = Sensitivity/(1-Specificity). Likelihood Ratio- = (1-Sensitivity)/Specificity. NNT = 1/ARR. ARR = CER - EER. RRR = ARR/CER."),
    ("Biostatistics", "Study Design Hierarchy", "Evidence hierarchy (strongest to weakest): Systematic review/meta-analysis > RCT > Cohort study > Case-control study > Cross-sectional > Case series > Expert opinion. RCTs minimize confounding via randomization. Cohort studies best for incidence and risk factors. Case-control studies best for rare outcomes."),
    ("Biostatistics", "Bias Types", "Selection bias: non-representative sample. Information bias: misclassification of exposure/outcome. Recall bias: cases remember exposures better (case-control). Lead-time bias: early detection makes survival appear longer. Length bias: screening detects slower-growing tumors. Confounding: third variable distorts the association."),
    ("Ethics", "Informed Consent", "Valid informed consent requires: (1) Disclosure of information (risks, benefits, alternatives, doing nothing), (2) Patient understanding, (3) Voluntariness, (4) Decision-making capacity. Capacity ≠ competence. Assess capacity per decision. Intoxication, delirium can temporarily impair capacity."),
    ("Ethics", "Advance Directives", "Living will: specifies wishes for specific medical situations. Healthcare proxy/durable power of attorney: designates surrogate decision-maker. If no directive: surrogate hierarchy = spouse > adult children > parents > siblings. Surrogate uses substituted judgment (what patient would want), not best interest."),
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
    total = len(STEP3_TOPICS)

    # ── Ingest PubMed content ─────────────────────────────────────────────────
    for i, (subject, subtopic, query) in enumerate(STEP3_TOPICS, 1):
        print(f"[{i}/{total}] {subject} — {subtopic}")
        try:
            pmids = search_pubmed(query)
            articles = fetch_abstracts(pmids)
            new_chunks = 0
            for article in articles:
                full = f"{article['title']}. {article['abstract']}"
                for c in chunk(full):
                    all_docs.append(c)
                    all_meta.append({
                        "subject": subject,
                        "subtopic": subtopic,
                        "step": "step3",
                        "title": article["title"][:120],
                    })
                    new_chunks += 1
            print(f"    ✓ {len(articles)} articles → {new_chunks} chunks")
        except Exception as e:
            print(f"    ✗ Skipped ({e})")
            continue

    # ── Ingest static USPSTF / biostatistics facts ────────────────────────────
    print(f"\nAdding {len(USPSTF_FACTS)} static USPSTF/guideline facts...")
    for subject, subtopic, fact_text in USPSTF_FACTS:
        all_docs.append(fact_text)
        all_meta.append({
            "subject": subject,
            "subtopic": subtopic,
            "step": "step3",
            "title": f"USPSTF/Guideline: {subtopic}",
        })

    if not all_docs:
        print("\nNo documents fetched.")
        sys.exit(1)

    print(f"\nUploading {len(all_docs)} chunks to '{COLLECTION}'...")
    BATCH = 64
    ids = [str(uuid.uuid4()) for _ in all_docs]
    for i in range(0, len(all_docs), BATCH):
        client.add(
            collection_name=COLLECTION,
            documents=all_docs[i: i + BATCH],
            metadata=all_meta[i: i + BATCH],
            ids=ids[i: i + BATCH],
        )
        print(f"  Uploaded {min(i + BATCH, len(all_docs))}/{len(all_docs)}")

    print(f"\n✓ Done. {len(all_docs)} Step 3 chunks stored in '{COLLECTION}'.")
    print(f"  Includes {len(USPSTF_FACTS)} verbatim USPSTF screening facts.")


if __name__ == "__main__":
    main()
