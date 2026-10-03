import os
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from database import users_collection, supabase
from security.dependencies import get_current_user
from services.notifications import NOTIFICATION_TYPES, create_notification_once


router = APIRouter(
    prefix="/events",
    tags=["Events"]
)


# Legacy file attributes for test monkeypatch compatibility
EVENTS_FILE = None
REGISTRATIONS_FILE = None

VALID_EVENT_STATUSES = {"pending", "approved", "rejected", "cancelled", "completed"}


# ============================================================
# REQUEST MODELS
# ============================================================

class EventCreateRequest(BaseModel):
    title: str
    description: str
    event_type: str = ""
    location: str = ""
    event_date: str = ""
    start_date: str = ""
    end_date: str = ""
    start_time: str = ""
    end_time: str = ""
    registration_deadline: str | None = None
    image_url: str = ""
    tags: list[str] = []


class EventUpdateRequest(BaseModel):
    title: str | None = None
    description: str | None = None
    event_type: str | None = None
    location: str | None = None
    event_date: str | None = None
    start_date: str | None = None
    end_date: str | None = None
    start_time: str | None = None
    end_time: str | None = None
    registration_deadline: str | None = None
    image_url: str | None = None
    tags: list[str] | None = None
    status: str | None = None


# ============================================================
# HELPERS — events
# ============================================================

def load_events() -> list[dict]:
    """Load events directly from Supabase PostgreSQL events table."""
    try:
        res = supabase.table("events").select("*").order("date", desc=True).execute()
        events = []
        for row in res.data or []:
            e = dict(row)
            date_val = str(row.get("date", ""))
            e["event_date"] = date_val
            e["start_date"] = date_val
            e["start_time"] = str(row.get("time", ""))
            e["registration_deadline"] = row.get("registration_deadline")
            if not e.get("creator_name") and e.get("created_by"):
                u = users_collection.find_one({"_id": str(e["created_by"])})
                if u:
                    e["creator_name"] = u.get("name", "User")
            events.append(e)
        return events
    except Exception as e:
        print("Error loading events from Supabase:", e)
        return []


def _find_event(event_id: str) -> dict | None:
    for event in load_events():
        if str(event.get("id")) == str(event_id):
            return event
    return None


# ============================================================
# HELPERS — registrations
# ============================================================

def load_registrations() -> list[dict]:
    """Load registrations directly from Supabase PostgreSQL event_registrations table."""
    try:
        res = supabase.table("event_registrations").select("*").execute()
        regs = []
        for row in res.data or []:
            r = dict(row)
            if not r.get("created_at") and r.get("registered_at"):
                r["created_at"] = r["registered_at"]
            if not r.get("user_name") and r.get("user_id"):
                u = users_collection.find_one({"_id": str(r["user_id"])})
                if u:
                    r["user_name"] = u.get("name", "User")
                    r["name"] = u.get("name", "User")
                    r["user_email"] = u.get("email", "")
                    r["email"] = u.get("email", "")
                    r["user_role"] = u.get("role", "")
            regs.append(r)
        return regs
    except Exception as e:
        print("Error loading registrations from Supabase:", e)
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
# GET /events  — List events with role-based visibility
# ============================================================

@router.get("")
def get_events(
    current_user: dict = Depends(get_current_user),
):
    role = current_user.get("role")
    user_id = str(current_user.get("user_id"))

    events = load_events()
    registrations = load_registrations()

    # Pre-calculate registration counts per event
    reg_counts = {}
    user_registered = set()

    for r in registrations:
        eid = str(r.get("event_id"))
        reg_counts[eid] = reg_counts.get(eid, 0) + 1
        if str(r.get("user_id")) == user_id:
            user_registered.add(eid)

    results = []

    for event in events:
        eid = str(event.get("id"))
        status = event.get("status")
        creator_id = str(event.get("created_by"))

        # Visibility: Admin sees all; non-admin sees approved or own events
        if role == "admin" or status == "approved" or creator_id == user_id:
            ev_copy = dict(event)
            if not ev_copy.get("event_date") and ev_copy.get("start_date"):
                ev_copy["event_date"] = ev_copy["start_date"]

            ev_copy["registration_count"] = reg_counts.get(eid, 0)
            ev_copy["is_registered"] = eid in user_registered
            results.append(ev_copy)

    return results


