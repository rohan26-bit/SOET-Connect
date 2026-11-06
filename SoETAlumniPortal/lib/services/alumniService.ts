const API_URL = '/api';

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
  verification_status?: string;
  created_at?: string;
  aci_score?: number;
  aci_tier?: string;
  aci_badge?: string;
}

export interface AlumniAciBreakdown {
  verification: number;
  jobs: number;
  events: number;
  registrations: number;
}

export interface AlumniAciActivityCounts {
  approved_jobs: number;
  approved_events: number;
  valid_registrations: number;
}

export interface AciClassLeaderboardItem {
  rank: number;
  graduation_year: string;
  alumni_count: number;
  contributing_alumni_count: number;
  total_aci_points: number;
  total_activity_points: number;
  average_aci_points: number;
  top_contributor: {
    name: string;
    aci_score: number;
  } | null;
}

export interface AciClassLeaderboardResponse {
  leaderboard: AciClassLeaderboardItem[];
  total_classes: number;
  total_alumni: number;
}

export interface AciIndividualLeaderboardItem {
  rank: number;
  id: string;
  full_name: string;
  avatar_url?: string;
  graduation_year: string;
  department: string;
  company: string;
  designation: string;
  aci_score: number;
  activity_points: number;
  aci_tier: string;
  aci_badge: string;
  breakdown: AlumniAciBreakdown;
  activity_counts: AlumniAciActivityCounts;
}

export interface AciIndividualLeaderboardResponse {
  leaderboard: AciIndividualLeaderboardItem[];
  total_contributors: number;
  limit: number;
}

export interface AciIndividualLeaderboardItem {
  rank: number;
  id: string;
  full_name: string;
  avatar_url?: string;
  graduation_year: string;
  department: string;
  company: string;
  designation: string;
  aci_score: number;
  activity_points: number;
  aci_tier: string;
  aci_badge: string;
  breakdown: AlumniAciBreakdown;
  activity_counts: AlumniAciActivityCounts;
}

export interface AciIndividualLeaderboardResponse {
  leaderboard: AciIndividualLeaderboardItem[];
  total_contributors: number;
  limit: number;
}

export interface AlumniAciResponse {
  score: number;
  tier: string;
  badge: string;
  breakdown: AlumniAciBreakdown;
  activity_counts: AlumniAciActivityCounts;
}

function getAuthHeaders(): Record<string, string> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('soet_access_token') : null;

  if (!token) {
    throw new Error('Please log in again.');
  }

  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

async function parseResponse<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const detail =
      typeof data.detail === 'string'
        ? data.detail
        : JSON.stringify(data.detail || 'Request failed.');

    throw new Error(detail);
  }

  return data as T;
}

export const alumniService = {
  // ============================================================
  // GET MY ACI (ALUMNI CONTRIBUTION INDEX)
  // ============================================================
  async getMyAci(): Promise<AlumniAciResponse> {
    const response = await fetch(`${API_URL}/alumni/me/aci`, {
      method: 'GET',
      headers: getAuthHeaders(),
    });

    return parseResponse<AlumniAciResponse>(response);
  },

  // ============================================================
  // GET CLASS-WISE ACI HALL OF FAME
  // ============================================================
  async getClassLeaderboard(): Promise<AciClassLeaderboardResponse> {
    const response = await fetch(`${API_URL}/alumni/aci/leaderboard`, {
      method: 'GET',
      headers: getAuthHeaders(),
      cache: 'no-store',
    });

    return parseResponse<AciClassLeaderboardResponse>(response);
  },

  // ============================================================
  // GET INDIVIDUAL ALUMNI HALL OF FAME
  // ============================================================
  async getIndividualLeaderboard(limit = 10): Promise<AciIndividualLeaderboardResponse> {
    const response = await fetch(`${API_URL}/alumni/aci/individual-leaderboard?limit=${limit}`, {
      method: 'GET',
      headers: getAuthHeaders(),
      cache: 'no-store',
    });

    return parseResponse<AciIndividualLeaderboardResponse>(response);
  },

  // ============================================================
  // GET INDIVIDUAL ALUMNI HALL OF FAME
  // ============================================================
  async getIndividualLeaderboard(limit = 10): Promise<AciIndividualLeaderboardResponse> {
    const response = await fetch(`${API_URL}/alumni/aci/individual-leaderboard?limit=${limit}`, {
      method: 'GET',
      headers: getAuthHeaders(),
      cache: 'no-store',
    });

    return parseResponse<AciIndividualLeaderboardResponse>(response);
  },

  // ============================================================
  // GET APPROVED ALUMNI DIRECTORY
  // ============================================================
  async getApprovedAlumni(filters?: {
    search?: string;
    department?: string;
    sort_by?: string;
    graduationYear?: string;
    company?: string;
    industry?: string;
    location?: string;
  }): Promise<AlumniDirectoryItem[]> {
    const queryParams = new URLSearchParams();

    if (filters?.search) {
      queryParams.set('search', filters.search);
    }
    if (filters?.department && filters.department !== 'All Departments') {
      queryParams.set('department', filters.department);
    }
    if (filters?.sort_by) {
      queryParams.set('sort_by', filters.sort_by);
    }

    const queryString = queryParams.toString();
    const url = `${API_URL}/alumni/directory${queryString ? `?${queryString}` : ''}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: getAuthHeaders(),
    });

    let results = await parseResponse<AlumniDirectoryItem[]>(response);

    // Apply any additional client-side filters if provided
    if (filters?.graduationYear) {
      results = results.filter((a) => a.graduation_year === filters.graduationYear);
    }
    if (filters?.company) {
      const c = filters.company.toLowerCase();
      results = results.filter((a) => a.company?.toLowerCase().includes(c));
    }
    if (filters?.industry) {
      const ind = filters.industry.toLowerCase();
      results = results.filter((a) => a.industry?.toLowerCase().includes(ind));
    }
    if (filters?.location) {
      const loc = filters.location.toLowerCase();
      results = results.filter((a) => a.location?.toLowerCase().includes(loc));
    }

    return results;
  },

  // ============================================================
  // GET PENDING ALUMNI (ADMIN)
  // ============================================================
  async getPendingAlumni(): Promise<AlumniDirectoryItem[]> {
    const response = await fetch(`${API_URL}/alumni/pending`, {
      method: 'GET',
      headers: getAuthHeaders(),
    });

    return parseResponse<AlumniDirectoryItem[]>(response);
  },

  // ============================================================
  // UPDATE VERIFICATION STATUS (ADMIN)
  // ============================================================
  async updateVerificationStatus(
    userId: string,
    status: 'approved' | 'rejected' | 'suspended'
  ): Promise<any> {
    const response = await fetch(
      `${API_URL}/alumni/verify/${userId}?status=${status}`,
      {
        method: 'PATCH',
        headers: getAuthHeaders(),
      }
    );

    return parseResponse(response);
  },
};

