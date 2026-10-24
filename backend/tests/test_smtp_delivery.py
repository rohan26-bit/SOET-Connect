import os
import smtplib
import socket
from unittest.mock import MagicMock, patch

import pytest
from database import supabase
from services import delivery
from services.password_recovery import request_password_reset
from configure_notifications import (
    validate_gmail_smtp_credentials,
    send_test_email_smtp,
)


@pytest.fixture(autouse=True)
def clean_mock_tables():
    """Ensure mock database tables are clean for each test."""
    if hasattr(supabase, "_mock_store"):
        for table in ["notification_deliveries", "password_reset_challenges"]:
            if table in supabase._mock_store:
                supabase._mock_store[table].clear()
    yield


# ==============================================================================
# 1. Configuration detection and provider priority tests
# ==============================================================================

def test_is_smtp_configured_with_smtp_vars(monkeypatch):
    """is_smtp_configured returns True when SMTP_USER and SMTP_PASSWORD are set."""
    monkeypatch.setenv("SMTP_USER", "alumni.portal@gmail.com")
    monkeypatch.setenv("SMTP_PASSWORD", "abcd efgh ijkl mnop")
    assert delivery.is_smtp_configured() is True


def test_is_smtp_configured_with_gmail_vars(monkeypatch):
    """is_smtp_configured returns True when GMAIL_USER and GMAIL_APP_PASSWORD are set."""
    monkeypatch.delenv("SMTP_USER", raising=False)
    monkeypatch.delenv("SMTP_PASSWORD", raising=False)
    monkeypatch.setenv("GMAIL_USER", "alumni.portal@gmail.com")
    monkeypatch.setenv("GMAIL_APP_PASSWORD", "abcdefghijklmnop")
    assert delivery.is_smtp_configured() is True


def test_is_smtp_configured_missing_vars(monkeypatch):
    """is_smtp_configured returns False when user or password is missing."""
    monkeypatch.delenv("SMTP_USER", raising=False)
    monkeypatch.delenv("GMAIL_USER", raising=False)
    monkeypatch.setenv("SMTP_PASSWORD", "secret")
    assert delivery.is_smtp_configured() is False

    monkeypatch.setenv("SMTP_USER", "test@gmail.com")
    monkeypatch.delenv("SMTP_PASSWORD", raising=False)
    monkeypatch.delenv("GMAIL_APP_PASSWORD", raising=False)
    assert delivery.is_smtp_configured() is False


def test_provider_priority_prefers_smtp_over_resend(monkeypatch):
    """When both SMTP and Resend are configured, Gmail SMTP is prioritized."""
    monkeypatch.setenv("SMTP_USER", "alumni@gmail.com")
    monkeypatch.setenv("SMTP_PASSWORD", "abcdefghijklmnop")
    monkeypatch.setenv("RESEND_API_KEY", "re_123456789")

    assert delivery.is_email_configured() is True
    assert delivery.get_email_provider_name() == "smtp_gmail"


def test_provider_priority_falls_back_to_resend(monkeypatch):
    """When SMTP is not configured, delivery falls back to Resend API."""
    monkeypatch.delenv("SMTP_USER", raising=False)
    monkeypatch.delenv("GMAIL_USER", raising=False)
    monkeypatch.delenv("SMTP_PASSWORD", raising=False)
    monkeypatch.delenv("GMAIL_APP_PASSWORD", raising=False)
    monkeypatch.setenv("RESEND_API_KEY", "re_123456789")

    assert delivery.is_email_configured() is True
    assert delivery.get_email_provider_name() == "resend"


def test_provider_unconfigured_when_no_credentials(monkeypatch):
    """When neither SMTP nor Resend is configured, provider is unconfigured."""
    monkeypatch.delenv("SMTP_USER", raising=False)
    monkeypatch.delenv("GMAIL_USER", raising=False)
    monkeypatch.delenv("SMTP_PASSWORD", raising=False)
    monkeypatch.delenv("GMAIL_APP_PASSWORD", raising=False)
    monkeypatch.delenv("RESEND_API_KEY", raising=False)

    assert delivery.is_email_configured() is False
    assert delivery.get_email_provider_name() == "unconfigured"


# ==============================================================================
# 2. SMTP sending logic and TLS mock tests
# ==============================================================================

