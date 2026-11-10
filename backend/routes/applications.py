from datetime import datetime, timezone
import io
import os
import uuid
import zipfile

from fastapi import APIRouter, Depends, HTTPException, Request
from typing import Any
from pydantic import BaseModel

from database import users_collection, supabase
from security.dependencies import get_current_user
from services.notifications import NOTIFICATION_TYPES, create_notification_once
from routes.jobs import load_jobs, is_job_expired


router = APIRouter(
    tags=["Applications"]
)

# Legacy file attribute for test monkeypatch compatibility
APPLICATIONS_FILE = None
RESUME_BUCKET = "application-resumes"
RESUME_PATH_PREFIX = f"{RESUME_BUCKET}/"
MAX_RESUME_SIZE_BYTES = 5 * 1024 * 1024


# ============================================================
# ALLOWED ROLES & VALID STATUSES
# ============================================================

ALLOWED_APPLICATION_ROLES = {"student", "alumni", "admin"}

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

def resolve_resume_url(resume_value: str | None) -> str:
    """Return a short-lived download URL for a privately stored application resume.

    Legacy externally hosted resume URLs remain supported during migration.
    """
    value = str(resume_value or "").strip()
    if not value.startswith(RESUME_PATH_PREFIX):
        return value

    storage_path = value[len(RESUME_PATH_PREFIX):]
    if not storage_path:
        return ""

    try:
        signed = supabase.storage.from_(RESUME_BUCKET).create_signed_url(
            storage_path,
            expires_in=3600,
        )
        if isinstance(signed, dict):
            signed = signed.get("signedURL") or signed.get("signedUrl") or ""
        signed_url = str(signed or "")
        # The storage adapter may return a gallery fallback path when signing fails.
        # Never expose that non-working fallback as if it were an application resume.
        if signed_url.startswith("/api/gallery/") and os.getenv("DATABASE_MODE", "supabase").lower() != "mock":
            return ""
        return signed_url
    except Exception as exc:
        print(f"Could not create a signed application-resume URL: {exc}")
        return ""


def _delete_stored_resume(resume_value: str | None) -> None:
    """Delete a private application resume object, leaving legacy URLs untouched."""
    value = str(resume_value or "").strip()
    if not value.startswith(RESUME_PATH_PREFIX):
        return
    storage_path = value[len(RESUME_PATH_PREFIX):]
    if storage_path:
        try:
            supabase.storage.from_(RESUME_BUCKET).delete([storage_path])
        except Exception as exc:
            print(f"Could not delete application resume object: {exc}")


