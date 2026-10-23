#!/usr/bin/env python3
"""
SOET Connect - Alumni Portal: Interactive Email and SMS Configuration Script.

Safely configures and validates Resend and Twilio credentials in backend/.env:
- Prompts for missing credentials with masked input for sensitive tokens.
- Preserves all existing .env settings, line structure, and comments.
- Never prints or exposes secret values.
- Validates credentials against official provider APIs.
- Supports controlled test sending without claiming delivery prematurely.
"""

import argparse
import getpass
import os
import re
import smtplib
import socket
import sys
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formatdate, make_msgid
from pathlib import Path
from typing import Dict, Optional, Tuple

import httpx

# Resolve backend directory and .env location
SCRIPT_DIR = Path(__file__).resolve().parent
if SCRIPT_DIR.name == "backend":
    PROJECT_ROOT = SCRIPT_DIR.parent
    BACKEND_DIR = SCRIPT_DIR
else:
    PROJECT_ROOT = SCRIPT_DIR
    BACKEND_DIR = PROJECT_ROOT / "backend"

ENV_FILE = BACKEND_DIR / ".env"


def normalize_phone(phone: str, default_country: str = "+91") -> str:
    """Normalize phone to standard E.164 format."""
    if not phone:
        return ""
    cleaned = re.sub(r"[^\d+]", "", phone.strip())
    if not cleaned:
        return ""
    if cleaned.startswith("+"):
        return cleaned
    if cleaned.startswith("0") and len(cleaned) == 11:
        cleaned = cleaned[1:]
    if len(cleaned) == 10:
        return f"{default_country}{cleaned}"
    return f"+{cleaned}"


def load_env_entries(env_path: Path) -> Tuple[list, Dict[str, str]]:
    """
    Read .env file preserving exact lines.
    Returns: (lines, dict_of_key_values)
    """
    if not env_path.exists():
        return [], {}
    with open(env_path, "r", encoding="utf-8") as f:
        lines = f.readlines()

    entries: Dict[str, str] = {}
    for line in lines:
        stripped = line.strip()
        if stripped and not stripped.startswith("#") and "=" in stripped:
            k, v = stripped.split("=", 1)
            entries[k.strip()] = v.strip().strip("\"'")
    return lines, entries


def save_env_entries(env_path: Path, new_values: Dict[str, str]) -> None:
    """
    Update or append key-value pairs in .env while strictly preserving
    all other entries, comments, blank lines, and file ordering.
    """
    lines, existing = load_env_entries(env_path)
    keys_to_update = set(new_values.keys())
    updated_lines = []

    for line in lines:
        stripped = line.strip()
        if stripped and not stripped.startswith("#") and "=" in stripped:
            k, _ = stripped.split("=", 1)
            k = k.strip()
            if k in keys_to_update:
                val = new_values[k]
                # Format with quotes if spaces exist or if email display name
                if " " in val or "<" in val:
                    updated_lines.append(f'{k}="{val}"\n')
                else:
                    updated_lines.append(f"{k}={val}\n")
                keys_to_update.remove(k)
                continue
        updated_lines.append(line)

    # Append any remaining new keys at the end
    if keys_to_update:
        if updated_lines and not updated_lines[-1].endswith("\n"):
            updated_lines[-1] += "\n"
        if not any("# Email & SMS Providers" in l for l in updated_lines):
            updated_lines.append("\n# Email & SMS Providers (Resend & Twilio)\n")
        for k in sorted(keys_to_update):
            val = new_values[k]
            if " " in val or "<" in val:
                updated_lines.append(f'{k}="{val}"\n')
            else:
                updated_lines.append(f"{k}={val}\n")

    with open(env_path, "w", encoding="utf-8") as f:
        f.writelines(updated_lines)


def validate_gmail_smtp_credentials(
    user: str,
    password: str,
    host: str = "smtp.gmail.com",
    port: int = 587,
) -> Tuple[bool, str]:
    """
    Verify Gmail SMTP credentials by connecting, establishing TLS, and authenticating.
    Does NOT send an email.
    Safely strips spaces from Google App Passwords.
    Returns: (is_valid: bool, status_message: str)
    """
    if not user:
        return False, "Missing Gmail/SMTP username or email."
    if not password:
        return False, "Missing Gmail/SMTP password or App Password."

    clean_user = user.strip()
    clean_password = password.strip().replace(" ", "")
    clean_host = host.strip() or "smtp.gmail.com"

    if any(ord(c) < 32 for c in clean_password):
        return False, (
            "Invalid Google App Password: input contains terminal control characters (e.g. raw Ctrl+V). "
            "In Windows PowerShell/CMD, right-click to paste or type your 16-character App Password."
        )
    if len(clean_password) < 8:
        return False, (
            f"Invalid Google App Password: length is too short ({len(clean_password)} chars). "
            "A Google App Password must be 16 characters (e.g. 'abcd efgh ijkl mnop')."
        )

    server = None
    try:
        if port == 465:
            server = smtplib.SMTP_SSL(clean_host, port, timeout=10.0)
            server.ehlo()
        else:
            server = smtplib.SMTP(clean_host, port, timeout=10.0)
            server.ehlo()
            server.starttls()
            server.ehlo()

        server.login(clean_user, clean_password)
        return True, f"Gmail SMTP credentials verified successfully for {clean_user} (Host: {clean_host}:{port})."
    except smtplib.SMTPAuthenticationError as e:
        err = (
            "Gmail SMTP authentication failed. "
            "Please ensure 2-Step Verification is enabled on your Google Account and you are using a 16-character App Password (not your normal Google account password). "
            "Create an App Password at: https://myaccount.google.com/apppasswords"
        )
        return False, err
    except smtplib.SMTPServerDisconnected as e:
        err = (
            "Gmail SMTP connection closed by server during authentication. "
            "Google automatically terminates SMTP connections when credentials are not accepted (535 Bad Credentials). "
            "Please ensure 2-Step Verification is enabled and a valid 16-character Google App Password is used. "
            "Create an App Password at: https://myaccount.google.com/apppasswords"
        )
        return False, err
    except (smtplib.SMTPConnectError, socket.timeout, TimeoutError) as e:
        return False, f"Failed to connect to SMTP server {clean_host}:{port}: {e}"
    except Exception as e:
        return False, f"SMTP verification error: {e}"
    finally:
        if server is not None:
            try:
                server.quit()
            except Exception:
                pass


