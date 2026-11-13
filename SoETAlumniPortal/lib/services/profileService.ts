const API_URL = '/api';



type ApiRecord = Record<string, unknown>;

export interface ProfileSnapshot {
  id: string;
  name: string;
  full_name: string;
  email: string;
  role: string;
  avatar_url?: string | null;
  is_active?: boolean;
  is_verified?: boolean;
  is_public_profile?: boolean;
  student_profile?: ApiRecord;
  alumni_profile?: ApiRecord;
}

export interface ProfileUpdateResult extends ProfileSnapshot {
  message?: string;
  profile: ProfileSnapshot;
}

function isRecord(value: unknown): value is ApiRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown, label: string): ApiRecord {
  if (!isRecord(value)) {
    throw new Error('Unexpected ' + label + ' response format.');
  }
  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function optionalProfile(value: unknown): ApiRecord | undefined {
  return isRecord(value) ? value : undefined;
}

async function parseResponse(response: Response, fallbackMessage = 'Request failed.'): Promise<unknown> {
  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    // Empty or malformed JSON is handled with a safe fallback.
  }

  if (!response.ok) {
    const detail = isRecord(data) && typeof data.detail === 'string' ? data.detail : fallbackMessage;
    throw new Error(detail);
  }

  return data;
}

function normalizeProfile(value: unknown): ProfileSnapshot {
  const profile = asRecord(value, 'profile');
  if (typeof profile.id !== 'string' || !profile.id || typeof profile.role !== 'string') {
    throw new Error('The profile response is missing its account identity.');
  }

  const name =
    typeof profile.full_name === 'string'
      ? profile.full_name
      : typeof profile.name === 'string'
        ? profile.name
        : '';

  return {
    id: profile.id,
    name,
    full_name: name,
    email: typeof profile.email === 'string' ? profile.email : '',
    role: profile.role,
    avatar_url:
      profile.avatar_url === null
        ? null
        : optionalString(profile.avatar_url),
    is_active: optionalBoolean(profile.is_active),
    is_verified: optionalBoolean(profile.is_verified),
    is_public_profile: optionalBoolean(profile.is_public_profile),
    student_profile: optionalProfile(profile.student_profile),
    alumni_profile: optionalProfile(profile.alumni_profile),
  };
}

function normalizeProfileUpdate(value: unknown): ProfileUpdateResult {
  const result = asRecord(value, 'profile update');
  const profile = normalizeProfile(isRecord(result.profile) ? result.profile : result);
  return {
    ...profile,
    message: optionalString(result.message),
    profile,
  };
}

function syncLocalStorageUser(profile: Partial<ProfileSnapshot>) {
  try {
    const raw = localStorage.getItem('soet_user');
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    const existing = isRecord(parsed) ? parsed : {};
    const updated = {
      ...existing,
      id: profile.id || existing.id,
      name: profile.full_name || profile.name || existing.name || '',
      full_name: profile.full_name || profile.name || existing.full_name || '',
      email: profile.email || existing.email,
      role: profile.role || existing.role,
      avatar_url: profile.avatar_url !== undefined ? profile.avatar_url : existing.avatar_url,
      is_active: profile.is_active ?? existing.is_active ?? true,
      is_verified: profile.is_verified ?? existing.is_verified,
      is_public_profile: profile.is_public_profile ?? existing.is_public_profile,
      student_profile: profile.student_profile || existing.student_profile,
      alumni_profile: profile.alumni_profile || existing.alumni_profile,
    };
    localStorage.setItem('soet_user', JSON.stringify(updated));
  } catch {
    // Ignore storage parse and browser storage errors.
  }
}

export const profileService = {
  // ============================================================
  // GET MY PROFILE
  // ============================================================

  async getMyProfile(): Promise<ProfileSnapshot> {
    const response = await fetch(`${API_URL}/profile/me`, {
      method: 'GET',
      headers: {

        'Content-Type': 'application/json',
      },
    });

    const profile = normalizeProfile(
      await parseResponse(response, 'Unable to load your profile.')
    );
    syncLocalStorageUser(profile);
    return profile;
  },

  // ============================================================
  // UPDATE STUDENT PROFILE
  // ============================================================

  async updateStudentProfile(
    _userId: string,
    data: {
      fullName?: string;
      studentId?: string;
      department?: string;
      course?: string;
      academicYear?: string;
      graduationYear?: string;
      phone?: string;
    }
  ) {
    const response = await fetch(`${API_URL}/profile/me`, {
      method: 'PUT',
      headers: {

        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    const updated = normalizeProfileUpdate(
      await parseResponse(response, 'Unable to update your profile.')
    );
    syncLocalStorageUser(updated.profile);
    return updated;
  },

  // ============================================================
  // UPDATE ALUMNI PROFILE
  // ============================================================

  async updateAlumniProfile(
    _userId: string,
    data: {
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
    }
  ) {
    const response = await fetch(`${API_URL}/profile/me`, {
      method: 'PUT',
      headers: {

        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    const updated = normalizeProfileUpdate(
      await parseResponse(response, 'Unable to update your profile visibility.')
    );
    syncLocalStorageUser(updated.profile);
    return updated;
  },

  // ============================================================
  // ============================================================
  // UPDATE ALUMNI DIRECTORY VISIBILITY
  // ============================================================

  async updateProfileVisibility(isPublic: boolean) {
    const response = await fetch(`${API_URL}/profile/me`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ is_public_profile: isPublic }),
    });

    const updated = normalizeProfileUpdate(
      await parseResponse(response, 'Unable to update your administrator profile.')
    );
    syncLocalStorageUser(updated.profile);
    return updated;
  },

  // ============================================================
  // UPLOAD AVATAR
  // ============================================================

  async uploadAvatar(_userId: string, file: File): Promise<string> {
    const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024; // 2MB
    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new Error('Avatar image size must not exceed 2MB.');
    }
    const allowedAvatarTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
    if (!allowedAvatarTypes.has(file.type)) {
      throw new Error('Only JPEG, PNG, or WebP images are allowed.');
    }

    // Convert image file to base64 Data URL for persistent storage
    const base64Url = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
      reader.readAsDataURL(file);
    });

    const response = await fetch(`${API_URL}/profile/avatar`, {
      method: 'POST',
      headers: {

        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ avatar_url: base64Url }),
    });

    const data = asRecord(
      await parseResponse(response, 'Unable to update your profile photo.'),
      'avatar update'
    );
    const avatarUrl = typeof data.avatar_url === 'string' && data.avatar_url
      ? data.avatar_url
      : base64Url;
    syncLocalStorageUser({ avatar_url: avatarUrl });
    return avatarUrl;
  },

  // ============================================================
  // UPDATE ADMIN PROFILE
  // ============================================================

  async updateAdminProfile(data: { fullName?: string }) {
    const response = await fetch(`${API_URL}/profile/me`, {
      method: 'PUT',
      headers: {

        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    const updated = await parseResponse(response);
    syncLocalStorageUser(updated);
    return updated;
  },
};
