from bson import ObjectId
from database import users_collection
from security.jwt import create_access_token
from tests.conftest import _create_mock_user


def _create_approved_job(client, admin_user):
    res = client.post("/jobs", json={
        "title": "Backend Intern",
        "company": "FastTech",
        "description": "Python FastAPI intern",
        "location": "Remote",
        "employment_type": "internship"
    }, headers=admin_user["headers"])
    return res.json()["job"]["id"]


def test_student_alumni_admin_can_apply(client, admin_user, verified_alumni_user, student_user):
    """Student, Alumni, and Admin roles are all permitted to apply for approved jobs."""
    job_id = _create_approved_job(client, admin_user)

    # 1. Student applies via /jobs/{job_id}/applications
    res_student = client.post(f"/jobs/{job_id}/applications", json={
        "resume_url": "https://example.com/student_resume.pdf",
        "cover_letter": "Student application letter",
        "skills": ["Python"]
    }, headers=student_user["headers"])
    assert res_student.status_code == 200
    stu_app = res_student.json()["application"]
    assert stu_app["student_id"] == student_user["id"]
    assert stu_app["status"] == "applied"

    # 2. Alumni applies via /applications/apply
    res_alumni = client.post("/applications/apply", json={
        "job_id": job_id,
        "resume_url": "https://example.com/alumni_resume.pdf",
        "cover_letter": "Alumni application letter"
    }, headers=verified_alumni_user["headers"])
    assert res_alumni.status_code == 200
    alu_app = res_alumni.json()["application"]
    assert alu_app["student_id"] == verified_alumni_user["id"]
    assert alu_app["status"] == "applied"

    # 3. Admin applies to another approved job created by alumni
    res_alu_job = client.post("/jobs", json={
        "title": "Data Scientist",
        "company": "DataCorp",
        "description": "ML dev",
        "location": "Pune",
        "employment_type": "full-time"
    }, headers=verified_alumni_user["headers"])
    alu_job_id = res_alu_job.json()["job"]["id"]
    # Admin approves the job first
    client.patch(f"/jobs/{alu_job_id}/status", json={"status": "approved"}, headers=admin_user["headers"])

    # 3. Admin applies via /applications (or /applications/apply) to another approved job created by alumni
    res_admin = client.post("/applications", json={
        "job_id": alu_job_id,
        "resume_url": "https://example.com/admin_resume.pdf",
        "cover_letter": "Admin application letter"
    }, headers=admin_user["headers"])
    assert res_admin.status_code == 200
    adm_app = res_admin.json()["application"]
    assert adm_app["student_id"] == admin_user["id"]
    assert adm_app["status"] == "applied"


def test_duplicate_application_rejected_for_all_roles(client, admin_user, verified_alumni_user, student_user):
    """Duplicate applications are rejected for Student, Alumni, and Admin."""
    job_id = _create_approved_job(client, admin_user)

    for user in [student_user, verified_alumni_user, admin_user]:
        payload = {
            "job_id": job_id,
            "resume_url": f"https://example.com/{user['role']}_resume.pdf",
            "cover_letter": f"Letter from {user['role']}"
        }
        # First application succeeds
        res1 = client.post("/applications/apply", json=payload, headers=user["headers"])
        assert res1.status_code == 200

        # Duplicate via /applications/apply returns 409
        res2 = client.post("/applications/apply", json=payload, headers=user["headers"])
        assert res2.status_code == 409
        assert "already applied" in res2.json().get("detail", "").lower()

        # Duplicate via /jobs/{job_id}/applications returns 400
        res3 = client.post(f"/jobs/{job_id}/applications", json={
            "resume_url": payload["resume_url"],
            "cover_letter": payload["cover_letter"]
        }, headers=user["headers"])
        assert res3.status_code == 400
        assert "already applied" in res3.json().get("detail", "").lower()


def test_cannot_apply_to_pending_or_unapproved_job(client, verified_alumni_user, student_user, admin_user):
    """Applications are rejected when submitting to unapproved/pending jobs."""
    res_job = client.post("/jobs", json={
        "title": "Pending Job",
        "company": "Startup Inc",
        "description": "Desc",
        "location": "Remote",
        "employment_type": "full-time"
    }, headers=verified_alumni_user["headers"])
    pending_job_id = res_job.json()["job"]["id"]

    for user in [student_user, verified_alumni_user, admin_user]:
        # via /jobs/{job_id}/applications
        res = client.post(f"/jobs/{pending_job_id}/applications", json={
            "resume_url": "https://example.com/resume.pdf"
        }, headers=user["headers"])
        assert res.status_code == 400
        assert "approved" in res.json().get("detail", "").lower()

        # via /applications/apply
        res_apply = client.post("/applications/apply", json={
            "job_id": pending_job_id,
            "resume_url": "https://example.com/resume.pdf"
        }, headers=user["headers"])
        assert res_apply.status_code == 400
        assert "approved" in res_apply.json().get("detail", "").lower()


