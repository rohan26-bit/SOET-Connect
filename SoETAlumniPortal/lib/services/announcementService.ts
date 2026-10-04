import {
  DocumentAttachmentData,
  serializeAttachmentIntoText,
  parseAttachmentFromText,
} from '@/components/DocumentAttachment';

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
  attachment?: {
    name: string;
    type: string;
    size: number;
    url?: string;
  } | null;
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
    const list = Array.isArray(data) ? data : [];
    return list.map((ann: any) => {
      const parsed = parseAttachmentFromText(ann.content);
      return {
        ...ann,
        content: parsed.cleanText,
        attachment: ann.attachment || parsed.attachment || null,
      };
    });
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
    attachment?: DocumentAttachmentData | null;
  }) {
    const serializedContent = serializeAttachmentIntoText(
      data.content,
      data.attachment
    );

    const response = await fetch(`${API_URL}/announcements`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${getToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: data.title,
        content: serializedContent,
        target_audience: data.target_audience || 'all',
        attachment: data.attachment ? {
          name: data.attachment.name,
          type: data.attachment.type,
          size: data.attachment.size,
          url: data.attachment.url,
        } : null,
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
      attachment?: DocumentAttachmentData | null;
    }
  ) {
    const payload: any = { ...data };
    if (data.attachment !== undefined && data.content !== undefined) {
      payload.content = serializeAttachmentIntoText(data.content, data.attachment);
    }

    const response = await fetch(
      `${API_URL}/announcements/${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${getToken()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
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
