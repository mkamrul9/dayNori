import { describe, expect, it } from 'vitest';
import { buildServer } from './server.js';
import { HealthResponseSchema, SmokeResponseSchema } from '@daynori/contracts';

describe('API Smoke Routes', () => {
  it('GET /health returns 200 with valid contract shape', async () => {
    const server = buildServer();
    const response = await server.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    const parsed = HealthResponseSchema.parse(body);
    expect(parsed.status).toBe('ok');
    expect(parsed.version).toBe('0.1.0');
    await server.close();
  });

  it('GET /api/v1/smoke returns 200 and matches smoke schema', async () => {
    const server = buildServer();
    const response = await server.inject({
      method: 'GET',
      url: '/api/v1/smoke',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    const parsed = SmokeResponseSchema.parse(body);
    expect(parsed.status).toBe('ready');
    expect(parsed.phase).toBe('01');
    await server.close();
  });
});
