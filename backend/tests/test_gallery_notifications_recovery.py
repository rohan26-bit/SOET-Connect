import io
import pytest
import base64
import hashlib
import hmac
import json
import time
from PIL import Image
from fastapi.testclient import TestClient

from main import app
from database import supabase, users_collection
from pwdlib import PasswordHash
from services.password_recovery import (
    request_password_reset,
    verify_password_reset_code,
    reset_password_with_token,
)

password_hasher = PasswordHash.recommended()


@pytest.fixture(autouse=True)
def clean_mock_store():
    # Helper to clean up test tables before/after tests
    if hasattr(supabase, "_mock_store"):
        for table in [
            "gallery_photos",
            "notification_preferences",
            "notification_deliveries",
            "password_reset_challenges",
            "phone_verification_codes",
        ]:
            if table in supabase._mock_store:
                supabase._mock_store[table].clear()
    yield


def _create_test_image_bytes(width=200, height=150, color=(100, 150, 200), format="JPEG"):
    """Helper to generate a valid in-memory image for upload tests."""
    img = Image.new("RGB", (width, height), color=color)
    buf = io.BytesIO()
    img.save(buf, format=format)
    buf.seek(0)
    return buf.getvalue()


# ==============================================================================
# 1. ALUMNI PHOTO GALLERY TESTS
# ==============================================================================

def test_alumni_upload_pending_moderation(client: TestClient, verified_alumni_user: dict):
    """Verified alumni can upload photos which enter 'pending' state awaiting admin review."""
    img_bytes = _create_test_image_bytes()
    files = {"file": ("reunion.jpg", img_bytes, "image/jpeg")}
    data = {
        "title": "Batch Reunion 2024",
        "category": "reunion",
        "batch_year": "2020",
        "event_name": "Annual Alumni Meet",
    }

    res = client.post(
        "/api/gallery/upload",
        headers=verified_alumni_user["headers"],
        data=data,
        files=files,
    )
    assert res.status_code == 200
    res_data = res.json()
    assert res_data["status"] == "pending"
    assert res_data["title"] == "Batch Reunion 2024"
    assert res_data["category"] == "reunion"
    assert "id" in res_data


def test_student_cannot_upload_photo(client: TestClient, student_user: dict):
    """Students cannot upload photos to the alumni gallery (403 Forbidden)."""
    img_bytes = _create_test_image_bytes()
    files = {"file": ("campus.jpg", img_bytes, "image/jpeg")}
    data = {"title": "Campus Lawn", "category": "campus"}

    res = client.post(
        "/api/gallery/upload",
        headers=student_user["headers"],
        data=data,
        files=files,
    )
    assert res.status_code == 403


def test_unverified_alumni_cannot_upload_photo(client: TestClient, unverified_alumni_user: dict):
    """Unverified alumni accounts cannot upload photos until approved by admin (403 Forbidden)."""
    img_bytes = _create_test_image_bytes()
    files = {"file": ("unapproved.jpg", img_bytes, "image/jpeg")}
    data = {"title": "Pending Verification Attempt", "category": "reunion"}

    res = client.post(
        "/api/gallery/upload",
        headers=unverified_alumni_user["headers"],
        data=data,
        files=files,
    )
    assert res.status_code == 403
    assert "must be verified" in res.json().get("detail", "").lower()



def test_admin_upload_auto_approved(client: TestClient, admin_user: dict):
    """Admin uploads are automatically approved without needing moderation."""
    img_bytes = _create_test_image_bytes()
    files = {"file": ("convocation.jpg", img_bytes, "image/jpeg")}
    data = {"title": "Official Convocation 2024", "category": "convocation"}

    res = client.post(
        "/api/gallery/upload",
        headers=admin_user["headers"],
        data=data,
        files=files,
    )
    assert res.status_code == 200
    res_data = res.json()
    assert res_data["status"] == "approved"


def test_gallery_file_validation_rejects_non_image(client: TestClient, verified_alumni_user: dict):
    """Non-image files and spoofed MIME types are rejected with 400 Bad Request."""
    invalid_bytes = b"This is just a text file, not an image."
    files = {"file": ("exploit.jpg", invalid_bytes, "image/jpeg")}
    data = {"title": "Invalid File Test"}

    res = client.post(
        "/api/gallery/upload",
        headers=verified_alumni_user["headers"],
        data=data,
        files=files,
    )
    assert res.status_code == 400
    detail = res.json().get("detail", "")
    assert "Malformed or corrupted" in detail or "Invalid" in detail

def test_gallery_upload_rejects_oversized_file(client: TestClient, verified_alumni_user: dict):
    """Oversized files are rejected before the application reads them into memory."""
    from services.gallery import MAX_IMAGE_SIZE_BYTES

    oversized_bytes = b"x" * (MAX_IMAGE_SIZE_BYTES + 1)
    response = client.post(
        "/api/gallery/upload",
        headers=verified_alumni_user["headers"],
        data={"title": "Oversized Upload"},
        files={"file": ("oversized.jpg", oversized_bytes, "image/jpeg")},
    )

    assert response.status_code == 413
    assert "8 MB" in response.json().get("detail", "")


def test_gallery_upload_rejects_excessive_decoded_image_pixels(
    client: TestClient, verified_alumni_user: dict, monkeypatch
):
    """Images that expand beyond the processing pixel budget are rejected."""
    import services.gallery as gallery_service

    monkeypatch.setattr(gallery_service, "MAX_IMAGE_PIXELS", 1_000)
    img_bytes = _create_test_image_bytes(width=200, height=150)
    response = client.post(
        "/api/gallery/upload",
        headers=verified_alumni_user["headers"],
        data={"title": "Excessive Resolution"},
        files={"file": ("large.jpg", img_bytes, "image/jpeg")},
    )

    assert response.status_code == 400
    assert "40 megapixels" in response.json().get("detail", "")



def test_public_gallery_shows_only_approved_photos(
    client: TestClient, verified_alumni_user: dict, admin_user: dict
):
    """GET /api/gallery returns only approved photos, never pending or rejected."""
    # 1. Alumni uploads pending photo
    img_bytes = _create_test_image_bytes()
    client.post(
        "/api/gallery/upload",
        headers=verified_alumni_user["headers"],
        data={"title": "Pending Photo", "category": "reunion"},
        files={"file": ("p.jpg", img_bytes, "image/jpeg")},
    )

    # 2. Admin uploads approved photo
    client.post(
        "/api/gallery/upload",
        headers=admin_user["headers"],
        data={"title": "Approved Photo", "category": "campus"},
        files={"file": ("a.jpg", img_bytes, "image/jpeg")},
    )

    # 3. Public get
    res = client.get("/api/gallery")
    assert res.status_code == 200
    data = res.json()
    photos_list = data["photos"] if isinstance(data, dict) and "photos" in data else data
    titles = [p["title"] for p in photos_list]
    assert "Approved Photo" in titles
    assert "Pending Photo" not in titles


def test_admin_approve_and_reject_photo(
    client: TestClient, verified_alumni_user: dict, admin_user: dict, student_user: dict
):
    """Admin can approve or reject pending submissions and provide feedback."""
    img_bytes = _create_test_image_bytes()
    upload_res = client.post(
        "/api/gallery/upload",
        headers=verified_alumni_user["headers"],
        data={"title": "Photo For Moderation", "category": "sports"},
        files={"file": ("s.jpg", img_bytes, "image/jpeg")},
    )
    photo_id = upload_res.json()["id"]
    image_url = f"/api/gallery/{photo_id}/image"

    # Pending images are available only to their uploader and administrators.
    assert client.get(image_url).status_code == 404
    assert client.get(image_url, headers=student_user["headers"]).status_code == 404

    owner_preview = client.get(image_url, headers=verified_alumni_user["headers"])
    assert owner_preview.status_code == 200
    assert owner_preview.headers["cache-control"] == "private, no-store"

    admin_preview = client.get(image_url, headers=admin_user["headers"])
    assert admin_preview.status_code == 200
    assert admin_preview.headers["cache-control"] == "private, no-store"

    # Reject photo
    reject_res = client.patch(
        f"/api/gallery/{photo_id}/status",
        headers=admin_user["headers"],
        json={"status": "rejected", "rejection_reason": "Low resolution image"},
    )
    assert reject_res.status_code == 200
    res_data = reject_res.json()
    assert res_data["status"] == "rejected"
    assert res_data["rejection_reason"] == "Low resolution image"

    # Rejected images remain hidden from the public and unrelated users.
    assert client.get(image_url).status_code == 404
    assert client.get(image_url, headers=student_user["headers"]).status_code == 404
    assert client.get(image_url, headers=admin_user["headers"]).status_code == 200

    # Re-approve photo
    approve_res = client.patch(
        f"/api/gallery/{photo_id}/status",
        headers=admin_user["headers"],
        json={"status": "approved"},
    )
    assert approve_res.status_code == 200
    assert approve_res.json()["status"] == "approved"

    # Once approved, the image is publicly viewable and may use public caching.
    public_image = client.get(image_url)
    assert public_image.status_code == 200
    assert public_image.headers["cache-control"] == "public, max-age=86400"