def test_send_email_via_smtp_tls_port_587(monkeypatch):
    """send_email_via_smtp connects via TLS on port 587, authenticates, and sends multipart message."""
    monkeypatch.setenv("SMTP_USER", "portal@gmail.com")
    monkeypatch.setenv("SMTP_PASSWORD", "abcd efgh ijkl mnop")  # has spaces
    monkeypatch.setenv("SMTP_HOST", "smtp.gmail.com")
    monkeypatch.setenv("SMTP_PORT", "587")
    monkeypatch.setenv("SMTP_FROM_EMAIL", "SOET Connect <portal@gmail.com>")
    # Disable automated test mock guard by providing non-example domain
    recipient = "student@university.edu"

    mock_smtp_instance = MagicMock()
    mock_smtp_class = MagicMock(return_value=mock_smtp_instance)

    with patch("smtplib.SMTP", mock_smtp_class):
        success, msg_id, err = delivery.send_email_via_smtp(
            recipient, "Test Subject", "Test message content"
        )

        assert success is True
        assert msg_id is not None
        assert err is None

        # Verify SMTP server interaction
        mock_smtp_class.assert_called_once_with("smtp.gmail.com", 587, timeout=10.0)
        assert mock_smtp_instance.starttls.called
        # Verify spaces were stripped from App Password
        mock_smtp_instance.login.assert_called_once_with("portal@gmail.com", "abcdefghijklmnop")
        assert mock_smtp_instance.send_message.called
        assert mock_smtp_instance.quit.called

        # Inspect sent message object
        sent_msg = mock_smtp_instance.send_message.call_args[0][0]
        assert sent_msg["To"] == "student@university.edu"
        assert sent_msg["Subject"] == "Test Subject"
        assert "portal@gmail.com" in sent_msg["From"]
        assert sent_msg["Message-ID"] is not None
        assert sent_msg["Date"] is not None


def test_send_email_via_smtp_ssl_port_465(monkeypatch):
    """send_email_via_smtp uses SMTP_SSL when port 465 is configured."""
    monkeypatch.setenv("SMTP_USER", "portal@gmail.com")
    monkeypatch.setenv("SMTP_PASSWORD", "apppassword1234")
    monkeypatch.setenv("SMTP_PORT", "465")
    recipient = "student@university.edu"

    mock_ssl_instance = MagicMock()
    mock_ssl_class = MagicMock(return_value=mock_ssl_instance)

    with patch("smtplib.SMTP_SSL", mock_ssl_class):
        success, msg_id, err = delivery.send_email_via_smtp(
            recipient, "Test Subject SSL", "Test message"
        )

        assert success is True
        assert msg_id is not None
        mock_ssl_class.assert_called_once_with("smtp.gmail.com", 465, timeout=10.0)
        mock_ssl_instance.login.assert_called_once_with("portal@gmail.com", "apppassword1234")
        assert mock_ssl_instance.send_message.called
        assert mock_ssl_instance.quit.called


def test_send_email_via_smtp_auth_failure(monkeypatch):
    """SMTP authentication failure returns clear guidance without leaking credentials."""
    monkeypatch.setenv("SMTP_USER", "portal@gmail.com")
    monkeypatch.setenv("SMTP_PASSWORD", "wrong_password")
    recipient = "student@university.edu"

    mock_smtp_instance = MagicMock()
    mock_smtp_instance.login.side_effect = smtplib.SMTPAuthenticationError(535, b"5.7.8 Username and Password not accepted")

    with patch("smtplib.SMTP", MagicMock(return_value=mock_smtp_instance)):
        success, msg_id, err = delivery.send_email_via_smtp(
            recipient, "Subject", "Body"
        )

        assert success is False
        assert msg_id is None
        assert "Gmail SMTP authentication failed" in err
        assert "App Password" in err
        # Ensure password is never echoed
        assert "wrong_password" not in err


def test_send_email_via_smtp_connection_timeout(monkeypatch):
    """SMTP connection timeout returns safe error description."""
    monkeypatch.setenv("SMTP_USER", "portal@gmail.com")
    monkeypatch.setenv("SMTP_PASSWORD", "abcdefghijklmnop")
    recipient = "student@university.edu"

    with patch("smtplib.SMTP", side_effect=socket.timeout("Timed out")):
        success, msg_id, err = delivery.send_email_via_smtp(
            recipient, "Subject", "Body"
        )

        assert success is False
        assert msg_id is None
        assert "connection error" in err.lower() or "timeout" in err.lower()


