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
