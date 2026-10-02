from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, status

from database import users_collection
from schemas.profile import ProfileUpdateRequest
from security.dependencies import get_current_user


router = APIRouter(
    prefix="/profile",
    tags=["Profile"]
)


def get_user_by_id(user_id: str):
    try:
        user = users_collection.find_one({"_id": ObjectId(user_id)})
        if user:
            return user
    except Exception:
        pass

    try:
        user = users_collection.find_one({"_id": user_id})
        if user:
            return user
    except Exception:
        pass

    for candidate in users_collection.find({}):
        if str(candidate.get("_id")) == str(user_id):
            return candidate

    return None


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

    profile = {
        "id": str(existing_user["_id"]),
        "name": existing_user["name"],
        "email": existing_user["email"],
        "role": existing_user["role"],
        "is_active": existing_user.get("is_active", True),
        "is_verified": existing_user.get("is_verified", False)
    }

    if existing_user["role"] == "student":
        profile["student_profile"] = existing_user.get(
            "student_profile",
            {}
        )

    elif existing_user["role"] == "alumni":
        alumni_profile = existing_user.get(
            "alumni_profile",
            {}
        ).copy()

        alumni_profile.setdefault(
            "verification_status",
            existing_user.get("verification_status", "pending")
        )

        profile["alumni_profile"] = alumni_profile

    return profile


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

    if profile.full_name is not None:
        full_name = profile.full_name.strip()

        if not full_name:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Full name cannot be empty."
            )

        update_data["name"] = full_name

    role = existing_user["role"]

    if role == "student":
        current_profile = existing_user.get(
            "student_profile",
            {}
        ).copy()

        fields = {
            "student_id": profile.student_id,
            "department": profile.department,
            "course": profile.course,
            "academic_year": profile.academic_year,
            "graduation_year": profile.graduation_year,
            "phone": profile.phone
        }

        for key, value in fields.items():
            if value is not None:
                current_profile[key] = (
                    value.strip()
                    if isinstance(value, str)
                    else value
                )

        if any(value is not None for value in fields.values()):
            update_data["student_profile"] = current_profile

    elif role == "alumni":
        current_profile = existing_user.get(
            "alumni_profile",
            {}
        ).copy()

        fields = {
            "alumni_id": profile.alumni_id,
            "department": profile.department,
            "degree": profile.degree,
            "graduation_year": profile.graduation_year,
            "company": profile.company,
            "designation": profile.designation,
            "industry": profile.industry,
            "location": profile.location,
            "skills": profile.skills,
            "linkedin": profile.linkedin,
            "github": profile.github,
            "website": profile.website,
            "bio": profile.bio
        }

        for key, value in fields.items():
            if value is not None:
                current_profile[key] = (
                    value.strip()
                    if isinstance(value, str)
                    else value
                )

        if any(value is not None for value in fields.values()):
            update_data["alumni_profile"] = current_profile

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

    return {
        "message": "Profile updated successfully.",
        "profile": get_my_profile(current_user)
    }
