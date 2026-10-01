def test_create_announcement_permissions(client, student_user, verified_alumni_user, admin_user):
    """Only admins can create announcements; students and alumni receive 403."""
    payload = {
        "title": "Campus Closed",
        "content": "Campus is closed for holiday.",
        "target_audience": "all"
    }

    # Student cannot create
    res_stu = client.post("/announcements", json=payload, headers=student_user["headers"])
    assert res_stu.status_code == 403

    # Alumni cannot create
    res_alu = client.post("/announcements", json=payload, headers=verified_alumni_user["headers"])
    assert res_alu.status_code == 403

    # Invalid audience returns 400
    res_bad_aud = client.post("/announcements", json=dict(payload, target_audience="parents"), headers=admin_user["headers"])
    assert res_bad_aud.status_code == 400

    # Admin creates successfully
    res_ok = client.post("/announcements", json=payload, headers=admin_user["headers"])
    assert res_ok.status_code == 200
    assert res_ok.json()["announcement"]["title"] == "Campus Closed"


def test_announcements_audience_filtering(client, admin_user, student_user, verified_alumni_user):
    """Students see 'all' and 'students'; alumni see 'all' and 'alumni'; admin sees everything."""
    # 1. All audience
    client.post("/announcements", json={
        "title": "General News",
        "content": "News for all",
        "target_audience": "all"
    }, headers=admin_user["headers"])

    # 2. Students audience
    client.post("/announcements", json={
        "title": "Exam Schedule",
        "content": "End-term exam schedule released",
        "target_audience": "students"
    }, headers=admin_user["headers"])

    # 3. Alumni audience
    client.post("/announcements", json={
        "title": "Alumni Meet 2026",
        "content": "Annual reunion details",
        "target_audience": "alumni"
    }, headers=admin_user["headers"])

    # Student check
    res_stu = client.get("/announcements", headers=student_user["headers"])
    assert res_stu.status_code == 200
    stu_titles = [a["title"] for a in res_stu.json()]
    assert "General News" in stu_titles
    assert "Exam Schedule" in stu_titles
    assert "Alumni Meet 2026" not in stu_titles
    assert len(stu_titles) == 2

    # Alumni check
    res_alu = client.get("/announcements", headers=verified_alumni_user["headers"])
    assert res_alu.status_code == 200
    alu_titles = [a["title"] for a in res_alu.json()]
    assert "General News" in alu_titles
    assert "Alumni Meet 2026" in alu_titles
    assert "Exam Schedule" not in alu_titles
    assert len(alu_titles) == 2

    # Admin check
    res_admin = client.get("/announcements", headers=admin_user["headers"])
    assert res_admin.status_code == 200
    assert len(res_admin.json()) == 3


def test_update_and_delete_announcements(client, admin_user, student_user):
    """Admin can update and delete announcements; non-admin receives 403."""
    res_create = client.post("/announcements", json={
        "title": "Draft Announcement",
        "content": "Old content",
        "target_audience": "all"
    }, headers=admin_user["headers"])
    ann_id = res_create.json()["announcement"]["id"]

    # Student cannot update
    res_stu_up = client.patch(f"/announcements/{ann_id}", json={"title": "Hacked"}, headers=student_user["headers"])
    assert res_stu_up.status_code == 403

    # Admin updates
    res_up = client.patch(f"/announcements/{ann_id}", json={"title": "Updated Announcement"}, headers=admin_user["headers"])
    assert res_up.status_code == 200
    assert res_up.json()["announcement"]["title"] == "Updated Announcement"

    # Student cannot delete
    res_stu_del = client.delete(f"/announcements/{ann_id}", headers=student_user["headers"])
    assert res_stu_del.status_code == 403

    # Admin deletes
    res_del = client.delete(f"/announcements/{ann_id}", headers=admin_user["headers"])
    assert res_del.status_code == 200

    # Getting deleted item or deleting again returns 404
    res_del_again = client.delete(f"/announcements/{ann_id}", headers=admin_user["headers"])
    assert res_del_again.status_code == 404