# ============================================================
# POST /events  — Create or suggest event
# ============================================================

@router.post("")
def create_event(
    body: EventCreateRequest,
    current_user: dict = Depends(get_current_user),
):
    role = current_user.get("role")

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

    if role not in {"admin", "alumni", "student"}:
        raise HTTPException(
            status_code=403,
            detail="You do not have permission to create events."
        )

    if role == "alumni":
        if not user.get("is_verified", False):
            raise HTTPException(
                status_code=403,
                detail="Your alumni account must be verified by an administrator before creating events."
            )

    initial_status = "approved" if role == "admin" else "pending"
    event_date = body.event_date or body.start_date or datetime.now(timezone.utc).strftime("%Y-%m-%d")

    event_id = str(uuid.uuid4())
    user_id = str(current_user.get("user_id"))
    now_iso = datetime.now(timezone.utc).isoformat()

    event_row = {
        "id": event_id,
        "created_by": user_id,
        "title": body.title,
        "description": body.description,
        "event_type": body.event_type or "general",
        "date": event_date,
        "time": body.start_time or "00:00",
        "location": body.location or "TBD",
        "virtual_link": body.image_url or "",
        "capacity": 100,
        "status": initial_status,
        "created_at": now_iso,
        "updated_at": now_iso,
    }
    if os.getenv("DATABASE_MODE", "").lower() == "mock" and body.registration_deadline:
        event_row["registration_deadline"] = body.registration_deadline

    supabase.table("events").insert(event_row).execute()

    event_document = {
        **event_row,
        "creator_name": user.get("name", "User"),
        "event_date": event_date,
        "start_date": event_date,
        "end_date": body.end_date,
        "start_time": body.start_time,
        "end_time": body.end_time,
        "registration_deadline": body.registration_deadline,
        "image_url": body.image_url,
        "tags": body.tags,
    }

    if initial_status == "pending":
        try:
            create_notification_once(
                user_id=user_id,
                title="Event submitted for review",
                message=f'Your event "{body.title}" was submitted and is pending administrator review.',
                notification_type=NOTIFICATION_TYPES["event_submission"],
                entity_type="event",
                entity_id=event_id,
                dedupe_key=f"event_submission:{event_id}",
            )
        except Exception:
            pass

    return {
        "message": "Event created successfully.",
        "event": event_document,
    }


# ============================================================
# GET /events/{event_id}  — View single event details
# ============================================================

@router.get("/{event_id}")
def get_event_details(
    event_id: str,
    current_user: dict = Depends(get_current_user),
):
    event = _find_event(event_id)

    if not event:
        raise HTTPException(
            status_code=404,
            detail="Event not found."
        )

    role = current_user.get("role")
    user_id = str(current_user.get("user_id"))

    if (
        role != "admin"
        and event.get("status") != "approved"
        and str(event.get("created_by")) != user_id
    ):
        raise HTTPException(
            status_code=404,
            detail="Event not found."
        )

    registrations = load_registrations()
    reg_count = sum(
        1 for r in registrations if str(r.get("event_id")) == str(event_id)
    )
    is_reg = any(
        str(r.get("event_id")) == str(event_id)
        and str(r.get("user_id")) == user_id
        for r in registrations
    )

    ev_copy = dict(event)
    if not ev_copy.get("event_date") and ev_copy.get("start_date"):
        ev_copy["event_date"] = ev_copy["start_date"]

    ev_copy["registration_count"] = reg_count
    ev_copy["is_registered"] = is_reg

    return ev_copy


# ============================================================
# PATCH /events/{event_id}  — Update event
# ============================================================