def test_send_email_via_smtp_recipient_refused(monkeypatch):
    """SMTP recipient refused returns appropriate error message."""
    monkeypatch.setenv("SMTP_USER", "portal@gmail.com")
    monkeypatch.setenv("SMTP_PASSWORD", "abcdefghijklmnop")
    recipient = "invalid-user@university.edu"

    mock_smtp_instance = MagicMock()
    mock_smtp_instance.send_message.side_effect = smtplib.SMTPRecipientsRefused({"recipient": (550, b"User unknown")})

    with patch("smtplib.SMTP", MagicMock(return_value=mock_smtp_instance)):
        success, msg_id, err = delivery.send_email_via_smtp(
            recipient, "Subject", "Body"
        )

        assert success is False
        assert msg_id is None
        assert "recipient rejected" in err.lower()


def test_send_email_via_smtp_control_characters_rejected(monkeypatch):
    """send_email_via_smtp rejects passwords containing terminal control characters like Ctrl+V."""
    monkeypatch.setenv("SMTP_USER", "portal@gmail.com")
    monkeypatch.setenv("SMTP_PASSWORD", "\x16")
    recipient = "student@university.edu"

    success, msg_id, err = delivery.send_email_via_smtp(
        recipient, "Subject", "Body"
    )
    assert success is False
    assert msg_id is None
    assert "control characters" in err.lower()


def test_send_email_via_smtp_server_disconnected(monkeypatch):
    """send_email_via_smtp handles SMTPServerDisconnected with clear guidance."""
    monkeypatch.setenv("SMTP_USER", "portal@gmail.com")
    monkeypatch.setenv("SMTP_PASSWORD", "abcdefghijklmnop")
    recipient = "student@university.edu"

    mock_smtp_instance = MagicMock()
    mock_smtp_instance.login.side_effect = smtplib.SMTPServerDisconnected("Connection unexpectedly closed")

    with patch("smtplib.SMTP", MagicMock(return_value=mock_smtp_instance)):
        success, msg_id, err = delivery.send_email_via_smtp(
            recipient, "Subject", "Body"
        )

        assert success is False
        assert msg_id is None
        assert "closed by server" in err.lower()
        assert "16-character" in err.lower()


def test_send_email_message_routes_to_smtp_when_configured(monkeypatch):
    """send_email_message routes to send_email_via_smtp when SMTP is configured."""
    monkeypatch.setenv("SMTP_USER", "portal@gmail.com")
    monkeypatch.setenv("SMTP_PASSWORD", "password123")
    monkeypatch.setenv("RESEND_API_KEY", "re_fallback_key")

    smtp_called = []
    resend_called = []

    monkeypatch.setattr("services.delivery.send_email_via_smtp", lambda to, subj, msg: smtp_called.append(True) or (True, "smtp_id", None))
    monkeypatch.setattr("services.delivery.send_email_via_resend", lambda to, subj, msg: resend_called.append(True) or (True, "resend_id", None))

    success, msg_id, err = delivery.send_email_message("target@univ.edu", "Subj", "Msg")
    assert success is True
    assert msg_id == "smtp_id"
    assert len(smtp_called) == 1
    assert len(resend_called) == 0


def test_send_email_message_falls_back_to_resend_when_smtp_unconfigured(monkeypatch):
    """send_email_message routes to send_email_via_resend when SMTP is absent."""
    monkeypatch.delenv("SMTP_USER", raising=False)
    monkeypatch.delenv("GMAIL_USER", raising=False)
    monkeypatch.delenv("SMTP_PASSWORD", raising=False)
    monkeypatch.delenv("GMAIL_APP_PASSWORD", raising=False)
    monkeypatch.setenv("RESEND_API_KEY", "re_active_key")

    smtp_called = []
    resend_called = []

    monkeypatch.setattr("services.delivery.send_email_via_smtp", lambda to, subj, msg: smtp_called.append(True) or (True, "smtp_id", None))
    monkeypatch.setattr("services.delivery.send_email_via_resend", lambda to, subj, msg: resend_called.append(True) or (True, "resend_id", None))

    success, msg_id, err = delivery.send_email_message("target@univ.edu", "Subj", "Msg")
    assert success is True
    assert msg_id == "resend_id"
    assert len(smtp_called) == 0
    assert len(resend_called) == 1


# ==============================================================================
# 3. Password recovery integration with Gmail SMTP
# ==============================================================================

