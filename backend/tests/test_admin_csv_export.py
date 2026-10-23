import csv
import io
import uuid
import pytest
from datetime import datetime, timezone
from database import users_collection, supabase
from database_supabase import _mock_store


def _parse_csv_content(response):
    """Decode response bytes (handling UTF-8 BOM) and parse CSV rows."""
    text = response.content.decode("utf-8-sig")
    reader = csv.reader(io.StringIO(text))
    rows = list(reader)
    headers = rows[0] if rows else []
    data_rows = rows[1:] if len(rows) > 1 else []
    return headers, data_rows


# ============================================================
# 1. AUTHORIZATION TESTS
# ============================================================

def test_admin_csv_export_authorization_unauthenticated(client):
    """Unauthenticated requests must be rejected with 401 across all export endpoints."""
    endpoints = [
        "/admin/students/export",
        "/admin/alumni/export",
        "/admin/participation/events/export",
        "/admin/participation/events/dummy-id/export",
        "/admin/participation/jobs/export",
        "/admin/participation/jobs/dummy-id/export",
    ]
    for ep in endpoints:
        res = client.get(ep)
        assert res.status_code == 401, f"Expected 401 for unauthenticated {ep}, got {res.status_code}"


def test_admin_csv_export_authorization_forbidden_for_non_admin(client, student_user, verified_alumni_user):
    """Students and alumni must be rejected with 403 across all export endpoints."""
    endpoints = [
        "/admin/students/export",
        "/admin/alumni/export",
        "/admin/participation/events/export",
        "/admin/participation/events/dummy-id/export",
        "/admin/participation/jobs/export",
        "/admin/participation/jobs/dummy-id/export",
    ]
    for ep in endpoints:
        res_stu = client.get(ep, headers=student_user["headers"])
        assert res_stu.status_code == 403, f"Expected 403 for student on {ep}, got {res_stu.status_code}"

        res_alu = client.get(ep, headers=verified_alumni_user["headers"])
        assert res_alu.status_code == 403, f"Expected 403 for alumni on {ep}, got {res_alu.status_code}"


# ============================================================
# 2. STUDENTS & ALUMNI CSV EXPORT TESTS
# ============================================================

def test_admin_students_csv_export(client, admin_user, student_user):
    """Admin can export students list with proper headers, encoding, and filters."""
    res = client.get("/admin/students/export", headers=admin_user["headers"])
    assert res.status_code == 200
    assert "text/csv" in res.headers["content-type"]
    assert "students_" in res.headers["content-disposition"]
    assert res.content.startswith(b"\xef\xbb\xbf"), "Must have UTF-8 BOM"

    headers, data_rows = _parse_csv_content(res)
    assert "Student Name" in headers
    assert "Email" in headers
    assert "Student ID" in headers
    assert "Verification Status" in headers

    # Look for student1
    matched = [r for r in data_rows if student_user["email"] in r]
    assert len(matched) == 1
    assert matched[0][0] == student_user["name"]

    # Filter test: search matching student
    res_filtered = client.get(f"/admin/students/export?search={student_user['name']}", headers=admin_user["headers"])
    _, filtered_rows = _parse_csv_content(res_filtered)
    assert len(filtered_rows) >= 1

    # Filter test: search matching nothing
    res_empty = client.get("/admin/students/export?search=nonexistent_xyz_name_query", headers=admin_user["headers"])
    _, empty_rows = _parse_csv_content(res_empty)
    assert len(empty_rows) == 0


def test_admin_alumni_csv_export(client, admin_user, verified_alumni_user):
    """Admin can export alumni list with company, designation, and verification details."""
    res = client.get("/admin/alumni/export", headers=admin_user["headers"])
    assert res.status_code == 200
    assert "text/csv" in res.headers["content-type"]
    assert "alumni_" in res.headers["content-disposition"]

    headers, data_rows = _parse_csv_content(res)
    assert "Alumni Name" in headers
    assert "Company" in headers
    assert "Designation" in headers

    matched = [r for r in data_rows if verified_alumni_user["email"] in r]
    assert len(matched) == 1


