import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

import pytest
from fastapi.testclient import TestClient

from main import app
from database import users_collection
from security.jwt import create_access_token
import routes.events as events_module


client = TestClient(app)


# Setup test users
def _get_or_create_user(uid: str, name: str, email: str, role: str, is_verified: bool = True):
    user = users_collection.find_one({"_id": uid})
    if not user:
        user = {
            "_id": uid,
            "name": name,
            "email": email,
            "role": role,
            "is_active": True,
            "is_verified": is_verified,
            "verification_status": "approved" if is_verified else "pending",
        }
        users_collection.insert_one(user)
    return user


def setup_test_users():
    student = _get_or_create_user("demo-student-id", "Demo Student", "test@student.com", "student", True)
    student2 = _get_or_create_user("student-2-id", "Second Student", "student2@student.com", "student", True)
    alumni_ver = _get_or_create_user("demo-alumni-id", "Demo Alumni", "test@alumni.com", "alumni", True)
    alumni_unver = _get_or_create_user("unverified-alumni-id", "Unverified Alumni", "unver@alumni.com", "alumni", False)
    admin = _get_or_create_user("demo-admin-id", "Demo Admin", "test@admin.com", "admin", True)

    tokens = {
        "student": create_access_token("demo-student-id", "student"),
        "student2": create_access_token("student-2-id", "student"),
        "alumni_ver": create_access_token("demo-alumni-id", "alumni"),
        "alumni_unver": create_access_token("unverified-alumni-id", "alumni"),
        "admin": create_access_token("demo-admin-id", "admin"),
    }
    headers = {k: {"Authorization": f"Bearer {v}"} for k, v in tokens.items()}
    return headers


@pytest.fixture(autouse=True)
def clean_events_data(tmp_path, monkeypatch):
    """Isolate events and registrations in a temporary directory per test."""
    test_events_file = tmp_path / "events_data.json"
    test_reg_file = tmp_path / "event_registrations_data.json"
    test_events_file.write_text("[]", encoding="utf-8")
    test_reg_file.write_text("[]", encoding="utf-8")

    monkeypatch.setattr(events_module, "EVENTS_FILE", test_events_file)
    monkeypatch.setattr(events_module, "REGISTRATIONS_FILE", test_reg_file)


# ============================================================
# TESTS
# ============================================================

def test_student_event_suggestion():
    """Students can suggest/create an event, which starts as pending."""
    headers = setup_test_users()
    payload = {
        "title": "Student AI Workshop",
        "description": "Workshop suggested by students",
        "event_date": "2026-11-20",
        "start_time": "14:00",
        "location": "Auditorium",
        "event_type": "Workshop",
    }
    res = client.post("/events", json=payload, headers=headers["student"])
    assert res.status_code == 200
    data = res.json()["event"]
    assert data["title"] == "Student AI Workshop"
    assert data["status"] == "pending"
    assert data["created_by"] == "demo-student-id"
    assert data["event_date"] == "2026-11-20"


def test_verified_alumni_event_creation():
    """Verified alumni can create an event, which starts as pending."""
    headers = setup_test_users()
    payload = {
        "title": "Alumni Career Talk",
        "description": "Talk by industry alumni",
        "event_date": "2026-12-05",
        "location": "Seminar Hall",
    }
    res = client.post("/events", json=payload, headers=headers["alumni_ver"])
    assert res.status_code == 200
    data = res.json()["event"]
    assert data["status"] == "pending"
    assert data["created_by"] == "demo-alumni-id"


def test_unverified_alumni_rejection():
    """Unverified alumni cannot create events (403)."""
    headers = setup_test_users()
    payload = {
        "title": "Unverified Event",
        "description": "Desc",
        "event_date": "2026-12-10",
        "location": "Online",
    }
    res = client.post("/events", json=payload, headers=headers["alumni_unver"])
    assert res.status_code == 403
    assert "must be verified" in res.json().get("detail", "")


def test_admin_event_creation():
    """Admin-created events start immediately as approved."""
    headers = setup_test_users()
    payload = {
        "title": "Annual SOET Gala",
        "description": "Official college gala",
        "event_date": "2026-12-25",
        "location": "Main Lawn",
    }
    res = client.post("/events", json=payload, headers=headers["admin"])
    assert res.status_code == 200
    data = res.json()["event"]
    assert data["status"] == "approved"
    assert data["created_by"] == "demo-admin-id"


