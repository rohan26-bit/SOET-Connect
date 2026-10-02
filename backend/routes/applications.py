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
    tags=["Applications"]
)


BACKEND_DIR = Path(__file__).resolve().parent.parent

APPLICATIONS_FILE = BACKEND_DIR / "applications_data.json"
JOBS_FILE = BACKEND_DIR / "jobs_data.json"


# ============================================================
# VALID STATUSES
# ============================================================

VALID_APPLICATION_STATUSES = {
    "applied",
    "under_review",
    "shortlisted",
    "interview",
    "selected",
    "rejected",
}

VALID_STATUSES = VALID_APPLICATION_STATUSES


# ============================================================
# REQUEST MODELS
# ============================================================

class ApplicationCreateRequest(BaseModel):
    job_id: str
    cover_letter: str = ""
    resume_url: str = ""


class JobApplicationCreateRequest(BaseModel):
    cover_letter: str = ""
    resume_url: str = ""
    skills: list[str] | None = None


class ApplicationStatusRequest(BaseModel):
    status: str


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


def load_jobs() -> list[dict]:
    try:
        if JOBS_FILE.exists():
            return json.loads(
                JOBS_FILE.read_text(encoding="utf-8")
            )
    except Exception:
        pass

    return []


def _load_jobs() -> list[dict]:
    return load_jobs()


def _find_job(job_id: str) -> dict | None:
    for job in load_jobs():
        if str(job.get("id")) == str(job_id):
            return job
    return None


def get_user_from_token(current_user: dict) -> dict | None:
    user_id = current_user.get("user_id")
    role = current_user.get("role")

    try:
        user = users_collection.find_one({"_id": ObjectId(user_id)})
        if user:
            return user
    except Exception:
        pass

    user = users_collection.find_one({"_id": user_id})
    if not user and role:
        users = users_collection.find({"role": role})
        for candidate in users:
            if str(candidate.get("_id")) == str(user_id):
                user = candidate
                break

    return user


def _resolve_user(current_user: dict) -> dict | None:
    return get_user_from_token(current_user)


# ============================================================
# NEW API ENDPOINTS: /applications
# ============================================================

@router.post("/applications/apply")
def apply_for_job(
    application: ApplicationCreateRequest,
    current_user: dict = Depends(get_current_user)
):
    if current_user.get("role") != "student":
        raise HTTPException(
            status_code=403,
            detail="Only students can apply for jobs."
        )

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
            detail="Applications can only be submitted for approved jobs."
        )

    applications = load_applications()
    student_id = str(current_user.get("user_id"))

    for existing in applications:
        if (
            str(existing.get("student_id")) == student_id
            and str(existing.get("job_id")) == str(application.job_id)
        ):
            raise HTTPException(
                status_code=409,
                detail="You have already applied for this position."
            )

    user = get_user_from_token(current_user)
    if user and not user.get("is_active", True):
        raise HTTPException(
            status_code=403,
            detail="This account has been deactivated."
        )
    student_name = user.get("name", "Student") if user else "Student"

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


@router.get("/applications/mine")
@router.get("/applications/me")
def get_my_applications_endpoint(
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

    results.sort(
        key=lambda x: x.get("created_at", ""),
        reverse=True
    )

    return results


@router.get("/applications/job/{job_id}")
def get_job_applicants(
    job_id: str,
    current_user: dict = Depends(get_current_user)
):
    user_id = str(current_user.get("user_id"))
    role = current_user.get("role")

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

    if role != "admin" and str(target_job.get("posted_by")) != user_id:
        raise HTTPException(
            status_code=403,
            detail="You do not have permission to view applicants for this job."
        )

    applications = load_applications()
    results = []

    for app in applications:
        if str(app.get("job_id")) == str(job_id):
            student_name = app.get("student_name", "")
            student_email = ""
            department = ""

            student_user = users_collection.find_one(
                {"_id": app.get("student_id")}
            )

            if not student_user:
                all_students = users_collection.find({"role": "student"})
                for candidate in all_students:
                    if str(candidate.get("_id")) == str(app.get("student_id")):
                        student_user = candidate
                        break

            if student_user:
                student_name = student_user.get("name", student_name)
                student_email = student_user.get("email", "")
                student_profile = student_user.get("student_profile", {})
                department = student_profile.get("department", "")

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

    results.sort(
        key=lambda x: x.get("created_at", ""),
        reverse=True
    )

    return results


@router.patch("/applications/{application_id}/status")
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

    job_lookup = {str(job.get("id")): job for job in jobs}

    for app in applications:
        if str(app.get("id")) == str(application_id):
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
                        detail="You do not have permission to update this application."
                    )

            app["status"] = request.status
            app["updated_at"] = datetime.now(timezone.utc).isoformat()

            save_applications(applications)

            return {
                "message": f"Application status updated to {request.status}.",
                "application": app
            }

    raise HTTPException(
        status_code=404,
        detail="Application not found."
    )


