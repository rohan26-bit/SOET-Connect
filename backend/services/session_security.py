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
    rows = result.data or []
    if not rows or rows[0] is None:
        raise RuntimeError("User account not found while updating password.")

    return int(rows[0])
