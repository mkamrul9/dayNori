import {
  HealthResponseSchema,
  SmokeResponseSchema,
  HealthCheckResponseSchema,
  ReadinessCheckResponseSchema,
  WorkspaceListResponseSchema,
  WorkspaceResponseSchema,
  MemberListResponseSchema,
  MemberResponseSchema,
  ItemListResponseSchema,
  ItemResponseSchema,
  ProvisionWorkspaceResponseSchema,
  ProfileResponseSchema,
  type HealthResponse,
  type SmokeResponse,
  type HealthCheckResponse,
  type ReadinessCheckResponse,
  type WorkspaceListResponse,
  type WorkspaceResponse,
  type CreateWorkspaceRequestInput,
  type MemberListResponse,
  type MemberResponse,
  type AddMemberRequest,
  type ItemListResponse,
  type ItemResponse,
  type CreateItemRequestInput,
  type ItemListQueryInput,
  type Item,
  type ProvisionWorkspaceRequest,
  type ProvisionWorkspaceResponse,
  type ProfileResponse,
  type UpdatePreferencesRequest,
} from '@daynori/contracts';
import {
  ApiClientError,
  ApiAuthError,
  ApiNotFoundError,
  ApiValidationError,
  ApiConflictError,
  ApiRateLimitError,
  ApiPayloadTooLargeError,
} from './errors.js';

export interface ApiClientOptions {
  baseUrl: string;
  token?: string | (() => Promise<string | null> | string | null);
  fetchFn?: typeof fetch;
  defaultTimeoutMs?: number;
}

export interface RequestOptions {
  signal?: AbortSignal;
  headers?: Record<string, string>;
  timeoutMs?: number;
}

export class DaynoriApiClient {
  private readonly baseUrl: string;
  private readonly tokenResolver?: string | (() => Promise<string | null> | string | null);
  private readonly fetch: typeof fetch;
  private readonly defaultTimeoutMs: number;

  constructor(options: ApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.tokenResolver = options.token;
    this.fetch = options.fetchFn ?? globalThis.fetch;
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 10_000;
  }

  private async resolveToken(): Promise<string | null> {
    if (!this.tokenResolver) {
      return null;
    }
    if (typeof this.tokenResolver === 'function') {
      return this.tokenResolver();
    }
    return this.tokenResolver;
  }

  private async request<T>(
    endpoint: string,
    init: RequestInit,
    options?: RequestOptions
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
    const token = await this.resolveToken();

    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...((options?.headers as Record<string, string>) || {}),
    };

