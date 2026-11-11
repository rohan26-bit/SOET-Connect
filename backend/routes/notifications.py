import json
import os
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from starlette.datastructures import FormData
from urllib.parse import parse_qsl

from database import supabase
from security.dependencies import get_current_user
from security.webhook_signatures import (
    verify_resend_webhook_signature,
    verify_twilio_webhook_signature,
)
from services.notifications import (
    load_notifications,
    create_notification,
    create_notification_once,
    create_notifications_for_users,
    NOTIFICATION_TYPES,
)


router = APIRouter(
    prefix="/notifications",
    tags=["Notifications"],
)

MAX_RESEND_WEBHOOK_BODY_BYTES = 64 * 1024
MAX_TWILIO_WEBHOOK_BODY_BYTES = 16 * 1024
MAX_TWILIO_WEBHOOK_FIELDS = 64


async def _read_limited_webhook_body(request: Request, max_bytes: int) -> bytes:
    """Read an unauthenticated webhook body incrementally and stop at its byte cap."""
    declared_length = request.headers.get("content-length")
    if declared_length:
        try:
            declared_bytes = int(declared_length)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Invalid webhook content length.") from exc
        if declared_bytes < 0:
            raise HTTPException(status_code=400, detail="Invalid webhook content length.")
        if declared_bytes > max_bytes:
            raise HTTPException(status_code=413, detail="Webhook payload is too large.")

    body = bytearray()
    async for chunk in request.stream():
        if len(body) + len(chunk) > max_bytes:
            raise HTTPException(status_code=413, detail="Webhook payload is too large.")
        body.extend(chunk)
    return bytes(body)


def _load_notifications_or_503() -> list[dict]:
    """Translate notification storage failures into an explicit API service error."""
    try:
        return load_notifications()
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail="Notifications are temporarily unavailable. Please try again.",
        ) from exc


# ============================================================
# GET /notifications  — List own notifications
# ============================================================

@router.get("")
def get_notifications(
    current_user: dict = Depends(get_current_user),
):
    user_id = str(current_user.get("user_id"))
    notifications = _load_notifications_or_503()

    user_notifications = [
        n for n in notifications
        if str(n.get("user_id")) == user_id
    ]

    # Most recent first
    user_notifications.sort(
        key=lambda n: n.get("created_at", ""),
        reverse=True
    )

    return user_notifications


# ============================================================
# PATCH /notifications/{notification_id}/read  — Mark one read
# ============================================================

@router.patch("/{notification_id}/read")
def mark_notification_read(
    notification_id: str,
    current_user: dict = Depends(get_current_user),
):
    user_id = str(current_user.get("user_id"))
    notifications = _load_notifications_or_503()

    for n in notifications:
        if str(n.get("id")) == str(notification_id):
            if str(n.get("user_id")) != user_id:
                raise HTTPException(
                    status_code=403,
                    detail="You can only modify your own notifications."
                )

            now_iso = datetime.now(timezone.utc).isoformat()
            supabase.table("notifications").update({
                "is_read": True,
                "read_at": now_iso
            }).eq("id", str(notification_id)).execute()

            n["is_read"] = True
            n["read_at"] = now_iso

            return {
                "message": "Notification marked as read.",
                "notification": n,
            }

    raise HTTPException(
        status_code=404,
        detail="Notification not found."
    )


# ============================================================
# PATCH /notifications/read-all  — Mark all own notifications read
# ============================================================

@router.patch("/read-all")
def mark_all_notifications_read(
    current_user: dict = Depends(get_current_user),
):
    user_id = str(current_user.get("user_id"))
    notifications = _load_notifications_or_503()

    user_notifs = [n for n in notifications if str(n.get("user_id")) == user_id and not n.get("is_read")]
    now_iso = datetime.now(timezone.utc).isoformat()

    if user_notifs:
        supabase.table("notifications").update({
            "is_read": True,
            "read_at": now_iso
        }).eq("user_id", user_id).execute()

    for n in user_notifs:
        n["is_read"] = True
        n["read_at"] = now_iso

    return {
        "message": f"Marked {len(user_notifs)} notifications as read.",
        "updated_count": len(user_notifs),
    }


