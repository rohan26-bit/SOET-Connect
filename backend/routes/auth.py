import os
import secrets
import uuid

from datetime import datetime, timezone
from typing import Optional
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status

from database import DuplicatePrnError, users_collection
from models.user import create_user_document
from schemas.auth import RegisterRequest, LoginRequest, ChangePasswordRequest
from pwdlib import PasswordHash
from security.jwt import create_access_token, decode_access_token
from security.dependencies import get_current_user
from security.auth_cookie import clear_auth_cookie, is_trusted_origin, set_auth_cookie
from services.session_security import update_password_and_revoke_sessions
from services.auth_sessions import (
    create_auth_session,
    list_active_auth_sessions,
    revoke_auth_session,
    revoke_other_auth_sessions,
)
from services.login_rate_limit import (
    check_login_rate_limit,
    clear_login_account_failures,
    get_client_ip,
    record_login_failure,
)


load_dotenv()

ADMIN_REGISTRATION_SECRET = os.getenv("ADMIN_REGISTRATION_SECRET")


router = APIRouter(
    prefix="/auth",
    tags=["Authentication"]
)

password_hash = PasswordHash.recommended()

def _issue_access_token(existing_user: dict, request: Request, session_version: int | None = None) -> str:
    """Issue a unique JWT and persist its server-side device session before returning it."""
    session_id = str(uuid.uuid4())
    effective_session_version = (
        int(existing_user.get("session_version") or 0)
        if session_version is None
        else int(session_version)
    )
    token = create_access_token(
        user_id=str(existing_user["_id"]),
        role=existing_user["role"],
        session_version=effective_session_version,
        session_id=session_id,
    )
    token_payload = decode_access_token(token)
    create_auth_session(
        user_id=str(existing_user.get("_db_id") or existing_user["_id"]),
        session_id=session_id,
        expires_at=token_payload["expires_at"],
        user_agent=request.headers.get("user-agent"),
    )
    return token


# =========================
# PRN AVAILABILITY
# =========================

@router.get("/check-prn")
def check_prn_availability(prn: str = Query(..., min_length=1, max_length=100)):
    """Check whether a PRN is free across student and alumni accounts."""
    normalized_prn = prn.strip()
    if not normalized_prn:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="PRN is required."
        )

    available = not users_collection.prn_exists(normalized_prn)
    return {
        "available": available,
        "message": (
            "PRN is available."
            if available
            else "This PRN is already associated with an existing SOET Connect account."
        ),
    }


# =========================
# REGISTER
# =========================

@router.post("/register", status_code=status.HTTP_201_CREATED)
def register_user(user: RegisterRequest):

    # Students and alumni can register normally.
    if user.role not in {"student", "alumni", "admin"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid registration role."
        )

    # Admin registration requires the server-side secret.
    if user.role == "admin":
        if not ADMIN_REGISTRATION_SECRET:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Admin registration is not configured."
            )

        if not user.admin_secret or not secrets.compare_digest(user.admin_secret, ADMIN_REGISTRATION_SECRET):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Invalid admin registration secret."
            )

    # Check whether email already exists first, preserving the specific response
    # for repeat submissions using the same account email.
    existing_user = users_collection.find_one(
        {"email": user.email.lower().strip()}
    )

    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An account with this email already exists."
        )

    # PRN is the institution-wide identity: pending, rejected, and inactive
    # accounts continue to reserve it; it cannot be reused across roles.
    if user.role in {"student", "alumni"}:
        requested_prn = user.student_id if user.role == "student" else user.alumni_id
        if users_collection.prn_exists(requested_prn):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This PRN is already associated with an existing SOET Connect account. Please sign in or contact the administrator if you believe this is an error."
            )

    # Hash password before storing it.
    hashed_password = password_hash.hash(user.password)

    # Create complete user document.
    user_document = create_user_document(
        name=user.name,
        email=user.email,
        password_hash=hashed_password,
        role=user.role,

        student_id=user.student_id,
        department=user.department,
        course=user.course,
        academic_year=user.academic_year,
        graduation_year=user.graduation_year,
        phone=user.phone,

        alumni_id=user.alumni_id,
        degree=user.degree,
        company=user.company,
        designation=user.designation,
        industry=user.industry,
        location=user.location,
        skills=user.skills,
        linkedin=user.linkedin,
        github=user.github,
        website=user.website,
        bio=user.bio
    )

    # Collection-level checks and the SQL registry trigger also protect
    # direct API calls and simultaneous registrations.
    try:
        result = users_collection.insert_one(user_document)
    except DuplicatePrnError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This PRN is already associated with an existing SOET Connect account. Please sign in or contact the administrator if you believe this is an error."
        )

    return {
        "message": "Registration successful.",
        "user_id": str(result.inserted_id),
        "role": user.role,
        "is_verified": user_document["is_verified"]
    }


