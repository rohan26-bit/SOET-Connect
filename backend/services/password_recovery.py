import hashlib
import hmac
import os
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional, Tuple, Dict, Any

from database import supabase, users_collection
from pwdlib import PasswordHash
from services import delivery

password_hasher = PasswordHash.recommended()

CODE_EXPIRATION_MINUTES = 10
TOKEN_EXPIRATION_MINUTES = 10
MAX_ATTEMPTS = 5


def _get_reset_secret() -> str:
    """Retrieve secret key for HMAC hashing of reset codes. Fails safely if unconfigured in production."""
    secret = (
        os.getenv("PASSWORD_RESET_SECRET_KEY", "").strip()
        or os.getenv("JWT_SECRET_KEY", "").strip()
    )
    if not secret:
        # Deterministic fallback allowed strictly during automated test runs
        if os.getenv("PYTEST_CURRENT_TEST") or os.getenv("DATABASE_MODE", "").lower() == "mock":
            return "soet-connect-test-reset-secret-key-32chars"
        raise RuntimeError("Password recovery is unavailable: PASSWORD_RESET_SECRET_KEY is not configured.")
    return secret


def _hash_value(value: str) -> str:
    """Hash verification code or reset token using HMAC-SHA256 with application secret."""
    secret = _get_reset_secret()
    return hmac.new(secret.encode("utf-8"), value.encode("utf-8"), hashlib.sha256).hexdigest()


def _constant_time_compare(val1: str, val2: str) -> bool:
    """Compare two strings in constant time to prevent timing attacks."""
    return secrets.compare_digest(val1, val2)


def generate_verification_code() -> str:
    """Generate a cryptographically secure 6-digit numeric verification code."""
    return f"{secrets.randbelow(900000) + 100000}"


def find_user_by_contact(identifier: str) -> Optional[dict]:
    """Find a user by email or phone across users and student profiles."""
    ident = identifier.strip().lower()

    # Try email lookup
    user = users_collection.find_one({"email": ident}, include_profiles=True)
    if user:
        return user

    # Try phone lookup in users table
    try:
        res = supabase.table("users").select("*").eq("phone", ident).limit(1).execute()
        if res.data:
            return users_collection.find_one({"_id": str(res.data[0]["id"])}, include_profiles=True)
    except Exception:
        pass

    # Try phone lookup in student_profiles
    try:
        sp_res = supabase.table("student_profiles").select("user_id").eq("phone", ident).limit(1).execute()
        if sp_res.data:
            return users_collection.find_one({"_id": str(sp_res.data[0]["user_id"])}, include_profiles=True)
    except Exception:
        pass

    return None


