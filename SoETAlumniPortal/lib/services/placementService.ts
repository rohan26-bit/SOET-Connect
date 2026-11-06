const API_URL = '/api';

function getToken(): string {
  const token = localStorage.getItem('soet_access_token');
  if (!token) throw new Error('Your session has expired. Please log in again.');
  return token;
}

async function parseResponse(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = typeof data.detail === 'string'
      ? data.detail
      : JSON.stringify(data.detail || 'Request failed.');
    throw new Error(detail);
  }
  return data;
}

export interface PlacementCelebration {
  id: string;
  alumni_name: string;
  company_name: string;
  designation?: string | null;
  department?: string | null;
  batch_year?: string | null;
  photo_url?: string | null;
  photo_consent: boolean;
  message?: string | null;
  is_published: boolean;
  created_at: string;
}

export interface PlacementInput {
  alumni_name: string;
  company_name: string;
  designation?: string;
  department?: string;
  batch_year?: string;
  photo_url?: string;
  photo_consent: boolean;
  message?: string;
  is_published: boolean;
}

export const placementService = {
  async getPublished(limit = 100): Promise<PlacementCelebration[]> {
    const response = await fetch(`${API_URL}/placements?limit=${limit}`, { cache: 'no-store' });
    const data = await parseResponse(response);
    return Array.isArray(data) ? data : [];
  },

  async getPublishedPage(params: {
    limit: number;
    offset: number;
    search?: string;
  }): Promise<{ placements: PlacementCelebration[]; total: number }> {
    const query = new URLSearchParams({
      limit: String(params.limit),
      offset: String(params.offset),
    });
    if (params.search?.trim()) query.set('search', params.search.trim());

    const response = await fetch(`${API_URL}/placements?${query.toString()}`, { cache: 'no-store' });
    const data = await parseResponse(response);
    return {
      placements: Array.isArray(data) ? data : [],
      total: Number(response.headers.get('X-Total-Count') || (Array.isArray(data) ? data.length : 0)),
    };
  },

  async getAdminRecords(): Promise<PlacementCelebration[]> {
    const response = await fetch(`${API_URL}/placements/admin`, {
      headers: { Authorization: `Bearer ${getToken()}` },
      cache: 'no-store',
    });
    const data = await parseResponse(response);
    return Array.isArray(data) ? data : [];
  },

  async create(input: PlacementInput): Promise<PlacementCelebration> {
    const response = await fetch(`${API_URL}/placements`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${getToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    });
    return parseResponse(response);
  },

  async update(id: string, input: Partial<PlacementInput>): Promise<PlacementCelebration> {
    const response = await fetch(`${API_URL}/placements/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${getToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    });
    return parseResponse(response);
  },

  async remove(id: string): Promise<void> {
    const response = await fetch(`${API_URL}/placements/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    await parseResponse(response);
  },
};
