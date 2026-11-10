export interface StudentProfile {
  student_id?: string;
  department?: string;
  course?: string;
  academic_year?: string;
  graduation_year?: string;
  phone?: string;
}

export interface AlumniProfile {
  alumni_id?: string;
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
  verification_status?: string;
}

export interface UserProfile {
  id: string;
  email: string;
  role: 'student' | 'alumni' | 'admin';
  full_name: string;

  avatar_url?: string;
  is_active?: boolean;
  is_verified?: boolean;

  student_profile?: StudentProfile;
  alumni_profile?: AlumniProfile;
}

const API_URL = '/api';

async function safeJsonParse(response: Response): Promise<any> {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    if (!response.ok) {
      throw new Error(
        `Server error (${response.status}): ${text.slice(0, 100) || response.statusText || 'Backend server returned an error.'}`
      );
    }
    throw new Error('Received an invalid response from the server.');
  }
}

export const authService = {
  // ============================================================
  // LOGIN
  // ============================================================

  async signIn(
    email: string,
    password: string,
    selectedRole: 'student' | 'alumni' | 'admin'
  ) {
    const response = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        password,
        role: selectedRole,
      }),
    });

    const data = await safeJsonParse(response);

    if (!response.ok) {
      throw new Error(
        data.detail ||
          'Login failed. Please check your credentials.'
      );
    }

    if (!data.user) {
      throw new Error('Invalid response from authentication server.');
    }

    // The JWT is stored only in the server-set HttpOnly cookie. Keep only
    // non-sensitive display data in localStorage for the dashboard shell.
    localStorage.removeItem('soet_access_token');
    localStorage.setItem('soet_user', JSON.stringify(data.user));

    const profile: UserProfile = {
      id: data.user.id,
      email: data.user.email,
      role: data.user.role,
      full_name: data.user.name,
      is_verified: data.user.is_verified,
      is_active: true,
      student_profile: data.user.student_profile,
      alumni_profile: data.user.alumni_profile,
    };

    if (profile.role !== selectedRole) {
      try {
        await fetch(`${API_URL}/auth/logout`, {
          method: 'POST',
          credentials: 'same-origin',
        });
      } catch {
        // Still clear local profile state when the network is unavailable.
      } finally {
        localStorage.removeItem('soet_access_token');
        localStorage.removeItem('soet_user');
      }

      throw new Error(
        `Access denied. Your account is registered as "${profile.role.toUpperCase()}", not "${selectedRole.toUpperCase()}". Please select the correct role.`
      );
    }

    return {
      user: data.user,
      profile,
    };
  },

  // ============================================================
  // PRN AVAILABILITY
  // ============================================================

  async checkPrnAvailability(prn: string): Promise<{ available: boolean; message: string }> {
    const response = await fetch(
      `${API_URL}/auth/check-prn?prn=${encodeURIComponent(prn.trim())}`,
      { method: 'GET', cache: 'no-store' }
    );
    const result = await safeJsonParse(response);
    if (!response.ok) {
      throw new Error(result.detail || 'Unable to verify PRN availability.');
    }
    return result;
  },

  // ============================================================
  // REGISTER STUDENT
  // ============================================================

  async registerStudent(data: {
    fullName: string;
    email: string;
    password: string;
    studentId: string;
    department: string;
    course: string;
    academicYear: string;
    graduationYear: string;
    phone: string;
  }) {
    const response = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },

      body: JSON.stringify({
        name: data.fullName,
        email: data.email,
        password: data.password,
        role: 'student',
        student_id: data.studentId,
        department: data.department,
        course: data.course,
        academic_year: data.academicYear,
        graduation_year: data.graduationYear,
        phone: data.phone,
      }),
    });

    const result = await safeJsonParse(response);

    if (!response.ok) {
      throw new Error(
        result.detail ||
          'Student registration failed.'
      );
    }

    return result;
  },

  // ============================================================
  // REGISTER ALUMNI
  // ============================================================

  async registerAlumni(data: {
    fullName: string;
    email: string;
    password: string;
    alumniId: string;
    department: string;
    degree?: string;
    graduationYear: string;
    company?: string;
    designation?: string;
    industry?: string;
    location?: string;
    skills?: string[];
    linkedin?: string;
    github?: string;
    website?: string;
    bio?: string;
  }) {
    const response = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },

      body: JSON.stringify({
        name: data.fullName,
        email: data.email,
        password: data.password,
        role: 'alumni',
        alumni_id: data.alumniId,
        department: data.department,
        degree: data.degree,
        graduation_year: data.graduationYear,
        company: data.company,
        designation: data.designation,
        industry: data.industry,
        location: data.location,
        skills: data.skills || [],
        linkedin: data.linkedin,
        github: data.github,
        website: data.website,
        bio: data.bio,
      }),
    });

    const result = await safeJsonParse(response);

    if (!response.ok) {
      console.error(
        'Alumni registration error:',
        result
      );

      const detail =
        typeof result.detail === 'string'
          ? result.detail
          : JSON.stringify(result.detail);

      throw new Error(
        detail || 'Alumni registration failed.'
      );
    }

    return result;
  },

  // ============================================================
  // REGISTER ADMIN
  // ============================================================

  async registerAdmin(data: {
    fullName: string;
    email: string;
    password: string;
    adminSecret: string;
  }) {
    const response = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },

      body: JSON.stringify({
        name: data.fullName,
        email: data.email,
        password: data.password,
        role: 'admin',
        admin_secret: data.adminSecret,
      }),
    });

    const result = await safeJsonParse(response);

    if (!response.ok) {
      throw new Error(
        result.detail ||
          'Admin registration failed.'
      );
    }

    return result;
  },

  // ============================================================
  // LOGOUT
  // ============================================================

  async signOut() {
    try {
      // The browser attaches the HttpOnly cookie automatically to this same-origin request.
      await fetch(`${API_URL}/auth/logout`, {
        method: 'POST',
        credentials: 'same-origin',
      });
    } catch (error) {
      // Local sign-out must still complete during a temporary network outage.
      console.warn('Server-side sign out could not be confirmed:', error);
    } finally {
      localStorage.removeItem('soet_access_token'); // Clear tokens left by older releases.
      localStorage.removeItem('soet_user');
    }
  },

  // ============================================================
  // ACTIVE DEVICE SESSIONS
  // ============================================================

  async getActiveSessions(): Promise<{
    sessions: Array<{
      id: string;
      device_label: string;
      created_at: string;
      last_seen_at: string;
      expires_at: string;
      is_current: boolean;
    }>;
    current_session_id: string;
  }> {
    const response = await fetch(`${API_URL}/auth/sessions`, {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
    });
    const result = await safeJsonParse(response);
    if (response.status === 401) {
      localStorage.removeItem('soet_access_token');
      localStorage.removeItem('soet_user');
      throw new Error('Your session has expired or has been revoked. Please sign in again.');
    }
    if (!response.ok) {
      throw new Error(result.detail || 'Unable to load active sessions.');
    }
    return result;
  },

  async revokeSession(sessionId: string): Promise<{ message: string }> {
    const response = await fetch(`${API_URL}/auth/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'DELETE',
      credentials: 'same-origin',
    });
    const result = await safeJsonParse(response);
    if (response.status === 401) {
      localStorage.removeItem('soet_access_token');
      localStorage.removeItem('soet_user');
      throw new Error('Your session has expired or has been revoked. Please sign in again.');
    }
    if (!response.ok) throw new Error(result.detail || 'Unable to sign out that device.');
    return result;
  },

  async revokeOtherSessions(): Promise<{ message: string; revoked_count: number }> {
    const response = await fetch(`${API_URL}/auth/sessions/revoke-others`, {
      method: 'POST',
      credentials: 'same-origin',
    });
    const result = await safeJsonParse(response);
    if (response.status === 401) {
      localStorage.removeItem('soet_access_token');
      localStorage.removeItem('soet_user');
      throw new Error('Your session has expired or has been revoked. Please sign in again.');
    }
    if (!response.ok) throw new Error(result.detail || 'Unable to sign out other devices.');
    return result;
  },

  // ============================================================
  // CURRENT USER
  // ============================================================

  async getCurrentUserProfile(): Promise<UserProfile | null> {
    // Remove any raw JWT persisted by a previous frontend release.
    localStorage.removeItem('soet_access_token');

    const response = await fetch(`${API_URL}/profile/me`, {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
    });

    if (response.status === 401) {
      localStorage.removeItem('soet_user');
      return null;
    }

    const user = await safeJsonParse(response);
    if (!response.ok) {
      throw new Error(user.detail || 'Unable to verify your current session.');
    }

    localStorage.setItem('soet_user', JSON.stringify(user));
    return {
      id: user.id || user._id,
      email: user.email,
      role: user.role,
      full_name: user.full_name || user.name || '',
      avatar_url: user.avatar_url,
      is_verified: user.is_verified,
      is_active: user.is_active ?? true,
      student_profile: user.student_profile,
      alumni_profile: user.alumni_profile,
    };

  },

  // ============================================================
  // PASSWORD RECOVERY (FORGOT PASSWORD)
  // ============================================================

  async requestPasswordReset(
    identifier: string,
    channel: 'email' | 'sms' = 'email'
  ): Promise<{ message: string; channel?: string; cooldown_seconds?: number; expires_in?: number }> {
    const response = await fetch(`${API_URL}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, channel }),
    });

    const result = await safeJsonParse(response);
    if (!response.ok) {
      throw new Error(result.detail || 'Failed to request password reset.');
    }
    return result;
  },

  async verifyResetCode(
    identifier: string,
    code: string
  ): Promise<{ reset_token: string; message: string }> {
    const response = await fetch(`${API_URL}/auth/verify-reset-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, code }),
    });

    const result = await safeJsonParse(response);
    if (!response.ok) {
      throw new Error(result.detail || 'Invalid or expired verification code.');
    }
    return result;
  },

  async resetPassword(
    reset_token: string,
    new_password: string
  ): Promise<{ message: string }> {
    const response = await fetch(`${API_URL}/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reset_token, new_password }),
    });

    const result = await safeJsonParse(response);
    if (!response.ok) {
      throw new Error(result.detail || 'Failed to reset password.');
    }
    return result;
  },

  // ============================================================
  // PHONE VERIFICATION (ACCOUNT SETTINGS)
  // ============================================================

  async sendPhoneVerification(phone: string): Promise<{ message: string }> {
    const response = await fetch(`${API_URL}/auth/phone/send-code`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ phone }),
    });

    const result = await safeJsonParse(response);
    if (!response.ok) {
      throw new Error(result.detail || 'Failed to send phone verification code.');
    }
    return result;
  },

  async verifyPhoneVerification(phone: string, code: string): Promise<{ message: string }> {
    const response = await fetch(`${API_URL}/auth/phone/verify-code`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ phone, code }),
    });

    const result = await safeJsonParse(response);
    if (!response.ok) {
      throw new Error(result.detail || 'Invalid or expired phone verification code.');
    }
    return result;
  },

  // ============================================================
  // CHANGE PASSWORD
  // ============================================================

  async changePassword(data: {
    current_password: string;
    new_password: string;
    confirm_new_password: string;
  }): Promise<{ message: string }> {
    const response = await fetch(`${API_URL}/auth/change-password`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    const result = await safeJsonParse(response);
    if (!response.ok) {
      throw new Error(result.detail || 'Failed to change password.');
    }
    // The backend rotates the HttpOnly cookie after revoking other devices.
    return result;
  },
};