def request_password_reset(identifier: str, channel: str = "email") -> Tuple[bool, str, Optional[str]]:
    """
    Initiate a password reset flow.
    Returns: (success: bool, generic_message: str, debug_code_in_mock: Optional[str])

    Security: the generic_success_msg is returned for both existing and
    non-existing accounts to prevent account enumeration.

    Delivery-failure handling: if the provider rejects the message (e.g.
    Resend testing-mode restriction, Twilio trial block), the challenge is
    immediately invalidated so the user is not stranded with an unusable
    code and no way to retry.
    """
    ident = identifier.strip()
    channel = channel.lower().strip()
    if channel not in {"email", "sms"}:
        return False, "Invalid delivery channel. Must be 'email' or 'sms'.", None

    # Verify secret is configured; fails safely without crashing if missing in production
    try:
        _get_reset_secret()
    except RuntimeError:
        return False, "Password recovery service is temporarily unavailable. Please contact the administrator.", None

    user = find_user_by_contact(ident)
    generic_success_msg = "If an account matching the provided contact exists, a verification code has been sent."

    if not user:
        # Generic response prevents account enumeration
        return True, generic_success_msg, None

    user_id = str(user.get("_db_id") or user.get("id"))
    email = user.get("email", "")
    phone = user.get("phone", "") or (user.get("student_profile", {}).get("phone") if isinstance(user.get("student_profile"), dict) else "")
    is_phone_verified = bool(user.get("is_phone_verified", False))

    # Resolve recipient based on channel
    if channel == "email":
        if not delivery.is_email_configured():
            is_test = bool(os.getenv("PYTEST_CURRENT_TEST") or os.getenv("DATABASE_MODE", "").lower() == "mock")
            if not is_test:
                return False, "Email service is temporarily unavailable. Please use SMS recovery or contact support.", None
        if not email:
            return True, generic_success_msg, None
        recipient = email
    else:  # SMS
        if not phone:
            return False, "No phone number registered for this account.", None
        if not is_phone_verified:
            return False, "SMS password recovery is only available for verified phone numbers. Please use email recovery.", None
        if not delivery.is_sms_configured():
            return False, "SMS service is currently unavailable. Please use email recovery.", None
        recipient = phone

    # Rate limiting: invalidate all previous active challenges for this user
    now = datetime.now(timezone.utc)
    try:
        supabase.table("password_reset_challenges").update({
            "is_used": True,
            "used_at": now.isoformat(),
        }).eq("user_id", user_id).eq("is_used", False).execute()
    except Exception:
        pass

    # Generate 6-digit code
    code = generate_verification_code()
    code_hash = _hash_value(code)
    expires_at = (now + timedelta(minutes=CODE_EXPIRATION_MINUTES)).isoformat()
    challenge_id = str(uuid.uuid4())

    challenge_row = {
        "id": challenge_id,
        "user_id": user_id,
        "channel": channel,
        "recipient": recipient,
        "code_hash": code_hash,
        "token_hash": None,
        "attempts": 0,
        "max_attempts": MAX_ATTEMPTS,
        "is_used": False,
        "used_at": None,
        "expires_at": expires_at,
        "created_at": now.isoformat(),
    }

    supabase.table("password_reset_challenges").insert(challenge_row).execute()

    # Dispatch code via selected channel
    message_text = f"Your SOET Connect password reset code is: {code}. It is valid for 10 minutes. Do not share this code with anyone."
    delivery_failed = False
    delivery_error_detail = ""
    try:
        if channel == "email":
            if delivery.is_email_configured():
                success, msg_id, err = delivery.send_email_message(recipient, "SOET Connect - Password Reset Code", message_text)
                delivery.record_delivery(
                    user_id=user_id,
                    channel="email",
                    recipient=recipient,
                    status="accepted" if success else "failed",
                    event_type="password_reset",
                    provider="resend",
                    provider_message_id=msg_id,
                    error_message=err,
                )
                if not success:
                    delivery_failed = True
                    delivery_error_detail = err or "Email delivery failed"
            else:
                delivery.record_delivery(
                    user_id=user_id,
                    channel="email",
                    recipient=recipient,
                    status="skipped",
                    event_type="password_reset",
                    provider="resend",
                    error_message="Email provider not configured (RESEND_API_KEY missing).",
                )
                delivery_failed = True
                delivery_error_detail = "Email provider not configured"
        else:
            if delivery.is_twilio_verify_configured():
                success, msg_id, err = delivery.send_twilio_verify_otp(recipient)
                delivery.record_delivery(
                    user_id=user_id,
                    channel="sms",
                    recipient=recipient,
                    status="accepted" if success else "failed",
                    event_type="password_reset",
                    provider="twilio_verify",
                    provider_message_id=msg_id,
                    error_message=err,
                )
                if not success:
                    # Invalidate the challenge – code was never delivered
                    _invalidate_challenge(challenge_id, now)
                    return False, f"SMS verification delivery failed: {err}. Please use Email recovery instead.", None
            elif delivery.is_sms_configured():
                success, msg_id, err = delivery.send_sms_message(recipient, message_text)
                delivery.record_delivery(
                    user_id=user_id,
                    channel="sms",
                    recipient=recipient,
                    status="accepted" if success else "failed",
                    event_type="password_reset",
                    provider="twilio",
                    provider_message_id=msg_id,
                    error_message=err,
                )
                if not success and ("572006" in (err or "") or "trial" in (err or "").lower()):
                    # Invalidate the challenge – code was never delivered
                    _invalidate_challenge(challenge_id, now)
                    return False, "SMS password recovery is currently unavailable due to Twilio trial restrictions (custom SMS messages are blocked). Please use Email recovery instead.", None
                if not success:
                    delivery_failed = True
                    delivery_error_detail = err or "SMS delivery failed"
            else:
                delivery.record_delivery(
                    user_id=user_id,
                    channel="sms",
                    recipient=recipient,
                    status="skipped",
                    event_type="password_reset",
                    provider="twilio",
                    error_message="SMS provider not configured (Twilio credentials missing).",
                )
                # Invalidate the challenge – code was never delivered
                _invalidate_challenge(challenge_id, now)
                return False, "SMS recovery is currently unavailable. Please use Email recovery.", None
    except Exception as e:
        delivery_failed = True
        delivery_error_detail = f"Delivery exception: {str(e)[:100]}"
        print(f"Error during password reset delivery: {e}")

    # If the provider rejected the message, invalidate the challenge immediately
    # so the user is not stranded for 10 minutes with an unusable code.
    if delivery_failed:
        _invalidate_challenge(challenge_id, now)
        # Log for operators (never includes secrets, codes, or PII)
        print(f"Password reset delivery failed for challenge {challenge_id}: {delivery_error_detail}")

    # In automated test suite mode strictly, provide code to test runner; NEVER in normal or production server runs
    debug_code = code if os.getenv("PYTEST_CURRENT_TEST") else None

    # Anti-enumeration: always return the same generic message regardless of
    # whether the account exists or delivery succeeded.
    return True, generic_success_msg, debug_code


