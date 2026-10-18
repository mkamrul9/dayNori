import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, AccessibilityInfo } from 'react-native';
import {
  type NoteDocument,
  type QuickReferenceSection,
  type QuickReferenceEntry,
  type ResolvedItemLink,
  extractQuickReferenceSections,
  formatUnavailableLinkNotice,
} from '@daynori/domain';
import { colors, radii, spacing, type ThemeMode } from '@daynori/design-tokens';

export interface MobileQuickReferenceViewProps {
  themeMode?: ThemeMode;
  noteId: string;
  title: string;
  document: NoteDocument;
  folderName?: string | null;
  isPinned?: boolean;
  tags?: string[];
  links?: ResolvedItemLink[];
  onNavigateToItem?: (itemId: string) => void;
  onEditNote?: () => void;
  onCopyText?: (text: string) => Promise<void> | void;
  testID?: string;
}

export const MobileQuickReferenceView: React.FC<MobileQuickReferenceViewProps> = ({
  themeMode = 'light',
  noteId: _noteId,
  title,
  document,
  folderName,
  isPinned = false,
  tags = [],
  links = [],
  onNavigateToItem,
  onEditNote,
  onCopyText,
  testID = 'mobile-quick-reference-view',
}) => {
  const palette = colors[themeMode];
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const sections: QuickReferenceSection[] = extractQuickReferenceSections(document);

  const handleCopy = useCallback(
    async (entry: QuickReferenceEntry) => {
      try {
        if (onCopyText) {
          await onCopyText(entry.copyableText);
        }
        setCopiedId(entry.id);
        AccessibilityInfo.announceForAccessibility(`Copied ${entry.label} to clipboard.`);
        setTimeout(() => {
          setCopiedId((prev) => (prev === entry.id ? null : prev));
        }, 2000);
      } catch {
        AccessibilityInfo.announceForAccessibility('Failed to copy to clipboard.');
      }
    },
    [onCopyText]
  );

  const outgoingLinks = links.filter((l) => l.direction === 'outgoing');
  const incomingLinks = links.filter((l) => l.direction === 'incoming');

  return (
    <ScrollView
      testID={testID}
      contentContainerStyle={[styles.container, { backgroundColor: palette.surface }]}
    >
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: palette.border.subtle }]}>
        <View style={styles.badgeRow}>
          {folderName && (
            <View
              style={[
                styles.badge,
                { backgroundColor: palette.surfaceRaised, borderColor: palette.border.subtle },
              ]}
            >
              <Text style={[styles.badgeText, { color: palette.text.secondary }]}>
                📁 {folderName}
              </Text>
            </View>
          )}
          {isPinned && (
            <View
              style={[
                styles.badge,
                { backgroundColor: palette.action.subtle, borderColor: palette.border.subtle },
              ]}
            >
              <Text
                style={[styles.badgeText, { color: palette.action.primary, fontWeight: '700' }]}
              >
                📌 Pinned
              </Text>
            </View>
          )}
          {tags.map((t) => (
            <View
              key={t}
              style={[
                styles.badge,
                { backgroundColor: palette.surfaceRaised, borderColor: palette.border.subtle },
              ]}
            >
              <Text style={[styles.badgeText, { color: palette.text.secondary }]}>#{t}</Text>
            </View>
          ))}
        </View>

        <View style={styles.titleRow}>
          <Text
            testID="mobile-qr-title"
            style={[styles.title, { color: palette.text.primary }]}
            accessibilityRole="header"
          >
            {title || 'Untitled Reference'}
          </Text>

          {onEditNote && (
            <Pressable
              onPress={onEditNote}
              testID="mobile-qr-edit-button"
              accessibilityRole="button"
              accessibilityLabel="Edit note"
              style={[
                styles.editButton,
                { backgroundColor: palette.surfaceRaised, borderColor: palette.border.strong },
              ]}
            >
              <Text style={[styles.editButtonText, { color: palette.text.primary }]}>✏️ Edit</Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* Sections */}
      {sections.length === 0 ? (
        <View style={styles.emptyContainer} testID="mobile-qr-empty-state">
          <Text style={[styles.emptyText, { color: palette.text.secondary }]}>
            No quick reference items found. Add headings, lists, or syntax items to format this
            note.
          </Text>
        </View>
      ) : (
        sections.map((sec) => (
          <View key={sec.id} style={styles.section} testID={`mobile-qr-sec-${sec.id}`}>
            <Text
              style={[
                styles.sectionTitle,
                { color: palette.action.primary, borderBottomColor: palette.border.subtle },
              ]}
              accessibilityRole="header"
            >
              {sec.title}
            </Text>

            {/* Entries */}
            {sec.entries.map((entry) => {
              const isCopied = copiedId === entry.id;
              return (
                <View
                  key={entry.id}
                  testID={`mobile-qr-entry-${entry.id}`}
                  style={[
                    styles.entryCard,
                    {
                      backgroundColor: palette.surfaceRaised,
                      borderColor: palette.border.subtle,
                    },
                  ]}
                >
                  <View style={styles.entryInfo}>
                    <Text style={[styles.entryLabel, { color: palette.text.primary }]}>
                      {entry.label}
                    </Text>
                    <Text style={[styles.entryCode, { color: palette.action.primary }]} selectable>
                      {entry.codeOrValue}
                    </Text>
                    {entry.description && (
                      <Text style={[styles.entryDesc, { color: palette.text.secondary }]}>
                        {entry.description}
                      </Text>
                    )}
                  </View>

                  <Pressable
                    onPress={() => void handleCopy(entry)}
                    testID={`mobile-qr-copy-${entry.id}`}
                    accessibilityRole="button"
                    accessibilityLabel={`Copy ${entry.label}`}
                    style={[
                      styles.copyButton,
                      {
                        backgroundColor: isCopied ? palette.action.primary : palette.surface,
                        borderColor: isCopied ? palette.action.primary : palette.border.strong,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.copyButtonText,
                        { color: isCopied ? palette.text.inverse : palette.text.primary },
                      ]}
                    >
                      {isCopied ? '✓ Copied' : 'Copy'}
                    </Text>
                  </Pressable>
                </View>
              );
            })}

            {/* Checklists */}
            {sec.checklistItems.map((chk) => (
              <View key={chk.id} style={styles.checkItem}>
                <Text style={{ fontSize: 16 }}>{chk.checked ? '☑' : '☐'}</Text>
                <Text
                  style={[
                    styles.checkText,
                    {
                      color: chk.checked ? palette.text.muted : palette.text.primary,
                      textDecorationLine: chk.checked ? 'line-through' : 'none',
                    },
                  ]}
                >
                  {chk.text}
                </Text>
              </View>
            ))}
          </View>
        ))
      )}

      {/* Internal Links & Backlinks */}
      <View style={[styles.linksContainer, { borderTopColor: palette.border.subtle }]}>
        <Text style={[styles.linksSectionHeader, { color: palette.text.secondary }]}>
          Internal Links & Backlinks
        </Text>

        {links.length === 0 ? (
          <Text style={[styles.noLinksText, { color: palette.text.secondary }]}>
            No internal item links recorded.
          </Text>
        ) : (
          <View style={styles.linksGrid}>
            {/* Outgoing */}
            <View style={styles.linkColumn}>
              <Text style={[styles.columnHeader, { color: palette.text.secondary }]}>
                References ({outgoingLinks.length})
              </Text>
              {outgoingLinks.map((link) => (
                <View key={link.id} style={styles.linkRow}>
                  {link.target.isAvailable ? (
                    <Pressable
                      onPress={() => onNavigateToItem?.(link.target.id)}
                      testID={`mobile-qr-link-${link.target.id}`}
                      accessibilityRole="button"
                      style={[
                        styles.linkButton,
                        {
                          backgroundColor: palette.surfaceRaised,
                          borderColor: palette.border.subtle,
                        },
                      ]}
                    >
                      <Text style={[styles.linkTitle, { color: palette.text.primary }]}>
                        🔗 {link.target.title}
                      </Text>
                      <Text style={[styles.linkMeta, { color: palette.text.secondary }]}>
                        ({link.target.kind})
                      </Text>
                    </Pressable>
                  ) : (
                    <View
                      testID={`mobile-qr-unavailable-link-${link.target.id}`}
                      style={[
                        styles.unavailableLinkBox,
                        { backgroundColor: palette.surface, borderColor: palette.border.strong },
                      ]}
                    >
                      <Text style={[styles.unavailableTitle, { color: palette.text.muted }]}>
                        ⚠️ {link.target.title}
                      </Text>
                      <Text style={[styles.unavailableReason, { color: palette.text.secondary }]}>
                        {formatUnavailableLinkNotice(link.target.unavailableReason)}
                      </Text>
                    </View>
                  )}
                </View>
              ))}
            </View>

            {/* Backlinks */}
            <View style={styles.linkColumn}>
              <Text style={[styles.columnHeader, { color: palette.text.secondary }]}>
                Backlinks ({incomingLinks.length})
              </Text>
              {incomingLinks.map((link) => (
                <View key={link.id} style={styles.linkRow}>
                  {link.target.isAvailable ? (
                    <Pressable
                      onPress={() => onNavigateToItem?.(link.target.id)}
                      testID={`mobile-qr-backlink-${link.target.id}`}
                      accessibilityRole="button"
                      style={[
                        styles.linkButton,
                        {
                          backgroundColor: palette.surfaceRaised,
                          borderColor: palette.border.subtle,
                        },
                      ]}
                    >
                      <Text style={[styles.linkTitle, { color: palette.text.primary }]}>
                        ↩️ {link.target.title}
                      </Text>
                      <Text style={[styles.linkMeta, { color: palette.text.secondary }]}>
                        ({link.target.kind})
                      </Text>
                    </Pressable>
                  ) : (
                    <View
                      testID={`mobile-qr-unavailable-backlink-${link.target.id}`}
                      style={[
                        styles.unavailableLinkBox,
                        { backgroundColor: palette.surface, borderColor: palette.border.strong },
                      ]}
                    >
                      <Text style={[styles.unavailableTitle, { color: palette.text.muted }]}>
                        ⚠️ {link.target.title}
                      </Text>
                      <Text style={[styles.unavailableReason, { color: palette.text.secondary }]}>
                        {formatUnavailableLinkNotice(link.target.unavailableReason)}
                      </Text>
                    </View>
                  )}
                </View>
              ))}
            </View>
          </View>
        )}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: spacing.md,
    gap: spacing.md,
  },
  header: {
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    gap: spacing.xs,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radii.sm,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 12,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    flex: 1,
  },
  editButton: {
    minHeight: 48,
    minWidth: 48,
    paddingHorizontal: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: radii.sm,
    borderWidth: 1,
  },
  editButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  emptyContainer: {
    padding: spacing.lg,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 13,
    textAlign: 'center',
  },
  section: {
    gap: spacing.xs,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    borderBottomWidth: 1,
    paddingBottom: 4,
  },
  entryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.sm,
    borderRadius: radii.sm,
    borderWidth: 1,
    gap: spacing.sm,
  },
  entryInfo: {
    flex: 1,
    gap: 2,
  },
  entryLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  entryCode: {
    fontFamily: 'monospace',
    fontSize: 13,
  },
  entryDesc: {
    fontSize: 11,
  },
  copyButton: {
    minHeight: 48,
    minWidth: 64,
    paddingHorizontal: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: radii.sm,
    borderWidth: 1,
  },
  copyButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  checkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  checkText: {
    fontSize: 13,
  },
  linksContainer: {
    borderTopWidth: 1,
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  linksSectionHeader: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  noLinksText: {
    fontSize: 13,
  },
  linksGrid: {
    gap: spacing.sm,
  },
  linkColumn: {
    gap: 4,
  },
  columnHeader: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  linkRow: {
    marginBottom: 4,
  },
  linkButton: {
    minHeight: 48,
    paddingHorizontal: spacing.sm,
    justifyContent: 'center',
    borderRadius: radii.sm,
    borderWidth: 1,
  },
  linkTitle: {
    fontSize: 13,
    fontWeight: '600',
  },
  linkMeta: {
    fontSize: 11,
  },
  unavailableLinkBox: {
    padding: spacing.xs,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  unavailableTitle: {
    fontSize: 12,
    textDecorationLine: 'line-through',
  },
  unavailableReason: {
    fontSize: 11,
  },
});
