from routes.notifications import create_notification


def test_admin_stats_authorization(client, student_user, verified_alumni_user, admin_user):
    """Only admin can access /admin/stats; students and alumni receive 403."""
    res_stu = client.get("/admin/stats", headers=student_user["headers"])
    assert res_stu.status_code == 403

    res_alu = client.get("/admin/stats", headers=verified_alumni_user["headers"])
    assert res_alu.status_code == 403

    res_admin = client.get("/admin/stats", headers=admin_user["headers"])
    assert res_admin.status_code == 200


def test_admin_stats_aggregation_accuracy(client, admin_user, student_user, verified_alumni_user, unverified_alumni_user):
    """Stats endpoint correctly aggregates users, alumni, jobs, applications, events, and notifications."""
    # Create an approved job
    res_job = client.post("/jobs", json={
        "title": "Admin Job",
        "company": "Enterprise Inc",
        "description": "Desc",
        "location": "Remote",
        "employment_type": "full-time"
    }, headers=admin_user["headers"])
    job_id = res_job.json()["job"]["id"]

    # Student applies to job
    client.post(f"/jobs/{job_id}/applications", json={
        "resume_url": "https://example.com/res.pdf"
    }, headers=student_user["headers"])

    # Admin creates an event
    res_ev = client.post("/events", json={
        "title": "Summit 2026",
        "description": "Desc",
        "event_date": "2026-12-15",
        "event_time": "09:00",
        "location": "Convention Center"
    }, headers=admin_user["headers"])
    event_id = res_ev.json()["event"]["id"]

    # Student registers for event
    client.post(f"/events/{event_id}/register", headers=student_user["headers"])

    # Admin creates an announcement
    client.post("/announcements", json={
        "title": "Platform Maintenance",
        "content": "Server updates scheduled",
        "target_audience": "all"
    }, headers=admin_user["headers"])

    # Notification created
    create_notification(user_id=student_user["id"], title="Alert", message="Hello")

    # Fetch stats
    res = client.get("/admin/stats", headers=admin_user["headers"])
    assert res.status_code == 200
    stats = res.json()

    # Users counts: 1 admin, 1 student, 2 alumni (1 verified, 1 unverified) = 4 users
    assert stats["users"]["total"] == 4
    assert stats["users"]["by_role"]["student"] == 1
    assert stats["users"]["by_role"]["alumni"] == 2
    assert stats["users"]["by_role"]["admin"] == 1

    # Alumni counts
    assert stats["alumni"]["total"] == 2
    assert stats["alumni"]["verified"] == 1
    assert stats["alumni"]["pending"] == 1

    # Jobs count
    assert stats["jobs"]["total"] == 1
    assert stats["jobs"]["by_status"].get("approved") == 1

    # Applications count
    assert stats["applications"]["total"] == 1
    assert stats["applications"]["by_status"].get("applied") == 1

    # Events and registrations
    assert stats["events"]["total"] == 1
    assert stats["events"]["by_status"].get("approved") == 1
    assert stats["event_registrations"]["total"] == 1

    # Announcements and notifications
    assert stats["announcements"]["total"] == 1
    assert stats["notifications"]["total"] == 1

    # Security check: Ensure no sensitive keys leaked
    raw_text = res.text.lower()
    assert "password" not in raw_text
    assert "secret" not in raw_text
    assert "hash" not in raw_text


def test_alumni_pending_and_verification(client, admin_user, student_user, unverified_alumni_user):
    """Admin can view pending alumni and approve/reject/suspend them. Non-admin gets 403."""
    # Non-admin cannot view pending alumni
    res_forbid = client.get("/alumni/pending", headers=student_user["headers"])
    assert res_forbid.status_code == 403

    # Admin lists pending alumni
    res_list = client.get("/alumni/pending", headers=admin_user["headers"])
    assert res_list.status_code == 200
    pending_list = res_list.json()
    assert any(a["id"] == unverified_alumni_user["id"] for a in pending_list)

    # Student cannot verify alumni
    res_v_forbid = client.patch(
        f"/alumni/verify/{unverified_alumni_user['id']}?status=approved",
        headers=student_user["headers"]
    )
    assert res_v_forbid.status_code == 403

    # Invalid status returns 400
    res_v_bad = client.patch(
        f"/alumni/verify/{unverified_alumni_user['id']}?status=invalid_status",
        headers=admin_user["headers"]
    )
    assert res_v_bad.status_code == 400

    # Admin approves alumni
    res_approve = client.patch(
        f"/alumni/verify/{unverified_alumni_user['id']}?status=approved",
        headers=admin_user["headers"]
    )
    assert res_approve.status_code == 200
    assert res_approve.json()["is_verified"] is True
    assert res_approve.json()["status"] == "approved"

    # Pending list should now be empty of this alumni
    res_list_after = client.get("/alumni/pending", headers=admin_user["headers"])
    assert res_list_after.status_code == 200
    assert not any(a["id"] == unverified_alumni_user["id"] for a in res_list_after.json())
