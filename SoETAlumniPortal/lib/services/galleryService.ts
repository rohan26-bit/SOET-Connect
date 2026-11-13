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

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function parseErrorDetail(value: unknown): string {
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

async function parseResponse(
  response: Response,
  fallbackMessage = 'Request failed.'
): Promise<unknown> {
  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    // Empty or malformed JSON is handled with the operation-specific fallback.
  }

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Your session has expired. Please log in again.');
    }
    const detail = parseErrorDetail(data);
    throw new Error(detail === 'Request failed.' ? fallbackMessage : detail);
  }

  return data;
}

function normalizeGalleryPhoto(value: unknown): GalleryPhoto {
  const photo = asRecord(value, 'gallery photo');
  const status = photo.status;

  if (status !== 'pending' && status !== 'approved' && status !== 'rejected') {
    throw new Error('The gallery response contains an unsupported photo status.');
  }

  const viewsCount = photo.views_count;
  return {
    id: requiredString(photo, 'id', 'gallery photo'),
    title: requiredString(photo, 'title', 'gallery photo'),
    description: optionalString(photo.description),
    category: optionalString(photo.category),
    event_name: optionalString(photo.event_name),
    batch_year: optionalString(photo.batch_year),
    image_url: requiredString(photo, 'image_url', 'gallery photo'),
    thumbnail_url: optionalString(photo.thumbnail_url),
    status,
    rejection_reason: optionalString(photo.rejection_reason),
    created_at: requiredString(photo, 'created_at', 'gallery photo'),
    user_id: requiredString(photo, 'user_id', 'gallery photo'),
    user_name: optionalString(photo.user_name),
    user_role: optionalString(photo.user_role),
    avatar_url: optionalString(photo.avatar_url),
    views_count:
      typeof viewsCount === 'number' && Number.isFinite(viewsCount)
        ? viewsCount
        : undefined,
  };
}

function normalizePhotoList(value: unknown, label: string): GalleryPhoto[] {
  if (!Array.isArray(value)) {
    throw new Error('Unexpected ' + label + ' response format. Please refresh and try again.');
  }
  return value.map(normalizeGalleryPhoto);
}

function normalizePhotoAction(value: unknown, label: string): GalleryPhoto {
  const result = asRecord(value, label);
  return normalizeGalleryPhoto(result.photo ?? result);
}

function normalizeDeleteResult(value: unknown): { message: string } {
  const result = asRecord(value, 'gallery delete');
  return {
    message:
      typeof result.message === 'string'
        ? result.message
        : 'Photo deleted successfully.',
  };
}

export interface GalleryPhoto {
  id: string;
  title: string;
  description?: string;
  category?: string;
  event_name?: string;
  batch_year?: string;
  image_url: string;
  thumbnail_url?: string;
  status: 'pending' | 'approved' | 'rejected';
  rejection_reason?: string;
  created_at: string;
  user_id: string;
  user_name?: string;
  user_role?: string;
  avatar_url?: string;
  views_count?: number;
}

export interface GalleryUploadPayload {
  title: string;
  description?: string;
  category?: string;
  event_name?: string;
  batch_year?: string;
  file: File;
}