def send_test_email_smtp(
    to_email: str,
    user: str,
    password: str,
    host: str = "smtp.gmail.com",
    port: int = 587,
    from_email: Optional[str] = None,
) -> Tuple[bool, str]:
    """Send a controlled test email via Gmail SMTP."""
    clean_user = user.strip()
    clean_password = password.strip().replace(" ", "")
    clean_host = host.strip() or "smtp.gmail.com"
    raw_from = from_email or clean_user
    formatted_from = raw_from if ("<" in raw_from and ">" in raw_from) else f"SOET Connect - Alumni Portal <{raw_from}>"

    msg = MIMEMultipart("alternative")
    msg["Subject"] = "SOET Connect - Gmail SMTP Verification Test"
    msg["From"] = formatted_from
    msg["To"] = to_email
    msg["Date"] = formatdate(localtime=True)
    msg_id = make_msgid(domain=clean_host if "." in clean_host else "soet-connect.local")
    msg["Message-ID"] = msg_id

    text_content = "This is a controlled verification message from SOET Connect to verify your Gmail SMTP configuration."
    html_content = f"""
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px;">
      <h2 style="color: #1e3a8a; margin-top: 0;">SOET Connect - Alumni Portal</h2>
      <p style="color: #334155; font-size: 15px;">Your Gmail SMTP configuration has been successfully verified.</p>
      <hr style="border: 0; border-top: 1px solid #f1f5f9; margin: 20px 0;" />
      <p style="color: #94a3b8; font-size: 12px;">Automated test notification from {clean_user}.</p>
    </div>
    """
    msg.attach(MIMEText(text_content, "plain", "utf-8"))
    msg.attach(MIMEText(html_content, "html", "utf-8"))

    server = None
    try:
        if port == 465:
            server = smtplib.SMTP_SSL(clean_host, port, timeout=10.0)
            server.ehlo()
        else:
            server = smtplib.SMTP(clean_host, port, timeout=10.0)
            server.ehlo()
            server.starttls()
            server.ehlo()

        server.login(clean_user, clean_password)
        server.send_message(msg)
        return True, f"Gmail SMTP sent test email successfully (Message-ID: {msg_id})."
    except Exception as e:
        return False, f"Gmail SMTP test send failed: {e}"
    finally:
        if server is not None:
            try:
                server.quit()
            except Exception:
                pass


def validate_resend_api_key(api_key: str) -> Tuple[bool, str]:
    """Verify Resend API key against Resend API without sending an email."""
    if not api_key:
        return False, "Missing API key"
    cleaned_key = api_key.strip(" \r\n\t\x1a")
    if cleaned_key.count("re_") == 2 and len(cleaned_key) == 72 and cleaned_key[:36] == cleaned_key[36:]:
        cleaned_key = cleaned_key[:36]
    try:
        headers = {
            "Authorization": f"Bearer {cleaned_key}",
            "Content-Type": "application/json",
        }
        with httpx.Client(timeout=10.0) as client:
            resp = client.get("https://api.resend.com/api-keys", headers=headers)
            if resp.status_code == 200:
                return True, "Resend API key is valid and authorized (Full Access)."
            if resp.status_code == 401:
                try:
                    err_json = resp.json()
                    err_name = err_json.get("name", "")
                    err_msg = err_json.get("message", "")
                    if err_name == "restricted_api_key" or "only send emails" in err_msg.lower():
                        return True, "Resend API key is valid and authorized (Sending emails access)."
                    msg = err_msg or resp.text[:100]
                except Exception:
                    msg = resp.text[:100]
                return False, f"Resend rejected key (HTTP 401): {msg}"
            if resp.status_code == 403:
                # Might be a restricted sending-only key; check /domains
                dom_resp = client.get("https://api.resend.com/domains", headers=headers)
                if dom_resp.status_code == 200:
                    return True, "Resend API key is valid and authorized (Domains/Sending Access)."
                return False, "Resend rejected key (HTTP 403): Forbidden."
            try:
                err_json = resp.json()
                msg = err_json.get("message") or err_json.get("error") or resp.text[:100]
            except Exception:
                msg = resp.text[:100]
            return False, f"Resend rejected key (HTTP {resp.status_code}): {msg}"
    except Exception as e:
        return False, f"Resend connection check failed: {e}"


