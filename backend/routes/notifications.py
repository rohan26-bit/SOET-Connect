from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException

from security.dependencies import get_current_user
import services.notifications
from services.notifications import (
    NOTIFICATION_TYPES,
    NOTIFICATIONS_FILE,
    create_notification,
    create_notification_once,
    create_notifications_for_users,
    load_notifications,
    save_notifications,
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
            # Ownership check — users can only touch their own
            if str(n.get("user_id")) != user_id:
                raise HTTPException(
                    status_code=403,
                    detail="You can only modify your own notifications."
                )

            n["is_read"] = True
            n["read_at"] = datetime.now(timezone.utc).isoformat()

            save_notifications(notifications)

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

    updated_count = 0
    now = datetime.now(timezone.utc).isoformat()

    for n in notifications:
        if str(n.get("user_id")) == user_id and not n.get("is_read"):
            n["is_read"] = True
            n["read_at"] = now
            updated_count += 1

    save_notifications(notifications)

    return {
        "message": f"{updated_count} notification(s) marked as read.",
        "updated_count": updated_count,
    }
