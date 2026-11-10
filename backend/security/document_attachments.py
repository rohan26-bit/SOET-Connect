import base64
import binascii
import io
import json
import re
import zipfile
from pathlib import PurePosixPath


MAX_DOCUMENT_BYTES = 10 * 1024 * 1024
MAX_DOCX_ENTRIES = 2000
MAX_DOCX_UNCOMPRESSED_BYTES = 50 * 1024 * 1024
ATTACHMENT_META_START = "<!--__SOET_ATTACHMENT_META_START__"
ATTACHMENT_META_END = "__SOET_ATTACHMENT_META_END__-->"

_ALLOWED_DOCUMENTS = {
    ".pdf": ("PDF", "application/pdf"),
    ".doc": ("DOC", "application/msword"),
    ".docx": (
        "DOCX",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ),
}
_DATA_URI_RE = re.compile(
    r"^data:(application/pdf|application/msword|application/vnd\.openxmlformats-officedocument\\.wordprocessingml\\.document);base64,([A-Za-z0-9+/]+={0,2})$",
    re.IGNORECASE,
)


def _validate_document_file(name: object, kind: object, size: object, data_url: object) -> None:
    if not isinstance(name, str) or not name or len(name) > 255:
        raise ValueError("Attached document name is invalid.")
    if any(ord(char) < 32 for char in name) or "/" in name or "\\" in name:
        raise ValueError("Attached document name is invalid.")

    extension = PurePosixPath(name).suffix.lower()
    expected = _ALLOWED_DOCUMENTS.get(extension)
    if expected is None:
        raise ValueError("Attached document must be a PDF, DOC, or DOCX file.")

    expected_kind, expected_mime = expected
    if not isinstance(kind, str) or kind.strip().upper() != expected_kind:
        raise ValueError("Attached document type does not match its filename.")

    if isinstance(size, bool) or not isinstance(size, int) or size <= 0 or size > MAX_DOCUMENT_BYTES:
        raise ValueError("Attached document must be between 1 byte and 10 MB.")

    if not isinstance(data_url, str) or "," not in data_url:
        raise ValueError("Attached document data is invalid.")
    header, encoded = data_url.split(",", 1)
    if header.lower() != f"data:{expected_mime};base64":
        raise ValueError("Attached document data type does not match its filename.")
    max_encoded_length = ((MAX_DOCUMENT_BYTES + 2) // 3) * 4
    if not encoded or len(encoded) > max_encoded_length:
        raise ValueError("Attached document exceeds the 10 MB size limit.")

    try:
        payload = base64.b64decode(encoded, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ValueError("Attached document contains invalid base64 data.") from exc

    if not payload or len(payload) > MAX_DOCUMENT_BYTES or len(payload) != size:
        raise ValueError("Attached document size does not match its data.")

    if extension == ".pdf":
        if not payload.startswith(b"%PDF-"):
            raise ValueError("Attached file is not a valid PDF document.")
        return

    if extension == ".doc":
        if not payload.startswith(b"\\xd0\\xcf\\x11\\xe0\\xa1\\xb1\\x1a\\xe1"):
            raise ValueError("Attached file is not a valid DOC document.")
        return

    try:
        with zipfile.ZipFile(io.BytesIO(payload)) as archive:
            entries = archive.infolist()
            names = {entry.filename for entry in entries}
            if len(entries) > MAX_DOCX_ENTRIES:
                raise ValueError("Attached DOCX contains too many archive entries.")
            if "[Content_Types].xml" not in names or "word/document.xml" not in names:
                raise ValueError("Attached file is not a valid DOCX document.")

            total_uncompressed = 0
            for entry in entries:
                entry_path = PurePosixPath(entry.filename)
                if entry_path.is_absolute() or ".." in entry_path.parts or entry.flag_bits & 0x1:
                    raise ValueError("Attached DOCX contains an unsafe archive entry.")
                total_uncompressed += entry.file_size
                if total_uncompressed > MAX_DOCX_UNCOMPRESSED_BYTES:
                    raise ValueError("Attached DOCX expands beyond the supported size.")
                if entry.file_size > 0 and entry.compress_size == 0:
                    raise ValueError("Attached DOCX contains an invalid compressed entry.")
                if entry.compress_size > 0 and entry.file_size / entry.compress_size > 200:
                    raise ValueError("Attached DOCX has an unsafe compression ratio.")
    except ValueError:
        raise
    except (OSError, zipfile.BadZipFile, RuntimeError) as exc:
        raise ValueError("Attached file is not a valid DOCX document.") from exc

def validate_document_attachment_text(value: str | None) -> str | None:
    """Validate the shared PDF/DOC/DOCX attachment metadata embedded in text."""
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValueError("Document text must be a string.")

    start = value.find(ATTACHMENT_META_START)
    if start < 0:
        if ATTACHMENT_META_END in value:
            raise ValueError("Attached document metadata is malformed.")
        return value

    end = value.find(ATTACHMENT_META_END, start + len(ATTACHMENT_META_START))
    if end < 0 or value.find(ATTACHMENT_META_START, start + len(ATTACHMENT_META_START)) >= 0:
        raise ValueError("Attached document metadata is malformed.")
    if value.find(ATTACHMENT_META_END, end + len(ATTACHMENT_META_END)) >= 0:
        raise ValueError("Attached document metadata is malformed.")

    raw_metadata = value[start + len(ATTACHMENT_META_START):end]
    try:
        metadata = json.loads(raw_metadata)
    except (TypeError, json.JSONDecodeError) as exc:
        raise ValueError("Attached document metadata is invalid.") from exc

    if not isinstance(metadata, dict):
        raise ValueError("Attached document metadata is invalid.")

    _validate_document_file(
        metadata.get("name"),
        metadata.get("type"),
        metadata.get("size"),
        metadata.get("url"),
    )
    return value


def sanitize_document_attachment_text(value: str | None) -> str | None:
    """Remove invalid legacy attachment metadata before sending text to clients."""
    try:
        return validate_document_attachment_text(value)
    except ValueError:
        if not isinstance(value, str):
            return value
        start = value.find(ATTACHMENT_META_START)
        if start < 0:
            return value
        end = value.find(ATTACHMENT_META_END, start + len(ATTACHMENT_META_START))
        if end < 0:
            return value[:start].rstrip()
        return (value[:start] + value[end + len(ATTACHMENT_META_END):]).strip()
