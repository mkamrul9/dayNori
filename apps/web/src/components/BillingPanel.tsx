'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { colors, radii, spacing, typography, type ThemeMode } from '@daynori/design-tokens';
import { Button, Feedback, Icon, type FeedbackSeverity } from '@daynori/ui-web';
import type { BillingUsageResponse } from '@daynori/contracts';
import { createWebApiClient } from '../data/webApiClient';

export interface BillingPanelProps {
  csrfToken: string | null;
  themeMode: ThemeMode;
  personalWorkspaceId: string | null;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * Phase 89 sustainable billing UI with server-authoritative entitlements,
 * quota breakdown, restore purchases, downgrade preservation, and Play policy transparency.
 * Commercial purchases remain disabled in production; synthetic catalog is for test verification only.
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
  const [entitlementStatus, setEntitlementStatus] = useState<string>('active');
  const [usageData, setUsageData] = useState<BillingUsageResponse['data'] | null>(null);
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
      setEntitlementStatus(ent.data.status);
      setUsageData(use.data);
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
        message: `Verified (${res.data.providerMode}). Plan ${res.data.entitlement.planId}. Synthetic test fixture — no real charge.`,
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

  async function restorePurchases() {
    setBusy(true);
    setFeedback(null);
    try {
      const res = await client.restoreBillingPurchases({
        provider: 'fake_play',
        purchaseTokens: [],
      });
      setFeedback({
        severity: 'info',
        message: `Restore completed: ${res.data.restored} restored, ${res.data.skippedCrossAccount} skipped cross-account. Current plan: ${res.data.entitlement.planId} (${res.data.entitlement.status}).`,
      });
      await refresh();
    } catch (err) {
      setFeedback({
        severity: 'danger',
        message: err instanceof Error ? err.message : 'Restore failed',
      });
    } finally {
      setBusy(false);
    }
  }

  const storageUsed = usageData?.storage.usedBytes ?? 0;
  const storageMax = usageData?.storage.maxBytes ?? 104857600;
  const storageAvailable = usageData?.storage.availableBytes ?? 0;
  const storagePercent = Math.min(100, Math.round((storageUsed / Math.max(1, storageMax)) * 100));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
      <div>
        <h2
          style={{
            margin: '0 0 4px 0',
            fontSize: `${typography.webScale.sectionHeading}px`,
            color: palette.text.primary,
          }}
        >
          Plan & billing
        </h2>
        <p style={{ margin: 0, fontSize: '13px', color: palette.text.secondary }}>
          Server-authoritative entitlements and quota accounting. Catalog: {catalogLabel || 'synthetic-local-catalog'}.
          Prices shown are synthetic fixtures — production Play/web purchase activation is disabled.
        </p>
      </div>

      {feedback ? (
        <Feedback severity={feedback.severity} message={feedback.message} />
      ) : null}

