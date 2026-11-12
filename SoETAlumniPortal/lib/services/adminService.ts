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
  phone?: string;
  is_phone_verified?: boolean;
  is_active?: boolean;
  verification_status?: string;
  updated_at?: string;
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
  phone?: string;
  is_phone_verified?: boolean;
  student_id?: string;
  alumni_id?: string;
  department?: string;
  degree?: string;
  course?: string;
  academic_year?: string;
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
  updated_at?: string;
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
  prn?: string;
  department: string;
  course?: string;
  degree?: string;
  status: string;
  resume_url: string;
  has_resume?: boolean;
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



function sortNewestFirst<T extends { created_at?: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const aTime = a.created_at ? Date.parse(a.created_at) : Number.NaN;
    const bTime = b.created_at ? Date.parse(b.created_at) : Number.NaN;
    const safeA = Number.isFinite(aTime) ? aTime : Number.NEGATIVE_INFINITY;
    const safeB = Number.isFinite(bTime) ? bTime : Number.NEGATIVE_INFINITY;
    return safeB - safeA;
  });
}



type ApiRecord = Record<string, unknown>;

export interface AdminActionResult {
  message?: string;
  user_id?: string;
  status?: string;
  is_verified?: boolean;
  is_active?: boolean;
  role?: string;
}

function isRecord(value: unknown): value is ApiRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown, label: string): ApiRecord {
  if (!isRecord(value)) throw new Error('Unexpected ' + label + ' response format.');
  return value;
}

function readString(record: ApiRecord, key: string, fallback = ''): string {
  return typeof record[key] === 'string' ? record[key] as string : fallback;
}

function readOptionalString(record: ApiRecord, key: string): string | undefined {
  return typeof record[key] === 'string' ? record[key] as string : undefined;
}

function readBoolean(record: ApiRecord, key: string, fallback: boolean): boolean {
  return typeof record[key] === 'boolean' ? record[key] as boolean : fallback;
}

function readOptionalBoolean(record: ApiRecord, key: string): boolean | undefined {
  return typeof record[key] === 'boolean' ? record[key] as boolean : undefined;
}

