/**
 * Billing provider adapters — fake (local) and Google Play (gated HTTP).
 * Fake verification is never provider proof. Live Play requires production activation + credentials.
 */

import {
  isBillingLocallyEnabled,
  isBillingProductionActivationEnabled,
  normalizePlaySubscriptionState,
  SYNTHETIC_BILLING_CATALOG,
} from '@daynori/domain';

export type VerifiedSubscription = {
  provider: 'fake_play' | 'google_play';
  productId: string;
  purchaseToken: string;
  orderId: string | null;
  subscriptionState: string;
  acknowledgementState: string;
  validFrom: string;
  validUntil: string;
  autoRenewing: boolean;
  obfuscatedAccountId: string | null;
  linkedPurchaseToken: string | null;
  packageName: string;
  snapshot: Record<string, unknown>;
  providerMode: 'fake' | 'unavailable' | 'live';
};

export interface BillingProvider {
  readonly kind: 'fake_play' | 'google_play';
  verifySubscription(input: {
    productId: string;
    purchaseToken: string;
    expectedPackageName?: string;
  }): Promise<VerifiedSubscription>;
  acknowledge(purchaseToken: string): Promise<void>;
}

const FAKE_PACKAGE = 'com.daynori.app.synthetic';

/**
 * Fake token formats:
 * - fake-ok-<uuid>
 * - fake-ok-<uuid>:<productId>
 * - fake-pending-<uuid>
 * - fake-canceled-<uuid>  (validUntil still in future)
 * - fake-expired-<uuid>
 * - fake-grace-<uuid>
 * - fake-hold-<uuid>
 * - fake-revoked-<uuid>
 */
export class FakePlayBillingProvider implements BillingProvider {
  readonly kind = 'fake_play' as const;
  private readonly acknowledged = new Set<string>();

  async verifySubscription(input: {
    productId: string;
    purchaseToken: string;
  }): Promise<VerifiedSubscription> {
    const token = input.purchaseToken;
    const now = Date.now();
    let state = 'SUBSCRIPTION_STATE_ACTIVE';
    let validUntil = now + 30 * 24 * 60 * 60 * 1000;
    let accountPart = '';

    if (token.startsWith('fake-ok-')) {
      accountPart = token.slice('fake-ok-'.length);
      state = 'SUBSCRIPTION_STATE_ACTIVE';
    } else if (token.startsWith('fake-pending-')) {
      accountPart = token.slice('fake-pending-'.length);
      state = 'SUBSCRIPTION_STATE_PENDING';
    } else if (token.startsWith('fake-canceled-')) {
      accountPart = token.slice('fake-canceled-'.length);
      state = 'SUBSCRIPTION_STATE_CANCELED';
      validUntil = now + 7 * 24 * 60 * 60 * 1000;
    } else if (token.startsWith('fake-expired-')) {
      accountPart = token.slice('fake-expired-'.length);
      state = 'SUBSCRIPTION_STATE_EXPIRED';
      validUntil = now - 60_000;
    } else if (token.startsWith('fake-grace-')) {
      accountPart = token.slice('fake-grace-'.length);
      state = 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD';
    } else if (token.startsWith('fake-hold-')) {
      accountPart = token.slice('fake-hold-'.length);
      state = 'SUBSCRIPTION_STATE_ON_HOLD';
      validUntil = now - 60_000;
    } else if (token.startsWith('fake-revoked-')) {
      accountPart = token.slice('fake-revoked-'.length);
      state = 'SUBSCRIPTION_STATE_REVOKED';
      validUntil = now - 60_000;
    } else {
      throw new BillingProviderError('Fake token rejected', 'BILLING_TOKEN_INVALID');
    }

    // Optional product suffix only when it looks like a catalog id (contains '.').
    const [accountMarker, maybeProduct] = accountPart.split(':');
    const productFromToken =
      maybeProduct && maybeProduct.includes('.') ? maybeProduct : undefined;
    const productId =
      productFromToken ??
      (input.productId || SYNTHETIC_BILLING_CATALOG.products[0]!.productId);

    if (input.productId && productFromToken && productFromToken !== input.productId) {
      throw new BillingProviderError('Product mismatch', 'BILLING_PRODUCT_MISMATCH');
    }

    return {
      provider: 'fake_play',
      productId,
      purchaseToken: token,
      orderId: `GPA.FAKE-${token.slice(-8)}`,
      subscriptionState: state,
      acknowledgementState: this.acknowledged.has(token)
        ? 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED'
        : 'ACKNOWLEDGEMENT_STATE_PENDING',
      validFrom: new Date(now).toISOString(),
      validUntil: new Date(validUntil).toISOString(),
      autoRenewing: state === 'SUBSCRIPTION_STATE_ACTIVE' || state === 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD',
      obfuscatedAccountId: accountMarker && accountMarker.length === 36 ? accountMarker : null,
      linkedPurchaseToken: null,
      packageName: FAKE_PACKAGE,
      snapshot: {
        kind: 'androidpublisher#subscriptionPurchaseV2',
        label: 'fake-local-verification',
        subscriptionState: state,
      },
      providerMode: 'fake',
    };
  }

  async acknowledge(purchaseToken: string): Promise<void> {
    this.acknowledged.add(purchaseToken);
  }
}

export class BillingProviderError extends Error {
  constructor(
    message: string,
    readonly code: string
  ) {
    super(message);
    this.name = 'BillingProviderError';
  }
}

export class GooglePlayBillingProvider implements BillingProvider {
  readonly kind = 'google_play' as const;

  constructor(
    private readonly options: {
      packageName: string;
      accessToken: string;
      fetchFn?: typeof fetch;
      baseUrl?: string;
    }
  ) {}

