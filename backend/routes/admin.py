from collections import Counter
import concurrent.futures
from pathlib import Path
import json
import csv
import io
import re
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response

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


def _sanitize_csv_cell(value: Any) -> str:
    """
    Sanitize a cell value for CSV export:
    - Neutralize formula injection: if text starts with '=', '+', '-', '@', '\t', '\r',
      prefix with a single quote "'" to prevent spreadsheet engines from evaluating formulas.
    """
    if value is None:
        return ""
    if isinstance(value, bool):
        return "Yes" if value else "No"
    s = str(value)
    if s and s[0] in ("=", "+", "-", "@", "\t", "\r"):
        s = f"'{s}"
    return s


def _slugify(text: str) -> str:
    """Produce a safe ASCII filename slug from arbitrary text."""
    clean = re.sub(r"[^\w\s-]", "", text).strip().lower()
    slug = re.sub(r"[-\s]+", "_", clean)
    return slug[:40] if slug else "export"


def _build_csv_response(filename: str, headers: list[str], rows: list[list[Any]]) -> Response:
    """
    Build a Response object containing CSV data encoded in UTF-8 with BOM (utf-8-sig)
    for seamless compatibility with Excel, Numbers, and Google Sheets.
    """
    output = io.StringIO()
    writer = csv.writer(output, quoting=csv.QUOTE_MINIMAL, lineterminator="\r\n")
    writer.writerow([_sanitize_csv_cell(h) for h in headers])
    for row in rows:
        writer.writerow([_sanitize_csv_cell(c) for c in row])

    csv_bytes = output.getvalue().encode("utf-8-sig")
    return Response(
        content=csv_bytes,
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
        },
    )


def _count_by(items: list[dict], field: str) -> dict[str, int]:
    """Return a dict mapping field values to their counts."""
    return dict(Counter(
        str(item.get(field, "unknown")) for item in items
    ))


def _read_data(table_name: str, file_path=None, columns: str = "*") -> list[dict]:
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
        return supabase.table(table_name).select(columns).execute().data or []
    except Exception:
        return []


def _gather_stats() -> dict:
    """Gather all dashboard statistics concurrently from Supabase PostgreSQL tables."""
    with concurrent.futures.ThreadPoolExecutor(max_workers=7) as executor:
        fut_users = executor.submit(users_collection.find, {}, False)
        fut_jobs = executor.submit(_read_data, "jobs", JOBS_FILE, "id,status")
        fut_apps = executor.submit(_read_data, "job_applications", APPLICATIONS_FILE, "id,status")
        fut_events = executor.submit(_read_data, "events", EVENTS_FILE, "id,status")
        fut_regs = executor.submit(_read_data, "event_registrations", REGISTRATIONS_FILE or EVENT_REGISTRATIONS_FILE, "id")
        fut_ann = executor.submit(lambda: supabase.table("announcements").select("id").execute().data or [])
        fut_notif = executor.submit(lambda: supabase.table("notifications").select("id").execute().data or [])

        all_users = list(fut_users.result())
        jobs = fut_jobs.result()
        applications = fut_apps.result()
        events = fut_events.result()
        event_registrations = fut_regs.result()
        announcements = fut_ann.result()
        notifications = fut_notif.result()

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

    jobs_by_status = _count_by(jobs, "status")

    applications_by_status = _count_by(applications, "status")
    if "submitted" in applications_by_status and "applied" not in applications_by_status:
        applications_by_status["applied"] = applications_by_status["submitted"]

    events_by_status = _count_by(events, "status")

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

    # Concurrently retrieve user tallies and table counts with minimal column payload
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
        fut_users = executor.submit(users_collection.find, {"is_active": True}, False)
        fut_jobs = executor.submit(_read_data, "jobs", JOBS_FILE, "id,status")
        fut_events = executor.submit(_read_data, "events", EVENTS_FILE, "id,status")
        fut_regs = executor.submit(_read_data, "event_registrations", REGISTRATIONS_FILE or EVENT_REGISTRATIONS_FILE, "id")
        fut_apps = executor.submit(_read_data, "job_applications", APPLICATIONS_FILE, "id")

        active_users = fut_users.result()
        jobs = fut_jobs.result()
        events = fut_events.result()
        registrations = fut_regs.result()
        applications = fut_apps.result()

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

    total_jobs = len(jobs)
    pending_jobs = sum(1 for job in jobs if job.get("status") == "pending")

    total_events = len(events)
    pending_events = sum(1 for event in events if event.get("status") == "pending")
    total_registrations = len(registrations)

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


