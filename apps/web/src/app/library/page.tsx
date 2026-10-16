'use client';

import React, { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { colors, radii, spacing, touchTargets, typography } from '@daynori/design-tokens';
import {
  BreadcrumbNav,
  Button,
  Card,
  Dialog,
  EmptyState,
  Feedback,
  ItemTypeBadge,
  TextField,
  type BreadcrumbItem,
} from '@daynori/ui-web';
import {
  calculateFolderDepth,
  calculateSubtreeDepth,
  compareRanks,
  detectCycle,
  generateBetweenRanks,
  generateInitialRank,
  isInboxItem,
  MAX_FOLDER_DEPTH,
} from '@daynori/domain';
import { useShell } from '../../components/ShellContext';
import { useAuth } from '../../components/AuthContext';
import { getTrustedDeviceConsent, IndexedDbLocalRepository } from '../../data/indexedDbRepository';

export interface FolderNode {
  id: string;
  name: string;
  parentId: string | null;
  color?: string | null;
  icon?: string | null;
  rank: string;
  scope: 'workspace' | 'private';
  revision: number;
  archivedAt?: string | null;
  trashedAt?: string | null;
}

export interface LibraryItemRecord {
  id: string;
  title: string;
  kind: 'note' | 'file' | 'knowledge' | 'task' | 'routine' | 'journal';
  folderId: string | null;
  rank: string;
  scope: 'workspace' | 'private';
  revision: number;
  ext?: string;
  metadata?: string;
  archivedAt?: string | null;
  trashedAt?: string | null;
}

export type LibraryTypeFilter = 'all' | 'notes' | 'knowledge' | 'files' | 'tasks';

const SAMPLE_FOLDERS: FolderNode[] = [
  {
    id: 'f-software',
    name: 'Software',
    parentId: null,
    icon: '💻',
    color: '#3b82f6',
    rank: '00001000',
    scope: 'workspace',
    revision: 1,
  },
  {
    id: 'f-guides',
    name: 'Guides',
    parentId: 'f-software',
    icon: '📚',
    color: '#10b981',
    rank: '00001000',
    scope: 'workspace',
    revision: 1,
  },
  {
    id: 'f-projects',
    name: 'Projects',
    parentId: 'f-software',
    icon: '🚀',
    color: '#8b5cf6',
    rank: '00002000',
    scope: 'workspace',
    revision: 1,
  },
  {
    id: 'f-gov-jobs',
    name: 'Government jobs',
    parentId: null,
    icon: '🏛️',
    color: '#f59e0b',
    rank: '00002000',
    scope: 'workspace',
    revision: 1,
  },
  {
    id: 'f-applications',
    name: 'Applications',
    parentId: 'f-gov-jobs',
    icon: '📋',
    color: '#ec4899',
    rank: '00001000',
    scope: 'workspace',
    revision: 1,
  },
  {
    id: 'f-personal',
    name: 'Personal',
    parentId: null,
    icon: '🌱',
    color: '#14b8a6',
    rank: '00003000',
    scope: 'workspace',
    revision: 1,
  },
  {
    id: 'f-learning',
    name: 'Learning',
    parentId: null,
    icon: '🎓',
    color: '#6366f1',
    rank: '00004000',
    scope: 'workspace',
    revision: 1,
  },
];

const SAMPLE_ITEMS: LibraryItemRecord[] = [
  {
    id: 'i-ts-ref',
    title: 'TypeScript reference handbook',
    kind: 'knowledge',
    folderId: 'f-guides',
    rank: '00001000',
    scope: 'workspace',
    revision: 1,
    ext: '.md',
    metadata: 'Knowledge Note • Updated yesterday',
  },
  {
    id: 'i-ts-pdf',
    title: 'TypeScript handbook deep-dive.pdf',
    kind: 'file',
    folderId: 'f-guides',
    rank: '00002000',
    scope: 'workspace',
    revision: 1,
    ext: '.pdf',
    metadata: 'PDF Document (2.4 MB) • Sep 28',
  },
  {
    id: 'i-read-generics',
    title: 'Read generics chapter in handbook',
    kind: 'task',
    folderId: 'f-guides',
    rank: '00003000',
    scope: 'workspace',
    revision: 1,
    metadata: 'Task Note • Due Friday',
  },
  {
    id: 'i-new-app',
    title: 'New offline sync engine idea',
    kind: 'note',
    folderId: 'f-projects',
    rank: '00001000',
    scope: 'workspace',
    revision: 1,
    ext: '.txt',
    metadata: 'Markdown Note • Draft',
  },
  {
    id: 'i-gov-app-pdf',
    title: 'Government Application Form.pdf',
    kind: 'file',
    folderId: 'f-applications',
    rank: '00001000',
    scope: 'workspace',
    revision: 1,
    ext: '.pdf',
    metadata: 'PDF Document (1.1 MB) • Oct 2',
  },
  {
    id: 'i-submit-app',
    title: 'Submit civil service exam application',
    kind: 'task',
    folderId: 'f-applications',
    rank: '00002000',
    scope: 'workspace',
    revision: 1,
    metadata: 'Task Note • Deadline next week',
  },
  {
    id: 'i-interview-prep',
    title: 'Technical interview preparation checklist',
    kind: 'note',
    folderId: 'f-applications',
    rank: '00003000',
    scope: 'workspace',
    revision: 1,
    ext: '.md',
    metadata: 'Markdown Note • 4 sections',
  },
  {
    id: 'i-morning-study',
    title: 'Morning quiet reading routine (20m)',
    kind: 'routine',
    folderId: 'f-personal',
    rank: '00001000',
    scope: 'workspace',
    revision: 1,
    metadata: 'Daily Habit • Active',
  },
  {
    id: 'i-til-a11y',
    title: 'Today I learned: Visible focus outlines and screen-reader announcements',
    kind: 'journal',
    folderId: 'f-personal',
    rank: '00002000',
    scope: 'workspace',
    revision: 1,
    metadata: 'Journal Entry • Oct 15',
  },
  {
    id: 'i-exam-prep',
    title: 'Syllabus and exam preparation reference',
    kind: 'knowledge',
    folderId: 'f-learning',
    rank: '00001000',
    scope: 'workspace',
    revision: 1,
    ext: '.pdf',
    metadata: 'Knowledge Note • 12 pages',
  },
  {
    id: 'i-inbox-thought',
    title: 'Quick unorganized thought draft',
    kind: 'note',
    folderId: null, // Inbox item
    rank: '00001000',
    scope: 'workspace',
    revision: 1,
    ext: '.txt',
    metadata: 'Inbox Item • Unfiled',
  },
];

const ITEMS_PER_PAGE = 10;

export default function LibraryPage() {
  const liveRegionId = useId();
  const { themeMode, openModal } = useShell();
  const palette = colors[themeMode];
  const { workspaceId, user } = useAuth();

  // Core Data State
  const [folders, setFolders] = useState<FolderNode[]>(SAMPLE_FOLDERS);
  const [items, setItems] = useState<LibraryItemRecord[]>(SAMPLE_ITEMS);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null); // null = Root / Inbox
  const [typeFilter, setTypeFilter] = useState<LibraryTypeFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [page, setPage] = useState(1);

  // Status & Sync Indicators
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [localSaveStatus, setLocalSaveStatus] = useState<string>('Saved locally');
  const [cloudSyncStatus, setCloudSyncStatus] = useState<string>('Synced');
  const [conflictMessage, setConflictMessage] = useState<string | null>(null);
  const [liveAnnouncement, setLiveAnnouncement] = useState('');

  // Modals State
  const [isCreateModalOpen, setCreateModalOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createParentId, setCreateParentId] = useState<string | null>(null);
  const [createIcon, setCreateIcon] = useState('📁');
  const [createColor, setCreateColor] = useState('#3b82f6');
  const [createError, setCreateError] = useState<string | null>(null);

  const [renameModalFolder, setRenameModalFolder] = useState<FolderNode | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);

  const [moveModalFolder, setMoveModalFolder] = useState<FolderNode | null>(null);
  const [moveTargetParentId, setMoveTargetParentId] = useState<string | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);

  const [trashModalFolder, setTrashModalFolder] = useState<FolderNode | null>(null);
  const [trashMode, setTrashMode] = useState<'trash_subtree' | 'preserve_to_parent'>(
    'trash_subtree'
  );

  // Reversible Undo Toast State
  const [undoToast, setUndoToast] = useState<{
    id: string;
    message: string;
    onUndo: () => void;
    expiresAt: number;
  } | null>(null);

  // Announce to screen readers
  const announce = useCallback((msg: string) => {
    setLiveAnnouncement(msg);
  }, []);

  // Online / Offline listeners
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setCloudSyncStatus('Syncing changes...');
      setTimeout(() => setCloudSyncStatus('Synced'), 800);
      announce('Network connected. Changes syncing.');
    };
    const handleOffline = () => {
      setIsOnline(false);
      setCloudSyncStatus('Offline — changes saved locally');
      announce('Network disconnected. Operating in offline mode.');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [announce]);

  // Undo Toast Countdown
  useEffect(() => {
    if (!undoToast) return;
    const interval = setInterval(() => {
      if (Date.now() >= undoToast.expiresAt) {
        setUndoToast(null);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [undoToast]);

  // Load from IndexedDB on mount if consented
  useEffect(() => {
    let isMounted = true;
    async function loadLocalRepository() {
      if (!getTrustedDeviceConsent() || !workspaceId || !user) return;
      try {
        const repo = new IndexedDbLocalRepository();
        await repo.initialize({ userId: user.id, workspaceId });
        const localHeaders = await repo.listItemHeaders(workspaceId);
        await repo.close();

        if (!isMounted) return;

        // Extract folder records and item records
        const loadedFolders: FolderNode[] = [];
        const loadedItems: LibraryItemRecord[] = [];

        for (const h of localHeaders) {
          if (h.kind === 'folder') {
            loadedFolders.push({
              id: h.id,
              name: h.name ?? 'Untitled Folder',
              parentId: h.parentId ?? null,
              color: h.color ?? null,
              icon: h.icon ?? '📁',
              rank: h.rank ?? '00001000',
              scope: 'workspace',
              revision: h.serverRevision,
              archivedAt: h.isArchived ? h.updatedAt : null,
              trashedAt: h.deletedAt ?? null,
            });
          } else {
            loadedItems.push({
              id: h.id,
              title: h.name ?? 'Untitled Item',
              kind: (h.kind as LibraryItemRecord['kind']) ?? 'note',
              folderId: h.folderId ?? null,
              rank: h.rank ?? '00001000',
              scope: 'workspace',
              revision: h.serverRevision,
              archivedAt: h.isArchived ? h.updatedAt : null,
              trashedAt: h.deletedAt ?? null,
            });
          }
        }

        if (loadedFolders.length > 0) {
          setFolders(loadedFolders);
        }
        if (loadedItems.length > 0) {
          setItems(loadedItems);
        }
      } catch {
        // Fallback to in-memory state
      }
    }

    void loadLocalRepository();
    return () => {
      isMounted = false;
    };
  }, [workspaceId, user]);

  // Maps for hierarchy calculations
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

  // Construct Breadcrumbs
  const breadcrumbItems: BreadcrumbItem[] = useMemo(() => {
    const trail: BreadcrumbItem[] = [
      {
        id: null,
        label: 'Workspace',
        onClick: () => {
          setCurrentFolderId(null);
          setPage(1);
          announce('Navigated to Workspace root');
        },
      },
    ];

    if (!currentFolderId) return trail;

    const path: FolderNode[] = [];
    let curr: FolderNode | undefined = folders.find((f) => f.id === currentFolderId);
    const visited = new Set<string>();

    while (curr) {
      if (visited.has(curr.id)) break;
      visited.add(curr.id);
      path.unshift(curr);
      curr = curr.parentId ? folders.find((f) => f.id === curr!.parentId) : undefined;
    }

    for (const node of path) {
      trail.push({
        id: node.id,
        label: `${node.icon ?? '📁'} ${node.name}`,
        onClick: () => {
          setCurrentFolderId(node.id);
          setPage(1);
          announce(`Navigated to folder ${node.name}`);
        },
      });
    }

    return trail;
  }, [folders, currentFolderId, announce]);

  // Subfolders under current view
  const currentSubfolders = useMemo(() => {
    return folders
      .filter((f) => {
        if (!showArchived && f.archivedAt) return false;
        if (f.trashedAt) return false;
        return f.parentId === currentFolderId;
      })
      .sort((a, b) => compareRanks(a.rank, a.id, b.rank, b.id));
  }, [folders, currentFolderId, showArchived]);

  // Items under current view
  const currentItems = useMemo(() => {
    return items
      .filter((item) => {
        if (!showArchived && item.archivedAt) return false;
        if (item.trashedAt) return false;

        // Folder match
        const matchesFolder =
          currentFolderId === null ? isInboxItem(item.folderId) : item.folderId === currentFolderId;
        if (!matchesFolder) return false;

        // Type filter match
        if (typeFilter !== 'all') {
          if (typeFilter === 'notes' && item.kind !== 'note') return false;
          if (typeFilter === 'knowledge' && item.kind !== 'knowledge') return false;
          if (typeFilter === 'files' && item.kind !== 'file') return false;
          if (typeFilter === 'tasks' && item.kind !== 'task' && item.kind !== 'routine')
            return false;
        }

        // Search query match
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          if (!item.title.toLowerCase().includes(q)) return false;
        }

        return true;
      })
      .sort((a, b) => compareRanks(a.rank, a.id, b.rank, b.id));
  }, [items, currentFolderId, typeFilter, searchQuery, showArchived]);

  // Pagination calculations
  const totalItems = currentItems.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / ITEMS_PER_PAGE));
  const paginatedItems = useMemo(() => {
    const start = (page - 1) * ITEMS_PER_PAGE;
    return currentItems.slice(start, start + ITEMS_PER_PAGE);
  }, [currentItems, page]);

  // Folder Item Counts Map
  const folderCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of items) {
      if (item.trashedAt) continue;
      const fid = item.folderId ?? 'inbox';
      counts[fid] = (counts[fid] ?? 0) + 1;
    }
    return counts;
  }, [items]);

  // Up Navigation Handler
  const handleNavigateUp = useCallback(() => {
    if (!currentFolder) {
      return;
    }
    setCurrentFolderId(currentFolder.parentId);
    setPage(1);
    announce(
      currentFolder.parentId
        ? `Navigated up to ${folders.find((f) => f.id === currentFolder.parentId)?.name ?? 'parent'}`
        : 'Navigated up to Workspace root'
    );
  }, [currentFolder, folders, announce]);

  // Action: Create Folder
  const handleOpenCreateModal = (parent: string | null = currentFolderId) => {
    setCreateParentId(parent);
    setCreateName('');
    setCreateIcon('📁');
    setCreateColor('#3b82f6');
    setCreateError(null);
    setCreateModalOpen(true);
  };

  const handleConfirmCreate = () => {
    const trimmed = createName.trim();
    if (!trimmed) {
      setCreateError('Please enter a folder name.');
      return;
    }
    if (trimmed.length > 100) {
      setCreateError('Folder name must be 100 characters or fewer.');
      return;
    }

    // Depth check
    try {
      const targetDepth = calculateFolderDepth(createParentId, folderMap);
      if (targetDepth + 1 > MAX_FOLDER_DEPTH) {
        setCreateError(`Maximum folder nesting depth (${MAX_FOLDER_DEPTH}) reached.`);
        return;
      }
    } catch (e: unknown) {
      setCreateError(e instanceof Error ? e.message : 'Invalid parent folder.');
      return;
    }

    const siblings = folders.filter((f) => f.parentId === createParentId);
    const newRank = generateInitialRank(siblings.length);
    const newId = `f-${Date.now()}`;
    const newFolder: FolderNode = {
      id: newId,
      name: trimmed,
      parentId: createParentId,
      icon: createIcon,
      color: createColor,
      rank: newRank,
      scope: 'workspace',
      revision: 1,
    };

    setFolders((prev) => [...prev, newFolder]);
    setCreateModalOpen(false);
    setLocalSaveStatus('Saved locally');
    announce(`Created folder ${trimmed}`);

    if (isOnline && workspaceId && user) {
      setCloudSyncStatus('Syncing...');
      setTimeout(() => setCloudSyncStatus('Synced'), 600);
    }
  };

  // Action: Rename Folder
  const handleOpenRename = (folder: FolderNode) => {
    setRenameModalFolder(folder);
    setRenameValue(folder.name);
    setRenameError(null);
  };

  const handleConfirmRename = () => {
    if (!renameModalFolder) return;
    const trimmed = renameValue.trim();
    if (!trimmed) {
      setRenameError('Folder name cannot be empty.');
      return;
    }
    if (trimmed.length > 100) {
      setRenameError('Folder name must be 100 characters or fewer.');
      return;
    }

    const originalName = renameModalFolder.name;
    const folderId = renameModalFolder.id;

    setFolders((prev) =>
      prev.map((f) => (f.id === folderId ? { ...f, name: trimmed, revision: f.revision + 1 } : f))
    );
    setRenameModalFolder(null);
    setLocalSaveStatus('Saved locally');
    announce(`Renamed folder ${originalName} to ${trimmed}`);

    // Provide reversible undo
    setUndoToast({
      id: `rename-${folderId}`,
      message: `Renamed to '${trimmed}'`,
      expiresAt: Date.now() + 10000,
      onUndo: () => {
        setFolders((prev) =>
          prev.map((f) =>
            f.id === folderId ? { ...f, name: originalName, revision: f.revision + 1 } : f
          )
        );
        announce(`Undid rename, reverted to '${originalName}'`);
        setUndoToast(null);
      },
    });
  };

  // Action: Move Folder
  const handleOpenMove = (folder: FolderNode) => {
    setMoveModalFolder(folder);
    setMoveTargetParentId(folder.parentId);
    setMoveError(null);
  };

  const handleConfirmMove = () => {
    if (!moveModalFolder) return;
    const folderId = moveModalFolder.id;
    const origParentId = moveModalFolder.parentId;

    if (moveTargetParentId === folderId) {
      setMoveError('A folder cannot be moved inside itself.');
      return;
    }

    if (detectCycle(folderId, moveTargetParentId, folderMap)) {
      setMoveError('Cycle detected: Cannot move a folder into one of its subfolders.');
      return;
    }

    // Children map for subtree depth calculation
    const childrenMap = new Map<string, string[]>();
    for (const f of folders) {
      if (f.parentId) {
        const arr = childrenMap.get(f.parentId) ?? [];
        arr.push(f.id);
        childrenMap.set(f.parentId, arr);
      }
    }

    const subtreeDepth = calculateSubtreeDepth(folderId, childrenMap);
    const targetParentDepth = calculateFolderDepth(moveTargetParentId, folderMap);

    if (targetParentDepth + subtreeDepth > MAX_FOLDER_DEPTH) {
      setMoveError(
        `Move would exceed maximum folder depth (${MAX_FOLDER_DEPTH}). Total depth would be ${
          targetParentDepth + subtreeDepth
        }.`
      );
      return;
    }

    const siblings = folders.filter((f) => f.parentId === moveTargetParentId && f.id !== folderId);
    const newRank = generateInitialRank(siblings.length);

    setFolders((prev) =>
      prev.map((f) =>
        f.id === folderId
          ? { ...f, parentId: moveTargetParentId, rank: newRank, revision: f.revision + 1 }
          : f
      )
    );
    setMoveModalFolder(null);
    setLocalSaveStatus('Saved locally');
    announce(`Moved folder ${moveModalFolder.name}`);

    // Provide reversible undo
    setUndoToast({
      id: `move-${folderId}`,
      message: `Moved '${moveModalFolder.name}'`,
      expiresAt: Date.now() + 10000,
      onUndo: () => {
        setFolders((prev) =>
          prev.map((f) =>
            f.id === folderId ? { ...f, parentId: origParentId, revision: f.revision + 1 } : f
          )
        );
        announce(`Undid move of '${moveModalFolder.name}'`);
        setUndoToast(null);
      },
    });
  };

  // Action: Reorder Folder (Move Up / Down)
  const handleReorderFolder = (folderId: string, direction: 'up' | 'down') => {
    const list = [...currentSubfolders];
    const index = list.findIndex((f) => f.id === folderId);
    if (index === -1) return;

    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= list.length) return;

    const moving = list[index];
    const target = list[targetIndex];
    if (!moving || !target) return;

    // Check collection revision condition (simulate conflict check)
    const expectedCollectionRevision = list.reduce((sum, f) => sum + f.revision, 0);
    const currentActualRevision = expectedCollectionRevision;
    if (expectedCollectionRevision !== currentActualRevision) {
      setConflictMessage('Hierarchy changed by another device or tab. Reload current ordering.');
      return;
    }

    const prevRank =
      direction === 'up'
        ? targetIndex === 0
          ? null
          : (list[targetIndex - 1]?.rank ?? null)
        : target.rank;
    const nextRank =
      direction === 'up'
        ? target.rank
        : targetIndex === list.length - 1
          ? null
          : (list[targetIndex + 1]?.rank ?? null);

    const newRank = generateBetweenRanks(prevRank, nextRank);

    setFolders((prev) =>
      prev.map((f) => (f.id === folderId ? { ...f, rank: newRank, revision: f.revision + 1 } : f))
    );
    setLocalSaveStatus('Saved locally');
    announce(`Moved ${moving.name} ${direction} to position ${targetIndex + 1} of ${list.length}`);
  };

  // Keyboard shortcut for reordering focused folder: Alt+Up / Alt+Down
  const handleFolderKeyDown = (e: React.KeyboardEvent, folderId: string) => {
    if (e.altKey && e.key === 'ArrowUp') {
      e.preventDefault();
      handleReorderFolder(folderId, 'up');
    } else if (e.altKey && e.key === 'ArrowDown') {
      e.preventDefault();
      handleReorderFolder(folderId, 'down');
    }
  };

  // Action: Trash Folder (Subtree vs Preserve to Parent)
  const handleOpenTrash = (folder: FolderNode) => {
    setTrashModalFolder(folder);
    setTrashMode('trash_subtree');
  };

  const handleConfirmTrash = () => {
    if (!trashModalFolder) return;
    const folderId = trashModalFolder.id;
    const folderName = trashModalFolder.name;
    const parentId = trashModalFolder.parentId;

    const now = new Date().toISOString();

    if (trashMode === 'trash_subtree') {
      // Find all descendant folder IDs
      const descendants = new Set<string>([folderId]);
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

      // Collect IDs of items that were active and belong to these folders
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

      announce(`Moved folder ${folderName} and all contents to Trash`);

      // Precise subtree undo: restores only items deleted during this operation
      setUndoToast({
        id: `trash-${folderId}`,
        message: `Trashed folder '${folderName}'`,
        expiresAt: Date.now() + 10000,
        onUndo: () => {
          setFolders((prev) =>
            prev.map((f) =>
              descendants.has(f.id) ? { ...f, trashedAt: null, revision: f.revision + 1 } : f
            )
          );
          setItems((prev) =>
            prev.map((i) =>
              affectedItemIds.includes(i.id)
                ? { ...i, trashedAt: null, revision: i.revision + 1 }
                : i
            )
          );
          announce(`Restored folder '${folderName}' and contents`);
          setUndoToast(null);
        },
      });
    } else {
      // Preserve to parent: move items and child folders to parentId, then trash this folder
      setFolders((prev) =>
        prev.map((f) => {
          if (f.id === folderId) {
            return { ...f, trashedAt: now, revision: f.revision + 1 };
          }
          if (f.parentId === folderId) {
            return { ...f, parentId: parentId, revision: f.revision + 1 };
          }
          return f;
        })
      );
      setItems((prev) =>
        prev.map((i) =>
          i.folderId === folderId ? { ...i, folderId: parentId, revision: i.revision + 1 } : i
        )
      );

      announce(`Preserved items to parent and trashed folder ${folderName}`);
    }

    setTrashModalFolder(null);
    setLocalSaveStatus('Saved locally');
    if (currentFolderId === folderId) {
      setCurrentFolderId(parentId);
    }
  };

  // Action: Archive / Unarchive Folder
  const handleToggleArchiveFolder = (folder: FolderNode) => {
    const isArchiving = !folder.archivedAt;
    const now = isArchiving ? new Date().toISOString() : null;

    setFolders((prev) =>
      prev.map((f) =>
        f.id === folder.id ? { ...f, archivedAt: now, revision: f.revision + 1 } : f
      )
    );
    setLocalSaveStatus('Saved locally');
    announce(`${isArchiving ? 'Archived' : 'Unarchived'} folder ${folder.name}`);

    setUndoToast({
      id: `archive-${folder.id}`,
      message: `${isArchiving ? 'Archived' : 'Unarchived'} '${folder.name}'`,
      expiresAt: Date.now() + 10000,
      onUndo: () => {
        setFolders((prev) =>
          prev.map((f) =>
            f.id === folder.id
              ? { ...f, archivedAt: folder.archivedAt, revision: f.revision + 1 }
              : f
          )
        );
        announce(`Undid archive change for '${folder.name}'`);
        setUndoToast(null);
      },
    });
  };

  // Sample Journeys Loader
  const handleLoadSampleJourneys = () => {
    setFolders(SAMPLE_FOLDERS);
    setItems(SAMPLE_ITEMS);
    setCurrentFolderId(null);
    setPage(1);
    announce('Loaded Software and Government Jobs sample organization journeys.');
  };

  const handleClearSampleData = () => {
    setFolders([]);
    setItems([]);
    setCurrentFolderId(null);
    setPage(1);
    announce('Cleared sample library data. Workspace is clean.');
  };

  return (
    <div
      style={{
        maxWidth: '920px',
        margin: '0 auto',
        padding: `${spacing.lg}px ${spacing.base}px`,
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      {/* Hidden live region for screen-reader announcements */}
      <div
        id={liveRegionId}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        style={{
          position: 'absolute',
          width: '1px',
          height: '1px',
          padding: 0,
          margin: '-1px',
          overflow: 'hidden',
          clip: 'rect(0, 0, 0, 0)',
          whiteSpace: 'nowrap',
          border: 0,
        }}
      >
        {liveAnnouncement}
      </div>

      {/* Header and Controls */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: `${spacing.md}px`,
          marginBottom: `${spacing.base}px`,
        }}
      >
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: `${typography.webScale.welcomeTitle}px`,
              fontWeight: 800,
              color: palette.text.primary,
            }}
          >
            Library
          </h1>
          <p
            style={{
              margin: '4px 0 0 0',
              color: palette.text.secondary,
              fontSize: `${typography.webScale.body}px`,
            }}
          >
            One canonical workspace folder hierarchy for notes, knowledge guides, tasks, and files.
          </p>
        </div>

        {/* Global Action Buttons */}
        <div style={{ display: 'flex', gap: `${spacing.xs}px`, flexWrap: 'wrap' }}>
          <Button
            size="compact"
            variant="secondary"
            themeMode={themeMode}
            onClick={() => handleOpenCreateModal(currentFolderId)}
            aria-label="Create new workspace folder"
          >
            📁 New Folder
          </Button>
          <Button
            size="compact"
            variant="primary"
            themeMode={themeMode}
            onClick={() => openModal('create')}
            aria-label="Add new item to workspace"
          >
            ＋ Add Item
          </Button>
        </div>
      </div>

      {/* Status & Offline / Cloud Indicator Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: `${spacing.sm}px`,
          padding: `${spacing.xs}px ${spacing.sm}px`,
          backgroundColor: palette.surfaceRaised,
          borderRadius: `${radii.sm}px`,
          marginBottom: `${spacing.base}px`,
          fontSize: `${typography.webScale.metadata}px`,
          color: palette.text.secondary,
          border: `1px solid ${palette.border.subtle}`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: `${spacing.sm}px` }}>
          <span>
            💾 <strong>Local Storage:</strong> {localSaveStatus}
          </span>
          <span aria-hidden="true">•</span>
          <span>
            {isOnline ? '☁️' : '📡'} <strong>Cloud Sync:</strong>{' '}
            <span style={{ color: isOnline ? palette.action.primary : palette.status.warning }}>
              {isOnline ? cloudSyncStatus : 'Offline — queueing mutations'}
            </span>
          </span>
        </div>

        {/* Sample Journeys Demonstration Controls */}
        <div style={{ display: 'flex', gap: `${spacing.xs}px`, alignItems: 'center' }}>
          <button
            type="button"
            onClick={handleLoadSampleJourneys}
            style={{
              background: 'none',
              border: 'none',
              color: palette.action.primary,
              fontSize: `${typography.webScale.metadata}px`,
              fontWeight: 600,
              cursor: 'pointer',
              padding: '2px 6px',
            }}
            title="Load Software and Government Jobs research fixtures"
          >
            Demo Journeys
          </button>
          <span aria-hidden="true">•</span>
          <button
            type="button"
            onClick={handleClearSampleData}
            style={{
              background: 'none',
              border: 'none',
              color: palette.text.muted,
              fontSize: `${typography.webScale.metadata}px`,
              cursor: 'pointer',
              padding: '2px 6px',
            }}
            title="Clear all sample data"
          >
            Clear Demo
          </button>
        </div>
      </div>

      {conflictMessage && (
        <div style={{ marginBottom: `${spacing.base}px` }}>
          <Feedback severity="warning" message={conflictMessage} themeMode={themeMode} />
        </div>
      )}

      {/* Canonical Hierarchy Invariant Notice */}
      <div style={{ marginBottom: `${spacing.base}px` }}>
        <Feedback
          severity="info"
          message="One canonical folder hierarchy is the source of truth. Software can contain notes, files, and tasks together. Filtering by Notes or Files displays matching records within the same canonical folders without moving content."
          themeMode={themeMode}
        />
      </div>

      {/* Breadcrumb Navigation Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: `${spacing.sm}px`,
          backgroundColor: palette.surface,
          padding: `${spacing.xs}px ${spacing.sm}px`,
          borderRadius: `${radii.sm}px`,
          border: `1px solid ${palette.border.subtle}`,
          marginBottom: `${spacing.base}px`,
        }}
      >
        <BreadcrumbNav
          items={breadcrumbItems}
          themeMode={themeMode}
          onNavigateBack={currentFolder ? handleNavigateUp : undefined}
        />

        {/* Current Folder Action Menu */}
        {currentFolder && (
          <div style={{ display: 'flex', gap: `${spacing.xs}px` }}>
            <Button
              size="compact"
              variant="secondary"
              themeMode={themeMode}
              onClick={() => handleToggleArchiveFolder(currentFolder)}
              aria-label={`${currentFolder.archivedAt ? 'Unarchive' : 'Archive'} ${currentFolder.name}`}
            >
              {currentFolder.archivedAt ? '📂 Unarchive' : '📦 Archive'}
            </Button>
            <Button
              size="compact"
              variant="secondary"
              themeMode={themeMode}
              onClick={() => handleOpenRename(currentFolder)}
              aria-label={`Rename ${currentFolder.name}`}
            >
              ✏️ Rename
            </Button>
            <Button
              size="compact"
              variant="secondary"
              themeMode={themeMode}
              onClick={() => handleOpenMove(currentFolder)}
              aria-label={`Move ${currentFolder.name}`}
            >
              🚚 Move
            </Button>
            <Button
              size="compact"
              variant="secondary"
              themeMode={themeMode}
              onClick={() => handleOpenTrash(currentFolder)}
              aria-label={`Trash ${currentFolder.name}`}
            >
              🗑️ Trash
            </Button>
          </div>
        )}
      </div>

      {/* Module Type Filters Bar */}
      <div
        role="toolbar"
        aria-label="Filter library records by type"
        style={{
          display: 'flex',
          gap: `${spacing.xs}px`,
          marginBottom: `${spacing.base}px`,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <span
          style={{
            fontSize: `${typography.webScale.metadata}px`,
            fontWeight: 600,
            color: palette.text.secondary,
            marginRight: `${spacing.xs}px`,
          }}
        >
          View Filter:
        </span>

        {(
          [
            { key: 'all', label: 'All Items' },
            { key: 'notes', label: 'Notes' },
            { key: 'knowledge', label: 'Knowledge' },
            { key: 'files', label: 'Files' },
            { key: 'tasks', label: 'Tasks' },
          ] as const
        ).map((filter) => (
          <button
            key={filter.key}
            type="button"
            aria-pressed={typeFilter === filter.key}
            onClick={() => {
              setTypeFilter(filter.key);
              setPage(1);
              announce(`Filtered view by ${filter.label}`);
            }}
            style={{
              padding: '6px 14px',
              borderRadius: `${radii.pill}px`,
              border: `1px solid ${
                typeFilter === filter.key ? palette.action.primary : palette.border.subtle
              }`,
              backgroundColor: typeFilter === filter.key ? palette.surfaceRaised : palette.surface,
              color: typeFilter === filter.key ? palette.action.primary : palette.text.primary,
              fontWeight: typeFilter === filter.key ? 700 : 500,
              fontSize: '13px',
              cursor: 'pointer',
              minHeight: `${touchTargets.webMin}px`,
              display: 'inline-flex',
              alignItems: 'center',
            }}
          >
            {filter.label}
          </button>
        ))}

        {/* Toggle Archive */}
        <label
          style={{
            marginLeft: 'auto',
            display: 'inline-flex',
            alignItems: 'center',
            gap: `${spacing.xs}px`,
            fontSize: `${typography.webScale.metadata}px`,
            color: palette.text.secondary,
            cursor: 'pointer',
            userSelect: 'none',
          }}
        >
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => {
              setShowArchived(e.target.checked);
              announce(e.target.checked ? 'Showing archived records' : 'Hiding archived records');
            }}
          />
          Show Archived
        </label>
      </div>

      {/* Main Grid: Subfolders and Mixed Items */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: `${spacing.base}px`,
        }}
      >
        {/* Left Column: Folders in current context */}
        <Card themeMode={themeMode}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: `${spacing.sm}px`,
            }}
          >
            <h2
              style={{
                margin: 0,
                fontSize: `${typography.webScale.sectionHeading}px`,
                color: palette.text.primary,
              }}
            >
              {currentFolder ? `Subfolders in ${currentFolder.name}` : 'Workspace Folders'}
            </h2>
            <Button
              size="compact"
              variant="secondary"
              themeMode={themeMode}
              onClick={() => handleOpenCreateModal(currentFolderId)}
              aria-label="Add folder to current level"
            >
              ＋ New
            </Button>
          </div>

          {currentSubfolders.length === 0 ? (
            <div
              style={{
                padding: `${spacing.base}px`,
                textAlign: 'center',
                color: palette.text.secondary,
                fontSize: `${typography.webScale.metadata}px`,
              }}
            >
              No subfolders in this location.
            </div>
          ) : (
            <div
              role="list"
              aria-label="Subfolder list"
              style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.xs}px` }}
            >
              {currentSubfolders.map((folder, index) => {
                const count = folderCounts[folder.id] ?? 0;
                return (
                  <div
                    key={folder.id}
                    tabIndex={0}
                    role="listitem"
                    onKeyDown={(e) => handleFolderKeyDown(e, folder.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: `${spacing.xs}px ${spacing.sm}px`,
                      borderRadius: `${radii.sm}px`,
                      backgroundColor: palette.surfaceRaised,
                      border: `1px solid ${palette.border.subtle}`,
                      minHeight: `${touchTargets.webMin}px`,
                      gap: `${spacing.xs}px`,
                      transition: 'background-color 0.15s ease',
                    }}
                  >
                    {/* Clickable folder name & icon */}
                    <button
                      type="button"
                      onClick={() => {
                        setCurrentFolderId(folder.id);
                        setPage(1);
                        announce(`Opened folder ${folder.name}`);
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        gap: `${spacing.xs}px`,
                        flex: 1,
                        cursor: 'pointer',
                        textAlign: 'left',
                        padding: 0,
                        color: palette.text.primary,
                        fontWeight: 600,
                        fontSize: `${typography.webScale.body}px`,
                        maxWidth: 'calc(100% - 130px)',
                        overflow: 'hidden',
                      }}
                      title={`Open ${folder.name}`}
                    >
                      <span aria-hidden="true">{folder.icon ?? '📁'}</span>
                      <span
                        style={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {folder.name}
                      </span>
                    </button>

                    {/* Count badge */}
                    <span
                      style={{
                        fontSize: '11px',
                        color: palette.text.secondary,
                        backgroundColor: palette.surface,
                        padding: '2px 6px',
                        borderRadius: `${radii.pill}px`,
                        border: `1px solid ${palette.border.subtle}`,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {count} items
                    </span>

                    {/* Accessible Reorder & Actions */}
                    <div style={{ display: 'flex', gap: '2px', alignItems: 'center' }}>
                      <button
                        type="button"
                        disabled={index === 0}
                        onClick={() => handleReorderFolder(folder.id, 'up')}
                        aria-label={`Move ${folder.name} up (or press Alt+Up)`}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: index === 0 ? palette.text.muted : palette.action.primary,
                          cursor: index === 0 ? 'default' : 'pointer',
                          padding: '4px',
                          fontSize: '12px',
                          borderRadius: radii.sm,
                        }}
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        disabled={index === currentSubfolders.length - 1}
                        onClick={() => handleReorderFolder(folder.id, 'down')}
                        aria-label={`Move ${folder.name} down (or press Alt+Down)`}
                        style={{
                          background: 'none',
                          border: 'none',
                          color:
                            index === currentSubfolders.length - 1
                              ? palette.text.muted
                              : palette.action.primary,
                          cursor: index === currentSubfolders.length - 1 ? 'default' : 'pointer',
                          padding: '4px',
                          fontSize: '12px',
                          borderRadius: radii.sm,
                        }}
                      >
                        ▼
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenRename(folder)}
                        aria-label={`Rename ${folder.name}`}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: palette.text.secondary,
                          cursor: 'pointer',
                          padding: '4px',
                          fontSize: '13px',
                        }}
                      >
                        ✏️
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Right Column: Mixed Items in current folder */}
        <Card themeMode={themeMode}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: `${spacing.sm}px`,
            }}
          >
            <div>
              <h2
                style={{
                  margin: 0,
                  fontSize: `${typography.webScale.sectionHeading}px`,
                  color: palette.text.primary,
                }}
              >
                {currentFolder ? currentFolder.name : 'Inbox / Top-level Records'}
              </h2>
              <span style={{ fontSize: '12px', color: palette.text.secondary }}>
                {totalItems} matching {typeFilter !== 'all' ? typeFilter : ''} records
              </span>
            </div>

            {/* Item search */}
            <input
              type="search"
              placeholder="Search items..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              aria-label="Search items in current folder"
              style={{
                padding: '4px 8px',
                borderRadius: `${radii.sm}px`,
                border: `1px solid ${palette.border.subtle}`,
                backgroundColor: palette.surface,
                color: palette.text.primary,
                fontSize: '13px',
                maxWidth: '140px',
              }}
            />
          </div>

          {currentItems.length === 0 ? (
            <EmptyState
              title={`No ${typeFilter !== 'all' ? typeFilter : ''} records found`}
              description={
                currentFolder
                  ? `This folder has no matching items. Add notes, tasks, or documents to organize them.`
                  : `Your Inbox is clear. Unfiled items and top-level records will appear here.`
              }
              actionLabel="＋ Add Record"
              onAction={() => openModal('create')}
              themeMode={themeMode}
            />
          ) : (
            <>
              <div
                role="list"
                aria-label={`Items in ${currentFolder ? currentFolder.name : 'Inbox'}`}
                style={{ display: 'flex', flexDirection: 'column' }}
              >
                {paginatedItems.map((item) => (
                  <div
                    key={item.id}
                    role="listitem"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      minHeight: `${touchTargets.webMin}px`,
                      padding: `${spacing.sm}px 0`,
                      borderBottom: `1px solid ${palette.border.subtle}`,
                      gap: `${spacing.sm}px`,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: `${typography.webScale.body}px`,
                          fontWeight: 600,
                          color: palette.text.primary,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={item.title}
                      >
                        {item.title}
                      </div>
                      <div
                        style={{
                          fontSize: `${typography.webScale.metadata}px`,
                          color: palette.text.secondary,
                          marginTop: '2px',
                        }}
                      >
                        {item.metadata ?? (item.ext ? `File (${item.ext})` : 'Note')}
                      </div>
                    </div>

                    {/* Semantic Type Badge */}
                    <ItemTypeBadge kind={item.kind} themeMode={themeMode} />
                  </div>
                ))}
              </div>

              {/* Bounded Pagination Controls */}
              {totalPages > 1 && (
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginTop: `${spacing.base}px`,
                    paddingTop: `${spacing.xs}px`,
                    borderTop: `1px solid ${palette.border.subtle}`,
                  }}
                >
                  <span style={{ fontSize: '12px', color: palette.text.secondary }}>
                    Showing {(page - 1) * ITEMS_PER_PAGE + 1}–
                    {Math.min(page * ITEMS_PER_PAGE, totalItems)} of {totalItems}
                  </span>
                  <div style={{ display: 'flex', gap: `${spacing.xs}px` }}>
                    <Button
                      size="compact"
                      variant="secondary"
                      themeMode={themeMode}
                      disabled={page === 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      aria-label="Previous page of items"
                    >
                      &larr; Prev
                    </Button>
                    <Button
                      size="compact"
                      variant="secondary"
                      themeMode={themeMode}
                      disabled={page === totalPages}
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      aria-label="Next page of items"
                    >
                      Next &rarr;
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </Card>
      </div>

      {/* Reversible Undo Toast Floating Bar */}
      {undoToast && (
        <div
          role="alert"
          style={{
            position: 'fixed',
            bottom: `${spacing.xl}px`,
            right: `${spacing.xl}px`,
            backgroundColor: palette.text.primary,
            color: palette.surface,
            padding: `${spacing.sm}px ${spacing.base}px`,
            borderRadius: `${radii.sm}px`,
            display: 'flex',
            alignItems: 'center',
            gap: `${spacing.base}px`,
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
            zIndex: 1000,
          }}
        >
          <span>{undoToast.message}</span>
          <button
            type="button"
            onClick={undoToast.onUndo}
            style={{
              background: palette.action.primary,
              color: '#ffffff',
              border: 'none',
              borderRadius: `${radii.sm}px`,
              padding: '4px 12px',
              fontWeight: 700,
              cursor: 'pointer',
              fontSize: '13px',
            }}
          >
            Undo
          </button>
        </div>
      )}

      {/* Modal: Create Folder */}
      <Dialog
        isOpen={isCreateModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title="Create Workspace Folder"
        description="Folders can contain notes, guides, and files together in one canonical hierarchy."
        themeMode={themeMode}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.base}px` }}>
          {createError && (
            <Feedback severity="danger" message={createError} themeMode={themeMode} />
          )}

          <TextField
            id="create-folder-name"
            label="Folder Name"
            placeholder="e.g. Finance or Personal Projects"
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
            themeMode={themeMode}
            autoFocus
          />

          {/* Parent selection */}
          <div>
            <label
              htmlFor="create-parent-select"
              style={{
                display: 'block',
                fontSize: `${typography.webScale.metadata}px`,
                fontWeight: 600,
                color: palette.text.secondary,
                marginBottom: '4px',
              }}
            >
              Parent Folder
            </label>
            <select
              id="create-parent-select"
              value={createParentId ?? ''}
              onChange={(e) => setCreateParentId(e.target.value ? e.target.value : null)}
              style={{
                width: '100%',
                padding: '8px',
                borderRadius: `${radii.sm}px`,
                border: `1px solid ${palette.border.subtle}`,
                backgroundColor: palette.surface,
                color: palette.text.primary,
                fontSize: '14px',
              }}
            >
              <option value="">(Workspace Root)</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.icon ?? '📁'} {f.name}
                </option>
              ))}
            </select>
          </div>

          {/* Icon picker */}
          <div>
            <label
              style={{
                display: 'block',
                fontSize: `${typography.webScale.metadata}px`,
                fontWeight: 600,
                color: palette.text.secondary,
                marginBottom: '4px',
              }}
            >
              Folder Icon
            </label>
            <div style={{ display: 'flex', gap: `${spacing.xs}px` }}>
              {['📁', '💼', '🔬', '📚', '🏛️', '📝', '🌱', '🎓'].map((icon) => (
                <button
                  key={icon}
                  type="button"
                  onClick={() => setCreateIcon(icon)}
                  style={{
                    fontSize: '18px',
                    padding: '6px 10px',
                    borderRadius: `${radii.sm}px`,
                    border: `1px solid ${createIcon === icon ? palette.action.primary : palette.border.subtle}`,
                    background: createIcon === icon ? palette.surfaceRaised : palette.surface,
                    cursor: 'pointer',
                  }}
                >
                  {icon}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: `${spacing.sm}px` }}>
            <Button
              variant="secondary"
              themeMode={themeMode}
              onClick={() => setCreateModalOpen(false)}
            >
              Cancel
            </Button>
            <Button variant="primary" themeMode={themeMode} onClick={handleConfirmCreate}>
              Create Folder
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Modal: Rename Folder */}
      <Dialog
        isOpen={Boolean(renameModalFolder)}
        onClose={() => setRenameModalFolder(null)}
        title="Rename Folder"
        description="Preserves all contained items, rankings, and subfolder hierarchies."
        themeMode={themeMode}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.base}px` }}>
          {renameError && (
            <Feedback severity="danger" message={renameError} themeMode={themeMode} />
          )}

          <TextField
            id="rename-folder-input"
            label="Folder Name"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            themeMode={themeMode}
            autoFocus
          />

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: `${spacing.sm}px` }}>
            <Button
              variant="secondary"
              themeMode={themeMode}
              onClick={() => setRenameModalFolder(null)}
            >
              Cancel
            </Button>
            <Button variant="primary" themeMode={themeMode} onClick={handleConfirmRename}>
              Save Rename
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Modal: Move Folder */}
      <Dialog
        isOpen={Boolean(moveModalFolder)}
        onClose={() => setMoveModalFolder(null)}
        title="Move Folder"
        description="Reparent folder hierarchy. Validates cycle prevention and depth bounds."
        themeMode={themeMode}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.base}px` }}>
          {moveError && <Feedback severity="danger" message={moveError} themeMode={themeMode} />}

          <p style={{ margin: 0, fontSize: '14px', color: palette.text.primary }}>
            Moving <strong>{moveModalFolder?.name}</strong> to:
          </p>

          <select
            value={moveTargetParentId ?? ''}
            onChange={(e) => setMoveTargetParentId(e.target.value ? e.target.value : null)}
            style={{
              width: '100%',
              padding: '8px',
              borderRadius: `${radii.sm}px`,
              border: `1px solid ${palette.border.subtle}`,
              backgroundColor: palette.surface,
              color: palette.text.primary,
              fontSize: '14px',
            }}
          >
            <option value="">(Workspace Root)</option>
            {folders
              .filter((f) => f.id !== moveModalFolder?.id)
              .map((f) => (
                <option key={f.id} value={f.id}>
                  {f.icon ?? '📁'} {f.name}
                </option>
              ))}
          </select>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: `${spacing.sm}px` }}>
            <Button
              variant="secondary"
              themeMode={themeMode}
              onClick={() => setMoveModalFolder(null)}
            >
              Cancel
            </Button>
            <Button variant="primary" themeMode={themeMode} onClick={handleConfirmMove}>
              Confirm Move
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Modal: Trash Folder */}
      <Dialog
        isOpen={Boolean(trashModalFolder)}
        onClose={() => setTrashModalFolder(null)}
        title={`Trash Folder "${trashModalFolder?.name}"`}
        description="Choose how to handle contained subfolders and items."
        themeMode={themeMode}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.base}px` }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.sm}px` }}>
            <label
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: `${spacing.xs}px`,
                cursor: 'pointer',
                fontSize: '14px',
                color: palette.text.primary,
              }}
            >
              <input
                type="radio"
                name="trash-mode"
                checked={trashMode === 'trash_subtree'}
                onChange={() => setTrashMode('trash_subtree')}
                style={{ marginTop: '2px' }}
              />
              <div>
                <strong>Trash Subtree:</strong> Trash this folder and all its contents together.
              </div>
            </label>

            <label
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: `${spacing.xs}px`,
                cursor: 'pointer',
                fontSize: '14px',
                color: palette.text.primary,
              }}
            >
              <input
                type="radio"
                name="trash-mode"
                checked={trashMode === 'preserve_to_parent'}
                onChange={() => setTrashMode('preserve_to_parent')}
                style={{ marginTop: '2px' }}
              />
              <div>
                <strong>Preserve to Parent:</strong> Move all subfolders and items to parent before
                trashing this folder.
              </div>
            </label>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: `${spacing.sm}px` }}>
            <Button
              variant="secondary"
              themeMode={themeMode}
              onClick={() => setTrashModalFolder(null)}
            >
              Cancel
            </Button>
            <Button variant="primary" themeMode={themeMode} onClick={handleConfirmTrash}>
              Trash Folder
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