# ============================================================
# 3. EVENT PARTICIPATION CSV EXPORT TESTS
# ============================================================

def test_admin_event_registrations_csv_export(client, admin_user, student_user):
    """Admin can export all event registrations and single-event participants."""
    event_id = str(uuid.uuid4())
    event_title = "Annual Tech Symposium 2026"
    supabase.table("events").insert({
        "id": event_id,
        "title": event_title,
        "event_date": "2026-11-15T10:00:00Z",
        "location": "Auditorium A",
        "event_type": "Conference",
        "status": "approved",
    }).execute()

    reg_id = str(uuid.uuid4())
    supabase.table("event_registrations").insert({
        "id": reg_id,
        "event_id": event_id,
        "user_id": student_user["id"],
        "user_name": student_user["name"],
        "user_email": student_user["email"],
        "user_role": "student",
        "status": "registered",
        "created_at": "2026-10-20T12:00:00Z",
    }).execute()

    # 1. Export all events
    res_all = client.get("/admin/participation/events/export", headers=admin_user["headers"])
    assert res_all.status_code == 200
    assert "event_registrations_" in res_all.headers["content-disposition"]
    headers_all, rows_all = _parse_csv_content(res_all)
    assert "Event Title" in headers_all
    assert "Participant Name" in headers_all

    matched_all = [r for r in rows_all if event_title in r]
    assert len(matched_all) == 1
    assert student_user["name"] in matched_all[0]

    # 2. Export single event
    res_single = client.get(f"/admin/participation/events/{event_id}/export", headers=admin_user["headers"])
    assert res_single.status_code == 200
    headers_single, rows_single = _parse_csv_content(res_single)
    assert "Participant Name" in headers_single
    assert "Role" in headers_single
    assert len(rows_single) == 1
    # Column 0 is Event Title, Column 1 is Event Date, Column 2 is Participant Name
    assert rows_single[0][2] == student_user["name"]

    # 3. 404 for non-existent event
    res_404 = client.get("/admin/participation/events/non-existent-id/export", headers=admin_user["headers"])
    assert res_404.status_code == 404


# ============================================================
# 4. JOB APPLICATIONS CSV EXPORT TESTS & SECURITY
# ============================================================

def test_admin_job_applications_csv_export_and_privacy(client, admin_user, student_user):
    """
    Admin can export job applications.
    Privacy requirements:
    - Resume and cover letter availability must be exported as flags (Yes/No).
    - Private file URLs and full cover letter text must NOT be exported.
    """
    job_id = str(uuid.uuid4())
    job_title = "Cloud Infrastructure Engineer"
    supabase.table("jobs").insert({
        "id": job_id,
        "title": job_title,
        "company": "Apex Cloud Systems",
        "job_type": "Full-Time",
        "location": "Bangalore",
        "status": "approved",
    }).execute()

    app_id = str(uuid.uuid4())
    supabase.table("job_applications").insert({
        "id": app_id,
        "job_id": job_id,
        "applicant_id": student_user["id"],
        "student_id": student_user["id"],
        "name": student_user["name"],
        "email": student_user["email"],
        "role": "student",
        "status": "applied",
        "resume_url": "https://private-bucket.supabase.co/resumes/super_secret_resume.pdf",
        "cover_letter": "This is a private highly confidential cover letter statement with personal info.",
        "applied_at": "2026-10-22T08:30:00Z",
    }).execute()

    # 1. Export all jobs
    res_all = client.get("/admin/participation/jobs/export", headers=admin_user["headers"])
    assert res_all.status_code == 200
    assert "job_applications_" in res_all.headers["content-disposition"]
    headers_all, rows_all = _parse_csv_content(res_all)
    assert "Job Title" in headers_all
    assert "Resume Available" in headers_all
    assert "Cover Letter Available" in headers_all

    matched = [r for r in rows_all if job_title in r]
    assert len(matched) == 1
    row_text = ",".join(matched[0])
    # Private URL and full text must not appear
    assert "super_secret_resume.pdf" not in row_text
    assert "private highly confidential cover letter" not in row_text
    # But flags must be present
    assert "Yes" in matched[0]

    # 2. Export single job
    res_single = client.get(f"/admin/participation/jobs/{job_id}/export", headers=admin_user["headers"])
    assert res_single.status_code == 200
    headers_single, rows_single = _parse_csv_content(res_single)
    assert len(rows_single) == 1
    assert "super_secret_resume.pdf" not in ",".join(rows_single[0])

    # 3. 404 for non-existent job
    res_404 = client.get("/admin/participation/jobs/non-existent-id/export", headers=admin_user["headers"])
    assert res_404.status_code == 404