def test_inactive_account_rejected_from_applying(client, admin_user, student_user, verified_alumni_user):
    """Deactivated accounts are rejected from applying across all roles."""
    job_id = _create_approved_job(client, admin_user)

    # Deactivate student
    users_collection.update_one({"_id": student_user["doc_id"]}, {"$set": {"is_active": False}})
    res_stu = client.post("/applications/apply", json={
        "job_id": job_id,
        "resume_url": "https://example.com/stu.pdf"
    }, headers=student_user["headers"])
    assert res_stu.status_code == 403
    assert "deactivated" in res_stu.json().get("detail", "").lower()

    # Deactivate alumni
    users_collection.update_one({"_id": verified_alumni_user["doc_id"]}, {"$set": {"is_active": False}})
    res_alu = client.post(f"/jobs/{job_id}/applications", json={
        "resume_url": "https://example.com/alu.pdf"
    }, headers=verified_alumni_user["headers"])
    assert res_alu.status_code == 403
    assert "deactivated" in res_alu.json().get("detail", "").lower()


def test_roles_retrieve_own_application_history(client, admin_user, student_user, verified_alumni_user, other_student_user):
    """Student, Alumni, and Admin can retrieve their own application history exclusively."""
    job_id = _create_approved_job(client, admin_user)

    client.post("/applications/apply", json={"job_id": job_id, "resume_url": "https://example.com/s1.pdf"}, headers=student_user["headers"])
    client.post("/applications/apply", json={"job_id": job_id, "resume_url": "https://example.com/s2.pdf"}, headers=other_student_user["headers"])
    client.post("/applications/apply", json={"job_id": job_id, "resume_url": "https://example.com/alu.pdf"}, headers=verified_alumni_user["headers"])

    # Student 1 gets their history via /applications/mine
    res_s1 = client.get("/applications/mine", headers=student_user["headers"])
    assert res_s1.status_code == 200
    s1_apps = res_s1.json()
    assert len(s1_apps) == 1
    assert s1_apps[0]["student_id"] == student_user["id"]

    # Student 1 gets their history via /jobs/applications/me
    res_s1_comp = client.get("/jobs/applications/me", headers=student_user["headers"])
    assert res_s1_comp.status_code == 200
    assert len(res_s1_comp.json()) == 1

    # Alumni gets their history via /applications/mine
    res_alu = client.get("/applications/mine", headers=verified_alumni_user["headers"])
    assert res_alu.status_code == 200
    alu_apps = res_alu.json()
    assert len(alu_apps) == 1
    assert alu_apps[0]["student_id"] == verified_alumni_user["id"]

    # Admin gets their history (0 apps yet)
    res_adm = client.get("/applications/mine", headers=admin_user["headers"])
    assert res_adm.status_code == 200
    assert len(res_adm.json()) == 0


def test_unauthorized_other_role_blocked(client, admin_user):
    """Users with roles other than student, alumni, or admin cannot apply or view applications."""
    job_id = _create_approved_job(client, admin_user)

    guest_user = _create_mock_user("Guest User", "guest@example.com", "guest")

    # Applying blocked with 403
    res_apply = client.post("/applications/apply", json={
        "job_id": job_id,
        "resume_url": "https://example.com/guest.pdf"
    }, headers=guest_user["headers"])
    assert res_apply.status_code == 403
    assert "Only students, alumni, and administrators" in res_apply.json().get("detail", "")

    # Compatibility endpoint blocked with 403
    res_comp = client.post(f"/jobs/{job_id}/applications", json={
        "resume_url": "https://example.com/guest.pdf"
    }, headers=guest_user["headers"])
    assert res_comp.status_code == 403
    assert "Only students, alumni, and administrators" in res_comp.json().get("detail", "")

    # Viewing applications blocked with 403
    res_view = client.get("/applications/mine", headers=guest_user["headers"])
    assert res_view.status_code == 403
    assert "Only students, alumni, and administrators" in res_view.json().get("detail", "")

    # Unauthenticated request returns 401
    res_unauth = client.post("/applications/apply", json={"job_id": job_id})
    assert res_unauth.status_code == 401


def test_job_poster_and_admin_view_applicants(client, verified_alumni_user, other_alumni_user, admin_user, student_user):
    """Job poster and admin can view applicants; third-party alumni receives 403."""
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
    unauth_student = _create_mock_user("Student Three", "student3@example.com", "student")
    app_id = res_valid.json()["application"]["id"]
    res_unauth = client.delete(
        f"/applications/{app_id}",
        headers=unauth_student["headers"],
    )
    assert res_unauth.status_code == 403
