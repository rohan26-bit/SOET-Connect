const API_URL = 'http://127.0.0.1:8000';

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

export interface AnnouncementItem {
  id: string;
  title: string;
  content: string;
  target_audience: 'all' | 'students' | 'alumni';
  created_at: string;
  created_by?: string;
  is_published?: boolean;
  creator_name?: string;
  updated_at?: string;
}

export const announcementService = {
  // ============================================================
  // GET ALL ANNOUNCEMENTS (ROLE-FILTERED VIA FASTAPI)
  // ============================================================

  async getAnnouncements(): Promise<AnnouncementItem[]> {
    const response = await fetch(`${API_URL}/announcements`, {
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
  // CREATE ANNOUNCEMENT (ADMIN ONLY)
  // ============================================================

  async createAnnouncement(data: {
    title: string;
    content: string;
    target_audience: 'all' | 'students' | 'alumni';
    created_by?: string;
    is_published?: boolean;
  }) {
    const response = await fetch(`${API_URL}/announcements`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${getToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: data.title,
        content: data.content,
        target_audience: data.target_audience || 'all',
      }),
    });

    return await parseResponse(response);
  },

  // ============================================================
  // UPDATE ANNOUNCEMENT (ADMIN ONLY)
  // ============================================================

  async updateAnnouncement(
    id: string,
    data: {
      title?: string;
      content?: string;
      target_audience?: 'all' | 'students' | 'alumni';
    }
  ) {
    const response = await fetch(
      `${API_URL}/announcements/${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${getToken()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      }
    );

    return await parseResponse(response);
  },

  // ============================================================
  // DELETE ANNOUNCEMENT (ADMIN ONLY)
  // ============================================================

  async deleteAnnouncement(id: string) {
    const response = await fetch(
      `${API_URL}/announcements/${encodeURIComponent(id)}`,
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
};
