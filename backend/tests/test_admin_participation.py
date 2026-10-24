import pytest
from fastapi.testclient import TestClient
from database import supabase, users_collection
from datetime import datetime, timezone, timedelta


def test_admin_event_participation_unauthorized_and_forbidden(
    client: TestClient,
    student_user: dict,
    verified_alumni_user: dict,
):
    """Non-admin and unauthenticated requests to participation endpoints are rejected with 401 or 403."""
    # 1. Unauthenticated request -> 401
    unauth_res = client.get("/api/admin/participation/events")
    assert unauth_res.status_code == 401

    # 2. Student user -> 403
    student_res = client.get(
        "/api/admin/participation/events",
        headers=student_user["headers"],
    )
    assert student_res.status_code == 403
    assert "admin" in student_res.json().get("detail", "").lower()

    # 3. Alumni user -> 403
    alumni_res = client.get(
        "/api/admin/participation/events",
        headers=verified_alumni_user["headers"],
    )
    assert alumni_res.status_code == 403

    # 4. Job participation endpoints non-admin -> 403
    job_res = client.get(
        "/api/admin/participation/jobs",
        headers=student_user["headers"],
    )
    assert job_res.status_code == 403


def test_admin_event_participation_overview_and_counts(
    client: TestClient,
    admin_user: dict,
    student_user: dict,
    verified_alumni_user: dict,
):
    """Admin receives accurate total registrations, unique participant counts, and per-event metrics."""
    now_iso = datetime.now(timezone.utc).isoformat()

    # Insert test events
    event_1_id = "ev_part_001"
    event_2_id = "ev_part_002"
    supabase.table("events").insert({
        "id": event_1_id,
        "title": "Tech Symposium 2026",
        "status": "approved",
        "event_date": "2026-11-15T10:00:00Z",
        "event_type": "Conference",
        "location": "Auditorium A",
        "created_at": now_iso,
    }).execute()

    supabase.table("events").insert({
        "id": event_2_id,
        "title": "Alumni Networking Night",
        "status": "approved",
        "event_date": "2026-12-01T18:00:00Z",
        "event_type": "Meetup",
        "location": "Student Center",
        "created_at": now_iso,
    }).execute()

    # Student registers for event 1 and event 2
    supabase.table("event_registrations").insert({
        "id": "reg_001",
        "event_id": event_1_id,
        "user_id": str(student_user["id"]),
        "status": "registered",
        "created_at": now_iso,
    }).execute()

    supabase.table("event_registrations").insert({
        "id": "reg_002",
        "event_id": event_2_id,
        "user_id": str(student_user["id"]),
        "status": "registered",
        "created_at": now_iso,
    }).execute()

    # Alumni registers for event 1
    supabase.table("event_registrations").insert({
        "id": "reg_003",
        "event_id": event_1_id,
        "user_id": str(verified_alumni_user["id"]),
        "status": "attended",
        "created_at": now_iso,
    }).execute()

    # Query participation overview as Admin
    res = client.get(
        "/api/admin/participation/events",
        headers=admin_user["headers"],
    )
    assert res.status_code == 200
    data = res.json()

    # Total registrations = 3, Unique participants = 2 (student and alumni)
    assert data["total_registrations"] == 3
    assert data["unique_participants"] == 2
    assert len(data["events"]) >= 2

    # Check event 1 counts
    ev1 = next(e for e in data["events"] if e["id"] == event_1_id)
    assert ev1["registration_count"] == 2
    assert ev1["unique_participant_count"] == 2

    # Check event 2 counts
    ev2 = next(e for e in data["events"] if e["id"] == event_2_id)
    assert ev2["registration_count"] == 1
    assert ev2["unique_participant_count"] == 1

    # Search filter test
    search_res = client.get(
        "/api/admin/participation/events?search=Symposium",
        headers=admin_user["headers"],
    )
    assert search_res.status_code == 200
    assert len(search_res.json()["events"]) == 1
    assert search_res.json()["events"][0]["id"] == event_1_id


def test_admin_event_participants_detail_and_identity_hydration(
    client: TestClient,
    admin_user: dict,
    student_user: dict,
    verified_alumni_user: dict,
):
    """Admin can view participant identities including student_id, alumni_id, and department."""
    now_iso = datetime.now(timezone.utc).isoformat()
    event_id = "ev_detail_test"

    supabase.table("events").insert({
        "id": event_id,
        "title": "Annual Career Fair",
        "status": "approved",
        "event_date": "2026-11-20T09:00:00Z",
        "created_at": now_iso,
    }).execute()

    # Insert registrations
    supabase.table("event_registrations").insert({
        "id": "reg_detail_1",
        "event_id": event_id,
        "user_id": str(student_user["id"]),
        "status": "registered",
        "created_at": now_iso,
    }).execute()

    supabase.table("event_registrations").insert({
        "id": "reg_detail_2",
        "event_id": event_id,
        "user_id": str(verified_alumni_user["id"]),
        "status": "attended",
        "created_at": now_iso,
    }).execute()

    # Query event participants
    res = client.get(
        f"/api/admin/participation/events/{event_id}/participants",
        headers=admin_user["headers"],
    )
    assert res.status_code == 200
    data = res.json()
    assert data["event_id"] == event_id
    assert data["total_count"] == 2
    participants = data["participants"]

    # Student participant has student role and student_id
    student_p = next(p for p in participants if p["user_id"] == str(student_user["id"]))
    assert student_p["name"] == student_user["name"]
    assert student_p["email"] == student_user["email"]
    assert student_p["role"] == "student"
    assert student_p["identifier"] == "STU001"
    assert student_p["department"] == "Computer Science"
    assert student_p["status"] == "registered"

    # Alumni participant has alumni role and alumni_id
    alumni_p = next(p for p in participants if p["user_id"] == str(verified_alumni_user["id"]))
    assert alumni_p["name"] == verified_alumni_user["name"]
    assert alumni_p["email"] == verified_alumni_user["email"]
    assert alumni_p["role"] == "alumni"
    assert alumni_p["identifier"] == "ALU001"
    assert alumni_p["status"] == "attended"

    # Role filter test
    filter_res = client.get(
        f"/api/admin/participation/events/{event_id}/participants?role=alumni",
        headers=admin_user["headers"],
    )
    assert filter_res.status_code == 200
    filtered = filter_res.json()["participants"]
    assert len(filtered) == 1
    assert filtered[0]["role"] == "alumni"


