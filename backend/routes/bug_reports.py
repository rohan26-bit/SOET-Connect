from datetime import datetime, timezone
import uuid
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, field_validator

from database import supabase, users_collection
from security.dependencies import get_current_user


router = APIRouter(
    prefix="/bug-reports",
    tags=["Bug Reports"],
)

VALID_CATEGORIES = {
    "bug",
    "ui_issue",
    "auth_issue",
    "data_issue",
    "performance",
    "other",
}

VALID_SEVERITIES = {
    "low",
    "medium",
    "high",
    "critical",
}

VALID_STATUSES = {
    "open",
    "in_review",
    "resolved",
    "closed",
}


# ============================================================
# SCHEMAS
# ============================================================

class BugReportCreateRequest(BaseModel):
    category: str = Field(..., description="Issue type/category")
    severity: str = Field(default="medium", description="Issue severity level")
    subject: str = Field(..., min_length=3, max_length=255, description="Brief summary of the issue")
    description: str = Field(..., min_length=5, description="Detailed description")
    page_route: Optional[str] = Field(None, max_length=255, description="Page URL / route where issue occurred")
    reproduction_steps: Optional[str] = Field(None, description="Optional steps to reproduce")

    @field_validator("category")
    @classmethod
    def validate_category(cls, v: str) -> str:
        clean = v.strip().lower()
        if clean not in VALID_CATEGORIES:
            raise ValueError(f"Invalid category. Must be one of: {', '.join(sorted(VALID_CATEGORIES))}")
        return clean

    @field_validator("severity")
    @classmethod
    def validate_severity(cls, v: str) -> str:
        clean = v.strip().lower()
        if clean not in VALID_SEVERITIES:
            raise ValueError(f"Invalid severity. Must be one of: {', '.join(sorted(VALID_SEVERITIES))}")
        return clean

    @field_validator("subject")
    @classmethod
    def validate_subject(cls, v: str) -> str:
        clean = v.strip()
        if len(clean) < 3:
            raise ValueError("Subject must be at least 3 characters long.")
        return clean

    @field_validator("description")
    @classmethod
    def validate_description(cls, v: str) -> str:
        clean = v.strip()
        if len(clean) < 5:
            raise ValueError("Description must be at least 5 characters long.")
        return clean


class BugReportStatusUpdateRequest(BaseModel):
    status: str = Field(..., description="New report status")
    admin_notes: Optional[str] = Field(None, description="Optional administrator resolution notes")

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: str) -> str:
        clean = v.strip().lower()
        if clean not in VALID_STATUSES:
            raise ValueError(f"Invalid status. Must be one of: {', '.join(sorted(VALID_STATUSES))}")
        return clean


# ============================================================
# HELPERS
# ============================================================

def _require_admin(current_user: dict):
    """Raise 403 if the authenticated user is not an administrator."""
    if current_user.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required."
        )


def _enrich_report(report: dict) -> dict:
    """Enrich bug report with reporter details from users collection."""
    rep = dict(report)
    reporter_id = str(rep.get("reporter_user_id", "")).strip()
    if reporter_id:
        try:
            user = users_collection.find_one({"_id": reporter_id})
            if user:
                rep["reporter"] = {
                    "id": str(user.get("_id") or user.get("id")),
                    "name": user.get("name", "Unknown"),
                    "email": user.get("email", ""),
                    "role": user.get("role", "unknown"),
                    "avatar_url": user.get("avatar_url"),
                }
            else:
                rep["reporter"] = {
                    "id": reporter_id,
                    "name": "Unknown User",
                    "email": "",
                    "role": "user",
                }
        except Exception:
            rep["reporter"] = {
                "id": reporter_id,
                "name": "Unknown User",
                "email": "",
                "role": "user",
            }
    return rep


# ============================================================
# ROUTES
# ============================================================

@router.post("", status_code=status.HTTP_201_CREATED)
@router.post("/", status_code=status.HTTP_201_CREATED)
def submit_bug_report(
    payload: BugReportCreateRequest,
    current_user: dict = Depends(get_current_user),
):
    """Submit a new bug or issue report (authenticated students, alumni, admins)."""
    user_id = str(current_user.get("user_id")).strip()
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token."
        )

    now_iso = datetime.now(timezone.utc).isoformat()
    report_id = str(uuid.uuid4())

    new_report = {
        "id": report_id,
        "reporter_user_id": user_id,
        "category": payload.category,
        "severity": payload.severity,
        "subject": payload.subject,
        "description": payload.description,
        "page_route": payload.page_route.strip() if payload.page_route else None,
        "reproduction_steps": payload.reproduction_steps.strip() if payload.reproduction_steps else None,
        "status": "open",
        "admin_notes": None,
        "created_at": now_iso,
        "updated_at": now_iso,
    }

    try:
        supabase.table("bug_reports").insert(new_report).execute()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to record bug report: {str(e)}"
        )

    enriched = _enrich_report(new_report)
    return {
        "message": "Report submitted successfully.",
        "report": enriched,
    }


@router.get("")
@router.get("/")
def list_bug_reports(
    current_user: dict = Depends(get_current_user),
):
    """List all bug reports (Administrator only)."""
    _require_admin(current_user)

    try:
        res = supabase.table("bug_reports").select("*").order("created_at", desc=True).execute()
        reports = res.data or []
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to load bug reports: {str(e)}"
        )

    # Sort descending by created_at in case mock sort differed
    reports.sort(key=lambda r: str(r.get("created_at", "")), reverse=True)
    return [_enrich_report(r) for r in reports]


@router.get("/{report_id}")
def get_bug_report(
    report_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Get single bug report details (Administrator or original reporter)."""
    user_id = str(current_user.get("user_id")).strip()
    is_admin = current_user.get("role") == "admin"

    try:
        res = supabase.table("bug_reports").select("*").eq("id", str(report_id)).limit(1).execute()
        reports = res.data or []
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch bug report: {str(e)}"
        )

    if not reports:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Bug report not found."
        )

    report = reports[0]
    if not is_admin and str(report.get("reporter_user_id")) != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied."
        )

    return _enrich_report(report)


@router.patch("/{report_id}/status")
def update_bug_report_status(
    report_id: str,
    payload: BugReportStatusUpdateRequest,
    current_user: dict = Depends(get_current_user),
):
    """Update status and notes of a bug report (Administrator only)."""
    _require_admin(current_user)

    try:
        res = supabase.table("bug_reports").select("*").eq("id", str(report_id)).limit(1).execute()
        reports = res.data or []
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to find bug report: {str(e)}"
        )

    if not reports:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Bug report not found."
        )

    now_iso = datetime.now(timezone.utc).isoformat()
    update_data = {
        "status": payload.status,
        "updated_at": now_iso,
    }
    if payload.admin_notes is not None:
        update_data["admin_notes"] = payload.admin_notes.strip()

    try:
        supabase.table("bug_reports").update(update_data).eq("id", str(report_id)).execute()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update bug report status: {str(e)}"
        )

    # Fetch updated report
    updated_res = supabase.table("bug_reports").select("*").eq("id", str(report_id)).limit(1).execute()
    updated_report = updated_res.data[0] if updated_res.data else {**reports[0], **update_data}

    return {
        "message": "Report status updated successfully.",
        "report": _enrich_report(updated_report),
    }
