import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { LocalRepositoryPort, SyncEngine, FileRecord } from '@daynori/sync';
import type { DaynoriApiClient } from '@daynori/api-client';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as Clipboard from 'expo-clipboard';
import {
  MobileOfflineFileCache,
  computeMobileBufferSha256,
  arrayBufferToBase64,
  base64ToArrayBuffer,
} from '../data/offlineFileCache.js';
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
  MobileNoteEditor,
  MobileStorageUsageBar,
  MobileFileUploadSheet,
  MobileFilePreviewSheet,
  MobileQuickReferenceView,
  type MobileBreadcrumbSegment,
  type MobileFileItem,
  type MobileSelectedFile,
} from '@daynori/ui-mobile';
import {
  calculateFolderDepth,
  calculateSubtreeDepth,
  compareRanks,
  detectCycle,
  generateBetweenRanks,
  generateInitialRank,
  generateUuid,
  formatByteSize,
  MAX_FOLDER_DEPTH,
  createGuideDocument,
  createCheatsheetDocument,
  matchesKnowledgeFilter,
  sortKnowledgeItems,
  type NoteDocument,
  type SavedView,
  type ResolvedItemLink,
} from '@daynori/domain';
import type { LibraryFilter } from '../navigation/types';

export interface LibraryViewProps {
  themeMode: ThemeMode;
  initialFilter?: LibraryFilter;
  onFilterChange?: (filter: LibraryFilter) => void;
  onOpenCreate?: () => void;
  testID?: string;
  initialFolders?: MobileFolderItem[];
  initialItems?: MobileLibraryRecord[];
  workspaceId?: string | null;
  userId?: string | null;
  repository?: LocalRepositoryPort;
  syncEngine?: SyncEngine;
  isOnline?: boolean;
  apiClient?: DaynoriApiClient;
  targetItemId?: string | null;
  targetFolderId?: string | null;
  onClearTarget?: () => void;
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
  purpose?: string;
  isPinned?: boolean;
  isArchived?: boolean;
  tags?: string[];
  metadata?: string;
  archivedAt?: string | null;
  trashedAt?: string | null;
}

// Canonical UUID-backed demo journeys fixtures
export const SAMPLE_MOBILE_FOLDERS: MobileFolderItem[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Software',
    parentId: null,
    icon: '💻',
    rank: '00001000',
    revision: 1,
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Guides',
    parentId: '11111111-1111-4111-8111-111111111111',
    icon: '📚',
    rank: '00001000',
    revision: 1,
  },
  {
    id: '33333333-3333-4333-8333-333333333333',
    name: 'Projects',
    parentId: '11111111-1111-4111-8111-111111111111',
    icon: '🚀',
    rank: '00002000',
    revision: 1,
  },
  {
    id: '44444444-4444-4444-8444-444444444444',
    name: 'Government jobs',
    parentId: null,
    icon: '🏛️',
    rank: '00002000',
    revision: 1,
  },
  {
    id: '55555555-5555-4555-8555-555555555555',
    name: 'Applications',
    parentId: '44444444-4444-4444-8444-444444444444',
    icon: '📋',
    rank: '00001000',
    revision: 1,
  },
  {
    id: '66666666-6666-4666-8666-666666666666',
    name: 'Personal',
    parentId: null,
    icon: '🌱',
    rank: '00003000',
    revision: 1,
  },
  {
    id: '77777777-7777-4777-8777-777777777777',
    name: 'Learning',
    parentId: null,
    icon: '🎓',
    rank: '00004000',
    revision: 1,
  },
];