@router.get("/students/export")
def export_admin_students(
    search: str | None = None,
    status: str | None = None,
    current_user: dict = Depends(get_current_user),
):
    """
    Export all students as a secure CSV file.
    Enforces admin-only access and sanitizes values against formula injection.
    """
    _require_admin(current_user)
    student_users = users_collection.find({"role": "student"}, include_profiles=True)

    search_lower = search.strip().lower() if search else None
    status_filter = status.strip().lower() if status and status.lower() != "all" else None

    rows = []
    for s in student_users:
        name = s.get("name") or s.get("full_name") or ""
        email = s.get("email") or ""
        role = s.get("role") or "student"

        prof = s.get("student_profile") if isinstance(s.get("student_profile"), dict) else {}
        identifier = prof.get("student_id") or ""
        dept = prof.get("department") or s.get("department") or ""
        degree = prof.get("degree") or s.get("degree") or ""
        grad_year = prof.get("graduation_year") or s.get("graduation_year") or ""

        is_ver = s.get("is_verified", False)
        v_status = s.get("verification_status") or ("approved" if is_ver else "pending")
        is_act = s.get("is_active", True)
        reg_date = s.get("created_at") or ""

        if status_filter and v_status.lower() != status_filter:
            continue

        if search_lower:
            haystack = f"{name} {email} {identifier} {dept} {degree}".lower()
            if search_lower not in haystack:
                continue

        rows.append([
            name,
            email,
            role,
            identifier,
            dept,
            degree,
            grad_year,
            v_status,
            "Active" if is_act else "Inactive",
            reg_date,
        ])

    rows.sort(key=lambda x: x[9], reverse=True)
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    filename = f"students_{today}.csv"
    headers = [
        "Student Name",
        "Email",
        "Role",
        "Student ID",
        "Department",
        "Degree",
        "Graduation Year",
        "Verification Status",
        "Account Status",
        "Registration Date",
    ]
    return _build_csv_response(filename, headers, rows)


@router.get("/alumni/export")
def export_admin_alumni(
    search: str | None = None,
    status: str | None = None,
    current_user: dict = Depends(get_current_user),
):
    """
    Export all alumni as a secure CSV file.
    Enforces admin-only access and sanitizes values against formula injection.
    """
    _require_admin(current_user)
    alumni_users = users_collection.find({"role": "alumni"}, include_profiles=True)

    search_lower = search.strip().lower() if search else None
    status_filter = status.strip().lower() if status and status.lower() != "all" else None

    rows = []
    for a in alumni_users:
        name = a.get("name") or a.get("full_name") or ""
        email = a.get("email") or ""
        role = a.get("role") or "alumni"

        prof = a.get("alumni_profile") if isinstance(a.get("alumni_profile"), dict) else {}
        identifier = prof.get("alumni_id") or ""
        dept = prof.get("department") or a.get("department") or ""
        degree = prof.get("degree") or a.get("degree") or ""
        grad_year = prof.get("graduation_year") or a.get("graduation_year") or ""
        company = prof.get("company") or a.get("company") or ""
        designation = prof.get("designation") or a.get("designation") or ""
        industry = prof.get("industry") or a.get("industry") or ""
        location = prof.get("location") or a.get("location") or ""

        is_ver = a.get("is_verified", False)
        v_status = a.get("verification_status") or ("approved" if is_ver else "pending")
        is_act = a.get("is_active", True)
        reg_date = a.get("created_at") or ""

        if status_filter and v_status.lower() != status_filter:
            continue

        if search_lower:
            haystack = f"{name} {email} {identifier} {dept} {degree} {company} {designation}".lower()
            if search_lower not in haystack:
                continue

        rows.append([
            name,
            email,
            role,
            identifier,
            dept,
            degree,
            grad_year,
            company,
            designation,
            industry,
            location,
            v_status,
            "Active" if is_act else "Inactive",
            reg_date,
        ])

    rows.sort(key=lambda x: x[13], reverse=True)
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    filename = f"alumni_{today}.csv"
    headers = [
        "Alumni Name",
        "Email",
        "Role",
        "Alumni ID",
        "Department",
        "Degree",
        "Graduation Year",
        "Company",
        "Designation",
        "Industry",
        "Location",
        "Verification Status",
        "Account Status",
        "Registration Date",
    ]
    return _build_csv_response(filename, headers, rows)


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


