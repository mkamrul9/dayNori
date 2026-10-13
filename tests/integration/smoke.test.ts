import { describe, expect, it } from 'vitest';
import { buildServer } from '../../apps/api/src/server.js';
import { createApiClient } from '@daynori/api-client';

describe('Integration Smoke Tests', () => {
  it('ApiClient interacts successfully with the Fastify API server', async () => {
    const server = buildServer();

    // Use fastify inject as a fetch adapter for the client
    const customFetch: typeof fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString();
      const path = url.replace('http://localhost:3001', '');
      const response = await server.inject({
        method: (init?.method ?? 'GET') as 'GET' | 'POST',
        url: path,
      });

      return new Response(response.body, {
        status: response.statusCode,
        headers: response.headers as HeadersInit,
      });
    };

    const client = createApiClient({
      baseUrl: 'http://localhost:3001',
      fetchFn: customFetch,
    });

    const health = await client.getHealth();
    expect(health.status).toBe('ok');
    expect(health.version).toBe('0.1.0');

    const smoke = await client.getSmoke();
    expect(smoke.status).toBe('ready');
    expect(smoke.phase).toBe('01');

    await server.close();
  });
});
