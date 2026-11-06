import concurrent.futures
from pathlib import Path
import json

from fastapi import APIRouter, Depends, HTTPException

from database import users_collection, supabase
from security.dependencies import get_current_user
from services.aci import calculate_alumni_aci, get_tier_and_badge
from services.notifications import NOTIFICATION_TYPES, create_notification_once


router = APIRouter(
    prefix="/alumni",
    tags=["Alumni"]
)

# Legacy file attributes for test monkeypatch compatibility
JOBS_FILE = None
EVENTS_FILE = None
REGISTRATIONS_FILE = None




def _created_at_sort_key(value) -> float:
    """Return a sortable timestamp; missing/invalid dates sort last."""
    if not value:
        return 0.0
    from datetime import datetime, timezone
    if isinstance(value, datetime):
        try:
            return value.timestamp()
        except (OverflowError, OSError, ValueError):
            return 0.0
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.timestamp()
    except (TypeError, ValueError, OverflowError, OSError):
        return 0.0


def _load_aci_source_data() -> tuple[list[dict], list[dict], list[dict]]:
    """Load shared ACI inputs once so directory and leaderboard scores stay consistent."""
    def _load(table_name: str, file_path: str | None, columns: str) -> list[dict]:
        if file_path and Path(file_path).exists():
            try:
                raw = Path(file_path).read_text(encoding="utf-8").strip()
                if raw and raw != "[]":
                    data = json.loads(raw)
                    if isinstance(data, list):
                        return data
            except Exception:
                pass
        try:
            return supabase.table(table_name).select(columns).execute().data or []
        except Exception as exc:
            print(f"Unable to load {table_name} for ACI: {exc}")
            return []

    return (
        _load("jobs", JOBS_FILE, "id,posted_by,status"),
        _load("events", EVENTS_FILE, "id,created_by,status"),
        _load("event_registrations", REGISTRATIONS_FILE, "id,event_id,user_id"),
    )


def get_user_from_token(current_user: dict):
    user_id = current_user.get("user_id")
    role = current_user.get("role")

    user = users_collection.find_one({"_id": str(user_id)}, include_profiles=False)
    if not user and role:
        users = users_collection.find({"role": role}, include_profiles=False)
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
# CLASS HALL OF FAME
# ============================================================

@router.get("/aci/leaderboard")
def get_aci_class_leaderboard(
    current_user: dict = Depends(get_current_user),
):
    """Rank alumni graduation classes by the combined ACI earned by their verified members."""
    alumni_users = users_collection.find({
        "role": "alumni",
        "is_active": True,
        "is_verified": True,
    })

    jobs, events, registrations = _load_aci_source_data()
    classes: dict[str, dict] = {}

    for alumni in alumni_users:
        if not alumni.get("is_active", True):
            continue
        if not alumni.get("is_verified", False):
            continue
        if str(alumni.get("verification_status") or "").lower() != "approved":
            continue

        profile = alumni.get("alumni_profile", {}) or {}
        batch_year = str(profile.get("graduation_year") or "").strip() or "Unspecified"
        user_id = str(alumni.get("_id") or alumni.get("id") or "")
        if not user_id:
            continue

        aci_data = calculate_alumni_aci(
            user_id=user_id,
            user_doc=alumni,
            jobs=jobs,
            events=events,
            registrations=registrations,
        )
        score = int(aci_data.get("score") or 0)
        contribution_points = max(
            0,
            score - int((aci_data.get("breakdown") or {}).get("verification") or 0),
        )

        row = classes.setdefault(batch_year, {
            "graduation_year": batch_year,
            "alumni_count": 0,
            "total_aci_points": 0,
            "total_activity_points": 0,
            "contributing_alumni_count": 0,
            "top_contributor": None,
        })
        row["alumni_count"] += 1
        row["total_aci_points"] += score
        row["total_activity_points"] += contribution_points
        if contribution_points > 0:
            row["contributing_alumni_count"] += 1

        top = row["top_contributor"]
        if top is None or score > top["aci_score"]:
            row["top_contributor"] = {
                "name": alumni.get("name") or "SOET Alumnus",
                "aci_score": score,
            }

    leaderboard = list(classes.values())
    for row in leaderboard:
        row["average_aci_points"] = round(
            row["total_aci_points"] / row["alumni_count"], 1
        ) if row["alumni_count"] else 0

    leaderboard.sort(
        key=lambda row: (
            row["total_aci_points"],
            row["total_activity_points"],
            row["contributing_alumni_count"],
            row["graduation_year"],
        ),
        reverse=True,
    )
    for index, row in enumerate(leaderboard, start=1):
        row["rank"] = index

    return {
        "leaderboard": leaderboard,
        "total_classes": len(leaderboard),
        "total_alumni": sum(row["alumni_count"] for row in leaderboard),
    }