def test_admin_job_participation_overview_and_applicants(
    client: TestClient,
    admin_user: dict,
    student_user: dict,
    verified_alumni_user: dict,
):
    """Admin can view job applications per job, application status breakdown, and applicant identities."""
    now_iso = datetime.now(timezone.utc).isoformat()
    job_1_id = "job_part_001"
    job_2_id = "job_part_002"

    supabase.table("jobs").insert({
        "id": job_1_id,
        "title": "Frontend Engineer",
        "company": "NextGen Labs",
        "location": "Pune",
        "job_type": "Full-time",
        "status": "approved",
        "deadline": "2026-12-31",
        "created_at": now_iso,
    }).execute()

    supabase.table("jobs").insert({
        "id": job_2_id,
        "title": "Backend Intern",
        "company": "Cloud Systems",
        "location": "Remote",
        "job_type": "Internship",
        "status": "approved",
        "deadline": "2026-12-15",
        "created_at": now_iso,
    }).execute()

    # Applications
    supabase.table("job_applications").insert({
        "id": "app_001",
        "job_id": job_1_id,
        "applicant_id": str(student_user["id"]),
        "status": "shortlisted",
        "resume_url": "https://example.com/resume1.pdf",
        "cover_letter": "I am passionate about React.",
        "applied_at": now_iso,
    }).execute()

    supabase.table("job_applications").insert({
        "id": "app_002",
        "job_id": job_1_id,
        "applicant_id": str(verified_alumni_user["id"]),
        "status": "applied",
        "resume_url": "https://example.com/resume2.pdf",
        "cover_letter": "Experienced developer application.",
        "applied_at": now_iso,
    }).execute()

    # Query jobs participation
    res = client.get(
        "/api/admin/participation/jobs",
        headers=admin_user["headers"],
    )
    assert res.status_code == 200
    data = res.json()
    assert data["total_applications"] >= 2
    assert data["unique_applicants"] >= 2

    job1 = next(j for j in data["jobs"] if j["id"] == job_1_id)
    assert job1["application_count"] == 2
    assert job1["unique_applicant_count"] == 2
    assert job1["applications_by_status"]["shortlisted"] == 1
    assert job1["applications_by_status"]["applied"] == 1

    # Query detailed applicants for job 1
    app_res = client.get(
        f"/api/admin/participation/jobs/{job_1_id}/applicants",
        headers=admin_user["headers"],
    )
    assert app_res.status_code == 200
    app_data = app_res.json()
    assert app_data["job_id"] == job_1_id
    assert app_data["total_count"] == 2

    applicants = app_data["applicants"]
    student_app = next(a for a in applicants if a["applicant_id"] == str(student_user["id"]))
    assert student_app["name"] == student_user["name"]
    assert student_app["email"] == student_user["email"]
    assert student_app["identifier"] == "STU001"
    assert student_app["status"] == "shortlisted"
    assert student_app["resume_url"] == "https://example.com/resume1.pdf"
    assert student_app["cover_letter"] == "I am passionate about React."

    # Status filter test
    filter_res = client.get(
        f"/api/admin/participation/jobs/{job_1_id}/applicants?status=shortlisted",
        headers=admin_user["headers"],
    )
    assert filter_res.status_code == 200
    filtered_apps = filter_res.json()["applicants"]
    assert len(filtered_apps) == 1
    assert filtered_apps[0]["status"] == "shortlisted"


def test_nonexistent_event_or_job_returns_404(
    client: TestClient,
    admin_user: dict,
):
    """Querying participants or applicants for non-existent event/job returns 404."""
    res_ev = client.get(
        "/api/admin/participation/events/non_existent_event_999/participants",
        headers=admin_user["headers"],
    )
    assert res_ev.status_code == 404
    assert "not found" in res_ev.json().get("detail", "").lower()

    res_job = client.get(
        "/api/admin/participation/jobs/non_existent_job_999/applicants",
        headers=admin_user["headers"],
    )
    assert res_job.status_code == 404
    assert "not found" in res_job.json().get("detail", "").lower()
