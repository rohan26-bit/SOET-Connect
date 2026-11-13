const API_URL = '/api';



type ApiRecord = Record<string, unknown>;

function isRecord(value: unknown): value is ApiRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown, label: string): ApiRecord {
  if (!isRecord(value)) throw new Error('Unexpected ' + label + ' response format.');
  return value;
}

function requiredString(record: ApiRecord, key: string, label: string): string {
  const value = record[key];
  if (typeof value !== 'string') {
    throw new Error('The ' + label + ' response is missing a valid ' + key + ' value.');
  }
  return value;
}

function optionalNullableString(value: unknown): string | null | undefined {
  if (value === null) return null;
  return typeof value === 'string' ? value : undefined;
}

function readBoolean(record: ApiRecord, key: string, fallback: boolean, label: string): boolean {
  const value = record[key];
  if (typeof value === 'boolean') return value;
  if (value === null || value === undefined) return fallback;
  throw new Error('The ' + label + ' response contains an invalid ' + key + ' value.');
}

function errorDetail(value: unknown): string {
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

async function parseResponse(response: Response, fallbackMessage = 'Request failed.'): Promise<unknown> {
  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    // Empty or malformed JSON is handled with an operation-specific fallback.
  }
  if (!response.ok) {
    const detail = errorDetail(data);
    throw new Error(detail === 'Request failed.' ? fallbackMessage : detail);
  }
  return data;
}

function normalizePlacement(value: unknown): PlacementCelebration {
  const placement = asRecord(value, 'placement celebration');
  return {
    id: requiredString(placement, 'id', 'placement celebration'),
    alumni_name: requiredString(placement, 'alumni_name', 'placement celebration'),
    company_name: requiredString(placement, 'company_name', 'placement celebration'),
    designation: optionalNullableString(placement.designation),
    department: optionalNullableString(placement.department),
    batch_year: optionalNullableString(placement.batch_year),
    photo_url: optionalNullableString(placement.photo_url),
    photo_consent: readBoolean(placement, 'photo_consent', false, 'placement celebration'),
    message: optionalNullableString(placement.message),
    is_published: readBoolean(placement, 'is_published', false, 'placement celebration'),
    created_at: requiredString(placement, 'created_at', 'placement celebration'),
  };
}

function normalizePlacementList(value: unknown, label: string): PlacementCelebration[] {
  if (!Array.isArray(value)) {
    throw new Error('Unexpected ' + label + ' response format. Please refresh and try again.');
  }
  return value.map(normalizePlacement);
}

function safeLimit(value: number): number {
  return Number.isFinite(value) ? Math.max(1, Math.min(100, Math.trunc(value))) : 100;
}

function safeOffset(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
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
    const response = await fetch(`${API_URL}/placements?limit=${safeLimit(limit)}`, { cache: 'no-store' });
    const data = await parseResponse(response, 'Failed to load placement celebrations.');
    return normalizePlacementList(data, 'published placements');
  },

  async getPublishedPage(params: {
    limit: number;
    offset: number;
    search?: string;
  }): Promise<{ placements: PlacementCelebration[]; total: number }> {
    const query = new URLSearchParams({
      limit: String(safeLimit(params.limit)),
      offset: String(safeOffset(params.offset)),
    });
    if (params.search?.trim()) query.set('search', params.search.trim());

    const response = await fetch(`${API_URL}/placements?${query.toString()}`, { cache: 'no-store' });
    const data = normalizePlacementList(
      await parseResponse(response, 'Failed to load placement celebrations.'),
      'placement page'
    );
    const headerTotal = Number(response.headers.get('X-Total-Count'));
    return {
      placements: data,
      total:
        Number.isFinite(headerTotal) && headerTotal >= 0
          ? Math.trunc(headerTotal)
          : data.length,
    };
  },

  async getAdminRecords(): Promise<PlacementCelebration[]> {
    const response = await fetch(`${API_URL}/placements/admin`, {
      cache: 'no-store',
    });
    const data = await parseResponse(response, 'Failed to load placement administration records.');
    return normalizePlacementList(data, 'admin placements');
  },

  async create(input: PlacementInput): Promise<PlacementCelebration> {
    const response = await fetch(`${API_URL}/placements`, {
      method: 'POST',
      headers: {

        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    });
    return normalizePlacement(
      await parseResponse(response, 'Failed to create placement celebration.')
    );
  },

  async update(id: string, input: Partial<PlacementInput>): Promise<PlacementCelebration> {
    const response = await fetch(`${API_URL}/placements/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: {

        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    });
    return normalizePlacement(
      await parseResponse(response, 'Failed to update placement celebration.')
    );
  },

  async remove(id: string): Promise<void> {
    const response = await fetch(`${API_URL}/placements/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: {  },
    });
    await parseResponse(response, 'Failed to delete placement celebration.');
  },
};
