import os
from datetime import datetime, timezone
import json
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from database import users_collection
from security.dependencies import get_current_user
from services.notifications import NOTIFICATION_TYPES, create_notification_once


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
    if os.getenv("DATABASE_BACKEND", "mongodb").lower() == "supabase":
        try:
            from database_supabase import supabase
            res = supabase.table("events").select("*").order("date", desc=True).execute()
            events = []
            for row in res.data or []:
                e = dict(row)
                e["event_date"] = str(row.get("date", ""))
                e["start_date"] = str(row.get("date", ""))
                e["start_time"] = str(row.get("time", ""))
                events.append(e)
            return events
        except Exception as e:
            print("Error loading events from Supabase:", e)
            return []

    try:
        if EVENTS_FILE.exists():
            data = EVENTS_FILE.read_text(encoding="utf-8").strip()
            if data:
                return json.loads(data)
    except Exception:
        pass

    return []


def save_events(events: list[dict]):
    EVENTS_FILE.write_text(
        json.dumps(events, indent=2),
        encoding="utf-8"
    )


def _find_event(event_id: str) -> dict | None:
    for event in load_events():
        if str(event.get("id")) == str(event_id):
            return event

    return None


# ============================================================
# HELPERS — registrations
# ============================================================

def load_registrations() -> list[dict]:
    if os.getenv("DATABASE_BACKEND", "mongodb").lower() == "supabase":
        try:
            from database_supabase import supabase
            res = supabase.table("event_registrations").select("*").execute()
            regs = []
            for row in res.data or []:
                r = dict(row)
                regs.append(r)
            return regs
        except Exception as e:
            print("Error loading registrations from Supabase:", e)
            return []

    try:
        if REGISTRATIONS_FILE.exists():
            data = REGISTRATIONS_FILE.read_text(encoding="utf-8").strip()
            if data:
                return json.loads(data)
    except Exception:
        pass

    return []


def save_registrations(registrations: list[dict]):
    REGISTRATIONS_FILE.write_text(
        json.dumps(registrations, indent=2),
        encoding="utf-8"
    )


# ============================================================
# HELPERS — user resolution (string-safe)
# ============================================================

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
# GET /events  — List events
# ============================================================

