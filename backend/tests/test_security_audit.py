import pytest
from datetime import datetime, timezone
from database import users_collection
from security.jwt import create_access_token


def _create_deactivated_user(role="student"):
    now = datetime.now(timezone.utc)
    doc = {
        "name": "Deactivated User",
        "email": f"deactivated_{role}@example.com",
        "password_hash": "mock_pw",
        "role": role,
        "is_active": False,
        "is_verified": True,
        "created_at": now,
        "updated_at": now
    }
    res = users_collection.insert_one(doc)
    user_id = str(res.inserted_id)
    token = create_access_token(user_id=user_id, role=role)
    return {
        "id": user_id,
        "role": role,
        "token": token,
        "headers": {"Authorization": f"Bearer {token}"}
    }


def test_deactivated_account_blocked_from_profile(client):
    """Deactivated accounts receive 403 when trying to access or update profile."""
    user = _create_deactivated_user("student")

    res_get = client.get("/profile/me", headers=user["headers"])
    assert res_get.status_code == 403
    assert "deactivated" in res_get.json().get("detail", "").lower()

    res_patch = client.patch("/profile/me", json={"phone": "1234567890"}, headers=user["headers"])
    assert res_patch.status_code == 403
    assert "deactivated" in res_patch.json().get("detail", "").lower()


def test_deactivated_account_blocked_from_actions(client, admin_user):
    """Deactivated accounts cannot post jobs, create events, apply, or register."""
    alumni = _create_deactivated_user("alumni")
    student = _create_deactivated_user("student")

    # Cannot post jobs
    res_job = client.post("/jobs", json={
        "title": "Blocked Job",
        "company": "Co",
        "description": "Desc",
        "location": "Remote",
        "employment_type": "full-time"
    }, headers=alumni["headers"])
    assert res_job.status_code == 403
    assert "deactivated" in res_job.json().get("detail", "").lower()

    # Cannot create events
    res_ev = client.post("/events", json={
        "title": "Blocked Event",
        "description": "Desc",
        "event_date": "2026-12-01",
        "event_time": "10:00",
        "location": "Online"
    }, headers=alumni["headers"])
    assert res_ev.status_code == 403
    assert "deactivated" in res_ev.json().get("detail", "").lower()

    # Admin creates approved job & event
    res_app_job = client.post("/jobs", json={
        "title": "Open Job",
        "company": "Co",
        "description": "Desc",
        "location": "Remote",
        "employment_type": "full-time"
    }, headers=admin_user["headers"])
    job_id = res_app_job.json()["job"]["id"]

    res_app_ev = client.post("/events", json={
        "title": "Open Event",
        "description": "Desc",
        "event_date": "2026-12-10",
        "event_time": "10:00",
        "location": "Hall"
    }, headers=admin_user["headers"])
    event_id = res_app_ev.json()["event"]["id"]

    # Deactivated student cannot apply to job
    res_apply = client.post(f"/jobs/{job_id}/applications", json={"resume_url": "https://example.com/r.pdf"}, headers=student["headers"])
    assert res_apply.status_code == 403
    assert "deactivated" in res_apply.json().get("detail", "").lower()

    # Deactivated student cannot register for event
    res_reg = client.post(f"/events/{event_id}/register", headers=student["headers"])
    assert res_reg.status_code == 403
    assert "deactivated" in res_reg.json().get("detail", "").lower()


def test_alumni_directory_search_with_null_fields(client, student_user):
    """Alumni directory search handles users with null name/company/skills without crashing."""
    users_collection.insert_one({
        "name": None,
        "email": "nullfields@example.com",
        "role": "alumni",
        "is_active": True,
        "is_verified": True,
        "alumni_profile": {
            "company": None,
            "designation": None,
            "industry": None,
            "skills": None
        }
    })

    res = client.get("/alumni/directory?search=tech", headers=student_user["headers"])
    assert res.status_code == 200
    assert isinstance(res.json(), list)


