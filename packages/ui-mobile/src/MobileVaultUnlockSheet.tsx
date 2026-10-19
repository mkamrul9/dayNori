import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, radii, spacing, touchTargets, type ThemeMode } from '@daynori/design-tokens';
import type { VaultLockState, VaultSessionSnapshot } from '@daynori/domain';
import { MobileButton } from './MobileButton.js';
import { MobileFeedback } from './MobileFeedback.js';
import { MobileModalSheet } from './MobileModalSheet.js';

export type VaultUnlockMode = 'passphrase' | 'recovery' | 'biometric';

export interface MobileVaultUnlockSheetProps {
  visible: boolean;
  onClose: () => void;
  themeMode?: ThemeMode;
  session: VaultSessionSnapshot;
  syntheticHarness?: boolean;
  testID?: string;
  onUnlockPassphrase: (passphrase: string) => Promise<{ ok: boolean; message?: string }>;
  onUnlockRecovery: (secret: string) => Promise<{ ok: boolean; message?: string }>;
  onUnlockBiometric: () => Promise<{ ok: boolean; message?: string }>;
  onCancelUnlock?: () => void;
  onLock?: () => void;
}

function stateMessage(state: VaultLockState): string {
  switch (state) {
    case 'locked':
      return 'Vault is locked. Enter your vault passphrase. Account password reset cannot unlock the vault.';
    case 'unlock_pending':
      return 'Unlock in progress…';
    case 'unlocked':
      return 'Vault unlocked for this session.';
    case 'unavailable':
      return 'Vault provider unavailable. Production unlock remains disabled until security gates pass.';
    case 'session_expired':
      return 'Vault session expired. Unlock again.';
    case 'revoked':
      return 'This device enrollment was revoked. Unlock with passphrase after re-enrollment.';
    default:
      return 'Vault locked.';
  }
}

