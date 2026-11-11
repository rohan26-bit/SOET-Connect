from bson import ObjectId
from datetime import datetime, timedelta, timezone
import pytest

from database import database, users_collection
import routes.chat as chat_routes


@pytest.fixture(autouse=True)
def clean_chat_collections():
    """Ensure clean chat collections before and after each test."""
    database["conversations"].delete_many({})
    database["messages"].delete_many({})
    yield
    database["conversations"].delete_many({})
    database["messages"].delete_many({})


# ============================================================
# AUTHENTICATION & AUTHORIZATION TESTS
# ============================================================

def test_unauthenticated_requests(client):
    fake_id = str(ObjectId())

    res = client.get("/chat/conversations")
    assert res.status_code == 401

    res = client.post("/chat/conversations", json={"participant_id": fake_id})
    assert res.status_code == 401

    res = client.get(f"/chat/conversations/{fake_id}")
    assert res.status_code == 401

    res = client.delete(f"/chat/conversations/{fake_id}")
    assert res.status_code == 401

    res = client.get(f"/chat/conversations/{fake_id}/messages")
    assert res.status_code == 401

    res = client.post(f"/chat/conversations/{fake_id}/messages", json={"content": "hello"})
    assert res.status_code == 401

    res = client.patch(f"/chat/messages/{fake_id}/read")
    assert res.status_code == 401


def test_deactivated_authenticated_user(client, student_user):
    users_collection.update_one(
        {"_id": student_user["doc_id"]},
        {"$set": {"is_active": False}}
    )

    res = client.get("/chat/conversations", headers=student_user["headers"])
    assert res.status_code == 403
    assert "deactivated" in res.json()["detail"].lower()


def test_deleted_or_missing_authenticated_user(client, student_user):
    users_collection.delete_one({"_id": student_user["doc_id"]})

    res = client.get("/chat/conversations", headers=student_user["headers"])
    assert res.status_code == 404
    assert "not found" in res.json()["detail"].lower()


# ============================================================
# CONVERSATION CREATION & RETRIEVAL TESTS
# ============================================================

def test_create_and_retrieve_conversation(client, student_user, verified_alumni_user):
    # 1. Create new conversation
    res = client.post(
        "/chat/conversations",
        headers=student_user["headers"],
        json={"participant_id": verified_alumni_user["id"]}
    )
    assert res.status_code == 201
    data = res.json()
    assert data["is_new"] is True
    conv_id = data["id"]
    assert student_user["id"] in data["participant_ids"]
    assert verified_alumni_user["id"] in data["participant_ids"]
    assert data["unread_count"] == 0

    # 2. Retrieving existing conversation via POST returns 200 and is_new=False
    res2 = client.post(
        "/chat/conversations",
        headers=student_user["headers"],
        json={"participant_id": verified_alumni_user["id"]}
    )
    assert res2.status_code == 200
    data2 = res2.json()
    assert data2["is_new"] is False
    assert data2["id"] == conv_id

    # 3. Alumni calling with student as target returns same conversation
    res3 = client.post(
        "/chat/conversations",
        headers=verified_alumni_user["headers"],
        json={"participant_id": student_user["id"]}
    )
    assert res3.status_code == 200
    assert res3.json()["id"] == conv_id
    assert res3.json()["is_new"] is False

    # Confirm only one conversation exists in database
    assert database["conversations"].count_documents({}) == 1


def test_create_conversation_with_self_fails(client, student_user):
    res = client.post(
        "/chat/conversations",
        headers=student_user["headers"],
        json={"participant_id": student_user["id"]}
    )
    assert res.status_code == 400
    assert "yourself" in res.json()["detail"].lower()


def test_create_conversation_target_not_found(client, student_user):
    res = client.post(
        "/chat/conversations",
        headers=student_user["headers"],
        json={"participant_id": str(ObjectId())}
    )
    assert res.status_code == 404
    assert "target user not found" in res.json()["detail"].lower()


def test_create_conversation_target_inactive(client, student_user, other_student_user):
    users_collection.update_one(
        {"_id": other_student_user["doc_id"]},
        {"$set": {"is_active": False}}
    )

    res = client.post(
        "/chat/conversations",
        headers=student_user["headers"],
        json={"participant_id": other_student_user["id"]}
    )
    assert res.status_code == 400
    assert "inactive" in res.json()["detail"].lower()


