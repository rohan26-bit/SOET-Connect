import os
from datetime import datetime, timezone
import uuid

from database import supabase


# Canonical notification type constants
NOTIFICATION_TYPES = {
    "alumni_verification": "alumni_verification",
    "job_submission": "job_submission",
    "job_approval": "job_approval",
    "job_rejection": "job_rejection",
    "job_application": "job_application",
    "application_status": "application_status",
    "event_submission": "event_submission",
    "event_approval": "event_approval",
    "event_rejection": "event_rejection",
    "event_registration": "event_registration",
    "event_cancellation": "event_cancellation",
    "announcement": "announcement",
    "student_verification": "student_verification",
}


def load_notifications() -> list[dict]:
    """Load notifications safely from Supabase PostgreSQL notifications table."""
    try:
        res = supabase.table("notifications").select("*").order("created_at", desc=True).execute()
        return res.data or []
    except Exception as e:
        print("Error loading notifications from Supabase:", e)
        return []


def create_notification(
    user_id: str,
    title: str,
    message: str,
    notification_type: str | None = None,
    entity_type: str | None = None,
    entity_id: str | None = None,
    dedupe_key: str | None = None,
) -> dict:
    """Create and persist a notification in Supabase PostgreSQL."""
    user_id_str = str(user_id)

    if os.getenv("DATABASE_MODE", "").lower() != "mock":
        try:
            uuid.UUID(user_id_str)
        except (ValueError, AttributeError):
            try:
                u_res = supabase.table("users").select("id").eq("legacy_mongo_id", user_id_str).limit(1).execute()
                if u_res.data:
                    user_id_str = str(u_res.data[0]["id"])
                else:
                    return {}
            except Exception:
                return {}

    if dedupe_key:
        try:
            existing = supabase.table("notifications").select("*").eq("dedupe_key", dedupe_key).execute()
            if existing.data:
                return existing.data[0]
        except Exception:
            pass

    notif_id = str(uuid.uuid4())
    now_iso = datetime.now(timezone.utc).isoformat()

    notif_row = {
        "id": notif_id,
        "user_id": user_id_str,
        "title": title,
        "message": message,
        "type": notification_type,
        "entity_type": entity_type,
        "entity_id": str(entity_id) if entity_id else None,
        "dedupe_key": dedupe_key,
        "is_read": False,
        "created_at": now_iso,
    }

    try:
        supabase.table("notifications").insert(notif_row).execute()
    except Exception as e:
        print("Error inserting notification to Supabase:", e)

    return notif_row


def create_notification_once(
    user_id: str,
    title: str,
    message: str,
    notification_type: str | None = None,
    entity_type: str | None = None,
    entity_id: str | None = None,
    dedupe_key: str | None = None,
) -> dict:
    """Create a notification idempotently using dedupe_key."""
    return create_notification(
        user_id=user_id,
        title=title,
        message=message,
        notification_type=notification_type,
        entity_type=entity_type,
        entity_id=entity_id,
        dedupe_key=dedupe_key,
    )


def create_notifications_for_users(
    user_ids: list[str],
    title: str,
    message: str,
    notification_type: str | None = None,
    entity_type: str | None = None,
    entity_id: str | None = None,
    dedupe_prefix: str | None = None,
) -> list[dict]:
    """Batch create notifications across multiple users with deduplication."""
    created = []
    for uid in user_ids:
        user_id_str = str(uid)
        dedupe_key = f"{dedupe_prefix}:{user_id_str}" if dedupe_prefix else None
        notif = create_notification(
            user_id=user_id_str,
            title=title,
            message=message,
            notification_type=notification_type,
            entity_type=entity_type,
            entity_id=entity_id,
            dedupe_key=dedupe_key,
        )
        if notif:
            created.append(notif)
    return created


def save_notifications(notifications: list[dict]) -> None:
    """Save or update notifications in Supabase PostgreSQL."""
    for n in notifications:
        try:
            supabase.table("notifications").upsert(n).execute()
        except Exception as e:
            print("Error saving notification to Supabase:", e)

