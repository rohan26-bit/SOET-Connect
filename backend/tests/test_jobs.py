from database import supabase

def test_student_cannot_create_job(client, student_user):
    """Students are not allowed to post jobs."""
    payload = {
        "title": "Software Engineer Intern",
        "company": "Tech Corp",
        "description": "Internship opportunity",
        "location": "Remote",
        "employment_type": "internship"
    }
    res = client.post("/jobs", json=payload, headers=student_user["headers"])
    assert res.status_code == 403


def test_alumni_creates_pending_job(client, verified_alumni_user):
    """Alumni created jobs start as pending."""
    payload = {
        "title": "Junior Developer",
        "company": "StartUp Hub",
        "description": "Full-time junior dev role",
        "location": "Pune",
        "employment_type": "full-time"
    }
    res = client.post("/jobs", json=payload, headers=verified_alumni_user["headers"])
    assert res.status_code == 200
    job = res.json()["job"]
    assert job["status"] == "pending"
    assert job["posted_by"] == verified_alumni_user["id"]


def test_external_application_url_is_persisted_and_returned(client, admin_user):
    """External application links survive a database round trip."""
    application_url = "https://careers.example.com/roles/backend-intern"
    response = client.post("/jobs", json={
        "title": "Backend Intern with External Link",
        "company": "Example Careers",
        "description": "Apply on the company website.",
        "location": "Remote",
        "employment_type": "internship",
        "application_url": application_url,
    }, headers=admin_user["headers"])

    assert response.status_code == 200
    job_id = response.json()["job"]["id"]
    stored = supabase.table("jobs").select("*").eq("id", job_id).execute().data
    assert stored and stored[0].get("application_url") == application_url
    assert response.json()["job"]["application_url"] == application_url

    listed = client.get("/jobs", headers=admin_user["headers"])
    assert listed.status_code == 200
    persisted_job = next((job for job in listed.json() if job["id"] == job_id), None)
    assert persisted_job is not None
    assert persisted_job["application_url"] == application_url


def test_admin_creates_approved_job(client, admin_user):
    """Admin created jobs are approved immediately."""
    payload = {
        "title": "Admin Posted Job",
        "company": "Global Systems",
        "description": "Direct approved listing",
        "location": "Bangalore",
        "employment_type": "full-time"
    }
    res = client.post("/jobs", json=payload, headers=admin_user["headers"])
    assert res.status_code == 200
    job = res.json()["job"]
    assert job["status"] == "approved"


def test_public_jobs_only_shows_approved(client, verified_alumni_user, admin_user, student_user):
    """GET /jobs only returns approved jobs."""
    # Alumni creates pending job
    client.post("/jobs", json={
        "title": "Pending Job",
        "company": "Co A",
        "description": "Desc",
        "location": "Remote",
        "employment_type": "contract"
    }, headers=verified_alumni_user["headers"])

    # Admin creates approved job
    client.post("/jobs", json={
        "title": "Approved Job",
        "company": "Co B",
        "description": "Desc",
        "location": "Remote",
        "employment_type": "full-time"
    }, headers=admin_user["headers"])

    res = client.get("/jobs", headers=student_user["headers"])
    assert res.status_code == 200
    jobs = res.json()
    assert len(jobs) == 1
    assert jobs[0]["title"] == "Approved Job"
    assert jobs[0]["status"] == "approved"


def test_jobs_mine_shows_user_jobs(client, verified_alumni_user, other_alumni_user):
    """GET /jobs/mine returns only jobs posted by the caller."""
    client.post("/jobs", json={
        "title": "Alumni 1 Job",
        "company": "Co A",
        "description": "Desc",
        "location": "Remote",
        "employment_type": "full-time"
    }, headers=verified_alumni_user["headers"])

    client.post("/jobs", json={
        "title": "Alumni 2 Job",
        "company": "Co B",
        "description": "Desc",
        "location": "Remote",
        "employment_type": "full-time"
    }, headers=other_alumni_user["headers"])

    res1 = client.get("/jobs/mine", headers=verified_alumni_user["headers"])
    assert res1.status_code == 200
    assert len(res1.json()) == 1
    assert res1.json()[0]["title"] == "Alumni 1 Job"