# =========================
# LOGIN
# =========================

# A pre-generated Argon2 hash keeps the unknown-account path close to the
# password-verification cost of a known account, reducing account enumeration
# through response timing.
_DUMMY_PASSWORD_HASH = password_hash.hash(secrets.token_urlsafe(32))


def _login_rate_limit_response(retry_after_seconds: int) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        detail="Too many sign-in attempts. Please try again later.",
        headers={"Retry-After": str(max(1, int(retry_after_seconds or 1)))},
    )


@router.post("/login")
def login_user(user: LoginRequest, request: Request, response: Response):
    # Block cross-origin login-CSRF attempts while allowing non-browser API clients
    # that do not send an Origin header.
    origin = request.headers.get("origin")
    if origin and not is_trusted_origin(origin):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Request origin is not allowed.",
        )

    email = user.email.lower().strip()
    client_ip = get_client_ip(request)

    # Fail closed if the shared rate-limit service is unavailable. Never fall
    # back to an unthrottled login path during a database or configuration fault.
    try:
        limit_state = check_login_rate_limit(email, client_ip)
    except Exception as exc:
        print(f"Login rate-limit check failed: {type(exc).__name__}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Sign-in is temporarily unavailable. Please try again.",
        ) from exc

    if limit_state.get("blocked"):
        raise _login_rate_limit_response(limit_state.get("retry_after_seconds", 1))

    try:
        existing_user = users_collection.find_one({"email": email})
    except Exception as exc:
        print(f"Login account lookup failed: {type(exc).__name__}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Sign-in is temporarily unavailable. Please try again.",
        ) from exc

    password_record = (
        existing_user.get("password_hash") or _DUMMY_PASSWORD_HASH
        if existing_user
        else _DUMMY_PASSWORD_HASH
    )

    try:
        password_is_correct = password_hash.verify(user.password, password_record)
    except Exception:
        # A malformed legacy password hash must not crash login or bypass limits.
        password_is_correct = False

    if not existing_user or not password_is_correct:
        try:
            failure_state = record_login_failure(email, client_ip)
        except Exception as exc:
            print(f"Login failure could not be recorded: {type(exc).__name__}")
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Sign-in is temporarily unavailable. Please try again.",
            ) from exc

        if failure_state.get("blocked"):
            raise _login_rate_limit_response(failure_state.get("retry_after_seconds", 1))

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password."
        )

    # Correct credentials reset account-specific history. The IP-wide bucket
    # deliberately remains, so one successful login cannot erase a source's
    # failed attempts against other accounts.
    try:
        clear_login_account_failures(email, client_ip)
    except Exception as exc:
        print(f"Successful login history could not be cleared: {type(exc).__name__}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Sign-in is temporarily unavailable. Please try again.",
        ) from exc

    if not existing_user.get("is_active", True):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account has been deactivated."
        )

    role = existing_user.get("role")
    if role in ["student", "alumni"]:
        v_status = existing_user.get("verification_status", "pending")
        if v_status == "pending":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your account is awaiting administrator approval."
            )
        elif v_status == "rejected":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your account registration was rejected by an administrator."
            )
        elif v_status == "suspended":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your account has been suspended by an administrator."
            )
        if not (existing_user.get("is_verified", False) and v_status == "approved"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your account is not approved for login."
            )

    try:
        access_token = _issue_access_token(existing_user, request)
    except Exception as exc:
        print(f"Login session could not be created: {type(exc).__name__}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Sign-in is temporarily unavailable. Please try again.",
        ) from exc

    set_auth_cookie(response, access_token)
    result = {
        "message": "Login successful.",
        "user": {
            "id": str(existing_user["_id"]),
            "name": existing_user["name"],
            "email": existing_user["email"],
            "role": existing_user["role"],
            "is_verified": existing_user.get("is_verified", False)
        }
    }
    # Automated tests opt in to token JSON for assertions and legacy bearer fixtures.
    # Production responses never expose the credential to browser JavaScript.
    if os.getenv("AUTH_EXPOSE_TEST_TOKENS") == "1":
        result["access_token"] = access_token
        result["token_type"] = "bearer"
    return result


