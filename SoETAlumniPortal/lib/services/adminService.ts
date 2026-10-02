const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

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

export interface PendingAlumni {
  id: string;
  full_name: string;
  email: string;
  alumni_id?: string;
  avatar_url?: string;
  department?: string;
  degree?: string;
  graduation_year?: string;
  company?: string;
  designation?: string;
  industry?: string;
  location?: string;
  skills?: string[];
  linkedin?: string;
  github?: string;
  website?: string;
  bio?: string;
  is_verified: boolean;
  created_at?: string;
}
export interface UserManagementItem {
  id: string;
  full_name: string;
  email: string;
  role: 'student' | 'alumni' | 'admin';

  avatar_url?: string;
  department?: string;
  degree?: string;
  graduation_year?: string;

  course_or_company?: string;
  company?: string;
  designation?: string;
  industry?: string;
  location?: string;

  skills?: string[];
  linkedin?: string;
  github?: string;
  website?: string;
  bio?: string;

  is_verified: boolean;
  verification_status?: string;
  is_active?: boolean;
  created_at?: string;
}

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
    const detail =
      typeof data.detail === 'string'
        ? data.detail
        : JSON.stringify(data.detail || 'Request failed.');

    throw new Error(detail);
  }

  return data;
}

export const adminService = {

  // ============================================================
  // GET PENDING ALUMNI
  // ============================================================

  async getPendingAlumni(): Promise<PendingAlumni[]> {
    const response = await fetch(
      `${API_URL}/alumni/pending`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${getToken()}`,
          'Content-Type': 'application/json',
        },
      }
    );

    return parseResponse(response);
  },

  // ============================================================
  // UPDATE ALUMNI VERIFICATION
  // ============================================================

  async updateAlumniVerification(
    userId: string,
    status: 'approved' | 'rejected' | 'suspended'
  ) {
    const response = await fetch(
      `${API_URL}/alumni/verify/${encodeURIComponent(userId)}?status=${encodeURIComponent(status)}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${getToken()}`,
          'Content-Type': 'application/json',
        },
      }
    );

    return parseResponse(response);
  },

  // ============================================================
  // ADMIN DASHBOARD METRICS
  // ============================================================

 async getDashboardMetrics(): Promise<AdminMetrics> {
  const response = await fetch(
    `${API_URL}/admin/metrics`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${getToken()}`,
        'Content-Type': 'application/json',
      },
    }
  );

  return parseResponse(response);
},

  // ============================================================
  // USER MANAGEMENT (STUDENTS & ALUMNI)
  // ============================================================

  async getAllStudents(): Promise<UserManagementItem[]> {
    const response = await fetch(`${API_URL}/admin/students`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${getToken()}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await parseResponse(response);
    return (data || []).map((s: any) => ({
      id: s.id,
      full_name: s.full_name || s.name || '',
      email: s.email || '',
      role: s.role || ('student' as const),
      avatar_url: s.avatar_url,
      department: s.department,
      degree: s.degree,
      graduation_year: s.graduation_year,
      course_or_company: s.course_or_company || s.course || s.department || 'B.Tech',
      is_verified: s.is_verified ?? true,
      verification_status: s.verification_status || 'approved',
      is_active: s.is_active ?? true,
      created_at: s.created_at,
    }));
  },

  async getAllAlumni(): Promise<UserManagementItem[]> {
    const [directoryRes, pendingRes] = await Promise.all([
      fetch(`${API_URL}/alumni/directory`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${getToken()}`,
          'Content-Type': 'application/json',
        },
      }),
      fetch(`${API_URL}/alumni/pending`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${getToken()}`,
          'Content-Type': 'application/json',
        },
      }),
    ]);

    const directoryData = await parseResponse(directoryRes);
    const pendingData = await parseResponse(pendingRes).catch(() => []);

    const alumniMap = new Map<string, UserManagementItem>();

    (directoryData || []).forEach((a: any) => {
      alumniMap.set(a.id, {
        id: a.id,
        full_name: a.full_name || a.name || '',
        email: a.email || '',
        role: 'alumni' as const,
        avatar_url: a.avatar_url,
        department: a.department,
        degree: a.degree,
        graduation_year: a.graduation_year,
        course_or_company: a.company || a.course_or_company || '—',
        company: a.company,
        designation: a.designation,
        industry: a.industry,
        location: a.location,
        skills: a.skills || [],
        linkedin: a.linkedin,
        github: a.github,
        website: a.website,
        bio: a.bio,
        is_verified: a.is_verified ?? true,
        verification_status: a.verification_status || 'approved',
        is_active: a.is_active ?? true,
        created_at: a.created_at,
      });
    });

    (pendingData || []).forEach((a: any) => {
      if (!alumniMap.has(a.id)) {
        alumniMap.set(a.id, {
          id: a.id,
          full_name: a.full_name || a.name || '',
          email: a.email || '',
          role: 'alumni' as const,
          avatar_url: a.avatar_url,
          department: a.department,
          degree: a.degree,
          graduation_year: a.graduation_year,
          course_or_company: a.company || a.course_or_company || '—',
          company: a.company,
          designation: a.designation,
          industry: a.industry,
          location: a.location,
          skills: a.skills || [],
          linkedin: a.linkedin,
          github: a.github,
          website: a.website,
          bio: a.bio,
          is_verified: false,
          verification_status: a.verification_status || 'pending',
          is_active: a.is_active ?? true,
          created_at: a.created_at,
        });
      }
    });

    return Array.from(alumniMap.values());
  },

  async toggleUserActive(
    userId: string,
    _currentActiveStatus?: boolean
  ) {
    const response = await fetch(
      `${API_URL}/admin/users/${encodeURIComponent(userId)}/active`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${getToken()}`,
          'Content-Type': 'application/json',
        },
      }
    );

    return parseResponse(response);
  },
};