@router.patch("/{event_id}")
def update_event(
    event_id: str,
    body: EventUpdateRequest,
    current_user: dict = Depends(get_current_user),
):
    role = current_user.get("role")
    user_id = str(current_user.get("user_id"))

    res = supabase.table("events").select("*").eq("id", str(event_id)).limit(1).execute()
    if not res.data:
        raise HTTPException(
            status_code=404,
            detail="Event not found."
        )

    event = res.data[0]

    if role != "admin" and str(event.get("created_by")) != user_id:
        raise HTTPException(
            status_code=403,
            detail="You can only edit your own events."
        )

    if body.status is not None and role != "admin":
        raise HTTPException(
            status_code=403,
            detail="Only admin can change event status."
        )

    if body.status is not None and body.status not in VALID_EVENT_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid event status. Must be one of: {', '.join(sorted(VALID_EVENT_STATUSES))}."
        )

    old_status = event.get("status")
    update_data = body.model_dump(exclude_none=True)
    now_iso = datetime.now(timezone.utc).isoformat()

    db_updates = {"updated_at": now_iso}
    if "status" in update_data:
        db_updates["status"] = update_data["status"]
    if "title" in update_data:
        db_updates["title"] = update_data["title"]
    if "description" in update_data:
        db_updates["description"] = update_data["description"]
    if "location" in update_data:
        db_updates["location"] = update_data["location"]
    if "event_type" in update_data:
        db_updates["event_type"] = update_data["event_type"]
    if "event_date" in update_data:
        db_updates["date"] = update_data["event_date"]
    elif "start_date" in update_data:
        db_updates["date"] = update_data["start_date"]
    if "start_time" in update_data:
        db_updates["time"] = update_data["start_time"]

    supabase.table("events").update(db_updates).eq("id", str(event_id)).execute()

    for k, v in update_data.items():
        event[k] = v
    event["updated_at"] = now_iso

    new_status = update_data.get("status")
    if new_status is not None and old_status != new_status:
        creator_id = str(event.get("created_by"))
        event_title = event.get("title", "")
        if new_status == "approved":
            try:
                create_notification_once(
                    user_id=creator_id,
                    title="Event approved",
                    message=f'Your event "{event_title}" has been approved.',
                    notification_type=NOTIFICATION_TYPES["event_approval"],
                    entity_type="event",
                    entity_id=str(event_id),
                    dedupe_key=f"event_approval:{event_id}",
                )
            except Exception:
                pass
        elif new_status == "rejected":
            try:
                create_notification_once(
                    user_id=creator_id,
                    title="Event rejected",
                    message=f'Your event "{event_title}" was not approved.',
                    notification_type=NOTIFICATION_TYPES["event_rejection"],
                    entity_type="event",
                    entity_id=str(event_id),
                    dedupe_key=f"event_rejection:{event_id}",
                )
            except Exception:
                pass
        elif new_status == "cancelled":
            registrations = load_registrations()
            reg_user_ids = {
                str(r.get("user_id")) for r in registrations
                if str(r.get("event_id")) == str(event_id) and r.get("user_id")
            }
            for uid in reg_user_ids:
                try:
                    create_notification_once(
                        user_id=uid,
                        title="Event cancelled",
                        message=f'The event "{event_title}" has been cancelled.',
                        notification_type=NOTIFICATION_TYPES["event_cancellation"],
                        entity_type="event",
                        entity_id=str(event_id),
                        dedupe_key=f"event_cancellation:{event_id}:{uid}",
                    )
                except Exception:
                    pass

    return {
        "message": "Event updated successfully.",
        "event": event,
    }


# ============================================================
# DELETE /events/{event_id}  — Delete event
# ============================================================

@router.delete("/{event_id}")
def delete_event(
    event_id: str,
    current_user: dict = Depends(get_current_user),
):
    role = current_user.get("role")
    user_id = str(current_user.get("user_id"))

    res = supabase.table("events").select("*").eq("id", str(event_id)).limit(1).execute()
    if not res.data:
        raise HTTPException(
            status_code=404,
            detail="Event not found."
        )

    target_event = res.data[0]
    if role != "admin" and str(target_event.get("created_by")) != user_id:
        raise HTTPException(
            status_code=403,
            detail="You can only delete your own events."
        )

    supabase.table("events").delete().eq("id", str(event_id)).execute()
    supabase.table("event_registrations").delete().eq("event_id", str(event_id)).execute()

    return {
        "message": "Event deleted successfully.",
        "event": target_event,
    }