def mask_phone(phone: str) -> str:
    """Mask phone number for safe diagnostic display without exposing user data."""
    if not phone:
        return ""
    cleaned = phone.strip()
    if len(cleaned) <= 6:
        return "***"
    return f"{cleaned[:4]}****{cleaned[-3:]}"


def validate_twilio_credentials(account_sid: str, auth_token: str, from_number: str) -> Tuple[bool, str]:
    """
    Verify Twilio credentials against Twilio REST API without sending SMS.
    Separates credential validity from trial account sending restrictions.
    """
    if not (account_sid and auth_token):
        return False, "Missing Twilio Account SID or Auth Token"
    try:
        url = f"https://api.twilio.com/2010-04-01/Accounts/{account_sid}.json"
        with httpx.Client(timeout=10.0) as client:
            resp = client.get(url, auth=(account_sid, auth_token))
            if resp.status_code == 200:
                data = resp.json()
                status = data.get("status", "unknown")
                friendly_name = data.get("friendly_name", "Twilio Account")
                acct_type = data.get("type", "Full")
                is_trial = acct_type.lower() == "trial"

                type_note = " (Type: Trial)" if is_trial else ""
                base_msg = f"Twilio credentials verified ({friendly_name}, status: {status}{type_note})."

                if from_number:
                    norm = normalize_phone(from_number)
                    if not norm.startswith("+") or len(norm) < 8:
                        return False, f"{base_msg} But configured 'From' sender is not a valid E.164 phone number."
                    if norm.startswith("+91"):
                        base_msg += f" Note: 'From' sender ({mask_phone(norm)}) appears to be a personal number. Twilio trial accounts require an assigned Twilio phone number."
                    else:
                        base_msg += f" Twilio sender verified: {mask_phone(norm)}."
                else:
                    base_msg += " Note: TWILIO_FROM_NUMBER is not yet configured. Please copy your assigned trial number from the Twilio Console Try out SMS page."

                return True, base_msg

            try:
                err_json = resp.json()
                err_msg = err_json.get("message") or resp.text[:100]
            except Exception:
                err_msg = resp.text[:100]
            return False, f"Twilio rejected credentials (HTTP {resp.status_code}): {err_msg}"
    except Exception as e:
        return False, f"Twilio connection check failed: {e}"


def send_test_email(to_email: str, api_key: str, from_email: str) -> Tuple[bool, str]:
    """Send a controlled test email via Resend API."""
    url = "https://api.resend.com/emails"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    raw_from = from_email or "onboarding@resend.dev"
    formatted_from = raw_from if ("<" in raw_from and ">" in raw_from) else f"SOET Connect - Alumni Portal <{raw_from}>"

    payload = {
        "from": formatted_from,
        "to": [to_email],
        "subject": "SOET Connect - Verification Test Email",
        "text": "This is a controlled verification message from SOET Connect - Alumni Portal to verify your Resend email setup.",
        "html": """
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px;">
          <h2 style="color: #1e3a8a; margin-top: 0;">SOET Connect - Alumni Portal</h2>
          <p style="color: #334155; font-size: 15px;">Your Resend email configuration has been successfully verified.</p>
          <hr style="border: 0; border-top: 1px solid #f1f5f9; margin: 20px 0;" />
          <p style="color: #94a3b8; font-size: 12px;">This is an automated test notification.</p>
        </div>
        """,
    }

    try:
        with httpx.Client(timeout=10.0) as client:
            resp = client.post(url, headers=headers, json=payload)
            if resp.status_code in (200, 201):
                data = resp.json()
                msg_id = data.get("id", "unknown")
                return True, f"Provider accepted email (Provider Message ID: {msg_id})."
            try:
                err = resp.json().get("message") or resp.text[:150]
            except Exception:
                err = resp.text[:150]
            return False, f"Resend API error ({resp.status_code}): {err}"
    except Exception as e:
        return False, f"Email delivery error: {e}"