def test_event_visibility_rules():
    """Admin sees all events; non-admin sees approved events + own pending events."""
    headers = setup_test_users()
    # Keep the approved event in the future so this test remains valid over time.
    future_event_date = (datetime.now(timezone.utc) + timedelta(days=30)).date().isoformat()

    # Student creates pending event
    client.post("/events", json={"title": "Stu Pending", "description": "D", "event_date": future_event_date}, headers=headers["student"])
    # Alumni creates pending event
    client.post("/events", json={"title": "Alu Pending", "description": "D", "event_date": future_event_date}, headers=headers["alumni_ver"])
    # Admin creates approved event
    client.post("/events", json={"title": "Admin Approved", "description": "D", "event_date": future_event_date}, headers=headers["admin"])

    # Student 1 sees: Admin Approved + Stu Pending (own) = 2
    res_stu1 = client.get("/events", headers=headers["student"])
    assert res_stu1.status_code == 200
    assert len(res_stu1.json()) == 2
    titles_stu1 = [e["title"] for e in res_stu1.json()]
    assert "Admin Approved" in titles_stu1
    assert "Stu Pending" in titles_stu1

    # Student 2 sees: only Admin Approved = 1
    res_stu2 = client.get("/events", headers=headers["student2"])
    assert res_stu2.status_code == 200
    assert len(res_stu2.json()) == 1
    assert res_stu2.json()[0]["title"] == "Admin Approved"

    # Admin sees: all 3 events
    res_admin = client.get("/events", headers=headers["admin"])
    assert res_admin.status_code == 200
    assert len(res_admin.json()) == 3


def test_approval_and_status_rules():
    """Admin can change event status; non-admin receives 403 on status changes."""
    headers = setup_test_users()
    # Student creates pending event
    res_create = client.post("/events", json={"title": "To Approve", "description": "D", "event_date": "2026-11-01"}, headers=headers["student"])
    event_id = res_create.json()["event"]["id"]

    # Student tries to approve own event -> 403
    res_hack = client.patch(f"/events/{event_id}", json={"status": "approved"}, headers=headers["student"])
    assert res_hack.status_code == 403
    assert "Only admin can change event status" in res_hack.json().get("detail", "")

    # Admin approves event -> 200
    res_approve = client.patch(f"/events/{event_id}", json={"status": "approved"}, headers=headers["admin"])
    assert res_approve.status_code == 200
    assert res_approve.json()["event"]["status"] == "approved"

    # Invalid status rejected -> 400
    res_invalid = client.patch(f"/events/{event_id}", json={"status": "fake_status"}, headers=headers["admin"])
    assert res_invalid.status_code == 400


def test_event_registration():
    """Users can register for approved events; registration info is stored."""
    headers = setup_test_users()
    res_create = client.post("/events", json={"title": "Approved Hackathon", "description": "D", "event_date": "2026-11-15"}, headers=headers["admin"])
    event_id = res_create.json()["event"]["id"]

    res_reg = client.post(f"/events/{event_id}/register", headers=headers["student"])
    assert res_reg.status_code == 200
    reg = res_reg.json()["registration"]
    assert reg["event_id"] == event_id
    assert reg["user_id"] == "demo-student-id"
    assert reg["user_name"] == "Demo Student"
    assert reg["user_email"] == "test@student.com"


def test_registration_pending_event_rejected():
    """Registration for pending events is rejected (400)."""
    headers = setup_test_users()
    res_create = client.post("/events", json={"title": "Pending Event", "description": "D", "event_date": "2026-11-15"}, headers=headers["student"])
    event_id = res_create.json()["event"]["id"]

    res_reg = client.post(f"/events/{event_id}/register", headers=headers["student2"])
    assert res_reg.status_code == 400
    assert "only accepted for approved events" in res_reg.json().get("detail", "")


