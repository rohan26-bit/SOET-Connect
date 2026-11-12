import sys
from pathlib import Path

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

import pytest
from fastapi.testclient import TestClient

from main import app
from database import users_collection
from security.jwt import create_access_token


test_client = TestClient(app)


# ============================================================
# TEST USERS SETUP (Standalone Helpers)
# ============================================================

def _get_or_create_user(
    uid: str,
    name: str,
    email: str,
    role: str,
    is_verified: bool = True,
    is_active: bool = True,
    student_profile: dict = None,
    alumni_profile: dict = None,
):
    user = users_collection.find_one({"_id": uid})

    if not user:
        user = {
            "_id": uid,
            "name": name,
            "email": email,
            "password_hash": "dummy_hash_12345",
            "role": role,
            "is_active": is_active,
            "is_verified": is_verified,
            "verification_status": "approved" if is_verified else "pending",
        }
        if student_profile:
            user["student_profile"] = student_profile
        if alumni_profile:
            user["alumni_profile"] = alumni_profile

        users_collection.insert_one(user)
    else:
        if student_profile:
            user["student_profile"] = student_profile
        if alumni_profile:
            user["alumni_profile"] = alumni_profile
        user["is_active"] = is_active

    return user


def setup_test_users():
    _get_or_create_user(
        "demo-student-id", "Demo Student", "test@student.com", "student",
        student_profile={
            "student_id": "STU001",
            "department": "Computer Science",
            "course": "B.Tech",
            "academic_year": "3rd Year",
            "graduation_year": "2026",
            "phone": "9876543210",
        }
    )
    _get_or_create_user(
        "demo-alumni-id", "Demo Alumni", "test@alumni.com", "alumni",
        alumni_profile={
            "alumni_id": "ALU001",
            "department": "Information Technology",
            "degree": "B.Tech",
            "graduation_year": "2022",
            "company": "Tech Corp",
            "designation": "Software Engineer",
            "industry": "Software",
            "location": "Mumbai",
            "skills": ["Python", "FastAPI", "React"],
            "linkedin": "https://linkedin.com/in/demoalumni",
            "github": "https://github.com/demoalumni",
            "website": "https://demoalumni.dev",
            "bio": "Experienced software engineer passionate about mentoring.",
        }
    )
    _get_or_create_user(
        "inactive-student-id", "Inactive Student", "inactive@student.com", "student",
        is_active=False
    )

    tokens = {
        "student": create_access_token("demo-student-id", "student"),
        "alumni": create_access_token("demo-alumni-id", "alumni"),
        "inactive": create_access_token("inactive-student-id", "student"),
        "nonexistent": create_access_token("nonexistent-user-id", "student"),
    }

    return {k: {"Authorization": f"Bearer {v}"} for k, v in tokens.items()}


# ============================================================
# 1. VIEW OWN PROFILE
# ============================================================

def test_get_my_profile_student():
    """Student can view their own profile."""
    headers = setup_test_users()
    resp = test_client.get("/profile/me", headers=headers["student"])

    assert resp.status_code == 200
    data = resp.json()

    assert data["id"] == "demo-student-id"
    assert data["email"] == "test@student.com"
    assert data["role"] == "student"
    assert "student_profile" in data
    assert data["student_profile"]["department"] == "Computer Science"


def test_get_my_profile_alumni():
    """Alumni can view their own profile."""
    headers = setup_test_users()
    resp = test_client.get("/profile/me", headers=headers["alumni"])

    assert resp.status_code == 200
    data = resp.json()

    assert data["id"] == "demo-alumni-id"
    assert data["email"] == "test@alumni.com"
    assert data["role"] == "alumni"
    assert "alumni_profile" in data
    assert data["alumni_profile"]["company"] == "Tech Corp"


def test_get_my_profile_unauthorized():
    """Unauthenticated request to /profile/me is rejected."""
    resp = test_client.get("/profile/me")
    assert resp.status_code in [401, 403]