# ============================================================
# PARTICIPATION & REGISTRATIONS MANAGEMENT
# ============================================================

@router.get("/participation/events")
def get_admin_event_participation(
    search: str | None = None,
    status: str | None = None,
    current_user: dict = Depends(get_current_user),
):
    """
    Get aggregated event registration statistics and per-event participant counts.
    Enforces admin-only access.
    """
    _require_admin(current_user)

    events_raw = _read_data("events", EVENTS_FILE)
    regs_raw = _read_data("event_registrations", REGISTRATIONS_FILE or EVENT_REGISTRATIONS_FILE)

    total_registrations = len(regs_raw)
    all_participant_user_ids = {
        str(r.get("user_id")) for r in regs_raw if r.get("user_id")
    }
    unique_participants = len(all_participant_user_ids)

    # Pre-aggregate registrations per event
    event_reg_map: dict[str, list[dict]] = {}
    for r in regs_raw:
        eid = str(r.get("event_id") or "")
        if eid:
            event_reg_map.setdefault(eid, []).append(r)

    event_list = []
    search_lower = search.strip().lower() if search else None
    status_filter = status.strip().lower() if status and status.lower() != "all" else None

    for e in events_raw:
        eid = str(e.get("id") or "")
        e_title = e.get("title") or "Untitled Event"
        e_status = (e.get("status") or "pending").lower()
        e_date = e.get("event_date") or e.get("start_date") or e.get("date") or ""
        e_type = e.get("event_type") or ""
        e_location = e.get("location") or ""
        e_deadline = e.get("registration_deadline") or ""

        # Filter by status
        if status_filter and e_status != status_filter:
            continue

        # Filter by search query
        if search_lower:
            haystack = f"{e_title} {e_type} {e_location}".lower()
            if search_lower not in haystack:
                continue

        e_regs = event_reg_map.get(eid, [])
        e_reg_count = len(e_regs)
        e_unique_uids = {str(r.get("user_id")) for r in e_regs if r.get("user_id")}

        event_list.append({
            "id": eid,
            "title": e_title,
            "status": e_status,
            "event_date": e_date,
            "event_type": e_type,
            "location": e_location,
            "registration_deadline": e_deadline,
            "registration_count": e_reg_count,
            "unique_participant_count": len(e_unique_uids),
            "created_at": e.get("created_at") or "",
        })

    # Sort events by date descending or created_at descending
    event_list.sort(key=lambda x: x.get("event_date") or x.get("created_at") or "", reverse=True)

    return {
        "total_registrations": total_registrations,
        "unique_participants": unique_participants,
        "total_events": len(events_raw),
        "events": event_list,
    }


@router.get("/participation/events/export")
def export_all_event_registrations(
    search: str | None = None,
    status: str | None = None,
    current_user: dict = Depends(get_current_user),
):
    """
    Export registrations across all events into one comprehensive CSV file.
    Includes full event details on each registration row.
    Enforces admin-only access and sanitizes values against formula injection.
    """
    _require_admin(current_user)

    events_raw = _read_data("events", EVENTS_FILE)
    regs_raw = _read_data("event_registrations", REGISTRATIONS_FILE or EVENT_REGISTRATIONS_FILE)

    event_map = {str(e.get("id")): e for e in events_raw}

    uids = list({str(r.get("user_id")) for r in regs_raw if r.get("user_id")})
    user_map: dict[str, dict] = {}
    if uids:
        try:
            users_res = users_collection.find({"_id": {"$in": uids}}, include_profiles=True)
            for u in users_res:
                user_map[str(u.get("_id") or u.get("id"))] = u
        except Exception:
            pass

    search_lower = search.strip().lower() if search else None
    status_filter = status.strip().lower() if status and status.lower() != "all" else None

    rows = []
    for r in regs_raw:
        eid = str(r.get("event_id") or "")
        ev = event_map.get(eid, {})

        e_title = ev.get("title") or "Unknown Event"
        e_date = ev.get("event_date") or ev.get("start_date") or ev.get("date") or ""
        e_status = (ev.get("status") or "pending").lower()
        e_location = ev.get("location") or ""
        e_type = ev.get("event_type") or ""

        if status_filter and e_status != status_filter:
            continue

        uid = str(r.get("user_id") or "")
        u = user_map.get(uid, {})

        u_name = u.get("name") or r.get("user_name") or r.get("name") or "Participant"
        u_email = u.get("email") or r.get("user_email") or r.get("email") or ""
        u_role = (u.get("role") or r.get("user_role") or "student").lower()

        student_prof = u.get("student_profile") if isinstance(u.get("student_profile"), dict) else {}
        alumni_prof = u.get("alumni_profile") if isinstance(u.get("alumni_profile"), dict) else {}

        identifier = student_prof.get("student_id") or alumni_prof.get("alumni_id") or ""
        department = student_prof.get("department") or alumni_prof.get("department") or ""

        if search_lower:
            haystack = f"{e_title} {e_location} {e_type} {u_name} {u_email} {identifier} {department}".lower()
            if search_lower not in haystack:
                continue

        reg_date = r.get("created_at") or r.get("registered_at") or ""
        reg_status = r.get("status") or "registered"

        rows.append([
            eid,
            e_title,
            e_date,
            e_status,
            e_location,
            u_name,
            u_email,
            u_role,
            identifier,
            department,
            reg_date,
            reg_status,
        ])

    rows.sort(key=lambda x: (x[2], x[10]), reverse=True)

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    filename = f"event_registrations_{today}.csv"

    headers = [
        "Event ID",
        "Event Title",
        "Event Date",
        "Event Status",
        "Event Location",
        "Participant Name",
        "Email",
        "Role",
        "Identifier",
        "Department",
        "Registration Date",
        "Registration Status",
    ]
    return _build_csv_response(filename, headers, rows)


