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
    # Student creates pending event
    client.post("/events", json={"title": "Stu Pending", "description": "D", "event_date": "2026-11-01"}, headers=headers["student"])
    # Alumni creates pending event
    client.post("/events", json={"title": "Alu Pending", "description": "D", "event_date": "2026-11-02"}, headers=headers["alumni_ver"])
    # Admin creates approved event
    client.post("/events", json={"title": "Admin Approved", "description": "D", "event_date": "2026-11-03"}, headers=headers["admin"])

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
    """Deleting an event cleans up associated registrations."""
    headers = setup_test_users()
    res_create = client.post("/events", json={"title": "Event To Delete", "description": "D", "event_date": "2026-11-15"}, headers=headers["admin"])
    event_id = res_create.json()["event"]["id"]

    client.post(f"/events/{event_id}/register", headers=headers["student"])
    assert len(events_module.load_registrations()) == 1

    # Delete event
    client.delete(f"/events/{event_id}", headers=headers["admin"])
    # Registrations for this event must be cleaned up
    assert len(events_module.load_registrations()) == 0


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

