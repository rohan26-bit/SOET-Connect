import sys
from pathlib import Path

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

import json
import pytest
from bson import ObjectId
from fastapi.testclient import TestClient

from main import app
from database import users_collection
from security.jwt import create_access_token
import routes.admin as admin_module
from routes.notifications import create_notification


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
    import routes.jobs
    import routes.events
    import routes.applications
    monkeypatch.setattr(admin_module, "JOBS_FILE", getattr(routes.jobs, "JOBS_FILE", tmp_path / "jobs_data.json"))
    monkeypatch.setattr(admin_module, "EVENTS_FILE", getattr(routes.events, "EVENTS_FILE", tmp_path / "events_data.json"))
    reg_file = getattr(routes.events, "REGISTRATIONS_FILE", tmp_path / "event_registrations_data.json")
    monkeypatch.setattr(admin_module, "REGISTRATIONS_FILE", reg_file)
    monkeypatch.setattr(admin_module, "EVENT_REGISTRATIONS_FILE", reg_file)
    monkeypatch.setattr(admin_module, "APPLICATIONS_FILE", getattr(routes.applications, "APPLICATIONS_FILE", tmp_path / "applications_data.json"))


def _write_json(filepath, data):
    filepath.write_text(json.dumps(data), encoding="utf-8")


# ============================================================
# ADMIN STATS & VERIFICATION (feature/backend-api)
# ============================================================

def test_admin_stats_authorization(client, student_user, verified_alumni_user, admin_user):
    """Only admin can access /admin/stats; students and alumni receive 403."""
    res_stu = client.get("/admin/stats", headers=student_user["headers"])
    assert res_stu.status_code == 403

    res_alu = client.get("/admin/stats", headers=verified_alumni_user["headers"])
    assert res_alu.status_code == 403

    res_admin = client.get("/admin/stats", headers=admin_user["headers"])
    assert res_admin.status_code == 200


def test_admin_stats_aggregation_accuracy(client, admin_user, student_user, verified_alumni_user, unverified_alumni_user):
    """Stats endpoint correctly aggregates users, alumni, jobs, applications, events, and notifications."""
    res_job = client.post("/jobs", json={
        "title": "Admin Job",
        "company": "Enterprise Inc",
        "description": "Desc",
        "location": "Remote",
        "employment_type": "full-time"
    }, headers=admin_user["headers"])
    job_id = res_job.json()["job"]["id"]

    client.post(f"/jobs/{job_id}/applications", json={
        "resume_url": "https://example.com/res.pdf"
    }, headers=student_user["headers"])

    res_ev = client.post("/events", json={
        "title": "Summit 2026",
        "description": "Desc",
        "event_date": "2026-12-15",
        "event_time": "09:00",
        "location": "Convention Center"
    }, headers=admin_user["headers"])
    event_id = res_ev.json()["event"]["id"]

    client.post(f"/events/{event_id}/register", headers=student_user["headers"])

    client.post("/announcements", json={
        "title": "Platform Maintenance",
        "content": "Server updates scheduled",
        "target_audience": "all"
    }, headers=admin_user["headers"])

    create_notification(user_id=student_user["id"], title="Alert", message="Hello")

    res = client.get("/admin/stats", headers=admin_user["headers"])
    assert res.status_code == 200
    stats = res.json()

    assert stats["users"]["total"] == 4
    assert stats["users"]["by_role"]["student"] == 1
    assert stats["users"]["by_role"]["alumni"] == 2
    assert stats["users"]["by_role"]["admin"] == 1

    assert stats["alumni"]["total"] == 2
    assert stats["alumni"]["verified"] == 1
    assert stats["alumni"]["pending"] == 1

    assert stats["jobs"]["total"] == 1
    assert stats["jobs"]["by_status"].get("approved") == 1

    assert stats["applications"]["total"] == 1
    assert stats["applications"]["by_status"].get("applied") == 1

    assert stats["events"]["total"] == 1
    assert stats["events"]["by_status"].get("approved") == 1
    assert stats["event_registrations"]["total"] == 1

    assert stats["announcements"]["total"] == 1
    assert stats["notifications"]["total"] == 6

    raw_text = res.text.lower()
    assert "password" not in raw_text
    assert "secret" not in raw_text
    assert "hash" not in raw_text


def test_alumni_pending_and_verification(client, admin_user, student_user, unverified_alumni_user):
    """Admin can view pending alumni and approve/reject/suspend them. Non-admin gets 403."""
    res_forbid = client.get("/alumni/pending", headers=student_user["headers"])
    assert res_forbid.status_code == 403

    res_list = client.get("/alumni/pending", headers=admin_user["headers"])
    assert res_list.status_code == 200
    pending_list = res_list.json()
    assert any(a["id"] == unverified_alumni_user["id"] for a in pending_list)

    res_v_forbid = client.patch(
        f"/alumni/verify/{unverified_alumni_user['id']}?status=approved",
        headers=student_user["headers"]
    )
    assert res_v_forbid.status_code == 403

    res_v_bad = client.patch(
        f"/alumni/verify/{unverified_alumni_user['id']}?status=invalid_status",
        headers=admin_user["headers"]
    )
    assert res_v_bad.status_code == 400

    res_approve = client.patch(
        f"/alumni/verify/{unverified_alumni_user['id']}?status=approved",
        headers=admin_user["headers"]
    )
    assert res_approve.status_code == 200
    assert res_approve.json()["is_verified"] is True
    assert res_approve.json()["status"] == "approved"

    res_list_after = client.get("/alumni/pending", headers=admin_user["headers"])
    assert res_list_after.status_code == 200
    assert not any(a["id"] == unverified_alumni_user["id"] for a in res_list_after.json())


