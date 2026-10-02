from datetime import datetime, timezone
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from database import users_collection
from security.dependencies import get_current_user


router = APIRouter(
    prefix="/profile",
    tags=["Profile"]
)


# ============================================================
# SCHEMAS
# ============================================================

class StudentProfilePayload(BaseModel):
    student_id: Optional[str] = None
    department: Optional[str] = None
    course: Optional[str] = None
    academic_year: Optional[str] = None
    graduation_year: Optional[str] = None
    phone: Optional[str] = None


class AlumniProfilePayload(BaseModel):
    alumni_id: Optional[str] = None
    department: Optional[str] = None
    degree: Optional[str] = None
    graduation_year: Optional[str] = None
    company: Optional[str] = None
    designation: Optional[str] = None
    industry: Optional[str] = None
    location: Optional[str] = None
    skills: Optional[List[str]] = None
    linkedin: Optional[str] = None
    github: Optional[str] = None
    website: Optional[str] = None
    bio: Optional[str] = None


class ProfileUpdateRequest(BaseModel):
    name: Optional[str] = None
    full_name: Optional[str] = None
    fullName: Optional[str] = None
    avatar_url: Optional[str] = None

    # Nested sub-profile objects
    student_profile: Optional[StudentProfilePayload] = None
    alumni_profile: Optional[AlumniProfilePayload] = None

    # Flat student fields
    studentId: Optional[str] = None
    student_id: Optional[str] = None
    department: Optional[str] = None
    course: Optional[str] = None
    academicYear: Optional[str] = None
    academic_year: Optional[str] = None
    graduationYear: Optional[str] = None
    graduation_year: Optional[str] = None
    phone: Optional[str] = None

    # Flat alumni fields
    alumniId: Optional[str] = None
    alumni_id: Optional[str] = None
    degree: Optional[str] = None
    company: Optional[str] = None
    designation: Optional[str] = None
    industry: Optional[str] = None
    location: Optional[str] = None
    skills: Optional[List[str]] = None
    linkedin: Optional[str] = None
    github: Optional[str] = None
    website: Optional[str] = None
    bio: Optional[str] = None


class AvatarUploadRequest(BaseModel):
    avatar_url: str


# ============================================================
# HELPERS
# ============================================================

def _find_user(user_id: str):
    existing_user = users_collection.find_one({"_id": user_id})
    if not existing_user:
        try:
            from bson import ObjectId
            existing_user = users_collection.find_one({"_id": ObjectId(user_id)})
        except Exception:
            existing_user = None
    return existing_user


def _build_profile_response(user: dict) -> dict:
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
        profile["alumni_profile"] = user.get("alumni_profile", {}) or {}

    return profile


# ============================================================
# ROUTES
# ============================================================

@router.get("/me")
def get_my_profile(current_user=Depends(get_current_user)):
    user_id = current_user["user_id"]
    existing_user = _find_user(user_id)

    if not existing_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User profile not found."
        )

    return _build_profile_response(existing_user)


@router.put("/me")
@router.patch("/me")
def update_my_profile(
    payload: ProfileUpdateRequest,
    current_user=Depends(get_current_user)
):
    user_id = current_user["user_id"]
    existing_user = _find_user(user_id)

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

    update_fields = {}
    now = datetime.now(timezone.utc)
    update_fields["updated_at"] = now

    new_name = payload.fullName or payload.full_name or payload.name
    if new_name is not None and new_name.strip():
        update_fields["name"] = new_name.strip()

    if payload.avatar_url is not None:
        update_fields["avatar_url"] = payload.avatar_url

    role = existing_user.get("role")

    if role == "student":
        current_sub = dict(existing_user.get("student_profile", {}) or {})
        nested = payload.student_profile

        def _get_val(key_nested, key_camel, key_snake):
            if nested and getattr(nested, key_nested, None) is not None:
                return getattr(nested, key_nested)
            if getattr(payload, key_camel, None) is not None:
                return getattr(payload, key_camel)
            if getattr(payload, key_snake, None) is not None:
                return getattr(payload, key_snake)
            return None

        for field_name, camel, snake in [
            ("student_id", "studentId", "student_id"),
            ("department", "department", "department"),
            ("course", "course", "course"),
            ("academic_year", "academicYear", "academic_year"),
            ("graduation_year", "graduationYear", "graduation_year"),
            ("phone", "phone", "phone"),
        ]:
            val = _get_val(field_name, camel, snake)
            if val is not None:
                current_sub[field_name] = val

        update_fields["student_profile"] = current_sub

    elif role == "alumni":
        current_sub = dict(existing_user.get("alumni_profile", {}) or {})
        nested = payload.alumni_profile

        def _get_alumni_val(key_nested, key_camel, key_snake):
            if nested and getattr(nested, key_nested, None) is not None:
                return getattr(nested, key_nested)
            if getattr(payload, key_camel, None) is not None:
                return getattr(payload, key_camel)
            if getattr(payload, key_snake, None) is not None:
                return getattr(payload, key_snake)
            return None

        for field_name, camel, snake in [
            ("alumni_id", "alumniId", "alumni_id"),
            ("department", "department", "department"),
            ("degree", "degree", "degree"),
            ("graduation_year", "graduationYear", "graduation_year"),
            ("company", "company", "company"),
            ("designation", "designation", "designation"),
            ("industry", "industry", "industry"),
            ("location", "location", "location"),
            ("skills", "skills", "skills"),
            ("linkedin", "linkedin", "linkedin"),
            ("github", "github", "github"),
            ("website", "website", "website"),
            ("bio", "bio", "bio"),
        ]:
            val = _get_alumni_val(field_name, camel, snake)
            if val is not None:
                current_sub[field_name] = val

        update_fields["alumni_profile"] = current_sub

    users_collection.update_one(
        {"_id": existing_user["_id"]},
        {"$set": update_fields}
    )

    updated_user = _find_user(user_id)
    return _build_profile_response(updated_user)


@router.post("/avatar")
def update_my_avatar(
    payload: AvatarUploadRequest,
    current_user=Depends(get_current_user)
):
    user_id = current_user["user_id"]
    existing_user = _find_user(user_id)

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