def test_duplicate_registration_prevented():
    """Same user registering twice for the same event is rejected (400)."""
    headers = setup_test_users()
    res_create = client.post("/events", json={"title": "Approved Seminar", "description": "D", "event_date": "2026-11-15"}, headers=headers["admin"])
    event_id = res_create.json()["event"]["id"]

    res_reg1 = client.post(f"/events/{event_id}/register", headers=headers["student"])
    assert res_reg1.status_code == 200

    res_reg2 = client.post(f"/events/{event_id}/register", headers=headers["student"])
    assert res_reg2.status_code == 400
    assert "already registered" in res_reg2.json().get("detail", "")


def test_registration_cancellation():
    """Users can cancel their own registration; non-existent registration returns 404."""
    headers = setup_test_users()
    res_create = client.post("/events", json={"title": "Cancellable Event", "description": "D", "event_date": "2026-11-15"}, headers=headers["admin"])
    event_id = res_create.json()["event"]["id"]

    # Register
    client.post(f"/events/{event_id}/register", headers=headers["student"])

    # Cancel registration
    res_del = client.delete(f"/events/{event_id}/register", headers=headers["student"])
    assert res_del.status_code == 200
    assert "cancelled successfully" in res_del.json().get("message", "")

    # Cancel again -> 404
    res_del_again = client.delete(f"/events/{event_id}/register", headers=headers["student"])
    assert res_del_again.status_code == 404


def test_registration_deadline():
    """Registration after deadline has passed is rejected (400)."""
    headers = setup_test_users()
    past_deadline = (datetime.now(timezone.utc) - timedelta(days=2)).isoformat()
    res_create = client.post("/events", json={
        "title": "Expired Deadline Event",
        "description": "D",
        "event_date": "2026-11-15",
        "registration_deadline": past_deadline
    }, headers=headers["admin"])
    event_id = res_create.json()["event"]["id"]

    res_reg = client.post(f"/events/{event_id}/register", headers=headers["student"])
    assert res_reg.status_code == 400
    assert "deadline has passed" in res_reg.json().get("detail", "")


def test_attendee_authorization_and_details():
    """Admin and event creator can view registrations; others receive 403. Email is included."""
    headers = setup_test_users()
    res_create = client.post("/events", json={"title": "Alumni Meet", "description": "D", "event_date": "2026-11-15"}, headers=headers["admin"])
    event_id = res_create.json()["event"]["id"]

    # Student registers
    client.post(f"/events/{event_id}/register", headers=headers["student"])

    # Admin views attendees -> 200
    res_admin = client.get(f"/events/{event_id}/registrations", headers=headers["admin"])
    assert res_admin.status_code == 200
    attendees = res_admin.json()
    assert len(attendees) == 1
    assert attendees[0]["user_name"] == "Demo Student"
    assert attendees[0]["user_email"] == "test@student.com"
    assert "created_at" in attendees[0]

    # Non-creator alumni tries to view -> 403
    res_other = client.get(f"/events/{event_id}/registrations", headers=headers["alumni_ver"])
    assert res_other.status_code == 403


def test_update_and_delete_authorization():
    """Only owner and admin can update or delete event; unauthorized receives 403."""
    headers = setup_test_users()
    res_create = client.post("/events", json={"title": "Initial", "description": "D", "event_date": "2026-11-15"}, headers=headers["student"])
    event_id = res_create.json()["event"]["id"]

    # Other student cannot edit -> 403
    res_hack = client.patch(f"/events/{event_id}", json={"title": "Hacked"}, headers=headers["student2"])
    assert res_hack.status_code == 403

    # Creator can edit -> 200
    res_edit = client.patch(f"/events/{event_id}", json={"title": "Updated Title"}, headers=headers["student"])
    assert res_edit.status_code == 200
    assert res_edit.json()["event"]["title"] == "Updated Title"

    # Other student cannot delete -> 403
    res_del_hack = client.delete(f"/events/{event_id}", headers=headers["student2"])
    assert res_del_hack.status_code == 403

    # Creator can delete -> 200
    res_del = client.delete(f"/events/{event_id}", headers=headers["student"])
    assert res_del.status_code == 200


