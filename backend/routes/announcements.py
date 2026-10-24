from datetime import datetime, timezone
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from database import users_collection, supabase
from security.dependencies import get_current_user
from services.notifications import NOTIFICATION_TYPES, create_notification_once


router = APIRouter(
    prefix="/announcements",
    tags=["Announcements"]
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
    expires_at: str | None = None


class AnnouncementUpdateRequest(BaseModel):
    title: str | None = None
    content: str | None = None
    target_audience: str | None = None
    expires_at: str | None = None


# ============================================================
# HELPERS
# ============================================================

def parse_iso_datetime(dt_str: str | None) -> datetime | None:
    if not dt_str:
        return None
    s = str(dt_str).strip()
    if not s:
        return None
    try:
        if len(s) == 10 and s[4] == '-' and s[7] == '-':
            # Treat date-only deadline as end of that day in UTC
            return datetime.fromisoformat(s).replace(hour=23, minute=59, second=59, tzinfo=timezone.utc)
        if s.endswith("Z"):
            s = s[:-1] + "+00:00"
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        return None


def is_announcement_expired(ann: dict) -> bool:
    """Return True if the announcement has an expires_at timestamp that has passed in UTC."""
    exp = ann.get("expires_at")
    if not exp:
        return False
    dt = parse_iso_datetime(exp)
    if dt is None:
        return False
    return datetime.now(timezone.utc) > dt


def load_announcements() -> list[dict]:
    """Load announcements directly from Supabase PostgreSQL."""
    try:
        res = supabase.table("announcements").select("*").order("created_at", desc=True).execute()
        announcements = res.data or []
        for ann in announcements:
            ann["is_expired"] = is_announcement_expired(ann)
        return announcements
    except Exception as e:
        print("Error loading announcements from Supabase:", e)
        return []


def _audience_visible_to_role(target_audience: str, role: str) -> bool:
    """Return True if a user with the given role should see this audience."""
    if target_audience == "all":
        return True

    if target_audience == "students" and role == "student":
        return True

    if target_audience == "alumni" and role == "alumni":
        return True

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

    if role == "admin":
        return announcements

    return [
        ann for ann in announcements
        if _audience_visible_to_role(ann.get("target_audience", "all"), role)
        and not ann.get("is_expired", False)
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

    if body.expires_at:
        dt = parse_iso_datetime(body.expires_at)
        if dt and dt <= datetime.now(timezone.utc):
            raise HTTPException(
                status_code=400,
                detail="Expiration date must be in the future."
            )

    ann_id = str(uuid.uuid4())
    author_id = str(current_user.get("user_id"))
    now_iso = datetime.now(timezone.utc).isoformat()

    ann_row = {
        "id": ann_id,
        "author_id": author_id,
        "title": body.title,
        "content": body.content,
        "target_audience": body.target_audience,
        "expires_at": body.expires_at,
        "created_at": now_iso,
        "updated_at": now_iso,
    }

    supabase.table("announcements").insert(ann_row).execute()

    announcement = {
        **ann_row,
        "created_by": author_id,
    }

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

    if body.target_audience is not None and body.target_audience not in VALID_AUDIENCES:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Invalid target audience. Must be one of: "
                f"{', '.join(sorted(VALID_AUDIENCES))}."
            )
        )

    res = supabase.table("announcements").select("*").eq("id", str(announcement_id)).limit(1).execute()
    if not res.data:
        raise HTTPException(
            status_code=404,
            detail="Announcement not found."
        )

    ann = res.data[0]
    update_data = body.model_dump(exclude_none=True)
    if not update_data:
        raise HTTPException(
            status_code=400,
            detail="No changes were provided."
        )

    if "expires_at" in update_data and update_data["expires_at"]:
        dt = parse_iso_datetime(update_data["expires_at"])
        if dt and dt <= datetime.now(timezone.utc):
            raise HTTPException(
                status_code=400,
                detail="Expiration date must be in the future."
            )

    now_iso = datetime.now(timezone.utc).isoformat()
    db_updates = {**update_data, "updated_at": now_iso}

    supabase.table("announcements").update(db_updates).eq("id", str(announcement_id)).execute()

    ann.update(db_updates)
    ann["is_expired"] = is_announcement_expired(ann)
    ann["created_by"] = str(ann.get("author_id", ""))

    return {
        "message": "Announcement updated successfully.",
        "announcement": ann,
    }


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

    res = supabase.table("announcements").select("*").eq("id", str(announcement_id)).limit(1).execute()
    if not res.data:
        raise HTTPException(
            status_code=404,
            detail="Announcement not found."
        )

    deleted = res.data[0]
    supabase.table("announcements").delete().eq("id", str(announcement_id)).execute()

    return {
        "message": "Announcement deleted successfully.",
        "announcement": deleted,
    }