def test_non_admin_cannot_moderate(client: TestClient, verified_alumni_user: dict):
    """Non-admin user cannot approve or reject gallery photos (403 Forbidden)."""
    res = client.patch(
        "/api/gallery/fake-id/status",
        headers=verified_alumni_user["headers"],
        json={"status": "approved"},
    )
    assert res.status_code == 403


def test_watermarked_image_serving(client: TestClient, admin_user: dict):
    """GET /api/gallery/{id}/image serves a valid WebP derivative with watermark."""
    img_bytes = _create_test_image_bytes(width=800, height=600)
    upload_res = client.post(
        "/api/gallery/upload",
        headers=admin_user["headers"],
        data={"title": "High Res Memory"},
        files={"file": ("memory.jpg", img_bytes, "image/jpeg")},
    )
    photo_id = upload_res.json()["id"]

    # Retrieve watermarked image
    img_res = client.get(f"/api/gallery/{photo_id}/image")
    assert img_res.status_code == 200
    assert img_res.headers["content-type"] == "image/webp"

    # Confirm it's a valid decodable image
    streamed_img = Image.open(io.BytesIO(img_res.content))
    assert streamed_img.format == "WEBP"


# ==============================================================================
# 2. EMAIL AND SMS NOTIFICATIONS & PREFERENCES TESTS
# ==============================================================================

def test_get_and_update_notification_preferences(client: TestClient, verified_alumni_user: dict):
    """Users can fetch and update their notification delivery preferences."""
    # GET preferences
    get_res = client.get(
        "/api/notifications/preferences",
        headers=verified_alumni_user["headers"],
    )
    assert get_res.status_code == 200
    prefs = get_res.json()
    assert "email_enabled" in prefs
    assert "sms_enabled" in prefs

    # PUT preferences
    update_res = client.put(
        "/api/notifications/preferences",
        headers=verified_alumni_user["headers"],
        json={
            "email_enabled": True,
            "notify_jobs": False,
            "notify_events": True,
        },
    )
    assert update_res.status_code == 200
    updated = update_res.json()
    assert updated["notify_jobs"] is False
    assert updated["notify_events"] is True


def test_sms_opt_in_requires_verified_phone(client: TestClient, verified_alumni_user: dict):
    """Enabling SMS notifications requires a verified phone number."""
    # Attempt to enable SMS without verified phone
    res = client.put(
        "/api/notifications/preferences",
        headers=verified_alumni_user["headers"],
        json={"sms_enabled": True},
    )
    assert res.status_code == 400
    assert "verified phone" in res.json().get("detail", "").lower()


def test_notification_delivery_audit_log(client: TestClient, verified_alumni_user: dict):
    """Users can inspect their notification delivery logs and audit history."""
    res = client.get(
        "/api/notifications/deliveries",
        headers=verified_alumni_user["headers"],
    )
    assert res.status_code == 200
    assert isinstance(res.json(), list)


def test_delivery_provider_accepted_status_and_confirmed_update(monkeypatch, verified_alumni_user: dict):
    """
    A successful provider API response records status as 'accepted'.
    Only explicit confirmation / receipts update status to 'delivered'.
    """
    from services.delivery import (
        dispatch_external_notification,
        update_delivery_status,
    )
    user_id = str(verified_alumni_user["id"])

    # Setup user preferences and phone in mock database
    supabase.table("users").update({"phone": "+919876543210", "is_phone_verified": True}).eq("id", user_id).execute()
    supabase.table("notification_preferences").insert({
        "user_id": user_id,
        "email_enabled": True,
        "sms_enabled": True,
        "in_app_enabled": True,
        "notify_jobs": True,
    }).execute()

    # Mock provider responses as successful
    monkeypatch.setattr("services.delivery.is_email_configured", lambda: True)
    monkeypatch.setattr("services.delivery.is_sms_configured", lambda: True)
    monkeypatch.setattr("services.delivery.send_email_message", lambda to, subj, msg: (True, "resend_msg_abc123", None))
    monkeypatch.setattr("services.delivery.send_sms_message", lambda to, msg: (True, "twilio_sid_xyz789", None))

    results = dispatch_external_notification(
        user_id=user_id,
        title="New Job Opportunity",
        message="A new job has been posted.",
        event_type="job",
        notification_id="notif_test_456",
    )

    # Provider acceptance MUST record 'accepted', NOT 'delivered'
    assert results["email"] == "accepted"
    assert results["sms"] == "accepted"

    # Verify audit logs in notification_deliveries table
    deliv_records = supabase.table("notification_deliveries").select("*").eq("notification_id", "notif_test_456").execute().data
    assert len(deliv_records) == 2
    for r in deliv_records:
        assert r["status"] == "accepted"
        assert r["status"] != "delivered"

    # Explicit delivery receipt updates status to 'delivered'
    updated = update_delivery_status(provider_message_id="resend_msg_abc123", status="delivered")
    assert updated is not None
    assert updated["status"] == "delivered"

    # Verify database record is now 'delivered'
    email_rec = supabase.table("notification_deliveries").select("*").eq("provider_message_id", "resend_msg_abc123").execute().data[0]
    assert email_rec["status"] == "delivered"


def test_delivery_deduplication_preserves_accepted_and_delivered(monkeypatch, verified_alumni_user: dict):
    """
    Deduplication prevents re-dispatch when prior status is 'accepted', 'sent', or 'delivered'.
    """
    from services.delivery import dispatch_external_notification
    user_id = str(verified_alumni_user["id"])

    supabase.table("users").update({"phone": "+919876543210", "is_phone_verified": True}).eq("id", user_id).execute()
    supabase.table("notification_preferences").insert({
        "user_id": user_id,
        "email_enabled": True,
        "sms_enabled": True,
    }).execute()

    send_email_calls = []
    send_sms_calls = []

    def mock_email(to, subj, msg):
        send_email_calls.append(to)
        return (True, "msg_resend_99", None)

    def mock_sms(to, msg):
        send_sms_calls.append(to)
        return (True, "sid_twilio_99", None)

    monkeypatch.setattr("services.delivery.is_email_configured", lambda: True)
    monkeypatch.setattr("services.delivery.is_sms_configured", lambda: True)
    monkeypatch.setattr("services.delivery.send_email_message", mock_email)
    monkeypatch.setattr("services.delivery.send_sms_message", mock_sms)

    # First dispatch -> accepted
    res1 = dispatch_external_notification(
        user_id=user_id,
        title="Event Notice",
        message="Notice 1",
        event_type="event",
        notification_id="dedupe_notif_1",
    )
    assert res1["email"] == "accepted"
    assert res1["sms"] == "accepted"
    assert len(send_email_calls) == 1
    assert len(send_sms_calls) == 1

    # Second dispatch with same notification_id -> duplicate_skipped
    res2 = dispatch_external_notification(
        user_id=user_id,
        title="Event Notice",
        message="Notice 1",
        event_type="event",
        notification_id="dedupe_notif_1",
    )
    assert res2["email"] == "duplicate_skipped"
    assert res2["sms"] == "duplicate_skipped"
    # Ensure provider functions were NOT called again
    assert len(send_email_calls) == 1
    assert len(send_sms_calls) == 1


def test_delivery_provider_failure_and_skipped_preserved(monkeypatch, verified_alumni_user: dict):
    """
    Provider failures record 'failed'; unverified phone or missing config record 'skipped'.
    """
    from services.delivery import dispatch_external_notification
    user_id = str(verified_alumni_user["id"])

    # Phone is not verified
    supabase.table("users").update({"phone": "+919876543210", "is_phone_verified": False}).eq("id", user_id).execute()
    supabase.table("notification_preferences").insert({
        "user_id": user_id,
        "email_enabled": True,
        "sms_enabled": True,
    }).execute()

    monkeypatch.setattr("services.delivery.is_email_configured", lambda: True)
    monkeypatch.setattr("services.delivery.is_sms_configured", lambda: True)
    # Simulate Resend API error
    monkeypatch.setattr("services.delivery.send_email_message", lambda to, subj, msg: (False, None, "Resend 500 error"))

    res = dispatch_external_notification(
        user_id=user_id,
        title="Alert",
        message="Alert text",
        notification_id="fail_notif_1",
    )

    assert res["email"] == "failed"
    assert res["sms"] == "skipped_unverified_phone"

    records = supabase.table("notification_deliveries").select("*").eq("notification_id", "fail_notif_1").execute().data
    for r in records:
        if r["channel"] == "email":
            assert r["status"] == "failed"
            assert "Resend 500 error" in r["error_message"]
        elif r["channel"] == "sms":
            assert r["status"] == "skipped"
            assert "not verified" in r["error_message"].lower()


# ==============================================================================
# 3. FORGOT PASSWORD & PASSWORD RECOVERY TESTS
# ==============================================================================

def test_forgot_password_generic_response_for_unknown_user(client: TestClient):
    """Requesting password reset for an unknown email returns generic success (no enumeration)."""
    res = client.post(
        "/api/auth/forgot-password",
        json={"identifier": "nonexistent_user@example.com", "channel": "email"},
    )
    assert res.status_code == 200
    assert "code" in res.json().get("message", "").lower()


