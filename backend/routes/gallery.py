import os
import uuid
from datetime import datetime, timezone
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query, Response
from pydantic import BaseModel

from database import supabase, users_collection
from security.dependencies import get_current_user
from services.gallery import validate_image_file, generate_watermarked_display
from services.notifications import create_notification_once

router = APIRouter(
    prefix="/gallery",
    tags=["Gallery"],
)

STORAGE_BUCKET = os.getenv("GALLERY_STORAGE_BUCKET", "alumni-portal-gallery")


def _format_photo_doc(row: dict, is_admin: bool = False, current_user_id: str = "") -> dict:
    """Format gallery photo for API responses, hiding private storage details from viewers."""
    photo_id = str(row.get("id"))
    uploader_id = str(row.get("uploader_id"))
    is_owner = uploader_id == current_user_id

    # Resolve uploader name
    uploader_name = "Alumni"
    try:
        u = users_collection.find_one({"_id": uploader_id}, include_profiles=False)
        if u:
            uploader_name = u.get("name") or "Alumni"
    except Exception:
        pass

    out = {
        "id": photo_id,
        "title": row.get("title") or row.get("caption") or "Alumni Photo",
        "caption": row.get("caption"),
        "description": row.get("description") or row.get("caption"),
        "category": row.get("category") or "campus",
        "event_name": row.get("event_name"),
        "batch_year": row.get("batch_year"),
        "status": row.get("status"),
        "uploader_id": uploader_id,
        "uploader_name": uploader_name,
        "user_name": uploader_name,
        "user_id": uploader_id,
        "file_size": row.get("file_size"),
        "mime_type": row.get("mime_type"),
        "display_url": f"/api/gallery/{photo_id}/image",
        "image_url": f"/api/gallery/{photo_id}/image",
        "created_at": row.get("created_at"),
        "updated_at": row.get("updated_at"),
    }

    # Admin and owner see moderation details
    if is_admin or is_owner:
        out["reviewed_by"] = row.get("reviewed_by")
        out["reviewed_at"] = row.get("reviewed_at")
        out["rejection_reason"] = row.get("rejection_reason")

    # Admin sees internal paths
    if is_admin:
        out["original_path"] = row.get("original_path")
        out["display_path"] = row.get("display_path")

    return out


# ============================================================
# POST /gallery/upload  — Upload photo (Alumni & Admin)
# ============================================================

@router.post("/upload")
@router.post("")
async def upload_gallery_photo(
    file: UploadFile = File(...),
    title: Optional[str] = Form(None),
    caption: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    category: Optional[str] = Form("campus"),
    event_name: Optional[str] = Form(None),
    batch_year: Optional[str] = Form(None),
    current_user: dict = Depends(get_current_user),
):
    role = current_user.get("role")
    user_id = str(current_user.get("user_id"))

    # Check permission
    if role == "student":
        raise HTTPException(
            status_code=403,
            detail="Only alumni and administrators can upload photos to the gallery."
        )

    if role == "alumni":
        user_doc = users_collection.find_one({"_id": user_id}, include_profiles=False)
        if not user_doc or not user_doc.get("is_verified") or user_doc.get("verification_status") != "approved":
            raise HTTPException(
                status_code=403,
                detail="Your alumni account must be verified by an administrator before uploading photos."
            )

    # Read bytes
    try:
        file_bytes = await file.read()
    except Exception as e:
        raise HTTPException(status_code=400, detail="Failed to read uploaded file.")

    # Validate image file integrity and format
    try:
        ext, mime_type, width, height = validate_image_file(file_bytes, file.filename or "image.jpg", file.content_type)
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))

    # Generate watermarked display derivative
    try:
        display_bytes = generate_watermarked_display(file_bytes)
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to process image derivative.")

    photo_id = str(uuid.uuid4())
    original_path = f"originals/{photo_id}{ext}"
    display_path = f"display/{photo_id}.webp"

    # Store both in Supabase Storage bucket
    try:
        bucket = supabase.storage.from_(STORAGE_BUCKET)
        bucket.upload(original_path, file_bytes, content_type=mime_type)
        bucket.upload(display_path, display_bytes, content_type="image/webp")
    except Exception as e:
        # Cleanup if partial failure
        try:
            bucket.delete([original_path, display_path])
        except Exception:
            pass
        raise HTTPException(status_code=500, detail=f"Storage upload failed: {str(e)[:150]}")

    now_iso = datetime.now(timezone.utc).isoformat()
    initial_status = "approved" if role == "admin" else "pending"

    title_val = (title or caption or file.filename or "Alumni Photo").strip()
    caption_val = (description or caption or "").strip() or None

    photo_row = {
        "id": photo_id,
        "uploader_id": user_id,
        "title": title_val,
        "caption": caption_val,
        "category": (category or "campus").strip(),
        "event_name": event_name.strip() if event_name else None,
        "batch_year": batch_year.strip() if batch_year else None,
        "original_path": original_path,
        "display_path": display_path,
        "mime_type": mime_type,
        "file_size": len(file_bytes),
        "status": initial_status,
        "reviewed_by": user_id if initial_status == "approved" else None,
        "reviewed_at": now_iso if initial_status == "approved" else None,
        "rejection_reason": None,
        "created_at": now_iso,
        "updated_at": now_iso,
    }

    try:
        supabase.table("gallery_photos").insert(photo_row).execute()
    except Exception as e:
        # Cleanup uploaded files on DB failure
        try:
            supabase.storage.from_(STORAGE_BUCKET).delete([original_path, display_path])
        except Exception:
            pass
        raise HTTPException(status_code=500, detail=f"Failed to record photo in database: {e}")

    # Notify if alumni submission
    if initial_status == "pending":
        try:
            create_notification_once(
                user_id=user_id,
                title="Photo submitted for review",
                message='Your gallery photo was submitted successfully and is pending administrator review.',
                notification_type="gallery_submission",
                entity_type="gallery",
                entity_id=photo_id,
                dedupe_key=f"gallery_sub:{photo_id}",
            )
        except Exception:
            pass

    formatted = _format_photo_doc(photo_row, is_admin=(role == "admin"), current_user_id=user_id)
    return {
        "message": "Photo uploaded successfully." if initial_status == "approved" else "Photo submitted for administrator review.",
        "photo": formatted,
        **formatted,
    }


