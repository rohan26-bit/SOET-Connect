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
        "test@example.com", "student",
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


def test_admin_alumni_endpoint_returns_complete_profiles_and_all_statuses(
    client, admin_user, verified_alumni_user, unverified_alumni_user
):
    """Admin receives full profile fields for approved, pending, rejected and inactive alumni."""
    users_collection.insert_one({
        "_id": "rejected-inactive-alumni",
        "name": "Rejected Alumni",
        "email": "rejected.alumni@example.com",
        "password_hash": "must-not-be-returned",
        "role": "alumni",
        "is_active": False,
        "is_verified": False,
        "verification_status": "rejected",
        "created_at": "2026-01-01T00:00:00+00:00",
        "updated_at": "2026-01-02T00:00:00+00:00",
        "phone": "9000000000",
        "is_phone_verified": True,
        "alumni_profile": {
            "alumni_id": "ALU-REJECTED",
            "department": "Computer Science",
            "degree": "B.Tech",
            "graduation_year": "2021",
            "company": "Example Corp",
            "designation": "Engineer",
            "industry": "Technology",
            "location": "Pune",
            "skills": ["Python", "SQL"],
            "linkedin": "https://linkedin.com/in/example",
            "github": "https://github.com/example",
            "website": "https://example.com",
            "bio": "Example alumni profile",
        },
    })

    response = client.get("/admin/alumni", headers=admin_user["headers"])
    assert response.status_code == 200
    records = response.json()

    assert {row["id"] for row in records} >= {
        verified_alumni_user["id"],
        unverified_alumni_user["id"],
        "rejected-inactive-alumni",
    }

    rejected = next(row for row in records if row["id"] == "rejected-inactive-alumni")
    assert rejected["verification_status"] == "rejected"
    assert rejected["is_active"] is False
    assert rejected["alumni_id"] == "ALU-REJECTED"
    assert rejected["company"] == "Example Corp"
    assert rejected["skills"] == ["Python", "SQL"]
    assert rejected["phone"] == "9000000000"
    assert rejected["is_phone_verified"] is True

    verified = next(row for row in records if row["id"] == verified_alumni_user["id"])
    assert verified["alumni_id"] == "ALU001"
    assert verified["degree"] == "B.Tech"
    assert verified["graduation_year"] == "2022"
    assert verified["skills"] == ["Python", "FastAPI"]

    assert all(row["role"] == "alumni" for row in records)
    assert all("password_hash" not in row and "password" not in row for row in records)


def test_non_admin_cannot_retrieve_admin_alumni_profiles(
    client, student_user, verified_alumni_user
):
    """Student and alumni accounts cannot access the complete admin alumni list."""
    student_response = client.get("/admin/alumni", headers=student_user["headers"])
    alumni_response = client.get("/admin/alumni", headers=verified_alumni_user["headers"])

    assert student_response.status_code == 403
    assert alumni_response.status_code == 403


def test_admin_student_records_include_all_registration_profile_fields(
    client, admin_user, student_user
):
    """Admin student records expose registration details but never password data."""
    response = client.get("/admin/students", headers=admin_user["headers"])
    assert response.status_code == 200

    student = next(row for row in response.json() if row["id"] == student_user["id"])
    assert student["student_id"] == "STU001"
    assert student["department"] == "Computer Science"
    assert student["course"] == "B.Tech"
    assert student["academic_year"] == "3rd"
    assert student["graduation_year"] == "2026"
    assert student["phone"] == "9876543210"
    assert student["is_phone_verified"] is False
    assert "password_hash" not in student
    assert "password" not in student


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


