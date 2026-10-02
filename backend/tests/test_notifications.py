from bson import ObjectId
from database import users_collection
from routes.notifications import create_notification
from services.notifications import NOTIFICATION_TYPES, load_notifications


# ============================================================
# NOTIFICATION API TESTS
# ============================================================

def test_unauthenticated_requests(client):
    res = client.get("/notifications")
    assert res.status_code == 401

    res = client.patch("/notifications/fake-id/read")
    assert res.status_code == 401

    res = client.patch("/notifications/read-all")
    assert res.status_code == 401


def test_empty_notification_list(client, student_user):
    res = client.get("/notifications", headers=student_user["headers"])
    assert res.status_code == 200
    assert res.json() == []


def test_user_sees_only_own_notifications(client, student_user, other_student_user):
    """Users only see notifications addressed to them, sorted newest first."""
    create_notification(user_id=student_user["id"], title="Note 1", message="Message 1")
    create_notification(user_id=student_user["id"], title="Note 2", message="Message 2")
    create_notification(user_id=other_student_user["id"], title="Other Note", message="Secret message")

    res1 = client.get("/notifications", headers=student_user["headers"])
    assert res1.status_code == 200
    notes1 = res1.json()
    assert len(notes1) == 2
    assert all(n["user_id"] == student_user["id"] for n in notes1)
    titles1 = [n["title"] for n in notes1]
    assert "Secret message" not in [n["message"] for n in notes1]

    res2 = client.get("/notifications", headers=other_student_user["headers"])
    assert res2.status_code == 200
    notes2 = res2.json()
    assert len(notes2) == 1
    assert notes2[0]["title"] == "Other Note"


def test_notification_ordering_newest_first(client, student_user):
    """Verify newest-first ordering when timestamps differ."""
    from datetime import datetime, timezone, timedelta
    from services.notifications import load_notifications, save_notifications

    n1 = create_notification(user_id=student_user["id"], title="Older Note", message="1")
    n2 = create_notification(user_id=student_user["id"], title="Newer Note", message="2")

    all_n = load_notifications()
    for n in all_n:
        if n["id"] == n1["id"]:
            n["created_at"] = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
        elif n["id"] == n2["id"]:
            n["created_at"] = datetime.now(timezone.utc).isoformat()
    save_notifications(all_n)

    res = client.get("/notifications", headers=student_user["headers"])
    assert res.status_code == 200
    notes = res.json()
    assert notes[0]["title"] == "Newer Note"
    assert notes[1]["title"] == "Older Note"


def test_mark_notification_read_ownership(client, student_user, other_student_user):
    """User can mark own notification read; modifying another's returns 403."""
    note = create_notification(user_id=student_user["id"], title="Target Note", message="Test message")
    note_id = note["id"]

    # Other student tries to mark it as read -> 403
    res_forbidden = client.patch(f"/notifications/{note_id}/read", headers=other_student_user["headers"])
    assert res_forbidden.status_code == 403
    assert "only modify your own notifications" in res_forbidden.json().get("detail", "")

    # Non-existent notification returns 404
    res_not_found = client.patch("/notifications/nonexistent-id/read", headers=student_user["headers"])
    assert res_not_found.status_code == 404

    # Owner marks as read -> 200
    res_ok = client.patch(f"/notifications/{note_id}/read", headers=student_user["headers"])
    assert res_ok.status_code == 200
    assert res_ok.json()["notification"]["is_read"] is True


def test_mark_all_notifications_read(client, student_user, other_student_user):
    """PATCH /notifications/read-all marks only current user's unread notifications."""
    create_notification(user_id=student_user["id"], title="S1 Note 1", message="Msg")
    create_notification(user_id=student_user["id"], title="S1 Note 2", message="Msg")
    create_notification(user_id=other_student_user["id"], title="S2 Note 1", message="Msg")

    res = client.patch("/notifications/read-all", headers=student_user["headers"])
    assert res.status_code == 200
    assert res.json()["updated_count"] == 2

    # S1 has 0 unread
    s1_notes = client.get("/notifications", headers=student_user["headers"]).json()
    assert all(n["is_read"] is True for n in s1_notes)

    # S2 still has unread
    s2_notes = client.get("/notifications", headers=other_student_user["headers"]).json()
    assert s2_notes[0]["is_read"] is False


