"""Secure HttpOnly cookie helpers for the SOET Connect browser session."""

import os
import re

AUTH_COOKIE_NAME = "soet_access_token"
AUTH_COOKIE_MAX_AGE_SECONDS = 24 * 60 * 60
AUTH_COOKIE_PATH = "/api"

_DEFAULT_TRUSTED_ORIGINS = {
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://soet-connect.vercel.app",
}
_PREVIEW_ORIGIN = re.compile(r"^https://soet-connect(?:-[a-z0-9-]+)?\.vercel\.app$", re.IGNORECASE)


def _secure_cookie() -> bool:
    environment = os.getenv("ENVIRONMENT", "").strip().lower()
    return bool(os.getenv("VERCEL")) or environment in {"production", "prod"}


def set_auth_cookie(response, token: str) -> None:
    """Set a host-only, HttpOnly, SameSite=Lax cookie scoped to the API."""
    response.set_cookie(
        key=AUTH_COOKIE_NAME,
        value=token,
        max_age=AUTH_COOKIE_MAX_AGE_SECONDS,
        httponly=True,
        secure=_secure_cookie(),
        samesite="lax",
        path=AUTH_COOKIE_PATH,
    )


def clear_auth_cookie(response) -> None:
    """Expire the same cookie attributes used when setting the browser session."""
    response.delete_cookie(
        key=AUTH_COOKIE_NAME,
        path=AUTH_COOKIE_PATH,
        httponly=True,
        secure=_secure_cookie(),
        samesite="lax",
    )


def is_trusted_origin(origin: str | None) -> bool:
    """Return whether an Origin is part of the app's same-site frontend origins."""
    if not origin:
        return False

    normalized = origin.strip().rstrip("/")
    trusted = set(_DEFAULT_TRUSTED_ORIGINS)
    trusted.update(
        item.strip().rstrip("/")
        for item in os.getenv("ALLOWED_ORIGINS", "").split(",")
        if item.strip()
    )
    return normalized in trusted or bool(_PREVIEW_ORIGIN.fullmatch(normalized))
