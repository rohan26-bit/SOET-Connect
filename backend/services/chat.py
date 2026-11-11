from datetime import datetime, timezone
import uuid
from typing import Optional, Union

from fastapi import Depends, HTTPException, status
from database import users_collection, conversations_collection, messages_collection, supabase
from database_supabase import (
    CHAT_ATTACHMENT_BUCKET,
    decode_chat_attachment_message,
    encode_chat_attachment_message,
)
from security.dependencies import get_current_user


def get_user_by_id(user_id: str):
    """Safely resolve user document from string ID representation."""
    if not user_id:
        return None

    user_id_str = str(user_id).strip()
    user = users_collection.find_one({"_id": user_id_str})
    if user:
        return user

    for candidate in users_collection.find({}):
        if str(candidate.get("_id")) == user_id_str:
            return candidate

    return None


def get_active_chat_user(
    current_user: dict = Depends(get_current_user)
) -> dict:
    """Validate authenticated JWT identity against database and enforce active status."""
    user_id = current_user.get("user_id")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication credentials were not provided."
        )

    user_doc = get_user_by_id(user_id)
    if not user_doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User account not found."
        )

    if not user_doc.get("is_active", True):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account has been deactivated."
        )

    return {
        "user_id": str(user_doc["_id"]),
        "role": user_doc.get("role", current_user.get("role")),
        "name": user_doc.get("name", ""),
        "email": user_doc.get("email", ""),
        "user_doc": user_doc,
    }


def _is_user_online(last_seen_at, now: datetime | None = None) -> bool:
    """Treat a user as online only when their last authenticated heartbeat is recent."""
    if not last_seen_at:
        return False

    try:
        seen = last_seen_at
        if isinstance(seen, str):
            normalized = seen.replace("Z", "+00:00")
            seen = datetime.fromisoformat(normalized)
        if not isinstance(seen, datetime):
            return False
        if seen.tzinfo is None:
            seen = seen.replace(tzinfo=timezone.utc)
        current = now or datetime.now(timezone.utc)
        return (current - seen).total_seconds() <= 90
    except (TypeError, ValueError, OverflowError):
        return False


def ensure_conversation_recipient_available(conversation_id: str, sender_id: str) -> None:
    """Prevent sending new content into a conversation whose other account was removed or disabled."""
    conv_id = parse_object_id(conversation_id, "Conversation not found.")
    conv = conversations_collection.find_one({"_id": conv_id})
    if not conv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found.")

    participant_ids = [str(uid) for uid in conv.get("participant_ids", [])]
    if sender_id not in participant_ids:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have access to this conversation.")

    recipient_ids = [uid for uid in participant_ids if uid != str(sender_id)]
    recipient = get_user_by_id(recipient_ids[0]) if recipient_ids else None
    if not recipient or not recipient.get("is_active", True):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This account is no longer available. You can still view the conversation history and shared files.",
        )


def record_chat_presence(current_user_id: str) -> dict:
    """Record a server timestamp for a currently authenticated, active user."""
    now = datetime.now(timezone.utc)
    result = users_collection.update_one(
        {"_id": str(current_user_id)},
        {"$set": {"last_seen_at": now.isoformat()}},
    )
    if result.modified_count == 0:
        # Some adapters report zero when the update is unchanged; re-check existence.
        if not get_user_by_id(current_user_id):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User account not found.",
            )
    return {"message": "Presence updated.", "status": "success", "last_seen_at": now.isoformat()}


def parse_object_id(id_val: str, error_detail: str = "Resource not found.") -> str:
    """Safely validate and return ID string."""
    if not id_val or not str(id_val).strip():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=error_detail
        )
    return str(id_val).strip()


