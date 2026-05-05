import os
import logging
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from services import db, stripe_service

router = APIRouter()
logger = logging.getLogger(__name__)

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")


class CheckoutRequest(BaseModel):
    student_id: str
    email: str


class PlanResponse(BaseModel):
    plan: str
    cases_today: int
    cases_remaining: int


@router.post("/checkout")
async def create_checkout(req: CheckoutRequest):
    try:
        url = stripe_service.create_checkout_session(
            student_id=req.student_id,
            email=req.email,
            success_url=f"{FRONTEND_URL}/study?upgraded=true",
            cancel_url=f"{FRONTEND_URL}/pricing",
        )
        return {"url": url}
    except Exception as e:
        logger.exception("Checkout session creation failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/webhook")
async def stripe_webhook(request: Request):
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")
    try:
        stripe_service.handle_webhook(payload, sig_header)
        return {"received": True}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("Webhook handling failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/plan/{student_id}", response_model=PlanResponse)
async def get_plan(student_id: str):
    profile = db.get_profile(student_id)
    plan = profile.get("plan", "free")
    cases_today = profile.get("cases_today", 0)
    return PlanResponse(
        plan=plan,
        cases_today=cases_today,
        cases_remaining=9999 if plan == "pro" else max(0, db.FREE_DAILY_LIMIT - cases_today),
    )