# ============================================================
# CONVERSATION LIST & DETAILS TESTS
# ============================================================

def test_list_conversations_and_ordering(client, student_user, other_student_user, verified_alumni_user):
    # Student starts conv with Alumni
    res1 = client.post(
        "/chat/conversations",
        headers=student_user["headers"],
        json={"participant_id": verified_alumni_user["id"]}
    )
    conv1_id = res1.json()["id"]

    # Student starts conv with Other Student
    res2 = client.post(
        "/chat/conversations",
        headers=student_user["headers"],
        json={"participant_id": other_student_user["id"]}
    )
    conv2_id = res2.json()["id"]

    # Send message in conv1 to make it the most recent activity
    client.post(
        f"/chat/conversations/{conv1_id}/messages",
        headers=student_user["headers"],
        json={"content": "New message in conv 1"}
    )

    # Student listing should show conv1 first
    res = client.get("/chat/conversations", headers=student_user["headers"])
    assert res.status_code == 200
    convs = res.json()
    assert len(convs) == 2
    assert convs[0]["id"] == conv1_id
    assert convs[1]["id"] == conv2_id

    # Alumni listing should only show conv1
    res_alumni = client.get("/chat/conversations", headers=verified_alumni_user["headers"])
    assert res_alumni.status_code == 200
    alumni_convs = res_alumni.json()
    assert len(alumni_convs) == 1
    assert alumni_convs[0]["id"] == conv1_id
    assert alumni_convs[0]["unread_count"] == 1


def test_get_single_conversation_and_authorization(
    client, student_user, verified_alumni_user, other_student_user, admin_user
):
    res = client.post(
        "/chat/conversations",
        headers=student_user["headers"],
        json={"participant_id": verified_alumni_user["id"]}
    )
    conv_id = res.json()["id"]

    # Participant (student) can access
    res = client.get(f"/chat/conversations/{conv_id}", headers=student_user["headers"])
    assert res.status_code == 200
    assert res.json()["id"] == conv_id

    # Participant (alumni) can access
    res = client.get(f"/chat/conversations/{conv_id}", headers=verified_alumni_user["headers"])
    assert res.status_code == 200
    assert res.json()["id"] == conv_id

    # Non-participant receives 403
    res = client.get(f"/chat/conversations/{conv_id}", headers=other_student_user["headers"])
    assert res.status_code == 403

    # Admin receives 403 (no backdoor into private chats)
    res = client.get(f"/chat/conversations/{conv_id}", headers=admin_user["headers"])
    assert res.status_code == 403

    # Malformed ID returns 404
    res = client.get("/chat/conversations/not-a-valid-oid", headers=student_user["headers"])
    assert res.status_code == 404

    # Non-existent ID returns 404
    res = client.get(f"/chat/conversations/{str(ObjectId())}", headers=student_user["headers"])
    assert res.status_code == 404


# ============================================================
# ARCHIVE / SOFT DELETE TESTS
# ============================================================

def test_archive_and_unarchive_conversation(client, student_user, verified_alumni_user):
    res = client.post(
        "/chat/conversations",
        headers=student_user["headers"],
        json={"participant_id": verified_alumni_user["id"]}
    )
    conv_id = res.json()["id"]

    message_res = client.post(
        f"/chat/conversations/{conv_id}/messages",
        headers=student_user["headers"],
        json={"content": "Archive guard test"},
    )
    assert message_res.status_code == 201

    # Student archives/deletes the conversation
    del_res = client.delete(f"/chat/conversations/{conv_id}", headers=student_user["headers"])
    assert del_res.status_code == 200

    # Student can no longer see it in GET /conversations
    res = client.get("/chat/conversations", headers=student_user["headers"])
    assert len(res.json()) == 0

    # Student GET /conversations/{id} returns 404
    res = client.get(f"/chat/conversations/{conv_id}", headers=student_user["headers"])
    assert res.status_code == 404

    # The direct message-history endpoint must enforce the same per-user archive.
    hidden_history = client.get(
        f"/chat/conversations/{conv_id}/messages",
        headers=student_user["headers"],
    )
    assert hidden_history.status_code == 404

    # Alumni STILL sees the conversation
    res_alumni = client.get("/chat/conversations", headers=verified_alumni_user["headers"])
    assert len(res_alumni.json()) == 1
    assert res_alumni.json()[0]["id"] == conv_id

    # Alumni GET /conversations/{id} still succeeds
    res_alumni_single = client.get(f"/chat/conversations/{conv_id}", headers=verified_alumni_user["headers"])
    assert res_alumni_single.status_code == 200

    # Re-starting conversation unarchives it for Student
    res_restore = client.post(
        "/chat/conversations",
        headers=student_user["headers"],
        json={"participant_id": verified_alumni_user["id"]}
    )
    assert res_restore.status_code == 200
    assert res_restore.json()["is_new"] is False

    # Student now sees it and its history again after explicitly unarchiving it.
    res = client.get("/chat/conversations", headers=student_user["headers"])
    assert len(res.json()) == 1
    restored_history = client.get(
        f"/chat/conversations/{conv_id}/messages",
        headers=student_user["headers"],
    )
    assert restored_history.status_code == 200
    assert [item["content"] for item in restored_history.json()] == ["Archive guard test"]


