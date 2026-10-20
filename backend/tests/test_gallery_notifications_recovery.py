import io
import pytest
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
    client: TestClient, verified_alumni_user: dict, admin_user: dict
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

    # Re-approve photo
    approve_res = client.patch(
        f"/api/gallery/{photo_id}/status",
        headers=admin_user["headers"],
        json={"status": "approved"},
    )
    assert approve_res.status_code == 200
    assert approve_res.json()["status"] == "approved"


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
        },
    )
    assert reg_res.status_code == 201

    # Simulate administrator approving this student account so they can log in
    users_collection.update_one(
        {"email": email},
        {"$set": {"is_verified": True, "verification_status": "approved"}}
    )

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

    # 6. Verify old password fails
    old_login = client.post("/api/auth/login", json={"email": email, "password": old_password})
    assert old_login.status_code == 401

    # 7. Verify new password succeeds
    new_login = client.post("/api/auth/login", json={"email": email, "password": new_password})
    assert new_login.status_code == 200


def test_password_recovery_preserves_verification_status(
    client: TestClient, unverified_alumni_user: dict, monkeypatch
):
    """Password reset preserves the unverified status of an account (cannot bypass moderation)."""
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


def test_phone_verification_flow(client: TestClient, verified_alumni_user: dict):
    """Users can request phone verification code and verify their phone number."""
    test_phone = "+919876543210"

    # 1. Send phone code
    res = client.post(
        "/api/auth/phone/send-code",
        headers=verified_alumni_user["headers"],
        json={"phone": test_phone},
    )
    assert res.status_code == 200

    # 2. Verify invalid code is rejected
    bad_res = client.post(
        "/api/auth/phone/verify-code",
        headers=verified_alumni_user["headers"],
        json={"phone": test_phone, "code": "000000"},
    )
    assert bad_res.status_code == 400


# ==============================================================================
# 4. PRE-MIGRATION INTEGRITY & SAFETY REVIEWS
# ==============================================================================

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


def test_resend_and_twilio_webhooks(client: TestClient):
    """Resend and Twilio delivery webhooks update notification_deliveries status to 'delivered'."""
    from services.delivery import record_delivery

    # Record accepted email delivery
    record_delivery(
        user_id="user_webhook_test",
        channel="email",
        recipient="test@example.com",
        status="accepted",
        provider_message_id="resend_hook_123",
    )

    # Webhook updates email to delivered
    resend_res = client.post(
        "/api/notifications/deliveries/webhook/resend",
        json={
            "type": "email.delivered",
            "data": {"email_id": "resend_hook_123"},
        },
    )
    assert resend_res.status_code == 200
    assert resend_res.json()["status"] == "success"

    email_rec = supabase.table("notification_deliveries").select("*").eq("provider_message_id", "resend_hook_123").execute().data[0]
    assert email_rec["status"] == "delivered"

    # Record accepted SMS delivery
    record_delivery(
        user_id="user_webhook_test",
        channel="sms",
        recipient="+919876543210",
        status="accepted",
        provider_message_id="SM_webhook_twilio_456",
    )

    # Webhook updates SMS to delivered
    twilio_res = client.post(
        "/api/notifications/deliveries/webhook/twilio",
        data={
            "MessageSid": "SM_webhook_twilio_456",
            "MessageStatus": "delivered",
        },
    )
    assert twilio_res.status_code == 200
    assert twilio_res.json()["status"] == "success"

    sms_rec = supabase.table("notification_deliveries").select("*").eq("provider_message_id", "SM_webhook_twilio_456").execute().data[0]
    assert sms_rec["status"] == "delivered"


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