def test_full_password_recovery_flow(client: TestClient, monkeypatch):
    """Complete 4-step recovery flow: request code, verify code, set new password, login."""
    # The sender is mocked; mark the provider configured so the mocked path runs.
    monkeypatch.setattr("services.delivery.is_email_configured", lambda: True)
    monkeypatch.setattr("services.delivery.send_email_message", lambda to, subj, msg: (True, "mock_resend_recovery_01", None))
    # 1. Register a test user
    email = "recovery_test_user@example.com"
    old_password = "OldPassword123!"
    new_password = "NewStrongPassword456@"

    reg_res = client.post(
        "/api/auth/register",
        json={
            "name": "Recovery Student",
            "email": email,
            "password": old_password,
            "role": "student",
            "student_id": "STU-RECOVERY-01",
            "department": "Computer Science",
            "course": "B.Tech",
            "academic_year": "3rd Year",
            "graduation_year": "2026",
            "phone": "9876543210",
        },
    )
    assert reg_res.status_code == 201

    # Simulate administrator approving this student account so they can log in
    users_collection.update_one(
        {"email": email},
        {"$set": {"is_verified": True, "verification_status": "approved"}}
    )

    # Capture an active token before reset; reset must revoke existing sessions.
    prior_login = client.post("/api/auth/login", json={"email": email, "password": old_password})
    assert prior_login.status_code == 200
    prior_session_headers = {"Authorization": f"Bearer {prior_login.json()['access_token']}"}

    # 2. Request password reset code via service (to get debug code in mock mode)
    success, msg, debug_code = request_password_reset(email, "email")
    assert success is True
    assert debug_code is not None

    # 3. Test invalid code rejection
    inv_res = client.post(
        "/api/auth/verify-reset-code",
        json={"identifier": email, "code": "000000"},
    )
    assert inv_res.status_code == 400
    assert "incorrect" in inv_res.json().get("detail", "").lower() or "invalid" in inv_res.json().get("detail", "").lower()

    # 4. Verify with the actual code
    val_res = client.post(
        "/api/auth/verify-reset-code",
        json={"identifier": email, "code": debug_code},
    )
    assert val_res.status_code == 200
    reset_token = val_res.json()["reset_token"]
    assert reset_token

    # 5. Set new password
    reset_res = client.post(
        "/api/auth/reset-password",
        json={"reset_token": reset_token, "new_password": new_password},
    )
    assert reset_res.status_code == 200

    # A reset token can only be consumed once.
    replay_res = client.post(
        "/api/auth/reset-password",
        json={"reset_token": reset_token, "new_password": "AnotherStrongPass789!"},
    )
    assert replay_res.status_code == 400

    # Tokens issued before the reset must no longer access protected endpoints.
    assert client.get("/profile/me", headers=prior_session_headers).status_code == 401

    # 6. Verify old password fails
    old_login = client.post("/api/auth/login", json={"email": email, "password": old_password})
    assert old_login.status_code == 401

    # 7. Verify new password succeeds
    new_login = client.post("/api/auth/login", json={"email": email, "password": new_password})
    assert new_login.status_code == 200


def test_password_recovery_finds_formatted_phone_identifier(verified_alumni_user: dict):
    """Formatted phone number input resolves the user's canonical E.164 contact."""
    from services.password_recovery import find_user_by_contact

    canonical_phone = "+919876543210"
    users_collection.update_one(
        {"_id": verified_alumni_user["id"]},
        {"$set": {"phone": canonical_phone, "is_phone_verified": True}},
    )

    found = find_user_by_contact("+91 98765-43210")
    assert found is not None
    assert found["_id"] == verified_alumni_user["id"]


def test_password_recovery_locks_after_five_incorrect_attempts(client: TestClient, verified_alumni_user: dict, monkeypatch):
    """Five wrong reset-code guesses invalidate the challenge."""
    monkeypatch.setattr("services.delivery.is_email_configured", lambda: True)
    monkeypatch.setattr(
        "services.delivery.send_email_message",
        lambda to, subj, msg: (True, "resend_attempt_lock_001", None),
    )

    success, _, valid_code = request_password_reset(verified_alumni_user["email"], "email")
    assert success is True
    assert valid_code

    wrong_code = "000000" if valid_code != "000000" else "111111"
    for attempt in range(5):
        ok, message, token = verify_password_reset_code(verified_alumni_user["email"], wrong_code)
        assert ok is False
        assert token is None
        if attempt == 4:
            assert "maximum" in message.lower()

    ok, message, token = verify_password_reset_code(verified_alumni_user["email"], valid_code)
    assert ok is False
    assert token is None


def test_twilio_verify_password_reset_uses_provider_code(client: TestClient, verified_alumni_user: dict, monkeypatch):
    """Twilio Verify-managed OTPs are checked through Twilio, not against a local hash."""
    user_id = verified_alumni_user["id"]
    phone = "+919876543210"
    users_collection.update_one(
        {"_id": user_id},
        {"$set": {"phone": phone, "is_phone_verified": True}},
    )

    monkeypatch.setattr("services.delivery.is_twilio_verify_configured", lambda: True)
    monkeypatch.setattr("services.delivery.is_sms_configured", lambda: False)
    monkeypatch.setattr(
        "services.delivery.send_twilio_verify_otp",
        lambda to: (True, "VE_unit_test_reset_001", None),
    )
    checked_codes = []
    monkeypatch.setattr(
        "services.delivery.check_twilio_verify_otp",
        lambda to, code: (checked_codes.append(code) or (code == "123456"), "Incorrect verification code."),
    )

    success, message, debug_code = request_password_reset(phone, "sms")
    assert success is True
    assert debug_code is None

    challenge = (
        supabase.table("password_reset_challenges")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
        .data[0]
    )
    assert challenge["verification_provider"] == "twilio_verify"

    incorrect, error, reset_token = verify_password_reset_code(phone, "000000")
    assert incorrect is False
    assert reset_token is None
    assert "attempt" in error.lower()

    verified, message, reset_token = verify_password_reset_code(phone, "123456")
    assert verified is True
    assert reset_token
    assert checked_codes == ["000000", "123456"]

    reset_ok, reset_message = reset_password_with_token(reset_token, "TwilioResetPassword789!")
    assert reset_ok is True


def test_password_recovery_preserves_verification_status(
    client: TestClient, unverified_alumni_user: dict, monkeypatch
):
    """Password reset preserves the unverified status of an account (cannot bypass moderation)."""
    # The sender is mocked; mark the provider configured so the mocked path runs.
    monkeypatch.setattr("services.delivery.is_email_configured", lambda: True)
    monkeypatch.setattr("services.delivery.send_email_message", lambda to, subj, msg: (True, "mock_resend_preserve_01", None))
    email = unverified_alumni_user["email"]
    user_id = unverified_alumni_user["id"]

    # Verify initial status is pending
    u_before = users_collection.find_one({"_id": user_id})
    assert u_before.get("is_verified") is False
    assert u_before.get("verification_status") == "pending"

    # 1. Request code and get debug code
    success, msg, debug_code = request_password_reset(email, "email")
    assert success is True

    # 2. Verify code
    verified, msg, reset_token = verify_password_reset_code(email, debug_code)
    assert verified is True
    assert reset_token is not None

    # 3. Execute password reset
    success, msg = reset_password_with_token(reset_token, "BrandNewPassword789#")
    assert success is True

    # 4. Check user verification status remains unchanged!
    u_after = users_collection.find_one({"_id": user_id})
    assert u_after.get("is_verified") is False
    assert u_after.get("verification_status") == "pending"

    # 5. Confirm password hash was updated with Argon2
    assert password_hasher.verify("BrandNewPassword789#", u_after["password_hash"]) is True

    # 6. Verify unverified login still fails (account cannot bypass review)
    unapproved_login = client.post("/api/auth/login", json={"email": email, "password": "BrandNewPassword789#"})
    assert unapproved_login.status_code == 403


def test_password_recovery_expired_code_rejected(client: TestClient, verified_alumni_user: dict):
    """Expired password reset codes are rejected with 400 Bad Request."""
    from datetime import datetime, timezone, timedelta
    from services.password_recovery import _hash_value

    email = verified_alumni_user["email"]
    user_id = str(verified_alumni_user["id"])

    # Insert an expired challenge (5 minutes ago)
    past_iso = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()
    supabase.table("password_reset_challenges").insert({
        "id": "expired-test-id",
        "user_id": user_id,
        "channel": "email",
        "recipient": email,
        "code_hash": _hash_value("123456"),
        "attempts": 0,
        "max_attempts": 5,
        "is_used": False,
        "expires_at": past_iso,
    }).execute()

    res = client.post(
        "/api/auth/verify-reset-code",
        json={"identifier": email, "code": "123456"},
    )
    assert res.status_code == 400
    assert "expired" in res.json().get("detail", "").lower()


