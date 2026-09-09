from datetime import datetime, timezone
import json
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from database import users_collection
from security.dependencies import get_current_user


router = APIRouter(
    prefix="/jobs",
    tags=["Jobs"]
)


JOBS_FILE = Path(__file__).resolve().parent.parent / "jobs_data.json"


# ============================================================
# REQUEST MODELS
# ============================================================

class JobCreateRequest(BaseModel):
    title: str
    company: str
    description: str
    location: str
    employment_type: str
    experience: str = ""
    salary: str = ""
    skills: list[str] = []
    application_url: str = ""
    deadline: str | None = None


class JobStatusRequest(BaseModel):
    status: str


# ============================================================
# HELPERS
# ============================================================

def load_jobs():
    try:
        if JOBS_FILE.exists():
            return json.loads(
                JOBS_FILE.read_text(encoding="utf-8")
            )
    except Exception:
        pass

    return []


def save_jobs(jobs):
    JOBS_FILE.write_text(
        json.dumps(jobs, indent=2),
        encoding="utf-8"
    )


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


# ============================================================
# CREATE JOB
# ============================================================

@router.post("")
def create_job(
    job: JobCreateRequest,
    current_user: dict = Depends(get_current_user)
):
    # Only alumni and admin can post jobs
    if current_user.get("role") not in {"alumni", "admin"}:
        raise HTTPException(
            status_code=403,
            detail="Only alumni and admin users can post jobs."
        )

    user = get_user_from_token(current_user)

    if not user:
        raise HTTPException(
            status_code=404,
            detail="User account not found."
        )

    # Alumni must be verified
    if current_user.get("role") == "alumni":
        if not user.get("is_verified", False):
            raise HTTPException(
                status_code=403,
                detail="Your alumni account must be verified by an administrator before posting jobs."
            )

    # Admin-created jobs can be approved directly
    initial_status = (
        "approved"
        if current_user.get("role") == "admin"
        else "pending"
    )

    job_document = {
        "id": str(uuid.uuid4()),
        "posted_by": str(current_user.get("user_id")),
        "poster_name": user.get("name", "Alumni"),
        "title": job.title,
        "company": job.company,
        "description": job.description,
        "location": job.location,
        "employment_type": job.employment_type,
        "experience": job.experience,
        "salary": job.salary,
        "skills": job.skills,
        "application_url": job.application_url,
        "deadline": job.deadline,
        "status": initial_status,
        "created_at": datetime.now(timezone.utc).isoformat()
    }

    jobs = load_jobs()
    jobs.append(job_document)
    save_jobs(jobs)

    return {
        "message": "Job posting submitted successfully.",
        "job": job_document
    }


# ============================================================
# GET APPROVED JOBS
# ============================================================

@router.get("")
def get_jobs(
    current_user: dict = Depends(get_current_user)
):
    jobs = load_jobs()

    # Normal users only see approved jobs
    if current_user.get("role") not in {"admin"}:
        jobs = [
            job for job in jobs
            if job.get("status") == "approved"
        ]

    return jobs


# ============================================================
# GET MY POSTED JOBS
# ============================================================

@router.get("/mine")
def get_my_jobs(
    current_user: dict = Depends(get_current_user)
):
    user_id = str(current_user.get("user_id"))

    jobs = load_jobs()

    return [
        job for job in jobs
        if str(job.get("posted_by")) == user_id
    ]


# ============================================================
# ADMIN - GET ALL JOBS
# ============================================================

@router.get("/admin")
def get_all_jobs_for_admin(
    current_user: dict = Depends(get_current_user)
):
    if current_user.get("role") != "admin":
        raise HTTPException(
            status_code=403,
            detail="Admin access required."
        )

    return load_jobs()


# ============================================================
# ADMIN - UPDATE JOB STATUS
# ============================================================

@router.patch("/{job_id}/status")
def update_job_status(
    job_id: str,
    request: JobStatusRequest,
    current_user: dict = Depends(get_current_user)
):
    if current_user.get("role") != "admin":
        raise HTTPException(
            status_code=403,
            detail="Admin access required."
        )

    if request.status not in {"pending", "approved", "rejected"}:
        raise HTTPException(
            status_code=400,
            detail="Invalid job status."
        )

    jobs = load_jobs()

    for job in jobs:
        if str(job.get("id")) == str(job_id):
            job["status"] = request.status
            job["updated_at"] = datetime.now(
                timezone.utc
            ).isoformat()

            save_jobs(jobs)

            return {
                "message": f"Job {request.status} successfully.",
                "job": job
            }

    raise HTTPException(
        status_code=404,
        detail="Job not found."
    )


# ============================================================
# DELETE JOB
# ============================================================

@router.delete("/{job_id}")
def delete_job(
    job_id: str,
    current_user: dict = Depends(get_current_user)
):
    user_id = str(current_user.get("user_id"))
    role = current_user.get("role")

    jobs = load_jobs()

    for index, job in enumerate(jobs):
        if str(job.get("id")) == str(job_id):

            if role != "admin" and str(job.get("posted_by")) != user_id:
                raise HTTPException(
                    status_code=403,
                    detail="You can only delete your own jobs."
                )

            deleted_job = jobs.pop(index)
            save_jobs(jobs)

            return {
                "message": "Job deleted successfully.",
                "job": deleted_job
            }

    raise HTTPException(
        status_code=404,
        detail="Job not found."
    )