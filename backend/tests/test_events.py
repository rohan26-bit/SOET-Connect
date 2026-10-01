def test_event_creation_role_permissions(client, student_user, unverified_alumni_user, verified_alumni_user, admin_user):
    """Students and unverified alumni cannot create events; verified alumni and admin can."""
    payload = {
        "title": "Tech Talk 2026",
        "description": "Annual tech seminar",
        "event_date": "2026-11-15",
        "event_time": "10:00 AM",
        "location": "Auditorium",
        "event_type": "technical"
    }

    # Student cannot create event
    res_stu = client.post("/events", json=payload, headers=student_user["headers"])
    assert res_stu.status_code == 403
    assert "Only verified alumni and admin users can create events" in res_stu.json().get("detail", "")

    # Unverified alumni cannot create event
    res_unver = client.post("/events", json=payload, headers=unverified_alumni_user["headers"])
    assert res_unver.status_code == 403
    assert "must be verified" in res_unver.json().get("detail", "")

    # Verified alumni creates event (pending status)
    res_alumni = client.post("/events", json=payload, headers=verified_alumni_user["headers"])
    assert res_alumni.status_code == 200
    alumni_event = res_alumni.json()["event"]
    assert alumni_event["status"] == "pending"
    assert alumni_event["created_by"] == verified_alumni_user["id"]

    # Admin creates event (approved status)
    admin_payload = dict(payload, title="Admin Masterclass")
    res_admin = client.post("/events", json=admin_payload, headers=admin_user["headers"])
    assert res_admin.status_code == 200
    admin_event = res_admin.json()["event"]
    assert admin_event["status"] == "approved"


def test_get_events_visibility(client, verified_alumni_user, admin_user, student_user):
    """General users see approved events + their own events. Admin sees all."""
    # Alumni creates pending event
    client.post("/events", json={
        "title": "Alumni Pending Event",
        "description": "Desc",
        "event_date": "2026-11-20",
        "event_time": "10:00",
        "location": "Auditorium"
    }, headers=verified_alumni_user["headers"])

    # Admin creates approved event
    client.post("/events", json={
        "title": "Public Approved Event",
        "description": "Desc",
        "event_date": "2026-11-21",
        "event_time": "11:00",
        "location": "Hall A"
    }, headers=admin_user["headers"])

    # Student only sees approved event
    res_stu = client.get("/events", headers=student_user["headers"])
    assert res_stu.status_code == 200
    stu_events = res_stu.json()
    assert len(stu_events) == 1
    assert stu_events[0]["title"] == "Public Approved Event"

    # Alumni sees approved event + their own pending event
    res_alumni = client.get("/events", headers=verified_alumni_user["headers"])
    assert res_alumni.status_code == 200
    assert len(res_alumni.json()) == 2

    # Admin sees all events
    res_admin = client.get("/events", headers=admin_user["headers"])
    assert res_admin.status_code == 200
    assert len(res_admin.json()) == 2


def test_event_registration_rules(client, verified_alumni_user, admin_user, student_user, other_student_user):
    """Registration requires approved status and prevents duplicate registrations."""
    # Create pending event
    res_pending = client.post("/events", json={
        "title": "Pending Event",
        "description": "Desc",
        "event_date": "2026-12-01",
        "event_time": "14:00",
        "location": "Online"
    }, headers=verified_alumni_user["headers"])
    pending_id = res_pending.json()["event"]["id"]

    # Attempting to register for pending event returns 400
    res_fail = client.post(f"/events/{pending_id}/register", headers=student_user["headers"])
    assert res_fail.status_code == 400
    assert "only accepted for approved events" in res_fail.json().get("detail", "")

    # Admin creates approved event
    res_approved = client.post("/events", json={
        "title": "Approved Hackathon",
        "description": "Hackathon",
        "event_date": "2026-12-10",
        "event_time": "09:00",
        "location": "Lab 1"
    }, headers=admin_user["headers"])
    approved_id = res_approved.json()["event"]["id"]

    # Student registers successfully
    res_reg1 = client.post(f"/events/{approved_id}/register", headers=student_user["headers"])
    assert res_reg1.status_code == 200
    assert res_reg1.json()["registration"]["user_id"] == student_user["id"]

    # Duplicate registration returns 400
    res_reg_dup = client.post(f"/events/{approved_id}/register", headers=student_user["headers"])
    assert res_reg_dup.status_code == 400
    assert "already registered" in res_reg_dup.json().get("detail", "")

    # Other student can register
    res_reg2 = client.post(f"/events/{approved_id}/register", headers=other_student_user["headers"])
    assert res_reg2.status_code == 200

    # User views only their own registrations
    res_my_regs = client.get("/events/registrations/me", headers=student_user["headers"])
    assert res_my_regs.status_code == 200
    assert len(res_my_regs.json()) == 1
    assert res_my_regs.json()[0]["user_id"] == student_user["id"]


def test_view_event_registrations_authorization(client, verified_alumni_user, other_alumni_user, admin_user, student_user):
    """Event owner and admin can view registrations; other users receive 403."""
    # Admin creates event
    res_ev = client.post("/events", json={
        "title": "Networking Night",
        "description": "Desc",
        "event_date": "2026-12-15",
        "event_time": "18:00",
        "location": "Terrace"
    }, headers=admin_user["headers"])
    event_id = res_ev.json()["event"]["id"]

    # Student registers
    client.post(f"/events/{event_id}/register", headers=student_user["headers"])

    # Admin can view
    res_admin = client.get(f"/events/{event_id}/registrations", headers=admin_user["headers"])
    assert res_admin.status_code == 200
    assert len(res_admin.json()) == 1

    # Non-creator alumni receives 403
    res_forbidden = client.get(f"/events/{event_id}/registrations", headers=verified_alumni_user["headers"])
    assert res_forbidden.status_code == 403


def test_event_update_and_delete_permissions(client, verified_alumni_user, other_alumni_user, admin_user):
    """Owner and admin can update and delete; unauthorized user receives 403."""
    res_ev = client.post("/events", json={
        "title": "Initial Title",
        "description": "Desc",
        "event_date": "2026-12-20",
        "event_time": "10:00",
        "location": "Room 101"
    }, headers=verified_alumni_user["headers"])
    event_id = res_ev.json()["event"]["id"]

    # Other alumni cannot update
    res_up_forbid = client.patch(f"/events/{event_id}", json={"title": "Hacked Title"}, headers=other_alumni_user["headers"])
    assert res_up_forbid.status_code == 403

    # Owner can update
    res_up = client.patch(f"/events/{event_id}", json={"title": "Updated Title"}, headers=verified_alumni_user["headers"])
    assert res_up.status_code == 200
    assert res_up.json()["event"]["title"] == "Updated Title"

    # Other alumni cannot delete
    res_del_forbid = client.delete(f"/events/{event_id}", headers=other_alumni_user["headers"])
    assert res_del_forbid.status_code == 403

    # Owner can delete
    res_del = client.delete(f"/events/{event_id}", headers=verified_alumni_user["headers"])
    assert res_del.status_code == 200
