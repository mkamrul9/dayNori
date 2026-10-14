import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing, touchTargets, type ThemeMode } from '@daynori/design-tokens';
import { MobileButton, MobileCard, MobileListRow } from '@daynori/ui-mobile';
import type { LibraryFilter } from '../navigation/types';

export interface LibraryViewProps {
  themeMode: ThemeMode;
  initialFilter?: LibraryFilter;
  onFilterChange?: (filter: LibraryFilter) => void;
  onOpenCreate?: () => void;
  testID?: string;
}

export const LibraryView: React.FC<LibraryViewProps> = ({
  themeMode,
  initialFilter = 'all',
  onFilterChange,
  onOpenCreate,
  testID = 'library-view',
}) => {
  const palette = colors[themeMode];
  const [activeFilter, setActiveFilter] = useState<LibraryFilter>(initialFilter);
  const [currentFolder, setCurrentFolder] = useState<string>('Software');

  const setFilter = (f: LibraryFilter) => {
    setActiveFilter(f);
    if (onFilterChange) onFilterChange(f);
  };

  // Synthetic items matching documented IA examples
  const items = [
    {
      id: 'i1',
      title: 'TypeScript Reference',
      type: 'knowledge',
      folder: 'Software',
      metadata: 'Knowledge Note • Updated yesterday',
    },
    {
      id: 'i2',
      title: 'TypeScript handbook.pdf',
      type: 'files',
      folder: 'Software',
      metadata: 'PDF Document (2.4 MB) • Sep 28',
    },
    {
      id: 'i3',
      title: 'Read generics chapter',
      type: 'notes',
      folder: 'Software',
      metadata: 'Task Note • Due Friday',
    },
    {
      id: 'i4',
      title: 'System architecture diagram.png',
      type: 'files',
      folder: 'Software',
      metadata: 'Image (1.1 MB) • Oct 2',
    },
    {
      id: 'i5',
      title: 'State management ADR',
      type: 'notes',
      folder: 'Software',
      metadata: 'Markdown Note • Draft',
    },
  ];

  const filteredItems =
    activeFilter === 'all' ? items : items.filter((i) => i.type === activeFilter);

  return (
    <ScrollView
      testID={testID}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
    >
      {/* Folder Breadcrumb */}
      <View
        accessibilityRole="summary"
        accessibilityLabel={`Current location: Workspace, ${currentFolder}`}
        style={[
          styles.breadcrumbContainer,
          {
            backgroundColor: palette.surface,
            borderColor: palette.border.subtle,
          },
        ]}
      >
        <Text style={[styles.breadcrumbText, { color: palette.text.secondary }]}>
          Workspace &rsaquo;{' '}
          <Text style={{ color: palette.text.primary, fontWeight: '700' }}>{currentFolder}</Text>
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Switch folder"
          onPress={() => setCurrentFolder(currentFolder === 'Software' ? 'Inbox' : 'Software')}
          style={styles.switchFolderBtn}
        >
          <Text style={[styles.switchFolderText, { color: palette.action.primary }]}>
            Change &dtrif;
          </Text>
        </Pressable>
      </View>

      {/* Module filter chips: All, Notes, Knowledge, Files */}
      <View
        accessibilityRole="tablist"
        accessibilityLabel="Library module filters"
        style={styles.filterBar}
      >
        {(
          [
            { key: 'all', label: 'All Items' },
            { key: 'notes', label: 'Notes' },
            { key: 'knowledge', label: 'Knowledge' },
            { key: 'files', label: 'Files' },
          ] as const
        ).map((filter) => {
          const isSelected = activeFilter === filter.key;
          return (
            <Pressable
              key={filter.key}
              testID={`library-filter-${filter.key}`}
              accessibilityRole="tab"
              accessibilityLabel={`Filter ${filter.label}`}
              accessibilityState={{ selected: isSelected }}
              onPress={() => setFilter(filter.key)}
              style={[
                styles.filterPill,
                {
                  backgroundColor: isSelected ? palette.action.subtle : palette.surface,
                  borderColor: isSelected ? palette.action.primary : palette.border.subtle,
                },
              ]}
            >
              <Text
                style={[
                  styles.filterPillText,
                  {
                    color: isSelected ? palette.action.primary : palette.text.secondary,
                    fontWeight: isSelected ? '700' : '500',
                  },
                ]}
              >
                {filter.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Item List */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: palette.text.primary }]}>
          Items in {currentFolder} ({filteredItems.length})
        </Text>
        <MobileCard themeMode={themeMode}>
          {filteredItems.map((item) => (
            <MobileListRow
              key={item.id}
              title={item.title}
              metadata={item.metadata}
              themeMode={themeMode}
              onPress={() => {}}
              accessibilityLabel={`${item.title}, ${item.metadata}`}
            />
          ))}
        </MobileCard>
      </View>

      {/* Folder Actions Bar */}
      <View style={styles.folderActionsContainer}>
        <MobileButton
          variant="secondary"
          themeMode={themeMode}
          onPress={onOpenCreate}
          accessibilityLabel="Create item or folder"
        >
          ➕ Add to Folder
        </MobileButton>
      </View>

      <View style={styles.libraryNote}>
        <Text style={[styles.libraryNoteText, { color: palette.text.muted }]}>
          One workspace folder hierarchy is the canonical source of truth. Opening a folder in All
          shows mixed records with type labels; module filters reveal matching records without
          moving content.
        </Text>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  scrollContent: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  breadcrumbContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.sm,
    borderWidth: 1,
    marginBottom: spacing.md,
  },
  breadcrumbText: {
    fontSize: 14,
  },
  switchFolderBtn: {
    minHeight: 36,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  switchFolderText: {
    fontSize: 12,
    fontWeight: '700',
  },
  filterBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  filterPill: {
    minHeight: touchTargets.mobileMin, // 48dp minimum
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterPillText: {
    fontSize: 13,
  },
  section: {
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  folderActionsContainer: {
    marginVertical: spacing.sm,
  },
  libraryNote: {
    marginTop: spacing.md,
    padding: spacing.sm,
  },
  libraryNoteText: {
    fontSize: 12,
    lineHeight: 17,
  },
});
