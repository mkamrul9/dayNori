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
  ReserveUploadResponseSchema,
  FinalizeUploadResponseSchema,
  UploadStatusResponseSchema,
  CancelReservationResponseSchema,
  DownloadCapabilityResponseSchema,
  FileItemResponseSchema,
  StorageQuotaResponseSchema,
  ItemAttachmentResponseSchema,
  ListItemAttachmentsResponseSchema,
  type ReserveUploadRequest,
  type ReserveUploadResponse,
  type FinalizeUploadRequest,
  type FinalizeUploadResponse,
  type UploadStatusResponse,
  type CancelReservationResponse,
  type DownloadCapabilityResponse,
  type FileItemResponse,
  type StorageQuotaResponse,
  type LinkItemAttachmentRequest,
  type ItemAttachmentResponse,
  type ListItemAttachmentsResponse,
  CalendarEventResponseSchema,
  CalendarReadModelResponseSchema,
  type CreateCalendarEventRequest,
  type UpdateCalendarEventRequest,
  type CalendarFeedQuery,
  type CalendarEventResponse,
  type CalendarReadModelResponse,
  ReminderRuleResponseSchema,
  ReminderRuleListResponseSchema,
  ReminderInstanceResponseSchema,
  ReminderInstanceListResponseSchema,
  ReminderDeliveryResponseSchema,
  DeviceResponseSchema,
  DeviceListResponseSchema,
  DeviceScheduleResponseSchema,
  DeviceScheduleListResponseSchema,
  WebPushSubscriptionResponseSchema,
  WebPushSubscriptionListResponseSchema,
  VapidPublicKeyResponseSchema,
  type RegisterWebPushSubscriptionRequest,
  type WebPushSubscriptionResponse,
  type WebPushSubscriptionListResponse,
  type VapidPublicKeyResponse,
  type CreateReminderRuleRequest,
  type UpdateReminderRuleRequest,
  type SnoozeReminderRequest,
  type RecordDeliveryReceiptRequest,
  type RegisterDeviceRequest,
  type AcknowledgeDeviceScheduleRequest,
  type ReminderRuleResponse,
  type ReminderRuleListResponse,
  type ReminderInstanceResponse,
  type ReminderInstanceListResponse,
  type ReminderDeliveryResponse,
  type DeviceResponse,
  type DeviceListResponse,
  type DeviceScheduleResponse,
  type DeviceScheduleListResponse,
  SavedViewResponseSchema,
  SavedViewListResponseSchema,
  ResolvedItemLinkListResponseSchema,
  type CreateSavedViewRequest,
  type UpdateSavedViewRequest,
  type SavedViewResponse,
  type SavedViewListResponse,
  type ResolvedItemLinkListResponse,
  SearchResponseSchema,
  type SearchResponse,
  type SearchQueryInput,
  ReauthenticateResponseSchema,
  CreateExportResponseSchema,
  ImportPreviewResponseSchema,
  ExecuteImportResponseSchema,
  type ReauthenticateRequest,
  type ReauthenticateResponse,
  type CreateExportRequest,
  type CreateExportResponse,
  type ImportPreviewResponse,
  type ExecuteImportRequest,
  type ExecuteImportResponse,
  RequestAccountDeletionResponseSchema,
  ConfirmAccountDeletionResponseSchema,
  CancelAccountDeletionResponseSchema,
  AccountDeletionStatusResponseSchema,
  RequestWorkspaceDeletionResponseSchema,
  PublicDeletionRequestResponseSchema,
  VerifyPublicDeletionResponseSchema,
  type RequestAccountDeletionBody,
  type RequestAccountDeletionResponse,
  type ConfirmAccountDeletionBody,
  type ConfirmAccountDeletionResponse,
  type CancelAccountDeletionBody,
  type CancelAccountDeletionResponse,
  type AccountDeletionStatusResponse,
  type RequestWorkspaceDeletionBody,
  type RequestWorkspaceDeletionResponse,
  type PublicDeletionRequestSubmission,
  type PublicDeletionRequestResponse,
  type VerifyPublicDeletionRequestBody,
  type VerifyPublicDeletionResponse,
  ExpenseCategoryResponseSchema,
  ExpenseCategoryListResponseSchema,
  ExpenseResponseSchema,
  ExpenseListResponseSchema,
  ExpenseMonthlySummaryResponseSchema,
  ExpenseRecurringTemplateResponseSchema,
  ExpenseRecurringTemplateListResponseSchema,
  ExpenseBudgetResponseSchema,
  ExpenseBudgetListResponseSchema,
  type CreateExpenseCategoryBody,
  type UpdateExpenseCategoryBody,
  type ExpenseCategoryResponse,
  type ExpenseCategoryListResponse,
  type CreateExpenseBody,
  type UpdateExpenseBody,
  type ExpenseResponse,
  type ExpenseListResponse,
  type ExpenseListQuery,
  type ExpenseMonthlySummaryResponse,
  type CreateExpenseRecurringTemplateBody,
  type ExpenseRecurringTemplateResponse,
  type ExpenseRecurringTemplateListResponse,
  type CreateExpenseBudgetBody,
  type UpdateExpenseBudgetBody,
  type ExpenseBudgetResponse,
  type ExpenseBudgetListResponse,
  type ExpenseExportQuery,
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
  csrfToken?: string | (() => Promise<string | null> | string | null);
  headers?:
    Record<string, string> | (() => Promise<Record<string, string>> | Record<string, string>);
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
  private readonly csrfTokenResolver?: string | (() => Promise<string | null> | string | null);
  private readonly headersResolver?:
    Record<string, string> | (() => Promise<Record<string, string>> | Record<string, string>);
  private readonly fetch: typeof fetch;
  private readonly defaultTimeoutMs: number;

  constructor(options: ApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.tokenResolver = options.token;
    this.csrfTokenResolver = options.csrfToken;
    this.headersResolver = options.headers;
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

  private async resolveCsrfToken(): Promise<string | null> {
    if (this.csrfTokenResolver) {
      if (typeof this.csrfTokenResolver === 'function') {
        return this.csrfTokenResolver();
      }
      return this.csrfTokenResolver;
    }
    const globalDoc = (globalThis as unknown as { document?: { cookie?: string } }).document;
    if (globalDoc && globalDoc.cookie) {
      const match = globalDoc.cookie.match(/(?:^|;\s*)daynori_csrf_token=([^;]+)/);
      if (match) {
        return decodeURIComponent(match[1]!);
      }
    }
    return null;
  }

  private async request<T>(
    endpoint: string,
    init: RequestInit,
    options?: RequestOptions
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
    const token = await this.resolveToken();

    const resolvedDefaultHeaders = this.headersResolver
      ? typeof this.headersResolver === 'function'
        ? await this.headersResolver()
        : this.headersResolver
      : {};

    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...resolvedDefaultHeaders,
      ...((options?.headers as Record<string, string>) || {}),
    };

    if (init.body && typeof init.body === 'string') {
      headers['Content-Type'] = 'application/json';
    }

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const method = (init.method || 'GET').toUpperCase();
    const isMutating = ['POST', 'PATCH', 'PUT', 'DELETE'].includes(method);

    if (isMutating && !headers['x-csrf-token'] && !headers['X-CSRF-Token']) {
      const csrf = await this.resolveCsrfToken();
      if (csrf) {
        headers['x-csrf-token'] = csrf;
      }
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

  // --- Files & Storage Lifecycle ---

  async getWorkspaceStorageQuota(
    workspaceId: string,
    options?: RequestOptions
  ): Promise<StorageQuotaResponse> {
    const raw = await this.request<unknown>(
      `/v1/workspaces/${workspaceId}/files/quota`,
      { method: 'GET' },
      options
    );
    return StorageQuotaResponseSchema.parse(raw);
  }

  async reserveFileUpload(
    workspaceId: string,
    request: ReserveUploadRequest,
    options?: RequestOptions
  ): Promise<ReserveUploadResponse> {
    const raw = await this.request<unknown>(
      `/v1/workspaces/${workspaceId}/files/reservations`,
      { method: 'POST', body: JSON.stringify(request) },
      options
    );
    return ReserveUploadResponseSchema.parse(raw);
  }

  async finalizeFileUpload(
    workspaceId: string,
    reservationId: string,
    request?: FinalizeUploadRequest,
    options?: RequestOptions
  ): Promise<FinalizeUploadResponse> {
    const raw = await this.request<unknown>(
      `/v1/workspaces/${workspaceId}/files/reservations/${reservationId}/finalize`,
      {
        method: 'POST',
        body: request ? JSON.stringify(request) : undefined,
      },
      options
    );
    return FinalizeUploadResponseSchema.parse(raw);
  }

  async getFileUploadStatus(
    workspaceId: string,
    reservationId: string,
    options?: RequestOptions
  ): Promise<UploadStatusResponse> {
    const raw = await this.request<unknown>(
      `/v1/workspaces/${workspaceId}/files/reservations/${reservationId}`,
      { method: 'GET' },
      options
    );
    return UploadStatusResponseSchema.parse(raw);
  }

  async cancelFileUploadReservation(
    workspaceId: string,
    reservationId: string,
    options?: RequestOptions
  ): Promise<CancelReservationResponse> {
    const raw = await this.request<unknown>(
      `/v1/workspaces/${workspaceId}/files/reservations/${reservationId}/cancel`,
      { method: 'POST' },
      options
    );
    return CancelReservationResponseSchema.parse(raw);
  }

  async getFileDownloadCapability(
    workspaceId: string,
    fileId: string,
    options?: RequestOptions
  ): Promise<DownloadCapabilityResponse> {
    const raw = await this.request<unknown>(
      `/v1/workspaces/${workspaceId}/files/${fileId}/download`,
      { method: 'GET' },
      options
    );
    return DownloadCapabilityResponseSchema.parse(raw);
  }

  async getFileMetadata(
    workspaceId: string,
    fileId: string,
    options?: RequestOptions
  ): Promise<FileItemResponse> {
    const raw = await this.request<unknown>(
      `/v1/workspaces/${workspaceId}/files/${fileId}`,
      { method: 'GET' },
      options
    );
    return FileItemResponseSchema.parse(raw);
  }

  async deleteFile(
    workspaceId: string,
    fileId: string,
    options?: RequestOptions
  ): Promise<{ data: { success: boolean }; meta: { requestId: string } }> {
    const raw = await this.request<{ data: { success: boolean }; meta: { requestId: string } }>(
      `/v1/workspaces/${workspaceId}/files/${fileId}`,
      { method: 'DELETE' },
      options
    );
    return raw;
  }

  // --- Item Attachments ---

  async linkItemAttachment(
    workspaceId: string,
    itemId: string,
    payload: LinkItemAttachmentRequest,
    options?: RequestOptions
  ): Promise<ItemAttachmentResponse> {
    const raw = await this.request<unknown>(
      `/v1/workspaces/${workspaceId}/items/${itemId}/attachments`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      options
    );
    return ItemAttachmentResponseSchema.parse(raw);
  }

  async listItemAttachments(
    workspaceId: string,
    itemId: string,
    options?: RequestOptions
  ): Promise<ListItemAttachmentsResponse> {
    const raw = await this.request<unknown>(
      `/v1/workspaces/${workspaceId}/items/${itemId}/attachments`,
      { method: 'GET' },
      options
    );
    return ListItemAttachmentsResponseSchema.parse(raw);
  }

  async unlinkItemAttachment(
    workspaceId: string,
    itemId: string,
    attachmentId: string,
    options?: RequestOptions
  ): Promise<{ data: { success: boolean }; meta: { requestId: string } }> {
    return this.request<{ data: { success: boolean }; meta: { requestId: string } }>(
      `/v1/workspaces/${workspaceId}/items/${itemId}/attachments/${attachmentId}`,
      { method: 'DELETE' },
      options
    );
  }

  // --- Calendar API methods (Phase 26) ---

  async getCalendarFeed(
    workspaceId: string,
    query: CalendarFeedQuery,
    options?: RequestOptions
  ): Promise<CalendarReadModelResponse> {
    const params = new URLSearchParams();
    params.set('startDate', query.startDate);
    params.set('endDate', query.endDate);
    if (query.timezone) params.set('timezone', query.timezone);
    if (query.includeTasks !== undefined) params.set('includeTasks', String(query.includeTasks));
    if (query.includeRoutines !== undefined)
      params.set('includeRoutines', String(query.includeRoutines));
    if (query.includeEvents !== undefined) params.set('includeEvents', String(query.includeEvents));
    if (query.includeJournalIndicators !== undefined)
      params.set('includeJournalIndicators', String(query.includeJournalIndicators));

    const raw = await this.request<unknown>(
      `/v1/workspaces/${workspaceId}/calendar/feed?${params.toString()}`,
      { method: 'GET' },
      options
    );
    return CalendarReadModelResponseSchema.parse(raw);
  }

  async createCalendarEvent(
    workspaceId: string,
    data: CreateCalendarEventRequest,
    options?: RequestOptions
  ): Promise<CalendarEventResponse> {
    const raw = await this.request<unknown>(
      `/v1/workspaces/${workspaceId}/calendar/events`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      },
      options
    );
    return CalendarEventResponseSchema.parse(raw);
  }

  async getCalendarEvent(
    workspaceId: string,
    eventId: string,
    options?: RequestOptions
  ): Promise<CalendarEventResponse> {
    const raw = await this.request<unknown>(
      `/v1/workspaces/${workspaceId}/calendar/events/${eventId}`,
      { method: 'GET' },
      options
    );
    return CalendarEventResponseSchema.parse(raw);
  }

  async updateCalendarEvent(
    workspaceId: string,
    eventId: string,
    data: UpdateCalendarEventRequest,
    options?: RequestOptions
  ): Promise<CalendarEventResponse> {
    const raw = await this.request<unknown>(
      `/v1/workspaces/${workspaceId}/calendar/events/${eventId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(data),
      },
      options
    );
    return CalendarEventResponseSchema.parse(raw);
  }

  async deleteCalendarEvent(
    workspaceId: string,
    eventId: string,
    options?: RequestOptions
  ): Promise<{ data: { success: boolean; eventId: string }; meta?: { requestId: string } }> {
    const raw = await this.request<{
      data: { success: boolean; eventId: string };
      meta?: { requestId: string };
    }>(`/v1/workspaces/${workspaceId}/calendar/events/${eventId}`, { method: 'DELETE' }, options);
    return raw;
  }

  // --- Phase 27: Reminders ---

  async createReminderRule(
    workspaceId: string,
    data: CreateReminderRuleRequest,
    options?: RequestOptions
  ): Promise<ReminderRuleResponse> {
    const raw = await this.request<unknown>(
      `/v1/workspaces/${workspaceId}/reminders/rules`,
      { method: 'POST', body: JSON.stringify(data) },
      options
    );
    return ReminderRuleResponseSchema.parse(raw);
  }

  async listReminderRules(
    workspaceId: string,
    query?: { targetId?: string },
    options?: RequestOptions
  ): Promise<ReminderRuleListResponse> {
    const params = new URLSearchParams();
    if (query?.targetId) params.set('targetId', query.targetId);
    const qs = params.toString() ? `?${params.toString()}` : '';
    const raw = await this.request<unknown>(
      `/v1/workspaces/${workspaceId}/reminders/rules${qs}`,
      { method: 'GET' },
      options
    );
    return ReminderRuleListResponseSchema.parse(raw);
  }

  async getReminderRule(
    workspaceId: string,
    ruleId: string,
    options?: RequestOptions
  ): Promise<ReminderRuleResponse> {
    const raw = await this.request<unknown>(
      `/v1/workspaces/${workspaceId}/reminders/rules/${ruleId}`,
      { method: 'GET' },
      options
    );
    return ReminderRuleResponseSchema.parse(raw);
  }

  async updateReminderRule(
    workspaceId: string,
    ruleId: string,
    data: UpdateReminderRuleRequest,
    options?: RequestOptions
  ): Promise<ReminderRuleResponse> {
    const raw = await this.request<unknown>(
      `/v1/workspaces/${workspaceId}/reminders/rules/${ruleId}`,
      { method: 'PATCH', body: JSON.stringify(data) },
      options
    );
    return ReminderRuleResponseSchema.parse(raw);
  }

  async deleteReminderRule(
    workspaceId: string,
    ruleId: string,
    options?: RequestOptions
  ): Promise<{ data: { success: boolean; id: string }; meta?: { requestId: string } }> {
    const raw = await this.request<{
      data: { success: boolean; id: string };
      meta?: { requestId: string };
    }>(`/v1/workspaces/${workspaceId}/reminders/rules/${ruleId}`, { method: 'DELETE' }, options);
    return raw;
  }

  async listReminderInstances(
    workspaceId: string,
    query?: { status?: string; targetId?: string },
    options?: RequestOptions
  ): Promise<ReminderInstanceListResponse> {
    const params = new URLSearchParams();
    if (query?.status) params.set('status', query.status);
    if (query?.targetId) params.set('targetId', query.targetId);
    const qs = params.toString() ? `?${params.toString()}` : '';
    const raw = await this.request<unknown>(
      `/v1/workspaces/${workspaceId}/reminders/instances${qs}`,
      { method: 'GET' },
      options
    );
    return ReminderInstanceListResponseSchema.parse(raw);
  }

  async snoozeReminderInstance(
    workspaceId: string,
    instanceId: string,
    data: SnoozeReminderRequest,
    options?: RequestOptions
  ): Promise<ReminderInstanceResponse> {
    const raw = await this.request<unknown>(
      `/v1/workspaces/${workspaceId}/reminders/instances/${instanceId}/snooze`,
      { method: 'POST', body: JSON.stringify(data) },
      options
    );
    return ReminderInstanceResponseSchema.parse(raw);
  }

  async recordDeliveryReceipt(
    workspaceId: string,
    deliveryId: string,
    data: RecordDeliveryReceiptRequest,
    options?: RequestOptions
  ): Promise<ReminderDeliveryResponse> {
    const raw = await this.request<unknown>(
      `/v1/workspaces/${workspaceId}/reminders/deliveries/${deliveryId}/receipt`,
      { method: 'POST', body: JSON.stringify(data) },
      options
    );
    return ReminderDeliveryResponseSchema.parse(raw);
  }

  // --- Devices & Local Reminders (Phase 28) ---

  async registerDevice(
    data: RegisterDeviceRequest,
    options?: RequestOptions
  ): Promise<DeviceResponse> {
    const raw = await this.request<unknown>(
      '/v1/devices',
      { method: 'POST', body: JSON.stringify(data) },
      options
    );
    return DeviceResponseSchema.parse(raw);
  }

  async deactivateDevice(
    deviceId: string,
    options?: RequestOptions
  ): Promise<{ data: { success: boolean; id: string }; meta?: { requestId: string } }> {
    const raw = await this.request<{
      data: { success: boolean; id: string };
      meta?: { requestId: string };
    }>(`/v1/devices/${deviceId}`, { method: 'DELETE' }, options);
    return raw;
  }

  async listUserDevices(options?: RequestOptions): Promise<DeviceListResponse> {
    const raw = await this.request<unknown>('/v1/devices', { method: 'GET' }, options);
    return DeviceListResponseSchema.parse(raw);
  }

  async acknowledgeDeviceSchedule(
    workspaceId: string,
    data: AcknowledgeDeviceScheduleRequest,
    options?: RequestOptions
  ): Promise<DeviceScheduleResponse> {
    const raw = await this.request<unknown>(
      `/v1/workspaces/${workspaceId}/reminders/schedules/acknowledge`,
      { method: 'POST', body: JSON.stringify(data) },
      options
    );
    return DeviceScheduleResponseSchema.parse(raw);
  }

  async listDeviceSchedules(
    workspaceId: string,
    instanceId: string,
    options?: RequestOptions
  ): Promise<DeviceScheduleListResponse> {
    const raw = await this.request<unknown>(
      `/v1/workspaces/${workspaceId}/reminders/instances/${instanceId}/schedules`,
      { method: 'GET' },
      options
    );
    return DeviceScheduleListResponseSchema.parse(raw);
  }

  // --- Web Push Subscriptions (Phase 29) ---

  async getVapidPublicKey(options?: RequestOptions): Promise<VapidPublicKeyResponse> {
    const raw = await this.request<unknown>(
      '/v1/web-push/vapid-public-key',
      { method: 'GET' },
      options
    );
    return VapidPublicKeyResponseSchema.parse(raw);
  }

  async registerWebPushSubscription(
    data: RegisterWebPushSubscriptionRequest,
    options?: RequestOptions
  ): Promise<WebPushSubscriptionResponse> {
    const raw = await this.request<unknown>(
      '/v1/web-push/subscriptions',
      { method: 'POST', body: JSON.stringify(data) },
      options
    );
    return WebPushSubscriptionResponseSchema.parse(raw);
  }

  async deactivateWebPushSubscription(
    endpoint: string,
    options?: RequestOptions
  ): Promise<{ success: boolean }> {
    const raw = await this.request<{ success: boolean }>(
      '/v1/web-push/subscriptions',
      { method: 'DELETE', body: JSON.stringify({ endpoint }) },
      options
    );
    return raw;
  }

  async listWebPushSubscriptions(
    options?: RequestOptions
  ): Promise<WebPushSubscriptionListResponse> {
    const raw = await this.request<unknown>(
      '/v1/web-push/subscriptions',
      { method: 'GET' },
      options
    );
    return WebPushSubscriptionListResponseSchema.parse(raw);
  }

  // --- Knowledge & Saved Views (Phase 32) ---

  async listSavedViews(
    workspaceId: string,
    options?: RequestOptions
  ): Promise<SavedViewListResponse> {
    const raw = await this.request<unknown>(
      `/v1/workspaces/${encodeURIComponent(workspaceId)}/saved-views`,
      { method: 'GET' },
      options
    );
    return SavedViewListResponseSchema.parse(raw);
  }

  async createSavedView(
    workspaceId: string,
    data: CreateSavedViewRequest,
    options?: RequestOptions
  ): Promise<SavedViewResponse> {
    const raw = await this.request<unknown>(
      `/v1/workspaces/${encodeURIComponent(workspaceId)}/saved-views`,
      { method: 'POST', body: JSON.stringify(data) },
      options
    );
    return SavedViewResponseSchema.parse(raw);
  }

  async getSavedView(
    workspaceId: string,
    viewId: string,
    options?: RequestOptions
  ): Promise<SavedViewResponse> {
    const raw = await this.request<unknown>(
      `/v1/workspaces/${encodeURIComponent(workspaceId)}/saved-views/${encodeURIComponent(viewId)}`,
      { method: 'GET' },
      options
    );
    return SavedViewResponseSchema.parse(raw);
  }

  async updateSavedView(
    workspaceId: string,
    viewId: string,
    data: UpdateSavedViewRequest,
    options?: RequestOptions
  ): Promise<SavedViewResponse> {
    const raw = await this.request<unknown>(
      `/v1/workspaces/${encodeURIComponent(workspaceId)}/saved-views/${encodeURIComponent(viewId)}`,
      { method: 'PATCH', body: JSON.stringify(data) },
      options
    );
    return SavedViewResponseSchema.parse(raw);
  }

  async deleteSavedView(
    workspaceId: string,
    viewId: string,
    options?: RequestOptions
  ): Promise<void> {
    await this.request<unknown>(
      `/v1/workspaces/${encodeURIComponent(workspaceId)}/saved-views/${encodeURIComponent(viewId)}`,
      { method: 'DELETE' },
      options
    );
  }

  async getItemResolvedLinks(
    workspaceId: string,
    itemId: string,
    options?: RequestOptions
  ): Promise<ResolvedItemLinkListResponse> {
    const raw = await this.request<unknown>(
      `/v1/workspaces/${encodeURIComponent(workspaceId)}/items/${encodeURIComponent(itemId)}/links/resolved`,
      { method: 'GET' },
      options
    );
    return ResolvedItemLinkListResponseSchema.parse(raw);
  }

  // --- Global Authorized Search ---

  async searchWorkspace(
    workspaceId: string,
    query: SearchQueryInput,
    options?: RequestOptions
  ): Promise<SearchResponse> {
    const params = new URLSearchParams();
    if (query.q) params.set('q', query.q);
    if (query.types && query.types.length > 0) {
      for (const t of query.types) {
        params.append('types', t);
      }
    }
    if (query.folderId) params.set('folderId', query.folderId);
    if (query.tagNames && query.tagNames.length > 0) {
      for (const tag of query.tagNames) {
        params.append('tagNames', tag);
      }
    }
    if (query.startDate) params.set('startDate', query.startDate);
    if (query.endDate) params.set('endDate', query.endDate);
    if (query.includeArchived) params.set('includeArchived', 'true');
    if (query.limit !== undefined) params.set('limit', String(query.limit));
    if (query.offset !== undefined) params.set('offset', String(query.offset));

    const queryString = params.toString();
    const endpoint = `/v1/workspaces/${encodeURIComponent(workspaceId)}/search${queryString ? `?${queryString}` : ''}`;
    const raw = await this.request<unknown>(endpoint, { method: 'GET' }, options);
    return SearchResponseSchema.parse(raw);
  }

  // --- Workspace Portability (Export & Import) ---

  async reauthenticate(
    request: ReauthenticateRequest,
    options?: RequestOptions
  ): Promise<ReauthenticateResponse> {
    const raw = await this.request<unknown>(
      '/v1/auth/reauthenticate',
      {
        method: 'POST',
        body: JSON.stringify(request),
        headers: { 'Content-Type': 'application/json' },
      },
      options
    );
    return ReauthenticateResponseSchema.parse(raw);
  }

  async createWorkspaceExport(
    workspaceId: string,
    request: CreateExportRequest,
    options?: RequestOptions
  ): Promise<CreateExportResponse> {
    const raw = await this.request<unknown>(
      `/v1/workspaces/${encodeURIComponent(workspaceId)}/export`,
      {
        method: 'POST',
        body: JSON.stringify(request),
        headers: {
          'Content-Type': 'application/json',
          'x-reauth-token': request.reauthToken,
        },
      },
      options
    );
    return CreateExportResponseSchema.parse(raw);
  }

  async previewWorkspaceImport(
    workspaceId: string,
    archive: { archiveBase64: string },
    options?: RequestOptions
  ): Promise<ImportPreviewResponse> {
    const raw = await this.request<unknown>(
      `/v1/workspaces/${encodeURIComponent(workspaceId)}/import/preview`,
      {
        method: 'POST',
        body: JSON.stringify(archive),
        headers: { 'Content-Type': 'application/json' },
      },
      options
    );
    return ImportPreviewResponseSchema.parse(raw);
  }

  async executeWorkspaceImport(
    workspaceId: string,
    request: ExecuteImportRequest,
    options?: RequestOptions
  ): Promise<ExecuteImportResponse> {
    const raw = await this.request<unknown>(
      `/v1/workspaces/${encodeURIComponent(workspaceId)}/import/execute`,
      {
        method: 'POST',
        body: JSON.stringify(request),
        headers: { 'Content-Type': 'application/json' },
      },
      options
    );
    return ExecuteImportResponseSchema.parse(raw);
  }

  // --- Phase 36: Account & Workspace Deletion Lifecycle ---

  async requestAccountDeletion(
    body: RequestAccountDeletionBody = {},
    options?: RequestOptions
  ): Promise<RequestAccountDeletionResponse> {
    const raw = await this.request<unknown>(
      `/v1/auth/account-deletion/request`,
      {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
      },
      options
    );
    return RequestAccountDeletionResponseSchema.parse(raw);
  }

  async confirmAccountDeletion(
    body: ConfirmAccountDeletionBody,
    options?: RequestOptions
  ): Promise<ConfirmAccountDeletionResponse> {
    const raw = await this.request<unknown>(
      `/v1/auth/account-deletion/confirm`,
      {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
      },
      options
    );
    return ConfirmAccountDeletionResponseSchema.parse(raw);
  }

  async cancelAccountDeletion(
    body: CancelAccountDeletionBody = {},
    options?: RequestOptions
  ): Promise<CancelAccountDeletionResponse> {
    const raw = await this.request<unknown>(
      `/v1/auth/account-deletion/cancel`,
      {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
      },
      options
    );
    return CancelAccountDeletionResponseSchema.parse(raw);
  }

  async getAccountDeletionStatus(options?: RequestOptions): Promise<AccountDeletionStatusResponse> {
    const raw = await this.request<unknown>(
      `/v1/auth/account-deletion/status`,
      { method: 'GET' },
      options
    );
    return AccountDeletionStatusResponseSchema.parse(raw);
  }

  async deleteWorkspace(
    workspaceId: string,
    body: RequestWorkspaceDeletionBody = {},
    options?: RequestOptions
  ): Promise<RequestWorkspaceDeletionResponse> {
    const raw = await this.request<unknown>(
      `/v1/workspaces/${encodeURIComponent(workspaceId)}/deletion`,
      {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
      },
      options
    );
    return RequestWorkspaceDeletionResponseSchema.parse(raw);
  }

  async submitPublicDeletionRequest(
    body: PublicDeletionRequestSubmission,
    options?: RequestOptions
  ): Promise<PublicDeletionRequestResponse> {
    const raw = await this.request<unknown>(
      `/v1/public/account-deletion-request`,
      {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
      },
      options
    );
    return PublicDeletionRequestResponseSchema.parse(raw);
  }

  async verifyPublicDeletionRequest(
    body: VerifyPublicDeletionRequestBody,
    options?: RequestOptions
  ): Promise<VerifyPublicDeletionResponse> {
    const raw = await this.request<unknown>(
      `/v1/public/account-deletion-request/verify`,
      {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
      },
      options
    );
    return VerifyPublicDeletionResponseSchema.parse(raw);
  }

  // --- Expenses (Phase 39) ---

  async createExpenseCategory(
    workspaceId: string,
    body: CreateExpenseCategoryBody,
    options?: RequestOptions
  ): Promise<ExpenseCategoryResponse> {
    const raw = await this.request<unknown>(
      `/v1/workspaces/${workspaceId}/expenses/categories`,
      { method: 'POST', body: JSON.stringify(body) },
      options
    );
    return ExpenseCategoryResponseSchema.parse(raw);
  }

  async listExpenseCategories(
    workspaceId: string,
    options?: RequestOptions
  ): Promise<ExpenseCategoryListResponse> {
    const raw = await this.request<unknown>(
      `/v1/workspaces/${workspaceId}/expenses/categories`,
      { method: 'GET' },
      options
    );
    return ExpenseCategoryListResponseSchema.parse(raw);
  }

  async updateExpenseCategory(
    workspaceId: string,
    categoryId: string,
    body: UpdateExpenseCategoryBody,
    options?: RequestOptions
  ): Promise<ExpenseCategoryResponse> {
    const raw = await this.request<unknown>(
      `/v1/workspaces/${workspaceId}/expenses/categories/${categoryId}`,
      { method: 'PATCH', body: JSON.stringify(body) },
      options
    );
    return ExpenseCategoryResponseSchema.parse(raw);
  }

  async deleteExpenseCategory(
    workspaceId: string,
    categoryId: string,
    options?: RequestOptions
  ): Promise<{ data: { success: boolean; id: string } }> {
    return this.request<{ data: { success: boolean; id: string } }>(
      `/v1/workspaces/${workspaceId}/expenses/categories/${categoryId}`,
      { method: 'DELETE' },
      options
    );
  }

  async createExpense(
    workspaceId: string,
    body: CreateExpenseBody,
    options?: RequestOptions
  ): Promise<ExpenseResponse> {
    const raw = await this.request<unknown>(
      `/v1/workspaces/${workspaceId}/expenses`,
      { method: 'POST', body: JSON.stringify(body) },
      options
    );
    return ExpenseResponseSchema.parse(raw);
  }

  async getExpense(
    workspaceId: string,
    expenseId: string,
    options?: RequestOptions
  ): Promise<ExpenseResponse> {
    const raw = await this.request<unknown>(
      `/v1/workspaces/${workspaceId}/expenses/${expenseId}`,
      { method: 'GET' },
      options
    );
    return ExpenseResponseSchema.parse(raw);
  }

  async listExpenses(
    workspaceId: string,
    query?: ExpenseListQuery,
    options?: RequestOptions
  ): Promise<ExpenseListResponse> {
    const q = new URLSearchParams();
    if (query?.year) q.set('year', String(query.year));
    if (query?.month) q.set('month', String(query.month));
    if (query?.startDate) q.set('startDate', query.startDate);
    if (query?.endDate) q.set('endDate', query.endDate);
    if (query?.kind) q.set('kind', query.kind);
    if (query?.categoryId) q.set('categoryId', query.categoryId);
    if (query?.currency) q.set('currency', query.currency);
    if (query?.folderId) q.set('folderId', query.folderId);
    if (query?.limit) q.set('limit', String(query.limit));
    if (query?.cursor) q.set('cursor', query.cursor);

    const queryString = q.toString();
    const path = `/v1/workspaces/${workspaceId}/expenses${queryString ? `?${queryString}` : ''}`;
    const raw = await this.request<unknown>(path, { method: 'GET' }, options);
    return ExpenseListResponseSchema.parse(raw);
  }

  async updateExpense(
    workspaceId: string,
    expenseId: string,
    body: UpdateExpenseBody,
    options?: RequestOptions
  ): Promise<ExpenseResponse> {
    const raw = await this.request<unknown>(
      `/v1/workspaces/${workspaceId}/expenses/${expenseId}`,
      { method: 'PATCH', body: JSON.stringify(body) },
      options
    );
    return ExpenseResponseSchema.parse(raw);
  }

  async trashExpense(
    workspaceId: string,
    expenseId: string,
    options?: RequestOptions
  ): Promise<{ data: { success: boolean; id: string; seq: number } }> {
    return this.request<{ data: { success: boolean; id: string; seq: number } }>(
      `/v1/workspaces/${workspaceId}/expenses/${expenseId}/trash`,
      { method: 'POST' },
      options
    );
  }

  async restoreExpense(
    workspaceId: string,
    expenseId: string,
    options?: RequestOptions
  ): Promise<{ data: { success: boolean; id: string; seq: number } }> {
    return this.request<{ data: { success: boolean; id: string; seq: number } }>(
      `/v1/workspaces/${workspaceId}/expenses/${expenseId}/restore`,
      { method: 'POST' },
      options
    );
  }

  async getExpenseMonthlySummary(
    workspaceId: string,
    params: { year: number; month: number },
    options?: RequestOptions
  ): Promise<ExpenseMonthlySummaryResponse> {
    const raw = await this.request<unknown>(
      `/v1/workspaces/${workspaceId}/expenses/summary?year=${params.year}&month=${params.month}`,
      { method: 'GET' },
      options
    );
    return ExpenseMonthlySummaryResponseSchema.parse(raw);
  }

  async createExpenseRecurringTemplate(
    workspaceId: string,
    body: CreateExpenseRecurringTemplateBody,
    options?: RequestOptions
  ): Promise<ExpenseRecurringTemplateResponse> {
    const raw = await this.request<unknown>(
      `/v1/workspaces/${workspaceId}/expenses/recurring`,
      { method: 'POST', body: JSON.stringify(body) },
      options
    );
    return ExpenseRecurringTemplateResponseSchema.parse(raw);
  }

  async listExpenseRecurringTemplates(
    workspaceId: string,
    options?: RequestOptions
  ): Promise<ExpenseRecurringTemplateListResponse> {
    const raw = await this.request<unknown>(
      `/v1/workspaces/${workspaceId}/expenses/recurring`,
      { method: 'GET' },
      options
    );
    return ExpenseRecurringTemplateListResponseSchema.parse(raw);
  }

  async generateRecurringOccurrences(
    workspaceId: string,
    body: { untilDate: string },
    options?: RequestOptions
  ): Promise<{ data: { generatedCount: number; expenseIds: string[] } }> {
    return this.request<{ data: { generatedCount: number; expenseIds: string[] } }>(
      `/v1/workspaces/${workspaceId}/expenses/recurring/generate`,
      { method: 'POST', body: JSON.stringify(body) },
      options
    );
  }

  async createExpenseBudget(
    workspaceId: string,
    body: CreateExpenseBudgetBody,
    options?: RequestOptions
  ): Promise<ExpenseBudgetResponse> {
    const raw = await this.request<unknown>(
      `/v1/workspaces/${workspaceId}/expenses/budgets`,
      { method: 'POST', body: JSON.stringify(body) },
      options
    );
    return ExpenseBudgetResponseSchema.parse(raw);
  }

  async listExpenseBudgets(
    workspaceId: string,
    query?: { period?: string; currency?: string },
    options?: RequestOptions
  ): Promise<ExpenseBudgetListResponse> {
    const searchParams = new URLSearchParams();
    if (query?.period) searchParams.set('period', query.period);
    if (query?.currency) searchParams.set('currency', query.currency);
    const qs = searchParams.toString() ? `?${searchParams.toString()}` : '';

    const raw = await this.request<unknown>(
      `/v1/workspaces/${workspaceId}/expenses/budgets${qs}`,
      { method: 'GET' },
      options
    );
    return ExpenseBudgetListResponseSchema.parse(raw);
  }

  async updateExpenseBudget(
    workspaceId: string,
    budgetId: string,
    body: UpdateExpenseBudgetBody,
    options?: RequestOptions
  ): Promise<ExpenseBudgetResponse> {
    const raw = await this.request<unknown>(
      `/v1/workspaces/${workspaceId}/expenses/budgets/${budgetId}`,
      { method: 'PATCH', body: JSON.stringify(body) },
      options
    );
    return ExpenseBudgetResponseSchema.parse(raw);
  }

  async deleteExpenseBudget(
    workspaceId: string,
    budgetId: string,
    options?: RequestOptions
  ): Promise<{ data: { success: boolean; id: string } }> {
    return this.request<{ data: { success: boolean; id: string } }>(
      `/v1/workspaces/${workspaceId}/expenses/budgets/${budgetId}`,
      { method: 'DELETE' },
      options
    );
  }

  async exportExpensesCsv(
    workspaceId: string,
    filter?: ExpenseExportQuery,
    options?: RequestOptions
  ): Promise<string> {
    const searchParams = new URLSearchParams();
    if (filter?.startDate) searchParams.set('startDate', filter.startDate);
    if (filter?.endDate) searchParams.set('endDate', filter.endDate);
    if (filter?.categoryId) searchParams.set('categoryId', filter.categoryId);
    if (filter?.currency) searchParams.set('currency', filter.currency);
    if (filter?.kind) searchParams.set('kind', filter.kind);
    const qs = searchParams.toString() ? `?${searchParams.toString()}` : '';

    const url = `${this.baseUrl}/v1/workspaces/${workspaceId}/expenses/export${qs}`;
    const token = await this.resolveToken();
    const headers: Record<string, string> = {
      ...(options?.headers || {}),
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const response = await this.fetch(url, {
      method: 'GET',
      headers,
    });
    if (!response.ok) {
      await this.handleErrorResponse(response);
    }
    return response.text();
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