def serialize_message(msg_doc: dict) -> dict:
    """Format message document and safely expose decoded attachment metadata."""
    decoded = decode_chat_attachment_message(msg_doc.get("content", ""))
    return {
        "id": str(msg_doc["_id"]),
        "conversation_id": str(msg_doc.get("conversation_id")),
        "sender_id": str(msg_doc.get("sender_id")),
        "content": decoded["content"],
        "attachments": decoded["attachments"],
        "created_at": msg_doc.get("created_at"),
        "read_by": [str(uid) for uid in msg_doc.get("read_by", [])],
        "read_at": msg_doc.get("read_at"),
    }


def serialize_conversation(
    conv_doc: dict,
    current_user_id: str,
    is_new: Optional[bool] = None
) -> dict:
    """Format conversation document to API response dict with metadata."""
    participant_ids = [str(uid) for uid in conv_doc.get("participant_ids", [])]

    participants = []
    for pid in participant_ids:
        u = get_user_by_id(pid)
        if u and u.get("is_active", True):
            last_seen_at = u.get("last_seen_at")
            participants.append({
                "id": pid,
                "name": u.get("name") or "SOET Connect user",
                "email": u.get("email", ""),
                "role": u.get("role", "user"),
                "is_online": _is_user_online(last_seen_at),
                "last_seen_at": last_seen_at,
                "is_deleted": False,
                "is_available": True,
            })
        elif u:
            participants.append({
                "id": pid,
                "name": "Inactive account",
                "email": "",
                "role": "former member",
                "is_online": False,
                "last_seen_at": u.get("last_seen_at"),
                "is_deleted": False,
                "is_available": False,
            })
        else:
            # Keep the participant ID so historic messages still resolve correctly,
            # but never represent a missing account as a live/online user.
            participants.append({
                "id": pid,
                "name": "Deleted account",
                "email": "",
                "role": "former member",
                "is_online": False,
                "last_seen_at": None,
                "is_deleted": True,
                "is_available": False,
            })

    conv_id_str = str(conv_doc["_id"])

    all_msgs = list(messages_collection.find({"conversation_id": conv_id_str}))
    all_msgs.sort(key=lambda m: str(m.get("created_at") or ""))

    last_msg = None
    if all_msgs:
        last_msg = serialize_message(all_msgs[-1])

    unread_count = sum(
        1 for m in all_msgs
        if str(m.get("sender_id")) != current_user_id
        and current_user_id not in [str(x) for x in m.get("read_by", [])]
    )

    data = {
        "id": conv_id_str,
        "participant_ids": participant_ids,
        "participants": participants,
        "created_at": conv_doc.get("created_at"),
        "updated_at": conv_doc.get("updated_at"),
        "last_message_at": conv_doc.get("last_message_at"),
        "last_message": last_msg,
        "unread_count": unread_count,
    }
    if is_new is not None:
        data["is_new"] = is_new

    return data


def create_or_get_conversation(current_user: dict, target_user_id: str) -> tuple[dict, bool]:
    """Create a new 1-to-1 conversation or retrieve and unarchive an existing one."""
    current_user_id = str(current_user["user_id"])
    target_user_id_str = str(target_user_id).strip()

    target_user = get_user_by_id(target_user_id_str)
    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Target user not found."
        )

    if not target_user.get("is_active", True):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot start a conversation with an inactive user."
        )

    canonical_target_id = str(target_user["_id"])
    if current_user_id == canonical_target_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot create a conversation with yourself."
        )

    canonical_key = ":".join(sorted([current_user_id, canonical_target_id]))
    now = datetime.now(timezone.utc)

    existing_conv = conversations_collection.find_one({"canonical_key": canonical_key})

    if existing_conv:
        deleted_for = [str(x) for x in existing_conv.get("deleted_for", [])]
        if current_user_id in deleted_for:
            conversations_collection.update_one(
                {"_id": existing_conv["_id"]},
                {
                    "$pull": {"deleted_for": current_user_id},
                    "$set": {"updated_at": now}
                }
            )
            existing_conv["deleted_for"] = [uid for uid in deleted_for if uid != current_user_id]
            existing_conv["updated_at"] = now
        return existing_conv, False

    new_conv = {
        "canonical_key": canonical_key,
        "participant_ids": sorted([current_user_id, canonical_target_id]),
        "created_at": now,
        "updated_at": now,
        "last_message_at": None,
        "deleted_for": [],
    }

    try:
        res = conversations_collection.insert_one(new_conv)
        new_conv["_id"] = str(res.inserted_id)
        return new_conv, True
    except Exception:
        existing_conv = conversations_collection.find_one({"canonical_key": canonical_key})
        if existing_conv:
            deleted_for = [str(x) for x in existing_conv.get("deleted_for", [])]
            if current_user_id in deleted_for:
                conversations_collection.update_one(
                    {"_id": existing_conv["_id"]},
                    {
                        "$pull": {"deleted_for": current_user_id},
                        "$set": {"updated_at": now}
                    }
                )
                existing_conv["deleted_for"] = [uid for uid in deleted_for if uid != current_user_id]
                existing_conv["updated_at"] = now
            return existing_conv, False
        raise


