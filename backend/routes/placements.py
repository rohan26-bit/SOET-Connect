import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from database import supabase
from security.dependencies import get_current_user


router = APIRouter(prefix="/placements", tags=["Placement Celebrations"])


class PlacementCreateRequest(BaseModel):
    alumni_name: str = Field(min_length=2, max_length=255)
    company_name: str = Field(min_length=2, max_length=255)
    designation: str | None = Field(default=None, max_length=255)
    department: str | None = Field(default=None, max_length=160)
    batch_year: str | None = Field(default=None, max_length=20)
    photo_url: str | None = None
    photo_consent: bool = False
    message: str | None = Field(default=None, max_length=1000)
    is_published: bool = False


class PlacementUpdateRequest(BaseModel):
    alumni_name: str | None = Field(default=None, min_length=2, max_length=255)
    company_name: str | None = Field(default=None, min_length=2, max_length=255)
    designation: str | None = Field(default=None, max_length=255)
    department: str | None = Field(default=None, max_length=160)
    batch_year: str | None = Field(default=None, max_length=20)
    photo_url: str | None = None
    photo_consent: bool | None = None
    message: str | None = Field(default=None, max_length=1000)
    is_published: bool | None = None


def _require_admin(current_user: dict) -> None:
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only administrators can manage placement celebrations.")


def _normalise_photo_url(value: str | None) -> str | None:
    photo_url = (value or "").strip()
    if not photo_url:
        return None
    if photo_url.startswith("/api/gallery/"):
        return photo_url
    if photo_url.startswith("https://"):
        return photo_url
    raise HTTPException(status_code=400, detail="Photo must use HTTPS or an approved SOET gallery image URL.")


def _load_placements(query):
    try:
        result = query.order("created_at", desc=True).execute()
        return result.data or []
    except Exception as exc:
        print("Error loading placement celebrations:", exc)
        raise HTTPException(status_code=503, detail="Placement celebrations are temporarily unavailable. Apply migration 005 and retry.")


@router.get("")
def get_published_placements(
    limit: int = Query(default=100, ge=1, le=100),
):
    """Public feed used by the unauthenticated homepage. Only published records are returned."""
    rows = _load_placements(
        supabase.table("placement_celebrations")
        .select("id,alumni_name,company_name,designation,department,batch_year,photo_url,message,created_at")
        .eq("is_published", True)
    )
    return rows[:limit]


@router.get("/admin")
def get_admin_placements(current_user: dict = Depends(get_current_user)):
    _require_admin(current_user)
    return _load_placements(supabase.table("placement_celebrations").select("*"))


@router.post("")
def create_placement(
    body: PlacementCreateRequest,
    current_user: dict = Depends(get_current_user),
):
    _require_admin(current_user)
    if body.is_published and not body.photo_consent:
        raise HTTPException(status_code=400, detail="Confirm permission to publish the alumnus photo and placement details.")
    if body.is_published and not body.photo_url:
        raise HTTPException(status_code=400, detail="A photo is required before publishing a placement celebration.")

    now = datetime.now(timezone.utc).isoformat()
    row = body.model_dump()
    row["id"] = str(uuid.uuid4())
    row["alumni_name"] = body.alumni_name.strip()
    row["company_name"] = body.company_name.strip()
    row["photo_url"] = _normalise_photo_url(body.photo_url)
    row["created_by"] = str(current_user.get("user_id") or "") or None
    row["created_at"] = now
    row["updated_at"] = now

    try:
        result = supabase.table("placement_celebrations").insert(row).execute()
    except Exception as exc:
        print("Error creating placement celebration:", exc)
        raise HTTPException(status_code=503, detail="Could not save placement. Confirm migration 005 has been applied.")
    return result.data[0] if result.data else row


@router.patch("/{placement_id}")
def update_placement(
    placement_id: str,
    body: PlacementUpdateRequest,
    current_user: dict = Depends(get_current_user),
):
    _require_admin(current_user)
    updates = body.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No changes were provided.")

    if "photo_url" in updates:
        updates["photo_url"] = _normalise_photo_url(updates["photo_url"])

    current = supabase.table("placement_celebrations").select("photo_consent,is_published,photo_url").eq("id", placement_id).limit(1).execute()
    if not current.data:
        raise HTTPException(status_code=404, detail="Placement record not found.")

    current_row = current.data[0]
    will_publish = updates.get("is_published", current_row.get("is_published", False))
    will_have_consent = updates.get("photo_consent", current_row.get("photo_consent", False))
    will_have_photo = updates.get("photo_url", current_row.get("photo_url"))
    if will_publish and not will_have_consent:
        raise HTTPException(status_code=400, detail="Photo consent is required before publishing this placement.")
    if will_publish and not will_have_photo:
        raise HTTPException(status_code=400, detail="A photo is required before publishing a placement celebration.")

    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    result = supabase.table("placement_celebrations").update(updates).eq("id", placement_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Placement record not found.")
    return result.data[0]


@router.delete("/{placement_id}")
def delete_placement(
    placement_id: str,
    current_user: dict = Depends(get_current_user),
):
    _require_admin(current_user)
    result = supabase.table("placement_celebrations").delete().eq("id", placement_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Placement record not found.")
    return {"message": "Placement celebration deleted successfully."}