def test_password_recovery_with_smtp_success(monkeypatch, verified_alumni_user: dict):
    """Password recovery records 'smtp_gmail' provider and keeps challenge active on success."""
    user_id = str(verified_alumni_user["id"])
    email = verified_alumni_user["email"]

    monkeypatch.setenv("SMTP_USER", "portal@gmail.com")
    monkeypatch.setenv("SMTP_PASSWORD", "secret_pass")
    monkeypatch.setattr(
        "services.delivery.send_email_via_smtp",
        lambda to, subj, msg: (True, "smtp_delivery_msg_001", None),
    )

    success, msg, debug_code = request_password_reset(email, "email")
    assert success is True
    assert debug_code is not None

    # Verify delivery record
    deliveries = supabase.table("notification_deliveries").select("*").eq("user_id", user_id).execute().data
    assert len(deliveries) >= 1
    latest_deliv = sorted(deliveries, key=lambda d: d["created_at"], reverse=True)[0]
    assert latest_deliv["provider"] == "smtp_gmail"
    assert latest_deliv["status"] == "accepted"
    assert latest_deliv["provider_message_id"] == "smtp_delivery_msg_001"

    # Verify challenge remains active for verification
    challenges = supabase.table("password_reset_challenges").select("*").eq("user_id", user_id).execute().data
    active = [c for c in challenges if not c["is_used"]]
    assert len(active) == 1


def test_password_recovery_with_smtp_failure_invalidates_challenge(monkeypatch, verified_alumni_user: dict):
    """When Gmail SMTP delivery fails, challenge is immediately invalidated so user can retry."""
    user_id = str(verified_alumni_user["id"])
    email = verified_alumni_user["email"]

    monkeypatch.setenv("SMTP_USER", "portal@gmail.com")
    monkeypatch.setenv("SMTP_PASSWORD", "secret_pass")
    monkeypatch.setattr(
        "services.delivery.send_email_via_smtp",
        lambda to, subj, msg: (False, None, "Gmail SMTP authentication failed: invalid app password"),
    )

    success, msg, debug_code = request_password_reset(email, "email")
    # Generic message returned to prevent user enumeration
    assert success is True
    assert "code" in msg.lower()

    # Verify delivery record shows failure with smtp_gmail provider
    deliveries = supabase.table("notification_deliveries").select("*").eq("user_id", user_id).execute().data
    latest_deliv = sorted(deliveries, key=lambda d: d["created_at"], reverse=True)[0]
    assert latest_deliv["provider"] == "smtp_gmail"
    assert latest_deliv["status"] == "failed"

    # Challenge must be invalidated
    challenges = supabase.table("password_reset_challenges").select("*").eq("user_id", user_id).execute().data
    active = [c for c in challenges if not c["is_used"]]
    assert len(active) == 0, "Challenge should be invalidated after SMTP failure so user is not stuck"


def test_password_recovery_retry_after_smtp_failure(monkeypatch, verified_alumni_user: dict):
    """User can retry password recovery after SMTP failure; retry creates a fresh valid challenge."""
    user_id = str(verified_alumni_user["id"])
    email = verified_alumni_user["email"]

    monkeypatch.setenv("SMTP_USER", "portal@gmail.com")
    monkeypatch.setenv("SMTP_PASSWORD", "secret_pass")

    # 1. First attempt fails
    monkeypatch.setattr(
        "services.delivery.send_email_via_smtp",
        lambda to, subj, msg: (False, None, "SMTP connection refused"),
    )
    request_password_reset(email, "email")

    challenges_fail = supabase.table("password_reset_challenges").select("*").eq("user_id", user_id).execute().data
    assert all(c["is_used"] for c in challenges_fail)

    # 2. Second attempt succeeds
    monkeypatch.setattr(
        "services.delivery.send_email_via_smtp",
        lambda to, subj, msg: (True, "smtp_retry_ok", None),
    )
    success2, _, debug_code2 = request_password_reset(email, "email")
    assert success2 is True
    assert debug_code2 is not None

    challenges_retry = supabase.table("password_reset_challenges").select("*").eq("user_id", user_id).execute().data
    active = [c for c in challenges_retry if not c["is_used"]]
    assert len(active) == 1


# ==============================================================================
# 4. Notification dispatch integration
# ==============================================================================

def test_dispatch_external_notification_records_smtp_gmail(monkeypatch, verified_alumni_user: dict):
    """dispatch_external_notification records provider 'smtp_gmail' when SMTP is used."""
    user_id = str(verified_alumni_user["id"])

    monkeypatch.setenv("SMTP_USER", "portal@gmail.com")
    monkeypatch.setenv("SMTP_PASSWORD", "pass123")
    monkeypatch.setattr(
        "services.delivery.send_email_via_smtp",
        lambda to, subj, msg: (True, "msg_smtp_alert_01", None),
    )

    results = delivery.dispatch_external_notification(
        user_id=user_id,
        title="Event Notification",
        message="A new alumni event has been posted.",
        event_type="event",
    )
    assert results["email"] == "accepted"

    deliveries = supabase.table("notification_deliveries").select("*").eq("user_id", user_id).execute().data
    latest = sorted(deliveries, key=lambda d: d["created_at"], reverse=True)[0]
    assert latest["provider"] == "smtp_gmail"
    assert latest["status"] == "accepted"