# ============================================================
# MESSAGE SENDING & RETRIEVAL TESTS
# ============================================================

def test_send_and_get_messages(client, student_user, verified_alumni_user, other_student_user):
    conv_res = client.post(
        "/chat/conversations",
        headers=student_user["headers"],
        json={"participant_id": verified_alumni_user["id"]}
    )
    conv_id = conv_res.json()["id"]

    # Send message 1
    msg1_res = client.post(
        f"/chat/conversations/{conv_id}/messages",
        headers=student_user["headers"],
        json={"content": "Hello alumni!"}
    )
    assert msg1_res.status_code == 201
    msg1 = msg1_res.json()
    assert msg1["content"] == "Hello alumni!"
    assert msg1["sender_id"] == student_user["id"]
    assert student_user["id"] in msg1["read_by"]

    # Send message 2
    msg2_res = client.post(
        f"/chat/conversations/{conv_id}/messages",
        headers=verified_alumni_user["headers"],
        json={"content": "Hi there student!"}
    )
    assert msg2_res.status_code == 201
    msg2 = msg2_res.json()
    assert msg2["content"] == "Hi there student!"
    assert msg2["sender_id"] == verified_alumni_user["id"]

    # Get messages
    get_res = client.get(f"/chat/conversations/{conv_id}/messages", headers=student_user["headers"])
    assert get_res.status_code == 200
    messages = get_res.json()
    assert len(messages) == 2
    assert messages[0]["id"] == msg1["id"]
    assert messages[1]["id"] == msg2["id"]

    # Non-participant cannot get messages
    res = client.get(f"/chat/conversations/{conv_id}/messages", headers=other_student_user["headers"])
    assert res.status_code == 403

    # Non-participant cannot send message
    res = client.post(
        f"/chat/conversations/{conv_id}/messages",
        headers=other_student_user["headers"],
        json={"content": "Intruder message"}
    )
    assert res.status_code == 403


def test_client_cannot_spoof_sender_id(client, student_user, verified_alumni_user):
    conv_res = client.post(
        "/chat/conversations",
        headers=student_user["headers"],
        json={"participant_id": verified_alumni_user["id"]}
    )
    conv_id = conv_res.json()["id"]

    # Attempting to supply sender_id in request body is rejected with 422 (extra="forbid")
    res = client.post(
        f"/chat/conversations/{conv_id}/messages",
        headers=student_user["headers"],
        json={"content": "Trying to spoof", "sender_id": verified_alumni_user["id"]}
    )
    assert res.status_code == 422


def test_message_content_validation(client, student_user, verified_alumni_user):
    conv_res = client.post(
        "/chat/conversations",
        headers=student_user["headers"],
        json={"participant_id": verified_alumni_user["id"]}
    )
    conv_id = conv_res.json()["id"]

    # Empty string
    res = client.post(
        f"/chat/conversations/{conv_id}/messages",
        headers=student_user["headers"],
        json={"content": ""}
    )
    assert res.status_code == 422

    # Whitespace only
    res = client.post(
        f"/chat/conversations/{conv_id}/messages",
        headers=student_user["headers"],
        json={"content": "    \n  \t "}
    )
    assert res.status_code == 422

    # Exceeding 5000 characters
    res = client.post(
        f"/chat/conversations/{conv_id}/messages",
        headers=student_user["headers"],
        json={"content": "a" * 5001}
    )
    assert res.status_code == 422

    # Valid boundary length (5000 characters)
    res = client.post(
        f"/chat/conversations/{conv_id}/messages",
        headers=student_user["headers"],
        json={"content": "a" * 5000}
    )
    assert res.status_code == 201


