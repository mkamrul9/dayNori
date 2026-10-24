import type {
  SyncPushRequest,
  SyncPushResponse,
  SyncPullQuery,
  SyncPullResponse,
  SyncBootstrapQuery,
  SyncBootstrapResponse,
} from '@daynori/contracts';

/**
 * Port representing network transport for push, pull, and bootstrap operations.
 * Implemented by @daynori/api-client or custom network adapters.
 */
export interface SyncTransportPort {
  push(request: SyncPushRequest, options?: { signal?: AbortSignal }): Promise<SyncPushResponse>;
  pull(query: SyncPullQuery, options?: { signal?: AbortSignal }): Promise<SyncPullResponse>;
  bootstrap(
    query: SyncBootstrapQuery,
    options?: { signal?: AbortSignal }
  ): Promise<SyncBootstrapResponse>;
}

export interface ClassifiedSyncError {
  isNetworkError: boolean;
  isAuthError: boolean;
  isResetRequired: boolean;
  isRateLimited: boolean;
  isClientError: boolean;
  isMembershipRevoked?: boolean;
  retryAfterMs?: number;
  message: string;
  code?: string;
  statusCode?: number;
}

/**
 * Classifies an error received during synchronization to determine appropriate
 * state machine action (retry, backoff, auth lost, reset required, or terminal failure).
 */
export function classifySyncError(error: unknown): ClassifiedSyncError {
  if (!error || typeof error !== 'object') {
    return {
      isNetworkError: false,
      isAuthError: false,
      isResetRequired: false,
      isRateLimited: false,
      isClientError: false,
      message: String(error),
    };
  }

  const err = error as Record<string, unknown>;
  const statusCode = typeof err.statusCode === 'number' ? err.statusCode : undefined;
  const code = typeof err.code === 'string' ? err.code : undefined;
  const message = typeof err.message === 'string' ? err.message : 'Unknown error';

  const isNetworkError =
    code === 'NETWORK_ERROR' ||
    code === 'ECONNREFUSED' ||
    code === 'ETIMEDOUT' ||
    message.includes('fetch failed') ||
    message.includes('Network error') ||
    message.includes('aborted') ||
    statusCode === 0;

  const isAuthError =
    statusCode === 401 ||
    statusCode === 403 ||
    code === 'UNAUTHORIZED' ||
    code === 'FORBIDDEN' ||
    code === 'AUTH_EXPIRED' ||
    code === 'TOKEN_REVOKED';

  // Phase 52: Detect membership revocation signals
  const isMembershipRevoked =
    code === 'MEMBERSHIP_REVOKED' ||
    code === 'ROOM_ARCHIVED' ||
    (statusCode === 403 && message.toLowerCase().includes('access revoked'));

  // Specific protocol error code check: do NOT treat every HTTP 409 as a reset!
  const isResetRequired = code === 'SYNC_RESET_REQUIRED' || message.includes('SYNC_RESET_REQUIRED');

  const isRateLimited = statusCode === 429;
  const retryAfter = typeof err.retryAfter === 'number' ? err.retryAfter * 1000 : undefined;

  const isClientError =
    statusCode !== undefined && statusCode >= 400 && statusCode < 500 && !isRateLimited;

  return {
    isNetworkError,
    isAuthError,
    isResetRequired,
    isRateLimited,
    isClientError,
    isMembershipRevoked,
    retryAfterMs: retryAfter,
    message,
    code,
    statusCode,
  };
}

/**
 * SyncTransportPort adapter wrapping a DaynoriApiClient or any client
 * exposing syncPush, syncPull, and syncBootstrap methods.
 */
export class ApiClientSyncTransport implements SyncTransportPort {
  private client: {
    syncPush(req: SyncPushRequest, options?: { signal?: AbortSignal }): Promise<SyncPushResponse>;
    syncPull(query: SyncPullQuery, options?: { signal?: AbortSignal }): Promise<SyncPullResponse>;
    syncBootstrap(
      query: SyncBootstrapQuery,
      options?: { signal?: AbortSignal }
    ): Promise<SyncBootstrapResponse>;
  };

  constructor(
    clientOrOptions:
      | {
          syncPush(
            req: SyncPushRequest,
            options?: { signal?: AbortSignal }
          ): Promise<SyncPushResponse>;
          syncPull(
            query: SyncPullQuery,
            options?: { signal?: AbortSignal }
          ): Promise<SyncPullResponse>;
          syncBootstrap(
            query: SyncBootstrapQuery,
            options?: { signal?: AbortSignal }
          ): Promise<SyncBootstrapResponse>;
        }
      | {
          client: {
            syncPush(
              req: SyncPushRequest,
              options?: { signal?: AbortSignal }
            ): Promise<SyncPushResponse>;
            syncPull(
              query: SyncPullQuery,
              options?: { signal?: AbortSignal }
            ): Promise<SyncPullResponse>;
            syncBootstrap(
              query: SyncBootstrapQuery,
              options?: { signal?: AbortSignal }
            ): Promise<SyncBootstrapResponse>;
          };
        }
  ) {
    if ('client' in clientOrOptions && clientOrOptions.client) {
      this.client = clientOrOptions.client;
    } else {
      this.client = clientOrOptions as {
        syncPush(
          req: SyncPushRequest,
          options?: { signal?: AbortSignal }
        ): Promise<SyncPushResponse>;
        syncPull(
          query: SyncPullQuery,
          options?: { signal?: AbortSignal }
        ): Promise<SyncPullResponse>;
        syncBootstrap(
          query: SyncBootstrapQuery,
          options?: { signal?: AbortSignal }
        ): Promise<SyncBootstrapResponse>;
      };
    }
  }

  push(request: SyncPushRequest, options?: { signal?: AbortSignal }): Promise<SyncPushResponse> {
    return this.client.syncPush(request, options);
  }

  pull(query: SyncPullQuery, options?: { signal?: AbortSignal }): Promise<SyncPullResponse> {
    return this.client.syncPull(query, options);
  }

  bootstrap(
    query: SyncBootstrapQuery,
    options?: { signal?: AbortSignal }
  ): Promise<SyncBootstrapResponse> {
    return this.client.syncBootstrap(query, options);
  }
}
