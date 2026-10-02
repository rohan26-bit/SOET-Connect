const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

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

export interface NotificationItem {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type?: string;
  link?: string;
  is_read: boolean;
  created_at: string;
  read_at?: string;
  entity_type?: string;
  entity_id?: string;
  dedupe_key?: string;
}

export const notificationService = {
  // ============================================================
  // GET ALL NOTIFICATIONS
  // ============================================================

  async getNotifications(_userId?: string): Promise<NotificationItem[]> {
    const response = await fetch(`${API_URL}/notifications`, {
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
  // MARK A SINGLE NOTIFICATION AS READ
  // ============================================================

  async markAsRead(notificationId: string) {
    const response = await fetch(
      `${API_URL}/notifications/${encodeURIComponent(notificationId)}/read`,
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

  // ============================================================
  // MARK ALL NOTIFICATIONS AS READ
  // ============================================================

  async markAllAsRead(_userId?: string) {
    const response = await fetch(`${API_URL}/notifications/read-all`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${getToken()}`,
        'Content-Type': 'application/json',
      },
    });

    return await parseResponse(response);
  },
};