# ============================================================
# READ STATE & RECEIPTS TESTS
# ============================================================

def test_mark_message_read(client, student_user, verified_alumni_user, other_student_user):
    conv_res = client.post(
        "/chat/conversations",
        headers=student_user["headers"],
        json={"participant_id": verified_alumni_user["id"]}
    )
    conv_id = conv_res.json()["id"]

    # Student sends message
    msg_res = client.post(
        f"/chat/conversations/{conv_id}/messages",
        headers=student_user["headers"],
        json={"content": "Please read this"}
    )
    msg_id = msg_res.json()["id"]

    # Alumni marks it as read
    read_res = client.patch(f"/chat/messages/{msg_id}/read", headers=verified_alumni_user["headers"])
    assert read_res.status_code == 200
    data = read_res.json()
    assert verified_alumni_user["id"] in data["read_by"]

    # Idempotent call - Alumni marks it again without error
    read_res2 = client.patch(f"/chat/messages/{msg_id}/read", headers=verified_alumni_user["headers"])
    assert read_res2.status_code == 200

    # Non-participant cannot mark as read
    res_forbidden = client.patch(f"/chat/messages/{msg_id}/read", headers=other_student_user["headers"])
    assert res_forbidden.status_code == 403

    # The other participant sends a new message that remains unread by Student.
    other_message = client.post(
        f"/chat/conversations/{conv_id}/messages",
        headers=verified_alumni_user["headers"],
        json={"content": "A second message"},
    )
    assert other_message.status_code == 201
    other_message_id = other_message.json()["id"]

    # Archiving hides read receipts and message history only from the archiving user.
    archived = client.delete(
        f"/chat/conversations/{conv_id}",
        headers=student_user["headers"],
    )
    assert archived.status_code == 200
    hidden_read = client.patch(
        f"/chat/messages/{other_message_id}/read",
        headers=student_user["headers"],
    )
    assert hidden_read.status_code == 404
    alumni_history = client.get(
        f"/chat/conversations/{conv_id}/messages",
        headers=verified_alumni_user["headers"],
    )
    assert alumni_history.status_code == 200
    assert len(alumni_history.json()) == 2

    # Malformed message ID
    res_malformed = client.patch("/chat/messages/bad-id/read", headers=verified_alumni_user["headers"])
    assert res_malformed.status_code == 404


def test_sending_message_restores_archived_conversation_for_recipient(
    client, student_user, verified_alumni_user
):
    conv_res = client.post(
        "/chat/conversations",
        headers=student_user["headers"],
        json={"participant_id": verified_alumni_user["id"]}
    )
    conv_id = conv_res.json()["id"]

    # Alumni archives the conversation
    client.delete(f"/chat/conversations/{conv_id}", headers=verified_alumni_user["headers"])

    # Alumni conversation list is empty
    res = client.get("/chat/conversations", headers=verified_alumni_user["headers"])
    assert len(res.json()) == 0

    # Student sends a new message
    client.post(
        f"/chat/conversations/{conv_id}/messages",
        headers=student_user["headers"],
        json={"content": "Wake up!"}
    )

    # Alumni conversation list now shows the conversation again
    res = client.get("/chat/conversations", headers=verified_alumni_user["headers"])
    assert len(res.json()) == 1
    assert res.json()[0]["id"] == conv_id
    assert res.json()[0]["unread_count"] == 1


def test_additional_error_cases(client, student_user, verified_alumni_user, other_student_user):
    conv_res = client.post(
        "/chat/conversations",
        headers=student_user["headers"],
        json={"participant_id": verified_alumni_user["id"]}
    )
    conv_id = conv_res.json()["id"]

    # Extra fields on conversation creation rejected (422)
    res_extra = client.post(
        "/chat/conversations",
        headers=student_user["headers"],
        json={"participant_id": verified_alumni_user["id"], "unexpected": "forbidden"}
    )
    assert res_extra.status_code == 422

    # Non-participant delete conversation returns 403
    res_del_non_part = client.delete(
        f"/chat/conversations/{conv_id}",
        headers=other_student_user["headers"]
    )
    assert res_del_non_part.status_code == 403

    # Delete non-existent or malformed conversation returns 404
    assert client.delete("/chat/conversations/invalid-id", headers=student_user["headers"]).status_code == 404
    assert client.delete(f"/chat/conversations/{ObjectId()}", headers=student_user["headers"]).status_code == 404

    # Send message to non-existent or malformed conversation returns 404
    assert client.post(
        "/chat/conversations/invalid-id/messages",
        headers=student_user["headers"],
        json={"content": "hello"}
    ).status_code == 404
    assert client.post(
        f"/chat/conversations/{ObjectId()}/messages",
        headers=student_user["headers"],
        json={"content": "hello"}
    ).status_code == 404

    # Get messages from non-existent or malformed conversation returns 404
    assert client.get("/chat/conversations/invalid-id/messages", headers=student_user["headers"]).status_code == 404
    assert client.get(f"/chat/conversations/{ObjectId()}/messages", headers=student_user["headers"]).status_code == 404

    # Mark read on non-existent message returns 404
    assert client.patch(f"/chat/messages/{ObjectId()}/read", headers=student_user["headers"]).status_code == 404

