from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request

from database import supabase
from security.dependencies import get_current_user
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


# ============================================================
# GET /notifications  — List own notifications
# ============================================================

@router.get("")
def get_notifications(
    current_user: dict = Depends(get_current_user),
):
    user_id = str(current_user.get("user_id"))
    notifications = load_notifications()

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
    notifications = load_notifications()

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
    notifications = load_notifications()

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
        return []


# ============================================================
# POST /notifications/deliveries/webhook/resend
# ============================================================

@router.post("/deliveries/webhook/resend")
async def resend_delivery_webhook(request: Request):
    """
    Handle incoming Resend delivery status webhooks (e.g. email.delivered, email.bounced).
    """
    try:
        body = await request.json()
        event_type = body.get("type", "")
        data = body.get("data", {})
        email_id = data.get("email_id")
        if not email_id:
            return {"status": "ignored", "reason": "No email_id in payload"}

        from services.delivery import update_delivery_status
        if event_type == "email.delivered":
            update_delivery_status(provider_message_id=email_id, status="delivered")
            return {"status": "success", "event": event_type}
        elif event_type in ("email.bounced", "email.failed"):
            err_msg = data.get("bounce", {}).get("message") or f"Resend event: {event_type}"
            update_delivery_status(provider_message_id=email_id, status="failed", error_message=err_msg)
            return {"status": "success", "event": event_type}
        return {"status": "ignored", "event": event_type}
    except Exception as e:
        return {"status": "error", "message": str(e)}


# ============================================================
# POST /notifications/deliveries/webhook/twilio
# ============================================================

@router.post("/deliveries/webhook/twilio")
async def twilio_delivery_webhook(request: Request):
    """
    Handle incoming Twilio message status callbacks (e.g. MessageStatus=delivered).
    """
    try:
        form = await request.form()
        msg_sid = form.get("MessageSid") or form.get("SmsSid")
        msg_status = (form.get("MessageStatus") or form.get("SmsStatus") or "").lower()

        if not msg_sid:
            return {"status": "ignored", "reason": "No MessageSid in callback"}

        from services.delivery import update_delivery_status
        if msg_status in ("delivered", "read"):
            update_delivery_status(provider_message_id=str(msg_sid), status="delivered")
        elif msg_status in ("failed", "undelivered"):
            err_code = form.get("ErrorCode", "")
            err_msg = f"Twilio delivery failed (code {err_code})" if err_code else "Twilio delivery failed"
            update_delivery_status(provider_message_id=str(msg_sid), status="failed", error_message=err_msg)
        elif msg_status in ("sent", "queued"):
            update_delivery_status(provider_message_id=str(msg_sid), status="accepted")

        return {"status": "success", "message_sid": str(msg_sid), "message_status": msg_status}
    except Exception as e:
        return {"status": "error", "message": str(e)}
