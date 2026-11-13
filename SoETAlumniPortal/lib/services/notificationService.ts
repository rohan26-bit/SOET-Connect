const API_URL = '/api';



type ApiRecord = Record<string, unknown>;

function isRecord(value: unknown): value is ApiRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown, label: string): ApiRecord {
  if (!isRecord(value)) throw new Error('Unexpected ' + label + ' response format.');
  return value;
}

function readString(record: ApiRecord, key: string, label: string): string {
  const value = record[key];
  if (typeof value !== 'string') {
    throw new Error('The ' + label + ' response is missing a valid ' + key + ' value.');
  }
  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function readBoolean(record: ApiRecord, key: string, fallback: boolean, label: string): boolean {
  const value = record[key];
  if (typeof value === 'boolean') return value;
  if (value === undefined || value === null) return fallback;
  throw new Error('The ' + label + ' response contains an invalid ' + key + ' value.');
}

function readNumber(record: ApiRecord, key: string, fallback = 0): number {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function readArrayOfRecords(value: unknown, label: string): ApiRecord[] {
  if (!Array.isArray(value)) {
    throw new Error('Unexpected ' + label + ' response format. Please refresh and try again.');
  }
  return value.map((item, index) => {
    if (!isRecord(item)) {
      throw new Error('The ' + label + ' response contains an invalid item at position ' + (index + 1) + '.');
    }
    return item;
  });
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

async function parseResponse(
  response: Response,
  fallbackMessage = 'Request failed.'
): Promise<unknown> {
  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    // Empty or malformed JSON is handled with a stable fallback message.
  }

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Your session has expired. Please log in again.');
    }
    const detail = errorDetail(data);
    throw new Error(detail === 'Request failed.' ? fallbackMessage : detail);
  }

  return data;
}

function normalizeNotification(value: unknown): NotificationItem {
  const notification = asRecord(value, 'notification');
  return {
    id: readString(notification, 'id', 'notification'),
    user_id: readString(notification, 'user_id', 'notification'),
    title: readString(notification, 'title', 'notification'),
    message: readString(notification, 'message', 'notification'),
    type: optionalString(notification.type),
    link: optionalString(notification.link),
    is_read: readBoolean(notification, 'is_read', false, 'notification'),
    created_at: readString(notification, 'created_at', 'notification'),
    read_at: optionalString(notification.read_at),
    entity_type: optionalString(notification.entity_type),
    entity_id: optionalString(notification.entity_id),
    dedupe_key: optionalString(notification.dedupe_key),
  };
}

function normalizeDelivery(value: unknown): NotificationDeliveryItem {
  const delivery = asRecord(value, 'notification delivery');
  const channel = delivery.channel;
  const status = delivery.status;
  if (channel !== 'email' && channel !== 'sms' && channel !== 'in_app') {
    throw new Error('The notification delivery response contains an unsupported channel.');
  }
  if (
    status !== 'accepted' &&
    status !== 'sent' &&
    status !== 'delivered' &&
    status !== 'skipped' &&
    status !== 'failed' &&
    status !== 'pending'
  ) {
    throw new Error('The notification delivery response contains an unsupported status.');
  }

  return {
    id: readString(delivery, 'id', 'notification delivery'),
    notification_id: optionalString(delivery.notification_id),
    user_id: readString(delivery, 'user_id', 'notification delivery'),
    channel,
    status,
    provider: optionalString(delivery.provider),
    recipient: optionalString(delivery.recipient),
    error_message: optionalString(delivery.error_message),
    created_at: readString(delivery, 'created_at', 'notification delivery'),
  };
}

function normalizePreferences(value: unknown): NotificationPreferences {
  const result = asRecord(value, 'notification preferences');
  const preferences = isRecord(result.preferences) ? result.preferences : result;
  const providers = isRecord(result.providers_configured) ? result.providers_configured : {};
  const emailConfigured = optionalBoolean(providers.email) ?? optionalBoolean(result.is_email_configured);
  const smsConfigured = optionalBoolean(providers.sms) ?? optionalBoolean(result.is_sms_configured);

  return {
    user_id: optionalString(preferences.user_id),
    email_enabled: readBoolean(preferences, 'email_enabled', true, 'notification preferences'),
    sms_enabled: readBoolean(preferences, 'sms_enabled', false, 'notification preferences'),
    in_app_enabled: readBoolean(preferences, 'in_app_enabled', true, 'notification preferences'),
    notify_jobs: readBoolean(preferences, 'notify_jobs', true, 'notification preferences'),
    notify_events: readBoolean(preferences, 'notify_events', true, 'notification preferences'),
    notify_announcements: readBoolean(preferences, 'notify_announcements', true, 'notification preferences'),
    notify_applications: readBoolean(preferences, 'notify_applications', true, 'notification preferences'),
    notify_gallery: readBoolean(preferences, 'notify_gallery', true, 'notification preferences'),
    phone: optionalString(result.phone) || optionalString(preferences.phone),
    is_phone_verified: optionalBoolean(result.is_phone_verified),
    is_email_configured: emailConfigured,
    is_sms_configured: smsConfigured,
    providers_configured:
      emailConfigured !== undefined && smsConfigured !== undefined
        ? { email: emailConfigured, sms: smsConfigured }
        : undefined,
  };
}

export interface NotificationActionResult {
  message: string;
  notification: NotificationItem;
}

