const API_URL = 'http://127.0.0.1:8000';

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

function syncLocalStorageUser(profile: any) {
  try {
    const raw = localStorage.getItem('soet_user');
    const existing = raw ? JSON.parse(raw) : {};
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
      student_profile: profile.student_profile || existing.student_profile,
      alumni_profile: profile.alumni_profile || existing.alumni_profile,
    };
    localStorage.setItem('soet_user', JSON.stringify(updated));
  } catch {
    // Ignore storage parse errors
  }
}

export const profileService = {
  // ============================================================
  // GET MY PROFILE
  // ============================================================

  async getMyProfile() {
    const response = await fetch(`${API_URL}/profile/me`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${getToken()}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await parseResponse(response);
    syncLocalStorageUser(data);
    return data;
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
        Authorization: `Bearer ${getToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    const updated = await parseResponse(response);
    syncLocalStorageUser(updated);
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
        Authorization: `Bearer ${getToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    const updated = await parseResponse(response);
    syncLocalStorageUser(updated);
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
    if (!file.type || !file.type.startsWith('image/')) {
      throw new Error('Only image files (JPEG, PNG, WebP, GIF) are allowed.');
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
        Authorization: `Bearer ${getToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ avatar_url: base64Url }),
    });

    const data = await parseResponse(response);
    syncLocalStorageUser({ avatar_url: data.avatar_url || base64Url });
    return data.avatar_url || base64Url;
  },
};
