'use client';

import React, { useEffect, useId, useState } from 'react';
import { colors, radii, spacing, touchTargets, type ThemeMode } from '@daynori/design-tokens';
import type { VaultSessionSnapshot } from '@daynori/domain';
import { Button } from './Button.js';
import { Feedback } from './Feedback.js';
import { TextField } from './TextField.js';

export type WebVaultUnlockMode = 'passphrase' | 'recovery';

export interface VaultUnlockPanelProps {
  session: VaultSessionSnapshot;
  themeMode?: ThemeMode;
  syntheticHarness?: boolean;
  passkeyAvailable?: boolean;
  onUnlockPassphrase: (passphrase: string) => Promise<{ ok: boolean; message?: string }>;
  onUnlockRecovery: (secret: string) => Promise<{ ok: boolean; message?: string }>;
  onCancelUnlock?: () => void;
  onLock?: () => void;
  onDismiss?: () => void;
}

function stateMessage(session: VaultSessionSnapshot): string {
  if (session.cooldownUntil && Date.parse(session.cooldownUntil) > Date.now()) {
    return 'Unlock attempts are in cooldown. Recoverable vault data was not deleted. Account password reset cannot unlock the vault.';
  }
  switch (session.state) {
    case 'locked':
      return 'Vault is locked. Enter your vault passphrase. Account recovery is separate from vault recovery.';
    case 'unlock_pending':
      return 'Unlock in progress…';
    case 'unlocked':
      return 'Vault unlocked for this browser tab session.';
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

export const VaultUnlockPanel: React.FC<VaultUnlockPanelProps> = ({
  session,
  themeMode = 'light',
  syntheticHarness = false,
  passkeyAvailable = false,
  onUnlockPassphrase,
  onUnlockRecovery,
  onCancelUnlock,
  onLock,
  onDismiss,
}) => {
  const palette = colors[themeMode];
  const statusId = useId();
  const [mode, setMode] = useState<WebVaultUnlockMode>('passphrase');
  const [passphrase, setPassphrase] = useState('');
  const [recovery, setRecovery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const clearSecrets = () => {
    setPassphrase('');
    setRecovery('');
  };

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

  const pending = session.state === 'unlock_pending' || busy;
  const cooldownActive =
    !!session.cooldownUntil && Date.parse(session.cooldownUntil) > Date.now();

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
    <section
      aria-labelledby={statusId}
      data-testid="web-vault-unlock-panel"
      style={{
        border: `1px solid ${palette.border.subtle}`,
        borderRadius: radii.card,
        padding: spacing.base,
        background: palette.surface,
        display: 'flex',
        flexDirection: 'column',
        gap: spacing.sm,
      }}
    >
      <h2 id={statusId} style={{ margin: 0, fontSize: 18, color: palette.text.primary }}>
        {syntheticHarness ? 'Vault unlock (synthetic harness)' : 'Vault unlock'}
      </h2>
      <p role="status" aria-live="polite" style={{ margin: 0, color: palette.text.secondary }}>
        {stateMessage(session)}
      </p>
      {syntheticHarness ? (
        <Feedback
          severity="warning"
          message="Development harness only. Synthetic fixtures — not production vault data or Phase 45 sync."
        />
      ) : null}

      <div role="tablist" aria-label="Unlock method" style={{ display: 'flex', gap: spacing.xs }}>
        <Button
          themeMode={themeMode}
          variant={mode === 'passphrase' ? 'primary' : 'secondary'}
          onClick={() => setMode('passphrase')}
          disabled={pending}
        >
          Passphrase
        </Button>
        <Button
          themeMode={themeMode}
          variant={mode === 'recovery' ? 'primary' : 'secondary'}
          onClick={() => setMode('recovery')}
          disabled={pending}
        >
          Recovery secret
        </Button>
        <Button themeMode={themeMode} variant="subtle" disabled title="Passkey/device key release requires a reviewed design and runtime capability.">
          {passkeyAvailable ? 'Passkey (unavailable until reviewed)' : 'Passkey unavailable'}
        </Button>
      </div>

      {mode === 'passphrase' ? (
        <TextField
          label="Vault passphrase"
          type="password"
          autoComplete="current-password"
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
          disabled={pending || cooldownActive || session.state === 'unavailable'}
          themeMode={themeMode}
          data-testid="web-vault-passphrase"
        />
      ) : (
        <TextField
          label="Vault recovery secret"
          type="password"
          autoComplete="off"
          value={recovery}
          onChange={(e) => setRecovery(e.target.value)}
          disabled={pending || cooldownActive || session.state === 'unavailable'}
          themeMode={themeMode}
          data-testid="web-vault-recovery"
        />
      )}

      {error ? <Feedback severity="danger" message={error} /> : null}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: spacing.xs }}>
        <Button
          themeMode={themeMode}
          variant="primary"
          disabled={pending || cooldownActive || session.state === 'unavailable'}
          data-testid="web-vault-unlock-submit"
          style={{ minHeight: touchTargets.webMin }}
          onClick={() =>
            void run(() =>
              mode === 'passphrase'
                ? onUnlockPassphrase(passphrase)
                : onUnlockRecovery(recovery)
            )
          }
        >
          {pending ? 'Unlocking…' : 'Unlock'}
        </Button>
        {pending ? (
          <Button themeMode={themeMode} variant="secondary" onClick={() => onCancelUnlock?.()}>
            Cancel
          </Button>
        ) : null}
        {session.state === 'unlocked' ? (
          <Button themeMode={themeMode} variant="secondary" onClick={() => onLock?.()}>
            Lock
          </Button>
        ) : null}
        {onDismiss ? (
          <Button themeMode={themeMode} variant="subtle" onClick={() => { clearSecrets(); onDismiss(); }}>
            Dismiss
          </Button>
        ) : null}
      </div>
    </section>
  );
};
