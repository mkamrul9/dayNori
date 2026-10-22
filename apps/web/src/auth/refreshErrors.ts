/**
 * Distinguishes revoked/invalid refresh tokens from temporary outages
 * (cold starts, timeouts, 5xx) so session cookies are not wiped on wake.
 */

export type RefreshFailureKind = 'invalid_refresh' | 'unavailable';

export class RefreshAuthError extends Error {
  readonly kind: RefreshFailureKind;

  constructor(kind: RefreshFailureKind, message: string) {
    super(message);
    this.name = 'RefreshAuthError';
    this.kind = kind;
  }
}

export function isInvalidRefreshError(err: unknown): boolean {
  if (err instanceof RefreshAuthError) return err.kind === 'invalid_refresh';
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes('invalid or expired refresh') ||
    msg.includes('invalid refresh') ||
    msg.includes('refresh token not found') ||
    msg.includes('already used')
  );
}

export function isUnavailableRefreshError(err: unknown): boolean {
  if (err instanceof RefreshAuthError) return err.kind === 'unavailable';
  if (!(err instanceof Error)) return true;
  return !isInvalidRefreshError(err);
}
