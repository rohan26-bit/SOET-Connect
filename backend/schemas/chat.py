from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator


class ConversationCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    participant_id: str = Field(..., min_length=1, description="Target user ID to start a conversation with")


class MessageCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    content: str = Field(..., max_length=5000, description="Message text content")

    @field_validator("content")
    @classmethod
    def validate_content(cls, v: str) -> str:
        trimmed = v.strip()
        if not trimmed:
            raise ValueError("Message content cannot be empty or whitespace only.")
        return trimmed


class MessageResponse(BaseModel):
    id: str
    conversation_id: str
    sender_id: str
    content: str
    created_at: datetime
    read_by: list[str] = Field(default_factory=list)
    read_at: Optional[datetime] = None


class ParticipantInfo(BaseModel):
    id: str
    name: str
    email: str
    role: str


class ConversationResponse(BaseModel):
    id: str
    participant_ids: list[str]
    participants: Optional[list[ParticipantInfo]] = None
    created_at: datetime
    updated_at: datetime
    last_message_at: Optional[datetime] = None
    last_message: Optional[MessageResponse] = None
    unread_count: int = 0
    is_new: Optional[bool] = None


class ConversationListItemResponse(BaseModel):
    id: str
    participant_ids: list[str]
    participants: Optional[list[ParticipantInfo]] = None
    created_at: datetime
    updated_at: datetime
    last_message_at: Optional[datetime] = None
    last_message: Optional[MessageResponse] = None
    unread_count: int = 0


class MessageReadResponse(BaseModel):
    message: str
    message_id: str
    read_by: list[str]


class ActionResponse(BaseModel):
    message: str
    status: str = "success"
