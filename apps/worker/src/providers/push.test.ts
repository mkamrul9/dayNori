import crypto from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { createConfiguredPushAdapter } from './push.js';

const params = {
  recipientUserId: 'synthetic-user',
  pushToken: 'synthetic-token',
  tokenType: 'fcm' as const,
  redactedTitle: 'Daynori reminder',
  redactedBody: null,
  dataPayload: { destination: 'plan' },
};

it('exchanges a signed short-lived assertion, caches the token, and records acceptance only', async () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const account = {
    project_id: 'daynori-test',
    client_email: 'push@daynori-test.iam.gserviceaccount.com',
    private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
  };
  const transport = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json({ access_token: 'test-access', expires_in: 3600 }))
    .mockResolvedValueOnce(Response.json({ name: 'projects/daynori-test/messages/one' }))
    .mockResolvedValueOnce(Response.json({ name: 'projects/daynori-test/messages/two' }));
  const adapter = createConfiguredPushAdapter(
    { FCM_SERVICE_ACCOUNT_JSON: JSON.stringify(account) },
    transport
  );
  expect((await adapter.sendPushNotification(params)).status).toBe('accepted');
  expect((await adapter.sendPushNotification(params)).status).toBe('accepted');
  expect(transport).toHaveBeenCalledTimes(3);
  const assertion = new URLSearchParams(String(transport.mock.calls[0]?.[1]?.body)).get(
    'assertion'
  )!;
  const [header, payload, signature] = assertion.split('.');
  expect(
    crypto.verify(
      'RSA-SHA256',
      Buffer.from(`${header}.${payload}`),
      publicKey,
      Buffer.from(signature!, 'base64url')
    )
  ).toBe(true);
  const claims = JSON.parse(Buffer.from(payload!, 'base64url').toString()) as {
    aud: string;
    exp: number;
    iat: number;
  };
  expect(claims.aud).toBe('https://oauth2.googleapis.com/token');
  expect(claims.exp - claims.iat).toBe(3600);
  expect(transport.mock.calls[1]?.[0]).toBe(
    'https://fcm.googleapis.com/v1/projects/daynori-test/messages:send'
  );
});

it('does not attempt FCM delivery without credentials', async () => {
  const transport = vi.fn<typeof fetch>();
  expect(
    (await createConfiguredPushAdapter({}, transport).sendPushNotification(params)).status
  ).toBe('unavailable');
  expect(transport).not.toHaveBeenCalled();
});

it('handles expired Expo tokens without echoing provider data', async () => {
  const transport = vi.fn<typeof fetch>().mockResolvedValue(
    Response.json({
      data: {
        status: 'error',
        message: 'private token details',
        details: { error: 'DeviceNotRegistered' },
      },
    })
  );
  const result = await createConfiguredPushAdapter(
    { EXPO_PUSH_ENABLED: 'true' },
    transport
  ).sendPushNotification({ ...params, tokenType: 'expo_push' });
  expect(result.isTokenInvalid).toBe(true);
  expect(result.status).toBe('failed');
  expect(result.errorMessage).not.toContain('private token details');
});
