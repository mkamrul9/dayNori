import { afterEach, expect, it, vi } from 'vitest';
import { buildServer } from '../../apps/api/src/server.js';
import { getDeletionDisclosure } from '../../apps/api/src/modules/lifecycle/deletionService.js';

afterEach(() => vi.unstubAllEnvs());

it('discloses pending provider erasure in the free profile', () => {
  vi.stubEnv('DAYNORI_CORE_PREVIEW', 'true');
  expect(getDeletionDisclosure()).toContain('Auth-provider cleanup remains pending');
  expect(getDeletionDisclosure()).not.toContain('within 30 days');
});

it('rejects direct upload and reminder writes in the free profile while preserving auth on core routes', async () => {
  vi.stubEnv('DAYNORI_CORE_PREVIEW', 'true');
  const app = buildServer({
    jwtConfig: {
      issuer: 'https://preview.test',
      audience: 'authenticated',
      secret: 'synthetic-preview-test',
    },
  });
  try {
    for (const url of [
      '/v1/workspaces/test/files/reservations',
      '/v1/workspaces/test/items/test/attachments',
      '/v1/workspaces/test/reminders/rules',
      '/v1/web-push/subscriptions',
      '/v1/devices',
      '/v1/storage/upload?token=synthetic',
    ]) {
      const response = await app.inject({ method: 'POST', url });
      expect(response.statusCode, url).toBe(403);
      expect(response.json().error.message).toContain('free preview');
    }
    expect((await app.inject('/v1/health')).statusCode).toBe(200);
    expect((await app.inject('/v1/users/me/preferences')).statusCode).toBe(401);
  } finally {
    await app.close();
  }
});
