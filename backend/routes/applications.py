from datetime import datetime, timezone
import json
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from database import users_collection
from security.dependencies import get_current_user


router = APIRouter(
    prefix="/applications",
    tags=["Applications"]
)


BACKEND_DIR = Path(__file__).resolve().parent.parent

APPLICATIONS_FILE = BACKEND_DIR / "applications_data.json"
JOBS_FILE = BACKEND_DIR / "jobs_data.json"


# ============================================================
# REQUEST MODELS
# ============================================================

class ApplicationCreateRequest(BaseModel):
    job_id: str
    cover_letter: str = ""
    resume_url: str = ""


class ApplicationStatusRequest(BaseModel):
    status: str


# ============================================================
# HELPERS
# ============================================================

def load_applications():
    try:
        if APPLICATIONS_FILE.exists():
            data = APPLICATIONS_FILE.read_text(encoding="utf-8").strip()
            if data:
                return json.loads(data)
    except Exception:
        pass

    return []


def save_applications(applications):
    APPLICATIONS_FILE.write_text(
        json.dumps(applications, indent=2),
        encoding="utf-8"
    )


def load_jobs():
    try:
        if JOBS_FILE.exists():
            return json.loads(
                JOBS_FILE.read_text(encoding="utf-8")
            )
    except Exception:
        pass

    return []


def get_user_from_token(current_user: dict):
    user_id = current_user.get("user_id")
    role = current_user.get("role")

    user = users_collection.find_one({
        "_id": user_id
    })

    # Compatibility with MongoDB ObjectId/string IDs
    if not user:
        users = users_collection.find({
            "role": role
        })

        for candidate in users:
            if str(candidate.get("_id")) == str(user_id):
                user = candidate
                break

    return user


VALID_APPLICATION_STATUSES = {
    "applied",
    "under_review",
    "shortlisted",
    "interview",
    "selected",
    "rejected",
}


# ============================================================
# POST /applications — Student applies to a job
# ============================================================

@router.post("")
def apply_for_job(
    application: ApplicationCreateRequest,
    current_user: dict = Depends(get_current_user)
):
    # Only students can apply
    if current_user.get("role") != "student":
        raise HTTPException(
            status_code=403,
            detail="Only students can apply to jobs."
        )

    student_id = str(current_user.get("user_id"))

    # Verify the job exists and is approved
    jobs = load_jobs()

    target_job = None
    for job in jobs:
        if str(job.get("id")) == str(application.job_id):
            target_job = job
            break

    if not target_job:
        raise HTTPException(
            status_code=404,
            detail="Job not found."
        )

    if target_job.get("status") != "approved":
        raise HTTPException(
            status_code=400,
            detail="This job is not currently accepting applications."
        )

    # Prevent duplicate applications
    applications = load_applications()

    for existing in applications:
        if (
            str(existing.get("student_id")) == student_id
            and str(existing.get("job_id")) == str(application.job_id)
        ):
            raise HTTPException(
                status_code=409,
                detail="You have already applied for this position."
            )

    # Resolve student name
    user = get_user_from_token(current_user)
    student_name = user.get("name", "Student") if user else "Student"

    # Create the application document
    app_document = {
        "id": str(uuid.uuid4()),
        "job_id": str(application.job_id),
        "student_id": student_id,
        "student_name": student_name,
        "resume_url": application.resume_url or "",
        "cover_letter": application.cover_letter or "",
        "status": "applied",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }

    applications.append(app_document)
    save_applications(applications)

    return {
        "message": "Application submitted successfully.",
        "application": app_document
    }


# ============================================================
# GET /applications/mine — Student's own applications
# ============================================================

@router.get("/mine")
def get_my_applications(
    current_user: dict = Depends(get_current_user)
):
    if current_user.get("role") != "student":
        raise HTTPException(
            status_code=403,
            detail="Only students can view their own applications."
        )

    student_id = str(current_user.get("user_id"))
    applications = load_applications()
    jobs = load_jobs()

    # Build a job lookup
    job_lookup = {}
    for job in jobs:
        job_lookup[str(job.get("id"))] = job

    results = []

    for app in applications:
        if str(app.get("student_id")) == student_id:
            job = job_lookup.get(str(app.get("job_id")))

            result = {
                "id": app.get("id"),
                "job_id": app.get("job_id"),
                "student_id": app.get("student_id"),
                "resume_url": app.get("resume_url", ""),
                "cover_letter": app.get("cover_letter", ""),
                "status": app.get("status"),
                "created_at": app.get("created_at"),
                "updated_at": app.get("updated_at"),
            }

            if job:
                result["job"] = {
                    "id": job.get("id"),
                    "title": job.get("title"),
                    "company": job.get("company"),
                    "location": job.get("location"),
                    "employment_type": job.get("employment_type"),
                    "status": job.get("status"),
                }

            results.append(result)

    # Sort by created_at descending
    results.sort(
        key=lambda x: x.get("created_at", ""),
        reverse=True
    )

    return results


