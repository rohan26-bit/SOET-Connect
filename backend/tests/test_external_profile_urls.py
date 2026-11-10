import pytest
from pydantic import ValidationError

from schemas.auth import RegisterRequest
from schemas.profile import ProfileUpdateRequest
from security.external_urls import (
    safe_external_profile_url,
    validate_external_profile_url,
)


VALID_PROFILE_URLS = [
    "https://www.linkedin.com/in/jane-doe",
    "https://github.com/jane-doe",
    "http://jane.example.com/profile",
]


INVALID_PROFILE_URLS = [
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "ftp://example.com/profile",
    "//example.com/profile",
    "https:///missing-host",
    "https://user:password@example.com/profile",
    "https://example.com:99999/profile",
    "https://example.com/profile with spaces",
    "https://example.com/\\\\@evil.example",
    "https://example.com/\\tprofile",
]


def _valid_alumni_registration(**overrides):
    payload = {
        "name": "Jane Doe",
        "email": "jane.doe@example.com",
        "password": "SecurePassword123!",
        "role": "alumni",
        "alumni_id": "123456",
    }
    payload.update(overrides)
    return payload


@pytest.mark.parametrize("value", VALID_PROFILE_URLS)
def test_shared_profile_url_validator_accepts_absolute_http_urls(value):
    assert validate_external_profile_url(value) == value


@pytest.mark.parametrize("value", ["", "   ", None])
def test_shared_profile_url_validator_allows_optional_empty_values(value):
    assert validate_external_profile_url(value) is None


@pytest.mark.parametrize("value", INVALID_PROFILE_URLS)
def test_shared_profile_url_validator_rejects_unsafe_or_malformed_urls(value):
    with pytest.raises(ValueError):
        validate_external_profile_url(value)


@pytest.mark.parametrize("field", ["linkedin", "github", "website"])
@pytest.mark.parametrize("value", INVALID_PROFILE_URLS)
def test_registration_schema_rejects_unsafe_social_links(field, value):
    with pytest.raises(ValidationError):
        RegisterRequest(**_valid_alumni_registration(**{field: value}))


@pytest.mark.parametrize("field", ["linkedin", "github", "website"])
@pytest.mark.parametrize("value", INVALID_PROFILE_URLS)
def test_profile_update_schema_rejects_unsafe_social_links(field, value):
    with pytest.raises(ValidationError):
        ProfileUpdateRequest(**{field: value})


@pytest.mark.parametrize("value", INVALID_PROFILE_URLS)
def test_legacy_profile_link_sanitizer_suppresses_unsafe_values(value):
    assert safe_external_profile_url(value) == ""


def test_legacy_profile_link_sanitizer_preserves_safe_urls_and_cleans_whitespace():
    assert safe_external_profile_url(" https://github.com/jane-doe ") == "https://github.com/jane-doe"
    assert safe_external_profile_url("javascript:alert(1)") == ""


def test_registration_api_rejects_unsafe_social_profile_links(client):
    for field in ("linkedin", "github", "website"):
        payload = _valid_alumni_registration(
            name="Jane Alumni",
            email=f"jane-{field}@example.com",
            alumni_id="123456",
            **{field: "javascript:alert(1)"},
        )
        response = client.post("/auth/register", json=payload)
        assert response.status_code == 422


def test_profile_update_api_rejects_unsafe_social_profile_links(client, verified_alumni_user):
    for field in ("linkedin", "github", "website"):
        response = client.patch(
            "/profile/me",
            headers=verified_alumni_user["headers"],
            json={field: "https://user:password@example.com/profile"},
        )
        assert response.status_code == 422


def test_alumni_directory_suppresses_unsafe_legacy_social_links(
    client, student_user, verified_alumni_user
):
    from database import users_collection

    existing_user = users_collection.find_one({"_id": verified_alumni_user["id"]})
    legacy_profile = dict(existing_user.get("alumni_profile") or {})
    legacy_profile.update({
        "linkedin": "javascript:alert(1)",
        "github": "https://user:password@example.com/profile",
        "website": "https://safe.example.com/profile",
    })
    users_collection.update_one(
        {"_id": verified_alumni_user["id"]},
        {"$set": {"alumni_profile": legacy_profile}},
    )

    response = client.get("/alumni/directory", headers=student_user["headers"])
    assert response.status_code == 200
    alumni = next(
        item for item in response.json()
        if item["id"] == verified_alumni_user["id"]
    )
    assert alumni["linkedin"] == ""
    assert alumni["github"] == ""
    assert alumni["website"] == "https://safe.example.com/profile"
