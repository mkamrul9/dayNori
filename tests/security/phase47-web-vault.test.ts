/**
 * Phase 47 web vault lifecycle / security boundary tests.
 * Synthetic harness + domain controller — not production provider integration.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  admitUnlockAttempt,
  createProductionUnavailableVaultProviders,
  createSyntheticVaultProviders,
  evaluateProtectedVaultNavigation,
  SYNTHETIC_PASSPHRASE,
  SYNTHETIC_RECOVERY,
  VaultLifecycleController,
} from '../../packages/domain/src/index.js';
import {
  assertNoVaultPlaintextInUrl,
  clearBrowserClipboardIfAvailable,
  redactVaultDiagnostic,
  VAULT_CONSUMER_EXCLUSION_SURFACES,
} from '../../apps/web/src/vault/browserSecurity.js';
import { searchDownloadedRecords } from '../../packages/domain/src/search.js';
import {
  publishVaultLockSignal,
  subscribeVaultLockSignals,
  type VaultCrossTabMessage,
} from '../../apps/web/src/vault/crossTabLock.js';
import { safeDisplayText } from '../../packages/ui-web/src/VaultShellView.js';

describe('Phase 47 web vault (provisional harness — not production integration)', () => {
  it('production providers remain unavailable (no silent synthetic substitution)', async () => {
    const prod = createProductionUnavailableVaultProviders();
    expect(prod.keyProvider.availability()).toBe('unavailable');
    expect(prod.keyProvider.kind).toBe('production');
    const outcome = await prod.keyProvider.unwrapWithPassphrase(SYNTHETIC_PASSPHRASE);
    expect(outcome.ok).toBe(false);
  });

  it('cross-platform synthetic fixtures match shared constants', () => {
    const { controls } = createSyntheticVaultProviders();
    expect(controls.expectedPassphrase).toBe(SYNTHETIC_PASSPHRASE);
    expect(controls.expectedRecovery).toBe(SYNTHETIC_RECOVERY);
  });

  it('denies protected navigation while locked and allows when unlocked', async () => {
    const { bundle } = createSyntheticVaultProviders();
    const c = new VaultLifecycleController(bundle, { syntheticHarnessActive: true });
    expect(evaluateProtectedVaultNavigation(c.getSnapshot(), 'vault_list').allow).toBe(false);
    await c.unlockWithPassphrase(SYNTHETIC_PASSPHRASE);
    expect(c.canNavigate('vault_detail').allow).toBe(true);
  });

  it('cooldown, cancel, recovery unlock, and unavailable admission', async () => {
    let calls = 0;
    const { bundle } = createSyntheticVaultProviders();
    const c = new VaultLifecycleController(
      {
        ...bundle,
        keyProvider: {
          ...bundle.keyProvider,
          async unwrapWithPassphrase(p) {
            calls += 1;
            return bundle.keyProvider.unwrapWithPassphrase(p);
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
    expect(calls).toBe(1);
    const blocked = await c.unlockWithPassphrase(SYNTHETIC_PASSPHRASE);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.reason).toBe('cooldown_active');
    expect(calls).toBe(1);

    const admission = admitUnlockAttempt(c.getSnapshot(), 'passphrase', '2026-10-19T12:00:00.000Z');
    expect(admission.admit).toBe(false);

    const fresh = new VaultLifecycleController(bundle, { syntheticHarnessActive: true });
    const begun = fresh.beginUnlock('passphrase');
    expect(begun.ok).toBe(true);
    await fresh.cancelUnlock();
    expect(fresh.getSnapshot().state).toBe('locked');

    const recovered = await new VaultLifecycleController(bundle, {
      syntheticHarnessActive: true,
    }).unlockWithRecoverySecret(SYNTHETIC_RECOVERY);
    expect(recovered.ok).toBe(true);
  });

  it('lock during pending unlock and cleanup failure keep session locked', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const { bundle } = createSyntheticVaultProviders();
    const c = new VaultLifecycleController(
      {
        ...bundle,
        keyProvider: {
          ...bundle.keyProvider,
          async unwrapWithPassphrase(p) {
            await gate;
            return bundle.keyProvider.unwrapWithPassphrase(p);
          },
          async releaseKeyHandle() {
            throw new Error('release failed');
          },
        },
        ciphertextRepository: {
          ...bundle.ciphertextRepository,
          async clearPlaintextCaches() {
            throw new Error('cache failed');
          },
        },
      },
      { syntheticHarnessActive: true }
    );
    const pending = c.unlockWithPassphrase(SYNTHETIC_PASSPHRASE);
    const lockResult = await c.lock('explicit');
    expect(lockResult.locked).toBe(true);
    expect(c.getKeyHandleId()).toBeNull();
    expect(c.canNavigate('vault_detail').allow).toBe(false);
    release();
    expect((await pending).ok).toBe(false);

    await c.unlockWithPassphrase(SYNTHETIC_PASSPHRASE);
    const cleanup = await c.lock('explicit');
    expect(cleanup.cleanupFailed).toBe(true);
    expect(c.getSnapshot().state).toBe('locked');
  });

  it('account change invalidates session and bumps generation', async () => {
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
  });

  it('cross-tab lock signals never carry secrets and trigger subscribers', () => {
    const messages: VaultCrossTabMessage[] = [];
    const posted: unknown[] = [];
    const fakeChannel = {
      postMessage: (m: unknown) => posted.push(m),
      close: () => {},
      addEventListener: (_: string, handler: (ev: MessageEvent) => void) => {
        fakeChannel._handler = handler;
      },
      removeEventListener: () => {},
      _handler: null as null | ((ev: MessageEvent) => void),
      dispatch(data: unknown) {
        fakeChannel._handler?.({ data } as MessageEvent);
      },
    };
    const factory = () => fakeChannel as unknown as BroadcastChannel;
    const unsub = subscribeVaultLockSignals((m) => messages.push(m), factory);
    publishVaultLockSignal(
      { type: 'lock_signal', reason: 'explicit', at: '2026-10-19T12:00:00.000Z' },
      factory
    );
    expect(JSON.stringify(posted[0])).not.toMatch(/passphrase|recovery|synth-handle|plaintext/i);
    fakeChannel.dispatch({
      type: 'lock_signal',
      reason: 'visibility_hidden',
      at: '2026-10-19T12:00:01.000Z',
    });
    expect(messages).toHaveLength(1);
    expect(messages[0]?.type).toBe('lock_signal');
    unsub();
  });

  it('redacts nested diagnostics and sanitizes display text', () => {
    const redacted = redactVaultDiagnostic({
      operationId: 'op',
      passphrase: 'x',
      title: 'secret',
      nested: { recoverySecret: 'should-stay-visible-key-name-only' },
    });
    expect(redacted.passphrase).toBe('[redacted]');
    expect(redacted.title).toBe('[redacted]');
    // Top-level key redaction; nested objects are not deep-walked — callers must flatten sensitive keys.
    expect(VAULT_CONSUMER_EXCLUSION_SURFACES).toContain('search');
    expect(assertNoVaultPlaintextInUrl('https://app.example/vault')).toBe(true);
    expect(assertNoVaultPlaintextInUrl('https://app.example/?passphrase=x')).toBe(false);
    expect(safeDisplayText('ok\u0000title')).toBe('oktitle');
  });

  it('search consumer boundary excludes vault-scoped headers', () => {
    const results = searchDownloadedRecords({
      workspaceId: 'ws-vault-boundary',
      query: { q: 'secret' },
      items: {
        headers: [
          {
            id: 'ordinary-1',
            workspaceId: 'ws-vault-boundary',
            kind: 'note',
            folderId: null,
            securityScope: 'standard',
            deletedAt: null,
            createdAt: '2026-10-19T00:00:00.000Z',
            updatedAt: '2026-10-19T00:00:00.000Z',
          },
          {
            id: 'vault-1',
            workspaceId: 'ws-vault-boundary',
            kind: 'note',
            folderId: null,
            securityScope: 'vault',
            deletedAt: null,
            createdAt: '2026-10-19T00:00:00.000Z',
            updatedAt: '2026-10-19T00:00:00.000Z',
          },
        ],
        notes: [
          {
            id: 'ordinary-1',
            workspaceId: 'ws-vault-boundary',
            title: 'ordinary secret note',
            plainText: 'visible secret body',
            createdAt: '2026-10-19T00:00:00.000Z',
            updatedAt: '2026-10-19T00:00:00.000Z',
          },
          {
            id: 'vault-1',
            workspaceId: 'ws-vault-boundary',
            title: 'vault secret note',
            plainText: 'must not appear',
            createdAt: '2026-10-19T00:00:00.000Z',
            updatedAt: '2026-10-19T00:00:00.000Z',
          },
        ],
      },
    });
    const ids = results.data.map((i) => i.id);
    expect(ids).toContain('ordinary-1');
    expect(ids).not.toContain('vault-1');
  });

  it('clipboard helper without API does not claim clearing', async () => {
    const desc = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { clipboard: undefined },
    });
    try {
      const result = await clearBrowserClipboardIfAvailable();
      expect(result.cleared).toBe(false);
      expect(result.note).toMatch(/unavailable|not established/i);
    } finally {
      if (desc) Object.defineProperty(globalThis, 'navigator', desc);
    }
  });

  it('one tab unlock model: unlocking does not publish unlock secrets to other tabs', async () => {
    const posted: unknown[] = [];
    const factory = () =>
      ({
        postMessage: (m: unknown) => posted.push(m),
        close: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as BroadcastChannel;
    // Harness only publishes lock/session_invalidated — never unlock success payloads.
    publishVaultLockSignal(
      { type: 'session_invalidated', reason: 'account_or_workspace_changed', at: 't' },
      factory
    );
    expect(posted).toHaveLength(1);
    expect((posted[0] as VaultCrossTabMessage).type).not.toBe('unlock');
  });
});

describe('Phase 47 production vault page SSR contract (static)', () => {
  it('disabled vault page source has no synthetic secrets in metadata/body', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../apps/web/src/app/vault/page.tsx'),
      'utf8'
    );
    expect(src).toMatch(/Vault unavailable/);
    expect(src).not.toMatch(/correct-horse|0123456789abcdef/);
    expect(src).toMatch(/Production vault access is disabled/);
  });
});

describe('Phase 47 CSP middleware presence', () => {
  it('middleware builds nonce CSP without production unsafe-inline scripts', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const mw = fs.readFileSync(
      path.resolve(__dirname, '../../apps/web/src/middleware.ts'),
      'utf8'
    );
    expect(mw).toMatch(/Content-Security-Policy/);
    expect(mw).toMatch(/nonce-/);
    expect(mw).toMatch(/strict-dynamic/);
    expect(mw).toMatch(/microphone=\(self\)/);
    // Production script branch must not include unsafe-inline.
    expect(mw).toMatch(/isProd\s*\?\s*`'self' 'nonce-\$\{nonce\}' 'strict-dynamic'`/);
  });
});

beforeEach(() => {
  vi.restoreAllMocks();
});
afterEach(() => {
  vi.restoreAllMocks();
});
