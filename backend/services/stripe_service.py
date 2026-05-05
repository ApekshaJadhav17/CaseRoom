import os
import stripe

stripe.api_key = os.getenv("STRIPE_SECRET_KEY", "")

PRICE_ID_PRO = os.getenv("STRIPE_PRICE_ID_PRO", "")
WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "")


def create_checkout_session(student_id: str, email: str, success_url: str, cancel_url: str) -> str:
    session = stripe.checkout.Session.create(
        customer_email=email,
        mode="subscription",
        line_items=[{"price": PRICE_ID_PRO, "quantity": 1}],
        success_url=success_url,
        cancel_url=cancel_url,
        client_reference_id=student_id,
        metadata={"student_id": student_id},
    )
    return session.url


def handle_webhook(payload: bytes, sig_header: str) -> None:
    try:
        event = stripe.Webhook.construct_event(payload, sig_header, WEBHOOK_SECRET)
    except stripe.SignatureVerificationError:
        raise ValueError("Invalid webhook signature")

    from services import db

    event_type = event["type"]
    data = event["data"]["object"]

    if event_type == "checkout.session.completed":
        student_id = data.get("client_reference_id")
        customer_id = data.get("customer")
        subscription_id = data.get("subscription")
        if student_id:
            db.set_plan(student_id, "pro", customer_id, subscription_id)

    elif event_type in ("customer.subscription.deleted", "customer.subscription.paused"):
        customer_id = data.get("customer")
        if customer_id:
            db.revoke_plan_by_customer(customer_id)
