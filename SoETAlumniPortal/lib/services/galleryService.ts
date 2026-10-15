const API_URL = '/api';

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
    if (response.status === 401) {
      throw new Error('Your session has expired. Please log in again.');
    }
    const detail =
      typeof data.detail === 'string'
        ? data.detail
        : JSON.stringify(data.detail || 'Request failed.');
    throw new Error(detail);
  }
  return data;
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

    const token = typeof window !== 'undefined' ? localStorage.getItem('soet_access_token') : null;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(`${API_URL}/gallery?${query.toString()}`, {
      method: 'GET',
      headers,
    });

    const data = await parseResponse(response);
    return {
      photos: Array.isArray(data.photos) ? data.photos : [],
      total: data.total || 0,
    };
  },

  // ============================================================
  // GET CURRENT USER'S PHOTOS (MY SUBMISSIONS)
  // ============================================================

  async getMyPhotos(): Promise<GalleryPhoto[]> {
    const response = await fetch(`${API_URL}/gallery/mine`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${getToken()}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await parseResponse(response);
    return Array.isArray(data) ? data : [];
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
        Authorization: `Bearer ${getToken()}`,
      },
      body: formData,
    });

    return await parseResponse(response);
  },

  // ============================================================
  // ADMIN: GET PHOTOS BY STATUS
  // ============================================================

  async getAdminPhotos(status: string = 'all'): Promise<GalleryPhoto[]> {
    const response = await fetch(`${API_URL}/gallery/admin?status=${status}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${getToken()}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await parseResponse(response);
    return Array.isArray(data) ? data : [];
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
        Authorization: `Bearer ${getToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        status,
        rejection_reason: rejectionReason || null,
      }),
    });

    return await parseResponse(response);
  },

  // ============================================================
  // DELETE PHOTO (OWNER OR ADMIN)
  // ============================================================

  async deletePhoto(photoId: string): Promise<{ message: string }> {
    const response = await fetch(`${API_URL}/gallery/${encodeURIComponent(photoId)}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${getToken()}`,
        'Content-Type': 'application/json',
      },
    });

    return await parseResponse(response);
  },

  // ============================================================
  // GET WATERMARKED IMAGE URL
  // ============================================================

  getImageUrl(photoId: string): string {
    return `${API_URL}/gallery/${encodeURIComponent(photoId)}/image`;
  },
};
