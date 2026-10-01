from pathlib import Path
import json

from fastapi import APIRouter, Depends, HTTPException

from database import users_collection
from security.dependencies import get_current_user


router = APIRouter(
    prefix="/admin",
    tags=["Admin"]
)


JOBS_FILE = Path(__file__).resolve().parent.parent / "jobs_data.json"


def load_jobs():
    try:
        if JOBS_FILE.exists():
            return json.loads(
                JOBS_FILE.read_text(encoding="utf-8")
            )
    except Exception:
        pass

    return []


@router.get("/metrics")
def get_dashboard_metrics(
    current_user: dict = Depends(get_current_user)
):
    if current_user.get("role") != "admin":
        raise HTTPException(
            status_code=403,
            detail="Admin access required."
        )

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

    jobs = load_jobs()

    total_jobs = len(jobs)

    pending_jobs = sum(
        1
        for job in jobs
        if job.get("status") == "pending"
    )

    # ------------------------------------------------------------
    # EVENTS / APPLICATIONS
    # ------------------------------------------------------------
    # These are not connected to the FastAPI backend yet.
    # Keep them at zero rather than displaying fake data.
    
    total_events = 0
    pending_events = 0
    total_applications = 0
    total_registrations = 0

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