def test_registration_cleanup_after_delete():
    """Deleting an event notifies active attendees and cleans up registrations."""
    from services.notifications import NOTIFICATION_TYPES

    headers = setup_test_users()
    res_create = client.post(
        "/events",
        json={"title": "Event To Delete", "description": "D", "event_date": "2026-11-15"},
        headers=headers["admin"],
    )
    assert res_create.status_code == 200
    event_id = res_create.json()["event"]["id"]

    client.post(f"/events/{event_id}/register", headers=headers["student"])
    client.post(f"/events/{event_id}/register", headers=headers["student2"])
    assert len(events_module.load_registrations()) == 2

    # Delete event: both registrants must be told their registrations were cancelled.
    deleted = client.delete(f"/events/{event_id}", headers=headers["admin"])
    assert deleted.status_code == 200

    for attendee_key in ("student", "student2"):
        notes = client.get("/notifications", headers=headers[attendee_key]).json()
        deletion_notes = [
            note for note in notes
            if note.get("entity_id") == event_id
            and note.get("type") == NOTIFICATION_TYPES["event_cancellation"]
        ]
        assert len(deletion_notes) == 1
        assert deletion_notes[0]["title"] == "Event deleted"
        assert "Your registration has been cancelled" in deletion_notes[0]["message"]

    # The event owner/admin and unrelated users are not notified.
    assert client.get("/notifications", headers=headers["admin"]).json() == []
    assert len(events_module.load_registrations()) == 0
    assert client.delete(f"/events/{event_id}", headers=headers["admin"]).status_code == 404


def test_get_events_includes_counts_and_is_registered():
    """GET /events attaches registration_count and is_registered reflecting user status."""
    headers = setup_test_users()
    res_create = client.post("/events", json={"title": "Counting Event", "description": "D", "event_date": "2026-11-15"}, headers=headers["admin"])
    event_id = res_create.json()["event"]["id"]

    # Student 1 registers
    client.post(f"/events/{event_id}/register", headers=headers["student"])

    # Student 1 inspects list: count=1, is_registered=True
    res1 = client.get("/events", headers=headers["student"])
    ev1 = next(e for e in res1.json() if e["id"] == event_id)
    assert ev1["registration_count"] == 1
    assert ev1["is_registered"] is True

    # Student 2 inspects list: count=1, is_registered=False
    res2 = client.get("/events", headers=headers["student2"])
    ev2 = next(e for e in res2.json() if e["id"] == event_id)
    assert ev2["registration_count"] == 1
    assert ev2["is_registered"] is False


def test_deleted_user_jwt_rejected_from_event_registration():
    """Deleted or nonexistent user with otherwise valid JWT is rejected from event registration."""
    headers = setup_test_users()
    # 1. Existing valid user -> write succeeds
    res_create = client.post(
        "/events",
        json={"title": "Hardening Event", "description": "Desc", "event_date": "2026-11-20"},
        headers=headers["admin"],
    )
    assert res_create.status_code == 200
    event_id = res_create.json()["event"]["id"]

    res_reg_valid = client.post(f"/events/{event_id}/register", headers=headers["student"])
    assert res_reg_valid.status_code == 200

    # 2. Deleted user with otherwise valid JWT -> write is rejected (404)
    users_collection.delete_one({"_id": "student-2-id"})
    res_reg_deleted = client.post(f"/events/{event_id}/register", headers=headers["student2"])
    assert res_reg_deleted.status_code == 404
    assert "not found" in res_reg_deleted.json().get("detail", "").lower()

    # Nonexistent user with valid JWT signature -> write is rejected (404)
    from bson import ObjectId
    ghost_token = create_access_token(str(ObjectId()), "student")
    ghost_headers = {"Authorization": f"Bearer {ghost_token}"}
    res_reg_ghost = client.post(f"/events/{event_id}/register", headers=ghost_headers)
    assert res_reg_ghost.status_code == 404
    assert "not found" in res_reg_ghost.json().get("detail", "").lower()

    # 3. Unauthorized user attempting another user's protected resource -> remains rejected (403)
    res_delete_unauth = client.delete(f"/events/{event_id}", headers=headers["student"])
    assert res_delete_unauth.status_code == 403