def test_deactivation_invalidates_existing_jwt_even_after_reactivation():
    """Suspending an account revokes old JWTs permanently, not just while inactive."""
    headers = setup_test_users()

    # Give the target a known token version, then issue a token before suspension.
    users_collection.update_one(
        {"_id": "demo-student-id"},
        {"$set": {"is_active": True, "session_version": 0}},
    )
    student_token = create_access_token(
        "demo-student-id", "student", session_version=0,
    )
    student_headers = {"Authorization": f"Bearer {student_token}"}

    # Confirm the token works and is lazily registered before deactivation.
    before = client.get("/auth/sessions", headers=student_headers)
    assert before.status_code == 200

    suspended = client.patch(
        "/admin/users/demo-student-id/active",
        headers=headers["admin"],
    )
    assert suspended.status_code == 200
    assert suspended.json()["is_active"] is False

    blocked_while_suspended = client.get("/auth/sessions", headers=student_headers)
    assert blocked_while_suspended.status_code == 403

    reactivated = client.patch(
        "/admin/users/demo-student-id/active",
        headers=headers["admin"],
    )
    assert reactivated.status_code == 200
    assert reactivated.json()["is_active"] is True

    # The account is active again, but the old token's version remains stale.
    blocked_after_reactivation = client.get("/auth/sessions", headers=student_headers)
    assert blocked_after_reactivation.status_code == 401
    assert "revoked" in blocked_after_reactivation.json()["detail"].lower()


def test_deactivation_invalidates_unregistered_legacy_jwt_after_reactivation():
    """A legacy JWT must be revoked before lazy session registration can revive it."""
    headers = setup_test_users()

    # The helper creates a legacy student JWT without a session ID. Reset the
    # account version to the value embedded in that token, but do not use the
    # student token before the admin deactivates the account.
    users_collection.update_one(
        {"_id": "demo-student-id"},
        {"$set": {"is_active": True, "session_version": 0}},
    )

    suspended = client.patch(
        "/admin/users/demo-student-id/active",
        headers=headers["admin"],
    )
    assert suspended.status_code == 200
    assert suspended.json()["is_active"] is False

    reactivated = client.patch(
        "/admin/users/demo-student-id/active",
        headers=headers["admin"],
    )
    assert reactivated.status_code == 200
    assert reactivated.json()["is_active"] is True

    # This is the first request made with the old student JWT. It has never
    # been lazily registered in auth_sessions, so rejection proves the
    # session_version check runs before legacy-session registration.
    blocked = client.get("/auth/sessions", headers=headers["student"])
    assert blocked.status_code == 401
    assert "revoked" in blocked.json()["detail"].lower()


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


