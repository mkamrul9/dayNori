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
  SyncPushResponseSchema,
  SyncPullResponseSchema,
  SyncBootstrapResponseSchema,
  type SyncPushRequest,
  type SyncPushResponse,
  type SyncPullQuery,
  type SyncPullResponse,
  type SyncBootstrapQuery,
  type SyncBootstrapResponse,
  FolderResponseSchema,
  FolderListResponseSchema,
  FolderDeleteResultSchema,
  TagResponseSchema,
  TagListResponseSchema,
  ItemTagListResponseSchema,
  ItemLinkResponseSchema,
  ItemLinkListResponseSchema,
  NoteResponseSchema,
  NoteListResponseSchema,
  type CreateFolderRequest,
  type UpdateFolderRequest,
  type MoveFolderRequest,
  type ReorderFolderRequest,
  type ArchiveFolderRequest,
  type PinFolderRequest,
  type DeleteFolderRequest,
  type RestoreFolderRequest,
  type RebalanceSiblingsRequest,
  type CreateTagRequest,
  type UpdateTagRequest,
  type AddItemTagRequest,
  type CreateItemLinkRequest,
  type FolderResponse,
  type FolderListResponse,
  type FolderDeleteResult,
  type TagResponse,
  type TagListResponse,
  type ItemTagListResponse,
  type ItemLinkResponse,
  type ItemLinkListResponse,
  type CreateNoteRequest,
  type UpdateNoteRequest,
  type NoteListQuery,
  type NoteResponse,
  type NoteListResponse,
  TaskResponseSchema,
  TaskListResponseSchema,
  type CreateTaskRequest,
  type UpdateTaskRequest,
  type CompleteTaskRequest,
  type ReopenTaskRequest,
  type TaskListQuery,
  type TaskResponse,
  type TaskListResponse,
  RoutineResponseSchema,
  RoutineListResponseSchema,
  RoutineOccurrenceResponseSchema,
  RoutineOccurrenceListResponseSchema,
  type CreateRoutineRequest,
  type UpdateRoutineRequest,
  type CompleteOccurrenceRequest,
  type SkipOccurrenceRequest,
  type ReopenOccurrenceRequest,
  type RoutineListQuery,
  type GenerateOccurrencesQuery,
  type RoutineResponse,
  type RoutineListResponse,
  type RoutineOccurrenceResponse,
  type RoutineOccurrenceListResponse,
  JournalEntryResponseSchema,
  JournalEntryListResponseSchema,
  type CreateJournalEntryRequest,
  type UpdateJournalEntryRequest,
  type JournalEntryListQuery,
  type JournalEntryResponse,
  type JournalEntryListResponse,
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

  // --- Sync Module (Phase 12) ---

  async syncPush(request: SyncPushRequest, options?: RequestOptions): Promise<SyncPushResponse> {
    const raw = await this.request<unknown>(
      '/v1/sync/push',
      {
        method: 'POST',
        body: JSON.stringify(request),
      },
      options
    );
    return SyncPushResponseSchema.parse(raw);
  }

  async syncPull(query: SyncPullQuery, options?: RequestOptions): Promise<SyncPullResponse> {
    const params = new URLSearchParams();
    params.set('workspaceId', query.workspaceId);
    if (query.cursor) params.set('cursor', query.cursor);
    if (query.limit !== undefined) params.set('limit', String(query.limit));

    const raw = await this.request<unknown>(
      `/v1/sync/pull?${params.toString()}`,
      { method: 'GET' },
      options
    );
    return SyncPullResponseSchema.parse(raw);
  }

  async syncBootstrap(
    query: SyncBootstrapQuery,
    options?: RequestOptions
  ): Promise<SyncBootstrapResponse> {
    const params = new URLSearchParams();
    params.set('workspaceId', query.workspaceId);

    const raw = await this.request<unknown>(
      `/v1/sync/bootstrap?${params.toString()}`,
      { method: 'GET' },
      options
    );
    return SyncBootstrapResponseSchema.parse(raw);
  }

  // --- Phase 14: Organization (Folders, Tags, Links) ---

  async createFolder(
    workspaceId: string,
    request: CreateFolderRequest,
    options?: RequestOptions
  ): Promise<FolderResponse> {
    const raw = await this.request<unknown>(
      `/v1/workspaces/${workspaceId}/folders`,
      { method: 'POST', body: JSON.stringify(request) },
      options
    );
    return FolderResponseSchema.parse(raw);
  }

  async listFolders(workspaceId: string, options?: RequestOptions): Promise<FolderListResponse> {
    const raw = await this.request<unknown>(
      `/v1/workspaces/${workspaceId}/folders`,
      { method: 'GET' },
      options
    );
    return FolderListResponseSchema.parse(raw);
  }

  async getFolder(
    workspaceId: string,
    folderId: string,
    options?: RequestOptions
  ): Promise<FolderResponse> {
    const raw = await this.request<unknown>(
      `/v1/workspaces/${workspaceId}/folders/${folderId}`,
      { method: 'GET' },
      options
    );
    return FolderResponseSchema.parse(raw);
  }

  async updateFolder(
    workspaceId: string,
    folderId: string,
    request: UpdateFolderRequest,
    options?: RequestOptions
  ): Promise<FolderResponse> {
    const raw = await this.request<unknown>(
      `/v1/workspaces/${workspaceId}/folders/${folderId}`,
      { method: 'PATCH', body: JSON.stringify(request) },
      options
    );
    return FolderResponseSchema.parse(raw);
  }

  async moveFolder(
    workspaceId: string,
    folderId: string,
    request: MoveFolderRequest,
    options?: RequestOptions
  ): Promise<FolderResponse> {
    const raw = await this.request<unknown>(
      `/v1/workspaces/${workspaceId}/folders/${folderId}/move`,
      { method: 'POST', body: JSON.stringify(request) },
      options
    );
    return FolderResponseSchema.parse(raw);
  }

  async reorderFolder(
    workspaceId: string,
    folderId: string,
    request: ReorderFolderRequest,
    options?: RequestOptions
  ): Promise<FolderResponse> {
    const raw = await this.request<unknown>(
      `/v1/workspaces/${workspaceId}/folders/${folderId}/reorder`,
      { method: 'POST', body: JSON.stringify(request) },
      options
    );
    return FolderResponseSchema.parse(raw);
  }

  async archiveFolder(
    workspaceId: string,
    folderId: string,
    request: ArchiveFolderRequest,
    options?: RequestOptions
  ): Promise<FolderResponse> {
    const raw = await this.request<unknown>(
      `/v1/workspaces/${workspaceId}/folders/${folderId}/archive`,
      { method: 'POST', body: JSON.stringify(request) },
      options
    );
    return FolderResponseSchema.parse(raw);
  }

  async pinFolder(
    workspaceId: string,
    folderId: string,
    request: PinFolderRequest,
    options?: RequestOptions
  ): Promise<FolderResponse> {
    const raw = await this.request<unknown>(
      `/v1/workspaces/${workspaceId}/folders/${folderId}/pin`,
      { method: 'POST', body: JSON.stringify(request) },
      options
    );
    return FolderResponseSchema.parse(raw);
  }

  async trashFolder(
    workspaceId: string,
    folderId: string,
    request: DeleteFolderRequest,
    options?: RequestOptions
  ): Promise<FolderDeleteResult> {
    const raw = await this.request<unknown>(
      `/v1/workspaces/${workspaceId}/folders/${folderId}/trash`,
      { method: 'POST', body: JSON.stringify(request) },
      options
    );
    return FolderDeleteResultSchema.parse(raw);
  }

  async restoreFolder(
    workspaceId: string,
    folderId: string,
    request: RestoreFolderRequest,
    options?: RequestOptions
  ): Promise<FolderResponse> {
    const raw = await this.request<unknown>(
      `/v1/workspaces/${workspaceId}/folders/${folderId}/restore`,
      { method: 'POST', body: JSON.stringify(request) },
      options
    );
    return FolderResponseSchema.parse(raw);
  }

  async rebalanceFolders(
    workspaceId: string,
    request: RebalanceSiblingsRequest,
    options?: RequestOptions
  ): Promise<{ data: Array<{ id: string; rank: string; revision: number }> }> {
    const raw = await this.request<{ data: Array<{ id: string; rank: string; revision: number }> }>(
      `/v1/workspaces/${workspaceId}/folders/rebalance`,
      { method: 'POST', body: JSON.stringify(request) },
      options
    );
    return raw;
  }

  // Tags
  async createTag(
    workspaceId: string,
    request: CreateTagRequest,
    options?: RequestOptions
  ): Promise<TagResponse> {
    const raw = await this.request<unknown>(
      `/v1/workspaces/${workspaceId}/tags`,
      { method: 'POST', body: JSON.stringify(request) },
      options
    );
    return TagResponseSchema.parse(raw);
  }

  async listTags(workspaceId: string, options?: RequestOptions): Promise<TagListResponse> {
    const raw = await this.request<unknown>(
      `/v1/workspaces/${workspaceId}/tags`,
      { method: 'GET' },
      options
    );
    return TagListResponseSchema.parse(raw);
  }

  async updateTag(
    workspaceId: string,
    tagId: string,
    request: UpdateTagRequest,
    options?: RequestOptions
  ): Promise<TagResponse> {
    const raw = await this.request<unknown>(
      `/v1/workspaces/${workspaceId}/tags/${tagId}`,
      { method: 'PATCH', body: JSON.stringify(request) },
      options
    );
    return TagResponseSchema.parse(raw);
  }

  async deleteTag(workspaceId: string, tagId: string, options?: RequestOptions): Promise<void> {
    await this.request<unknown>(
      `/v1/workspaces/${workspaceId}/tags/${tagId}`,
      { method: 'DELETE' },
      options
    );
  }

  // Item Tags
  async addItemTag(
    workspaceId: string,
    itemId: string,
    request: AddItemTagRequest,
    options?: RequestOptions
  ): Promise<void> {
    await this.request<unknown>(
      `/v1/workspaces/${workspaceId}/items/${itemId}/tags`,
      { method: 'POST', body: JSON.stringify(request) },
      options
    );
  }

  async removeItemTag(
    workspaceId: string,
    itemId: string,
    tagId: string,
    options?: RequestOptions
  ): Promise<void> {
    await this.request<unknown>(
      `/v1/workspaces/${workspaceId}/items/${itemId}/tags/${tagId}`,
      { method: 'DELETE' },
      options
    );
  }

  async listItemTags(
    workspaceId: string,
    itemId: string,
    options?: RequestOptions
  ): Promise<ItemTagListResponse> {
    const raw = await this.request<unknown>(
      `/v1/workspaces/${workspaceId}/items/${itemId}/tags`,
      { method: 'GET' },
      options
    );
    return ItemTagListResponseSchema.parse(raw);
  }

  // Item Links
  async createItemLink(
    workspaceId: string,
    itemId: string,
    request: CreateItemLinkRequest,
    options?: RequestOptions
  ): Promise<ItemLinkResponse> {
    const raw = await this.request<unknown>(
      `/v1/workspaces/${workspaceId}/items/${itemId}/links`,
      { method: 'POST', body: JSON.stringify(request) },
      options
    );
    return ItemLinkResponseSchema.parse(raw);
  }

  async deleteItemLink(
    workspaceId: string,
    itemId: string,
    targetItemId: string,
    linkType?: string,
    options?: RequestOptions
  ): Promise<void> {
    const params = new URLSearchParams();
    params.set('targetItemId', targetItemId);
    if (linkType) params.set('linkType', linkType);
    await this.request<unknown>(
      `/v1/workspaces/${workspaceId}/items/${itemId}/links?${params.toString()}`,
      { method: 'DELETE' },
      options
    );
  }

  async listItemLinks(
    workspaceId: string,
    itemId: string,
    options?: RequestOptions
  ): Promise<ItemLinkListResponse> {
    const raw = await this.request<unknown>(
      `/v1/workspaces/${workspaceId}/items/${itemId}/links`,
      { method: 'GET' },
      options
    );
    return ItemLinkListResponseSchema.parse(raw);
  }

  // --- Notes (Phase 16) ---

  async createNote(
    workspaceId: string,
    request: CreateNoteRequest,
    options?: RequestOptions
  ): Promise<NoteResponse> {
    const raw = await this.request<unknown>(
      `/v1/workspaces/${workspaceId}/notes`,
      { method: 'POST', body: JSON.stringify(request) },
      options
    );
    return NoteResponseSchema.parse(raw);
  }

  async getNote(
    workspaceId: string,
    noteId: string,
    options?: RequestOptions
  ): Promise<NoteResponse> {
    const raw = await this.request<unknown>(
      `/v1/workspaces/${workspaceId}/notes/${noteId}`,
      { method: 'GET' },
      options
    );
    return NoteResponseSchema.parse(raw);
  }

  async listNotes(
    workspaceId: string,
    query?: Partial<NoteListQuery>,
    options?: RequestOptions
  ): Promise<NoteListResponse> {
    const params = new URLSearchParams();
    if (query?.folderId !== undefined) {
      if (query.folderId === null) {
        params.set('folderId', 'null');
      } else {
        params.set('folderId', query.folderId);
      }
    }
    if (query?.isArchived !== undefined) {
      params.set('isArchived', String(query.isArchived));
    }
    if (query?.search) {
      params.set('search', query.search);
    }
    if (query?.limit !== undefined) {
      params.set('limit', String(query.limit));
    }
    if (query?.cursor) {
      params.set('cursor', query.cursor);
    }
    const qs = params.toString() ? `?${params.toString()}` : '';
    const raw = await this.request<unknown>(
      `/v1/workspaces/${workspaceId}/notes${qs}`,
      { method: 'GET' },
      options
    );
    return NoteListResponseSchema.parse(raw);
  }

  async updateNote(
    workspaceId: string,
    noteId: string,
    request: UpdateNoteRequest,
    options?: RequestOptions
  ): Promise<NoteResponse> {
    const raw = await this.request<unknown>(
      `/v1/workspaces/${workspaceId}/notes/${noteId}`,
      { method: 'PATCH', body: JSON.stringify(request) },
      options
    );
    return NoteResponseSchema.parse(raw);
  }

  async trashNote(
    workspaceId: string,
    noteId: string,
    options?: RequestOptions
  ): Promise<{ data: { id: string; revision: number }; meta: { timestamp: string } }> {
    const raw = await this.request<{
      data: { id: string; revision: number };
      meta: { timestamp: string };
    }>(`/v1/workspaces/${workspaceId}/notes/${noteId}/trash`, { method: 'POST' }, options);
    return raw;
  }

  async restoreNote(
    workspaceId: string,
    noteId: string,
    options?: RequestOptions
  ): Promise<NoteResponse> {
    const raw = await this.request<unknown>(
      `/v1/workspaces/${workspaceId}/notes/${noteId}/restore`,
      { method: 'POST' },
      options
    );
    return NoteResponseSchema.parse(raw);
  }

  // --- Task Module (Phase 18) ---

  async createTask(
    workspaceId: string,
    request: CreateTaskRequest,
    options?: RequestOptions
  ): Promise<TaskResponse> {
    const raw = await this.request<unknown>(
      `/v1/workspaces/${workspaceId}/tasks`,
      { method: 'POST', body: JSON.stringify(request) },
      options
    );
    return TaskResponseSchema.parse(raw);
  }

  async getTask(
    workspaceId: string,
    taskId: string,
    options?: RequestOptions
  ): Promise<TaskResponse> {
    const raw = await this.request<unknown>(
      `/v1/workspaces/${workspaceId}/tasks/${taskId}`,
      { method: 'GET' },
      options
    );
    return TaskResponseSchema.parse(raw);
  }

  async listTasks(
    workspaceId: string,
    query?: TaskListQuery,
    options?: RequestOptions
  ): Promise<TaskListResponse> {
    const params = new URLSearchParams();
    if (query?.folderId !== undefined) {
      if (query.folderId === null) params.set('folderId', 'null');
      else params.set('folderId', query.folderId);
    }
    if (query?.status) params.set('status', query.status);
    if (query?.priority) params.set('priority', query.priority);
    if (query?.parentId !== undefined) {
      if (query.parentId === null) params.set('parentId', 'null');
      else params.set('parentId', query.parentId);
    }
    if (query?.tag) params.set('tag', query.tag);
    if (query?.filter) params.set('filter', query.filter);
    if (query?.userTimezone) params.set('userTimezone', query.userTimezone);
    if (query?.sortBy) params.set('sortBy', query.sortBy);
    if (query?.sortDirection) params.set('sortDirection', query.sortDirection);
    if (query?.limit !== undefined) params.set('limit', String(query.limit));
    if (query?.cursor) params.set('cursor', query.cursor);

    const qs = params.toString() ? `?${params.toString()}` : '';
    const raw = await this.request<unknown>(
      `/v1/workspaces/${workspaceId}/tasks${qs}`,
      { method: 'GET' },
      options
    );
    return TaskListResponseSchema.parse(raw);
  }

  async updateTask(
    workspaceId: string,
    taskId: string,
    request: UpdateTaskRequest,
    options?: RequestOptions
  ): Promise<TaskResponse> {
    const raw = await this.request<unknown>(
      `/v1/workspaces/${workspaceId}/tasks/${taskId}`,
      { method: 'PATCH', body: JSON.stringify(request) },
      options
    );
    return TaskResponseSchema.parse(raw);
  }

  async completeTask(
    workspaceId: string,
    taskId: string,
    request?: CompleteTaskRequest,
    options?: RequestOptions
  ): Promise<TaskResponse> {
    const raw = await this.request<unknown>(
      `/v1/workspaces/${workspaceId}/tasks/${taskId}/complete`,
      { method: 'POST', body: JSON.stringify(request || {}) },
      options
    );
    return TaskResponseSchema.parse(raw);
  }

  async reopenTask(
    workspaceId: string,
    taskId: string,
    request?: ReopenTaskRequest,
    options?: RequestOptions
  ): Promise<TaskResponse> {
    const raw = await this.request<unknown>(
      `/v1/workspaces/${workspaceId}/tasks/${taskId}/reopen`,
      { method: 'POST', body: JSON.stringify(request || {}) },
      options
    );
    return TaskResponseSchema.parse(raw);
  }

  async trashTask(
    workspaceId: string,
    taskId: string,
    options?: RequestOptions
  ): Promise<{
    data: { id: string; trashed: boolean; revision: number };
    meta: { requestId: string };
  }> {
    const raw = await this.request<{
      data: { id: string; trashed: boolean; revision: number };
      meta: { requestId: string };
    }>(`/v1/workspaces/${workspaceId}/tasks/${taskId}`, { method: 'DELETE' }, options);
    return raw;
  }

  async restoreTask(
    workspaceId: string,
    taskId: string,
    options?: RequestOptions
  ): Promise<TaskResponse> {
    const raw = await this.request<unknown>(
      `/v1/workspaces/${workspaceId}/tasks/${taskId}/restore`,
      { method: 'POST' },
      options
    );
    return TaskResponseSchema.parse(raw);
  }

  // --- Routine Module (Phase 20) ---

  async createRoutine(
    workspaceId: string,
    request: CreateRoutineRequest,
    options?: RequestOptions
  ): Promise<RoutineResponse> {
    const raw = await this.request<unknown>(
      `/v1/workspaces/${workspaceId}/routines`,
      { method: 'POST', body: JSON.stringify(request) },
      options
    );
    return RoutineResponseSchema.parse(raw);
  }

  async getRoutine(
    workspaceId: string,
    routineId: string,
    options?: RequestOptions
  ): Promise<RoutineResponse> {
    const raw = await this.request<unknown>(
      `/v1/workspaces/${workspaceId}/routines/${routineId}`,
      { method: 'GET' },
      options
    );
    return RoutineResponseSchema.parse(raw);
  }

  async listRoutines(
    workspaceId: string,
    query?: RoutineListQuery,
    options?: RequestOptions
  ): Promise<RoutineListResponse> {
    const params = new URLSearchParams();
    if (query?.folderId !== undefined) {
      if (query.folderId === null) params.set('folderId', 'null');
      else params.set('folderId', query.folderId);
    }
    if (query?.includeArchived !== undefined) {
      params.set('includeArchived', String(query.includeArchived));
    }
    if (query?.includePaused !== undefined) {
      params.set('includePaused', String(query.includePaused));
    }
    if (query?.limit !== undefined) params.set('limit', String(query.limit));
    if (query?.cursor) params.set('cursor', query.cursor);

    const qs = params.toString() ? `?${params.toString()}` : '';
    const raw = await this.request<unknown>(
      `/v1/workspaces/${workspaceId}/routines${qs}`,
      { method: 'GET' },
      options
    );
    return RoutineListResponseSchema.parse(raw);
  }

  async updateRoutine(
    workspaceId: string,
    routineId: string,
    request: UpdateRoutineRequest,
    options?: RequestOptions
  ): Promise<RoutineResponse> {
    const raw = await this.request<unknown>(
      `/v1/workspaces/${workspaceId}/routines/${routineId}`,
      { method: 'PATCH', body: JSON.stringify(request) },
      options
    );
    return RoutineResponseSchema.parse(raw);
  }

  async trashRoutine(
    workspaceId: string,
    routineId: string,
    baseRevision: number,
    options?: RequestOptions
  ): Promise<{ data: { id: string; revision: number; seq: number }; meta: { requestId: string } }> {
    const raw = await this.request<{
      data: { id: string; revision: number; seq: number };
      meta: { requestId: string };
    }>(
      `/v1/workspaces/${workspaceId}/routines/${routineId}`,
      { method: 'DELETE', body: JSON.stringify({ baseRevision }) },
      options
    );
    return raw;
  }

  async restoreRoutine(
    workspaceId: string,
    routineId: string,
    baseRevision: number,
    options?: RequestOptions
  ): Promise<RoutineResponse> {
    const raw = await this.request<unknown>(
      `/v1/workspaces/${workspaceId}/routines/${routineId}/restore`,
      { method: 'POST', body: JSON.stringify({ baseRevision }) },
      options
    );
    return RoutineResponseSchema.parse(raw);
  }

  async generateOccurrences(
    workspaceId: string,
    query: GenerateOccurrencesQuery,
    options?: RequestOptions
  ): Promise<RoutineOccurrenceListResponse> {
    const raw = await this.request<unknown>(
      `/v1/workspaces/${workspaceId}/routines/generate-occurrences`,
      { method: 'POST', body: JSON.stringify(query) },
      options
    );
    return RoutineOccurrenceListResponseSchema.parse(raw);
  }

  async listOccurrences(
    workspaceId: string,
    query: GenerateOccurrencesQuery,
    options?: RequestOptions
  ): Promise<RoutineOccurrenceListResponse> {
    const params = new URLSearchParams();
    params.set('startDate', query.startDate);
    params.set('endDate', query.endDate);
    if (query.routineId) params.set('routineId', query.routineId);

    const qs = `?${params.toString()}`;
    const raw = await this.request<unknown>(
      `/v1/workspaces/${workspaceId}/routines/occurrences${qs}`,
      { method: 'GET' },
      options
    );
    return RoutineOccurrenceListResponseSchema.parse(raw);
  }

  async completeOccurrence(
    workspaceId: string,
    occurrenceId: string,
    request: CompleteOccurrenceRequest,
    options?: RequestOptions
  ): Promise<RoutineOccurrenceResponse> {
    const raw = await this.request<unknown>(
      `/v1/workspaces/${workspaceId}/routines/occurrences/${occurrenceId}/complete`,
      { method: 'POST', body: JSON.stringify(request) },
      options
    );
    return RoutineOccurrenceResponseSchema.parse(raw);
  }

  async skipOccurrence(
    workspaceId: string,
    occurrenceId: string,
    request: SkipOccurrenceRequest,
    options?: RequestOptions
  ): Promise<RoutineOccurrenceResponse> {
    const raw = await this.request<unknown>(
      `/v1/workspaces/${workspaceId}/routines/occurrences/${occurrenceId}/skip`,
      { method: 'POST', body: JSON.stringify(request) },
      options
    );
    return RoutineOccurrenceResponseSchema.parse(raw);
  }

  async reopenOccurrence(
    workspaceId: string,
    occurrenceId: string,
    request: ReopenOccurrenceRequest,
    options?: RequestOptions
  ): Promise<RoutineOccurrenceResponse> {
    const raw = await this.request<unknown>(
      `/v1/workspaces/${workspaceId}/routines/occurrences/${occurrenceId}/reopen`,
      { method: 'POST', body: JSON.stringify(request) },
      options
    );
    return RoutineOccurrenceResponseSchema.parse(raw);
  }

  // --- Journal Module (Phase 22) ---

  async createJournalEntry(
    workspaceId: string,
    request: CreateJournalEntryRequest,
    options?: RequestOptions
  ): Promise<JournalEntryResponse> {
    const raw = await this.request<unknown>(
      `/v1/workspaces/${workspaceId}/journal`,
      { method: 'POST', body: JSON.stringify(request) },
      options
    );
    return JournalEntryResponseSchema.parse(raw);
  }

  async getJournalEntry(
    workspaceId: string,
    journalId: string,
    options?: RequestOptions
  ): Promise<JournalEntryResponse> {
    const raw = await this.request<unknown>(
      `/v1/workspaces/${workspaceId}/journal/${journalId}`,
      { method: 'GET' },
      options
    );
    return JournalEntryResponseSchema.parse(raw);
  }

  async listJournalEntries(
    workspaceId: string,
    query?: JournalEntryListQuery,
    options?: RequestOptions
  ): Promise<JournalEntryListResponse> {
    const params = new URLSearchParams();
    if (query?.folderId !== undefined) {
      params.set('folderId', query.folderId);
    }
    if (query?.date) params.set('date', query.date);
    if (query?.startDate) params.set('startDate', query.startDate);
    if (query?.endDate) params.set('endDate', query.endDate);
    if (query?.isDraft !== undefined) params.set('isDraft', String(query.isDraft));
    if (query?.isArchived !== undefined) params.set('isArchived', String(query.isArchived));
    if (query?.tag) params.set('tag', query.tag);
    if (query?.limit !== undefined) params.set('limit', String(query.limit));
    if (query?.cursor) params.set('cursor', query.cursor);

    const qs = params.toString() ? `?${params.toString()}` : '';
    const raw = await this.request<unknown>(
      `/v1/workspaces/${workspaceId}/journal${qs}`,
      { method: 'GET' },
      options
    );
    return JournalEntryListResponseSchema.parse(raw);
  }

  async updateJournalEntry(
    workspaceId: string,
    journalId: string,
    request: UpdateJournalEntryRequest,
    options?: RequestOptions
  ): Promise<JournalEntryResponse> {
    const raw = await this.request<unknown>(
      `/v1/workspaces/${workspaceId}/journal/${journalId}`,
      { method: 'PATCH', body: JSON.stringify(request) },
      options
    );
    return JournalEntryResponseSchema.parse(raw);
  }

  async trashJournalEntry(
    workspaceId: string,
    journalId: string,
    baseRevision?: number,
    options?: RequestOptions
  ): Promise<{ data: { success: boolean; revision: number }; meta: { requestId: string } }> {
    const raw = await this.request<{
      data: { success: boolean; revision: number };
      meta: { requestId: string };
    }>(
      `/v1/workspaces/${workspaceId}/journal/${journalId}/trash`,
      {
        method: 'POST',
        body: baseRevision !== undefined ? JSON.stringify({ baseRevision }) : undefined,
      },
      options
    );
    return raw;
  }

  async restoreJournalEntry(
    workspaceId: string,
    journalId: string,
    baseRevision?: number,
    options?: RequestOptions
  ): Promise<{
    data: { success: boolean; revision: number; entry?: unknown };
    meta: { requestId: string };
  }> {
    const raw = await this.request<{
      data: { success: boolean; revision: number; entry?: unknown };
      meta: { requestId: string };
    }>(
      `/v1/workspaces/${workspaceId}/journal/${journalId}/restore`,
      {
        method: 'POST',
        body: baseRevision !== undefined ? JSON.stringify({ baseRevision }) : undefined,
      },
      options
    );
    return raw;
  }

  async getReflectionTemplates(
    workspaceId: string,
    options?: RequestOptions
  ): Promise<{ data: unknown; meta: { requestId: string } }> {
    const raw = await this.request<{ data: unknown; meta: { requestId: string } }>(
      `/v1/workspaces/${workspaceId}/journal/templates`,
      { method: 'GET' },
      options
    );
    return raw;
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