def test_past_events_are_hidden_from_students_and_alumni_but_retained_for_admin():
    """Past events leave non-admin feeds immediately and remain in admin for 30 days."""
    from datetime import date

    headers = setup_test_users()
    past_date = (date.today() - timedelta(days=35)).isoformat()
    created = client.post(
        "/events",
        json={
            "title": "Expired Campus Workshop",
            "description": "Past event for retention test.",
            "event_date": past_date,
            "location": "Auditorium",
        },
        headers=headers["admin"],
    )
    assert created.status_code == 200
    event_id = created.json()["event"]["id"]

    student_feed = client.get("/events", headers=headers["student"])
    alumni_feed = client.get("/events", headers=headers["alumni_ver"])
    admin_feed = client.get("/events", headers=headers["admin"])

    assert student_feed.status_code == 200
    assert alumni_feed.status_code == 200
    assert all(event["id"] != event_id for event in student_feed.json())
    assert all(event["id"] != event_id for event in alumni_feed.json())

    retained = next(event for event in admin_feed.json() if event["id"] == event_id)
    assert retained["is_expired"] is True
    assert retained["is_past"] is True
    assert retained["expired_at"]
    assert retained["auto_delete_at"]
    assert retained["days_until_auto_delete"] == 0


def test_expired_event_is_hidden_from_its_creator_but_past_event_remains_admin_visible():
    from datetime import date

    headers = setup_test_users()
    past_date = (date.today() - timedelta(days=2)).isoformat()
    created = client.post(
        "/events",
        json={
            "title": "Creator's Past Event",
            "description": "Past event owned by student.",
            "event_date": past_date,
            "location": "Seminar Hall",
        },
        headers=headers["student"],
    )
    assert created.status_code == 200
    event_id = created.json()["event"]["id"]

    creator_feed = client.get(
        f"/events?created_by=demo-student-id",
        headers=headers["student"],
    )
    admin_feed = client.get("/events", headers=headers["admin"])

    assert creator_feed.status_code == 200
    assert all(event["id"] != event_id for event in creator_feed.json())
    assert any(event["id"] == event_id for event in admin_feed.json())


def test_closed_registration_does_not_expire_future_event():
    """An event with a past registration deadline remains in active feeds until its date passes."""
    from datetime import date

    headers = setup_test_users()
    future_date = (date.today() + timedelta(days=5)).isoformat()
    past_registration_deadline = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
    created = client.post(
        "/events",
        json={
            "title": "Upcoming Event with Closed Registration",
            "description": "Registration is closed but event is upcoming.",
            "event_date": future_date,
            "registration_deadline": past_registration_deadline,
            "location": "Auditorium",
        },
        headers=headers["admin"],
    )
    assert created.status_code == 200
    event_id = created.json()["event"]["id"]

    student_feed = client.get("/events", headers=headers["student"])
    event = next(item for item in student_feed.json() if item["id"] == event_id)
    assert event["is_expired"] is False
    assert event["is_past"] is False
    assert event["is_registration_closed"] is True


def test_event_metadata_is_persisted_and_returned():
    """Organizer, schedule end, visibility, tags and capacity survive API reloads."""
    headers = setup_test_users()
    future_date = (datetime.now(timezone.utc) + timedelta(days=30)).date().isoformat()
    end_date = (datetime.now(timezone.utc) + timedelta(days=31)).date().isoformat()
    response = client.post(
        "/events",
        json={
            "title": "SOET Industry Connect",
            "description": "Industry event with complete metadata.",
            "event_date": future_date,
            "end_date": end_date,
            "start_time": "09:30",
            "end_time": "16:00",
            "organizer": "SOET Placement Cell",
            "visibility": "students_only",
            "capacity": 75,
            "tags": ["Industry", "Career", "Industry"],
        },
        headers=headers["admin"],
    )
    assert response.status_code == 200
    event_id = response.json()["event"]["id"]

    saved = events_module._find_event(event_id)
    assert saved["organizer"] == "SOET Placement Cell"
    assert saved["end_date"] == end_date
    assert saved["end_time"] == "16:00"
    assert saved["visibility"] == "students_only"
    assert saved["capacity"] == 75
    assert saved["tags"] == ["Industry", "Career"]


