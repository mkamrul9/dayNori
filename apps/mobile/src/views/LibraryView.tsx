import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing, touchTargets, type ThemeMode } from '@daynori/design-tokens';
import {
  MobileBreadcrumb,
  MobileButton,
  MobileCard,
  MobileEmptyState,
  MobileFeedback,
  MobileModalSheet,
  MobileTextField,
  MobileTypeBadge,
  type MobileBreadcrumbSegment,
} from '@daynori/ui-mobile';
import {
  calculateFolderDepth,
  compareRanks,
  generateBetweenRanks,
  generateInitialRank,
  isInboxItem,
  MAX_FOLDER_DEPTH,
} from '@daynori/domain';
import type { LibraryFilter } from '../navigation/types';

export interface LibraryViewProps {
  themeMode: ThemeMode;
  initialFilter?: LibraryFilter;
  onFilterChange?: (filter: LibraryFilter) => void;
  onOpenCreate?: () => void;
  testID?: string;
}

export interface MobileFolderItem {
  id: string;
  name: string;
  parentId: string | null;
  icon?: string;
  color?: string;
  rank: string;
  revision: number;
  archivedAt?: string | null;
  trashedAt?: string | null;
}

export interface MobileLibraryRecord {
  id: string;
  title: string;
  kind: 'note' | 'file' | 'knowledge' | 'task' | 'routine' | 'journal';
  folderId: string | null;
  rank: string;
  revision: number;
  metadata?: string;
  archivedAt?: string | null;
  trashedAt?: string | null;
}

const SAMPLE_MOBILE_FOLDERS: MobileFolderItem[] = [
  {
    id: 'f-software',
    name: 'Software',
    parentId: null,
    icon: '💻',
    rank: '00001000',
    revision: 1,
  },
  {
    id: 'f-guides',
    name: 'Guides',
    parentId: 'f-software',
    icon: '📚',
    rank: '00001000',
    revision: 1,
  },
  {
    id: 'f-projects',
    name: 'Projects',
    parentId: 'f-software',
    icon: '🚀',
    rank: '00002000',
    revision: 1,
  },
  {
    id: 'f-gov-jobs',
    name: 'Government jobs',
    parentId: null,
    icon: '🏛️',
    rank: '00002000',
    revision: 1,
  },
  {
    id: 'f-applications',
    name: 'Applications',
    parentId: 'f-gov-jobs',
    icon: '📋',
    rank: '00001000',
    revision: 1,
  },
  {
    id: 'f-personal',
    name: 'Personal',
    parentId: null,
    icon: '🌱',
    rank: '00003000',
    revision: 1,
  },
  {
    id: 'f-learning',
    name: 'Learning',
    parentId: null,
    icon: '🎓',
    rank: '00004000',
    revision: 1,
  },
];

const SAMPLE_MOBILE_ITEMS: MobileLibraryRecord[] = [
  {
    id: 'i-ts-ref',
    title: 'TypeScript reference handbook',
    kind: 'knowledge',
    folderId: 'f-guides',
    rank: '00001000',
    revision: 1,
    metadata: 'Knowledge Note • Updated yesterday',
  },
  {
    id: 'i-ts-pdf',
    title: 'TypeScript handbook deep-dive.pdf',
    kind: 'file',
    folderId: 'f-guides',
    rank: '00002000',
    revision: 1,
    metadata: 'PDF Document (2.4 MB) • Sep 28',
  },
  {
    id: 'i-read-generics',
    title: 'Read generics chapter in handbook',
    kind: 'task',
    folderId: 'f-guides',
    rank: '00003000',
    revision: 1,
    metadata: 'Task Note • Due Friday',
  },
  {
    id: 'i-new-app',
    title: 'New offline sync engine idea',
    kind: 'note',
    folderId: 'f-projects',
    rank: '00001000',
    revision: 1,
    metadata: 'Markdown Note • Draft',
  },
  {
    id: 'i-gov-app-pdf',
    title: 'Government Application Form.pdf',
    kind: 'file',
    folderId: 'f-applications',
    rank: '00001000',
    revision: 1,
    metadata: 'PDF Document (1.1 MB) • Oct 2',
  },
  {
    id: 'i-submit-app',
    title: 'Submit civil service exam application',
    kind: 'task',
    folderId: 'f-applications',
    rank: '00002000',
    revision: 1,
    metadata: 'Task Note • Due next week',
  },
  {
    id: 'i-interview-prep',
    title: 'Technical interview preparation checklist',
    kind: 'note',
    folderId: 'f-applications',
    rank: '00003000',
    revision: 1,
    metadata: 'Markdown Note • 4 sections',
  },
  {
    id: 'i-morning-study',
    title: 'Morning study routine (20m)',
    kind: 'routine',
    folderId: 'f-personal',
    rank: '00001000',
    revision: 1,
    metadata: 'Daily Habit • Active',
  },
  {
    id: 'i-til-a11y',
    title: 'Today I learned: Visible focus outlines',
    kind: 'journal',
    folderId: 'f-personal',
    rank: '00002000',
    revision: 1,
    metadata: 'Journal Entry • Oct 15',
  },
  {
    id: 'i-exam-prep',
    title: 'Syllabus and exam preparation reference',
    kind: 'knowledge',
    folderId: 'f-learning',
    rank: '00001000',
    revision: 1,
    metadata: 'Knowledge Note • 12 pages',
  },
  {
    id: 'i-inbox-item',
    title: 'Quick unorganized thought draft',
    kind: 'note',
    folderId: null,
    rank: '00001000',
    revision: 1,
    metadata: 'Inbox Item • Unfiled',
  },
];

