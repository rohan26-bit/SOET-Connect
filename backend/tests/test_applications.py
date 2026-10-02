from bson import ObjectId
from database import users_collection
from security.jwt import create_access_token


def _create_approved_job(client, admin_user):
    res = client.post("/jobs", json={
        "title": "Backend Intern",
        "company": "FastTech",
        "description": "Python FastAPI intern",
        "location": "Remote",
        "employment_type": "internship"
    }, headers=admin_user["headers"])
    return res.json()["job"]["id"]


def test_only_students_can_apply(client, verified_alumni_user, admin_user):
    """Alumni and admin cannot apply for jobs."""
    job_id = _create_approved_job(client, admin_user)

    res = client.post(f"/jobs/{job_id}/applications", json={
        "resume_url": "https://example.com/resume.pdf",
        "cover_letter": "I want to apply"
    }, headers=verified_alumni_user["headers"])
    assert res.status_code == 403
    assert "Only students can apply" in res.json().get("detail", "")


def test_cannot_apply_to_pending_job(client, verified_alumni_user, student_user):
    """Applications can only be submitted for approved jobs."""
    res_job = client.post("/jobs", json={
        "title": "Pending Job",
        "company": "Startup Inc",
        "description": "Desc",
        "location": "Remote",
        "employment_type": "full-time"
    }, headers=verified_alumni_user["headers"])
    pending_job_id = res_job.json()["job"]["id"]

    res = client.post(f"/jobs/{pending_job_id}/applications", json={
        "resume_url": "https://example.com/resume.pdf"
    }, headers=student_user["headers"])
    assert res.status_code == 400
    assert "only accepted for approved jobs" in res.json().get("detail", "")


def test_student_apply_success_and_duplicate_prevented(client, admin_user, student_user):
    """Student can apply to approved job, but duplicate application is rejected."""
    job_id = _create_approved_job(client, admin_user)

    payload = {
        "resume_url": "https://example.com/student_resume.pdf",
        "cover_letter": "I am passionate about this role.",
        "skills": ["Python", "FastAPI"]
    }

    # First application succeeds
    res1 = client.post(f"/jobs/{job_id}/applications", json=payload, headers=student_user["headers"])
    assert res1.status_code == 200
    app_data = res1.json()["application"]
    assert app_data["student_id"] == student_user["id"]
    assert app_data["status"] == "applied"

    # Second application fails with 400
    res2 = client.post(f"/jobs/{job_id}/applications", json=payload, headers=student_user["headers"])
    assert res2.status_code == 400
    assert "already applied" in res2.json().get("detail", "")


def test_student_views_only_own_applications(client, admin_user, student_user, other_student_user):
    """GET /jobs/applications/me returns only current student's applications."""
    job_id = _create_approved_job(client, admin_user)

    client.post(f"/jobs/{job_id}/applications", json={"resume_url": "https://example.com/s1.pdf"}, headers=student_user["headers"])
    client.post(f"/jobs/{job_id}/applications", json={"resume_url": "https://example.com/s2.pdf"}, headers=other_student_user["headers"])

    res1 = client.get("/jobs/applications/me", headers=student_user["headers"])
    assert res1.status_code == 200
    apps = res1.json()
    assert len(apps) == 1
    assert apps[0]["student_id"] == student_user["id"]


def test_job_poster_and_admin_view_applicants(client, verified_alumni_user, other_alumni_user, admin_user, student_user):
    """Job poster and admin can view applicants; third-party alumni receives 403."""
    # Alumni creates job, admin approves it
    res_job = client.post("/jobs", json={
        "title": "Alumni Job",
        "company": "Poster Co",
        "description": "Desc",
        "location": "Pune",
        "employment_type": "full-time"
    }, headers=verified_alumni_user["headers"])
    job_id = res_job.json()["job"]["id"]

    client.patch(f"/jobs/{job_id}/status", json={"status": "approved"}, headers=admin_user["headers"])

    # Student applies
    client.post(f"/jobs/{job_id}/applications", json={"resume_url": "https://example.com/s.pdf"}, headers=student_user["headers"])

    # Poster can view applicants
    res_poster = client.get(f"/jobs/{job_id}/applications", headers=verified_alumni_user["headers"])
    assert res_poster.status_code == 200
    assert len(res_poster.json()) == 1

    # Admin can view applicants
    res_admin = client.get(f"/jobs/{job_id}/applications", headers=admin_user["headers"])
    assert res_admin.status_code == 200

    # Other alumni gets 403
    res_other = client.get(f"/jobs/{job_id}/applications", headers=other_alumni_user["headers"])
    assert res_other.status_code == 403