def test_dashboard_metrics_empty_data_state():
    """When there are no students, alumni, jobs, events, or applications, all counters are zero."""
    _get_or_create_user(
        "admin-only-id", "Admin Only",
        "admin@test.com", "admin",
    )
    admin_token = create_access_token("admin-only-id", "admin")
    resp = client.get("/admin/metrics", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200
    data = resp.json()

    assert data["totalStudents"] == 0
    assert data["totalAlumni"] == 0
    assert data["verifiedAlumni"] == 0
    assert data["pendingAlumni"] == 0
    assert data["totalJobs"] == 0
    assert data["pendingJobs"] == 0
    assert data["totalEvents"] == 0
    assert data["pendingEvents"] == 0
    assert data["totalApplications"] == 0
    assert data["totalRegistrations"] == 0


def test_verified_alumni_missing_status_not_counted_as_pending():
    """Alumni with is_verified=True but no verification_status must NOT be counted as pending."""
    _get_or_create_user(
        "admin-id", "Admin", "admin2@test.com", "admin"
    )
    user = {
        "_id": "verified-alumni-no-status",
        "name": "Verified Alumni",
        "email": "verified@alumni.com",
        "role": "alumni",
        "is_active": True,
        "is_verified": True,
    }
    users_collection.insert_one(user)

    admin_token = create_access_token("admin-id", "admin")
    resp = client.get("/admin/metrics", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200
    data = resp.json()

    assert data["totalAlumni"] == 1
    assert data["verifiedAlumni"] == 1
    assert data["pendingAlumni"] == 0


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
        "email": "realmongo@example.com",
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
        "email": "target@example.com",
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


# ============================================================
# STUDENT VERIFICATION WORKFLOW & APPROVAL TESTS
# ============================================================

def test_admin_can_get_pending_students_and_metrics():
    """Admin can query /admin/students/pending and see pendingStudents count in /admin/metrics."""
    headers = setup_test_users()

    # Create a pending student
    student_id = str(ObjectId())
    users_collection.insert_one({
        "_id": student_id,
        "name": "Pending Queue Student",
        "email": "pending.queue@example.com",
        "role": "student",
        "is_active": True,
        "is_verified": False,
        "verification_status": "pending",
        "student_profile": {"student_id": "STU555", "department": "IT"}
    })

    # Query pending students
    resp = client.get("/admin/students/pending", headers=headers["admin"])
    assert resp.status_code == 200
    data = resp.json()
    assert any(s["id"] == student_id for s in data)

    # Query metrics
    metrics_resp = client.get("/admin/metrics", headers=headers["admin"])
    assert metrics_resp.status_code == 200
    metrics = metrics_resp.json()
    assert "pendingStudents" in metrics
    assert metrics["pendingStudents"] >= 1


def test_admin_can_approve_student():
    """Admin can approve a pending student via PATCH /admin/students/{user_id}/verification?status=approved."""
    headers = setup_test_users()

    student_id = str(ObjectId())
    users_collection.insert_one({
        "_id": student_id,
        "name": "Approval Student",
        "email": "approve.me@example.com",
        "role": "student",
        "is_active": True,
        "is_verified": False,
        "verification_status": "pending",
        "student_profile": {"student_id": "STU123"}
    })

    resp = client.patch(
        f"/admin/students/{student_id}/verification?status=approved",
        headers=headers["admin"]
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["user_id"] == student_id
    assert data["status"] == "approved"
    assert data["is_verified"] is True
    assert "approved" in data["message"].lower()

    # Verify persisted in DB
    u = users_collection.find_one({"_id": student_id})
    assert u["is_verified"] is True
    assert u["verification_status"] == "approved"


def test_admin_can_reject_student():
    """Admin can reject a pending student via PATCH /admin/students/{user_id}/verification?status=rejected."""
    headers = setup_test_users()

    student_id = str(ObjectId())
    users_collection.insert_one({
        "_id": student_id,
        "name": "Reject Student",
        "email": "reject.me@example.com",
        "role": "student",
        "is_active": True,
        "is_verified": False,
        "verification_status": "pending",
    })

    resp = client.patch(
        f"/admin/students/{student_id}/verification?status=rejected",
        headers=headers["admin"]
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["user_id"] == student_id
    assert data["status"] == "rejected"
    assert data["is_verified"] is False

    u = users_collection.find_one({"_id": student_id})
    assert u["is_verified"] is False
    assert u["verification_status"] == "rejected"


def test_non_admin_cannot_approve_reject_students():
    """Student and unauthenticated users cannot approve or reject students."""
    headers = setup_test_users()

    student_id = str(ObjectId())
    users_collection.insert_one({
        "_id": student_id,
        "name": "Security Student",
        "email": "sec@example.com",
        "role": "student",
        "is_active": True,
        "is_verified": False,
        "verification_status": "pending",
    })

    # Unauthenticated
    resp_unauth = client.patch(f"/admin/students/{student_id}/verification?status=approved")
    assert resp_unauth.status_code == 401

    # Student token
    resp_student = client.patch(
        f"/admin/students/{student_id}/verification?status=approved",
        headers=headers["student"]
    )
    assert resp_student.status_code == 403

    # Alumni token
    resp_alumni = client.patch(
        f"/admin/students/{student_id}/verification?status=approved",
        headers=headers["alumni"]
    )
    assert resp_alumni.status_code == 403


def test_cannot_verify_non_student_via_student_endpoint():
    """Attempting to verify an alumni user through student verification endpoint fails."""
    headers = setup_test_users()

    alumni_id = str(ObjectId())
    users_collection.insert_one({
        "_id": alumni_id,
        "name": "Alumni Target",
        "email": "alumni.target@domain.com",
        "role": "alumni",
        "is_active": True,
        "is_verified": False,
        "verification_status": "pending",
    })

    resp = client.patch(
        f"/admin/students/{alumni_id}/verification?status=approved",
        headers=headers["admin"]
    )
    assert resp.status_code == 400
    assert "not a student" in resp.json().get("detail", "").lower()


def test_existing_alumni_verification_flow_still_works():
    """Alumni verification endpoint /alumni/verify/{user_id} continues to work properly."""
    headers = setup_test_users()

    alumni_id = str(ObjectId())
    users_collection.insert_one({
        "_id": alumni_id,
        "name": "Alumni Verifiable",
        "email": "verifiable.alumni@domain.com",
        "role": "alumni",
        "is_active": True,
        "is_verified": False,
        "verification_status": "pending",
    })

    resp = client.patch(
        f"/alumni/verify/{alumni_id}?status=approved",
        headers=headers["admin"]
    )
    assert resp.status_code == 200
    u = users_collection.find_one({"_id": alumni_id})
    assert u["is_verified"] is True
    assert u["verification_status"] == "approved"


# ============================================================
# PERMANENT USER ACCOUNT DELETION
# ============================================================

def test_admin_can_permanently_delete_student(client, admin_user, student_user):
    """Admin can permanently delete a student account."""
    assert users_collection.find_one({"_id": student_user["id"]}) is not None

    response = client.delete(
        f"/admin/users/{student_user['id']}",
        headers=admin_user["headers"],
    )

    assert response.status_code == 200
    assert response.json()["message"] == "User account permanently deleted."
    assert response.json()["role"] == "student"
    assert users_collection.find_one({"_id": student_user["id"]}) is None


def test_admin_can_permanently_delete_alumni(client, admin_user, verified_alumni_user):
    """Admin can permanently delete an alumni account."""
    assert users_collection.find_one({"_id": verified_alumni_user["id"]}) is not None

    response = client.delete(
        f"/admin/users/{verified_alumni_user['id']}",
        headers=admin_user["headers"],
    )

    assert response.status_code == 200
    assert response.json()["role"] == "alumni"
    assert users_collection.find_one({"_id": verified_alumni_user["id"]}) is None


def test_admin_cannot_delete_own_or_another_admin_account(client, admin_user):
    """An admin cannot delete their own account or another admin account."""
    own_response = client.delete(
        f"/admin/users/{admin_user['id']}",
        headers=admin_user["headers"],
    )
    assert own_response.status_code == 400
    assert "own account" in own_response.json()["detail"].lower()

    other_admin_id = "second-admin-account"
    users_collection.insert_one({
        "_id": other_admin_id,
        "name": "Second Admin",
        "email": "second.admin@example.com",
        "password_hash": "test-hash",
        "role": "admin",
        "is_active": True,
        "is_verified": True,
        "verification_status": "approved",
    })
    other_response = client.delete(
        f"/admin/users/{other_admin_id}",
        headers=admin_user["headers"],
    )
    assert other_response.status_code == 403
    assert "admin accounts" in other_response.json()["detail"].lower()
    assert users_collection.find_one({"_id": other_admin_id}) is not None


def test_delete_user_requires_admin_and_existing_target(client, student_user, admin_user):
    """Only admins can delete users, and missing accounts return 404."""
    unauthenticated = client.delete(f"/admin/users/{student_user['id']}")
    assert unauthenticated.status_code == 401

    non_admin = client.delete(
        f"/admin/users/{student_user['id']}",
        headers=student_user["headers"],
    )
    assert non_admin.status_code == 403
    assert users_collection.find_one({"_id": student_user["id"]}) is not None

    missing = client.delete(
        "/admin/users/nonexistent-account-id",
        headers=admin_user["headers"],
    )
    assert missing.status_code == 404


# ============================================================
# VERIFICATION QUEUES VS REVIEWED ACCOUNT MANAGEMENT
# ============================================================

def test_student_verification_queue_only_returns_active_pending_requests():
    """Approved/rejected and inactive student accounts must not appear in verification."""
    headers = setup_test_users()
    pending_id = str(ObjectId())
    inactive_pending_id = str(ObjectId())
    rejected_id = str(ObjectId())
    approved_id = str(ObjectId())

    for user_id, email, active, verified, status in [
        (pending_id, "pending.only@example.com", True, False, "pending"),
        (inactive_pending_id, "inactive.pending@example.com", False, False, "pending"),
        (rejected_id, "already.rejected@example.com", True, False, "rejected"),
        (approved_id, "already.approved@example.com", True, True, "approved"),
    ]:
        users_collection.insert_one({
            "_id": user_id,
            "name": email.split("@")[0],
            "email": email,
            "role": "student",
            "is_active": active,
            "is_verified": verified,
            "verification_status": status,
            "student_profile": {"student_id": f"PRN-{user_id[:8]}"},
        })

    response = client.get("/admin/students/pending", headers=headers["admin"])
    assert response.status_code == 200
    returned_ids = {item["id"] for item in response.json()}
    assert returned_ids == {pending_id}

    # Once reviewed, the request must disappear from the verification queue.
    reviewed = client.patch(
        f"/admin/students/{pending_id}/verification?status=approved",
        headers=headers["admin"],
    )
    assert reviewed.status_code == 200

    refreshed = client.get("/admin/students/pending", headers=headers["admin"])
    assert refreshed.status_code == 200
    assert pending_id not in {item["id"] for item in refreshed.json()}


def test_alumni_verification_queue_only_returns_active_unverified_pending_requests():
    """Approved/rejected and inactive alumni accounts must not appear in verification."""
    headers = setup_test_users()
    pending_id = str(ObjectId())
    inactive_pending_id = str(ObjectId())
    rejected_id = str(ObjectId())
    approved_id = str(ObjectId())

    for user_id, email, active, verified, status in [
        (pending_id, "pending.alumni@example.com", True, False, "pending"),
        (inactive_pending_id, "inactive.pending.alumni@example.com", False, False, "pending"),
        (rejected_id, "already.rejected.alumni@example.com", True, False, "rejected"),
        (approved_id, "already.approved.alumni@example.com", True, True, "approved"),
    ]:
        users_collection.insert_one({
            "_id": user_id,
            "name": email.split("@")[0],
            "email": email,
            "role": "alumni",
            "is_active": active,
            "is_verified": verified,
            "verification_status": status,
            "alumni_profile": {"alumni_id": f"ALU-{user_id[:8]}"},
        })

    response = client.get("/alumni/pending", headers=headers["admin"])
    assert response.status_code == 200
    returned_ids = {item["id"] for item in response.json()}
    assert returned_ids == {pending_id}

    # Rejecting a pending request must remove it from the queue.
    reviewed = client.patch(
        f"/alumni/verify/{pending_id}?status=rejected",
        headers=headers["admin"],
    )
    assert reviewed.status_code == 200

    refreshed = client.get("/alumni/pending", headers=headers["admin"])
    assert refreshed.status_code == 200
    assert pending_id not in {item["id"] for item in refreshed.json()}


def test_legacy_verified_accounts_default_to_approved_in_admin_management():
    """Legacy verified users without an explicit status should show as approved."""
    headers = setup_test_users()
    student_id = str(ObjectId())
    users_collection.insert_one({
        "_id": student_id,
        "name": "Legacy Verified Student",
        "email": "legacy.verified@example.com",
        "role": "student",
        "is_active": True,
        "is_verified": True,
    })

    response = client.get("/admin/students", headers=headers["admin"])
    assert response.status_code == 200
    student = next(item for item in response.json() if item["id"] == student_id)
    assert student["verification_status"] == "approved"
