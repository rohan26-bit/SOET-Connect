import { downloadAdminCsvEndpoint, getTodayDateString } from '@/lib/utils/csvExport';

const API_URL = '/api';

export interface AdminMetrics {
  totalStudents: number;
  pendingStudents?: number;
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

export interface EventParticipationItem {
  id: string;
  title: string;
  status: string;
  event_date: string;
  event_type: string;
  location: string;
  registration_deadline: string;
  registration_count: number;
  unique_participant_count: number;
  created_at: string;
}

export interface EventParticipationOverview {
  total_registrations: number;
  unique_participants: number;
  total_events: number;
  events: EventParticipationItem[];
}

export interface EventParticipantDetail {
  registration_id: string;
  user_id: string;
  name: string;
  email: string;
  role: string;
  identifier: string;
  department: string;
  registration_date: string;
  status: string;
}

export interface EventParticipantsResponse {
  event_id: string;
  event_title: string;
  total_count: number;
  limit: number;
  offset: number;
  participants: EventParticipantDetail[];
}

export interface JobParticipationItem {
  id: string;
  title: string;
  company: string;
  location: string;
  job_type: string;
  status: string;
  deadline: string;
  application_count: number;
  unique_applicant_count: number;
  applications_by_status: Record<string, number>;
  created_at: string;
}

export interface JobParticipationOverview {
  total_jobs: number;
  total_applications: number;
  unique_applicants: number;
  jobs: JobParticipationItem[];
}

export interface JobApplicantDetail {
  application_id: string;
  applicant_id: string;
  name: string;
  email: string;
  role: string;
  identifier: string;
  department: string;
  status: string;
  resume_url: string;
  cover_letter: string;
  applied_at: string;
}

export interface JobApplicantsResponse {
  job_id: string;
  job_title: string;
  company: string;
  total_count: number;
  limit: number;
  offset: number;
  applicants: JobApplicantDetail[];
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
      is_verified: typeof s.is_verified === 'boolean' ? s.is_verified : false,
      verification_status: s.verification_status || 'pending',
      is_active: s.is_active ?? true,
      created_at: s.created_at,
    }));
  },

  async getPendingStudents(): Promise<UserManagementItem[]> {
    const response = await fetch(`${API_URL}/admin/students/pending`, {
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
      role: 'student' as const,
      avatar_url: s.avatar_url,
      department: s.department,
      degree: s.degree,
      graduation_year: s.graduation_year,
      course_or_company: s.course_or_company || s.course || s.department || 'B.Tech',
      is_verified: typeof s.is_verified === 'boolean' ? s.is_verified : false,
      verification_status: s.verification_status || 'pending',
      is_active: s.is_active ?? true,
      created_at: s.created_at,
    }));
  },

  async updateStudentVerification(
    userId: string,
    status: 'approved' | 'rejected' | 'suspended'
  ) {
    const response = await fetch(
      `${API_URL}/admin/students/${encodeURIComponent(userId)}/verification?status=${encodeURIComponent(status)}`,
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

  // ============================================================
  // PARTICIPATION & REGISTRATION MANAGEMENT
  // ============================================================

  async getEventParticipation(filters?: {
    search?: string;
    status?: string;
  }): Promise<EventParticipationOverview> {
    const params = new URLSearchParams();
    if (filters?.search) params.append('search', filters.search);
    if (filters?.status && filters.status !== 'all') params.append('status', filters.status);

    const query = params.toString() ? `?${params.toString()}` : '';
    const response = await fetch(`${API_URL}/admin/participation/events${query}`, {
      headers: {
        Authorization: `Bearer ${getToken()}`,
      },
    });

    return parseResponse(response);
  },

  async getEventParticipants(
    eventId: string,
    filters?: {
      search?: string;
      role?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<EventParticipantsResponse> {
    const params = new URLSearchParams();
    if (filters?.search) params.append('search', filters.search);
    if (filters?.role && filters.role !== 'all') params.append('role', filters.role);
    if (filters?.limit) params.append('limit', String(filters.limit));
    if (filters?.offset) params.append('offset', String(filters.offset));

    const query = params.toString() ? `?${params.toString()}` : '';
    const response = await fetch(
      `${API_URL}/admin/participation/events/${encodeURIComponent(eventId)}/participants${query}`,
      {
        headers: {
          Authorization: `Bearer ${getToken()}`,
        },
      }
    );

    return parseResponse(response);
  },

  async getJobParticipation(filters?: {
    search?: string;
    status?: string;
  }): Promise<JobParticipationOverview> {
    const params = new URLSearchParams();
    if (filters?.search) params.append('search', filters.search);
    if (filters?.status && filters.status !== 'all') params.append('status', filters.status);

    const query = params.toString() ? `?${params.toString()}` : '';
    const response = await fetch(`${API_URL}/admin/participation/jobs${query}`, {
      headers: {
        Authorization: `Bearer ${getToken()}`,
      },
    });

    return parseResponse(response);
  },

  async getJobApplicantsDetailed(
    jobId: string,
    filters?: {
      search?: string;
      status?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<JobApplicantsResponse> {
    const params = new URLSearchParams();
    if (filters?.search) params.append('search', filters.search);
    if (filters?.status && filters.status !== 'all') params.append('status', filters.status);
    if (filters?.limit) params.append('limit', String(filters.limit));
    if (filters?.offset) params.append('offset', String(filters.offset));

    const query = params.toString() ? `?${params.toString()}` : '';
    const response = await fetch(
      `${API_URL}/admin/participation/jobs/${encodeURIComponent(jobId)}/applicants${query}`,
      {
        headers: {
          Authorization: `Bearer ${getToken()}`,
        },
      }
    );

    return parseResponse(response);
  },

  // ============================================================
  // CSV EXPORTS
  // ============================================================

  async exportEventParticipantsCsv(
    eventId: string,
    filters?: {
      search?: string;
      role?: string;
    }
  ): Promise<void> {
    const params = new URLSearchParams();
    if (filters?.search) params.append("search", filters.search);
    if (filters?.role && filters.role !== "all") params.append("role", filters.role);

    const query = params.toString() ? `?${params.toString()}` : "";
    const today = getTodayDateString();
    return downloadAdminCsvEndpoint(
      `${API_URL}/admin/participation/events/${encodeURIComponent(eventId)}/export${query}`,
      `event_participants_${today}.csv`
    );
  },

  async exportAllEventRegistrationsCsv(filters?: {
    search?: string;
    status?: string;
  }): Promise<void> {
    const params = new URLSearchParams();
    if (filters?.search) params.append("search", filters.search);
    if (filters?.status && filters.status !== "all") params.append("status", filters.status);

    const query = params.toString() ? `?${params.toString()}` : "";
    const today = getTodayDateString();
    return downloadAdminCsvEndpoint(
      `${API_URL}/admin/participation/events/export${query}`,
      `event_registrations_${today}.csv`
    );
  },

  async exportJobApplicantsCsv(
    jobId: string,
    filters?: {
      search?: string;
      status?: string;
    }
  ): Promise<void> {
    const params = new URLSearchParams();
    if (filters?.search) params.append("search", filters.search);
    if (filters?.status && filters.status !== "all") params.append("status", filters.status);

    const query = params.toString() ? `?${params.toString()}` : "";
    const today = getTodayDateString();
    return downloadAdminCsvEndpoint(
      `${API_URL}/admin/participation/jobs/${encodeURIComponent(jobId)}/export${query}`,
      `job_applicants_${today}.csv`
    );
  },

  async exportAllJobApplicationsCsv(filters?: {
    search?: string;
    status?: string;
  }): Promise<void> {
    const params = new URLSearchParams();
    if (filters?.search) params.append("search", filters.search);
    if (filters?.status && filters.status !== "all") params.append("status", filters.status);

    const query = params.toString() ? `?${params.toString()}` : "";
    const today = getTodayDateString();
    return downloadAdminCsvEndpoint(
      `${API_URL}/admin/participation/jobs/export${query}`,
      `job_applications_${today}.csv`
    );
  },

  async exportStudentsCsv(filters?: {
    search?: string;
    status?: string;
  }): Promise<void> {
    const params = new URLSearchParams();
    if (filters?.search) params.append("search", filters.search);
    if (filters?.status && filters.status !== "all") params.append("status", filters.status);

    const query = params.toString() ? `?${params.toString()}` : "";
    const today = getTodayDateString();
    return downloadAdminCsvEndpoint(
      `${API_URL}/admin/students/export${query}`,
      `students_${today}.csv`
    );
  },

  async exportAlumniCsv(filters?: {
    search?: string;
    status?: string;
  }): Promise<void> {
    const params = new URLSearchParams();
    if (filters?.search) params.append("search", filters.search);
    if (filters?.status && filters.status !== "all") params.append("status", filters.status);

    const query = params.toString() ? `?${params.toString()}` : "";
    const today = getTodayDateString();
    return downloadAdminCsvEndpoint(
      `${API_URL}/admin/alumni/export${query}`,
      `alumni_${today}.csv`
    );
  },
};
