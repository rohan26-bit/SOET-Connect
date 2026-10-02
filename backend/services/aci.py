import json
from pathlib import Path

from database import users_collection

BACKEND_DIR = Path(__file__).resolve().parent.parent

JOBS_FILE = BACKEND_DIR / "jobs_data.json"
EVENTS_FILE = BACKEND_DIR / "events_data.json"
REGISTRATIONS_FILE = BACKEND_DIR / "event_registrations_data.json"

# Score weights
VERIFICATION_POINTS = 25
JOB_POINTS = 50
EVENT_POINTS = 40
REGISTRATION_POINTS = 10
REGISTRATION_CAP_POINTS = 100


def load_json_data(file_path: Path) -> list[dict]:
    """Load JSON records from disk defensively."""
    try:
        if file_path.exists():
            content = file_path.read_text(encoding="utf-8").strip()
            if content:
                data = json.loads(content)
                if isinstance(data, list):
                    return data
    except Exception:
        pass
    return []


def get_tier_and_badge(score: int) -> tuple[str, str]:
    """Map ACI score to corresponding contributor tier and badge."""
    if score >= 300:
        return "Platinum Contributor", "💎"
    elif score >= 150:
        return "Gold Contributor", "🥇"
    elif score >= 50:
        return "Silver Contributor", "🥈"
    else:
        return "Bronze Contributor", "🥉"


def get_user_by_id(user_id: str) -> dict | None:
    """Find user document by string or ObjectId representation."""
    user = users_collection.find_one({"_id": user_id})
    if not user:
        try:
            from bson import ObjectId
            user = users_collection.find_one({"_id": ObjectId(user_id)})
        except Exception:
            pass

    if not user:
        users = users_collection.find({"role": "alumni"})
        for candidate in users:
            if str(candidate.get("_id")) == str(user_id):
                return candidate
    return user


def calculate_alumni_aci(
    user_id: str,
    user_doc: dict | None = None,
    jobs: list[dict] | None = None,
    events: list[dict] | None = None,
    registrations: list[dict] | None = None,
) -> dict:
    """
    Calculate the Alumni Contribution Index (ACI) dynamically.

    Formula:
      ACI = Verification (+25)
          + (50 * approved_jobs)
          + (40 * approved_events_hosted)
          + (10 * valid_approved_external_registrations, capped at 100)
    """
    user_id_str = str(user_id)
    if user_doc is None:
        user_doc = get_user_by_id(user_id_str)

    # Verification and account validity
    is_active = user_doc.get("is_active", True) if user_doc else False
    is_verified = (
        user_doc.get("is_verified", False) is True
        and user_doc.get("verification_status", "pending") == "approved"
    ) if user_doc else False

    # Unverified, pending, or inactive alumni receive 0 points
    if not is_active or not is_verified:
        return {
            "score": 0,
            "tier": "Bronze Contributor",
            "badge": "🥉",
            "breakdown": {
                "verification": 0,
                "jobs": 0,
                "events": 0,
                "registrations": 0,
            },
            "activity_counts": {
                "approved_jobs": 0,
                "approved_events": 0,
                "valid_registrations": 0,
            },
        }

    verification_pts = VERIFICATION_POINTS

    # Load data from files if not passed in
    if jobs is None:
        jobs = load_json_data(JOBS_FILE)
    if events is None:
        events = load_json_data(EVENTS_FILE)
    if registrations is None:
        registrations = load_json_data(REGISTRATIONS_FILE)

    # 1. Approved Jobs Posted by this alumnus
    approved_jobs_count = 0
    for job in jobs:
        if not isinstance(job, dict):
            continue
        if (
            str(job.get("posted_by")) == user_id_str
            and job.get("status") == "approved"
        ):
            approved_jobs_count += 1
    jobs_pts = approved_jobs_count * JOB_POINTS

    # 2. Approved Campus Events Hosted by this alumnus
    approved_events_count = 0
    events_by_id = {}
    for event in events:
        if not isinstance(event, dict):
            continue
        eid = str(event.get("id"))
        events_by_id[eid] = event
        if (
            str(event.get("created_by")) == user_id_str
            and event.get("status") == "approved"
        ):
            approved_events_count += 1
    events_pts = approved_events_count * EVENT_POINTS

    # 3. Valid External Event Registrations
    # Conditions:
    # - registration.user_id == alumni_user_id
    # - target event exists and status == "approved"
    # - event.created_by != alumni_user_id (no self-registration)
    # - unique per target event (no duplicate counting)
    valid_registered_event_ids = set()
    for reg in registrations:
        if not isinstance(reg, dict):
            continue
        if str(reg.get("user_id")) != user_id_str:
            continue
        event_id = str(reg.get("event_id"))
        if event_id in valid_registered_event_ids:
            continue

        target_event = events_by_id.get(event_id)
        if not target_event:
            continue
        if target_event.get("status") != "approved":
            continue
        if str(target_event.get("created_by")) == user_id_str:
            continue

        valid_registered_event_ids.add(event_id)

    valid_reg_count = len(valid_registered_event_ids)
    raw_reg_pts = valid_reg_count * REGISTRATION_POINTS
    reg_pts = min(raw_reg_pts, REGISTRATION_CAP_POINTS)

    total_score = verification_pts + jobs_pts + events_pts + reg_pts
    tier, badge = get_tier_and_badge(total_score)

    return {
        "score": total_score,
        "tier": tier,
        "badge": badge,
        "breakdown": {
            "verification": verification_pts,
            "jobs": jobs_pts,
            "events": events_pts,
            "registrations": reg_pts,
        },
        "activity_counts": {
            "approved_jobs": approved_jobs_count,
            "approved_events": approved_events_count,
            "valid_registrations": valid_reg_count,
        },
    }