@router.get("/participation/events/{event_id}/participants")
def get_admin_event_participants(
    event_id: str,
    search: str | None = None,
    role: str | None = None,
    limit: int = 50,
    offset: int = 0,
    current_user: dict = Depends(get_current_user),
):
    """
    Get detailed list of participants registered for a specific event.
    Hydrates safe identity fields (name, email, role, student/alumni identifier, department).
    Enforces admin-only access.
    """
    _require_admin(current_user)

    events_raw = _read_data("events", EVENTS_FILE)
    target_event = next((e for e in events_raw if str(e.get("id")) == str(event_id)), None)
    if not target_event:
        try:
            ev_res = supabase.table("events").select("id,title,event_date,status").eq("id", str(event_id)).execute()
            if ev_res.data:
                target_event = ev_res.data[0]
        except Exception:
            pass

    if not target_event:
        raise HTTPException(status_code=404, detail="Event not found.")

    regs_raw = _read_data("event_registrations", REGISTRATIONS_FILE or EVENT_REGISTRATIONS_FILE)
    event_regs = [r for r in regs_raw if str(r.get("event_id")) == str(event_id)]

    uids = list({str(r.get("user_id")) for r in event_regs if r.get("user_id")})
    user_map: dict[str, dict] = {}

    if uids:
        try:
            users_res = users_collection.find({"_id": {"$in": uids}}, include_profiles=True)
            for u in users_res:
                user_map[str(u.get("_id") or u.get("id"))] = u
        except Exception:
            pass

    participants = []
    search_lower = search.strip().lower() if search else None
    role_filter = role.strip().lower() if role and role.lower() != "all" else None

    for r in event_regs:
        uid = str(r.get("user_id") or "")
        u = user_map.get(uid, {})

        u_name = u.get("name") or r.get("user_name") or r.get("name") or "Participant"
        u_email = u.get("email") or r.get("user_email") or r.get("email") or ""
        u_role = (u.get("role") or r.get("user_role") or "student").lower()

        student_prof = u.get("student_profile") if isinstance(u.get("student_profile"), dict) else {}
        alumni_prof = u.get("alumni_profile") if isinstance(u.get("alumni_profile"), dict) else {}

        identifier = student_prof.get("student_id") or alumni_prof.get("alumni_id") or ""
        department = student_prof.get("department") or alumni_prof.get("department") or ""

        if role_filter and u_role != role_filter:
            continue

        if search_lower:
            haystack = f"{u_name} {u_email} {identifier} {department}".lower()
            if search_lower not in haystack:
                continue

        reg_date = r.get("created_at") or r.get("registered_at") or ""
        reg_status = r.get("status") or "registered"

        participants.append({
            "registration_id": str(r.get("id") or ""),
            "user_id": uid,
            "name": u_name,
            "email": u_email,
            "role": u_role,
            "identifier": identifier,
            "department": department,
            "registration_date": reg_date,
            "status": reg_status,
        })

    participants.sort(key=lambda x: x.get("registration_date") or "", reverse=True)

    total_count = len(participants)
    if limit < 0:
        paginated = participants[offset:]
        bounded_limit = len(paginated)
    else:
        bounded_limit = max(1, min(limit, 1000))
        paginated = participants[offset : offset + bounded_limit]

    return {
        "event_id": str(event_id),
        "event_title": target_event.get("title", ""),
        "total_count": total_count,
        "limit": bounded_limit,
        "offset": offset,
        "participants": paginated,
    }


