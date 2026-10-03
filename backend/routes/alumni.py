from pathlib import Path
import json

from fastapi import APIRouter, Depends, HTTPException

from database import users_collection, supabase
from security.dependencies import get_current_user
from services.aci import calculate_alumni_aci
from services.notifications import NOTIFICATION_TYPES, create_notification_once


router = APIRouter(
    prefix="/alumni",
    tags=["Alumni"]
)

# Legacy file attributes for test monkeypatch compatibility
JOBS_FILE = None
EVENTS_FILE = None
REGISTRATIONS_FILE = None


def get_user_from_token(current_user: dict):
    user_id = current_user.get("user_id")
    role = current_user.get("role")

    user = users_collection.find_one({"_id": str(user_id)})
    if not user and role:
        users = users_collection.find({"role": role})
        for candidate in users:
            if str(candidate.get("_id")) == str(user_id):
                user = candidate
                break
    return user


# ============================================================
# ALUMNI CONTRIBUTION INDEX (ACI)
# ============================================================

@router.get("/me/aci")
def get_my_aci(
    current_user: dict = Depends(get_current_user)
):
    if current_user.get("role") != "alumni":
        raise HTTPException(
            status_code=403,
            detail="Only alumni can access this resource."
        )

    user = get_user_from_token(current_user)
    if not user:
        raise HTTPException(
            status_code=404,
            detail="User account not found."
        )

    if not user.get("is_active", True):
        raise HTTPException(
            status_code=403,
            detail="This account has been deactivated."
        )

    if not user.get("is_verified", False) or user.get("verification_status") != "approved":
        raise HTTPException(
            status_code=403,
            detail="Your alumni account must be verified by an administrator before accessing ACI."
        )

    return calculate_alumni_aci(str(user["_id"]), user_doc=user)


# ============================================================
# ALUMNI DIRECTORY
# ============================================================

@router.get("/directory")
def get_alumni_directory(
    search: str | None = None,
    department: str | None = None,
    sort_by: str | None = None,
    current_user: dict = Depends(get_current_user)
):
    query = {
        "role": "alumni",
        "is_active": True,
        "is_verified": True
    }

    alumni_users = users_collection.find(query)

    jobs = []
    if JOBS_FILE and Path(JOBS_FILE).exists():
        try:
            content = Path(JOBS_FILE).read_text(encoding="utf-8").strip()
            if content and content != "[]":
                jobs = json.loads(content)
        except Exception:
            jobs = []
    if not jobs:
        try:
            jobs = supabase.table("jobs").select("*").execute().data or []
        except Exception:
            jobs = []

    events = []
    if EVENTS_FILE and Path(EVENTS_FILE).exists():
        try:
            content = Path(EVENTS_FILE).read_text(encoding="utf-8").strip()
            if content and content != "[]":
                events = json.loads(content)
        except Exception:
            events = []
    if not events:
        try:
            events = supabase.table("events").select("*").execute().data or []
        except Exception:
            events = []

    registrations = []
    if REGISTRATIONS_FILE and Path(REGISTRATIONS_FILE).exists():
        try:
            content = Path(REGISTRATIONS_FILE).read_text(encoding="utf-8").strip()
            if content and content != "[]":
                registrations = json.loads(content)
        except Exception:
            registrations = []
    if not registrations:
        try:
            registrations = supabase.table("event_registrations").select("*").execute().data or []
        except Exception:
            registrations = []

    results = []

    for alumni in alumni_users:
        profile = alumni.get("alumni_profile", {}) or {}

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

        aci_data = calculate_alumni_aci(
            user_id=str(alumni["_id"]),
            user_doc=alumni,
            jobs=jobs,
            events=events,
            registrations=registrations,
        )

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
            "aci_score": aci_data["score"],
            "aci_tier": aci_data["tier"],
            "aci_badge": aci_data["badge"],
        })

    if sort_by == "aci":
        results.sort(key=lambda x: x.get("aci_score", 0), reverse=True)

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
        if alumni.get("verification_status", "pending") != "pending":
            continue

        profile = alumni.get("alumni_profile", {}) or {}

        results.append({
            "id": str(alumni["_id"]),
            "full_name": alumni.get("name"),
            "email": alumni.get("email"),
            "alumni_id": profile.get("alumni_id"),
            "avatar_url": alumni.get("avatar_url"),
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
            "verification_status": alumni.get(
                "verification_status",
                "pending"
            ),
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

    target_user = users_collection.find_one({
        "_id": str(user_id),
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
    old_status = target_user.get("verification_status", "pending")
    target_uid = str(target_user["_id"])

    users_collection.update_one(
        {"_id": target_user["_id"]},
        {
            "$set": {
                "is_verified": is_verified,
                "verification_status": status
            }
        }
    )

    if old_status != status:
        if status == "approved":
            try:
                create_notification_once(
                    user_id=target_uid,
                    title="Alumni verification approved",
                    message="Your alumni account has been verified. You can now access verified alumni features.",
                    notification_type=NOTIFICATION_TYPES["alumni_verification"],
                    entity_type="alumni",
                    entity_id=target_uid,
                    dedupe_key=f"alumni_verification:{target_uid}:approved",
                )
            except Exception:
                pass
        elif status == "rejected":
            try:
                create_notification_once(
                    user_id=target_uid,
                    title="Alumni verification rejected",
                    message="Your alumni account verification was rejected. Please review your submitted information and contact the administrator if clarification is required.",
                    notification_type=NOTIFICATION_TYPES["alumni_verification"],
                    entity_type="alumni",
                    entity_id=target_uid,
                    dedupe_key=f"alumni_verification:{target_uid}:rejected",
                )
            except Exception:
                pass

    return {
        "message": f"Alumni verification status updated to {status}.",
        "user_id": user_id,
        "status": status,
        "is_verified": is_verified
    }