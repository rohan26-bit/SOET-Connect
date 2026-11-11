import re
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, field_validator

from database import supabase, users_collection
from schemas.profile import ProfileUpdateRequest
from security.dependencies import get_current_user
from security.avatar_validation import validate_avatar_url
from services.delivery import normalize_phone_number


router = APIRouter(
    prefix="/profile",
    tags=["Profile"]
)


# ============================================================
# SCHEMAS
# ============================================================

class AvatarUploadRequest(BaseModel):
    avatar_url: str = Field(..., max_length=3_000_000)

    @field_validator("avatar_url")
    @classmethod
    def validate_avatar_url(cls, v: str) -> str:
        validated = validate_avatar_url(v)
        if validated is None:
            raise ValueError("Avatar URL cannot be empty.")
        return validated


# ============================================================
# HELPERS
# ============================================================

def get_user_by_id(user_id: str):
    """Find a user by id string in Supabase PostgreSQL."""
    if not user_id:
        return None
    user_id_str = str(user_id).strip()
    try:
        user = users_collection.find_one({"_id": user_id_str})
        if user:
            return user
    except Exception:
        pass

    for candidate in users_collection.find({}):
        if str(candidate.get("_id")) == user_id_str:
            return candidate

    return None


def _build_profile_response(user: dict) -> dict:
    """Build standardized user profile dictionary."""
    profile = {
        "id": str(user["_id"]),
        "name": user.get("name", ""),
        "full_name": user.get("name", ""),
        "email": user.get("email", ""),
        "role": user.get("role", ""),
        "avatar_url": user.get("avatar_url"),
        "is_active": user.get("is_active", True),
        "is_verified": user.get("is_verified", False),
    }

    if user.get("role") == "student":
        profile["student_profile"] = user.get("student_profile", {}) or {}

    elif user.get("role") == "alumni":
        alumni_profile = dict(user.get("alumni_profile", {}) or {})
        alumni_profile.setdefault(
            "verification_status",
            user.get("verification_status", "pending")
        )
        profile["alumni_profile"] = alumni_profile

    return profile


# ============================================================
# ROUTES
# ============================================================

@router.get("/me")
def get_my_profile(
    current_user: dict = Depends(get_current_user)
):
    existing_user = get_user_by_id(current_user["user_id"])

    if not existing_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User profile not found."
        )

    if not existing_user.get("is_active", True):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account has been deactivated."
        )

    return _build_profile_response(existing_user)


@router.put("/me")
@router.patch("/me")
def update_my_profile(
    profile: ProfileUpdateRequest,
    current_user: dict = Depends(get_current_user)
):
    existing_user = get_user_by_id(current_user["user_id"])

    if not existing_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User profile not found."
        )

    if not existing_user.get("is_active", True):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account has been deactivated."
        )

    update_data = {}

    # Extract name / full_name
    incoming_name = profile.fullName or profile.full_name or profile.name
    if incoming_name is not None:
        full_name = incoming_name.strip()
        if not full_name:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Full name cannot be empty."
            )
        update_data["name"] = full_name

    # Extract avatar_url
    if profile.avatar_url is not None:
        update_data["avatar_url"] = profile.avatar_url

    role = existing_user.get("role")

    if role == "student":
        current_sub = dict(existing_user.get("student_profile", {}) or {})
        fields = {
            "student_id": profile.studentId or profile.student_id,
            "department": profile.department,
            "course": profile.course,
            "academic_year": profile.academicYear or profile.academic_year,
            "graduation_year": profile.graduationYear or profile.graduation_year,
            "phone": profile.phone,
        }

        for key, value in fields.items():
            if value is not None and key != "phone":
                current_sub[key] = (
                    value.strip()
                    if isinstance(value, str)
                    else value
                )

        if fields["phone"] is not None:
            normalized_phone = normalize_phone_number(fields["phone"])
            if not re.fullmatch(r"\+[1-9][0-9]{7,14}", normalized_phone):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Enter a valid phone number with country code.",
                )
            previous_phone = normalize_phone_number(existing_user.get("phone") or current_sub.get("phone") or "")
            current_sub["phone"] = normalized_phone
            update_data["phone"] = normalized_phone
            # A changed number must be re-verified before SMS recovery or SMS notifications.
            if normalized_phone != previous_phone:
                update_data["is_phone_verified"] = False
                update_data["phone_version"] = int(existing_user.get("phone_version") or 0) + 1

        if any(value is not None for value in fields.values()):
            update_data["student_profile"] = current_sub

    elif role == "alumni":
        current_sub = dict(existing_user.get("alumni_profile", {}) or {})
        fields = {
            "alumni_id": profile.alumniId or profile.alumni_id,
            "department": profile.department,
            "degree": profile.degree,
            "graduation_year": profile.graduationYear or profile.graduation_year,
            "company": profile.company,
            "designation": profile.designation,
            "industry": profile.industry,
            "location": profile.location,
            "skills": profile.skills,
            "linkedin": profile.linkedin,
            "github": profile.github,
            "website": profile.website,
            "bio": profile.bio,
        }

        for key, value in fields.items():
            if value is not None:
                current_sub[key] = (
                    value.strip()
                    if isinstance(value, str)
                    else value
                )

        if any(value is not None for value in fields.values()):
            update_data["alumni_profile"] = current_sub

        if profile.phone is not None:
            normalized_phone = normalize_phone_number(profile.phone)
            if not re.fullmatch(r"\+[1-9][0-9]{7,14}", normalized_phone):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Enter a valid phone number with country code.",
                )
            previous_phone = normalize_phone_number(existing_user.get("phone") or "")
            update_data["phone"] = normalized_phone
            if normalized_phone != previous_phone:
                update_data["is_phone_verified"] = False
                update_data["phone_version"] = int(existing_user.get("phone_version") or 0) + 1

    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No profile changes were provided."
        )

    update_data["updated_at"] = datetime.now(timezone.utc)

    users_collection.update_one(
        {"_id": existing_user["_id"]},
        {"$set": update_data}
    )

    # A phone edit invalidates every outstanding OTP for the previous contact.
    if "phone" in update_data and update_data.get("is_phone_verified") is False:
        database_user_id = str(existing_user.get("_db_id") or existing_user.get("_id"))
        try:
            supabase.table("phone_verification_codes").update({
                "is_used": True,
            }).eq("user_id", database_user_id).eq("is_used", False).execute()
        except Exception as exc:
            print(f"Unable to invalidate stale phone verification challenges for user {database_user_id}: {exc}")
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Unable to update your phone number right now. Please try again.",
            ) from exc

    profile_dict = _build_profile_response(get_user_by_id(current_user["user_id"]))
    return {
        "message": "Profile updated successfully.",
        "profile": profile_dict,
        **profile_dict,
    }


@router.post("/avatar")
def update_my_avatar(
    payload: AvatarUploadRequest,
    current_user: dict = Depends(get_current_user)
):
    existing_user = get_user_by_id(current_user["user_id"])

    if not existing_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User profile not found."
        )

    if not existing_user.get("is_active", True):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account has been deactivated."
        )

    users_collection.update_one(
        {"_id": existing_user["_id"]},
        {"$set": {
            "avatar_url": payload.avatar_url,
            "updated_at": datetime.now(timezone.utc)
        }}
    )

    return {
        "message": "Avatar updated successfully.",
        "avatar_url": payload.avatar_url
    }
