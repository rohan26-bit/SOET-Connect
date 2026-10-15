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

export interface NotificationPreferences {
  user_id?: string;
  email_enabled: boolean;
  sms_enabled: boolean;
  in_app_enabled: boolean;
  notify_jobs: boolean;
  notify_events: boolean;
  notify_announcements: boolean;
  notify_applications: boolean;
  notify_gallery: boolean;
  phone?: string;
  is_phone_verified?: boolean;
  is_email_configured?: boolean;
  is_sms_configured?: boolean;
}

export interface NotificationDeliveryItem {
  id: string;
  notification_id?: string;
  user_id: string;
  channel: 'email' | 'sms' | 'in_app';
  status: 'accepted' | 'sent' | 'delivered' | 'skipped' | 'failed' | 'pending';
  provider?: string;
  recipient?: string;
  error_message?: string;
  created_at: string;
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

  // ============================================================
  // GET PREFERENCES
  // ============================================================

  async getPreferences(): Promise<NotificationPreferences> {
    const response = await fetch(`${API_URL}/notifications/preferences`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${getToken()}`,
        'Content-Type': 'application/json',
      },
    });

    return await parseResponse(response);
  },

  // ============================================================
  // UPDATE PREFERENCES
  // ============================================================

  async updatePreferences(prefs: Partial<NotificationPreferences>): Promise<NotificationPreferences> {
    const response = await fetch(`${API_URL}/notifications/preferences`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${getToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(prefs),
    });

    return await parseResponse(response);
  },

  // ============================================================
  // GET DELIVERIES (AUDIT TRAIL)
  // ============================================================

  async getDeliveries(limit: number = 20): Promise<NotificationDeliveryItem[]> {
    const response = await fetch(`${API_URL}/notifications/deliveries?limit=${limit}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${getToken()}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await parseResponse(response);
    return Array.isArray(data) ? data : [];
  },
};
