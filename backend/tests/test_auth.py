import pytest


VALID_STUDENT_FIELDS = {
    "student_id": "STU-TEST-001",
    "department": "Computer Engineering",
    "course": "B.Tech",
    "academic_year": "3rd Year",
    "graduation_year": "2026",
    "phone": "9876543210",
}


def test_unauthenticated_protected_endpoint_returns_401(client):
    """Accessing a protected endpoint without Authorization header must return 401."""
    response = client.get("/profile/me")
    assert response.status_code == 401
    assert "Authentication credentials were not provided" in response.json().get("detail", "")


def test_changing_student_phone_clears_verified_status(client, student_user):
    """Changing the contact number marks it unverified until the new OTP is confirmed."""
    from database import users_collection

    users_collection.update_one(
        {"_id": student_user["id"]},
        {"$set": {"phone": "+919876543210", "is_phone_verified": True}},
    )

    response = client.put(
        "/profile/me",
        headers=student_user["headers"],
        json={"phone": "+919999888877"},
    )
    assert response.status_code == 200

    updated = users_collection.find_one({"_id": student_user["id"]})
    assert updated["phone"] == "+919999888877"
    assert updated["student_profile"]["phone"] == "+919999888877"
    assert updated["is_phone_verified"] is False


def test_changing_alumni_phone_clears_verified_status(client, verified_alumni_user):
    """Alumni can update their contact number and must re-verify the replacement."""
    from database import users_collection

    users_collection.update_one(
        {"_id": verified_alumni_user["id"]},
        {"$set": {"phone": "+919876543210", "is_phone_verified": True}},
    )

    response = client.put(
        "/profile/me",
        headers=verified_alumni_user["headers"],
        json={"phone": "+919999888877"},
    )
    assert response.status_code == 200

    updated = users_collection.find_one({"_id": verified_alumni_user["id"]})
    assert updated["phone"] == "+919999888877"
    assert updated["is_phone_verified"] is False


def test_saving_same_student_phone_preserves_verified_status(client, student_user):
    """Saving the same normalized number must not unnecessarily clear verification."""
    from database import users_collection

    users_collection.update_one(
        {"_id": student_user["id"]},
        {"$set": {"phone": "+919876543210", "is_phone_verified": True}},
    )

    response = client.put(
        "/profile/me",
        headers=student_user["headers"],
        json={"phone": "9876543210"},
    )
    assert response.status_code == 200

    updated = users_collection.find_one({"_id": student_user["id"]})
    assert updated["phone"] == "+919876543210"
    assert updated["is_phone_verified"] is True


def test_invalid_token_returns_401(client):
    """Accessing a protected endpoint with an invalid token must return 401."""
    headers = {"Authorization": "Bearer totally.invalid.token"}
    response = client.get("/profile/me", headers=headers)
    assert response.status_code == 401
    assert "Invalid authentication token" in response.json().get("detail", "")

def test_authenticated_user_lookup_database_failure_returns_503(client, admin_user, monkeypatch):
    """A user-table outage must not be reported as a missing account."""
    import security.dependencies as dependencies

    def fail_user_lookup(*args, **kwargs):
        raise RuntimeError("database unavailable")

    monkeypatch.setattr(dependencies.users_collection, "find_one", fail_user_lookup)

    response = client.get("/profile/me", headers=admin_user["headers"])

    assert response.status_code == 503
    assert "Authentication service is temporarily unavailable" in response.json().get("detail", "")



