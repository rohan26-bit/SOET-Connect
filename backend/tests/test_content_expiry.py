import pytest
from datetime import datetime, timedelta, timezone

try:
    from zoneinfo import ZoneInfo
    KOLKATA_TZ = ZoneInfo("Asia/Kolkata")
except Exception:
    KOLKATA_TZ = timezone(timedelta(hours=5, minutes=30))

from database import supabase


# ============================================================================
# 1. Job and Internship Deadlines & Expiry Tests
# ============================================================================

def test_job_creation_with_past_deadline_rejected(client, admin_user):
    """Creating a job with a past deadline must be rejected with 400."""
    past_time = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
    payload = {
        "title": "Expired Job",
        "company": "Past Corp",
        "description": "Job with past deadline",
        "location": "Remote",
        "employment_type": "full-time",
        "application_deadline": past_time,
    }
    res = client.post("/jobs", json=payload, headers=admin_user["headers"])
    assert res.status_code == 400
    assert "future" in res.json()["detail"].lower()


def test_job_creation_with_future_deadline(client, admin_user):
    """Creating a job with a future deadline succeeds and stores deadline."""
    future_time = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()
    payload = {
        "title": "Active Future Job",
        "company": "Future Corp",
        "description": "Job with valid future deadline",
        "location": "Remote",
        "employment_type": "internship",
        "application_deadline": future_time,
    }
    res = client.post("/jobs", json=payload, headers=admin_user["headers"])
    assert res.status_code == 200
    job = res.json()["job"]
    assert job["application_deadline"] is not None
    assert job["is_expired"] is False


def test_legacy_job_without_deadline_remains_active(client, admin_user, student_user):
    """Legacy jobs with no deadline must not be marked expired and remain visible."""
    payload = {
        "title": "Legacy Job",
        "company": "Legacy Corp",
        "description": "Job without deadline",
        "location": "Remote",
        "employment_type": "full-time",
    }
    res = client.post("/jobs", json=payload, headers=admin_user["headers"])
    assert res.status_code == 200

    # Student should see it
    res_list = client.get("/jobs", headers=student_user["headers"])
    assert res_list.status_code == 200
    titles = [j["title"] for j in res_list.json()]
    assert "Legacy Job" in titles
    legacy_job = next(j for j in res_list.json() if j["title"] == "Legacy Job")
    assert legacy_job["is_expired"] is False