# ============================================================
# GET /gallery  — Public Approved Photos
# ============================================================

@router.get("")
def get_approved_gallery_photos(
    category: Optional[str] = None,
    batch_year: Optional[str] = None,
    search: Optional[str] = None,
):
    """List all approved gallery photos for portal users."""
    try:
        query = supabase.table("gallery_photos").select("*").eq("status", "approved").order("created_at", desc=True)
        if category and category != "all":
            query = query.eq("category", category)
        if batch_year and batch_year != "all":
            query = query.eq("batch_year", batch_year)
        res = query.execute()
        photos = res.data or []
        if search:
            s = search.lower().strip()
            photos = [
                p for p in photos
                if s in (p.get("title") or "").lower() or s in (p.get("event_name") or "").lower() or s in (p.get("caption") or "").lower()
            ]
        formatted = [_format_photo_doc(p) for p in photos]
        return {
            "photos": formatted,
            "total": len(formatted),
        }
    except Exception as e:
        print("Error fetching approved gallery photos:", e)
        return {"photos": [], "total": 0}


# ============================================================
# GET /gallery/mine  — Own Photo Submissions
# ============================================================

@router.get("/mine")
def get_my_gallery_photos(
    current_user: dict = Depends(get_current_user),
):
    user_id = str(current_user.get("user_id"))
    try:
        res = supabase.table("gallery_photos").select("*").eq("uploader_id", user_id).order("created_at", desc=True).execute()
        photos = res.data or []
        return [_format_photo_doc(p, current_user_id=user_id) for p in photos]
    except Exception as e:
        print("Error fetching user's gallery photos:", e)
        return []


# ============================================================
# GET /gallery/admin  — Admin Management View
# ============================================================

@router.get("/admin")
def get_admin_gallery_photos(
    status: Optional[str] = Query("all", pattern="^(all|pending|approved|rejected)$"),
    current_user: dict = Depends(get_current_user),
):
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only administrators can access gallery moderation.")

    try:
        q = supabase.table("gallery_photos").select("*")
        if status and status != "all":
            q = q.eq("status", status)
        res = q.order("created_at", desc=True).execute()
        photos = res.data or []
        return [_format_photo_doc(p, is_admin=True) for p in photos]
    except Exception as e:
        print("Error fetching admin gallery photos:", e)
        return []


# ============================================================
# GET /gallery/{photo_id}  — Single Photo Details
# ============================================================

@router.get("/{photo_id}")
def get_gallery_photo_details(
    photo_id: str,
    current_user: Optional[dict] = Depends(get_current_user),
):
    res = supabase.table("gallery_photos").select("*").eq("id", photo_id).limit(1).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Photo not found.")

    photo = res.data[0]
    role = current_user.get("role") if current_user else None
    user_id = str(current_user.get("user_id")) if current_user else ""

    if photo.get("status") != "approved" and role != "admin" and str(photo.get("uploader_id")) != user_id:
        raise HTTPException(status_code=404, detail="Photo not found.")

    return _format_photo_doc(photo, is_admin=(role == "admin"), current_user_id=user_id)


