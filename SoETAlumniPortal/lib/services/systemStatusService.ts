export interface SystemStatus {
  api: 'healthy' | 'unavailable';
  database: 'connected' | 'disconnected';
  environment?: string;
  checkedAt: string;
}

const API_URL = '/api';

export const systemStatusService = {
  /**
   * Fetch current backend and database operational status from /api/health.
   */
  async getStatus(): Promise<SystemStatus> {
    try {
      const response = await fetch(`${API_URL}/health`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
      });

      if (!response.ok) {
        return {
          api: 'unavailable',
          database: 'disconnected',
          environment: 'production',
          checkedAt: new Date().toISOString(),
        };
      }

      const data = await response.json();
      return {
        api: data.api === 'healthy' ? 'healthy' : 'unavailable',
        database: data.database === 'connected' ? 'connected' : 'disconnected',
        environment: data.environment || 'production',
        checkedAt: new Date().toISOString(),
      };
    } catch {
      return {
        api: 'unavailable',
        database: 'disconnected',
        environment: 'unknown',
        checkedAt: new Date().toISOString(),
      };
    }
  },
};
