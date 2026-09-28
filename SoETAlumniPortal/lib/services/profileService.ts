import { createClient } from '@/utils/supabase/client';

export const profileService = {
  async updateStudentProfile(userId: string, data: {
    fullName?: string;
    studentId?: string;
    department?: string;
    course?: string;
    academicYear?: string;
    graduationYear?: string;
    phone?: string;
  }) {
    const supabase = createClient();

    if (data.fullName) {
      await supabase.from('profiles').update({ full_name: data.fullName, updated_at: new Date().toISOString() }).eq('id', userId);
    }

    const { error } = await supabase.from('student_profiles').upsert({
      id: userId,
      student_id: data.studentId,
      department: data.department,
      course: data.course,
      academic_year: data.academicYear,
      graduation_year: data.graduationYear,
      phone: data.phone,
      updated_at: new Date().toISOString()
    });

    if (error) throw new Error(error.message);
  },

  async updateAlumniProfile(userId: string, data: {
    fullName?: string;
    alumniId?: string;
    department?: string;
    degree?: string;
    graduationYear?: string;
    company?: string;
    designation?: string;
    industry?: string;
    location?: string;
    skills?: string[];
    linkedin?: string;
    github?: string;
    website?: string;
    bio?: string;
  }) {
    const supabase = createClient();

    if (data.fullName) {
      await supabase.from('profiles').update({ full_name: data.fullName, updated_at: new Date().toISOString() }).eq('id', userId);
    }

    const { error } = await supabase.from('alumni_profiles').upsert({
      id: userId,
      alumni_id: data.alumniId,
      department: data.department,
      degree: data.degree,
      graduation_year: data.graduationYear,
      company: data.company,
      designation: data.designation,
      industry: data.industry,
      location: data.location,
      skills: data.skills,
      linkedin: data.linkedin,
      github: data.github,
      website: data.website,
      bio: data.bio,
      updated_at: new Date().toISOString()
    });

    if (error) throw new Error(error.message);
  },

  async uploadAvatar(userId: string, file: File): Promise<string> {
    const supabase = createClient();
    const fileExt = file.name.split('.').pop();
    const filePath = `${userId}/${Date.now()}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, file, { upsert: true });

    if (uploadError) throw new Error(uploadError.message);

    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(filePath);

    await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', userId);
    return publicUrl;
  }
};
