from urllib.parse import urlsplit


MAX_EXTERNAL_PROFILE_URL_LENGTH = 2048


def validate_external_profile_url(value: str | None) -> str | None:
    """Validate a profile link as a safe absolute HTTP(S) URL."""
    if value is None:
        return None

    cleaned = value.strip()
    if not cleaned:
        return None

    if len(cleaned) > MAX_EXTERNAL_PROFILE_URL_LENGTH:
        raise ValueError("Profile URL must be 2048 characters or fewer.")

    if any(char.isspace() or ord(char) < 32 or ord(char) == 127 for char in cleaned):
        raise ValueError("Profile URL cannot contain whitespace or control characters.")

    if "\\" in cleaned:
        raise ValueError("Profile URL is invalid.")

    try:
        parsed = urlsplit(cleaned)
        hostname = parsed.hostname
        # Accessing .port also validates malformed and out-of-range ports.
        parsed.port
    except ValueError as exc:
        raise ValueError("Profile URL must contain a valid host and port.") from exc

    if (
        parsed.scheme.lower() not in {"http", "https"}
        or not parsed.netloc
        or not hostname
        or parsed.username is not None
        or parsed.password is not None
    ):
        raise ValueError("Profile URL must be an HTTP or HTTPS URL without embedded credentials.")

    return cleaned


def safe_external_profile_url(value: str | None) -> str:
    """Return a safe profile link, or an empty string for invalid legacy data."""
    try:
        return validate_external_profile_url(value) or ""
    except ValueError:
        return ""
