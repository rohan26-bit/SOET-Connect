const API_URL = 'http://127.0.0.1:8000';

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
    throw new Error(
      'Admin dashboard metrics are not connected to the FastAPI backend yet.'
    );
  },

  // ============================================================
  // PLACEHOLDERS FOR EXISTING ADMIN FEATURES
  // ============================================================

  async getAllStudents() {
    throw new Error(
      'Student management API is not connected to the FastAPI backend yet.'
    );
  },

  async getAllAlumni() {
    throw new Error(
      'Alumni management API is not connected to the FastAPI backend yet.'
    );
  },

  async toggleUserActive(
    _userId: string,
    _currentActiveStatus: boolean
  ) {
    throw new Error(
      'User activation API is not connected to the FastAPI backend yet.'
    );
  },
};