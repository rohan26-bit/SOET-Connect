import os

from dotenv import load_dotenv
from fastapi import APIRouter, HTTPException, status

from database import users_collection
from models.user import create_user_document
from schemas.auth import RegisterRequest, LoginRequest
from pwdlib import PasswordHash
from security.jwt import create_access_token


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

        if user.admin_secret != ADMIN_REGISTRATION_SECRET:
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