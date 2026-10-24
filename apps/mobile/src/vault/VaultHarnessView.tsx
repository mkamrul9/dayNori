/**
 * Phase 46 synthetic vault harness host — not a production vault entry point.
 * Development builds only (__DEV__).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import type { ThemeMode } from '@daynori/design-tokens';
import {
  createLockedVaultSession,
  type TransferUiPhase,
  type VaultSessionSnapshot,
} from '@daynori/domain';
import {
  MobileButton,
  MobileVaultShellView,
  MobileVaultUnlockSheet,
  type VaultListItemVm,
} from '@daynori/ui-mobile';
import { VaultLifecycleController } from './VaultLifecycleController.js';
import { createSyntheticVaultProviders } from './syntheticProviders.js';
import {
  clearClipboardIfControllable,
  disableVaultScreenProtection,
  enableVaultScreenProtection,
  tryLoadClipboardClearAdapter,
} from './presentationProtection.js';

export interface VaultHarnessViewProps {
  themeMode: ThemeMode;
  onClose: () => void;
  accountId?: string | null;
  workspaceId?: string | null;
  isOnline?: boolean;
  testID?: string;
}

export function VaultHarnessView({
  themeMode,
  onClose,
  accountId = 'synthetic-account',
  workspaceId = '11111111-1111-4111-8111-111111111111',
  isOnline = true,
  testID = 'vault-harness-view',
}: VaultHarnessViewProps) {
  const synthetic = useMemo(() => createSyntheticVaultProviders(), []);
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
  const [items, setItems] = useState<VaultListItemVm[]>([]);
  const [trashItems, setTrashItems] = useState<VaultListItemVm[]>([]);
  const [showingTrash, setShowingTrash] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<{ title: string; body: string } | null>(null);
  const [transferPhase, setTransferPhase] = useState<TransferUiPhase>('preview');
  const [protectionNote, setProtectionNote] = useState<string>('');
  const [clipboardNote, setClipboardNote] = useState<string>('');
  const [cleanupNote, setCleanupNote] = useState<string>('');
  const listEpochRef = useRef(0);
  const detailEpochRef = useRef(0);
  const mountedRef = useRef(true);
  const clipboardAdapterRef = useRef<((value: string) => Promise<void>) | null>(null);

  const clearProtectedUi = useCallback(() => {
    setSelectedDetail(null);
    setSelectedId(null);
    setItems([]);
    setUnlockOpen(false);
    setShowingTrash(false);
  }, []);

  const wipeClipboard = useCallback(async () => {
    const adapter = clipboardAdapterRef.current;
    if (!adapter) {
      setClipboardNote('Clipboard adapter unavailable; clearing not established.');
      return;
    }
    const result = await clearClipboardIfControllable(adapter);
    setClipboardNote(result.note);
  }, []);

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
    void tryLoadClipboardClearAdapter().then((adapter) => {
      clipboardAdapterRef.current = adapter;
      if (!adapter) {
        setClipboardNote('Clipboard adapter unavailable; clearing not established.');
      }
    });
    return () => {
      mountedRef.current = false;
      unsub();
      void controller.lock('unmount');
      void disableVaultScreenProtection();
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
  }, [controller, accountId, workspaceId, clearProtectedUi]);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      const status = await enableVaultScreenProtection();
      if (mounted) setProtectionNote(status.note);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') {
        void controller.onBackground();
        void wipeClipboard();
        clearProtectedUi();
      } else {
        void controller.onResume();
        void controller.checkRevocationIfConnected(isOnline);
      }
    });
    return () => sub.remove();
  }, [controller, isOnline, wipeClipboard, clearProtectedUi]);

  // Idle locking: schedule ticks while unlocked; activity resets via noteActivity.
  useEffect(() => {
    if (session.state !== 'unlocked') return;
    const id = setInterval(() => {
      void controller.tickIdleLock();
    }, 5_000);
    return () => clearInterval(id);
  }, [controller, session.state]);

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
    if (!mountedRef.current || epoch !== listEpochRef.current || controller.getSnapshot().state !== 'unlocked') {
      return;
    }
    const mapped: VaultListItemVm[] = [];
    for (const row of [...active, ...folder]) {
      let label = row.titleCiphertextLabel;
      if (keyHandleId && controller.getKeyHandleId() === keyHandleId) {
        const revealed = await controller.getRepository().revealPlaintext(row.id, keyHandleId);
        if (!mountedRef.current || epoch !== listEpochRef.current || controller.getSnapshot().state !== 'unlocked') {
          return;
        }
        if (revealed.ok) label = revealed.title;
      }
      mapped.push({ id: row.id, displayLabel: label, folderId: row.folderId });
    }
    if (!mountedRef.current || epoch !== listEpochRef.current || controller.getSnapshot().state !== 'unlocked') {
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
    const nav = controller.canNavigate('vault_detail');
    if (!nav.allow) return;
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

  const onLock = async () => {
    clearProtectedUi();
    const result = await controller.lock('explicit');
    setCleanupNote(result.diagnostic ?? '');
    await wipeClipboard();
  };

  return (
    <View style={styles.root} testID={testID}>
      <View style={styles.headerActions}>
        <MobileButton themeMode={themeMode} variant="secondary" onPress={onClose} testID={`${testID}-close`}>
          Close harness
        </MobileButton>
        <MobileButton
          themeMode={themeMode}
          variant="subtle"
          testID={`${testID}-invalidate-bio`}
          onPress={() => {
            synthetic.controls.invalidateBiometric();
            void controller.refreshCapabilities();
          }}
        >
          Simulate biometric invalidation
        </MobileButton>
        <MobileButton
          themeMode={themeMode}
          variant="subtle"
          testID={`${testID}-revoke`}
          onPress={() => {
            synthetic.controls.revokeDevice();
            void controller.checkRevocationIfConnected(true);
          }}
        >
          Simulate device revocation
        </MobileButton>
      </View>

      <MobileVaultShellView
        themeMode={themeMode}
        session={session}
        syntheticHarness
        items={items}
        trashItems={trashItems}
        selectedId={selectedId}
        selectedDetail={selectedDetail}
        transferPhase={transferPhase}
        showingTrash={showingTrash}
        screenProtectionNote={[protectionNote, clipboardNote, cleanupNote].filter(Boolean).join(' ')}
        onOpenUnlock={() => setUnlockOpen(true)}
        onLock={() => void onLock()}
        onSelectItem={(id) => void onSelectItem(id)}
        onClearSelection={() => {
          setSelectedId(null);
          setSelectedDetail(null);
        }}
        onShowTrash={() => setShowingTrash((v) => !v)}
        onTransferPhaseChange={setTransferPhase}
      />

      <MobileVaultUnlockSheet
        visible={unlockOpen}
        onClose={() => setUnlockOpen(false)}
        themeMode={themeMode}
        session={session}
        syntheticHarness
        onCancelUnlock={() => {
          void controller.cancelUnlock();
          setUnlockOpen(false);
        }}
        onLock={() => void onLock()}
        onUnlockPassphrase={async (passphrase) => {
          const res = await controller.unlockWithPassphrase(passphrase);
          if (res.ok) setUnlockOpen(false);
          return res.ok ? { ok: true } : { ok: false, message: res.message };
        }}
        onUnlockRecovery={async (secret) => {
          const res = await controller.unlockWithRecoverySecret(secret);
          if (res.ok) setUnlockOpen(false);
          return res.ok ? { ok: true } : { ok: false, message: res.message };
        }}
        onUnlockBiometric={async () => {
          const res = await controller.unlockWithBiometric();
          if (res.ok) setUnlockOpen(false);
          return res.ok ? { ok: true } : { ok: false, message: res.message };
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  headerActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 12 },
});
