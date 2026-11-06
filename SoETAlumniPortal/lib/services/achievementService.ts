/**
 * Achievements & Recognition service.
 *
 * All persistence is routed through the authenticated FastAPI API; the browser
 * never talks to the Supabase achievements table directly.
 */

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

export const achievementService = {
  async getMyAchievements(): Promise<Achievement[]> {
    const response = await fetch(`${API_URL}/alumni/me/achievements`, {
      method: 'GET',
      headers: getAuthHeaders(),
      cache: 'no-store',
    });
    return parseResponse<Achievement[]>(response);
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
    return parseResponse<Achievement[]>(response);
  },

  async createAchievement(input: CreateAchievementInput): Promise<Achievement> {
    const response = await fetch(`${API_URL}/alumni/me/achievements`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(input),
    });
    return parseResponse<Achievement>(response);
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
    return parseResponse<Achievement>(response);
  },

  async deleteAchievement(id: string): Promise<void> {
    const response = await fetch(
      `${API_URL}/alumni/me/achievements/${encodeURIComponent(id)}`,
      {
        method: 'DELETE',
        headers: getAuthHeaders(),
      }
    );
    await parseResponse<unknown>(response);
  },
};