def list_user_conversations(current_user_id: str) -> list[dict]:
    """Return all active conversations for the authenticated user, newest activity first."""
    cursor = conversations_collection.find({"participant_ids": current_user_id})
    active_convs = []
    for conv in cursor:
        deleted_for = [str(uid) for uid in conv.get("deleted_for", [])]
        if current_user_id not in deleted_for:
            active_convs.append(conv)

    def sort_key(c):
        return str(
            c.get("last_message_at")
            or c.get("updated_at")
            or c.get("created_at")
            or ""
        )

    active_convs.sort(key=sort_key, reverse=True)
    return [serialize_conversation(c, current_user_id) for c in active_convs]


def get_user_conversation(conversation_id: str, current_user_id: str) -> dict:
    """Retrieve a single conversation if the user is an authorized participant."""
    conv_id = parse_object_id(conversation_id, "Conversation not found.")
    conv = conversations_collection.find_one({"_id": conv_id})
    if not conv:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found."
        )

    participant_ids = [str(uid) for uid in conv.get("participant_ids", [])]
    if current_user_id not in participant_ids:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this conversation."
        )

    deleted_for = [str(uid) for uid in conv.get("deleted_for", [])]
    if current_user_id in deleted_for:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found."
        )

    return serialize_conversation(conv, current_user_id)


def archive_user_conversation(conversation_id: str, current_user_id: str) -> dict:
    """Archive/hide a conversation for the authenticated participant without affecting others."""
    conv_id = parse_object_id(conversation_id, "Conversation not found.")
    conv = conversations_collection.find_one({"_id": conv_id})
    if not conv:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found."
        )

    participant_ids = [str(uid) for uid in conv.get("participant_ids", [])]
    if current_user_id not in participant_ids:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this conversation."
        )

    conversations_collection.update_one(
        {"_id": conv_id},
        {
            "$addToSet": {"deleted_for": current_user_id},
            "$set": {"updated_at": datetime.now(timezone.utc)}
        }
    )

    return {
        "message": "Conversation archived successfully.",
        "status": "success"
    }


def get_conversation_messages(conversation_id: str, current_user_id: str) -> list[dict]:
    """Retrieve messages in stable oldest-to-newest order for conversation participants."""
    conv_id = parse_object_id(conversation_id, "Conversation not found.")
    conv = conversations_collection.find_one({"_id": conv_id})
    if not conv:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found."
        )

    participant_ids = [str(uid) for uid in conv.get("participant_ids", [])]
    if current_user_id not in participant_ids:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this conversation."
        )

    # Archiving is per participant. Keep message history hidden for the user
    # who archived the conversation, matching the conversation and attachment APIs.
    deleted_for = [str(uid) for uid in conv.get("deleted_for", [])]
    if current_user_id in deleted_for:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found."
        )

    msgs = list(messages_collection.find({"conversation_id": str(conv_id)}))
    msgs.sort(key=lambda m: str(m.get("created_at") or ""))

    return [serialize_message(m) for m in msgs]