# ============================================================
# GET /applications/job/{job_id} — Applicants for a job
# Admin or authorized job poster only
# ============================================================

@router.get("/job/{job_id}")
def get_job_applicants(
    job_id: str,
    current_user: dict = Depends(get_current_user)
):
    user_id = str(current_user.get("user_id"))
    role = current_user.get("role")

    # Verify the job exists
    jobs = load_jobs()
    target_job = None

    for job in jobs:
        if str(job.get("id")) == str(job_id):
            target_job = job
            break

    if not target_job:
        raise HTTPException(
            status_code=404,
            detail="Job not found."
        )

    # Authorization: admin or the job poster
    if role != "admin" and str(target_job.get("posted_by")) != user_id:
        raise HTTPException(
            status_code=403,
            detail="You do not have permission to view applicants for this job."
        )

    applications = load_applications()

    results = []

    for app in applications:
        if str(app.get("job_id")) == str(job_id):
            # Resolve student info
            student_name = app.get("student_name", "")
            student_email = ""
            department = ""

            student_user = users_collection.find_one(
                {"_id": app.get("student_id")}
            )

            if not student_user:
                all_students = users_collection.find(
                    {"role": "student"}
                )

                for candidate in all_students:
                    if str(candidate.get("_id")) == str(
                        app.get("student_id")
                    ):
                        student_user = candidate
                        break

            if student_user:
                student_name = student_user.get(
                    "name", student_name
                )
                student_email = student_user.get("email", "")
                student_profile = student_user.get(
                    "student_profile", {}
                )
                department = student_profile.get(
                    "department", ""
                )

            results.append({
                "id": app.get("id"),
                "job_id": app.get("job_id"),
                "student_id": app.get("student_id"),
                "student_name": student_name,
                "student_email": student_email,
                "department": department,
                "resume_url": app.get("resume_url", ""),
                "cover_letter": app.get("cover_letter", ""),
                "status": app.get("status"),
                "created_at": app.get("created_at"),
                "updated_at": app.get("updated_at"),
            })

    # Sort by created_at descending
    results.sort(
        key=lambda x: x.get("created_at", ""),
        reverse=True
    )

    return results


# ============================================================
# PATCH /applications/{application_id}/status
# Admin or authorized job poster only
# ============================================================

@router.patch("/{application_id}/status")
def update_application_status(
    application_id: str,
    request: ApplicationStatusRequest,
    current_user: dict = Depends(get_current_user)
):
    user_id = str(current_user.get("user_id"))
    role = current_user.get("role")

    if request.status not in VALID_APPLICATION_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=(
                "Invalid application status. "
                "Allowed: "
                + ", ".join(sorted(VALID_APPLICATION_STATUSES))
            )
        )

    applications = load_applications()
    jobs = load_jobs()

    # Build job lookup
    job_lookup = {}
    for job in jobs:
        job_lookup[str(job.get("id"))] = job

    for app in applications:
        if str(app.get("id")) == str(application_id):

            # Authorization check
            job = job_lookup.get(str(app.get("job_id")))

            if role != "admin":
                if not job:
                    raise HTTPException(
                        status_code=404,
                        detail="Associated job not found."
                    )

                if str(job.get("posted_by")) != user_id:
                    raise HTTPException(
                        status_code=403,
                        detail=(
                            "You do not have permission "
                            "to update this application."
                        )
                    )

            app["status"] = request.status
            app["updated_at"] = datetime.now(
                timezone.utc
            ).isoformat()

            save_applications(applications)

            return {
                "message": (
                    "Application status updated to "
                    f"{request.status}."
                ),
                "application": app
            }

    raise HTTPException(
        status_code=404,
        detail="Application not found."
    )

