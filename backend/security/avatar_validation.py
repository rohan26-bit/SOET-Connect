import base64
import binascii
import io
import re
from urllib.parse import urlparse

from PIL import Image


MAX_AVATAR_BYTES = 2 * 1024 * 1024
MAX_AVATAR_PIXELS = 16_000_000

_ALLOWED_IMAGE_FORMATS = {
    "image/jpeg": "JPEG",
    "image/png": "PNG",
    "image/webp": "WEBP",
}
_DATA_URI_PATTERN = re.compile(
    r"^data:(image/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$",
    re.IGNORECASE,
)


def validate_avatar_url(value: str | None) -> str | None:
    """
    Validate an avatar value before it is persisted or returned to browsers.

    Uploaded avatars must be small, single-frame JPEG/PNG/WebP data URIs whose
    declared MIME type matches the decoded image format. Remote avatar URLs
    remain supported for compatibility, but must use HTTPS and cannot embed
    credentials.
    """
    if value is None:
        return None

    trimmed = value.strip()
    if not trimmed:
        raise ValueError("Avatar URL cannot be empty.")

    if any(ord(char) < 32 for char in trimmed):
        raise ValueError("Avatar URL contains invalid control characters.")

    if trimmed.lower().startswith("data:"):
        match = _DATA_URI_PATTERN.fullmatch(trimmed)
        if not match:
            raise ValueError("Avatar data must be a base64 JPEG, PNG, or WebP image.")

        declared_mime = match.group(1).lower()
        encoded_payload = match.group(2)
        max_encoded_length = ((MAX_AVATAR_BYTES + 2) // 3) * 4
        if len(encoded_payload) > max_encoded_length:
            raise ValueError("Avatar image exceeds the maximum allowed size of 2 MB.")

        try:
            image_bytes = base64.b64decode(encoded_payload, validate=True)
        except (binascii.Error, ValueError) as exc:
            raise ValueError("Avatar image contains invalid base64 data.") from exc

        if not image_bytes or len(image_bytes) > MAX_AVATAR_BYTES:
            raise ValueError("Avatar image exceeds the maximum allowed size of 2 MB.")

        expected_format = _ALLOWED_IMAGE_FORMATS[declared_mime]
        try:
            with Image.open(io.BytesIO(image_bytes)) as image:
                detected_format = image.format
                width, height = image.size
                frame_count = getattr(image, "n_frames", 1)
                image.verify()

            if detected_format != expected_format:
                raise ValueError("Avatar MIME type does not match the actual image format.")
            if width <= 0 or height <= 0 or width * height > MAX_AVATAR_PIXELS:
                raise ValueError("Avatar image resolution exceeds the maximum supported size.")
            if frame_count != 1:
                raise ValueError("Animated avatar images are not supported.")
        except ValueError:
            raise
        except Exception as exc:
            raise ValueError("Avatar data is not a valid supported image.") from exc

        return trimmed

    parsed = urlparse(trimmed)
    if (
        parsed.scheme.lower() == "https"
        and parsed.hostname
        and not parsed.username
        and not parsed.password
    ):
        try:
            parsed.port
        except ValueError as exc:
            raise ValueError("Avatar URL contains an invalid port.") from exc
        return trimmed

    raise ValueError("Avatar URL must be a valid HTTPS URL or a JPEG, PNG, or WebP image data URI.")
