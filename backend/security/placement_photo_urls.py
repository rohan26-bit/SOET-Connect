import re
from urllib.parse import urlsplit


MAX_PLACEMENT_PHOTO_URL_LENGTH = 2048
_GALLERY_IMAGE_PATH = re.compile(r"^/api/gallery/[A-Za-z0-9_-]{1,128}/image$")


def validate_placement_photo_url(value: str | None) -> str | None:
    """Accept only canonical gallery image paths or absolute HTTPS image URLs."""
    if value is None:
        return None

    cleaned = value.strip()
    if not cleaned:
        return None

    if len(cleaned) > MAX_PLACEMENT_PHOTO_URL_LENGTH:
        raise ValueError("Placement photo URL must be 2048 characters or fewer.")

    if any(char.isspace() or ord(char) < 32 or ord(char) == 127 for char in cleaned):
        raise ValueError("Placement photo URL cannot contain whitespace or control characters.")
    if "\\" in cleaned:
        raise ValueError("Placement photo URL is invalid.")

    if cleaned.startswith("/"):
        if _GALLERY_IMAGE_PATH.fullmatch(cleaned):
            return cleaned
        raise ValueError("Placement photo must use an approved SOET gallery image URL.")

    try:
        parsed = urlsplit(cleaned)
        hostname = parsed.hostname
        parsed.port
    except ValueError as exc:
        raise ValueError("Placement photo URL must contain a valid host and port.") from exc

    if (
        parsed.scheme.lower() != "https"
        or not parsed.netloc
        or not hostname
        or parsed.username is not None
        or parsed.password is not None
    ):
        raise ValueError("Placement photo must use HTTPS or an approved SOET gallery image URL.")

    return cleaned


def sanitize_placement_photo_url(value: str | None) -> str | None:
    """Suppress invalid legacy placement photo URLs before returning API data."""
    try:
        return validate_placement_photo_url(value)
    except ValueError:
        return None
