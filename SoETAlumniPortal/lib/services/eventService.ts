import {
  DocumentAttachmentData,
  serializeAttachmentIntoText,
  parseAttachmentFromText,
} from '@/components/DocumentAttachment';

export interface EventItem {
  id: string;
  created_by: string;
  title: string;
  description: string;
  event_date: string;
  end_date?: string | null;
  start_time?: string;
  end_time?: string | null;
  location: string;
  image_url?: string;
  registration_deadline?: string;
  event_type?: string;
  tags?: string[];
  status: 'pending' | 'approved' | 'rejected' | 'cancelled' | 'completed';
  created_at: string;
  updated_at?: string;
  creator_name?: string;
  organizer?: string;
  visibility?: 'everyone' | 'students_only' | 'alumni_only' | 'admin_only';
  capacity?: number | null;
  creator_avatar?: string;
  registration_count?: number;
  is_registered?: boolean;
  is_past?: boolean;
  is_registration_closed?: boolean;
  is_expired?: boolean;
  expired_at?: string | null;
  auto_delete_at?: string | null;
  days_until_auto_delete?: number | null;
  attachment?: {
    name: string;
    type: string;
    size: number;
    url?: string;
  } | null;
}

export interface EventAttendeeItem {
  id: string;
  user_id: string;
  event_id: string;
  created_at: string;
  user_name: string;
  user_email: string;
  user_role: string;
  avatar_url?: string;
}

const API_URL = '/api';

function getAuthHeaders(): Record<string, string> {
  return { 'Content-Type': 'application/json' };
}

function normalizeEvent(e: any): EventItem {
  const parsed = parseAttachmentFromText(e.description);
  return {
    id: e.id,
    created_by: e.created_by,
    title: e.title,
    description: parsed.cleanText,
    event_date: e.event_date || e.start_date || '',
    end_date: e.end_date || '',
    start_time: e.start_time,
    end_time: e.end_time,
    location: e.location,
    image_url: e.image_url || e.virtual_link || '',
    registration_deadline: e.registration_deadline,
    event_type: e.event_type,
    tags: e.tags,
    status: e.status,
    created_at: e.created_at,
    updated_at: e.updated_at,
    creator_name: e.creator_name,
    organizer: e.organizer || e.creator_name || 'SOET Connect',
    visibility: e.visibility || 'everyone',
    capacity: e.capacity == null ? null : Number(e.capacity),
    registration_count: e.registration_count || 0,
    is_registered: !!e.is_registered,
    is_past: !!e.is_past,
    is_registration_closed: !!e.is_registration_closed,
    is_expired: !!e.is_expired,
    expired_at: e.expired_at || null,
    auto_delete_at: e.auto_delete_at || null,
    days_until_auto_delete: e.days_until_auto_delete ?? null,
    attachment: e.attachment || parsed.attachment || null,
  };
}

function newestEventsFirst(events: EventItem[]): EventItem[] {
  return [...events].sort((a, b) => {
    const aTime = Date.parse(a.created_at || a.event_date || '');
    const bTime = Date.parse(b.created_at || b.event_date || '');
    return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0);
  });
}

