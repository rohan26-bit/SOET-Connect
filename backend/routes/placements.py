import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, Field, field_validator

from database import supabase
from security.dependencies import get_current_user
from security.placement_photo_urls import sanitize_placement_photo_url, validate_placement_photo_url


router = APIRouter(prefix="/placements", tags=["Placement Celebrations"])


class PlacementCreateRequest(BaseModel):
    alumni_name: str = Field(min_length=2, max_length=255)
    company_name: str = Field(min_length=2, max_length=255)
    designation: str | None = Field(default=None, max_length=255)
    department: str | None = Field(default=None, max_length=160)
    batch_year: str | None = Field(default=None, max_length=20)
    photo_url: str | None = Field(default=None, max_length=2048)
    photo_consent: bool = False
    message: str | None = Field(default=None, max_length=1000)
    is_published: bool = False

    @field_validator("photo_url")
    @classmethod
    def validate_photo_url(cls, value: str | None) -> str | None:
        return validate_placement_photo_url(value)


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

    @field_validator("photo_url")
    @classmethod
    def validate_photo_url(cls, value: str | None) -> str | None:
        return validate_placement_photo_url(value)


def _require_admin(current_user: dict) -> None:
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only administrators can manage placement celebrations.")


def _normalise_photo_url(value: str | None) -> str | None:
    try:
        return validate_placement_photo_url(value)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


def _sanitize_placement_row(row: dict) -> dict:
    """Copy a placement row and hide unsupported legacy photo URLs."""
    result = dict(row)
    result["photo_url"] = sanitize_placement_photo_url(result.get("photo_url"))
    return result


def _load_placements(query):
    try:
        result = query.order("created_at", desc=True).execute()
        return [_sanitize_placement_row(row) for row in (result.data or [])]
    except Exception as exc:
        print("Error loading placement celebrations:", exc)
        raise HTTPException(status_code=503, detail="Placement celebrations are temporarily unavailable. Apply migration 005 and retry.")


@router.get("")
def get_published_placements(
    response: Response,
    limit: int = Query(default=100, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    search: str | None = Query(default=None, max_length=100),
):
    """Public published feed with count-aware pagination for homepage and gallery archive."""
    query = (
        supabase.table("placement_celebrations")
        .select(
            "id,alumni_name,company_name,designation,department,batch_year,photo_url,message,created_at",
            count="exact",
        )
        .eq("is_published", True)
    )

    # Keep the PostgREST OR expression safe and predictable.
    search_term = "".join(
        char for char in (search or "").strip()
        if char.isalnum() or char.isspace() or char in "-_"
    ).strip()
    if search_term:
        needle = f"%{search_term}%"
        query = query.or_(
            ",".join(
                f"{column}.ilike.{needle}"
                for column in (
                    "alumni_name",
                    "company_name",
                    "designation",
                    "department",
                    "batch_year",
                    "message",
                )
            )
        )

    try:
        result = query.order("created_at", desc=True).range(offset, offset + limit - 1).execute()
    except Exception as exc:
        print("Error loading public placement celebrations:", exc)
        raise HTTPException(status_code=503, detail="Placement celebrations are temporarily unavailable.")

    response.headers["X-Total-Count"] = str(result.count or 0)
    response.headers["Access-Control-Expose-Headers"] = "X-Total-Count"
    return [_sanitize_placement_row(row) for row in (result.data or [])]


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
    return _sanitize_placement_row(result.data[0]) if result.data else _sanitize_placement_row(row)


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
    will_have_photo = sanitize_placement_photo_url(
        updates.get("photo_url", current_row.get("photo_url"))
    )
    if will_publish and not will_have_consent:
        raise HTTPException(status_code=400, detail="Photo consent is required before publishing this placement.")
    if will_publish and not will_have_photo:
        raise HTTPException(status_code=400, detail="A photo is required before publishing a placement celebration.")

    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    result = supabase.table("placement_celebrations").update(updates).eq("id", placement_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Placement record not found.")
    return _sanitize_placement_row(result.data[0])


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