@router.delete("/applications/{application_id}")
def withdraw_application(
    application_id: str,
    current_user: dict = Depends(get_current_user)
):
    user_id = str(current_user.get("user_id"))
    applications = load_applications()

    for index, app in enumerate(applications):
        if str(app.get("id")) == str(application_id):
            if str(app.get("student_id")) != user_id:
                raise HTTPException(
                    status_code=403,
                    detail="You can only withdraw your own applications."
                )

            if app.get("status") != "applied":
                raise HTTPException(
                    status_code=400,
                    detail="Cannot withdraw application that is already being reviewed."
                )

            deleted_app = applications.pop(index)
            save_applications(applications)

            return {
                "message": "Application withdrawn successfully.",
                "application": deleted_app
            }

    raise HTTPException(
        status_code=404,
        detail="Application not found."
    )


# ============================================================
# COMPATIBILITY ROUTES: /jobs/.../applications
# ============================================================

@router.post("/jobs/{job_id}/applications")
def apply_to_job_compatibility(
    job_id: str,
    body: JobApplicationCreateRequest,
    current_user: dict = Depends(get_current_user),
):
    if current_user.get("role") != "student":
        raise HTTPException(
            status_code=403,
            detail="Only students can apply to jobs."
        )

    job = _find_job(job_id)
    if not job:
        raise HTTPException(
            status_code=404,
            detail="Job not found."
        )

    if job.get("status") != "approved":
        raise HTTPException(
            status_code=400,
            detail="Applications are only accepted for approved jobs."
        )

    student_id = str(current_user.get("user_id"))
    applications = load_applications()

    for app in applications:
        if (
            str(app.get("student_id")) == student_id
            and str(app.get("job_id")) == str(job_id)
        ):
            raise HTTPException(
                status_code=400,
                detail="You have already applied to this job."
            )

    user = get_user_from_token(current_user)
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
        "cover_letter": body.cover_letter or "",
        "resume_url": body.resume_url or "",
        "status": "applied",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }

    applications.append(application)
    save_applications(applications)

    return {
        "message": "Application submitted successfully.",
        "application": application,
    }


@router.get("/jobs/applications/me")
def get_my_applications_jobs_compatibility(
    current_user: dict = Depends(get_current_user),
):
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


@router.get("/jobs/{job_id}/applications")
def get_job_applications_compatibility(
    job_id: str,
    current_user: dict = Depends(get_current_user),
):
    role = current_user.get("role")
    user_id = str(current_user.get("user_id"))

    job = _find_job(job_id)
    if not job:
        raise HTTPException(
            status_code=404,
            detail="Job not found."
        )

    if role != "admin" and str(job.get("posted_by")) != user_id:
        raise HTTPException(
            status_code=403,
            detail="You do not have permission to view applications for this job."
        )

    applications = load_applications()

    return [
        app for app in applications
        if str(app.get("job_id")) == str(job_id)
    ]


@router.patch("/jobs/applications/{application_id}/status")
def update_application_status_compatibility(
    application_id: str,
    body: ApplicationStatusUpdateRequest,
    current_user: dict = Depends(get_current_user),
):
    role = current_user.get("role")
    user_id = str(current_user.get("user_id"))

    if body.status not in VALID_APPLICATION_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Invalid status. Must be one of: "
                f"{', '.join(sorted(VALID_APPLICATION_STATUSES))}."
            ),
        )

    applications = load_applications()

    for app in applications:
        if str(app.get("id")) == str(application_id):
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
