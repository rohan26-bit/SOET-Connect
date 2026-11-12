"""End-to-end auth checks against the disposable local Supabase stack.

These tests intentionally live outside backend/tests so the mock-mode conftest
used by the fast unit suite cannot silently replace the real PostgREST client.
"""
import os
import uuid

from fastapi.testclient import TestClient

from database import users_collection
from main import app


LOCAL_ORIGIN = "http://localhost:3000"
ADMIN_SECRET = os.environ["ADMIN_REGISTRATION_SECRET"]


def _register_admin(client: TestClient, email: str) -> None:
    response = client.post(
        "/api/auth/register",
        headers={"Origin": LOCAL_ORIGIN},
        json={
            "name": "Local Integration Admin",
            "email": email,
            "password": "Local-Integration-Password-123!",
            "role": "admin",
            "admin_secret": ADMIN_SECRET,
        },
    )
    assert response.status_code == 201, response.text


def test_real_supabase_cookie_sessions_are_independent_per_device():
    email = f"local-auth-{uuid.uuid4().hex}@example.com"
    password = "Local-Integration-Password-123!"

    with TestClient(app) as device_a, TestClient(app) as device_b:
        try:
            _register_admin(device_a, email)
            assert users_collection.find_one({"email": email}) is not None

            login_a = device_a.post(
                "/api/auth/login",
                headers={
                    "Origin": LOCAL_ORIGIN,
                    "User-Agent": "TestClient Windows device A",
                },
                json={"email": email, "password": password},
            )
            assert login_a.status_code == 200, login_a.text
            assert "access_token" not in login_a.json()

            cookie_header = login_a.headers.get("set-cookie", "")
            assert "soet_access_token=" in cookie_header
            assert "httponly" in cookie_header.lower()
            assert "path=/api" in cookie_header.lower()
            assert "samesite=lax" in cookie_header.lower()

            profile = device_a.get("/api/profile/me")
            assert profile.status_code == 200, profile.text
            assert profile.json()["email"] == email

            login_b = device_b.post(
                "/api/auth/login",
                headers={
                    "Origin": LOCAL_ORIGIN,
                    "User-Agent": "TestClient Android device B",
                },
                json={"email": email, "password": password},
            )
            assert login_b.status_code == 200, login_b.text
            assert "access_token" not in login_b.json()

            sessions_a = device_a.get("/api/auth/sessions")
            assert sessions_a.status_code == 200, sessions_a.text
            active = sessions_a.json()["sessions"]
            assert len(active) == 2
            assert sum(bool(session["is_current"]) for session in active) == 1

            blocked_logout = device_a.post(
                "/api/auth/logout",
                headers={"Origin": "https://attacker.invalid"},
            )
            assert blocked_logout.status_code == 403
            assert len(device_a.get("/api/auth/sessions").json()["sessions"]) == 2

            logout_a = device_a.post(
                "/api/auth/logout",
                headers={"Origin": LOCAL_ORIGIN},
            )
            assert logout_a.status_code == 200, logout_a.text
            assert device_a.get("/api/auth/sessions").status_code == 401

            # Revoking one browser must not invalidate the other browser's session.
            sessions_b = device_b.get("/api/auth/sessions")
            assert sessions_b.status_code == 200, sessions_b.text
            assert len(sessions_b.json()["sessions"]) == 1

            logout_b = device_b.post(
                "/api/auth/logout",
                headers={"Origin": LOCAL_ORIGIN},
            )
            assert logout_b.status_code == 200, logout_b.text
            assert device_b.get("/api/auth/sessions").status_code == 401
        finally:
            users_collection.delete_one({"email": email})


def test_real_postgres_prn_registry_prevents_cross_role_reuse():
    suffix = uuid.uuid4().hex
    prn = f"{uuid.uuid4().int % 10**10:010d}"
    student_email = f"local-student-{suffix}@example.com"
    alumni_email = f"local-alumni-{suffix}@example.com"

    with TestClient(app) as client:
        try:
            student = client.post(
                "/api/auth/register",
                json={
                    "name": "Local Test Student",
                    "email": student_email,
                    "password": "Local-Student-Password-123!",
                    "role": "student",
                    "student_id": prn,
                    "department": "Computer Science",
                    "course": "B.Tech",
                    "academic_year": "2026-27",
                    "graduation_year": "2027",
                    "phone": "9999999999",
                },
            )
            assert student.status_code == 201, student.text

            availability = client.get(
                "/api/auth/check-prn",
                params={"prn": prn},
            )
            assert availability.status_code == 200, availability.text
            assert availability.json()["available"] is False

            duplicate_alumni = client.post(
                "/api/auth/register",
                json={
                    "name": "Local Test Alumni",
                    "email": alumni_email,
                    "password": "Local-Alumni-Password-123!",
                    "role": "alumni",
                    "alumni_id": prn,
                },
            )
            assert duplicate_alumni.status_code == 409, duplicate_alumni.text
            assert users_collection.find_one({"email": alumni_email}) is None
        finally:
            users_collection.delete_one({"email": student_email})
            users_collection.delete_one({"email": alumni_email})