@router.get("/participation/events/{event_id}/export")
def export_admin_event_participants(
    event_id: str,
    search: str | None = None,
    role: str | None = None,
    current_user: dict = Depends(get_current_user),
):
    """
    Export all participants for a specific event as a secure CSV file.
    No row truncation limits applied (exports all matching records).
    Enforces admin-only access and sanitizes values against formula injection.
    """
    _require_admin(current_user)

    events_raw = _read_data("events", EVENTS_FILE)
    target_event = next((e for e in events_raw if str(e.get("id")) == str(event_id)), None)
    if not target_event:
        try:
            ev_res = supabase.table("events").select("id,title,event_date,status").eq("id", str(event_id)).execute()
            if ev_res.data:
                target_event = ev_res.data[0]
        except Exception:
            pass

    if not target_event:
        raise HTTPException(status_code=404, detail="Event not found.")

    regs_raw = _read_data("event_registrations", REGISTRATIONS_FILE or EVENT_REGISTRATIONS_FILE)
    event_regs = [r for r in regs_raw if str(r.get("event_id")) == str(event_id)]

    uids = list({str(r.get("user_id")) for r in event_regs if r.get("user_id")})
    user_map: dict[str, dict] = {}
    if uids:
        try:
            users_res = users_collection.find({"_id": {"$in": uids}}, include_profiles=True)
            for u in users_res:
                user_map[str(u.get("_id") or u.get("id"))] = u
        except Exception:
            pass

    search_lower = search.strip().lower() if search else None
    role_filter = role.strip().lower() if role and role.lower() != "all" else None

    rows = []
    e_title = target_event.get("title") or "Untitled Event"
    e_date = target_event.get("event_date") or target_event.get("date") or ""

    for r in event_regs:
        uid = str(r.get("user_id") or "")
        u = user_map.get(uid, {})

        u_name = u.get("name") or r.get("user_name") or r.get("name") or "Participant"
        u_email = u.get("email") or r.get("user_email") or r.get("email") or ""
        u_role = (u.get("role") or r.get("user_role") or "student").lower()

        student_prof = u.get("student_profile") if isinstance(u.get("student_profile"), dict) else {}
        alumni_prof = u.get("alumni_profile") if isinstance(u.get("alumni_profile"), dict) else {}

        identifier = student_prof.get("student_id") or alumni_prof.get("alumni_id") or ""
        department = student_prof.get("department") or alumni_prof.get("department") or ""

        if role_filter and u_role != role_filter:
            continue

        if search_lower:
            haystack = f"{u_name} {u_email} {identifier} {department}".lower()
            if search_lower not in haystack:
                continue

        reg_date = r.get("created_at") or r.get("registered_at") or ""
        reg_status = r.get("status") or "registered"

        rows.append([
            e_title,
            e_date,
            u_name,
            u_email,
            u_role,
            identifier,
            department,
            reg_date,
            reg_status,
        ])

    rows.sort(key=lambda x: x[7], reverse=True)

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    slug = _slugify(e_title)
    filename = f"event_participants_{slug}_{today}.csv"

    headers = [
        "Event Title",
        "Event Date",
        "Participant Name",
        "Email",
        "Role",
        "Identifier",
        "Department",
        "Registration Date",
        "Status",
    ]
    return _build_csv_response(filename, headers, rows)


