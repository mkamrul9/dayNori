import crypto from 'node:crypto';
import type { PushNotificationAdapter } from '../worker.js';

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');

/** Fixed provider destinations; never log tokens, service keys, or provider bodies. */
export function createConfiguredPushAdapter(
  env: NodeJS.ProcessEnv = process.env,
  transport: typeof fetch = fetch
): PushNotificationAdapter {
  let account: { projectId: string; email: string; privateKey: string } | undefined;
  if (env['FCM_SERVICE_ACCOUNT_JSON']) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(env['FCM_SERVICE_ACCOUNT_JSON']);
    } catch {
      throw new Error('Invalid FCM service account JSON');
    }
    const input = record(parsed);
    if (
      typeof input['project_id'] !== 'string' ||
      !/^[a-z0-9-]{6,64}$/.test(input['project_id']) ||
      typeof input['client_email'] !== 'string' ||
      !input['client_email'].endsWith('.iam.gserviceaccount.com') ||
      typeof input['private_key'] !== 'string'
    )
      throw new Error('Invalid FCM service account fields');
    account = {
      projectId: input['project_id'],
      email: input['client_email'],
      privateKey: input['private_key'],
    };
    crypto.createPrivateKey(account.privateKey);
  }
  let cached: { value: string; expiresAt: number } | undefined;
  let refresh: Promise<string> | undefined;
  async function getAccessToken(): Promise<string> {
    if (cached && cached.expiresAt > Date.now() + 60_000) return cached.value;
    if (refresh) return refresh;
    refresh = (async () => {
      if (!account) throw new Error('FCM unconfigured');
      const now = Math.floor(Date.now() / 1000);
      const unsigned = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({
        iss: account.email,
        scope: 'https://www.googleapis.com/auth/firebase.messaging',
        aud: 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 3600,
      })}`;
      const signature = crypto
        .sign('RSA-SHA256', Buffer.from(unsigned), account.privateKey)
        .toString('base64url');
      const response = await transport('https://oauth2.googleapis.com/token', {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(10_000),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
          assertion: `${unsigned}.${signature}`,
        }),
      });
      if (!response.ok) throw new Error('FCM credential exchange failed');
      const body = record(await response.json());
      if (
        typeof body['access_token'] !== 'string' ||
        !body['access_token'] ||
        typeof body['expires_in'] !== 'number' ||
        body['expires_in'] < 60 ||
        body['expires_in'] > 3600
      )
        throw new Error('Invalid FCM credential response');
      cached = { value: body['access_token'], expiresAt: Date.now() + body['expires_in'] * 1000 };
      return cached.value;
    })();
    try {
      return await refresh;
    } finally {
      refresh = undefined;
    }
  }

  return {
    async sendPushNotification(params) {
      try {
        if (params.tokenType === 'fcm') {
          if (!account)
            return {
              success: false,
              status: 'unavailable',
              errorMessage: 'FCM credentials are unconfigured',
            };
          const token = await getAccessToken();
          const response = await transport(
            `https://fcm.googleapis.com/v1/projects/${account.projectId}/messages:send`,
            {
              method: 'POST',
              redirect: 'error',
              signal: AbortSignal.timeout(10_000),
              headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                message: {
                  token: params.pushToken,
                  data: params.dataPayload,
                  notification: { title: params.redactedTitle, body: params.redactedBody ?? '' },
                  android: {
                    priority: 'high',
                    notification: { channel_id: 'reminders', visibility: 'PRIVATE' },
                  },
                },
              }),
            }
          );
          const body = record(await response.json());
          if (response.ok && typeof body['name'] === 'string')
            return { success: true, status: 'accepted', providerMessageId: body['name'] };
          if (response.status === 401) cached = undefined;
          const details = record(body['error'])['details'];
          const invalid =
            Array.isArray(details) &&
            details.some((value: unknown) => record(value)['errorCode'] === 'UNREGISTERED');
          return {
            success: false,
            status: 'failed',
            errorMessage: `FCM rejected push (${response.status})`,
            isTokenInvalid: invalid,
          };
        }
        if (params.tokenType === 'expo_push' && env['EXPO_PUSH_ENABLED'] === 'true') {
          const response = await transport('https://exp.host/--/api/v2/push/send', {
            method: 'POST',
            redirect: 'error',
            signal: AbortSignal.timeout(10_000),
            headers: {
              'Content-Type': 'application/json',
              ...(env['EXPO_ACCESS_TOKEN']
                ? { Authorization: `Bearer ${env['EXPO_ACCESS_TOKEN']}` }
                : {}),
            },
            body: JSON.stringify({
              to: params.pushToken,
              title: params.redactedTitle,
              body: params.redactedBody ?? '',
              data: params.dataPayload,
              channelId: 'reminders',
              priority: 'high',
            }),
          });
          const body = record(await response.json());
          const ticket = record(body['data']);
          if (response.ok && ticket['status'] === 'ok' && typeof ticket['id'] === 'string') {
            // A ticket is provider acceptance, not device display or a delivery receipt.
            return { success: true, status: 'accepted', providerMessageId: ticket['id'] };
          }
          return {
            success: false,
            status: 'failed',
            errorMessage: `Expo rejected push (${response.status})`,
            isTokenInvalid: record(ticket['details'])['error'] === 'DeviceNotRegistered',
          };
        }
        return {
          success: false,
          status: 'unavailable',
          errorMessage: 'Push transport is unconfigured for this token type',
        };
      } catch {
        return { success: false, status: 'failed', errorMessage: 'Push provider request failed' };
      }
    },
  };
}
