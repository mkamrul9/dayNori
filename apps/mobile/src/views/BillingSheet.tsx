import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, spacing, type ThemeMode } from '@daynori/design-tokens';
import { MobileButton } from '@daynori/ui-mobile';
import type { DaynoriApiClient } from '@daynori/api-client';

export interface BillingSheetProps {
  themeMode: ThemeMode;
  workspaceId: string;
  apiClient: DaynoriApiClient;
  onClose: () => void;
  testID?: string;
}

/**
 * Android billing surface (Phase 57 provisional).
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
  const [priceLabel, setPriceLabel] = useState('');
  const [productId, setProductId] = useState('');
  const [usage, setUsage] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const [cat, ent, use] = await Promise.all([
      apiClient.getBillingCatalog(),
      apiClient.getBillingEntitlement(),
      apiClient.getBillingUsage(workspaceId),
    ]);
    setPlanId(ent.data.planId);
    const product = cat.data.products[0];
    setPriceLabel(product?.syntheticPriceLabel ?? '');
    setProductId(product?.productId ?? '');
    setUsage(
      `Storage ${use.data.storage.usedBytes}/${use.data.storage.maxBytes} bytes. ${use.data.downgradePolicy}`
    );
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
        `Verified (${res.data.providerMode}). Plan ${res.data.entitlement.planId}. Not a real charge.`
      );
      await refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Verify failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView
      testID={testID}
      contentContainerStyle={styles.scroll}
      keyboardShouldPersistTaps="handled"
      accessibilityLabel="Plan and billing provisional local"
    >
      <Text style={[styles.title, { color: palette.text.primary }]}>
        Plan & billing (provisional)
      </Text>
      <Text style={[styles.body, { color: palette.text.secondary }]}>
        Server-authoritative entitlements. Synthetic catalog — not Play Billing proof. Production
        charges disabled. Paying does not enable vault, rooms, or live AI.
      </Text>
      {message ? (
        <Text accessibilityLiveRegion="polite" style={[styles.body, { color: palette.text.primary }]}>
          {message}
        </Text>
      ) : null}
      <Text style={[styles.body, { color: palette.text.primary }]}>Current plan: {planId}</Text>
      <Text style={[styles.body, { color: palette.text.secondary }]}>{priceLabel}</Text>
      <Text style={[styles.body, { color: palette.text.secondary }]}>{usage}</Text>
      <View style={{ gap: spacing.sm }}>
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
          onPress={() => void refresh()}
          accessibilityLabel="Refresh billing status"
        >
          Refresh status
        </MobileButton>
        <MobileButton
          variant="secondary"
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
