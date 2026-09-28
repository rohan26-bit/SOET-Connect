import { createClient } from '@/utils/supabase/client';

export interface AlumniDirectoryItem {
  id: string;
  full_name: string;
  email: string;
  avatar_url?: string;
  department: string;
  degree?: string;
  graduation_year: string;
  company?: string;
  designation?: string;
  industry?: string;
  location?: string;
  skills?: string[];
  linkedin?: string;
  github?: string;
  website?: string;
  bio?: string;
  verification_status: string;
  created_at: string;
}

export const alumniService = {
  async getApprovedAlumni(filters?: {
    search?: string;
    department?: string;
    graduationYear?: string;
    company?: string;
    industry?: string;
    location?: string;
  }): Promise<AlumniDirectoryItem[]> {
    const supabase = createClient();

    let query = supabase
      .from('alumni_profiles')
      .select(`
        *,
        profiles!inner (
          id,
          full_name,
          email,
          avatar_url,
          is_active
        )
      `)
      .eq('verification_status', 'approved')
      .eq('profiles.is_active', true);

    if (filters?.department) {
      query = query.ilike('department', `%${filters.department}%`);
    }
    if (filters?.graduationYear) {
      query = query.eq('graduation_year', filters.graduationYear);
    }
    if (filters?.company) {
      query = query.ilike('company', `%${filters.company}%`);
    }
    if (filters?.industry) {
      query = query.ilike('industry', `%${filters.industry}%`);
    }
    if (filters?.location) {
      query = query.ilike('location', `%${filters.location}%`);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    let result = (data || []).map((item: any) => ({
      id: item.profiles.id,
      full_name: item.profiles.full_name,
      email: item.profiles.email,
      avatar_url: item.profiles.avatar_url,
      department: item.department,
      degree: item.degree,
      graduation_year: item.graduation_year,
      company: item.company,
      designation: item.designation,
      industry: item.industry,
      location: item.location,
      skills: item.skills,
      linkedin: item.linkedin,
      github: item.github,
      website: item.website,
      bio: item.bio,
      verification_status: item.verification_status,
      created_at: item.created_at,
    }));

    if (filters?.search) {
      const s = filters.search.toLowerCase();
      result = result.filter(
        (a) =>
          a.full_name.toLowerCase().includes(s) ||
          a.company?.toLowerCase().includes(s) ||
          a.designation?.toLowerCase().includes(s) ||
          a.skills?.some((sk: string) => sk.toLowerCase().includes(s))
      );
    }

    return result;
  },

  async getPendingAlumni(): Promise<AlumniDirectoryItem[]> {
    const supabase = createClient();

    const { data, error } = await supabase
      .from('alumni_profiles')
      .select(`
        *,
        profiles!inner (
          id,
          full_name,
          email,
          avatar_url,
          created_at
        )
      `)
      .eq('verification_status', 'pending')
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);

    return (data || []).map((item: any) => ({
      id: item.profiles.id,
      full_name: item.profiles.full_name,
      email: item.profiles.email,
      avatar_url: item.profiles.avatar_url,
      department: item.department,
      degree: item.degree,
      graduation_year: item.graduation_year,
      company: item.company,
      designation: item.designation,
      industry: item.industry,
      location: item.location,
      skills: item.skills,
      linkedin: item.linkedin,
      github: item.github,
      website: item.website,
      bio: item.bio,
      verification_status: item.verification_status,
      created_at: item.profiles.created_at,
    }));
  },

  async updateVerificationStatus(userId: string, status: 'approved' | 'rejected' | 'suspended') {
    const supabase = createClient();
    const { error } = await supabase
      .from('alumni_profiles')
      .update({ verification_status: status, updated_at: new Date().toISOString() })
      .eq('id', userId);

    if (error) throw new Error(error.message);

    // Send notification to the user
    await supabase.from('notifications').insert({
      user_id: userId,
      title: 'Alumni Verification Update',
      message: `Your alumni verification status has been updated to: ${status.toUpperCase()}`,
      type: 'system',
    });
  }
};
