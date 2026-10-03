from collections import Counter
from pathlib import Path
import json

from fastapi import APIRouter, Depends, HTTPException

from database import users_collection, supabase
from security.dependencies import get_current_user


router = APIRouter(
    prefix="/admin",
    tags=["Admin"]
)

# Legacy file attributes for test monkeypatch compatibility
JOBS_FILE = None
EVENTS_FILE = None
REGISTRATIONS_FILE = None
EVENT_REGISTRATIONS_FILE = None
APPLICATIONS_FILE = None


# ============================================================
# HELPERS
# ============================================================

def _require_admin(current_user: dict):
    """Raise 403 if the authenticated user is not an admin."""
    if current_user.get("role") != "admin":
        raise HTTPException(
            status_code=403,
            detail="Admin access required."
        )


def _count_by(items: list[dict], field: str) -> dict[str, int]:
    """Return a dict mapping field values to their counts."""
    return dict(Counter(
        str(item.get(field, "unknown")) for item in items
    ))


def _read_data(table_name: str, file_path) -> list[dict]:
    """Read from test-patched JSON file if present, otherwise query Supabase table."""
    if file_path and Path(file_path).exists():
        try:
            content = Path(file_path).read_text(encoding="utf-8").strip()
            if content and content != "[]":
                data = json.loads(content)
                if isinstance(data, list):
                    return data
        except Exception:
            pass
    try:
        return supabase.table(table_name).select("*").execute().data or []
    except Exception:
        return []


def _gather_stats() -> dict:
    """Gather all dashboard statistics from Supabase PostgreSQL tables."""
    all_users = list(users_collection.find({}))

    users_by_role = dict(Counter(
        u.get("role", "unknown") for u in all_users
    ))

    alumni_users = [u for u in all_users if u.get("role") == "alumni"]
    alumni_verified = sum(
        1 for u in alumni_users if u.get("is_verified", False)
    )
    alumni_pending = sum(
        1 for u in alumni_users
        if not u.get("is_verified", False) and u.get("verification_status", "pending") == "pending"
    )

    jobs = _read_data("jobs", JOBS_FILE)
    jobs_by_status = _count_by(jobs, "status")

    applications = _read_data("job_applications", APPLICATIONS_FILE)
    applications_by_status = _count_by(applications, "status")
    if "submitted" in applications_by_status and "applied" not in applications_by_status:
        applications_by_status["applied"] = applications_by_status["submitted"]

    events = _read_data("events", EVENTS_FILE)
    events_by_status = _count_by(events, "status")

    event_registrations = _read_data("event_registrations", REGISTRATIONS_FILE or EVENT_REGISTRATIONS_FILE)

    try:
        announcements = supabase.table("announcements").select("*").execute().data or []
    except Exception:
        announcements = []

    try:
        notifications = supabase.table("notifications").select("*").execute().data or []
    except Exception:
        notifications = []

    return {
        "all_users": all_users,
        "users_by_role": users_by_role,
        "alumni_users": alumni_users,
        "alumni_verified": alumni_verified,
        "alumni_pending": alumni_pending,
        "jobs": jobs,
        "jobs_by_status": jobs_by_status,
        "applications": applications,
        "applications_by_status": applications_by_status,
        "events": events,
        "events_by_status": events_by_status,
        "event_registrations": event_registrations,
        "announcements": announcements,
        "notifications": notifications,
    }


# ============================================================
# ADMIN DASHBOARD METRICS
# ============================================================

@router.get("/metrics")
def get_dashboard_metrics(
    current_user: dict = Depends(get_current_user)
):
    _require_admin(current_user)

    active_users = users_collection.find({
        "is_active": True
    })

    total_students = 0
    total_alumni = 0
    verified_alumni = 0
    pending_alumni = 0

    for user in active_users:
        role = user.get("role")

        if role == "student":
            total_students += 1

        elif role == "alumni":
            total_alumni += 1

            if user.get("is_verified", False):
                verified_alumni += 1

            if not user.get("is_verified", False) and user.get("verification_status", "pending") == "pending":
                pending_alumni += 1

    jobs = _read_data("jobs", JOBS_FILE)
    total_jobs = len(jobs)
    pending_jobs = sum(1 for job in jobs if job.get("status") == "pending")

    events = _read_data("events", EVENTS_FILE)
    registrations = _read_data("event_registrations", REGISTRATIONS_FILE or EVENT_REGISTRATIONS_FILE)

    total_events = len(events)
    pending_events = sum(1 for event in events if event.get("status") == "pending")
    total_registrations = len(registrations)

    applications = _read_data("job_applications", APPLICATIONS_FILE)
    total_applications = len(applications)

    return {
        "totalStudents": total_students,
        "totalAlumni": total_alumni,
        "verifiedAlumni": verified_alumni,
        "pendingAlumni": pending_alumni,
        "totalJobs": total_jobs,
        "pendingJobs": pending_jobs,
        "totalEvents": total_events,
        "pendingEvents": pending_events,
        "totalApplications": total_applications,
        "totalRegistrations": total_registrations,
    }