# ============================================================
# POST /events/{event_id}/register  — Register for an event
# ============================================================

@router.post("/{event_id}/register")
def register_for_event(
    event_id: str,
    current_user: dict = Depends(get_current_user),
):
    event = _find_event(event_id)

    if not event:
        raise HTTPException(
            status_code=404,
            detail="Event not found."
        )

    if event.get("status") != "approved":
        raise HTTPException(
            status_code=400,
            detail="Registrations are only accepted for approved events."
        )

    deadline_str = event.get("registration_deadline")
    if deadline_str:
        try:
            deadline = datetime.fromisoformat(deadline_str)
            if deadline.tzinfo is None:
                deadline = deadline.replace(tzinfo=timezone.utc)

            if datetime.now(timezone.utc) > deadline:
                raise HTTPException(
                    status_code=400,
                    detail="Registration deadline has passed."
                )
        except ValueError:
            pass

    user_id = str(current_user.get("user_id"))
    registrations = load_registrations()

    for reg in registrations:
        if (
            str(reg.get("user_id")) == user_id
            and str(reg.get("event_id")) == str(event_id)
        ):
            raise HTTPException(
                status_code=400,
                detail="You have already registered for this event."
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

    reg_id = str(uuid.uuid4())
    now_iso = datetime.now(timezone.utc).isoformat()

    supabase.table("event_registrations").insert({
        "id": reg_id,
        "event_id": str(event_id),
        "user_id": user_id,
        "status": "registered",
        "registered_at": now_iso,
    }).execute()

    registration = {
        "id": reg_id,
        "event_id": str(event_id),
        "event_title": event.get("title", ""),
        "user_id": user_id,
        "user_name": user.get("name", "User"),
        "user_email": user.get("email", ""),
        "user_role": current_user.get("role", ""),
        "registered_at": now_iso,
        "created_at": now_iso,
    }

    try:
        create_notification_once(
            user_id=user_id,
            title="Event registration confirmed",
            message=f'You have successfully registered for "{event.get("title", "")}".',
            notification_type=NOTIFICATION_TYPES["event_registration"],
            entity_type="event",
            entity_id=str(event_id),
            dedupe_key=f"event_registration:{event_id}:{user_id}",
        )
    except Exception:
        pass

    return {
        "message": "Registration successful.",
        "registration": registration,
    }


# ============================================================
# DELETE /events/{event_id}/register  — Cancel own registration
# ============================================================

@router.delete("/{event_id}/register")
def cancel_event_registration(
    event_id: str,
    current_user: dict = Depends(get_current_user),
):
    user_id = str(current_user.get("user_id"))
    registrations = load_registrations()

    for reg in registrations:
        if (
            str(reg.get("event_id")) == str(event_id)
            and str(reg.get("user_id")) == user_id
        ):
            supabase.table("event_registrations").delete().eq("event_id", str(event_id)).eq("user_id", user_id).execute()

            return {
                "message": "Registration cancelled successfully.",
                "registration": reg,
            }

    raise HTTPException(
        status_code=404,
        detail="Registration not found."
    )


# ============================================================
# GET /events/registrations/me  — View own registrations
# ============================================================

@router.get("/registrations/me")
def get_my_registrations(
    current_user: dict = Depends(get_current_user),
):
    user_id = str(current_user.get("user_id"))
    registrations = load_registrations()

    return [
        reg for reg in registrations
        if str(reg.get("user_id")) == user_id
    ]


# ============================================================
# GET /events/{event_id}/registrations
# ============================================================

@router.get("/{event_id}/registrations")
def get_event_registrations(
    event_id: str,
    current_user: dict = Depends(get_current_user),
):
    role = current_user.get("role")
    user_id = str(current_user.get("user_id"))

    event = _find_event(event_id)
    if not event:
        raise HTTPException(
            status_code=404,
            detail="Event not found."
        )

    if role != "admin" and str(event.get("created_by")) != user_id:
        raise HTTPException(
            status_code=403,
            detail="You do not have permission to view registrations for this event."
        )

    registrations = load_registrations()
    return [
        reg for reg in registrations
        if str(reg.get("event_id")) == str(event_id)
    ]