def test_phone_verification_flow(client: TestClient, verified_alumni_user: dict, monkeypatch):
    """SMS delivery is confirmed before success; wrong attempts count; valid code verifies the phone."""
    test_phone = "+919876543210"
    monkeypatch.setattr("services.delivery.is_sms_configured", lambda: True)
    monkeypatch.setattr(
        "services.delivery.send_sms_message",
        lambda to, msg: (True, "twilio_phone_ok_001", None),
    )

    response = client.post(
        "/api/auth/phone/send-code",
        headers=verified_alumni_user["headers"],
        json={"phone": test_phone},
    )
    assert response.status_code == 200
    debug_code = response.json().get("_debug_code")
    assert debug_code and len(debug_code) == 6

    wrong_code = "000000" if debug_code != "000000" else "111111"
    wrong = client.post(
        "/api/auth/phone/verify-code",
        headers=verified_alumni_user["headers"],
        json={"code": wrong_code},
    )
    assert wrong.status_code == 400
    assert "attempt" in wrong.json()["detail"].lower()

    valid = client.post(
        "/api/auth/phone/verify-code",
        headers=verified_alumni_user["headers"],
        json={"code": debug_code},
    )
    assert valid.status_code == 200
    saved_user = users_collection.find_one({"_id": verified_alumni_user["id"]})
    assert saved_user["phone"] == test_phone
    assert saved_user["is_phone_verified"] is True

    repeated = client.post(
        "/api/auth/phone/verify-code",
        headers=verified_alumni_user["headers"],
        json={"code": debug_code},
    )
    assert repeated.status_code == 400


def test_phone_verification_rejects_failed_sms_delivery(
    client: TestClient,
    verified_alumni_user: dict,
    monkeypatch,
):
    """A rejected provider request cannot yield a false 'code sent' response."""
    monkeypatch.setattr("services.delivery.is_sms_configured", lambda: True)
    monkeypatch.setattr(
        "services.delivery.send_sms_message",
        lambda to, msg: (False, None, "provider rejected request"),
    )

    response = client.post(
        "/api/auth/phone/send-code",
        headers=verified_alumni_user["headers"],
        json={"phone": "+919876543210"},
    )
    assert response.status_code == 503
    assert "could not deliver" in response.json()["detail"].lower()

    challenges = (
        supabase.table("phone_verification_codes")
        .select("*")
        .eq("user_id", verified_alumni_user["id"])
        .execute()
        .data
    )
    assert len(challenges) == 1
    assert challenges[0]["is_used"] is True

    deliveries = (
        supabase.table("notification_deliveries")
        .select("*")
        .eq("user_id", verified_alumni_user["id"])
        .eq("event_type", "phone_verification")
        .execute()
        .data
    )
    assert len(deliveries) == 1
    assert deliveries[0]["status"] == "failed"


def test_phone_verification_enforces_server_side_cooldown(
    client: TestClient,
    verified_alumni_user: dict,
    monkeypatch,
):
    """A second send within sixty seconds is rejected by the backend."""
    send_calls = []
    monkeypatch.setattr("services.delivery.is_sms_configured", lambda: True)
    monkeypatch.setattr(
        "services.delivery.send_sms_message",
        lambda to, msg: (send_calls.append(to) or True, "twilio_cooldown_001", None),
    )

    first = client.post(
        "/api/auth/phone/send-code",
        headers=verified_alumni_user["headers"],
        json={"phone": "+919876543210"},
    )
    second = client.post(
        "/api/auth/phone/send-code",
        headers=verified_alumni_user["headers"],
        json={"phone": "+919876543211"},
    )
    assert first.status_code == 200
    assert second.status_code == 429
    assert "wait" in second.json()["detail"].lower()
    assert len(send_calls) == 1


def test_phone_challenge_is_invalidated_after_profile_number_change(
    client: TestClient,
    verified_alumni_user: dict,
    monkeypatch,
):
    """An OTP sent before a later profile phone edit cannot restore the old number."""
    monkeypatch.setattr("services.delivery.is_sms_configured", lambda: True)
    monkeypatch.setattr(
        "services.delivery.send_sms_message",
        lambda to, msg: (True, "twilio_stale_phone_001", None),
    )

    old_phone = "+919876543210"
    sent = client.post(
        "/api/auth/phone/send-code",
        headers=verified_alumni_user["headers"],
        json={"phone": old_phone},
    )
    assert sent.status_code == 200
    old_code = sent.json()["_debug_code"]

    updated = client.put(
        "/profile/me",
        headers=verified_alumni_user["headers"],
        json={"phone": "+919999888877"},
    )
    assert updated.status_code == 200

    challenges = (
        supabase.table("phone_verification_codes")
        .select("*")
        .eq("phone", old_phone)
        .execute()
        .data
    )
    assert len(challenges) == 1
    assert challenges[0]["is_used"] is True
    assert challenges[0]["phone_version"] == 0

    stale_verify = client.post(
        "/api/auth/phone/verify-code",
        headers=verified_alumni_user["headers"],
        json={"code": old_code},
    )
    assert stale_verify.status_code == 400

    saved = users_collection.find_one({"_id": verified_alumni_user["id"]})
    assert saved["phone"] == "+919999888877"
    assert saved["is_phone_verified"] is False
    assert saved["phone_version"] == 1


def test_phone_verification_locks_after_five_incorrect_attempts(
    client: TestClient,
    verified_alumni_user: dict,
    monkeypatch,
):
    """Five wrong guesses invalidate the challenge and prevent any later valid guess."""
    monkeypatch.setattr("services.delivery.is_sms_configured", lambda: True)
    monkeypatch.setattr(
        "services.delivery.send_sms_message",
        lambda to, msg: (True, "twilio_lock_001", None),
    )
    sent = client.post(
        "/api/auth/phone/send-code",
        headers=verified_alumni_user["headers"],
        json={"phone": "+919876543210"},
    )
    assert sent.status_code == 200
    valid_code = sent.json()["_debug_code"]
    wrong_code = "999999" if valid_code != "999999" else "888888"

    for attempt in range(5):
        result = client.post(
            "/api/auth/phone/verify-code",
            headers=verified_alumni_user["headers"],
            json={"code": wrong_code},
        )
        assert result.status_code == 400
        if attempt == 4:
            assert "maximum" in result.json()["detail"].lower()

    final_try = client.post(
        "/api/auth/phone/verify-code",
        headers=verified_alumni_user["headers"],
        json={"code": valid_code},
    )
    assert final_try.status_code == 400


# ==============================================================================
# 4. PRE-MIGRATION INTEGRITY & SAFETY REVIEWS
# ==============================================================================

def test_migration_015_session_revocation_and_otp_security():
    """Production-timestamped auth/session migration persists token versions and service-only recovery RPCs."""
    import pathlib

    migration_path = pathlib.Path(__file__).parents[2] / "supabase" / "migrations" / "20261108085038_auth_session_and_phone_verification_security.sql"
    assert migration_path.exists()
    sql = migration_path.read_text(encoding="utf-8")

    assert "ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 0" in sql
    assert "verification_provider" in sql
    assert "create_phone_verification_challenge" in sql
    assert "consume_phone_verification_challenge" in sql
    assert "complete_phone_verification" in sql
    assert "phone_version" in sql
    assert "p_phone_version INTEGER" in sql
    assert "FOR UPDATE OF u, pvc" in sql
    assert "record_phone_verification_failure" in sql
    assert "record_password_reset_failure" in sql
    assert "reset_password_and_revoke_sessions" in sql
    assert "GRANT EXECUTE ON FUNCTION public.reset_password_and_revoke_sessions" in sql
    assert "FROM anon, authenticated" in sql


def test_migration_004_creates_private_storage_and_safe_backfill():
    """Verify migration 004 declares private bucket, storage RLS, and safe phone backfill."""
    import pathlib
    migration_path = pathlib.Path(__file__).parents[2] / "supabase" / "migrations" / "004_gallery_notifications_password_recovery.sql"
    assert migration_path.exists(), "Migration file 004 must exist"
    sql = migration_path.read_text(encoding="utf-8")

    # 1. Bucket is created as strictly private
    assert "alumni-portal-gallery" in sql
    assert "public = false" in sql or "false, -- Strictly PRIVATE" in sql
    assert "8388608" in sql  # 8MB limit

    # 2. Storage RLS policies protect originals
    assert "storage.objects" in sql
    assert "Deny direct client access to originals" in sql
    assert "gp.status = 'approved'" in sql

    # 3. Safe phone backfill preserves verification status
    assert "is_phone_verified BOOLEAN NOT NULL DEFAULT false" in sql
    assert "UPDATE public.users" in sql
    assert "trim(sp.phone)" in sql

    # 4. Status check constraint includes 'accepted' and 'sent'
    assert "status IN ('accepted', 'sent', 'delivered', 'failed', 'skipped', 'pending')" in sql


def test_password_recovery_safety_when_secret_missing(monkeypatch):
    """Password recovery fails safely without unhandled crashes when secret is missing."""
    monkeypatch.delenv("PASSWORD_RESET_SECRET_KEY", raising=False)
    monkeypatch.delenv("JWT_SECRET_KEY", raising=False)
    monkeypatch.delenv("PYTEST_CURRENT_TEST", raising=False)
    monkeypatch.setenv("DATABASE_MODE", "supabase")

    success, msg, debug_code = request_password_reset("any_user@example.com", "email")
    assert success is False
    assert "unavailable" in msg.lower()
    assert debug_code is None