@router.get("/participation/jobs")
def get_admin_job_participation(
    search: str | None = None,
    status: str | None = None,
    current_user: dict = Depends(get_current_user),
):
    """
    Get aggregated job application statistics and per-job applicant counts.
    Enforces admin-only access.
    """
    _require_admin(current_user)

    jobs_raw = _read_data("jobs", JOBS_FILE)
    apps_raw = _read_data("job_applications", APPLICATIONS_FILE)

    total_applications = len(apps_raw)
    all_applicant_ids = {
        str(a.get("applicant_id") or a.get("student_id"))
        for a in apps_raw
        if (a.get("applicant_id") or a.get("student_id"))
    }
    unique_applicants = len(all_applicant_ids)

    job_apps_map: dict[str, list[dict]] = {}
    for a in apps_raw:
        jid = str(a.get("job_id") or "")
        if jid:
            job_apps_map.setdefault(jid, []).append(a)

    job_list = []
    search_lower = search.strip().lower() if search else None
    status_filter = status.strip().lower() if status and status.lower() != "all" else None

    for j in jobs_raw:
        jid = str(j.get("id") or "")
        j_title = j.get("title") or "Untitled Job"
        j_company = j.get("company") or ""
        j_location = j.get("location") or ""
        j_type = j.get("job_type") or j.get("type") or ""
        j_status = (j.get("status") or "active").lower()
        j_deadline = j.get("deadline") or ""

        if status_filter and j_status != status_filter:
            continue

        if search_lower:
            haystack = f"{j_title} {j_company} {j_location} {j_type}".lower()
            if search_lower not in haystack:
                continue

        j_apps = job_apps_map.get(jid, [])
        j_app_count = len(j_apps)
        j_unique_applicants = len({
            str(a.get("applicant_id") or a.get("student_id"))
            for a in j_apps
            if (a.get("applicant_id") or a.get("student_id"))
        })

        status_counts: dict[str, int] = {}
        for a in j_apps:
            s = (a.get("status") or "applied").lower()
            if s == "submitted":
                s = "applied"
            elif s == "accepted":
                s = "selected"
            status_counts[s] = status_counts.get(s, 0) + 1

        job_list.append({
            "id": jid,
            "title": j_title,
            "company": j_company,
            "location": j_location,
            "job_type": j_type,
            "status": j_status,
            "deadline": j_deadline,
            "application_count": j_app_count,
            "unique_applicant_count": j_unique_applicants,
            "applications_by_status": status_counts,
            "created_at": j.get("created_at") or "",
        })

    job_list.sort(key=lambda x: x.get("created_at") or "", reverse=True)

    return {
        "total_jobs": len(jobs_raw),
        "total_applications": total_applications,
        "unique_applicants": unique_applicants,
        "jobs": job_list,
    }


@router.get("/participation/jobs/export")
def export_all_job_applications(
    search: str | None = None,
    status: str | None = None,
    current_user: dict = Depends(get_current_user),
):
    """
    Export all applications across all jobs into one comprehensive CSV file.
    Includes full job details on each application row, and resume/cover letter availability flags.
    Enforces admin-only access and sanitizes values against formula injection.
    """
    _require_admin(current_user)

    jobs_raw = _read_data("jobs", JOBS_FILE)
    apps_raw = _read_data("job_applications", APPLICATIONS_FILE)

    job_map = {str(j.get("id")): j for j in jobs_raw}

    uids = list({
        str(a.get("applicant_id") or a.get("student_id"))
        for a in apps_raw
        if (a.get("applicant_id") or a.get("student_id"))
    })
    user_map: dict[str, dict] = {}
    if uids:
        try:
            users_res = users_collection.find({"_id": {"$in": uids}}, include_profiles=True)
            for u in users_res:
                user_map[str(u.get("_id") or u.get("id"))] = u
        except Exception:
            pass

    search_lower = search.strip().lower() if search else None
    status_filter = status.strip().lower() if status and status.lower() != "all" else None

    rows = []
    for a in apps_raw:
        jid = str(a.get("job_id") or "")
        job = job_map.get(jid, {})

        j_title = job.get("title") or "Untitled Job"
        j_company = job.get("company") or ""
        j_location = job.get("location") or ""
        j_status = (job.get("status") or "active").lower()

        if status_filter and j_status != status_filter:
            continue

        uid = str(a.get("applicant_id") or a.get("student_id") or "")
        u = user_map.get(uid, {})

        u_name = u.get("name") or a.get("student_name") or a.get("applicant_name") or "Applicant"
        u_email = u.get("email") or a.get("student_email") or a.get("applicant_email") or ""
        u_role = (u.get("role") or "student").lower()

        student_prof = u.get("student_profile") if isinstance(u.get("student_profile"), dict) else {}
        alumni_prof = u.get("alumni_profile") if isinstance(u.get("alumni_profile"), dict) else {}

        identifier = student_prof.get("student_id") or alumni_prof.get("alumni_id") or ""
        department = student_prof.get("department") or alumni_prof.get("department") or a.get("department") or ""

        app_status = (a.get("status") or "applied").lower()
        if app_status == "submitted":
            app_status = "applied"
        elif app_status == "accepted":
            app_status = "selected"

        if search_lower:
            haystack = f"{j_title} {j_company} {j_location} {u_name} {u_email} {identifier} {department}".lower()
            if search_lower not in haystack:
                continue

        app_date = a.get("applied_at") or a.get("created_at") or ""
        has_resume = bool(a.get("resume_url"))
        has_cover = bool(a.get("cover_letter") and str(a.get("cover_letter")).strip())

        rows.append([
            jid,
            j_title,
            j_company,
            j_location,
            j_status,
            u_name,
            u_email,
            u_role,
            identifier,
            department,
            app_date,
            app_status,
            "Yes" if has_resume else "No",
            "Yes" if has_cover else "No",
        ])

    rows.sort(key=lambda x: (x[1], x[10]), reverse=True)

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    filename = f"job_applications_{today}.csv"

    headers = [
        "Job ID",
        "Job Title",
        "Company",
        "Job Location",
        "Job Status",
        "Applicant Name",
        "Email",
        "Role",
        "Identifier",
        "Department",
        "Application Date",
        "Application Status",
        "Resume Available",
        "Cover Letter Available",
    ]
    return _build_csv_response(filename, headers, rows)


