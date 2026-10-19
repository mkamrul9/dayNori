/**
 * Phase 46 synthetic vault harness host — not a production vault entry point.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
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

  useEffect(() => {
    const unsub = controller.subscribe(setSession);
    void controller.refreshCapabilities();
    return () => {
      unsub();
      void controller.lock('unmount');
      void disableVaultScreenProtection();
    };
  }, [controller]);

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
        void clearClipboardIfControllable();
        setSelectedDetail(null);
        setSelectedId(null);
        setUnlockOpen(false);
      } else {
        void controller.onResume();
        void controller.checkRevocationIfConnected(isOnline);
      }
    });
    return () => sub.remove();
  }, [controller, isOnline]);

  const reloadLists = useCallback(async () => {
    if (session.state !== 'unlocked') {
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
    const mapped: VaultListItemVm[] = [];
    for (const row of [...active, ...folder]) {
      let label = row.titleCiphertextLabel;
      if (keyHandleId) {
        const revealed = await controller.getRepository().revealPlaintext(row.id, keyHandleId);
        if (revealed.ok) label = revealed.title;
      }
      mapped.push({ id: row.id, displayLabel: label, folderId: row.folderId });
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
    setSelectedId(id);
    const keyHandleId = controller.getKeyHandleId();
    if (!keyHandleId) {
      setSelectedDetail(null);
      return;
    }
    const revealed = await controller.getRepository().revealPlaintext(id, keyHandleId);
    setSelectedDetail(revealed.ok ? { title: revealed.title, body: revealed.body } : null);
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
        screenProtectionNote={protectionNote}
        onOpenUnlock={() => setUnlockOpen(true)}
        onLock={() => {
          void controller.lock('explicit');
          setSelectedDetail(null);
          setSelectedId(null);
          void clearClipboardIfControllable();
        }}
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
        onCancelUnlock={() => void controller.cancelUnlock()}
        onLock={() => void controller.lock('explicit')}
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