def send_test_sms(to_phone: str, account_sid: str, auth_token: str, from_number: str) -> Tuple[bool, str]:
    """Send a controlled test custom SMS via Twilio API with strict preflight validation."""
    if not (account_sid and auth_token):
        return False, "Pre-flight validation failed: Twilio Account SID and Auth Token must be configured."
    if not from_number:
        return False, "Pre-flight validation failed: Twilio 'From' phone number is not configured. An assigned Twilio number is required."

    norm_to = normalize_phone(to_phone)
    if not norm_to or len(norm_to) < 8:
        return False, "Pre-flight validation failed: Invalid destination phone format."

    norm_from = normalize_phone(from_number)
    if not norm_from or len(norm_from) < 8:
        return False, "Pre-flight validation failed: Invalid 'From' sender phone format."

    if norm_from == norm_to:
        return False, "Pre-flight validation failed: Twilio sender ('From') and recipient ('To') cannot be identical. The 'From' sender must be your assigned Twilio trial number, and the recipient must be your verified personal number."

    url = f"https://api.twilio.com/2010-04-01/Accounts/{account_sid}/Messages.json"
    data = {
        "From": norm_from,
        "To": norm_to,
        "Body": "SOET Connect: Verification test SMS. Your Twilio configuration is functioning.",
    }

    try:
        with httpx.Client(timeout=10.0) as client:
            resp = client.post(url, auth=(account_sid, auth_token), data=data)
            if resp.status_code in (200, 201):
                res_data = resp.json()
                sid = res_data.get("sid", "unknown")
                return True, f"Provider accepted SMS (Twilio SID: {sid})."
            try:
                err_data = resp.json()
                err_code = err_data.get("code")
                msg = err_data.get("message") or resp.text[:150]
                if err_code == 572006 or "572006" in str(err_code) or "572006" in str(msg):
                    detail = (
                        "Twilio error 572006: Trial accounts reject custom SMS bodies. "
                        "Trial accounts can only use predefined SMS templates; sending custom SOET Connect messages requires an upgraded Twilio account."
                    )
                elif err_code == 572003:
                    detail = (
                        "Twilio error 572003: The configured 'From' number is not an assigned Twilio trial number. "
                        "Trial accounts must send from a Twilio-assigned phone number provisioned in the Twilio Console."
                    )
                elif err_code == 21608:
                    detail = f"Twilio error 21608: Destination number ({mask_phone(norm_to)}) is unverified in your Twilio trial account."
                elif err_code:
                    detail = f"Twilio API error {resp.status_code} (code {err_code}): {msg}"
                else:
                    detail = f"Twilio API error ({resp.status_code}): {msg}"
            except Exception:
                detail = f"Twilio API error ({resp.status_code}): {resp.text[:150]}"
            return False, detail
    except Exception as e:
        return False, f"SMS delivery connection error: {e}"


def send_trial_connectivity_test(
    to_phone: str,
    account_sid: str,
    auth_token: str,
    from_number: str,
    template_name: str = "sms_2fa",
) -> Tuple[bool, str]:
    """
    Controlled trial-connectivity test using a documented predefined template (e.g. 'sms_2fa').
    Strictly validates that sender and recipient are distinct before sending.
    Clearly labeled as a connectivity test only; does NOT test or replace real SOET Connect OTPs or custom notifications.
    Enforces sending at most one message.
    """
    if not (account_sid and auth_token):
        return False, "Pre-flight validation failed: Twilio Account SID and Auth Token must be configured."
    if not from_number:
        return False, "Pre-flight validation failed: Twilio 'From' sender is not configured. Please copy your assigned trial number from the Twilio Console 'Try out SMS' page."

    norm_to = normalize_phone(to_phone)
    if not norm_to or len(norm_to) < 8:
        return False, "Pre-flight validation failed: Invalid destination phone format."

    norm_from = normalize_phone(from_number)
    if not norm_from or len(norm_from) < 8:
        return False, "Pre-flight validation failed: Invalid 'From' sender phone format."

    if norm_from == norm_to:
        return False, "Pre-flight validation failed: Twilio sender ('From') and recipient ('To') cannot be identical. 'From' must be your Twilio trial phone number and 'To' must be your verified personal number."

    print(f"\n[TRIAL CONNECTIVITY TEST] Testing gateway connectivity to Twilio using predefined trial template '{template_name}'...")
    print(f"  Sender (Twilio):    {mask_phone(norm_from)}")
    print(f"  Recipient (User):   {mask_phone(norm_to)}")
    print("NOTE: This is a gateway connectivity test only. It does NOT test actual SOET Connect password-reset OTP codes or custom notification content.")

    url = f"https://api.twilio.com/2010-04-01/Accounts/{account_sid}/Messages.json"
    data = {
        "From": norm_from,
        "To": norm_to,
        "Body": template_name,
    }

    try:
        with httpx.Client(timeout=10.0) as client:
            resp = client.post(url, auth=(account_sid, auth_token), data=data)
            if resp.status_code in (200, 201):
                res_data = resp.json()
                sid = res_data.get("sid", "unknown")
                initial_status = res_data.get("status", "accepted")
                return True, (
                    f"Twilio accepted message for transmission (template: '{template_name}', Twilio SID: {sid}, status: {initial_status}). "
                    "Note: The provider accepted the message into its delivery pipeline. Handset delivery confirmation is pending carrier receipt."
                )

            try:
                err_data = resp.json()
                err_code = err_data.get("code")
                msg = err_data.get("message") or resp.text[:150]
                if err_code == 572006:
                    detail = (
                        f"Twilio error 572006: Trial accounts reject custom SMS bodies. Template '{template_name}' was not accepted by this account."
                    )
                elif err_code == 572003:
                    detail = (
                        "Twilio error 572003: The configured 'From' number is not an assigned Twilio trial number. "
                        "Trial accounts must send from an assigned Twilio phone number."
                    )
                elif err_code == 21608:
                    detail = f"Twilio error 21608: Recipient {mask_phone(norm_to)} is not a verified caller ID in your Twilio trial account."
                elif err_code:
                    detail = f"Twilio API error {resp.status_code} (code {err_code}): {msg}"
                else:
                    detail = f"Twilio API error ({resp.status_code}): {msg}"
            except Exception:
                detail = f"Twilio API error ({resp.status_code}): {resp.text[:150]}"
            return False, detail
    except Exception as e:
        return False, f"Trial test connection error: {e}"


