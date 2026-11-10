import hashlib
import hmac
import os
import re
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional, Tuple, Dict, Any

from database import supabase, users_collection
from pwdlib import PasswordHash
from services import delivery
from services.session_security import update_password_and_revoke_sessions
from services.auth_security_events import device_label_from_user_agent, record_auth_event

password_hasher = PasswordHash.recommended()

CODE_EXPIRATION_MINUTES = 10
TOKEN_EXPIRATION_MINUTES = 10
MAX_ATTEMPTS = 5
PASSWORD_RESET_COOLDOWN_SECONDS = 60
PASSWORD_RESET_MAX_SENDS_PER_HOUR = 3
PHONE_CODE_COOLDOWN_SECONDS = 60
PHONE_CODE_MAX_SENDS_PER_HOUR = 3
PHONE_CODE_MAX_ATTEMPTS = 5


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
    """Find a user by email or normalized phone across users and student profiles."""
    raw_identifier = str(identifier or "").strip()
    ident = raw_identifier.lower()

    # Try email lookup first to preserve exact email matching and anti-enumeration behavior.
    user = users_collection.find_one({"email": ident}, include_profiles=True)
    if user:
        return user

    digits = re.sub(r"\D", "", raw_identifier)
    if not 7 <= len(digits) <= 15:
        return None

    normalized_phone = delivery.normalize_phone_number(raw_identifier)
    if not normalized_phone:
        return None

    # Phone edits and OTP verification store E.164 values. Normalize formatted user
    # input before matching so a spaced or hyphenated number still finds its owner.
    try:
        res = (
            supabase.table("users")
            .select("id")
            .eq("phone", normalized_phone)
            .limit(1)
            .execute()
        )
        if res.data:
            return users_collection.find_one(
                {"_id": str(res.data[0]["id"])},
                include_profiles=True,
            )
    except Exception:
        pass

    try:
        profile_res = (
            supabase.table("student_profiles")
            .select("user_id")
            .eq("phone", normalized_phone)
            .limit(1)
            .execute()
        )
        if profile_res.data:
            return users_collection.find_one(
                {"_id": str(profile_res.data[0]["user_id"])},
                include_profiles=True,
            )
    except Exception:
        pass

    return None


def _create_password_reset_challenge(challenge_row: dict, now: datetime) -> tuple[str, int]:
    """Create a reset challenge with account-serialized cooldown and hourly limits."""
    user_id = str(challenge_row["user_id"])
    now_iso = now.isoformat()
    window_start = (now - timedelta(hours=1)).isoformat()

    if os.getenv("DATABASE_MODE", "").strip().lower() == "mock":
        recent_rows = (
            supabase.table("password_reset_challenges")
            .select("id,created_at,delivery_status")
            .eq("user_id", user_id)
            .gte("created_at", window_start)
            .in_("delivery_status", ["accepted", "pending"])
            .execute()
            .data or []
        )
        timestamps = []
        for row in recent_rows:
            try:
                created_at = datetime.fromisoformat(str(row.get("created_at", "")).replace("Z", "+00:00"))
                if created_at.tzinfo is None:
                    created_at = created_at.replace(tzinfo=timezone.utc)
                timestamps.append(created_at.astimezone(timezone.utc))
            except (TypeError, ValueError):
                continue

        latest_created_at = max(timestamps, default=None)
        if latest_created_at and now < latest_created_at + timedelta(seconds=PASSWORD_RESET_COOLDOWN_SECONDS):
            retry_after = max(1, int((latest_created_at + timedelta(seconds=PASSWORD_RESET_COOLDOWN_SECONDS) - now).total_seconds() + 0.999))
            return "cooldown", retry_after
        if len(recent_rows) >= PASSWORD_RESET_MAX_SENDS_PER_HOUR:
            return "hourly_limit", 0

        supabase.table("password_reset_challenges").update({
            "is_used": True,
            "used_at": now_iso,
        }).eq("user_id", user_id).eq("is_used", False).execute()
        supabase.table("password_reset_challenges").insert(challenge_row).execute()
        return "created", 0

    result = supabase.rpc(
        "create_password_reset_challenge",
        {
            "p_user_id": user_id,
            "p_challenge_id": str(challenge_row["id"]),
            "p_channel": str(challenge_row["channel"]),
            "p_recipient": str(challenge_row["recipient"]),
            "p_verification_provider": str(challenge_row["verification_provider"]),
            "p_code_hash": str(challenge_row["code_hash"]),
            "p_expires_at": str(challenge_row["expires_at"]),
            "p_now": now_iso,
        },
    ).execute()
    rows = result.data or []
    if not rows:
        raise RuntimeError("Password reset rate-limit operation returned no result.")
    row = rows[0]
    return str(row.get("outcome") or "unavailable"), int(row.get("retry_after_seconds") or 0)


