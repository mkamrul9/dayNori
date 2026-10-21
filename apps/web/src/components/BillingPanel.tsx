'use client';

import { Icon } from '@daynori/ui-web';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { colors, spacing, typography, type ThemeMode } from '@daynori/design-tokens';
import { Button, Feedback, type FeedbackSeverity } from '@daynori/ui-web';
import { createWebApiClient } from '../data/webApiClient';

export interface BillingPanelProps {
  csrfToken: string | null;
  themeMode: ThemeMode;
  personalWorkspaceId: string | null;
}

/**
 * Phase 57 provisional billing UI — synthetic catalog only.
 * Production Play/web charges remain disabled. Entitlements are server-authoritative.
 */
export function BillingPanel({ csrfToken, themeMode, personalWorkspaceId }: BillingPanelProps) {
  const palette = colors[themeMode];
  const client = useMemo(() => createWebApiClient({ csrfToken }), [csrfToken]);
  const [feedback, setFeedback] = useState<{ severity: FeedbackSeverity; message: string } | null>(
    null
  );
  const [catalogLabel, setCatalogLabel] = useState<string>('');
  const [priceLabel, setPriceLabel] = useState<string>('');
  const [productId, setProductId] = useState<string>('');
  const [planId, setPlanId] = useState<string>('free');
  const [usage, setUsage] = useState<string>('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!personalWorkspaceId) return;
    try {
      const [cat, ent, use] = await Promise.all([
        client.getBillingCatalog(),
        client.getBillingEntitlement(),
        client.getBillingUsage(personalWorkspaceId),
      ]);
      setCatalogLabel(cat.data.catalogLabel);
      const product = cat.data.products[0];
      setPriceLabel(product?.syntheticPriceLabel ?? '');
      setProductId(product?.productId ?? '');
      setPlanId(ent.data.planId);
      setUsage(
        `Plan ${use.data.planId} (${use.data.entitlementStatus}). Storage ${use.data.storage.usedBytes}/${use.data.storage.maxBytes} bytes. ${use.data.downgradePolicy}`
      );
    } catch (err) {
      setFeedback({
        severity: 'danger',
        message: err instanceof Error ? err.message : 'Billing load failed',
      });
    }
  }, [client, personalWorkspaceId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function verifySynthetic() {
    if (!productId) return;
    setBusy(true);
    setFeedback(null);
    try {
      const res = await client.verifyBillingPurchase({
        provider: 'fake_play',
        productId,
        purchaseToken: `fake-ok-${crypto.randomUUID()}`,
      });
      setFeedback({
        severity: 'success',
        message: `Verified (${res.data.providerMode}). Plan ${res.data.entitlement.planId}. Not a real charge.`,
      });
      await refresh();
    } catch (err) {
      setFeedback({
        severity: 'danger',
        message: err instanceof Error ? err.message : 'Verify failed',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h2
        style={{
          margin: '0 0 4px 0',
          fontSize: `${typography.webScale.sectionHeading}px`,
          color: palette.text.primary,
        }}
      >
        Plan & billing (provisional local)
      </h2>
      <p style={{ margin: '0 0 12px 0', fontSize: '13px', color: palette.text.secondary }}>
        Server-authoritative entitlements. Catalog label: {catalogLabel || '…'}. Prices shown are
        synthetic fixtures — production Play/web purchase activation is disabled. Paying does not
        enable vault, rooms, or live AI.
      </p>
      {feedback ? (
        <div style={{ marginBottom: spacing.sm }}>
          <Feedback severity={feedback.severity} message={feedback.message} />
        </div>
      ) : null}
      <p style={{ fontSize: 13 }}>Current plan: {planId}</p>
      <p style={{ fontSize: 13 }}>{priceLabel}</p>
      <p style={{ fontSize: 12, color: palette.text.secondary }}>{usage}</p>
      <div style={{ display: 'flex', gap: spacing.sm, flexWrap: 'wrap', marginTop: spacing.sm }}>
        <Button
          variant="primary"
          size="compact"
          themeMode={themeMode}
          disabled={busy || !personalWorkspaceId}
          onClick={() => void verifySynthetic()}
        >
          Verify synthetic purchase
        </Button>
        <Button
          variant="secondary"
          size="compact"
          themeMode={themeMode}
          disabled={busy}
          onClick={() => void refresh()}
        >
          Refresh status
        </Button>
      </div>
      <p style={{ fontSize: 12, marginTop: spacing.md, color: palette.text.secondary }}>
        Manage real Play subscriptions in Google Play <Icon name="arrow-right" /> Payments & subscriptions
        (when production is authorized). Web checkout is not offered as an Android alternative here.
      </p>
    </div>
  );
}
