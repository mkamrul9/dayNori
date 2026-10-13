import { describe, expect, it, vi } from 'vitest';
import { createApiClient } from './index.js';

describe('DaynoriApiClient', () => {
  it('successfully fetches and validates health response', async () => {
    const mockHealth = {
      status: 'ok',
      version: '0.1.0',
      timestamp: '2026-10-13T20:00:00.000Z',
    };

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockHealth,
    } as Response);

    const client = createApiClient({
      baseUrl: 'http://localhost:3001',
      fetchFn: mockFetch,
    });

    const result = await client.getHealth();
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3001/health');
    expect(result.status).toBe('ok');
    expect(result.version).toBe('0.1.0');
  });

  it('throws an error when HTTP response is not ok', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
    } as Response);

    const client = createApiClient({
      baseUrl: 'http://localhost:3001',
      fetchFn: mockFetch,
    });

    await expect(client.getHealth()).rejects.toThrowError(/503/);
  });
});