export const MobileVaultUnlockSheet: React.FC<MobileVaultUnlockSheetProps> = ({
  visible,
  onClose,
  themeMode = 'light',
  session,
  syntheticHarness = false,
  testID = 'mobile-vault-unlock-sheet',
  onUnlockPassphrase,
  onUnlockRecovery,
  onUnlockBiometric,
  onCancelUnlock,
  onLock,
}) => {
  const palette = colors[themeMode];
  const [mode, setMode] = useState<VaultUnlockMode>('passphrase');
  const [passphrase, setPassphrase] = useState('');
  const [recovery, setRecovery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const clearSecrets = () => {
    setPassphrase('');
    setRecovery('');
  };

  useEffect(() => {
    if (!visible) {
      clearSecrets();
      setError(null);
      setBusy(false);
      setMode('passphrase');
    }
  }, [visible]);

  // Clear form secrets on lock, dismissal path, cancellation, or completed unlock.
  useEffect(() => {
    if (
      session.state === 'locked' ||
      session.state === 'unlocked' ||
      session.state === 'unavailable' ||
      session.state === 'revoked' ||
      session.state === 'session_expired'
    ) {
      clearSecrets();
      setBusy(false);
    }
  }, [session.state]);

  if (!visible) return null;

  const pending = session.state === 'unlock_pending' || busy;
  const biometricAvailable = session.biometricCapability === 'available';

  const run = async (fn: () => Promise<{ ok: boolean; message?: string }>) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fn();
      clearSecrets();
      if (!res.ok) setError(res.message || 'Unlock failed.');
    } catch {
      clearSecrets();
      setError('Unlock failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <MobileModalSheet
      visible={visible}
      onClose={pending ? () => onCancelUnlock?.() : onClose}
      title={syntheticHarness ? 'Vault unlock (synthetic harness)' : 'Vault unlock'}
      themeMode={themeMode}
      testID={testID}
    >
      <View style={styles.container}>
        {syntheticHarness ? (
          <MobileFeedback
            severity="info"
            title="Synthetic development harness"
            message="Not production vault storage. Phase 44/45 gates still block real-user enablement."
            themeMode={themeMode}
          />
        ) : null}

        <Text
          style={[styles.body, { color: palette.text.secondary }]}
          accessibilityLiveRegion="polite"
        >
          {stateMessage(session.state)}
        </Text>

        {session.cooldownUntil ? (
          <MobileFeedback
            severity="warning"
            title="Retry cooldown"
            message="Too many failed attempts. Wait before retrying. Recoverable vault data was not deleted."
            themeMode={themeMode}
          />
        ) : null}

        {error ? (
          <MobileFeedback severity="danger" title="Unlock error" message={error} themeMode={themeMode} />
        ) : null}

        <View style={styles.modeRow} accessibilityRole="tablist">
          {(
            [
              ['passphrase', 'Passphrase'],
              ['recovery', 'Recovery'],
              ['biometric', 'Biometric'],
            ] as const
          ).map(([id, label]) => (
            <Pressable
              key={id}
              testID={`${testID}-mode-${id}`}
              onPress={() => setMode(id)}
              disabled={pending}
              accessibilityRole="tab"
              accessibilityState={{ selected: mode === id }}
              accessibilityLabel={`${label} unlock method`}
              style={[
                styles.modeChip,
                {
                  borderColor: palette.border.strong,
                  backgroundColor: mode === id ? palette.surfaceRaised : palette.surface,
                  minHeight: touchTargets.mobileMin,
                },
              ]}
            >
              <Text style={{ color: palette.text.primary }}>{label}</Text>
            </Pressable>
          ))}
        </View>

        {mode === 'passphrase' ? (
          <>
            <Text style={[styles.label, { color: palette.text.primary }]}>Vault passphrase</Text>
            <TextInput
              testID={`${testID}-passphrase`}
              value={passphrase}
              onChangeText={setPassphrase}
              secureTextEntry
              editable={!pending}
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel="Vault passphrase"
              style={[
                styles.input,
                {
                  borderColor: palette.border.strong,
                  color: palette.text.primary,
                  backgroundColor: palette.surface,
                },
              ]}
            />
            <MobileButton
              testID={`${testID}-submit-passphrase`}
              themeMode={themeMode}
              onPress={() => run(() => onUnlockPassphrase(passphrase))}
              disabled={pending || !passphrase}
              loading={pending && mode === 'passphrase'}
              accessibilityLabel="Unlock vault with passphrase"
            >
              Unlock with passphrase
            </MobileButton>
          </>
        ) : null}

        {mode === 'recovery' ? (
          <>
            <Text style={[styles.label, { color: palette.text.primary }]}>Recovery secret</Text>
            <Text style={[styles.help, { color: palette.text.secondary }]}>
              Account password reset does not restore vault access. If passphrase and recovery secret
              are both lost, vault content is permanently unrecoverable.
            </Text>
            <TextInput
              testID={`${testID}-recovery`}
              value={recovery}
              onChangeText={setRecovery}
              secureTextEntry
              editable={!pending}
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel="Vault recovery secret"
              style={[
                styles.input,
                {
                  borderColor: palette.border.strong,
                  color: palette.text.primary,
                  backgroundColor: palette.surface,
                },
              ]}
            />
            <MobileButton
              testID={`${testID}-submit-recovery`}
              themeMode={themeMode}
              onPress={() => run(() => onUnlockRecovery(recovery))}
              disabled={pending || !recovery}
              accessibilityLabel="Unlock vault with recovery secret"
            >
              Unlock with recovery secret
            </MobileButton>
          </>
        ) : null}

        {mode === 'biometric' ? (
          <>
            <Text style={[styles.help, { color: palette.text.secondary }]}>
              Biometric success alone is never enough. Unlock requires OS-authentication-bound key
              release. Short PIN unlock remains unavailable for synchronized envelopes.
            </Text>
            {!biometricAvailable ? (
              <MobileFeedback
                severity="warning"
                title="Biometric unavailable"
                message={
                  session.biometricCapability === 'invalidated'
                    ? 'Biometric enrollment changed; device key invalidated. Use passphrase.'
                    : 'Biometric/device-auth capability unavailable on this device or build.'
                }
                themeMode={themeMode}
              />
            ) : (
              <MobileButton
                testID={`${testID}-submit-biometric`}
                themeMode={themeMode}
                onPress={() => run(() => onUnlockBiometric())}
                disabled={pending}
                accessibilityLabel="Unlock vault with device authentication bound key"
              >
                Unlock with device authentication
              </MobileButton>
            )}
          </>
        ) : null}

        {session.state === 'unlock_pending' && onCancelUnlock ? (
          <MobileButton
            testID={`${testID}-cancel`}
            variant="secondary"
            themeMode={themeMode}
            onPress={onCancelUnlock}
            accessibilityLabel="Cancel unlock attempt"
          >
            Cancel unlock
          </MobileButton>
        ) : null}

        {session.state === 'unlocked' && onLock ? (
          <MobileButton
            testID={`${testID}-lock`}
            variant="secondary"
            themeMode={themeMode}
            onPress={onLock}
            accessibilityLabel="Lock vault now"
          >
            Lock vault
          </MobileButton>
        ) : null}

        <Text style={[styles.meta, { color: palette.text.secondary }]}>
          Enrollment: {session.deviceEnrollmentStatus}. Failed attempts: {session.failedAttempts}.
        </Text>
      </View>
    </MobileModalSheet>
  );
};

const styles = StyleSheet.create({
  container: { gap: spacing.md, paddingBottom: spacing.lg },
  body: { fontSize: 15, lineHeight: 22 },
  help: { fontSize: 13, lineHeight: 20 },
  label: { fontSize: 14, fontWeight: '600' },
  input: {
    borderWidth: 1,
    borderRadius: radii.card,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: touchTargets.mobileMin,
    fontSize: 16,
  },
  modeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  modeChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.card,
    borderWidth: 1,
    justifyContent: 'center',
  },
  meta: { fontSize: 12, lineHeight: 18 },
});