function readNumber(record: ApiRecord, key: string, fallback = 0): number {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function readOptionalNumber(record: ApiRecord, key: string): number | undefined {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function readRecordArray(value: unknown, label: string): ApiRecord[] {
  if (!Array.isArray(value)) {
    throw new Error('Unexpected ' + label + ' response format. Please refresh and try again.');
  }
  return value.map((item, index) => {
    if (!isRecord(item)) {
      throw new Error('The ' + label + ' response contains an invalid item at position ' + (index + 1) + '.');
    }
    return item;
  });
}

async function parseResponse(response: Response, fallbackMessage = 'Request failed.'): Promise<unknown> {
  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    // Empty or malformed JSON is handled with the operation-specific fallback.
  }

  if (!response.ok) {
    const detail = isRecord(data) && typeof data.detail === 'string' ? data.detail : fallbackMessage;
    throw new Error(detail);
  }

  return data;
}

function normalizeActionResult(value: unknown, label: string): AdminActionResult {
  const result = asRecord(value, label);
  return {
    message: readOptionalString(result, 'message'),
    user_id: readOptionalString(result, 'user_id'),
    status: readOptionalString(result, 'status'),
    is_verified: readOptionalBoolean(result, 'is_verified'),
    is_active: readOptionalBoolean(result, 'is_active'),
    role: readOptionalString(result, 'role'),
  };
}

function normalizeAdminMetrics(value: unknown): AdminMetrics {
  const metrics = asRecord(value, 'dashboard metrics');
  return {
    totalStudents: readNumber(metrics, 'totalStudents'),
    pendingStudents: readOptionalNumber(metrics, 'pendingStudents'),
    totalAlumni: readNumber(metrics, 'totalAlumni'),
    verifiedAlumni: readNumber(metrics, 'verifiedAlumni'),
    pendingAlumni: readNumber(metrics, 'pendingAlumni'),
    totalJobs: readNumber(metrics, 'totalJobs'),
    pendingJobs: readNumber(metrics, 'pendingJobs'),
    totalEvents: readNumber(metrics, 'totalEvents'),
    pendingEvents: readNumber(metrics, 'pendingEvents'),
    totalApplications: readNumber(metrics, 'totalApplications'),
    totalRegistrations: readNumber(metrics, 'totalRegistrations'),
  };
}

function normalizePendingAlumni(value: unknown): PendingAlumni {
  const alumni = asRecord(value, 'pending alumni');
  return {
    id: readString(alumni, 'id'),
    full_name: readString(alumni, 'full_name'),
    email: readString(alumni, 'email'),
    alumni_id: readOptionalString(alumni, 'alumni_id'),
    avatar_url: readOptionalString(alumni, 'avatar_url'),
    phone: readOptionalString(alumni, 'phone'),
    is_phone_verified: readBoolean(alumni, 'is_phone_verified', false),
    is_active: readBoolean(alumni, 'is_active', true),
    verification_status: readOptionalString(alumni, 'verification_status'),
    updated_at: readOptionalString(alumni, 'updated_at'),
    department: readOptionalString(alumni, 'department'),
    degree: readOptionalString(alumni, 'degree'),
    graduation_year: readOptionalString(alumni, 'graduation_year'),
    company: readOptionalString(alumni, 'company'),
    designation: readOptionalString(alumni, 'designation'),
    industry: readOptionalString(alumni, 'industry'),
    location: readOptionalString(alumni, 'location'),
    skills: readStringArray(alumni.skills),
    linkedin: readOptionalString(alumni, 'linkedin'),
    github: readOptionalString(alumni, 'github'),
    website: readOptionalString(alumni, 'website'),
    bio: readOptionalString(alumni, 'bio'),
    is_verified: readBoolean(alumni, 'is_verified', false),
    created_at: readOptionalString(alumni, 'created_at'),
  };
}

function normalizeUserManagementItem(value: unknown, role: 'student' | 'alumni'): UserManagementItem {
  const user = asRecord(value, role + ' user');
  const isVerified = readBoolean(user, 'is_verified', false);
  const course = readOptionalString(user, 'course');
  const department = readOptionalString(user, 'department');
  const company = readOptionalString(user, 'company');
  const courseOrCompany =
    readOptionalString(user, 'course_or_company') ||
    (role === 'student' ? course || department || 'B.Tech' : company || '—');

  return {
    id: readString(user, 'id'),
    full_name: readString(user, 'full_name') || readString(user, 'name'),
    email: readString(user, 'email'),
    role,
    avatar_url: readOptionalString(user, 'avatar_url'),
    phone: readOptionalString(user, 'phone'),
    is_phone_verified: readBoolean(user, 'is_phone_verified', false),
    student_id: readOptionalString(user, 'student_id'),
    alumni_id: readOptionalString(user, 'alumni_id'),
    department,
    degree: readOptionalString(user, 'degree'),
    course,
    academic_year: readOptionalString(user, 'academic_year'),
    graduation_year: readOptionalString(user, 'graduation_year'),
    course_or_company: courseOrCompany,
    company,
    designation: readOptionalString(user, 'designation'),
    industry: readOptionalString(user, 'industry'),
    location: readOptionalString(user, 'location'),
    skills: role === 'alumni' ? readStringArray(user.skills) : undefined,
    linkedin: readOptionalString(user, 'linkedin'),
    github: readOptionalString(user, 'github'),
    website: readOptionalString(user, 'website'),
    bio: readOptionalString(user, 'bio'),
    is_verified: isVerified,
    verification_status:
      readOptionalString(user, 'verification_status') || (isVerified ? 'approved' : 'pending'),
    is_active: readBoolean(user, 'is_active', true),
    created_at: readOptionalString(user, 'created_at'),
    updated_at: readOptionalString(user, 'updated_at'),
  };
}

function normalizeEventParticipation(value: unknown): EventParticipationOverview {
  const overview = asRecord(value, 'event participation');
  return {
    total_registrations: readNumber(overview, 'total_registrations'),
    unique_participants: readNumber(overview, 'unique_participants'),
    total_events: readNumber(overview, 'total_events'),
    events: readRecordArray(overview.events, 'event participation').map((event) => ({
      id: readString(event, 'id'),
      title: readString(event, 'title'),
      status: readString(event, 'status'),
      event_date: readString(event, 'event_date'),
      event_type: readString(event, 'event_type'),
      location: readString(event, 'location'),
      registration_deadline: readString(event, 'registration_deadline'),
      registration_count: readNumber(event, 'registration_count'),
      unique_participant_count: readNumber(event, 'unique_participant_count'),
      created_at: readString(event, 'created_at'),
    })),
  };
}

function normalizeEventParticipants(value: unknown): EventParticipantsResponse {
  const result = asRecord(value, 'event participants');
  return {
    event_id: readString(result, 'event_id'),
    event_title: readString(result, 'event_title'),
    total_count: readNumber(result, 'total_count'),
    limit: readNumber(result, 'limit'),
    offset: readNumber(result, 'offset'),
    participants: readRecordArray(result.participants, 'event participants').map((participant) => ({
      registration_id: readString(participant, 'registration_id'),
      user_id: readString(participant, 'user_id'),
      name: readString(participant, 'name'),
      email: readString(participant, 'email'),
      role: readString(participant, 'role'),
      identifier: readString(participant, 'identifier'),
      department: readString(participant, 'department'),
      registration_date: readString(participant, 'registration_date'),
      status: readString(participant, 'status'),
    })),
  };
}

function normalizeJobParticipation(value: unknown): JobParticipationOverview {
  const overview = asRecord(value, 'job participation');
  return {
    total_jobs: readNumber(overview, 'total_jobs'),
    total_applications: readNumber(overview, 'total_applications'),
    unique_applicants: readNumber(overview, 'unique_applicants'),
    jobs: readRecordArray(overview.jobs, 'job participation').map((job) => {
      const rawStatusCounts = isRecord(job.applications_by_status) ? job.applications_by_status : {};
      const statusCounts: Record<string, number> = {};
      for (const [status, count] of Object.entries(rawStatusCounts)) {
        if (typeof count === 'number' && Number.isFinite(count)) statusCounts[status] = count;
      }
      return {
        id: readString(job, 'id'),
        title: readString(job, 'title'),
        company: readString(job, 'company'),
        location: readString(job, 'location'),
        job_type: readString(job, 'job_type'),
        status: readString(job, 'status'),
        deadline: readString(job, 'deadline'),
        application_count: readNumber(job, 'application_count'),
        unique_applicant_count: readNumber(job, 'unique_applicant_count'),
        applications_by_status: statusCounts,
        created_at: readString(job, 'created_at'),
      };
    }),
  };
}

function normalizeJobApplicants(value: unknown): JobApplicantsResponse {
  const result = asRecord(value, 'job applicants');
  return {
    job_id: readString(result, 'job_id'),
    job_title: readString(result, 'job_title'),
    company: readString(result, 'company'),
    total_count: readNumber(result, 'total_count'),
    limit: readNumber(result, 'limit'),
    offset: readNumber(result, 'offset'),
    applicants: readRecordArray(result.applicants, 'job applicants').map((applicant) => ({
      application_id: readString(applicant, 'application_id'),
      applicant_id: readString(applicant, 'applicant_id'),
      name: readString(applicant, 'name'),
      email: readString(applicant, 'email'),
      role: readString(applicant, 'role'),
      identifier: readString(applicant, 'identifier'),
      prn: readOptionalString(applicant, 'prn'),
      department: readString(applicant, 'department'),
      course: readOptionalString(applicant, 'course'),
      degree: readOptionalString(applicant, 'degree'),
      status: readString(applicant, 'status'),
      resume_url: readString(applicant, 'resume_url'),
      has_resume: readOptionalBoolean(applicant, 'has_resume'),
      cover_letter: readString(applicant, 'cover_letter'),
      applied_at: readString(applicant, 'applied_at'),
    })),
  };
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

          'Content-Type': 'application/json',
        },
      }
    );

    const data = await parseResponse(response, 'Failed to load pending alumni.');
    return sortNewestFirst(readRecordArray(data, 'pending alumni').map(normalizePendingAlumni));
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

          'Content-Type': 'application/json',
        },
      }
    );

    return normalizeActionResult(
      await parseResponse(response, 'Failed to update alumni verification.'),
      'alumni verification'
    );
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

        'Content-Type': 'application/json',
      },
    }
  );

  return normalizeAdminMetrics(
    await parseResponse(response, 'Failed to load dashboard metrics.')
  );
},

  // ============================================================
  // USER MANAGEMENT (STUDENTS & ALUMNI)
  // ============================================================

  async getAllStudents(): Promise<UserManagementItem[]> {
    const response = await fetch(`${API_URL}/admin/students`, {
      method: 'GET',
      headers: {

        'Content-Type': 'application/json',
      },
    });

    const data = await parseResponse(response, 'Failed to load students.');
    return sortNewestFirst(
      readRecordArray(data, 'students').map((student) => normalizeUserManagementItem(student, 'student'))
    );
  },

  async getPendingStudents(): Promise<UserManagementItem[]> {
    const response = await fetch(`${API_URL}/admin/students/pending`, {
      method: 'GET',
      headers: {

        'Content-Type': 'application/json',
      },
    });

    const data = await parseResponse(response, 'Failed to load pending students.');
    return sortNewestFirst(
      readRecordArray(data, 'pending students').map((student) => normalizeUserManagementItem(student, 'student'))
    );
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

          'Content-Type': 'application/json',
        },
      }
    );

    return normalizeActionResult(
      await parseResponse(response, 'Failed to update student verification.'),
      'student verification'
    );
  },

  async getAllAlumni(): Promise<UserManagementItem[]> {
    const response = await fetch(`${API_URL}/admin/alumni`, {
      method: 'GET',
      headers: {

        'Content-Type': 'application/json',
      },
    });

    const data = await parseResponse(response, 'Failed to load alumni.');
    return sortNewestFirst(
      readRecordArray(data, 'alumni').map((alumni) => normalizeUserManagementItem(alumni, 'alumni'))
    );
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

          'Content-Type': 'application/json',
        },
      }
    );

    return normalizeActionResult(
      await parseResponse(response, 'Failed to update account activation status.'),
      'account activation'
    );
  },

  async deleteUserAccount(userId: string) {
    const response = await fetch(
      `${API_URL}/admin/users/${encodeURIComponent(userId)}`,
      {
        method: 'DELETE',
        headers: {

          'Content-Type': 'application/json',
        },
      }
    );

    return normalizeActionResult(
      await parseResponse(response, 'Failed to delete user account.'),
      'account deletion'
    );
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

      },
    });

    return normalizeEventParticipation(
      await parseResponse(response, 'Failed to load event participation.')
    );
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

        },
      }
    );

    return normalizeEventParticipants(
      await parseResponse(response, 'Failed to load event participants.')
    );
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

      },
    });

    return normalizeJobParticipation(
      await parseResponse(response, 'Failed to load job participation.')
    );
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

        },
      }
    );

    return normalizeJobApplicants(
      await parseResponse(response, 'Failed to load job applicants.')
    );
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