def prompt_for_app_password(prompt_text: str = "  Enter 16-character Google App Password (masked): ") -> str:
    """Safely prompt for Google App Password with terminal paste / control character detection."""
    while True:
        entered = getpass.getpass(prompt_text).strip()
        if not entered:
            return ""
        if any(ord(c) < 32 for c in entered):
            print("  [!] Warning: Raw control character detected (often caused by pressing Ctrl+V in this console).")
            print("      To paste in this console, please right-click the console window, or type the 16 characters.")
            continue
        cleaned = entered.replace(" ", "")
        if len(cleaned) < 8:
            print(f"  [!] Warning: Entered password is too short ({len(cleaned)} chars). A Google App Password has 16 characters.")
            choice = input("      Re-enter password? [Y/n]: ").strip().lower()
            if choice == "n":
                return cleaned
            continue
        return cleaned


def interactive_setup() -> None:
    """Run interactive terminal setup asking only for missing or requested credentials."""
    print("=" * 64)
    print(" SOET Connect — Interactive Email and SMS Configuration")
    print("=" * 64)
    print(f"Target configuration file: {ENV_FILE}")
    print("Existing values and formatting will be strictly preserved.")
    print("Secret inputs are masked and never printed to the screen.")
    print("-" * 64)

    _, current_env = load_env_entries(ENV_FILE)

    smtp_user = current_env.get("SMTP_USER", "") or current_env.get("GMAIL_USER", "")
    smtp_pass = current_env.get("SMTP_PASSWORD", "") or current_env.get("GMAIL_APP_PASSWORD", "")
    smtp_host = current_env.get("SMTP_HOST", "smtp.gmail.com") or "smtp.gmail.com"
    smtp_port = current_env.get("SMTP_PORT", "587") or "587"
    smtp_from = current_env.get("SMTP_FROM_EMAIL", "") or current_env.get("GMAIL_FROM_EMAIL", "")

    resend_key = current_env.get("RESEND_API_KEY", "")
    resend_from = current_env.get("RESEND_FROM_EMAIL", "onboarding@resend.dev")
    twilio_sid = current_env.get("TWILIO_ACCOUNT_SID", "")
    twilio_token = current_env.get("TWILIO_AUTH_TOKEN", "")
    twilio_from = current_env.get("TWILIO_FROM_NUMBER", "")
    twilio_recipient = current_env.get("TWILIO_TEST_RECIPIENT", "")

    new_config: Dict[str, str] = {}

    # --- Gmail SMTP Configuration (Priority 1) ---
    print("\n[1/3] Gmail SMTP Configuration (Free, Recommended)")
    if smtp_user and smtp_pass and not smtp_pass.startswith("your_"):
        print(f"  Status: Gmail SMTP is currently configured for user: {smtp_user}")
        update_s = input("  Do you want to replace Gmail SMTP credentials? [y/N]: ").strip().lower()
        if update_s == "y":
            entered_user = input(f"  Enter Gmail Address [{smtp_user}]: ").strip()
            if entered_user:
                smtp_user = entered_user
                new_config["SMTP_USER"] = smtp_user
            entered_pass = prompt_for_app_password("  Enter 16-character Google App Password (masked): ")
            if entered_pass:
                smtp_pass = entered_pass
                new_config["SMTP_PASSWORD"] = smtp_pass
            entered_from = input(f"  Sender Display Name / From Email [{smtp_from or smtp_user}]: ").strip()
            if entered_from:
                smtp_from = entered_from
                new_config["SMTP_FROM_EMAIL"] = smtp_from
    else:
        print("  Status: Gmail SMTP is unconfigured.")
        print("  To use free Gmail SMTP:")
        print("    1. Enable 2-Step Verification in your Google Account:")
        print("       https://myaccount.google.com/signinoptions/two-step-verification")
        print("    2. Generate a 16-character App Password at:")
        print("       https://myaccount.google.com/apppasswords")
        entered_user = input("  Enter Gmail Address (or press Enter to skip): ").strip()
        if entered_user:
            smtp_user = entered_user
            new_config["SMTP_USER"] = smtp_user
            entered_pass = prompt_for_app_password("  Enter 16-character Google App Password (masked): ")
            if entered_pass:
                smtp_pass = entered_pass
                new_config["SMTP_PASSWORD"] = smtp_pass
                new_config["SMTP_HOST"] = "smtp.gmail.com"
                new_config["SMTP_PORT"] = "587"
                entered_from = input(f"  Sender Display Name / From Email [{smtp_user}]: ").strip()
                smtp_from = entered_from or smtp_user
                new_config["SMTP_FROM_EMAIL"] = smtp_from

    # --- Resend Configuration (Fallback) ---
    print("\n[2/3] Resend Email Configuration (Fallback)")
    if resend_key and not resend_key.startswith("your_"):
        print("  Status: Resend API Key is currently configured.")
        update_r = input("  Do you want to replace the current Resend API Key? [y/N]: ").strip().lower()
        if update_r == "y":
            entered_key = getpass.getpass("  Enter new Resend API Key (re_...): ").strip()
            if entered_key:
                resend_key = entered_key
                new_config["RESEND_API_KEY"] = resend_key
    else:
        print("  Status: Resend API Key is missing.")
        print("  Get your key at: https://resend.com/api-keys")
        entered_key = getpass.getpass("  Enter Resend API Key (masked, or press Enter to skip): ").strip()
        if entered_key:
            resend_key = entered_key
            new_config["RESEND_API_KEY"] = resend_key

    if resend_key and not resend_key.startswith("your_"):
        current_from_display = resend_from or "onboarding@resend.dev"
        entered_from = input(f"  Sender Email Address [{current_from_display}]: ").strip()
        if entered_from:
            resend_from = entered_from
        else:
            resend_from = current_from_display
        new_config["RESEND_FROM_EMAIL"] = resend_from

    # --- Twilio Configuration ---
    print("\n[3/3] Twilio SMS Configuration")
    if twilio_sid and twilio_token and not twilio_sid.startswith("your_"):
        print("  Status: Twilio credentials (SID and Auth Token) are configured.")
        update_t = input("  Do you want to replace Twilio SID or Auth Token? [y/N]: ").strip().lower()
        if update_t == "y":
            entered_sid = input("  Enter Twilio Account SID (AC...): ").strip()
            if entered_sid:
                twilio_sid = entered_sid
                new_config["TWILIO_ACCOUNT_SID"] = twilio_sid
            entered_token = getpass.getpass("  Enter Twilio Auth Token (masked): ").strip()
            if entered_token:
                twilio_token = entered_token
                new_config["TWILIO_AUTH_TOKEN"] = twilio_token

        # Prompt for sender (must be Twilio number)
        from_display = twilio_from or "[Not configured — get from Twilio Console Try out SMS page]"
        print(f"  Current Twilio Sender ('From'): {mask_phone(twilio_from) if twilio_from else from_display}")
        entered_from_num = input("  Enter Twilio Sender Number (from Twilio Console, or press Enter to keep): ").strip()
        if entered_from_num:
            twilio_from = normalize_phone(entered_from_num)
            new_config["TWILIO_FROM_NUMBER"] = twilio_from

        # Prompt for verified recipient
        recip_display = mask_phone(twilio_recipient) if twilio_recipient else "[Not configured]"
        print(f"  Current Verified Destination ('To'): {recip_display}")
        entered_recip = input("  Enter Verified Destination Number (e.g. +91XXXXXXXXXX, or press Enter to keep): ").strip()
        if entered_recip:
            twilio_recipient = normalize_phone(entered_recip)
            new_config["TWILIO_TEST_RECIPIENT"] = twilio_recipient
    else:
        print("  Status: Twilio credentials are missing.")
        print("  Find your credentials at: https://console.twilio.com/")
        entered_sid = input("  Enter Twilio Account SID (AC..., or press Enter to skip): ").strip()
        if entered_sid:
            twilio_sid = entered_sid
            new_config["TWILIO_ACCOUNT_SID"] = twilio_sid

            entered_token = getpass.getpass("  Enter Twilio Auth Token (masked): ").strip()
            if entered_token:
                twilio_token = entered_token
                new_config["TWILIO_AUTH_TOKEN"] = twilio_token

            entered_from_num = input("  Enter Twilio Sender Number (from Twilio Console Try out SMS page, e.g. +1...): ").strip()
            if entered_from_num:
                twilio_from = normalize_phone(entered_from_num)
                new_config["TWILIO_FROM_NUMBER"] = twilio_from

            entered_recip = input("  Enter Verified Destination Number (your personal phone, e.g. +91XXXXXXXXXX): ").strip()
            if entered_recip:
                twilio_recipient = normalize_phone(entered_recip)
                new_config["TWILIO_TEST_RECIPIENT"] = twilio_recipient

    # Save to .env if any updates were provided
    if new_config:
        save_env_entries(ENV_FILE, new_config)
        print(f"\n[OK] Configuration safely written to {ENV_FILE}")
    else:
        print("\n[INFO] No changes were made to .env.")

    # --- Validation Section ---
    print("\n" + "=" * 64)
    print(" Credential Validation & Live Verification")
    print("=" * 64)

    # Validate Gmail SMTP
    if smtp_user and smtp_pass and not smtp_pass.startswith("your_"):
        print("\nValidating Gmail SMTP credentials (isolated connection & TLS check)...")
        port_num = 587
        try:
            port_num = int(smtp_port)
        except ValueError:
            pass
        valid_s, msg_s = validate_gmail_smtp_credentials(smtp_user, smtp_pass, smtp_host, port_num)
        if valid_s:
            print(f"  ✓ {msg_s}")
            test_opt = input("  Send a controlled test email via Gmail SMTP now? [y/N]: ").strip().lower()
            if test_opt == "y":
                test_recipient = input("  Enter destination email address: ").strip()
                if test_recipient:
                    ok, send_msg = send_test_email_smtp(test_recipient, smtp_user, smtp_pass, smtp_host, port_num, smtp_from)
                    if ok:
                        print(f"  ✓ {send_msg}")
                    else:
                        print(f"  ✗ Test email send failed: {send_msg}")
        else:
            print(f"  ✗ Gmail SMTP validation failed: {msg_s}")
    else:
        print("\n[SKIP] Gmail SMTP is not configured.")

    # Validate Resend
    if resend_key and not resend_key.startswith("your_"):
        print("\nValidating Resend API key...")
        valid_r, msg_r = validate_resend_api_key(resend_key)
        if valid_r:
            print(f"  ✓ {msg_r}")
            test_opt = input("  Send a controlled test email now? [y/N]: ").strip().lower()
            if test_opt == "y":
                test_recipient = input("  Enter destination email address: ").strip()
                if test_recipient:
                    ok, send_msg = send_test_email(test_recipient, resend_key, resend_from)
                    if ok:
                        print(f"  ✓ {send_msg}")
                        print("  [NOTE] Provider accepted the message for processing. Final delivery depends on mailbox provider.")
                    else:
                        print(f"  ✗ Test email send failed: {send_msg}")
        else:
            print(f"  ✗ Resend validation failed: {msg_r}")
    else:
        print("\n[SKIP] Resend email is not configured.")

    # Validate Twilio
    if twilio_sid and twilio_token and not twilio_sid.startswith("your_"):
        print("\nValidating Twilio credentials (isolated authorization check)...")
        valid_t, msg_t = validate_twilio_credentials(twilio_sid, twilio_token, twilio_from)
        if valid_t:
            print(f"  ✓ {msg_t}")
            print("\n  Twilio Testing Options:")
            print("  1. Standard Custom SMS (requires upgraded account or approved custom sender)")
            print("  2. Trial Connectivity Test (sends predefined template 'sms_2fa' to verified number)")
            print("  3. Skip test send")
            sms_choice = input("  Choose option [1/2/3, default: 3]: ").strip()
            default_to = twilio_recipient or ""
            if sms_choice == "1":
                test_recipient = input(f"  Enter destination phone number [{mask_phone(default_to)}]: ").strip() or default_to
                if test_recipient:
                    ok, send_msg = send_test_sms(test_recipient, twilio_sid, twilio_token, twilio_from)
                    if ok:
                        print(f"  ✓ {send_msg}")
                        print("  [NOTE] Provider accepted the message for delivery queue. Handset delivery depends on telecom carriers.")
                    else:
                        print(f"  ✗ Test SMS send result: {send_msg}")
            elif sms_choice == "2":
                test_recipient = input(f"  Enter destination phone number [{mask_phone(default_to)}]: ").strip() or default_to
                if test_recipient:
                    ok, send_msg = send_trial_connectivity_test(test_recipient, twilio_sid, twilio_token, twilio_from, template_name="sms_2fa")
                    if ok:
                        print(f"  ✓ {send_msg}")
                    else:
                        print(f"  ✗ Trial test result: {send_msg}")
        else:
            print(f"  ✗ Twilio validation failed: {msg_t}")
    else:
        print("\n[SKIP] Twilio SMS is not configured.")

    print("\nSetup session complete.\n")


