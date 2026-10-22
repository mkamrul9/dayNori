import { afterEach, expect, it, vi } from 'vitest';
import { defaultAuthAdapter } from '../auth/authAdapter.js';
import { createMobileApiClient } from './mobileApiClient.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
it('uses the hosted API and resolves bearer credentials again after session replacement', async () => {
  vi.stubEnv('EXPO_PUBLIC_DAYNORI_API_URL', 'https://api.phone-test.example');
  const token = vi
    .spyOn(defaultAuthAdapter, 'getAccessToken')
    .mockResolvedValueOnce('first-session')
    .mockResolvedValueOnce('renewed-session')
    .mockResolvedValueOnce(null);
  const requests: { url: string; auth: string | null }[] = [];
  const fetchFn: typeof fetch = async (input, init) => {
    requests.push({ url: String(input), auth: new Headers(init?.headers).get('Authorization') });
    return new Response(
      JSON.stringify({
        error: { code: 'UNAUTHENTICATED', message: 'Synthetic boundary response' },
      }),
      { status: 401 }
    );
  };
  const client = createMobileApiClient({ fetchFn });
  for (let i = 0; i < 3; i++) await expect(client.getUserPreferences()).rejects.toThrow();
  expect(token).toHaveBeenCalledTimes(3);
  expect(requests.map((r) => r.auth)).toEqual([
    'Bearer first-session',
    'Bearer renewed-session',
    null,
  ]);
  expect(
    requests.every((r) => r.url === 'https://api.phone-test.example/v1/users/me/preferences')
  ).toBe(true);
});