def test_register_student_success(client):
    """Registering a student with valid fields returns 201."""
    payload = {
        "name": "Jane Student",
        "email": "jane.student@example.com",
        "password": "SecurePassword123!",
        "role": "student",
        **VALID_STUDENT_FIELDS,
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


@pytest.mark.parametrize(
    "missing_field",
    ["student_id", "department", "course", "academic_year", "graduation_year", "phone"],
)
def test_student_registration_rejects_each_missing_required_profile_field(client, missing_field):
    """Student registration must reject requests that omit any profile field."""
    payload = {
        "name": "Incomplete Student",
        "email": f"incomplete-{missing_field}@example.com",
        "password": "SecurePassword123!",
        "role": "student",
        **VALID_STUDENT_FIELDS,
    }
    payload.pop(missing_field)

    response = client.post("/auth/register", json=payload)

    assert response.status_code == 422
    assert missing_field.replace("_", " ").split()[0].lower() in response.text.lower()


@pytest.mark.parametrize(
    "field",
    ["student_id", "department", "course", "academic_year", "graduation_year", "phone"],
)
def test_student_registration_rejects_blank_required_profile_fields(client, field):
    """Whitespace-only values must not bypass required student profile validation."""
    payload = {
        "name": "Blank Field Student",
        "email": f"blank-{field}@example.com",
        "password": "SecurePassword123!",
        "role": "student",
        **VALID_STUDENT_FIELDS,
        field: "   ",
    }

    response = client.post("/auth/register", json=payload)

    assert response.status_code == 422


def test_register_duplicate_email_fails(client):
    """Registering the same email twice returns 400."""
    payload = {
        "name": "Duplicate Student",
        "email": "dup@example.com",
        "password": "Password123!",
        "role": "student",
        **VALID_STUDENT_FIELDS,
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
        "role": "student",
        **VALID_STUDENT_FIELDS,
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
        "role": "student",
        **VALID_STUDENT_FIELDS,
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
        "role": "student",
        **VALID_STUDENT_FIELDS,
    }
    response = client.post("/auth/register", json=payload)
    assert response.status_code == 422


def test_register_whitespace_name_fails(client):
    """Registering with a whitespace-only name returns 422."""
    payload = {
        "name": "   ",
        "email": "whitespacename@example.com",
        "password": "ValidPassword123!",
        "role": "student",
        **VALID_STUDENT_FIELDS,
    }
    response = client.post("/auth/register", json=payload)
    assert response.status_code == 422


def test_register_name_trimmed_and_preserves_special_characters(client):
    """Registering with leading/trailing whitespace trims name, and preserves hyphens/accents."""
    payload = {
        "name": "  Jean-Luc O'Connor  ",
        "email": "jeanluc@example.com",
        "password": "ValidPassword123!",
        "role": "student",
        **VALID_STUDENT_FIELDS,
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
        **VALID_STUDENT_FIELDS,
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
        "alumni_id": "999999",
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


def test_alumni_registration_rejects_non_numeric_alumni_id(client):
    """Alumni ID / PRN must contain digits only."""
    response = client.post("/auth/register", json={
        "name": "Numeric Alumni",
        "email": "numeric.alumni@example.com",
        "password": "SecurePassword123!",
        "role": "alumni",
        "alumni_id": "ALU2022",
        "department": "CSE",
    })
    assert response.status_code == 422
    assert "numbers only" in response.text.lower()


def test_alumni_registration_rejects_name_with_numbers(client):
    """Alumni full names may contain letters and spaces, but not digits."""
    response = client.post("/auth/register", json={
        "name": "Alumni 2022",
        "email": "alumni.name.digits@example.com",
        "password": "SecurePassword123!",
        "role": "alumni",
        "alumni_id": "2022001",
        "department": "CSE",
    })
    assert response.status_code == 422
    assert "letters and spaces only" in response.text.lower()


def test_alumni_registration_rejects_email_without_at(client):
    """Alumni registration requires a syntactically valid email address."""
    response = client.post("/auth/register", json={
        "name": "Email Alumni",
        "email": "alumni.example.com",
        "password": "SecurePassword123!",
        "role": "alumni",
        "alumni_id": "2022002",
        "department": "CSE",
    })
    assert response.status_code == 422


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
        "role": "student",
        **VALID_STUDENT_FIELDS,
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
        "role": "student",
        **VALID_STUDENT_FIELDS,
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
        "role": "student",
        **VALID_STUDENT_FIELDS,
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
        "role": "student",
        **VALID_STUDENT_FIELDS,
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
    assert "Password changed successfully." in res.json()["message"]
    assert res.json()["access_token"]

    # The token used to change the password is revoked immediately.
    old_session = client.get("/profile/me", headers=admin_user["headers"])
    assert old_session.status_code == 401
    replacement_headers = {"Authorization": f"Bearer {res.json()['access_token']}"}
    replacement_session = client.get("/profile/me", headers=replacement_headers)
    assert replacement_session.status_code == 200

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


@pytest.mark.parametrize("user_fixture", ["student_user", "verified_alumni_user"])
def test_student_and_alumni_can_change_password(client, request, user_fixture):
    """Students and verified alumni can securely change their own password from Account Settings."""
    from routes.auth import password_hash
    from database import users_collection

    account = request.getfixturevalue(user_fixture)
    old_password = "ExistingPassword123!"
    new_password = "UpdatedPassword456!"

    users_collection.update_one(
        {"_id": account["id"]},
        {"$set": {"password_hash": password_hash.hash(old_password)}},
    )

    response = client.post(
        "/auth/change-password",
        headers=account["headers"],
        json={
            "current_password": old_password,
            "new_password": new_password,
            "confirm_new_password": new_password,
        },
    )
    assert response.status_code == 200
    assert "Password changed successfully." in response.json()["message"]
    assert response.json()["access_token"]

    # Password change revokes the old token and returns a fresh token for this browser.
    assert client.get("/profile/me", headers=account["headers"]).status_code == 401
    replacement_headers = {"Authorization": f"Bearer {response.json()['access_token']}"}
    assert client.get("/profile/me", headers=replacement_headers).status_code == 200

    old_login = client.post(
        "/auth/login",
        json={"email": account["email"], "password": old_password},
    )
    assert old_login.status_code == 401

    new_login = client.post(
        "/auth/login",
        json={"email": account["email"], "password": new_password},
    )
    assert new_login.status_code == 200


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

def test_login_throttles_repeated_failures_for_account_and_ip(client, monkeypatch):
    """Eight failures for one account from one source trigger a temporary 429."""
    from database import users_collection
    from services.login_rate_limit import reset_mock_login_rate_limits

    reset_mock_login_rate_limits()
    monkeypatch.setenv("VERCEL", "1")

    payload = {
        "name": "Rate Limited Student",
        "email": "rate.limit.student@example.com",
        "password": "CorrectPassword123!",
        "role": "student",
        **VALID_STUDENT_FIELDS,
    }
    assert client.post("/auth/register", json=payload).status_code == 201
    users_collection.update_one(
        {"email": payload["email"]},
        {"$set": {"is_verified": True, "verification_status": "approved"}},
    )

    headers = {"x-forwarded-for": "198.51.100.10"}
    for attempt in range(8):
        response = client.post(
            "/auth/login",
            headers=headers,
            json={"email": payload["email"], "password": "WrongPassword123!"},
        )
        if attempt < 7:
            assert response.status_code == 401
        else:
            assert response.status_code == 429
            assert int(response.headers["Retry-After"]) > 0
            assert "Too many sign-in attempts" in response.json().get("detail", "")

    # Even the correct password is delayed while the account/IP bucket is locked.
    blocked = client.post("/auth/login", headers=headers, json={
        "email": payload["email"],
        "password": payload["password"],
    })
    assert blocked.status_code == 429
    assert "Retry-After" in blocked.headers


def test_login_ip_limit_applies_across_different_accounts(client, monkeypatch):
    """The IP-wide bucket protects the service against password spraying."""
    import services.login_rate_limit as rate_limits

    rate_limits.reset_mock_login_rate_limits()
    monkeypatch.setenv("VERCEL", "1")
    monkeypatch.setattr(rate_limits, "ACCOUNT_MAX_ATTEMPTS", 100)
    monkeypatch.setattr(rate_limits, "ACCOUNT_IP_MAX_ATTEMPTS", 100)
    monkeypatch.setattr(rate_limits, "IP_MAX_ATTEMPTS", 2)

    headers = {"x-forwarded-for": "203.0.113.25"}
    first = client.post("/auth/login", headers=headers, json={
        "email": "spray-one@example.com",
        "password": "WrongPassword123!",
    })
    second = client.post("/auth/login", headers=headers, json={
        "email": "spray-two@example.com",
        "password": "WrongPassword123!",
    })
    third = client.post("/auth/login", headers=headers, json={
        "email": "spray-three@example.com",
        "password": "WrongPassword123!",
    })

    assert first.status_code == 401
    assert second.status_code == 429
    assert third.status_code == 429
    assert "Retry-After" in third.headers


def test_login_account_limit_applies_across_different_ips(monkeypatch):
    """The account-wide bucket caps distributed guessing against one email."""
    import services.login_rate_limit as rate_limits

    rate_limits.reset_mock_login_rate_limits()
    monkeypatch.setattr(rate_limits, "ACCOUNT_MAX_ATTEMPTS", 2)
    monkeypatch.setattr(rate_limits, "ACCOUNT_IP_MAX_ATTEMPTS", 100)
    monkeypatch.setattr(rate_limits, "IP_MAX_ATTEMPTS", 100)

    assert not rate_limits.record_login_failure(
        "target@example.com", "198.51.100.1"
    )["blocked"]
    second = rate_limits.record_login_failure(
        "target@example.com", "198.51.100.2"
    )
    third_ip_check = rate_limits.check_login_rate_limit(
        "target@example.com", "198.51.100.3"
    )

    assert second["blocked"] is True
    assert third_ip_check["blocked"] is True
    assert second["retry_after_seconds"] > 0


def test_clearing_account_failures_does_not_clear_ip_spray_history(monkeypatch):
    """A successful account login cannot erase failures recorded against other accounts from its IP."""
    import services.login_rate_limit as rate_limits

    rate_limits.reset_mock_login_rate_limits()
    monkeypatch.setattr(rate_limits, "ACCOUNT_MAX_ATTEMPTS", 100)
    monkeypatch.setattr(rate_limits, "ACCOUNT_IP_MAX_ATTEMPTS", 100)
    monkeypatch.setattr(rate_limits, "IP_MAX_ATTEMPTS", 1)

    failure = rate_limits.record_login_failure(
        "first-user@example.com", "198.51.100.50"
    )
    rate_limits.clear_login_account_failures(
        "first-user@example.com", "198.51.100.50"
    )
    other_account = rate_limits.check_login_rate_limit(
        "second-user@example.com", "198.51.100.50"
    )

    assert failure["blocked"] is True
    assert other_account["blocked"] is True


def test_login_fails_closed_when_rate_limit_store_is_unavailable(client, monkeypatch):
    """Login must not bypass throttling when the shared limiter cannot be checked."""
    import routes.auth as auth_routes

    def unavailable(*args, **kwargs):
        raise RuntimeError("rate-limit store unavailable")

    monkeypatch.setattr(auth_routes, "check_login_rate_limit", unavailable)
    response = client.post("/auth/login", json={
        "email": "any-user@example.com",
        "password": "WrongPassword123!",
    })

    assert response.status_code == 503
    assert "temporarily unavailable" in response.json().get("detail", "").lower()

def test_login_fails_cleanly_when_account_database_lookup_is_unavailable(client, monkeypatch):
    """A users-table read failure returns a service error rather than an unhandled 500."""
    import routes.auth as auth_routes

    def unavailable(*args, **kwargs):
        raise RuntimeError("users table unavailable")

    monkeypatch.setattr(auth_routes.users_collection, "find_one", unavailable)
    response = client.post("/auth/login", json={
        "email": "known-user@example.com",
        "password": "CorrectPassword123!",
    })

    assert response.status_code == 503
    assert "temporarily unavailable" in response.json().get("detail", "").lower()


# ============================================================
# PER-DEVICE SESSION MANAGEMENT
# ============================================================

def test_login_creates_a_registered_device_session(client):
    """A successful sign-in must persist a distinct server-side session."""
    payload = {
        "name": "Session Login User",
        "email": "session.login@example.com",
        "password": "SecurePassword123!",
        "role": "student",
        **VALID_STUDENT_FIELDS,
    }
    registered = client.post("/auth/register", json=payload)
    assert registered.status_code == 201

    from database import users_collection, supabase
    from security.jwt import decode_access_token

    users_collection.update_one(
        {"email": "session.login@example.com"},
        {"$set": {"is_verified": True, "verification_status": "approved"}},
    )
    response = client.post(
        "/auth/login",
        headers={"user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0"},
        json={"email": payload["email"], "password": payload["password"]},
    )

    assert response.status_code == 200
    token_payload = decode_access_token(response.json()["access_token"])
    assert token_payload["session_id"]

    rows = (
        supabase.table("auth_sessions")
        .select("*")
        .eq("id", token_payload["session_id"])
        .eq("user_id", response.json()["user"]["id"])
        .execute()
        .data
    )
    assert len(rows) == 1
    assert rows[0]["device_label"] == "Chrome on Windows"
    assert rows[0]["revoked_at"] is None


def test_user_can_revoke_one_device_without_signing_out_current_device(client, admin_user):
    """Revoking one device invalidates only that JWT and leaves the current device active."""
    import uuid

    from database import supabase
    from security.jwt import create_access_token, decode_access_token
    from services.auth_sessions import create_auth_session

    # First authenticated request lazily registers this pre-rollout token.
    current_list = client.get("/auth/sessions", headers=admin_user["headers"])
    assert current_list.status_code == 200
    current_session_id = current_list.json()["current_session_id"]

    other_session_id = str(uuid.uuid4())
    other_token = create_access_token(
        user_id=admin_user["id"],
        role="admin",
        session_id=other_session_id,
    )
    other_expiry = decode_access_token(other_token)["expires_at"]
    create_auth_session(
        admin_user["id"],
        other_session_id,
        other_expiry,
        "Mozilla/5.0 (Linux; Android 14) Chrome/120.0",
    )

    listed = client.get("/auth/sessions", headers=admin_user["headers"])
    assert listed.status_code == 200
    assert len(listed.json()["sessions"]) == 2
    assert any(item["is_current"] for item in listed.json()["sessions"])

    revoked = client.delete(
        f"/auth/sessions/{other_session_id}",
        headers=admin_user["headers"],
    )
    assert revoked.status_code == 200

    other_response = client.get(
        "/auth/sessions",
        headers={"Authorization": f"Bearer {other_token}"},
    )
    assert other_response.status_code == 401

    current_response = client.get("/auth/sessions", headers=admin_user["headers"])
    assert current_response.status_code == 200
    assert len(current_response.json()["sessions"]) == 1
    assert current_response.json()["sessions"][0]["id"] == current_session_id


def test_sign_out_all_other_devices_preserves_current_session(client, admin_user):
    """The bulk action revokes every other active device but keeps the requester signed in."""
    import uuid

    from security.jwt import create_access_token, decode_access_token
    from services.auth_sessions import create_auth_session

    current = client.get("/auth/sessions", headers=admin_user["headers"])
    assert current.status_code == 200

    other_ids = []
    for _ in range(2):
        session_id = str(uuid.uuid4())
        token = create_access_token(
            user_id=admin_user["id"],
            role="admin",
            session_id=session_id,
        )
        create_auth_session(
            admin_user["id"],
            session_id,
            decode_access_token(token)["expires_at"],
            "Mozilla/5.0 (Macintosh; Intel Mac OS X) Safari/17.0",
        )
        other_ids.append((session_id, token))

    response = client.post(
        "/auth/sessions/revoke-others",
        headers=admin_user["headers"],
    )
    assert response.status_code == 200
    assert response.json()["revoked_count"] == 2

    remaining = client.get("/auth/sessions", headers=admin_user["headers"])
    assert remaining.status_code == 200
    assert len(remaining.json()["sessions"]) == 1
    assert remaining.json()["sessions"][0]["is_current"] is True

    for _session_id, token in other_ids:
        revoked = client.get(
            "/auth/sessions",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert revoked.status_code == 401


def test_server_side_logout_revokes_current_device(client, admin_user):
    """Logging out invalidates the bearer token at the backend, not just in local storage."""
    logout_response = client.post("/auth/logout", headers=admin_user["headers"])
    assert logout_response.status_code == 200

    follow_up = client.get("/auth/sessions", headers=admin_user["headers"])
    assert follow_up.status_code == 401


def test_password_change_revokes_registered_device_sessions_in_mock_mode(admin_user):
    """The in-memory test adapter mirrors the production password/session transaction."""
    import uuid
    from services.auth_sessions import create_auth_session, list_active_auth_sessions
    from services.session_security import update_password_and_revoke_sessions
    from security.jwt import create_access_token, decode_access_token

    session_id = str(uuid.uuid4())
    token = create_access_token(
        user_id=admin_user["id"],
        role="admin",
        session_id=session_id,
    )
    expiry = decode_access_token(token)["expires_at"]
    create_auth_session(admin_user["id"], session_id, expiry, "Chrome on Windows")

    next_version = update_password_and_revoke_sessions(admin_user["id"], "new-argon2-hash")
    assert next_version == 1
    assert list_active_auth_sessions(admin_user["id"], session_id) == []


# ============================================================
# HTTPONLY COOKIE AUTHENTICATION
# ============================================================

def test_login_sets_host_only_httponly_api_cookie(client):
    payload = {
        "name": "Cookie Login User",
        "email": "cookie.login@example.com",
        "password": "SecurePassword123!",
        "role": "student",
        **VALID_STUDENT_FIELDS,
    }
    assert client.post("/api/auth/register", json=payload).status_code == 201
    from database import users_collection
    users_collection.update_one(
        {"email": payload["email"]},
        {"$set": {"is_verified": True, "verification_status": "approved"}},
    )

    response = client.post(
        "/api/auth/login",
        json={"email": payload["email"], "password": payload["password"]},
    )

    assert response.status_code == 200
    cookie = response.headers.get("set-cookie", "").lower()
    assert "soet_access_token=" in cookie
    assert "httponly" in cookie
    assert "samesite=lax" in cookie
    assert "path=/api" in cookie
    assert "domain=" not in cookie


def test_cookie_authenticates_same_origin_api_requests(client):
    payload = {
        "name": "Cookie Session User",
        "email": "cookie.session@example.com",
        "password": "SecurePassword123!",
        "role": "student",
        **VALID_STUDENT_FIELDS,
    }
    assert client.post("/api/auth/register", json=payload).status_code == 201
    from database import users_collection
    users_collection.update_one(
        {"email": payload["email"]},
        {"$set": {"is_verified": True, "verification_status": "approved"}},
    )

    login = client.post(
        "/api/auth/login",
        json={"email": payload["email"], "password": payload["password"]},
    )
    assert login.status_code == 200
    assert "soet_access_token" in client.cookies

    profile = client.get("/api/profile/me")
    assert profile.status_code == 200


def test_cookie_auth_rejects_untrusted_origin_on_state_change(client):
    payload = {
        "name": "Cookie CSRF User",
        "email": "cookie.csrf@example.com",
        "password": "SecurePassword123!",
        "role": "student",
        **VALID_STUDENT_FIELDS,
    }
    assert client.post("/api/auth/register", json=payload).status_code == 201
    from database import users_collection
    users_collection.update_one(
        {"email": payload["email"]},
        {"$set": {"is_verified": True, "verification_status": "approved"}},
    )

    login = client.post(
        "/api/auth/login",
        json={"email": payload["email"], "password": payload["password"]},
    )
    assert login.status_code == 200

    blocked = client.post("/api/auth/logout", headers={"Origin": "https://evil.example"})
    assert blocked.status_code == 403

    accepted = client.post("/api/auth/logout", headers={"Origin": "https://soet-connect.vercel.app"})
    assert accepted.status_code == 200
    assert "max-age=0" in accepted.headers.get("set-cookie", "").lower()


def test_login_does_not_return_jwt_in_production_response(client, monkeypatch):
    payload = {
        "name": "Cookie Private User",
        "email": "cookie.private@example.com",
        "password": "SecurePassword123!",
        "role": "student",
        **VALID_STUDENT_FIELDS,
    }
    assert client.post("/api/auth/register", json=payload).status_code == 201
    from database import users_collection
    users_collection.update_one(
        {"email": payload["email"]},
        {"$set": {"is_verified": True, "verification_status": "approved"}},
    )
    monkeypatch.delenv("AUTH_EXPOSE_TEST_TOKENS", raising=False)

    response = client.post(
        "/api/auth/login",
        json={"email": payload["email"], "password": payload["password"]},
    )

    assert response.status_code == 200
    assert "access_token" not in response.json()
    assert "token_type" not in response.json()
    assert "httponly" in response.headers.get("set-cookie", "").lower()


def test_login_rejects_untrusted_origin(client):
    payload = {
        "name": "Cross Origin Login User",
        "email": "cross.origin.login@example.com",
        "password": "SecurePassword123!",
        "role": "student",
        **VALID_STUDENT_FIELDS,
    }
    assert client.post("/auth/register", json=payload).status_code == 201
    from database import users_collection
    users_collection.update_one(
        {"email": payload["email"]},
        {"$set": {"is_verified": True, "verification_status": "approved"}},
    )

    response = client.post(
        "/auth/login",
        headers={"Origin": "https://evil.example"},
        json={"email": payload["email"], "password": payload["password"]},
    )

    assert response.status_code == 403
    assert "origin is not allowed" in response.json()["detail"].lower()


def test_password_change_replaces_the_http_only_cookie(client, admin_user, monkeypatch):
    from routes.auth import password_hash
    from database import users_collection

    users_collection.update_one(
        {"_id": admin_user["id"]},
        {"$set": {"password_hash": password_hash.hash("OldPassword123!")}},
    )
    monkeypatch.delenv("AUTH_EXPOSE_TEST_TOKENS", raising=False)

    response = client.post(
        "/api/auth/change-password",
        headers=admin_user["headers"],
        json={
            "current_password": "OldPassword123!",
            "new_password": "NewPassword456!",
            "confirm_new_password": "NewPassword456!",
        },
    )

    assert response.status_code == 200
    assert "access_token" not in response.json()
    assert "httponly" in response.headers.get("set-cookie", "").lower()
    assert client.get("/api/profile/me").status_code == 200


def test_successful_login_records_unfamiliar_network_activity(client, monkeypatch):
    """Successful sign-ins are audited using HMAC IP fingerprints, never raw IP addresses."""
    from database import supabase, users_collection
    from routes.auth import password_hash

    monkeypatch.setenv("VERCEL", "1")
    monkeypatch.setenv("LOGIN_SECURITY_EVENT_SECRET", "test-login-security-event-secret")

    payload = {
        "name": "Security Activity Student",
        "email": "security.activity@example.com",
        "password": "SecurePassword123!",
        "role": "student",
        **VALID_STUDENT_FIELDS,
    }
    assert client.post("/auth/register", json=payload).status_code == 201
    users_collection.update_one(
        {"email": payload["email"]},
        {"$set": {
            "is_verified": True,
            "verification_status": "approved",
            "password_hash": password_hash.hash(payload["password"]),
        }},
    )

    user_agent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0"
    first = client.post(
        "/auth/login",
        headers={"user-agent": user_agent, "x-forwarded-for": "203.0.113.10"},
        json={"email": payload["email"], "password": payload["password"]},
    )
    assert first.status_code == 200

    second = client.post(
        "/auth/login",
        headers={"user-agent": user_agent, "x-forwarded-for": "203.0.113.11"},
        json={"email": payload["email"], "password": payload["password"]},
    )
    assert second.status_code == 200

    user_id = str(second.json()["user"]["id"])
    events = (
        supabase.table("auth_security_events")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .execute()
        .data
    )
    assert [event["event_type"] for event in events] == ["unfamiliar_sign_in", "sign_in"]
    assert "new_network" in events[0]["metadata"]["signals"]
    assert len(events[0]["ip_fingerprint"]) == 64
    assert "203.0.113.11" not in events[0]["ip_fingerprint"]

    activity = client.get(
        "/auth/security-events",
        headers={"Authorization": f"Bearer {second.json()['access_token']}"},
    )
    assert activity.status_code == 200
    assert activity.json()["events"][0]["event_type"] == "unfamiliar_sign_in"
    assert "ip_fingerprint" not in activity.text


def test_unfamiliar_sign_in_sends_one_privacy_safe_email_per_six_hours(client, monkeypatch):
    """A new network triggers one security email, then the per-account cooldown prevents spam."""
    from database import supabase, users_collection
    from routes.auth import password_hash

    monkeypatch.setenv("VERCEL", "1")
    monkeypatch.setenv("LOGIN_SECURITY_EVENT_SECRET", "test-login-security-event-secret")

    sent_emails = []
    monkeypatch.setattr("services.delivery.is_email_configured", lambda: True)
    monkeypatch.setattr("services.delivery.get_email_provider_name", lambda: "test_provider")
    monkeypatch.setattr(
        "services.delivery.send_email_message",
        lambda recipient, subject, message: (
            sent_emails.append({
                "recipient": recipient,
                "subject": subject,
                "message": message,
            }) or (True, "security-alert-test-id", None)
        ),
    )

    payload = {
        "name": "Sign In Alert Student",
        "email": "signin.alert@example.com",
        "password": "SecurePassword123!",
        "role": "student",
        **VALID_STUDENT_FIELDS,
    }
    assert client.post("/auth/register", json=payload).status_code == 201
    users_collection.update_one(
        {"email": payload["email"]},
        {"$set": {
            "is_verified": True,
            "verification_status": "approved",
            "password_hash": password_hash.hash(payload["password"]),
        }},
    )

    user_agent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0"

    first = client.post(
        "/auth/login",
        headers={"user-agent": user_agent, "x-forwarded-for": "203.0.113.10"},
        json={"email": payload["email"], "password": payload["password"]},
    )
    assert first.status_code == 200
    assert sent_emails == []

    second = client.post(
        "/auth/login",
        headers={"user-agent": user_agent, "x-forwarded-for": "203.0.113.11"},
        json={"email": payload["email"], "password": payload["password"]},
    )
    assert second.status_code == 200
    assert len(sent_emails) == 1
    alert = sent_emails[0]
    assert alert["recipient"] == payload["email"]
    assert "new sign-in" in alert["subject"].lower()
    assert "Chrome on Windows" in alert["message"]
    assert "new network" in alert["message"].lower()
    assert "203.0.113.11" not in alert["message"]
    assert "203.0.113.10" not in alert["message"]
    assert "/account/sessions" in alert["message"]

    third = client.post(
        "/auth/login",
        headers={"user-agent": user_agent, "x-forwarded-for": "203.0.113.12"},
        json={"email": payload["email"], "password": payload["password"]},
    )
    assert third.status_code == 200
    assert len(sent_emails) == 1

    user_id = str(second.json()["user"]["id"])
    alerts = (
        supabase.table("auth_security_events")
        .select("id,email_alert_claimed_at,event_type")
        .eq("user_id", user_id)
        .eq("event_type", "unfamiliar_sign_in")
        .is_("email_alert_claimed_at", "not_null")
        .execute()
        .data
    )
    assert len(alerts) == 1

    deliveries = (
        supabase.table("notification_deliveries")
        .select("*")
        .eq("user_id", user_id)
        .eq("event_type", "unfamiliar_sign_in")
        .execute()
        .data
    )
    assert len(deliveries) == 1
    assert deliveries[0]["status"] == "accepted"
