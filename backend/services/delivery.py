import os
import re
import uuid
from datetime import datetime, timezone
from typing import Optional, Dict, Any, Tuple, List
import httpx

from database import supabase

# Read configuration from environment
RESEND_API_KEY = os.getenv("RESEND_API_KEY", "").strip()
RESEND_FROM_EMAIL = os.getenv("RESEND_FROM_EMAIL", "").strip() or "onboarding@resend.dev"
TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID", "").strip()
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN", "").strip()
TWILIO_FROM_NUMBER = os.getenv("TWILIO_FROM_NUMBER", "").strip()
PUBLIC_APP_URL = os.getenv("PUBLIC_APP_URL", "https://soet-connect.vercel.app").rstrip("/")


def normalize_phone_number(phone: str, default_country: str = "+91") -> str:
    """Normalize a phone number to standard E.164 format (+[country_code][number])."""
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


def is_email_configured() -> bool:
    """Return True if Resend email provider credentials are fully configured."""
    return bool(os.getenv("RESEND_API_KEY", "").strip())


def is_sms_configured() -> bool:
    """Return True if Twilio SMS provider credentials are fully configured."""
    return bool(
        os.getenv("TWILIO_ACCOUNT_SID", "").strip()
        and os.getenv("TWILIO_AUTH_TOKEN", "").strip()
        and os.getenv("TWILIO_FROM_NUMBER", "").strip()
    )


def get_user_contact_and_prefs(user_id: str) -> Dict[str, Any]:
    """Resolve contact information and notification preferences for a user."""
    user_id_str = str(user_id)
    email = ""
    phone = ""
    is_phone_verified = False

    try:
        u_res = supabase.table("users").select("*").eq("id", user_id_str).limit(1).execute()
        if u_res.data:
            u = u_res.data[0]
            email = u.get("email", "")
            phone = u.get("phone", "")
            is_phone_verified = bool(u.get("is_phone_verified", False))

        if not phone:
            sp_res = supabase.table("student_profiles").select("phone").eq("user_id", user_id_str).limit(1).execute()
            if sp_res.data:
                phone = sp_res.data[0].get("phone", "")
    except Exception as e:
        print(f"Error resolving contact for user {user_id_str}: {e}")

    # Preferences
    in_app_enabled = True
    email_enabled = True
    sms_enabled = False
    notify_jobs = True
    notify_events = True
    notify_announcements = True
    notify_applications = True
    notify_gallery = True

    try:
        p_res = supabase.table("notification_preferences").select("*").eq("user_id", user_id_str).limit(1).execute()
        if p_res.data:
            p = p_res.data[0]
            in_app_enabled = p.get("in_app_enabled", True)
            email_enabled = p.get("email_enabled", True)
            sms_enabled = p.get("sms_enabled", False)
            notify_jobs = p.get("notify_jobs", True)
            notify_events = p.get("notify_events", True)
            notify_announcements = p.get("notify_announcements", True)
            notify_applications = p.get("notify_applications", True)
            notify_gallery = p.get("notify_gallery", True)
    except Exception:
        pass

    return {
        "email": email,
        "phone": phone,
        "is_phone_verified": is_phone_verified,
        "in_app_enabled": in_app_enabled,
        "email_enabled": email_enabled,
        "sms_enabled": sms_enabled,
        "notify_jobs": notify_jobs,
        "notify_events": notify_events,
        "notify_announcements": notify_announcements,
        "notify_applications": notify_applications,
        "notify_gallery": notify_gallery,
    }


def record_delivery(
    user_id: str,
    channel: str,
    recipient: str,
    status: str,
    event_type: Optional[str] = None,
    notification_id: Optional[str] = None,
    provider: Optional[str] = None,
    provider_message_id: Optional[str] = None,
    error_message: Optional[str] = None,
) -> dict:
    """Record an audit entry in notification_deliveries table."""
    now_iso = datetime.now(timezone.utc).isoformat()
    record = {
        "id": str(uuid.uuid4()),
        "notification_id": str(notification_id) if notification_id else None,
        "user_id": str(user_id),
        "channel": channel,
        "recipient": recipient,
        "event_type": event_type,
        "status": status,
        "provider": provider,
        "provider_message_id": provider_message_id,
        "error_message": error_message,
        "attempts": 1,
        "created_at": now_iso,
        "updated_at": now_iso,
    }
    try:
        supabase.table("notification_deliveries").insert(record).execute()
    except Exception as e:
        print("Error saving notification delivery record:", e)
    return record


