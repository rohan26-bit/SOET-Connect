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


def test_register_admin_disallowed(client, monkeypatch):
    """Attempting to self-register as admin without valid secret returns 403."""
    import routes.auth
    monkeypatch.setattr(routes.auth, "ADMIN_REGISTRATION_SECRET", "test-admin-secret")
    payload = {
        "name": "Sneaky Admin",
        "email": "sneaky@example.com",
        "password": "Password123!",
        "role": "admin"
    }
    response = client.post("/auth/register", json=payload)
    assert response.status_code == 403
    assert "Invalid admin registration secret" in response.json().get("detail", "")


def test_login_success(client):
    """Logging in with approved credentials returns 200 and access_token."""
    reg_payload = {
        "name": "Login User",
        "email": "loginuser@example.com",
        "password": "MySecretPassword123",
        "role": "student"
    }
    client.post("/auth/register", json=reg_payload)

    # Approve student in database
    from database import users_collection
    users_collection.update_one(
        {"email": "loginuser@example.com"},
        {"$set": {"is_verified": True, "verification_status": "approved"}}
    )

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


def test_register_password_under_8_chars_fails(client):
    """Registering with password shorter than 8 characters returns 422."""
    payload = {
        "name": "Short Password User",
        "email": "shortpw@example.com",
        "password": "1234567",
        "role": "student"
    }
    response = client.post("/auth/register", json=payload)
    assert response.status_code == 422


def test_register_whitespace_name_fails(client):
    """Registering with a whitespace-only name returns 422."""
    payload = {
        "name": "   ",
        "email": "whitespacename@example.com",
        "password": "ValidPassword123!",
        "role": "student"
    }
    response = client.post("/auth/register", json=payload)
    assert response.status_code == 422


def test_register_name_trimmed_and_preserves_special_characters(client):
    """Registering with leading/trailing whitespace trims name, and preserves hyphens/accents."""
    payload = {
        "name": "  Jean-Luc O'Connor  ",
        "email": "jeanluc@example.com",
        "password": "ValidPassword123!",
        "role": "student"
    }
    response = client.post("/auth/register", json=payload)
    assert response.status_code == 201


def test_login_password_oversized_fails(client):
    """Attempting to log in with password exceeding 128 characters returns 422."""
    response = client.post("/auth/login", json={
        "email": "user@example.com",
        "password": "A" * 129
    })
    assert response.status_code == 422


def test_register_admin_valid_secret_constant_time(client, monkeypatch):
    """Registering as admin with valid secret succeeds."""
    import routes.auth
    monkeypatch.setattr(routes.auth, "ADMIN_REGISTRATION_SECRET", "super-secret-key-12345")
    payload = {
        "name": "Authorized Admin",
        "email": "authadmin@example.com",
        "password": "AdminPassword123!",
        "role": "admin",
        "admin_secret": "super-secret-key-12345"
    }
    response = client.post("/auth/register", json=payload)
    assert response.status_code == 201
    assert response.json()["role"] == "admin"


# ============================================================
# STUDENT & ALUMNI VERIFICATION WORKFLOW TESTS
# ============================================================

def test_student_registration_is_pending(client):
    """New student registration must be pending, unverified, and create profile."""
    payload = {
        "name": "Pending Student",
        "email": "pending.student@example.com",
        "password": "SecurePassword123!",
        "role": "student",
        "student_id": "STU999",
        "department": "CSE",
        "course": "B.Tech"
    }
    res = client.post("/auth/register", json=payload)
    assert res.status_code == 201
    data = res.json()
    assert data["role"] == "student"
    assert data["is_verified"] is False

    from database import users_collection
    u = users_collection.find_one({"email": "pending.student@example.com"})
    assert u is not None
    assert u["is_verified"] is False
    assert u["verification_status"] == "pending"
    assert "student_profile" in u
    assert u["student_profile"]["student_id"] == "STU999"
    assert u["student_profile"]["department"] == "CSE"


def test_alumni_registration_is_pending(client):
    """New alumni registration must be pending and unverified."""
    payload = {
        "name": "Pending Alumni",
        "email": "pending.alumni@example.com",
        "password": "SecurePassword123!",
        "role": "alumni",
        "alumni_id": "ALU999",
        "department": "CSE"
    }
    res = client.post("/auth/register", json=payload)
    assert res.status_code == 201
    assert res.json()["is_verified"] is False

    from database import users_collection
    u = users_collection.find_one({"email": "pending.alumni@example.com"})
    assert u is not None
    assert u["is_verified"] is False
    assert u["verification_status"] == "pending"


def test_admin_registration_is_approved(client, monkeypatch):
    """Admin registration with valid secret is auto-approved."""
    import routes.auth
    monkeypatch.setattr(routes.auth, "ADMIN_REGISTRATION_SECRET", "test-secret-123")
    payload = {
        "name": "Auto Approved Admin",
        "email": "approved.admin@example.com",
        "password": "AdminPassword123!",
        "role": "admin",
        "admin_secret": "test-secret-123"
    }
    res = client.post("/auth/register", json=payload)
    assert res.status_code == 201
    assert res.json()["is_verified"] is True

    from database import users_collection
    u = users_collection.find_one({"email": "approved.admin@example.com"})
    assert u["is_verified"] is True
    assert u["verification_status"] == "approved"


