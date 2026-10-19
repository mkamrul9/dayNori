import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing, touchTargets, type ThemeMode } from '@daynori/design-tokens';
import {
  describeTransferUiStatus,
  type TransferUiPhase,
  type VaultSessionSnapshot,
} from '@daynori/domain';
import { MobileButton } from './MobileButton.js';
import { MobileFeedback } from './MobileFeedback.js';
import { MobileEmptyState } from './MobileEmptyState.js';

export interface VaultListItemVm {
  id: string;
  displayLabel: string;
  folderId: string | null;
  trashed?: boolean;
}

export interface MobileVaultShellViewProps {
  themeMode?: ThemeMode;
  session: VaultSessionSnapshot;
  syntheticHarness?: boolean;
  items: VaultListItemVm[];
  trashItems?: VaultListItemVm[];
  selectedId: string | null;
  selectedDetail: { title: string; body: string } | null;
  transferPhase: TransferUiPhase;
  testID?: string;
  onOpenUnlock: () => void;
  onLock: () => void;
  onSelectItem: (id: string) => void;
  onClearSelection: () => void;
  onShowTrash: () => void;
  showingTrash: boolean;
  onTransferPhaseChange: (phase: TransferUiPhase) => void;
  screenProtectionNote?: string;
}

export const MobileVaultShellView: React.FC<MobileVaultShellViewProps> = ({
  themeMode = 'light',
  session,
  syntheticHarness = false,
  items,
  trashItems = [],
  selectedId,
  selectedDetail,
  transferPhase,
  testID = 'mobile-vault-shell',
  onOpenUnlock,
  onLock,
  onSelectItem,
  onClearSelection,
  onShowTrash,
  showingTrash,
  onTransferPhaseChange,
  screenProtectionNote,
}) => {
  const palette = colors[themeMode];
  const unlocked = session.state === 'unlocked';
  const transfer = describeTransferUiStatus(transferPhase);
  const [composeOpen, setComposeOpen] = useState(false);
  const list = showingTrash ? trashItems : items;

  return (
    <ScrollView
      testID={testID}
      contentContainerStyle={styles.container}
      accessibilityLabel={
        unlocked ? 'Vault contents' : 'Vault locked. Unlock required to view protected content.'
      }
    >
      {syntheticHarness ? (
        <MobileFeedback
          severity="info"
          title="Synthetic vault harness"
          message="Interfaces exercise unlock lifecycle with fixture ciphertext. Phase 45 integration acceptance pending."
          themeMode={themeMode}
        />
      ) : null}

      {!unlocked ? (
        <View style={styles.lockedCard} accessibilityRole="summary">
          <Text style={[styles.heading, { color: palette.text.primary }]}>Vault locked</Text>
          <Text style={{ color: palette.text.secondary, lineHeight: 22 }}>
            No sensitive titles, previews, or bodies are shown while locked. Deep links into vault
            content are blocked until unlock succeeds.
          </Text>
          <MobileButton
            testID={`${testID}-open-unlock`}
            themeMode={themeMode}
            onPress={onOpenUnlock}
            accessibilityLabel="Open vault unlock sheet"
          >
            Unlock vault
          </MobileButton>
        </View>
      ) : (
        <View style={styles.toolbar}>
          <MobileButton
            testID={`${testID}-lock`}
            variant="secondary"
            themeMode={themeMode}
            onPress={onLock}
            accessibilityLabel="Lock vault"
          >
            Lock
          </MobileButton>
          <MobileButton
            testID={`${testID}-toggle-trash`}
            variant="secondary"
            themeMode={themeMode}
            onPress={onShowTrash}
            accessibilityLabel={showingTrash ? 'Show active vault items' : 'Show vault trash'}
          >
            {showingTrash ? 'Active items' : 'Trash'}
          </MobileButton>
          <MobileButton
            testID={`${testID}-compose`}
            variant="secondary"
            themeMode={themeMode}
            onPress={() => setComposeOpen((v) => !v)}
            accessibilityLabel="Toggle create vault item panel"
          >
            Create
          </MobileButton>
        </View>
      )}

      {screenProtectionNote ? (
        <Text style={[styles.meta, { color: palette.text.secondary }]}>{screenProtectionNote}</Text>
      ) : null}

      {unlocked && composeOpen ? (
        <MobileFeedback
          severity="info"
          title="Create / edit (harness)"
          message="Create/edit writes would persist ciphertext via Phase 45 repositories when integrated. Harness shows the protected surface only."
          themeMode={themeMode}
        />
      ) : null}

      {unlocked && selectedDetail && selectedId ? (
        <View
          style={[styles.detail, { borderColor: palette.border.subtle, backgroundColor: palette.surface }]}
          accessibilityLabel={`Vault item detail. ${selectedDetail.title}`}
        >
          <Text style={[styles.heading, { color: palette.text.primary }]}>{selectedDetail.title}</Text>
          <Text style={{ color: palette.text.primary, lineHeight: 22 }}>{selectedDetail.body}</Text>
          <MobileButton
            testID={`${testID}-clear-detail`}
            variant="secondary"
            themeMode={themeMode}
            onPress={onClearSelection}
            accessibilityLabel="Close vault item detail"
          >
            Close detail
          </MobileButton>
        </View>
      ) : null}

      {unlocked ? (
        <View style={styles.listSection}>
          <Text style={[styles.heading, { color: palette.text.primary }]}>
            {showingTrash ? 'Trash' : 'Vault items'}
          </Text>
          {list.length === 0 ? (
            <MobileEmptyState
              title={showingTrash ? 'Trash empty' : 'No vault items'}
              description="Synthetic fixtures appear here after unlock."
              themeMode={themeMode}
            />
          ) : (
            list.map((item) => (
              <Pressable
                key={item.id}
                testID={`${testID}-item-${item.id}`}
                onPress={() => onSelectItem(item.id)}
                accessibilityRole="button"
                accessibilityLabel={item.displayLabel}
                style={[
                  styles.row,
                  {
                    borderColor: palette.border.subtle,
                    backgroundColor:
                      selectedId === item.id ? palette.surfaceRaised : palette.surface,
                    minHeight: touchTargets.mobileMin,
                  },
                ]}
              >
                <Text style={{ color: palette.text.primary }}>{item.displayLabel}</Text>
              </Pressable>
            ))
          )}
        </View>
      ) : null}

      <View
        style={[styles.transfer, { borderColor: palette.border.subtle, backgroundColor: palette.surface }]}
        accessibilityLabel={`Transfer to vault status. ${transfer.message}`}
      >
        <Text style={[styles.heading, { color: palette.text.primary }]}>Transfer to vault</Text>
        <Text style={{ color: palette.text.secondary, lineHeight: 20 }}>{transfer.message}</Text>
        <View style={styles.transferActions}>
          {(
            [
              'preview',
              'pending_verification',
              'pending_cleanup',
              'retained_ordinary_copy',
              'failed',
              'complete',
            ] as TransferUiPhase[]
          ).map((phase) => (
            <Pressable
              key={phase}
              testID={`${testID}-transfer-${phase}`}
              onPress={() => onTransferPhaseChange(phase)}
              accessibilityRole="button"
              accessibilityLabel={`Set transfer status ${phase}`}
              style={[
                styles.chip,
                {
                  borderColor: palette.border.subtle,
                  backgroundColor:
                    transferPhase === phase ? palette.surfaceRaised : palette.surface,
                },
              ]}
            >
              <Text style={{ color: palette.text.primary, fontSize: 12 }}>{phase}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
  lockedCard: { gap: spacing.md },
  heading: { fontSize: 18, fontWeight: '700' },
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  listSection: { gap: spacing.sm },
  row: {
    borderWidth: 1,
    borderRadius: radii.card,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    justifyContent: 'center',
  },
  detail: { borderWidth: 1, borderRadius: radii.card, padding: spacing.md, gap: spacing.sm },
  transfer: { borderWidth: 1, borderRadius: radii.card, padding: spacing.md, gap: spacing.sm },
  transferActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: { borderWidth: 1, borderRadius: radii.sm, paddingHorizontal: spacing.sm, paddingVertical: 6 },
  meta: { fontSize: 12, lineHeight: 18 },
});
