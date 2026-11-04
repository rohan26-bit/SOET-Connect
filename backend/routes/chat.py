from io import BytesIO
from pathlib import PurePosixPath
import re
from urllib.parse import quote
from zipfile import BadZipFile, ZipFile

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile, status

from schemas.chat import (
    ActionResponse,
    ConversationCreateRequest,
    ConversationListItemResponse,
    ConversationResponse,
    MessageCreateRequest,
    MessageReadResponse,
    MessageResponse,
)
from services.chat import (
    archive_user_conversation,
    create_or_get_conversation,
    get_active_chat_user,
    get_conversation_messages,
    get_user_conversation,
    list_user_conversations,
    mark_message_as_read,
    send_conversation_message,
    serialize_conversation,
    send_conversation_attachments,
    get_message_attachment,
)

router = APIRouter(
    prefix="/chat",
    tags=["Chat"],
)


MAX_CHAT_ATTACHMENT_SIZE = 10 * 1024 * 1024
MAX_CHAT_ATTACHMENTS_PER_MESSAGE = 5

_CHAT_FILE_TYPES = {
    ".pdf": {
        "mime": "application/pdf",
        "accepted": {"application/pdf", "application/octet-stream"},
    },
    ".docx": {
        "mime": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "accepted": {"application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/zip", "application/octet-stream"},
        "zip_entry": "word/document.xml",
    },
    ".xlsx": {
        "mime": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "accepted": {"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/zip", "application/octet-stream"},
        "zip_entry": "xl/workbook.xml",
    },
    ".pptx": {
        "mime": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "accepted": {"application/vnd.openxmlformats-officedocument.presentationml.presentation", "application/zip", "application/octet-stream"},
        "zip_entry": "ppt/presentation.xml",
    },
    ".jpg": {"mime": "image/jpeg", "accepted": {"image/jpeg", "application/octet-stream"}},
    ".jpeg": {"mime": "image/jpeg", "accepted": {"image/jpeg", "application/octet-stream"}},
    ".png": {"mime": "image/png", "accepted": {"image/png", "application/octet-stream"}},
    ".webp": {"mime": "image/webp", "accepted": {"image/webp", "application/octet-stream"}},
    ".txt": {"mime": "text/plain", "accepted": {"text/plain", "application/octet-stream"}},
    ".csv": {"mime": "text/csv", "accepted": {"text/csv", "application/csv", "application/vnd.ms-excel", "application/octet-stream"}},
}


def _safe_chat_filename(filename: str, extension: str) -> str:
    raw = (filename or "").replace("\\", "/").split("/")[-1]
    stem = raw.rsplit(".", 1)[0] if "." in raw else "attachment"
    safe_stem = re.sub(r"[^A-Za-z0-9 _-]", "_", stem).strip(" ._") or "attachment"
    return f"{safe_stem[:100]}{extension}"


async def _read_chat_upload(upload: UploadFile) -> dict:
    original_name = (upload.filename or "").replace("\\", "/").split("/")[-1]
    extension = PurePosixPath(original_name).suffix.lower()
    file_type = _CHAT_FILE_TYPES.get(extension)
    if not file_type:
        raise HTTPException(status_code=415, detail="Unsupported file type. Share PDF, DOCX, XLSX, PPTX, JPG, PNG, WebP, TXT or CSV files.")

    supplied_mime = (upload.content_type or "application/octet-stream").split(";", 1)[0].strip().lower()
    if supplied_mime not in file_type["accepted"]:
        raise HTTPException(status_code=415, detail="The file content type does not match its extension.")

    data = await upload.read(MAX_CHAT_ATTACHMENT_SIZE + 1)
    if not data:
        raise HTTPException(status_code=400, detail="Empty files cannot be shared.")
    if len(data) > MAX_CHAT_ATTACHMENT_SIZE:
        raise HTTPException(status_code=413, detail="Each chat attachment must be 10 MB or smaller.")

    if extension == ".pdf" and not data.startswith(b"%PDF-"):
        raise HTTPException(status_code=415, detail="This file is not a valid PDF.")
    elif extension in {".jpg", ".jpeg"} and not data.startswith(b"\\xff\\xd8\\xff"):
        raise HTTPException(status_code=415, detail="This file is not a valid JPEG image.")
    elif extension == ".png" and not data.startswith(b"\\x89PNG\\r\\n\\x1a\\n"):
        raise HTTPException(status_code=415, detail="This file is not a valid PNG image.")
    elif extension == ".webp" and not (data.startswith(b"RIFF") and data[8:12] == b"WEBP"):
        raise HTTPException(status_code=415, detail="This file is not a valid WebP image.")
    elif "zip_entry" in file_type:
        try:
            with ZipFile(BytesIO(data)) as archive:
                names = set(archive.namelist())
                if file_type["zip_entry"] not in names or any(name.lower().endswith("vbaproject.bin") for name in names):
                    raise HTTPException(status_code=415, detail="The Office document is invalid or contains unsupported macro content.")
                if sum(info.file_size for info in archive.infolist()) > 50 * 1024 * 1024 or len(names) > 1000:
                    raise HTTPException(status_code=413, detail="The Office document expands beyond the supported size.")
        except BadZipFile:
            raise HTTPException(status_code=415, detail="This file is not a valid Office document.")
    elif extension in {".txt", ".csv"}:
        try:
            data.decode("utf-8-sig")
        except UnicodeDecodeError:
            raise HTTPException(status_code=415, detail="Text and CSV attachments must use UTF-8 encoding.")
        if b"\\x00" in data:
            raise HTTPException(status_code=415, detail="The text attachment contains unsupported binary data.")

    return {
        "file_name": _safe_chat_filename(original_name, extension),
        "mime_type": file_type["mime"],
        "content": data,
    }


