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
