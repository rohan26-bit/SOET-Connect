from datetime import datetime, timezone
import json
from pathlib import Path
import uuid

NOTIFICATIONS_FILE = (
    Path(__file__).resolve().parent.parent / "notifications_data.json"
)

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
}


def get_notifications_file() -> Path:
    """Resolve notification storage file path, honoring test monkeypatching."""
    default_path = Path(__file__).resolve().parent.parent / "notifications_data.json"

    # If NOTIFICATIONS_FILE on this module was monkeypatched directly
    if NOTIFICATIONS_FILE != default_path:
        return Path(NOTIFICATIONS_FILE)

    # If routes.notifications.NOTIFICATIONS_FILE was monkeypatched (e.g., in conftest.py)
    import sys
    routes_notif = sys.modules.get("routes.notifications")
    if routes_notif and hasattr(routes_notif, "NOTIFICATIONS_FILE"):
        if routes_notif.NOTIFICATIONS_FILE != default_path:
            return Path(routes_notif.NOTIFICATIONS_FILE)

    return Path(NOTIFICATIONS_FILE)


def load_notifications() -> list[dict]:
    """Load notifications safely from the resolved JSON data file."""
    fpath = get_notifications_file()
    try:
        if fpath.exists():
            content = fpath.read_text(encoding="utf-8").strip()
            if content:
                return json.loads(content)
    except Exception:
        pass

    return []


def save_notifications(notifications: list[dict]):
    """Persist notification list as formatted JSON."""
    fpath = get_notifications_file()
    fpath.write_text(
        json.dumps(notifications, indent=2),
        encoding="utf-8"
    )


def create_notification(
    user_id: str,
    title: str,
    message: str,
    notification_type: str | None = None,
    entity_type: str | None = None,
    entity_id: str | None = None,
    dedupe_key: str | None = None,
) -> dict:
    """Create and persist a notification document.

    If dedupe_key is provided and a record with the same dedupe_key already
    exists, returns the existing notification without creating a duplicate.
    """
    notifications = load_notifications()

    if dedupe_key:
        for n in notifications:
            if n.get("dedupe_key") == dedupe_key:
                return n

    notification = {
        "id": str(uuid.uuid4()),
        "user_id": str(user_id),
        "title": title,
        "message": message,
        "is_read": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    if notification_type:
        notification["type"] = notification_type
    if entity_type:
        notification["entity_type"] = entity_type
    if entity_id:
        notification["entity_id"] = str(entity_id)
    if dedupe_key:
        notification["dedupe_key"] = dedupe_key

    notifications.append(notification)
    save_notifications(notifications)

    return notification


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
    notifications = load_notifications()
    existing_dedupe_keys = {
        n.get("dedupe_key")
        for n in notifications
        if n.get("dedupe_key")
    }

    created = []
    now_iso = datetime.now(timezone.utc).isoformat()

    for uid in user_ids:
        user_id_str = str(uid)
        dedupe_key = f"{dedupe_prefix}:{user_id_str}" if dedupe_prefix else None

        if dedupe_key and dedupe_key in existing_dedupe_keys:
            continue

        notification = {
            "id": str(uuid.uuid4()),
            "user_id": user_id_str,
            "title": title,
            "message": message,
            "is_read": False,
            "created_at": now_iso,
        }

        if notification_type:
            notification["type"] = notification_type
        if entity_type:
            notification["entity_type"] = entity_type
        if entity_id:
            notification["entity_id"] = str(entity_id)
        if dedupe_key:
            notification["dedupe_key"] = dedupe_key
            existing_dedupe_keys.add(dedupe_key)

        notifications.append(notification)
        created.append(notification)

    if created:
        save_notifications(notifications)

    return created