# ============================================================
# 2. UPDATE STUDENT PROFILE (PUT & PATCH)
# ============================================================

def test_update_student_profile():
    """Student can update their own profile fields via PUT."""
    headers = setup_test_users()
    payload = {
        "fullName": "Updated Student Name",
        "studentId": "PRN123456",
        "department": "Mechanical Engineering",
        "course": "M.Tech",
        "graduationYear": "2027",
        "phone": "9998887776",
    }

    resp = test_client.put("/profile/me", json=payload, headers=headers["student"])

    assert resp.status_code == 200
    data = resp.json()

    assert data["name"] == "Updated Student Name"
    assert data["student_profile"]["department"] == "Mechanical Engineering"
    assert data["student_profile"]["course"] == "M.Tech"
    assert data["student_profile"]["graduation_year"] == "2027"
    assert data["student_profile"]["phone"] == "+919998887776"


def test_update_student_profile_patch():
    """Student can update their own profile fields via PATCH."""
    headers = setup_test_users()
    update_payload = {
        "full_name": "Patch Student Name",
        "phone": "9991112233",
        "course": "B.Tech CSE"
    }
    res = test_client.patch("/profile/me", json=update_payload, headers=headers["student"])
    assert res.status_code == 200
    data = res.json()
    assert data["message"] == "Profile updated successfully."
    assert data["profile"]["name"] == "Patch Student Name"
    assert data["profile"]["student_profile"]["phone"] == "+919991112233"
    assert data["profile"]["student_profile"]["course"] == "B.Tech CSE"


# ============================================================
# 3. UPDATE ALUMNI PROFILE
# ============================================================

def test_update_alumni_profile():
    """Alumni can update their own profile fields."""
    headers = setup_test_users()
    payload = {
        "fullName": "Updated Alumni Name",
        "company": "Google",
        "designation": "Staff Engineer",
        "industry": "Big Tech",
        "location": "Bengaluru",
        "skills": ["Go", "Python", "Kubernetes", "AI"],
        "linkedin": "https://linkedin.com/in/updated",
        "github": "https://github.com/updated",
        "website": "https://updated.dev",
        "bio": "Staff Engineer at Google working on cloud platforms.",
    }

    resp = test_client.put("/profile/me", json=payload, headers=headers["alumni"])

    assert resp.status_code == 200
    data = resp.json()

    assert data["name"] == "Updated Alumni Name"
    assert data["alumni_profile"]["company"] == "Google"
    assert data["alumni_profile"]["designation"] == "Staff Engineer"
    assert "Kubernetes" in data["alumni_profile"]["skills"]
    assert data["alumni_profile"]["bio"] == "Staff Engineer at Google working on cloud platforms."


# ============================================================
def test_alumni_directory_visibility_is_persisted_and_enforced():
    """Alumni can hide and restore their own directory visibility across requests."""
    headers = setup_test_users()

    initial = test_client.get("/profile/me", headers=headers["alumni"])
    assert initial.status_code == 200
    assert initial.json()["is_public_profile"] is True

    hidden = test_client.patch(
        "/profile/me",
        json={"is_public_profile": False},
        headers=headers["alumni"],
    )
    assert hidden.status_code == 200
    assert hidden.json()["is_public_profile"] is False

    directory_hidden = test_client.get("/alumni/directory", headers=headers["student"])
    assert directory_hidden.status_code == 200
    assert all(item["id"] != "demo-alumni-id" for item in directory_hidden.json())

    restored = test_client.patch(
        "/profile/me",
        json={"is_public_profile": True},
        headers=headers["alumni"],
    )
    assert restored.status_code == 200
    assert restored.json()["is_public_profile"] is True

    directory_visible = test_client.get("/alumni/directory", headers=headers["student"])
    assert directory_visible.status_code == 200
    assert any(item["id"] == "demo-alumni-id" for item in directory_visible.json())


