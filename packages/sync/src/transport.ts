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
  push(request: SyncPushRequest): Promise<SyncPushResponse>;
  pull(query: SyncPullQuery): Promise<SyncPullResponse>;
  bootstrap(query: SyncBootstrapQuery): Promise<SyncBootstrapResponse>;
}

export interface ClassifiedSyncError {
  isNetworkError: boolean;
  isAuthError: boolean;
  isResetRequired: boolean;
  isRateLimited: boolean;
  isClientError: boolean;
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
    statusCode === 0;

  const isAuthError =
    statusCode === 401 ||
    statusCode === 403 ||
    code === 'UNAUTHORIZED' ||
    code === 'FORBIDDEN' ||
    code === 'AUTH_EXPIRED' ||
    code === 'TOKEN_REVOKED';

  const isResetRequired =
    statusCode === 409 ||
    code === 'SYNC_RESET_REQUIRED' ||
    message.includes('SYNC_RESET_REQUIRED');

  const isRateLimited = statusCode === 429;
  const retryAfter = typeof err.retryAfter === 'number' ? err.retryAfter * 1000 : undefined;

  const isClientError = statusCode !== undefined && statusCode >= 400 && statusCode < 500 && !isRateLimited;

  return {
    isNetworkError,
    isAuthError,
    isResetRequired,
    isRateLimited,
    isClientError,
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
  constructor(
    private client: {
      syncPush(req: SyncPushRequest): Promise<SyncPushResponse>;
      syncPull(query: SyncPullQuery): Promise<SyncPullResponse>;
      syncBootstrap(query: SyncBootstrapQuery): Promise<SyncBootstrapResponse>;
    }
  ) {}

  push(request: SyncPushRequest): Promise<SyncPushResponse> {
    return this.client.syncPush(request);
  }

  pull(query: SyncPullQuery): Promise<SyncPullResponse> {
    return this.client.syncPull(query);
  }

  bootstrap(query: SyncBootstrapQuery): Promise<SyncBootstrapResponse> {
    return this.client.syncBootstrap(query);
  }
}

