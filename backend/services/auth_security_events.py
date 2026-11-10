"""Privacy-preserving account sign-in and security activity auditing."""

import hashlib
import hmac
import os
import threading
from datetime import datetime, timedelta, timezone
from typing import Any

from database import supabase
from services.auth_sessions import device_label_from_user_agent
from services import delivery

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


# One security email per account in this window prevents frequent mobile-network
# changes or VPN use from generating repeated alerts.
UNFAMILIAR_SIGN_IN_EMAIL_COOLDOWN_SECONDS = 6 * 60 * 60
_MOCK_ALERT_LOCK = threading.Lock()


def claim_unfamiliar_sign_in_email_alert(
    user_id: str,
    event_id: str,
    now: datetime | None = None,
) -> bool:
    """Atomically reserve one unfamiliar-sign-in email alert per account per six hours."""
    now = now or datetime.now(timezone.utc)
    now_iso = now.isoformat()
    cutoff = (now - timedelta(seconds=UNFAMILIAR_SIGN_IN_EMAIL_COOLDOWN_SECONDS)).isoformat()

    if os.getenv("DATABASE_MODE", "").strip().lower() == "mock":
        with _MOCK_ALERT_LOCK:
            recent_claims = (
                supabase.table("auth_security_events")
                .select("id")
                .eq("user_id", str(user_id))
                .eq("event_type", "unfamiliar_sign_in")
                .gte("email_alert_claimed_at", cutoff)
                .is_("email_alert_claimed_at", "not_null")
                .limit(1)
                .execute()
                .data or []
            )
            if recent_claims:
                return False

            updated = (
                supabase.table("auth_security_events")
                .update({"email_alert_claimed_at": now_iso})
                .eq("id", str(event_id))
                .eq("user_id", str(user_id))
                .eq("event_type", "unfamiliar_sign_in")
                .is_("email_alert_claimed_at", "null")
                .execute()
            )
            return bool(updated.data)

    result = supabase.rpc(
        "claim_unfamiliar_sign_in_email_alert",
        {
            "p_user_id": str(user_id),
            "p_event_id": str(event_id),
            "p_now": now_iso,
            "p_cooldown_seconds": UNFAMILIAR_SIGN_IN_EMAIL_COOLDOWN_SECONDS,
        },
    ).execute()
    data = result.data
    if isinstance(data, list):
        value = data[0] if data else False
        if isinstance(value, dict):
            value = next(iter(value.values()), False)
        return bool(value)
    if isinstance(data, dict):
        return bool(next(iter(data.values()), False))
    return bool(data)


def send_unfamiliar_sign_in_email_alert(
    user_id: str,
    user_email: str,
    event: dict,
) -> bool:
    """
    Send a privacy-safe account security alert after an unfamiliar sign-in.

    These are essential security notices and deliberately do not obey optional
    product-notification email preferences.
    """
    email = str(user_email or "").strip()
    event_id = str(event.get("id") or "")
    if not email or not event_id or event.get("event_type") != "unfamiliar_sign_in":
        return False

    if not delivery.is_email_configured():
        delivery.record_delivery(
            user_id=str(user_id),
            channel="email",
            recipient=email,
            status="skipped",
            event_type="unfamiliar_sign_in",
            provider=delivery.get_email_provider_name(),
            error_message="Security alert email provider is not configured.",
        )
        return False

    try:
        claimed = claim_unfamiliar_sign_in_email_alert(user_id, event_id)
    except Exception as exc:
        # Fail closed for sending: do not send an unthrottled security-email burst
        # when the shared database-backed cooldown cannot be checked.
        print(f"Unable to claim unfamiliar sign-in email alert: {type(exc).__name__}")
        return False

    if not claimed:
        return False

    metadata = event.get("metadata") if isinstance(event.get("metadata"), dict) else {}
    signals = set(event.get("signals") or metadata.get("signals") or [])
    reasons = []
    if "new_browser_or_platform" in signals:
        reasons.append("a browser or device type not seen in your recent sign-in history")
    if "new_network" in signals:
        reasons.append("a network not seen in your recent sign-in history")
    reason_text = " and ".join(reasons) if reasons else "an unfamiliar sign-in pattern"
    device_label = str(event.get("device_label") or "Unknown device")[:120]
    happened_at = str(event.get("created_at") or datetime.now(timezone.utc).isoformat())
    app_url = os.getenv("PUBLIC_APP_URL", "https://soet-connect.vercel.app").strip().rstrip("/")
    review_url = f"{app_url}/account/sessions"

    subject = "SOET Connect - New sign-in to your account"
    message = (
        "A new sign-in to your SOET Connect account matched "
        f"{reason_text}.\n\n"
        f"Device or browser: {device_label}\n"
        f"Time (UTC): {happened_at}\n\n"
        "No IP address is included in this alert. A changing mobile network or VPN "
        "can sometimes cause an unfamiliar-network notice.\n\n"
        "If this was you, no action is needed. If you do not recognize this activity, "
        "open Active Sessions, sign out unfamiliar devices, and change your password:\n"
        f"{review_url}\n\n"
        "This is an account security notice and is sent independently of optional "
        "product notification preferences."
    )

    provider = delivery.get_email_provider_name()
    success, provider_message_id, error = delivery.send_email_message(email, subject, message)
    delivery.record_delivery(
        user_id=str(user_id),
        channel="email",
        recipient=email,
        status="accepted" if success else "failed",
        event_type="unfamiliar_sign_in",
        provider=provider,
        provider_message_id=provider_message_id,
        error_message=None if success else (error or "Security alert email delivery failed."),
    )
    if not success:
        print(f"Unfamiliar sign-in alert email delivery failed: {provider}")
    return bool(success)