def validate_only() -> int:
    """Validate currently configured credentials non-interactively."""
    _, current_env = load_env_entries(ENV_FILE)
    smtp_user = current_env.get("SMTP_USER", "") or current_env.get("GMAIL_USER", "")
    smtp_pass = current_env.get("SMTP_PASSWORD", "") or current_env.get("GMAIL_APP_PASSWORD", "")
    smtp_host = current_env.get("SMTP_HOST", "smtp.gmail.com") or "smtp.gmail.com"
    smtp_port = current_env.get("SMTP_PORT", "587") or "587"
    resend_key = current_env.get("RESEND_API_KEY", "")
    twilio_sid = current_env.get("TWILIO_ACCOUNT_SID", "")
    twilio_token = current_env.get("TWILIO_AUTH_TOKEN", "")
    twilio_from = current_env.get("TWILIO_FROM_NUMBER", "")

    all_valid = True
    print(f"Checking credentials in {ENV_FILE}...")

    if smtp_user and smtp_pass and not smtp_pass.startswith("your_"):
        port_num = 587
        try:
            port_num = int(smtp_port)
        except ValueError:
            pass
        ok, msg = validate_gmail_smtp_credentials(smtp_user, smtp_pass, smtp_host, port_num)
        status = "PASSED" if ok else "FAILED"
        print(f"Gmail SMTP:   [{status}] {msg}")
        if not ok:
            all_valid = False
    else:
        print("Gmail SMTP:   [UNCONFIGURED]")

    if resend_key and not resend_key.startswith("your_"):
        ok, msg = validate_resend_api_key(resend_key)
        status = "PASSED" if ok else "FAILED"
        print(f"Resend Email: [{status}] {msg}")
        if not ok:
            all_valid = False
    else:
        print("Resend Email: [UNCONFIGURED]")

    if twilio_sid and twilio_token and not twilio_sid.startswith("your_"):
        ok, msg = validate_twilio_credentials(twilio_sid, twilio_token, twilio_from)
        status = "PASSED" if ok else "FAILED"
        print(f"Twilio SMS:   [{status}] {msg}")
        if not ok:
            all_valid = False
    else:
        print("Twilio SMS:   [UNCONFIGURED]")

    return 0 if all_valid else 1


