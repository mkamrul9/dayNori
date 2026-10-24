/**
 * Phase 46 vault unlock lifecycle tests.
 * Synthetic harness providers only — not production crypto-provider integration.
 */
import { describe, it, expect } from 'vitest';
import {
  admitUnlockAttempt,
  createLockedVaultSession,
  evaluateProtectedVaultNavigation,
  reduceVaultSession,
  shouldIdleLock,
  assertNotSolePinSecret,
  describeTransferUiStatus,
  DEFAULT_VAULT_RETRY_POLICY,
  VaultLifecycleController,
  createProductionUnavailableVaultProviders,
} from '../../packages/domain/src/index.js';
import {
  createSyntheticVaultProviders,
  SYNTHETIC_PASSPHRASE,
  SYNTHETIC_RECOVERY,
} from '../../apps/mobile/src/vault/syntheticProviders.js';
import {
  lockedVaultAccessibilityLabel,
  redactVaultLogFields,
  clearClipboardIfControllable,
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

  it('refuses unlock_succeeded when not unlock_pending (cooldown bypass class)', () => {
    let s = createLockedVaultSession({ syntheticHarnessActive: true });
    s = {
      ...s,
      cooldownUntil: '2026-10-19T01:00:00.000Z',
      failedAttempts: 5,
    };
    const admission = admitUnlockAttempt(s, 'passphrase', '2026-10-19T00:30:00.000Z');
    expect(admission.admit).toBe(false);
    s = reduceVaultSession(s, {
      type: 'unlock_started',
      operationId: 'op-cool',
      method: 'passphrase',
      at: '2026-10-19T00:30:00.000Z',
    });
    expect(s.state).toBe('locked');
    expect(s.pendingOperationId).toBeNull();
    s = reduceVaultSession(s, {
      type: 'unlock_succeeded',
      operationId: 'op-cool',
      method: 'passphrase',
      at: '2026-10-19T00:30:01.000Z',
      generationAtStart: s.generation,
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
    const begun = c.beginUnlock('passphrase');
    expect(begun.ok).toBe(true);
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

  it('cooldown blocks provider invocation and correct passphrase during cooldown', async () => {
    let passphraseCalls = 0;
    const { bundle } = createSyntheticVaultProviders();
    const c = new VaultLifecycleController(
      {
        ...bundle,
        keyProvider: {
          ...bundle.keyProvider,
          async unwrapWithPassphrase(passphrase: string) {
            passphraseCalls += 1;
            return bundle.keyProvider.unwrapWithPassphrase(passphrase);
          },
        },
      },
      {
        syntheticHarnessActive: true,
        config: {
          retryPolicy: { maxFailedAttempts: 1, cooldownMs: 60_000, destroyDataOnFailure: false },
          now: () => '2026-10-19T12:00:00.000Z',
        },
      }
    );

    const fail = await c.unlockWithPassphrase('wrong');
    expect(fail.ok).toBe(false);
    expect(passphraseCalls).toBe(1);
    expect(c.getSnapshot().cooldownUntil).toBeTruthy();

    const duringCooldown = await c.unlockWithPassphrase(SYNTHETIC_PASSPHRASE);
    expect(duringCooldown.ok).toBe(false);
    if (!duringCooldown.ok) expect(duringCooldown.reason).toBe('cooldown_active');
    expect(passphraseCalls).toBe(1);
    expect(c.getSnapshot().state).toBe('locked');
    expect(c.getKeyHandleId()).toBeNull();
  });

  it('recovery and biometric paths respect cooldown admission', async () => {
    let recoveryCalls = 0;
    let bioCalls = 0;
    const { bundle } = createSyntheticVaultProviders();
    const c = new VaultLifecycleController(
      {
        ...bundle,
        keyProvider: {
          ...bundle.keyProvider,
          async unwrapWithRecoverySecret(secret: string) {
            recoveryCalls += 1;
            return bundle.keyProvider.unwrapWithRecoverySecret(secret);
          },
          async unwrapWithBiometricDeviceKey() {
            bioCalls += 1;
            return bundle.keyProvider.unwrapWithBiometricDeviceKey();
          },
        },
      },
      {
        syntheticHarnessActive: true,
        config: {
          retryPolicy: { maxFailedAttempts: 1, cooldownMs: 60_000, destroyDataOnFailure: false },
          now: () => '2026-10-19T12:00:00.000Z',
        },
      }
    );
    await c.unlockWithPassphrase('wrong');
    const rec = await c.unlockWithRecoverySecret(SYNTHETIC_RECOVERY);
    const bio = await c.unlockWithBiometric();
    expect(rec.ok).toBe(false);
    expect(bio.ok).toBe(false);
    expect(recoveryCalls).toBe(0);
    expect(bioCalls).toBe(0);
  });

  it('overlapping unlock: discarded success releases handle and does not reopen vault', async () => {
    const released: string[] = [];
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((r) => {
      releaseFirst = r;
    });
    const { bundle } = createSyntheticVaultProviders();
    const slow = new VaultLifecycleController(
      {
        ...bundle,
        keyProvider: {
          ...bundle.keyProvider,
          async unwrapWithPassphrase(passphrase: string) {
            await firstGate;
            return bundle.keyProvider.unwrapWithPassphrase(passphrase);
          },
          async releaseKeyHandle(id: string) {
            released.push(id);
            return bundle.keyProvider.releaseKeyHandle(id);
          },
        },
      },
      { syntheticHarnessActive: true }
    );
    const pending = slow.unlockWithPassphrase(SYNTHETIC_PASSPHRASE);
    // Second admit while pending must fail without calling provider.
    const overlap = await slow.unlockWithPassphrase(SYNTHETIC_PASSPHRASE);
    expect(overlap.ok).toBe(false);
    if (!overlap.ok) expect(overlap.reason).toBe('admission_denied');

    await slow.lock('explicit');
    releaseFirst();
    const result = await pending;
    expect(result.ok).toBe(false);
    expect(slow.getSnapshot().state).toBe('locked');
    expect(released.length).toBeGreaterThanOrEqual(1);
  });

  it('lock detaches key handle before awaiting cleanup; cleanup failure keeps session locked', async () => {
    let resolveRelease!: () => void;
    const releaseGate = new Promise<void>((r) => {
      resolveRelease = r;
    });
    let releaseStarted = false;
    const { bundle } = createSyntheticVaultProviders();
    const c = new VaultLifecycleController(
      {
        ...bundle,
        keyProvider: {
          ...bundle.keyProvider,
          async releaseKeyHandle(id: string) {
            releaseStarted = true;
            await releaseGate;
            return bundle.keyProvider.releaseKeyHandle(id);
          },
        },
        ciphertextRepository: {
          ...bundle.ciphertextRepository,
          async clearPlaintextCaches() {
            throw new Error('cache boom');
          },
        },
      },
      { syntheticHarnessActive: true }
    );
    await c.unlockWithPassphrase(SYNTHETIC_PASSPHRASE);
    expect(c.getKeyHandleId()).toBeTruthy();

    const lockPromise = c.lock('explicit');
    // Synchronously after lock() begins awaiting release, session must already be locked.
    await Promise.resolve();
    expect(c.getSnapshot().state).toBe('locked');
    expect(c.getKeyHandleId()).toBeNull();
    expect(c.canNavigate('vault_detail').allow).toBe(false);
    expect(releaseStarted).toBe(true);

    resolveRelease();
    const lockResult = await lockPromise;
    expect(lockResult.locked).toBe(true);
    expect(lockResult.cleanupFailed).toBe(true);
    expect(lockResult.diagnostic).toMatch(/cache_cleanup_failed/);
    expect(c.getSnapshot().state).toBe('locked');
  });

  it('rejected key release still leaves session locked with diagnostic', async () => {
    const { bundle } = createSyntheticVaultProviders();
    const c = new VaultLifecycleController(
      {
        ...bundle,
        keyProvider: {
          ...bundle.keyProvider,
          async releaseKeyHandle() {
            throw new Error('release failed');
          },
        },
      },
      { syntheticHarnessActive: true }
    );
    await c.unlockWithPassphrase(SYNTHETIC_PASSPHRASE);
    const result = await c.lock('explicit');
    expect(result.locked).toBe(true);
    expect(result.cleanupFailed).toBe(true);
    expect(result.diagnostic).toMatch(/key_release_failed/);
    expect(c.getSnapshot().state).toBe('locked');
    expect(c.getKeyHandleId()).toBeNull();
  });

  it('stale failure after lock does not alter locked session counters incorrectly', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { bundle } = createSyntheticVaultProviders();
    const c = new VaultLifecycleController(
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
      {
        syntheticHarnessActive: true,
        config: {
          retryPolicy: { maxFailedAttempts: 5, cooldownMs: 60_000, destroyDataOnFailure: false },
        },
      }
    );
    const pending = c.unlockWithPassphrase('wrong');
    await c.lock('explicit');
    release();
    const result = await pending;
    expect(result.ok).toBe(false);
    expect(c.getSnapshot().state).toBe('locked');
    // Stale failure must not count against retry policy after lock invalidated the op.
    expect(c.getSnapshot().failedAttempts).toBe(0);
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

  it('clipboard helper without adapter does not claim clearing', async () => {
    const result = await clearClipboardIfControllable(undefined);
    expect(result.cleared).toBe(false);
    expect(result.note).toMatch(/unavailable/i);
  });

  it('PIN device-key unwrap stays unavailable in synthetic provider', async () => {
    const { bundle } = createSyntheticVaultProviders();
    const pin = await bundle.keyProvider.unwrapWithPinDeviceKey('1234');
    expect(pin.ok).toBe(false);
    if (!pin.ok) expect(pin.reason).toBe('pin_scheme_unavailable');
  });
});
