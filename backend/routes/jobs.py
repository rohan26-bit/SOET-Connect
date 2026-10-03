from datetime import datetime, timezone
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from database import users_collection, supabase
from security.dependencies import get_current_user
from services.notifications import NOTIFICATION_TYPES, create_notification_once


router = APIRouter(
    prefix="/jobs",
    tags=["Jobs"]
)

# Legacy file attribute for test monkeypatch compatibility
JOBS_FILE = None


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

def load_jobs() -> list[dict]:
    """Load jobs directly from Supabase PostgreSQL jobs table."""
    try:
        res = supabase.table("jobs").select("*").order("created_at", desc=True).execute()
        jobs = []
        for row in res.data or []:
            j = dict(row)
            j["employment_type"] = row.get("job_type", "")
            j["experience"] = row.get("experience_level", "")
            j["salary"] = row.get("salary_range", "")
            if not j.get("poster_name") and j.get("posted_by"):
                u = users_collection.find_one({"_id": str(j["posted_by"])})
                if u:
                    j["poster_name"] = u.get("name", "Alumni")
            jobs.append(j)
        return jobs
    except Exception as e:
        print("Error loading jobs from Supabase:", e)
        return []


def get_user_from_token(current_user: dict):
    user_id = current_user.get("user_id")
    role = current_user.get("role")

    user = users_collection.find_one({"_id": str(user_id)})
    if user:
        return user

    if role:
        users = users_collection.find({"role": role})
        for candidate in users:
            if str(candidate.get("_id")) == str(user_id):
                return candidate

    return None


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

    if not user.get("is_active", True):
        raise HTTPException(
            status_code=403,
            detail="This account has been deactivated."
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

    job_id = str(uuid.uuid4())
    user_id = str(current_user.get("user_id"))
    poster_name = user.get("name", "Alumni")
    now_iso = datetime.now(timezone.utc).isoformat()

    job_row = {
        "id": job_id,
        "posted_by": user_id,
        "title": job.title,
        "company": job.company,
        "location": job.location,
        "job_type": job.employment_type,
        "experience_level": job.experience,
        "salary_range": job.salary,
        "description": job.description,
        "requirements": "",
        "skills": job.skills or [],
        "status": initial_status,
        "created_at": now_iso,
        "updated_at": now_iso,
    }

    supabase.table("jobs").insert(job_row).execute()

    job_document = {
        **job_row,
        "poster_name": poster_name,
        "employment_type": job.employment_type,
        "experience": job.experience,
        "salary": job.salary,
        "application_url": job.application_url,
        "deadline": job.deadline,
    }

    if initial_status == "pending":
        try:
            create_notification_once(
                user_id=user_id,
                title="Job submission received",
                message=f'Your job posting "{job.title}" was submitted successfully and is pending administrator review.',
                notification_type=NOTIFICATION_TYPES["job_submission"],
                entity_type="job",
                entity_id=job_id,
                dedupe_key=f"job_submission:{job_id}",
            )
        except Exception:
            pass

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
# GET JOB DETAILS
# ============================================================

@router.get("/{job_id}")
def get_job_details(
    job_id: str,
    current_user: dict = Depends(get_current_user)
):
    res = supabase.table("jobs").select("*").eq("id", str(job_id)).limit(1).execute()
    if not res.data:
        raise HTTPException(
            status_code=404,
            detail="Job not found."
        )
    job = res.data[0]
    job["employment_type"] = job.get("job_type", "")
    job["experience"] = job.get("experience_level", "")
    job["salary"] = job.get("salary_range", "")
    return job


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

    if request.status not in {"pending", "approved", "rejected", "closed"}:
        raise HTTPException(
            status_code=400,
            detail="Invalid job status."
        )

    res = supabase.table("jobs").select("*").eq("id", str(job_id)).limit(1).execute()
    if not res.data:
        raise HTTPException(
            status_code=404,
            detail="Job not found."
        )

    job = res.data[0]
    old_status = job.get("status")
    now_iso = datetime.now(timezone.utc).isoformat()

    supabase.table("jobs").update({
        "status": request.status,
        "updated_at": now_iso
    }).eq("id", str(job_id)).execute()

    job["status"] = request.status
    job["updated_at"] = now_iso
    job["employment_type"] = job.get("job_type", "")
    job["experience"] = job.get("experience_level", "")
    job["salary"] = job.get("salary_range", "")

    if old_status != request.status:
        owner_id = str(job.get("posted_by"))
        job_title = job.get("title", "")
        if request.status == "approved":
            try:
                create_notification_once(
                    user_id=owner_id,
                    title="Job posting approved",
                    message=f'Your job posting "{job_title}" has been approved and is now visible to users.',
                    notification_type=NOTIFICATION_TYPES["job_approval"],
                    entity_type="job",
                    entity_id=str(job_id),
                    dedupe_key=f"job_approval:{job_id}",
                )
            except Exception:
                pass
        elif request.status == "rejected":
            try:
                create_notification_once(
                    user_id=owner_id,
                    title="Job posting rejected",
                    message=f'Your job posting "{job_title}" was not approved.',
                    notification_type=NOTIFICATION_TYPES["job_rejection"],
                    entity_type="job",
                    entity_id=str(job_id),
                    dedupe_key=f"job_rejection:{job_id}",
                )
            except Exception:
                pass

    return {
        "message": f"Job {request.status} successfully.",
        "job": job
    }


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

    res = supabase.table("jobs").select("*").eq("id", str(job_id)).limit(1).execute()
    if not res.data:
        raise HTTPException(
            status_code=404,
            detail="Job not found."
        )

    target_job = res.data[0]
    if role != "admin" and str(target_job.get("posted_by")) != user_id:
        raise HTTPException(
            status_code=403,
            detail="You can only delete your own jobs."
        )

    supabase.table("jobs").delete().eq("id", str(job_id)).execute()

    target_job["employment_type"] = target_job.get("job_type", "")
    target_job["experience"] = target_job.get("experience_level", "")
    target_job["salary"] = target_job.get("salary_range", "")

    return {
        "message": "Job deleted successfully.",
        "job": target_job
    }