def send_conversation_message(conversation_id: str, sender_id: str, content: str) -> dict:
    """Send a message to a conversation. Sender identity is always derived from authenticated token."""
    conv_id = parse_object_id(conversation_id, "Conversation not found.")
    conv = conversations_collection.find_one({"_id": conv_id})
    if not conv:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found."
        )

    ensure_conversation_recipient_available(conv_id, sender_id)

    participant_ids = [str(uid) for uid in conv.get("participant_ids", [])]
    if sender_id not in participant_ids:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this conversation."
        )

    trimmed = content.strip()
    if not trimmed:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Message content cannot be empty."
        )
    if len(trimmed) > 5000:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Message content exceeds maximum allowed length of 5000 characters."
        )

    now = datetime.now(timezone.utc)
    msg_doc = {
        "conversation_id": str(conv_id),
        "sender_id": sender_id,
        "content": trimmed,
        "created_at": now.isoformat(),
        "read_by": [sender_id],
        "read_at": now.isoformat(),
    }

    res = messages_collection.insert_one(msg_doc)
    msg_doc["_id"] = str(res.inserted_id)

    conversations_collection.update_one(
        {"_id": conv_id},
        {
            "$set": {
                "last_message_at": now.isoformat(),
                "updated_at": now.isoformat(),
                "deleted_for": [],
            }
        }
    )

    return serialize_message(msg_doc)




def ensure_conversation_participant(conversation_id: str, current_user_id: str) -> None:
    """Reject file uploads before reading their bodies unless the caller is a conversation participant."""
    conv_id = parse_object_id(conversation_id, "Conversation not found.")
    conv = conversations_collection.find_one({"_id": conv_id})
    if not conv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found.")
    participant_ids = [str(uid) for uid in conv.get("participant_ids", [])]
    if current_user_id not in participant_ids:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have access to this conversation.")
    ensure_conversation_recipient_available(conv_id, current_user_id)
    if current_user_id in [str(uid) for uid in conv.get("deleted_for", [])]:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found.")


def send_conversation_attachments(
    conversation_id: str,
    sender_id: str,
    content: str,
    files: list[dict],
) -> dict:
    """Upload validated attachments privately and send one message containing them."""
    conv_id = parse_object_id(conversation_id, "Conversation not found.")
    conv = conversations_collection.find_one({"_id": conv_id})
    if not conv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found.")

    ensure_conversation_recipient_available(conv_id, sender_id)

    participant_ids = [str(uid) for uid in conv.get("participant_ids", [])]
    if sender_id not in participant_ids:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have access to this conversation.")

    trimmed = (content or "").strip()
    if len(trimmed) > 5000:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Message content exceeds maximum allowed length of 5000 characters.")
    if not files:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Select at least one attachment.")

    bucket = supabase.storage.from_(CHAT_ATTACHMENT_BUCKET)
    upload_group = str(uuid.uuid4())
    uploaded_paths: list[str] = []
    attachment_records: list[dict] = []
    message_saved = False

    try:
        for item in files:
            attachment_id = str(uuid.uuid4())
            safe_name = str(item["file_name"])
            storage_path = f"{conv_id}/{upload_group}/{attachment_id}_{safe_name}"
            try:
                bucket.upload(storage_path, item["content"], item["mime_type"])
            except Exception as upload_error:
                print(
                    "Chat attachment storage upload failed:",
                    type(upload_error).__name__,
                    str(upload_error),
                )
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="Chat file storage is temporarily unavailable. Your message was not sent; please retry.",
                ) from upload_error
            uploaded_paths.append(storage_path)
            attachment_records.append({
                "id": attachment_id,
                "file_name": safe_name,
                "mime_type": item["mime_type"],
                "size_bytes": len(item["content"]),
                "storage_path": storage_path,
            })

        now = datetime.now(timezone.utc)
        stored_content = encode_chat_attachment_message(trimmed, attachment_records)
        msg_doc = {
            "conversation_id": str(conv_id),
            "sender_id": sender_id,
            "content": stored_content,
            "created_at": now.isoformat(),
            "read_by": [sender_id],
            "read_at": now.isoformat(),
        }
        result = messages_collection.insert_one(msg_doc)
        msg_doc["_id"] = str(result.inserted_id)
        message_saved = True

        try:
            conversations_collection.update_one(
                {"_id": conv_id},
                {
                    "$set": {
                        "last_message_at": now.isoformat(),
                        "updated_at": now.isoformat(),
                        "deleted_for": [],
                    }
                }
            )
        except Exception as update_error:
            # The message is already committed; keep its uploaded files intact.
            print("Warning: failed to update chat activity after attachment send:", update_error)
        return serialize_message(msg_doc)
    except Exception:
        if uploaded_paths and not message_saved:
            try:
                bucket.delete(uploaded_paths)
            except Exception as cleanup_error:
                print("Warning: failed to clean up chat attachment upload:", cleanup_error)
        raise


