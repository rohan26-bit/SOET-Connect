const API_URL = '/api';

function getToken(): string {
  const token = localStorage.getItem('soet_access_token');
  if (!token) {
    throw new Error('Your session has expired. Please log in again.');
  }
  return token;
}

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
}

export interface ChatMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
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
  // LIST CONVERSATIONS
  // ============================================================

  async getConversations(): Promise<ConversationItem[]> {
    const response = await fetch(`${API_URL}/chat/conversations`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${getToken()}`,
        'Content-Type': 'application/json',
      },
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
        Authorization: `Bearer ${getToken()}`,
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
          Authorization: `Bearer ${getToken()}`,
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
          Authorization: `Bearer ${getToken()}`,
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
          Authorization: `Bearer ${getToken()}`,
          'Content-Type': 'application/json',
        },
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
          Authorization: `Bearer ${getToken()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content }),
      }
    );

    return await parseResponse(response);
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
          Authorization: `Bearer ${getToken()}`,
          'Content-Type': 'application/json',
        },
      }
    );

    return await parseResponse(response);
  },
};
