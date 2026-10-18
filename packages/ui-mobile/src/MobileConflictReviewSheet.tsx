import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing, type ThemeMode } from '@daynori/design-tokens';
import { MobileButton } from './MobileButton.js';
import { MobileFeedback } from './MobileFeedback.js';
import { MobileModalSheet } from './MobileModalSheet.js';
import { MobileTypeBadge } from './MobileTypeBadge.js';

export interface MobileConflictReviewSheetProps {
  visible: boolean;
  onClose: () => void;
  conflict: {
    id: string;
    entityId: string;
    entityType: string;
    conflictReason: string;
    baseRevision: number;
    serverRevision: number;
    detectedAt: string;
    localPayload: Record<string, unknown>;
    serverState?: Record<string, unknown>;
    baseState?: Record<string, unknown>;
  } | null;
  onResolve: (
    resolution: 'keep_server' | 'keep_local' | 'save_copy',
    customPayload?: Record<string, unknown>
  ) => Promise<void> | void;
  themeMode?: ThemeMode;
  testID?: string;
}

export const MobileConflictReviewSheet: React.FC<MobileConflictReviewSheetProps> = ({
  visible,
  onClose,
  conflict,
  onResolve,
  themeMode = 'light',
  testID,
}) => {
  const palette = colors[themeMode];
  const [activeTab, setActiveTab] = useState<'local' | 'server' | 'base'>('local');
  const [isResolving, setIsResolving] = useState(false);

  if (!conflict) return null;

  const isEditVsDelete =
    Boolean(conflict.serverState?.['deletedAt']) ||
    Boolean(conflict.serverState?.['isTombstone']) ||
    conflict.conflictReason.toLowerCase().includes('deleted');

  const localTitle =
    (conflict.localPayload['title'] as string | undefined) ??
    (conflict.localPayload['name'] as string | undefined) ??
    'Untitled (Local)';

  const serverTitle =
    (conflict.serverState?.['title'] as string | undefined) ??
    (conflict.serverState?.['name'] as string | undefined) ??
    (isEditVsDelete ? '[Deleted on server]' : 'Untitled (Server)');

  const baseTitle =
    (conflict.baseState?.['title'] as string | undefined) ??
    (conflict.baseState?.['name'] as string | undefined) ??
    'Untitled (Base)';

  const localBody =
    (conflict.localPayload['plainText'] as string | undefined) ??
    (conflict.localPayload['details'] as string | undefined) ??
    '';

  const serverBody =
    (conflict.serverState?.['plainText'] as string | undefined) ??
    (conflict.serverState?.['details'] as string | undefined) ??
    (isEditVsDelete ? '[Entity deleted on server]' : '');

  const baseBody =
    (conflict.baseState?.['plainText'] as string | undefined) ??
    (conflict.baseState?.['details'] as string | undefined) ??
    '';

  const handleAction = async (resolution: 'keep_server' | 'keep_local' | 'save_copy') => {
    setIsResolving(true);
    try {
      await onResolve(resolution);
      onClose();
    } finally {
      setIsResolving(false);
    }
  };

  return (
    <MobileModalSheet
      visible={visible}
      onClose={onClose}
      title="Sync Conflict Review"
      themeMode={themeMode}
      testID={testID}
    >
      <View style={styles.container}>
        {isEditVsDelete ? (
          <MobileFeedback
            severity="warning"
            title="Edit vs Delete Conflict"
            message="Item was deleted on the server, but edited offline on this device. Choose whether to restore, keep both, or accept deletion."
            themeMode={themeMode}
          />
        ) : (
          <MobileFeedback
            severity="warning"
            title="Concurrent Edit Detected"
            message={`${conflict.conflictReason}. Local edits are preserved until you choose how to resolve.`}
            themeMode={themeMode}
          />
        )}

        {/* Entity Metadata Row */}
        <View style={styles.metaRow}>
          <Text style={[styles.metaLabel, { color: palette.text.muted }]}>Entity:</Text>
          <MobileTypeBadge kind={conflict.entityType} themeMode={themeMode} />
          <Text style={[styles.metaRevs, { color: palette.text.secondary }]}>
            Base Rev {conflict.baseRevision} → Server Rev {conflict.serverRevision}
          </Text>
        </View>

        {/* Tab Segment Controls */}
        <View style={[styles.tabBar, { borderBottomColor: palette.border.subtle }]}>
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === 'local' }}
            onPress={() => setActiveTab('local')}
            style={[
              styles.tabButton,
              activeTab === 'local' && { backgroundColor: palette.action.subtle },
            ]}
          >
            <Text
              style={[
                styles.tabText,
                { color: activeTab === 'local' ? palette.text.primary : palette.text.secondary },
                activeTab === 'local' && styles.activeTabText,
              ]}
            >
              Local Edits
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === 'server' }}
            onPress={() => setActiveTab('server')}
            style={[
              styles.tabButton,
              activeTab === 'server' && { backgroundColor: palette.action.subtle },
            ]}
          >
            <Text
              style={[
                styles.tabText,
                { color: activeTab === 'server' ? palette.text.primary : palette.text.secondary },
                activeTab === 'server' && styles.activeTabText,
              ]}
            >
              Server Version
            </Text>
          </Pressable>

          {conflict.baseState && (
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: activeTab === 'base' }}
              onPress={() => setActiveTab('base')}
              style={[
                styles.tabButton,
                activeTab === 'base' && { backgroundColor: palette.action.subtle },
              ]}
            >
              <Text
                style={[
                  styles.tabText,
                  { color: activeTab === 'base' ? palette.text.primary : palette.text.secondary },
                  activeTab === 'base' && styles.activeTabText,
                ]}
              >
                Base Original
              </Text>
            </Pressable>
          )}
        </View>

        {/* Version Display Card */}
        <View
          style={[
            styles.card,
            {
              backgroundColor:
                activeTab === 'server' && isEditVsDelete
                  ? palette.status.dangerBg
                  : palette.surfaceRaised,
              borderColor:
                activeTab === 'server' && isEditVsDelete
                  ? palette.status.dangerBorder
                  : palette.border.subtle,
            },
          ]}
        >
          <Text style={[styles.cardTitle, { color: palette.text.primary }]}>
            {activeTab === 'local'
              ? localTitle
              : activeTab === 'server'
                ? serverTitle
                : baseTitle}
          </Text>

          <ScrollView style={styles.cardScroll} nestedScrollEnabled={true}>
            <Text
              style={[
                styles.cardBody,
                {
                  color:
                    activeTab === 'server' && isEditVsDelete
                      ? palette.status.danger
                      : palette.text.secondary,
                },
              ]}
            >
              {activeTab === 'local'
                ? localBody || '[No text content]'
                : activeTab === 'server'
                  ? serverBody || (isEditVsDelete ? '[Deleted on server]' : '[No text content]')
                  : baseBody || '[No text content]'}
            </Text>
          </ScrollView>
        </View>

        {/* Resolution Actions */}
        <View style={styles.actionsContainer}>
          <MobileButton
            variant="primary"
            themeMode={themeMode}
            disabled={isResolving}
            onPress={() => void handleAction('save_copy')}
            accessibilityLabel="Keep both as separate copies"
          >
            Keep Both (Save Copy)
          </MobileButton>

          <MobileButton
            variant="secondary"
            themeMode={themeMode}
            disabled={isResolving}
            onPress={() => void handleAction('keep_local')}
            accessibilityLabel={isEditVsDelete ? 'Restore and apply local edits' : 'Keep local edits'}
          >
            {isEditVsDelete ? 'Restore & Apply Local Edits' : 'Keep Local Edits'}
          </MobileButton>

          <MobileButton
            variant="secondary"
            themeMode={themeMode}
            disabled={isResolving}
            onPress={() => void handleAction('keep_server')}
            accessibilityLabel={isEditVsDelete ? 'Accept server deletion' : 'Keep server version'}
          >
            {isEditVsDelete ? 'Accept Deletion' : 'Keep Server Version'}
          </MobileButton>

          <MobileButton
            variant="subtle"
            themeMode={themeMode}
            disabled={isResolving}
            onPress={onClose}
            accessibilityLabel="Dismiss conflict review without resolving"
          >
            Cancel Review
          </MobileButton>
        </View>
      </View>
    </MobileModalSheet>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  metaLabel: {
    fontSize: 12,
  },
  metaRevs: {
    fontSize: 12,
    marginLeft: 4,
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    gap: spacing.xs,
    paddingBottom: 4,
  },
  tabButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radii.sm,
  },
  tabText: {
    fontSize: 13,
  },
  activeTabText: {
    fontWeight: '700',
  },
  card: {
    padding: spacing.md,
    borderRadius: radii.sm,
    borderWidth: 1,
    gap: spacing.xs,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  cardScroll: {
    maxHeight: 180,
    marginTop: 4,
  },
  cardBody: {
    fontSize: 13,
    lineHeight: 18,
  },
  actionsContainer: {
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
});
