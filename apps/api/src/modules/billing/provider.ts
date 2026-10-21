/**
 * Billing provider adapters — fake (local) and Google Play (gated HTTP).
 * Fake verification is never provider proof. Live Play requires production activation + credentials.
 */

import {
  isBillingLocallyEnabled,
  isBillingProductionActivationEnabled,
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
  acknowledge?(purchaseToken: string): Promise<void>;
}

const FAKE_PACKAGE = 'com.daynori.app.synthetic';

export class FakePlayBillingProvider implements BillingProvider {
  readonly kind = 'fake_play' as const;

  async verifySubscription(input: {
    productId: string;
    purchaseToken: string;
  }): Promise<VerifiedSubscription> {
    if (!input.purchaseToken.startsWith('fake-ok-')) {
      throw new BillingProviderError('Fake token rejected', 'BILLING_TOKEN_INVALID');
    }
    const now = Date.now();
    const accountMarker = input.purchaseToken.slice('fake-ok-'.length).split(':')[0] ?? '';
    return {
      provider: 'fake_play',
      productId: input.productId,
      purchaseToken: input.purchaseToken,
      orderId: `GPA.FAKE-${input.purchaseToken.slice(-8)}`,
      subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
      acknowledgementState: 'ACKNOWLEDGEMENT_STATE_PENDING',
      validFrom: new Date(now).toISOString(),
      validUntil: new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString(),
      autoRenewing: true,
      obfuscatedAccountId: accountMarker.length === 36 ? accountMarker : null,
      linkedPurchaseToken: null,
      packageName: FAKE_PACKAGE,
      snapshot: {
        kind: 'androidpublisher#subscriptionPurchaseV2',
        label: 'fake-local-verification',
        subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
      },
      providerMode: 'fake',
    };
  }

  async acknowledge(_purchaseToken: string): Promise<void> {
    /* fake no-op */
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

/**
 * Google Play adapter using purchases.subscriptionsv2.get (authoritative).
 * Bound to mock HTTP transport in tests; live calls require production activation.
 */
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
    const state = String(body['subscriptionState'] ?? '');
    const lineItems = Array.isArray(body['lineItems']) ? body['lineItems'] : [];
    const first = (lineItems[0] ?? {}) as Record<string, unknown>;
    const productId = String(first['productId'] ?? input.productId);
    if (productId !== input.productId) {
      throw new BillingProviderError('Product mismatch', 'BILLING_PRODUCT_MISMATCH');
    }
    const ext = (body['externalAccountIdentifiers'] ?? {}) as Record<string, unknown>;
    return {
      provider: 'google_play',
      productId,
      purchaseToken: input.purchaseToken,
      orderId: body['latestOrderId'] ? String(body['latestOrderId']) : null,
      subscriptionState: state,
      acknowledgementState: String(body['acknowledgementState'] ?? 'ACKNOWLEDGEMENT_STATE_PENDING'),
      validFrom: String(body['startTime'] ?? new Date().toISOString()),
      validUntil: String(first['expiryTime'] ?? new Date().toISOString()),
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
      snapshot: { ...body, store: false },
      providerMode: 'live',
    };
  }
}

export function resolveBillingProvider(
  provider: 'fake_play' | 'google_play',
  env: NodeJS.ProcessEnv = process.env
): BillingProvider {
  if (!isBillingLocallyEnabled(env)) {
    throw new BillingProviderError('Billing local gate off', 'BILLING_DISABLED');
  }
  if (provider === 'fake_play') {
    return new FakePlayBillingProvider();
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