@router.get("/participation/jobs/{job_id}/applicants")
def get_admin_job_applicants(
    job_id: str,
    search: str | None = None,
    status: str | None = None,
    limit: int = 50,
    offset: int = 0,
    current_user: dict = Depends(get_current_user),
):
    """
    Get detailed list of applicants for a specific job.
    Hydrates safe identity fields (name, email, role, student/alumni identifier, department).
    Enforces admin-only access.
    """
    _require_admin(current_user)

    jobs_raw = _read_data("jobs", JOBS_FILE)
    target_job = next((j for j in jobs_raw if str(j.get("id")) == str(job_id)), None)
    if not target_job:
        try:
            j_res = supabase.table("jobs").select("id,title,company,status").eq("id", str(job_id)).execute()
            if j_res.data:
                target_job = j_res.data[0]
        except Exception:
            pass

    if not target_job:
        raise HTTPException(status_code=404, detail="Job not found.")

    apps_raw = _read_data("job_applications", APPLICATIONS_FILE)
    job_apps = [a for a in apps_raw if str(a.get("job_id")) == str(job_id)]

    uids = list({
        str(a.get("applicant_id") or a.get("student_id"))
        for a in job_apps
        if (a.get("applicant_id") or a.get("student_id"))
    })
    user_map: dict[str, dict] = {}

    if uids:
        try:
            users_res = users_collection.find({"_id": {"$in": uids}}, include_profiles=True)
            for u in users_res:
                user_map[str(u.get("_id") or u.get("id"))] = u
        except Exception:
            pass

    applicants = []
    search_lower = search.strip().lower() if search else None
    status_filter = status.strip().lower() if status and status.lower() != "all" else None

    for a in job_apps:
        uid = str(a.get("applicant_id") or a.get("student_id") or "")
        u = user_map.get(uid, {})

        u_name = u.get("name") or a.get("student_name") or a.get("applicant_name") or "Applicant"
        u_email = u.get("email") or a.get("student_email") or a.get("applicant_email") or ""
        u_role = (u.get("role") or "student").lower()

        student_prof = u.get("student_profile") if isinstance(u.get("student_profile"), dict) else {}
        alumni_prof = u.get("alumni_profile") if isinstance(u.get("alumni_profile"), dict) else {}

        identifier = student_prof.get("student_id") or alumni_prof.get("alumni_id") or ""
        department = student_prof.get("department") or alumni_prof.get("department") or a.get("department") or ""

        app_status = (a.get("status") or "applied").lower()
        if app_status == "submitted":
            app_status = "applied"
        elif app_status == "accepted":
            app_status = "selected"

        if status_filter and app_status != status_filter:
            continue

        if search_lower:
            haystack = f"{u_name} {u_email} {identifier} {department}".lower()
            if search_lower not in haystack:
                continue

        app_date = a.get("applied_at") or a.get("created_at") or ""

        applicants.append({
            "application_id": str(a.get("id") or ""),
            "applicant_id": uid,
            "name": u_name,
            "email": u_email,
            "role": u_role,
            "identifier": identifier,
            "department": department,
            "status": app_status,
            "resume_url": a.get("resume_url") or "",
            "cover_letter": a.get("cover_letter") or "",
            "applied_at": app_date,
        })

    applicants.sort(key=lambda x: x.get("applied_at") or "", reverse=True)

    total_count = len(applicants)
    if limit < 0:
        paginated = applicants[offset:]
        bounded_limit = len(paginated)
    else:
        bounded_limit = max(1, min(limit, 1000))
        paginated = applicants[offset : offset + bounded_limit]

    return {
        "job_id": str(job_id),
        "job_title": target_job.get("title", ""),
        "company": target_job.get("company", ""),
        "total_count": total_count,
        "limit": bounded_limit,
        "offset": offset,
        "applicants": paginated,
    }