# ============================================================
# ALUMNI VERIFICATION TRIGGERS
# ============================================================

def test_alumni_verification_triggers(client, admin_user, unverified_alumni_user, other_student_user):
    alumni_id = unverified_alumni_user["id"]

    # 1. Admin approves alumni
    res_approve = client.patch(
        f"/alumni/verify/{alumni_id}?status=approved",
        headers=admin_user["headers"]
    )
    assert res_approve.status_code == 200

    # Alumni should have approval notification
    notes = client.get("/notifications", headers=unverified_alumni_user["headers"]).json()
    assert len(notes) == 1
    assert notes[0]["title"] == "Alumni verification approved"
    assert notes[0]["type"] == NOTIFICATION_TYPES["alumni_verification"]

    # 2. Repeated approval with same status does not duplicate notification
    client.patch(f"/alumni/verify/{alumni_id}?status=approved", headers=admin_user["headers"])
    notes2 = client.get("/notifications", headers=unverified_alumni_user["headers"]).json()
    assert len(notes2) == 1

    # 3. Admin rejects alumni
    res_reject = client.patch(
        f"/alumni/verify/{alumni_id}?status=rejected",
        headers=admin_user["headers"]
    )
    assert res_reject.status_code == 200

    notes3 = client.get("/notifications", headers=unverified_alumni_user["headers"]).json()
    assert len(notes3) == 2
    assert notes3[0]["title"] == "Alumni verification rejected"

    # 4. Repeated rejection does not duplicate
    client.patch(f"/alumni/verify/{alumni_id}?status=rejected", headers=admin_user["headers"])
    notes4 = client.get("/notifications", headers=unverified_alumni_user["headers"]).json()
    assert len(notes4) == 2

    # Unrelated user received 0 notifications
    other_notes = client.get("/notifications", headers=other_student_user["headers"]).json()
    assert len(other_notes) == 0


# ============================================================
# JOB TRIGGERS
# ============================================================

def test_job_triggers(client, admin_user, verified_alumni_user, other_student_user):
    # 1. Alumni creates pending job -> submission notification
    job_payload = {
        "title": "Software Engineer",
        "company": "Tech Innovations",
        "description": "Building great systems",
        "location": "Pune",
        "employment_type": "Full-time",
    }
    create_res = client.post("/jobs", headers=verified_alumni_user["headers"], json=job_payload)
    assert create_res.status_code == 200
    job_id = create_res.json()["job"]["id"]

    alumni_notes = client.get("/notifications", headers=verified_alumni_user["headers"]).json()
    assert len(alumni_notes) == 1
    assert alumni_notes[0]["title"] == "Job submission received"
    assert "Software Engineer" in alumni_notes[0]["message"]
    assert alumni_notes[0]["type"] == NOTIFICATION_TYPES["job_submission"]

    # 2. Admin creates already-approved job -> NO pending notification
    admin_job_payload = {
        "title": "Data Analyst",
        "company": "Admin Org",
        "description": "Analytics role",
        "location": "Remote",
        "employment_type": "Full-time",
    }
    admin_create_res = client.post("/jobs", headers=admin_user["headers"], json=admin_job_payload)
    assert admin_create_res.status_code == 200
    admin_notes = client.get("/notifications", headers=admin_user["headers"]).json()
    assert len(admin_notes) == 0

    # 3. Admin approves alumni job -> owner receives approval notification
    approve_res = client.patch(
        f"/jobs/{job_id}/status",
        headers=admin_user["headers"],
        json={"status": "approved"}
    )
    assert approve_res.status_code == 200

    alumni_notes2 = client.get("/notifications", headers=verified_alumni_user["headers"]).json()
    assert len(alumni_notes2) == 2
    assert alumni_notes2[0]["title"] == "Job posting approved"
    assert alumni_notes2[0]["type"] == NOTIFICATION_TYPES["job_approval"]

    # 4. Repeated same approval does not duplicate
    client.patch(f"/jobs/{job_id}/status", headers=admin_user["headers"], json={"status": "approved"})
    alumni_notes_repeat = client.get("/notifications", headers=verified_alumni_user["headers"]).json()
    assert len(alumni_notes_repeat) == 2

    # 5. Admin rejects job -> owner receives rejection notification
    reject_res = client.patch(
        f"/jobs/{job_id}/status",
        headers=admin_user["headers"],
        json={"status": "rejected"}
    )
    assert reject_res.status_code == 200

    alumni_notes3 = client.get("/notifications", headers=verified_alumni_user["headers"]).json()
    assert len(alumni_notes3) == 3
    assert alumni_notes3[0]["title"] == "Job posting rejected"
    assert alumni_notes3[0]["type"] == NOTIFICATION_TYPES["job_rejection"]