def _invalidate_challenge(challenge_id: str, now: datetime) -> None:
    """Mark a challenge as used (invalidated) after delivery failure."""
    try:
        supabase.table("password_reset_challenges").update({
            "is_used": True,
            "used_at": now.isoformat(),
        }).eq("id", challenge_id).execute()
    except Exception:
        pass


def verify_password_reset_code(identifier: str, code: str) -> Tuple[bool, str, Optional[str]]:
    """
    Verify the 6-digit code for an account.
    Returns: (is_valid: bool, error_or_success_message: str, reset_token: Optional[str])
    """
    ident = identifier.strip()
    code = code.strip()

    user = find_user_by_contact(ident)
    if not user:
        return False, "Invalid or expired verification code.", None

    user_id = str(user.get("_db_id") or user.get("id"))
    now = datetime.now(timezone.utc)

    # Find latest active challenge
    try:
        res = supabase.table("password_reset_challenges") \
            .select("*") \
            .eq("user_id", user_id) \
            .eq("is_used", False) \
            .order("created_at", desc=True) \
            .limit(1) \
            .execute()
        if not res.data:
            return False, "Invalid or expired verification code.", None
        challenge = res.data[0]
    except Exception as e:
        return False, "Error verifying code.", None

    # Check expiration
    expires_str = challenge.get("expires_at", "")
    try:
        exp_dt = datetime.fromisoformat(expires_str.replace("Z", "+00:00"))
        if exp_dt <= now:
            return False, "Verification code has expired. Please request a new one.", None
    except Exception:
        return False, "Invalid challenge timestamp.", None

    # Check attempt limit
    attempts = challenge.get("attempts", 0)
    max_attempts = challenge.get("max_attempts", MAX_ATTEMPTS)
    if attempts >= max_attempts:
        # Invalidate challenge
        supabase.table("password_reset_challenges").update({"is_used": True}).eq("id", challenge["id"]).execute()
        return False, "Maximum verification attempts exceeded. Please request a new code.", None

    # Verify code hash
    expected_hash = challenge.get("code_hash", "")
    provided_hash = _hash_value(code)

    if not _constant_time_compare(expected_hash, provided_hash):
        # Increment attempt counter
        supabase.table("password_reset_challenges").update({
            "attempts": attempts + 1
        }).eq("id", challenge["id"]).execute()
        remaining = max_attempts - (attempts + 1)
        return False, f"Incorrect verification code. {remaining} attempt(s) remaining.", None

    # Code is valid! Generate single-use reset token
    reset_token = secrets.token_urlsafe(32)
    token_hash = _hash_value(reset_token)

    supabase.table("password_reset_challenges").update({
        "token_hash": token_hash,
    }).eq("id", challenge["id"]).execute()

    return True, "Verification code confirmed.", reset_token


