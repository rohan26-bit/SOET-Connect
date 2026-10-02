from bson import ObjectId
import pytest

from database import database, users_collection


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

    # Student archives/deletes the conversation
    del_res = client.delete(f"/chat/conversations/{conv_id}", headers=student_user["headers"])
    assert del_res.status_code == 200

    # Student can no longer see it in GET /conversations
    res = client.get("/chat/conversations", headers=student_user["headers"])
    assert len(res.json()) == 0

    # Student GET /conversations/{id} returns 404
    res = client.get(f"/chat/conversations/{conv_id}", headers=student_user["headers"])
    assert res.status_code == 404

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

    # Student now sees it again
    res = client.get("/chat/conversations", headers=student_user["headers"])
    assert len(res.json()) == 1


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

