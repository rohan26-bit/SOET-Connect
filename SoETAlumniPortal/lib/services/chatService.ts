const API_URL = '/api';



async function parseResponse(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Your session has expired. Please log in again.');
    }
    const detail =
      typeof data.detail === 'string'
        ? data.detail
        : JSON.stringify(data.detail || 'Request failed.');
    throw new Error(detail);
  }
  return data;
}

export interface ParticipantInfo {
  id: string;
  name: string;
  email: string;
  role: string;
  is_online: boolean;
  last_seen_at?: string | null;
  is_deleted: boolean;
  is_available: boolean;
}

export interface ChatAttachment {
  id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
}

export interface ChatMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  attachments: ChatAttachment[];
  created_at: string;
  read_by: string[];
  read_at?: string;
}

export interface ConversationItem {
  id: string;
  participant_ids: string[];
  participants?: ParticipantInfo[];
  created_at: string;
  updated_at: string;
  last_message_at?: string;
  last_message?: ChatMessage;
  unread_count: number;
}

export interface ConversationDetail extends ConversationItem {
  is_new?: boolean;
}

export const chatService = {
  // ============================================================
  // HEARTBEAT: REPORT AUTHENTICATED USER PRESENCE
  // ============================================================

  async sendPresenceHeartbeat(): Promise<void> {
    const response = await fetch(`${API_URL}/chat/presence`, {
      method: 'POST',
      headers: {

        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });
    await parseResponse(response);
  },

  // ============================================================
  // LIST CONVERSATIONS
  // ============================================================

  async getConversations(): Promise<ConversationItem[]> {
    const response = await fetch(`${API_URL}/chat/conversations`, {
      method: 'GET',
      headers: {

        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });

    const data = await parseResponse(response);
    return Array.isArray(data) ? data : [];
  },

  // ============================================================
  // CREATE OR GET CONVERSATION WITH PARTICIPANT
  // ============================================================

  async createOrGetConversation(participantId: string): Promise<ConversationDetail> {
    const response = await fetch(`${API_URL}/chat/conversations`, {
      method: 'POST',
      headers: {

        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ participant_id: participantId }),
    });

    return await parseResponse(response);
  },

  // ============================================================
  // GET SINGLE CONVERSATION
  // ============================================================

  async getConversation(conversationId: string): Promise<ConversationDetail> {
    const response = await fetch(
      `${API_URL}/chat/conversations/${encodeURIComponent(conversationId)}`,
      {
        method: 'GET',
        headers: {

          'Content-Type': 'application/json',
        },
      }
    );

    return await parseResponse(response);
  },

  // ============================================================
  // ARCHIVE / HIDE CONVERSATION
  // ============================================================

  async archiveConversation(conversationId: string): Promise<{ message: string; status: string }> {
    const response = await fetch(
      `${API_URL}/chat/conversations/${encodeURIComponent(conversationId)}`,
      {
        method: 'DELETE',
        headers: {

          'Content-Type': 'application/json',
        },
      }
    );

    return await parseResponse(response);
  },

  // ============================================================
  // GET MESSAGES IN CONVERSATION
  // ============================================================

  async getMessages(conversationId: string): Promise<ChatMessage[]> {
    const response = await fetch(
      `${API_URL}/chat/conversations/${encodeURIComponent(conversationId)}/messages`,
      {
        method: 'GET',
        headers: {

          'Content-Type': 'application/json',
        },
        cache: 'no-store',
      }
    );

    const data = await parseResponse(response);
    return Array.isArray(data) ? data : [];
  },

  // ============================================================
  // SEND MESSAGE
  // ============================================================

  async sendMessage(conversationId: string, content: string): Promise<ChatMessage> {
    const response = await fetch(
      `${API_URL}/chat/conversations/${encodeURIComponent(conversationId)}/messages`,
      {
        method: 'POST',
        headers: {

          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content }),
      }
    );

    return await parseResponse(response);
  },

  // ============================================================
  // SEND FILE ATTACHMENTS
  // ============================================================

  async sendAttachments(
    conversationId: string,
    content: string,
    files: File[]
  ): Promise<ChatMessage> {
    const formData = new FormData();
    formData.append('content', content);
    files.forEach((file) => formData.append('files', file));

    const response = await fetch(
      API_URL + '/chat/conversations/' + encodeURIComponent(conversationId) + '/attachments',
      {
        method: 'POST',
        headers: {  },
        body: formData,
      }
    );
    return await parseResponse(response);
  },

  async downloadAttachment(messageId: string, attachmentId: string): Promise<Blob> {
    const response = await fetch(
      API_URL + '/chat/messages/' + encodeURIComponent(messageId) + '/attachments/' + encodeURIComponent(attachmentId),
      { headers: {  } }
    );
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      const detail = typeof data.detail === 'string' ? data.detail : 'Could not download this attachment.';
      throw new Error(detail);
    }
    return response.blob();
  },

  // ============================================================
  // MARK MESSAGE AS READ
  // ============================================================

  async markMessageAsRead(messageId: string): Promise<{ message: string; message_id: string; read_by: string[] }> {
    const response = await fetch(
      `${API_URL}/chat/messages/${encodeURIComponent(messageId)}/read`,
      {
        method: 'PATCH',
        headers: {

          'Content-Type': 'application/json',
        },
      }
    );

    return await parseResponse(response);
  },
};