@router.get("")
def get_events(
    current_user: dict = Depends(get_current_user),
):
    events = load_events()
    registrations = load_registrations()

    role = current_user.get("role")
    user_id = str(current_user.get("user_id"))

    # Compute registration stats
    reg_counts = {}
    user_registered = set()

    for reg in registrations:
        eid = str(reg.get("event_id"))
        reg_counts[eid] = reg_counts.get(eid, 0) + 1
        if str(reg.get("user_id")) == user_id:
            user_registered.add(eid)

    results = []

    for event in events:
        eid = str(event.get("id"))
        status = event.get("status")
        creator_id = str(event.get("created_by"))

        # Visibility: Admin sees all; non-admin sees approved or own events
        if role == "admin" or status == "approved" or creator_id == user_id:
            ev_copy = dict(event)
            # Ensure canonical event_date
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

    # Role permissions
    if role not in {"admin", "alumni", "student"}:
        raise HTTPException(
            status_code=403,
            detail="You do not have permission to create events."
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

    # Status determination:
    # Admin-created events are approved immediately
    # Alumni and Student created/suggested events start as pending
    initial_status = "approved" if role == "admin" else "pending"

    # Canonical event_date
    event_date = body.event_date or body.start_date

    event_document = {
        "id": str(uuid.uuid4()),
        "created_by": str(current_user.get("user_id")),
        "creator_name": user.get("name", "User"),
        "title": body.title,
        "description": body.description,
        "event_type": body.event_type,
        "location": body.location,
        "event_date": event_date,
        "start_date": event_date,
        "end_date": body.end_date,
        "start_time": body.start_time,
        "end_time": body.end_time,
        "registration_deadline": body.registration_deadline,
        "image_url": body.image_url,
        "tags": body.tags,
        "status": initial_status,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }

    events = load_events()
    events.append(event_document)
    save_events(events)

    if os.getenv("DATABASE_BACKEND", "mongodb").lower() == "supabase":
        try:
            from database_supabase import supabase
            event_date = event_document.get("event_date") or event_document.get("start_date") or datetime.now(timezone.utc).strftime("%Y-%m-%d")
            supabase.table("events").insert({
                "id": str(event_document["id"]),
                "created_by": str(event_document["created_by"]) if event_document.get("created_by") else None,
                "title": event_document.get("title", ""),
                "description": event_document.get("description", ""),
                "event_type": event_document.get("event_type", "general"),
                "date": event_date,
                "time": event_document.get("start_time", "00:00"),
                "location": event_document.get("location", "TBD"),
                "virtual_link": event_document.get("image_url", ""),
                "capacity": 100,
                "status": initial_status,
            }).execute()
        except Exception as e:
            print("Error inserting event into Supabase:", e)

    if initial_status == "pending":
        creator_id = str(event_document["created_by"])
        try:
            create_notification_once(
                user_id=creator_id,
                title="Event submitted for review",
                message=f'Your event "{event_document["title"]}" was submitted and is pending administrator review.',
                notification_type=NOTIFICATION_TYPES["event_submission"],
                entity_type="event",
                entity_id=str(event_document["id"]),
                dedupe_key=f"event_submission:{event_document['id']}",
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

    # Visibility check
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

            old_status = event.get("status")
            update_data = body.model_dump(exclude_none=True)

            for key, value in update_data.items():
                event[key] = value

            # Keep event_date and start_date in sync
            if "event_date" in update_data and update_data["event_date"]:
                event["start_date"] = update_data["event_date"]
            elif "start_date" in update_data and update_data["start_date"]:
                event["event_date"] = update_data["start_date"]

            event["updated_at"] = datetime.now(timezone.utc).isoformat()

            save_events(events)

            if os.getenv("DATABASE_BACKEND", "mongodb").lower() == "supabase":
                try:
                    from database_supabase import supabase
                    update_dict = {
                        "updated_at": datetime.now(timezone.utc).isoformat()
                    }
                    if "status" in update_data:
                        update_dict["status"] = update_data["status"]
                    if "title" in update_data:
                        update_dict["title"] = update_data["title"]
                    if "description" in update_data:
                        update_dict["description"] = update_data["description"]
                    if "location" in update_data:
                        update_dict["location"] = update_data["location"]
                    supabase.table("events").update(update_dict).eq("id", str(event_id)).execute()
                except Exception as e:
                    print("Error updating event in Supabase:", e)

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

            if os.getenv("DATABASE_BACKEND", "mongodb").lower() == "supabase":
                try:
                    from database_supabase import supabase
                    supabase.table("events").delete().eq("id", str(event_id)).execute()
                except Exception as e:
                    print("Error deleting event from Supabase:", e)

            # Cascade: also remove registrations for this event
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

    # Resolve user details
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

    user_name = user.get("name", "User")
    user_email = user.get("email", "")
    now_iso = datetime.now(timezone.utc).isoformat()

    registration = {
        "id": str(uuid.uuid4()),
        "event_id": str(event_id),
        "event_title": event.get("title", ""),
        "user_id": user_id,
        "user_name": user_name,
        "user_email": user_email,
        "user_role": current_user.get("role", ""),
        "registered_at": now_iso,
        "created_at": now_iso,
    }

    registrations.append(registration)
    save_registrations(registrations)

    if os.getenv("DATABASE_BACKEND", "mongodb").lower() == "supabase":
        try:
            from database_supabase import supabase
            supabase.table("event_registrations").insert({
                "id": str(registration.get("id") or uuid.uuid4()),
                "event_id": str(event_id),
                "user_id": str(user_id),
                "status": "registered",
            }).execute()
        except Exception as e:
            print("Error saving registration to Supabase:", e)

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

    for index, reg in enumerate(registrations):
        if (
            str(reg.get("event_id")) == str(event_id)
            and str(reg.get("user_id")) == user_id
        ):
            deleted_reg = registrations.pop(index)
            save_registrations(registrations)

            if os.getenv("DATABASE_BACKEND", "mongodb").lower() == "supabase":
                try:
                    from database_supabase import supabase
                    supabase.table("event_registrations").delete().eq("event_id", str(event_id)).eq("user_id", str(user_id)).execute()
                except Exception as e:
                    print("Error cancelling registration in Supabase:", e)

            return {
                "message": "Registration cancelled successfully.",
                "registration": deleted_reg,
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
        pass
    elif str(event.get("created_by")) == user_id:
        pass
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