# ============================================================
# GET /notifications/preferences  — Get user notification prefs
# ============================================================

@router.get("/preferences")
def get_user_preferences(
    current_user: dict = Depends(get_current_user),
):
    from services.delivery import get_user_contact_and_prefs, is_email_configured, is_sms_configured
    user_id = str(current_user.get("user_id"))
    data = get_user_contact_and_prefs(user_id)
    return {
        **data,
        "providers_configured": {
            "email": is_email_configured(),
            "sms": is_sms_configured(),
        }
    }


# ============================================================
# PUT /notifications/preferences  — Update user notification prefs
# ============================================================

from pydantic import BaseModel
from typing import Optional

class NotificationPreferencesUpdate(BaseModel):
    in_app_enabled: Optional[bool] = None
    email_enabled: Optional[bool] = None
    sms_enabled: Optional[bool] = None
    notify_jobs: Optional[bool] = None
    notify_events: Optional[bool] = None
    notify_announcements: Optional[bool] = None
    notify_applications: Optional[bool] = None
    notify_gallery: Optional[bool] = None

@router.put("/preferences")
def update_user_preferences(
    body: NotificationPreferencesUpdate,
    current_user: dict = Depends(get_current_user),
):
    from services.delivery import get_user_contact_and_prefs, is_email_configured, is_sms_configured
    user_id = str(current_user.get("user_id"))
    contact = get_user_contact_and_prefs(user_id)

    # Validate SMS opt-in requires verified phone
    if body.sms_enabled is True and not contact.get("is_phone_verified"):
        raise HTTPException(
            status_code=400,
            detail="A verified phone number is required before enabling SMS notifications."
        )

    now_iso = datetime.now(timezone.utc).isoformat()
    updates = {
        "user_id": user_id,
        "updated_at": now_iso,
    }

    fields = [
        "in_app_enabled", "email_enabled", "sms_enabled",
        "notify_jobs", "notify_events", "notify_announcements",
        "notify_applications", "notify_gallery"
    ]
    for field in fields:
        val = getattr(body, field, None)
        if val is not None:
            updates[field] = val
        else:
            updates[field] = contact.get(field, True if field != "sms_enabled" else False)

    supabase.table("notification_preferences").upsert(updates).execute()

    return {
        "message": "Notification preferences updated successfully.",
        "preferences": updates,
        **updates,
        "providers_configured": {
            "email": is_email_configured(),
            "sms": is_sms_configured(),
        }
    }


# ============================================================
# GET /notifications/deliveries  — Audit of delivery logs
# ============================================================

@router.get("/deliveries")
def get_notification_deliveries(
    current_user: dict = Depends(get_current_user),
):
    user_id = str(current_user.get("user_id"))
    role = current_user.get("role")

    try:
        query = supabase.table("notification_deliveries").select("*").order("created_at", desc=True).limit(100)
        if role != "admin":
            query = query.eq("user_id", user_id)
        res = query.execute()
        return res.data or []
    except Exception as e:
        print(f"Error loading notification delivery history: {e}")
        raise HTTPException(
            status_code=503,
            detail="Notification delivery history is temporarily unavailable. Please try again.",
        ) from e


# ============================================================
# POST /notifications/deliveries/webhook/resend
# ============================================================