# ==============================================================================
# 5. CLI helper and validation functions tests
# ==============================================================================

def test_validate_gmail_smtp_credentials_success():
    """validate_gmail_smtp_credentials connects, starts TLS, and logs in without sending mail."""
    mock_smtp_inst = MagicMock()
    with patch("smtplib.SMTP", MagicMock(return_value=mock_smtp_inst)):
        ok, msg = validate_gmail_smtp_credentials(
            user="user@gmail.com",
            password="abcd efgh ijkl mnop",  # test space stripping
            host="smtp.gmail.com",
            port=587,
        )
        assert ok is True
        assert "verified successfully" in msg
        assert mock_smtp_inst.starttls.called
        mock_smtp_inst.login.assert_called_once_with("user@gmail.com", "abcdefghijklmnop")
        assert not mock_smtp_inst.send_message.called
        assert mock_smtp_inst.quit.called


def test_validate_gmail_smtp_credentials_auth_failure():
    """validate_gmail_smtp_credentials provides actionable error on authentication failure."""
    mock_smtp_inst = MagicMock()
    mock_smtp_inst.login.side_effect = smtplib.SMTPAuthenticationError(535, b"Auth failed")

    with patch("smtplib.SMTP", MagicMock(return_value=mock_smtp_inst)):
        ok, msg = validate_gmail_smtp_credentials(
            user="user@gmail.com",
            password="wrong_password",
            host="smtp.gmail.com",
            port=587,
        )
        assert ok is False
        assert "2-Step Verification" in msg
        assert "App Password" in msg


def test_validate_gmail_smtp_credentials_connection_failure():
    """validate_gmail_smtp_credentials handles connection error cleanly."""
    with patch("smtplib.SMTP", side_effect=smtplib.SMTPConnectError(421, b"Service unavailable")):
        ok, msg = validate_gmail_smtp_credentials(
            user="user@gmail.com",
            password="abcdefghijklmnop",
            host="smtp.gmail.com",
            port=587,
        )
        assert ok is False
        assert "Failed to connect" in msg


def test_validate_gmail_smtp_credentials_control_char():
    """validate_gmail_smtp_credentials catches Ctrl+V control character without network call."""
    ok, msg = validate_gmail_smtp_credentials(
        user="user@gmail.com",
        password="\x16",
        host="smtp.gmail.com",
        port=587,
    )
    assert ok is False
    assert "control characters" in msg.lower()


def test_validate_gmail_smtp_credentials_short_password():
    """validate_gmail_smtp_credentials rejects passwords that are too short."""
    ok, msg = validate_gmail_smtp_credentials(
        user="user@gmail.com",
        password="short",
        host="smtp.gmail.com",
        port=587,
    )
    assert ok is False
    assert "too short" in msg.lower()


def test_validate_gmail_smtp_credentials_server_disconnected():
    """validate_gmail_smtp_credentials gives clear guidance when server closes connection."""
    mock_smtp_inst = MagicMock()
    mock_smtp_inst.login.side_effect = smtplib.SMTPServerDisconnected("Connection unexpectedly closed")

    with patch("smtplib.SMTP", MagicMock(return_value=mock_smtp_inst)):
        ok, msg = validate_gmail_smtp_credentials(
            user="user@gmail.com",
            password="abcdefghijklmnop",
            host="smtp.gmail.com",
            port=587,
        )
        assert ok is False
        assert "closed by server" in msg.lower()
        assert "16-character" in msg.lower()


def test_send_test_email_smtp_success():
    """send_test_email_smtp sends a test message and returns success with message ID."""
    mock_smtp_inst = MagicMock()
    with patch("smtplib.SMTP", MagicMock(return_value=mock_smtp_inst)):
        ok, msg = send_test_email_smtp(
            to_email="test.recipient@univ.edu",
            user="user@gmail.com",
            password="abcdefghijklmnop",
            host="smtp.gmail.com",
            port=587,
            from_email="SOET Connect <user@gmail.com>",
        )
        assert ok is True
        assert "sent test email successfully" in msg
        assert mock_smtp_inst.send_message.called
