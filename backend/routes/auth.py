from fastapi import APIRouter, HTTPException, status

from database import users_collection
from models.user import create_user_document
from schemas.auth import RegisterRequest
from pwdlib import PasswordHash


router = APIRouter(
    prefix="/auth",
    tags=["Authentication"]
)

password_hash = PasswordHash.recommended()


@router.post("/register", status_code=status.HTTP_201_CREATED)
def register_user(user: RegisterRequest):

    # Only students and alumni can register themselves.
    if user.role not in {"student", "alumni"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only students and alumni can register."
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

    # Hash the password before storing it.
    hashed_password = password_hash.hash(user.password)

    # Create MongoDB user document.
    user_document = create_user_document(
        name=user.name,
        email=user.email,
        password_hash=hashed_password,
        role=user.role
    )

    # Save user in MongoDB.
    result = users_collection.insert_one(user_document)

    return {
        "message": "Registration successful.",
        "user_id": str(result.inserted_id),
        "role": user.role,
        "is_verified": user_document["is_verified"]
    }