def test_profile_lookup_with_string_uuid(client):
    """Profile retrieval works when user ID is a non-ObjectId string (e.g. UUID)."""
    uuid_str = "usr-12345678-abcd-1234-abcd-123456789abc"
    users_collection.insert_one({
        "_id": uuid_str,
        "name": "UUID User",
        "email": "uuid@example.com",
        "role": "student",
        "is_active": True,
        "is_verified": True,
        "student_profile": {"department": "Robotics"}
    })
    token = create_access_token(user_id=uuid_str, role="student")
    headers = {"Authorization": f"Bearer {token}"}

    res = client.get("/profile/me", headers=headers)
    assert res.status_code == 200
    assert res.json()["name"] == "UUID User"
    assert res.json()["student_profile"]["department"] == "Robotics"


def test_jwt_secret_resolution_in_mock_mode(monkeypatch):
    """In mock mode (DATABASE_MODE=mock), fallback test secret is allowed if JWT_SECRET_KEY is unset."""
    from security.jwt import get_jwt_secret_key, create_access_token, decode_access_token

    monkeypatch.setenv("DATABASE_MODE", "mock")
    monkeypatch.setenv("JWT_SECRET_KEY", "")

    secret = get_jwt_secret_key()
    assert "test-only-mock" in secret

    # Generating and decoding tokens works with the fallback secret
    token = create_access_token(user_id="mock_user_1", role="student")
    payload = decode_access_token(token)
    assert payload["user_id"] == "mock_user_1"
    assert payload["role"] == "student"


def test_jwt_secret_resolution_in_production_mode_fails_when_missing(monkeypatch):
    """In normal/production mode, missing or empty JWT_SECRET_KEY must raise ValueError."""
    from security.jwt import get_jwt_secret_key

    # Normal mode (no mock)
    monkeypatch.setenv("DATABASE_MODE", "")
    monkeypatch.setenv("JWT_SECRET_KEY", "")

    with pytest.raises(ValueError, match="JWT_SECRET_KEY is not set"):
        get_jwt_secret_key()

    # Whitespace only should also fail
    monkeypatch.setenv("JWT_SECRET_KEY", "   ")
    with pytest.raises(ValueError, match="JWT_SECRET_KEY is not set"):
        get_jwt_secret_key()


def test_jwt_secret_resolution_in_production_mode_succeeds_with_key(monkeypatch):
    """In normal/production mode, valid JWT_SECRET_KEY is returned and used."""
    from security.jwt import get_jwt_secret_key, create_access_token, decode_access_token

    monkeypatch.setenv("DATABASE_MODE", "")
    monkeypatch.setenv("JWT_SECRET_KEY", "super-secret-production-key-123456789")

    secret = get_jwt_secret_key()
    assert secret == "super-secret-production-key-123456789"

    token = create_access_token(user_id="prod_user", role="admin")
    payload = decode_access_token(token)
    assert payload["user_id"] == "prod_user"
    assert payload["role"] == "admin"


# ============================================================
# DEACTIVATED USER JWT HARDENING ON PROTECTED READ ENDPOINTS
# ============================================================

def test_active_user_reads_succeed(client, student_user, verified_alumni_user):
    """Active user with valid unexpired JWT can access protected READ endpoints."""
    # Profile
    res_prof = client.get("/profile/me", headers=student_user["headers"])
    assert res_prof.status_code == 200

    # Jobs
    res_jobs = client.get("/jobs", headers=student_user["headers"])
    assert res_jobs.status_code == 200

    # Events
    res_ev = client.get("/events", headers=student_user["headers"])
    assert res_ev.status_code == 200

    # Announcements
    res_ann = client.get("/announcements", headers=student_user["headers"])
    assert res_ann.status_code == 200

    # Notifications
    res_notif = client.get("/notifications", headers=student_user["headers"])
    assert res_notif.status_code == 200

    # Alumni directory
    res_dir = client.get("/alumni/directory", headers=student_user["headers"])
    assert res_dir.status_code == 200


@pytest.mark.parametrize("endpoint", [
    "/profile/me",
    "/jobs",
    "/applications/mine",
    "/events",
    "/announcements",
    "/notifications",
    "/alumni/directory",
])
def test_deactivated_user_blocked_across_read_endpoints(client, student_user, endpoint):
    """When a user is deactivated, their unexpired JWT is rejected with 403 on protected READ endpoints."""
    users_collection.update_one(
        {"_id": student_user["doc_id"]},
        {"$set": {"is_active": False}}
    )

    res = client.get(endpoint, headers=student_user["headers"])
    assert res.status_code == 403
    assert "deactivated" in res.json().get("detail", "").lower()