@router.get("/participation/jobs/{job_id}/export")
def export_admin_job_applicants(
    job_id: str,
    search: str | None = None,
    status: str | None = None,
    current_user: dict = Depends(get_current_user),
):
    """
    Export all applicants for a specific job as a secure CSV file.
    No row truncation limits applied (exports all matching records).
    Includes resume and cover letter availability flags without exposing private file URLs or raw text.
    Enforces admin-only access and sanitizes values against formula injection.
    """
    _require_admin(current_user)

    jobs_raw = _read_data("jobs", JOBS_FILE)
    target_job = next((j for j in jobs_raw if str(j.get("id")) == str(job_id)), None)
    if not target_job:
        try:
            j_res = supabase.table("jobs").select("id,title,company,status").eq("id", str(job_id)).execute()
            if j_res.data:
                target_job = j_res.data[0]
        except Exception:
            pass

    if not target_job:
        raise HTTPException(status_code=404, detail="Job not found.")

    apps_raw = _read_data("job_applications", APPLICATIONS_FILE)
    job_apps = [a for a in apps_raw if str(a.get("job_id")) == str(job_id)]

    uids = list({
        str(a.get("applicant_id") or a.get("student_id"))
        for a in job_apps
        if (a.get("applicant_id") or a.get("student_id"))
    })
    user_map: dict[str, dict] = {}
    if uids:
        try:
            users_res = users_collection.find({"_id": {"$in": uids}}, include_profiles=True)
            for u in users_res:
                user_map[str(u.get("_id") or u.get("id"))] = u
        except Exception:
            pass

    search_lower = search.strip().lower() if search else None
    status_filter = status.strip().lower() if status and status.lower() != "all" else None

    j_title = target_job.get("title") or "Untitled Job"
    j_company = target_job.get("company") or ""

    rows = []
    for a in job_apps:
        uid = str(a.get("applicant_id") or a.get("student_id") or "")
        u = user_map.get(uid, {})

        u_name = u.get("name") or a.get("student_name") or a.get("applicant_name") or "Applicant"
        u_email = u.get("email") or a.get("student_email") or a.get("applicant_email") or ""
        u_role = (u.get("role") or "student").lower()

        student_prof = u.get("student_profile") if isinstance(u.get("student_profile"), dict) else {}
        alumni_prof = u.get("alumni_profile") if isinstance(u.get("alumni_profile"), dict) else {}

        identifier = student_prof.get("student_id") or alumni_prof.get("alumni_id") or ""
        department = student_prof.get("department") or alumni_prof.get("department") or a.get("department") or ""

        app_status = (a.get("status") or "applied").lower()
        if app_status == "submitted":
            app_status = "applied"
        elif app_status == "accepted":
            app_status = "selected"

        if status_filter and app_status != status_filter:
            continue

        if search_lower:
            haystack = f"{u_name} {u_email} {identifier} {department}".lower()
            if search_lower not in haystack:
                continue

        app_date = a.get("applied_at") or a.get("created_at") or ""
        has_resume = bool(a.get("resume_url"))
        has_cover = bool(a.get("cover_letter") and str(a.get("cover_letter")).strip())

        rows.append([
            j_title,
            j_company,
            u_name,
            u_email,
            u_role,
            identifier,
            department,
            app_date,
            app_status,
            "Yes" if has_resume else "No",
            "Yes" if has_cover else "No",
        ])

    rows.sort(key=lambda x: x[7], reverse=True)

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    slug = _slugify(f"{j_company}_{j_title}")
    filename = f"job_applicants_{slug}_{today}.csv"

    headers = [
        "Job Title",
        "Company",
        "Applicant Name",
        "Email",
        "Role",
        "Identifier",
        "Department",
        "Application Date",
        "Status",
        "Resume Available",
        "Cover Letter Available",
    ]
    return _build_csv_response(filename, headers, rows)