def send_email_message(to_email: str, subject: str, message: str) -> Tuple[bool, Optional[str], Optional[str]]:
    """
    Send email via Resend API.
    Returns: (success: bool, provider_message_id: Optional[str], error_message: Optional[str])
    """
    api_key = os.getenv("RESEND_API_KEY", "").strip()
    raw_from = os.getenv("RESEND_FROM_EMAIL", "").strip() or "onboarding@resend.dev"
    from_email = raw_from if ("<" in raw_from and ">" in raw_from) else f"SOET Connect - Alumni Portal <{raw_from}>"

    if not api_key:
        return False, None, "Resend API key is not configured."

    url = "https://api.resend.com/emails"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    html_body = f"""
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
      <div style="border-bottom: 2px solid #f28c38; padding-bottom: 12px; margin-bottom: 16px;">
        <h2 style="color: #1e3a8a; margin: 0; font-size: 20px;">SOET Connect - Alumni Portal</h2>
      </div>
      <p style="color: #334155; font-size: 15px; line-height: 1.6; white-space: pre-line;">{message}</p>
      <hr style="border: 0; border-top: 1px solid #f1f5f9; margin: 24px 0;" />
      <p style="color: #94a3b8; font-size: 12px; line-height: 1.4;">
        This is an automated notification from SOET Connect - Alumni Portal. Please do not reply directly to this email.
      </p>
    </div>
    """
    payload = {
        "from": from_email,
        "to": [to_email],
        "subject": subject,
        "text": message,
        "html": html_body,
    }

    try:
        with httpx.Client(timeout=httpx.Timeout(10.0, connect=5.0)) as client:
            resp = client.post(url, headers=headers, json=payload)
            if resp.status_code in (200, 201):
                data = resp.json()
                return True, data.get("id"), None
            # Extract detailed error message
            try:
                err_data = resp.json()
                err_msg = err_data.get("message") or err_data.get("error") or resp.text[:200]
            except Exception:
                err_msg = resp.text[:200]
            return False, None, f"Resend API error ({resp.status_code}): {err_msg}"
    except Exception as e:
        return False, None, f"Email delivery connection error: {str(e)[:150]}"


def mask_phone_number(phone: str) -> str:
    """Mask phone number for safe diagnostic display without exposing user data."""
    if not phone:
        return ""
    cleaned = phone.strip()
    if len(cleaned) <= 6:
        return "***"
    return f"{cleaned[:4]}****{cleaned[-3:]}"


def send_sms_message(to_phone: str, message: str) -> Tuple[bool, Optional[str], Optional[str]]:
    """
    Send SMS via Twilio API.
    Returns: (success: bool, provider_message_id: Optional[str], error_message: Optional[str])
    """
    account_sid = os.getenv("TWILIO_ACCOUNT_SID", "").strip()
    auth_token = os.getenv("TWILIO_AUTH_TOKEN", "").strip()
    from_number = os.getenv("TWILIO_FROM_NUMBER", "").strip()

    if not (account_sid and auth_token):
        return False, None, "Twilio Account SID or Auth Token is not configured."
    if not from_number:
        return False, None, "Twilio 'From' phone number is not configured. An assigned Twilio number is required."

    norm_to = normalize_phone_number(to_phone)
    if not norm_to or len(norm_to) < 8:
        return False, None, "Invalid destination phone format."

    norm_from = normalize_phone_number(from_number)
    if norm_to == norm_from:
        return False, None, "Validation error: Twilio sender and recipient cannot be identical. 'From' must be your Twilio-assigned phone number and 'To' must be your verified personal number."

    url = f"https://api.twilio.com/2010-04-01/Accounts/{account_sid}/Messages.json"
    body_text = f"SOET Connect: {message}"
    data = {
        "From": norm_from,
        "To": norm_to,
        "Body": body_text[:160],  # Single SMS length limit safety
    }

    try:
        with httpx.Client(timeout=httpx.Timeout(10.0, connect=5.0)) as client:
            resp = client.post(url, auth=(account_sid, auth_token), data=data)
            if resp.status_code in (200, 201):
                res_data = resp.json()
                return True, res_data.get("sid"), None
            # Extract detailed Twilio error message
            try:
                err_data = resp.json()
                err_code = err_data.get("code")
                err_msg = err_data.get("message") or resp.text[:200]
                if err_code == 572006 or "572006" in str(err_code) or "572006" in str(err_msg):
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
                    detail = (
                        f"Twilio error 21608: Destination number ({mask_phone_number(norm_to)}) is unverified. "
                        f"Trial accounts can only send messages to verified phone numbers listed in the Twilio Console."
                    )
                elif err_code:
                    detail = f"Twilio API error {resp.status_code} (code {err_code}): {err_msg}"
                else:
                    detail = f"Twilio API error ({resp.status_code}): {err_msg}"
            except Exception:
                detail = f"Twilio API error ({resp.status_code}): {resp.text[:200]}"
            return False, None, detail
    except Exception as e:
        return False, None, f"SMS delivery connection error: {str(e)[:150]}"


