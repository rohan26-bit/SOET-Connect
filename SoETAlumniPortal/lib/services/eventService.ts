export interface EventItem {
  id: string;
  created_by: string;
  title: string;
  description: string;
  event_date: string;
  start_time?: string;
  end_time?: string;
  location: string;
  image_url?: string;
  registration_deadline?: string;
  event_type?: string;
  tags?: string[];
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  created_at: string;
  updated_at?: string;
  creator_name?: string;
  creator_avatar?: string;
  registration_count?: number;
  is_registered?: boolean;
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

const API_URL = 'http://127.0.0.1:8000';

function getAuthHeaders() {
  const token = localStorage.getItem('soet_access_token');

  if (!token) {
    throw new Error('Please log in again.');
  }

  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
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

    return (data || [])
      .filter((e: any) => e.status === 'approved')
      .map((e: any) => ({
        id: e.id,
        created_by: e.created_by,
        title: e.title,
        description: e.description,
        event_date: e.event_date || e.start_date || '',
        start_time: e.start_time,
        end_time: e.end_time,
        location: e.location,
        image_url: e.image_url,
        registration_deadline: e.registration_deadline,
        event_type: e.event_type,
        tags: e.tags,
        status: e.status,
        created_at: e.created_at,
        updated_at: e.updated_at,
        creator_name: e.creator_name,
        registration_count: e.registration_count || 0,
        is_registered: !!e.is_registered,
      }));
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

    return (data || []).map((e: any) => ({
      id: e.id,
      created_by: e.created_by,
      title: e.title,
      description: e.description,
      event_date: e.event_date || e.start_date || '',
      start_time: e.start_time,
      end_time: e.end_time,
      location: e.location,
      image_url: e.image_url,
      registration_deadline: e.registration_deadline,
      event_type: e.event_type,
      tags: e.tags,
      status: e.status,
      created_at: e.created_at,
      updated_at: e.updated_at,
      creator_name: e.creator_name,
      registration_count: e.registration_count || 0,
      is_registered: !!e.is_registered,
    }));
  },

  // ============================================================
  // GET MY EVENTS (CREATOR)
  // ============================================================
  async getMyEvents(userId: string): Promise<EventItem[]> {
    const response = await fetch(`${API_URL}/events`, {
      headers: getAuthHeaders(),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.detail || 'Failed to load your events.');
    }

    return (data || [])
      .filter((e: any) => String(e.created_by) === String(userId))
      .map((e: any) => ({
        id: e.id,
        created_by: e.created_by,
        title: e.title,
        description: e.description,
        event_date: e.event_date || e.start_date || '',
        start_time: e.start_time,
        end_time: e.end_time,
        location: e.location,
        image_url: e.image_url,
        registration_deadline: e.registration_deadline,
        event_type: e.event_type,
        tags: e.tags,
        status: e.status,
        created_at: e.created_at,
        updated_at: e.updated_at,
        creator_name: e.creator_name,
        registration_count: e.registration_count || 0,
        is_registered: !!e.is_registered,
      }));
  },

  // ============================================================
  // CREATE EVENT
  // ============================================================
  async createEvent(eventData: {
    created_by?: string;
    title: string;
    description: string;
    event_date: string;
    start_time?: string;
    end_time?: string;
    location: string;
    image_file?: File;
    image_url?: string;
    registration_deadline?: string;
    event_type?: string;
    tags?: string[];
  }) {
    // Note on image upload: Supabase Storage is disconnected.
    // Preserving image_url string if provided.
    const response = await fetch(`${API_URL}/events`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        title: eventData.title,
        description: eventData.description,
        event_date: eventData.event_date,
        start_time: eventData.start_time || '',
        end_time: eventData.end_time || '',
        location: eventData.location,
        event_type: eventData.event_type || '',
        image_url: eventData.image_url || '',
        registration_deadline: eventData.registration_deadline || null,
        tags: eventData.tags || [],
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
    const response = await fetch(
      `${API_URL}/events/${encodeURIComponent(eventId)}`,
      {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify(eventData),
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

    return data || [];
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
    }));
  },
};