def main():
    parser = argparse.ArgumentParser(description="Configure and validate Email and SMS provider credentials.")
    parser.add_argument("--validate-only", action="store_true", help="Validate existing credentials in .env without prompting.")
    parser.add_argument("--test-email", type=str, metavar="EMAIL", help="Send a test email using configured Resend credentials.")
    parser.add_argument("--test-smtp-email", type=str, metavar="EMAIL", help="Send a test email using configured Gmail SMTP credentials.")
    parser.add_argument("--test-sms", type=str, metavar="PHONE", help="Send a custom test SMS using configured Twilio credentials.")
    parser.add_argument("--test-trial-sms", type=str, nargs="?", const="", metavar="PHONE", help="Run a controlled trial-connectivity test using predefined template 'sms_2fa'.")
    parser.add_argument("--smtp-user", type=str, help="Configure Gmail/SMTP username or email.")
    parser.add_argument("--smtp-password", type=str, help="Configure Gmail/SMTP App Password.")
    parser.add_argument("--smtp-host", type=str, help="Configure SMTP host (default: smtp.gmail.com).")
    parser.add_argument("--smtp-port", type=str, help="Configure SMTP port (default: 587).")
    parser.add_argument("--smtp-from", type=str, help="Configure SMTP sender/display address.")
    parser.add_argument("--resend-key", type=str, help="Configure Resend API key directly.")
    parser.add_argument("--resend-from", type=str, help="Configure Resend sender address.")
    parser.add_argument("--twilio-sid", type=str, help="Configure Twilio Account SID directly.")
    parser.add_argument("--twilio-token", type=str, help="Configure Twilio Auth Token directly.")
    parser.add_argument("--twilio-from", type=str, help="Configure Twilio From Number directly.")
    parser.add_argument("--twilio-recipient", type=str, help="Configure verified destination phone number.")

    args = parser.parse_args()

    # Handle direct flag configuration
    direct_updates: Dict[str, str] = {}
    if args.smtp_user:
        direct_updates["SMTP_USER"] = args.smtp_user.strip()
    if args.smtp_password:
        direct_updates["SMTP_PASSWORD"] = args.smtp_password.strip().replace(" ", "")
    if args.smtp_host:
        direct_updates["SMTP_HOST"] = args.smtp_host.strip()
    if args.smtp_port:
        direct_updates["SMTP_PORT"] = args.smtp_port.strip()
    if args.smtp_from:
        direct_updates["SMTP_FROM_EMAIL"] = args.smtp_from.strip()
    if args.resend_key:
        direct_updates["RESEND_API_KEY"] = args.resend_key.strip()
    if args.resend_from:
        direct_updates["RESEND_FROM_EMAIL"] = args.resend_from.strip()
    if args.twilio_sid:
        direct_updates["TWILIO_ACCOUNT_SID"] = args.twilio_sid.strip()
    if args.twilio_token:
        direct_updates["TWILIO_AUTH_TOKEN"] = args.twilio_token.strip()
    if args.twilio_from:
        direct_updates["TWILIO_FROM_NUMBER"] = normalize_phone(args.twilio_from.strip())
    if args.twilio_recipient:
        direct_updates["TWILIO_TEST_RECIPIENT"] = normalize_phone(args.twilio_recipient.strip())

    if direct_updates:
        save_env_entries(ENV_FILE, direct_updates)
        print(f"[OK] Updated configuration in {ENV_FILE}")

    if args.validate_only:
        sys.exit(validate_only())

    if args.test_smtp_email:
        _, env = load_env_entries(ENV_FILE)
        user = env.get("SMTP_USER", "") or env.get("GMAIL_USER", "")
        pwd = env.get("SMTP_PASSWORD", "") or env.get("GMAIL_APP_PASSWORD", "")
        host = env.get("SMTP_HOST", "smtp.gmail.com") or "smtp.gmail.com"
        port = int(env.get("SMTP_PORT", "587") or "587")
        sender = env.get("SMTP_FROM_EMAIL", "") or env.get("GMAIL_FROM_EMAIL", "") or user
        if not (user and pwd):
            print("Error: SMTP credentials (SMTP_USER and SMTP_PASSWORD) are not configured.")
            sys.exit(1)
        ok, msg = send_test_email_smtp(args.test_smtp_email, user, pwd, host, port, sender)
        print(f"Gmail SMTP Test Result: {msg}")
        sys.exit(0 if ok else 1)

    if args.test_email:
        _, env = load_env_entries(ENV_FILE)
        key = env.get("RESEND_API_KEY", "")
        sender = env.get("RESEND_FROM_EMAIL", "onboarding@resend.dev")
        if not key:
            print("Error: RESEND_API_KEY is not configured.")
            sys.exit(1)
        ok, msg = send_test_email(args.test_email, key, sender)
        print(f"Test Email Result: {msg}")
        sys.exit(0 if ok else 1)

    if args.test_sms:
        _, env = load_env_entries(ENV_FILE)
        sid = env.get("TWILIO_ACCOUNT_SID", "")
        token = env.get("TWILIO_AUTH_TOKEN", "")
        from_num = env.get("TWILIO_FROM_NUMBER", "")
        if not (sid and token):
            print("Error: Twilio credentials are not configured.")
            sys.exit(1)
        ok, msg = send_test_sms(args.test_sms, sid, token, from_num)
        print(f"Test SMS Result: {msg}")
        sys.exit(0 if ok else 1)

    if args.test_trial_sms is not None:
        _, env = load_env_entries(ENV_FILE)
        sid = env.get("TWILIO_ACCOUNT_SID", "")
        token = env.get("TWILIO_AUTH_TOKEN", "")
        from_num = env.get("TWILIO_FROM_NUMBER", "")
        target_phone = args.test_trial_sms.strip() or env.get("TWILIO_TEST_RECIPIENT", "")
        ok, msg = send_trial_connectivity_test(target_phone, sid, token, from_num, template_name="sms_2fa")
        print(f"Trial Test Result: {msg}")
        sys.exit(0 if ok else 1)

    if not direct_updates:
        interactive_setup()


if __name__ == "__main__":
    main()