def send_trial_sms_connectivity_test(
    to_phone: str,
    template_name: str = "sms_2fa",
) -> Tuple[bool, Optional[str], Optional[str]]:
    """
    Controlled trial-connectivity test using one of Twilio's documented predefined
    template names (e.g. 'sms_2fa').
    Clearly labeled as a connectivity test only; does NOT replace or test actual
    SOET Connect password-reset OTP codes or custom notification content.
    Returns: (success: bool, provider_message_id: Optional[str], detail_message: Optional[str])
    """
    account_sid = os.getenv("TWILIO_ACCOUNT_SID", "").strip()
    auth_token = os.getenv("TWILIO_AUTH_TOKEN", "").strip()
    from_number = os.getenv("TWILIO_FROM_NUMBER", "").strip()

    if not (account_sid and auth_token):
        return False, None, "Twilio Account SID or Auth Token is not configured."
    if not from_number:
        return False, None, "Twilio 'From' phone number is not configured. An assigned Twilio number is required."

    norm_to = normalize_phone_number(to_phone)
    if not norm_to or len(norm_to) < 8:
        return False, None, "Invalid destination phone format."

    norm_from = normalize_phone_number(from_number)
    if norm_to == norm_from:
        return False, None, "Validation error: Twilio sender and recipient cannot be identical. 'From' must be your Twilio-assigned phone number and 'To' must be your verified personal number."

    url = f"https://api.twilio.com/2010-04-01/Accounts/{account_sid}/Messages.json"
    data = {
        "From": norm_from,
        "To": norm_to,
        "Body": template_name,
    }

    try:
        with httpx.Client(timeout=httpx.Timeout(10.0, connect=5.0)) as client:
            resp = client.post(url, auth=(account_sid, auth_token), data=data)
            if resp.status_code in (200, 201):
                res_data = resp.json()
                sid = res_data.get("sid")
                status = res_data.get("status", "accepted")
                return True, sid, (
                    f"Twilio accepted message for transmission (template: {template_name}, SID: {sid}, status: {status}). "
                    "Handset delivery confirmation is pending carrier receipt."
                )

            try:
                err_data = resp.json()
                err_code = err_data.get("code")
                err_msg = err_data.get("message") or resp.text[:200]
                if err_code == 572006:
                    detail = (
                        "Twilio error 572006: Trial accounts reject custom SMS bodies. "
                        f"Template '{template_name}' was not accepted by the trial gateway."
                    )
                elif err_code == 572003:
                    detail = (
                        "Twilio error 572003: The configured 'From' number is not an assigned Twilio trial number. "
                        "Trial accounts must send from an assigned Twilio phone number."
                    )
                elif err_code == 21608:
                    detail = (
                        f"Twilio error 21608: Recipient {norm_to} is not a verified caller ID in your Twilio trial account."
                    )
                else:
                    detail = f"Twilio API error {resp.status_code} (code {err_code}): {err_msg}"
            except Exception:
                detail = f"Twilio API error ({resp.status_code}): {resp.text[:200]}"
            return False, None, detail
    except Exception as e:
        return False, None, f"Twilio connection check error: {str(e)[:150]}"


