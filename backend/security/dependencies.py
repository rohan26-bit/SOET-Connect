from bson import ObjectId
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from database import users_collection
from security.jwt import decode_access_token


security = HTTPBearer(auto_error=False)


def get_user_by_id(user_id: str) -> dict | None:
    """Find a user by BSON ObjectId or string _id using indexed lookups."""
    if not user_id:
        return None

    user_id_str = str(user_id).strip()

    if ObjectId.is_valid(user_id_str):
        try:
            user = users_collection.find_one({"_id": ObjectId(user_id_str)})
            if user:
                return user
        except Exception:
            pass

    try:
        return users_collection.find_one({"_id": user_id_str})
    except Exception:
        return None


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

    return {
        "user_id": str(user["_id"]),
        "role": user.get("role", payload.get("role")),
    }
