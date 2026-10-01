from fastapi import APIRouter, Depends, HTTPException, status

from database import users_collection
from security.dependencies import get_current_user


router = APIRouter(
    prefix="/profile",
    tags=["Profile"]
)


@router.get("/me")
def get_my_profile(current_user=Depends(get_current_user)):
    user_id = current_user["user_id"]

    existing_user = users_collection.find_one(
        {"_id": user_id}
    )

    if not existing_user:
        try:
            from bson import ObjectId

            existing_user = users_collection.find_one(
                {"_id": ObjectId(user_id)}
            )
        except Exception:
            existing_user = None

    if not existing_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User profile not found."
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
        profile["alumni_profile"] = existing_user.get(
            "alumni_profile",
            {}
        )

    return profile