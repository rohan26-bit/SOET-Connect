import { createClient } from '@/utils/supabase/client';

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
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  created_at: string;
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

export const eventService = {
  async getApprovedEvents(userId?: string): Promise<EventItem[]> {
    const supabase = createClient();

    const { data: events, error } = await supabase
      .from('events')
      .select(`
        *,
        profiles (
          full_name,
          avatar_url
        ),
        event_registrations (
          user_id
        )
      `)
      .eq('status', 'approved')
      .order('event_date', { ascending: true });

    if (error) throw new Error(error.message);

    return (events || []).map((e: any) => ({
      id: e.id,
      created_by: e.created_by,
      title: e.title,
      description: e.description,
      event_date: e.event_date,
      start_time: e.start_time,
      end_time: e.end_time,
      location: e.location,
      image_url: e.image_url,
      registration_deadline: e.registration_deadline,
      status: e.status,
      created_at: e.created_at,
      creator_name: e.profiles?.full_name,
      creator_avatar: e.profiles?.avatar_url,
      registration_count: e.event_registrations?.length || 0,
      is_registered: userId ? e.event_registrations?.some((r: any) => r.user_id === userId) : false,
    }));
  },

  async getAllEventsForAdmin(): Promise<EventItem[]> {
    const supabase = createClient();

    const { data, error } = await supabase
      .from('events')
      .select(`
        *,
        profiles (
          full_name,
          avatar_url
        ),
        event_registrations (
          user_id
        )
      `)
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);

    return (data || []).map((e: any) => ({
      id: e.id,
      created_by: e.created_by,
      title: e.title,
      description: e.description,
      event_date: e.event_date,
      start_time: e.start_time,
      end_time: e.end_time,
      location: e.location,
      image_url: e.image_url,
      registration_deadline: e.registration_deadline,
      status: e.status,
      created_at: e.created_at,
      creator_name: e.profiles?.full_name,
      creator_avatar: e.profiles?.avatar_url,
      registration_count: e.event_registrations?.length || 0,
    }));
  },

  async getMyEvents(userId: string): Promise<EventItem[]> {
    const supabase = createClient();

    const { data, error } = await supabase
      .from('events')
      .select(`
        *,
        event_registrations (
          user_id
        )
      `)
      .eq('created_by', userId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);

    return (data || []).map((e: any) => ({
      id: e.id,
      created_by: e.created_by,
      title: e.title,
      description: e.description,
      event_date: e.event_date,
      start_time: e.start_time,
      end_time: e.end_time,
      location: e.location,
      image_url: e.image_url,
      registration_deadline: e.registration_deadline,
      status: e.status,
      created_at: e.created_at,
      registration_count: e.event_registrations?.length || 0,
    }));
  },

  async createEvent(eventData: {
    created_by: string;
    title: string;
    description: string;
    event_date: string;
    start_time?: string;
    end_time?: string;
    location: string;
    image_file?: File;
    registration_deadline?: string;
  }) {
    const supabase = createClient();
    let imageUrl = '';

    if (eventData.image_file) {
      const file = eventData.image_file;
      const fileExt = file.name.split('.').pop();
      const filePath = `${eventData.created_by}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('event-images')
        .upload(filePath, file);

      if (!uploadError) {
        const { data: { publicUrl } } = supabase.storage.from('event-images').getPublicUrl(filePath);
        imageUrl = publicUrl;
      }
    }

    const { data, error } = await supabase
      .from('events')
      .insert({
        created_by: eventData.created_by,
        title: eventData.title,
        description: eventData.description,
        event_date: eventData.event_date,
        start_time: eventData.start_time || null,
        end_time: eventData.end_time || null,
        location: eventData.location,
        image_url: imageUrl || undefined,
        registration_deadline: eventData.registration_deadline || null,
        status: 'pending',
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  },

  async updateEventStatus(eventId: string, status: 'approved' | 'rejected' | 'cancelled') {
    const supabase = createClient();

    const { data: ev, error } = await supabase
      .from('events')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', eventId)
      .select('created_by, title')
      .single();

    if (error) throw new Error(error.message);

    if (ev) {
      await supabase.from('notifications').insert({
        user_id: ev.created_by,
        title: 'Event Status Updated',
        message: `Your event "${ev.title}" has been ${status}.`,
        type: 'event',
      });
    }
  },

  async deleteEvent(eventId: string) {
    const supabase = createClient();
    const { error } = await supabase.from('events').delete().eq('id', eventId);
    if (error) throw new Error(error.message);
  },

  async registerForEvent(eventId: string, userId: string) {
    const supabase = createClient();

    // Check duplicate
    const { data: existing } = await supabase
      .from('event_registrations')
      .select('id')
      .eq('event_id', eventId)
      .eq('user_id', userId)
      .maybeSingle();

    if (existing) {
      throw new Error('You are already registered for this event.');
    }

    const { error } = await supabase
      .from('event_registrations')
      .insert({
        event_id: eventId,
        user_id: userId,
      });

    if (error) throw new Error(error.message);

    // Notify user
    await supabase.from('notifications').insert({
      user_id: userId,
      title: 'Event Registration Confirmed',
      message: 'You have successfully registered for the event.',
      type: 'event',
    });
  },

  async cancelRegistration(eventId: string, userId: string) {
    const supabase = createClient();
    const { error } = await supabase
      .from('event_registrations')
      .delete()
      .eq('event_id', eventId)
      .eq('user_id', userId);

    if (error) throw new Error(error.message);
  },

  async getEventAttendees(eventId: string): Promise<EventAttendeeItem[]> {
    const supabase = createClient();

    const { data, error } = await supabase
      .from('event_registrations')
      .select(`
        *,
        profiles (
          id,
          full_name,
          email,
          role,
          avatar_url
        )
      `)
      .eq('event_id', eventId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);

    return (data || []).map((r: any) => ({
      id: r.id,
      user_id: r.user_id,
      event_id: r.event_id,
      created_at: r.created_at,
      user_name: r.profiles?.full_name,
      user_email: r.profiles?.email,
      user_role: r.profiles?.role,
      avatar_url: r.profiles?.avatar_url,
    }));
  }
};