def get_message_attachment(message_id: str, attachment_id: str, current_user_id: str) -> dict:
    """Return an attachment only to an active participant of the message conversation."""
    msg_id = parse_object_id(message_id, "Message not found.")
    msg = messages_collection.find_one({"_id": msg_id})
    if not msg:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message not found.")

    conv_id = str(msg.get("conversation_id", "")).strip()
    conv = conversations_collection.find_one({"_id": conv_id})
    if not conv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found.")

    participant_ids = [str(uid) for uid in conv.get("participant_ids", [])]
    if current_user_id not in participant_ids:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have access to this attachment.")

    # Archiving hides a conversation only for the participant who archived it.
    # Match get_user_conversation/get_conversation_messages so that a hidden
    # conversation's attachments are no longer accessible to that participant.
    deleted_for = [str(uid) for uid in conv.get("deleted_for", [])]
    if current_user_id in deleted_for:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found.",
        )

    decoded = decode_chat_attachment_message(msg.get("content", ""))
    attachment = next(
        (item for item in decoded["attachments"] if str(item.get("id")) == str(attachment_id)),
        None,
    )
    if not attachment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attachment not found.")

    storage_path = str(attachment.get("storage_path") or "")
    if not storage_path.startswith(f"{conv_id}/") or ".." in storage_path.split("/"):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attachment not found.")

    content = supabase.storage.from_(CHAT_ATTACHMENT_BUCKET).download(storage_path)
    if content is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attachment file is no longer available.")

    return {
        "content": content,
        "file_name": str(attachment.get("file_name") or "attachment"),
        "mime_type": str(attachment.get("mime_type") or "application/octet-stream"),
        "size_bytes": len(content),
    }


def mark_message_as_read(message_id: str, current_user_id: str) -> dict:
    """Mark a message as read idempotently for an authorized participant."""
    msg_id = parse_object_id(message_id, "Message not found.")
    msg = messages_collection.find_one({"_id": msg_id})
    if not msg:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Message not found."
        )

    conv_id = str(msg.get("conversation_id", "")).strip()
    conv = conversations_collection.find_one({"_id": conv_id})

    if not conv:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found."
        )

    participant_ids = [str(uid) for uid in conv.get("participant_ids", [])]
    if current_user_id not in participant_ids:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this message."
        )

    # Do not let a participant continue interacting with a conversation they
    # archived. The other participant's view remains unaffected.
    deleted_for = [str(uid) for uid in conv.get("deleted_for", [])]
    if current_user_id in deleted_for:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found."
        )

    read_by = [str(uid) for uid in msg.get("read_by", [])]
    if current_user_id not in read_by:
        now = datetime.now(timezone.utc)
        messages_collection.update_one(
            {"_id": msg_id},
            {
                "$addToSet": {"read_by": current_user_id},
                "$set": {"read_at": now},
            }
        )
        read_by.append(current_user_id)

    return {
        "message": "Message marked as read.",
        "message_id": str(msg["_id"]),
        "read_by": read_by,
    }

