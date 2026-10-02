from datetime import datetime, timezone
from typing import Optional

from bson import ObjectId
from fastapi import Depends, HTTPException, status

from database import database, users_collection
from security.dependencies import get_current_user

conversations_collection = database["conversations"]
messages_collection = database["messages"]


def init_chat_indexes():
    """Create indexes for chat collections if compatible with current driver."""
    try:
        conversations_collection.create_index("canonical_key", unique=True)
    except Exception:
        pass
    try:
        messages_collection.create_index([("conversation_id", 1), ("created_at", 1)])
    except Exception:
        pass


init_chat_indexes()


def get_user_by_id(user_id: str):
    """Safely resolve user document from string or ObjectId representation."""
    if not user_id:
        return None

    user_id_str = str(user_id).strip()

    try:
        if ObjectId.is_valid(user_id_str):
            user = users_collection.find_one({"_id": ObjectId(user_id_str)})
            if user:
                return user
    except Exception:
        pass

    try:
        user = users_collection.find_one({"_id": user_id_str})
        if user:
            return user
    except Exception:
        pass

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


def parse_object_id(id_val: str, error_detail: str = "Resource not found.") -> ObjectId:
    """Safely validate and convert string to ObjectId, raising 404 on malformed IDs."""
    if not id_val or not ObjectId.is_valid(str(id_val)):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=error_detail
        )
    try:
        return ObjectId(str(id_val))
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=error_detail
        )


def serialize_message(msg_doc: dict) -> dict:
    """Format MongoDB message document to API response dict."""
    return {
        "id": str(msg_doc["_id"]),
        "conversation_id": str(msg_doc.get("conversation_id")),
        "sender_id": str(msg_doc.get("sender_id")),
        "content": msg_doc.get("content", ""),
        "created_at": msg_doc.get("created_at"),
        "read_by": [str(uid) for uid in msg_doc.get("read_by", [])],
        "read_at": msg_doc.get("read_at"),
    }


def serialize_conversation(
    conv_doc: dict,
    current_user_id: str,
    is_new: Optional[bool] = None
) -> dict:
    """Format MongoDB conversation document to API response dict with metadata."""
    participant_ids = [str(uid) for uid in conv_doc.get("participant_ids", [])]

    participants = []
    for pid in participant_ids:
        u = get_user_by_id(pid)
        if u:
            participants.append({
                "id": str(u["_id"]),
                "name": u.get("name", "User"),
                "email": u.get("email", ""),
                "role": u.get("role", "user"),
            })
        else:
            participants.append({
                "id": pid,
                "name": "User",
                "email": "",
                "role": "user",
            })

    conv_id_str = str(conv_doc["_id"])

    all_msgs = list(messages_collection.find({"conversation_id": conv_id_str}))
    all_msgs.sort(key=lambda m: m.get("created_at") or datetime.min.replace(tzinfo=timezone.utc))

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
        new_conv["_id"] = res.inserted_id
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
        return (
            c.get("last_message_at")
            or c.get("updated_at")
            or c.get("created_at")
            or datetime.min.replace(tzinfo=timezone.utc)
        )

    active_convs.sort(key=sort_key, reverse=True)
    return [serialize_conversation(c, current_user_id) for c in active_convs]


def get_user_conversation(conversation_id: str, current_user_id: str) -> dict:
    """Retrieve a single conversation if the user is an authorized participant."""
    conv_oid = parse_object_id(conversation_id, "Conversation not found.")
    conv = conversations_collection.find_one({"_id": conv_oid})
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
    conv_oid = parse_object_id(conversation_id, "Conversation not found.")
    conv = conversations_collection.find_one({"_id": conv_oid})
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
        {"_id": conv_oid},
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
    conv_oid = parse_object_id(conversation_id, "Conversation not found.")
    conv = conversations_collection.find_one({"_id": conv_oid})
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

    msgs = list(messages_collection.find({"conversation_id": str(conv_oid)}))
    msgs.sort(key=lambda m: m.get("created_at") or datetime.min.replace(tzinfo=timezone.utc))

    return [serialize_message(m) for m in msgs]


def send_conversation_message(conversation_id: str, sender_id: str, content: str) -> dict:
    """Send a message to a conversation. Sender identity is always derived from authenticated token."""
    conv_oid = parse_object_id(conversation_id, "Conversation not found.")
    conv = conversations_collection.find_one({"_id": conv_oid})
    if not conv:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found."
        )

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
        "conversation_id": str(conv_oid),
        "sender_id": sender_id,
        "content": trimmed,
        "created_at": now,
        "read_by": [sender_id],
        "read_at": now,
    }

    res = messages_collection.insert_one(msg_doc)
    msg_doc["_id"] = res.inserted_id

    # Update conversation timestamps and restore for any participant who had archived it
    conversations_collection.update_one(
        {"_id": conv_oid},
        {
            "$set": {
                "last_message_at": now,
                "updated_at": now,
                "deleted_for": [],
            }
        }
    )

    return serialize_message(msg_doc)


def mark_message_as_read(message_id: str, current_user_id: str) -> dict:
    """Mark a message as read idempotently for an authorized participant."""
    msg_oid = parse_object_id(message_id, "Message not found.")
    msg = messages_collection.find_one({"_id": msg_oid})
    if not msg:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Message not found."
        )

    conv_id = msg.get("conversation_id")
    conv = None
    if conv_id and ObjectId.is_valid(str(conv_id)):
        conv = conversations_collection.find_one({"_id": ObjectId(str(conv_id))})
    if not conv and conv_id:
        conv = conversations_collection.find_one({"_id": str(conv_id)})

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

    read_by = [str(uid) for uid in msg.get("read_by", [])]
    if current_user_id not in read_by:
        now = datetime.now(timezone.utc)
        messages_collection.update_one(
            {"_id": msg_oid},
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
