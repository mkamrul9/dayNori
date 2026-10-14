import { describe, expect, it, vi } from 'vitest';
import {
  createApiClient,
  ApiAuthError,
  ApiNotFoundError,
  ApiValidationError,
  ApiRateLimitError,
} from './index.js';

describe('DaynoriApiClient', () => {
  it('successfully fetches and validates v1 health response', async () => {
    const mockHealth = {
      data: {
        status: 'ok',
        version: '0.1.0',
        environment: 'development',
      },
      meta: {
        requestId: 'req-test-1',
        serverTime: '2026-10-14T12:00:00.000Z',
      },
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
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3001/v1/health',
      expect.objectContaining({ method: 'GET' })
    );
    expect(result.data.status).toBe('ok');
    expect(result.data.version).toBe('0.1.0');
    expect(result.meta.requestId).toBe('req-test-1');
  });

  it('attaches bearer token from static string or async resolver', async () => {
    const mockWsList = {
      data: [
        {
          id: 'b7b8bb5a-a3a8-4c90-9511-c91726a57c12',
          name: 'Workspace One',
          kind: 'personal',
          ownerId: '9fa6ecb9-52df-424a-9e0a-3a568a520f92',
          createdAt: '2026-10-14T10:00:00.000Z',
          updatedAt: '2026-10-14T10:00:00.000Z',
        },
      ],
      meta: {
        requestId: 'req-ws-list',
        serverTime: '2026-10-14T12:00:00.000Z',
      },
    };

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockWsList,
    } as Response);

    const client = createApiClient({
      baseUrl: 'http://localhost:3001',
      token: async () => 'mock_jwt_token_123',
      fetchFn: mockFetch,
    });

    const result = await client.listWorkspaces();
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3001/v1/workspaces',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer mock_jwt_token_123',
        }),
      })
    );
    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.name).toBe('Workspace One');
  });

  it('throws typed ApiAuthError on 401 response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({
        error: {
          code: 'UNAUTHENTICATED',
          message: 'Missing or expired token',
          requestId: 'req-auth-err',
        },
      }),
      headers: new Headers(),
    } as Response);

    const client = createApiClient({
      baseUrl: 'http://localhost:3001',
      fetchFn: mockFetch,
    });

    await expect(client.listWorkspaces()).rejects.toThrow(ApiAuthError);
  });

  it('throws typed ApiNotFoundError on 404 response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({
        error: {
          code: 'NOT_FOUND',
          message: 'Workspace not found',
          requestId: 'req-not-found',
        },
      }),
      headers: new Headers(),
    } as Response);

    const client = createApiClient({
      baseUrl: 'http://localhost:3001',
      fetchFn: mockFetch,
    });

    await expect(client.getWorkspace('00000000-0000-0000-0000-000000000000')).rejects.toThrow(
      ApiNotFoundError
    );
  });

  it('throws typed ApiValidationError on 400 response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Invalid name',
          requestId: 'req-validation',
        },
      }),
      headers: new Headers(),
    } as Response);

    const client = createApiClient({
      baseUrl: 'http://localhost:3001',
      fetchFn: mockFetch,
    });

    await expect(client.createWorkspace({ name: '' })).rejects.toThrow(ApiValidationError);
  });

  it('throws typed ApiRateLimitError with retryAfter on 429 response', async () => {
    const headers = new Headers();
    headers.set('retry-after', '45');

    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({
        error: {
          code: 'RATE_LIMITED',
          message: 'Rate limit exceeded',
          requestId: 'req-limit',
          retryAfter: 45,
        },
      }),
      headers,
    } as Response);

    const client = createApiClient({
      baseUrl: 'http://localhost:3001',
      fetchFn: mockFetch,
    });

    try {
      await client.listWorkspaces();
      expect.fail('Should have thrown ApiRateLimitError');
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(ApiRateLimitError);
      expect((err as ApiRateLimitError).retryAfterSeconds).toBe(45);
    }
  });

  it('iterates through keyset paginated pages using paginateItems generator', async () => {
    const page1 = {
      data: [
        {
          id: '11111111-1111-1111-1111-111111111111',
          workspaceId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
          folderId: null,
          kind: 'note' as const,
          createdBy: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          updatedBy: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          createdAt: '2026-10-14T10:00:00.000Z',
          updatedAt: '2026-10-14T10:00:00.000Z',
          deletedAt: null,
          displayOrder: 0,
        },
      ],
      meta: {
        requestId: 'req-page-1',
        serverTime: '2026-10-14T12:00:00.000Z',
        cursor: 'next_page_cursor_token',
      },
    };

    const page2 = {
      data: [
        {
          id: '22222222-2222-2222-2222-222222222222',
          workspaceId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
          folderId: null,
          kind: 'task' as const,
          createdBy: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          updatedBy: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          createdAt: '2026-10-14T09:00:00.000Z',
          updatedAt: '2026-10-14T09:00:00.000Z',
          deletedAt: null,
          displayOrder: 1,
        },
      ],
      meta: {
        requestId: 'req-page-2',
        serverTime: '2026-10-14T12:00:00.000Z',
      },
    };

    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => page1,
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => page2,
      } as Response);

    const client = createApiClient({
      baseUrl: 'http://localhost:3001',
      fetchFn: mockFetch,
    });

    const items: unknown[] = [];
    for await (const item of client.paginateItems('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')) {
      items.push(item);
    }

    expect(items).toHaveLength(2);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('aborts request immediately when AbortSignal is pre-aborted or triggered', async () => {
    const controller = new AbortController();
    controller.abort();

    const client = createApiClient({
      baseUrl: 'http://localhost:3001',
      fetchFn: vi.fn(),
    });

    await expect(client.getHealth({ signal: controller.signal })).rejects.toThrow();
  });
});
