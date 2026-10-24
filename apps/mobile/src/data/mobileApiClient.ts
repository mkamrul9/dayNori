import { createApiClient, type ApiClientOptions } from '@daynori/api-client';
import { defaultAuthAdapter } from '../auth/authAdapter.js';
import { getMobileRuntimeConfig, mobileApiTimeoutMs } from '../config/runtime.js';

/** Resolve credentials per request so logout and renewed sessions cannot reuse a captured token. */
export function createMobileApiClient(options?: Pick<ApiClientOptions, 'fetchFn'>) {
  return createApiClient({
    baseUrl: getMobileRuntimeConfig().apiBaseUrl,
    defaultTimeoutMs: mobileApiTimeoutMs,
    token: () => defaultAuthAdapter.getAccessToken(),
    ...options,
  });
}