# =========================
# CHANGE PASSWORD
# =========================

@router.post("/change-password")
def change_password(
    payload: ChangePasswordRequest,
    request: Request,
    response: Response,
    current_user: dict = Depends(get_current_user)
):
    user_id = current_user.get("user_id")
    existing_user = users_collection.find_one({"_id": str(user_id)})
    if not existing_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User account not found."
        )

    if not existing_user.get("is_active", True):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account has been deactivated."
        )

    # 1. Verify current password
    if not password_hash.verify(payload.current_password, existing_user.get("password_hash", "")):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect."
        )

    # 2. Check confirmation match
    if payload.new_password != payload.confirm_new_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password and confirmation do not match."
        )

    # 3. Validate password length / strength
    if len(payload.new_password.strip()) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be at least 8 characters long."
        )

    # 4. Check that new password is not identical to current password
    if payload.current_password == payload.new_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password cannot be the same as the current password."
        )

    # 5. Hash new password securely with Argon2
    new_hashed = password_hash.hash(payload.new_password)

    # 6. Persist the new password and revoke every previously issued token.
    try:
        database_user_id = str(existing_user.get("_db_id") or existing_user["_id"])
        new_session_version = update_password_and_revoke_sessions(
            database_user_id,
            new_hashed,
        )
    except Exception as exc:
        print(f"Password change failed for user {user_id}: {exc}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Unable to update your password right now. Please try again.",
        ) from exc

    # Keep the current browser session alive with a freshly issued token.
    try:
        replacement_token = _issue_access_token(
            existing_user,
            request,
            session_version=new_session_version,
        )
    except Exception as exc:
        print(f"Replacement session could not be created after password change: {type(exc).__name__}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Your password was changed, but a new session could not be created. Please sign in again.",
        ) from exc

    set_auth_cookie(response, replacement_token)
    result = {
        "message": "Password changed successfully. Other active sessions have been signed out.",
    }
    if os.getenv("AUTH_EXPOSE_TEST_TOKENS") == "1":
        result["access_token"] = replacement_token
        result["token_type"] = "bearer"
    return result


# ============================================================
# DEVICE SESSIONS & SERVER-SIDE SIGN OUT
# ============================================================

@router.post("/logout")
def logout(request: Request, response: Response, current_user: dict = Depends(get_current_user)):
    """Revoke this browser/device session on the server."""
    try:
        revoke_auth_session(
            current_user["session_id"],
            current_user["database_user_id"],
        )
    except Exception as exc:
        print(f"Logout session revocation failed: {type(exc).__name__}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Unable to complete secure sign out right now. Please try again.",
        ) from exc
    clear_auth_cookie(response)
    return {"message": "You have been signed out successfully."}


@router.get("/sessions")
def get_active_sessions(current_user: dict = Depends(get_current_user)):
    """List the signed-in user's active devices only."""
    try:
        sessions = list_active_auth_sessions(
            current_user["database_user_id"],
            current_user["session_id"],
        )
    except Exception as exc:
        print(f"Session list lookup failed: {type(exc).__name__}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Unable to load active sessions right now. Please try again.",
        ) from exc
    return {
        "sessions": sessions,
        "current_session_id": current_user["session_id"],
    }


@router.delete("/sessions/{session_id}")
def sign_out_device(
    session_id: uuid.UUID,
    current_user: dict = Depends(get_current_user),
):
    """Revoke a session only when it belongs to the authenticated account."""
    try:
        revoked = revoke_auth_session(str(session_id), current_user["database_user_id"])
    except Exception as exc:
        print(f"Device session revocation failed: {type(exc).__name__}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Unable to sign out that device right now. Please try again.",
        ) from exc
    if not revoked:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="That active session was not found.",
        )
    return {"message": "The selected device has been signed out."}


