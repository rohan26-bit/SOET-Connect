from fastapi import APIRouter, Depends, Response, status

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
)

router = APIRouter(
    prefix="/chat",
    tags=["Chat"],
)


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
