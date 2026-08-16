from datetime import datetime, timezone


USER_ROLES = {
    "student",
    "alumni",
    "admin"
}


def create_user_document(
    name: str,
    email: str,
    password_hash: str,
    role: str
):
    if role not in USER_ROLES:
        raise ValueError("Invalid user role")

    return {
        "name": name,
        "email": email.lower().strip(),
        "password_hash": password_hash,
        "role": role,
        "is_active": True,
        "is_verified": role == "student" or role == "admin",
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc)
    }