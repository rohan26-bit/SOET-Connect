"""Authenticated alumni achievement management backed by Supabase PostgreSQL."""

from datetime import date, datetime
from typing import Literal
from urllib.parse import urlsplit
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from database import supabase, users_collection
from security.dependencies import get_current_user


router = APIRouter(prefix="/alumni", tags=["Alumni Achievements"])

AchievementCategory = Literal[
    "award", "certification", "honor", "project", "publication", "patent", "other"
]
AchievementVisibility = Literal["public", "private", "alumni_only"]


class AchievementCreateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    description: str = Field(min_length=1, max_length=600)
    category: AchievementCategory
    achievement_date: str = Field(min_length=4, max_length=40)
    issuing_organization: str = Field(min_length=1, max_length=120)
    credential_name: str | None = Field(default=None, max_length=120)
    credential_url: str | None = Field(default=None, max_length=2048)
    image_url: str | None = Field(default=None, max_length=2048)
    visibility: AchievementVisibility = "public"


class AchievementUpdateRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = Field(default=None, min_length=1, max_length=600)
    category: AchievementCategory | None = None
    achievement_date: str | None = Field(default=None, min_length=4, max_length=40)
    issuing_organization: str | None = Field(default=None, min_length=1, max_length=120)
    credential_name: str | None = Field(default=None, max_length=120)
    credential_url: str | None = Field(default=None, max_length=2048)
    image_url: str | None = Field(default=None, max_length=2048)
    visibility: AchievementVisibility | None = None


