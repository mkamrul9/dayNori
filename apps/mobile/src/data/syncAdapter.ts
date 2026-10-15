import {
  SyncEngine,
  ApiClientSyncTransport,
  SingleProcessCoordinator,
  type AccountNamespace,
  type LocalRepositoryPort,
  type SyncEngineOptions,
} from '@daynori/sync';
import type { DaynoriApiClient } from '@daynori/api-client';

export interface MobileSyncAdapterOptions {
  repository: LocalRepositoryPort;
  apiClient: DaynoriApiClient;
  namespace: AccountNamespace;
  deviceId?: string;
  pollIntervalMs?: number;
}

/**
 * Creates and initializes a SyncEngine instance configured specifically for
 * the mobile Android environment.
 */
export function createMobileSyncEngine(options: MobileSyncAdapterOptions): SyncEngine {
  const deviceId = options.deviceId || `mobile_android_${Math.random().toString(36).slice(2, 10)}`;

  const transport = new ApiClientSyncTransport(options.apiClient);
  const coordination = new SingleProcessCoordinator();

  const engineOptions: SyncEngineOptions = {
    repository: options.repository,
    transport,
    namespace: options.namespace,
    deviceId,
    coordination,
    pollIntervalMs: options.pollIntervalMs ?? 30000,
  };

  return new SyncEngine(engineOptions);
}