# ============================================================
# 1. ADMIN METRICS — BASIC ACCESS (origin/main)
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
# 2. METRICS — REAL COUNTS (origin/main)
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
# 3-4. RBAC — METRICS (origin/main)
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
# 5-6. ADMIN STUDENTS ENDPOINT (origin/main)
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
# 7-8. RBAC — STUDENTS (origin/main)
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
# 9. SENSITIVE FIELDS NOT EXPOSED (origin/main)
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
# TOGGLE USER ACTIVE (origin/main)
# ============================================================

def test_admin_can_toggle_student_active():
    """Admin can suspend and reactivate a student."""
    headers = setup_test_users()

    resp = client.patch(
        "/admin/users/demo-student-id/active",
        headers=headers["admin"],
    )

    assert resp.status_code == 200
    data = resp.json()
    assert data["is_active"] is False

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


# ============================================================
# REGRESSION: REAL BSON OBJECTID TOGGLE ACTIVE & RBAC
# ============================================================

def test_admin_can_toggle_real_objectid_user_deactivation_and_reactivation():
    """Admin can suspend and reactivate a real BSON ObjectId user, persisting state."""
    headers = setup_test_users()

    # 1. Create a user stored with a real BSON ObjectId
    real_oid = ObjectId()
    user_id_str = str(real_oid)
    user_doc = {
        "_id": real_oid,
        "name": "Real Mongo Student",
        "email": "realmongo@student.com",
        "role": "student",
        "is_active": True,
        "is_verified": True,
        "verification_status": "approved",
    }
    users_collection.insert_one(user_doc)

    # 2. Deactivation: active -> inactive
    resp_deactivate = client.patch(
        f"/admin/users/{user_id_str}/active",
        headers=headers["admin"],
    )
    assert resp_deactivate.status_code == 200
    data_deact = resp_deactivate.json()
    assert data_deact["is_active"] is False
    assert data_deact["user_id"] == user_id_str
    assert data_deact["message"] == "User account suspended."

    # Verify persisted state in database
    persisted_user = users_collection.find_one({"_id": real_oid})
    assert persisted_user is not None
    assert persisted_user["is_active"] is False

    # 3. Reactivation: inactive -> active
    resp_reactivate = client.patch(
        f"/admin/users/{user_id_str}/active",
        headers=headers["admin"],
    )
    assert resp_reactivate.status_code == 200
    data_react = resp_reactivate.json()
    assert data_react["is_active"] is True
    assert data_react["user_id"] == user_id_str
    assert data_react["message"] == "User account activated."

    # Verify persisted state in database
    persisted_user2 = users_collection.find_one({"_id": real_oid})
    assert persisted_user2 is not None
    assert persisted_user2["is_active"] is True


def test_toggle_real_objectid_user_rbac_and_invalid_ids():
    """RBAC and validation: non-admins cannot toggle real ObjectId users; malformed/nonexistent IDs return 404."""
    headers = setup_test_users()

    real_oid = ObjectId()
    user_id_str = str(real_oid)
    users_collection.insert_one({
        "_id": real_oid,
        "name": "Target Student",
        "email": "target@student.com",
        "role": "student",
        "is_active": True,
        "is_verified": True,
        "verification_status": "approved",
    })

    # 1. Unauthenticated request rejected
    resp_unauth = client.patch(f"/admin/users/{user_id_str}/active")
    assert resp_unauth.status_code == 401

    # 2. Student rejected (403)
    resp_student = client.patch(
        f"/admin/users/{user_id_str}/active",
        headers=headers["student"],
    )
    assert resp_student.status_code == 403

    # 3. Alumni rejected (403)
    resp_alumni = client.patch(
        f"/admin/users/{user_id_str}/active",
        headers=headers["alumni"],
    )
    assert resp_alumni.status_code == 403

    # 4. Non-existent valid ObjectId returns 404
    non_existent_oid = str(ObjectId())
    resp_404 = client.patch(
        f"/admin/users/{non_existent_oid}/active",
        headers=headers["admin"],
    )
    assert resp_404.status_code == 404
    assert "not found" in resp_404.json().get("detail", "").lower()

    # 5. Malformed invalid ID returns 404
    resp_malformed = client.patch(
        "/admin/users/not-a-valid-object-id/active",
        headers=headers["admin"],
    )
    assert resp_malformed.status_code == 404
    assert "not found" in resp_malformed.json().get("detail", "").lower()