# ============================================================
# APPLICATION TRIGGERS
# ============================================================

def test_application_triggers(client, admin_user, verified_alumni_user, student_user, other_student_user):
    # Setup approved job
    job_payload = {
        "title": "Backend Intern",
        "company": "FastAPI Solutions",
        "description": "Internship opening",
        "location": "Remote",
        "employment_type": "Internship",
    }
    job_res = client.post("/jobs", headers=verified_alumni_user["headers"], json=job_payload)
    job_id = job_res.json()["job"]["id"]
    client.patch(f"/jobs/{job_id}/status", headers=admin_user["headers"], json={"status": "approved"})

    # 1. Student applies -> Job poster notified
    apply_res = client.post(
        "/applications/apply",
        headers=student_user["headers"],
        json={"job_id": job_id, "cover_letter": "I love Python"}
    )
    assert apply_res.status_code == 200
    app_id = apply_res.json()["application"]["id"]

    poster_notes = client.get("/notifications", headers=verified_alumni_user["headers"]).json()
    app_notes = [n for n in poster_notes if n.get("type") == NOTIFICATION_TYPES["job_application"]]
    assert len(app_notes) == 1
    assert app_notes[0]["title"] == "New job application"
    assert student_user["name"] in app_notes[0]["message"]
    assert "Backend Intern" in app_notes[0]["message"]

    # 2. Application status update -> Student notified
    status_res = client.patch(
        f"/applications/{app_id}/status",
        headers=verified_alumni_user["headers"],
        json={"status": "shortlisted"}
    )
    assert status_res.status_code == 200

    student_notes = client.get("/notifications", headers=student_user["headers"]).json()
    assert len(student_notes) == 1
    assert student_notes[0]["title"] == "Application status updated"
    assert "shortlisted" in student_notes[0]["message"]
    assert student_notes[0]["type"] == NOTIFICATION_TYPES["application_status"]

    # 3. Repeated same status -> no duplicate
    client.patch(
        f"/applications/{app_id}/status",
        headers=verified_alumni_user["headers"],
        json={"status": "shortlisted"}
    )
    student_notes2 = client.get("/notifications", headers=student_user["headers"]).json()
    assert len(student_notes2) == 1


# ============================================================
# EVENT TRIGGERS & CANCELLATION
# ============================================================

def test_event_triggers_and_cancellation(client, admin_user, student_user, other_student_user):
    # 1. Student suggests pending event -> Creator receives submission notification
    event_payload = {
        "title": "Hackathon 2026",
        "description": "Code all night",
        "event_type": "Hackathon",
        "location": "Campus Lab",
        "start_date": "2026-11-01T09:00:00Z",
    }
    create_res = client.post("/events", headers=student_user["headers"], json=event_payload)
    assert create_res.status_code == 200
    event_id = create_res.json()["event"]["id"]

    student_notes = client.get("/notifications", headers=student_user["headers"]).json()
    assert len(student_notes) == 1
    assert student_notes[0]["title"] == "Event submitted for review"
    assert student_notes[0]["type"] == NOTIFICATION_TYPES["event_submission"]

    # 2. Admin approves event -> Creator receives approval notification
    approve_res = client.patch(
        f"/events/{event_id}",
        headers=admin_user["headers"],
        json={"status": "approved"}
    )
    assert approve_res.status_code == 200

    student_notes2 = client.get("/notifications", headers=student_user["headers"]).json()
    assert len(student_notes2) == 2
    assert student_notes2[0]["title"] == "Event approved"
    assert student_notes2[0]["type"] == NOTIFICATION_TYPES["event_approval"]

    # Repeated approval does not duplicate
    client.patch(f"/events/{event_id}", headers=admin_user["headers"], json={"status": "approved"})
    student_notes_rep = client.get("/notifications", headers=student_user["headers"]).json()
    assert len(student_notes_rep) == 2

    # 3. Other student registers -> Registration confirmation notification
    reg_res = client.post(f"/events/{event_id}/register", headers=other_student_user["headers"])
    assert reg_res.status_code == 200

    other_notes = client.get("/notifications", headers=other_student_user["headers"]).json()
    assert len(other_notes) == 1
    assert other_notes[0]["title"] == "Event registration confirmed"
    assert other_notes[0]["type"] == NOTIFICATION_TYPES["event_registration"]

    # 4. Event cancelled -> Registered participant notified; unregistered users NOT notified
    cancel_res = client.patch(
        f"/events/{event_id}",
        headers=admin_user["headers"],
        json={"status": "cancelled"}
    )
    assert cancel_res.status_code == 200

    other_notes2 = client.get("/notifications", headers=other_student_user["headers"]).json()
    assert len(other_notes2) == 2
    assert other_notes2[0]["title"] == "Event cancelled"
    assert other_notes2[0]["type"] == NOTIFICATION_TYPES["event_cancellation"]

    # Repeated cancellation does not duplicate
    client.patch(f"/events/{event_id}", headers=admin_user["headers"], json={"status": "cancelled"})
    other_notes3 = client.get("/notifications", headers=other_student_user["headers"]).json()
    assert len(other_notes3) == 2


