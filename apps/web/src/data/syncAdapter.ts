import {
  SyncEngine,
  ApiClientSyncTransport,
  BroadcastChannelTabCoordinator,
  type AccountNamespace,
  type LocalRepositoryPort,
  type SyncEngineOptions,
} from '@daynori/sync';
import type { DaynoriApiClient } from '@daynori/api-client';

export interface WebSyncAdapterOptions {
  repository: LocalRepositoryPort;
  apiClient: DaynoriApiClient;
  namespace: AccountNamespace;
  deviceId?: string;
  pollIntervalMs?: number;
}

/**
 * Creates and initializes a SyncEngine instance configured specifically for
 * the Web environment (with BroadcastChannel multi-tab coordination).
 */
export function createWebSyncEngine(options: WebSyncAdapterOptions): SyncEngine {
  const deviceId =
    options.deviceId ||
    (typeof window !== 'undefined'
      ? window.localStorage.getItem('daynori_device_id') ||
        (() => {
          const id = `web_${Math.random().toString(36).slice(2, 10)}`;
          window.localStorage.setItem('daynori_device_id', id);
          return id;
        })()
      : `web_node_${Math.random().toString(36).slice(2, 10)}`);

  const transport = new ApiClientSyncTransport(options.apiClient);
  const coordination = new BroadcastChannelTabCoordinator({
    channelName: `daynori_sync_${options.namespace.userId}_${options.namespace.workspaceId}`,
  });

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