# ==============================================================================
# 5. PROVIDER INTEGRATION, NORMALIZATION & WEBHOOK TESTS
# ==============================================================================

def test_phone_number_normalization():
    """Phone normalization converts diverse formats to standard E.164."""
    from services.delivery import normalize_phone_number

    assert normalize_phone_number("+919876543210") == "+919876543210"
    assert normalize_phone_number("9876543210") == "+919876543210"
    assert normalize_phone_number("+91 98765-43210") == "+919876543210"
    assert normalize_phone_number("09876543210") == "+919876543210"
    assert normalize_phone_number("") == ""


def test_password_recovery_and_phone_verify_audit_deliveries(monkeypatch, verified_alumni_user: dict):
    """Password reset and phone verification requests create audit records in notification_deliveries."""
    from services.password_recovery import request_password_reset, send_phone_verification_code
    email = verified_alumni_user["email"]
    user_id = str(verified_alumni_user["id"])

    # Configure user in mock db
    supabase.table("users").update({"phone": "+919876543210", "is_phone_verified": True}).eq("id", user_id).execute()

    # Mock provider functions
    monkeypatch.setattr("services.delivery.is_email_configured", lambda: True)
    monkeypatch.setattr("services.delivery.is_sms_configured", lambda: True)
    monkeypatch.setattr("services.delivery.send_email_message", lambda to, subj, msg: (True, "resend_reset_001", None))
    monkeypatch.setattr("services.delivery.send_sms_message", lambda to, msg: (True, "twilio_verify_001", None))

    # 1. Password reset
    req_ok, _, _ = request_password_reset(email, "email")
    assert req_ok is True

    reset_deliv = supabase.table("notification_deliveries").select("*").eq("provider_message_id", "resend_reset_001").execute().data
    assert len(reset_deliv) == 1
    assert reset_deliv[0]["event_type"] == "password_reset"
    assert reset_deliv[0]["status"] == "accepted"

    # 2. Phone verification
    phone_ok, _, _ = send_phone_verification_code(user_id, "+919876543210")
    assert phone_ok is True

    verify_deliv = supabase.table("notification_deliveries").select("*").eq("provider_message_id", "twilio_verify_001").execute().data
    assert len(verify_deliv) == 1
    assert verify_deliv[0]["event_type"] == "phone_verification"
    assert verify_deliv[0]["status"] == "accepted"


def test_resend_and_twilio_webhooks(client: TestClient, monkeypatch):
    """Unsigned callbacks are rejected; valid Resend/Svix and Twilio signatures update delivery status."""
    import base64
    import hashlib
    import hmac
    import json
    import time
    from twilio.request_validator import RequestValidator
    from services.delivery import record_delivery

    # Record accepted email delivery first.
    record_delivery(
        user_id="user_webhook_test",
        channel="email",
        recipient="test@example.com",
        status="accepted",
        provider_message_id="resend_hook_123",
    )

    # Sign the exact raw bytes and required Svix headers.
    resend_secret_bytes = b"soet-resend-test-webhook-secret"
    resend_secret = "whsec_" + base64.b64encode(resend_secret_bytes).decode("ascii")
    monkeypatch.setenv("RESEND_WEBHOOK_SECRET", resend_secret)
    raw_body = json.dumps({
        "type": "email.delivered",
        "data": {"email_id": "resend_hook_123"},
    }, separators=(",", ":")).encode("utf-8")
    webhook_id = "msg_unit_test_resend_001"
    timestamp = str(int(time.time()))
    signed_payload = webhook_id.encode() + b"." + timestamp.encode() + b"." + raw_body
    signature = base64.b64encode(
        hmac.new(resend_secret_bytes, signed_payload, hashlib.sha256).digest()
    ).decode("ascii")
    resend_headers = {
        "svix-id": webhook_id,
        "svix-timestamp": timestamp,
        "svix-signature": f"v1,{signature}",
        "content-type": "application/json",
    }

    unsigned_resend = client.post(
        "/api/notifications/deliveries/webhook/resend",
        content=raw_body,
        headers={"content-type": "application/json"},
    )
    assert unsigned_resend.status_code == 403

    resend_res = client.post(
        "/api/notifications/deliveries/webhook/resend",
        content=raw_body,
        headers=resend_headers,
    )
    assert resend_res.status_code == 200
    assert resend_res.json()["status"] == "success"

    email_rec = supabase.table("notification_deliveries").select("*").eq(
        "provider_message_id", "resend_hook_123"
    ).execute().data[0]
    assert email_rec["status"] == "delivered"

    # Record accepted SMS delivery.
    record_delivery(
        user_id="user_webhook_test",
        channel="sms",
        recipient="+919876543210",
        status="accepted",
        provider_message_id="SM_webhook_twilio_456",
    )

    # Twilio callback signatures cover the canonical URL and POST form parameters.
    twilio_auth_token = "soet-unit-test-twilio-auth-token"
    callback_url = "https://soet-connect.vercel.app/api/notifications/deliveries/webhook/twilio"
    monkeypatch.setenv("TWILIO_AUTH_TOKEN", twilio_auth_token)
    monkeypatch.setenv("TWILIO_WEBHOOK_URL", callback_url)
    callback_data = {
        "MessageSid": "SM_webhook_twilio_456",
        "MessageStatus": "delivered",
    }
    validator = RequestValidator(twilio_auth_token)
    twilio_signature = validator.compute_signature(callback_url, callback_data)

    unsigned_twilio = client.post(
        "/api/notifications/deliveries/webhook/twilio",
        data=callback_data,
    )
    assert unsigned_twilio.status_code == 403

    twilio_res = client.post(
        "/api/notifications/deliveries/webhook/twilio",
        data=callback_data,
        headers={"X-Twilio-Signature": twilio_signature},
    )
    assert twilio_res.status_code == 200
    assert twilio_res.json()["status"] == "success"

    sms_rec = supabase.table("notification_deliveries").select("*").eq(
        "provider_message_id", "SM_webhook_twilio_456"
    ).execute().data[0]
    assert sms_rec["status"] == "delivered"


def test_notification_webhooks_reject_oversized_payloads(client: TestClient, monkeypatch):
    """Unsigned webhook routes reject oversized payloads before signature parsing."""
    import base64

    monkeypatch.setenv(
        "RESEND_WEBHOOK_SECRET",
        "whsec_" + base64.b64encode(b"resend-webhook-size-test").decode("ascii"),
    )
    resend_body = b'{"type":"email.delivered","data":{}}' + (
        b" " * (64 * 1024)
    )
    resend_response = client.post(
        "/api/notifications/deliveries/webhook/resend",
        content=resend_body,
        headers={"content-type": "application/json"},
    )
    assert resend_response.status_code == 413

    monkeypatch.setenv("TWILIO_AUTH_TOKEN", "twilio-webhook-size-test")
    twilio_body = b"MessageSid=SM_test&" + (b"x" * (16 * 1024))
    twilio_response = client.post(
        "/api/notifications/deliveries/webhook/twilio",
        content=twilio_body,
        headers={"content-type": "application/x-www-form-urlencoded"},
    )
    assert twilio_response.status_code == 413


def test_limited_webhook_reader_stops_chunked_body_at_size_cap():
    """Chunked request bodies are stopped as soon as they cross the configured limit."""
    import asyncio
    from fastapi import HTTPException, Request
    from routes.notifications import _read_limited_webhook_body

    chunks = iter([
        {"type": "http.request", "body": b"a" * 8, "more_body": True},
        {"type": "http.request", "body": b"b", "more_body": True},
        {"type": "http.request", "body": b"unused", "more_body": False},
    ])
    received = 0

    async def receive():
        nonlocal received
        received += 1
        return next(chunks)

    request = Request(
        {
            "type": "http",
            "http_version": "1.1",
            "method": "POST",
            "scheme": "https",
            "path": "/notifications/deliveries/webhook/resend",
            "raw_path": b"/notifications/deliveries/webhook/resend",
            "query_string": b"",
            "headers": [],
            "server": ("testserver", 443),
            "client": ("testclient", 12345),
        },
        receive,
    )

    async def assert_limit():
        with pytest.raises(HTTPException) as exc:
            await _read_limited_webhook_body(request, max_bytes=8)
        assert exc.value.status_code == 413
        assert received == 2

    asyncio.run(assert_limit())


