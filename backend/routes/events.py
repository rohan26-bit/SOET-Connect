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
    prefix="/events",
    tags=["Events"]
)


EVENTS_FILE = Path(__file__).resolve().parent.parent / "events_data.json"
REGISTRATIONS_FILE = (
    Path(__file__).resolve().parent.parent / "event_registrations_data.json"
)


# ============================================================
# VALID EVENT STATUSES
# ============================================================

VALID_EVENT_STATUSES = {"pending", "approved", "rejected", "cancelled"}


# ============================================================
# REQUEST MODELS
# ============================================================

class EventCreateRequest(BaseModel):
    title: str
    description: str
    event_type: str = ""
    location: str = ""
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
    try:
        if EVENTS_FILE.exists():
            return json.loads(
                EVENTS_FILE.read_text(encoding="utf-8")
            )
    except Exception:
        pass

    return []


def save_events(events: list[dict]):
    EVENTS_FILE.write_text(
        json.dumps(events, indent=2),
        encoding="utf-8"
    )


def _find_event(event_id: str) -> dict | None:
    """Return a single event dict by ID, or None."""
    for event in load_events():
        if str(event.get("id")) == str(event_id):
            return event

    return None


# ============================================================
# HELPERS — registrations
# ============================================================

def load_registrations() -> list[dict]:
    try:
        if REGISTRATIONS_FILE.exists():
            return json.loads(
                REGISTRATIONS_FILE.read_text(encoding="utf-8")
            )
    except Exception:
        pass

    return []


def save_registrations(registrations: list[dict]):
    REGISTRATIONS_FILE.write_text(
        json.dumps(registrations, indent=2),
        encoding="utf-8"
    )


# ============================================================
# HELPERS — user resolution
# ============================================================

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
# GET /events  — List events
# ============================================================

@router.get("")
def get_events(
    current_user: dict = Depends(get_current_user),
):
    events = load_events()
    role = current_user.get("role")
    user_id = str(current_user.get("user_id"))

    if role == "admin":
        # Admin sees everything
        return events

    # Non-admin users see approved events + their own events
    return [
        event for event in events
        if event.get("status") == "approved"
        or str(event.get("created_by")) == user_id
    ]


# ============================================================
# POST /events  — Create event (verified alumni or admin)
# ============================================================

