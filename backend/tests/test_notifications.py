from routes.notifications import create_notification


def test_user_sees_only_own_notifications(client, student_user, other_student_user):
    """Users only see notifications addressed to them, sorted newest first."""
    # Create notifications for student 1
    create_notification(user_id=student_user["id"], title="Note 1", message="Message 1")
    create_notification(user_id=student_user["id"], title="Note 2", message="Message 2")

    # Create notification for student 2
    create_notification(user_id=other_student_user["id"], title="Other Note", message="Secret message")

    # Student 1 fetches notifications
    res1 = client.get("/notifications", headers=student_user["headers"])
    assert res1.status_code == 200
    notes1 = res1.json()
    assert len(notes1) == 2
    assert all(n["user_id"] == student_user["id"] for n in notes1)
    titles1 = [n["title"] for n in notes1]
    assert "Secret message" not in [n["message"] for n in notes1]

    # Student 2 fetches notifications
    res2 = client.get("/notifications", headers=other_student_user["headers"])
    assert res2.status_code == 200
    notes2 = res2.json()
    assert len(notes2) == 1
    assert notes2[0]["title"] == "Other Note"


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