def test_non_alumni_cannot_change_directory_visibility():
    """Students cannot use the alumni-only directory visibility control."""
    headers = setup_test_users()
    response = test_client.patch(
        "/profile/me",
        json={"is_public_profile": False},
        headers=headers["student"],
    )
    assert response.status_code == 403
    assert "Only alumni" in response.json()["detail"]


# 4. PATCH PARTIAL UPDATE
# ============================================================

def test_patch_partial_update():
    """PATCH allows updating only a single field without clearing others."""
    headers = setup_test_users()
    payload = {
        "bio": "Newly updated short bio."
    }

    resp = test_client.patch("/profile/me", json=payload, headers=headers["alumni"])

    assert resp.status_code == 200
    data = resp.json()

    assert data["alumni_profile"]["bio"] == "Newly updated short bio."
    assert data["alumni_profile"]["company"] in ["Tech Corp", "Google"]


# ============================================================
# 5. AVATAR UPLOAD / UPDATE
# ============================================================

def test_update_avatar_via_post():
    """User can update their avatar via POST /profile/avatar."""
    headers = setup_test_users()
    avatar_data_url = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="

    resp = test_client.post(
        "/profile/avatar",
        json={"avatar_url": avatar_data_url},
        headers=headers["student"],
    )

    assert resp.status_code == 200
    data = resp.json()
    assert data["avatar_url"] == avatar_data_url

    me_resp = test_client.get("/profile/me", headers=headers["student"])
    assert me_resp.json()["avatar_url"] == avatar_data_url


# ============================================================
# 6. SECURITY & VALIDATION (from PR #1 & Profile Migration)
# ============================================================

def test_sensitive_fields_never_exposed():
    """Password hash and authentication secrets are never exposed in profile responses."""
    headers = setup_test_users()

    get_resp = test_client.get("/profile/me", headers=headers["student"])
    data = get_resp.json()

    sensitive_keys = {
        "password_hash", "password", "token", "secret",
        "refresh_token", "access_token"
    }

    for key in sensitive_keys:
        assert key not in data, f"Sensitive key '{key}' found in GET /profile/me"

    put_resp = test_client.put("/profile/me", json={"fullName": "Safe Name"}, headers=headers["student"])
    put_data = put_resp.json()

    for key in sensitive_keys:
        assert key not in put_data, f"Sensitive key '{key}' found in PUT /profile/me"


def test_update_profile_empty_body_fails():
    """Sending an empty update body returns 400 Bad Request."""
    headers = setup_test_users()
    res = test_client.patch("/profile/me", json={}, headers=headers["student"])
    assert res.status_code == 400
    assert "No profile changes were provided" in res.json().get("detail", "")


def test_update_profile_empty_name_fails():
    """Sending an empty whitespace full_name returns 400 Bad Request."""
    headers = setup_test_users()
    res = test_client.patch("/profile/me", json={"full_name": "   "}, headers=headers["student"])
    assert res.status_code == 400
    assert "Full name cannot be empty" in res.json().get("detail", "")


def test_profile_ownership_isolation():
    """Updating one user's profile does not affect another user's profile."""
    headers = setup_test_users()
    _get_or_create_user("student-2-id", "Student Two", "s2@student.com", "student")
    token2 = create_access_token("student-2-id", "student")
    h2 = {"Authorization": f"Bearer {token2}"}

    test_client.patch("/profile/me", json={"full_name": "New Name Student 1"}, headers=headers["student"])

    res2 = test_client.get("/profile/me", headers=h2)
    assert res2.status_code == 200
    assert res2.json()["name"] == "Student Two"


# ============================================================
# 7. INACTIVE USER FORBIDDEN
# ============================================================

def test_inactive_user_cannot_update_profile():
    """Deactivated user receives 403 when attempting to update profile."""
    headers = setup_test_users()
    resp = test_client.put("/profile/me", json={"fullName": "Test"}, headers=headers["inactive"])

    assert resp.status_code == 403