@router.post("")
def create_event(
    body: EventCreateRequest,
    current_user: dict = Depends(get_current_user),
):
    role = current_user.get("role")

    # Only alumni and admin can create events
    if role not in {"alumni", "admin"}:
        raise HTTPException(
            status_code=403,
            detail="Only verified alumni and admin users can create events."
        )

    user = _resolve_user(current_user)

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
    if role == "alumni":
        if not user.get("is_verified", False):
            raise HTTPException(
                status_code=403,
                detail=(
                    "Your alumni account must be verified by an "
                    "administrator before creating events."
                )
            )

    # Admin-created events are approved immediately
    initial_status = "approved" if role == "admin" else "pending"

    event_document = {
        "id": str(uuid.uuid4()),
        "created_by": str(current_user.get("user_id")),
        "creator_name": user.get("name", "User"),
        "title": body.title,
        "description": body.description,
        "event_type": body.event_type,
        "location": body.location,
        "start_date": body.start_date,
        "end_date": body.end_date,
        "start_time": body.start_time,
        "end_time": body.end_time,
        "registration_deadline": body.registration_deadline,
        "image_url": body.image_url,
        "tags": body.tags,
        "status": initial_status,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    events = load_events()
    events.append(event_document)
    save_events(events)

    return {
        "message": "Event created successfully.",
        "event": event_document,
    }


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

    events = load_events()

    for event in events:
        if str(event.get("id")) == str(event_id):
            # Authorization: admin or event creator
            if role != "admin" and str(event.get("created_by")) != user_id:
                raise HTTPException(
                    status_code=403,
                    detail="You can only edit your own events."
                )

            # Non-admin users may not change the status field
            if body.status is not None and role != "admin":
                raise HTTPException(
                    status_code=403,
                    detail="Only admin can change event status."
                )

            # Validate status if provided
            if body.status is not None:
                if body.status not in VALID_EVENT_STATUSES:
                    raise HTTPException(
                        status_code=400,
                        detail=(
                            f"Invalid event status. Must be one of: "
                            f"{', '.join(sorted(VALID_EVENT_STATUSES))}."
                        )
                    )

            # Apply only the provided (non-None) fields
            update_data = body.model_dump(exclude_none=True)

            for key, value in update_data.items():
                event[key] = value

            event["updated_at"] = datetime.now(timezone.utc).isoformat()

            save_events(events)

            return {
                "message": "Event updated successfully.",
                "event": event,
            }

    raise HTTPException(
        status_code=404,
        detail="Event not found."
    )


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

    events = load_events()

    for index, event in enumerate(events):
        if str(event.get("id")) == str(event_id):
            # Authorization: admin or event creator
            if role != "admin" and str(event.get("created_by")) != user_id:
                raise HTTPException(
                    status_code=403,
                    detail="You can only delete your own events."
                )

            deleted_event = events.pop(index)
            save_events(events)

            # Also remove any registrations for this event
            registrations = load_registrations()
            registrations = [
                reg for reg in registrations
                if str(reg.get("event_id")) != str(event_id)
            ]
            save_registrations(registrations)

            return {
                "message": "Event deleted successfully.",
                "event": deleted_event,
            }

    raise HTTPException(
        status_code=404,
        detail="Event not found."
    )


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

    # Only approved events accept registrations
    if event.get("status") != "approved":
        raise HTTPException(
            status_code=400,
            detail="Registrations are only accepted for approved events."
        )

    # Enforce registration deadline when present
    deadline_str = event.get("registration_deadline")

    if deadline_str:
        try:
            # Support date-only ("2026-09-30") and full ISO strings
            deadline = datetime.fromisoformat(deadline_str)

            # Make deadline timezone-aware if it isn't already
            if deadline.tzinfo is None:
                deadline = deadline.replace(tzinfo=timezone.utc)

            if datetime.now(timezone.utc) > deadline:
                raise HTTPException(
                    status_code=400,
                    detail="Registration deadline has passed."
                )
        except ValueError:
            pass  # Unparseable deadline — skip enforcement

    registrations = load_registrations()
    user_id = str(current_user.get("user_id"))

    # Prevent duplicate registrations for same user + event
    for reg in registrations:
        if (
            str(reg.get("user_id")) == user_id
            and str(reg.get("event_id")) == str(event_id)
        ):
            raise HTTPException(
                status_code=400,
                detail="You have already registered for this event."
            )

    # Resolve user name from DB
    user = _resolve_user(current_user)
    if user and not user.get("is_active", True):
        raise HTTPException(
            status_code=403,
            detail="This account has been deactivated."
        )
    user_name = user.get("name", "User") if user else "User"

    registration = {
        "id": str(uuid.uuid4()),
        "event_id": str(event_id),
        "event_title": event.get("title", ""),
        "user_id": user_id,
        "user_name": user_name,
        "user_role": current_user.get("role", ""),
        "registered_at": datetime.now(timezone.utc).isoformat(),
    }

    registrations.append(registration)
    save_registrations(registrations)

    return {
        "message": "Registration successful.",
        "registration": registration,
    }


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
#   — Event owner or admin views registrations for an event
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

    # Admin can always view; event creator can view their own
    if role == "admin":
        pass  # allowed
    elif str(event.get("created_by")) == user_id:
        pass  # event owner
    else:
        raise HTTPException(
            status_code=403,
            detail="You do not have permission to view registrations for this event."
        )

    registrations = load_registrations()

    return [
        reg for reg in registrations
        if str(reg.get("event_id")) == str(event_id)
    ]
