import { useCallback, useEffect, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing, type ThemeMode } from '@daynori/design-tokens';
import { MobileButton } from '@daynori/ui-mobile';
import type { DaynoriApiClient } from '@daynori/api-client';
import type { BillingUsageResponse } from '@daynori/contracts';

export interface BillingSheetProps {
  themeMode: ThemeMode;
  workspaceId: string;
  apiClient: DaynoriApiClient;
  onClose: () => void;
  testID?: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * Android billing surface (Phase 89 sustainable readiness).
 * Server-authoritative entitlements, restore purchases, downgrade preservation, and Play policy transparency.
 * Synthetic catalog only — Expo Go / fake adapter does not verify Play Billing.
 * Production activation and real charges remain disabled.
 */
export function BillingSheet({
  themeMode,
  workspaceId,
  apiClient,
  onClose,
  testID = 'billing-sheet',
}: BillingSheetProps) {
  const palette = colors[themeMode];
  const [message, setMessage] = useState<string | null>(null);
  const [planId, setPlanId] = useState('free');
  const [entitlementStatus, setEntitlementStatus] = useState('active');
  const [priceLabel, setPriceLabel] = useState('');
  const [productId, setProductId] = useState('');
  const [usageData, setUsageData] = useState<BillingUsageResponse['data'] | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const [cat, ent, use] = await Promise.all([
      apiClient.getBillingCatalog(),
      apiClient.getBillingEntitlement(),
      apiClient.getBillingUsage(workspaceId),
    ]);
    setPlanId(ent.data.planId);
    setEntitlementStatus(ent.data.status);
    const product = cat.data.products[0];
    setPriceLabel(product?.syntheticPriceLabel ?? '');
    setProductId(product?.productId ?? '');
    setUsageData(use.data);
  }, [apiClient, workspaceId]);

  useEffect(() => {
    void refresh().catch((err: unknown) => {
      setMessage(err instanceof Error ? err.message : 'Billing load failed');
    });
  }, [refresh]);

  const verifySynthetic = async () => {
    if (!productId) return;
    setBusy(true);
    setMessage(null);
    try {
      const token = `fake-ok-${`${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
      const res = await apiClient.verifyBillingPurchase({
        provider: 'fake_play',
        productId,
        purchaseToken: token,
      });
      setMessage(
        `Verified (${res.data.providerMode}). Plan ${res.data.entitlement.planId}. Synthetic test fixture — no real charge.`
      );
      await refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Verify failed');
    } finally {
      setBusy(false);
    }
  };

  const restorePurchases = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await apiClient.restoreBillingPurchases({
        provider: 'fake_play',
        purchaseTokens: [],
      });
      setMessage(
        `Restore completed: ${res.data.restored} restored, ${res.data.skippedCrossAccount} skipped cross-account. Current plan: ${res.data.entitlement.planId} (${res.data.entitlement.status}).`
      );
      await refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Restore failed');
    } finally {
      setBusy(false);
    }
  };

  const manageInPlay = async () => {
    const url = 'https://play.google.com/store/account/subscriptions';
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        setMessage('Manage subscriptions at: play.google.com/store/account/subscriptions');
      }
    } catch {
      setMessage('Manage subscriptions at: play.google.com/store/account/subscriptions');
    }
  };

  const storageUsed = usageData?.storage.usedBytes ?? 0;
  const storageMax = usageData?.storage.maxBytes ?? 104857600;
  const storageAvailable = usageData?.storage.availableBytes ?? 0;

  return (
    <ScrollView
      testID={testID}
      contentContainerStyle={styles.scroll}
      keyboardShouldPersistTaps="handled"
      accessibilityLabel="Plan and billing sustainable readiness"
    >
      <Text style={[styles.title, { color: palette.text.primary }]}>
        Plan &amp; billing
      </Text>
      <Text style={[styles.body, { color: palette.text.secondary }]}>
        Server-authoritative entitlements. Synthetic test catalog — not Play Billing proof. Production
        charges remain disabled. Paying does not enable vault, rooms, Drive, or AI.
      </Text>

      {message ? (
        <View
          style={{
            padding: spacing.sm,
            borderRadius: radii.sm,
            backgroundColor: palette.surfaceRaised,
            borderWidth: 1,
            borderColor: palette.border.subtle,
            marginBottom: spacing.xs,
          }}
        >
          <Text accessibilityLiveRegion="polite" style={{ fontSize: 13, color: palette.text.primary }}>
            {message}
          </Text>
        </View>
      ) : null}

      {/* Plan Card */}
      <View
        style={{
          padding: spacing.md,
          backgroundColor: palette.surfaceRaised,
          borderRadius: radii.card,
          borderWidth: 1,
          borderColor: palette.border.subtle,
          gap: spacing.xs,
        }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontSize: 16, fontWeight: '600', color: palette.text.primary }}>
            {planId === 'plus_synthetic' ? 'Daynori Plus (synthetic)' : 'Daynori Free'}
          </Text>
          <Text
            style={{
              fontSize: 11,
              fontWeight: '600',
              paddingHorizontal: 8,
              paddingVertical: 2,
              borderRadius: radii.pill,
              backgroundColor: entitlementStatus === 'active' ? palette.status.successBg : palette.status.warningBg,
              color: entitlementStatus === 'active' ? palette.status.success : palette.status.warning,
            }}
          >
            {entitlementStatus.toUpperCase()}
          </Text>
        </View>

        {priceLabel ? (
          <Text style={{ fontSize: 12, color: palette.text.secondary }}>{priceLabel}</Text>
        ) : null}

        <View style={{ marginTop: spacing.xs }}>
          <Text style={{ fontSize: 12, color: palette.text.primary, fontWeight: '500' }}>
            Storage: {formatBytes(storageUsed)} of {formatBytes(storageMax)} used ({formatBytes(storageAvailable)} free)
          </Text>
        </View>

        {usageData?.ai ? (
          <Text style={{ fontSize: 11, color: palette.text.secondary }}>
            AI monthly ceiling: {usageData.ai.monthlyTokenLimit.toLocaleString()} tokens/mo
          </Text>
        ) : null}
      </View>

      {/* Downgrade Protection Notice */}
      <View
        style={{
          padding: spacing.sm,
          backgroundColor: palette.status.infoBg,
          borderRadius: radii.sm,
          borderWidth: 1,
          borderColor: palette.status.infoBorder,
        }}
      >
        <Text style={{ fontSize: 11, color: palette.status.info, lineHeight: 16 }}>
          Data Guarantee: On plan expiration or downgrade, all existing notes, tasks, routines, journal entries,
          and stored files remain accessible (read, export, and delete). No personal data is ever deleted.
        </Text>
      </View>

      {/* Actions */}
      <View style={{ gap: spacing.sm, marginTop: spacing.xs }}>
        <MobileButton
          variant="primary"
          themeMode={themeMode}
          disabled={busy}
          onPress={() => void verifySynthetic()}
          accessibilityLabel="Verify synthetic purchase"
        >
          Verify synthetic purchase
        </MobileButton>
        <MobileButton
          variant="secondary"
          themeMode={themeMode}
          disabled={busy}
          onPress={() => void restorePurchases()}
          accessibilityLabel="Restore purchases"
        >
          Restore purchases
        </MobileButton>
        <MobileButton
          variant="secondary"
          themeMode={themeMode}
          disabled={busy}
          onPress={() => void refresh()}
          accessibilityLabel="Refresh billing status"
        >
          Refresh status
        </MobileButton>
        <MobileButton
          variant="subtle"
          themeMode={themeMode}
          onPress={() => void manageInPlay()}
          accessibilityLabel="Manage subscriptions in Google Play"
        >
          Manage in Google Play
        </MobileButton>
        <MobileButton
          variant="subtle"
          themeMode={themeMode}
          onPress={onClose}
          accessibilityLabel="Close billing"
        >
          Close
        </MobileButton>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: spacing.md, gap: spacing.sm },
  title: { fontSize: 20, fontWeight: '600', marginBottom: 4 },
  body: { fontSize: 13, lineHeight: 18, marginBottom: spacing.sm },
});
