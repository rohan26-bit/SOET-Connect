import { createClient } from '@/utils/supabase/client';

export interface AnnouncementItem {
  id: string;
  created_by: string;
  title: string;
  content: string;
  target_audience: 'all' | 'students' | 'alumni';
  is_published: boolean;
  created_at: string;
  creator_name?: string;
}

export const announcementService = {
  async getAnnouncements(): Promise<AnnouncementItem[]> {
    const supabase = createClient();

    const { data, error } = await supabase
      .from('announcements')
      .select(`
        *,
        profiles (
          full_name
        )
      `)
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);

    return (data || []).map((a: any) => ({
      id: a.id,
      created_by: a.created_by,
      title: a.title,
      content: a.content,
      target_audience: a.target_audience,
      is_published: a.is_published,
      created_at: a.created_at,
      creator_name: a.profiles?.full_name,
    }));
  },

  async createAnnouncement(data: {
    created_by: string;
    title: string;
    content: string;
    target_audience: 'all' | 'students' | 'alumni';
    is_published?: boolean;
  }) {
    const supabase = createClient();

    const { error } = await supabase.from('announcements').insert({
      created_by: data.created_by,
      title: data.title,
      content: data.content,
      target_audience: data.target_audience,
      is_published: data.is_published ?? true,
    });

    if (error) throw new Error(error.message);
  },

  async deleteAnnouncement(id: string) {
    const supabase = createClient();
    const { error } = await supabase.from('announcements').delete().eq('id', id);
    if (error) throw new Error(error.message);
  }
};