def is_twilio_verify_configured() -> bool:
    """Return True if Twilio Verify service is configured."""
    return bool(
        os.getenv("TWILIO_ACCOUNT_SID", "").strip()
        and os.getenv("TWILIO_AUTH_TOKEN", "").strip()
        and os.getenv("TWILIO_VERIFY_SERVICE_SID", "").strip()
    )


def send_twilio_verify_otp(to_phone: str) -> Tuple[bool, Optional[str], Optional[str]]:
    """Send OTP via Twilio Verify API v2."""
    account_sid = os.getenv("TWILIO_ACCOUNT_SID", "").strip()
    auth_token = os.getenv("TWILIO_AUTH_TOKEN", "").strip()
    service_sid = os.getenv("TWILIO_VERIFY_SERVICE_SID", "").strip()

    if not (account_sid and auth_token and service_sid):
        return False, None, "Twilio Verify service is not configured."

    norm_to = normalize_phone_number(to_phone)
    if not norm_to:
        return False, None, "Invalid destination phone format."

    url = f"https://verify.twilio.com/v2/Services/{service_sid}/Verifications"
    data = {
        "To": norm_to,
        "Channel": "sms",
    }
    try:
        with httpx.Client(timeout=httpx.Timeout(10.0, connect=5.0)) as client:
            resp = client.post(url, auth=(account_sid, auth_token), data=data)
            if resp.status_code in (200, 201):
                res_data = resp.json()
                return True, res_data.get("sid"), None
            try:
                err_data = resp.json()
                err_msg = err_data.get("message") or resp.text[:200]
            except Exception:
                err_msg = resp.text[:200]
            return False, None, f"Twilio Verify error ({resp.status_code}): {err_msg}"
    except Exception as e:
        return False, None, f"Twilio Verify connection error: {str(e)[:150]}"


def check_twilio_verify_otp(to_phone: str, code: str) -> Tuple[bool, str]:
    """Check OTP code via Twilio Verify API v2."""
    account_sid = os.getenv("TWILIO_ACCOUNT_SID", "").strip()
    auth_token = os.getenv("TWILIO_AUTH_TOKEN", "").strip()
    service_sid = os.getenv("TWILIO_VERIFY_SERVICE_SID", "").strip()

    if not (account_sid and auth_token and service_sid):
        return False, "Twilio Verify service is not configured."

    norm_to = normalize_phone_number(to_phone)
    url = f"https://verify.twilio.com/v2/Services/{service_sid}/VerificationCheck"
    data = {
        "To": norm_to,
        "Code": code.strip(),
    }
    try:
        with httpx.Client(timeout=httpx.Timeout(10.0, connect=5.0)) as client:
            resp = client.post(url, auth=(account_sid, auth_token), data=data)
            if resp.status_code == 200:
                res_data = resp.json()
                if res_data.get("status") == "approved":
                    return True, "Verification code confirmed."
                return False, "Incorrect verification code."
            return False, "Verification check failed."
    except Exception as e:
        return False, f"Twilio Verify connection error: {str(e)[:150]}"


def update_delivery_status(
    delivery_id: Optional[str] = None,
    provider_message_id: Optional[str] = None,
    status: str = "delivered",
    error_message: Optional[str] = None,
) -> Optional[dict]:
    """
    Update a delivery record with confirmed delivery status (e.g. 'delivered' or 'failed')
    when actual delivery confirmation (e.g. provider webhook / receipt) is received.
    Only marks 'delivered' when actual delivery confirmation is available.
    """
    if not delivery_id and not provider_message_id:
        return None
    try:
        now_iso = datetime.now(timezone.utc).isoformat()
        update_data: Dict[str, Any] = {
            "status": status,
            "updated_at": now_iso,
        }
        if error_message:
            update_data["error_message"] = error_message

        query = supabase.table("notification_deliveries").update(update_data)
        if delivery_id:
            res = query.eq("id", str(delivery_id)).execute()
        else:
            res = query.eq("provider_message_id", str(provider_message_id)).execute()

        return res.data[0] if (res.data and len(res.data) > 0) else None
    except Exception as e:
        print(f"Error updating delivery status: {e}")
        return None