async def _store_application_resume(upload: Any, applicant_id: str) -> str:
    """Validate and upload one PDF/DOC/DOCX resume to the private storage bucket."""
    filename = str(getattr(upload, "filename", "") or "").strip()
    extension = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    allowed_mimes = {
        "pdf": {"application/pdf", "application/x-pdf", "application/octet-stream"},
        "doc": {"application/msword", "application/octet-stream"},
        "docx": {
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/octet-stream",
        },
    }
    if extension not in allowed_mimes:
        raise HTTPException(status_code=400, detail="Resume must be a PDF, DOC, or DOCX file.")

    mime_type = str(getattr(upload, "content_type", "") or "").split(";", 1)[0].strip().lower()
    if mime_type not in allowed_mimes[extension]:
        raise HTTPException(status_code=400, detail="The uploaded resume file type does not match its extension.")

    try:
        file_bytes = await upload.read(MAX_RESUME_SIZE_BYTES + 1)
    except Exception:
        raise HTTPException(status_code=400, detail="Could not read the selected resume file.")

    if not file_bytes:
        raise HTTPException(status_code=400, detail="The selected resume file is empty.")
    if len(file_bytes) > MAX_RESUME_SIZE_BYTES:
        raise HTTPException(status_code=413, detail="Resume file must not exceed 5 MB.")

    if extension == "pdf" and not file_bytes.startswith(b"%PDF-"):
        raise HTTPException(status_code=400, detail="The uploaded file is not a valid PDF document.")
    if extension == "doc" and not file_bytes.startswith(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"):
        raise HTTPException(status_code=400, detail="The uploaded file is not a valid DOC document.")
    if extension == "docx":
        try:
            with zipfile.ZipFile(io.BytesIO(file_bytes)) as document:
                valid_docx = "word/document.xml" in document.namelist()
        except (OSError, zipfile.BadZipFile):
            valid_docx = False
        if not valid_docx:
            raise HTTPException(status_code=400, detail="The uploaded file is not a valid DOCX document.")

    storage_path = f"{applicant_id}/{uuid.uuid4().hex}.{extension}"
    normalized_mime = mime_type if mime_type != "application/octet-stream" else {
        "pdf": "application/pdf",
        "doc": "application/msword",
        "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }[extension]
    try:
        supabase.storage.from_(RESUME_BUCKET).upload(
            storage_path,
            file_bytes,
            content_type=normalized_mime,
        )
    except Exception as exc:
        print(f"Application resume upload failed: {exc}")
        raise HTTPException(status_code=503, detail="Resume upload is temporarily unavailable. Please try again.")

    return f"{RESUME_PATH_PREFIX}{storage_path}"


def load_applications() -> list[dict]:
    """Load job applications from Supabase PostgreSQL."""
    try:
        res = supabase.table("job_applications").select("*").order("applied_at", desc=True).execute()
        apps = []
        for row in res.data or []:
            a = dict(row)
            applicant_id = str(row.get("applicant_id", ""))
            a["applicant_id"] = applicant_id
            a["student_id"] = applicant_id
            a["created_at"] = row.get("applied_at", "")
            if a.get("status") == "submitted":
                a["status"] = "applied"
            elif a.get("status") == "accepted":
                a["status"] = "selected"
            apps.append(a)
        return apps
    except Exception as e:
        print("Error loading applications from Supabase:", e)
        raise HTTPException(
            status_code=503,
            detail="Applications are temporarily unavailable. Please try again.",
        ) from e


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

@router.post("/applications")
@router.post("/applications/apply")
async def apply_for_job(
    request: Request,
    current_user: dict = Depends(get_current_user)
):
    # Accept multipart uploads from the current frontend and JSON from legacy clients.
    resume_file = None
    content_type = str(request.headers.get("content-type") or "").lower()
    try:
        if "multipart/form-data" in content_type:
            form = await request.form()
            application = ApplicationCreateRequest.model_validate({
                "job_id": str(form.get("job_id") or ""),
                "cover_letter": str(form.get("cover_letter") or ""),
                "resume_url": str(form.get("resume_url") or ""),
            })
            candidate_file = form.get("resume_file")
            if candidate_file is not None and getattr(candidate_file, "filename", None):
                resume_file = candidate_file
        else:
            payload = await request.json()
            application = ApplicationCreateRequest.model_validate(payload)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid application request.")

    if current_user.get("role") not in ALLOWED_APPLICATION_ROLES:
        raise HTTPException(status_code=403, detail="Only students, alumni, and administrators can apply for jobs.")

    target_job = _find_job(application.job_id)
    if not target_job:
        raise HTTPException(status_code=404, detail="Job not found.")
    if target_job.get("status") != "approved":
        raise HTTPException(status_code=400, detail="Applications can only be submitted for approved jobs.")
    if is_job_expired(target_job):
        raise HTTPException(status_code=400, detail="The application deadline for this job has passed.")

    applicant_id = str(current_user.get("user_id"))
    applications = load_applications()
    for existing in applications:
        existing_applicant = str(existing.get("applicant_id") or existing.get("student_id"))
        if existing_applicant == applicant_id and str(existing.get("job_id")) == str(application.job_id):
            raise HTTPException(status_code=409, detail="You have already applied for this position.")

    user = get_user_from_token(current_user)
    if not user:
        raise HTTPException(status_code=404, detail="User account not found.")
    if not user.get("is_active", True):
        raise HTTPException(status_code=403, detail="This account has been deactivated.")

    applicant_name = user.get("name") or "Applicant"
    app_id = str(uuid.uuid4())
    now_iso = datetime.now(timezone.utc).isoformat()
    stored_resume = ""
    resume_uploaded_in_this_request = False

    try:
        if resume_file is not None:
            stored_resume = await _store_application_resume(resume_file, applicant_id)
            resume_uploaded_in_this_request = True
        else:
            stored_resume = str(application.resume_url or "").strip()
            if stored_resume.startswith(RESUME_PATH_PREFIX) and not stored_resume.startswith(
                f"{RESUME_PATH_PREFIX}{applicant_id}/"
            ):
                raise HTTPException(status_code=403, detail="You cannot attach another user's private resume.")

        supabase.table("job_applications").insert({
            "id": app_id,
            "job_id": str(application.job_id),
            "applicant_id": applicant_id,
            "status": "submitted",
            "resume_url": stored_resume,
            "cover_letter": application.cover_letter or "",
            "applied_at": now_iso,
            "updated_at": now_iso,
        }).execute()
    except HTTPException:
        if resume_uploaded_in_this_request:
            _delete_stored_resume(stored_resume)
        raise
    except Exception as exc:
        if resume_uploaded_in_this_request:
            _delete_stored_resume(stored_resume)
        error_text = str(exc).lower()
        if "unique_job_application" in error_text or "duplicate key" in error_text or "23505" in error_text:
            raise HTTPException(status_code=409, detail="You have already applied for this position.")
        print(f"Could not save job application: {exc}")
        raise HTTPException(status_code=503, detail="Your application could not be saved. Please try again.")

    app_document = {
        "id": app_id,
        "job_id": str(application.job_id),
        "student_id": applicant_id,
        "student_name": applicant_name,
        "applicant_id": applicant_id,
        "applicant_name": applicant_name,
        "resume_url": resolve_resume_url(stored_resume),
        "cover_letter": application.cover_letter or "",
        "status": "applied",
        "created_at": now_iso,
        "updated_at": now_iso,
    }

    poster_id = str(target_job.get("posted_by") or "")
    job_title = target_job.get("title", "")
    if poster_id:
        try:
            create_notification_once(
                user_id=poster_id,
                title="New job application",
                message=f'{applicant_name} applied for your job "{job_title}".',
                notification_type=NOTIFICATION_TYPES["job_application"],
                entity_type="application",
                entity_id=app_id,
                dedupe_key=f"job_application:{app_id}",
            )
        except Exception:
            pass

    return {"message": "Application submitted successfully.", "application": app_document}


@router.get("/applications/mine")
@router.get("/applications/me")
def get_my_applications_endpoint(
    current_user: dict = Depends(get_current_user)
):
    if current_user.get("role") not in ALLOWED_APPLICATION_ROLES:
        raise HTTPException(
            status_code=403,
            detail="Only students, alumni, and administrators can view their own applications."
        )

    user_id = str(current_user.get("user_id"))
    applications = load_applications()
    jobs = load_jobs()

    job_lookup = {str(job.get("id")): job for job in jobs}

    results = []
    for app in applications:
        app_user_id = str(app.get("applicant_id") or app.get("student_id"))
        if app_user_id == user_id:
            job = job_lookup.get(str(app.get("job_id")))

            result = {
                "id": app.get("id"),
                "job_id": app.get("job_id"),
                "student_id": app_user_id,
                "applicant_id": app_user_id,
                "resume_url": resolve_resume_url(app.get("resume_url", "")),
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
            applicant_id = str(app.get("applicant_id") or app.get("student_id"))
            applicant_name = app.get("student_name", "")
            applicant_email = ""
            department = ""

            applicant_user = users_collection.find_one(
                {"_id": applicant_id}
            )

            if applicant_user:
                applicant_name = applicant_user.get("name", applicant_name)
                applicant_email = applicant_user.get("email", "")
                profile = (
                    applicant_user.get("student_profile")
                    or applicant_user.get("alumni_profile")
                    or {}
                )
                department = profile.get("department", "")

            results.append({
                "id": app.get("id"),
                "job_id": app.get("job_id"),
                "student_id": applicant_id,
                "student_name": applicant_name,
                "applicant_id": applicant_id,
                "applicant_name": applicant_name,
                "student_email": applicant_email,
                "applicant_email": applicant_email,
                "department": department,
                "resume_url": resolve_resume_url(app.get("resume_url", "")),
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
                applicant_id = str(app.get("applicant_id") or app.get("student_id"))
                job_title = job.get("title", "") if job else ""
                try:
                    create_notification_once(
                        user_id=applicant_id,
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
            app_user_id = str(app.get("applicant_id") or app.get("student_id"))
            if app_user_id != user_id:
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

            # Uploaded resumes live in a private per-applicant storage folder.
            # Remove only an object inside this applicant's own folder; legacy
            # external URLs and malformed/cross-user paths are left untouched.
            resume_value = str(app.get("resume_url") or "").strip()
            owned_resume_prefix = f"{RESUME_PATH_PREFIX}{user_id}/"
            if resume_value.startswith(owned_resume_prefix):
                _delete_stored_resume(resume_value)

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
    if current_user.get("role") not in ALLOWED_APPLICATION_ROLES:
        raise HTTPException(
            status_code=403,
            detail="Only students, alumni, and administrators can apply to jobs."
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

    if is_job_expired(job):
        raise HTTPException(
            status_code=400,
            detail="The application deadline for this job has passed."
        )

    applicant_id = str(current_user.get("user_id"))
    applications = load_applications()

    for app in applications:
        existing_applicant = str(app.get("applicant_id") or app.get("student_id"))
        if (
            existing_applicant == applicant_id
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

    applicant_name = user.get("name") or "Applicant"
    student_name = applicant_name
    app_id = str(uuid.uuid4())
    now_iso = datetime.now(timezone.utc).isoformat()

    supabase.table("job_applications").insert({
        "id": app_id,
        "job_id": str(job_id),
        "applicant_id": applicant_id,
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
        "student_id": applicant_id,
        "student_name": student_name,
        "applicant_id": applicant_id,
        "applicant_name": applicant_name,
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
            message=f'{applicant_name} applied for your job "{job_title}".',
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
    if current_user.get("role") not in ALLOWED_APPLICATION_ROLES:
        raise HTTPException(
            status_code=403,
            detail="Only students, alumni, and administrators can view their own applications."
        )

    applicant_id = str(current_user.get("user_id"))
    applications = load_applications()

    return [
        app for app in applications
        if str(app.get("applicant_id") or app.get("student_id")) == applicant_id
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
                applicant_id = str(app.get("applicant_id") or app.get("student_id"))
                job_obj = _find_job(app.get("job_id"))
                job_title = job_obj.get("title", "") if job_obj else app.get("job_title", "")
                try:
                    create_notification_once(
                        user_id=applicant_id,
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