export const SAMPLE_MOBILE_ITEMS: MobileLibraryRecord[] = [
  {
    id: '88888888-8888-4888-8888-888888888888',
    title: 'TypeScript reference handbook',
    kind: 'knowledge',
    purpose: 'reference',
    folderId: '22222222-2222-4222-8222-222222222222',
    rank: '00001000',
    revision: 1,
    metadata: 'Knowledge Note • Updated yesterday',
  },
  {
    id: '99999999-9999-4999-8999-999999999999',
    title: 'TypeScript handbook deep-dive.pdf',
    kind: 'file',
    folderId: '22222222-2222-4222-8222-222222222222',
    rank: '00002000',
    revision: 1,
    metadata: 'PDF Document (2.4 MB) • Sep 28',
  },
  {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    title: 'Read generics chapter in handbook',
    kind: 'task',
    folderId: '22222222-2222-4222-8222-222222222222',
    rank: '00003000',
    revision: 1,
    metadata: 'Task Note • Due Friday',
  },
  {
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    title: 'New offline sync engine idea',
    kind: 'note',
    folderId: '33333333-3333-4333-8333-333333333333',
    rank: '00001000',
    revision: 1,
    metadata: 'Markdown Note • Draft',
  },
  {
    id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    title: 'Government Application Form.pdf',
    kind: 'file',
    folderId: '55555555-5555-4555-8555-555555555555',
    rank: '00001000',
    revision: 1,
    metadata: 'PDF Document (1.1 MB) • Oct 2',
  },
  {
    id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    title: 'Submit civil service exam application',
    kind: 'task',
    folderId: '55555555-5555-4555-8555-555555555555',
    rank: '00002000',
    revision: 1,
    metadata: 'Task Note • Deadline next week',
  },
  {
    id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    title: 'Technical interview preparation checklist',
    kind: 'note',
    folderId: '55555555-5555-4555-8555-555555555555',
    rank: '00003000',
    revision: 1,
    metadata: 'Markdown Note • 4 sections',
  },
  {
    id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
    title: 'Morning quiet reading routine (20m)',
    kind: 'routine',
    folderId: '66666666-6666-4666-8666-666666666666',
    rank: '00001000',
    revision: 1,
    metadata: 'Daily Habit • Active',
  },
  {
    id: '12121212-1212-4212-8212-121212121212',
    title: 'Today I learned: Visible focus outlines and screen-reader announcements',
    kind: 'journal',
    folderId: '66666666-6666-4666-8666-666666666666',
    rank: '00002000',
    revision: 1,
    metadata: 'Journal Entry • Oct 15',
  },
  {
    id: '34343434-3434-4434-8434-343434343434',
    title: 'Syllabus and exam preparation reference',
    kind: 'knowledge',
    folderId: '77777777-7777-4777-8777-777777777777',
    rank: '00001000',
    revision: 1,
    metadata: 'Knowledge Note • 12 pages',
  },
  {
    id: '56565656-5656-4656-8656-565656565656',
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
  onOpenCreate: _onOpenCreate,
  testID = 'library-view',
  initialFolders,
  initialItems,
  workspaceId: propWorkspaceId,
  userId: propUserId,
  repository,
  syncEngine,
  isOnline,
  apiClient,
  targetItemId,
  targetFolderId,
  onClearTarget,
}) => {
  const palette = colors[themeMode];
  const [activeFilter, setActiveFilter] = useState<LibraryFilter>(initialFilter);

  // Workspaces start empty by default unless initial data is injected
  const [folders, setFolders] = useState<MobileFolderItem[]>(initialFolders ?? []);
  const [items, setItems] = useState<MobileLibraryRecord[]>(initialItems ?? []);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null); // null = Root / Workspace
  const [page, setPage] = useState(1);

  // File & Storage States
  const [storageUsage, setStorageUsage] = useState({
    storedBytes: 15 * 1024 * 1024,
    reservedBytes: 0,
    maxBytes: 50 * 1024 * 1024,
  });
  const [isFileUploadSheetOpen, setFileUploadSheetOpen] = useState(false);
  const [activePreviewFile, setActivePreviewFile] = useState<MobileFileItem | null>(null);

  // Status & Offline/Sync State
  const [isOffline, setIsOffline] = useState(
    isOnline === false ||
      (syncEngine ? syncEngine.getDiagnostics().networkStatus === 'offline' : false)
  );
  const [localStatus, setLocalStatus] = useState('Saved locally');
  const [syncStatus, setSyncStatus] = useState(
    syncEngine
      ? syncEngine.getDiagnostics().cloudSyncStatus === 'syncing'
        ? 'Syncing...'
        : syncEngine.getDiagnostics().networkStatus === 'offline'
          ? 'Offline'
          : syncEngine.getDiagnostics().cloudSyncStatus === 'error'
            ? 'Sync error'
            : 'Synced'
      : 'Synced'
  );

  const workspaceId =
    propWorkspaceId || (syncEngine ? syncEngine.getDiagnostics().workspaceId : null);
  const userId = propUserId || (syncEngine ? syncEngine.getDiagnostics().userId : null);

  // 1. Subscribe to SyncEngine lifecycle and events
  useEffect(() => {
    if (!syncEngine) return;
    const updateFromEngine = () => {
      const diag = syncEngine.getDiagnostics();
      setIsOffline(diag.networkStatus === 'offline');
      if (diag.cloudSyncStatus === 'syncing') {
        setSyncStatus('Syncing...');
      } else if (diag.networkStatus === 'offline') {
        setSyncStatus('Offline');
      } else if (diag.cloudSyncStatus === 'error') {
        setSyncStatus('Sync error');
      } else {
        setSyncStatus('Synced');
      }
    };
    updateFromEngine();
    const unsub = syncEngine.onEvent(() => {
      updateFromEngine();
    });
    return unsub;
  }, [syncEngine]);

  // 2. Load persisted items from repository if provided
  useEffect(() => {
    if (!workspaceId) return;
    const repo =
      repository ?? (syncEngine as unknown as { repository?: LocalRepositoryPort })?.repository;
    if (!repo) return;

    let mounted = true;
    void (async () => {
      try {
        const itemRecords = await repo.listItemHeaders(workspaceId);
        if (!mounted || itemRecords.length === 0) return;

        const loadedFolders: MobileFolderItem[] = [];
        const loadedItems: MobileLibraryRecord[] = [];

        for (const item of itemRecords) {
          if (item.kind === 'folder') {
            loadedFolders.push({
              id: item.id,
              name: item.name || 'Folder',
              parentId: item.folderId,
              rank: item.rank,
              revision: item.serverRevision,
              archivedAt: item.isArchived ? new Date().toISOString() : null,
              trashedAt: item.deletedAt,
            });
          } else {
            loadedItems.push({
              id: item.id,
              title: item.name || item.title || 'Item',
              kind: item.kind as MobileLibraryRecord['kind'],
              purpose: item.purpose ?? undefined,
              folderId: item.folderId,
              rank: item.rank,
              revision: item.serverRevision,
              isPinned: item.isPinned,
              isArchived: item.isArchived,
              tags: item.tags,
              metadata: `${item.kind.toUpperCase()} • rev ${item.serverRevision}`,
              archivedAt: item.isArchived ? new Date().toISOString() : null,
              trashedAt: item.deletedAt,
            });
          }
        }

        setFolders(loadedFolders);
        setItems(loadedItems);
      } catch {
        /* fallback to initial state */
      }
    })();

    return () => {
      mounted = false;
    };
  }, [workspaceId, repository, syncEngine]);

  // Helper to persist mutations to sync engine or local repository
  const persistMutation = async (
    command: string,
    entityType: 'folder' | 'item',
    entityId: string,
    baseRevision: number,
    payload: Record<string, unknown>
  ) => {
    setLocalStatus('Saving locally...');
    if (
      syncEngine &&
      (syncEngine as unknown as { enqueueMutation?: (args: unknown) => Promise<void> })
        .enqueueMutation
    ) {
      try {
        await (
          syncEngine as unknown as { enqueueMutation: (args: unknown) => Promise<void> }
        ).enqueueMutation({
          command,
          entityType,
          entityId,
          baseRevision,
          payload,
        });
        setLocalStatus('Saved locally');
        void (syncEngine as unknown as { pushPending?: () => Promise<void> }).pushPending?.();
      } catch {
        setLocalStatus('Save failed');
      }
    } else if (syncEngine && workspaceId) {
      try {
        await syncEngine.saveItem(
          {
            id: entityId,
            workspaceId,
            kind: entityType,
            name: (payload['name'] as string) || 'Folder',
            parentId: (payload['parentId'] as string) ?? null,
            folderId: (payload['parentId'] as string) ?? null,
            rank: (payload['rank'] as string) || '00001000',
            securityScope: 'standard',
            isArchived: false,
            isPinned: false,
            serverRevision: baseRevision,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            deletedAt: null,
          },
          undefined,
          command as Parameters<typeof syncEngine.saveItem>[2],
          { payload }
        );
        setLocalStatus('Saved locally');
        void syncEngine.syncNow().catch(() => {});
      } catch {
        setLocalStatus('Save failed');
      }
    } else if (repository && workspaceId) {
      try {
        if (command === 'createFolder') {
          await repository.upsertItemHeader({
            id: entityId,
            workspaceId,
            kind: 'folder',
            name: (payload['name'] as string) || 'Folder',
            folderId: (payload['parentId'] as string) || null,
            rank: (payload['rank'] as string) || '00001000',
            isArchived: false,
            isPinned: false,
            securityScope: 'standard',
            serverRevision: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            deletedAt: null,
          });
        }
        setLocalStatus('Saved locally');
      } catch {
        setLocalStatus('Save failed');
      }
    } else {
      setLocalStatus('Saved locally');
    }
  };
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  // Modals / Sheets State
  const [isCreateFolderSheetOpen, setCreateFolderSheetOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);

  const [renameTargetFolder, setRenameTargetFolder] = useState<MobileFolderItem | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);

  const [moveTargetFolder, setMoveTargetFolder] = useState<MobileFolderItem | null>(null);
  const [moveDestinationId, setMoveDestinationId] = useState<string | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);

  const [trashTargetFolder, setTrashTargetFolder] = useState<MobileFolderItem | null>(null);
  const [trashSubtree, setTrashSubtree] = useState(true);

  // Active Note Editor State
  const [editingNote, setEditingNote] = useState<{
    id: string;
    title: string;
    folderId: string | null;
    document?: NoteDocument;
    isNew: boolean;
    kind?: 'note' | 'knowledge';
    conflict?: {
      serverRevision: number;
      serverTitle?: string;
      serverDocument?: NoteDocument;
    } | null;
  } | null>(null);

  // Quick Reference View State
  const [activeQuickRef, setActiveQuickRef] = useState<{
    id: string;
    title: string;
    folderId: string | null;
    document: NoteDocument;
  } | null>(null);
  const [activeQuickRefLinks, setActiveQuickRefLinks] = useState<ResolvedItemLink[]>([]);

  // Saved Views State
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [activeSavedViewId, setActiveSavedViewId] = useState<string | null>(null);

  useEffect(() => {
    if (!apiClient || !workspaceId) return;
    let isCancelled = false;
    void apiClient
      .listSavedViews(workspaceId)
      .then((res) => {
        if (res.data && !isCancelled) {
          setSavedViews(res.data);
        }
      })
      .catch(() => {});
    return () => {
      isCancelled = true;
    };
  }, [apiClient, workspaceId]);

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
      if (!f.trashedAt) {
        map.set(f.id, { parentId: f.parentId });
      }
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

  // Subfolders of current folder
  const subfolders = useMemo(() => {
    return folders
      .filter((f) => !f.trashedAt && f.parentId === currentFolderId)
      .sort((a, b) => compareRanks(a.rank, a.id, b.rank, b.id));
  }, [folders, currentFolderId]);

  // Filtered items in current folder
  const currentItems = useMemo(() => {
    const filtered = items.filter((item) => {
      if (item.trashedAt) return false;

      if (activeSavedViewId) {
        const activeView = savedViews.find((v) => v.id === activeSavedViewId);
        if (activeView) {
          return matchesKnowledgeFilter(
            {
              title: item.title,
              kind: item.kind,
              purpose: item.purpose,
              folderId: item.folderId,
              isPinned: Boolean(item.isPinned),
              isArchived: Boolean(item.isArchived || item.archivedAt),
              tags: item.tags,
            },
            activeView.filter,
            folderMap
          );
        }
      }

      if (item.folderId !== currentFolderId) return false;

      // Apply module filters
      if (activeFilter === 'notes' && item.kind !== 'note') return false;
      if (activeFilter === 'knowledge' && item.kind !== 'knowledge') return false;
      if (activeFilter === 'files' && item.kind !== 'file') return false;

      return true;
    });

    if (activeSavedViewId) {
      const activeView = savedViews.find((v) => v.id === activeSavedViewId);
      if (activeView && activeView.filter.sortBy) {
        return sortKnowledgeItems(
          filtered,
          activeView.filter.sortBy,
          activeView.filter.sortOrder || 'desc'
        );
      }
    }

    return filtered.sort((a, b) => compareRanks(a.rank, a.id, b.rank, b.id));
  }, [items, currentFolderId, activeFilter, activeSavedViewId, savedViews, folderMap]);

  // Counts of items per folder
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
    void persistMutation('reorderFolder', 'folder', folderId, target.revision, { rank: newRank });
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
      id: generateUuid(),
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

    void persistMutation('createFolder', 'folder', newFolder.id, 0, {
      id: newFolder.id,
      name: newFolder.name,
      parentId: newFolder.parentId,
      rank: newFolder.rank,
    });
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

    void persistMutation('updateFolder', 'folder', targetId, renameTargetFolder.revision, {
      name: trimmed,
    });

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
        void persistMutation('updateFolder', 'folder', targetId, renameTargetFolder.revision + 1, {
          name: origName,
        });
        setUndoToast(null);
      },
    });
  };

  // Move Folder
  const handleOpenMove = (folder: MobileFolderItem) => {
    setMoveTargetFolder(folder);
    setMoveDestinationId(folder.parentId);
    setMoveError(null);
  };

  const handleConfirmMove = () => {
    if (!moveTargetFolder) return;
    const folderId = moveTargetFolder.id;
    const originalParentId = moveTargetFolder.parentId;

    if (moveDestinationId === folderId) {
      setMoveError('Cannot move folder into itself.');
      return;
    }

    if (detectCycle(folderId, moveDestinationId, folderMap)) {
      setMoveError('Cannot move folder inside its own descendant.');
      return;
    }

    try {
      const targetDepth = calculateFolderDepth(moveDestinationId, folderMap);
      const childrenMap = new Map<string, string[]>();
      for (const f of folders) {
        if (!f.parentId || f.trashedAt) continue;
        const list = childrenMap.get(f.parentId) || [];
        list.push(f.id);
        childrenMap.set(f.parentId, list);
      }
      const subtreeDepth = calculateSubtreeDepth(folderId, childrenMap);
      if (targetDepth + subtreeDepth > MAX_FOLDER_DEPTH) {
        setMoveError(`Move exceeds maximum depth limit of ${MAX_FOLDER_DEPTH}.`);
        return;
      }
    } catch (e: unknown) {
      setMoveError(e instanceof Error ? e.message : 'Invalid destination.');
      return;
    }

    setFolders((prev) =>
      prev.map((f) =>
        f.id === folderId ? { ...f, parentId: moveDestinationId, revision: f.revision + 1 } : f
      )
    );
    setMoveTargetFolder(null);

    void persistMutation('moveFolder', 'folder', folderId, moveTargetFolder.revision, {
      parentId: moveDestinationId,
    });

    setUndoToast({
      id: `move-${folderId}`,
      message: `Moved folder '${moveTargetFolder.name}'`,
      onUndo: () => {
        setFolders((prev) =>
          prev.map((f) =>
            f.id === folderId ? { ...f, parentId: originalParentId, revision: f.revision + 1 } : f
          )
        );
        void persistMutation('moveFolder', 'folder', folderId, moveTargetFolder.revision + 1, {
          parentId: originalParentId,
        });
        setUndoToast(null);
      },
    });
  };

  // Trash Folder
  const handleConfirmTrash = () => {
    if (!trashTargetFolder) return;
    const folderId = trashTargetFolder.id;
    const targetName = trashTargetFolder.name;
    const now = new Date().toISOString();

    const descendants = new Set<string>();
    const findSubtree = (parentId: string) => {
      descendants.add(parentId);
      for (const f of folders) {
        if (f.parentId === parentId) findSubtree(f.id);
      }
    };
    findSubtree(folderId);

    const affectedItemIds: string[] = [];

    setFolders((prev) =>
      prev.map((f) => {
        if (trashSubtree) {
          return descendants.has(f.id) ? { ...f, trashedAt: now, revision: f.revision + 1 } : f;
        } else {
          if (f.id === folderId) {
            return { ...f, trashedAt: now, revision: f.revision + 1 };
          }
          if (f.parentId === folderId) {
            return { ...f, parentId: trashTargetFolder.parentId, revision: f.revision + 1 };
          }
          return f;
        }
      })
    );

    setItems((prev) =>
      prev.map((i) => {
        if (trashSubtree) {
          if (descendants.has(i.folderId ?? '')) {
            affectedItemIds.push(i.id);
            return { ...i, trashedAt: now, revision: i.revision + 1 };
          }
          return i;
        } else {
          if (i.folderId === folderId) {
            return { ...i, folderId: trashTargetFolder.parentId, revision: i.revision + 1 };
          }
          return i;
        }
      })
    );

    setTrashTargetFolder(null);

    void persistMutation('trashFolder', 'folder', folderId, trashTargetFolder.revision, {
      trashSubtree,
    });

    // Provide undo toast
    setUndoToast({
      id: `trash-${folderId}`,
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
        void persistMutation('restoreFolder', 'folder', folderId, trashTargetFolder.revision + 1, {
          restoreSubtree: true,
        });
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

  const handleClearJourneys = () => {
    setFolders([]);
    setItems([]);
    setCurrentFolderId(null);
    setPage(1);
    setFeedbackMessage('Cleared library. Workspace is now empty.');
    setTimeout(() => setFeedbackMessage(null), 3000);
  };

  const handleOpenNewNote = () => {
    const newId = generateUuid();
    setEditingNote({
      id: newId,
      title: '',
      folderId: currentFolderId,
      isNew: true,
      kind: 'note',
      conflict: null,
    });
  };

  const handleOpenNewPreset = (preset: 'guide' | 'cheatsheet') => {
    const newId = generateUuid();
    const defaultTitle = preset === 'guide' ? 'Untitled Guide' : 'Untitled Cheatsheet';
    const doc =
      preset === 'guide'
        ? createGuideDocument({ title: defaultTitle })
        : createCheatsheetDocument({ title: defaultTitle });
    setEditingNote({
      id: newId,
      title: defaultTitle,
      folderId: currentFolderId,
      document: doc,
      isNew: true,
      kind: 'knowledge',
      conflict: null,
    });
  };

  const handleOpenQuickReference = async (item: MobileLibraryRecord) => {
    let doc: NoteDocument | null = null;

    const repo =
      repository ?? (syncEngine as unknown as { repository?: LocalRepositoryPort })?.repository;
    if (repo && workspaceId) {
      try {
        const loaded = await repo.getNote(workspaceId, item.id);
        if (loaded?.document) {
          doc = loaded.document;
        }
      } catch {
        /* fallback to remote */
      }
    }

    if (!doc && apiClient && workspaceId && !isOffline) {
      try {
        const res = await apiClient.getNote(workspaceId, item.id);
        if (res.data?.document) {
          doc = res.data.document;
        }
      } catch {
        /* failed to load */
      }
    }

    if (!doc) {
      setLocalStatus('Note content is not downloaded or could not be loaded.');
      return;
    }

    let links: ResolvedItemLink[] = [];
    if (apiClient && workspaceId && !isOffline) {
      try {
        const res = await apiClient.getItemResolvedLinks(workspaceId, item.id);
        if (res.data) {
          links = res.data;
        }
      } catch {
        /* fallback */
      }
    }

    setActiveQuickRef({
      id: item.id,
      title: item.title,
      folderId: item.folderId,
      document: doc,
    });
    setActiveQuickRefLinks(links);
  };

  const handleOpenNote = async (item: MobileLibraryRecord) => {
    let doc: NoteDocument | undefined;
    let conflictInfo: {
      serverRevision: number;
      serverTitle?: string;
      serverDocument?: NoteDocument;
    } | null = null;

    const repo =
      repository ?? (syncEngine as unknown as { repository?: LocalRepositoryPort })?.repository;
    if (repo && workspaceId) {
      try {
        const loaded = await repo.getNote(workspaceId, item.id);
        if (loaded) {
          doc = loaded.document;
        }
        const conflicts = await repo.listConflicts(workspaceId);
        const found = conflicts.find((c) => c.entityId === item.id);
        if (found) {
          conflictInfo = {
            serverRevision: found.serverRevision,
            serverTitle: found.serverState?.['title'] as string | undefined,
            serverDocument: found.serverState?.['document'] as NoteDocument | undefined,
          };
        }
      } catch {
        /* fallback */
      }
    }

    setEditingNote({
      id: item.id,
      title: item.title,
      folderId: item.folderId,
      document: doc,
      isNew: false,
      kind: item.kind === 'knowledge' ? 'knowledge' : 'note',
      conflict: conflictInfo,
    });
  };

  const handleOpenFile = async (item: MobileLibraryRecord) => {
    let fileRecord: FileRecord | null = null;
    const repo =
      repository ?? (syncEngine as unknown as { repository?: LocalRepositoryPort })?.repository;

    if (repo && workspaceId) {
      try {
        fileRecord = await repo.getFile(workspaceId, item.id);
      } catch {
        /* fallback to remote check */
      }
    }

    if (!fileRecord && apiClient && workspaceId) {
      try {
        const res = await apiClient.getFileMetadata(workspaceId, item.id);
        if (res.data) {
          fileRecord = res.data;
        }
      } catch {
        /* fallback */
      }
    }

    let isOfflineAvailable = false;
    if (userId && workspaceId) {
      try {
        isOfflineAvailable = await MobileOfflineFileCache.hasBinary(
          userId,
          workspaceId,
          item.id,
          fileRecord ? Number(fileRecord.version) || item.revision : item.revision
        );
      } catch {
        isOfflineAvailable = false;
      }
    }

    if (fileRecord) {
      setActivePreviewFile({
        id: fileRecord.id,
        fileName: fileRecord.fileName,
        detectedMimeType: fileRecord.detectedMimeType || 'application/octet-stream',
        byteSize: fileRecord.byteSize,
        version: Number(fileRecord.version) || item.revision,
        quarantineStatus: fileRecord.quarantineStatus,
        sha256Checksum: fileRecord.sha256Checksum,
        folderName: currentFolder?.name ?? null,
        isOfflineAvailable,
        verifiedAt: fileRecord.verifiedAt ?? null,
      });
    } else {
      setActivePreviewFile({
        id: item.id,
        fileName: item.title,
        detectedMimeType: 'application/octet-stream',
        byteSize: 0,
        version: item.revision,
        quarantineStatus: 'quarantined',
        sha256Checksum: '',
        folderName: currentFolder?.name ?? null,
        isOfflineAvailable,
      });
    }
  };

  // Handle target navigation from search or deep links
  useEffect(() => {
    if (targetFolderId) {
      setCurrentFolderId(targetFolderId);
      onClearTarget?.();
    }
  }, [targetFolderId]);

  useEffect(() => {
    if (!targetItemId || !workspaceId) return;
    let cancelled = false;

    async function navigateToTarget() {
      // 1. Check if item already exists in local state
      const target = items.find((i) => i.id === targetItemId);
      if (target) {
        if (target.folderId) setCurrentFolderId(target.folderId);
        if (target.kind === 'file') {
          void handleOpenFile(target);
        } else if (
          target.kind === 'knowledge' ||
          (target.purpose && target.purpose !== 'standard')
        ) {
          void handleOpenQuickReference(target);
        } else {
          void handleOpenNote(target);
        }
        onClearTarget?.();
        return;
      }

      // 2. Target not in loaded state -> resolve from repository or API
      const repo =
        repository ?? (syncEngine as unknown as { repository?: LocalRepositoryPort })?.repository;
      if (repo) {
        try {
          const header = await repo.getItemHeader(workspaceId!, targetItemId!);
          if (!cancelled && header && !header.deletedAt && header.securityScope !== 'vault') {
            const resolved: MobileLibraryRecord = {
              id: header.id,
              title: header.name || header.title || 'Item',
              kind: header.kind as MobileLibraryRecord['kind'],
              purpose: header.purpose ?? undefined,
              folderId: header.folderId,
              rank: header.rank,
              revision: header.serverRevision,
            };
            if (resolved.folderId) setCurrentFolderId(resolved.folderId);
            if (resolved.kind === 'file') {
              void handleOpenFile(resolved);
            } else if (
              resolved.kind === 'knowledge' ||
              (resolved.purpose && resolved.purpose !== 'standard')
            ) {
              void handleOpenQuickReference(resolved);
            } else {
              void handleOpenNote(resolved);
            }
            onClearTarget?.();
            return;
          }
        } catch {
          /* fallback to API */
        }
      }

      if (apiClient && !isOffline) {
        try {
          const noteRes = await apiClient.getNote(workspaceId!, targetItemId!);
          if (!cancelled && noteRes.data) {
            const resolved: MobileLibraryRecord = {
              id: noteRes.data.id,
              title: noteRes.data.title,
              kind:
                noteRes.data.purpose && noteRes.data.purpose !== 'standard'
                  ? 'knowledge'
                  : 'note',
              purpose: noteRes.data.purpose,
              folderId: noteRes.data.folderId,
              rank: '00001000',
              revision: noteRes.data.revision,
            };
            if (resolved.folderId) setCurrentFolderId(resolved.folderId);
            if (resolved.kind === 'knowledge') {
              void handleOpenQuickReference(resolved);
            } else {
              void handleOpenNote(resolved);
            }
            onClearTarget?.();
            return;
          }
        } catch {
          try {
            const fileRes = await apiClient.getFileMetadata(workspaceId!, targetItemId!);
            if (!cancelled && fileRes.data) {
              const fileRecord: MobileLibraryRecord = {
                id: fileRes.data.id,
                title: fileRes.data.fileName,
                kind: 'file',
                folderId: fileRes.data.folderId,
                rank: '00001000',
                revision: Number(fileRes.data.version) || 1,
              };
              if (fileRecord.folderId) setCurrentFolderId(fileRecord.folderId);
              void handleOpenFile(fileRecord);
              onClearTarget?.();
            }
          } catch {
            /* not found */
          }
        }
      }
    }

    void navigateToTarget();

    return () => {
      cancelled = true;
    };
  }, [targetItemId, workspaceId, items, repository, syncEngine, apiClient, isOffline]);

  const handlePerformMobileUpload = async (
    file: MobileSelectedFile,
    targetFolderId: string | null,
    onProgress?: (percent: number) => void
  ): Promise<{
    success: boolean;
    error?: string;
    rejectionReason?: string;
    fileItem?: unknown;
  }> => {
    if (!workspaceId || !apiClient) {
      return {
        success: false,
        error: 'Mobile uploads require an active workspace and connected API service.',
      };
    }
    if (isOffline) {
      return {
        success: false,
        error: 'Cannot upload files while offline.',
      };
    }

    let reservationId: string | null = null;
    try {
      const buffer =
        file.data ||
        (file.uri
          ? new TextEncoder().encode('mobile payload: ' + file.name).buffer
          : new TextEncoder().encode(file.name).buffer);

      const sha256 = await computeMobileBufferSha256(buffer);
      onProgress?.(25);

      const reserveRes = await apiClient.reserveFileUpload(workspaceId, {
        fileName: file.name,
        declaredMimeType: file.type || 'application/octet-stream',
        declaredBytes: file.size || buffer.byteLength,
        folderId: targetFolderId ?? undefined,
      });

      reservationId = reserveRes.data.reservationId;
      const { uploadUrl, headers } = reserveRes.data;
      onProgress?.(50);

      const transferHeaders: Record<string, string> = {
        'Content-Type': file.type || 'application/octet-stream',
        ...(headers || {}),
      };

      const putRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: transferHeaders,
        body: buffer,
      });

      if (!putRes.ok) {
        throw new Error(`Upload transfer failed with HTTP ${putRes.status}`);
      }
      onProgress?.(90);

      const finalizeRes = await apiClient.finalizeFileUpload(workspaceId, reservationId, {
        clientChecksum: sha256,
      });

      const rec = finalizeRes.data;
      const status = rec.status;
      const now = new Date().toISOString();
      onProgress?.(100);

      const repo =
        repository ?? (syncEngine as unknown as { repository?: LocalRepositoryPort })?.repository;
      if (repo) {
        const fileRecord: FileRecord = {
          id: rec.fileId,
          workspaceId,
          folderId: targetFolderId,
          fileName: rec.fileName,
          declaredMimeType: file.type || 'application/octet-stream',
          detectedMimeType: rec.detectedMimeType,
          byteSize: rec.byteSize,
          sha256Checksum: rec.sha256Checksum,
          version: '1',
          quarantineStatus: status,
          rejectionReason: rec.rejectionReason ?? null,
          createdBy: userId || workspaceId,
          createdAt: now,
          updatedAt: now,
          verifiedAt: rec.verifiedAt ?? null,
        };
        await repo.upsertFile(fileRecord);
        await repo.upsertItemHeader({
          id: rec.fileId,
          workspaceId,
          kind: 'file',
          name: rec.fileName,
          parentId: targetFolderId,
          folderId: targetFolderId,
          rank: generateInitialRank(items.length),
          securityScope: 'standard',
          isArchived: false,
          isPinned: false,
          serverRevision: 1,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        });
      }

      const newItem: MobileLibraryRecord = {
        id: rec.fileId,
        title: rec.fileName,
        kind: 'file',
        folderId: targetFolderId,
        rank: generateInitialRank(items.length),
        revision: 1,
        metadata: `${formatByteSize(rec.byteSize)} • ${status}`,
      };

      setItems((prev) => [newItem, ...prev.filter((i) => i.id !== rec.fileId)]);
      setStorageUsage((prev) => ({
        ...prev,
        storedBytes: prev.storedBytes + rec.byteSize,
      }));

      if (status === 'rejected') {
        return {
          success: false,
          rejectionReason:
            rec.rejectionReason || 'Security policy quarantine rejected file content.',
          fileItem: newItem,
        };
      }

      return {
        success: true,
        fileItem: newItem,
      };
    } catch (err: unknown) {
      if (reservationId && apiClient && workspaceId) {
        await apiClient.cancelFileUploadReservation(workspaceId, reservationId).catch(() => {});
      }
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  };

  const handleSaveNote = async (saved: {
    title: string;
    document: NoteDocument;
    plainText: string;
    folderId?: string | null;
  }) => {
    if (!editingNote) return;
    const now = new Date().toISOString();
    const existing = items.find((i) => i.id === editingNote.id);
    const prevRev = (existing as { revision?: number })?.revision ?? 0;
    const isNew = editingNote.isNew;
    const targetFolderId =
      saved.folderId !== undefined ? saved.folderId : (currentFolderId ?? null);
    const createdAt = (existing as { createdAt?: string })?.createdAt || now;
    const isArchived = Boolean(
      (existing as { isArchived?: boolean; archivedAt?: unknown })?.isArchived ||
      (existing as { archivedAt?: unknown })?.archivedAt
    );
    const isPinned = Boolean((existing as { isPinned?: boolean })?.isPinned);
    const itemKind = editingNote.kind || (existing?.kind === 'knowledge' ? 'knowledge' : 'note');

    setLocalStatus('Saving locally...');
    try {
      if (syncEngine && workspaceId) {
        await syncEngine.saveItem(
          {
            id: editingNote.id,
            workspaceId,
            kind: itemKind,
            name: saved.title,
            parentId: targetFolderId,
            folderId: targetFolderId,
            rank: existing?.rank ?? generateInitialRank(items.length),
            securityScope: 'standard',
            isArchived,
            isPinned,
            serverRevision: prevRev,
            createdAt,
            updatedAt: now,
            deletedAt: null,
          },
          undefined,
          isNew ? 'createNote' : 'updateNote',
          {
            payload: {
              title: saved.title,
              document: saved.document,
              plainText: saved.plainText,
              folderId: targetFolderId,
            },
          }
        );
        setLocalStatus('Saved locally');
        setEditingNote((prev) =>
          prev
            ? {
                ...prev,
                isNew: false,
                title: saved.title,
                document: saved.document,
                folderId: targetFolderId,
              }
            : null
        );
        void syncEngine.syncNow().catch(() => {});
      } else {
        const repo =
          repository ?? (syncEngine as unknown as { repository?: LocalRepositoryPort })?.repository;
        if (repo && workspaceId) {
          await repo.upsertNote({
            id: editingNote.id,
            workspaceId,
            title: saved.title,
            document: saved.document,
            plainText: saved.plainText,
            wordCount: saved.plainText
              ? saved.plainText.trim().split(/\s+/).filter(Boolean).length
              : 0,
            charCount: saved.plainText.length,
            folderId: targetFolderId,
            serverRevision: prevRev,
            createdAt,
            updatedAt: now,
            deletedAt: null,
          });
          setLocalStatus('Saved locally');
          setEditingNote((prev) =>
            prev
              ? {
                  ...prev,
                  isNew: false,
                  title: saved.title,
                  document: saved.document,
                  folderId: targetFolderId,
                }
              : null
          );
        }
      }

      // Update items list in view only after durable persistence succeeds
      if (isNew) {
        setItems((prev) => [
          {
            id: editingNote.id,
            title: saved.title,
            kind: itemKind,
            folderId: targetFolderId,
            rank: existing?.rank ?? generateInitialRank(items.length),
            revision: prevRev || 1,
            metadata: itemKind === 'knowledge' ? 'Knowledge • Just now' : 'Note • Just now',
          },
          ...prev,
        ]);
      } else {
        setItems((prev) =>
          prev.map((i) =>
            i.id === editingNote.id
              ? {
                  ...i,
                  title: saved.title,
                  folderId: targetFolderId,
                  revision: (i.revision || 0) + 1,
                }
              : i
          )
        );
      }
    } catch (err) {
      setLocalStatus('Save failed');
      throw err;
    }
  };

  const handleResolveConflict = async (resolution: 'keep_server' | 'keep_local' | 'save_copy') => {
    if (!editingNote) return;
    if (syncEngine) {
      try {
        await syncEngine.resolveConflict(editingNote.id, resolution);
        void syncEngine.syncNow().catch(() => {});
        setEditingNote((prev) => (prev ? { ...prev, conflict: null } : null));
      } catch (err) {
        // Do not clear conflict banner if resolution failed
        console.error('Failed to resolve conflict:', err);
      }
    }
  };

  const handleDeleteNote = async () => {
    if (!editingNote) return;
    const noteId = editingNote.id;
    setItems((prev) => prev.filter((i) => i.id !== noteId));
    setEditingNote(null);

    if (syncEngine && workspaceId) {
      try {
        await syncEngine.saveItem(
          {
            id: noteId,
            workspaceId,
            kind: 'note',
            folderId: null,
            rank: '00001000',
            isArchived: false,
            isPinned: false,
            securityScope: 'standard',
            serverRevision: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            deletedAt: new Date().toISOString(),
          },
          undefined,
          'trashNote'
        );
        void syncEngine.syncNow().catch(() => {});
      } catch {
        /* ignore */
      }
    }
  };

  if (activeQuickRef) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.surface }}>
        <MobileQuickReferenceView
          noteId={activeQuickRef.id}
          title={activeQuickRef.title}
          document={activeQuickRef.document}
          themeMode={themeMode}
          links={activeQuickRefLinks}
          onCopyText={async (text) => {
            await Clipboard.setStringAsync(text);
          }}
          onEditNote={() => {
            const it = items.find((i) => i.id === activeQuickRef.id) ?? {
              id: activeQuickRef.id,
              title: activeQuickRef.title,
              kind: 'knowledge',
              folderId: activeQuickRef.folderId,
              rank: '00001000',
              revision: 1,
            };
            setActiveQuickRef(null);
            void handleOpenNote(it);
          }}
          onNavigateToItem={async (targetId) => {
            let target = items.find((i) => i.id === targetId);

            const targetFolder = folders.find((f) => f.id === targetId);
            if (targetFolder) {
              setActiveQuickRef(null);
              setCurrentFolderId(targetFolder.id);
              return;
            }

            if (!target) {
              const repo =
                repository ?? (syncEngine as unknown as { repository?: LocalRepositoryPort })?.repository;
              if (repo && workspaceId) {
                try {
                  const header = await repo.getItemHeader(workspaceId, targetId);
                  if (header && !header.deletedAt && header.securityScope !== 'vault') {
                    target = {
                      id: header.id,
                      title: header.name || header.title || 'Item',
                      kind: header.kind as MobileLibraryRecord['kind'],
                      purpose: header.purpose ?? undefined,
                      folderId: header.folderId,
                      rank: header.rank,
                      revision: header.serverRevision,
                      isPinned: header.isPinned,
                      isArchived: header.isArchived,
                      tags: header.tags,
                    };
                  }
                } catch {
                  /* fallback */
                }
              }
            }

            if (!target && apiClient && workspaceId && !isOffline) {
              try {
                try {
                  const noteRes = await apiClient.getNote(workspaceId, targetId);
                  if (noteRes.data) {
                    target = {
                      id: noteRes.data.id,
                      title: noteRes.data.title,
                      kind:
                        noteRes.data.purpose && noteRes.data.purpose !== 'standard'
                          ? 'knowledge'
                          : 'note',
                      purpose: noteRes.data.purpose,
                      folderId: noteRes.data.folderId,
                      rank: '00001000',
                      revision: noteRes.data.revision,
                    };
                  }
                } catch {
                  const fileRes = await apiClient.getFileMetadata(workspaceId, targetId);
                  if (fileRes.data) {
                    target = {
                      id: fileRes.data.id,
                      title: fileRes.data.fileName,
                      kind: 'file',
                      folderId: fileRes.data.folderId,
                      rank: '00001000',
                      revision: Number(fileRes.data.version) || 1,
                    };
                  }
                }
              } catch {
                /* failed to fetch */
              }
            }

            if (!target) {
              setLocalStatus('Linked item could not be found or access is unauthorized.');
              return;
            }

            setActiveQuickRef(null);
            if (target.kind === 'file') {
              void handleOpenFile(target);
            } else if (
              target.kind === 'knowledge' ||
              (target.purpose && target.purpose !== 'standard')
            ) {
              void handleOpenQuickReference(target);
            } else {
              void handleOpenNote(target);
            }
          }}
        />
      </View>
    );
  }

  if (editingNote) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.surface }}>
        <MobileNoteEditor
          initialTitle={editingNote.title}
          initialDocument={editingNote.document}
          initialFolderId={editingNote.folderId}
          folders={folders.map((f) => ({ id: f.id, name: f.name }))}
          themeMode={themeMode}
          localSaveStatus={localStatus}
          cloudSyncStatus={syncStatus}
          conflict={editingNote.conflict}
          onSave={handleSaveNote}
          onResolveConflict={handleResolveConflict}
          onClose={() => setEditingNote(null)}
          onDelete={handleDeleteNote}
        />
      </View>
    );
  }

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
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Create new note"
            onPress={handleOpenNewNote}
            style={[styles.sampleJourneysBtn, { backgroundColor: palette.action.primary }]}
          >
            <Text style={[styles.sampleJourneysText, { color: palette.action.label }]}>+ Note</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Create new guide"
            onPress={() => handleOpenNewPreset('guide')}
            style={[
              styles.sampleJourneysBtn,
              {
                backgroundColor: palette.action.subtle,
                borderWidth: 1,
                borderColor: palette.action.primary,
              },
            ]}
          >
            <Text style={[styles.sampleJourneysText, { color: palette.action.primary }]}>
              + Guide
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Create new cheatsheet"
            onPress={() => handleOpenNewPreset('cheatsheet')}
            style={[
              styles.sampleJourneysBtn,
              {
                backgroundColor: palette.action.subtle,
                borderWidth: 1,
                borderColor: palette.action.primary,
              },
            ]}
          >
            <Text style={[styles.sampleJourneysText, { color: palette.action.primary }]}>
              + Cheatsheet
            </Text>
          </Pressable>
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
          {folders.length > 0 && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear sample journeys"
              onPress={handleClearJourneys}
              style={styles.sampleJourneysBtn}
            >
              <Text style={[styles.sampleJourneysText, { color: palette.status.warning }]}>
                Clear
              </Text>
            </Pressable>
          )}
        </View>
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
                  backgroundColor: isSelected ? palette.action.subtle : palette.surfaceRaised,
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

      {/* Saved Views Bar */}
      {savedViews.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginBottom: spacing.sm, paddingHorizontal: spacing.sm }}
          contentContainerStyle={{ flexDirection: 'row', gap: 6 }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Default folder view"
            onPress={() => setActiveSavedViewId(null)}
            style={[
              styles.filterPill,
              {
                backgroundColor:
                  activeSavedViewId === null ? palette.action.subtle : palette.surfaceRaised,
                borderColor:
                  activeSavedViewId === null ? palette.action.primary : palette.border.subtle,
              },
            ]}
          >
            <Text
              style={[
                styles.filterPillText,
                {
                  color:
                    activeSavedViewId === null ? palette.action.primary : palette.text.secondary,
                  fontWeight: activeSavedViewId === null ? '700' : '500',
                },
              ]}
            >
              Default View
            </Text>
          </Pressable>
          {savedViews.map((sv) => {
            const isSelected = activeSavedViewId === sv.id;
            return (
              <Pressable
                key={sv.id}
                accessibilityRole="button"
                accessibilityLabel={`Saved view ${sv.name}`}
                onPress={() => setActiveSavedViewId(sv.id)}
                style={[
                  styles.filterPill,
                  {
                    backgroundColor: isSelected ? palette.action.subtle : palette.surfaceRaised,
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
                  🔖 {sv.name}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {/* Storage Usage Bar */}
      <View style={{ marginBottom: spacing.sm, paddingHorizontal: spacing.sm }}>
        <MobileStorageUsageBar
          storedBytes={storageUsage.storedBytes}
          reservedBytes={storageUsage.reservedBytes}
          maxBytes={storageUsage.maxBytes}
          themeMode={themeMode}
        />
      </View>

      {/* Subfolders Section */}
      <View style={{ marginBottom: spacing.md }}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: palette.text.primary }]}>
            {currentFolder ? 'Subfolders' : 'Workspace Folders'} ({subfolders.length})
          </Text>
          <View style={{ flexDirection: 'row', gap: spacing.xs }}>
            <MobileButton
              variant="secondary"
              accessibilityLabel="Upload file"
              onPress={() => setFileUploadSheetOpen(true)}
            >
              + Upload
            </MobileButton>
            <MobileButton
              variant="secondary"
              accessibilityLabel="Create new folder"
              onPress={() => setCreateFolderSheetOpen(true)}
            >
              + Folder
            </MobileButton>
          </View>
        </View>

        {subfolders.length === 0 && currentFolderId !== null && (
          <Text style={[styles.emptySubfoldersText, { color: palette.text.muted }]}>
            No subfolders inside {currentFolder?.name}.
          </Text>
        )}

        {subfolders.map((folder, index) => {
          const count = folderCounts[folder.id] ?? 0;
          return (
            <MobileCard key={folder.id} themeMode={themeMode} style={styles.folderCard}>
              <View style={styles.folderRow}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Open folder ${folder.name}, contains ${count} items`}
                  onPress={() => {
                    setCurrentFolderId(folder.id);
                    setPage(1);
                  }}
                  style={styles.folderTouchableArea}
                >
                  <Text style={styles.folderIcon}>{folder.icon ?? '📁'}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.folderName, { color: palette.text.primary }]}>
                      {folder.name}
                    </Text>
                    <Text style={[styles.folderMeta, { color: palette.text.secondary }]}>
                      {count} {count === 1 ? 'item' : 'items'}
                    </Text>
                  </View>
                </Pressable>

                {/* Sibling Reorder buttons */}
                <View style={styles.reorderButtons}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Move ${folder.name} up`}
                    disabled={index === 0}
                    onPress={() => handleReorder(folder.id, 'up')}
                    style={[styles.reorderBtn, index === 0 && { opacity: 0.3 }]}
                  >
                    <Text style={{ color: palette.text.primary, fontSize: 16 }}>▲</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Move ${folder.name} down`}
                    disabled={index === subfolders.length - 1}
                    onPress={() => handleReorder(folder.id, 'down')}
                    style={[styles.reorderBtn, index === subfolders.length - 1 && { opacity: 0.3 }]}
                  >
                    <Text style={{ color: palette.text.primary, fontSize: 16 }}>▼</Text>
                  </Pressable>
                </View>

                {/* Actions: Move, Rename, Delete */}
                <View style={styles.actionRow}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Move ${folder.name}`}
                    onPress={() => handleOpenMove(folder)}
                    style={styles.actionIconBtn}
                  >
                    <Text style={{ fontSize: 16 }}>➡️</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Rename ${folder.name}`}
                    onPress={() => {
                      setRenameTargetFolder(folder);
                      setRenameValue(folder.name);
                      setRenameError(null);
                    }}
                    style={styles.actionIconBtn}
                  >
                    <Text style={{ fontSize: 16 }}>✏️</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Delete ${folder.name}`}
                    onPress={() => setTrashTargetFolder(folder)}
                    style={styles.actionIconBtn}
                  >
                    <Text style={{ fontSize: 16 }}>🗑️</Text>
                  </Pressable>
                </View>
              </View>
            </MobileCard>
          );
        })}
      </View>

      {/* Items Section */}
      <View style={{ marginBottom: spacing.xl }}>
        <Text style={[styles.sectionTitle, { color: palette.text.primary }]}>
          {currentFolder ? `${currentFolder.name} Items` : 'Items & Notes'} ({totalItems})
        </Text>

        {paginatedItems.length === 0 ? (
          <MobileEmptyState
            title="No items found"
            description={
              subfolders.length === 0
                ? 'Your library is empty. Create a folder or load demo journeys.'
                : 'No items in this folder matching your active filters.'
            }
            actionLabel={folders.length === 0 ? 'Load Demo Journeys' : 'New Folder'}
            onAction={
              folders.length === 0 ? handleLoadSampleJourneys : () => setCreateFolderSheetOpen(true)
            }
            themeMode={themeMode}
          />
        ) : (
          paginatedItems.map((item) => (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityLabel={`Open ${item.kind === 'file' ? 'file' : item.kind === 'knowledge' ? 'knowledge guide' : 'note'} ${item.title}`}
              onPress={() => {
                if (item.kind === 'knowledge') {
                  void handleOpenQuickReference(item);
                } else if (item.kind === 'note') {
                  void handleOpenNote(item);
                } else if (item.kind === 'file') {
                  void handleOpenFile(item);
                }
              }}
            >
              <MobileCard themeMode={themeMode} style={styles.itemCard}>
                <View style={styles.itemRow}>
                  <MobileTypeBadge kind={item.kind} themeMode={themeMode} />
                  <View style={{ flex: 1, marginLeft: spacing.sm }}>
                    <Text style={[styles.itemTitle, { color: palette.text.primary }]}>
                      {item.title}
                    </Text>
                    {item.metadata && (
                      <Text style={[styles.itemMeta, { color: palette.text.secondary }]}>
                        {item.metadata}
                      </Text>
                    )}
                  </View>
                  {item.kind === 'knowledge' && (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`View quick reference for ${item.title}`}
                      onPress={(e) => {
                        e.stopPropagation?.();
                        void handleOpenQuickReference(item);
                      }}
                      style={{
                        paddingHorizontal: 8,
                        paddingVertical: 4,
                        borderRadius: 4,
                        backgroundColor: palette.action.subtle,
                        borderWidth: 1,
                        borderColor: palette.action.primary,
                      }}
                    >
                      <Text
                        style={{ fontSize: 11, fontWeight: '700', color: palette.action.primary }}
                      >
                        Quick Ref
                      </Text>
                    </Pressable>
                  )}
                </View>
              </MobileCard>
            </Pressable>
          ))
        )}

        {/* Mobile Pagination */}
        {totalPages > 1 && (
          <View style={styles.paginationBar}>
            <MobileButton
              variant="secondary"
              accessibilityLabel="Previous page"
              disabled={page <= 1}
              onPress={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </MobileButton>
            <Text style={[styles.pageIndicator, { color: palette.text.secondary }]}>
              {page} / {totalPages}
            </Text>
            <MobileButton
              variant="secondary"
              accessibilityLabel="Next page"
              disabled={page >= totalPages}
              onPress={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </MobileButton>
          </View>
        )}
      </View>

      {/* Floating Reversible Undo Toast */}
      {undoToast && (
        <View
          accessibilityRole="alert"
          accessibilityLabel={undoToast.message}
          style={[
            styles.undoToast,
            { backgroundColor: palette.surfaceRaised, borderColor: palette.border.subtle },
          ]}
        >
          <Text style={[styles.undoText, { color: palette.text.primary }]}>
            {undoToast.message}
          </Text>
          <MobileButton variant="primary" onPress={undoToast.onUndo}>
            Undo
          </MobileButton>
        </View>
      )}

      {/* Create Folder Modal Sheet */}
      <MobileModalSheet
        visible={isCreateFolderSheetOpen}
        onClose={() => setCreateFolderSheetOpen(false)}
        title="Create Subfolder"
        themeMode={themeMode}
      >
        <View style={{ gap: spacing.md }}>
          <MobileTextField
            label="Folder Name"
            placeholder="e.g. Documentation, Projects"
            value={newFolderName}
            onChangeText={setNewFolderName}
            errorMessage={createError ?? undefined}
            themeMode={themeMode}
            autoFocus
          />

          <View style={styles.modalActionRow}>
            <MobileButton variant="subtle" onPress={() => setCreateFolderSheetOpen(false)}>
              Cancel
            </MobileButton>
            <MobileButton variant="primary" onPress={handleCreateFolder}>
              Create
            </MobileButton>
          </View>
        </View>
      </MobileModalSheet>

      {/* Rename Folder Modal Sheet */}
      <MobileModalSheet
        visible={Boolean(renameTargetFolder)}
        onClose={() => setRenameTargetFolder(null)}
        title="Rename Folder"
        themeMode={themeMode}
      >
        <View style={{ gap: spacing.md }}>
          <MobileTextField
            label="Folder Name"
            value={renameValue}
            onChangeText={setRenameValue}
            errorMessage={renameError ?? undefined}
            themeMode={themeMode}
            autoFocus
          />

          <View style={styles.modalActionRow}>
            <MobileButton variant="subtle" onPress={() => setRenameTargetFolder(null)}>
              Cancel
            </MobileButton>
            <MobileButton variant="primary" onPress={handleConfirmRename}>
              Save Name
            </MobileButton>
          </View>
        </View>
      </MobileModalSheet>

      {/* Move Folder Modal Sheet */}
      <MobileModalSheet
        visible={Boolean(moveTargetFolder)}
        onClose={() => setMoveTargetFolder(null)}
        title={`Move Folder: ${moveTargetFolder?.name}`}
        themeMode={themeMode}
      >
        <View style={{ gap: spacing.md }}>
          <Text style={[styles.modalSubtitle, { color: palette.text.secondary }]}>
            Select Destination:
          </Text>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Move to Workspace Root"
            onPress={() => setMoveDestinationId(null)}
            style={[
              styles.destOption,
              {
                backgroundColor:
                  moveDestinationId === null ? palette.action.subtle : palette.surfaceRaised,
                borderColor:
                  moveDestinationId === null ? palette.action.primary : palette.border.subtle,
              },
            ]}
          >
            <Text style={{ color: palette.text.primary, fontWeight: '600' }}>
              📁 Workspace Root (Top Level)
            </Text>
          </Pressable>

          {folders
            .filter((f) => f.id !== moveTargetFolder?.id && !f.trashedAt)
            .map((f) => {
              const isCycle = moveTargetFolder && detectCycle(moveTargetFolder.id, f.id, folderMap);
              const isSelected = moveDestinationId === f.id;
              return (
                <Pressable
                  key={f.id}
                  disabled={Boolean(isCycle)}
                  accessibilityRole="button"
                  accessibilityLabel={`Move into ${f.name}`}
                  onPress={() => setMoveDestinationId(f.id)}
                  style={[
                    styles.destOption,
                    {
                      backgroundColor: isSelected ? palette.action.subtle : palette.surfaceRaised,
                      borderColor: isSelected ? palette.action.primary : palette.border.subtle,
                      opacity: isCycle ? 0.35 : 1,
                    },
                  ]}
                >
                  <Text style={{ color: palette.text.primary, fontWeight: '500' }}>
                    {f.icon ?? '📁'} {f.name} {isCycle ? '(Descendant)' : ''}
                  </Text>
                </Pressable>
              );
            })}

          {moveError && (
            <MobileFeedback severity="danger" message={moveError} themeMode={themeMode} />
          )}

          <View style={styles.modalActionRow}>
            <MobileButton variant="subtle" onPress={() => setMoveTargetFolder(null)}>
              Cancel
            </MobileButton>
            <MobileButton variant="primary" onPress={handleConfirmMove}>
              Confirm Move
            </MobileButton>
          </View>
        </View>
      </MobileModalSheet>

      {/* Trash Folder Confirmation Sheet */}
      <MobileModalSheet
        visible={Boolean(trashTargetFolder)}
        onClose={() => setTrashTargetFolder(null)}
        title={`Delete '${trashTargetFolder?.name}'`}
        themeMode={themeMode}
      >
        <View style={{ gap: spacing.md }}>
          <Text style={[styles.modalSubtitle, { color: palette.text.secondary }]}>
            Choose what to do with subfolders and items inside:
          </Text>

          <Pressable
            accessibilityRole="checkbox"
            accessibilityLabel="Delete entire subtree"
            accessibilityState={{ checked: trashSubtree }}
            onPress={() => setTrashSubtree(true)}
            style={[
              styles.policyOption,
              {
                backgroundColor: trashSubtree ? palette.action.subtle : palette.surfaceRaised,
                borderColor: trashSubtree ? palette.action.primary : palette.border.subtle,
              },
            ]}
          >
            <Text style={[styles.policyText, { color: palette.text.primary }]}>
              🗑️ Delete entire subtree (folder and all contents)
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="checkbox"
            accessibilityLabel="Preserve contents to parent"
            accessibilityState={{ checked: !trashSubtree }}
            onPress={() => setTrashSubtree(false)}
            style={[
              styles.policyOption,
              {
                backgroundColor: !trashSubtree ? palette.action.subtle : palette.surfaceRaised,
                borderColor: !trashSubtree ? palette.action.primary : palette.border.subtle,
              },
            ]}
          >
            <Text style={[styles.policyText, { color: palette.text.primary }]}>
              📦 Preserve contents (move items to parent folder)
            </Text>
          </Pressable>

          <View style={styles.modalActionRow}>
            <MobileButton variant="subtle" onPress={() => setTrashTargetFolder(null)}>
              Cancel
            </MobileButton>
            <MobileButton variant="danger" onPress={handleConfirmTrash}>
              Delete Folder
            </MobileButton>
          </View>
        </View>
      </MobileModalSheet>

      {/* File Upload Sheet */}
      <MobileFileUploadSheet
        visible={isFileUploadSheetOpen}
        onClose={() => setFileUploadSheetOpen(false)}
        themeMode={themeMode}
        folders={folders.map((f) => ({ id: f.id, name: f.name, icon: f.icon }))}
        initialFolderId={currentFolderId}
        storedBytes={storageUsage.storedBytes}
        reservedBytes={storageUsage.reservedBytes}
        maxBytes={storageUsage.maxBytes}
        onPickDocument={async () => {
          try {
            const res = await DocumentPicker.getDocumentAsync({
              copyToCacheDirectory: true,
              type: '*/*',
            });
            if (res.canceled || !res.assets || res.assets.length === 0) {
              return null;
            }
            const asset = res.assets[0];
            if (!asset) {
              return null;
            }
            const base64Data = await FileSystem.readAsStringAsync(asset.uri, {
              encoding: FileSystem.EncodingType.Base64,
            });
            const binaryData = base64ToArrayBuffer(base64Data);
            return {
              name: asset.name,
              size: asset.size ?? binaryData.byteLength,
              type: asset.mimeType ?? 'application/octet-stream',
              data: binaryData,
            };
          } catch {
            return null;
          }
        }}
        onUploadFile={handlePerformMobileUpload}
      />

      {/* File Preview Sheet */}
      <MobileFilePreviewSheet
        visible={activePreviewFile !== null}
        onClose={() => setActivePreviewFile(null)}
        themeMode={themeMode}
        file={activePreviewFile}
        onRequestDownloadUrl={async (f) => {
          if (!workspaceId) throw new Error('No active workspace');
          if (userId) {
            try {
              const cached = await MobileOfflineFileCache.getBinary(
                userId,
                workspaceId,
                f.id,
                f.version
              );
              if (cached && cached.binaryData) {
                return `data:${cached.mimeType || 'application/octet-stream'};base64,${arrayBufferToBase64(cached.binaryData)}`;
              }
            } catch {
              /* fallback to cloud */
            }
          }
          if (!apiClient || isOffline) {
            throw new Error('Offline: network connection required for cloud download capability.');
          }
          const res = await apiClient.getFileDownloadCapability(workspaceId, f.id);
          return res.data?.downloadUrl || '';
        }}
        onToggleOffline={async (f, enable) => {
          if (!workspaceId || !userId) return;
          if (enable) {
            if (!apiClient || isOffline) {
              setFeedbackMessage('Cannot download for offline while offline.');
              return;
            }
            const res = await apiClient.getFileDownloadCapability(workspaceId, f.id);
            const url = res.data?.downloadUrl;
            if (url) {
              const resp = await fetch(url);
              const data = await resp.arrayBuffer();
              await MobileOfflineFileCache.saveBinary({
                accountId: userId,
                workspaceId,
                fileId: f.id,
                version: f.version,
                fileName: f.fileName,
                mimeType: f.detectedMimeType || 'application/octet-stream',
                expectedSha256: f.sha256Checksum,
                data,
              });
              setActivePreviewFile((prev) => (prev ? { ...prev, isOfflineAvailable: true } : null));
              setFeedbackMessage(`${f.fileName} is now available offline.`);
            }
          } else {
            await MobileOfflineFileCache.deleteBinary(userId, workspaceId, f.id, f.version);
            setActivePreviewFile((prev) => (prev ? { ...prev, isOfflineAvailable: false } : null));
            setFeedbackMessage(`${f.fileName} removed from offline storage.`);
          }
        }}
        onDelete={async (f) => {
          if (workspaceId && apiClient && !isOffline) {
            await apiClient.deleteFile(workspaceId, f.id).catch(() => {});
          }
          const repo =
            repository ??
            (syncEngine as unknown as { repository?: LocalRepositoryPort })?.repository;
          if (repo && workspaceId) {
            await repo.deleteFile(workspaceId, f.id).catch(() => {});
            await repo.deleteItemHeader(workspaceId, f.id).catch(() => {});
          }
          if (userId && workspaceId) {
            await MobileOfflineFileCache.deleteBinary(userId, workspaceId, f.id, f.version).catch(
              () => {}
            );
          }
          setItems((prev) => prev.filter((i) => i.id !== f.id));
          setActivePreviewFile(null);
        }}
      />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  scrollContent: {
    padding: spacing.md,
    paddingBottom: 80,
  },
  statusBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.card,
    borderWidth: 1,
    marginBottom: spacing.md,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
  },
  sampleJourneysBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: radii.sm,
  },
  sampleJourneysText: {
    fontSize: 12,
    fontWeight: '700',
  },
  filterBar: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  filterPill: {
    minHeight: touchTargets.mobileMin,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: radii.pill,
    borderWidth: 1,
  },
  filterPillText: {
    fontSize: 14,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  emptySubfoldersText: {
    fontSize: 14,
    fontStyle: 'italic',
    marginBottom: spacing.sm,
  },
  folderCard: {
    marginBottom: spacing.sm,
  },
  folderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  folderTouchableArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: touchTargets.mobileMin,
  },
  folderIcon: {
    fontSize: 22,
    marginRight: spacing.sm,
  },
  folderName: {
    fontSize: 15,
    fontWeight: '700',
  },
  folderMeta: {
    fontSize: 12,
    marginTop: 2,
  },
  reorderButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  reorderBtn: {
    minWidth: touchTargets.mobileMin,
    minHeight: touchTargets.mobileMin,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  actionIconBtn: {
    minWidth: touchTargets.mobileMin,
    minHeight: touchTargets.mobileMin,
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemCard: {
    marginBottom: spacing.xs,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: touchTargets.mobileMin,
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  itemMeta: {
    fontSize: 12,
    marginTop: 2,
  },
  paginationBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  pageIndicator: {
    fontSize: 13,
    fontWeight: '600',
  },
  undoToast: {
    position: 'absolute',
    bottom: 20,
    left: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radii.card,
    borderWidth: 1,
    elevation: 4,
  },
  undoText: {
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  modalSubtitle: {
    fontSize: 14,
  },
  modalActionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  destOption: {
    padding: spacing.md,
    borderRadius: radii.card,
    borderWidth: 1,
    minHeight: touchTargets.mobileMin,
    justifyContent: 'center',
  },
  policyOption: {
    padding: spacing.md,
    borderRadius: radii.card,
    borderWidth: 1,
    minHeight: touchTargets.mobileMin,
    justifyContent: 'center',
  },
  policyText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
