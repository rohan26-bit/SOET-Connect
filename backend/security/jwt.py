import os
import uuid
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

    raise ValueError("JWT_SECRET_KEY is not set or empty. A secure secret key is required in production.")


# Validate secret on module load if available
try:
    SECRET_KEY = get_jwt_secret_key()
except ValueError:
    SECRET_KEY = ""


def create_access_token(user_id: str, role: str, session_version: int = 0, session_id: str | None = None):
    secret_key = get_jwt_secret_key()
    expire = datetime.now(timezone.utc) + timedelta(hours=24)

    payload = {
        "sub": user_id,
        "role": role,
        "sv": max(0, int(session_version)),
        "exp": expire
    }
    if session_id is not None:
        try:
            payload["sid"] = str(uuid.UUID(str(session_id)))
        except (TypeError, ValueError, AttributeError):
            raise ValueError("session_id must be a valid UUID.")

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

        try:
            session_version = int(payload.get("sv", 0))
            if session_version < 0:
                raise ValueError("Negative session version")
        except (TypeError, ValueError):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication token."
            )

        session_id = payload.get("sid")
        if session_id is not None:
            try:
                session_id = str(uuid.UUID(str(session_id)))
            except (TypeError, ValueError, AttributeError):
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid authentication token."
                )

        expires_at = datetime.fromtimestamp(float(payload["exp"]), timezone.utc).isoformat()
        return {
            "user_id": user_id,
            "role": role,
            "session_version": session_version,
            "session_id": session_id,
            "expires_at": expires_at,
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