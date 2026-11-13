/**
 * Achievements & Recognition service.
 *
 * All persistence is routed through the authenticated FastAPI API; the browser
 * never talks to the Supabase achievements table directly.
 */

const API_URL = '/api';

function getAuthHeaders(): Record<string, string> {
  return { 'Content-Type': 'application/json' };
}

type ApiRecord = Record<string, unknown>;

function isRecord(value: unknown): value is ApiRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function errorMessage(value: unknown): string {
  if (!isRecord(value)) return 'Request failed.';
  if (typeof value.detail === 'string') return value.detail;
  if (Array.isArray(value.detail)) {
    const messages = value.detail
      .map((item) => (isRecord(item) && typeof item.msg === 'string' ? item.msg : null))
      .filter((message): message is string => message !== null);
    return messages.length ? messages.join('; ') : 'Invalid request.';
  }
  return 'Request failed.';
}

async function parseResponse(response: Response): Promise<unknown> {
  let data: unknown = null;
  try {
    if (response.status !== 204) data = await response.json();
  } catch {
    // Empty or malformed JSON is handled by callers or the operation fallback.
  }

  if (!response.ok) {
    throw new Error(errorMessage(data));
  }

  return data;
}

export type AchievementCategory =
  | 'award'
  | 'certification'
  | 'honor'
  | 'project'
  | 'publication'
  | 'patent'
  | 'other';

export const ACHIEVEMENT_CATEGORY_LABELS: Record<AchievementCategory, string> = {
  award: 'Award & Recognition',
  certification: 'Professional Certification',
  honor: 'Academic Honor',
  project: 'Key Project / Milestone',
  publication: 'Research & Publication',
  patent: 'Patent & IP',
  other: 'Other Accomplishment',
};

export interface Achievement {
  id: string;
  user_id?: string;
  title: string;
  description: string;
  category: AchievementCategory;
  achievement_date: string;
  issuing_organization: string;
  credential_name?: string | null;
  credential_url?: string | null;
  image_url?: string | null;
  visibility: 'public' | 'private' | 'alumni_only';
  created_at?: string;
  updated_at?: string;
}

export interface CreateAchievementInput {
  title: string;
  description: string;
  category: AchievementCategory;
  achievement_date: string;
  issuing_organization: string;
  credential_name?: string | null;
  credential_url?: string | null;
  image_url?: string | null;
  visibility?: 'public' | 'private' | 'alumni_only';
}

export interface UpdateAchievementInput {
  title?: string;
  description?: string;
  category?: AchievementCategory;
  achievement_date?: string;
  issuing_organization?: string;
  credential_name?: string | null;
  credential_url?: string | null;
  image_url?: string | null;
  visibility?: 'public' | 'private' | 'alumni_only';
}

const VALID_ACHIEVEMENT_CATEGORIES: AchievementCategory[] = [
  'award',
  'certification',
  'honor',
  'project',
  'publication',
  'patent',
  'other',
];

const VALID_ACHIEVEMENT_VISIBILITIES = ['public', 'private', 'alumni_only'] as const;

function requiredString(record: ApiRecord, key: string): string {
  const value = record[key];
  if (typeof value !== 'string') {
    throw new Error('The achievement response is missing a valid ' + key + ' value.');
  }
  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function optionalNullableString(value: unknown): string | null | undefined {
  if (value === null) return null;
  return typeof value === 'string' ? value : undefined;
}

function normalizeAchievement(value: unknown): Achievement {
  if (!isRecord(value)) {
    throw new Error('Unexpected achievement response format.');
  }

  const category = value.category;
  const visibility = value.visibility;
  if (
    typeof category !== 'string' ||
    !VALID_ACHIEVEMENT_CATEGORIES.includes(category as AchievementCategory)
  ) {
    throw new Error('The achievement response contains an unsupported category.');
  }
  if (
    typeof visibility !== 'string' ||
    !VALID_ACHIEVEMENT_VISIBILITIES.includes(visibility as (typeof VALID_ACHIEVEMENT_VISIBILITIES)[number])
  ) {
    throw new Error('The achievement response contains an unsupported visibility setting.');
  }

  return {
    id: requiredString(value, 'id'),
    user_id: optionalString(value.user_id),
    title: requiredString(value, 'title'),
    description: requiredString(value, 'description'),
    category: category as AchievementCategory,
    achievement_date: requiredString(value, 'achievement_date'),
    issuing_organization: requiredString(value, 'issuing_organization'),
    credential_name: optionalNullableString(value.credential_name),
    credential_url: optionalNullableString(value.credential_url),
    image_url: optionalNullableString(value.image_url),
    visibility,
    created_at: optionalString(value.created_at),
    updated_at: optionalString(value.updated_at),
  };
}

function normalizeAchievementList(value: unknown, label: string): Achievement[] {
  if (!Array.isArray(value)) {
    throw new Error('Unexpected ' + label + ' response format. Please refresh and try again.');
  }
  return value.map(normalizeAchievement);
}

export const achievementService = {
  async getMyAchievements(): Promise<Achievement[]> {
    const response = await fetch(`${API_URL}/alumni/me/achievements`, {
      method: 'GET',
      headers: getAuthHeaders(),
      cache: 'no-store',
    });
    return normalizeAchievementList(await parseResponse(response), 'my achievements');
  },

  async getVisibleAchievements(alumniId: string): Promise<Achievement[]> {
    const response = await fetch(
      `${API_URL}/alumni/directory/${encodeURIComponent(alumniId)}/achievements`,
      {
        method: 'GET',
        headers: getAuthHeaders(),
        cache: 'no-store',
      }
    );
    return normalizeAchievementList(await parseResponse(response), 'visible alumni achievements');
  },

  async createAchievement(input: CreateAchievementInput): Promise<Achievement> {
    const response = await fetch(`${API_URL}/alumni/me/achievements`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(input),
    });
    return normalizeAchievement(await parseResponse(response));
  },

  async updateAchievement(id: string, input: UpdateAchievementInput): Promise<Achievement> {
    const response = await fetch(
      `${API_URL}/alumni/me/achievements/${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify(input),
      }
    );
    return normalizeAchievement(await parseResponse(response));
  },

  async deleteAchievement(id: string): Promise<void> {
    const response = await fetch(
      `${API_URL}/alumni/me/achievements/${encodeURIComponent(id)}`,
      {
        method: 'DELETE',
        headers: getAuthHeaders(),
      }
    );
    await parseResponse(response);
  },
};
