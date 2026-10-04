from collections import Counter
from pathlib import Path
import json

from fastapi import APIRouter, Depends, HTTPException

from database import users_collection, supabase
from security.dependencies import get_current_user
from services.notifications import NOTIFICATION_TYPES, create_notification_once


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
    pending_students = 0
    total_alumni = 0
    verified_alumni = 0
    pending_alumni = 0

    for user in active_users:
        role = user.get("role")

        if role == "student":
            total_students += 1
            if not user.get("is_verified", False) and user.get("verification_status", "pending") == "pending":
                pending_students += 1

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
        "pendingStudents": pending_students,
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


@router.get("/students/pending")
def get_pending_students(
    current_user: dict = Depends(get_current_user)
):
    _require_admin(current_user)

    student_users = users_collection.find({
        "role": "student",
    })

    return [
        _sanitize_user(student)
        for student in student_users
        if not student.get("is_verified", False) and student.get("verification_status", "pending") == "pending"
    ]


@router.patch("/students/{user_id}/verification")
def update_student_verification(
    user_id: str,
    status: str,
    current_user: dict = Depends(get_current_user)
):
    _require_admin(current_user)

    if status not in {"approved", "rejected", "suspended"}:
        raise HTTPException(
            status_code=400,
            detail="Invalid verification status."
        )

    target_user = users_collection.find_one({
        "_id": str(user_id),
        "role": "student"
    })

    if not target_user:
        for candidate in users_collection.find({"role": "student"}):
            if str(candidate.get("_id")) == str(user_id):
                target_user = candidate
                break

    if not target_user:
        other_user = _find_user_by_id(user_id)
        if other_user and other_user.get("role") != "student":
            raise HTTPException(
                status_code=400,
                detail="Target user is not a student."
            )
        raise HTTPException(
            status_code=404,
            detail="Student user not found."
        )

    is_verified = (status == "approved")
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
                    title="Student account approved",
                    message="Your SOET Connect student account has been approved. You can now sign in and access the portal.",
                    notification_type=NOTIFICATION_TYPES.get("student_verification", "student_verification"),
                    entity_type="student",
                    entity_id=target_uid,
                    dedupe_key=f"student_verification:{target_uid}:approved",
                )
            except Exception:
                pass
        elif status == "rejected":
            try:
                create_notification_once(
                    user_id=target_uid,
                    title="Student account registration rejected",
                    message="Your SOET Connect student account registration was rejected by an administrator.",
                    notification_type=NOTIFICATION_TYPES.get("student_verification", "student_verification"),
                    entity_type="student",
                    entity_id=target_uid,
                    dedupe_key=f"student_verification:{target_uid}:rejected",
                )
            except Exception:
                pass
        elif status == "suspended":
            try:
                create_notification_once(
                    user_id=target_uid,
                    title="Student account suspended",
                    message="Your SOET Connect student account has been suspended by an administrator.",
                    notification_type=NOTIFICATION_TYPES.get("student_verification", "student_verification"),
                    entity_type="student",
                    entity_id=target_uid,
                    dedupe_key=f"student_verification:{target_uid}:suspended",
                )
            except Exception:
                pass

    return {
        "user_id": str(user_id),
        "status": status,
        "is_verified": is_verified,
        "message": f"Student verification status updated to {status}."
    }


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