def test_event_visibility_is_enforced_for_lists_details_and_registration():
    """Audience visibility applies to feeds and direct API access, not just frontend filters."""
    headers = setup_test_users()
    future_date = (datetime.now(timezone.utc) + timedelta(days=30)).date().isoformat()

    student_event = client.post(
        "/events",
        json={"title": "Students Only Event", "description": "D", "event_date": future_date, "visibility": "students_only"},
        headers=headers["admin"],
    ).json()["event"]
    alumni_event = client.post(
        "/events",
        json={"title": "Alumni Only Event", "description": "D", "event_date": future_date, "visibility": "alumni_only"},
        headers=headers["admin"],
    ).json()["event"]
    admin_event = client.post(
        "/events",
        json={"title": "Admin Only Event", "description": "D", "event_date": future_date, "visibility": "admin_only"},
        headers=headers["admin"],
    ).json()["event"]

    student_feed = client.get("/events", headers=headers["student"])
    alumni_feed = client.get("/events", headers=headers["alumni_ver"])
    admin_feed = client.get("/events", headers=headers["admin"])

    assert student_feed.status_code == 200
    assert {event["title"] for event in student_feed.json()} == {"Students Only Event"}
    assert alumni_feed.status_code == 200
    assert {event["title"] for event in alumni_feed.json()} == {"Alumni Only Event"}
    assert admin_feed.status_code == 200
    assert {event["title"] for event in admin_feed.json()} >= {
        "Students Only Event", "Alumni Only Event", "Admin Only Event"
    }

    assert client.get(f"/events/{alumni_event['id']}", headers=headers["student"]).status_code == 404
    assert client.get(f"/events/{admin_event['id']}", headers=headers["student"]).status_code == 404
    assert client.post(f"/events/{alumni_event['id']}/register", headers=headers["student"]).status_code == 404
    assert client.get(f"/events/{student_event['id']}", headers=headers["student"]).status_code == 200


def test_creator_can_still_view_own_pending_event_with_restricted_audience():
    """A creator retains access to their own pending submission while others cannot see it."""
    headers = setup_test_users()
    future_date = (datetime.now(timezone.utc) + timedelta(days=30)).date().isoformat()
    created = client.post(
        "/events",
        json={
            "title": "My Pending Alumni Audience Event",
            "description": "Awaiting review.",
            "event_date": future_date,
            "visibility": "alumni_only",
        },
        headers=headers["student"],
    )
    assert created.status_code == 200
    event_id = created.json()["event"]["id"]

    own_feed = client.get("/events", headers=headers["student"])
    other_feed = client.get("/events", headers=headers["student2"])
    assert any(event["id"] == event_id for event in own_feed.json())
    assert all(event["id"] != event_id for event in other_feed.json())
    assert client.get(f"/events/{event_id}", headers=headers["student"]).status_code == 200


def test_event_capacity_is_enforced_and_released_after_cancellation():
    """The final seat cannot be double-booked, and cancelling frees that seat."""
    headers = setup_test_users()
    future_date = (datetime.now(timezone.utc) + timedelta(days=30)).date().isoformat()
    created = client.post(
        "/events",
        json={
            "title": "Limited Seats Workshop",
            "description": "Only one seat.",
            "event_date": future_date,
            "capacity": 1,
        },
        headers=headers["admin"],
    )
    assert created.status_code == 200
    event_id = created.json()["event"]["id"]

    first = client.post(f"/events/{event_id}/register", headers=headers["student"])
    assert first.status_code == 200

    full = client.post(f"/events/{event_id}/register", headers=headers["student2"])
    assert full.status_code == 409
    assert "capacity" in full.json()["detail"].lower()

    cancelled = client.delete(f"/events/{event_id}/register", headers=headers["student"])
    assert cancelled.status_code == 200
    second = client.post(f"/events/{event_id}/register", headers=headers["student2"])
    assert second.status_code == 200