# ============================================================
# INDIVIDUAL ALUMNI HALL OF FAME
# ============================================================

@router.get("/aci/individual-leaderboard")
def get_aci_individual_leaderboard(
    limit: int = 10,
    current_user: dict = Depends(get_current_user),
):
    """Return the top verified alumni ranked by ACI earned through actual activity."""
    limit = max(1, min(int(limit), 50))
    alumni_users = users_collection.find({
        "role": "alumni",
        "is_active": True,
        "is_verified": True,
    })

    jobs, events, registrations = _load_aci_source_data()
    ranked_alumni: list[dict] = []

    for alumni in alumni_users:
        if not alumni.get("is_active", True):
            continue
        if not alumni.get("is_verified", False):
            continue
        if str(alumni.get("verification_status") or "").lower() != "approved":
            continue

        user_id = str(alumni.get("_id") or alumni.get("id") or "")
        if not user_id:
            continue

        aci_data = calculate_alumni_aci(
            user_id=user_id,
            user_doc=alumni,
            jobs=jobs,
            events=events,
            registrations=registrations,
        )
        score = int(aci_data.get("score") or 0)
        breakdown = aci_data.get("breakdown") or {}
        activity_points = max(
            0,
            score - int(breakdown.get("verification") or 0),
        )

        # Do not rank profiles whose only points come from account verification.
        if activity_points <= 0:
            continue

        profile = alumni.get("alumni_profile", {}) or {}
        tier, badge = get_tier_and_badge(score)
        ranked_alumni.append({
            "id": user_id,
            "full_name": alumni.get("name") or "SOET Alumnus",
            "avatar_url": alumni.get("avatar_url"),
            "graduation_year": str(profile.get("graduation_year") or "").strip() or "Unspecified",
            "department": profile.get("department") or "Department not provided",
            "company": profile.get("company") or "",
            "designation": profile.get("designation") or "",
            "aci_score": score,
            "activity_points": activity_points,
            "aci_tier": tier,
            "aci_badge": badge,
            "breakdown": {
                "verification": int(breakdown.get("verification") or 0),
                "jobs": int(breakdown.get("jobs") or 0),
                "events": int(breakdown.get("events") or 0),
                "registrations": int(breakdown.get("registrations") or 0),
            },
            "activity_counts": aci_data.get("activity_counts") or {},
        })

    ranked_alumni.sort(
        key=lambda item: (
            item["aci_score"],
            item["activity_points"],
            item["full_name"].casefold(),
        ),
        reverse=True,
    )
    ranked_alumni = ranked_alumni[:limit]
    for index, alumni in enumerate(ranked_alumni, start=1):
        alumni["rank"] = index

    return {
        "leaderboard": ranked_alumni,
        "total_contributors": len(ranked_alumni),
        "limit": limit,
    }


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

    def _fetch_table(table_name: str, file_path: str | None, columns: str) -> list:
        data = []
        if file_path and Path(file_path).exists():
            try:
                content = Path(file_path).read_text(encoding="utf-8").strip()
                if content and content != "[]":
                    data = json.loads(content)
            except Exception:
                data = []
        if not data:
            try:
                data = supabase.table(table_name).select(columns).execute().data or []
            except Exception:
                data = []
        return data

    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
        fut_jobs = executor.submit(_fetch_table, "jobs", JOBS_FILE, "id,posted_by,status")
        fut_events = executor.submit(_fetch_table, "events", EVENTS_FILE, "id,created_by,status")
        fut_regs = executor.submit(_fetch_table, "event_registrations", REGISTRATIONS_FILE, "id,event_id,user_id")

        jobs = fut_jobs.result()
        events = fut_events.result()
        registrations = fut_regs.result()

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
        if alumni.get("is_verified", False):
            continue
        if str(alumni.get("verification_status") or "pending").lower() != "pending":
            continue

        profile = alumni.get("alumni_profile", {}) or {}

        results.append({
            "id": str(alumni["_id"]),
            "full_name": alumni.get("name"),
            "email": alumni.get("email"),
            "alumni_id": profile.get("alumni_id"),
            "avatar_url": alumni.get("avatar_url"),
            "phone": alumni.get("phone") or profile.get("phone"),
            "is_phone_verified": alumni.get("is_phone_verified", False),
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
            "is_active": alumni.get("is_active", True),
            "created_at": alumni.get("created_at"),
            "updated_at": alumni.get("updated_at")
        })

    results.sort(key=lambda item: _created_at_sort_key(item.get("created_at")), reverse=True)
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