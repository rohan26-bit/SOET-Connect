from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException

from database import users_collection
from security.dependencies import get_current_user


router = APIRouter(
    prefix="/alumni",
    tags=["Alumni"]
)


# ============================================================
# ALUMNI DIRECTORY
# ============================================================

@router.get("/directory")
def get_alumni_directory(
    search: str | None = None,
    department: str | None = None,
    current_user: dict = Depends(get_current_user)
):
    query = {
        "role": "alumni",
        "is_active": True,
        "is_verified": True
    }

    alumni_users = users_collection.find(query)

    results = []

    for alumni in alumni_users:
        profile = alumni.get("alumni_profile", {})

        if department:
            alumni_department = profile.get("department", "") or ""

            if department.lower() not in alumni_department.lower():
                continue

        searchable_text = " ".join([
            alumni.get("name", "") or "",
            profile.get("company", "") or "",
            profile.get("designation", "") or "",
            profile.get("industry", "") or "",
            " ".join(str(s) for s in (profile.get("skills", []) or []))
        ]).lower()

        if search and search.lower() not in searchable_text:
            continue

        results.append({
            "id": str(alumni["_id"]),
            "full_name": alumni.get("name"),
            "email": alumni.get("email"),
            "department": profile.get("department"),
            "degree": profile.get("degree"),
            "graduation_year": profile.get("graduation_year"),
            "company": profile.get("company"),
            "designation": profile.get("designation"),
            "industry": profile.get("industry"),
            "location": profile.get("location"),
            "skills": profile.get("skills", []),
            "linkedin": profile.get("linkedin"),
            "github": profile.get("github"),
            "website": profile.get("website"),
            "bio": profile.get("bio")
        })

    return results


# ============================================================
# PENDING ALUMNI
# ADMIN ONLY
# ============================================================

@router.get("/pending")
def get_pending_alumni(
    current_user: dict = Depends(get_current_user)
):
    if current_user.get("role") != "admin":
        raise HTTPException(
            status_code=403,
            detail="Admin access required."
        )

    alumni_users = users_collection.find({
        "role": "alumni",
        "is_active": True
    })

    results = []

    for alumni in alumni_users:

        if alumni.get("is_verified", False):
            continue

        profile = alumni.get("alumni_profile", {})

        results.append({
            "id": str(alumni["_id"]),
            "full_name": alumni.get("name"),
            "email": alumni.get("email"),
            "department": profile.get("department"),
            "degree": profile.get("degree"),
            "graduation_year": profile.get("graduation_year"),
            "company": profile.get("company"),
            "designation": profile.get("designation"),
            "industry": profile.get("industry"),
            "location": profile.get("location"),
            "skills": profile.get("skills", []),
            "linkedin": profile.get("linkedin"),
            "github": profile.get("github"),
            "website": profile.get("website"),
            "bio": profile.get("bio"),
            "is_verified": alumni.get("is_verified", False),
            "created_at": alumni.get("created_at")
        })

    return results


# ============================================================
# VERIFY / REJECT / SUSPEND ALUMNI
# ADMIN ONLY
# ============================================================

@router.patch("/verify/{user_id}")
def update_alumni_verification(
    user_id: str,
    status: str,
    current_user: dict = Depends(get_current_user)
):
    if current_user.get("role") != "admin":
        raise HTTPException(
            status_code=403,
            detail="Admin access required."
        )

    if status not in {"approved", "rejected", "suspended"}:
        raise HTTPException(
            status_code=400,
            detail="Invalid verification status."
        )

    target_user = None

    try:
        target_user = users_collection.find_one({
            "_id": ObjectId(user_id),
            "role": "alumni"
        })
    except Exception:
        pass

    if not target_user:
        target_user = users_collection.find_one({
            "_id": user_id,
            "role": "alumni"
        })

    if not target_user:
        for candidate in users_collection.find({"role": "alumni"}):
            if str(candidate.get("_id")) == str(user_id):
                target_user = candidate
                break

    if not target_user:
        raise HTTPException(
            status_code=404,
            detail="Alumni user not found."
        )

    is_verified = status == "approved"

    users_collection.update_one(
        {"_id": target_user["_id"]},
        {
            "$set": {
                "is_verified": is_verified,
                "verification_status": status
            }
        }
    )

    return {
        "message": f"Alumni verification status updated to {status}.",
        "user_id": user_id,
        "status": status,
        "is_verified": is_verified
    }