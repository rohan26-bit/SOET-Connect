import os
from datetime import datetime, timezone
import pytest
from bson import ObjectId
from fastapi.testclient import TestClient

# Ensure test environment variables before module imports
os.environ["DATABASE_MODE"] = "mock"
os.environ["DATABASE_NAME"] = "soet_connect_test"
os.environ["JWT_SECRET_KEY"] = "test-secret-key-for-soet-connect-tests-32char"
os.environ["JWT_ALGORITHM"] = "HS256"

from main import app
from database import users_collection
from security.jwt import create_access_token
import routes.jobs
import routes.applications
import routes.events
import routes.announcements
import routes.notifications
import routes.admin


@pytest.fixture(autouse=True)
def isolate_environment(tmp_path, monkeypatch):
    """Isolate MongoDB mock collection and JSON data stores per test."""
    users_collection.delete_many({})

    jobs_file = tmp_path / "jobs_data.json"
    applications_file = tmp_path / "applications_data.json"
    events_file = tmp_path / "events_data.json"
    event_registrations_file = tmp_path / "event_registrations_data.json"
    announcements_file = tmp_path / "announcements_data.json"
    notifications_file = tmp_path / "notifications_data.json"

    for f in [
        jobs_file,
        applications_file,
        events_file,
        event_registrations_file,
        announcements_file,
        notifications_file,
    ]:
        f.write_text("[]", encoding="utf-8")

    monkeypatch.setattr(routes.jobs, "JOBS_FILE", jobs_file)
    monkeypatch.setattr(routes.applications, "APPLICATIONS_FILE", applications_file)
    monkeypatch.setattr(routes.applications, "JOBS_FILE", jobs_file)
    monkeypatch.setattr(routes.events, "EVENTS_FILE", events_file)
    monkeypatch.setattr(routes.events, "REGISTRATIONS_FILE", event_registrations_file)
    monkeypatch.setattr(routes.announcements, "ANNOUNCEMENTS_FILE", announcements_file)
    monkeypatch.setattr(routes.notifications, "NOTIFICATIONS_FILE", notifications_file)

    monkeypatch.setattr(routes.admin, "JOBS_FILE", jobs_file)
    monkeypatch.setattr(routes.admin, "APPLICATIONS_FILE", applications_file)
    monkeypatch.setattr(routes.admin, "EVENTS_FILE", events_file)
    monkeypatch.setattr(routes.admin, "EVENT_REGISTRATIONS_FILE", event_registrations_file)
    monkeypatch.setattr(routes.admin, "ANNOUNCEMENTS_FILE", announcements_file)
    monkeypatch.setattr(routes.admin, "NOTIFICATIONS_FILE", notifications_file)


@pytest.fixture
def client():
    """FastAPI TestClient fixture."""
    return TestClient(app)


def _create_mock_user(name: str, email: str, role: str, is_verified: bool = True, verification_status: str = "approved", extra_profile: dict = None):
    now = datetime.now(timezone.utc)
    user_id = ObjectId()
    doc = {
        "_id": user_id,
        "name": name,
        "email": email.lower().strip(),
        "password_hash": "mock_hashed_pw",
        "role": role,
        "is_active": True,
        "is_verified": is_verified,
        "verification_status": verification_status,
        "created_at": now,
        "updated_at": now,
    }
    if role == "student":
        doc["student_profile"] = extra_profile or {
            "student_id": "STU001",
            "department": "Computer Science",
            "course": "B.Tech",
            "academic_year": "3rd",
            "graduation_year": "2026",
            "phone": "9876543210"
        }
    elif role == "alumni":
        doc["alumni_profile"] = extra_profile or {
            "alumni_id": "ALU001",
            "department": "Computer Science",
            "degree": "B.Tech",
            "graduation_year": "2022",
            "company": "Tech Corp",
            "designation": "Software Engineer",
            "industry": "IT",
            "location": "Pune",
            "skills": ["Python", "FastAPI"],
            "verification_status": verification_status
        }

    users_collection.insert_one(doc)
    token = create_access_token(user_id=str(user_id), role=role)
    return {
        "id": str(user_id),
        "doc_id": user_id,
        "name": name,
        "email": email,
        "role": role,
        "token": token,
        "headers": {"Authorization": f"Bearer {token}"}
    }


@pytest.fixture
def student_user():
    return _create_mock_user("Student One", "student1@example.com", "student")


@pytest.fixture
def other_student_user():
    return _create_mock_user("Student Two", "student2@example.com", "student")


@pytest.fixture
def verified_alumni_user():
    return _create_mock_user("Alumni Verified", "alumni_verified@example.com", "alumni", is_verified=True, verification_status="approved")


@pytest.fixture
def unverified_alumni_user():
    return _create_mock_user("Alumni Pending", "alumni_pending@example.com", "alumni", is_verified=False, verification_status="pending")


@pytest.fixture
def other_alumni_user():
    return _create_mock_user("Other Alumni", "alumni_other@example.com", "alumni", is_verified=True, verification_status="approved")


@pytest.fixture
def admin_user():
    return _create_mock_user("Admin User", "admin@example.com", "admin", is_verified=True)
