/**
 * Achievements & Recognition Service Contract
 *
 * Defines the TypeScript data model and service contract for alumni
 * achievements, awards, credentials, and honors.
 *
 * NOTE: FastAPI backend endpoints for achievements have not yet been
 * provisioned in the current system. This service cleanly defines the
 * contract and explicitly signals API unavailability without attempting
 * fake HTTP requests or inventing unsanctioned backend endpoints.
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
  visibility?: 'public' | 'private' | 'alumni_only';
  created_at?: string;
  updated_at?: string;
}

export interface CreateAchievementInput {
  title: string;
  description: string;
  category: AchievementCategory;
  achievement_date: string;
  issuing_organization: string;
  credential_name?: string;
  credential_url?: string;
  image_url?: string;
  visibility?: 'public' | 'private' | 'alumni_only';
}

export interface UpdateAchievementInput {
  title?: string;
  description?: string;
  category?: AchievementCategory;
  achievement_date?: string;
  issuing_organization?: string;
  credential_name?: string;
  credential_url?: string;
  image_url?: string;
  visibility?: 'public' | 'private' | 'alumni_only';
}

export class AchievementApiUnavailableError extends Error {
  readonly isBackendUnavailable: boolean = true;

  constructor(
    message = 'Achievement API is currently unavailable because the backend achievement endpoints have not been implemented yet.'
  ) {
    super(message);
    this.name = 'AchievementApiUnavailableError';
  }
}

export const achievementService = {
  /**
   * Retrieves achievements for the authenticated alumni user.
   *
   * Rejects with AchievementApiUnavailableError because the backend
   * achievement endpoints have not been implemented.
   */
  async getMyAchievements(_userId?: string): Promise<Achievement[]> {
    // Real FastAPI endpoints for achievements have not been provisioned.
    // Explicitly reject with an unavailable state rather than faking data.
    throw new AchievementApiUnavailableError(
      'Achievement retrieval is currently unavailable because the backend achievement API has not been implemented yet.'
    );
  },

  /**
   * Submits a new achievement record.
   *
   * Explicitly signals backend unavailability.
   */
  async createAchievement(_input: CreateAchievementInput): Promise<Achievement> {
    throw new AchievementApiUnavailableError(
      'Achievement saving is currently unavailable because the backend achievement API has not been implemented yet.'
    );
  },

  /**
   * Updates an existing achievement record.
   *
   * Explicitly signals backend unavailability.
   */
  async updateAchievement(
    _id: string,
    _input: UpdateAchievementInput
  ): Promise<Achievement> {
    throw new AchievementApiUnavailableError(
      'Achievement updating is currently unavailable because the backend achievement API has not been implemented yet.'
    );
  },

  /**
   * Deletes an achievement record.
   *
   * Explicitly signals backend unavailability.
   */
  async deleteAchievement(_id: string): Promise<void> {
    throw new AchievementApiUnavailableError(
      'Achievement deletion is currently unavailable because the backend achievement API has not been implemented yet.'
    );
  },
};