@router.post("/deliveries/webhook/resend")
async def resend_delivery_webhook(request: Request):
    """Accept Resend status events only after Svix signature/timestamp validation."""
    webhook_secret = os.getenv("RESEND_WEBHOOK_SECRET", "").strip()
    if not webhook_secret:
        raise HTTPException(
            status_code=503,
            detail="Resend webhook verification is not configured.",
        )

    raw_body = await _read_limited_webhook_body(request, MAX_RESEND_WEBHOOK_BODY_BYTES)
    if not verify_resend_webhook_signature(raw_body, request.headers, webhook_secret):
        raise HTTPException(status_code=403, detail="Invalid Resend webhook signature.")

    try:
        body = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid webhook payload.")

    if not isinstance(body, dict):
        raise HTTPException(status_code=400, detail="Invalid webhook payload.")

    event_type = str(body.get("type") or "")
    data = body.get("data") or {}
    if not isinstance(data, dict):
        raise HTTPException(status_code=400, detail="Invalid webhook data.")

    email_id = data.get("email_id")
    if not email_id:
        return {"status": "ignored", "reason": "No email_id in payload"}

    from services.delivery import update_delivery_status

    try:
        if event_type == "email.delivered":
            update_delivery_status(provider_message_id=str(email_id), status="delivered")
            return {"status": "success", "event": event_type}
        if event_type in ("email.bounced", "email.failed"):
            bounce = data.get("bounce") or {}
            err_msg = bounce.get("message") if isinstance(bounce, dict) else None
            update_delivery_status(
                provider_message_id=str(email_id),
                status="failed",
                error_message=err_msg or f"Resend event: {event_type}",
            )
            return {"status": "success", "event": event_type}
        return {"status": "ignored", "event": event_type}
    except Exception as exc:
        print(f"Resend delivery webhook processing failed: {exc}")
        raise HTTPException(status_code=503, detail="Unable to process delivery webhook.") from exc


# ============================================================
# POST /notifications/deliveries/webhook/twilio
# ============================================================

@router.post("/deliveries/webhook/twilio")
async def twilio_delivery_webhook(request: Request):
    """Accept Twilio callbacks only after the official SDK validates the signature."""
    auth_token = os.getenv("TWILIO_AUTH_TOKEN", "").strip()
    if not auth_token:
        raise HTTPException(
            status_code=503,
            detail="Twilio webhook verification is not configured.",
        )

    raw_body = await _read_limited_webhook_body(request, MAX_TWILIO_WEBHOOK_BODY_BYTES)
    content_type = request.headers.get("content-type", "").split(";", 1)[0].strip().lower()
    if content_type != "application/x-www-form-urlencoded":
        raise HTTPException(status_code=415, detail="Unsupported Twilio callback content type.")

    try:
        fields = parse_qsl(
            raw_body.decode("utf-8"),
            keep_blank_values=True,
            max_num_fields=MAX_TWILIO_WEBHOOK_FIELDS,
        )
        form = FormData(fields)
    except (UnicodeDecodeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail="Invalid Twilio callback payload.") from exc

    signature = request.headers.get("X-Twilio-Signature", "")
    callback_url = (
        os.getenv("TWILIO_WEBHOOK_URL", "").strip()
        or (
            os.getenv("PUBLIC_APP_URL", "https://soet-connect.vercel.app").rstrip("/")
            + "/api/notifications/deliveries/webhook/twilio"
        )
    )
    if request.url.query and "?" not in callback_url:
        callback_url = f"{callback_url}?{request.url.query}"

    if not verify_twilio_webhook_signature(callback_url, form, signature, auth_token):
        raise HTTPException(status_code=403, detail="Invalid Twilio webhook signature.")

    msg_sid = form.get("MessageSid") or form.get("SmsSid")
    msg_status = str(form.get("MessageStatus") or form.get("SmsStatus") or "").lower()
    if not msg_sid:
        return {"status": "ignored", "reason": "No MessageSid in callback"}

    from services.delivery import update_delivery_status

    try:
        if msg_status in ("delivered", "read"):
            update_delivery_status(provider_message_id=str(msg_sid), status="delivered")
        elif msg_status in ("failed", "undelivered"):
            err_code = form.get("ErrorCode", "")
            err_msg = f"Twilio delivery failed (code {err_code})" if err_code else "Twilio delivery failed"
            update_delivery_status(
                provider_message_id=str(msg_sid),
                status="failed",
                error_message=err_msg,
            )
        elif msg_status in ("sent", "queued"):
            update_delivery_status(provider_message_id=str(msg_sid), status="accepted")

        return {
            "status": "success",
            "message_sid": str(msg_sid),
            "message_status": msg_status,
        }
    except Exception as exc:
        print(f"Twilio delivery webhook processing failed: {exc}")
        raise HTTPException(status_code=503, detail="Unable to process delivery webhook.") from exc