# ============================================================
# ANNOUNCEMENT TRIGGERS
# ============================================================

def test_announcement_triggers(client, admin_user, student_user, verified_alumni_user):
    # Setup an inactive student to verify inactive users are excluded
    users_collection.insert_one({
        "_id": ObjectId(),
        "name": "Deactivated Student",
        "email": "inactive@example.com",
        "role": "student",
        "is_active": False,
    })

    # 1. Admin posts announcement for "all"
    res_all = client.post(
        "/announcements",
        headers=admin_user["headers"],
        json={"title": "Campus Closed", "content": "Holiday", "target_audience": "all"}
    )
    assert res_all.status_code == 200

    student_notes = client.get("/notifications", headers=student_user["headers"]).json()
    alumni_notes = client.get("/notifications", headers=verified_alumni_user["headers"]).json()
    admin_notes = client.get("/notifications", headers=admin_user["headers"]).json()

    assert any(n["title"] == "New announcement" and "Campus Closed" in n["message"] for n in student_notes)
    assert any(n["title"] == "New announcement" and "Campus Closed" in n["message"] for n in alumni_notes)
    # Admin does NOT receive announcement notification
    assert len(admin_notes) == 0

    # Inactive user does not have any notification in the stored data
    all_stored = load_notifications()
    inactive_user = users_collection.find_one({"email": "inactive@example.com"})
    assert not any(str(n.get("user_id")) == str(inactive_user["_id"]) for n in all_stored)

    # 2. Admin posts announcement for "students" only
    res_students = client.post(
        "/announcements",
        headers=admin_user["headers"],
        json={"title": "Exam Schedule", "content": "Exams start Monday", "target_audience": "students"}
    )
    assert res_students.status_code == 200

    student_notes2 = client.get("/notifications", headers=student_user["headers"]).json()
    alumni_notes2 = client.get("/notifications", headers=verified_alumni_user["headers"]).json()
    assert any("Exam Schedule" in n["message"] for n in student_notes2)
    assert not any("Exam Schedule" in n["message"] for n in alumni_notes2)

    # 3. GET /announcements does not generate any notifications
    count_before = len(load_notifications())
    client.get("/announcements", headers=student_user["headers"])
    client.get("/announcements", headers=verified_alumni_user["headers"])
    count_after = len(load_notifications())
    assert count_before == count_after


# ============================================================
# SECURITY & DATA ISOLATION
# ============================================================

def test_security_and_data_isolation(client, student_user, other_student_user):
    create_notification(user_id=student_user["id"], title="Private Note", message="Confidential content")

    # Attempt to pass query param user_id to steal notifications
    res = client.get(
        f"/notifications?user_id={student_user['id']}",
        headers=other_student_user["headers"]
    )
    assert res.status_code == 200
    assert len(res.json()) == 0

    # Ensure no secrets leak in notification payload
    notes = client.get("/notifications", headers=student_user["headers"]).json()
    note_str = str(notes[0])
    assert "password" not in note_str
    assert "secret" not in note_str.lower() or "Confidential" in note_str
