export interface SystemStatus {
  api: 'healthy' | 'unavailable';
  database: 'connected' | 'disconnected';
  environment?: string;
  checkedAt: string;
}

const API_URL = '/api';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function unavailableStatus(environment = 'unknown'): SystemStatus {
  return {
    api: 'unavailable',
    database: 'disconnected',
    environment,
    checkedAt: new Date().toISOString(),
  };
}

function normalizeSystemStatus(value: unknown): SystemStatus {
  if (!isRecord(value)) return unavailableStatus();

  return {
    api: value.api === 'healthy' ? 'healthy' : 'unavailable',
    database: value.database === 'connected' ? 'connected' : 'disconnected',
    environment:
      typeof value.environment === 'string' && value.environment.trim()
        ? value.environment.trim()
        : 'unknown',
    checkedAt: new Date().toISOString(),
  };
}

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
        return unavailableStatus('production');
      }

      let data: unknown;
      try {
        data = await response.json();
      } catch {
        return unavailableStatus();
      }

      return normalizeSystemStatus(data);
    } catch {
      return unavailableStatus();
    }
  },
};