def test_resend_webhook_rejects_stale_or_tampered_payload(client: TestClient, monkeypatch):
    """A valid signature for an altered raw body and a stale timestamp both fail."""
    import base64
    import hashlib
    import hmac
    import json
    import time

    secret_bytes = b"soet-resend-test-secret"
    secret = "whsec_" + base64.b64encode(secret_bytes).decode("ascii")
    monkeypatch.setenv("RESEND_WEBHOOK_SECRET", secret)
    webhook_id = "msg_unit_test_resend_stale"
    raw_body = json.dumps({"type": "email.delivered", "data": {"email_id": "x"}}).encode()
    stale_timestamp = str(int(time.time()) - 600)
    signed = webhook_id.encode() + b"." + stale_timestamp.encode() + b"." + raw_body
    signature = base64.b64encode(
        hmac.new(secret_bytes, signed, hashlib.sha256).digest()
    ).decode("ascii")
    response = client.post(
        "/api/notifications/deliveries/webhook/resend",
        content=raw_body,
        headers={
            "content-type": "application/json",
            "svix-id": webhook_id,
            "svix-timestamp": stale_timestamp,
            "svix-signature": f"v1,{signature}",
        },
    )
    assert response.status_code == 403


def test_provider_failure_does_not_break_notifications_or_recovery(monkeypatch, verified_alumni_user: dict):
    """Provider network failures never break core notification creation or password reset."""
    from services.notifications import create_notification
    from services.password_recovery import request_password_reset

    user_id = str(verified_alumni_user["id"])
    email = verified_alumni_user["email"]

    # Simulate catastrophic network exception from Resend HTTP call
    def mock_broken_send(*args, **kwargs):
        raise ConnectionError("Network unreachable")

    monkeypatch.setattr("services.delivery.is_email_configured", lambda: True)
    monkeypatch.setattr("services.delivery.send_email_message", mock_broken_send)

    # 1. create_notification must succeed without raising exception
    notif = create_notification(
        user_id=user_id,
        title="Job Alert",
        message="New job posted",
        notification_type="job",
    )
    assert notif is not None
    assert notif["title"] == "Job Alert"

    # 2. request_password_reset must succeed without raising exception
    success, msg, debug_code = request_password_reset(email, "email")
    assert success is True
    assert "code" in msg.lower()


def test_env_save_and_load_preserves_existing_keys_and_formatting(tmp_path):
    """Test that saving env entries strictly preserves existing keys, comments, and structure."""
    from configure_notifications import load_env_entries, save_env_entries

    env_file = tmp_path / ".env"
    initial_content = (
        "# Server Configuration\n"
        "PORT=8000\n"
        "DATABASE_BACKEND=supabase\n"
        "\n"
        "# Secrets\n"
        "JWT_SECRET_KEY=keep_this_secret_value\n"
    )
    env_file.write_text(initial_content, encoding="utf-8")

    # Update with Resend credentials
    save_env_entries(env_file, {
        "RESEND_API_KEY": "re_test_key_123",
        "RESEND_FROM_EMAIL": "SOET Connect <onboarding@resend.dev>",
    })

    _, entries = load_env_entries(env_file)
    assert entries["PORT"] == "8000"
    assert entries["DATABASE_BACKEND"] == "supabase"
    assert entries["JWT_SECRET_KEY"] == "keep_this_secret_value"
    assert entries["RESEND_API_KEY"] == "re_test_key_123"
    assert entries["RESEND_FROM_EMAIL"] == "SOET Connect <onboarding@resend.dev>"

    # Update an existing key without duplicating
    save_env_entries(env_file, {
        "PORT": "8080",
    })

    updated_text = env_file.read_text(encoding="utf-8")
    assert "PORT=8080" in updated_text
    assert updated_text.count("PORT=") == 1
    assert "JWT_SECRET_KEY=keep_this_secret_value" in updated_text


def test_validate_resend_api_key_mock(monkeypatch):
    """Test validate_resend_api_key with mocked responses."""
    from configure_notifications import validate_resend_api_key

    class MockResp:
        def __init__(self, status_code, data=None):
            self.status_code = status_code
            self._data = data or {}
        def json(self):
            return self._data

    # Test success
    monkeypatch.setattr("httpx.Client.get", lambda self, url, **kwargs: MockResp(200, {"data": []}))
    ok, msg = validate_resend_api_key("re_valid_key")
    assert ok is True
    assert "authorized" in msg

    # Test failure
    monkeypatch.setattr("httpx.Client.get", lambda self, url, **kwargs: MockResp(401, {"message": "Invalid API key"}))
    ok, msg = validate_resend_api_key("re_invalid_key")
    assert ok is False
    assert "Invalid API key" in msg


def test_validate_twilio_credentials_mock(monkeypatch):
    """Test validate_twilio_credentials with mocked responses."""
    from configure_notifications import validate_twilio_credentials

    class MockResp:
        def __init__(self, status_code, data=None):
            self.status_code = status_code
            self._data = data or {}
        def json(self):
            return self._data

    # Test success
    monkeypatch.setattr("httpx.Client.get", lambda self, url, **kwargs: MockResp(200, {"status": "active", "friendly_name": "Test Account"}))
    ok, msg = validate_twilio_credentials("AC1234567890", "token123", "+1234567890")
    assert ok is True
    assert "verified" in msg

    # Test failure
    monkeypatch.setattr("httpx.Client.get", lambda self, url, **kwargs: MockResp(401, {"message": "Authenticate"}))
    ok, msg = validate_twilio_credentials("AC1234567890", "token123", "+1234567890")
    assert ok is False
    assert "rejected" in msg


def test_validate_resend_restricted_sending_key_accepted(monkeypatch):
    """Resend keys restricted to sending emails only are recognized as valid."""
    from configure_notifications import validate_resend_api_key

    class MockResp:
        def __init__(self, status_code, data):
            self.status_code = status_code
            self._data = data
        def json(self):
            return self._data

    restricted_body = {
        "statusCode": 401,
        "message": "This API key is restricted to only send emails",
        "name": "restricted_api_key",
    }
    monkeypatch.setattr("httpx.Client.get", lambda self, url, **kwargs: MockResp(401, restricted_body))
    ok, msg = validate_resend_api_key("re_restricted_key")
    assert ok is True
    assert "Sending emails access" in msg


def test_twilio_error_572006_handling_in_delivery(monkeypatch):
    """Twilio error 572006 is explicitly handled with explanatory message for trial account custom bodies."""
    from services.delivery import send_sms_message

    class MockTwilioResp:
        status_code = 400
        text = '{"code":572006,"message":"Invalid template name. Trial accounts can only use predefined SMS templates."}'
        def json(self):
            return {
                "code": 572006,
                "message": "Invalid template name. Trial accounts can only use predefined SMS templates.",
                "status": 400,
            }

    monkeypatch.setenv("TWILIO_ACCOUNT_SID", "AC1234567890")
    monkeypatch.setenv("TWILIO_AUTH_TOKEN", "token123")
    monkeypatch.setenv("TWILIO_FROM_NUMBER", "+1234567890")
    monkeypatch.setattr("httpx.Client.post", lambda self, url, **kwargs: MockTwilioResp())

    ok, sid, err_msg = send_sms_message("+919876543210", "Custom SOET message")
    assert ok is False
    assert sid is None
    assert "572006" in err_msg
    assert "Trial accounts reject custom SMS bodies" in err_msg


def test_trial_connectivity_test_success_and_labeling(monkeypatch):
    """Trial connectivity test uses predefined template and preserves custom message generation."""
    from services.delivery import send_trial_sms_connectivity_test

    class MockSuccessResp:
        status_code = 201
        text = '{"sid":"SM_trial_12345"}'
        def json(self):
            return {"sid": "SM_trial_12345"}

    monkeypatch.setenv("TWILIO_ACCOUNT_SID", "AC1234567890")
    monkeypatch.setenv("TWILIO_AUTH_TOKEN", "token123")
    monkeypatch.setenv("TWILIO_FROM_NUMBER", "+1234567890")
    monkeypatch.setattr("httpx.Client.post", lambda self, url, **kwargs: MockSuccessResp())

    ok, sid, msg = send_trial_sms_connectivity_test("+919876543210", template_name="sms_2fa")
    assert ok is True
    assert sid == "SM_trial_12345"
    assert "template: sms_2fa" in msg


def test_send_sms_rejects_identical_sender_and_recipient(monkeypatch):
    """Pre-flight check blocks sending when sender and recipient are identical."""
    from services.delivery import send_sms_message

    monkeypatch.setenv("TWILIO_ACCOUNT_SID", "AC1234567890")
    monkeypatch.setenv("TWILIO_AUTH_TOKEN", "token123")
    monkeypatch.setenv("TWILIO_FROM_NUMBER", "+919876543210")

    ok, sid, err_msg = send_sms_message("+919876543210", "Test message")
    assert ok is False
    assert sid is None
    assert "cannot be identical" in err_msg


def test_send_sms_rejects_missing_from_number(monkeypatch):
    """Pre-flight check blocks sending when TWILIO_FROM_NUMBER is missing or empty."""
    from services.delivery import send_sms_message

    monkeypatch.setenv("TWILIO_ACCOUNT_SID", "AC1234567890")
    monkeypatch.setenv("TWILIO_AUTH_TOKEN", "token123")
    monkeypatch.delenv("TWILIO_FROM_NUMBER", raising=False)

    ok, sid, err_msg = send_sms_message("+919876543210", "Test message")
    assert ok is False
    assert sid is None
    assert "not configured" in err_msg.lower()