export const eventService = {
  // ============================================================
  // GET APPROVED EVENTS
  // ============================================================
  async getApprovedEvents(userId?: string): Promise<EventItem[]> {
    const response = await fetch(`${API_URL}/events`, {
      headers: getAuthHeaders(),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.detail || 'Failed to load events.');
    }

    return newestEventsFirst((data || [])
      .filter((e: any) => e.status === 'approved')
      .map(normalizeEvent));
  },

  // ============================================================
  // GET ALL EVENTS (ADMIN)
  // ============================================================
  async getAllEventsForAdmin(): Promise<EventItem[]> {
    const response = await fetch(`${API_URL}/events`, {
      headers: getAuthHeaders(),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.detail || 'Failed to load events for admin.');
    }

    return newestEventsFirst((data || []).map(normalizeEvent));
  },

  // ============================================================
  // GET MY EVENTS (CREATOR)
  // ============================================================
  async getMyEvents(userId: string): Promise<EventItem[]> {
    const url = userId ? `${API_URL}/events?created_by=${encodeURIComponent(userId)}` : `${API_URL}/events`;
    const response = await fetch(url, {
      headers: getAuthHeaders(),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.detail || 'Failed to load your events.');
    }

    return newestEventsFirst((data || [])
      .filter((e: any) => !userId || String(e.created_by) === String(userId))
      .map(normalizeEvent));
  },


  // ============================================================
  // CREATE EVENT
  // ============================================================
  async createEvent(eventData: {
    created_by?: string;
    title: string;
    description: string;
    event_date: string;
    end_date?: string;
    start_time?: string;
    end_time?: string;
    organizer?: string;
    visibility?: 'everyone' | 'students_only' | 'alumni_only' | 'admin_only';
    capacity?: number | null;
    location: string;
    image_file?: File;
    image_url?: string;
    registration_deadline?: string;
    event_type?: string;
    tags?: string[];
    attachment?: DocumentAttachmentData | null;
  }) {
    const serializedDescription = serializeAttachmentIntoText(
      eventData.description,
      eventData.attachment
    );

    const response = await fetch(`${API_URL}/events`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        title: eventData.title,
        description: serializedDescription,
        event_date: eventData.event_date,
        end_date: eventData.end_date || null,
        start_time: eventData.start_time || '',
        end_time: eventData.end_time || null,
        organizer: eventData.organizer || '',
        visibility: eventData.visibility || 'everyone',
        capacity: eventData.capacity ?? null,
        location: eventData.location,
        event_type: eventData.event_type || '',
        image_url: eventData.image_url || '',
        registration_deadline: eventData.registration_deadline || null,
        tags: eventData.tags || [],
        attachment: eventData.attachment ? {
          name: eventData.attachment.name,
          type: eventData.attachment.type,
          size: eventData.attachment.size,
          url: eventData.attachment.url,
        } : null,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.detail || 'Failed to create event.');
    }

    return data.event;
  },

  // ============================================================
  // UPDATE EVENT
  // ============================================================
  async updateEvent(
    eventId: string,
    eventData: Partial<EventItem>
  ) {
    const payload: any = { ...eventData };
    if (eventData.attachment !== undefined && eventData.description !== undefined) {
      payload.description = serializeAttachmentIntoText(
        eventData.description,
        eventData.attachment
      );
    }

    const response = await fetch(
      `${API_URL}/events/${encodeURIComponent(eventId)}`,
      {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.detail || 'Failed to update event.');
    }

    return data.event;
  },

  // ============================================================
  // UPDATE EVENT STATUS (ADMIN)
  // ============================================================
  async updateEventStatus(
    eventId: string,
    status: 'approved' | 'rejected' | 'cancelled'
  ) {
    const response = await fetch(
      `${API_URL}/events/${encodeURIComponent(eventId)}`,
      {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ status }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.detail || 'Failed to update event status.');
    }

    return data.event;
  },

  // ============================================================
  // DELETE EVENT
  // ============================================================
  async deleteEvent(eventId: string) {
    const response = await fetch(
      `${API_URL}/events/${encodeURIComponent(eventId)}`,
      {
        method: 'DELETE',
        headers: getAuthHeaders(),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.detail || 'Failed to delete event.');
    }

    return data;
  },

  // ============================================================
  // REGISTER FOR EVENT
  // ============================================================
  async registerForEvent(eventId: string, userId?: string) {
    const response = await fetch(
      `${API_URL}/events/${encodeURIComponent(eventId)}/register`,
      {
        method: 'POST',
        headers: getAuthHeaders(),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.detail || 'Failed to register for event.');
    }

    return data;
  },

  // ============================================================
  // CANCEL REGISTRATION
  // ============================================================
  async cancelRegistration(eventId: string, userId?: string) {
    const response = await fetch(
      `${API_URL}/events/${encodeURIComponent(eventId)}/register`,
      {
        method: 'DELETE',
        headers: getAuthHeaders(),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.detail || 'Failed to cancel registration.');
    }

    return data;
  },

  // ============================================================
  // GET MY REGISTRATIONS
  // ============================================================
  async getMyRegistrations() {
    const response = await fetch(`${API_URL}/events/registrations/me`, {
      headers: getAuthHeaders(),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.detail || 'Failed to load your registrations.');
    }

    return (data || []).sort((a: any, b: any) => {
      const aTime = Date.parse(a.created_at || a.registered_at || '');
      const bTime = Date.parse(b.created_at || b.registered_at || '');
      return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0);
    });
  },

  // ============================================================
  // GET EVENT ATTENDEES
  // ============================================================
  async getEventAttendees(eventId: string): Promise<EventAttendeeItem[]> {
    const response = await fetch(
      `${API_URL}/events/${encodeURIComponent(eventId)}/registrations`,
      {
        headers: getAuthHeaders(),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.detail || 'Failed to load event attendees.');
    }

    return (data || []).map((r: any) => ({
      id: r.id,
      user_id: r.user_id,
      event_id: r.event_id,
      created_at: r.created_at || r.registered_at,
      user_name: r.user_name,
      user_email: r.user_email,
      user_role: r.user_role,
      avatar_url: r.avatar_url,
    })).sort((a: EventAttendeeItem, b: EventAttendeeItem) => {
      const aTime = Date.parse(a.created_at || '');
      const bTime = Date.parse(b.created_at || '');
      return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0);
    });
  },
};

