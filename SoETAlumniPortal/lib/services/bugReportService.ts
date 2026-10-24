export type BugReportCategory =
  | 'bug'
  | 'ui_issue'
  | 'auth_issue'
  | 'data_issue'
  | 'performance'
  | 'other';

export type BugReportSeverity = 'low' | 'medium' | 'high' | 'critical';

export type BugReportStatus = 'open' | 'in_review' | 'resolved' | 'closed';

export interface BugReportReporter {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar_url?: string;
}

export interface BugReport {
  id: string;
  reporter_user_id: string;
  category: BugReportCategory;
  severity: BugReportSeverity;
  subject: string;
  description: string;
  page_route?: string;
  reproduction_steps?: string;
  status: BugReportStatus;
  admin_notes?: string;
  created_at: string;
  updated_at: string;
  reporter?: BugReportReporter;
}

export interface BugReportCreateInput {
  category: BugReportCategory;
  severity: BugReportSeverity;
  subject: string;
  description: string;
  page_route?: string;
  reproduction_steps?: string;
}

const API_URL = '/api';

function getToken(): string {
  const token = localStorage.getItem('soet_access_token');
  if (!token) {
    throw new Error('Your session has expired. Please log in again.');
  }
  return token;
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

export const bugReportService = {
  /**
   * Submit a new bug or issue report (authenticated users).
   */
  async submitReport(payload: BugReportCreateInput): Promise<{ message: string; report: BugReport }> {
    const response = await fetch(`${API_URL}/bug-reports`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${getToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    return parseResponse(response);
  },

  /**
   * List all bug reports (Admin only).
   */
  async getReports(): Promise<BugReport[]> {
    const response = await fetch(`${API_URL}/bug-reports`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${getToken()}`,
        'Content-Type': 'application/json',
      },
    });

    return parseResponse<BugReport[]>(response);
  },

  /**
   * Get single report details.
   */
  async getReport(id: string): Promise<BugReport> {
    const response = await fetch(`${API_URL}/bug-reports/${id}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${getToken()}`,
        'Content-Type': 'application/json',
      },
    });

    return parseResponse<BugReport>(response);
  },

  /**
   * Update report status and administrator notes (Admin only).
   */
  async updateStatus(
    id: string,
    status: BugReportStatus,
    adminNotes?: string
  ): Promise<{ message: string; report: BugReport }> {
    const response = await fetch(`${API_URL}/bug-reports/${id}/status`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${getToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        status,
        admin_notes: adminNotes,
      }),
    });

    return parseResponse(response);
  },
};
