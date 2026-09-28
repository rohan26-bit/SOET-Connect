import { createClient } from '@/utils/supabase/client';

export interface NotificationItem {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type?: string;
  link?: string;
  is_read: boolean;
  created_at: string;
}

export const notificationService = {
  async getNotifications(userId: string): Promise<NotificationItem[]> {
    const supabase = createClient();

    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    return data || [];
  },

  async markAsRead(notificationId: string) {
    const supabase = createClient();
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notificationId);

    if (error) throw new Error(error.message);
  },

  async markAllAsRead(userId: string) {
    const supabase = createClient();
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', userId);

    if (error) throw new Error(error.message);
  }
};