# ============================================================
# GET /admin/stats — Dashboard statistics
# ============================================================

@router.get("/stats")
def get_admin_stats(
    current_user: dict = Depends(get_current_user),
):
    _require_admin(current_user)

    s = _gather_stats()

    return {
        "users": {
            "total": len(s["all_users"]),
            "by_role": s["users_by_role"],
        },
        "alumni": {
            "total": len(s["alumni_users"]),
            "verified": s["alumni_verified"],
            "pending": s["alumni_pending"],
        },
        "jobs": {
            "total": len(s["jobs"]),
            "by_status": s["jobs_by_status"],
        },
        "applications": {
            "total": len(s["applications"]),
            "by_status": s["applications_by_status"],
        },
        "events": {
            "total": len(s["events"]),
            "by_status": s["events_by_status"],
        },
        "event_registrations": {
            "total": len(s["event_registrations"]),
        },
        "announcements": {
            "total": len(s["announcements"]),
        },
        "notifications": {
            "total": len(s["notifications"]),
        },
    }


# ============================================================
# ADMIN STUDENTS MANAGEMENT
# ============================================================

def _sanitize_user(user: dict) -> dict:
    """Build a safe user response, stripping sensitive fields."""
    profile = user.get("student_profile", {}) or {}

    if user.get("role") == "alumni":
        profile = user.get("alumni_profile", {}) or {}

    return {
        "id": str(user["_id"]),
        "full_name": user.get("name", ""),
        "email": user.get("email", ""),
        "role": user.get("role", ""),
        "avatar_url": user.get("avatar_url"),
        "department": profile.get("department"),
        "degree": profile.get("degree"),
        "graduation_year": profile.get("graduation_year"),
        "course_or_company": (
            profile.get("course")
            or profile.get("company")
            or profile.get("department")
        ),
        "company": profile.get("company"),
        "designation": profile.get("designation"),
        "industry": profile.get("industry"),
        "location": profile.get("location"),
        "skills": profile.get("skills", []),
        "linkedin": profile.get("linkedin"),
        "github": profile.get("github"),
        "website": profile.get("website"),
        "bio": profile.get("bio"),
        "is_verified": user.get("is_verified", False),
        "verification_status": user.get(
            "verification_status", "pending"
        ),
        "is_active": user.get("is_active", True),
        "created_at": user.get("created_at"),
    }


@router.get("/students")
def get_all_students(
    current_user: dict = Depends(get_current_user)
):
    _require_admin(current_user)

    student_users = users_collection.find({
        "role": "student",
    })

    return [
        _sanitize_user(student)
        for student in student_users
    ]


# ============================================================
# TOGGLE USER ACTIVE STATUS
# ============================================================

def _find_user_by_id(user_id: str) -> dict | None:
    """Find a user by string ID."""
    if not user_id:
        return None

    user_id_str = str(user_id).strip()
    user = users_collection.find_one({"_id": user_id_str})
    if user:
        return user

    for candidate in users_collection.find({}):
        if str(candidate.get("_id")) == user_id_str:
            return candidate

    return None


@router.patch("/users/{user_id}/active")
def toggle_user_active(
    user_id: str,
    current_user: dict = Depends(get_current_user)
):
    _require_admin(current_user)

    # Prevent admin from deactivating themselves
    if current_user.get("user_id") == user_id:
        raise HTTPException(
            status_code=400,
            detail="You cannot change your own account status."
        )

    # Find the target user
    target_user = _find_user_by_id(user_id)

    if not target_user:
        raise HTTPException(
            status_code=404,
            detail="User not found."
        )

    # Prevent admin from deactivating themselves if target user's _id matches admin token
    if str(target_user.get("_id")) == str(current_user.get("user_id")):
        raise HTTPException(
            status_code=400,
            detail="You cannot change your own account status."
        )

    # Do not allow deactivation of admin accounts
    if target_user.get("role") == "admin":
        raise HTTPException(
            status_code=403,
            detail="Cannot change activation status of admin accounts."
        )

    new_active = not target_user.get("is_active", True)

    users_collection.update_one(
        {"_id": target_user["_id"]},
        {"$set": {"is_active": new_active}}
    )

    return {
        "message": (
            "User account activated."
            if new_active
            else "User account suspended."
        ),
        "user_id": user_id,
        "is_active": new_active,
    }