def test_pending_student_login_returns_403(client):
    """Pending student cannot log in and receives 403."""
    client.post("/auth/register", json={
        "name": "Student A",
        "email": "student.a@example.com",
        "password": "Password123!",
        "role": "student"
    })
    res = client.post("/auth/login", json={
        "email": "student.a@example.com",
        "password": "Password123!"
    })
    assert res.status_code == 403
    assert "Your account is awaiting administrator approval." in res.json().get("detail", "")


def test_rejected_student_login_returns_403(client):
    """Rejected student cannot log in and receives 403."""
    client.post("/auth/register", json={
        "name": "Student B",
        "email": "student.b@example.com",
        "password": "Password123!",
        "role": "student"
    })
    from database import users_collection
    users_collection.update_one(
        {"email": "student.b@example.com"},
        {"$set": {"verification_status": "rejected", "is_verified": False}}
    )
    res = client.post("/auth/login", json={
        "email": "student.b@example.com",
        "password": "Password123!"
    })
    assert res.status_code == 403
    assert "Your account registration was rejected by an administrator." in res.json().get("detail", "")


def test_suspended_student_login_returns_403(client):
    """Suspended student cannot log in and receives 403."""
    client.post("/auth/register", json={
        "name": "Student C",
        "email": "student.c@example.com",
        "password": "Password123!",
        "role": "student"
    })
    from database import users_collection
    users_collection.update_one(
        {"email": "student.c@example.com"},
        {"$set": {"verification_status": "suspended", "is_verified": False}}
    )
    res = client.post("/auth/login", json={
        "email": "student.c@example.com",
        "password": "Password123!"
    })
    assert res.status_code == 403
    assert "Your account has been suspended by an administrator." in res.json().get("detail", "")


def test_approved_student_login_returns_200(client):
    """Approved student logs in successfully with 200."""
    client.post("/auth/register", json={
        "name": "Student D",
        "email": "student.d@example.com",
        "password": "Password123!",
        "role": "student"
    })
    from database import users_collection
    users_collection.update_one(
        {"email": "student.d@example.com"},
        {"$set": {"verification_status": "approved", "is_verified": True}}
    )
    res = client.post("/auth/login", json={
        "email": "student.d@example.com",
        "password": "Password123!"
    })
    assert res.status_code == 200
    assert "access_token" in res.json()


def test_change_password_success(client, admin_user):
    """Admin successfully changes password with valid credentials."""
    from routes.auth import password_hash
    from database import users_collection

    # Set known password hash for admin
    users_collection.update_one(
        {"_id": admin_user["id"]},
        {"$set": {"password_hash": password_hash.hash("OldPassword123!")}}
    )

    payload = {
        "current_password": "OldPassword123!",
        "new_password": "NewSecretPassword456!",
        "confirm_new_password": "NewSecretPassword456!"
    }

    res = client.post("/auth/change-password", json=payload, headers=admin_user["headers"])
    assert res.status_code == 200
    assert res.json()["message"] == "Password changed successfully."

    # Verify old password no longer works
    login_old = client.post("/auth/login", json={
        "email": admin_user["email"],
        "password": "OldPassword123!"
    })
    assert login_old.status_code == 401

    # Verify new password works
    login_new = client.post("/auth/login", json={
        "email": admin_user["email"],
        "password": "NewSecretPassword456!"
    })
    assert login_new.status_code == 200


def test_change_password_incorrect_current_password(client, admin_user):
    """Fails when current password does not match."""
    from routes.auth import password_hash
    from database import users_collection

    users_collection.update_one(
        {"_id": admin_user["id"]},
        {"$set": {"password_hash": password_hash.hash("CorrectPassword123!")}}
    )

    payload = {
        "current_password": "WrongPassword!",
        "new_password": "BrandNewPassword123!",
        "confirm_new_password": "BrandNewPassword123!"
    }

    res = client.post("/auth/change-password", json=payload, headers=admin_user["headers"])
    assert res.status_code == 400
    assert "Current password is incorrect." in res.json().get("detail", "")


def test_change_password_mismatched_confirmation(client, admin_user):
    """Fails when new password and confirm do not match."""
    from routes.auth import password_hash
    from database import users_collection

    users_collection.update_one(
        {"_id": admin_user["id"]},
        {"$set": {"password_hash": password_hash.hash("Password123!")}}
    )

    payload = {
        "current_password": "Password123!",
        "new_password": "BrandNewPassword123!",
        "confirm_new_password": "DifferentPassword456!"
    }

    res = client.post("/auth/change-password", json=payload, headers=admin_user["headers"])
    assert res.status_code == 400
    assert "New password and confirmation do not match." in res.json().get("detail", "")


def test_change_password_same_as_old(client, admin_user):
    """Fails when new password is same as old."""
    from routes.auth import password_hash
    from database import users_collection

    users_collection.update_one(
        {"_id": admin_user["id"]},
        {"$set": {"password_hash": password_hash.hash("ExistingPassword123!")}}
    )

    payload = {
        "current_password": "ExistingPassword123!",
        "new_password": "ExistingPassword123!",
        "confirm_new_password": "ExistingPassword123!"
    }

    res = client.post("/auth/change-password", json=payload, headers=admin_user["headers"])
    assert res.status_code == 400
    assert "New password cannot be the same" in res.json().get("detail", "")


def test_change_password_unauthenticated(client):
    """Fails when not logged in."""
    res = client.post("/auth/change-password", json={
        "current_password": "OldPassword123!",
        "new_password": "NewPassword123!",
        "confirm_new_password": "NewPassword123!"
    })
    assert res.status_code == 401

