"""Server-side per-device authentication session registry.

The browser continues to hold a short-lived bearer JWT. Every authenticated API
request validates its session id against this registry, allowing an individual
device token to be revoked immediately without invalidating other devices.
"""

import re
from datetime import datetime, timedelta, timezone
from typing import Any

from database import supabase


SESSION_TABLE = "auth_sessions"
LAST_SEEN_WRITE_INTERVAL = timedelta(minutes=5)


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _as_datetime(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        parsed = value
    elif isinstance(value, str) and value.strip():
        try:
            parsed = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
        except ValueError:
            return None
    else:
        return None

    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _iso(value: datetime | str) -> str:
    parsed = _as_datetime(value)
    if parsed is None:
        raise ValueError("A valid session expiry is required.")
    return parsed.isoformat()


def device_label_from_user_agent(user_agent: str | None) -> str:
    """Store a short display label, not the full raw User-Agent string."""
    ua = (user_agent or "").strip()[:500]
    if not ua:
        return "Unknown device"

    if "Edg/" in ua or "EdgA/" in ua or "EdgiOS/" in ua:
        browser = "Edge"
    elif "OPR/" in ua:
        browser = "Opera"
    elif "Firefox/" in ua or "FxiOS/" in ua:
        browser = "Firefox"
    elif "Chrome/" in ua or "CriOS/" in ua:
        browser = "Chrome"
    elif "Safari/" in ua:
        browser = "Safari"
    elif "TestClient" in ua or "testclient" in ua.lower():
        browser = "Test client"
    else:
        browser = "Browser"

    if "Android" in ua:
        platform = "Android"
    elif re.search(r"iPhone|iPad|iPod", ua, re.IGNORECASE):
        platform = "iOS"
    elif "Windows" in ua:
        platform = "Windows"
    elif "Mac OS X" in ua or "Macintosh" in ua:
        platform = "macOS"
    elif "Linux" in ua:
        platform = "Linux"
    else:
        platform = "Unknown device"

    return f"{browser} on {platform}" if platform != "Unknown device" else browser


def _get_session(session_id: str, user_id: str) -> dict | None:
    result = (
        supabase.table(SESSION_TABLE)
        .select("*")
        .eq("id", str(session_id))
        .eq("user_id", str(user_id))
        .limit(1)
        .execute()
    )
    rows = result.data or []
    return rows[0] if rows else None


def _active(row: dict | None, now: datetime | None = None) -> bool:
    if not row or row.get("revoked_at"):
        return False
    expiry = _as_datetime(row.get("expires_at"))
    return bool(expiry and expiry > (now or utc_now()))


def create_auth_session(
    user_id: str,
    session_id: str,
    expires_at: datetime | str,
    user_agent: str | None = None,
) -> dict:
    """Persist a newly issued JWT session before returning it to the browser."""
    now = utc_now()
    record = {
        "id": str(session_id),
        "user_id": str(user_id),
        "device_label": device_label_from_user_agent(user_agent),
        "created_at": now.isoformat(),
        "last_seen_at": now.isoformat(),
        "expires_at": _iso(expires_at),
        "revoked_at": None,
    }
    result = supabase.table(SESSION_TABLE).insert(record).execute()
    rows = result.data or []
    if not rows:
        raise RuntimeError("The authentication session could not be stored.")
    return rows[0]


def ensure_legacy_auth_session(
    user_id: str,
    session_id: str,
    expires_at: datetime | str,
    user_agent: str | None = None,
) -> bool:
    """Register pre-rollout JWTs once, preserving existing users during rollout."""
    row = _get_session(session_id, user_id)
    if row:
        return is_auth_session_active(session_id, user_id)

    try:
        create_auth_session(user_id, session_id, expires_at, user_agent)
    except Exception:
        # A simultaneous first request can race the insert. Accept only the
        # resulting row for the same user and only while it remains active.
        row = _get_session(session_id, user_id)
        if not row:
            raise
    return is_auth_session_active(session_id, user_id)


def is_auth_session_active(session_id: str, user_id: str) -> bool:
    """Check revocation/expiry and throttle last-seen writes to every five minutes."""
    row = _get_session(session_id, user_id)
    now = utc_now()
    if not _active(row, now):
        return False

    last_seen = _as_datetime(row.get("last_seen_at"))
    if last_seen is None or now - last_seen >= LAST_SEEN_WRITE_INTERVAL:
        (
            supabase.table(SESSION_TABLE)
            .update({"last_seen_at": now.isoformat()})
            .eq("id", str(session_id))
            .eq("user_id", str(user_id))
            .execute()
        )
    return True


def list_active_auth_sessions(user_id: str, current_session_id: str) -> list[dict]:
    result = (
        supabase.table(SESSION_TABLE)
        .select("id,device_label,created_at,last_seen_at,expires_at,revoked_at")
        .eq("user_id", str(user_id))
        .order("last_seen_at", desc=True)
        .limit(100)
        .execute()
    )
    now = utc_now()
    sessions = []
    for row in result.data or []:
        if not _active(row, now):
            continue
        sessions.append({
            "id": str(row["id"]),
            "device_label": str(row.get("device_label") or "Unknown device"),
            "created_at": row.get("created_at"),
            "last_seen_at": row.get("last_seen_at"),
            "expires_at": row.get("expires_at"),
            "is_current": str(row["id"]) == str(current_session_id),
        })
    return sessions


def revoke_auth_session(session_id: str, user_id: str) -> bool:
    row = _get_session(session_id, user_id)
    if not _active(row):
        return False

    result = (
        supabase.table(SESSION_TABLE)
        .update({"revoked_at": utc_now().isoformat()})
        .eq("id", str(session_id))
        .eq("user_id", str(user_id))
        .execute()
    )
    return bool(result.data)


def revoke_all_auth_sessions(user_id: str) -> int:
    """Revoke every registered device session for an account."""
    result = (
        supabase.table(SESSION_TABLE)
        .select("id,revoked_at")
        .eq("user_id", str(user_id))
        .execute()
    )
    now = utc_now().isoformat()
    revoked = 0
    for row in result.data or []:
        if row.get("revoked_at"):
            continue
        update_result = (
            supabase.table(SESSION_TABLE)
            .update({"revoked_at": now})
            .eq("id", str(row["id"]))
            .eq("user_id", str(user_id))
            .execute()
        )
        if update_result.data:
            revoked += 1
    return revoked


def revoke_other_auth_sessions(user_id: str, current_session_id: str) -> int:
    result = (
        supabase.table(SESSION_TABLE)
        .select("id,expires_at,revoked_at")
        .eq("user_id", str(user_id))
        .neq("id", str(current_session_id))
        .execute()
    )
    now = utc_now()
    revoked = 0
    for row in result.data or []:
        if not _active(row, now):
            continue
        update_result = (
            supabase.table(SESSION_TABLE)
            .update({"revoked_at": now.isoformat()})
            .eq("id", str(row["id"]))
            .eq("user_id", str(user_id))
            .execute()
        )
        if update_result.data:
            revoked += 1
    return revoked
