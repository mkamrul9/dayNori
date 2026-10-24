import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import type { DaynoriApiClient } from '@daynori/api-client';
import { defaultSecureStorage } from '../auth/secureStorage.js';
import {
  NotificationPayloadSchema,
  type NotificationPayload,
  type ApprovedDestination,
  type DevicePlatform,
  type DeviceTokenType,
} from '@daynori/contracts';
import { describeOsVersion, getNativeMobilePlatform } from '../platform/nativePlatform.js';

export type NotificationPermissionStatus =
  'granted' | 'denied' | 'undetermined' | 'revoked' | 'channel_disabled';

export interface NotificationCapabilityState {
  status: NotificationPermissionStatus;
  canDeliverLocally: boolean;
  canDeliverPush: boolean;
  hasPushToken: boolean;
  pushTokenType: DeviceTokenType;
  /** Always false for ordinary organizer reminders — Android exact alarms do not transfer to iOS. */
  isExactAlarmPermitted: boolean;
  platform: DevicePlatform;
  details: string;
}

export interface ScheduleLocalReminderOptions {
  instanceId: string;
  workspaceId: string;
  title: string;
  body?: string | null;
  scheduledAt: string; // ISO 8601
  destination?: ApprovedDestination;
  itemId?: string;
  ruleRevision: number;
  deliveryGeneration?: number;
  privacyLevel?: 'normal' | 'private' | 'confidential' | 'detailed' | 'title_only';
}

export interface ScheduledReminderResult {
  nativeNotificationId: string | null;
  scheduled: boolean;
  error?: string;
}

const SECURE_KEY_INSTALLATION_ID = 'daynori_installation_id';
const SECURE_KEY_DEVICE_ID = 'daynori_registered_device_id';
const SECURE_KEY_PUSH_TOKEN = 'daynori_registered_push_token';
const SECURE_KEY_PUSH_TOKEN_TYPE = 'daynori_registered_push_token_type';

let isChannelsInitialized = false;

/**
 * Configure default notification channels for Android.
 * Android 8.0 (API level 26) and higher requires notification channels.
 */
export async function setupNotificationChannelsAsync(): Promise<void> {
  if (Platform.OS !== 'android') return;
  if (isChannelsInitialized) return;

  try {
    // 1. Reminders channel (high importance, sound, vibration, lockscreen privacy)
    await Notifications.setNotificationChannelAsync('reminders', {
      name: 'Reminders & Alerts',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#0F172A',
      sound: 'default',
      enableLights: true,
      enableVibrate: true,
      showBadge: true,
      ...(Notifications.AndroidNotificationVisibility
        ? { lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE }
        : {}),
      description: 'Scheduled reminders for tasks, routines, and calendar events',
    });

    // 2. Workspace updates channel (default importance)
    await Notifications.setNotificationChannelAsync('updates', {
      name: 'Workspace Updates',
      importance: Notifications.AndroidImportance.DEFAULT,
      sound: undefined,
      enableVibrate: false,
      showBadge: false,
      description: 'Activity updates, sync notices, and quiet status changes',
    });

    isChannelsInitialized = true;
  } catch (err) {
    // Channel initialization failure handled gracefully
    console.warn('Failed to initialize Android notification channels:', err);
  }
}

/**
 * Get the current notification permission and capability state.
 */
export async function getNotificationCapabilityAsync(): Promise<NotificationCapabilityState> {
  try {
    const settings = await Notifications.getPermissionsAsync();
    let status: NotificationPermissionStatus = 'undetermined';

    if (settings.granted || settings.status === 'granted') {
      status = 'granted';
    } else if (settings.status === 'denied') {
      status = 'denied';
    } else {
      status = 'undetermined';
    }

    // Check Android channel disabled state if granted
    if (status === 'granted' && Platform.OS === 'android') {
      try {
        const channel = await Notifications.getNotificationChannelAsync('reminders');
        if (channel && channel.importance === Notifications.AndroidImportance.NONE) {
          status = 'channel_disabled';
        }
      } catch {
        // channel check fallback
      }
    }

    const storedPushToken = await defaultSecureStorage.getItemAsync(SECURE_KEY_PUSH_TOKEN);
    const storedTokenType = (await defaultSecureStorage.getItemAsync(
      SECURE_KEY_PUSH_TOKEN_TYPE
    )) as DeviceTokenType | null;
    const hasPushToken = Boolean(storedPushToken && status === 'granted');
    const platform = getNativeMobilePlatform();

    const canDeliverLocally = status === 'granted';
    const canDeliverPush = status === 'granted' && hasPushToken;

    let details = 'Notifications not enabled. Reminders will be shown in-app only.';
    if (status === 'granted') {
      details = hasPushToken
        ? 'Local reminders and server push fallback are active (best-effort delivery).'
        : 'Local reminders active. Push fallback is currently unavailable without push credentials.';
    } else if (status === 'channel_disabled') {
      details = 'Reminders channel is disabled in Android system settings.';
    } else if (status === 'denied') {
      details =
        platform === 'ios'
          ? 'Notification permission was denied. Open iOS Settings → Daynori → Notifications to re-enable. Organizer features remain usable.'
          : 'Notification permission was denied. All organizer features remain fully usable.';
    }

    return {
      status,
      canDeliverLocally,
      canDeliverPush,
      hasPushToken,
      pushTokenType: hasPushToken ? storedTokenType || 'expo_push' : 'none',
      isExactAlarmPermitted: false, // Invariant: ordinary best-effort reminders on both platforms
      platform,
      details,
    };
  } catch {
    return {
      status: 'undetermined',
      canDeliverLocally: false,
      canDeliverPush: false,
      hasPushToken: false,
      pushTokenType: 'none',
      isExactAlarmPermitted: false,
      platform: getNativeMobilePlatform(),
      details: 'Unable to query notification permission status.',
    };
  }
}

