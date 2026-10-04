import os
import secrets

from datetime import datetime, timezone
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException, status

from database import users_collection
from models.user import create_user_document
from schemas.auth import RegisterRequest, LoginRequest, ChangePasswordRequest
from pwdlib import PasswordHash
from security.jwt import create_access_token
from security.dependencies import get_current_user


load_dotenv()

ADMIN_REGISTRATION_SECRET = os.getenv("ADMIN_REGISTRATION_SECRET")


router = APIRouter(
    prefix="/auth",
    tags=["Authentication"]
)

password_hash = PasswordHash.recommended()


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

    # Check whether email already exists.
    existing_user = users_collection.find_one(
        {"email": user.email.lower().strip()}
    )

    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An account with this email already exists."
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

    # Save user in database.
    result = users_collection.insert_one(user_document)

    return {
        "message": "Registration successful.",
        "user_id": str(result.inserted_id),
        "role": user.role,
        "is_verified": user_document["is_verified"]
    }


# =========================
# LOGIN
# =========================

@router.post("/login")
def login_user(user: LoginRequest):

    existing_user = users_collection.find_one(
        {"email": user.email.lower().strip()}
    )

    if not existing_user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password."
        )

    password_is_correct = password_hash.verify(
        user.password,
        existing_user["password_hash"]
    )

    if not password_is_correct:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password."
        )

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

    access_token = create_access_token(
        user_id=str(existing_user["_id"]),
        role=existing_user["role"]
    )

    return {
        "message": "Login successful.",
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": str(existing_user["_id"]),
            "name": existing_user["name"],
            "email": existing_user["email"],
            "role": existing_user["role"],
            "is_verified": existing_user.get("is_verified", False)
        }
    }


# =========================
# CHANGE PASSWORD
# =========================

@router.post("/change-password")
def change_password(
    payload: ChangePasswordRequest,
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

    # 6. Update user document
    now = datetime.now(timezone.utc).isoformat()
    users_collection.update_one(
        {"_id": existing_user["_id"]},
        {"$set": {
            "password_hash": new_hashed,
            "updated_at": now
        }}
    )

    return {
        "message": "Password changed successfully."
    }