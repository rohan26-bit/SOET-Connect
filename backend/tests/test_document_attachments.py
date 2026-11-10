import base64
import io
import json
import zipfile

import pytest
from pydantic import ValidationError

from routes.jobs import JobCreateRequest
from routes.events import EventCreateRequest, EventUpdateRequest
from routes.announcements import AnnouncementCreateRequest, AnnouncementUpdateRequest
from security.document_attachments import (
    ATTACHMENT_META_END,
    ATTACHMENT_META_START,
    sanitize_document_attachment_text,
    validate_document_attachment_text,
)


def _attachment_text(name: str, kind: str, mime: str, payload: bytes) -> str:
    metadata = {
        "name": name,
        "type": kind,
        "size": len(payload),
        "url": f"data:{mime};base64,{base64.b64encode(payload).decode('ascii')}",
    }
    return (
        "Event or opportunity details"
        + "\n\n"
        + ATTACHMENT_META_START
        + json.dumps(metadata)
        + ATTACHMENT_META_END
    )


def _valid_docx_bytes() -> bytes:
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", "<Types/>")
        archive.writestr("word/document.xml", "<document/>")
    return output.getvalue()


def test_pdf_doc_and_docx_attachments_are_accepted():
    cases = [
        (
            "guide.pdf",
            "PDF",
            "application/pdf",
            b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF",
        ),
        (
            "legacy.doc",
            "DOC",
            "application/msword",
            b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1" + (b"0" * 32),
        ),
        (
            "guide.docx",
            "DOCX",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            _valid_docx_bytes(),
        ),
    ]

    for name, kind, mime, payload in cases:
        text = _attachment_text(name, kind, mime, payload)
        assert validate_document_attachment_text(text) == text
        assert sanitize_document_attachment_text(text) == text


def test_attachment_validation_rejects_html_or_mime_spoofing():
    html_payload = b"<html><script>alert(1)</script></html>"
    disguised_pdf = _attachment_text("guide.pdf", "PDF", "application/pdf", html_payload)
    wrong_mime = _attachment_text("guide.pdf", "PDF", "text/html", html_payload)
    wrong_extension = _attachment_text("guide.pdf", "DOC", "application/msword", html_payload)

    for text in (disguised_pdf, wrong_mime, wrong_extension):
        with pytest.raises(ValueError):
            validate_document_attachment_text(text)


def test_attachment_validation_rejects_bad_metadata_and_size_mismatch():
    payload = b"%PDF-1.4\n%%EOF"
    metadata = {
        "name": "guide.pdf",
        "type": "PDF",
        "size": len(payload) + 1,
        "url": f"data:application/pdf;base64,{base64.b64encode(payload).decode('ascii')}",
    }
    text = ATTACHMENT_META_START + json.dumps(metadata) + ATTACHMENT_META_END

    with pytest.raises(ValueError):
        validate_document_attachment_text(text)

    malformed = "Description\n" + ATTACHMENT_META_START + "{not-json}" + ATTACHMENT_META_END
    with pytest.raises(ValueError):
        validate_document_attachment_text(malformed)


def test_docx_validation_rejects_zip_slip_entries():
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", "<Types/>")
        archive.writestr("word/document.xml", "<document/>")
        archive.writestr("../outside.txt", "not allowed")
    payload = output.getvalue()
    text = _attachment_text(
        "guide.docx",
        "DOCX",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        payload,
    )

    with pytest.raises(ValueError):
        validate_document_attachment_text(text)


def test_invalid_legacy_attachment_metadata_is_removed_before_display():
    unsafe = (
        "Details before attachment\n"
        + ATTACHMENT_META_START
        + json.dumps({
            "name": "guide.pdf",
            "type": "PDF",
            "size": 10,
            "url": "data:text/html;base64,PGh0bWw+",
        })
        + ATTACHMENT_META_END
    )

    sanitized = sanitize_document_attachment_text(unsafe)
    assert sanitized == "Details before attachment"
    assert ATTACHMENT_META_START not in sanitized
    assert "text/html" not in sanitized


def test_job_event_and_announcement_models_validate_embedded_attachments():
    unsafe = _attachment_text(
        "guide.pdf",
        "PDF",
        "application/pdf",
        b"<html><script>alert(1)</script></html>",
    )

    with pytest.raises(ValidationError):
        JobCreateRequest(
            title="Job",
            company="Example",
            description=unsafe,
            location="Remote",
            employment_type="full-time",
        )

    with pytest.raises(ValidationError):
        EventCreateRequest(title="Event", description=unsafe)

    with pytest.raises(ValidationError):
        EventUpdateRequest(description=unsafe)

    with pytest.raises(ValidationError):
        AnnouncementCreateRequest(title="Announcement", content=unsafe)

    with pytest.raises(ValidationError):
        AnnouncementUpdateRequest(content=unsafe)


def test_job_event_and_announcement_models_accept_valid_pdf_attachment():
    valid = _attachment_text(
        "guide.pdf",
        "PDF",
        "application/pdf",
        b"%PDF-1.4\n%%EOF",
    )

    job = JobCreateRequest(
        title="Job",
        company="Example",
        description=valid,
        location="Remote",
        employment_type="full-time",
    )
    event = EventCreateRequest(title="Event", description=valid)
    announcement = AnnouncementCreateRequest(title="Announcement", content=valid)

    assert job.description == valid
    assert event.description == valid
    assert announcement.content == valid
