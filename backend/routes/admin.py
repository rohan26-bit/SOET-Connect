import json
from collections import Counter
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException

from database import users_collection
from security.dependencies import get_current_user


router = APIRouter(
    prefix="/admin",
    tags=["Admin"]
)


# ============================================================
# DATA FILE PATHS
# ============================================================

BACKEND_DIR = Path(__file__).resolve().parent.parent

JOBS_FILE = BACKEND_DIR / "jobs_data.json"
EVENTS_FILE = BACKEND_DIR / "events_data.json"
REGISTRATIONS_FILE = BACKEND_DIR / "event_registrations_data.json"
EVENT_REGISTRATIONS_FILE = BACKEND_DIR / "event_registrations_data.json"
APPLICATIONS_FILE = BACKEND_DIR / "applications_data.json"
ANNOUNCEMENTS_FILE = BACKEND_DIR / "announcements_data.json"
NOTIFICATIONS_FILE = BACKEND_DIR / "notifications_data.json"


# ============================================================
# HELPERS
# ============================================================

def _load_json(filepath: Path) -> list:
    """Load a JSON array from a file, returning [] on any error."""
    try:
        if filepath.exists():
            data = filepath.read_text(encoding="utf-8").strip()
            if data:
                return json.loads(data)
    except Exception:
        pass

    return []


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


def _gather_stats() -> dict:
    """Gather all dashboard statistics from MongoDB and JSON files."""
    all_users = list(users_collection.find({}, {"role": 1, "is_verified": 1}))

    users_by_role = dict(Counter(
        u.get("role", "unknown") for u in all_users
    ))

    alumni_users = [u for u in all_users if u.get("role") == "alumni"]
    alumni_verified = sum(
        1 for u in alumni_users if u.get("is_verified", False)
    )
    alumni_pending = len(alumni_users) - alumni_verified

    jobs = _load_json(JOBS_FILE)
    jobs_by_status = _count_by(jobs, "status")

    applications = _load_json(APPLICATIONS_FILE)
    applications_by_status = _count_by(applications, "status")

    events = _load_json(EVENTS_FILE)
    events_by_status = _count_by(events, "status")

    event_registrations = _load_json(EVENT_REGISTRATIONS_FILE)

    announcements = _load_json(ANNOUNCEMENTS_FILE)
    notifications = _load_json(NOTIFICATIONS_FILE)

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
# ADMIN DASHBOARD METRICS (origin/main)
# ============================================================

@router.get("/metrics")
def get_dashboard_metrics(
    current_user: dict = Depends(get_current_user)
):
    _require_admin(current_user)

    # ------------------------------------------------------------
    # USER METRICS
    # ------------------------------------------------------------

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

            if user.get("verification_status", "pending") == "pending":
                pending_alumni += 1

    # ------------------------------------------------------------
    # JOB METRICS
    # ------------------------------------------------------------

    jobs = _load_json(JOBS_FILE)

    total_jobs = len(jobs)

    pending_jobs = sum(
        1
        for job in jobs
        if job.get("status") == "pending"
    )

    # ------------------------------------------------------------
    # EVENT METRICS
    # ------------------------------------------------------------

    events = _load_json(EVENTS_FILE)
    registrations = _load_json(REGISTRATIONS_FILE)

    total_events = len(events)

    pending_events = sum(
        1
        for event in events
        if event.get("status") == "pending"
    )

    total_registrations = len(registrations)

    # ------------------------------------------------------------
    # APPLICATION METRICS
    # ------------------------------------------------------------

    applications = _load_json(APPLICATIONS_FILE)

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
# GET /admin/stats — Dashboard statistics (feature/backend-api)
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
# ADMIN STUDENTS MANAGEMENT (origin/main)
# ============================================================

SENSITIVE_FIELDS = {
    "password_hash", "password", "token", "secret",
    "refresh_token", "access_token",
}


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
# TOGGLE USER ACTIVE STATUS (origin/main)
# ============================================================

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
    target_user = users_collection.find_one({"_id": user_id})

    if not target_user:
        raise HTTPException(
            status_code=404,
            detail="User not found."
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
