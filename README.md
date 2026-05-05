# CaseRoom — Adaptive USMLE Step 2 CK Practice Platform

> AI-generated clinical cases that get harder in exactly the right places.

CaseRoom is a full-stack AI learning platform that generates infinite, clinically accurate USMLE Step 2 CK vignettes, adapts to each student's weak spots in real time, and provides Socratic dialogue-based tutoring after every case. It was built to showcase a production-grade AI engineering stack: a multi-node LangGraph pipeline, retrieval-augmented generation over a medical knowledge base, adaptive spaced repetition, and a polished consumer-grade UI.

---

## The Problem

Medical students preparing for USMLE Step 2 CK face a brutal reality: static question banks go stale fast. Once you've seen a question, you know the answer — not the concept. You can grind 3,000 questions and still bomb the exam because you memorised patterns instead of building clinical reasoning.

The deeper problem is that question banks don't know what *you* don't know. You either go in order (missing your worst topics for hours) or you pick topics manually (requires the self-awareness that struggling students rarely have). And after you get a question wrong, the explanation is a wall of text — not a conversation.

CaseRoom solves all three:

1. **Infinite, never-repeating cases** — every case is generated fresh by an LLM pipeline, grounded in real medical literature via RAG.
2. **Fully adaptive** — an algorithm tracks your accuracy per topic across 76 high-yield Step 2 CK subtopics and silently routes the next case toward whatever you're getting wrong.
3. **Socratic dialogue** — after every case, an AI resident answers your follow-up questions, classifies your intent (clarification, misconception, confirmation), and always ends with a Socratic probe to push your reasoning one level deeper.

---

## Live Demo

| Layer | URL |
|---|---|
| Frontend | `http://localhost:3000` |
| Backend API | `http://localhost:8000` |
| API Docs | `http://localhost:8000/docs` |