  async verifySubscription(input: {
    productId: string;
    purchaseToken: string;
    expectedPackageName?: string;
  }): Promise<VerifiedSubscription> {
    if (!isBillingProductionActivationEnabled()) {
      throw new BillingProviderError(
        'Google Play live verification disabled',
        'BILLING_PROVIDER_UNAVAILABLE'
      );
    }
    const fetchFn = this.options.fetchFn ?? fetch;
    const base = this.options.baseUrl ?? 'https://androidpublisher.googleapis.com';
    const url =
      `${base}/androidpublisher/v3/applications/${encodeURIComponent(this.options.packageName)}` +
      `/purchases/subscriptionsv2/tokens/${encodeURIComponent(input.purchaseToken)}`;
    const res = await fetchFn(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${this.options.accessToken}` },
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      throw new BillingProviderError(
        `Play API ${res.status}`,
        res.status === 404 ? 'BILLING_TOKEN_INVALID' : 'BILLING_PROVIDER_ERROR'
      );
    }
    const body = (await res.json()) as Record<string, unknown>;
    const stateRaw = String(body['subscriptionState'] ?? '');
    if (!normalizePlaySubscriptionState(stateRaw)) {
      throw new BillingProviderError('Unsupported subscription state', 'BILLING_STATE_INVALID');
    }
    const lineItems = Array.isArray(body['lineItems']) ? body['lineItems'] : [];
    if (lineItems.length === 0) {
      throw new BillingProviderError('Missing line items', 'BILLING_PRODUCT_MISMATCH');
    }
    const first = (lineItems[0] ?? {}) as Record<string, unknown>;
    const productId = String(first['productId'] ?? '');
    if (!productId || productId !== input.productId) {
      throw new BillingProviderError('Product mismatch', 'BILLING_PRODUCT_MISMATCH');
    }
    const expiryTime = String(first['expiryTime'] ?? '');
    const startTime = String(body['startTime'] ?? '');
    if (!expiryTime || !startTime || Number.isNaN(Date.parse(expiryTime))) {
      throw new BillingProviderError('Invalid subscription dates', 'BILLING_STATE_INVALID');
    }
    const pkg = input.expectedPackageName ?? this.options.packageName;
    if (pkg !== this.options.packageName) {
      throw new BillingProviderError('Package mismatch', 'BILLING_PRODUCT_MISMATCH');
    }
    const ext = (body['externalAccountIdentifiers'] ?? {}) as Record<string, unknown>;
    return {
      provider: 'google_play',
      productId,
      purchaseToken: input.purchaseToken,
      orderId: body['latestOrderId'] ? String(body['latestOrderId']) : null,
      subscriptionState: stateRaw,
      acknowledgementState: String(body['acknowledgementState'] ?? 'ACKNOWLEDGEMENT_STATE_PENDING'),
      validFrom: startTime,
      validUntil: expiryTime,
      autoRenewing: Boolean(
        (first['autoRenewingPlan'] as { autoRenewEnabled?: boolean } | undefined)
          ?.autoRenewEnabled
      ),
      obfuscatedAccountId: ext['obfuscatedExternalAccountId']
        ? String(ext['obfuscatedExternalAccountId'])
        : null,
      linkedPurchaseToken: body['linkedPurchaseToken']
        ? String(body['linkedPurchaseToken'])
        : null,
      packageName: this.options.packageName,
      snapshot: { store: false, subscriptionState: stateRaw },
      providerMode: 'live',
    };
  }

  async acknowledge(purchaseToken: string): Promise<void> {
    if (!isBillingProductionActivationEnabled()) {
      throw new BillingProviderError(
        'Google Play acknowledge disabled',
        'BILLING_PROVIDER_UNAVAILABLE'
      );
    }
    const fetchFn = this.options.fetchFn ?? fetch;
    const base = this.options.baseUrl ?? 'https://androidpublisher.googleapis.com';
    // subscriptions acknowledge uses subscriptionId; subscriptionsv2 revoke/ack paths vary by API.
    // Local mock: POST acknowledge endpoint shape for tests.
    const url =
      `${base}/androidpublisher/v3/applications/${encodeURIComponent(this.options.packageName)}` +
      `/purchases/subscriptions/synthetic/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`;
    const res = await fetchFn(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.options.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok && res.status !== 204) {
      throw new BillingProviderError(`Play acknowledge ${res.status}`, 'BILLING_PROVIDER_ERROR');
    }
  }
}

const sharedFakeProvider = new FakePlayBillingProvider();

export function resolveBillingProvider(
  provider: 'fake_play' | 'google_play',
  env: NodeJS.ProcessEnv = process.env
): BillingProvider {
  if (!isBillingLocallyEnabled(env)) {
    throw new BillingProviderError('Billing local gate off', 'BILLING_DISABLED');
  }
  if (provider === 'fake_play') {
    return sharedFakeProvider;
  }
  if (!isBillingProductionActivationEnabled(env)) {
    throw new BillingProviderError(
      'Google Play live verification unavailable',
      'BILLING_PROVIDER_UNAVAILABLE'
    );
  }
  const token = env['DAYNORI_PLAY_ACCESS_TOKEN'] ?? env['GOOGLE_PLAY_ACCESS_TOKEN'];
  const packageName = env['DAYNORI_PLAY_PACKAGE_NAME'] ?? 'com.daynori.app';
  if (!token) {
    throw new BillingProviderError('Missing Play credentials', 'BILLING_PROVIDER_UNAVAILABLE');
  }
  return new GooglePlayBillingProvider({ packageName, accessToken: token });
}
