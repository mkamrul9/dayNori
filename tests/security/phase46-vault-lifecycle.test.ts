/**
 * Phase 46 vault unlock lifecycle tests.
 * Synthetic harness providers only — not production crypto-provider integration.
 */
import { describe, it, expect } from 'vitest';
import {
  createLockedVaultSession,
  evaluateProtectedVaultNavigation,
  reduceVaultSession,
  shouldIdleLock,
  assertNotSolePinSecret,
  describeTransferUiStatus,
  DEFAULT_VAULT_RETRY_POLICY,
} from '../../packages/domain/src/vaultLifecycle.js';
import { VaultLifecycleController } from '../../apps/mobile/src/vault/VaultLifecycleController.js';
import { createProductionUnavailableVaultProviders } from '../../apps/mobile/src/vault/providers.js';
import {
  createSyntheticVaultProviders,
  SYNTHETIC_PASSPHRASE,
  SYNTHETIC_RECOVERY,
} from '../../apps/mobile/src/vault/syntheticProviders.js';
import {
  lockedVaultAccessibilityLabel,
  redactVaultLogFields,
} from '../../apps/mobile/src/vault/presentationProtection.js';

describe('Phase 46 vault lifecycle (synthetic harness — not production integration)', () => {
  it('denies protected navigation while locked', () => {
    const locked = createLockedVaultSession();
    expect(evaluateProtectedVaultNavigation(locked, 'vault_detail').allow).toBe(false);
  });

  it('allows protected navigation only when unlocked', () => {
    let s = createLockedVaultSession({ syntheticHarnessActive: true });
    s = reduceVaultSession(s, {
      type: 'unlock_started',
      operationId: 'op1',
      method: 'passphrase',
      at: '2026-10-19T00:00:00.000Z',
    });
    s = reduceVaultSession(s, {
      type: 'unlock_succeeded',
      operationId: 'op1',
      method: 'passphrase',
      at: '2026-10-19T00:00:01.000Z',
      generationAtStart: 1,
    });
    expect(s.state).toBe('unlocked');
    expect(evaluateProtectedVaultNavigation(s, 'vault_list').allow).toBe(true);
  });

  it('rejects stale unlock after background lock generation bump', () => {
    let s = createLockedVaultSession({ syntheticHarnessActive: true });
    s = reduceVaultSession(s, {
      type: 'unlock_started',
      operationId: 'op-stale',
      method: 'passphrase',
      at: '2026-10-19T00:00:00.000Z',
    });
    const gen = s.generation;
    s = reduceVaultSession(s, {
      type: 'lock_requested',
      at: '2026-10-19T00:00:01.000Z',
      reason: 'background',
    });
    expect(s.generation).toBeGreaterThan(gen);
    s = reduceVaultSession(s, {
      type: 'unlock_succeeded',
      operationId: 'op-stale',
      method: 'passphrase',
      at: '2026-10-19T00:00:02.000Z',
      generationAtStart: gen,
    });
    expect(s.state).toBe('locked');
  });

  it('applies retry cooldown without destroying recoverable data policy', () => {
    expect(DEFAULT_VAULT_RETRY_POLICY.destroyDataOnFailure).toBe(false);
    let s = createLockedVaultSession({ syntheticHarnessActive: true });
    for (let i = 0; i < 5; i++) {
      s = reduceVaultSession(s, {
        type: 'unlock_started',
        operationId: `f${i}`,
        method: 'passphrase',
        at: `2026-10-19T00:00:0${i}.000Z`,
      });
      s = reduceVaultSession(s, {
        type: 'unlock_failed',
        operationId: `f${i}`,
        reason: 'wrong_credentials',
        at: `2026-10-19T00:00:0${i}.500Z`,
        generationAtStart: s.generation,
      });
    }
    expect(s.failedAttempts).toBe(5);
    expect(s.cooldownUntil).toBeTruthy();
  });

  it('forbids short PIN as sole synchronized secret helper', () => {
    expect(() => assertNotSolePinSecret('pin_device_key')).toThrow(/never be the sole secret/);
  });

  it('idle lock triggers after inactivity window', () => {
    const unlocked = {
      ...createLockedVaultSession({ syntheticHarnessActive: true }),
      state: 'unlocked' as const,
      unlockedAt: '2026-10-19T00:00:00.000Z',
      lastActivityAt: '2026-10-19T00:00:00.000Z',
    };
    expect(shouldIdleLock(unlocked, '2026-10-19T00:03:00.000Z', 120_000)).toBe(true);
  });

  it('transfer UI statuses preserve recoverable-copy messaging', () => {
    expect(describeTransferUiStatus('pending_cleanup').preservesRecoverableCopy).toBe(true);
    expect(describeTransferUiStatus('failed').message).toMatch(/recoverable copy/i);
  });

  it('production providers are unavailable and do not fall back to synthetic', async () => {
    const prod = createProductionUnavailableVaultProviders();
    expect(prod.keyProvider.kind).toBe('production');
    expect(prod.keyProvider.availability()).toBe('unavailable');
    const outcome = await prod.keyProvider.unwrapWithPassphrase('anything');
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe('unavailable');
  });

  it('synthetic controller: unlock success, wrong credentials, cancel, background lock', async () => {
    const { bundle } = createSyntheticVaultProviders();
    const c = new VaultLifecycleController(bundle, {
      syntheticHarnessActive: true,
      config: {
        lockOnBackground: true,
        now: () => '2026-10-19T12:00:00.000Z',
        generateOperationId: () => 'fixed-op',
      },
    });
    await c.refreshCapabilities();

    const bad = await c.unlockWithPassphrase('wrong');
    expect(bad.ok).toBe(false);

    const startGen = c.getSnapshot().generation;
    await c.beginUnlock('passphrase');
    await c.cancelUnlock();
    expect(c.getSnapshot().state).toBe('locked');
    expect(c.getSnapshot().generation).toBeGreaterThan(startGen);

    const ok = await c.unlockWithPassphrase(SYNTHETIC_PASSPHRASE);
    expect(ok.ok).toBe(true);
    expect(c.getSnapshot().state).toBe('unlocked');
    expect(c.canNavigate('vault_detail').allow).toBe(true);

    await c.onBackground();
    expect(c.getSnapshot().state).toBe('locked');
    expect(c.getKeyHandleId()).toBeNull();
  });

  it('synthetic controller: recovery unlock and biometric invalidation', async () => {
    const { bundle, controls } = createSyntheticVaultProviders();
    const c = new VaultLifecycleController(bundle, { syntheticHarnessActive: true });
    await c.refreshCapabilities();
    const recovered = await c.unlockWithRecoverySecret(SYNTHETIC_RECOVERY);
    expect(recovered.ok).toBe(true);
    await c.lock();

    controls.invalidateBiometric();
    await c.refreshCapabilities();
    const bio = await c.unlockWithBiometric();
    expect(bio.ok).toBe(false);
    if (!bio.ok) expect(bio.reason).toBe('biometric_invalidated');
  });

  it('synthetic controller: account change locks and bumps generation', async () => {
    const { bundle } = createSyntheticVaultProviders();
    const c = new VaultLifecycleController(bundle, {
      syntheticHarnessActive: true,
      accountId: 'a1',
      workspaceId: 'w1',
    });
    await c.unlockWithPassphrase(SYNTHETIC_PASSPHRASE);
    const gen = c.getSnapshot().generation;
    await c.onAccountOrWorkspaceChanged('a2', 'w2');
    expect(c.getSnapshot().state).toBe('locked');
    expect(c.getSnapshot().generation).toBeGreaterThan(gen);
    expect(c.getSnapshot().accountId).toBe('a2');
  });

  it('unlock completing after lock does not reopen vault', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { bundle } = createSyntheticVaultProviders();
    const slow = new VaultLifecycleController(
      {
        ...bundle,
        keyProvider: {
          ...bundle.keyProvider,
          async unwrapWithPassphrase(passphrase: string) {
            await gate;
            return bundle.keyProvider.unwrapWithPassphrase(passphrase);
          },
        },
      },
      { syntheticHarnessActive: true }
    );
    const pending = slow.unlockWithPassphrase(SYNTHETIC_PASSPHRASE);
    await slow.lock('explicit');
    release();
    const result = await pending;
    expect(result.ok).toBe(false);
    expect(slow.getSnapshot().state).toBe('locked');
  });

  it('process restart model begins locked', () => {
    const cold = createLockedVaultSession({ syntheticHarnessActive: true });
    expect(cold.state).toBe('locked');
    expect(cold.unlockedAt).toBeNull();
  });

  it('redacts sensitive log fields and locked a11y labels omit plaintext', () => {
    expect(lockedVaultAccessibilityLabel('item list')).not.toMatch(/secret|passphrase/i);
    const redacted = redactVaultLogFields({
      operationId: 'op',
      passphrase: 'x',
      title: 'secret title',
    });
    expect(redacted.passphrase).toBe('[redacted]');
    expect(redacted.title).toBe('[redacted]');
    expect(redacted.operationId).toBe('op');
  });

  it('PIN device-key unwrap stays unavailable in synthetic provider', async () => {
    const { bundle } = createSyntheticVaultProviders();
    const pin = await bundle.keyProvider.unwrapWithPinDeviceKey('1234');
    expect(pin.ok).toBe(false);
    if (!pin.ok) expect(pin.reason).toBe('pin_scheme_unavailable');
  });
});