    if (init.body && typeof init.body === 'string') {
      headers['Content-Type'] = 'application/json';
    }

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    // Set up timeout and cancellation signal handling
    const timeoutMs = options?.timeoutMs ?? this.defaultTimeoutMs;
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs);

    const effectiveSignal = options?.signal;
    if (effectiveSignal) {
      // If client provided a signal, link it to timeout
      if (effectiveSignal.aborted) {
        clearTimeout(timeoutId);
        throw effectiveSignal.reason ?? new Error('Request aborted');
      }
      effectiveSignal.addEventListener('abort', () => timeoutController.abort());
    }

    try {
      const response = await this.fetch(url, {
        ...init,
        headers: {
          ...headers,
          ...(init.headers as Record<string, string>),
        },
        signal: timeoutController.signal,
      });

      if (!response.ok) {
        await this.handleErrorResponse(response);
      }

      // 204 No Content
      if (response.status === 204) {
        return undefined as T;
      }

      const json = await response.json();
      return json as T;
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        throw err;
      }
      if (err instanceof Error && err.name === 'AbortError') {
        throw err;
      }
      throw new ApiClientError(err instanceof Error ? err.message : 'Network error', {
        code: 'NETWORK_ERROR',
        statusCode: 0,
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async handleErrorResponse(response: Response): Promise<never> {
    let payload: Record<string, unknown> | null = null;
    try {
      payload = (await response.json()) as Record<string, unknown>;
    } catch {
      // Response body was not JSON
    }

    const errObj = payload && typeof payload['error'] === 'object' ? payload['error'] : null;
    const message =
      errObj && typeof (errObj as Record<string, unknown>)['message'] === 'string'
        ? ((errObj as Record<string, unknown>)['message'] as string)
        : `HTTP request failed with status ${response.status}`;
    const code =
      errObj && typeof (errObj as Record<string, unknown>)['code'] === 'string'
        ? ((errObj as Record<string, unknown>)['code'] as string)
        : 'HTTP_ERROR';
    const requestId =
      (errObj && typeof (errObj as Record<string, unknown>)['requestId'] === 'string'
        ? ((errObj as Record<string, unknown>)['requestId'] as string)
        : undefined) ??
      response.headers.get('x-request-id') ??
      undefined;
    const retryAfter =
      errObj && typeof (errObj as Record<string, unknown>)['retryAfter'] === 'number'
        ? ((errObj as Record<string, unknown>)['retryAfter'] as number)
        : response.headers.get('retry-after')
          ? parseInt(response.headers.get('retry-after')!, 10)
          : undefined;

    switch (response.status) {
      case 400:
        throw new ApiValidationError(message, { requestId });
      case 401:
        throw new ApiAuthError(message, { requestId });
      case 404:
        throw new ApiNotFoundError(message, { requestId });
      case 409:
        throw new ApiConflictError(message, { requestId });
      case 413:
        throw new ApiPayloadTooLargeError(message, { requestId });
      case 429:
        throw new ApiRateLimitError(message, { requestId, retryAfter });
      default:
        throw new ApiClientError(message, {
          code,
          statusCode: response.status,
          requestId,
        });
    }
  }

  // --- Foundation & Health ---

  async getHealth(options?: RequestOptions): Promise<HealthCheckResponse> {
    const raw = await this.request<unknown>('/v1/health', { method: 'GET' }, options);
    return HealthCheckResponseSchema.parse(raw);
  }

  async getReady(options?: RequestOptions): Promise<ReadinessCheckResponse> {
    const raw = await this.request<unknown>('/v1/ready', { method: 'GET' }, options);
    return ReadinessCheckResponseSchema.parse(raw);
  }

  async getOpenApiSpec(options?: RequestOptions): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>('/v1/openapi.json', { method: 'GET' }, options);
  }

  // --- Workspaces ---

  async listWorkspaces(options?: RequestOptions): Promise<WorkspaceListResponse> {
    const raw = await this.request<unknown>('/v1/workspaces', { method: 'GET' }, options);
    return WorkspaceListResponseSchema.parse(raw);
  }

  async createWorkspace(
    data: CreateWorkspaceRequestInput,
    options?: RequestOptions
  ): Promise<WorkspaceResponse> {
    const raw = await this.request<unknown>(
      '/v1/workspaces',
      { method: 'POST', body: JSON.stringify(data) },
      options
    );
    return WorkspaceResponseSchema.parse(raw);
  }

  async getWorkspace(workspaceId: string, options?: RequestOptions): Promise<WorkspaceResponse> {
    const raw = await this.request<unknown>(
      `/v1/workspaces/${encodeURIComponent(workspaceId)}`,
      { method: 'GET' },
      options
    );
    return WorkspaceResponseSchema.parse(raw);
  }

  async provisionPersonalWorkspace(
    data?: ProvisionWorkspaceRequest,
    options?: RequestOptions
  ): Promise<ProvisionWorkspaceResponse> {
    const raw = await this.request<unknown>(
      '/v1/workspaces/provision',
      { method: 'POST', body: data ? JSON.stringify(data) : undefined },
      options
    );
    return ProvisionWorkspaceResponseSchema.parse(raw);
  }

  async getPersonalWorkspace(options?: RequestOptions): Promise<WorkspaceResponse> {
    const raw = await this.request<unknown>('/v1/workspaces/personal', { method: 'GET' }, options);
    return WorkspaceResponseSchema.parse(raw);
  }

  // --- Users & Preferences ---

  async getUserPreferences(options?: RequestOptions): Promise<ProfileResponse> {
    const raw = await this.request<unknown>('/v1/users/me/preferences', { method: 'GET' }, options);
    return ProfileResponseSchema.parse(raw);
  }

  async updateUserPreferences(
    data: UpdatePreferencesRequest,
    options?: RequestOptions
  ): Promise<ProfileResponse> {
    const raw = await this.request<unknown>(
      '/v1/users/me/preferences',
      { method: 'PATCH', body: JSON.stringify(data) },
      options
    );
    return ProfileResponseSchema.parse(raw);
  }

  // --- Memberships ---

  async listMembers(workspaceId: string, options?: RequestOptions): Promise<MemberListResponse> {
    const raw = await this.request<unknown>(
      `/v1/workspaces/${encodeURIComponent(workspaceId)}/members`,
      { method: 'GET' },
      options
    );
    return MemberListResponseSchema.parse(raw);
  }

  async addMember(
    workspaceId: string,
    data: AddMemberRequest,
    options?: RequestOptions
  ): Promise<MemberResponse> {
    const raw = await this.request<unknown>(
      `/v1/workspaces/${encodeURIComponent(workspaceId)}/members`,
      { method: 'POST', body: JSON.stringify(data) },
      options
    );
    return MemberResponseSchema.parse(raw);
  }

  async removeMember(workspaceId: string, userId: string, options?: RequestOptions): Promise<void> {
    await this.request<unknown>(
      `/v1/workspaces/${encodeURIComponent(workspaceId)}/members/${encodeURIComponent(userId)}`,
      { method: 'DELETE' },
      options
    );
  }

  // --- Items & Keyset Pagination ---

  async listItems(
    workspaceId: string,
    query?: ItemListQueryInput,
    options?: RequestOptions
  ): Promise<ItemListResponse> {
    const searchParams = new URLSearchParams();
    if (query?.limit) searchParams.set('limit', String(query.limit));
    if (query?.cursor) searchParams.set('cursor', query.cursor);
    if (query?.folderId) searchParams.set('folderId', query.folderId);
    if (query?.kind) searchParams.set('kind', query.kind);

    const qs = searchParams.toString();
    const endpoint = `/v1/workspaces/${encodeURIComponent(workspaceId)}/items${qs ? `?${qs}` : ''}`;
    const raw = await this.request<unknown>(endpoint, { method: 'GET' }, options);
    return ItemListResponseSchema.parse(raw);
  }

  async createItem(
    workspaceId: string,
    data: CreateItemRequestInput,
    options?: RequestOptions
  ): Promise<ItemResponse> {
    const raw = await this.request<unknown>(
      `/v1/workspaces/${encodeURIComponent(workspaceId)}/items`,
      { method: 'POST', body: JSON.stringify(data) },
      options
    );
    return ItemResponseSchema.parse(raw);
  }

  async getItem(
    workspaceId: string,
    itemId: string,
    options?: RequestOptions
  ): Promise<ItemResponse> {
    const raw = await this.request<unknown>(
      `/v1/workspaces/${encodeURIComponent(workspaceId)}/items/${encodeURIComponent(itemId)}`,
      { method: 'GET' },
      options
    );
    return ItemResponseSchema.parse(raw);
  }

  async deleteItem(workspaceId: string, itemId: string, options?: RequestOptions): Promise<void> {
    await this.request<unknown>(
      `/v1/workspaces/${encodeURIComponent(workspaceId)}/items/${encodeURIComponent(itemId)}`,
      { method: 'DELETE' },
      options
    );
  }

  /**
   * Keyset pagination async generator iterating over all items in a workspace
   */
  async *paginateItems(
    workspaceId: string,
    query?: Omit<ItemListQueryInput, 'cursor'>,
    options?: RequestOptions
  ): AsyncGenerator<Item, void, undefined> {
    let cursor: string | undefined = undefined;

    do {
      const page = await this.listItems(workspaceId, { ...query, cursor }, options);

      for (const item of page.data) {
        yield item;
      }

      cursor = page.meta.cursor;
    } while (cursor);
  }

  // --- Legacy Phase 01 compatibility ---

  async getLegacyHealth(): Promise<HealthResponse> {
    const response = await this.fetch(`${this.baseUrl}/health`);
    if (!response.ok) {
      throw new Error(`Health check failed with status: ${response.status}`);
    }
    const json = await response.json();
    return HealthResponseSchema.parse(json);
  }

  async getSmoke(): Promise<SmokeResponse> {
    const response = await this.fetch(`${this.baseUrl}/api/v1/smoke`);
    if (!response.ok) {
      throw new Error(`Smoke check failed with status: ${response.status}`);
    }
    const json = await response.json();
    return SmokeResponseSchema.parse(json);
  }
}

export function createApiClient(options: ApiClientOptions): DaynoriApiClient {
  return new DaynoriApiClient(options);
}