def reset_password_with_token(reset_token: str, new_password: str) -> Tuple[bool, str]:
    """
    Complete password reset with a verified reset token.
    Updates password hash, preserves all verification statuses, invalidates token.
    """
    if len(new_password) < 6:
        return False, "Password must be at least 6 characters long."

    token_hash = _hash_value(reset_token.strip())
    now = datetime.now(timezone.utc)

    # Find challenge matching token
    try:
        res = supabase.table("password_reset_challenges") \
            .select("*") \
            .eq("token_hash", token_hash) \
            .eq("is_used", False) \
            .limit(1) \
            .execute()
        if not res.data:
            return False, "Invalid or expired password reset token."
        challenge = res.data[0]
    except Exception:
        return False, "Database error validating reset token."

    # Check expiration
    expires_str = challenge.get("expires_at", "")
    try:
        exp_dt = datetime.fromisoformat(expires_str.replace("Z", "+00:00"))
        if exp_dt <= now:
            return False, "Reset token has expired. Please restart the recovery process."
    except Exception:
        return False, "Invalid token timestamp."

    user_id = str(challenge["user_id"])

    # Hash new password with Argon2
    hashed_pwd = password_hasher.hash(new_password)

    # Update password in users table without touching verification or role
    users_collection.update_one(
        {"_id": user_id},
        {"$set": {"password_hash": hashed_pwd}}
    )

    # Invalidate all challenges for this user
    try:
        supabase.table("password_reset_challenges").update({
            "is_used": True,
            "used_at": now.isoformat(),
        }).eq("user_id", user_id).execute()
    except Exception:
        pass

    return True, "Password reset successfully. You can now log in with your new password."


# ==============================================================================
# PHONE VERIFICATION IN ACCOUNT SETTINGS
# ==============================================================================

def send_phone_verification_code(user_id: str, phone: str) -> Tuple[bool, str, Optional[str]]:
    """Generate and send phone verification code to user's phone."""
    phone_clean = phone.strip()
    if not phone_clean:
        return False, "Phone number cannot be empty.", None

    now = datetime.now(timezone.utc)
    code = generate_verification_code()
    code_hash = _hash_value(code)
    expires_at = (now + timedelta(minutes=CODE_EXPIRATION_MINUTES)).isoformat()

    record = {
        "id": str(uuid.uuid4()),
        "user_id": str(user_id),
        "phone": phone_clean,
        "code_hash": code_hash,
        "attempts": 0,
        "is_used": False,
        "expires_at": expires_at,
        "created_at": now.isoformat(),
    }
    supabase.table("phone_verification_codes").insert(record).execute()

    msg = f"Your SOET Connect phone verification code is {code}."
    try:
        if delivery.is_sms_configured():
            success, msg_id, err = delivery.send_sms_message(phone_clean, msg)
            delivery.record_delivery(
                user_id=user_id,
                channel="sms",
                recipient=phone_clean,
                status="accepted" if success else "failed",
                event_type="phone_verification",
                provider="twilio",
                provider_message_id=msg_id,
                error_message=err,
            )
        else:
            delivery.record_delivery(
                user_id=user_id,
                channel="sms",
                recipient=phone_clean,
                status="skipped",
                event_type="phone_verification",
                provider="twilio",
                error_message="Twilio credentials not configured (TWILIO_ACCOUNT_SID missing).",
            )
    except Exception as e:
        print(f"Error recording phone verification delivery: {e}")

    debug_code = code if os.getenv("PYTEST_CURRENT_TEST") else None
    return True, "Verification code sent to your phone.", debug_code


def confirm_phone_verification(user_id: str, code: str) -> Tuple[bool, str]:
    """Verify phone code and mark phone as verified on user account."""
    now = datetime.now(timezone.utc)
    try:
        res = supabase.table("phone_verification_codes") \
            .select("*") \
            .eq("user_id", str(user_id)) \
            .eq("is_used", False) \
            .order("created_at", desc=True) \
            .limit(1) \
            .execute()
        if not res.data:
            return False, "Invalid or expired phone verification code."
        rec = res.data[0]
    except Exception:
        return False, "Error verifying phone code."

    # Check expiration
    try:
        exp_dt = datetime.fromisoformat(rec.get("expires_at", "").replace("Z", "+00:00"))
        if exp_dt <= now:
            return False, "Verification code has expired."
    except Exception:
        return False, "Invalid timestamp."

    # Check hash
    if not _constant_time_compare(rec.get("code_hash", ""), _hash_value(code.strip())):
        return False, "Incorrect verification code."

    # Mark code used
    supabase.table("phone_verification_codes").update({"is_used": True}).eq("id", rec["id"]).execute()

    # Update user account: set phone and is_phone_verified = True
    users_collection.update_one(
        {"_id": str(user_id)},
        {"$set": {
            "phone": rec["phone"],
            "is_phone_verified": True,
        }}
    )

    return True, "Phone number verified successfully."