def test_event_update_persists_metadata_and_allows_unlimited_capacity():
    """Editing metadata updates database columns and an explicit blank capacity clears the cap."""
    headers = setup_test_users()
    future_date = (datetime.now(timezone.utc) + timedelta(days=30)).date().isoformat()
    end_date = (datetime.now(timezone.utc) + timedelta(days=31)).date().isoformat()
    created = client.post(
        "/events",
        json={"title": "Editable Event", "description": "D", "event_date": future_date},
        headers=headers["admin"],
    )
    event_id = created.json()["event"]["id"]

    updated = client.patch(
        f"/events/{event_id}",
        json={
            "organizer": "SOET Research Cell",
            "end_date": end_date,
            "end_time": "18:00",
            "visibility": "alumni_only",
            "capacity": 120,
            "tags": ["Research", "AI"],
        },
        headers=headers["admin"],
    )
    assert updated.status_code == 200
    saved = events_module._find_event(event_id)
    assert saved["organizer"] == "SOET Research Cell"
    assert saved["end_date"] == end_date
    assert saved["end_time"] == "18:00"
    assert saved["visibility"] == "alumni_only"
    assert saved["capacity"] == 120
    assert saved["tags"] == ["Research", "AI"]

    cleared = client.patch(
        f"/events/{event_id}",
        json={"capacity": None},
        headers=headers["admin"],
    )
    assert cleared.status_code == 200
    assert events_module._find_event(event_id)["capacity"] is None


def test_invalid_event_schedule_ranges_are_rejected():
    """An end date/time earlier than its start is rejected before database writes."""
    headers = setup_test_users()
    future_date = (datetime.now(timezone.utc) + timedelta(days=30)).date()
    earlier_date = (future_date - timedelta(days=1)).isoformat()
    same_date = future_date.isoformat()

    date_response = client.post(
        "/events",
        json={
            "title": "Bad Date Range",
            "description": "D",
            "event_date": same_date,
            "end_date": earlier_date,
        },
        headers=headers["admin"],
    )
    assert date_response.status_code == 400
    assert "end date" in date_response.json()["detail"].lower()

    time_response = client.post(
        "/events",
        json={
            "title": "Bad Time Range",
            "description": "D",
            "event_date": same_date,
            "start_time": "16:00",
            "end_time": "15:00",
        },
        headers=headers["admin"],
    )
    assert time_response.status_code == 400
    assert "end time" in time_response.json()["detail"].lower()


def test_multi_day_event_remains_active_until_its_end_date():
    """A multi-day event must not expire on its first day."""
    headers = setup_test_users()
    from datetime import date
    start_date = (date.today() - timedelta(days=1)).isoformat()
    end_date = (date.today() + timedelta(days=2)).isoformat()
    created = client.post(
        "/events",
        json={
            "title": "Multi-day Conference",
            "description": "Runs across multiple days.",
            "event_date": start_date,
            "end_date": end_date,
        },
        headers=headers["admin"],
    )
    assert created.status_code == 200
    event_id = created.json()["event"]["id"]

    admin_feed = client.get("/events", headers=headers["admin"])
    event = next(item for item in admin_feed.json() if item["id"] == event_id)
    assert event["is_past"] is False
    assert event["is_expired"] is False


def test_approved_restricted_event_audience_applies_to_creator_too():
    """After approval, creators only see their event if their role matches its audience."""
    headers = setup_test_users()
    future_date = (datetime.now(timezone.utc) + timedelta(days=30)).date().isoformat()
    created = client.post(
        "/events",
        json={
            "title": "Approved Alumni-only Event",
            "description": "Creator is a student but audience is alumni.",
            "event_date": future_date,
            "visibility": "alumni_only",
        },
        headers=headers["student"],
    )
    event_id = created.json()["event"]["id"]
    assert created.status_code == 200

    approved = client.patch(
        f"/events/{event_id}",
        json={"status": "approved"},
        headers=headers["admin"],
    )
    assert approved.status_code == 200

    creator_feed = client.get("/events", headers=headers["student"])
    alumni_feed = client.get("/events", headers=headers["alumni_ver"])
    assert all(event["id"] != event_id for event in creator_feed.json())
    assert any(event["id"] == event_id for event in alumni_feed.json())
    assert client.get(f"/events/{event_id}", headers=headers["student"]).status_code == 404
    assert client.get(f"/events/{event_id}", headers=headers["alumni_ver"]).status_code == 200