def test_update_application_status_permissions(client, verified_alumni_user, other_alumni_user, admin_user, student_user):
    """Only job poster or admin can update application status."""
    res_job = client.post("/jobs", json={
        "title": "Test Job",
        "company": "Poster Co",
        "description": "Desc",
        "location": "Pune",
        "employment_type": "full-time"
    }, headers=verified_alumni_user["headers"])
    job_id = res_job.json()["job"]["id"]
    client.patch(f"/jobs/{job_id}/status", json={"status": "approved"}, headers=admin_user["headers"])

    res_app = client.post(f"/jobs/{job_id}/applications", json={"resume_url": "https://example.com/s.pdf"}, headers=student_user["headers"])
    app_id = res_app.json()["application"]["id"]

    # Student cannot update status
    res_stu = client.patch(f"/jobs/applications/{app_id}/status", json={"status": "shortlisted"}, headers=student_user["headers"])
    assert res_stu.status_code == 403

    # Other alumni cannot update status
    res_other = client.patch(f"/jobs/applications/{app_id}/status", json={"status": "shortlisted"}, headers=other_alumni_user["headers"])
    assert res_other.status_code == 403

    # Invalid status returns 400
    res_inv = client.patch(f"/jobs/applications/{app_id}/status", json={"status": "super_selected"}, headers=verified_alumni_user["headers"])
    assert res_inv.status_code == 400

    # Poster updates status
    res_poster = client.patch(f"/jobs/applications/{app_id}/status", json={"status": "interview"}, headers=verified_alumni_user["headers"])
    assert res_poster.status_code == 200
    assert res_poster.json()["application"]["status"] == "interview"

    # Admin updates status
    res_admin = client.patch(f"/jobs/applications/{app_id}/status", json={"status": "selected"}, headers=admin_user["headers"])
    assert res_admin.status_code == 200
    assert res_admin.json()["application"]["status"] == "selected"


def test_deleted_user_jwt_rejected_from_applying(client, admin_user, student_user, other_student_user):
    """Deleted or nonexistent user with a valid JWT cannot submit job applications."""
    job_id = _create_approved_job(client, admin_user)

    # 1. Existing valid user -> write succeeds
    valid_payload = {
        "job_id": job_id,
        "resume_url": "https://example.com/valid.pdf",
        "cover_letter": "Valid application",
    }
    res_valid = client.post("/applications/apply", json=valid_payload, headers=other_student_user["headers"])
    assert res_valid.status_code == 200
    assert res_valid.json()["application"]["student_id"] == other_student_user["id"]

    # 2. Delete student user from database while keeping their JWT
    users_collection.delete_one({"_id": student_user["doc_id"]})

    # Submitting via /applications/apply is rejected (404)
    res_del1 = client.post(
        "/applications/apply",
        json={"job_id": job_id, "resume_url": "https://example.com/ghost.pdf"},
        headers=student_user["headers"],
    )
    assert res_del1.status_code == 404
    assert "not found" in res_del1.json().get("detail", "").lower()

    # Submitting via /jobs/{job_id}/applications is rejected (404)
    res_del2 = client.post(
        f"/jobs/{job_id}/applications",
        json={"resume_url": "https://example.com/ghost.pdf"},
        headers=student_user["headers"],
    )
    assert res_del2.status_code == 404
    assert "not found" in res_del2.json().get("detail", "").lower()

    # 3. Nonexistent user ID in valid token is rejected (404)
    fake_token = create_access_token(user_id=str(ObjectId()), role="student")
    fake_headers = {"Authorization": f"Bearer {fake_token}"}
    res_nonexistent = client.post(
        "/applications/apply",
        json={"job_id": job_id, "resume_url": "https://example.com/fake.pdf"},
        headers=fake_headers,
    )
    assert res_nonexistent.status_code == 404
    assert "not found" in res_nonexistent.json().get("detail", "").lower()

    # 4. Unauthorized user attempting another user's protected resource remains rejected (403)
    from tests.conftest import _create_mock_user
    unauth_student = _create_mock_user("Student Three", "student3@example.com", "student")
    app_id = res_valid.json()["application"]["id"]
    res_unauth = client.delete(
        f"/applications/{app_id}",
        headers=unauth_student["headers"],
    )
    assert res_unauth.status_code == 403
