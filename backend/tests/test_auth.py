import pytest


def test_unauthenticated_protected_endpoint_returns_401(client):
    """Accessing a protected endpoint without Authorization header must return 401."""
    response = client.get("/profile/me")
    assert response.status_code == 401
    assert "Authentication credentials were not provided" in response.json().get("detail", "")


def test_invalid_token_returns_401(client):
    """Accessing a protected endpoint with an invalid token must return 401."""
    headers = {"Authorization": "Bearer totally.invalid.token"}
    response = client.get("/profile/me", headers=headers)
    assert response.status_code == 401
    assert "Invalid authentication token" in response.json().get("detail", "")


def test_register_student_success(client):
    """Registering a student with valid fields returns 201."""
    payload = {
        "name": "Jane Student",
        "email": "jane.student@example.com",
        "password": "SecurePassword123!",
        "role": "student",
        "student_id": "STU100",
        "department": "IT",
        "course": "B.Tech",
        "academic_year": "2nd",
        "graduation_year": "2027",
        "phone": "9998887776"
    }
    response = client.post("/auth/register", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["message"] == "Registration successful."
    assert "user_id" in data
    assert data["role"] == "student"


def test_register_duplicate_email_fails(client):
    """Registering the same email twice returns 400."""
    payload = {
        "name": "Duplicate Student",
        "email": "dup@example.com",
        "password": "Password123!",
        "role": "student"
    }
    res1 = client.post("/auth/register", json=payload)
    assert res1.status_code == 201

    res2 = client.post("/auth/register", json=payload)
    assert res2.status_code == 400
    assert "already exists" in res2.json().get("detail", "")


def test_register_admin_disallowed(client):
    """Attempting to self-register as admin returns 403."""
    payload = {
        "name": "Sneaky Admin",
        "email": "sneaky@example.com",
        "password": "Password123!",
        "role": "admin"
    }
    response = client.post("/auth/register", json=payload)
    assert response.status_code == 403
    assert "Only students and alumni can register" in response.json().get("detail", "")


def test_login_success(client):
    """Logging in with correct credentials returns 200 and access_token."""
    reg_payload = {
        "name": "Login User",
        "email": "loginuser@example.com",
        "password": "MySecretPassword123",
        "role": "student"
    }
    client.post("/auth/register", json=reg_payload)

    login_payload = {
        "email": "loginuser@example.com",
        "password": "MySecretPassword123"
    }
    response = client.post("/auth/login", json=login_payload)
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert data["user"]["role"] == "student"


def test_login_invalid_password(client):
    """Logging in with wrong password returns 401."""
    reg_payload = {
        "name": "Login User",
        "email": "loginuser2@example.com",
        "password": "MySecretPassword123",
        "role": "student"
    }
    client.post("/auth/register", json=reg_payload)

    response = client.post("/auth/login", json={
        "email": "loginuser2@example.com",
        "password": "WrongPassword!"
    })
    assert response.status_code == 401
    assert "Invalid email or password" in response.json().get("detail", "")


def test_login_nonexistent_user(client):
    """Logging in with non-existent email returns 401."""
    response = client.post("/auth/login", json={
        "email": "unknown@example.com",
        "password": "SomePassword123"
    })
    assert response.status_code == 401