      {/* Current Plan Card */}
      <div
        style={{
          padding: spacing.md,
          background: palette.surfaceRaised,
          border: `1px solid ${palette.border.subtle}`,
          borderRadius: radii.card,
          display: 'flex',
          flexDirection: 'column',
          gap: spacing.sm,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <span style={{ fontSize: 12, color: palette.text.secondary, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Current Plan
            </span>
            <div style={{ fontSize: 18, fontWeight: 600, color: palette.text.primary, marginTop: 2 }}>
              {planId === 'plus_synthetic' ? 'Daynori Plus (synthetic)' : 'Daynori Free'}
            </div>
          </div>
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              padding: '4px 10px',
              borderRadius: radii.pill,
              background: entitlementStatus === 'active' ? palette.status.successBg : palette.status.warningBg,
              color: entitlementStatus === 'active' ? palette.status.success : palette.status.warning,
              border: `1px solid ${entitlementStatus === 'active' ? palette.status.successBorder : palette.status.warningBorder}`,
            }}
          >
            {entitlementStatus.toUpperCase()}
          </span>
        </div>

        {priceLabel ? (
          <div style={{ fontSize: 13, color: palette.text.secondary }}>
            Catalog rate: <strong style={{ color: palette.text.primary }}>{priceLabel}</strong>
          </div>
        ) : null}

        {/* Storage Meter */}
        <div style={{ marginTop: spacing.xs }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
            <span style={{ color: palette.text.primary, fontWeight: 500 }}>
              Storage usage: {formatBytes(storageUsed)} of {formatBytes(storageMax)} ({storagePercent}%)
            </span>
            <span style={{ color: palette.text.secondary }}>
              {formatBytes(storageAvailable)} free
            </span>
          </div>
          <div
            style={{
              width: '100%',
              height: 8,
              background: palette.surface,
              borderRadius: radii.pill,
              overflow: 'hidden',
              border: `1px solid ${palette.border.subtle}`,
            }}
          >
            <div
              style={{
                width: `${storagePercent}%`,
                height: '100%',
                background: storagePercent > 90 ? palette.status.danger : palette.action.primary,
                borderRadius: radii.pill,
                transition: 'width 200ms ease',
              }}
            />
          </div>
        </div>

        {usageData?.ai ? (
          <div style={{ fontSize: 12, color: palette.text.secondary }}>
            AI monthly ceiling: {usageData.ai.monthlyTokenLimit.toLocaleString()} tokens/mo (opt-in provider usage)
          </div>
        ) : null}
      </div>

      {/* Downgrade & Data Protection Notice */}
      <div
        style={{
          padding: spacing.sm,
          background: palette.status.infoBg,
          border: `1px solid ${palette.status.infoBorder}`,
          borderRadius: radii.sm,
          fontSize: 12,
          color: palette.status.info,
          lineHeight: 1.5,
        }}
      >
        <strong>Data Protection Guarantee:</strong> On subscription cancellation, expiry, or downgrade, all existing
        notes, tasks, routines, journal entries, and stored files remain fully accessible. You can continue to view,
        download, export, and delete your data at any time. Only new uploads exceeding the free tier storage limit will
        be refused until space is freed.
      </div>

      {/* Gated Modules Invariant */}
      <div
        style={{
          padding: spacing.sm,
          background: palette.surfaceRaised,
          border: `1px solid ${palette.border.subtle}`,
          borderRadius: radii.sm,
          fontSize: 12,
          color: palette.text.secondary,
          lineHeight: 1.5,
        }}
      >
        <strong style={{ color: palette.text.primary }}>Independent Security Gates:</strong> Purchasing a subscription
        never unlocks or bypasses unverified modules. Client-encrypted Vault (Phase 86), Shared Rooms &amp; Moderation (Phase 88),
        Google Drive Integration (Phase 87), and AI Assistant (Phase 55) each remain governed strictly by their dedicated
        cryptographic and policy release gates.
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: spacing.sm, flexWrap: 'wrap' }}>
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
          onClick={() => void restorePurchases()}
        >
          Restore purchases
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

      {/* Google Play Subscription Management & Cancellation */}
      <div style={{ fontSize: 12, color: palette.text.secondary, borderTop: `1px solid ${palette.border.subtle}`, paddingTop: spacing.md }}>
        <p style={{ margin: '0 0 6px 0' }}>
          <strong>Subscription Management:</strong> Android subscriptions are managed directly through Google Play.
          To view active subscriptions, change renewal options, or cancel auto-renewal:
        </p>
        <p style={{ margin: '0 0 6px 0' }}>
          Open Google Play <Icon name="arrow-right" /> tap your profile icon <Icon name="arrow-right" />{' '}
          <strong>Payments &amp; subscriptions</strong> <Icon name="arrow-right" /> <strong>Subscriptions</strong>, or visit{' '}
          <a
            href="https://play.google.com/store/account/subscriptions"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: palette.action.primary, textDecoration: 'underline' }}
          >
            play.google.com/store/account/subscriptions
          </a>.
        </p>
        <p style={{ margin: 0, fontStyle: 'italic' }}>
          Note: In accordance with Google Play payments policy, web checkout is not offered as an alternative to Google Play on Android.
        </p>
      </div>
    </div>
  );
}
