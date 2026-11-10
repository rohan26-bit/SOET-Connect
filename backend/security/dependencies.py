from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from database import users_collection
from security.jwt import decode_access_token


security = HTTPBearer(auto_error=False)


def get_user_by_id(user_id: str) -> dict | None:
    """Find a user by ID string without hydrating unused profile details."""
    if not user_id:
        return None

    user_id_str = str(user_id).strip()
    try:
        return users_collection.find_one({"_id": user_id_str}, include_profiles=False)
    except Exception as exc:
        # Keep a database outage distinct from a genuine missing account.
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication service is temporarily unavailable. Please try again.",
        ) from exc


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> dict:
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication credentials were not provided."
        )

    token = credentials.credentials
    payload = decode_access_token(token)
    user_id = payload.get("user_id")

    user = get_user_by_id(user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User account not found."
        )

    if not user.get("is_active", True):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account has been deactivated."
        )

    token_session_version = int(payload.get("session_version", 0))
    user_session_version = int(user.get("session_version") or 0)
    if token_session_version != user_session_version:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Your session has been revoked. Please sign in again."
        )

    return {
        "user_id": str(user["_id"]),
        "role": user.get("role", payload.get("role")),
    }


def get_optional_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security)
) -> dict | None:
    """Return the authenticated user when a token is supplied, otherwise None.

    Invalid or expired tokens still fail closed through get_current_user.
    """
    if credentials is None:
        return None
    return get_current_user(credentials)
