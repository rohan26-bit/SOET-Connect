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
# JSON DATA FILE PATHS
# ============================================================

_BACKEND_DIR = Path(__file__).resolve().parent.parent

JOBS_FILE = _BACKEND_DIR / "jobs_data.json"
APPLICATIONS_FILE = _BACKEND_DIR / "applications_data.json"
EVENTS_FILE = _BACKEND_DIR / "events_data.json"
EVENT_REGISTRATIONS_FILE = _BACKEND_DIR / "event_registrations_data.json"
ANNOUNCEMENTS_FILE = _BACKEND_DIR / "announcements_data.json"
NOTIFICATIONS_FILE = _BACKEND_DIR / "notifications_data.json"


# ============================================================
# HELPERS
# ============================================================

def _load_json(filepath: Path) -> list[dict]:
    try:
        if filepath.exists():
            return json.loads(filepath.read_text(encoding="utf-8"))
    except Exception:
        pass

    return []


def _count_by(items: list[dict], field: str) -> dict[str, int]:
    """Return a dict mapping field values to their counts."""
    return dict(Counter(
        str(item.get(field, "unknown")) for item in items
    ))


# ============================================================
# GET /admin/stats  — Dashboard statistics (admin only)
# ============================================================

@router.get("/stats")
def get_admin_stats(
    current_user: dict = Depends(get_current_user),
):
    if current_user.get("role") != "admin":
        raise HTTPException(
            status_code=403,
            detail="Admin access required."
        )

    # ---- Users (from MongoDB) ----
    all_users = list(users_collection.find({}, {"role": 1, "is_verified": 1}))

    users_by_role = dict(Counter(
        u.get("role", "unknown") for u in all_users
    ))

    alumni_users = [u for u in all_users if u.get("role") == "alumni"]
    alumni_verified = sum(
        1 for u in alumni_users if u.get("is_verified", False)
    )
    alumni_pending = len(alumni_users) - alumni_verified

    # ---- Jobs ----
    jobs = _load_json(JOBS_FILE)
    jobs_by_status = _count_by(jobs, "status")

    # ---- Applications ----
    applications = _load_json(APPLICATIONS_FILE)
    applications_by_status = _count_by(applications, "status")

    # ---- Events ----
    events = _load_json(EVENTS_FILE)
    events_by_status = _count_by(events, "status")

    # ---- Event Registrations ----
    event_registrations = _load_json(EVENT_REGISTRATIONS_FILE)

    # ---- Announcements ----
    announcements = _load_json(ANNOUNCEMENTS_FILE)

    # ---- Notifications ----
    notifications = _load_json(NOTIFICATIONS_FILE)

    return {
        "users": {
            "total": len(all_users),
            "by_role": users_by_role,
        },
        "alumni": {
            "total": len(alumni_users),
            "verified": alumni_verified,
            "pending": alumni_pending,
        },
        "jobs": {
            "total": len(jobs),
            "by_status": jobs_by_status,
        },
        "applications": {
            "total": len(applications),
            "by_status": applications_by_status,
        },
        "events": {
            "total": len(events),
            "by_status": events_by_status,
        },
        "event_registrations": {
            "total": len(event_registrations),
        },
        "announcements": {
            "total": len(announcements),
        },
        "notifications": {
            "total": len(notifications),
        },
    }
