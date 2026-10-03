from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

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
