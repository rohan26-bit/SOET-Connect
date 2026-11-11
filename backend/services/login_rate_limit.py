"""Database-backed, privacy-preserving login throttling.

Production state lives in Supabase so limits are shared across Vercel instances.
The mock implementation is only for isolated tests and local mock mode.
"""
from __future__ import annotations

import hashlib
import hmac
import ipaddress
import math
import os
import threading
from datetime import datetime, timedelta, timezone
from typing import Any

from database import supabase


# Thresholds count failed credential checks, not successful sign-ins.
# The account/IP pair limit stops one source guessing one account; the global
# account limit protects an account across sources; the IP limit limits sprays.
ACCOUNT_IP_MAX_ATTEMPTS = 8
ACCOUNT_MAX_ATTEMPTS = 25
IP_MAX_ATTEMPTS = 120
WINDOW_SECONDS = 15 * 60
LOCK_SECONDS = 15 * 60

_MOCK_LOCK = threading.RLock()
_MOCK_BUCKETS: dict[str, dict[str, Any]] = {}


def reset_mock_login_rate_limits() -> None:
    """Clear mock-only rate-limit state between isolated tests."""
    with _MOCK_LOCK:
        _MOCK_BUCKETS.clear()


def get_client_ip(request: Any) -> str:
    """Resolve the client IP, trusting Vercel's overwritten forwarding header only there."""
    forwarded = None
    is_vercel = os.getenv("VERCEL", "").strip().lower() in {"1", "true", "yes"}

    if is_vercel:
        forwarded = (
            request.headers.get("x-forwarded-for")
            or request.headers.get("x-vercel-forwarded-for")
            or request.headers.get("x-real-ip")
        )

    candidate = (forwarded or "").split(",", 1)[0].strip()
    if not candidate:
        client = getattr(request, "client", None)
        candidate = str(getattr(client, "host", "") or "").strip()

    if not candidate:
        candidate = "unknown"

    try:
        address = ipaddress.ip_address(candidate)
        # Group IPv6 privacy addresses within their /64 network so rotating
        # interface identifiers does not trivially evade the per-IP bucket.
        if isinstance(address, ipaddress.IPv6Address):
            return f"{ipaddress.ip_network(f'{address}/64', strict=False).network_address.compressed}/64"
        return address.compressed
    except ValueError:
        # Do not persist arbitrary header content; only a short, safe fallback.
        return "unknown"


def _fingerprint(kind: str, value: str) -> str:
    secret = (
        os.getenv("LOGIN_RATE_LIMIT_SECRET", "").strip()
        or os.getenv("JWT_SECRET_KEY", "").strip()
    )
    if not secret:
        raise RuntimeError("Login rate-limit secret is not configured.")

    message = f"soet-connect:login-rate-limit:v1:{kind}:{value}".encode("utf-8")
    return hmac.new(secret.encode("utf-8"), message, hashlib.sha256).hexdigest()


def _build_keys(email: str, client_ip: str) -> dict[str, str]:
    normalized_email = str(email or "").strip().lower()
    normalized_ip = str(client_ip or "unknown").strip().lower() or "unknown"

    account_key = _fingerprint("account", normalized_email)
    ip_key = _fingerprint("ip", normalized_ip)
    pair_key = _fingerprint("account-ip", f"{normalized_email}\x00{normalized_ip}")

    return {
        "account_key": account_key,
        "ip_key": ip_key,
        "pair_key": pair_key,
    }


def _retry_after(blocked_until: datetime, now: datetime) -> int:
    if blocked_until.tzinfo is None:
        blocked_until = blocked_until.replace(tzinfo=timezone.utc)
    return max(1, math.ceil((blocked_until - now).total_seconds()))


def _mock_check(keys: dict[str, str], now: datetime) -> dict[str, Any]:
    with _MOCK_LOCK:
        active_blocks = [
            bucket["blocked_until"]
            for key in keys.values()
            if (bucket := _MOCK_BUCKETS.get(key))
            and bucket.get("blocked_until")
            and bucket["blocked_until"] > now
        ]
    if not active_blocks:
        return {"blocked": False, "retry_after_seconds": 0}
    return {
        "blocked": True,
        "retry_after_seconds": max(_retry_after(value, now) for value in active_blocks),
    }


def _rpc_row(result: Any) -> dict[str, Any]:
    data = getattr(result, "data", None)
    if isinstance(data, list) and data and isinstance(data[0], dict):
        return data[0]
    if isinstance(data, dict):
        return data
    raise RuntimeError("Login rate-limit database function returned an empty response.")


def check_login_rate_limit(email: str, client_ip: str) -> dict[str, Any]:
    """Check account, account/IP-pair, and IP blocks before password verification."""
    keys = _build_keys(email, client_ip)
    now = datetime.now(timezone.utc)

    if os.getenv("DATABASE_MODE", "").strip().lower() == "mock":
        return _mock_check(keys, now)

    try:
        result = supabase.rpc(
            "check_login_rate_limit",
            {
                "p_account_key_hash": keys["account_key"],
                "p_ip_key_hash": keys["ip_key"],
                "p_account_ip_key_hash": keys["pair_key"],
                "p_now": now.isoformat(),
            },
        ).execute()
        row = _rpc_row(result)
        return {
            "blocked": bool(row.get("is_blocked")),
            "retry_after_seconds": int(row.get("retry_after_seconds") or 0),
        }
    except Exception as exc:
        raise RuntimeError("Unable to check login attempt limits.") from exc


