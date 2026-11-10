const API_URL = '/api';

export { API_URL };

/**
 * Clears non-secret cached user details and removes tokens left by older releases.
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
    if (currentPath.startsWith('/login') || currentPath.startsWith('/register')) return;
    const query = reason === 'expired' ? '?expired=1' : '';
    window.location.href = `/login${query}`;
  }
}

/**
 * Standard headers for cookie-authenticated JSON requests.
 * The access token is intentionally unreadable to client JavaScript.
 */
export function getAuthHeaders(): Record<string, string> {
  return { 'Content-Type': 'application/json' };
}

/**
 * Centralized response handler for authenticated API requests.
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
