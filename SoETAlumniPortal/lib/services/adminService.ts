import { createClient } from '@/utils/supabase/client';

export interface AdminMetrics {
  totalStudents: number;
  totalAlumni: number;
  verifiedAlumni: number;
  pendingAlumni: number;
  totalJobs: number;
  pendingJobs: number;
  totalEvents: number;
  pendingEvents: number;
  totalApplications: number;
  totalRegistrations: number;
}

export interface UserManagementItem {
  id: string;
  email: string;
  full_name: string;
  role: 'student' | 'alumni' | 'admin';
  avatar_url?: string;
  is_active: boolean;
  created_at: string;
  department?: string;
  course_or_company?: string;
  graduation_year?: string;
  verification_status?: string;
}

export const adminService = {
  async getDashboardMetrics(): Promise<AdminMetrics> {
    const supabase = createClient();

    const [
      { count: totalStudents },
      { count: totalAlumni },
      { count: verifiedAlumni },
      { count: pendingAlumni },
      { count: totalJobs },
      { count: pendingJobs },
      { count: totalEvents },
      { count: pendingEvents },
      { count: totalApplications },
      { count: totalRegistrations }
    ] = await Promise.all([
      supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'student'),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'alumni'),
      supabase.from('alumni_profiles').select('*', { count: 'exact', head: true }).eq('verification_status', 'approved'),
      supabase.from('alumni_profiles').select('*', { count: 'exact', head: true }).eq('verification_status', 'pending'),
      supabase.from('jobs').select('*', { count: 'exact', head: true }),
      supabase.from('jobs').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('events').select('*', { count: 'exact', head: true }),
      supabase.from('events').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('job_applications').select('*', { count: 'exact', head: true }),
      supabase.from('event_registrations').select('*', { count: 'exact', head: true }),
    ]);

    return {
      totalStudents: totalStudents || 0,
      totalAlumni: totalAlumni || 0,
      verifiedAlumni: verifiedAlumni || 0,
      pendingAlumni: pendingAlumni || 0,
      totalJobs: totalJobs || 0,
      pendingJobs: pendingJobs || 0,
      totalEvents: totalEvents || 0,
      pendingEvents: pendingEvents || 0,
      totalApplications: totalApplications || 0,
      totalRegistrations: totalRegistrations || 0,
    };
  },

  async getAllStudents(): Promise<UserManagementItem[]> {
    const supabase = createClient();

    const { data, error } = await supabase
      .from('profiles')
      .select(`
        *,
        student_profiles (*)
      `)
      .eq('role', 'student')
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);

    return (data || []).map((p: any) => ({
      id: p.id,
      email: p.email,
      full_name: p.full_name,
      role: p.role,
      avatar_url: p.avatar_url,
      is_active: p.is_active ?? true,
      created_at: p.created_at,
      department: p.student_profiles?.[0]?.department || p.student_profiles?.department,
      course_or_company: p.student_profiles?.[0]?.course || p.student_profiles?.course,
      graduation_year: p.student_profiles?.[0]?.graduation_year || p.student_profiles?.graduation_year,
    }));
  },

  async getAllAlumni(): Promise<UserManagementItem[]> {
    const supabase = createClient();

    const { data, error } = await supabase
      .from('profiles')
      .select(`
        *,
        alumni_profiles (*)
      `)
      .eq('role', 'alumni')
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);

    return (data || []).map((p: any) => ({
      id: p.id,
      email: p.email,
      full_name: p.full_name,
      role: p.role,
      avatar_url: p.avatar_url,
      is_active: p.is_active ?? true,
      created_at: p.created_at,
      department: p.alumni_profiles?.[0]?.department || p.alumni_profiles?.department,
      course_or_company: p.alumni_profiles?.[0]?.company || p.alumni_profiles?.company,
      graduation_year: p.alumni_profiles?.[0]?.graduation_year || p.alumni_profiles?.graduation_year,
      verification_status: p.alumni_profiles?.[0]?.verification_status || p.alumni_profiles?.verification_status,
    }));
  },

  async toggleUserActive(userId: string, currentActiveStatus: boolean) {
    const supabase = createClient();

    // Check if trying to suspend last admin
    const { data: user } = await supabase.from('profiles').select('role').eq('id', userId).single();
    if (user?.role === 'admin' && currentActiveStatus) {
      const { count } = await supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'admin').eq('is_active', true);
      if (count && count <= 1) {
        throw new Error('Cannot suspend the last active administrator.');
      }
    }

    const { error } = await supabase
      .from('profiles')
      .update({ is_active: !currentActiveStatus, updated_at: new Date().toISOString() })
      .eq('id', userId);

    if (error) throw new Error(error.message);
  }
};
