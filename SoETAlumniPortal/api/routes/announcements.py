import os
from datetime import datetime, timezone
import json
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from database import users_collection
from security.dependencies import get_current_user
from services.notifications import NOTIFICATION_TYPES, create_notification_once


router = APIRouter(
    prefix="/announcements",
    tags=["Announcements"]
)


ANNOUNCEMENTS_FILE = (
    Path(__file__).resolve().parent.parent / "announcements_data.json"
)


# ============================================================
# VALID TARGET AUDIENCES
# ============================================================

VALID_AUDIENCES = {"all", "students", "alumni"}


# ============================================================
# REQUEST MODELS
# ============================================================

class AnnouncementCreateRequest(BaseModel):
    title: str
    content: str
    target_audience: str = "all"


class AnnouncementUpdateRequest(BaseModel):
    title: str | None = None
    content: str | None = None
    target_audience: str | None = None


# ============================================================
# HELPERS
# ============================================================

def load_announcements() -> list[dict]:
    if os.getenv("DATABASE_BACKEND", "mongodb").lower() == "supabase":
        try:
            from database_supabase import supabase
            res = supabase.table("announcements").select("*").order("created_at", desc=True).execute()
            return res.data or []
        except Exception as e:
            print("Error loading announcements from Supabase:", e)
            return []

    try:
        if ANNOUNCEMENTS_FILE.exists():
            return json.loads(
                ANNOUNCEMENTS_FILE.read_text(encoding="utf-8")
            )
    except Exception:
        pass

    return []


def save_announcements(announcements: list[dict]):
    ANNOUNCEMENTS_FILE.write_text(
        json.dumps(announcements, indent=2),
        encoding="utf-8"
    )


def _audience_visible_to_role(target_audience: str, role: str) -> bool:
    """Return True if a user with the given role should see this audience."""
    if target_audience == "all":
        return True

    if target_audience == "students" and role == "student":
        return True

    if target_audience == "alumni" and role == "alumni":
        return True

    # Admin sees everything
    if role == "admin":
        return True

    return False


# ============================================================
# GET /announcements  — List announcements visible to the user
# ============================================================

@router.get("")
def get_announcements(
    current_user: dict = Depends(get_current_user),
):
    role = current_user.get("role")
    announcements = load_announcements()

    # Admin sees all announcements
    if role == "admin":
        return announcements

    # Other users see only announcements targeting their role or "all"
    return [
        ann for ann in announcements
        if _audience_visible_to_role(ann.get("target_audience", "all"), role)
    ]


# ============================================================
# POST /announcements  — Admin creates an announcement
# ============================================================

@router.post("")
def create_announcement(
    body: AnnouncementCreateRequest,
    current_user: dict = Depends(get_current_user),
):
    if current_user.get("role") != "admin":
        raise HTTPException(
            status_code=403,
            detail="Only admin users can create announcements."
        )

    if body.target_audience not in VALID_AUDIENCES:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Invalid target audience. Must be one of: "
                f"{', '.join(sorted(VALID_AUDIENCES))}."
            )
        )

    announcement = {
        "id": str(uuid.uuid4()),
        "title": body.title,
        "content": body.content,
        "target_audience": body.target_audience,
        "created_by": str(current_user.get("user_id")),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    announcements = load_announcements()
    announcements.append(announcement)
    save_announcements(announcements)

    if os.getenv("DATABASE_BACKEND", "mongodb").lower() == "supabase":
        try:
            from database_supabase import supabase
            supabase.table("announcements").insert({
                "id": str(announcement["id"]),
                "author_id": str(announcement["created_by"]) if announcement.get("created_by") else None,
                "title": announcement["title"],
                "content": announcement["content"],
                "target_audience": announcement.get("target_audience", "all"),
            }).execute()
        except Exception as e:
            print("Error persisting announcement to Supabase:", e)

    # Broadcast notifications to eligible active users
    try:
        query = {"is_active": True}
        if body.target_audience == "students":
            query["role"] = "student"
        elif body.target_audience == "alumni":
            query["role"] = "alumni"

        eligible_users = list(users_collection.find(query))
        announcement_id = announcement["id"]
        announcement_title = announcement["title"]

        for u in eligible_users:
            role = u.get("role")
            if body.target_audience == "all" and role not in {"student", "alumni"}:
                continue
            if not u.get("is_active", True):
                continue
            uid = str(u["_id"])
            try:
                create_notification_once(
                    user_id=uid,
                    title="New announcement",
                    message=f'A new announcement "{announcement_title}" has been posted.',
                    notification_type=NOTIFICATION_TYPES["announcement"],
                    entity_type="announcement",
                    entity_id=str(announcement_id),
                    dedupe_key=f"announcement:{announcement_id}:{uid}",
                )
            except Exception:
                pass
    except Exception:
        pass

    return {
        "message": "Announcement created successfully.",
        "announcement": announcement,
    }


# ============================================================
# PATCH /announcements/{announcement_id}  — Admin updates
# ============================================================

@router.patch("/{announcement_id}")
def update_announcement(
    announcement_id: str,
    body: AnnouncementUpdateRequest,
    current_user: dict = Depends(get_current_user),
):
    if current_user.get("role") != "admin":
        raise HTTPException(
            status_code=403,
            detail="Only admin users can update announcements."
        )

    # Validate target_audience if provided
    if body.target_audience is not None:
        if body.target_audience not in VALID_AUDIENCES:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Invalid target audience. Must be one of: "
                    f"{', '.join(sorted(VALID_AUDIENCES))}."
                )
            )

    announcements = load_announcements()

    for ann in announcements:
        if str(ann.get("id")) == str(announcement_id):
            update_data = body.model_dump(exclude_none=True)

            if not update_data:
                raise HTTPException(
                    status_code=400,
                    detail="No changes were provided."
                )

            for key, value in update_data.items():
                ann[key] = value

            ann["updated_at"] = datetime.now(timezone.utc).isoformat()

            save_announcements(announcements)

            if os.getenv("DATABASE_BACKEND", "mongodb").lower() == "supabase":
                try:
                    from database_supabase import supabase
                    supabase.table("announcements").update({
                        "title": ann["title"],
                        "content": ann["content"],
                        "target_audience": ann["target_audience"],
                        "updated_at": datetime.now(timezone.utc).isoformat(),
                    }).eq("id", str(announcement_id)).execute()
                except Exception as e:
                    print("Error updating announcement in Supabase:", e)

            return {
                "message": "Announcement updated successfully.",
                "announcement": ann,
            }

    raise HTTPException(
        status_code=404,
        detail="Announcement not found."
    )


# ============================================================
# DELETE /announcements/{announcement_id}  — Admin deletes
# ============================================================

@router.delete("/{announcement_id}")
def delete_announcement(
    announcement_id: str,
    current_user: dict = Depends(get_current_user),
):
    if current_user.get("role") != "admin":
        raise HTTPException(
            status_code=403,
            detail="Only admin users can delete announcements."
        )

    announcements = load_announcements()

    for index, ann in enumerate(announcements):
        if str(ann.get("id")) == str(announcement_id):
            deleted = announcements.pop(index)
            save_announcements(announcements)

            if os.getenv("DATABASE_BACKEND", "mongodb").lower() == "supabase":
                try:
                    from database_supabase import supabase
                    supabase.table("announcements").delete().eq("id", str(announcement_id)).execute()
                except Exception as e:
                    print("Error deleting announcement from Supabase:", e)

            return {
                "message": "Announcement deleted successfully.",
                "announcement": deleted,
            }

    raise HTTPException(
        status_code=404,
        detail="Announcement not found."
    )