def test_trial_connectivity_rejects_identical_sender_and_recipient(monkeypatch):
    """Trial connectivity test prevents sending when sender and recipient are identical."""
    from services.delivery import send_trial_sms_connectivity_test

    monkeypatch.setenv("TWILIO_ACCOUNT_SID", "AC1234567890")
    monkeypatch.setenv("TWILIO_AUTH_TOKEN", "token123")
    monkeypatch.setenv("TWILIO_FROM_NUMBER", "+919876543210")

    ok, sid, err_msg = send_trial_sms_connectivity_test("+919876543210")
    assert ok is False
    assert sid is None
    assert "cannot be identical" in err_msg


def test_validate_twilio_credentials_reports_unconfigured_from_number_without_failing(monkeypatch):
    """Credential check succeeds and notes missing sender without marking credentials invalid."""
    from configure_notifications import validate_twilio_credentials

    class MockResp:
        def __init__(self, status_code, data=None):
            self.status_code = status_code
            self._data = data or {}
        def json(self):
            return self._data

    monkeypatch.setattr("httpx.Client.get", lambda self, url, **kwargs: MockResp(200, {"status": "active", "friendly_name": "Trial Account", "type": "Trial"}))
    ok, msg = validate_twilio_credentials("AC1234567890", "token123", "")
    assert ok is True
    assert "verified" in msg
    assert "TWILIO_FROM_NUMBER is not yet configured" in msg


def test_twilio_verify_configured_helper(monkeypatch):
    """Twilio verify detection helper recognizes presence and absence of service SID."""
    from services.delivery import is_twilio_verify_configured

    monkeypatch.delenv("TWILIO_VERIFY_SERVICE_SID", raising=False)
    assert is_twilio_verify_configured() is False

    monkeypatch.setenv("TWILIO_ACCOUNT_SID", "AC12345")
    monkeypatch.setenv("TWILIO_AUTH_TOKEN", "token123")
    monkeypatch.setenv("TWILIO_VERIFY_SERVICE_SID", "VA1234567890")
    assert is_twilio_verify_configured() is True


def test_password_recovery_sms_trial_error_guidance(monkeypatch, verified_alumni_user: dict):
    """When SMS recovery fails due to trial error 572006, clear guidance directs user to email."""
    from services.password_recovery import request_password_reset

    user_id = str(verified_alumni_user["id"])
    email = verified_alumni_user["email"]

    # Configure user with verified phone
    supabase.table("users").update({"phone": "+919876543210", "is_phone_verified": True}).eq("id", user_id).execute()

    class MockTwilio572006:
        status_code = 400
        text = '{"code":572006,"message":"Trial accounts reject custom SMS bodies."}'
        def json(self):
            return {"code": 572006, "message": "Trial accounts reject custom SMS bodies."}

    monkeypatch.setenv("TWILIO_ACCOUNT_SID", "AC12345")
    monkeypatch.setenv("TWILIO_AUTH_TOKEN", "token123")
    monkeypatch.setenv("TWILIO_FROM_NUMBER", "+15005550006")
    monkeypatch.delenv("TWILIO_VERIFY_SERVICE_SID", raising=False)
    monkeypatch.setattr("httpx.Client.post", lambda self, url, **kwargs: MockTwilio572006())

    ok, msg, debug_code = request_password_reset("+919876543210", "sms")
    assert ok is False
    assert debug_code is None
    assert "Twilio trial restrictions" in msg
    assert "Email recovery" in msg


def test_email_delivery_failure_invalidates_challenge(monkeypatch, verified_alumni_user: dict):
    """When email delivery fails (e.g. Resend testing restriction), the challenge is
    immediately invalidated so the user can retry without being stranded for 10 minutes."""
    from services.password_recovery import request_password_reset

    email = verified_alumni_user["email"]
    user_id = str(verified_alumni_user["id"])

    # Simulate Resend 403 testing restriction
    monkeypatch.setattr(
        "services.delivery.send_email_message",
        lambda to, subj, msg: (False, None, "Resend API error (403): You can only send testing emails to your own email address"),
    )

    ok, msg, debug_code = request_password_reset(email, "email")

    # The response is still the generic success message (anti-enumeration)
    assert ok is True
    assert "code" in msg.lower()

    # But the challenge should be invalidated because the code was never delivered
    challenges = supabase.table("password_reset_challenges").select("*").eq(
        "user_id", user_id
    ).execute().data
    assert len(challenges) >= 1
    latest = sorted(challenges, key=lambda c: c["created_at"], reverse=True)[0]
    assert latest["is_used"] is True, "Challenge should be invalidated after delivery failure"


def test_successful_delivery_keeps_challenge_active(monkeypatch, verified_alumni_user: dict):
    """When email delivery succeeds, the challenge remains active so the user can verify."""
    # The sender is mocked; mark the provider configured so the mocked path runs.
    monkeypatch.setattr("services.delivery.is_email_configured", lambda: True)
    from services.password_recovery import request_password_reset

    email = verified_alumni_user["email"]
    user_id = str(verified_alumni_user["id"])

    monkeypatch.setattr(
        "services.delivery.send_email_message",
        lambda to, subj, msg: (True, "msg_resend_success_001", None),
    )

    ok, msg, debug_code = request_password_reset(email, "email")
    assert ok is True
    assert debug_code is not None  # returned in test mode

    challenges = supabase.table("password_reset_challenges").select("*").eq(
        "user_id", user_id
    ).execute().data
    active = [c for c in challenges if not c["is_used"]]
    assert len(active) == 1, "Challenge should remain active after successful delivery"


def test_retry_after_failed_delivery_creates_fresh_challenge(monkeypatch, verified_alumni_user: dict):
    """After a delivery failure invalidates the challenge, a retry creates a fresh active one."""
    # The sender is mocked; mark the provider configured so the mocked path runs.
    monkeypatch.setattr("services.delivery.is_email_configured", lambda: True)
    from services.password_recovery import request_password_reset

    email = verified_alumni_user["email"]
    user_id = str(verified_alumni_user["id"])

    # First attempt: delivery fails
    monkeypatch.setattr(
        "services.delivery.send_email_message",
        lambda to, subj, msg: (False, None, "Resend 403 testing restriction"),
    )
    ok1, _, _ = request_password_reset(email, "email")
    assert ok1 is True

    # All challenges should be invalidated
    challenges_after_fail = supabase.table("password_reset_challenges").select("*").eq(
        "user_id", user_id
    ).execute().data
    active_after_fail = [c for c in challenges_after_fail if not c["is_used"]]
    assert len(active_after_fail) == 0

    # Second attempt: delivery succeeds
    monkeypatch.setattr(
        "services.delivery.send_email_message",
        lambda to, subj, msg: (True, "msg_retry_ok", None),
    )
    ok2, msg2, debug_code2 = request_password_reset(email, "email")
    assert ok2 is True
    assert debug_code2 is not None

    # Now there should be exactly one active challenge (the fresh one from retry)
    challenges_after_retry = supabase.table("password_reset_challenges").select("*").eq(
        "user_id", user_id
    ).execute().data
    active_after_retry = [c for c in challenges_after_retry if not c["is_used"]]
    assert len(active_after_retry) == 1


def test_sms_trial_error_invalidates_challenge(monkeypatch, verified_alumni_user: dict):
    """SMS trial error (572006) invalidates the challenge so the user is not stranded."""
    from services.password_recovery import request_password_reset

    user_id = str(verified_alumni_user["id"])

    # Configure user with verified phone
    supabase.table("users").update({"phone": "+919876543210", "is_phone_verified": True}).eq("id", user_id).execute()

    class MockTwilio572006:
        status_code = 400
        text = '{"code":572006,"message":"Trial accounts reject custom SMS bodies."}'
        def json(self):
            return {"code": 572006, "message": "Trial accounts reject custom SMS bodies."}

    monkeypatch.setenv("TWILIO_ACCOUNT_SID", "AC12345")
    monkeypatch.setenv("TWILIO_AUTH_TOKEN", "token123")
    monkeypatch.setenv("TWILIO_FROM_NUMBER", "+15005550006")
    monkeypatch.delenv("TWILIO_VERIFY_SERVICE_SID", raising=False)
    monkeypatch.setattr("httpx.Client.post", lambda self, url, **kwargs: MockTwilio572006())

    ok, msg, _ = request_password_reset("+919876543210", "sms")
    assert ok is False
    assert "Twilio trial restrictions" in msg

    # Challenge should be invalidated
    challenges = supabase.table("password_reset_challenges").select("*").eq(
        "user_id", user_id
    ).execute().data
    active = [c for c in challenges if not c["is_used"]]
    assert len(active) == 0, "Challenge should be invalidated after SMS trial error"