def test_admin_active_and_deactivated_behavior(client, admin_user):
    """Active admin can access admin READ endpoints; deactivated admin is rejected."""
    # Active admin succeeds
    res_metrics = client.get("/admin/metrics", headers=admin_user["headers"])
    assert res_metrics.status_code == 200
    res_stats = client.get("/admin/stats", headers=admin_user["headers"])
    assert res_stats.status_code == 200
    res_students = client.get("/admin/students", headers=admin_user["headers"])
    assert res_students.status_code == 200

    # Deactivate admin in DB
    users_collection.update_one(
        {"_id": admin_user["doc_id"]},
        {"$set": {"is_active": False}}
    )

    # Deactivated admin rejected on admin read endpoints
    res_deact_metrics = client.get("/admin/metrics", headers=admin_user["headers"])
    assert res_deact_metrics.status_code == 403
    assert "deactivated" in res_deact_metrics.json().get("detail", "").lower()

    res_deact_stats = client.get("/admin/stats", headers=admin_user["headers"])
    assert res_deact_stats.status_code == 403
    assert "deactivated" in res_deact_stats.json().get("detail", "").lower()

    res_deact_pending = client.get("/alumni/pending", headers=admin_user["headers"])
    assert res_deact_pending.status_code == 403
    assert "deactivated" in res_deact_pending.json().get("detail", "").lower()


@pytest.mark.parametrize("endpoint", [
    "/profile/me",
    "/jobs",
    "/events",
    "/announcements",
    "/notifications",
    "/admin/metrics",
    "/alumni/directory",
])
def test_unauthenticated_reads_fail(client, endpoint):
    """Requests without JWT to protected READ endpoints must return 401."""
    res = client.get(endpoint)
    assert res.status_code == 401


def test_rbac_and_ownership_protections_intact(client, student_user, verified_alumni_user, admin_user):
    """RBAC and resource ownership protections remain strictly enforced."""
    # Non-admin cannot access admin endpoints
    res_admin = client.get("/admin/metrics", headers=student_user["headers"])
    assert res_admin.status_code == 403
    assert "admin" in res_admin.json().get("detail", "").lower()

    res_pending = client.get("/alumni/pending", headers=verified_alumni_user["headers"])
    assert res_pending.status_code == 403
    assert "admin" in res_pending.json().get("detail", "").lower()


def test_user_reactivation_cycle(client, student_user):
    """Reactivating a suspended user immediately restores access for their valid JWT without reissuing."""
    # 1. Active -> 200
    res1 = client.get("/jobs", headers=student_user["headers"])
    assert res1.status_code == 200

    # 2. Deactivate in DB -> same JWT receives 403
    users_collection.update_one(
        {"_id": student_user["doc_id"]},
        {"$set": {"is_active": False}}
    )
    res2 = client.get("/jobs", headers=student_user["headers"])
    assert res2.status_code == 403
    assert "deactivated" in res2.json().get("detail", "").lower()

    # 3. Reactivate in DB -> same JWT receives 200 again
    users_collection.update_one(
        {"_id": student_user["doc_id"]},
        {"$set": {"is_active": True}}
    )
    res3 = client.get("/jobs", headers=student_user["headers"])
    assert res3.status_code == 200


def test_chat_with_active_and_deactivated_user(client, student_user):
    """Chat endpoints continue to enforce active status through their existing dependency."""
    # Active -> 200
    res_chat = client.get("/chat/conversations", headers=student_user["headers"])
    assert res_chat.status_code == 200

    # Deactivated -> 403
    users_collection.update_one(
        {"_id": student_user["doc_id"]},
        {"$set": {"is_active": False}}
    )
    res_deact_chat = client.get("/chat/conversations", headers=student_user["headers"])
    assert res_deact_chat.status_code == 403
    assert "deactivated" in res_deact_chat.json().get("detail", "").lower()