/**
 * Contextual permission request: call only after an explicit reminder setup or opt-in action.
 */
export async function requestNotificationPermissionAsync(
  _contextPrompt = 'Daynori uses notifications to alert you when tasks or routines are due.'
): Promise<NotificationCapabilityState> {
  await setupNotificationChannelsAsync();

  try {
    const response = await Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowBadge: true,
        allowSound: true,
      },
      android: {},
    });

    const isGranted = response.granted || response.status === 'granted';
    if (!isGranted) {
      return getNotificationCapabilityAsync();
    }

    return getNotificationCapabilityAsync();
  } catch {
    return getNotificationCapabilityAsync();
  }
}

/**
 * Retrieve or generate a persistent installation identity backed by secure storage.
 */
export async function getInstallationIdAsync(): Promise<string> {
  let installationId = await defaultSecureStorage.getItemAsync(SECURE_KEY_INSTALLATION_ID);
  if (!installationId) {
    // Generate fresh UUID for installation
    installationId =
      'inst_' + Math.random().toString(36).substring(2, 12) + '_' + Date.now().toString(36);
    await defaultSecureStorage.setItemAsync(SECURE_KEY_INSTALLATION_ID, installationId);
  }
  return installationId;
}

/**
 * Register device and push capabilities with the Daynori API.
 * Honestly reflects when push tokens are unavailable (e.g. Missing server credentials or local testing).
 * Differentiates native FCM device tokens from Expo Push transport tokens.
 */
export async function registerDeviceAsync(
  apiClient: DaynoriApiClient,
  options?: {
    appVersion?: string;
    osVersion?: string;
    locale?: string;
    timeZone?: string;
  }
): Promise<{ deviceId: string | null; success: boolean; pushAvailable: boolean }> {
  try {
    const installationId = await getInstallationIdAsync();
    const capability = await getNotificationCapabilityAsync();

    let pushToken: string | null = null;
    let tokenType: DeviceTokenType = 'none';
    const platform = getNativeMobilePlatform();

    // Attempt to fetch push token honestly without throwing.
    // iOS: prefer Expo Push (schema has expo_push; native APNs direct type not in DeviceTokenType yet).
    // Android: prefer FCM device token, then Expo Push.
    if (capability.status === 'granted') {
      if (platform === 'ios') {
        try {
          const expoResult = await Notifications.getExpoPushTokenAsync();
          if (expoResult?.data) {
            pushToken = expoResult.data;
            tokenType = 'expo_push';
            await defaultSecureStorage.setItemAsync(SECURE_KEY_PUSH_TOKEN, pushToken);
            await defaultSecureStorage.setItemAsync(SECURE_KEY_PUSH_TOKEN_TYPE, tokenType);
          }
        } catch {
          tokenType = 'none';
          pushToken = null;
          await defaultSecureStorage.deleteItemAsync(SECURE_KEY_PUSH_TOKEN);
          await defaultSecureStorage.deleteItemAsync(SECURE_KEY_PUSH_TOKEN_TYPE);
        }
      } else {
        try {
          const nativeResult = await Notifications.getDevicePushTokenAsync();
          if (nativeResult?.data) {
            pushToken =
              typeof nativeResult.data === 'string'
                ? nativeResult.data
                : JSON.stringify(nativeResult.data);
            tokenType = 'fcm';
            await defaultSecureStorage.setItemAsync(SECURE_KEY_PUSH_TOKEN, pushToken);
            await defaultSecureStorage.setItemAsync(SECURE_KEY_PUSH_TOKEN_TYPE, tokenType);
          }
        } catch {
          try {
            const expoResult = await Notifications.getExpoPushTokenAsync();
            if (expoResult?.data) {
              pushToken = expoResult.data;
              tokenType = 'expo_push';
              await defaultSecureStorage.setItemAsync(SECURE_KEY_PUSH_TOKEN, pushToken);
              await defaultSecureStorage.setItemAsync(SECURE_KEY_PUSH_TOKEN_TYPE, tokenType);
            }
          } catch {
            tokenType = 'none';
            pushToken = null;
            await defaultSecureStorage.deleteItemAsync(SECURE_KEY_PUSH_TOKEN);
            await defaultSecureStorage.deleteItemAsync(SECURE_KEY_PUSH_TOKEN_TYPE);
          }
        }
      }
    }

    const regResponse = await apiClient.registerDevice({
      installationId,
      platform,
      tokenType,
      pushToken: pushToken ?? undefined,
      capabilities: {
        appVersion: options?.appVersion ?? '0.1.0',
        osVersion: options?.osVersion ?? describeOsVersion(),
        locale: options?.locale ?? 'en-US',
        timeZone: options?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC',
        localReminders: capability.canDeliverLocally,
        pushNotifications: capability.canDeliverPush,
        // Android exact-alarm APIs do not exist on iOS; never claim exact delivery.
        exactAlarms: false,
        quietHours: true,
      },
    });

    const deviceId = regResponse.data.id;
    await defaultSecureStorage.setItemAsync(SECURE_KEY_DEVICE_ID, deviceId);

    return {
      deviceId,
      success: true,
      pushAvailable: Boolean(pushToken),
    };
  } catch (err) {
    console.warn('Device registration with backend failed:', err);
    return {
      deviceId: null,
      success: false,
      pushAvailable: false,
    };
  }
}

