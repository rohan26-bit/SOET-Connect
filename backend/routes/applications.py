from datetime import datetime, timezone
import json
import uuid
from pathlib import Path

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from database import users_collection
from security.dependencies import get_current_user


router = APIRouter(
    prefix="/jobs",
    tags=["Job Applications"]
)


APPLICATIONS_FILE = (
    Path(__file__).resolve().parent.parent / "applications_data.json"
)
JOBS_FILE = Path(__file__).resolve().parent.parent / "jobs_data.json"


# ============================================================
# VALID APPLICATION STATUSES
# ============================================================

VALID_STATUSES = {
    "applied",
    "under_review",
    "shortlisted",
    "interview",
    "selected",
    "rejected",
}


# ============================================================
# REQUEST MODELS
# ============================================================

class ApplicationCreateRequest(BaseModel):
    cover_letter: str = ""
    resume_url: str = ""


class ApplicationStatusUpdateRequest(BaseModel):
    status: str


# ============================================================
# HELPERS
# ============================================================

def load_applications() -> list[dict]:
    try:
        if APPLICATIONS_FILE.exists():
            return json.loads(
                APPLICATIONS_FILE.read_text(encoding="utf-8")
            )
    except Exception:
        pass

    return []


def save_applications(applications: list[dict]):
    APPLICATIONS_FILE.write_text(
        json.dumps(applications, indent=2),
        encoding="utf-8"
    )


def _load_jobs() -> list[dict]:
    """Read jobs_data.json so we can validate job existence / status."""
    try:
        if JOBS_FILE.exists():
            return json.loads(
                JOBS_FILE.read_text(encoding="utf-8")
            )
    except Exception:
        pass

    return []


def _find_job(job_id: str) -> dict | None:
    """Return a single job dict by ID, or None."""
    for job in _load_jobs():
        if str(job.get("id")) == str(job_id):
            return job

    return None


def _resolve_user(current_user: dict) -> dict | None:
    """Look up the full user document from MongoDB."""
    user_id = current_user.get("user_id")
    role = current_user.get("role")

    try:
        user = users_collection.find_one({"_id": ObjectId(user_id)})
        if user:
            return user
    except Exception:
        pass

    user = users_collection.find_one({"_id": user_id})
    if user:
        return user

    # Compatibility with MongoDB ObjectId/string IDs
    if role:
        users = users_collection.find({"role": role})

        for candidate in users:
            if str(candidate.get("_id")) == str(user_id):
                return candidate

    return None


# ============================================================
# POST /jobs/{job_id}/applications  — Student applies to a job
# ============================================================

@router.post("/{job_id}/applications")
def apply_to_job(
    job_id: str,
    body: ApplicationCreateRequest,
    current_user: dict = Depends(get_current_user),
):
    # Only students may apply
    if current_user.get("role") != "student":
        raise HTTPException(
            status_code=403,
            detail="Only students can apply to jobs."
        )

    # Job must exist
    job = _find_job(job_id)

    if not job:
        raise HTTPException(
            status_code=404,
            detail="Job not found."
        )

    # Job must be approved before it can accept applications
    if job.get("status") != "approved":
        raise HTTPException(
            status_code=400,
            detail="Applications are only accepted for approved jobs."
        )

    student_id = str(current_user.get("user_id"))
    applications = load_applications()

    # Prevent duplicate applications for the same student + job
    for app in applications:
        if (
            str(app.get("student_id")) == student_id
            and str(app.get("job_id")) == str(job_id)
        ):
            raise HTTPException(
                status_code=400,
                detail="You have already applied to this job."
            )

    # Resolve student name from DB
    user = _resolve_user(current_user)
    if user and not user.get("is_active", True):
        raise HTTPException(
            status_code=403,
            detail="This account has been deactivated."
        )
    student_name = user.get("name", "Student") if user else "Student"

    application = {
        "id": str(uuid.uuid4()),
        "job_id": str(job_id),
        "job_title": job.get("title", ""),
        "company": job.get("company", ""),
        "student_id": student_id,
        "student_name": student_name,
        "cover_letter": body.cover_letter,
        "resume_url": body.resume_url,
        "status": "applied",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    applications.append(application)
    save_applications(applications)

    return {
        "message": "Application submitted successfully.",
        "application": application,
    }


# ============================================================
# GET /jobs/applications/me  — Student views own applications
# ============================================================

@router.get("/applications/me")
def get_my_applications(
    current_user: dict = Depends(get_current_user),
):
    # Only students use this endpoint
    if current_user.get("role") != "student":
        raise HTTPException(
            status_code=403,
            detail="Only students can view their own applications."
        )

    student_id = str(current_user.get("user_id"))
    applications = load_applications()

    return [
        app for app in applications
        if str(app.get("student_id")) == student_id
    ]


# ============================================================
# GET /jobs/{job_id}/applications  — Job owner / admin views
#                                     applicants for a job
# ============================================================

@router.get("/{job_id}/applications")
def get_job_applications(
    job_id: str,
    current_user: dict = Depends(get_current_user),
):
    role = current_user.get("role")
    user_id = str(current_user.get("user_id"))

    # Job must exist
    job = _find_job(job_id)

    if not job:
        raise HTTPException(
            status_code=404,
            detail="Job not found."
        )

    # Admin can always view; owner (alumni who posted) can view their own
    if role == "admin":
        pass  # allowed
    elif str(job.get("posted_by")) == user_id:
        pass  # job owner
    else:
        raise HTTPException(
            status_code=403,
            detail="You do not have permission to view applications for this job."
        )

    applications = load_applications()

    return [
        app for app in applications
        if str(app.get("job_id")) == str(job_id)
    ]


# ============================================================
# PATCH /jobs/applications/{application_id}/status
#   — Admin or job poster updates application status
# ============================================================

@router.patch("/applications/{application_id}/status")
def update_application_status(
    application_id: str,
    body: ApplicationStatusUpdateRequest,
    current_user: dict = Depends(get_current_user),
):
    role = current_user.get("role")
    user_id = str(current_user.get("user_id"))

    if body.status not in VALID_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Invalid status. Must be one of: "
                f"{', '.join(sorted(VALID_STATUSES))}."
            ),
        )

    applications = load_applications()

    for app in applications:
        if str(app.get("id")) == str(application_id):
            # Authorise: admin always allowed; job poster allowed for
            # applications that belong to their own job.
            if role != "admin":
                job = _find_job(app.get("job_id"))

                if not job or str(job.get("posted_by")) != user_id:
                    raise HTTPException(
                        status_code=403,
                        detail="You do not have permission to update this application."
                    )

            app["status"] = body.status
            app["updated_at"] = datetime.now(timezone.utc).isoformat()

            save_applications(applications)

            return {
                "message": f"Application status updated to '{body.status}'.",
                "application": app,
            }

    raise HTTPException(
        status_code=404,
        detail="Application not found."
    )