@router.get(
    "/conversations",
    response_model=list[ConversationListItemResponse],
    summary="List conversations for authenticated user",
    description="Retrieve all active direct conversations for the authenticated user, sorted with newest activity first.",
)
def get_conversations(
    current_user: dict = Depends(get_active_chat_user),
):
    return list_user_conversations(current_user["user_id"])


@router.post(
    "/conversations",
    response_model=ConversationResponse,
    summary="Create or retrieve direct conversation",
    description="Create a new 1-to-1 conversation with an active user, or return the existing conversation (unarchiving if previously hidden).",
)
def create_conversation(
    payload: ConversationCreateRequest,
    response: Response,
    current_user: dict = Depends(get_active_chat_user),
):
    conv_doc, is_new = create_or_get_conversation(
        current_user=current_user,
        target_user_id=payload.participant_id,
    )
    if is_new:
        response.status_code = status.HTTP_201_CREATED
    else:
        response.status_code = status.HTTP_200_OK

    return serialize_conversation(
        conv_doc=conv_doc,
        current_user_id=current_user["user_id"],
        is_new=is_new,
    )


@router.get(
    "/conversations/{conversation_id}",
    response_model=ConversationResponse,
    summary="Get single conversation",
    description="Retrieve a single conversation if the authenticated user is an authorized participant.",
)
def get_conversation(
    conversation_id: str,
    current_user: dict = Depends(get_active_chat_user),
):
    return get_user_conversation(
        conversation_id=conversation_id,
        current_user_id=current_user["user_id"],
    )


@router.delete(
    "/conversations/{conversation_id}",
    response_model=ActionResponse,
    summary="Archive/hide conversation for current participant",
    description="Hides/archives the conversation for the authenticated participant. This does not erase the conversation for the other participant or delete message history.",
)
def delete_conversation(
    conversation_id: str,
    current_user: dict = Depends(get_active_chat_user),
):
    return archive_user_conversation(
        conversation_id=conversation_id,
        current_user_id=current_user["user_id"],
    )


@router.get(
    "/conversations/{conversation_id}/messages",
    response_model=list[MessageResponse],
    summary="Get messages in conversation",
    description="Retrieve all messages in a conversation in stable chronological order (oldest to newest). Only authorized participants can access.",
)
def get_messages(
    conversation_id: str,
    current_user: dict = Depends(get_active_chat_user),
):
    return get_conversation_messages(
        conversation_id=conversation_id,
        current_user_id=current_user["user_id"],
    )


@router.post(
    "/conversations/{conversation_id}/messages",
    response_model=MessageResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Send message to conversation",
    description="Send a message to a conversation. Sender ID is strictly derived from the authenticated token and cannot be spoofed.",
)
def send_message(
    conversation_id: str,
    payload: MessageCreateRequest,
    current_user: dict = Depends(get_active_chat_user),
):
    return send_conversation_message(
        conversation_id=conversation_id,
        sender_id=current_user["user_id"],
        content=payload.content,
    )


@router.patch(
    "/messages/{message_id}/read",
    response_model=MessageReadResponse,
    summary="Mark message as read",
    description="Idempotently marks a message as read by the authenticated participant. Only participants of the message's conversation can perform this action.",
)
def mark_read(
    message_id: str,
    current_user: dict = Depends(get_active_chat_user),
):
    return mark_message_as_read(
        message_id=message_id,
        current_user_id=current_user["user_id"],
    )

@router.post(
    "/conversations/{conversation_id}/attachments",
    response_model=MessageResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Send private file attachments in a conversation",
)
async def send_attachments(
    conversation_id: str,
    files: list[UploadFile] = File(...),
    content: str = Form(default=""),
    current_user: dict = Depends(get_active_chat_user),
):
    if len(files) > MAX_CHAT_ATTACHMENTS_PER_MESSAGE:
        raise HTTPException(status_code=400, detail="Share up to 5 files in one message.")

    validated_files = []
    for upload in files:
        validated_files.append(await _read_chat_upload(upload))

    return send_conversation_attachments(
        conversation_id=conversation_id,
        sender_id=current_user["user_id"],
        content=content,
        files=validated_files,
    )


@router.get(
    "/messages/{message_id}/attachments/{attachment_id}",
    summary="Download a private chat attachment",
)
def download_attachment(
    message_id: str,
    attachment_id: str,
    current_user: dict = Depends(get_active_chat_user),
):
    attachment = get_message_attachment(
        message_id=message_id,
        attachment_id=attachment_id,
        current_user_id=current_user["user_id"],
    )
    filename = attachment["file_name"]
    fallback = re.sub(r"[^A-Za-z0-9._-]", "_", filename) or "attachment"
    return Response(
        content=attachment["content"],
        media_type=attachment["mime_type"],
        headers={
            "Content-Disposition": f'attachment; filename="{fallback}"; filename*=UTF-8\'\'{quote(filename)}',
            "Content-Length": str(attachment["size_bytes"]),
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "private, no-store",
        },
    )