const MOBILE_ITEMS_PER_PAGE = 8;

export const LibraryView: React.FC<LibraryViewProps> = ({
  themeMode,
  initialFilter = 'all',
  onFilterChange,
  onOpenCreate,
  testID = 'library-view',
}) => {
  const palette = colors[themeMode];
  const [activeFilter, setActiveFilter] = useState<LibraryFilter>(initialFilter);
  const [folders, setFolders] = useState<MobileFolderItem[]>(SAMPLE_MOBILE_FOLDERS);
  const [items, setItems] = useState<MobileLibraryRecord[]>(SAMPLE_MOBILE_ITEMS);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null); // null = Root / Workspace
  const [page, setPage] = useState(1);

  // Status & Offline/Sync State
  const [isOffline] = useState(false);
  const [localStatus] = useState('Saved locally');
  const [syncStatus] = useState('Synced');
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  // Modals / Sheets State
  const [isCreateFolderSheetOpen, setCreateFolderSheetOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);

  const [renameTargetFolder, setRenameTargetFolder] = useState<MobileFolderItem | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);

  const [trashTargetFolder, setTrashTargetFolder] = useState<MobileFolderItem | null>(null);

  // Undo Toast State
  const [undoToast, setUndoToast] = useState<{
    id: string;
    message: string;
    onUndo: () => void;
  } | null>(null);

  const setFilter = (f: LibraryFilter) => {
    setActiveFilter(f);
    setPage(1);
    if (onFilterChange) onFilterChange(f);
  };

  // Folder map for hierarchy depth and cycle checks
  const folderMap = useMemo(() => {
    const map = new Map<string, { parentId: string | null }>();
    for (const f of folders) {
      map.set(f.id, { parentId: f.parentId });
    }
    return map;
  }, [folders]);

  const currentFolder = useMemo(() => {
    if (!currentFolderId) return null;
    return folders.find((f) => f.id === currentFolderId) ?? null;
  }, [folders, currentFolderId]);

  // Breadcrumbs segments
  const breadcrumbSegments: MobileBreadcrumbSegment[] = useMemo(() => {
    const segs: MobileBreadcrumbSegment[] = [{ id: null, label: 'Workspace' }];
    if (!currentFolderId) return segs;

    const path: MobileFolderItem[] = [];
    let curr: MobileFolderItem | undefined = folders.find((f) => f.id === currentFolderId);
    const visited = new Set<string>();

    while (curr) {
      if (visited.has(curr.id)) break;
      visited.add(curr.id);
      path.unshift(curr);
      curr = curr.parentId ? folders.find((f) => f.id === curr!.parentId) : undefined;
    }

    for (const node of path) {
      segs.push({
        id: node.id,
        label: `${node.icon ?? '📁'} ${node.name}`,
      });
    }

    return segs;
  }, [folders, currentFolderId]);

  // Subfolders in current level
  const subfolders = useMemo(() => {
    return folders
      .filter((f) => !f.trashedAt && f.parentId === currentFolderId)
      .sort((a, b) => compareRanks(a.rank, a.id, b.rank, b.id));
  }, [folders, currentFolderId]);

  // Items in current level
  const currentItems = useMemo(() => {
    return items
      .filter((item) => {
        if (item.trashedAt) return false;
        const matchesFolder =
          currentFolderId === null ? isInboxItem(item.folderId) : item.folderId === currentFolderId;
        if (!matchesFolder) return false;

        if (activeFilter === 'notes' && item.kind !== 'note') return false;
        if (activeFilter === 'knowledge' && item.kind !== 'knowledge') return false;
        if (activeFilter === 'files' && item.kind !== 'file') return false;

        return true;
      })
      .sort((a, b) => compareRanks(a.rank, a.id, b.rank, b.id));
  }, [items, currentFolderId, activeFilter]);

  // Item counts per folder
  const folderCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const i of items) {
      if (i.trashedAt) continue;
      const fid = i.folderId ?? 'inbox';
      counts[fid] = (counts[fid] ?? 0) + 1;
    }
    return counts;
  }, [items]);

  // Paginated items
  const totalItems = currentItems.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / MOBILE_ITEMS_PER_PAGE));
  const paginatedItems = useMemo(() => {
    const start = (page - 1) * MOBILE_ITEMS_PER_PAGE;
    return currentItems.slice(start, start + MOBILE_ITEMS_PER_PAGE);
  }, [currentItems, page]);

  // Up Navigation
  const handleNavigateUp = () => {
    if (!currentFolder) return;
    setCurrentFolderId(currentFolder.parentId);
    setPage(1);
  };

  // Reorder Subfolders (Up/Down)
  const handleReorder = (folderId: string, direction: 'up' | 'down') => {
    const index = subfolders.findIndex((f) => f.id === folderId);
    if (index === -1) return;

    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= subfolders.length) return;

    const target = subfolders[targetIndex];
    if (!target) return;

    const prevRank =
      direction === 'up'
        ? targetIndex === 0
          ? null
          : (subfolders[targetIndex - 1]?.rank ?? null)
        : target.rank;
    const nextRank =
      direction === 'up'
        ? target.rank
        : targetIndex === subfolders.length - 1
          ? null
          : (subfolders[targetIndex + 1]?.rank ?? null);

    const newRank = generateBetweenRanks(prevRank, nextRank);

    setFolders((prev) =>
      prev.map((f) => (f.id === folderId ? { ...f, rank: newRank, revision: f.revision + 1 } : f))
    );
  };

  // Create Subfolder
  const handleCreateFolder = () => {
    const trimmed = newFolderName.trim();
    if (!trimmed) {
      setCreateError('Please enter a folder name.');
      return;
    }
    if (trimmed.length > 100) {
      setCreateError('Folder name must be 100 characters or fewer.');
      return;
    }

    try {
      const currentDepth = calculateFolderDepth(currentFolderId, folderMap);
      if (currentDepth + 1 > MAX_FOLDER_DEPTH) {
        setCreateError(`Maximum folder nesting depth (${MAX_FOLDER_DEPTH}) reached.`);
        return;
      }
    } catch (e: unknown) {
      setCreateError(e instanceof Error ? e.message : 'Invalid folder hierarchy.');
      return;
    }

    const newFolder: MobileFolderItem = {
      id: `f-${Date.now()}`,
      name: trimmed,
      parentId: currentFolderId,
      icon: '📁',
      rank: generateInitialRank(subfolders.length),
      revision: 1,
    };

    setFolders((prev) => [...prev, newFolder]);
    setNewFolderName('');
    setCreateFolderSheetOpen(false);
    setCreateError(null);
  };

  // Rename Folder
  const handleConfirmRename = () => {
    if (!renameTargetFolder) return;
    const trimmed = renameValue.trim();
    if (!trimmed) {
      setRenameError('Folder name cannot be empty.');
      return;
    }
    const origName = renameTargetFolder.name;
    const targetId = renameTargetFolder.id;

    setFolders((prev) =>
      prev.map((f) => (f.id === targetId ? { ...f, name: trimmed, revision: f.revision + 1 } : f))
    );
    setRenameTargetFolder(null);

    // Provide undo toast
    setUndoToast({
      id: `rename-${targetId}`,
      message: `Renamed to '${trimmed}'`,
      onUndo: () => {
        setFolders((prev) =>
          prev.map((f) =>
            f.id === targetId ? { ...f, name: origName, revision: f.revision + 1 } : f
          )
        );
        setUndoToast(null);
      },
    });
  };

  // Trash Folder
  const handleConfirmTrash = () => {
    if (!trashTargetFolder) return;
    const targetId = trashTargetFolder.id;
    const targetName = trashTargetFolder.name;
    const parentId = trashTargetFolder.parentId;

    const now = new Date().toISOString();

    // Descendants
    const descendants = new Set<string>([targetId]);
    let added = true;
    while (added) {
      added = false;
      for (const f of folders) {
        if (f.parentId && descendants.has(f.parentId) && !descendants.has(f.id)) {
          descendants.add(f.id);
          added = true;
        }
      }
    }

    const affectedItemIds = items
      .filter((i) => i.folderId && descendants.has(i.folderId) && !i.trashedAt)
      .map((i) => i.id);

    setFolders((prev) =>
      prev.map((f) =>
        descendants.has(f.id) ? { ...f, trashedAt: now, revision: f.revision + 1 } : f
      )
    );
    setItems((prev) =>
      prev.map((i) =>
        affectedItemIds.includes(i.id) ? { ...i, trashedAt: now, revision: i.revision + 1 } : i
      )
    );

    setTrashTargetFolder(null);
    if (currentFolderId === targetId) {
      setCurrentFolderId(parentId);
    }

    // Explicit undo
    setUndoToast({
      id: `trash-${targetId}`,
      message: `Trashed '${targetName}'`,
      onUndo: () => {
        setFolders((prev) =>
          prev.map((f) =>
            descendants.has(f.id) ? { ...f, trashedAt: null, revision: f.revision + 1 } : f
          )
        );
        setItems((prev) =>
          prev.map((i) =>
            affectedItemIds.includes(i.id) ? { ...i, trashedAt: null, revision: i.revision + 1 } : i
          )
        );
        setUndoToast(null);
      },
    });
  };

  // Sample Journeys Loader
  const handleLoadSampleJourneys = () => {
    setFolders(SAMPLE_MOBILE_FOLDERS);
    setItems(SAMPLE_MOBILE_ITEMS);
    setCurrentFolderId(null);
    setPage(1);
    setFeedbackMessage('Loaded Software and Government Jobs sample journeys.');
    setTimeout(() => setFeedbackMessage(null), 3000);
  };

  return (
    <ScrollView
      testID={testID}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
    >
      {/* Offline and Sync Status Indicator */}
      <View
        accessibilityRole="summary"
        accessibilityLabel={`Status: ${localStatus}, ${isOffline ? 'Offline' : syncStatus}`}
        style={[
          styles.statusBar,
          { backgroundColor: palette.surfaceRaised, borderColor: palette.border.subtle },
        ]}
      >
        <Text style={[styles.statusText, { color: palette.text.secondary }]}>
          💾 {localStatus} • ☁️ {isOffline ? 'Offline' : syncStatus}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Load sample journeys"
          onPress={handleLoadSampleJourneys}
          style={styles.sampleJourneysBtn}
        >
          <Text style={[styles.sampleJourneysText, { color: palette.action.primary }]}>
            Demo Journeys
          </Text>
        </Pressable>
      </View>

      {/* Temporary Feedback Message */}
      {feedbackMessage && (
        <View style={{ marginBottom: spacing.md }}>
          <MobileFeedback severity="info" message={feedbackMessage} themeMode={themeMode} />
        </View>
      )}

      {/* Folder Breadcrumb with Up button */}
      <MobileBreadcrumb
        segments={breadcrumbSegments}
        themeMode={themeMode}
        onPressBack={currentFolder ? handleNavigateUp : undefined}
        onPressSegment={(seg) => {
          setCurrentFolderId(seg.id);
          setPage(1);
        }}
        style={{ marginBottom: spacing.md }}
      />

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

      {/* Subfolders Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionTitle, { color: palette.text.primary }]}>
            {currentFolder ? `Subfolders in ${currentFolder.name}` : 'Workspace Folders'}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Create subfolder"
            onPress={() => {
              setNewFolderName('');
              setCreateError(null);
              setCreateFolderSheetOpen(true);
            }}
            style={[styles.smallActionBtn, { borderColor: palette.border.subtle }]}
          >
            <Text style={[styles.smallActionBtnText, { color: palette.action.primary }]}>
              ＋ New Folder
            </Text>
          </Pressable>
        </View>

        {subfolders.length === 0 ? (
          <View
            style={[
              styles.emptySubfolders,
              { backgroundColor: palette.surface, borderColor: palette.border.subtle },
            ]}
          >
            <Text style={[styles.emptyText, { color: palette.text.secondary }]}>
              No subfolders in this location.
            </Text>
          </View>
        ) : (
          <MobileCard themeMode={themeMode}>
            {subfolders.map((folder, idx) => {
              const count = folderCounts[folder.id] ?? 0;
              return (
                <View
                  key={folder.id}
                  style={[
                    styles.folderRow,
                    {
                      borderBottomColor:
                        idx < subfolders.length - 1 ? palette.border.subtle : 'transparent',
                    },
                  ]}
                >
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Open folder ${folder.name}, contains ${count} items`}
                    onPress={() => {
                      setCurrentFolderId(folder.id);
                      setPage(1);
                    }}
                    style={styles.folderRowMain}
                  >
                    <Text style={styles.folderIcon}>{folder.icon ?? '📁'}</Text>
                    <View style={styles.folderInfo}>
                      <Text
                        style={[styles.folderName, { color: palette.text.primary }]}
                        numberOfLines={1}
                        ellipsizeMode="tail"
                      >
                        {folder.name}
                      </Text>
                      <Text style={[styles.folderCount, { color: palette.text.secondary }]}>
                        {count} items
                      </Text>
                    </View>
                  </Pressable>

                  {/* Reorder and Action controls (>= 48dp touch targets) */}
                  <View style={styles.folderRowActions}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Move ${folder.name} up`}
                      disabled={idx === 0}
                      onPress={() => handleReorder(folder.id, 'up')}
                      style={[styles.reorderBtn, { opacity: idx === 0 ? 0.3 : 1 }]}
                    >
                      <Text style={[styles.reorderText, { color: palette.action.primary }]}>▲</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Move ${folder.name} down`}
                      disabled={idx === subfolders.length - 1}
                      onPress={() => handleReorder(folder.id, 'down')}
                      style={[
                        styles.reorderBtn,
                        { opacity: idx === subfolders.length - 1 ? 0.3 : 1 },
                      ]}
                    >
                      <Text style={[styles.reorderText, { color: palette.action.primary }]}>▼</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Rename ${folder.name}`}
                      onPress={() => {
                        setRenameTargetFolder(folder);
                        setRenameValue(folder.name);
                        setRenameError(null);
                      }}
                      style={styles.reorderBtn}
                    >
                      <Text style={{ fontSize: 14 }}>✏️</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Trash ${folder.name}`}
                      onPress={() => setTrashTargetFolder(folder)}
                      style={styles.reorderBtn}
                    >
                      <Text style={{ fontSize: 14 }}>🗑️</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </MobileCard>
        )}
      </View>

      {/* Items in Current Folder Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionTitle, { color: palette.text.primary }]}>
            {currentFolder ? currentFolder.name : 'Inbox / Top-level Records'} ({totalItems})
          </Text>
          {onOpenCreate && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add item to current folder"
              onPress={onOpenCreate}
              style={[styles.smallActionBtn, { borderColor: palette.border.subtle }]}
            >
              <Text style={[styles.smallActionBtnText, { color: palette.action.primary }]}>
                ＋ Add Item
              </Text>
            </Pressable>
          )}
        </View>

        {currentItems.length === 0 ? (
          <MobileEmptyState
            title={`No ${activeFilter !== 'all' ? activeFilter : ''} records`}
            description={
              currentFolder
                ? 'This folder has no matching items. Add notes, tasks, or documents to organize them.'
                : 'Your Inbox is empty. Unfiled items appear here.'
            }
            actionLabel="＋ Add Item"
            onAction={onOpenCreate}
            themeMode={themeMode}
          />
        ) : (
          <MobileCard themeMode={themeMode}>
            {paginatedItems.map((item, idx) => (
              <View
                key={item.id}
                accessible={true}
                accessibilityRole="text"
                accessibilityLabel={`${item.title}, ${item.kind}, ${item.metadata ?? ''}`}
                style={[
                  styles.itemRow,
                  {
                    borderBottomColor:
                      idx < paginatedItems.length - 1 ? palette.border.subtle : 'transparent',
                  },
                ]}
              >
                <View style={styles.itemRowContent}>
                  <Text
                    style={[styles.itemTitle, { color: palette.text.primary }]}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {item.title}
                  </Text>
                  {item.metadata && (
                    <Text style={[styles.itemMeta, { color: palette.text.secondary }]}>
                      {item.metadata}
                    </Text>
                  )}
                </View>

                {/* Mobile Type Badge */}
                <MobileTypeBadge kind={item.kind} themeMode={themeMode} />
              </View>
            ))}

            {/* Bounded Pagination Controls */}
            {totalPages > 1 && (
              <View style={[styles.paginationRow, { borderTopColor: palette.border.subtle }]}>
                <Text style={[styles.paginationText, { color: palette.text.secondary }]}>
                  Page {page} of {totalPages}
                </Text>
                <View style={styles.paginationButtons}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Previous page of items"
                    disabled={page === 1}
                    onPress={() => setPage((p) => Math.max(1, p - 1))}
                    style={[styles.pageBtn, { opacity: page === 1 ? 0.3 : 1 }]}
                  >
                    <Text style={[styles.pageBtnText, { color: palette.action.primary }]}>
                      &larr; Prev
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Next page of items"
                    disabled={page === totalPages}
                    onPress={() => setPage((p) => Math.min(totalPages, p + 1))}
                    style={[styles.pageBtn, { opacity: page === totalPages ? 0.3 : 1 }]}
                  >
                    <Text style={[styles.pageBtnText, { color: palette.action.primary }]}>
                      Next &rarr;
                    </Text>
                  </Pressable>
                </View>
              </View>
            )}
          </MobileCard>
        )}
      </View>

      {/* Invariant Note */}
      <View style={styles.libraryNote}>
        <Text style={[styles.libraryNoteText, { color: palette.text.muted }]}>
          One workspace folder hierarchy is the canonical source of truth. Opening a folder in All
          shows mixed records with type labels; module filters reveal matching records without
          moving content.
        </Text>
      </View>

      {/* Undo Toast */}
      {undoToast && (
        <View
          accessibilityRole="alert"
          style={[styles.undoToast, { backgroundColor: palette.text.primary }]}
        >
          <Text style={[styles.undoText, { color: palette.surface }]}>{undoToast.message}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Undo previous action"
            onPress={undoToast.onUndo}
            style={[styles.undoButton, { backgroundColor: palette.action.primary }]}
          >
            <Text style={styles.undoBtnText}>Undo</Text>
          </Pressable>
        </View>
      )}

      {/* Create Subfolder Modal Sheet */}
      <MobileModalSheet
        visible={isCreateFolderSheetOpen}
        onClose={() => setCreateFolderSheetOpen(false)}
        title="Create Subfolder"
        themeMode={themeMode}
      >
        <View style={styles.sheetContent}>
          {createError && (
            <View style={{ marginBottom: spacing.sm }}>
              <MobileFeedback severity="danger" message={createError} themeMode={themeMode} />
            </View>
          )}

          <MobileTextField
            label="Folder Name"
            placeholder="e.g. Applications or Projects"
            value={newFolderName}
            onChangeText={(t) => {
              setNewFolderName(t);
              if (createError) setCreateError(null);
            }}
            themeMode={themeMode}
            autoFocus
          />

          <View style={styles.sheetActions}>
            <MobileButton
              variant="secondary"
              themeMode={themeMode}
              onPress={() => setCreateFolderSheetOpen(false)}
            >
              Cancel
            </MobileButton>
            <MobileButton variant="primary" themeMode={themeMode} onPress={handleCreateFolder}>
              Create Folder
            </MobileButton>
          </View>
        </View>
      </MobileModalSheet>

      {/* Rename Modal Sheet */}
      <MobileModalSheet
        visible={Boolean(renameTargetFolder)}
        onClose={() => setRenameTargetFolder(null)}
        title="Rename Folder"
        themeMode={themeMode}
      >
        <View style={styles.sheetContent}>
          {renameError && (
            <View style={{ marginBottom: spacing.sm }}>
              <MobileFeedback severity="danger" message={renameError} themeMode={themeMode} />
            </View>
          )}

          <MobileTextField
            label="Folder Name"
            value={renameValue}
            onChangeText={(t) => {
              setRenameValue(t);
              if (renameError) setRenameError(null);
            }}
            themeMode={themeMode}
            autoFocus
          />

          <View style={styles.sheetActions}>
            <MobileButton
              variant="secondary"
              themeMode={themeMode}
              onPress={() => setRenameTargetFolder(null)}
            >
              Cancel
            </MobileButton>
            <MobileButton variant="primary" themeMode={themeMode} onPress={handleConfirmRename}>
              Save Rename
            </MobileButton>
          </View>
        </View>
      </MobileModalSheet>

      {/* Trash Confirmation Modal Sheet */}
      <MobileModalSheet
        visible={Boolean(trashTargetFolder)}
        onClose={() => setTrashTargetFolder(null)}
        title={`Trash "${trashTargetFolder?.name}"?`}
        themeMode={themeMode}
      >
        <View style={styles.sheetContent}>
          <Text style={[styles.trashConfirmText, { color: palette.text.primary }]}>
            This will move "{trashTargetFolder?.name}" and all its contained subfolders and items to
            Trash. You can undo this action immediately.
          </Text>

          <View style={styles.sheetActions}>
            <MobileButton
              variant="secondary"
              themeMode={themeMode}
              onPress={() => setTrashTargetFolder(null)}
            >
              Cancel
            </MobileButton>
            <MobileButton variant="primary" themeMode={themeMode} onPress={handleConfirmTrash}>
              Trash Folder
            </MobileButton>
          </View>
        </View>
      </MobileModalSheet>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  scrollContent: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.sm,
    borderWidth: 1,
    marginBottom: spacing.md,
  },
  statusText: {
    fontSize: 12,
  },
  sampleJourneysBtn: {
    minHeight: 36,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sampleJourneysText: {
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
    marginBottom: spacing.lg,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
  },
  smallActionBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.sm,
    borderWidth: 1,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallActionBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  emptySubfolders: {
    padding: spacing.md,
    borderRadius: radii.card,
    borderWidth: 1,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 13,
  },
  folderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    minHeight: touchTargets.mobileMin,
  },
  folderRowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: touchTargets.mobileMin,
  },
  folderIcon: {
    fontSize: 18,
    marginRight: spacing.sm,
  },
  folderInfo: {
    flex: 1,
  },
  folderName: {
    fontSize: 15,
    fontWeight: '600',
  },
  folderCount: {
    fontSize: 12,
    marginTop: 2,
  },
  folderRowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  reorderBtn: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reorderText: {
    fontSize: 14,
    fontWeight: '700',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    minHeight: touchTargets.mobileMin,
    gap: spacing.sm,
  },
  itemRowContent: {
    flex: 1,
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  itemMeta: {
    fontSize: 12,
    marginTop: 2,
  },
  paginationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.sm,
    marginTop: spacing.xs,
    borderTopWidth: 1,
  },
  paginationText: {
    fontSize: 12,
  },
  paginationButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  pageBtn: {
    minHeight: 36,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  libraryNote: {
    marginTop: spacing.md,
    padding: spacing.sm,
  },
  libraryNoteText: {
    fontSize: 12,
    lineHeight: 17,
  },
  undoToast: {
    position: 'absolute',
    bottom: spacing.lg,
    left: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.sm,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  undoText: {
    fontSize: 13,
    flex: 1,
  },
  undoButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.sm,
    marginLeft: spacing.sm,
  },
  undoBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  sheetContent: {
    paddingVertical: spacing.sm,
  },
  sheetActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  trashConfirmText: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: spacing.sm,
  },
});