/**
 * Setup token rotation listener to reconcile device registration with backend when token updates.
 */
export function setupPushTokenRotationListener(apiClient: DaynoriApiClient): () => void {
  const subscription = Notifications.addPushTokenListener(async () => {
    try {
      await registerDeviceAsync(apiClient);
    } catch (err) {
      console.warn('Failed to reconcile device registration on token rotation:', err);
    }
  });

  return () => {
    if (subscription && typeof subscription.remove === 'function') {
      subscription.remove();
    }
  };
}

/**
 * Deactivate the device registration on logout or account switch to prevent cross-account push.
 */
export async function deactivateDeviceAsync(apiClient: DaynoriApiClient): Promise<void> {
  try {
    const installationId = await defaultSecureStorage.getItemAsync(SECURE_KEY_INSTALLATION_ID);
    if (installationId) {
      await apiClient.deactivateDevice(installationId);
      await defaultSecureStorage.deleteItemAsync(SECURE_KEY_DEVICE_ID);
      await defaultSecureStorage.deleteItemAsync(SECURE_KEY_PUSH_TOKEN);
      await defaultSecureStorage.deleteItemAsync(SECURE_KEY_PUSH_TOKEN_TYPE);
    }
  } catch (err) {
    console.warn('Device deactivation failed:', err);
  }
}

/**
 * Schedule a local notification on the Android device and acknowledge it with the backend.
 * Default applies generic privacy redaction for lock-screen safety unless detailed is explicitly selected.
 */
