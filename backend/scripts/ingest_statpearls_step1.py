"""
Ingest StatPearls articles for USMLE Step 1 into Qdrant 'step1_knowledge' collection.

StatPearls is free, NCBI-hosted, and USMLE-oriented — each article covers one clinical/
basic-science topic with structured sections: Etiology, Pathophysiology, Evaluation,
Treatment, Pearls. This is the primary knowledge base for grounding Step 1 cases.

Usage:
    cd backend
    python -m scripts.ingest_statpearls_step1

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
COLLECTION = "step1_knowledge"
CHUNK_WORDS = 300
RESULTS_PER_TOPIC = 6
NCBI_API_KEY = os.getenv("NCBI_API_KEY")  # optional — raises rate limit 3→10 req/s
_REQ_DELAY = 0.15 if NCBI_API_KEY else 0.5  # conservative per-request sleep

# ── Canonical Step 1 topics ───────────────────────────────────────────────────
# Each entry: (display_subject, display_subtopic, pubmed_search_query)
# Queries are short and focused — long queries return 0 results from NCBI.

STEP1_TOPICS = [
    # ── Biochemistry: enzyme deficiencies ────────────────────────────────────
    ("Biochemistry", "Phenylketonuria", "phenylketonuria phenylalanine hydroxylase deficiency"),
    ("Biochemistry", "Maple Syrup Urine Disease", "maple syrup urine disease branched chain amino acid"),
    ("Biochemistry", "Homocystinuria", "homocystinuria cystathionine synthase"),
    ("Biochemistry", "Alkaptonuria", "alkaptonuria homogentisate oxidase"),
    ("Biochemistry", "Von Gierke Disease", "glycogen storage disease type 1 glucose-6-phosphatase"),
    ("Biochemistry", "Pompe Disease", "Pompe disease acid alpha glucosidase lysosomal"),
    ("Biochemistry", "McArdle Disease", "McArdle disease myophosphorylase glycogen muscle"),
    ("Biochemistry", "Galactosemia", "galactosemia galactose-1-phosphate uridyltransferase"),
    ("Biochemistry", "Hereditary Fructose Intolerance", "hereditary fructose intolerance aldolase B"),
    ("Biochemistry", "MCAD Deficiency", "MCAD deficiency medium chain acyl-CoA dehydrogenase"),
    ("Biochemistry", "Urea Cycle Disorders", "urea cycle disorders hyperammonemia ornithine transcarbamylase"),
    # ── Lysosomal storage diseases ────────────────────────────────────────────
    ("Biochemistry", "Gaucher Disease", "Gaucher disease glucocerebrosidase sphingolipid"),
    ("Biochemistry", "Niemann-Pick Disease", "Niemann-Pick sphingomyelinase lysosomal"),
    ("Biochemistry", "Tay-Sachs Disease", "Tay-Sachs hexosaminidase ganglioside"),
    ("Biochemistry", "Fabry Disease", "Fabry disease alpha galactosidase sphingolipid"),
    ("Biochemistry", "Hurler Syndrome", "Hurler mucopolysaccharidosis alpha-L-iduronidase"),
    # ── Metabolic pathways ────────────────────────────────────────────────────
    ("Biochemistry", "Beta Oxidation", "fatty acid beta oxidation mitochondria"),
    ("Biochemistry", "Ketone Body Metabolism", "ketone body synthesis beta hydroxybutyrate acetoacetate"),
    ("Biochemistry", "Gluconeogenesis", "gluconeogenesis rate limiting enzyme regulation"),
    ("Biochemistry", "Glycolysis Regulation", "glycolysis phosphofructokinase regulation"),
    ("Biochemistry", "TCA Cycle", "tricarboxylic acid cycle citric acid NADH"),
    ("Biochemistry", "Oxidative Phosphorylation", "electron transport chain ATP synthase proton gradient"),
    ("Biochemistry", "Purine Synthesis and Gout", "purine synthesis gout hyperuricemia allopurinol"),
    # ── Vitamins ─────────────────────────────────────────────────────────────
    ("Biochemistry", "Thiamine Deficiency", "thiamine B1 deficiency Wernicke-Korsakoff Beriberi"),
    ("Biochemistry", "Niacin Deficiency", "niacin B3 pellagra deficiency"),
    ("Biochemistry", "Folate Deficiency", "folate deficiency megaloblastic anemia neural tube"),
    ("Biochemistry", "Vitamin B12 Deficiency", "vitamin B12 cobalamin deficiency subacute combined degeneration"),
    ("Biochemistry", "Vitamin C Deficiency", "vitamin C scurvy collagen synthesis"),
    ("Biochemistry", "Vitamin A Deficiency", "vitamin A retinol deficiency night blindness"),
    ("Biochemistry", "Vitamin D Metabolism", "vitamin D metabolism rickets osteomalacia"),
    ("Biochemistry", "Vitamin K", "vitamin K coagulation factors carboxylation"),
    # ── Pharmacology ─────────────────────────────────────────────────────────
    ("Pharmacology", "Beta Blockers", "beta adrenergic receptor antagonist mechanism pharmacology"),
    ("Pharmacology", "ACE Inhibitors", "ACE inhibitor angiotensin converting enzyme mechanism"),
    ("Pharmacology", "Calcium Channel Blockers", "calcium channel blocker dihydropyridine mechanism"),
    ("Pharmacology", "Thiazide Diuretics", "thiazide diuretic sodium chloride cotransporter mechanism"),
    ("Pharmacology", "Loop Diuretics", "loop diuretic furosemide NKCC2 mechanism"),
    ("Pharmacology", "Penicillins", "penicillin beta-lactam peptidoglycan mechanism"),
    ("Pharmacology", "Aminoglycosides", "aminoglycoside 30S ribosome mechanism nephrotoxicity"),
    ("Pharmacology", "Macrolides", "macrolide erythromycin 50S ribosome mechanism"),
    ("Pharmacology", "Fluoroquinolones", "fluoroquinolone DNA gyrase topoisomerase mechanism"),
    ("Pharmacology", "Vancomycin", "vancomycin glycopeptide D-Ala-D-Ala mechanism MRSA"),
    ("Pharmacology", "Azole Antifungals", "azole antifungal ergosterol lanosterol mechanism"),
    ("Pharmacology", "Opioids", "opioid receptor agonist mechanism naloxone reversal"),
    ("Pharmacology", "Benzodiazepines", "benzodiazepine GABA-A receptor chloride mechanism"),
    ("Pharmacology", "SSRIs", "SSRI serotonin reuptake inhibitor mechanism serotonin syndrome"),
    ("Pharmacology", "Tricyclic Antidepressants", "tricyclic antidepressant mechanism toxicity"),
    ("Pharmacology", "Antipsychotics", "antipsychotic dopamine D2 receptor mechanism"),
    ("Pharmacology", "Lithium", "lithium mechanism toxicity inositol bipolar"),
    ("Pharmacology", "NSAIDs", "NSAID COX cyclooxygenase inhibition mechanism"),
    ("Pharmacology", "Corticosteroids", "corticosteroid glucocorticoid mechanism receptor"),
    ("Pharmacology", "Heparin", "heparin antithrombin mechanism anticoagulation"),
    ("Pharmacology", "Warfarin", "warfarin vitamin K antagonist coagulation mechanism"),
    # ── Pathology ─────────────────────────────────────────────────────────────
    ("Pathology", "Cell Injury and Apoptosis", "cell injury necrosis apoptosis caspase mechanism"),
    ("Pathology", "Acute Inflammation", "acute inflammation mediators neutrophil"),
    ("Pathology", "Granuloma Formation", "granuloma formation macrophage epithelioid"),
    ("Pathology", "Amyloidosis", "amyloidosis protein misfolding Congo red"),
    ("Pathology", "Oncogenes and Tumor Suppressors", "oncogene tumor suppressor cancer cell cycle"),
    ("Pathology", "P53 Tumor Suppressor", "p53 tumor suppressor apoptosis DNA damage"),
    ("Pathology", "Sickle Cell Disease", "sickle cell disease hemoglobin S HbS"),
    ("Pathology", "Thalassemia", "thalassemia alpha beta globin chain hemoglobin"),
    ("Pathology", "Hereditary Spherocytosis", "hereditary spherocytosis spectrin ankyrin hemolytic"),
    ("Pathology", "G6PD Deficiency", "G6PD deficiency glucose-6-phosphate hemolysis"),
    ("Pathology", "Coagulation Cascade", "coagulation cascade intrinsic extrinsic pathway"),
    ("Pathology", "DIC", "disseminated intravascular coagulation DIC diagnosis"),
    ("Pathology", "Virchow Triad", "Virchow triad thrombosis venous thromboembolism"),
    # ── Microbiology ─────────────────────────────────────────────────────────
    ("Microbiology", "Staphylococcus Aureus", "Staphylococcus aureus toxins virulence MRSA"),
    ("Microbiology", "Group A Streptococcus", "Streptococcus pyogenes pharyngitis rheumatic fever"),
    ("Microbiology", "Streptococcus Pneumoniae", "Streptococcus pneumoniae meningitis pneumonia"),
    ("Microbiology", "E. Coli Pathotypes", "Escherichia coli pathotypes ETEC EHEC mechanism"),
    ("Microbiology", "Salmonella", "Salmonella typhi typhoid fever intracellular"),
    ("Microbiology", "C. Difficile", "Clostridium difficile pseudomembranous colitis toxin"),
    ("Microbiology", "Mycobacterium Tuberculosis", "Mycobacterium tuberculosis pathogenesis latent"),
    ("Microbiology", "HIV Pathogenesis", "HIV CD4 T cell mechanism AIDS immunodeficiency"),
    ("Microbiology", "Hepatitis B", "hepatitis B virus HBsAg HBeAg serology"),
    ("Microbiology", "Hepatitis C", "hepatitis C virus RNA chronic liver cirrhosis"),
    ("Microbiology", "Herpes Simplex Virus", "herpes simplex virus latency reactivation ganglion"),
    ("Microbiology", "Influenza", "influenza hemagglutinin neuraminidase antigenic shift drift"),
    ("Microbiology", "Malaria", "malaria Plasmodium falciparum life cycle red blood cell"),
    ("Microbiology", "Fungal Infections", "Candida Aspergillus Cryptococcus fungal infection"),
    # ── Physiology ─────────────────────────────────────────────────────────
    ("Physiology", "Cardiac Action Potential", "cardiac action potential phases refractory period"),
    ("Physiology", "Frank-Starling Mechanism", "Frank-Starling cardiac output preload afterload"),
    ("Physiology", "Renal Tubule Physiology", "renal tubule sodium potassium reabsorption"),
    ("Physiology", "Acid-Base Disorders", "acid base disorders metabolic respiratory pH bicarbonate"),
    ("Physiology", "V/Q Mismatch", "ventilation perfusion ratio mismatch shunt dead space"),
    ("Physiology", "Oxygen-Hemoglobin Curve", "oxygen hemoglobin dissociation curve Bohr effect"),
    ("Physiology", "GFR and Autoregulation", "glomerular filtration rate renal autoregulation"),
    ("Physiology", "RAAS", "renin angiotensin aldosterone system regulation"),
    ("Physiology", "Thyroid Hormone", "thyroid hormone synthesis TRH TSH T3 T4 regulation"),
    ("Physiology", "Insulin and Glucagon", "insulin secretion glucagon pancreatic islets regulation"),
    ("Physiology", "Cortisol and HPA Axis", "cortisol HPA axis stress response"),
    # ── Anatomy ──────────────────────────────────────────────────────────────
    ("Anatomy", "Brachial Plexus", "brachial plexus nerve roots injury Erb Klumpke"),
    ("Anatomy", "Radial Nerve", "radial nerve wrist drop posterior interosseous"),
    ("Anatomy", "Ulnar Nerve", "ulnar nerve claw hand cubital tunnel"),
    ("Anatomy", "Median Nerve", "median nerve carpal tunnel ape hand"),
    ("Anatomy", "Coronary Artery Anatomy", "coronary artery LAD RCA circumflex territory infarct"),
    # ── Immunology ───────────────────────────────────────────────────────────
    ("Immunology", "Complement System", "complement system classical alternative lectin pathway"),
    ("Immunology", "MHC Antigen Presentation", "MHC class I II antigen presentation T cell"),
    ("Immunology", "Hypersensitivity Type I", "type I hypersensitivity IgE mast cell anaphylaxis"),
    ("Immunology", "Hypersensitivity Type II-IV", "type II III IV hypersensitivity mechanism"),
    ("Immunology", "DiGeorge Syndrome", "DiGeorge syndrome thymic aplasia T cell deficiency"),
    ("Immunology", "SCID", "severe combined immunodeficiency SCID ADA deficiency"),
    ("Immunology", "Bruton Agammaglobulinemia", "Bruton agammaglobulinemia Btk B cell"),
    # ── Genetics ─────────────────────────────────────────────────────────────
    ("Genetics", "Autosomal Dominant Disorders", "autosomal dominant inheritance Huntington Marfan"),
    ("Genetics", "Autosomal Recessive Disorders", "autosomal recessive cystic fibrosis PKU"),
    ("Genetics", "X-Linked Disorders", "X-linked Duchenne Becker hemophilia inheritance"),
    ("Genetics", "Chromosomal Disorders", "chromosomal trisomy Down syndrome Turner Klinefelter"),
    ("Genetics", "Trinucleotide Repeats", "trinucleotide repeat expansion anticipation Huntington"),
    ("Genetics", "Genomic Imprinting", "genomic imprinting Prader-Willi Angelman syndrome"),
]


def _ncbi_get(url: str, params: dict, retries: int = 4) -> dict:
    """GET with retry/backoff for NCBI rate limiting."""
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


def search_statpearls(query: str, max_results: int = RESULTS_PER_TOPIC) -> list[str]:
    """Search PubMed specifically for StatPearls articles on a topic."""
    # First try StatPearls-specific search
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

    # Fallback to general PubMed review articles if StatPearls returns nothing
    if not pmids:
        data = _ncbi_get(
            f"{NCBI}/esearch.fcgi",
            {
                "db": "pubmed",
                "term": f"{query}[Title/Abstract] AND review[pt]",
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


def main() -> None:
    url = os.getenv("QDRANT_URL")
    api_key = os.getenv("QDRANT_API_KEY")
    if not url:
        print("ERROR: QDRANT_URL not set in .env")
        sys.exit(1)

    client = QdrantClient(url=url, api_key=api_key or None)

    all_docs: list[str] = []
    all_meta: list[dict] = []
    total_topics = len(STEP1_TOPICS)

    for i, (subject, subtopic, query) in enumerate(STEP1_TOPICS, 1):
        print(f"[{i}/{total_topics}] {subject} — {subtopic}")
        try:
            pmids = search_statpearls(query)
            articles = fetch_abstracts(pmids)
            new_chunks = 0
            for article in articles:
                full = f"{article['title']}. {article['abstract']}"
                for c in chunk(full):
                    all_docs.append(c)
                    all_meta.append({
                        "subject": subject,
                        "subtopic": subtopic,
                        "step": "step1",
                        "title": article["title"][:120],
                    })
                    new_chunks += 1
            print(f"    ✓ {len(articles)} articles → {new_chunks} chunks")
        except Exception as e:
            print(f"    ✗ Skipped ({e})")
            continue

    if not all_docs:
        print("\nNo documents fetched — check network and NCBI availability.")
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

    print(f"\n✓ Done. {len(all_docs)} Step 1 chunks stored in '{COLLECTION}'.")
    print(f"  Covered {total_topics} topics across Biochemistry, Pharmacology, Pathology,")
    print(f"  Microbiology, Physiology, Anatomy, Immunology, and Genetics.")


if __name__ == "__main__":
    main()