# ============================================================
# CHAT ATTACHMENT TESTS
# ============================================================

def test_send_and_download_chat_attachment(client, student_user, verified_alumni_user, other_student_user):
    conv_res = client.post(
        "/chat/conversations",
        headers=student_user["headers"],
        json={"participant_id": verified_alumni_user["id"]},
    )
    conv_id = conv_res.json()["id"]
    pdf_bytes = b"%PDF-1.7\\nSOET Connect test attachment\\n"

    upload_res = client.post(
        f"/chat/conversations/{conv_id}/attachments",
        headers=student_user["headers"],
        data={"content": "Please review this document."},
        files=[("files", ("placement-letter.pdf", pdf_bytes, "application/pdf"))],
    )
    assert upload_res.status_code == 201
    message = upload_res.json()
    assert message["content"] == "Please review this document."
    assert len(message["attachments"]) == 1
    attachment = message["attachments"][0]
    assert attachment["file_name"] == "placement-letter.pdf"
    assert attachment["mime_type"] == "application/pdf"
    assert attachment["size_bytes"] == len(pdf_bytes)
    assert "storage_path" not in attachment

    # Both participants can retrieve the attachment.
    download_url = f"/chat/messages/{message['id']}/attachments/{attachment['id']}"
    student_download = client.get(download_url, headers=student_user["headers"])
    assert student_download.status_code == 200
    assert student_download.content == pdf_bytes
    assert student_download.headers["content-type"] == "application/pdf"
    assert "placement-letter.pdf" in student_download.headers["content-disposition"]

    alumni_download = client.get(download_url, headers=verified_alumni_user["headers"])
    assert alumni_download.status_code == 200
    assert alumni_download.content == pdf_bytes

    # A non-participant cannot access another conversation's attachment.
    forbidden = client.get(download_url, headers=other_student_user["headers"])
    assert forbidden.status_code == 403

    # Attachments are included when the conversation history is loaded again.
    history = client.get(
        f"/chat/conversations/{conv_id}/messages",
        headers=verified_alumni_user["headers"],
    )
    assert history.status_code == 200
    assert history.json()[0]["attachments"][0]["id"] == attachment["id"]

    # Archiving hides the conversation and its attachments only for that user.
    archived = client.delete(
        f"/chat/conversations/{conv_id}",
        headers=student_user["headers"],
    )
    assert archived.status_code == 200

    hidden_download = client.get(download_url, headers=student_user["headers"])
    assert hidden_download.status_code == 404

    # Upload attempts are also rejected while the sender's conversation is archived.
    archived_upload = client.post(
        f"/chat/conversations/{conv_id}/attachments",
        headers=student_user["headers"],
        files=[("files", ("another.pdf", pdf_bytes, "application/pdf"))],
    )
    assert archived_upload.status_code == 404

    # The other participant's view is unaffected by someone else's archive.
    other_participant_download = client.get(
        download_url,
        headers=verified_alumni_user["headers"],
    )
    assert other_participant_download.status_code == 200
    assert other_participant_download.content == pdf_bytes


def test_chat_attachment_message_supports_multiple_files(client, student_user, verified_alumni_user):
    conv_res = client.post(
        "/chat/conversations",
        headers=student_user["headers"],
        json={"participant_id": verified_alumni_user["id"]},
    )
    conv_id = conv_res.json()["id"]

    files = [
        ("files", ("resume.pdf", b"%PDF-1.7\\nresume\\n", "application/pdf")),
        ("files", ("notes.txt", b"Interview preparation notes", "text/plain")),
    ]
    response = client.post(
        f"/chat/conversations/{conv_id}/attachments",
        headers=student_user["headers"],
        files=files,
    )
    assert response.status_code == 201
    data = response.json()
    assert data["content"] == "Shared 2 attachments"
    assert [item["file_name"] for item in data["attachments"]] == ["resume.pdf", "notes.txt"]


