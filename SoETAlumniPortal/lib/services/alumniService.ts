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

export interface AlumniAciResponse {
  score: number;
  tier: string;
  badge: string;
  breakdown: AlumniAciBreakdown;
  activity_counts: AlumniAciActivityCounts;
}

function getAuthHeaders(): Record<string, string> {
  return { 'Content-Type': 'application/json' };
}

type ApiRecord = Record<string, unknown>;

export interface AlumniVerificationResult {
  message: string;
  user_id: string;
  status: 'approved' | 'rejected' | 'suspended';
  is_verified: boolean;
}

function isRecord(value: unknown): value is ApiRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown, label: string): ApiRecord {
  if (!isRecord(value)) throw new Error('Unexpected ' + label + ' response format.');
  return value;
}

function textValue(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return fallback;
}

function optionalText(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function numberValue(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error('The ' + label + ' response contains an invalid numeric value.');
  }
  return value;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function numberField(record: ApiRecord, key: string): number {
  return numberValue(record[key], key);
}

function normalizeBreakdown(value: unknown): AlumniAciBreakdown {
  const breakdown = asRecord(value, 'ACI breakdown');
  return {
    verification: numberField(breakdown, 'verification'),
    jobs: numberField(breakdown, 'jobs'),
    events: numberField(breakdown, 'events'),
    registrations: numberField(breakdown, 'registrations'),
  };
}

function normalizeActivityCounts(value: unknown): AlumniAciActivityCounts {
  const counts = asRecord(value, 'ACI activity counts');
  return {
    approved_jobs: numberField(counts, 'approved_jobs'),
    approved_events: numberField(counts, 'approved_events'),
    valid_registrations: numberField(counts, 'valid_registrations'),
  };
}

function normalizeMyAci(value: unknown): AlumniAciResponse {
  const result = asRecord(value, 'my ACI');
  if (
    typeof result.tier !== 'string' ||
    typeof result.badge !== 'string'
  ) {
    throw new Error('The ACI response is missing its tier or badge.');
  }
  return {
    score: numberField(result, 'score'),
    tier: result.tier,
    badge: result.badge,
    breakdown: normalizeBreakdown(result.breakdown),
    activity_counts: normalizeActivityCounts(result.activity_counts),
  };
}

function normalizeClassLeaderboard(value: unknown): AciClassLeaderboardResponse {
  const result = asRecord(value, 'class leaderboard');
  if (!Array.isArray(result.leaderboard)) {
    throw new Error('Unexpected class leaderboard response format.');
  }

  return {
    leaderboard: result.leaderboard.map((entry, index) => {
      const item = asRecord(entry, 'class leaderboard item');
      let topContributor: AciClassLeaderboardItem['top_contributor'] = null;
      if (item.top_contributor !== null && item.top_contributor !== undefined) {
        const top = asRecord(item.top_contributor, 'top contributor');
        topContributor = {
          name: textValue(top.name, 'SOET Alumnus'),
          aci_score: numberField(top, 'aci_score'),
        };
      }
      return {
        rank: numberValue(item.rank, 'class leaderboard rank'),
        graduation_year: textValue(item.graduation_year, 'Unspecified'),
        alumni_count: numberValue(item.alumni_count, 'class alumni count'),
        contributing_alumni_count: numberValue(item.contributing_alumni_count, 'class contributor count'),
        total_aci_points: numberValue(item.total_aci_points, 'class ACI total'),
        total_activity_points: numberValue(item.total_activity_points, 'class activity total'),
        average_aci_points: numberValue(item.average_aci_points, 'class ACI average'),
        top_contributor: topContributor,
      };
    }),
    total_classes: numberField(result, 'total_classes'),
    total_alumni: numberField(result, 'total_alumni'),
  };
}

function normalizeIndividualLeaderboard(value: unknown): AciIndividualLeaderboardResponse {
  const result = asRecord(value, 'individual leaderboard');
  if (!Array.isArray(result.leaderboard)) {
    throw new Error('Unexpected individual leaderboard response format.');
  }

  return {
    leaderboard: result.leaderboard.map((entry) => {
      const item = asRecord(entry, 'individual leaderboard item');
      if (typeof item.aci_tier !== 'string' || typeof item.aci_badge !== 'string') {
        throw new Error('An individual leaderboard item is missing its ACI tier or badge.');
      }
      return {
        rank: numberField(item, 'rank'),
        id: textValue(item.id),
        full_name: textValue(item.full_name, 'SOET Alumnus'),
        avatar_url: optionalText(item.avatar_url),
        graduation_year: textValue(item.graduation_year, 'Unspecified'),
        department: textValue(item.department),
        company: textValue(item.company),
        designation: textValue(item.designation),
        aci_score: numberField(item, 'aci_score'),
        activity_points: numberField(item, 'activity_points'),
        aci_tier: item.aci_tier,
        aci_badge: item.aci_badge,
        breakdown: normalizeBreakdown(item.breakdown),
        activity_counts: normalizeActivityCounts(item.activity_counts),
      };
    }),
    total_contributors: numberField(result, 'total_contributors'),
    limit: numberField(result, 'limit'),
  };
}

function normalizeDirectoryItem(value: unknown): AlumniDirectoryItem {
  const alumni = asRecord(value, 'alumni directory item');
  if (typeof alumni.id !== 'string' || !alumni.id) {
    throw new Error('An alumni record is missing its ID.');
  }
  return {
    id: alumni.id,
    full_name: textValue(alumni.full_name, 'SOET Alumnus'),
    email: textValue(alumni.email),
    avatar_url: optionalText(alumni.avatar_url),
    department: textValue(alumni.department),
    degree: optionalText(alumni.degree),
    graduation_year: textValue(alumni.graduation_year),
    company: optionalText(alumni.company),
    designation: optionalText(alumni.designation),
    industry: optionalText(alumni.industry),
    location: optionalText(alumni.location),
    skills: Array.isArray(alumni.skills)
      ? alumni.skills.filter((skill): skill is string => typeof skill === 'string')
      : undefined,
    linkedin: optionalText(alumni.linkedin),
    github: optionalText(alumni.github),
    website: optionalText(alumni.website),
    bio: optionalText(alumni.bio),
    verification_status: optionalText(alumni.verification_status),
    created_at: optionalText(alumni.created_at),
    aci_score: optionalNumber(alumni.aci_score),
    aci_tier: optionalText(alumni.aci_tier),
    aci_badge: optionalText(alumni.aci_badge),
  };
}

function normalizeDirectory(value: unknown, label: string): AlumniDirectoryItem[] {
  if (!Array.isArray(value)) {
    throw new Error('Unexpected ' + label + ' response format. Please refresh and try again.');
  }
  return value.map(normalizeDirectoryItem);
}

function normalizeVerificationResult(value: unknown): AlumniVerificationResult {
  const result = asRecord(value, 'alumni verification');
  const status = result.status;
  if (status !== 'approved' && status !== 'rejected' && status !== 'suspended') {
    throw new Error('The alumni verification response contains an invalid status.');
  }
  if (typeof result.message !== 'string' || typeof result.user_id !== 'string' || typeof result.is_verified !== 'boolean') {
    throw new Error('The alumni verification response is incomplete.');
  }
  return {
    message: result.message,
    user_id: result.user_id,
    status,
    is_verified: result.is_verified,
  };
}

async function parseResponse(response: Response): Promise<unknown> {
  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    // Empty or malformed JSON is handled with a generic fallback.
  }

  if (!response.ok) {
    const detail = isRecord(data) && typeof data.detail === 'string' ? data.detail : 'Request failed.';
    throw new Error(detail);
  }

  return data;
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

    return normalizeMyAci(await parseResponse(response));
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

    return normalizeClassLeaderboard(await parseResponse(response));
  },

  // ============================================================
  // GET INDIVIDUAL ALUMNI HALL OF FAME
  // ============================================================
  async getIndividualLeaderboard(limit = 10): Promise<AciIndividualLeaderboardResponse> {
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(50, Math.trunc(limit))) : 10;
    const response = await fetch(`${API_URL}/alumni/aci/individual-leaderboard?limit=${safeLimit}`, {
      method: 'GET',
      headers: getAuthHeaders(),
      cache: 'no-store',
    });

    return normalizeIndividualLeaderboard(await parseResponse(response));
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

    let results = normalizeDirectory(await parseResponse(response), 'alumni directory');

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

    return normalizeDirectory(await parseResponse(response), 'pending alumni');
  },

  // ============================================================
  // UPDATE VERIFICATION STATUS (ADMIN)
  // ============================================================
  async updateVerificationStatus(
    userId: string,
    status: 'approved' | 'rejected' | 'suspended'
  ): Promise<AlumniVerificationResult> {
    const response = await fetch(
      `${API_URL}/alumni/verify/${userId}?status=${status}`,
      {
        method: 'PATCH',
        headers: getAuthHeaders(),
      }
    );

    return normalizeVerificationResult(await parseResponse(response));
  },
};

