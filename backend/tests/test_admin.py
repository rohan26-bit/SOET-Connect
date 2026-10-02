import sys
from pathlib import Path

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

import json
import pytest
from fastapi.testclient import TestClient

from main import app
from database import users_collection
from security.jwt import create_access_token
import routes.admin as admin_module


client = TestClient(app)


# ============================================================
# TEST USER SETUP
# ============================================================

def _get_or_create_user(
    uid: str,
    name: str,
    email: str,
    role: str,
    is_verified: bool = True,
    is_active: bool = True,
    verification_status: str = "approved",
):
    user = users_collection.find_one({"_id": uid})

    if not user:
        user = {
            "_id": uid,
            "name": name,
            "email": email,
            "role": role,
            "is_active": is_active,
            "is_verified": is_verified,
            "verification_status": verification_status,
        }

        if hasattr(users_collection, "users"):
            users_collection.users.append(user)
        else:
            users_collection.insert_one(user)

    return user


def setup_test_users():
    _get_or_create_user(
        "demo-student-id", "Demo Student",
        "test@student.com", "student",
    )
    _get_or_create_user(
        "demo-alumni-id", "Demo Alumni",
        "test@alumni.com", "alumni",
        verification_status="approved",
    )
    _get_or_create_user(
        "demo-admin-id", "Demo Admin",
        "test@admin.com", "admin",
    )

    tokens = {
        "student": create_access_token("demo-student-id", "student"),
        "alumni": create_access_token("demo-alumni-id", "alumni"),
        "admin": create_access_token("demo-admin-id", "admin"),
    }

    headers = {
        k: {"Authorization": f"Bearer {v}"}
        for k, v in tokens.items()
    }

    return headers


# ============================================================
# FIXTURES
# ============================================================

@pytest.fixture(autouse=True)
def isolate_data_files(tmp_path, monkeypatch):
    """Redirect all JSON data files to temp directory per test."""
    for attr in ("JOBS_FILE", "EVENTS_FILE",
                 "REGISTRATIONS_FILE", "APPLICATIONS_FILE"):
        test_file = tmp_path / f"{attr.lower()}.json"
        test_file.write_text("[]", encoding="utf-8")
        monkeypatch.setattr(admin_module, attr, test_file)


def _write_json(filepath, data):
    filepath.write_text(json.dumps(data), encoding="utf-8")


# ============================================================
# 1. ADMIN METRICS — BASIC ACCESS
# ============================================================

def test_admin_metrics_returns_200():
    """Admin can access the metrics endpoint."""
    headers = setup_test_users()
    resp = client.get("/admin/metrics", headers=headers["admin"])
    assert resp.status_code == 200


def test_admin_metrics_contains_all_fields():
    """Response includes every expected metric field."""
    headers = setup_test_users()
    resp = client.get("/admin/metrics", headers=headers["admin"])
    data = resp.json()

    expected_keys = {
        "totalStudents", "totalAlumni", "verifiedAlumni",
        "pendingAlumni", "totalJobs", "pendingJobs",
        "totalEvents", "pendingEvents",
        "totalApplications", "totalRegistrations",
    }

    assert expected_keys.issubset(data.keys())


# ============================================================
# 2. METRICS — REAL COUNTS
# ============================================================

def test_metrics_user_counts():
    """Metrics include correct student/alumni counts."""
    headers = setup_test_users()
    resp = client.get("/admin/metrics", headers=headers["admin"])
    data = resp.json()

    assert data["totalStudents"] >= 1
    assert data["totalAlumni"] >= 1
    assert data["verifiedAlumni"] >= 1


def test_metrics_job_counts(tmp_path, monkeypatch):
    """Metrics read real job counts from jobs_data.json."""
    headers = setup_test_users()

    jobs_file = tmp_path / "jobs_data.json"
    _write_json(jobs_file, [
        {"id": "j1", "status": "approved"},
        {"id": "j2", "status": "pending"},
        {"id": "j3", "status": "pending"},
    ])
    monkeypatch.setattr(admin_module, "JOBS_FILE", jobs_file)

    resp = client.get("/admin/metrics", headers=headers["admin"])
    data = resp.json()

    assert data["totalJobs"] == 3
    assert data["pendingJobs"] == 2


def test_metrics_event_counts(tmp_path, monkeypatch):
    """Metrics read real event counts from events_data.json."""
    headers = setup_test_users()

    events_file = tmp_path / "events_data.json"
    _write_json(events_file, [
        {"id": "e1", "status": "approved"},
        {"id": "e2", "status": "pending"},
    ])
    monkeypatch.setattr(admin_module, "EVENTS_FILE", events_file)

    reg_file = tmp_path / "registrations_file.json"
    _write_json(reg_file, [
        {"event_id": "e1", "user_id": "u1"},
        {"event_id": "e1", "user_id": "u2"},
        {"event_id": "e2", "user_id": "u3"},
    ])
    monkeypatch.setattr(admin_module, "REGISTRATIONS_FILE", reg_file)

    resp = client.get("/admin/metrics", headers=headers["admin"])
    data = resp.json()

    assert data["totalEvents"] == 2
    assert data["pendingEvents"] == 1
    assert data["totalRegistrations"] == 3