def dispatch_external_notification(
    user_id: str,
    title: str,
    message: str,
    event_type: str = "general",
    notification_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Safely dispatch email and/or SMS for a notification based on user preferences and provider status.
    Provider acceptance records 'accepted' status; 'delivered' is reserved for confirmed receipts.
    Guaranteed not to raise unhandled exceptions.
    """
    results = {"email": "skipped", "sms": "skipped"}
    user_id_str = str(user_id)

    try:
        contact_info = get_user_contact_and_prefs(user_id_str)
        email = contact_info["email"]
        phone = contact_info["phone"]
        is_phone_verified = contact_info["is_phone_verified"]
        email_enabled = contact_info["email_enabled"]
        sms_enabled = contact_info["sms_enabled"]

        # Check event-level notification preference
        event_lower = (event_type or "").lower()
        if "job" in event_lower and not contact_info.get("notify_jobs", True):
            return results
        if "event" in event_lower and not contact_info.get("notify_events", True):
            return results
        if "announcement" in event_lower and not contact_info.get("notify_announcements", True):
            return results
        if "application" in event_lower and not contact_info.get("notify_applications", True):
            return results
        if "gallery" in event_lower and not contact_info.get("notify_gallery", True):
            return results

        # 1. Process Email
        if email_enabled and email:
            # Check duplicate delivery: suppress duplicate if already accepted, sent, or delivered
            if notification_id:
                try:
                    existing = supabase.table("notification_deliveries") \
                        .select("id") \
                        .eq("notification_id", str(notification_id)) \
                        .eq("channel", "email") \
                        .in_("status", ["accepted", "sent", "delivered"]) \
                        .execute()
                    if existing.data:
                        results["email"] = "duplicate_skipped"
                except Exception:
                    pass

            if results["email"] != "duplicate_skipped":
                if is_email_configured():
                    success, msg_id, err = send_email_message(email, title, message)
                    status = "accepted" if success else "failed"
                    record_delivery(
                        user_id=user_id_str,
                        channel="email",
                        recipient=email,
                        status=status,
                        event_type=event_type,
                        notification_id=notification_id,
                        provider="resend",
                        provider_message_id=msg_id,
                        error_message=err,
                    )
                    results["email"] = status
                else:
                    record_delivery(
                        user_id=user_id_str,
                        channel="email",
                        recipient=email,
                        status="skipped",
                        event_type=event_type,
                        notification_id=notification_id,
                        provider="resend",
                        error_message="Email provider not configured (RESEND_API_KEY missing).",
                    )
                    results["email"] = "skipped_unconfigured"

        # 2. Process SMS
        if sms_enabled and phone:
            if not is_phone_verified:
                record_delivery(
                    user_id=user_id_str,
                    channel="sms",
                    recipient=phone,
                    status="skipped",
                    event_type=event_type,
                    notification_id=notification_id,
                    provider="twilio",
                    error_message="User phone number is not verified.",
                )
                results["sms"] = "skipped_unverified_phone"
            else:
                # Check duplicate delivery: suppress duplicate if already accepted, sent, or delivered
                if notification_id:
                    try:
                        existing = supabase.table("notification_deliveries") \
                            .select("id") \
                            .eq("notification_id", str(notification_id)) \
                            .eq("channel", "sms") \
                            .in_("status", ["accepted", "sent", "delivered"]) \
                            .execute()
                        if existing.data:
                            results["sms"] = "duplicate_skipped"
                    except Exception:
                        pass

                if results["sms"] != "duplicate_skipped":
                    if is_sms_configured():
                        success, msg_id, err = send_sms_message(phone, message)
                        status = "accepted" if success else "failed"
                        record_delivery(
                            user_id=user_id_str,
                            channel="sms",
                            recipient=phone,
                            status=status,
                            event_type=event_type,
                            notification_id=notification_id,
                            provider="twilio",
                            provider_message_id=msg_id,
                            error_message=err,
                        )
                        results["sms"] = status
                    else:
                        record_delivery(
                            user_id=user_id_str,
                            channel="sms",
                            recipient=phone,
                            status="skipped",
                            event_type=event_type,
                            notification_id=notification_id,
                            provider="twilio",
                            error_message="SMS provider not configured (Twilio credentials missing).",
                        )
                        results["sms"] = "skipped_unconfigured"

    except Exception as e:
        print(f"Error during external notification dispatch for user {user_id_str}: {e}")

    return results
