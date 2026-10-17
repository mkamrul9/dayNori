import type { DaynoriApiClient } from '@daynori/api-client';

export type WebPushPermissionState = 'granted' | 'denied' | 'default' | 'unsupported';

export interface WebPushCapabilityState {
  isSupported: boolean;
  isSecureContext: boolean;
  permission: WebPushPermissionState;
  isSubscribed: boolean;
  endpoint: string | null;
  canSubscribe: boolean;
  statusDetails: string;
}

/**
 * Converts a base64 or URL-safe base64 string to a Uint8Array for PushManager subscription.
 */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = typeof atob !== 'undefined' ? atob(base64) : Buffer.from(base64, 'base64').toString('binary');
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Converts an ArrayBuffer to a base64url string.
 */
export function arrayBufferToBase64Url(buffer: ArrayBuffer | null): string {
  if (!buffer) return '';
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  const base64 = typeof btoa !== 'undefined' ? btoa(binary) : Buffer.from(binary, 'binary').toString('base64');
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Detects current browser capabilities for Web Push and notifications.
 */
export async function getWebPushCapabilityStateAsync(): Promise<WebPushCapabilityState> {
  const isClient = typeof window !== 'undefined';
  if (!isClient) {
    return {
      isSupported: false,
      isSecureContext: false,
      permission: 'unsupported',
      isSubscribed: false,
      endpoint: null,
      canSubscribe: false,
      statusDetails: 'Server environment. Browser notifications are unavailable.',
    };
  }

  const isSecure = window.isSecureContext;
  const hasServiceWorker = 'serviceWorker' in navigator;
  const hasPushManager = 'PushManager' in window;
  const hasNotification = 'Notification' in window;

  const isSupported = isSecure && hasServiceWorker && hasPushManager && hasNotification;

  if (!isSecure) {
    return {
      isSupported: false,
      isSecureContext: false,
      permission: 'unsupported',
      isSubscribed: false,
      endpoint: null,
      canSubscribe: false,
      statusDetails: 'Web Push requires a secure HTTPS context or localhost.',
    };
  }

  if (!isSupported) {
    return {
      isSupported: false,
      isSecureContext: isSecure,
      permission: 'unsupported',
      isSubscribed: false,
      endpoint: null,
      canSubscribe: false,
      statusDetails: 'Web Push is not supported in this browser environment. Reminders will be displayed in-app.',
    };
  }

  const permission = Notification.permission as WebPushPermissionState;

  let isSubscribed = false;
  let endpoint: string | null = null;

  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      isSubscribed = true;
      endpoint = sub.endpoint;
    }
  } catch {
    // Service worker registration not yet active or subscription query failed
  }

  let statusDetails = '';
  if (permission === 'denied') {
    statusDetails = 'Notification permission was denied in browser settings. All organizer features remain fully accessible via the in-app agenda.';
  } else if (permission === 'default') {
    statusDetails = 'Browser notifications are not yet enabled. Enable notifications to receive timely alerts when tasks or routines are due.';
  } else if (isSubscribed) {
    statusDetails = 'Web Push alerts are active on this browser (best-effort delivery via browser push service).';
  } else {
    statusDetails = 'Notification permission is granted. Click "Subscribe" to connect this browser to push reminder delivery.';
  }

  return {
    isSupported: true,
    isSecureContext: true,
    permission,
    isSubscribed,
    endpoint,
    canSubscribe: permission !== 'denied',
    statusDetails,
  };
}

/**
 * Contextual subscription request: prompts user permission upon explicit click,
 * fetches VAPID public key from backend, creates PushSubscription, and registers with backend.
 */
export async function subscribeWebPushAsync(
  apiClient: DaynoriApiClient
): Promise<WebPushCapabilityState> {
  const cap = await getWebPushCapabilityStateAsync();
  if (!cap.isSupported) {
    return cap;
  }

  try {
    // 1. Request notification permission contextually upon explicit user gesture
    const permissionResult = await Notification.requestPermission();
    if (permissionResult !== 'granted') {
      return getWebPushCapabilityStateAsync();
    }

    // 2. Fetch VAPID public key from API
    const vapidRes = await apiClient.getVapidPublicKey();
    const vapidPublicKey = vapidRes.data.publicKey;
    const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);

    // 3. Ensure service worker is ready and subscribe via PushManager
    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey as unknown as BufferSource,
      });
    }

    // 4. Extract client public key and auth secret
    const p256dh = arrayBufferToBase64Url(subscription.getKey('p256dh'));
    const auth = arrayBufferToBase64Url(subscription.getKey('auth'));

    // 5. Register subscription with Daynori backend
    await apiClient.registerWebPushSubscription({
      endpoint: subscription.endpoint,
      p256dh,
      auth,
      userAgent: navigator.userAgent,
    });

    return getWebPushCapabilityStateAsync();
  } catch (err) {
    console.warn('Web push subscription failed:', err);
    return getWebPushCapabilityStateAsync();
  }
}

/**
 * Unsubscribes browser push subscription and deactivates registration on backend.
 */
export async function unsubscribeWebPushAsync(
  apiClient: DaynoriApiClient
): Promise<WebPushCapabilityState> {
  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe();
        await apiClient.deactivateWebPushSubscription(endpoint);
      }
    }
  } catch (err) {
    console.warn('Web push unsubscription failed:', err);
  }

  return getWebPushCapabilityStateAsync();
}

/**
 * Reconciles browser subscription state with backend on startup, login, or resume.
 */
export async function reconcileWebPushSubscriptionAsync(
  apiClient: DaynoriApiClient
): Promise<WebPushCapabilityState> {
  const cap = await getWebPushCapabilityStateAsync();
  if (!cap.isSupported) return cap;

  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();

    if (Notification.permission === 'denied' && sub) {
      // Permission revoked: unsubscribe locally and deactivate on server
      await sub.unsubscribe();
      await apiClient.deactivateWebPushSubscription(sub.endpoint);
      return getWebPushCapabilityStateAsync();
    }

    if (sub && Notification.permission === 'granted') {
      const p256dh = arrayBufferToBase64Url(sub.getKey('p256dh'));
      const auth = arrayBufferToBase64Url(sub.getKey('auth'));
      // Keep registration active and updated on server
      await apiClient.registerWebPushSubscription({
        endpoint: sub.endpoint,
        p256dh,
        auth,
        userAgent: navigator.userAgent,
      });
    }
  } catch {
    // Reconcile fallback
  }

  return getWebPushCapabilityStateAsync();
}