export const galleryService = {
  // ============================================================
  // GET APPROVED PHOTOS (PUBLIC/ALL USERS)
  // ============================================================

  async getApprovedPhotos(params?: {
    category?: string;
    batch_year?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ photos: GalleryPhoto[]; total: number }> {
    const query = new URLSearchParams();
    if (params?.category && params.category !== 'all') {
      query.set('category', params.category);
    }
    if (params?.batch_year && params.batch_year !== 'all') {
      query.set('batch_year', params.batch_year);
    }
    if (params?.search) {
      query.set('search', params.search);
    }
    if (params?.limit) {
      query.set('limit', String(params.limit));
    }
    if (params?.offset) {
      query.set('offset', String(params.offset));
    }

    const safeLimit =
      params?.limit === undefined
        ? 24
        : Number.isFinite(params.limit)
          ? Math.max(1, Math.min(100, Math.trunc(params.limit)))
          : 24;
    const safeOffset =
      params?.offset === undefined || !Number.isFinite(params.offset)
        ? 0
        : Math.max(0, Math.trunc(params.offset));
    query.set('limit', String(safeLimit));
    query.set('offset', String(safeOffset));

    const response = await fetch(`${API_URL}/gallery?${query.toString()}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    const data = asRecord(
      await parseResponse(response, 'Failed to load gallery photos.'),
      'gallery page'
    );
    const total = data.total;
    if (typeof total !== 'number' || !Number.isFinite(total) || total < 0) {
      throw new Error('The gallery response contains an invalid total count.');
    }

    return {
      photos: normalizePhotoList(data.photos, 'gallery photos'),
      total,
    };
  },

  // ============================================================
  // GET CURRENT USER'S PHOTOS (MY SUBMISSIONS)
  // ============================================================

  async getMyPhotos(): Promise<GalleryPhoto[]> {
    const response = await fetch(`${API_URL}/gallery/mine`, {
      method: 'GET',
      headers: {

        'Content-Type': 'application/json',
      },
    });

    const data = await parseResponse(response, 'Failed to load your gallery submissions.');
    return normalizePhotoList(data, 'your gallery submissions');
  },

  // ============================================================
  // UPLOAD PHOTO (ALUMNI / ADMIN)
  // ============================================================

  async uploadPhoto(payload: GalleryUploadPayload): Promise<GalleryPhoto> {
    const formData = new FormData();
    formData.append('file', payload.file);
    formData.append('title', payload.title);
    if (payload.description) formData.append('description', payload.description);
    if (payload.category) formData.append('category', payload.category);
    if (payload.event_name) formData.append('event_name', payload.event_name);
    if (payload.batch_year) formData.append('batch_year', payload.batch_year);

    const response = await fetch(`${API_URL}/gallery/upload`, {
      method: 'POST',
      headers: {

      },
      body: formData,
    });

    return normalizePhotoAction(
      await parseResponse(response, 'Failed to upload photo.'),
      'gallery upload'
    );
  },

  // ============================================================
  // ADMIN: GET PHOTOS BY STATUS
  // ============================================================

  async getAdminPhotos(status: string = 'all'): Promise<GalleryPhoto[]> {
    const validStatuses = ['all', 'pending', 'approved', 'rejected'];
    const safeStatus = validStatuses.includes(status) ? status : 'all';
    const response = await fetch(`${API_URL}/gallery/admin?status=${encodeURIComponent(safeStatus)}`, {
      method: 'GET',
      headers: {

        'Content-Type': 'application/json',
      },
    });

    const data = await parseResponse(response, 'Failed to load gallery moderation records.');
    return normalizePhotoList(data, 'gallery moderation records');
  },

  // ============================================================
  // ADMIN: MODERATE PHOTO STATUS
  // ============================================================

  async updatePhotoStatus(
    photoId: string,
    status: 'approved' | 'rejected',
    rejectionReason?: string
  ): Promise<GalleryPhoto> {
    const response = await fetch(`${API_URL}/gallery/${encodeURIComponent(photoId)}/status`, {
      method: 'PATCH',
      headers: {

        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        status,
        rejection_reason: rejectionReason || null,
      }),
    });

    return normalizePhotoAction(
      await parseResponse(response, 'Failed to update photo moderation status.'),
      'photo moderation'
    );
  },

  // ============================================================
  // DELETE PHOTO (OWNER OR ADMIN)
  // ============================================================

  async deletePhoto(photoId: string): Promise<{ message: string }> {
    const response = await fetch(`${API_URL}/gallery/${encodeURIComponent(photoId)}`, {
      method: 'DELETE',
      headers: {

        'Content-Type': 'application/json',
      },
    });

    return normalizeDeleteResult(
      await parseResponse(response, 'Failed to delete photo.')
    );
  },

  // ============================================================
  // GET WATERMARKED IMAGE URL
  // ============================================================

  getImageUrl(photoId: string): string {
    return `${API_URL}/gallery/${encodeURIComponent(photoId)}/image`;
  },
};