def _mock_bump(
    key: str,
    max_attempts: int,
    now: datetime,
) -> dict[str, Any]:
    bucket = _MOCK_BUCKETS.get(key)
    expired = (
        bucket is None
        or bucket["window_started_at"] <= now - timedelta(seconds=WINDOW_SECONDS)
    )

    if expired:
        attempts = 1
        window_started_at = now
        blocked_until = now + timedelta(seconds=LOCK_SECONDS) if attempts >= max_attempts else None
    else:
        attempts = int(bucket["attempts"]) + 1
        window_started_at = bucket["window_started_at"]
        blocked_until = bucket.get("blocked_until")
        if not blocked_until or blocked_until <= now:
            blocked_until = now + timedelta(seconds=LOCK_SECONDS) if attempts >= max_attempts else None

    updated = {
        "attempts": attempts,
        "window_started_at": window_started_at,
        "blocked_until": blocked_until,
        "updated_at": now,
    }
    _MOCK_BUCKETS[key] = updated
    return updated


def record_login_failure(email: str, client_ip: str) -> dict[str, Any]:
    """Atomically record a failed login in the account, IP, and pair buckets."""
    keys = _build_keys(email, client_ip)
    now = datetime.now(timezone.utc)

    if os.getenv("DATABASE_MODE", "").strip().lower() == "mock":
        with _MOCK_LOCK:
            account = _mock_bump(keys["account_key"], ACCOUNT_MAX_ATTEMPTS, now)
            pair = _mock_bump(keys["pair_key"], ACCOUNT_IP_MAX_ATTEMPTS, now)
            ip = _mock_bump(keys["ip_key"], IP_MAX_ATTEMPTS, now)
        blocks = [
            value["blocked_until"]
            for value in (account, pair, ip)
            if value.get("blocked_until") and value["blocked_until"] > now
        ]
        return {
            "blocked": bool(blocks),
            "retry_after_seconds": max((_retry_after(value, now) for value in blocks), default=0),
        }

    try:
        result = supabase.rpc(
            "record_login_failure",
            {
                "p_account_key_hash": keys["account_key"],
                "p_ip_key_hash": keys["ip_key"],
                "p_account_ip_key_hash": keys["pair_key"],
                "p_now": now.isoformat(),
                "p_window_seconds": WINDOW_SECONDS,
                "p_lock_seconds": LOCK_SECONDS,
                "p_account_max_attempts": ACCOUNT_MAX_ATTEMPTS,
                "p_ip_max_attempts": IP_MAX_ATTEMPTS,
                "p_account_ip_max_attempts": ACCOUNT_IP_MAX_ATTEMPTS,
            },
        ).execute()
        row = _rpc_row(result)
        return {
            "blocked": bool(row.get("is_blocked")),
            "retry_after_seconds": int(row.get("retry_after_seconds") or 0),
        }
    except Exception as exc:
        raise RuntimeError("Unable to record failed login attempt.") from exc



# Password recovery has a per-account send quota as well. This source-wide
# bucket prevents one IP from bypassing that quota by cycling through many
# different account identifiers.
PASSWORD_RESET_IP_MAX_REQUESTS = 10
_PASSWORD_RESET_IP_WINDOW_SECONDS = WINDOW_SECONDS
PASSWORD_RESET_IP_LOCK_SECONDS = LOCK_SECONDS
_PASSWORD_RESET_IP_MAX_ATTEMPTS = PASSWORD_RESET_IP_MAX_REQUESTS + 1


def record_password_reset_request(client_ip: str) -> dict[str, Any]:
    """Count one password-reset request in a shared, privacy-preserving IP bucket.

    The request is counted before account lookup, including for unknown
    identifiers, so account enumeration does not bypass source throttling.
    Ten requests per IP are allowed in each 15-minute window; the next request
    receives a 15-minute block.
    """
    normalized_ip = str(client_ip or "unknown").strip().lower() or "unknown"
    key = _fingerprint("password-reset-ip", normalized_ip)
    now = datetime.now(timezone.utc)

    if os.getenv("DATABASE_MODE", "").strip().lower() == "mock":
        with _MOCK_LOCK:
            bucket = _mock_bump(key, _PASSWORD_RESET_IP_MAX_ATTEMPTS, now)
        blocked_until = bucket.get("blocked_until")
        blocked = bool(blocked_until and blocked_until > now)
        return {
            "blocked": blocked,
            "retry_after_seconds": _retry_after(blocked_until, now) if blocked else 0,
            "attempts": int(bucket.get("attempts") or 0),
        }

    try:
        result = supabase.rpc(
            "record_password_reset_ip_attempt",
            {
                "p_key_hash": key,
                "p_now": now.isoformat(),
            },
        ).execute()
        row = _rpc_row(result)
        return {
            "blocked": bool(row.get("is_blocked")),
            "retry_after_seconds": int(row.get("retry_after_seconds") or 0),
            "attempts": int(row.get("attempts") or 0),
        }
    except Exception as exc:
        raise RuntimeError("Unable to record password recovery request limit.") from exc


def clear_login_account_failures(email: str, client_ip: str) -> None:
    """Clear account and account/IP history after correct credentials; retain the IP bucket."""
    keys = _build_keys(email, client_ip)

    if os.getenv("DATABASE_MODE", "").strip().lower() == "mock":
        with _MOCK_LOCK:
            _MOCK_BUCKETS.pop(keys["account_key"], None)
            _MOCK_BUCKETS.pop(keys["pair_key"], None)
        return

    try:
        supabase.rpc(
            "clear_login_account_failures",
            {
                "p_account_key_hash": keys["account_key"],
                "p_account_ip_key_hash": keys["pair_key"],
            },
        ).execute()
    except Exception as exc:
        raise RuntimeError("Unable to clear successful login attempt history.") from exc