def test_expired_jobs_hidden_from_students_and_alumni(client, admin_user, student_user, verified_alumni_user):
    """Expired jobs are hidden from public/student/alumni GET /jobs, but visible to admin."""
    # 1. Create a job initially with a future deadline
    future_time = (datetime.now(timezone.utc) + timedelta(days=5)).isoformat()
    res = client.post("/jobs", json={
        "title": "Expiring Job",
        "company": "Expiring Inc",
        "description": "Soon to expire",
        "location": "Remote",
        "employment_type": "full-time",
        "application_deadline": future_time,
    }, headers=admin_user["headers"])
    assert res.status_code == 200
    job_id = res.json()["job"]["id"]

    # Student sees it initially
    res_stu = client.get("/jobs", headers=student_user["headers"])
    assert any(j["id"] == job_id for j in res_stu.json())

    # Simulate expiration by updating deadline directly in database to past
    past_iso = (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()
    supabase.table("jobs").update({"application_deadline": past_iso}).eq("id", job_id).execute()

    # Now student must NOT see it
    res_stu_after = client.get("/jobs", headers=student_user["headers"])
    assert not any(j["id"] == job_id for j in res_stu_after.json())

    # Alumni must NOT see it
    res_alu_after = client.get("/jobs", headers=verified_alumni_user["headers"])
    assert not any(j["id"] == job_id for j in res_alu_after.json())

    # Admin CAN see it and has is_expired = True
    res_admin = client.get("/jobs", headers=admin_user["headers"])
    expired_job = next((j for j in res_admin.json() if j["id"] == job_id), None)
    assert expired_job is not None
    assert expired_job["is_expired"] is True


def test_application_to_expired_job_rejected(client, admin_user, student_user):
    """Applying to an expired job via either application endpoint must return 400."""
    future_time = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
    res = client.post("/jobs", json={
        "title": "Job For Applying",
        "company": "Apply Tech",
        "description": "Deadline enforcement test",
        "location": "Remote",
        "employment_type": "full-time",
        "application_deadline": future_time,
    }, headers=admin_user["headers"])
    job_id = res.json()["job"]["id"]

    # Expire the job
    past_iso = (datetime.now(timezone.utc) - timedelta(minutes=30)).isoformat()
    supabase.table("jobs").update({"application_deadline": past_iso}).eq("id", job_id).execute()

    # Attempt 1: via /jobs/{job_id}/applications
    res_app1 = client.post(f"/jobs/{job_id}/applications", json={
        "resume_url": "https://example.com/resume.pdf",
        "cover_letter": "I want to apply",
    }, headers=student_user["headers"])
    assert res_app1.status_code == 400
    assert "deadline" in res_app1.json()["detail"].lower()

    # Attempt 2: via /applications (or /applications/apply)
    res_app2 = client.post("/applications", json={
        "job_id": job_id,
        "resume_url": "https://example.com/resume.pdf",
        "cover_letter": "I want to apply",
    }, headers=student_user["headers"])
    assert res_app2.status_code == 400
    assert "deadline" in res_app2.json()["detail"].lower()


def test_extend_job_deadline_reactivates_job(client, admin_user, student_user):
    """Admin or creator can extend an expired job deadline, reactivating it for students."""
    res = client.post("/jobs", json={
        "title": "Reactivatable Job",
        "company": "Reactivate Corp",
        "description": "Testing reactivation",
        "location": "Remote",
        "employment_type": "full-time",
    }, headers=admin_user["headers"])
    job_id = res.json()["job"]["id"]

    # Expire it
    past_iso = (datetime.now(timezone.utc) - timedelta(hours=5)).isoformat()
    supabase.table("jobs").update({"application_deadline": past_iso}).eq("id", job_id).execute()

    # Verify student cannot see it
    res_stu1 = client.get("/jobs", headers=student_user["headers"])
    assert not any(j["id"] == job_id for j in res_stu1.json())

    # Extend deadline to 10 days in the future via PATCH /jobs/{id}/deadline
    new_future = (datetime.now(timezone.utc) + timedelta(days=10)).isoformat()
    res_patch = client.patch(f"/jobs/{job_id}/deadline", json={
        "application_deadline": new_future
    }, headers=admin_user["headers"])
    assert res_patch.status_code == 200
    assert res_patch.json()["job"]["is_expired"] is False

    # Student now sees the reactivated job
    res_stu2 = client.get("/jobs", headers=student_user["headers"])
    assert any(j["id"] == job_id for j in res_stu2.json())


def test_unauthorized_user_cannot_update_deadline(client, student_user, verified_alumni_user, admin_user):
    """A regular student cannot update a job's deadline."""
    res = client.post("/jobs", json={
        "title": "Alumni Job",
        "company": "Alum Corp",
        "description": "Desc",
        "location": "Pune",
        "employment_type": "full-time",
    }, headers=verified_alumni_user["headers"])
    job_id = res.json()["job"]["id"]

    new_future = (datetime.now(timezone.utc) + timedelta(days=5)).isoformat()
    res_fail = client.patch(f"/jobs/{job_id}/deadline", json={
        "application_deadline": new_future
    }, headers=student_user["headers"])
    assert res_fail.status_code == 403


# ============================================================================
# 2. Events Past Date & Registration Deadline Tests
# ============================================================================

def test_event_past_date_hidden_from_students(client, admin_user, student_user):
    """Past events according to Indian Standard Time are marked is_past and hidden from student feed."""
    now_ist = datetime.now(KOLKATA_TZ)
    yesterday_ist = (now_ist - timedelta(days=2)).strftime("%Y-%m-%d")
    tomorrow_ist = (now_ist + timedelta(days=2)).strftime("%Y-%m-%d")

    # Create a past event
    res_past = client.post("/events", json={
        "title": "Past Hackathon",
        "description": "Yesterday's event",
        "event_date": yesterday_ist,
        "start_time": "10:00",
        "location": "Auditorium",
    }, headers=admin_user["headers"])
    assert res_past.status_code == 200
    past_event_id = res_past.json()["event"]["id"]

    # Create an upcoming event
    res_future = client.post("/events", json={
        "title": "Upcoming Hackathon",
        "description": "Tomorrow's event",
        "event_date": tomorrow_ist,
        "start_time": "10:00",
        "location": "Auditorium",
    }, headers=admin_user["headers"])
    assert res_future.status_code == 200
    future_event_id = res_future.json()["event"]["id"]

    # Non-admin student should see upcoming but NOT past
    res_student_events = client.get("/events", headers=student_user["headers"])
    assert res_student_events.status_code == 200
    student_event_ids = [e["id"] for e in res_student_events.json()]
    assert future_event_id in student_event_ids
    assert past_event_id not in student_event_ids

    # Admin GET /events sees both and has is_past populated correctly
    res_admin_events = client.get("/events", headers=admin_user["headers"])
    assert res_admin_events.status_code == 200
    admin_events = {e["id"]: e for e in res_admin_events.json()}
    assert admin_events[past_event_id]["is_past"] is True
    assert admin_events[future_event_id]["is_past"] is False


def test_event_registration_deadline_enforcement(client, admin_user, student_user):
    """Registration for an event is rejected when registration_deadline has passed."""
    now_ist = datetime.now(KOLKATA_TZ)
    future_date = (now_ist + timedelta(days=5)).strftime("%Y-%m-%d")
    past_reg_deadline = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()

    # Event date in future, but registration deadline is in the past
    res_event = client.post("/events", json={
        "title": "Symposium with Passed Reg Deadline",
        "description": "Reg is closed",
        "event_date": future_date,
        "start_time": "14:00",
        "location": "Hall A",
        "registration_deadline": past_reg_deadline,
    }, headers=admin_user["headers"])
    assert res_event.status_code == 200
    event_id = res_event.json()["event"]["id"]

    # Attempt to register
    res_reg = client.post(f"/events/{event_id}/register", json={}, headers=student_user["headers"])
    assert res_reg.status_code == 400
    assert "deadline" in res_reg.json()["detail"].lower() or "closed" in res_reg.json()["detail"].lower()


def test_cannot_register_for_past_event(client, admin_user, student_user):
    """Attempting to register for an event whose date has passed returns 400."""
    now_ist = datetime.now(KOLKATA_TZ)
    past_date = (now_ist - timedelta(days=3)).strftime("%Y-%m-%d")

    res_event = client.post("/events", json={
        "title": "Passed Workshop",
        "description": "Workshop is over",
        "event_date": past_date,
        "start_time": "10:00",
        "location": "Lab 1",
    }, headers=admin_user["headers"])
    assert res_event.status_code == 200
    event_id = res_event.json()["event"]["id"]

    # Register attempt
    res_reg = client.post(f"/events/{event_id}/register", json={}, headers=student_user["headers"])
    assert res_reg.status_code == 400
    assert "passed" in res_reg.json()["detail"].lower()


# ============================================================================
# 3. Announcements Expiry Tests
# ============================================================================

def test_announcement_with_past_expiry_rejected(client, admin_user):
    """Creating an announcement with a past expiry date must return 400."""
    past_iso = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
    res = client.post("/announcements", json={
        "title": "Past Announcement",
        "content": "This is in the past",
        "target_audience": "all",
        "expires_at": past_iso,
    }, headers=admin_user["headers"])
    assert res.status_code == 400
    assert "future" in res.json()["detail"].lower()


def test_expired_announcement_hidden_from_students(client, admin_user, student_user):
    """Expired announcements are hidden from students/alumni, but visible to admins."""
    future_iso = (datetime.now(timezone.utc) + timedelta(days=2)).isoformat()
    res = client.post("/announcements", json={
        "title": "Expiring Notice",
        "content": "Important notice expiring soon",
        "target_audience": "all",
        "expires_at": future_iso,
    }, headers=admin_user["headers"])
    assert res.status_code == 200
    ann_id = res.json()["announcement"]["id"]

    # Student can see it initially
    res_stu1 = client.get("/announcements", headers=student_user["headers"])
    assert any(a["id"] == ann_id for a in res_stu1.json())

    # Update database directly to simulate expiry
    past_iso = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    supabase.table("announcements").update({"expires_at": past_iso}).eq("id", ann_id).execute()

    # Student no longer sees it
    res_stu2 = client.get("/announcements", headers=student_user["headers"])
    assert not any(a["id"] == ann_id for a in res_stu2.json())

    # Admin CAN see it and has is_expired = True
    res_admin = client.get("/announcements", headers=admin_user["headers"])
    admin_ann = next((a for a in res_admin.json() if a["id"] == ann_id), None)
    assert admin_ann is not None
    assert admin_ann["is_expired"] is True


def test_announcement_reactivation_by_admin(client, admin_user, student_user):
    """Admin can edit an expired announcement's expiry date to reactivate it."""
    res = client.post("/announcements", json={
        "title": "Reactivatable Notice",
        "content": "Notice content",
        "target_audience": "all",
    }, headers=admin_user["headers"])
    ann_id = res.json()["announcement"]["id"]

    # Expire it
    past_iso = (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()
    supabase.table("announcements").update({"expires_at": past_iso}).eq("id", ann_id).execute()

    # Confirm student cannot see it
    res_stu1 = client.get("/announcements", headers=student_user["headers"])
    assert not any(a["id"] == ann_id for a in res_stu1.json())

    # Admin updates expires_at to future date
    new_future = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()
    res_update = client.patch(f"/announcements/{ann_id}", json={
        "expires_at": new_future,
    }, headers=admin_user["headers"])
    assert res_update.status_code == 200

    # Student can see it again
    res_stu2 = client.get("/announcements", headers=student_user["headers"])
    assert any(a["id"] == ann_id for a in res_stu2.json())