def _mark_password_reset_delivery(challenge_id: str, status: str) -> None:
    """Persist whether the delivery provider accepted or rejected a reset request."""
    if status not in {"accepted", "failed"}:
        raise ValueError("Invalid password reset delivery status.")
    try:
        result = (
            supabase.table("password_reset_challenges")
            .update({"delivery_status": status})
            .eq("id", str(challenge_id))
            .execute()
        )
        if os.getenv("DATABASE_MODE", "").strip().lower() != "mock" and not result.data:
            raise RuntimeError("Password reset challenge delivery status was not updated.")
    except Exception as exc:
        # A pending row remains rate-limited by the database for the full hour,
        # so a status-write outage cannot let repeated sends bypass the quota.
        print(f"Unable to record password reset delivery status for challenge {challenge_id}: {exc}")


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
        if not (delivery.is_twilio_verify_configured() or delivery.is_sms_configured()):
            return False, "SMS service is currently unavailable. Please use email recovery.", None
        recipient = phone

    # Create a challenge only when the account-level cooldown and hourly quota allow it.
    now = datetime.now(timezone.utc)

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
        "verification_provider": (
            "twilio_verify"
            if channel == "sms" and delivery.is_twilio_verify_configured()
            else "internal"
        ),
        "code_hash": code_hash,
        "token_hash": None,
        "code_verified_at": None,
        "attempts": 0,
        "max_attempts": MAX_ATTEMPTS,
        "is_used": False,
        "used_at": None,
        "expires_at": expires_at,
        "created_at": now.isoformat(),
        "delivery_status": "pending",
    }

    try:
        outcome, _retry_after = _create_password_reset_challenge(challenge_row, now)
    except Exception as exc:
        print(f"Password reset challenge creation failed: {exc}")
        return False, "Password recovery is temporarily unavailable. Please try again later.", None

    if outcome in {"cooldown", "hourly_limit", "not_found"}:
        # Keep the public response identical for known, unknown, and rate-limited accounts.
        return True, generic_success_msg, None
    if outcome != "created":
        return False, "Password recovery is temporarily unavailable. Please try again later.", None

    # Dispatch code via selected channel
    message_text = f"Your SOET Connect password reset code is: {code}. It is valid for 10 minutes. Do not share this code with anyone."
    delivery_failed = False
    delivery_error_detail = ""
    try:
        if channel == "email":
            provider_name = delivery.get_email_provider_name()
            if delivery.is_email_configured():
                success, msg_id, err = delivery.send_email_message(recipient, "SOET Connect - Password Reset Code", message_text)
                delivery.record_delivery(
                    user_id=user_id,
                    channel="email",
                    recipient=recipient,
                    status="accepted" if success else "failed",
                    event_type="password_reset",
                    provider=provider_name,
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
                    provider=provider_name,
                    error_message="Email provider not configured (SMTP or Resend credentials missing).",
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
                    # Invalidate the challenge – code was never delivered.
                    _mark_password_reset_delivery(challenge_id, "failed")
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
                    # Invalidate the challenge – code was never delivered.
                    _mark_password_reset_delivery(challenge_id, "failed")
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
                # Invalidate the challenge – code was never delivered.
                _mark_password_reset_delivery(challenge_id, "failed")
                _invalidate_challenge(challenge_id, now)
                return False, "SMS recovery is currently unavailable. Please use Email recovery.", None
    except Exception as e:
        delivery_failed = True
        delivery_error_detail = f"Delivery exception: {str(e)[:100]}"
        print(f"Error during password reset delivery: {e}")

    # If the provider rejected the message, invalidate the challenge immediately
    # so the user is not stranded for 10 minutes with an unusable code.
    if delivery_failed:
        _mark_password_reset_delivery(challenge_id, "failed")
        _invalidate_challenge(challenge_id, now)
        # Log for operators (never includes secrets, codes, or PII)
        print(f"Password reset delivery failed for challenge {challenge_id}: {delivery_error_detail}")
    else:
        _mark_password_reset_delivery(challenge_id, "accepted")

    # In automated test suite mode strictly, provide code to test runner; NEVER in normal or production server runs
    debug_code = (
        code
        if os.getenv("PYTEST_CURRENT_TEST")
        and challenge_row["verification_provider"] == "internal"
        else None
    )

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


def _record_password_reset_failure(challenge: dict) -> tuple[int, bool]:
    """Increment failed password-reset attempts atomically in production."""
    challenge_id = str(challenge.get("id"))
    max_attempts = int(challenge.get("max_attempts") or MAX_ATTEMPTS)

    if os.getenv("DATABASE_MODE", "").strip().lower() == "mock":
        attempts = int(challenge.get("attempts") or 0) + 1
        locked = attempts >= max_attempts
        update = {"attempts": attempts}
        if locked:
            update["is_used"] = True
            update["used_at"] = datetime.now(timezone.utc).isoformat()
        result = (
            supabase.table("password_reset_challenges")
            .update(update)
            .eq("id", challenge_id)
            .eq("is_used", False)
            .execute()
        )
        if not result.data:
            return max_attempts, True
        return attempts, locked

    result = supabase.rpc(
        "record_password_reset_failure",
        {
            "p_challenge_id": challenge_id,
            "p_max_attempts": max_attempts,
        },
    ).execute()
    rows = result.data or []
    if not rows:
        return max_attempts, True
    row = rows[0]
    return int(row.get("attempts") or max_attempts), bool(row.get("is_locked"))


def verify_password_reset_code(identifier: str, code: str) -> Tuple[bool, str, Optional[str]]:
    """
    Verify a locally generated code or Twilio Verify code, then issue a reset token.
    Failed attempts are counted atomically and a challenge is locked after five guesses.
    """
    ident = identifier.strip()
    supplied_code = code.strip()

    user = find_user_by_contact(ident)
    if not user:
        return False, "Invalid or expired verification code.", None

    user_id = str(user.get("_db_id") or user.get("id"))
    now = datetime.now(timezone.utc)

    try:
        result = (
            supabase.table("password_reset_challenges")
            .select("*")
            .eq("user_id", user_id)
            .eq("is_used", False)
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        if not result.data:
            return False, "Invalid or expired verification code.", None
        challenge = result.data[0]
    except Exception as exc:
        print(f"Password reset challenge lookup failed for user {user_id}: {exc}")
        return False, "Unable to verify the code right now. Please try again.", None

    expires_at = _parse_phone_code_timestamp(challenge.get("expires_at"))
    if not expires_at:
        _invalidate_challenge(str(challenge["id"]), now)
        return False, "Invalid challenge timestamp.", None
    if expires_at <= now:
        _invalidate_challenge(str(challenge["id"]), now)
        return False, "Verification code has expired. Please request a new one.", None

    # A successful code check consumes the OTP even before the reset itself.
    # The short-lived reset token is then the only credential accepted by the
    # password-change step; replaying the six-digit code cannot mint new tokens.
    if challenge.get("token_hash") or challenge.get("code_verified_at"):
        return False, "This verification code has already been used. Please restart password recovery.", None

    max_attempts = int(challenge.get("max_attempts") or MAX_ATTEMPTS)
    if int(challenge.get("attempts") or 0) >= max_attempts:
        _invalidate_challenge(str(challenge["id"]), now)
        return False, "Maximum verification attempts exceeded. Please request a new code.", None

    verification_provider = str(challenge.get("verification_provider") or "internal")
    if verification_provider == "twilio_verify":
        is_valid, provider_message = delivery.check_twilio_verify_otp(
            str(challenge.get("recipient") or ""),
            supplied_code,
        )
        if not is_valid:
            provider_message_lower = str(provider_message or "").lower()
            # Provider configuration/network faults are not a user's bad guess.
            if "connection error" in provider_message_lower or "not configured" in provider_message_lower:
                return False, "SMS verification is temporarily unavailable. Please try again.", None
    elif verification_provider == "internal":
        expected_hash = str(challenge.get("code_hash") or "")
        is_valid = _constant_time_compare(expected_hash, _hash_value(supplied_code))
    else:
        _invalidate_challenge(str(challenge["id"]), now)
        return False, "Invalid verification challenge.", None

    if not is_valid:
        try:
            attempts, locked = _record_password_reset_failure(challenge)
        except Exception as exc:
            print(f"Password reset attempt counter failed for challenge {challenge.get('id')}: {exc}")
            return False, "Unable to verify the code right now. Please try again.", None

        if locked:
            return False, "Maximum verification attempts exceeded. Please request a new code.", None
        remaining = max(0, max_attempts - attempts)
        return False, f"Incorrect verification code. {remaining} attempt(s) remaining.", None

    reset_token = secrets.token_urlsafe(32)
    token_hash = _hash_value(reset_token)
    verified_at = datetime.now(timezone.utc).isoformat()
    try:
        if os.getenv("DATABASE_MODE", "").strip().lower() == "mock":
            # Match the production compare-and-set operation: only one request can
            # move an unused challenge into its verified-token state.
            updated = (
                supabase.table("password_reset_challenges")
                .update({
                    "token_hash": token_hash,
                    "code_verified_at": verified_at,
                })
                .eq("id", str(challenge["id"]))
                .eq("is_used", False)
                .is_("token_hash", "null")
                .is_("code_verified_at", "null")
                .execute()
            )
            if not updated.data:
                return False, "This verification code has already been used. Please restart password recovery.", None
        else:
            consumed = supabase.rpc(
                "consume_password_reset_code",
                {
                    "p_challenge_id": str(challenge["id"]),
                    "p_token_hash": token_hash,
                    "p_now": verified_at,
                },
            ).execute().data
            if not consumed:
                return False, "This verification code has already been used. Please restart password recovery.", None
            if isinstance(consumed, list):
                first = consumed[0] if consumed else False
                consumed = next(iter(first.values()), False) if isinstance(first, dict) else first
            if not consumed:
                return False, "This verification code has already been used. Please restart password recovery.", None
    except Exception as exc:
        print(f"Unable to issue password reset token for challenge {challenge.get('id')}: {type(exc).__name__}")
        return False, "Unable to verify the code right now. Please try again.", None

    return True, "Verification code confirmed.", reset_token


def reset_password_with_token(
    reset_token: str,
    new_password: str,
    user_agent: str | None = None,
    client_ip: str | None = None,
) -> Tuple[bool, str]:
    """
    Complete password reset with a single-use token.
    Password replacement, challenge consumption and JWT session revocation are atomic in production.
    """
    if len(new_password.strip()) < 8:
        return False, "Password must be at least 8 characters long."

    token_hash = _hash_value(reset_token.strip())
    now = datetime.now(timezone.utc)

    try:
        result = (
            supabase.table("password_reset_challenges")
            .select("*")
            .eq("token_hash", token_hash)
            .eq("is_used", False)
            .limit(1)
            .execute()
        )
        if not result.data:
            return False, "Invalid or expired password reset token."
        challenge = result.data[0]
    except Exception as exc:
        print(f"Password reset token lookup failed: {exc}")
        return False, "Unable to validate the reset token right now. Please try again."

    expires_at = _parse_phone_code_timestamp(challenge.get("expires_at"))
    if not expires_at or expires_at <= now:
        return False, "Reset token has expired. Please restart the recovery process."
    if not challenge.get("code_verified_at"):
        return False, "Invalid or expired password reset token."

    user_id = str(challenge["user_id"])
    hashed_password = password_hasher.hash(new_password)

    try:
        if os.getenv("DATABASE_MODE", "").strip().lower() == "mock":
            # The mock store has no SQL transactions; preserve the same single-use
            # behavior for tests while production uses the transaction below.
            current = (
                supabase.table("password_reset_challenges")
                .select("*")
                .eq("id", str(challenge["id"]))
                .eq("token_hash", token_hash)
                .eq("is_used", False)
                .limit(1)
                .execute()
                .data
            )
            if not current:
                return False, "Invalid or expired password reset token."
            update_password_and_revoke_sessions(user_id, hashed_password)
            supabase.table("password_reset_challenges").update({
                "is_used": True,
                "used_at": now.isoformat(),
            }).eq("user_id", user_id).eq("is_used", False).execute()
        else:
            rpc_result = supabase.rpc(
                "reset_password_and_revoke_sessions",
                {
                    "p_challenge_id": str(challenge["id"]),
                    "p_token_hash": token_hash,
                    "p_password_hash": hashed_password,
                    "p_now": now.isoformat(),
                },
            ).execute()
            data = rpc_result.data
            if data is None:
                return False, "Invalid or expired password reset token."
            if isinstance(data, list):
                if not data:
                    return False, "Invalid or expired password reset token."
                value = data[0]
                if isinstance(value, dict):
                    value = next(iter(value.values()), None)
            elif isinstance(data, dict):
                value = next(iter(data.values()), None)
            else:
                value = data
            if value is None:
                return False, "Invalid or expired password reset token."
    except Exception as exc:
        print(f"Atomic password reset failed for user {user_id}: {exc}")
        return False, "Unable to update your password right now. Please try again."

    try:
        record_auth_event(
            user_id=user_id,
            event_type="password_reset",
            device_label=device_label_from_user_agent(user_agent),
            client_ip=client_ip,
        )
    except Exception as exc:
        # Password replacement must remain successful even if the audit store is
        # temporarily unavailable; never log the reset token or contact details.
        print(f"Unable to record password reset security event: {type(exc).__name__}")

    return True, "Password reset successfully. You can now log in with your new password."


# ==============================================================================
# PHONE VERIFICATION IN ACCOUNT SETTINGS
# ==============================================================================

def _parse_phone_code_timestamp(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    except (TypeError, ValueError):
        return None


def _invalidate_phone_verification_code(code_id: str) -> None:
    try:
        supabase.table("phone_verification_codes").update({
            "is_used": True,
        }).eq("id", str(code_id)).execute()
    except Exception as exc:
        print(f"Unable to invalidate phone verification code {code_id}: {exc}")


def _record_phone_verification_failure(record: dict) -> tuple[int, bool]:
    """Increment failed attempts atomically on production, with mock-mode parity."""
    code_id = str(record.get("id"))
    if os.getenv("DATABASE_MODE", "").strip().lower() == "mock":
        attempts = int(record.get("attempts") or 0) + 1
        locked = attempts >= PHONE_CODE_MAX_ATTEMPTS
        supabase.table("phone_verification_codes").update({
            "attempts": attempts,
            "is_used": locked,
        }).eq("id", code_id).execute()
        return attempts, locked

    result = supabase.rpc(
        "record_phone_verification_failure",
        {
            "p_code_id": code_id,
            "p_max_attempts": PHONE_CODE_MAX_ATTEMPTS,
        },
    ).execute()
    rows = result.data or []
    if not rows:
        return PHONE_CODE_MAX_ATTEMPTS, True
    row = rows[0]
    if not isinstance(row, dict):
        return PHONE_CODE_MAX_ATTEMPTS, True
    return int(row.get("attempts") or PHONE_CODE_MAX_ATTEMPTS), bool(row.get("is_locked"))


def send_phone_verification_code(user_id: str, phone: str) -> Tuple[bool, str, Optional[str]]:
    """Send a short-lived phone code, applying delivery checks and server-side rate limits."""
    phone_clean = delivery.normalize_phone_number(str(phone or "").strip())
    if not re.fullmatch(r"\+[1-9][0-9]{7,14}", phone_clean):
        return False, "Enter a valid phone number with country code.", None

    user_id = str(user_id)
    user = users_collection.find_one({"_id": user_id}, include_profiles=False)
    if not user:
        return False, "User account not found.", None
    # Always store the database UUID, not an optional legacy display identifier,
    # in phone_verification_codes.user_id.
    user_id = str(user.get("_db_id") or user.get("_id"))
    if not user.get("is_active", True):
        return False, "This account has been deactivated.", None
    phone_version = int(user.get("phone_version") or 0)

    if not delivery.is_sms_configured():
        delivery.record_delivery(
            user_id=user_id,
            channel="sms",
            recipient=phone_clean,
            status="skipped",
            event_type="phone_verification",
            provider="twilio",
            error_message="SMS provider is not configured.",
        )
        return False, "SMS verification is temporarily unavailable. Please try again later.", None

    now = datetime.now(timezone.utc)
    code = generate_verification_code()
    record = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "phone": phone_clean,
        "phone_version": phone_version,
        "code_hash": _hash_value(code),
        "attempts": 0,
        "is_used": False,
        "expires_at": (now + timedelta(minutes=CODE_EXPIRATION_MINUTES)).isoformat(),
        "created_at": now.isoformat(),
    }

    if os.getenv("DATABASE_MODE", "").strip().lower() == "mock":
        # Mock adapter parity; production uses a single row-locked RPC.
        try:
            prior_rows = (
                supabase.table("phone_verification_codes")
                .select("*")
                .eq("user_id", user_id)
                .order("created_at", desc=True)
                .limit(100)
                .execute()
                .data or []
            )
        except Exception as exc:
            print(f"Unable to check phone verification send limits for {user_id}: {exc}")
            return False, "Unable to request a verification code right now. Please try again.", None

        one_hour_ago = now - timedelta(hours=1)
        recent_sends = []
        for row in prior_rows:
            created_at = _parse_phone_code_timestamp(row.get("created_at"))
            if created_at and created_at >= one_hour_ago:
                recent_sends.append((row, created_at))

        if recent_sends:
            latest_created_at = max(item[1] for item in recent_sends)
            seconds_since_last = (now - latest_created_at).total_seconds()
            if seconds_since_last < PHONE_CODE_COOLDOWN_SECONDS:
                wait_seconds = max(1, int(PHONE_CODE_COOLDOWN_SECONDS - seconds_since_last + 0.999))
                return False, f"Please wait {wait_seconds} seconds before requesting another code.", None

        if len(recent_sends) >= PHONE_CODE_MAX_SENDS_PER_HOUR:
            return False, "You have reached the phone verification send limit. Please try again in an hour.", None

        try:
            supabase.table("phone_verification_codes").update({
                "is_used": True,
            }).eq("user_id", user_id).eq("is_used", False).execute()
            supabase.table("phone_verification_codes").insert(record).execute()
        except Exception as exc:
            print(f"Unable to create phone verification challenge for {user_id}: {exc}")
            return False, "Unable to request a verification code right now. Please try again.", None
    else:
        try:
            rpc_result = supabase.rpc(
                "create_phone_verification_challenge",
                {
                    "p_user_id": user_id,
                    "p_code_id": record["id"],
                    "p_phone_version": phone_version,
                    "p_phone": phone_clean,
                    "p_code_hash": record["code_hash"],
                    "p_expires_at": record["expires_at"],
                    "p_now": now.isoformat(),
                },
            ).execute()
            rows = rpc_result.data or []
            result = rows[0] if rows else {"outcome": "not_found"}
        except Exception as exc:
            print(f"Unable to create rate-limited phone challenge for {user_id}: {exc}")
            return False, "Unable to request a verification code right now. Please try again.", None

        outcome = result.get("outcome")
        if outcome == "cooldown":
            wait_seconds = max(1, int(result.get("retry_after_seconds") or PHONE_CODE_COOLDOWN_SECONDS))
            return False, f"Please wait {wait_seconds} seconds before requesting another code.", None
        if outcome == "hourly_limit":
            return False, "You have reached the phone verification send limit. Please try again in an hour.", None
        if outcome == "not_found":
            return False, "User account not found or deactivated.", None
        if outcome == "profile_changed":
            return False, "Your phone number was updated in another session. Refresh and request a new code.", None
        if outcome != "created":
            return False, "Unable to request a verification code right now. Please try again.", None

    message = f"Your SOET Connect phone verification code is {code}. It expires in 10 minutes. Do not share this code."
    try:
        success, provider_message_id, error = delivery.send_sms_message(phone_clean, message)
    except Exception as exc:
        success, provider_message_id, error = False, None, str(exc)

    delivery.record_delivery(
        user_id=user_id,
        channel="sms",
        recipient=phone_clean,
        status="accepted" if success else "failed",
        event_type="phone_verification",
        provider="twilio",
        provider_message_id=provider_message_id,
        error_message=None if success else (error or "SMS delivery failed"),
    )

    if not success:
        _invalidate_phone_verification_code(record["id"])
        print(f"Phone verification SMS delivery failed for user {user_id}.")
        return False, "We could not deliver the verification code. Please check the number or try again later.", None

    debug_code = code if os.getenv("PYTEST_CURRENT_TEST") else None
    return True, "Verification code sent to your phone.", debug_code


def _consume_phone_verification_code(record: dict, user_id: str, now: datetime) -> bool:
    """Atomically consume a verified OTP so it can never be replayed."""
    code_id = str(record.get("id"))
    if os.getenv("DATABASE_MODE", "").strip().lower() == "mock":
        result = (
            supabase.table("phone_verification_codes")
            .update({"is_used": True})
            .eq("id", code_id)
            .eq("user_id", str(user_id))
            .eq("is_used", False)
            .execute()
        )
        return bool(result.data)

    result = supabase.rpc(
        "consume_phone_verification_challenge",
        {
            "p_user_id": str(user_id),
            "p_code_id": code_id,
            "p_now": now.isoformat(),
            "p_max_attempts": PHONE_CODE_MAX_ATTEMPTS,
        },
    ).execute()
    data = result.data
    if isinstance(data, bool):
        return data
    if isinstance(data, list):
        if not data:
            return False
        first = data[0]
        if isinstance(first, dict):
            first = next(iter(first.values()), False)
        return bool(first)
    if isinstance(data, dict):
        return bool(next(iter(data.values()), False))
    return bool(data)


def confirm_phone_verification(user_id: str, code: str) -> Tuple[bool, str]:
    """Verify the latest phone code with expiry and a five-attempt lockout."""
    user_id = str(user_id)
    user = users_collection.find_one({"_id": user_id}, include_profiles=False)
    if not user or not user.get("is_active", True):
        return False, "User account is unavailable."
    user_id = str(user.get("_db_id") or user.get("_id"))
    supplied_code = str(code or "").strip()
    now = datetime.now(timezone.utc)

    try:
        res = (
            supabase.table("phone_verification_codes")
            .select("*")
            .eq("user_id", user_id)
            .eq("is_used", False)
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        if not res.data:
            return False, "Invalid or expired phone verification code."
        record = res.data[0]
    except Exception as exc:
        print(f"Unable to load phone verification challenge for {user_id}: {exc}")
        return False, "Unable to verify the phone code right now. Please try again."

    if int(record.get("phone_version") or 0) != int(user.get("phone_version") or 0):
        _invalidate_phone_verification_code(str(record["id"]))
        return False, "Your phone number changed after this code was sent. Please request a new code."

    expires_at = _parse_phone_code_timestamp(record.get("expires_at"))
    if not expires_at:
        _invalidate_phone_verification_code(record["id"])
        return False, "Invalid phone verification challenge."
    if expires_at <= now:
        _invalidate_phone_verification_code(record["id"])
        return False, "Verification code has expired. Please request a new one."

    if int(record.get("attempts") or 0) >= PHONE_CODE_MAX_ATTEMPTS:
        _invalidate_phone_verification_code(record["id"])
        return False, "Maximum verification attempts exceeded. Please request a new code."

    expected_hash = str(record.get("code_hash") or "")
    provided_hash = _hash_value(supplied_code)
    if not _constant_time_compare(expected_hash, provided_hash):
        try:
            attempts, locked = _record_phone_verification_failure(record)
        except Exception as exc:
            print(f"Unable to count failed phone verification attempt for {user_id}: {exc}")
            return False, "Unable to verify the phone code right now. Please try again."

        if locked:
            return False, "Maximum verification attempts exceeded. Please request a new code."
        remaining = max(0, PHONE_CODE_MAX_ATTEMPTS - attempts)
        return False, f"Incorrect verification code. {remaining} attempt(s) remaining."

    try:
        if os.getenv("DATABASE_MODE", "").strip().lower() == "mock":
            if not _consume_phone_verification_code(record, user_id, now):
                return False, "This verification code has already been used. Please request a new code."

            # Keep mock-mode behavior aligned with the production transaction.
            update_fields = {
                "phone": record["phone"],
                "is_phone_verified": True,
            }
            if user.get("role") == "student":
                update_fields["student_profile"] = {"phone": record["phone"]}

            updated = users_collection.update_one(
                {"_id": user_id},
                {"$set": update_fields},
            )
            if not updated.modified_count:
                return False, "Unable to update the verified phone number. Please try again."
        else:
            # Production locks both the account and challenge, consumes the OTP,
            # and updates users/student_profiles within one database transaction.
            completion = supabase.rpc(
                "complete_phone_verification",
                {
                    "p_user_id": user_id,
                    "p_code_id": str(record["id"]),
                    "p_now": now.isoformat(),
                    "p_max_attempts": PHONE_CODE_MAX_ATTEMPTS,
                },
            ).execute()
            rows = completion.data or []
            if not rows:
                return False, "This verification code is no longer active. Please request a new code."
    except Exception as exc:
        print(f"Phone verification completion failed for user {user_id}: {exc}")
        return False, "Unable to complete phone verification right now. Please try again."

    return True, "Phone number verified successfully."
