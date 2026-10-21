/**
 * Phase 57 repair — Explicit Play subscriptionsv2 state handling.
 * Substring matching is forbidden; validity windows decide paid access for canceled subs.
 * Primary source: https://developer.android.com/google/play/billing/lifecycle/subscriptions
 * Reviewed 2026-10-21.
 */

export const PLAY_SUBSCRIPTION_STATES = [
  'SUBSCRIPTION_STATE_PENDING',
  'SUBSCRIPTION_STATE_ACTIVE',
  'SUBSCRIPTION_STATE_PAUSED',
  'SUBSCRIPTION_STATE_IN_GRACE_PERIOD',
  'SUBSCRIPTION_STATE_ON_HOLD',
  'SUBSCRIPTION_STATE_CANCELED',
  'SUBSCRIPTION_STATE_EXPIRED',
  'SUBSCRIPTION_STATE_REVOKED',
] as const;

export type PlaySubscriptionState = (typeof PLAY_SUBSCRIPTION_STATES)[number];

export type EntitlementAccessStatus =
  | 'pending'
  | 'active'
  | 'grace'
  | 'hold'
  | 'canceled'
  | 'expired'
  | 'revoked';

/** Local synthetic service token — not a production secret; hashed at migrate time for tests/dev. */
export const LOCAL_BILLING_SERVICE_TOKEN =
  'daynori-local-billing-service-token-v1-not-production';

export function normalizePlaySubscriptionState(
  raw: string
): PlaySubscriptionState | null {
  const trimmed = raw.trim();
  if ((PLAY_SUBSCRIPTION_STATES as readonly string[]).includes(trimmed)) {
    return trimmed as PlaySubscriptionState;
  }
  return null;
}

/**
 * Map authoritative provider state + validity window to access status.
 * Canceled retains access until expiryTime (Play lifecycle).
 * Pending never grants paid access.
 */
export function mapVerifiedSubscriptionToAccess(input: {
  subscriptionState: string;
  validUntilIso: string;
  nowMs?: number;
}): { status: EntitlementAccessStatus; grantsPaidAccess: boolean } {
  const now = input.nowMs ?? Date.now();
  const until = Date.parse(input.validUntilIso);
  const validRemaining = Number.isFinite(until) && until > now;
  const state = normalizePlaySubscriptionState(input.subscriptionState);

  if (!state) {
    return { status: 'expired', grantsPaidAccess: false };
  }

  switch (state) {
    case 'SUBSCRIPTION_STATE_PENDING':
      return { status: 'pending', grantsPaidAccess: false };
    case 'SUBSCRIPTION_STATE_ACTIVE':
      if (!validRemaining) return { status: 'expired', grantsPaidAccess: false };
      return { status: 'active', grantsPaidAccess: true };
    case 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD':
      if (!validRemaining) return { status: 'expired', grantsPaidAccess: false };
      return { status: 'grace', grantsPaidAccess: true };
    case 'SUBSCRIPTION_STATE_ON_HOLD':
    case 'SUBSCRIPTION_STATE_PAUSED':
      return { status: 'hold', grantsPaidAccess: false };
    case 'SUBSCRIPTION_STATE_CANCELED':
      if (validRemaining) return { status: 'canceled', grantsPaidAccess: true };
      return { status: 'expired', grantsPaidAccess: false };
    case 'SUBSCRIPTION_STATE_EXPIRED':
      return { status: 'expired', grantsPaidAccess: false };
    case 'SUBSCRIPTION_STATE_REVOKED':
      return { status: 'revoked', grantsPaidAccess: false };
    default:
      return { status: 'expired', grantsPaidAccess: false };
  }
}

export function resolveBillingServiceToken(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env
): string {
  const fromEnv = env['DAYNORI_BILLING_SERVICE_TOKEN'];
  if (typeof fromEnv === 'string' && fromEnv.length >= 16) return fromEnv;
  const nodeEnv = env['NODE_ENV'] ?? 'development';
  if (nodeEnv === 'production') {
    throw new Error('DAYNORI_BILLING_SERVICE_TOKEN required in production');
  }
  return LOCAL_BILLING_SERVICE_TOKEN;
}