---

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| **AI Orchestration** | [LangGraph](https://github.com/langchain-ai/langgraph) | Stateful 8-node DAG with conditional retry routing |
| **LLM** | [Groq](https://groq.com) — Llama 3.1 8B + Llama 3.3 70B | Sub-second inference; model cascade on rate limits |
| **Vector DB** | [Qdrant Cloud](https://cloud.qdrant.io) | Semantic search over medical knowledge base |
| **Embeddings** | fastembed — BAAI/bge-small-en-v1.5 | Lightweight, runs without GPU |
| **Backend** | FastAPI + Python 3.11 | Async, typed, automatic OpenAPI docs |
| **Database** | [Supabase](https://supabase.com) (PostgreSQL) | Auth, case storage, attempt history |
| **Cache** | Redis (optional) | Pre-generation of next case in background |
| **Frontend** | Next.js 14 (App Router) + TypeScript | SSR, file-based routing, React Server Components |
| **Styling** | Tailwind CSS | Utility-first, zero CSS files |
| **Payments** | Stripe | Free tier (10 cases/day) → Pro ($15/mo, unlimited) |
| **Image Hosting** | Cloudflare R2 | NIH chest X-ray dataset served at edge |
| **Containerisation** | Docker + Docker Compose | One-command local stack |

---

## Architecture

### The 8-Node LangGraph Pipeline

Every case request flows through a compiled LangGraph state machine. Each node does exactly one job and passes a shared `CaseState` TypedDict to the next. The graph has one conditional edge — after validation, it either loops back to rebuild the clinical scenario or proceeds to explanation.

```
topic_selector
      │
      ▼
knowledge_retriever   ←── Qdrant semantic search (top-5 chunks)
      │
      ▼
image_retriever       ←── Cloudflare R2 NIH chest X-ray lookup
      │
      ▼
clinical_builder      ←── Llama 3.1 8B, 900 tokens, RAG-grounded vignette
      │
      ▼
question_designer     ←── Llama 3.3 70B, writes the MCQ with calibrated distractors
      │
      ▼
validator             ←── Llama 3.1 8B, checks clinical accuracy
      │
   ┌──┴──────────────────────┐
   │ is_valid?                │
   │ No (up to 2 retries)     │ Yes
   └──► clinical_builder      ▼
                        explanation_writer   ←── faculty debrief + teaching points
                              │
                              ▼
                        followup_generator   ←── Socratic probe question
                              │
                              ▼
                             END
```

#### Node breakdown

| Node | Model | Max Tokens | Role |
|---|---|---|---|
| `topic_selector` | Llama 3.1 8B | 120 | Picks topic, subtopic, clinical_focus based on student weakness |
| `knowledge_retriever` | — | — | Queries Qdrant for top-5 relevant medical literature chunks |
| `image_retriever` | — | — | Looks up a matching chest X-ray from R2 (optional, topic-gated) |
| `clinical_builder` | Llama 3.1 8B | 900 | Builds patient, vitals, history, physical exam, labs — RAG-grounded |
| `question_designer` | Llama 3.3 70B | 500 | Writes the MCQ with difficulty-calibrated distractors |
| `validator` | Llama 3.1 8B | 250 | Catches clinical errors; triggers a rebuild loop (max 2 retries) |
| `explanation_writer` | Llama 3.1 8B | 600 | Writes faculty-style debrief, rules out each distractor, 3 teaching points |
| `followup_generator` | Llama 3.1 8B | 120 | Generates the Socratic follow-up probe |

#### Model cascade and rate limit handling

Groq's free tier has a TPM (tokens per minute) limit. The pipeline handles this gracefully:

1. All nodes default to **Llama 3.1 8B** (fast, cheap).
2. `question_designer` uses **Llama 3.3 70B** for higher-quality MCQ reasoning.
3. On a `429 RateLimitError`, the error message is parsed for the exact `"try again in X.XXs"` delay, the process sleeps that exact duration, and retries up to **4 times** before cascading to the next model.

```python
def _parse_retry_delay(err: RateLimitError) -> float:
    m = re.search(r"try again in ([0-9.]+)s", str(err), re.IGNORECASE)
    return float(m.group(1)) + 0.5 if m else 5.0
```

---

### Adaptive Learning Algorithm

The adaptive engine lives in `backend/services/adaptive.py`. It implements a **6-level mastery model** across 76 canonical Step 2 CK topics.

#### Mastery levels

| Level | Condition |
|---|---|
| `unseen` | Never attempted |
| `learning` | Fewer than 3 attempts |
| `developing` | ≥ 3 attempts, accuracy < 60% |
| `proficient` | Accuracy 60–79% |
| `due_for_review` | Accuracy ≥ 80% but not seen in **7+ days** (spaced repetition) |
| `mastered` | Accuracy ≥ 80%, seen within 7 days |

#### Topic selection priority

When choosing the next topic, the algorithm selects from priority buckets in order:

```
developing → due_for_review → learning → unseen → proficient
```

If a student is struggling with Nephrology (< 60% accuracy), every subsequent adaptive case will be drawn from the `developing` bucket until accuracy climbs above the threshold. The algorithm picks randomly from the top 8 candidates in each bucket to avoid feeling robotic.

#### Difficulty scaling

Case difficulty (`easy` / `medium` / `hard`) is derived from the student's overall session accuracy:

- < 5 cases played → `easy` (onboarding)
- Overall accuracy < 50% → `easy`
- 50–72% → `medium`
- > 72% → `hard`

This is passed directly into the `clinical_builder` prompt, which adjusts presentation typicality and distractor complexity accordingly.

---

### Pre-generation Cache

After every submitted answer, the backend fires a background task (`BackgroundTasks`) that runs the full pipeline for the *next* case and stores the result in Redis. When the student clicks "Next Case", the response is instant — no LLM wait. This is the key UX trick that makes the platform feel fast despite ~15s generation time.

```
Student submits answer
        │
        ├── Return feedback immediately
        │
        └── Background: generate next case → store in Redis
                                    ↓
Student clicks "Next Case" → pop from Redis → instant response
```

---

### Retrieval-Augmented Generation (RAG)

The `knowledge_retriever` node queries **Qdrant Cloud** with a semantic search query built from the selected subtopic:

```python
query = f"{subtopic} clinical presentation diagnosis management"
chunks = qdrant_service.search(query, top_k=5)
```

The top-5 chunks are injected into the `clinical_builder` system prompt, grounding the generated vignette in real medical evidence rather than pure LLM hallucination. The collection (`medical_knowledge`) was populated from PubMed abstracts and StatPearls-style content using `fastembed` with the `BAAI/bge-small-en-v1.5` model (no GPU required).

---

### Socratic Dialogue

After every case, the student can ask anything — "Why not aortic dissection?", "What labs confirm this?", "How do I manage this long-term?" The `groq_service.generate_follow_up()` function classifies the intent of the question and tailors the response style. Every AI response ends with a follow-up Socratic probe to push reasoning one level deeper. Conversation history is maintained client-side and sent with each request, so the AI resident has full context of the teaching session.

---
## Microservices Architecture


<p align="center">
  <img src="assets/Screenshot%202026-05-05%20at%209.43.56%E2%80%AFAM.png)" width="800"/>
</p>
```


## Project Structure

```
CaseRoom/
├── backend/
│   ├── main.py                     # FastAPI app, CORS, router registration
│   ├── Dockerfile                  # Production container
│   ├── requirements.txt
│   ├── .env.example                # Environment variable template
│   ├── models/
│   │   └── schemas.py              # Pydantic request/response models
│   ├── routers/
│   │   ├── cases.py                # /api/cases — generate, submit, followup, warmup
│   │   ├── performance.py          # /api/performance — stats, mastery
│   │   └── billing.py             # /api/billing — Stripe checkout, plan info
│   ├── services/
│   │   ├── pipeline.py             # LangGraph 8-node case generation pipeline
│   │   ├── adaptive.py             # Mastery model + topic selection algorithm
│   │   ├── dialogue_pipeline.py    # Socratic follow-up generation
│   │   ├── groq_service.py         # Groq client wrapper, rate limit handling
│   │   ├── qdrant_service.py       # Vector search against medical knowledge base
│   │   ├── db.py                   # Supabase queries (cases, attempts, performance)
│   │   ├── cache_service.py        # Redis pre-generation cache
│   │   ├── image_service.py        # Chest X-ray lookup from Cloudflare R2
│   │   ├── stripe_service.py       # Stripe customer + checkout session creation
│   │   └── exam_config.py          # Step 2 CK topic config, question stems
│   └── scripts/
│       ├── ingest_pubmed.py        # Ingest PubMed abstracts → Qdrant
│       ├── ingest_statpearls_step1.py
│       ├── ingest_guidelines_step3.py
│       └── upload_images.py        # Upload NIH chest X-rays → R2
│
├── frontend/
│   ├── app/
│   │   ├── page.tsx                # Landing page
│   │   ├── layout.tsx              # Root layout, AuthProvider, ExamProvider
│   │   ├── auth/page.tsx           # Sign in / sign up
│   │   ├── study/page.tsx          # Main study interface
│   │   ├── performance/page.tsx    # Mastery dashboard
│   │   └── pricing/page.tsx        # Pricing page + Stripe checkout trigger
│   ├── components/
│   │   ├── Nav.tsx                 # Sticky navigation bar
│   │   ├── CaseDisplay.tsx         # Renders patient vignette (vitals, history, labs)
│   │   ├── AnswerOptions.tsx        # MCQ answer selector + submit button
│   │   └── FeedbackPanel.tsx       # Result banner, teaching points, dialogue chat
│   ├── contexts/
│   │   └── AuthContext.tsx         # Supabase auth state (user, signOut)
│   ├── lib/
│   │   ├── api.ts                  # All backend fetch calls, typed interfaces
│   │   ├── examConfig.ts           # Step 2 CK constants + quick topic list
│   │   ├── supabase.ts             # Supabase client
│   │   ├── useStreak.ts            # Study streak + daily case counter hook
│   │   └── formatText.ts           # Markdown-lite text formatter
│   └── .env.local.example
│
├── supabase/
│   └── migrations/
│       ├── 001_initial.sql         # cases, attempts, student_profiles tables
│       ├── 002_images.sql          # image metadata
│       └── 003_profiles.sql        # billing plan, daily case count
│
├── docker-compose.yml              # Backend + Redis local stack
└── .gitignore
```

---

## Database Schema

Three core tables in Supabase (PostgreSQL):

**`cases`** — Every generated case stored with its full pipeline output including correct answer, explanation, teaching points, and follow-up question (so feedback never requires a second LLM call).

**`attempts`** — One row per student answer: `case_id`, `student_id`, `selected_answer`, `is_correct`, `topic`, `subtopic`, `attempted_at`. This is the raw feed for the adaptive algorithm.

**`student_profiles`** — `plan` (`free`/`pro`), `cases_today`, `last_reset_date`. The `check_and_increment_cases` function enforces the daily limit (10 free, unlimited pro) in a single atomic operation.

---

## API Reference

All routes are prefixed `/api/`.

### Cases

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/cases/warmup` | Pre-generate first case on page load (background task) |
| `POST` | `/api/cases/generate` | Generate a case (adaptive or topic-specific) |
| `POST` | `/api/cases/submit` | Submit an answer; returns feedback + triggers next case pre-gen |
| `POST` | `/api/cases/followup` | Socratic dialogue turn |
| `GET` | `/api/cases/cache-status` | Redis health check |

### Performance

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/performance/{student_id}` | Overall accuracy + per-topic breakdown |
| `GET` | `/api/performance/mastery/{student_id}` | Full mastery stats: distribution, due-for-review, topic details |

### Billing

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/billing/plan/{student_id}` | Current plan, cases today, cases remaining |
| `POST` | `/api/billing/checkout` | Create Stripe checkout session → returns redirect URL |

---

## Local Development

### Prerequisites

- Python 3.11+
- Node.js 18+
- Docker (optional, for Redis)
- Accounts: [Groq](https://console.groq.com), [Supabase](https://supabase.com), [Qdrant Cloud](https://cloud.qdrant.io)

### 1. Clone

```bash
git clone https://github.com/ApekshaJadhav17/CaseRoom.git
cd CaseRoom
```

### 2. Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Fill in your keys in .env
uvicorn main:app --reload
```

### 3. Frontend

```bash
cd frontend
npm install
cp .env.local.example .env.local
# Set NEXT_PUBLIC_API_URL=http://localhost:8000
npm run dev
```

### 4. Redis (optional — enables pre-generation cache)

```bash
docker-compose up -d redis
```

### 5. Populate the vector database

```bash
cd backend
python scripts/ingest_pubmed.py
```

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Description |
|---|---|
| `GROQ_API_KEY` | Groq API key — get one free at console.groq.com |
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anon/public key |
| `QDRANT_URL` | Qdrant Cloud cluster URL |
| `QDRANT_API_KEY` | Qdrant Cloud API key |
| `FRONTEND_URL` | CORS origin — `http://localhost:3000` locally |
| `STRIPE_SECRET_KEY` | Stripe secret key (for billing) |
| `STRIPE_PRICE_ID` | Stripe Price ID for the Pro plan |
| `R2_ACCOUNT_ID` | Cloudflare account ID (for chest X-rays) |
| `R2_ACCESS_KEY_ID` | R2 access key |
| `R2_SECRET_ACCESS_KEY` | R2 secret key |
| `R2_BUCKET_NAME` | R2 bucket name |
| `R2_PUBLIC_URL` | Public CDN URL for the R2 bucket |
| `REDIS_URL` | Redis connection string (default: `redis://localhost:6379`) |

### Frontend (`frontend/.env.local`)

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_API_URL` | Backend URL — `http://localhost:8000` locally |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |

---

## Deployment

### Backend → Railway / Render

The `backend/Dockerfile` produces a production image. Set all environment variables in your hosting dashboard. The `FRONTEND_URL` env var controls the CORS `allow_origins` list.

```bash
docker build -t caseroom-backend ./backend
```

### Frontend → Vercel

```bash
cd frontend
vercel --prod
```

Set `NEXT_PUBLIC_API_URL` to your Railway/Render backend URL in the Vercel project settings.

---

## Key Engineering Decisions

**Why LangGraph instead of a simple chain?**
The pipeline needs conditional retry logic — if the validator catches a clinical error, the graph loops back to `clinical_builder` (up to 2 retries) without rerunning `topic_selector` or `knowledge_retriever`. A linear chain can't express this without imperative branching code. LangGraph's conditional edges make the control flow explicit, inspectable, and testable as a graph rather than nested if-statements.

**Why Qdrant over pgvector?**
Qdrant Cloud has a generous free tier (1GB storage, unlimited reads) and supports `fastembed` natively — no separate embedding service needed. The `BAAI/bge-small-en-v1.5` model runs entirely in-process, keeping the ingestion scripts dependency-free. For a portfolio project that needs to run without a GPU or expensive embedding API, this was the pragmatic choice.

**Why Groq over OpenAI?**
Groq's hardware (LPU inference engine) delivers 400–700 tokens/second on Llama models — roughly 10× faster than OpenAI's GPT-4o at a fraction of the cost (free tier: 6,000 TPM per model). For a platform where case generation latency is a core UX concern, the speed difference is significant.

**Why store the full pipeline output in the database?**
Feedback, explanation, teaching points, and the Socratic probe are all stored in the `cases` table at generation time. When a student submits an answer, the `/submit` endpoint returns feedback from a simple DB read — no second LLM call, no extra latency. This means the feedback panel is always instant, even if Groq is under load.

**Why pre-generate the next case in the background?**
The LangGraph pipeline takes 10–15 seconds end-to-end. Running it while the student is reading feedback (a natural 30–60 second pause) means the next case is ready before they click "Next Case". From the student's perspective, the app feels instant. From the system's perspective, it's a background task that costs nothing if not used (the cache entry just expires).

---

## Curriculum Coverage

76 high-yield USMLE Step 2 CK topics across 12 major specialties:

**Cardiology** — STEMI, NSTEMI/UA, Heart Failure, AFib, Aortic Dissection, Cardiac Tamponade, Hypertensive Emergency, HCM

**Pulmonology** — CAP, COPD Exacerbation, PE, Pneumothorax, Asthma, ARDS, Pleural Effusion

**Gastroenterology** — Upper/Lower GI Bleed, Appendicitis, Cholecystitis, Pancreatitis, Diverticulitis, Bowel Obstruction, IBD, Hepatic Encephalopathy

**Nephrology** — AKI, Hyponatremia, Hyperkalemia, Nephrotic Syndrome, CKD, Glomerulonephritis

**Neurology** — Ischemic/Hemorrhagic Stroke, SAH, Bacterial Meningitis, Status Epilepticus, GBS, TIA

**Infectious Disease** — Sepsis, Endocarditis, Pyelonephritis, STIs, HIV, C. diff, TB

**OB/GYN** — Preeclampsia, Ectopic Pregnancy, Placenta Previa, GDM, PPH, Cervical Cancer Screening

**Psychiatry** — MDD, Bipolar, Schizophrenia, GAD, Substance Use, Suicidal Ideation

**Pediatrics** — Febrile Seizure, Kawasaki, Epiglottitis, Intussusception, CHD, RSV Bronchiolitis

**Endocrinology** — DKA, Thyroid Storm, Adrenal Crisis, Cushing, Pheochromocytoma, Hyperthyroidism

**Surgery / Emergency** — Acute Abdomen, Trauma, Burns, Tension Pneumothorax

**Hematology** — Sickle Cell Crisis, DVT, ITP, Anemia Workup

---

## Author

**Apeksha Jadhav**

Built as a portfolio project demonstrating full-stack AI engineering: LangGraph orchestration, RAG pipelines, adaptive algorithms, production-grade FastAPI, and modern Next.js.
