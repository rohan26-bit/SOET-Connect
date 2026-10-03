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

    if (!data.access_token || !data.user) {
      throw new Error(
        'Invalid response from authentication server.'
      );
    }

    localStorage.setItem(
      'soet_access_token',
      data.access_token
    );

    localStorage.setItem(
      'soet_user',
      JSON.stringify(data.user)
    );

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
      localStorage.removeItem('soet_access_token');
      localStorage.removeItem('soet_user');

      throw new Error(
        `Access denied. Your account is registered as "${profile.role.toUpperCase()}", not "${selectedRole.toUpperCase()}". Please select the correct role.`
      );
    }

    return {
      user: data.user,
      profile,
      access_token: data.access_token,
    };
  },

  // ============================================================
  // REGISTER STUDENT
  // ============================================================

  async registerStudent(data: {
    fullName: string;
    email: string;
    password: string;
    studentId?: string;
    department: string;
    course?: string;
    academicYear?: string;
    graduationYear?: string;
    phone?: string;
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
    localStorage.removeItem(
      'soet_access_token'
    );

    localStorage.removeItem(
      'soet_user'
    );
  },

  // ============================================================
  // CURRENT USER
  // ============================================================

  async getCurrentUserProfile(): Promise<UserProfile | null> {
    const storedUser =
      localStorage.getItem('soet_user');

    if (!storedUser) {
      return null;
    }

    try {
      const user = JSON.parse(storedUser);

      return {
        id: user.id || user._id,
        email: user.email,
        role: user.role,
        full_name: user.full_name || user.name || '',
        avatar_url: user.avatar_url,
        is_verified: user.is_verified,
        is_active: user.is_active ?? true,
        student_profile:
          user.student_profile,
        alumni_profile:
          user.alumni_profile,
      };
    } catch {
      localStorage.removeItem(
        'soet_user'
      );

      localStorage.removeItem(
        'soet_access_token'
      );

      return null;
    }
  },
};