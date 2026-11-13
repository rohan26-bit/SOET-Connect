import {
  DocumentAttachmentData,
  serializeAttachmentIntoText,
  parseAttachmentFromText,
} from '@/components/DocumentAttachment';

const API_URL = '/api';



type ApiRecord = Record<string, unknown>;

function isRecord(value: unknown): value is ApiRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown, label: string): ApiRecord {
  if (!isRecord(value)) {
    throw new Error('Unexpected ' + label + ' response format.');
  }
  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function normalizeAttachment(value: unknown): AnnouncementItem['attachment'] {
  if (!isRecord(value) || typeof value.name !== 'string') return null;
  return {
    name: value.name,
    type: typeof value.type === 'string' ? value.type : 'DOCUMENT',
    size: optionalNumber(value.size) ?? 0,
    url: optionalString(value.url),
  };
}

function normalizeAnnouncement(value: unknown): AnnouncementItem {
  const announcement = asRecord(value, 'announcement');
  const content = typeof announcement.content === 'string' ? announcement.content : '';
  const parsed = parseAttachmentFromText(content);
  const audience = announcement.target_audience;

  if (audience !== 'all' && audience !== 'students' && audience !== 'alumni') {
    throw new Error('The announcement response contains an unsupported target audience.');
  }

  if (
    typeof announcement.id !== 'string' ||
    typeof announcement.title !== 'string' ||
    typeof announcement.created_at !== 'string'
  ) {
    throw new Error('The announcement response is missing required fields.');
  }

  return {
    id: announcement.id,
    title: announcement.title,
    content: parsed.cleanText,
    target_audience: audience,
    expires_at: optionalString(announcement.expires_at),
    is_expired: optionalBoolean(announcement.is_expired),
    created_at: announcement.created_at,
    created_by: optionalString(announcement.created_by),
    is_published: optionalBoolean(announcement.is_published),
    creator_name: optionalString(announcement.creator_name),
    updated_at: optionalString(announcement.updated_at),
    attachment: normalizeAttachment(announcement.attachment) || parsed.attachment || null,
  };
}

export interface AnnouncementActionResult {
  message: string;
  announcement: AnnouncementItem;
}

function normalizeActionResult(value: unknown): AnnouncementActionResult {
  const result = asRecord(value, 'announcement action');
  if (typeof result.message !== 'string') {
    throw new Error('The announcement action response is missing its message.');
  }

  return {
    message: result.message,
    announcement: normalizeAnnouncement(result.announcement),
  };
}

async function parseResponse(
  response: Response,
  fallbackMessage = 'Request failed.'
): Promise<unknown> {
  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    // Empty or malformed JSON is handled using a safe fallback message.
  }

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Your session has expired. Please log in again.');
    }
    const detail = isRecord(data) && typeof data.detail === 'string' ? data.detail : fallbackMessage;
    throw new Error(detail);
  }

  return data;
}

export interface AnnouncementItem {
  id: string;
  title: string;
  content: string;
  target_audience: 'all' | 'students' | 'alumni';
  expires_at?: string;
  is_expired?: boolean;
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

        'Content-Type': 'application/json',
      },
    });

    const data = await parseResponse(response, 'Failed to load announcements.');
    if (!Array.isArray(data)) {
      throw new Error('Unexpected announcements response format. Please refresh and try again.');
    }
    return data.map(normalizeAnnouncement);
  },

  // ============================================================
  // CREATE ANNOUNCEMENT (ADMIN ONLY)
  // ============================================================

  async createAnnouncement(data: {
    title: string;
    content: string;
    target_audience: 'all' | 'students' | 'alumni';
    expires_at?: string | null;
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

        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: data.title,
        content: serializedContent,
        target_audience: data.target_audience || 'all',
        expires_at: data.expires_at || null,
        attachment: data.attachment ? {
          name: data.attachment.name,
          type: data.attachment.type,
          size: data.attachment.size,
          url: data.attachment.url,
        } : null,
      }),
    });

    return normalizeActionResult(
      await parseResponse(response, 'Failed to create announcement.')
    );
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
      expires_at?: string | null;
      attachment?: DocumentAttachmentData | null;
    }
  ) {
    const payload: {
      title?: string;
      content?: string;
      target_audience?: 'all' | 'students' | 'alumni';
      expires_at?: string | null;
    } = {
      title: data.title,
      content: data.content,
      target_audience: data.target_audience,
      expires_at: data.expires_at,
    };
    if (data.attachment !== undefined && data.content !== undefined) {
      payload.content = serializeAttachmentIntoText(data.content, data.attachment);
    }

    const response = await fetch(
      `${API_URL}/announcements/${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        headers: {

          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }
    );

    return normalizeActionResult(
      await parseResponse(response, 'Failed to update announcement.')
    );
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

          'Content-Type': 'application/json',
        },
      }
    );

    return normalizeActionResult(
      await parseResponse(response, 'Failed to delete announcement.')
    );
  },
};
