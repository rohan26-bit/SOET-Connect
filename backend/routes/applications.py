from datetime import datetime, timezone
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from database import users_collection, supabase
from security.dependencies import get_current_user
from services.notifications import NOTIFICATION_TYPES, create_notification_once
from routes.jobs import load_jobs


router = APIRouter(
    tags=["Applications"]
)

# Legacy file attribute for test monkeypatch compatibility
APPLICATIONS_FILE = None


# ============================================================
# VALID STATUSES
# ============================================================

VALID_APPLICATION_STATUSES = {
    "applied",
    "submitted",
    "under_review",
    "shortlisted",
    "interview",
    "selected",
    "accepted",
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
    """Load job applications from Supabase PostgreSQL."""
    try:
        res = supabase.table("job_applications").select("*").order("applied_at", desc=True).execute()
        apps = []
        for row in res.data or []:
            a = dict(row)
            a["student_id"] = str(row.get("applicant_id", ""))
            a["created_at"] = row.get("applied_at", "")
            if a.get("status") == "submitted":
                a["status"] = "applied"
            elif a.get("status") == "accepted":
                a["status"] = "selected"
            apps.append(a)
        return apps
    except Exception as e:
        print("Error loading applications from Supabase:", e)
        return []


def _find_job(job_id: str) -> dict | None:
    for job in load_jobs():
        if str(job.get("id")) == str(job_id):
            return job
    return None


def get_user_from_token(current_user: dict) -> dict | None:
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

    target_job = _find_job(application.job_id)
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

    student_id = str(current_user.get("user_id"))
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

    student_name = user.get("name", "Student")
    app_id = str(uuid.uuid4())
    now_iso = datetime.now(timezone.utc).isoformat()

    db_status = "submitted"
    supabase.table("job_applications").insert({
        "id": app_id,
        "job_id": str(application.job_id),
        "applicant_id": student_id,
        "status": db_status,
        "resume_url": application.resume_url or "",
        "cover_letter": application.cover_letter or "",
        "applied_at": now_iso,
        "updated_at": now_iso,
    }).execute()

    app_document = {
        "id": app_id,
        "job_id": str(application.job_id),
        "student_id": student_id,
        "student_name": student_name,
        "resume_url": application.resume_url or "",
        "cover_letter": application.cover_letter or "",
        "status": "applied",
        "created_at": now_iso,
        "updated_at": now_iso,
    }

    poster_id = str(target_job.get("posted_by"))
    job_title = target_job.get("title", "")
    try:
        create_notification_once(
            user_id=poster_id,
            title="New job application",
            message=f'{student_name} applied for your job "{job_title}".',
            notification_type=NOTIFICATION_TYPES["job_application"],
            entity_type="application",
            entity_id=app_id,
            dedupe_key=f"job_application:{app_id}",
        )
    except Exception:
        pass

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

    job_lookup = {str(job.get("id")): job for job in jobs}

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

    target_job = _find_job(job_id)
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

            old_status = app.get("status")
            app["status"] = request.status
            now_iso = datetime.now(timezone.utc).isoformat()
            app["updated_at"] = now_iso

            db_status = request.status
            if db_status == "applied":
                db_status = "submitted"
            elif db_status == "selected":
                db_status = "accepted"

            supabase.table("job_applications").update({
                "status": db_status,
                "updated_at": now_iso
            }).eq("id", str(application_id)).execute()

            if old_status != request.status:
                student_id = str(app.get("student_id"))
                job_title = job.get("title", "") if job else ""
                try:
                    create_notification_once(
                        user_id=student_id,
                        title="Application status updated",
                        message=f'Your application for "{job_title}" is now "{request.status}".',
                        notification_type=NOTIFICATION_TYPES["application_status"],
                        entity_type="application",
                        entity_id=str(application_id),
                        dedupe_key=f"application_status:{application_id}:{request.status}",
                    )
                except Exception:
                    pass

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

    for app in applications:
        if str(app.get("id")) == str(application_id):
            if str(app.get("student_id")) != user_id:
                raise HTTPException(
                    status_code=403,
                    detail="You can only withdraw your own applications."
                )

            if app.get("status") not in {"applied", "submitted"}:
                raise HTTPException(
                    status_code=400,
                    detail="Cannot withdraw application that is already being reviewed."
                )

            supabase.table("job_applications").delete().eq("id", str(application_id)).execute()

            return {
                "message": "Application withdrawn successfully.",
                "application": app
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

    student_name = user.get("name", "Student")
    app_id = str(uuid.uuid4())
    now_iso = datetime.now(timezone.utc).isoformat()

    supabase.table("job_applications").insert({
        "id": app_id,
        "job_id": str(job_id),
        "applicant_id": student_id,
        "status": "submitted",
        "resume_url": body.resume_url or "",
        "cover_letter": body.cover_letter or "",
        "applied_at": now_iso,
        "updated_at": now_iso,
    }).execute()

    application = {
        "id": app_id,
        "job_id": str(job_id),
        "job_title": job.get("title", ""),
        "company": job.get("company", ""),
        "student_id": student_id,
        "student_name": student_name,
        "cover_letter": body.cover_letter or "",
        "resume_url": body.resume_url or "",
        "status": "applied",
        "created_at": now_iso,
        "updated_at": now_iso,
    }

    poster_id = str(job.get("posted_by"))
    job_title = job.get("title", "")
    try:
        create_notification_once(
            user_id=poster_id,
            title="New job application",
            message=f'{student_name} applied for your job "{job_title}".',
            notification_type=NOTIFICATION_TYPES["job_application"],
            entity_type="application",
            entity_id=app_id,
            dedupe_key=f"job_application:{app_id}",
        )
    except Exception:
        pass

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

            old_status = app.get("status")
            app["status"] = body.status
            now_iso = datetime.now(timezone.utc).isoformat()
            app["updated_at"] = now_iso

            db_status = body.status
            if db_status == "applied":
                db_status = "submitted"
            elif db_status == "selected":
                db_status = "accepted"

            supabase.table("job_applications").update({
                "status": db_status,
                "updated_at": now_iso
            }).eq("id", str(application_id)).execute()

            if old_status != body.status:
                student_id = str(app.get("student_id"))
                job_obj = _find_job(app.get("job_id"))
                job_title = job_obj.get("title", "") if job_obj else app.get("job_title", "")
                try:
                    create_notification_once(
                        user_id=student_id,
                        title="Application status updated",
                        message=f'Your application for "{job_title}" is now "{body.status}".',
                        notification_type=NOTIFICATION_TYPES["application_status"],
                        entity_type="application",
                        entity_id=str(application_id),
                        dedupe_key=f"application_status:{application_id}:{body.status}",
                    )
                except Exception:
                    pass

            return {
                "message": f"Application status updated to '{body.status}'.",
                "application": app,
            }

    raise HTTPException(
        status_code=404,
        detail="Application not found."
    )