def test_chat_attachment_rejects_unsupported_and_invalid_files(client, student_user, verified_alumni_user):
    conv_res = client.post(
        "/chat/conversations",
        headers=student_user["headers"],
        json={"participant_id": verified_alumni_user["id"]},
    )
    conv_id = conv_res.json()["id"]

    unsupported = client.post(
        f"/chat/conversations/{conv_id}/attachments",
        headers=student_user["headers"],
        files=[("files", ("malware.exe", b"MZ\\x00", "application/octet-stream"))],
    )
    assert unsupported.status_code == 415

    invalid_pdf = client.post(
        f"/chat/conversations/{conv_id}/attachments",
        headers=student_user["headers"],
        files=[("files", ("fake.pdf", b"not a PDF", "application/pdf"))],
    )
    assert invalid_pdf.status_code == 415


def test_chat_attachment_limits_and_authorization(client, student_user, verified_alumni_user, other_student_user):
    conv_res = client.post(
        "/chat/conversations",
        headers=student_user["headers"],
        json={"participant_id": verified_alumni_user["id"]},
    )
    conv_id = conv_res.json()["id"]
    pdf = b"%PDF-1.7\\nsmall\\n"

    too_many = client.post(
        f"/chat/conversations/{conv_id}/attachments",
        headers=student_user["headers"],
        files=[("files", (f"file-{i}.pdf", pdf, "application/pdf")) for i in range(6)],
    )
    assert too_many.status_code == 400
    assert "5 files" in too_many.json()["detail"]

    forbidden = client.post(
        f"/chat/conversations/{conv_id}/attachments",
        headers=other_student_user["headers"],
        files=[("files", ("private.pdf", pdf, "application/pdf"))],
    )
    assert forbidden.status_code == 403

    unauthenticated = client.post(
        f"/chat/conversations/{conv_id}/attachments",
        files=[("files", ("private.pdf", pdf, "application/pdf"))],
    )
    assert unauthenticated.status_code == 401



def test_chat_attachment_storage_failure_returns_clear_retryable_error(
    client,
    student_user,
    verified_alumni_user,
    monkeypatch,
):
    """A storage outage must not become an opaque ASGI 500 response."""
    import services.chat as chat_service

    conversation = client.post(
        "/chat/conversations",
        headers=student_user["headers"],
        json={"participant_id": verified_alumni_user["id"]},
    )
    assert conversation.status_code == 201
    conversation_id = conversation.json()["id"]

    class BrokenBucket:
        def upload(self, path, file_bytes, content_type):
            raise RuntimeError("storage service unavailable")

        def delete(self, paths):
            return []

    monkeypatch.setattr(
        chat_service.supabase.storage,
        "from_",
        lambda bucket_name: BrokenBucket(),
    )

    response = client.post(
        f"/chat/conversations/{conversation_id}/attachments",
        headers=student_user["headers"],
        files=[("files", ("test.pdf", b"%PDF-1.7\\ntest\\n", "application/pdf"))],
    )

    assert response.status_code == 503
    assert "storage is temporarily unavailable" in response.json()["detail"].lower()
    assert "message was not sent" in response.json()["detail"].lower()


# ============================================================
# CHAT PRESENCE AND DELETED PARTICIPANT TESTS
# ============================================================

def test_chat_presence_heartbeat_records_server_timestamp(client, student_user):
    response = client.post("/chat/presence", headers=student_user["headers"])

    assert response.status_code == 200
    assert response.json()["message"] == "Presence updated."

    stored_user = users_collection.find_one({"_id": student_user["doc_id"]})
    assert stored_user["last_seen_at"]
    last_seen = datetime.fromisoformat(stored_user["last_seen_at"].replace("Z", "+00:00"))
    assert abs((datetime.now(timezone.utc) - last_seen).total_seconds()) < 10