# ============================================================
# 8. NON-EXISTENT USER 404
# ============================================================

def test_nonexistent_user_returns_404():
    """Token with unknown user ID returns 404."""
    headers = setup_test_users()
    resp = test_client.get("/profile/me", headers=headers["nonexistent"])

    assert resp.status_code == 404


# ============================================================
# 9. VALIDATION HARDENING TESTS (PHASE 2)
# ============================================================

def test_profile_invalid_phone_fails():
    """Invalid phone number formats and length out of bounds fail with 422."""
    headers = setup_test_users()

    # Letters
    resp = test_client.patch("/profile/me", json={"phone": "invalid-phone"}, headers=headers["student"])
    assert resp.status_code == 422

    # Too short (< 7 digits)
    resp = test_client.patch("/profile/me", json={"phone": "12345"}, headers=headers["student"])
    assert resp.status_code == 422

    # Too long (> 15 digits)
    resp = test_client.patch("/profile/me", json={"phone": "12345678901234567"}, headers=headers["student"])
    assert resp.status_code == 422


def test_profile_valid_phone_succeeds():
    """Valid phone numbers with spaces, +, hyphens, parens succeed."""
    headers = setup_test_users()

    resp = test_client.patch("/profile/me", json={"phone": "+91 98765-43210"}, headers=headers["student"])
    assert resp.status_code == 200
    assert resp.json()["student_profile"]["phone"] == "+919876543210"

    resp = test_client.patch("/profile/me", json={"phone": "(123) 456-7890"}, headers=headers["student"])
    assert resp.status_code == 200
    assert resp.json()["student_profile"]["phone"] == "+911234567890"


def test_profile_invalid_graduation_year_fails():
    """Invalid graduation year formats and ranges fail with 422."""
    headers = setup_test_users()

    # Non-digits
    resp = test_client.patch("/profile/me", json={"graduation_year": "abcd"}, headers=headers["student"])
    assert resp.status_code == 422

    # Before 1970
    resp = test_client.patch("/profile/me", json={"graduation_year": "1960"}, headers=headers["student"])
    assert resp.status_code == 422

    # After 2035
    resp = test_client.patch("/profile/me", json={"graduation_year": "2050"}, headers=headers["student"])
    assert resp.status_code == 422

    # Less than 4 digits
    resp = test_client.patch("/profile/me", json={"graduation_year": "25"}, headers=headers["student"])
    assert resp.status_code == 422


def test_profile_valid_graduation_year_succeeds():
    """Valid 4-digit graduation years between 1970 and 2035 succeed."""
    headers = setup_test_users()

    resp = test_client.patch("/profile/me", json={"graduation_year": "2026"}, headers=headers["student"])
    assert resp.status_code == 200
    assert resp.json()["student_profile"]["graduation_year"] == "2026"

    resp = test_client.patch("/profile/me", json={"graduationYear": "1995"}, headers=headers["student"])
    assert resp.status_code == 200
    assert resp.json()["student_profile"]["graduation_year"] == "1995"


def test_profile_invalid_url_protocol_fails():
    """Non-http/https URLs or javascript: protocols fail with 422."""
    headers = setup_test_users()

    # javascript: scheme
    resp = test_client.patch("/profile/me", json={"linkedin": "javascript:alert(1)"}, headers=headers["alumni"])
    assert resp.status_code == 422

    # ftp: scheme
    resp = test_client.patch("/profile/me", json={"github": "ftp://files.example.com"}, headers=headers["alumni"])
    assert resp.status_code == 422

    # plain string without domain
    resp = test_client.patch("/profile/me", json={"website": "not-a-url"}, headers=headers["alumni"])
    assert resp.status_code == 422