def test_metrics_application_counts(tmp_path, monkeypatch):
    """Metrics read real application counts from applications_data.json."""
    headers = setup_test_users()

    app_file = tmp_path / "applications_data.json"
    _write_json(app_file, [
        {"id": "a1", "status": "applied"},
        {"id": "a2", "status": "shortlisted"},
    ])
    monkeypatch.setattr(admin_module, "APPLICATIONS_FILE", app_file)

    resp = client.get("/admin/metrics", headers=headers["admin"])
    data = resp.json()

    assert data["totalApplications"] == 2


# ============================================================
# 3-4. RBAC — METRICS
# ============================================================

def test_student_cannot_access_metrics():
    """Student receives 403 for admin metrics."""
    headers = setup_test_users()
    resp = client.get("/admin/metrics", headers=headers["student"])
    assert resp.status_code == 403


def test_alumni_cannot_access_metrics():
    """Alumni receives 403 for admin metrics."""
    headers = setup_test_users()
    resp = client.get("/admin/metrics", headers=headers["alumni"])
    assert resp.status_code == 403


# ============================================================
# 5-6. ADMIN STUDENTS ENDPOINT
# ============================================================

def test_admin_can_retrieve_students():
    """Admin can retrieve the students list."""
    headers = setup_test_users()
    resp = client.get("/admin/students", headers=headers["admin"])

    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) >= 1


def test_students_list_contains_only_students():
    """Student list contains only role=student users."""
    headers = setup_test_users()
    resp = client.get("/admin/students", headers=headers["admin"])
    data = resp.json()

    for student in data:
        assert student["role"] == "student"


def test_students_response_has_expected_fields():
    """Each student record has the expected fields."""
    headers = setup_test_users()
    resp = client.get("/admin/students", headers=headers["admin"])
    data = resp.json()

    assert len(data) >= 1
    student = data[0]

    # Required fields
    assert "id" in student
    assert "full_name" in student
    assert "email" in student
    assert "role" in student
    assert "is_active" in student
    assert "is_verified" in student


# ============================================================
# 7-8. RBAC — STUDENTS
# ============================================================

def test_student_cannot_access_students_endpoint():
    """Student cannot retrieve admin student-management data."""
    headers = setup_test_users()
    resp = client.get("/admin/students", headers=headers["student"])
    assert resp.status_code == 403


def test_alumni_cannot_access_students_endpoint():
    """Alumni cannot retrieve admin student-management data."""
    headers = setup_test_users()
    resp = client.get("/admin/students", headers=headers["alumni"])
    assert resp.status_code == 403


# ============================================================
# 9. SENSITIVE FIELDS NOT EXPOSED
# ============================================================

def test_students_response_excludes_passwords():
    """Sensitive password/authentication fields are not returned."""
    headers = setup_test_users()
    resp = client.get("/admin/students", headers=headers["admin"])
    data = resp.json()

    sensitive_keys = {
        "password_hash", "password", "token", "secret",
        "refresh_token", "access_token",
    }

    for student in data:
        for key in sensitive_keys:
            assert key not in student, (
                f"Sensitive field '{key}' found in response"
            )


# ============================================================
# TOGGLE USER ACTIVE
# ============================================================

def test_admin_can_toggle_student_active():
    """Admin can suspend and reactivate a student."""
    headers = setup_test_users()

    # First toggle: should suspend (currently active)
    resp = client.patch(
        "/admin/users/demo-student-id/active",
        headers=headers["admin"],
    )

    assert resp.status_code == 200
    data = resp.json()
    assert data["is_active"] is False

    # Second toggle: should reactivate
    resp = client.patch(
        "/admin/users/demo-student-id/active",
        headers=headers["admin"],
    )

    assert resp.status_code == 200
    data = resp.json()
    assert data["is_active"] is True


def test_admin_cannot_toggle_own_status():
    """Admin cannot change their own account status."""
    headers = setup_test_users()

    resp = client.patch(
        "/admin/users/demo-admin-id/active",
        headers=headers["admin"],
    )

    assert resp.status_code == 400


def test_toggle_nonexistent_user():
    """Toggling a non-existent user returns 404."""
    headers = setup_test_users()

    resp = client.patch(
        "/admin/users/nonexistent-user-id/active",
        headers=headers["admin"],
    )

    assert resp.status_code == 404


def test_student_cannot_toggle_active():
    """Student cannot access the toggle endpoint."""
    headers = setup_test_users()

    resp = client.patch(
        "/admin/users/demo-student-id/active",
        headers=headers["student"],
    )

    assert resp.status_code == 403


def test_alumni_cannot_toggle_active():
    """Alumni cannot access the toggle endpoint."""
    headers = setup_test_users()

    resp = client.patch(
        "/admin/users/demo-student-id/active",
        headers=headers["alumni"],
    )

    assert resp.status_code == 403
