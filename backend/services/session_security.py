"""Atomic password updates and JWT session revocation."""

import os

from database import supabase, users_collection


def update_password_and_revoke_sessions(user_id: str, password_hash: str) -> int:
    """Replace a password and increment the account's token version atomically."""
    user_id = str(user_id)

    if os.getenv("DATABASE_MODE", "").strip().lower() == "mock":
        user = users_collection.find_one({"_id": user_id}, include_profiles=False)
        if not user:
            raise RuntimeError("User account not found while updating password.")

        next_version = int(user.get("session_version") or 0) + 1
        result = users_collection.update_one(
            {"_id": user_id},
            {"$set": {
                "password_hash": password_hash,
                "session_version": next_version,
            }},
        )
        if not result.modified_count:
            raise RuntimeError("Password update did not modify the user account.")
        return next_version

    result = supabase.rpc(
        "update_password_and_revoke_sessions",
        {
            "p_user_id": user_id,
            "p_password_hash": password_hash,
        },
    ).execute()
    data = result.data
    if data is None:
        raise RuntimeError("User account not found while updating password.")

    # PostgREST scalar-returning RPCs may decode as an integer, while table-returning
    # RPCs decode as a list of row dictionaries.
    if isinstance(data, list):
        if not data:
            raise RuntimeError("User account not found while updating password.")
        value = data[0]
        if isinstance(value, dict):
            value = next(iter(value.values()), None)
    elif isinstance(data, dict):
        value = next(iter(data.values()), None)
    else:
        value = data

    if value is None:
        raise RuntimeError("User account not found while updating password.")
    return int(value)