def _actor_from_token(current_user: dict) -> tuple[dict, str]:
    """Resolve the account from the signed token and re-check its live status."""
    raw_user_id = str(current_user.get("user_id") or "").strip()
    if not raw_user_id:
        raise HTTPException(status_code=401, detail="Invalid user session.")

    try:
        user_id = str(UUID(raw_user_id))
    except (TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid user session.")

    user = users_collection.find_one({"_id": user_id}, include_profiles=False)
    if not user:
        raise HTTPException(status_code=404, detail="User account not found.")
    if str(user.get("role") or "").lower() != str(current_user.get("role") or "").lower():
        raise HTTPException(status_code=403, detail="Your account permissions have changed. Please sign in again.")
    if not user.get("is_active", True):
        raise HTTPException(status_code=403, detail="This account has been deactivated.")

    return user, user_id


def _require_verified_alumni(current_user: dict) -> tuple[dict, str]:
    user, user_id = _actor_from_token(current_user)
    if user.get("role") != "alumni":
        raise HTTPException(status_code=403, detail="Only alumni can manage achievements.")
    if user.get("is_verified") is not True or str(user.get("verification_status") or "").lower() != "approved":
        raise HTTPException(status_code=403, detail="Your alumni account must be approved before managing achievements.")
    return user, user_id


def _normalize_achievement_date(raw_value: str) -> str:
    """Store date, year-only, and month/year inputs in the existing DATE column."""
    value = str(raw_value or "").strip()
    formats = (
        "%Y-%m-%d",
        "%Y-%m",
        "%Y",
        "%b %Y",
        "%B %Y",
        "%d %b %Y",
        "%d %B %Y",
    )
    for fmt in formats:
        try:
            parsed = datetime.strptime(value, fmt).date()
            return parsed.isoformat()
        except ValueError:
            continue

    # Accept an ISO timestamp by taking its calendar-date component.
    try:
        return date.fromisoformat(value[:10]).isoformat()
    except (TypeError, ValueError):
        raise HTTPException(
            status_code=422,
            detail="Enter a valid date, year (e.g. 2024), or month and year (e.g. Nov 2024).",
        )


def _display_achievement_date(raw_value: str | date | None) -> str:
    """Keep year and month/year entries readable in the existing text input."""
    if not raw_value:
        return ""
    try:
        parsed = raw_value if isinstance(raw_value, date) else date.fromisoformat(str(raw_value)[:10])
    except (TypeError, ValueError):
        return str(raw_value)
    if parsed.month == 1 and parsed.day == 1:
        return str(parsed.year)
    if parsed.day == 1:
        return parsed.strftime("%b %Y")
    return parsed.isoformat()


def _clean_required(value: str, field_name: str) -> str:
    cleaned = str(value or "").strip()
    if not cleaned:
        raise HTTPException(status_code=422, detail=f"{field_name} is required.")
    return cleaned


def _clean_optional_url(value: str | None, field_name: str) -> str | None:
    cleaned = str(value or "").strip()
    if not cleaned:
        return None
    parsed = urlsplit(cleaned)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise HTTPException(status_code=422, detail=f"{field_name} must be a valid HTTP or HTTPS URL.")
    return cleaned


def _serialize_achievement(row: dict) -> dict:
    return {
        "id": str(row.get("id") or ""),
        "title": row.get("title") or "",
        "description": row.get("description") or "",
        "category": row.get("category") or "other",
        "achievement_date": _display_achievement_date(row.get("achievement_date")),
        "issuing_organization": row.get("issuing_organization") or "",
        "credential_name": row.get("credential_name"),
        "credential_url": row.get("credential_url"),
        "image_url": row.get("image_url"),
        "visibility": row.get("visibility") or "public",
        "created_at": row.get("created_at"),
        "updated_at": row.get("updated_at"),
    }


def _load_achievements(user_id: str, visibility_filter: list[str] | None = None) -> list[dict]:
    query = (
        supabase.table("achievements")
        .select("*")
        .eq("user_id", user_id)
        .order("achievement_date", desc=True)
    )
    if visibility_filter is not None:
        query = query.in_("visibility", visibility_filter)
    result = query.execute()
    return [_serialize_achievement(row) for row in (result.data or [])]


def _build_record(payload: dict, user_id: str) -> dict:
    record = {
        "user_id": user_id,
        "title": _clean_required(payload.get("title"), "Achievement title"),
        "description": _clean_required(payload.get("description"), "Description"),
        "category": payload.get("category"),
        "achievement_date": _normalize_achievement_date(payload.get("achievement_date")),
        "issuing_organization": _clean_required(payload.get("issuing_organization"), "Issuing organization"),
        "credential_name": (str(payload["credential_name"]).strip() or None) if payload.get("credential_name") is not None else None,
        "credential_url": _clean_optional_url(payload.get("credential_url"), "Credential URL"),
        "image_url": _clean_optional_url(payload.get("image_url"), "Image URL"),
        "visibility": payload.get("visibility") or "public",
    }
    if not record["category"]:
        raise HTTPException(status_code=422, detail="Achievement category is required.")
    return record


@router.get("/me/achievements")
def get_my_achievements(current_user: dict = Depends(get_current_user)):
    """List all achievement records belonging to the authenticated alumni account."""
    _, user_id = _require_verified_alumni(current_user)
    try:
        return _load_achievements(user_id)
    except HTTPException:
        raise
    except Exception as exc:
        print("Achievement retrieval failed:", exc)
        raise HTTPException(status_code=503, detail="Unable to load achievements right now.")


@router.post("/me/achievements", status_code=201)
def create_my_achievement(
    payload: AchievementCreateRequest,
    current_user: dict = Depends(get_current_user),
):
    """Create an achievement owned by the authenticated alumni account."""
    _, user_id = _require_verified_alumni(current_user)
    try:
        record = _build_record(payload.model_dump(), user_id)
        result = supabase.table("achievements").insert(record).execute()
        rows = result.data or []
        if not rows:
            raise HTTPException(status_code=503, detail="The achievement could not be saved. Please retry.")
        return _serialize_achievement(rows[0])
    except HTTPException:
        raise
    except Exception as exc:
        print("Achievement creation failed:", exc)
        raise HTTPException(status_code=503, detail="The achievement could not be saved. Please retry.")


@router.patch("/me/achievements/{achievement_id}")
def update_my_achievement(
    achievement_id: UUID,
    payload: AchievementUpdateRequest,
    current_user: dict = Depends(get_current_user),
):
    """Update only a record owned by the authenticated alumni account."""
    _, user_id = _require_verified_alumni(current_user)
    fields = payload.model_dump(exclude_unset=True)
    if not fields:
        raise HTTPException(status_code=400, detail="Provide at least one field to update.")

    try:
        update_data = {}
        for field_name, value in fields.items():
            if field_name in {"title", "description", "issuing_organization"}:
                if value is None:
                    raise HTTPException(status_code=422, detail=f"{field_name.replace('_', ' ').title()} cannot be empty.")
                update_data[field_name] = _clean_required(value, field_name.replace("_", " ").title())
            elif field_name == "achievement_date":
                if value is None:
                    raise HTTPException(status_code=422, detail="Achievement date cannot be empty.")
                update_data[field_name] = _normalize_achievement_date(value)
            elif field_name in {"credential_url", "image_url"}:
                update_data[field_name] = _clean_optional_url(value, field_name.replace("_", " ").title())
            elif field_name == "credential_name":
                update_data[field_name] = str(value).strip() or None if value is not None else None
            elif field_name in {"category", "visibility"}:
                if value is None:
                    raise HTTPException(status_code=422, detail=f"{field_name.replace('_', ' ').title()} cannot be empty.")
                update_data[field_name] = value
            else:
                update_data[field_name] = value

        result = (
            supabase.table("achievements")
            .update(update_data)
            .eq("id", str(achievement_id))
            .eq("user_id", user_id)
            .execute()
        )
        rows = result.data or []
        if not rows:
            raise HTTPException(status_code=404, detail="Achievement not found.")
        return _serialize_achievement(rows[0])
    except HTTPException:
        raise
    except Exception as exc:
        print("Achievement update failed:", exc)
        raise HTTPException(status_code=503, detail="The achievement could not be updated. Please retry.")


@router.delete("/me/achievements/{achievement_id}", status_code=204)
def delete_my_achievement(
    achievement_id: UUID,
    current_user: dict = Depends(get_current_user),
):
    """Permanently delete only a record owned by the authenticated alumni account."""
    _, user_id = _require_verified_alumni(current_user)
    try:
        result = (
            supabase.table("achievements")
            .delete()
            .eq("id", str(achievement_id))
            .eq("user_id", user_id)
            .execute()
        )
        if not (result.data or []):
            raise HTTPException(status_code=404, detail="Achievement not found.")
        return None
    except HTTPException:
        raise
    except Exception as exc:
        print("Achievement deletion failed:", exc)
        raise HTTPException(status_code=503, detail="The achievement could not be deleted. Please retry.")


@router.get("/directory/{alumni_id}/achievements")
def get_visible_alumni_achievements(
    alumni_id: UUID,
    current_user: dict = Depends(get_current_user),
):
    """Return only achievements visible to the signed-in viewer."""
    actor, actor_id = _actor_from_token(current_user)
    target_id = str(alumni_id)
    target = users_collection.find_one({"_id": target_id}, include_profiles=False)
    if not target or target.get("role") != "alumni" or target.get("is_active") is not True:
        raise HTTPException(status_code=404, detail="Alumni profile not found.")
    if target.get("is_verified") is not True or str(target.get("verification_status") or "").lower() != "approved":
        raise HTTPException(status_code=404, detail="Alumni profile not found.")

    if actor_id == target_id or actor.get("role") == "admin":
        visibility_filter = None
    elif actor.get("role") == "alumni":
        visibility_filter = ["public", "alumni_only"]
    else:
        visibility_filter = ["public"]

    try:
        return _load_achievements(target_id, visibility_filter)
    except Exception as exc:
        print("Visible achievement retrieval failed:", exc)
        raise HTTPException(status_code=503, detail="Unable to load achievements right now.")