@router.post("/sessions/revoke-others")
def sign_out_other_devices(current_user: dict = Depends(get_current_user)):
    """Revoke every other active session while preserving this browser."""
    try:
        revoked_count = revoke_other_auth_sessions(
            current_user["database_user_id"],
            current_user["session_id"],
        )
    except Exception as exc:
        print(f"Other device session revocation failed: {type(exc).__name__}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Unable to sign out other devices right now. Please try again.",
        ) from exc
    return {
        "message": "All other active devices have been signed out.",
        "revoked_count": revoked_count,
    }


# ============================================================
# FORGOT PASSWORD & RECOVERY FLOW
# ============================================================

from pydantic import BaseModel, Field
from services.password_recovery import (
    PASSWORD_RESET_COOLDOWN_SECONDS,
    PHONE_CODE_COOLDOWN_SECONDS,
    request_password_reset,
    verify_password_reset_code,
    reset_password_with_token,
    send_phone_verification_code,
    confirm_phone_verification,
)


class ForgotPasswordRequest(BaseModel):
    identifier: str
    channel: str = "email"


class VerifyResetCodeRequest(BaseModel):
    identifier: str
    code: str


class ResetPasswordRequest(BaseModel):
    reset_token: str
    new_password: str = Field(..., min_length=8, max_length=128)
    confirm_password: Optional[str] = None


@router.post("/forgot-password")
def forgot_password_endpoint(payload: ForgotPasswordRequest):
    """Initiate password recovery by sending a 6-digit code via Email or SMS."""
    success, message, debug_code = request_password_reset(payload.identifier, payload.channel)
    if not success:
        raise HTTPException(status_code=400, detail=message)

    resp = {
        "message": message,
        "cooldown_seconds": PASSWORD_RESET_COOLDOWN_SECONDS,
        "expires_in": 600,
    }
    # Expose debug code strictly in automated test suite runner
    if debug_code is not None and os.getenv("PYTEST_CURRENT_TEST"):
        resp["_debug_code"] = debug_code
    return resp


@router.post("/verify-reset-code")
def verify_reset_code_endpoint(payload: VerifyResetCodeRequest):
    """Verify single-use 6-digit code and issue short-lived reset token."""
    success, message, reset_token = verify_password_reset_code(payload.identifier, payload.code)
    if not success or not reset_token:
        raise HTTPException(status_code=400, detail=message)

    return {
        "message": message,
        "reset_token": reset_token,
    }


@router.post("/reset-password")
def reset_password_endpoint(payload: ResetPasswordRequest):
    """Reset password with verified reset token."""
    if payload.confirm_password is not None and payload.new_password != payload.confirm_password:
        raise HTTPException(status_code=400, detail="New password and confirmation do not match.")

    if len(payload.new_password.strip()) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters long.")

    success, message = reset_password_with_token(payload.reset_token, payload.new_password)
    if not success:
        raise HTTPException(status_code=400, detail=message)

    return {"message": message}


# ============================================================
# PHONE VERIFICATION (ACCOUNT SETTINGS)
# ============================================================

class PhoneVerificationSendRequest(BaseModel):
    phone: str


class PhoneVerificationConfirmRequest(BaseModel):
    code: str


@router.post("/phone/send-code")
def send_phone_verification_endpoint(
    payload: PhoneVerificationSendRequest,
    current_user: dict = Depends(get_current_user),
):
    user_id = str(current_user.get("user_id"))
    success, message, debug_code = send_phone_verification_code(user_id, payload.phone)
    if not success:
        normalized_message = message.lower()
        if normalized_message.startswith("please wait") or "reached the phone verification send limit" in normalized_message:
            raise HTTPException(status_code=429, detail=message)
        if "temporarily unavailable" in normalized_message or "could not deliver" in normalized_message or "right now" in normalized_message:
            raise HTTPException(status_code=503, detail=message)
        raise HTTPException(status_code=400, detail=message)

    resp = {
        "message": message,
        "cooldown_seconds": PHONE_CODE_COOLDOWN_SECONDS,
        "expires_in": 600,
    }
    if debug_code is not None and os.getenv("PYTEST_CURRENT_TEST"):
        resp["_debug_code"] = debug_code
    return resp


@router.post("/phone/verify-code")
def verify_phone_code_endpoint(
    payload: PhoneVerificationConfirmRequest,
    current_user: dict = Depends(get_current_user),
):
    user_id = str(current_user.get("user_id"))
    success, message = confirm_phone_verification(user_id, payload.code)
    if not success:
        raise HTTPException(status_code=400, detail=message)

    return {"message": message}