# ============================================================
# GET /gallery/{photo_id}/image  — View-only Watermarked Image
# ============================================================

@router.get("/{photo_id}/image")
def get_gallery_photo_image(
    photo_id: str,
):
    """Serve the watermarked, compressed WebP display image safely."""
    res = supabase.table("gallery_photos").select("*").eq("id", photo_id).limit(1).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Photo not found.")

    photo = res.data[0]
    display_path = photo.get("display_path")
    if not display_path:
        raise HTTPException(status_code=404, detail="Display image not available.")

    try:
        bucket = supabase.storage.from_(STORAGE_BUCKET)
        image_bytes = bucket.download(display_path)
        if not image_bytes:
            raise HTTPException(status_code=404, detail="Image file not found.")

        return Response(
            content=image_bytes,
            media_type="image/webp",
            headers={
                "Content-Disposition": "inline",
                "Cache-Control": "public, max-age=86400",
                "X-Content-Type-Options": "nosniff",
            }
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to retrieve photo image.")


# ============================================================
# PATCH /gallery/{photo_id}/status  — Moderate Submission (Admin)
# ============================================================

class GalleryStatusUpdateRequest(BaseModel):
    status: str
    rejection_reason: Optional[str] = None

@router.patch("/{photo_id}/status")
def update_gallery_photo_status(
    photo_id: str,
    body: GalleryStatusUpdateRequest,
    current_user: dict = Depends(get_current_user),
):
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only administrators can approve or reject gallery photos.")

    if body.status not in {"approved", "rejected"}:
        raise HTTPException(status_code=400, detail="Status must be either 'approved' or 'rejected'.")

    res = supabase.table("gallery_photos").select("*").eq("id", photo_id).limit(1).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Photo not found.")

    photo = res.data[0]
    admin_id = str(current_user.get("user_id"))
    now_iso = datetime.now(timezone.utc).isoformat()

    updates = {
        "status": body.status,
        "reviewed_by": admin_id,
        "reviewed_at": now_iso,
        "rejection_reason": body.rejection_reason if body.status == "rejected" else None,
        "updated_at": now_iso,
    }

    supabase.table("gallery_photos").update(updates).eq("id", photo_id).execute()
    photo.update(updates)

    # In-app notification to uploader
    uploader_id = str(photo.get("uploader_id"))
    if body.status == "approved":
        create_notification_once(
            user_id=uploader_id,
            title="Gallery photo approved",
            message="Your photo submission was approved and is now displayed in the alumni gallery.",
            notification_type="gallery_approval",
            entity_type="gallery",
            entity_id=photo_id,
            dedupe_key=f"gallery_approval:{photo_id}",
        )
    else:
        reason_msg = f" Reason: {body.rejection_reason}" if body.rejection_reason else ""
        create_notification_once(
            user_id=uploader_id,
            title="Gallery photo not approved",
            message=f"Your gallery photo submission was not approved.{reason_msg}",
            notification_type="gallery_rejection",
            entity_type="gallery",
            entity_id=photo_id,
            dedupe_key=f"gallery_rejection:{photo_id}",
        )

    formatted = _format_photo_doc(photo, is_admin=True)
    return {
        "message": f"Photo marked as {body.status}.",
        "photo": formatted,
        **formatted,
    }


# ============================================================
# DELETE /gallery/{photo_id}  — Delete Photo (Admin or Owner)
# ============================================================

@router.delete("/{photo_id}")
def delete_gallery_photo(
    photo_id: str,
    current_user: dict = Depends(get_current_user),
):
    res = supabase.table("gallery_photos").select("*").eq("id", photo_id).limit(1).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Photo not found.")

    photo = res.data[0]
    user_id = str(current_user.get("user_id"))
    role = current_user.get("role")

    # Only admin or original uploader if still pending can delete
    if role != "admin" and not (str(photo.get("uploader_id")) == user_id and photo.get("status") == "pending"):
        raise HTTPException(status_code=403, detail="You do not have permission to delete this photo.")

    # Remove files from storage
    try:
        bucket = supabase.storage.from_(STORAGE_BUCKET)
        paths_to_delete = []
        if photo.get("original_path"):
            paths_to_delete.append(photo["original_path"])
        if photo.get("display_path"):
            paths_to_delete.append(photo["display_path"])
        if paths_to_delete:
            bucket.delete(paths_to_delete)
    except Exception as e:
        print("Warning: Failed to delete storage files for gallery item:", e)

    # Remove database record
    supabase.table("gallery_photos").delete().eq("id", photo_id).execute()

    return {"message": "Photo deleted successfully."}