def test_forgot_password_endpoint_cooldown_and_validity_metadata(client: TestClient, verified_alumni_user: dict):
    """Forgot password endpoint returns 60s cooldown and 10min (600s) validity metadata."""
    email = verified_alumni_user["email"]
    resp = client.post(
        "/api/auth/forgot-password",
        json={"identifier": email, "channel": "email"}
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["cooldown_seconds"] == 60
    assert data["expires_in"] == 600
    assert "message" in data


def test_forgot_password_endpoint_nonexistent_user_anti_enumeration(client: TestClient):
    """Non-existent accounts return generic message and cooldown metadata without leaking existence."""
    resp = client.post(
        "/api/auth/forgot-password",
        json={"identifier": "nonexistent_ghost_user@example.com", "channel": "email"}
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["cooldown_seconds"] == 60
    assert data["expires_in"] == 600
    assert "If an account matching" in data["message"]


def test_password_reset_send_limits_are_server_enforced(monkeypatch, verified_alumni_user: dict):
    """Password reset sends use a 60s cooldown and a three-per-hour account quota."""
    from datetime import datetime, timedelta, timezone
    import services.password_recovery as recovery

    current_time = [datetime.now(timezone.utc)]

    class FrozenDateTime(datetime):
        @classmethod
        def now(cls, tz=None):
            value = current_time[0]
            return value if tz is None else value.astimezone(tz)

    monkeypatch.setattr(recovery, "datetime", FrozenDateTime)
    monkeypatch.setattr("services.delivery.is_email_configured", lambda: True)

    sent = []

    def mock_send_email(to, subject, message):
        sent.append(to)
        return True, f"reset-message-{len(sent)}", None

    monkeypatch.setattr("services.delivery.send_email_message", mock_send_email)

    email = verified_alumni_user["email"]
    user_id = str(verified_alumni_user["id"])

    first = recovery.request_password_reset(email, "email")
    assert first[0] is True
    assert first[2] is not None
    assert len(sent) == 1

    # A second request inside the cooldown window returns the same generic
    # response but does not create a challenge or send another message.
    immediate_retry = recovery.request_password_reset(email, "email")
    assert immediate_retry[0] is True
    assert immediate_retry[2] is None
    assert len(sent) == 1

    current_time[0] = current_time[0] + timedelta(seconds=61)
    second = recovery.request_password_reset(email, "email")
    assert second[0] is True
    assert second[2] is not None
    assert len(sent) == 2

    current_time[0] = current_time[0] + timedelta(seconds=61)
    third = recovery.request_password_reset(email, "email")
    assert third[0] is True
    assert third[2] is not None
    assert len(sent) == 3

    current_time[0] = current_time[0] + timedelta(seconds=61)
    hourly_limited = recovery.request_password_reset(email, "email")
    assert hourly_limited[0] is True
    assert hourly_limited[2] is None
    assert len(sent) == 3

    challenges = (
        supabase.table("password_reset_challenges")
        .select("*")
        .eq("user_id", user_id)
        .execute()
        .data
    )
    assert len(challenges) == 3
    assert all(row["delivery_status"] == "accepted" for row in challenges)


def test_failed_password_reset_delivery_does_not_consume_send_quota(monkeypatch, verified_alumni_user: dict):
    """A provider rejection invalidates the challenge and permits a clean retry."""
    import services.password_recovery as recovery

    monkeypatch.setattr("services.delivery.is_email_configured", lambda: True)
    monkeypatch.setattr(
        "services.delivery.send_email_message",
        lambda to, subject, message: (False, None, "temporary provider rejection"),
    )

    email = verified_alumni_user["email"]
    user_id = str(verified_alumni_user["id"])
    failed = recovery.request_password_reset(email, "email")
    assert failed[0] is True

    row = (
        supabase.table("password_reset_challenges")
        .select("*")
        .eq("user_id", user_id)
        .execute()
        .data[0]
    )
    assert row["delivery_status"] == "failed"
    assert row["is_used"] is True

    monkeypatch.setattr(
        "services.delivery.send_email_message",
        lambda to, subject, message: (True, "retry-accepted", None),
    )
    retried = recovery.request_password_reset(email, "email")
    assert retried[0] is True
    assert retried[2] is not None

    rows = (
        supabase.table("password_reset_challenges")
        .select("*")
        .eq("user_id", user_id)
        .execute()
        .data
    )
    assert len(rows) == 2
    assert sorted(row["delivery_status"] for row in rows) == ["accepted", "failed"]



def test_successful_password_reset_code_is_consumed_once(verified_alumni_user: dict, monkeypatch):
    """Replaying a correct OTP cannot mint or replace another password-reset token."""
    import services.password_recovery as recovery

    monkeypatch.setattr("services.delivery.is_email_configured", lambda: True)
    monkeypatch.setattr(
        "services.delivery.send_email_message",
        lambda to, subject, message: (True, "single-use-reset-code", None),
    )

    success, _, code = recovery.request_password_reset(verified_alumni_user["email"], "email")
    assert success is True
    assert code is not None

    verified, _, reset_token = recovery.verify_password_reset_code(verified_alumni_user["email"], code)
    assert verified is True
    assert reset_token

    replayed, message, replay_token = recovery.verify_password_reset_code(verified_alumni_user["email"], code)
    assert replayed is False
    assert replay_token is None
    assert "already been used" in message.lower()

    challenge = (
        supabase.table("password_reset_challenges")
        .select("*")
        .eq("user_id", str(verified_alumni_user["id"]))
        .order("created_at", desc=True)
        .limit(1)
        .execute()
        .data[0]
    )
    assert challenge["token_hash"] == recovery._hash_value(reset_token)
    assert challenge["code_verified_at"] is not None

    reset_ok, _ = recovery.reset_password_with_token(reset_token, "OneTimeResetPassword789!")
    assert reset_ok is True


def test_forgot_password_endpoint_enforces_ip_limit_for_unknown_identifiers(client, monkeypatch):
    """A source IP cannot bypass recovery throttling by cycling through unknown accounts."""
    from routes import auth as auth_routes
    from services.login_rate_limit import (
        PASSWORD_RESET_IP_MAX_REQUESTS,
        reset_mock_login_rate_limits,
    )

    monkeypatch.setenv("DATABASE_MODE", "mock")
    monkeypatch.setenv("LOGIN_RATE_LIMIT_SECRET", "soet-test-login-rate-limit-secret")
    reset_mock_login_rate_limits()

    dispatched = []

    def fake_request_password_reset(identifier, channel):
        dispatched.append((identifier, channel))
        return (
            True,
            "If an account matching the provided contact exists, a verification code has been sent.",
            None,
        )

    monkeypatch.setattr(auth_routes, "request_password_reset", fake_request_password_reset)

    try:
        for index in range(PASSWORD_RESET_IP_MAX_REQUESTS):
            response = client.post(
                "/api/auth/forgot-password",
                json={
                    "identifier": f"unknown-{index}@example.com",
                    "channel": "email",
                },
            )
            assert response.status_code == 200
            assert "If an account matching" in response.json()["message"]

        assert len(dispatched) == PASSWORD_RESET_IP_MAX_REQUESTS

        # The next request is blocked before account lookup or delivery dispatch.
        blocked = client.post(
            "/api/auth/forgot-password",
            json={"identifier": "another-unknown@example.com", "channel": "email"},
        )
        assert blocked.status_code == 429
        assert int(blocked.headers["Retry-After"]) > 0
        assert "too many password recovery requests" in blocked.json()["detail"].lower()
        assert len(dispatched) == PASSWORD_RESET_IP_MAX_REQUESTS
    finally:
        reset_mock_login_rate_limits()


def test_password_reset_ip_buckets_are_separate_and_count_requests(monkeypatch):
    """IP fingerprints are isolated and the source bucket is independent of account identifiers."""
    from services.login_rate_limit import (
        PASSWORD_RESET_IP_MAX_REQUESTS,
        record_password_reset_request,
        reset_mock_login_rate_limits,
    )

    monkeypatch.setenv("DATABASE_MODE", "mock")
    monkeypatch.setenv("LOGIN_RATE_LIMIT_SECRET", "soet-test-login-rate-limit-secret")
    reset_mock_login_rate_limits()

    try:
        for _ in range(PASSWORD_RESET_IP_MAX_REQUESTS):
            state = record_password_reset_request("203.0.113.10")
            assert state["blocked"] is False

        blocked = record_password_reset_request("203.0.113.10")
        assert blocked["blocked"] is True
        assert blocked["retry_after_seconds"] > 0

        other_source = record_password_reset_request("203.0.113.11")
        assert other_source["blocked"] is False
    finally:
        reset_mock_login_rate_limits()


def test_forgot_password_fails_closed_when_ip_rate_limit_store_is_unavailable(client, monkeypatch):
    """A rate-limit outage must not turn the forgot-password endpoint into an unthrottled sender."""
    from routes import auth as auth_routes

    dispatched = []

    def unavailable(_client_ip):
        raise RuntimeError("simulated rate-limit database outage")

    monkeypatch.setattr(auth_routes, "record_password_reset_request", unavailable)
    monkeypatch.setattr(
        auth_routes,
        "request_password_reset",
        lambda *args, **kwargs: dispatched.append(args),
    )

    response = client.post(
        "/api/auth/forgot-password",
        json={"identifier": "person@example.com", "channel": "email"},
    )
    assert response.status_code == 503
    assert "temporarily unavailable" in response.json()["detail"].lower()
    assert dispatched == []