# ============================================================
# 5. FORMULA INJECTION PROTECTION TESTS
# ============================================================

def test_csv_formula_injection_protection(client, admin_user):
    """
    Ensure values starting with formula injection characters (=, +, -, @, \t, \r)
    are safely prefixed with a single quote to prevent spreadsheet evaluation.
    """
    dangerous_user_id = str(uuid.uuid4())
    users_collection.insert_one({
        "_id": dangerous_user_id,
        "id": dangerous_user_id,
        "name": "=cmd|' /C calc'!A0",
        "email": "+formula@danger.com",
        "role": "student",
        "is_active": True,
        "is_verified": True,
        "verification_status": "approved",
        "created_at": "2026-10-23T00:00:00Z",
        "student_profile": {
            "student_id": "@SUM(A1:A10)",
            "department": "-DangerousDept",
            "course": "\tIndentedCourse",
            "graduation_year": "2026",
        }
    })

    res = client.get("/admin/students/export", headers=admin_user["headers"])
    assert res.status_code == 200
    _, rows = _parse_csv_content(res)

    dangerous_row = next((r for r in rows if "formula@danger.com" in r[1]), None)
    assert dangerous_row is not None
    # Name should be escaped with leading quote
    assert dangerous_row[0].startswith("'=")
    # Email should be escaped
    assert dangerous_row[1].startswith("'+")
    # Student ID should be escaped
    assert dangerous_row[3].startswith("'@")
    # Department should be escaped
    assert dangerous_row[4].startswith("'-")


# ============================================================
# 6. EMPTY RESULTS HANDLING
# ============================================================

def test_csv_empty_results_handling(client, admin_user):
    """Empty database or filters matching no rows should return valid CSV with headers only."""
    res = client.get("/admin/students/export?search=totally_absent_query_abc_123", headers=admin_user["headers"])
    assert res.status_code == 200
    headers, rows = _parse_csv_content(res)
    assert len(headers) > 0
    assert len(rows) == 0


# ============================================================
# 7. COMPLETENESS TEST (> 100 RECORDS NO SILENT TRUNCATION)
# ============================================================

def test_export_greater_than_100_records_completeness(client, admin_user):
    """
    Ensure that export endpoints return ALL records and do not truncate
    at the previous default of 100 or 200 records.
    """
    event_id = str(uuid.uuid4())
    supabase.table("events").insert({
        "id": event_id,
        "title": "Mega Hackathon 2026",
        "status": "approved",
    }).execute()

    TOTAL_REGISTRATIONS = 135
    bulk_records = [
        {
            "id": str(uuid.uuid4()),
            "event_id": event_id,
            "user_id": f"bulk-user-{i}",
            "user_name": f"Attendee #{i}",
            "user_email": f"attendee_{i}@example.com",
            "user_role": "student",
            "status": "registered",
            "created_at": f"2026-10-24T00:{i % 60:02d}:00Z",
        }
        for i in range(TOTAL_REGISTRATIONS)
    ]
    supabase.table("event_registrations").insert(bulk_records).execute()

    res = client.get(f"/admin/participation/events/{event_id}/export", headers=admin_user["headers"])
    assert res.status_code == 200
    headers, rows = _parse_csv_content(res)
    assert len(rows) == TOTAL_REGISTRATIONS, f"Expected {TOTAL_REGISTRATIONS} rows, but got {len(rows)} (truncation bug!)"
