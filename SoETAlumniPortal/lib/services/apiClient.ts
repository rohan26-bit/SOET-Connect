const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

export { API_URL };

/**
 * Completely clears the stored authentication session and notifies listeners.
 */
export function clearAuthSession(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('soet_access_token');
    localStorage.removeItem('soet_user');
    window.dispatchEvent(new Event('soet:auth-expired'));
  }
}

/**
 * Redirects the user to the login page upon session expiry without entering redirect loops.
 */
export function redirectToLogin(reason: 'expired' | 'unauthorized' = 'expired'): void {
  clearAuthSession();

  if (typeof window !== 'undefined') {
    const currentPath = window.location.pathname;

    // Avoid infinite redirect loops if already navigating/viewing login or registration pages
    if (currentPath.startsWith('/login') || currentPath.startsWith('/register')) {
      return;
    }

    const query = reason === 'expired' ? '?expired=1' : '';
    window.location.href = `/login${query}`;
  }
}

/**
 * Retrieves the current access token. If missing, triggers a session reset and throws.
 */
export function getAuthToken(): string {
  const token = typeof window !== 'undefined' ? localStorage.getItem('soet_access_token') : null;

  if (!token) {
    redirectToLogin('expired');
    throw new Error('Your session has expired. Please log in again.');
  }

  return token;
}

/**
 * Produces standard headers for authenticated JSON requests.
 */
export function getAuthHeaders(): Record<string, string> {
  const token = getAuthToken();

  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

/**
 * Centralized response handler for API requests:
 * - 401 Unauthorized: Clears credentials, redirects to /login?expired=1, throws clean session error.
 * - 403 Forbidden: Preserves credentials and surfaces the backend permission error without logging out.
 * - Other !ok statuses: Surfaces the backend error detail.
 * - 2xx Success: Returns parsed JSON data.
 */
export async function handleApiResponse<T = any>(response: Response): Promise<T> {
  if (response.status === 401) {
    redirectToLogin('expired');
    throw new Error('Your session has expired. Please log in again.');
  }

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
