"""Privacy-preserving account sign-in and security activity auditing."""

import hashlib
import hmac
import os
from datetime import datetime, timedelta, timezone
from typing import Any

from database import supabase
from services.auth_sessions import device_label_from_user_agent

SIGN_IN_LOOKBACK_DAYS = 90
ALLOWED_EVENT_TYPES = {
    "sign_in",
    "unfamiliar_sign_in",
    "password_changed",
    "password_reset",
    "signed_out",
    "sessions_revoked",
}


def _ip_fingerprint(client_ip: str | None) -> str | None:
    """Store only an HMAC fingerprint of a normalized IP address, never the IP itself."""
    value = str(client_ip or "").strip()
    if not value:
        return None

    secret = (
        os.getenv("LOGIN_SECURITY_EVENT_SECRET", "").strip()
        or os.getenv("LOGIN_RATE_LIMIT_SECRET", "").strip()
        or os.getenv("JWT_SECRET_KEY", "").strip()
    )
    if not secret:
        raise RuntimeError("Security event fingerprinting is not configured.")

    return hmac.new(secret.encode("utf-8"), value.encode("utf-8"), hashlib.sha256).hexdigest()


def record_auth_event(
    user_id: str,
    event_type: str,
    device_label: str = "Unknown device",
    client_ip: str | None = None,
    signals: list[str] | None = None,
) -> dict:
    """Persist a minimal security event; raw IPs, emails, and user-agent strings are excluded."""
    if event_type not in ALLOWED_EVENT_TYPES:
        raise ValueError("Unsupported authentication security event type.")

    record = {
        "user_id": str(user_id),
        "event_type": event_type,
        "device_label": str(device_label or "Unknown device")[:120],
        "ip_fingerprint": _ip_fingerprint(client_ip),
        "metadata": {"signals": sorted(set(signals or []))},
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    result = supabase.table("auth_security_events").insert(record).execute()
    rows = result.data or []
    if not rows:
        raise RuntimeError("The authentication security event could not be stored.")
    return rows[0]


def record_sign_in_event(
    user_id: str,
    user_agent: str | None,
    client_ip: str | None,
    current_session_id: str | None = None,
) -> dict:
    """Record a successful sign-in and flag a new browser/platform type or network fingerprint."""
    user_id = str(user_id)
    now = datetime.now(timezone.utc)
    cutoff = (now - timedelta(days=SIGN_IN_LOOKBACK_DAYS)).isoformat()
    label = device_label_from_user_agent(user_agent)
    ip_hash = _ip_fingerprint(client_ip)

    prior_events = (
        supabase.table("auth_security_events")
        .select("device_label,ip_fingerprint")
        .eq("user_id", user_id)
        .gte("created_at", cutoff)
        .in_("event_type", ["sign_in", "unfamiliar_sign_in"])
        .order("created_at", desc=True)
        .limit(100)
        .execute()
        .data or []
    )
    session_query = (
        supabase.table("auth_sessions")
        .select("id,device_label")
        .eq("user_id", user_id)
        .gte("created_at", cutoff)
    )
    if current_session_id:
        session_query = session_query.neq("id", str(current_session_id))
    prior_sessions = (
        session_query
        .order("created_at", desc=True)
        .limit(100)
        .execute()
        .data or []
    )

    signals: list[str] = []
    known_device_labels = {
        str(row.get("device_label") or "Unknown device")
        for row in [*prior_events, *prior_sessions]
    }
    known_ip_fingerprints = {
        str(row["ip_fingerprint"])
        for row in prior_events
        if row.get("ip_fingerprint")
    }

    # First-ever sign-ins establish the baseline. Later sign-ins are flagged when
    # either the coarse browser/platform label or the HMAC network fingerprint is new.
    if known_device_labels and label not in known_device_labels:
        signals.append("new_browser_or_platform")
    if known_ip_fingerprints and ip_hash and ip_hash not in known_ip_fingerprints:
        signals.append("new_network")

    event_type = "unfamiliar_sign_in" if signals else "sign_in"
    return record_auth_event(
        user_id=user_id,
        event_type=event_type,
        device_label=label,
        client_ip=client_ip,
        signals=signals,
    )


def list_auth_events(user_id: str, limit: int = 25) -> list[dict[str, Any]]:
    """Return recent account activity without exposing network fingerprints or raw metadata."""
    bounded_limit = max(1, min(int(limit or 25), 50))
    result = (
        supabase.table("auth_security_events")
        .select("id,event_type,device_label,created_at,metadata")
        .eq("user_id", str(user_id))
        .order("created_at", desc=True)
        .limit(bounded_limit)
        .execute()
    )
    events = []
    for row in result.data or []:
        metadata = row.get("metadata") if isinstance(row.get("metadata"), dict) else {}
        signals = metadata.get("signals") if isinstance(metadata.get("signals"), list) else []
        events.append({
            "id": str(row.get("id")),
            "event_type": str(row.get("event_type") or "sign_in"),
            "device_label": str(row.get("device_label") or "Unknown device"),
            "created_at": row.get("created_at"),
            "signals": [str(signal) for signal in signals if isinstance(signal, str)],
        })
    return events