def test_conversation_presence_is_based_on_recent_heartbeat(
    client,
    student_user,
    verified_alumni_user,
):
    conversation = client.post(
        "/chat/conversations",
        headers=student_user["headers"],
        json={"participant_id": verified_alumni_user["id"]},
    )
    assert conversation.status_code == 201

    # No heartbeat means a newly encountered participant is offline by default.
    initial = client.get("/chat/conversations", headers=student_user["headers"])
    partner = next(p for p in initial.json()[0]["participants"] if p["id"] == verified_alumni_user["id"])
    assert partner["is_online"] is False
    assert partner["is_deleted"] is False
    assert partner["is_available"] is True

    users_collection.update_one(
        {"_id": verified_alumni_user["doc_id"]},
        {"$set": {"last_seen_at": datetime.now(timezone.utc).isoformat()}},
    )
    online = client.get("/chat/conversations", headers=student_user["headers"])
    partner = next(p for p in online.json()[0]["participants"] if p["id"] == verified_alumni_user["id"])
    assert partner["is_online"] is True

    users_collection.update_one(
        {"_id": verified_alumni_user["doc_id"]},
        {"$set": {"last_seen_at": (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()}},
    )
    offline = client.get("/chat/conversations", headers=student_user["headers"])
    partner = next(p for p in offline.json()[0]["participants"] if p["id"] == verified_alumni_user["id"])
    assert partner["is_online"] is False


def test_deleted_chat_participant_is_not_shown_as_online_and_history_is_preserved(
    client,
    student_user,
    verified_alumni_user,
):
    conversation = client.post(
        "/chat/conversations",
        headers=student_user["headers"],
        json={"participant_id": verified_alumni_user["id"]},
    )
    conversation_id = conversation.json()["id"]

    sent = client.post(
        f"/chat/conversations/{conversation_id}/messages",
        headers=student_user["headers"],
        json={"content": "Existing message before account deletion"},
    )
    assert sent.status_code == 201

    deleted = users_collection.delete_one({"_id": verified_alumni_user["doc_id"]})
    assert deleted.modified_count == 1

    listing = client.get("/chat/conversations", headers=student_user["headers"])
    assert listing.status_code == 200
    partner = next(p for p in listing.json()[0]["participants"] if p["id"] == verified_alumni_user["id"])
    assert partner["name"] == "Deleted account"
    assert partner["role"] == "former member"
    assert partner["is_deleted"] is True
    assert partner["is_available"] is False
    assert partner["is_online"] is False
    assert partner["last_seen_at"] is None

    # Historical messages remain readable, but no new messages can be sent to a deleted account.
    history = client.get(
        f"/chat/conversations/{conversation_id}/messages",
        headers=student_user["headers"],
    )
    assert history.status_code == 200
    assert history.json()[0]["content"] == "Existing message before account deletion"

    blocked_send = client.post(
        f"/chat/conversations/{conversation_id}/messages",
        headers=student_user["headers"],
        json={"content": "This should not be delivered"},
    )
    assert blocked_send.status_code == 409
    assert "no longer available" in blocked_send.json()["detail"].lower()

# ============================================================
# DATABASE READ FAILURE HANDLING
# ============================================================

def test_conversation_list_read_failure_returns_503(client, student_user, monkeypatch):
    def fail_list(_user_id):
        raise RuntimeError("simulated conversation store outage")

    monkeypatch.setattr(chat_routes, "list_user_conversations", fail_list)
    response = client.get("/chat/conversations", headers=student_user["headers"])
    assert response.status_code == 503
    assert "temporarily unavailable" in response.json()["detail"].lower()


def test_conversation_details_read_failure_returns_503(client, student_user, monkeypatch):
    def fail_get(**_kwargs):
        raise RuntimeError("simulated conversation store outage")

    monkeypatch.setattr(chat_routes, "get_user_conversation", fail_get)
    response = client.get(
        "/chat/conversations/507f1f77bcf86cd799439011",
        headers=student_user["headers"],
    )
    assert response.status_code == 503
    assert "temporarily unavailable" in response.json()["detail"].lower()


def test_conversation_messages_read_failure_returns_503(client, student_user, monkeypatch):
    def fail_get(**_kwargs):
        raise RuntimeError("simulated message store outage")

    monkeypatch.setattr(chat_routes, "get_conversation_messages", fail_get)
    response = client.get(
        "/chat/conversations/507f1f77bcf86cd799439011/messages",
        headers=student_user["headers"],
    )
    assert response.status_code == 503
    assert "temporarily unavailable" in response.json()["detail"].lower()

