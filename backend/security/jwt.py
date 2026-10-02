import os
from datetime import datetime, timedelta, timezone

import jwt
from dotenv import load_dotenv
from fastapi import HTTPException, status


load_dotenv()

ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")


def get_jwt_secret_key() -> str:
    """Resolve JWT secret key based on environment mode.

    - If JWT_SECRET_KEY is explicitly provided, use it.
    - If DATABASE_MODE is 'mock', allow a test-only fallback secret for local testing.
    - In normal/production mode, fail clearly if JWT_SECRET_KEY is missing or empty.
    """
    raw_secret = os.getenv("JWT_SECRET_KEY", "").strip()
    if raw_secret:
        return raw_secret

    database_mode = os.getenv("DATABASE_MODE", "").lower()
    if database_mode == "mock":
        return "soet-connect-test-only-mock-jwt-secret-do-not-use-in-production"

    raise ValueError("JWT_SECRET_KEY is not set in environment or .env file.")


# Validate secret on module load
SECRET_KEY = get_jwt_secret_key()


def create_access_token(user_id: str, role: str):
    secret_key = get_jwt_secret_key()
    expire = datetime.now(timezone.utc) + timedelta(hours=24)

    payload = {
        "sub": user_id,
        "role": role,
        "exp": expire
    }

    return jwt.encode(
        payload,
        secret_key,
        algorithm=ALGORITHM
    )


def decode_access_token(token: str):
    secret_key = get_jwt_secret_key()
    try:
        payload = jwt.decode(
            token,
            secret_key,
            algorithms=[ALGORITHM]
        )

        user_id = payload.get("sub")
        role = payload.get("role")

        if not user_id or not role:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication token."
            )

        return {
            "user_id": user_id,
            "role": role
        }

    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication token has expired."
        )

    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token."
        )