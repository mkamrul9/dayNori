import {
  SyncEngine,
  ApiClientSyncTransport,
  SingleProcessCoordinator,
  type AccountNamespace,
  type LocalRepositoryPort,
  type SyncEngineOptions,
} from '@daynori/sync';
import type { DaynoriApiClient } from '@daynori/api-client';
import { defaultSecureStorage, type SecureStoreContract } from '../auth/secureStorage.js';
import { createMobileDeviceId } from '../platform/nativePlatform.js';

export interface MobileSyncAdapterOptions {
  repository: LocalRepositoryPort;
  apiClient: DaynoriApiClient;
  namespace: AccountNamespace;
  deviceId?: string;
  secureStore?: SecureStoreContract;
  pollIntervalMs?: number;
}

let cachedMobileDeviceId: string | null = null;

/** Test helper — clears in-memory device id cache between cases. */
export function resetMobileDeviceIdCacheForTests(): void {
  cachedMobileDeviceId = null;
}

export async function getOrCreateMobileDeviceId(
  secureStore: SecureStoreContract = defaultSecureStorage
): Promise<string> {
  if (cachedMobileDeviceId) return cachedMobileDeviceId;
  try {
    const stored = await secureStore.getItemAsync('daynori_native_device_id');
    if (stored) {
      cachedMobileDeviceId = stored;
      return stored;
    }
  } catch {
    /* fallback to in-memory/cached */
  }

  const newId = createMobileDeviceId();
  try {
    await secureStore.setItemAsync('daynori_native_device_id', newId);
  } catch {
    /* ignore storage write failures */
  }
  cachedMobileDeviceId = newId;
  return newId;
}

/**
 * Creates and initializes a SyncEngine instance for the mobile native shell
 * (Android or iOS) with a persisted device ID.
 */
export function createMobileSyncEngine(options: MobileSyncAdapterOptions): SyncEngine {
  const deviceId =
    options.deviceId ||
    cachedMobileDeviceId ||
    (() => {
      const id = createMobileDeviceId();
      cachedMobileDeviceId = id;
      // Asynchronously persist to secure storage if available
      void (options.secureStore ?? defaultSecureStorage)
        .setItemAsync('daynori_native_device_id', id)
        .catch(() => {});
      return id;
    })();

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