def test_admin_can_list_and_moderate_jobs(client, verified_alumni_user, admin_user, student_user):
    """Admin can list all jobs and approve/reject them. Non-admin gets 403."""
    # Non-admin gets 403 on admin list
    res_forbidden = client.get("/jobs/admin", headers=student_user["headers"])
    assert res_forbidden.status_code == 403

    # Alumni creates pending job
    res_create = client.post("/jobs", json={
        "title": "Alumni Job",
        "company": "Co A",
        "description": "Desc",
        "location": "Remote",
        "employment_type": "full-time"
    }, headers=verified_alumni_user["headers"])
    job_id = res_create.json()["job"]["id"]

    # Student cannot approve
    res_mod_forbidden = client.patch(f"/jobs/{job_id}/status", json={"status": "approved"}, headers=student_user["headers"])
    assert res_mod_forbidden.status_code == 403

    # Admin approves
    res_approve = client.patch(f"/jobs/{job_id}/status", json={"status": "approved"}, headers=admin_user["headers"])
    assert res_approve.status_code == 200
    assert res_approve.json()["job"]["status"] == "approved"


def test_delete_job_ownership_and_admin(client, verified_alumni_user, other_alumni_user, admin_user):
    """Job owner and admin can delete; unauthorized user gets 403."""
    res = client.post("/jobs", json={
        "title": "To Delete",
        "company": "Co A",
        "description": "Desc",
        "location": "Remote",
        "employment_type": "full-time"
    }, headers=verified_alumni_user["headers"])
    job_id = res.json()["job"]["id"]

    # Other alumni cannot delete
    res_del_forbidden = client.delete(f"/jobs/{job_id}", headers=other_alumni_user["headers"])
    assert res_del_forbidden.status_code == 403

    # Owner can delete
    res_del_owner = client.delete(f"/jobs/{job_id}", headers=verified_alumni_user["headers"])
    assert res_del_owner.status_code == 200

    # Admin can delete another job
    res2 = client.post("/jobs", json={
        "title": "Admin Delete Target",
        "company": "Co B",
        "description": "Desc",
        "location": "Remote",
        "employment_type": "full-time"
    }, headers=verified_alumni_user["headers"])
    job_id_2 = res2.json()["job"]["id"]

    res_del_admin = client.delete(f"/jobs/{job_id_2}", headers=admin_user["headers"])
    assert res_del_admin.status_code == 200


def test_expired_jobs_are_hidden_from_student_and_alumni_but_retained_for_admin(
    client,
    verified_alumni_user,
    student_user,
    admin_user,
):
    from datetime import datetime, timedelta, timezone
    import uuid
    from database import supabase

    deadline = (datetime.now(timezone.utc) - timedelta(days=35)).isoformat()
    job_id = str(uuid.uuid4())
    supabase.table("jobs").insert({
        "id": job_id,
        "posted_by": verified_alumni_user["id"],
        "title": "Expired Backend Engineer",
        "company": "Example Corp",
        "location": "Remote",
        "job_type": "full-time",
        "experience_level": "Entry",
        "salary_range": "",
        "description": "An expired test posting.",
        "requirements": "",
        "skills": [],
        "status": "approved",
        "application_deadline": deadline,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).execute()

    student_feed = client.get("/jobs", headers=student_user["headers"])
    alumni_feed = client.get("/jobs", headers=verified_alumni_user["headers"])
    alumni_mine = client.get("/jobs/mine", headers=verified_alumni_user["headers"])
    admin_feed = client.get("/jobs/admin", headers=admin_user["headers"])

    assert student_feed.status_code == 200
    assert alumni_feed.status_code == 200
    assert alumni_mine.status_code == 200
    assert all(job["id"] != job_id for job in student_feed.json())
    assert all(job["id"] != job_id for job in alumni_feed.json())
    assert all(job["id"] != job_id for job in alumni_mine.json())

    retained = next(job for job in admin_feed.json() if job["id"] == job_id)
    assert retained["is_expired"] is True
    assert retained["expired_at"]
    assert retained["auto_delete_at"]
    assert retained["days_until_auto_delete"] == 0


def test_expired_job_details_are_hidden_from_owner_but_visible_to_admin(
    client,
    verified_alumni_user,
    admin_user,
):
    from datetime import datetime, timedelta, timezone
    import uuid
    from database import supabase

    job_id = str(uuid.uuid4())
    supabase.table("jobs").insert({
        "id": job_id,
        "posted_by": verified_alumni_user["id"],
        "title": "Expired Design Engineer",
        "company": "Example Corp",
        "location": "Remote",
        "job_type": "full-time",
        "experience_level": "Entry",
        "salary_range": "",
        "description": "An expired test posting.",
        "requirements": "",
        "skills": [],
        "status": "approved",
        "application_deadline": (datetime.now(timezone.utc) - timedelta(days=2)).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).execute()

    owner_view = client.get(f"/jobs/{job_id}", headers=verified_alumni_user["headers"])
    admin_view = client.get(f"/jobs/{job_id}", headers=admin_user["headers"])

    assert owner_view.status_code == 404
    assert admin_view.status_code == 200
    assert admin_view.json()["is_expired"] is True
    assert admin_view.json()["auto_delete_at"]
