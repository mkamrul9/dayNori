'use client';

/**
 * Phase 47 — labeled development-only browser vault harness.
 * Production vault entry remains disabled. Does not import apps/mobile modules.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createLockedVaultSession,
  createProductionUnavailableVaultProviders,
  createSyntheticVaultProviders,
  VaultLifecycleController,
  type TransferUiPhase,
  type VaultSessionSnapshot,
} from '@daynori/domain';
import { Button, VaultShellView, VaultUnlockPanel, type WebVaultListItemVm } from '@daynori/ui-web';
import { useShell } from '../components/ShellContext';
import { BROWSER_MEMORY_CLEANUP_LIMITS, clearBrowserClipboardIfAvailable } from './browserSecurity.js';
import { publishVaultLockSignal, subscribeVaultLockSignals } from './crossTabLock.js';

export interface VaultHarnessClientProps {
  accountId?: string | null;
  workspaceId?: string | null;
  isOnline?: boolean;
}

export function VaultHarnessClient({
  accountId = 'synthetic-web-account',
  workspaceId = '11111111-1111-4111-8111-111111111111',
  isOnline = true,
}: VaultHarnessClientProps) {
  const { themeMode } = useShell();
  const synthetic = useMemo(() => createSyntheticVaultProviders(), []);
  // Production providers stay unavailable; never auto-substituted for the harness.
  const productionUnavailable = useMemo(() => createProductionUnavailableVaultProviders(), []);
  void productionUnavailable;

  const controller = useMemo(
    () =>
      new VaultLifecycleController(synthetic.bundle, {
        accountId,
        workspaceId,
        syntheticHarnessActive: true,
        config: { idleLockMs: 120_000, lockOnBackground: true },
      }),
    [synthetic.bundle, accountId, workspaceId]
  );

  const [session, setSession] = useState<VaultSessionSnapshot>(() =>
    createLockedVaultSession({ accountId, workspaceId, syntheticHarnessActive: true })
  );
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [items, setItems] = useState<WebVaultListItemVm[]>([]);
  const [trashItems, setTrashItems] = useState<WebVaultListItemVm[]>([]);
  const [showingTrash, setShowingTrash] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<{ title: string; body: string } | null>(
    null
  );
  const [transferPhase, setTransferPhase] = useState<TransferUiPhase>('preview');
  const [notes, setNotes] = useState('');
  const listEpochRef = useRef(0);
  const detailEpochRef = useRef(0);
  const mountedRef = useRef(true);
  const suppressCrossTabPublish = useRef(false);

  const clearProtectedUi = useCallback(() => {
    setSelectedDetail(null);
    setSelectedId(null);
    setItems([]);
    setUnlockOpen(false);
    setShowingTrash(false);
  }, []);

  const performLock = useCallback(
    async (reason: string, publish = true) => {
      clearProtectedUi();
      const result = await controller.lock(reason);
      const clip = await clearBrowserClipboardIfAvailable();
      setNotes([result.diagnostic, clip.note, `lock:${reason}`].filter(Boolean).join(' · '));
      if (publish && !suppressCrossTabPublish.current) {
        publishVaultLockSignal({
          type: 'lock_signal',
          reason,
          at: new Date().toISOString(),
        });
      }
    },
    [clearProtectedUi, controller]
  );

  useEffect(() => {
    mountedRef.current = true;
    const unsub = controller.subscribe((next) => {
      setSession(next);
      if (next.state !== 'unlocked') {
        listEpochRef.current += 1;
        detailEpochRef.current += 1;
        clearProtectedUi();
      }
    });
    void controller.refreshCapabilities();
    return () => {
      mountedRef.current = false;
      unsub();
      void controller.lock('unmount');
      clearProtectedUi();
    };
  }, [controller, clearProtectedUi]);

  const identityRef = useRef({ accountId, workspaceId });
  useEffect(() => {
    const prev = identityRef.current;
    if (prev.accountId === accountId && prev.workspaceId === workspaceId) return;
    identityRef.current = { accountId, workspaceId };
    void controller.onAccountOrWorkspaceChanged(accountId, workspaceId);
    clearProtectedUi();
    publishVaultLockSignal({
      type: 'session_invalidated',
      reason: 'account_or_workspace_changed',
      at: new Date().toISOString(),
    });
  }, [controller, accountId, workspaceId, clearProtectedUi]);

  useEffect(() => {
    return subscribeVaultLockSignals((msg) => {
      suppressCrossTabPublish.current = true;
      void performLock(`cross_tab:${msg.reason}`, false).finally(() => {
        suppressCrossTabPublish.current = false;
      });
    });
  }, [performLock]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== 'visible') {
        void performLock('visibility_hidden');
      } else {
        void controller.onResume();
        void controller.checkRevocationIfConnected(isOnline);
      }
    };
    document.addEventListener('visibilitychange', onVis);
    const onPageHide = () => {
      void performLock('pagehide');
    };
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [controller, isOnline, performLock]);

  useEffect(() => {
    if (session.state !== 'unlocked') return;
    const id = window.setInterval(() => {
      void controller.tickIdleLock().then((locked) => {
        if (locked) {
          publishVaultLockSignal({
            type: 'lock_signal',
            reason: 'idle',
            at: new Date().toISOString(),
          });
          clearProtectedUi();
        }
      });
    }, 5_000);
    return () => window.clearInterval(id);
  }, [controller, session.state, clearProtectedUi]);

  const reloadLists = useCallback(async () => {
    const epoch = ++listEpochRef.current;
    if (session.state !== 'unlocked') {
      if (!mountedRef.current || epoch !== listEpochRef.current) return;
      setItems([]);
      setTrashItems(
        synthetic.controls.listTrash().map((r) => ({
          id: r.id,
          displayLabel: 'Locked vault item',
          folderId: r.folderId,
          trashed: true,
        }))
      );
      return;
    }
    const keyHandleId = controller.getKeyHandleId();
    const active = await controller.getRepository().listItems(null);
    const folder = await controller.getRepository().listItems('vault-folder-a');
    if (
      !mountedRef.current ||
      epoch !== listEpochRef.current ||
      controller.getSnapshot().state !== 'unlocked'
    ) {
      return;
    }
    const mapped: WebVaultListItemVm[] = [];
    for (const row of [...active, ...folder]) {
      let label = row.titleCiphertextLabel;
      if (keyHandleId && controller.getKeyHandleId() === keyHandleId) {
        const revealed = await controller.getRepository().revealPlaintext(row.id, keyHandleId);
        if (
          !mountedRef.current ||
          epoch !== listEpochRef.current ||
          controller.getSnapshot().state !== 'unlocked'
        ) {
          return;
        }
        if (revealed.ok) label = revealed.title;
      }
      mapped.push({ id: row.id, displayLabel: label, folderId: row.folderId });
    }
    if (
      !mountedRef.current ||
      epoch !== listEpochRef.current ||
      controller.getSnapshot().state !== 'unlocked'
    ) {
      return;
    }
    setItems(mapped);
    setTrashItems(
      synthetic.controls.listTrash().map((r) => ({
        id: r.id,
        displayLabel: 'Trashed vault item',
        folderId: r.folderId,
        trashed: true,
      }))
    );
  }, [controller, session.state, synthetic.controls]);

  useEffect(() => {
    void reloadLists();
  }, [reloadLists, session.state]);

  const onSelectItem = async (id: string) => {
    if (!controller.canNavigate('vault_detail').allow) return;
    controller.noteActivity();
    const epoch = ++detailEpochRef.current;
    setSelectedId(id);
    const keyHandleId = controller.getKeyHandleId();
    if (!keyHandleId) {
      setSelectedDetail(null);
      return;
    }
    const revealed = await controller.getRepository().revealPlaintext(id, keyHandleId);
    if (
      !mountedRef.current ||
      epoch !== detailEpochRef.current ||
      controller.getSnapshot().state !== 'unlocked' ||
      controller.getKeyHandleId() !== keyHandleId
    ) {
      return;
    }
    setSelectedDetail(revealed.ok ? { title: revealed.title, body: revealed.body } : null);
  };

  return (
    <div data-testid="web-vault-harness-root">
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: 12 }}>
        <FeedbackBanner />
        <Button
          themeMode={themeMode}
          variant="subtle"
          onClick={() => {
            synthetic.controls.invalidateBiometric();
            void controller.refreshCapabilities();
          }}
        >
          Simulate biometric invalidation
        </Button>
        <Button
          themeMode={themeMode}
          variant="subtle"
          onClick={() => {
            synthetic.controls.revokeDevice();
            void controller.checkRevocationIfConnected(true);
          }}
        >
          Simulate device revocation
        </Button>
      </div>

      <VaultShellView
        themeMode={themeMode}
        session={session}
        syntheticHarness
        items={items}
        trashItems={trashItems}
        selectedId={selectedId}
        selectedDetail={selectedDetail}
        transferPhase={transferPhase}
        showingTrash={showingTrash}
        statusNotes={notes}
        onOpenUnlock={() => setUnlockOpen(true)}
        onLock={() => void performLock('explicit')}
        onSelectItem={(id) => void onSelectItem(id)}
        onClearSelection={() => {
          setSelectedId(null);
          setSelectedDetail(null);
        }}
        onShowTrash={() => setShowingTrash((v) => !v)}
        onTransferPhaseChange={setTransferPhase}
      />

      {unlockOpen ? (
        <div style={{ padding: 12 }}>
          <VaultUnlockPanel
            themeMode={themeMode}
            session={session}
            syntheticHarness
            passkeyAvailable={false}
            onDismiss={() => setUnlockOpen(false)}
            onCancelUnlock={() => {
              void controller.cancelUnlock();
              setUnlockOpen(false);
            }}
            onLock={() => void performLock('explicit')}
            onUnlockPassphrase={async (passphrase) => {
              const res = await controller.unlockWithPassphrase(passphrase);
              // Unlocking this tab must not unlock other tabs.
              if (res.ok) setUnlockOpen(false);
              return res.ok ? { ok: true } : { ok: false, message: res.message };
            }}
            onUnlockRecovery={async (secret) => {
              const res = await controller.unlockWithRecoverySecret(secret);
              if (res.ok) setUnlockOpen(false);
              return res.ok ? { ok: true } : { ok: false, message: res.message };
            }}
          />
        </div>
      ) : null}

      <aside aria-label="Browser vault limits" style={{ padding: 12, fontSize: 13 }}>
        <ul>
          {BROWSER_MEMORY_CLEANUP_LIMITS.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </aside>
    </div>
  );
}

function FeedbackBanner() {
  return (
    <p role="note" data-testid="web-vault-harness-banner" style={{ flex: '1 1 100%', margin: 0 }}>
      DEVELOPMENT HARNESS — synthetic fixtures only. Production vault providers remain unavailable.
      Phase 45 sync and independent review are still required before real-user enablement.
    </p>
  );
}
