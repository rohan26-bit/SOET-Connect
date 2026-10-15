import io
import os
import uuid
from typing import Tuple, Optional
from PIL import Image, ImageDraw, ImageFont

MAX_IMAGE_SIZE_BYTES = 8 * 1024 * 1024  # 8 MB
ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/webp"}
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}


def validate_image_file(file_bytes: bytes, filename: str, content_type: Optional[str] = None) -> Tuple[str, str, int, int]:
    """
    Validate image file size, extension, MIME type, and actual image stream integrity.
    Returns: (sanitized_extension, detected_mime_type, width, height)
    Raises: ValueError with a descriptive error message on validation failure.
    """
    if not file_bytes or len(file_bytes) == 0:
        raise ValueError("Uploaded file is empty.")

    if len(file_bytes) > MAX_IMAGE_SIZE_BYTES:
        raise ValueError("File exceeds maximum allowed size of 8 MB.")

    # Extension check
    _, ext = os.path.splitext(filename.lower())
    if ext not in ALLOWED_EXTENSIONS:
        raise ValueError(f"Unsupported file format '{ext}'. Allowed formats: JPEG, PNG, WebP.")

    # MIME check if provided
    if content_type:
        clean_mime = content_type.lower().split(";")[0].strip()
        if clean_mime not in ALLOWED_MIME_TYPES:
            raise ValueError(f"Unsupported MIME type '{clean_mime}'. Allowed: image/jpeg, image/png, image/webp.")

    # Verify actual image content with Pillow
    try:
        with Image.open(io.BytesIO(file_bytes)) as img:
            img.verify()
    except Exception as e:
        raise ValueError("Malformed or corrupted image file.") from e

    # Re-open after verify() to get dimensions and format
    with Image.open(io.BytesIO(file_bytes)) as img:
        width, height = img.size
        detected_format = (img.format or "").upper()
        if detected_format not in {"JPEG", "PNG", "WEBP"}:
            raise ValueError(f"Detected unsupported image format: {detected_format}")

    canonical_ext = ".jpg" if ext in {".jpg", ".jpeg"} else ext
    detected_mime = "image/jpeg" if canonical_ext == ".jpg" else f"image/{canonical_ext.lstrip('.')}"

    return canonical_ext, detected_mime, width, height


def generate_watermarked_display(image_bytes: bytes, max_dim: int = 1600) -> bytes:
    """
    Generate a resized, compressed, watermarked WebP derivative for secure view-only serving.
    - Preserves aspect ratio with max dimension <= max_dim.
    - Adds an official semi-transparent watermark: 'SOET Connect - Alumni Portal'.
    - Encodes to WebP (quality 85) for optimal performance and security.
    """
    with Image.open(io.BytesIO(image_bytes)) as original:
        # Convert paletted or grayscale to RGBA for clean watermarking
        img = original.convert("RGBA")

        # Resize if dimensions exceed max_dim
        width, height = img.size
        if width > max_dim or height > max_dim:
            if width >= height:
                new_width = max_dim
                new_height = max(1, int(height * (max_dim / width)))
            else:
                new_height = max_dim
                new_width = max(1, int(width * (max_dim / height)))
            img = img.resize((new_width, new_height), Image.Resampling.LANCZOS)
            width, height = img.size

        # Create watermark overlay layer
        overlay = Image.new("RGBA", (width, height), (0, 0, 0, 0))
        draw = ImageDraw.Draw(overlay)

        watermark_text = "SOET Connect - Alumni Portal"
        # Determine appropriate font size based on image width
        font_size = max(16, int(width * 0.024))
        try:
            # Try default or standard scalable font if available
            font = ImageFont.load_default()
        except Exception:
            font = None

        # Compute text position (bottom-right corner with padding)
        padding_x = max(15, int(width * 0.03))
        padding_y = max(15, int(height * 0.03))

        # Use textbbox if available (Pillow 9.2+)
        if hasattr(draw, "textbbox"):
            bbox = draw.textbbox((0, 0), watermark_text, font=font)
            text_w = bbox[2] - bbox[0]
            text_h = bbox[3] - bbox[1]
        else:
            text_w = len(watermark_text) * 7
            text_h = 16

        x = width - text_w - padding_x
        y = height - text_h - padding_y

        # Draw subtle pill background for readability
        bg_padding = 6
        draw.rectangle(
            [x - bg_padding, y - bg_padding, x + text_w + bg_padding, y + text_h + bg_padding],
            fill=(15, 23, 42, 120),  # Dark semi-transparent slate
        )
        # Draw white watermark text with transparency
        draw.text((x, y), watermark_text, fill=(255, 255, 255, 210), font=font)

        # Composite watermark onto image
        watermarked = Image.alpha_composite(img, overlay)

        # Save to WebP in memory
        output_io = io.BytesIO()
        watermarked.save(output_io, format="WEBP", quality=85, method=4)
        return output_io.getvalue()
