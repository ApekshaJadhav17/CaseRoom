import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

from routers import cases, performance, billing

app = FastAPI(title="CaseRoom API", version="0.1.0")

frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(cases.router, prefix="/api/cases", tags=["cases"])
app.include_router(performance.router, prefix="/api/performance", tags=["performance"])
app.include_router(billing.router, prefix="/api/billing", tags=["billing"])


@app.get("/health")
async def health():
    return {"status": "ok", "version": "0.1.0"}