def test_profile_valid_http_https_url_succeeds():
    """Valid http and https URLs with domains succeed."""
    headers = setup_test_users()

    resp = test_client.patch(
        "/profile/me",
        json={
            "linkedin": "https://www.linkedin.com/in/john-doe",
            "github": "https://github.com/johndoe",
            "website": "http://johndoe.me",
        },
        headers=headers["alumni"]
    )
    assert resp.status_code == 200
    profile = resp.json()["alumni_profile"]
    assert profile["linkedin"] == "https://www.linkedin.com/in/john-doe"
    assert profile["github"] == "https://github.com/johndoe"
    assert profile["website"] == "http://johndoe.me"


def test_profile_avatar_payload_exceeding_limit_fails():
    """Avatar payload exceeding 3,000,000 characters fails with 422."""
    headers = setup_test_users()
    oversized = "data:image/png;base64," + ("A" * 3_000_001)

    # Via POST /profile/avatar
    resp = test_client.post("/profile/avatar", json={"avatar_url": oversized}, headers=headers["student"])
    assert resp.status_code == 422

    # Via PATCH /profile/me
    resp = test_client.patch("/profile/me", json={"avatar_url": oversized}, headers=headers["student"])
    assert resp.status_code == 422


def test_profile_avatar_invalid_format_fails():
    """Avatar URL with invalid scheme or format fails with 422."""
    headers = setup_test_users()

    # Plain text
    resp = test_client.post("/profile/avatar", json={"avatar_url": "invalid-avatar-string"}, headers=headers["student"])
    assert resp.status_code == 422

    # javascript: scheme
    resp = test_client.post("/profile/avatar", json={"avatar_url": "javascript:alert(1)"}, headers=headers["student"])
    assert resp.status_code == 422


def test_profile_avatar_rejects_svg_invalid_base64_and_mime_mismatch():
    """Avatar data URIs must contain verified JPEG, PNG, or WebP raster bytes."""
    headers = setup_test_users()
    svg_data_url = "data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+PC9zdmc+"
    invalid_base64 = "data:image/png;base64,%%%not-base64%%%"
    png_bytes_declared_as_jpeg = (
        "data:image/jpeg;base64,"
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
    )
    malformed_png = "data:image/png;base64,SGVsbG8="

    for avatar_url in (
        svg_data_url,
        invalid_base64,
        png_bytes_declared_as_jpeg,
        malformed_png,
    ):
        post_response = test_client.post(
            "/profile/avatar",
            json={"avatar_url": avatar_url},
            headers=headers["student"],
        )
        assert post_response.status_code == 422

        patch_response = test_client.patch(
            "/profile/me",
            json={"avatar_url": avatar_url},
            headers=headers["student"],
        )
        assert patch_response.status_code == 422


def test_profile_avatar_requires_https_for_remote_images():
    """Remote avatar URLs must use HTTPS and must not include embedded credentials."""
    headers = setup_test_users()

    insecure = test_client.post(
        "/profile/avatar",
        json={"avatar_url": "http://cdn.example.com/avatar.png"},
        headers=headers["student"],
    )
    assert insecure.status_code == 422

    credentialed = test_client.patch(
        "/profile/me",
        json={"avatar_url": "https://user:password@cdn.example.com/avatar.png"},
        headers=headers["student"],
    )
    assert credentialed.status_code == 422

    valid = test_client.post(
        "/profile/avatar",
        json={"avatar_url": "https://cdn.example.com/avatar.png"},
        headers=headers["student"],
    )
    assert valid.status_code == 200
    assert valid.json()["avatar_url"] == "https://cdn.example.com/avatar.png"


def test_profile_avatar_decoded_bytes_are_limited_to_two_megabytes():
    """A base64 payload under the request-field limit can still exceed the decoded image limit."""
    import base64

    headers = setup_test_users()
    oversized_bytes = b"x" * (2 * 1024 * 1024 + 1)
    oversized_data_url = (
        "data:image/png;base64,"
        + base64.b64encode(oversized_bytes).decode("ascii")
    )

    response = test_client.post(
        "/profile/avatar",
        json={"avatar_url": oversized_data_url},
        headers=headers["student"],
    )
    assert response.status_code == 422
