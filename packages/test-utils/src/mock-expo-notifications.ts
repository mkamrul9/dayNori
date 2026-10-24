export enum AndroidImportance {
  UNKNOWN = 0,
  MIN = 1,
  LOW = 2,
  DEFAULT = 3,
  HIGH = 4,
  MAX = 5,
}

export enum SchedulableTriggerInputTypes {
  CALENDAR = 'calendar',
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
  YEARLY = 'yearly',
  DATE = 'date',
  TIME_INTERVAL = 'timeInterval',
}

export interface MockNotificationRequest {
  identifier: string;
  content: {
    title?: string | null;
    body?: string | null;
    data?: Record<string, unknown>;
    sound?: boolean | string;
  };
  trigger: unknown;
}

export interface MockNotificationResponse {
  notification: {
    request: MockNotificationRequest;
  };
  actionIdentifier: string;
  userText?: string;
}

let mockPermissions = {
  status: 'undetermined' as 'granted' | 'denied' | 'undetermined',
  granted: false,
  canAskAgain: true,
  expires: 'never',
};

const scheduledNotifications = new Map<string, MockNotificationRequest>();
const notificationChannels = new Map<string, Record<string, unknown>>();
const responseListeners = new Set<(response: MockNotificationResponse) => void>();
let lastNotificationResponse: MockNotificationResponse | null = null;
let mockPushToken: string | null = null;

export const scheduleNotificationAsync = async (request: {
  content: {
    title?: string | null;
    body?: string | null;
    data?: Record<string, unknown>;
    sound?: boolean | string;
  };
  trigger: unknown;
}): Promise<string> => {
  const id = `mock-notif-${Math.random().toString(36).substring(2, 9)}`;
  scheduledNotifications.set(id, {
    identifier: id,
    content: request.content,
    trigger: request.trigger,
  });
  return id;
};

export const cancelScheduledNotificationAsync = async (identifier: string): Promise<void> => {
  scheduledNotifications.delete(identifier);
};

export const cancelAllScheduledNotificationsAsync = async (): Promise<void> => {
  scheduledNotifications.clear();
};

export const getAllScheduledNotificationsAsync = async (): Promise<MockNotificationRequest[]> => {
  return Array.from(scheduledNotifications.values());
};

export const setNotificationChannelAsync = async (
  channelId: string,
  channel: Record<string, unknown>
): Promise<Record<string, unknown>> => {
  notificationChannels.set(channelId, { id: channelId, ...channel });
  return notificationChannels.get(channelId)!;
};

export const getNotificationChannelAsync = async (
  channelId: string
): Promise<Record<string, unknown> | null> => {
  return notificationChannels.get(channelId) ?? null;
};

export const getNotificationChannelsAsync = async (): Promise<Record<string, unknown>[]> => {
  return Array.from(notificationChannels.values());
};

export const deleteNotificationChannelAsync = async (channelId: string): Promise<void> => {
  notificationChannels.delete(channelId);
};

export const getPermissionsAsync = async () => {
  return { ...mockPermissions };
};

export const requestPermissionsAsync = async () => {
  // If undetermined, grant by default for mock unless configured
  if (mockPermissions.status === 'undetermined') {
    mockPermissions = {
      status: 'granted',
      granted: true,
      canAskAgain: true,
      expires: 'never',
    };
  }
  return { ...mockPermissions };
};

export const setNotificationHandler = (_handler: unknown) => {
  // no-op in mock
};

export const addNotificationResponseReceivedListener = (
  listener: (response: MockNotificationResponse) => void
) => {
  responseListeners.add(listener);
  return {
    remove: () => {
      responseListeners.delete(listener);
    },
  };
};

export const getLastNotificationResponseAsync = async (): Promise<MockNotificationResponse | null> => {
  return lastNotificationResponse;
};

export const getExpoPushTokenAsync = async (_options?: { projectId?: string }): Promise<{ data: string; type: 'expo' }> => {
  if (!mockPushToken) {
    throw new Error('Push token unavailable: No push provider credentials configured in environment');
  }
  return { data: mockPushToken, type: 'expo' };
};

export const getDevicePushTokenAsync = async (): Promise<{ data: string; type: string }> => {
  if (!mockPushToken) {
    throw new Error('Device push token unavailable: FCM service not connected');
  }
  return { data: mockPushToken, type: 'fcm' };
};

// --- Test control helpers ---
export const __mockNotificationControls = {
  reset: () => {
    mockPermissions = {
      status: 'undetermined',
      granted: false,
      canAskAgain: true,
      expires: 'never',
    };
    scheduledNotifications.clear();
    notificationChannels.clear();
    responseListeners.clear();
    lastNotificationResponse = null;
    mockPushToken = null;
  },
  setPermission: (status: 'granted' | 'denied' | 'undetermined', canAskAgain = true) => {
    mockPermissions = {
      status,
      granted: status === 'granted',
      canAskAgain,
      expires: 'never',
    };
  },
  setPushToken: (token: string | null) => {
    mockPushToken = token;
  },
  simulateNotificationResponse: (response: MockNotificationResponse) => {
    lastNotificationResponse = response;
    for (const listener of responseListeners) {
      listener(response);
    }
  },
  getScheduledCount: () => scheduledNotifications.size,
  getScheduledMap: () => scheduledNotifications,
};
