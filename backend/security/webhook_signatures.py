"""Signature verification for third-party delivery webhooks."""

import base64
import binascii
import hashlib
import hmac
import os
import time
from typing import Mapping


def verify_resend_webhook_signature(
    raw_body: bytes,
    headers: Mapping[str, str],
    secret: str | None = None,
    now: int | None = None,
    tolerance_seconds: int = 300,
) -> bool:
    """Validate Svix/Resend HMAC signature and reject stale/future deliveries."""
    secret_value = (secret if secret is not None else os.getenv("RESEND_WEBHOOK_SECRET", "")).strip()
    if not secret_value.startswith("whsec_"):
        return False

    webhook_id = str(headers.get("svix-id") or "").strip()
    timestamp = str(headers.get("svix-timestamp") or "").strip()
    signatures = str(headers.get("svix-signature") or "").strip()
    if not webhook_id or not timestamp or not signatures:
        return False

    try:
        sent_at = int(timestamp)
        secret_bytes = base64.b64decode(secret_value.removeprefix("whsec_"), validate=True)
    except (ValueError, binascii.Error):
        return False

    current_time = int(time.time()) if now is None else int(now)
    if abs(current_time - sent_at) > tolerance_seconds:
        return False

    signed_payload = webhook_id.encode("utf-8") + b"." + timestamp.encode("ascii") + b"." + raw_body
    expected = base64.b64encode(
        hmac.new(secret_bytes, signed_payload, hashlib.sha256).digest()
    ).decode("ascii")

    # Svix may include multiple signatures during secret rotation.
    for item in signatures.split():
        version, separator, supplied = item.partition(",")
        if separator and version == "v1" and hmac.compare_digest(expected, supplied):
            return True
    return False


def verify_twilio_webhook_signature(
    url: str,
    params,
    signature: str | None,
    auth_token: str | None = None,
) -> bool:
    """Delegate Twilio request authentication to its official SDK validator."""
    token = (auth_token if auth_token is not None else os.getenv("TWILIO_AUTH_TOKEN", "")).strip()
    supplied_signature = str(signature or "").strip()
    if not token or not supplied_signature:
        return False

    try:
        from twilio.request_validator import RequestValidator

        validator = RequestValidator(token)
        return bool(validator.validate(url, params, supplied_signature))
    except Exception:
        return False
