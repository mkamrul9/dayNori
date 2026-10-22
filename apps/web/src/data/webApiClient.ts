import { createApiClient, type DaynoriApiClient } from '@daynori/api-client';
import { isCorePreview } from '../config/preview';

/**
 * Reads double-submit CSRF cookie value from document.cookie in browser context.
 */
export function getWebCsrfToken(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|;\s*)daynori_csrf_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]!) : null;
}

export interface WebApiClientOptions {
  csrfToken?: string | null;
  defaultTimeoutMs?: number;
}

/**
 * Creates an authenticated DaynoriApiClient configured for the Next.js BFF proxy (/api).
 * Automatically passes CSRF protection header for mutating requests using double-submit cookies.
 */
export function createWebApiClient(options?: WebApiClientOptions): DaynoriApiClient {
  return createApiClient({
    baseUrl: '/api',
    csrfToken: () => options?.csrfToken ?? getWebCsrfToken(),
    defaultTimeoutMs: options?.defaultTimeoutMs ?? (isCorePreview ? 75_000 : 10_000),
  });
}
