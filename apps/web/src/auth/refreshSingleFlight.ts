import { authProxy } from './session.js';

/** Per-instance single-flight so concurrent refreshes do not rotate one token twice. */
const refreshInFlight = new Map<string, Promise<{ accessToken: string; refreshToken: string }>>();

export function refreshSingleFlight(refreshToken: string) {
  const existing = refreshInFlight.get(refreshToken);
  if (existing) return existing;
  const pending = authProxy.refresh(refreshToken).finally(() => {
    refreshInFlight.delete(refreshToken);
  });
  refreshInFlight.set(refreshToken, pending);
  return pending;
}