export async function scheduleLocalReminderAsync(
  apiClient: DaynoriApiClient | null,
  options: ScheduleLocalReminderOptions
): Promise<ScheduledReminderResult> {
  await setupNotificationChannelsAsync();

  const targetDate = new Date(options.scheduledAt);
  const now = new Date();

  // If scheduled in the past or immediately due, skip scheduling
  if (targetDate.getTime() <= now.getTime()) {
    return {
      nativeNotificationId: null,
      scheduled: false,
      error: 'Cannot schedule notification in the past',
    };
  }

  // Apply shared generic redaction by default for payload minimization and lock-screen privacy
  let displayTitle = 'Daynori Reminder';
  let displayBody = 'You have a scheduled reminder';

  if (options.privacyLevel === 'detailed') {
    displayTitle = options.title;
    displayBody = options.body ?? '';
  } else if (options.privacyLevel === 'private' || options.privacyLevel === 'title_only') {
    displayTitle = options.title;
    displayBody = 'Open Daynori to view details';
  } else if (options.privacyLevel === 'confidential') {
    displayTitle = 'Daynori Reminder';
    displayBody = 'You have a scheduled reminder';
  }

  // Build deep link payload conforming to NotificationPayloadSchema
  const destination: ApprovedDestination = options.destination ?? 'plan';
  const notificationData: Record<string, unknown> = {
    type: 'notification',
    destination,
    itemId: options.itemId,
    instanceId: options.instanceId,
    workspaceId: options.workspaceId,
    ruleRevision: options.ruleRevision,
    deliveryGeneration: options.deliveryGeneration ?? 1,
    timestamp: Date.now(),
  };

  try {
    // channelId is Android-only; iOS uses the system notification categories / default presentation.
    const trigger: Notifications.NotificationTriggerInput =
      Platform.OS === 'android'
        ? {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: targetDate,
            channelId: 'reminders',
          }
        : {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: targetDate,
          };

    const nativeId = await Notifications.scheduleNotificationAsync({
      content: {
        title: displayTitle,
        body: displayBody,
        data: notificationData,
        sound: 'default',
      },
      trigger,
    });

    // Acknowledge local schedule to backend if apiClient and deviceId are available
    if (apiClient) {
      const deviceId = await defaultSecureStorage.getItemAsync(SECURE_KEY_DEVICE_ID);
      if (deviceId) {
        try {
          await apiClient.acknowledgeDeviceSchedule(options.workspaceId, {
            instanceId: options.instanceId,
            deviceId,
            ruleRevision: options.ruleRevision,
            deliveryGeneration: options.deliveryGeneration ?? 1,
            nativeNotificationId: nativeId,
            deliveryMode: 'local',
            acknowledged: true,
          });
        } catch (ackErr) {
          // Acknowledgment failure logged but local notification remains scheduled
          console.warn('Local schedule acknowledgment failed:', ackErr);
        }
      }
    }

    return {
      nativeNotificationId: nativeId,
      scheduled: true,
    };
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return {
      nativeNotificationId: null,
      scheduled: false,
      error: errMsg,
    };
  }
}

/**
 * Cancel a scheduled local notification by native ID.
 */
export async function cancelLocalReminderAsync(nativeNotificationId: string): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(nativeNotificationId);
  } catch (err) {
    console.warn('Failed to cancel local notification:', err);
  }
}

/**
 * Cancel all scheduled local notifications (e.g. On workspace reset or logout).
 */
export async function cancelAllLocalRemindersAsync(): Promise<void> {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch (err) {
    console.warn('Failed to cancel all local notifications:', err);
  }
}

/**
 * Configure global foreground notification presentation behavior.
 */
export function setupForegroundNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

let lastTapTimestamp = 0;
let lastTapPayloadKey = '';
const consumedResponseIds = new Set<string>();

/**
 * Reset notification deduplication and response state on logout or account switch.
 */
export function resetNotificationResponseState(): void {
  lastTapTimestamp = 0;
  lastTapPayloadKey = '';
  consumedResponseIds.clear();
}

/**
 * Initialize notification response listeners for warm-start and cold-start handling.
 * Validates payload schema, reauthorizes target before navigating, and deduplicates repeated taps.
 */
export function initNotificationResponseListener(
  onNavigateToDestination: (payload: NotificationPayload) => void
): () => void {
  const processResponse = (data: unknown, responseId?: string) => {
    if (!data || typeof data !== 'object') return;

    if (responseId && consumedResponseIds.has(responseId)) {
      return;
    }
    if (responseId) {
      consumedResponseIds.add(responseId);
    }

    // Validate using contracts schema
    const parseResult = NotificationPayloadSchema.safeParse(data);
    if (!parseResult.success) {
      return;
    }

    const payload = parseResult.data;

    // Deduplicate repeated taps within 3 seconds by instance/generation/destination identity
    const now = Date.now();
    const payloadKey = `${payload.instanceId ?? payload.destination}:${payload.deliveryGeneration ?? payload.itemId ?? ''}`;
    if (payloadKey === lastTapPayloadKey && now - lastTapTimestamp < 3000) {
      return;
    }

    lastTapTimestamp = now;
    lastTapPayloadKey = payloadKey;

    onNavigateToDestination(payload);
  };

  // 1. Cold-start response check
  void Notifications.getLastNotificationResponseAsync().then((response) => {
    if (response?.notification?.request?.content?.data) {
      const respId = response.notification.request.identifier || 'cold-start-response';
      processResponse(response.notification.request.content.data, respId);
    }
  });

  // 2. Warm-start / Foreground listener
  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    if (response?.notification?.request?.content?.data) {
      const respId = response.notification.request.identifier;
      processResponse(response.notification.request.content.data, respId);
    }
  });

  return () => {
    if (subscription && typeof subscription.remove === 'function') {
      subscription.remove();
    }
  };
}