export interface NotificationCountResult {
  message: string;
  updated_count: number;
}

function normalizeReadResult(value: unknown): NotificationActionResult {
  const result = asRecord(value, 'mark-read action');
  return {
    message: readString(result, 'message', 'mark-read action'),
    notification: normalizeNotification(result.notification),
  };
}

function normalizeCountResult(value: unknown): NotificationCountResult {
  const result = asRecord(value, 'mark-all-read action');
  return {
    message: readString(result, 'message', 'mark-all-read action'),
    updated_count: readNumber(result, 'updated_count'),
  };
}

export interface NotificationItem {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type?: string;
  link?: string;
  is_read: boolean;
  created_at: string;
  read_at?: string;
  entity_type?: string;
  entity_id?: string;
  dedupe_key?: string;
}

export interface NotificationPreferences {
  user_id?: string;
  email_enabled: boolean;
  sms_enabled: boolean;
  in_app_enabled: boolean;
  notify_jobs: boolean;
  notify_events: boolean;
  notify_announcements: boolean;
  notify_applications: boolean;
  notify_gallery: boolean;
  phone?: string;
  is_phone_verified?: boolean;
  is_email_configured?: boolean;
  is_sms_configured?: boolean;
  providers_configured?: {
    email: boolean;
    sms: boolean;
  };
}

export type NotificationPreferencesUpdate = Partial<
  Pick<
    NotificationPreferences,
    | 'email_enabled'
    | 'sms_enabled'
    | 'in_app_enabled'
    | 'notify_jobs'
    | 'notify_events'
    | 'notify_announcements'
    | 'notify_applications'
    | 'notify_gallery'
  >
>;

export interface NotificationDeliveryItem {
  id: string;
  notification_id?: string;
  user_id: string;
  channel: 'email' | 'sms' | 'in_app';
  status: 'accepted' | 'sent' | 'delivered' | 'skipped' | 'failed' | 'pending';
  provider?: string;
  recipient?: string;
  error_message?: string;
  created_at: string;
}

function newestFirst<T extends { created_at?: string | null }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const aTime = Date.parse(a.created_at || '');
    const bTime = Date.parse(b.created_at || '');
    return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0);
  });
}

export const notificationService = {
  // ============================================================
  // GET ALL NOTIFICATIONS
  // ============================================================

  async getNotifications(_userId?: string): Promise<NotificationItem[]> {
    // Preserve the legacy argument; the API scopes results to the authenticated session.
    void _userId;
    const response = await fetch(`${API_URL}/notifications`, {
      method: 'GET',
      headers: {

        'Content-Type': 'application/json',
      },
    });

    const data = await parseResponse(response, 'Failed to load notifications.');
    return newestFirst(readArrayOfRecords(data, 'notifications').map(normalizeNotification));
  },

  // ============================================================
  // MARK A SINGLE NOTIFICATION AS READ
  // ============================================================

  async markAsRead(notificationId: string): Promise<NotificationActionResult> {
    const response = await fetch(
      `${API_URL}/notifications/${encodeURIComponent(notificationId)}/read`,
      {
        method: 'PATCH',
        headers: {

          'Content-Type': 'application/json',
        },
      }
    );

    return normalizeReadResult(
      await parseResponse(response, 'Failed to mark notification as read.')
    );
  },

  // ============================================================
  // MARK ALL NOTIFICATIONS AS READ
  // ============================================================

  async markAllAsRead(_userId?: string): Promise<NotificationCountResult> {
    // Preserve the legacy argument; the API scopes updates to the authenticated session.
    void _userId;
    const response = await fetch(`${API_URL}/notifications/read-all`, {
      method: 'PATCH',
      headers: {

        'Content-Type': 'application/json',
      },
    });

    return normalizeCountResult(
      await parseResponse(response, 'Failed to mark notifications as read.')
    );
  },

  // ============================================================
  // GET PREFERENCES
  // ============================================================

  async getPreferences(): Promise<NotificationPreferences> {
    const response = await fetch(`${API_URL}/notifications/preferences`, {
      method: 'GET',
      headers: {

        'Content-Type': 'application/json',
      },
    });

    return normalizePreferences(
      await parseResponse(response, 'Failed to load notification preferences.')
    );
  },

  // ============================================================
  // UPDATE PREFERENCES
  // ============================================================

  async updatePreferences(prefs: NotificationPreferencesUpdate): Promise<NotificationPreferences> {
    const response = await fetch(`${API_URL}/notifications/preferences`, {
      method: 'PUT',
      headers: {

        'Content-Type': 'application/json',
      },
      body: JSON.stringify(prefs),
    });

    return normalizePreferences(
      await parseResponse(response, 'Failed to update notification preferences.')
    );
  },

  // ============================================================
  // GET DELIVERIES (AUDIT TRAIL)
  // ============================================================

  async getDeliveries(limit: number = 20): Promise<NotificationDeliveryItem[]> {
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(100, Math.trunc(limit))) : 20;
    const response = await fetch(`${API_URL}/notifications/deliveries?limit=${safeLimit}`, {
      method: 'GET',
      headers: {

        'Content-Type': 'application/json',
      },
    });

    const data = await parseResponse(response, 'Failed to load notification deliveries.');
    return readArrayOfRecords(data, 'notification deliveries')
      .map(normalizeDelivery)
      .slice(0, safeLimit);
  },
};
