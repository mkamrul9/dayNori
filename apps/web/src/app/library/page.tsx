'use client';

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { colors, radii, spacing, touchTargets, typography } from '@daynori/design-tokens';
import {
  BreadcrumbNav,
  Button,
  Dialog,
  EmptyState,
  Feedback,
  ItemTypeBadge,
  TextField,
  NoteEditor,
  StorageUsageBar,
  FileUploadDialog,
  FilePreviewDialog,
  QuickReferenceView,
  type BreadcrumbItem,
  type FileItemRecord,
  type UploadExecutionResult,
} from '@daynori/ui-web';
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
  type NotePurpose,
  type KnowledgeSavedViewFilter,
  type SavedView,
  type ResolvedItemLink,
} from '@daynori/domain';
import type { DaynoriApiClient } from '@daynori/api-client';
import type { ItemHeaderRecord, SyncEngine, FileRecord } from '@daynori/sync';
import { useShell } from '../../components/ShellContext';
import { useAuth } from '../../components/AuthContext';
import { createWebApiClient } from '../../data/webApiClient';
import { getTrustedDeviceConsent, IndexedDbLocalRepository } from '../../data/indexedDbRepository';
import { createWebSyncEngine } from '../../data/syncAdapter';
import { OfflineFileCache, computeBufferSha256 } from '../../data/offlineFileCache';

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
  purpose?: NotePurpose;
  tags?: string[];
  isPinned?: boolean;
  isArchived?: boolean;
  plainText?: string;
  createdAt?: string;
  updatedAt?: string;
}

export type LibraryTypeFilter = 'all' | 'notes' | 'knowledge' | 'files' | 'tasks';

const ITEMS_PER_PAGE = 10;

export default function LibraryPage() {
  const liveRegionId = useId();
  const { themeMode } = useShell();
  const palette = colors[themeMode];
  const { workspaceId, user, csrfToken } = useAuth();

  // Core Data State - Workspaces start empty by default
  const [folders, setFolders] = useState<FolderNode[]>([]);
  const [items, setItems] = useState<LibraryItemRecord[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null); // null = Root / Inbox
  const [typeFilter, setTypeFilter] = useState<LibraryTypeFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [page, setPage] = useState(1);

  // Status & Sync Indicators
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [hasConsent, setHasConsent] = useState<boolean>(false);
  const [localSaveStatus, setLocalSaveStatus] = useState<string>('Checking storage...');
  const [cloudSyncStatus, setCloudSyncStatus] = useState<string>('Checking sync...');
  const [conflictMessage, setConflictMessage] = useState<string | null>(null);
  const [liveAnnouncement, setLiveAnnouncement] = useState('');
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Active Note Editor State
  const [editingNote, setEditingNote] = useState<{
    id: string;
    title: string;
    folderId: string | null;
    document?: NoteDocument;
    isNew: boolean;
    kind?: 'note' | 'knowledge';
    purpose?: NotePurpose;
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
  const [isSaveViewDialogOpen, setIsSaveViewDialogOpen] = useState(false);
  const [newViewName, setNewViewName] = useState('');

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

  // Storage Quota & File State
  const [storageUsage, setStorageUsage] = useState<{
    storedBytes: number;
    reservedBytes: number;
    maxBytes: number;
  }>({
    storedBytes: 0,
    reservedBytes: 0,
    maxBytes: 52428800,
  });
  const [filesMap, setFilesMap] = useState<Record<string, FileRecord>>({});
  const [isFileUploadOpen, setFileUploadOpen] = useState(false);
  const [activePreviewFile, setActivePreviewFile] = useState<FileItemRecord | null>(null);

  // Reversible Undo Toast State
  const [undoToast, setUndoToast] = useState<{
    id: string;
    message: string;
    onUndo: () => void;
    expiresAt: number;
  } | null>(null);

  // Active sync engine & local repository references
  const syncEngineRef = useRef<SyncEngine | null>(null);
  const localRepoRef = useRef<IndexedDbLocalRepository | null>(null);
  const apiClientRef = useRef<DaynoriApiClient | null>(null);
  const localBlobUrlsRef = useRef<Set<string>>(new Set());

  // Clean up object URLs on workspace change or unmount
  useEffect(() => {
    return () => {
      for (const url of localBlobUrlsRef.current) {
        URL.revokeObjectURL(url);
      }
      localBlobUrlsRef.current.clear();
    };
  }, [workspaceId]);

  // Announce to screen readers
  const announce = useCallback((msg: string) => {
    setLiveAnnouncement(msg);
  }, []);

  // Online / Offline listeners
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      if (syncEngineRef.current) {
        syncEngineRef.current.setNetworkStatus('online');
      } else {
        setCloudSyncStatus('Synced');
      }
      announce('Network connected. Changes syncing.');
    };
    const handleOffline = () => {
      setIsOnline(false);
      if (syncEngineRef.current) {
        syncEngineRef.current.setNetworkStatus('offline');
      } else {
        setCloudSyncStatus('Offline');
      }
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

  // Initialize API client & Local Storage / SyncEngine
  useEffect(() => {
    let isCancelled = false;

    // Reset view state when account/workspace changes to prevent cross-account exposure
    setFolders([]);
    setItems([]);
    setCurrentFolderId(null);
    setPage(1);

    // Stop prior sync engine & close prior repository
    if (syncEngineRef.current) {
      void syncEngineRef.current.stop();
      syncEngineRef.current = null;
    }
    if (localRepoRef.current) {
      void localRepoRef.current.close();
      localRepoRef.current = null;
    }

    if (!workspaceId || !user) {
      setLocalSaveStatus('Signed out');
      setCloudSyncStatus('Not connected');
      setIsLoading(false);
      return;
    }

    const consent = getTrustedDeviceConsent();
    setHasConsent(consent);

    const client = createWebApiClient({ csrfToken });
    apiClientRef.current = client;

    async function initStorageAndSync() {
      setIsLoading(true);
      if (consent) {
        try {
          const repo = new IndexedDbLocalRepository();
          await repo.initialize({ userId: user!.id, workspaceId: workspaceId! });
          if (isCancelled) {
            await repo.close();
            return;
          }
          localRepoRef.current = repo;
          setLocalSaveStatus('Saved on device');

          // Initialize sync engine
          const engine = createWebSyncEngine({
            repository: repo,
            apiClient: client,
            namespace: { userId: user!.id, workspaceId: workspaceId! },
          });
          syncEngineRef.current = engine;

          // Subscribe to sync events
          engine.onEvent((evt) => {
            if (isCancelled) return;
            if (evt.type === 'state_changed') {
              switch (evt.status) {
                case 'synced':
                  setCloudSyncStatus('Synced');
                  break;
                case 'syncing':
                  setCloudSyncStatus('Syncing changes...');
                  break;
                case 'saved_locally':
                  setCloudSyncStatus('Offline — saved locally');
                  break;
                case 'conflict':
                  setCloudSyncStatus('Conflict detected');
                  break;
                case 'error':
                  setCloudSyncStatus('Sync error');
                  break;
                default:
                  setCloudSyncStatus('Synced');
              }
            } else if (evt.type === 'conflict_detected') {
              setConflictMessage(evt.conflict.conflictReason);
            } else if (evt.type === 'conflict_resolved') {
              setConflictMessage(null);
            }
          });

          await engine.start();

          // Load local records
          const headers = await repo.listItemHeaders(workspaceId!);
          if (!isCancelled) {
            const loadedFolders: FolderNode[] = [];
            const loadedItems: LibraryItemRecord[] = [];

            for (const h of headers) {
              if (h.deletedAt && !showArchived) continue;

              if (h.kind === 'folder') {
                loadedFolders.push({
                  id: h.id,
                  name: h.name ?? 'Untitled Folder',
                  parentId: h.parentId ?? h.folderId ?? null,
                  color: h.color ?? null,
                  icon: h.icon ?? '📁',
                  rank: h.rank ?? '00001000',
                  scope: h.securityScope === 'vault' ? 'private' : 'workspace',
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
                  scope: h.securityScope === 'vault' ? 'private' : 'workspace',
                  revision: h.serverRevision,
                  archivedAt: h.isArchived ? h.updatedAt : null,
                  trashedAt: h.deletedAt ?? null,
                  purpose: h.purpose,
                  isPinned: h.isPinned,
                  isArchived: h.isArchived,
                  tags: h.tags,
                  createdAt: h.createdAt,
                  updatedAt: h.updatedAt,
                });
              }
            }

            // Load files from local repo
            try {
              const localFiles = await repo.listFiles(workspaceId!);
              const fMap: Record<string, FileRecord> = {};
              for (const f of localFiles) {
                fMap[f.id] = f;
                if (!loadedItems.some((i) => i.id === f.id)) {
                  loadedItems.push({
                    id: f.id,
                    title: f.fileName,
                    kind: 'file',
                    folderId: f.folderId ?? null,
                    rank: '00001000',
                    scope: 'workspace',
                    revision: Number(f.version) || 1,
                    metadata: `${formatByteSize(f.byteSize)} • ${f.quarantineStatus}`,
                  });
                }
              }
              setFilesMap(fMap);
            } catch {
              /* ignore */
            }

            // Fetch storage usage
            try {
              const usageRes = await client.getWorkspaceStorageQuota(workspaceId!);
              if (usageRes.data && !isCancelled) {
                setStorageUsage({
                  storedBytes: usageRes.data.storedBytes,
                  reservedBytes: usageRes.data.reservedBytes,
                  maxBytes: usageRes.data.maxStorageBytes,
                });
              }
            } catch {
              /* ignore */
            }

            // Fetch saved views
            try {
              const svRes = await client.listSavedViews(workspaceId!);
              if (svRes.data && !isCancelled) {
                setSavedViews(svRes.data);
              }
            } catch {
              /* ignore */
            }

            setFolders(loadedFolders);
            setItems(loadedItems);
            setCloudSyncStatus('Synced');
          }
        } catch {
          if (!isCancelled) {
            setLocalSaveStatus('Local storage failed');
            setCloudSyncStatus('Error connecting local storage');
          }
        }
      } else {
        // Honest indication: consent not granted
        setLocalSaveStatus('Device storage off (consent needed)');
        setCloudSyncStatus('Connecting cloud...');

        // Fetch folders directly from API
        try {
          const res = await client.listFolders(workspaceId!);
          if (!isCancelled && res.data) {
            const loaded: FolderNode[] = res.data.map((f) => ({
              id: f.id,
              name: f.name,
              parentId: f.parentId,
              color: f.color ?? null,
              icon: f.icon ?? '📁',
              rank: f.rank,
              scope: f.securityScope === 'vault' ? 'private' : 'workspace',
              revision: f.revision,
              archivedAt: f.isArchived ? f.updatedAt : null,
              trashedAt: f.deletedAt ?? null,
            }));
            setFolders(loaded);
            setCloudSyncStatus('Synced');
          }

          const usageRes = await client.getWorkspaceStorageQuota(workspaceId!);
          if (usageRes.data && !isCancelled) {
            setStorageUsage({
              storedBytes: usageRes.data.storedBytes,
              reservedBytes: usageRes.data.reservedBytes,
              maxBytes: usageRes.data.maxStorageBytes,
            });
          }

          const itemsRes = await client.listItems(workspaceId!);
          if (itemsRes.data && !isCancelled) {
            const loadedFiles: LibraryItemRecord[] = itemsRes.data
              .filter((it) => it.kind === 'file')
              .map((it) => ({
                id: it.id,
                title: it.name || 'Untitled File',
                kind: 'file',
                folderId: it.parentId ?? null,
                rank: it.rank,
                scope: 'workspace',
                revision: it.revision,
                metadata: 'File item',
              }));
            setItems((prev) => [...prev, ...loadedFiles]);
          }

          try {
            const svRes = await client.listSavedViews(workspaceId!);
            if (svRes.data && !isCancelled) {
              setSavedViews(svRes.data);
            }
          } catch {
            /* ignore */
          }
        } catch {
          if (!isCancelled) {
            setCloudSyncStatus('Cloud connection offline');
          }
        }
      }
      if (!isCancelled) {
        setIsLoading(false);
      }
    }

    void initStorageAndSync();

    return () => {
      isCancelled = true;
      if (syncEngineRef.current) {
        void syncEngineRef.current.stop();
        syncEngineRef.current = null;
      }
      if (localRepoRef.current) {
        void localRepoRef.current.close();
        localRepoRef.current = null;
      }
    };
  }, [workspaceId, user]);

  // Maps for hierarchy calculations
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
          announce(`Navigated to ${node.name}`);
        },
      });
    }

    return trail;
  }, [folders, currentFolderId, announce]);

  // Subfolders in current view
  const currentSubfolders = useMemo(() => {
    return folders
      .filter((f) => {
        if (f.trashedAt) return false;
        if (!showArchived && f.archivedAt) return false;
        return f.parentId === currentFolderId;
      })
      .sort((a, b) => compareRanks(a.rank, a.id, b.rank, b.id));
  }, [folders, currentFolderId, showArchived]);

  // Items in current view (filtered by type, search, or active saved view)
  const currentItems = useMemo(() => {
    const activeView = activeSavedViewId
      ? savedViews.find((v) => v.id === activeSavedViewId)
      : null;

    const filtered = items.filter((item) => {
      if (item.trashedAt) return false;
      if (!showArchived && item.archivedAt) return false;

      if (activeView) {
        return matchesKnowledgeFilter(
          {
            title: item.title,
            kind: item.kind,
            folderId: item.folderId,
            isPinned: Boolean(item.isPinned),
            isArchived: Boolean(item.isArchived || item.archivedAt),
            purpose: item.purpose,
            tags: item.tags,
            plainText: item.plainText,
          },
          activeView.filter,
          folderMap
        );
      }

      if (item.folderId !== currentFolderId) return false;

      // Module filter matching
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
    });

    if (activeView?.filter.sortBy) {
      return sortKnowledgeItems(filtered, activeView.filter.sortBy, activeView.filter.sortOrder);
    }

    return filtered.sort((a, b) => compareRanks(a.rank, a.id, b.rank, b.id));
  }, [
    items,
    currentFolderId,
    typeFilter,
    searchQuery,
    showArchived,
    activeSavedViewId,
    savedViews,
  ]);

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

  const handleConfirmCreate = async () => {
    const trimmed = createName.trim();
    if (!trimmed) {
      setCreateError('Please enter a folder name.');
      return;
    }
    if (trimmed.length > 100) {
      setCreateError('Folder name must be 100 characters or fewer.');
      return;
    }

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

    const siblings = folders.filter((f) => f.parentId === createParentId && !f.trashedAt);
    const newRank = generateInitialRank(siblings.length);
    const newId = generateUuid();
    const now = new Date().toISOString();

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

    const header: ItemHeaderRecord = {
      id: newId,
      workspaceId: workspaceId || 'ws-local',
      kind: 'folder',
      name: trimmed,
      parentId: createParentId,
      folderId: createParentId,
      color: createColor,
      icon: createIcon,
      rank: newRank,
      securityScope: 'standard',
      isArchived: false,
      isPinned: false,
      serverRevision: 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };

    setFolders((prev) => [...prev, newFolder]);
    setCreateModalOpen(false);
    announce(`Created folder ${trimmed}`);

    // Persist via SyncEngine or API Client
    try {
      if (syncEngineRef.current) {
        await syncEngineRef.current.saveItem(header, undefined, 'createFolder');
        setLocalSaveStatus('Saved on device');
        if (isOnline) {
          setCloudSyncStatus('Syncing...');
          await syncEngineRef.current.syncNow();
          setCloudSyncStatus('Synced');
        }
      } else if (apiClientRef.current && workspaceId) {
        setCloudSyncStatus('Syncing...');
        await apiClientRef.current.createFolder(
          workspaceId,
          {
            id: newId,
            name: trimmed,
            parentId: createParentId,
            color: createColor,
            icon: createIcon,
            rank: newRank,
            securityScope: 'standard',
          },
          { headers: { 'x-operation-id': generateUuid() } }
        );
        setCloudSyncStatus('Synced');
      }
    } catch {
      setCloudSyncStatus('Sync failed');
    }
  };

  // Action: Rename Folder
  const handleOpenRename = (folder: FolderNode) => {
    setRenameModalFolder(folder);
    setRenameValue(folder.name);
    setRenameError(null);
  };

  const handleConfirmRename = async () => {
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
    const prevRevision = renameModalFolder.revision;

    setFolders((prev) =>
      prev.map((f) => (f.id === folderId ? { ...f, name: trimmed, revision: f.revision + 1 } : f))
    );
    setRenameModalFolder(null);
    announce(`Renamed folder ${originalName} to ${trimmed}`);

    const header: ItemHeaderRecord = {
      id: folderId,
      workspaceId: workspaceId || 'ws-local',
      kind: 'folder',
      name: trimmed,
      parentId: renameModalFolder.parentId,
      folderId: renameModalFolder.parentId,
      color: renameModalFolder.color,
      icon: renameModalFolder.icon,
      rank: renameModalFolder.rank,
      securityScope: renameModalFolder.scope === 'private' ? 'vault' : 'standard',
      isArchived: Boolean(renameModalFolder.archivedAt),
      isPinned: false,
      serverRevision: prevRevision,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    };

    try {
      if (syncEngineRef.current) {
        await syncEngineRef.current.saveItem(header, undefined, 'updateFolder', {
          payload: { name: trimmed },
        });
        if (isOnline) {
          await syncEngineRef.current.syncNow();
        }
      } else if (apiClientRef.current && workspaceId) {
        await apiClientRef.current.updateFolder(
          workspaceId,
          folderId,
          { name: trimmed, baseRevision: prevRevision },
          { headers: { 'x-operation-id': generateUuid() } }
        );
      }
    } catch {
      setCloudSyncStatus('Sync failed');
    }

    // Reversible Undo Toast
    setUndoToast({
      id: `rename-${folderId}`,
      message: `Renamed to '${trimmed}'`,
      expiresAt: Date.now() + 10000,
      onUndo: async () => {
        setFolders((prev) =>
          prev.map((f) =>
            f.id === folderId ? { ...f, name: originalName, revision: f.revision + 1 } : f
          )
        );
        announce(`Undid rename, reverted to '${originalName}'`);
        setUndoToast(null);

        const revertHeader: ItemHeaderRecord = {
          ...header,
          name: originalName,
          serverRevision: prevRevision + 1,
        };
        if (syncEngineRef.current) {
          await syncEngineRef.current.saveItem(revertHeader, undefined, 'updateFolder', {
            payload: { name: originalName },
          });
          if (isOnline) void syncEngineRef.current.syncNow();
        } else if (apiClientRef.current && workspaceId) {
          void apiClientRef.current.updateFolder(
            workspaceId,
            folderId,
            { name: originalName, baseRevision: prevRevision + 1 },
            { headers: { 'x-operation-id': generateUuid() } }
          );
        }
      },
    });
  };

  // Action: Move Folder
  const handleOpenMove = (folder: FolderNode) => {
    setMoveModalFolder(folder);
    setMoveTargetParentId(folder.parentId);
    setMoveError(null);
  };

  const handleConfirmMove = async () => {
    if (!moveModalFolder) return;
    const folderId = moveModalFolder.id;
    const originalParentId = moveModalFolder.parentId;

    if (moveTargetParentId === folderId) {
      setMoveError('A folder cannot be moved into itself.');
      return;
    }

    if (detectCycle(folderId, moveTargetParentId, folderMap)) {
      setMoveError('A folder cannot be moved under its own descendant.');
      return;
    }

    try {
      const targetDepth = calculateFolderDepth(moveTargetParentId, folderMap);
      const childrenMap = new Map<string, string[]>();
      for (const f of folders) {
        if (f.parentId) {
          const list = childrenMap.get(f.parentId) || [];
          list.push(f.id);
          childrenMap.set(f.parentId, list);
        }
      }
      const subtreeDepth = calculateSubtreeDepth(folderId, childrenMap);
      if (targetDepth + subtreeDepth > MAX_FOLDER_DEPTH) {
        setMoveError(
          `Moving this folder would exceed the maximum depth limit of ${MAX_FOLDER_DEPTH}.`
        );
        return;
      }
    } catch (e: unknown) {
      setMoveError(e instanceof Error ? e.message : 'Invalid move destination.');
      return;
    }

    const prevRevision = moveModalFolder.revision;
    setFolders((prev) =>
      prev.map((f) =>
        f.id === folderId ? { ...f, parentId: moveTargetParentId, revision: f.revision + 1 } : f
      )
    );
    setMoveModalFolder(null);

    const targetName = moveTargetParentId
      ? (folders.find((f) => f.id === moveTargetParentId)?.name ?? 'target folder')
      : 'Workspace root';
    announce(`Moved folder ${moveModalFolder.name} to ${targetName}`);

    const header: ItemHeaderRecord = {
      id: folderId,
      workspaceId: workspaceId || 'ws-local',
      kind: 'folder',
      name: moveModalFolder.name,
      parentId: moveTargetParentId,
      folderId: moveTargetParentId,
      color: moveModalFolder.color,
      icon: moveModalFolder.icon,
      rank: moveModalFolder.rank,
      securityScope: moveModalFolder.scope === 'private' ? 'vault' : 'standard',
      isArchived: Boolean(moveModalFolder.archivedAt),
      isPinned: false,
      serverRevision: prevRevision,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    };

    try {
      if (syncEngineRef.current) {
        await syncEngineRef.current.saveItem(header, undefined, 'moveFolder', {
          payload: { targetParentId: moveTargetParentId },
        });
        if (isOnline) void syncEngineRef.current.syncNow();
      } else if (apiClientRef.current && workspaceId) {
        await apiClientRef.current.moveFolder(
          workspaceId,
          folderId,
          { targetParentId: moveTargetParentId, baseRevision: prevRevision },
          { headers: { 'x-operation-id': generateUuid() } }
        );
      }
    } catch {
      setCloudSyncStatus('Sync failed');
    }

    // Reversible Undo Toast
    setUndoToast({
      id: `move-${folderId}`,
      message: `Moved to ${targetName}`,
      expiresAt: Date.now() + 10000,
      onUndo: async () => {
        setFolders((prev) =>
          prev.map((f) =>
            f.id === folderId ? { ...f, parentId: originalParentId, revision: f.revision + 1 } : f
          )
        );
        announce(`Undid move, reverted ${moveModalFolder.name} to prior location`);
        setUndoToast(null);

        const revertHeader: ItemHeaderRecord = {
          ...header,
          parentId: originalParentId,
          folderId: originalParentId,
          serverRevision: prevRevision + 1,
        };
        if (syncEngineRef.current) {
          await syncEngineRef.current.saveItem(revertHeader, undefined, 'moveFolder', {
            payload: { targetParentId: originalParentId },
          });
          if (isOnline) void syncEngineRef.current.syncNow();
        } else if (apiClientRef.current && workspaceId) {
          void apiClientRef.current.moveFolder(
            workspaceId,
            folderId,
            { targetParentId: originalParentId, baseRevision: prevRevision + 1 },
            { headers: { 'x-operation-id': generateUuid() } }
          );
        }
      },
    });
  };

  // Action: Reorder Folder
  const handleReorder = async (folderId: string, direction: 'up' | 'down') => {
    const idx = currentSubfolders.findIndex((f) => f.id === folderId);
    if (idx === -1) return;

    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= currentSubfolders.length) return;

    const target = currentSubfolders[targetIdx];
    if (!target) return;

    const prevRank =
      direction === 'up'
        ? targetIdx === 0
          ? null
          : (currentSubfolders[targetIdx - 1]?.rank ?? null)
        : target.rank;
    const nextRank =
      direction === 'up'
        ? target.rank
        : targetIdx === currentSubfolders.length - 1
          ? null
          : (currentSubfolders[targetIdx + 1]?.rank ?? null);

    const newRank = generateBetweenRanks(prevRank, nextRank);
    const movingFolder = currentSubfolders[idx]!;
    const prevRevision = movingFolder.revision;

    setFolders((prev) =>
      prev.map((f) => (f.id === folderId ? { ...f, rank: newRank, revision: f.revision + 1 } : f))
    );

    announce(
      `Moved ${movingFolder.name} to position ${targetIdx + 1} of ${currentSubfolders.length}`
    );

    const header: ItemHeaderRecord = {
      id: folderId,
      workspaceId: workspaceId || 'ws-local',
      kind: 'folder',
      name: movingFolder.name,
      parentId: movingFolder.parentId,
      folderId: movingFolder.parentId,
      color: movingFolder.color,
      icon: movingFolder.icon,
      rank: newRank,
      securityScope: movingFolder.scope === 'private' ? 'vault' : 'standard',
      isArchived: Boolean(movingFolder.archivedAt),
      isPinned: false,
      serverRevision: prevRevision,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    };

    try {
      if (syncEngineRef.current) {
        await syncEngineRef.current.saveItem(header, undefined, 'reorderFolder', {
          payload: { rank: newRank },
        });
        if (isOnline) void syncEngineRef.current.syncNow();
      } else if (apiClientRef.current && workspaceId) {
        await apiClientRef.current.reorderFolder(
          workspaceId,
          folderId,
          { rank: newRank, baseRevision: prevRevision },
          { headers: { 'x-operation-id': generateUuid() } }
        );
      }
    } catch {
      setCloudSyncStatus('Sync failed');
    }
  };

  // Action: Archive / Unarchive Folder
  const handleToggleArchive = async (folder: FolderNode) => {
    const isNowArchived = !folder.archivedAt;
    const folderId = folder.id;
    const prevRevision = folder.revision;

    setFolders((prev) =>
      prev.map((f) =>
        f.id === folderId
          ? {
              ...f,
              archivedAt: isNowArchived ? new Date().toISOString() : null,
              revision: f.revision + 1,
            }
          : f
      )
    );

    announce(isNowArchived ? `Archived folder ${folder.name}` : `Unarchived folder ${folder.name}`);

    const header: ItemHeaderRecord = {
      id: folderId,
      workspaceId: workspaceId || 'ws-local',
      kind: 'folder',
      name: folder.name,
      parentId: folder.parentId,
      folderId: folder.parentId,
      color: folder.color,
      icon: folder.icon,
      rank: folder.rank,
      securityScope: folder.scope === 'private' ? 'vault' : 'standard',
      isArchived: isNowArchived,
      isPinned: false,
      serverRevision: prevRevision,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    };

    const cmd = isNowArchived ? 'archiveFolder' : 'unarchiveFolder';
    try {
      if (syncEngineRef.current) {
        await syncEngineRef.current.saveItem(header, undefined, cmd);
        if (isOnline) void syncEngineRef.current.syncNow();
      } else if (apiClientRef.current && workspaceId) {
        await apiClientRef.current.archiveFolder(
          workspaceId,
          folderId,
          { isArchived: isNowArchived, baseRevision: prevRevision },
          { headers: { 'x-operation-id': generateUuid() } }
        );
      }
    } catch {
      setCloudSyncStatus('Sync failed');
    }
  };

  // Action: Trash Folder
  const handleOpenTrash = (folder: FolderNode) => {
    setTrashModalFolder(folder);
    setTrashMode('trash_subtree');
  };

  const handleConfirmTrash = async () => {
    if (!trashModalFolder) return;
    const folderId = trashModalFolder.id;
    const prevRevision = trashModalFolder.revision;
    const now = new Date().toISOString();

    const affectedSubtreeIds = new Set<string>();
    const findSubtree = (parentId: string) => {
      affectedSubtreeIds.add(parentId);
      for (const f of folders) {
        if (f.parentId === parentId) findSubtree(f.id);
      }
    };
    findSubtree(folderId);

    setFolders((prev) =>
      prev.map((f) => {
        if (trashMode === 'trash_subtree') {
          return affectedSubtreeIds.has(f.id)
            ? { ...f, trashedAt: now, revision: f.revision + 1 }
            : f;
        } else {
          if (f.id === folderId) {
            return { ...f, trashedAt: now, revision: f.revision + 1 };
          }
          if (f.parentId === folderId) {
            return { ...f, parentId: trashModalFolder.parentId, revision: f.revision + 1 };
          }
          return f;
        }
      })
    );

    // If items were inside and mode is preserve, reparent to parent
    setItems((prev) =>
      prev.map((item) => {
        if (trashMode === 'trash_subtree') {
          return affectedSubtreeIds.has(item.folderId ?? '')
            ? { ...item, trashedAt: now, revision: item.revision + 1 }
            : item;
        } else {
          if (item.folderId === folderId) {
            return {
              ...item,
              folderId: trashModalFolder.parentId,
              revision: item.revision + 1,
            };
          }
          return item;
        }
      })
    );

    setTrashModalFolder(null);
    announce(`Moved folder ${trashModalFolder.name} to trash`);

    const header: ItemHeaderRecord = {
      id: folderId,
      workspaceId: workspaceId || 'ws-local',
      kind: 'folder',
      name: trashModalFolder.name,
      parentId: trashModalFolder.parentId,
      folderId: trashModalFolder.parentId,
      color: trashModalFolder.color,
      icon: trashModalFolder.icon,
      rank: trashModalFolder.rank,
      securityScope: trashModalFolder.scope === 'private' ? 'vault' : 'standard',
      isArchived: Boolean(trashModalFolder.archivedAt),
      isPinned: false,
      serverRevision: prevRevision,
      createdAt: now,
      updatedAt: now,
      deletedAt: now,
    };

    try {
      if (syncEngineRef.current) {
        await syncEngineRef.current.saveItem(header, undefined, 'trashFolder', {
          payload: { policy: trashMode },
        });
        if (isOnline) void syncEngineRef.current.syncNow();
      } else if (apiClientRef.current && workspaceId) {
        await apiClientRef.current.trashFolder(
          workspaceId,
          folderId,
          { policy: trashMode, baseRevision: prevRevision },
          { headers: { 'x-operation-id': generateUuid() } }
        );
      }
    } catch {
      setCloudSyncStatus('Sync failed');
    }

    // Reversible Undo Toast
    setUndoToast({
      id: `trash-${folderId}`,
      message: `Deleted folder '${trashModalFolder.name}'`,
      expiresAt: Date.now() + 10000,
      onUndo: async () => {
        setFolders((prev) =>
          prev.map((f) =>
            affectedSubtreeIds.has(f.id) ? { ...f, trashedAt: null, revision: f.revision + 1 } : f
          )
        );
        setItems((prev) =>
          prev.map((i) =>
            affectedSubtreeIds.has(i.folderId ?? '')
              ? { ...i, trashedAt: null, revision: i.revision + 1 }
              : i
          )
        );
        announce(`Restored folder ${trashModalFolder.name} from trash`);
        setUndoToast(null);

        const restoreHeader: ItemHeaderRecord = {
          ...header,
          serverRevision: prevRevision + 1,
          deletedAt: null,
        };

        if (syncEngineRef.current) {
          await syncEngineRef.current.saveItem(restoreHeader, undefined, 'restoreFolder');
          if (isOnline) void syncEngineRef.current.syncNow();
        } else if (apiClientRef.current && workspaceId) {
          void apiClientRef.current.restoreFolder(
            workspaceId,
            folderId,
            { baseRevision: prevRevision + 1 },
            { headers: { 'x-operation-id': generateUuid() } }
          );
        }
      },
    });
  };

  // Seeder for Canonical Demo Journeys (Software & Government Jobs)
  const handleLoadSampleJourneys = async () => {
    const ws = workspaceId || 'ws-canonical';
    const now = new Date().toISOString();

    const swId = generateUuid();
    const guidesId = generateUuid();
    const projectsId = generateUuid();
    const govId = generateUuid();
    const appsId = generateUuid();

    const sampleFolders: FolderNode[] = [
      {
        id: swId,
        name: 'Software',
        parentId: null,
        icon: '💻',
        color: '#3b82f6',
        rank: '00001000',
        scope: 'workspace',
        revision: 1,
      },
      {
        id: guidesId,
        name: 'Guides',
        parentId: swId,
        icon: '📚',
        color: '#10b981',
        rank: '00001000',
        scope: 'workspace',
        revision: 1,
      },
      {
        id: projectsId,
        name: 'Projects',
        parentId: swId,
        icon: '🚀',
        color: '#8b5cf6',
        rank: '00002000',
        scope: 'workspace',
        revision: 1,
      },
      {
        id: govId,
        name: 'Government jobs',
        parentId: null,
        icon: '🏛️',
        color: '#f59e0b',
        rank: '00002000',
        scope: 'workspace',
        revision: 1,
      },
      {
        id: appsId,
        name: 'Applications',
        parentId: govId,
        icon: '📋',
        color: '#ef4444',
        rank: '00001000',
        scope: 'workspace',
        revision: 1,
      },
    ];

    const sampleItems: LibraryItemRecord[] = [
      {
        id: generateUuid(),
        title: 'TypeScript reference handbook',
        kind: 'knowledge',
        folderId: guidesId,
        rank: '00001000',
        scope: 'workspace',
        revision: 1,
        ext: '.pdf',
        metadata: 'Knowledge Note • Updated yesterday',
      },
      {
        id: generateUuid(),
        title: 'TypeScript handbook deep-dive.pdf',
        kind: 'file',
        folderId: guidesId,
        rank: '00002000',
        scope: 'workspace',
        revision: 1,
        ext: '.pdf',
        metadata: 'PDF Document (2.4 MB) • Sep 28',
      },
      {
        id: generateUuid(),
        title: 'Read generics chapter in handbook',
        kind: 'task',
        folderId: guidesId,
        rank: '00003000',
        scope: 'workspace',
        revision: 1,
        metadata: 'Task Note • Due Friday',
      },
      {
        id: generateUuid(),
        title: 'New offline sync engine idea',
        kind: 'note',
        folderId: projectsId,
        rank: '00001000',
        scope: 'workspace',
        revision: 1,
        ext: '.txt',
        metadata: 'Markdown Note • Draft',
      },
      {
        id: generateUuid(),
        title: 'Government Application Form.pdf',
        kind: 'file',
        folderId: appsId,
        rank: '00001000',
        scope: 'workspace',
        revision: 1,
        ext: '.pdf',
        metadata: 'PDF Document (1.1 MB) • Oct 2',
      },
      {
        id: generateUuid(),
        title: 'Submit civil service exam application',
        kind: 'task',
        folderId: appsId,
        rank: '00002000',
        scope: 'workspace',
        revision: 1,
        metadata: 'Task Note • Deadline next week',
      },
    ];

    setFolders((prev) => [...prev, ...sampleFolders]);
    setItems((prev) => [...prev, ...sampleItems]);
    announce('Loaded Software and Government jobs sample journeys');

    // Persist folders to local storage if available
    if (syncEngineRef.current) {
      for (const f of sampleFolders) {
        const header: ItemHeaderRecord = {
          id: f.id,
          workspaceId: ws,
          kind: 'folder',
          name: f.name,
          parentId: f.parentId,
          folderId: f.parentId,
          color: f.color,
          icon: f.icon,
          rank: f.rank,
          securityScope: 'standard',
          isArchived: false,
          isPinned: false,
          serverRevision: 0,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        };
        await syncEngineRef.current.saveItem(header, undefined, 'createFolder');
      }
      if (isOnline) {
        void syncEngineRef.current.syncNow();
      }
    }
  };

  const handleClearDemoJourneys = () => {
    setFolders([]);
    setItems([]);
    setCurrentFolderId(null);
    announce('Cleared sample journeys. Library is now empty.');
  };

  // Note Editor Handlers
  const handleOpenNewNote = useCallback(() => {
    const newId = generateUuid();
    setEditingNote({
      id: newId,
      title: '',
      folderId: currentFolderId,
      isNew: true,
      kind: 'note',
      conflict: null,
    });
    announce('Opened new note editor');
  }, [currentFolderId, announce]);

  const handleOpenNewPresetNote = useCallback(
    (preset: 'guide' | 'cheatsheet') => {
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
        purpose: preset,
        conflict: null,
      });
      announce(`Opened new ${preset} editor`);
    },
    [currentFolderId, announce]
  );

  const handleOpenQuickReference = useCallback(
    async (item: LibraryItemRecord) => {
      let doc: NoteDocument | undefined;

      if (localRepoRef.current) {
        try {
          const loaded = await localRepoRef.current.getNote(workspaceId || 'ws-local', item.id);
          if (loaded?.document) {
            doc = loaded.document;
          }
        } catch {
          /* ignore fallback */
        }
      }

      if (!doc && apiClientRef.current && workspaceId && isOnline) {
        try {
          const res = await apiClientRef.current.getNote(workspaceId, item.id);
          if (res.data?.document) {
            doc = res.data.document;
          }
        } catch {
          /* ignore fallback */
        }
      }

      if (!doc) {
        announce('Note content is unavailable offline.');
        return;
      }

      let links: ResolvedItemLink[] = [];
      if (apiClientRef.current && workspaceId) {
        try {
          const res = await apiClientRef.current.getItemResolvedLinks(workspaceId, item.id);
          if (res.data) {
            links = res.data;
          }
        } catch {
          /* ignore fallback */
        }
      }

      setActiveQuickRef({
        id: item.id,
        title: item.title,
        folderId: item.folderId,
        document: doc,
      });
      setActiveQuickRefLinks(links);
      announce(`Opened quick reference for ${item.title}`);
    },
    [workspaceId, isOnline, announce]
  );

  const handleCreateSavedView = useCallback(async () => {
    if (!newViewName.trim() || !workspaceId || !apiClientRef.current) return;
    try {
      const filter: KnowledgeSavedViewFilter = {
        isArchived: false,
      };
      if (typeFilter === 'knowledge') {
        filter.presetKind = 'all';
      }
      if (searchQuery.trim()) {
        filter.searchQuery = searchQuery.trim();
      }
      if (currentFolderId) {
        filter.folderId = currentFolderId;
      }
      const res = await apiClientRef.current.createSavedView(workspaceId, {
        name: newViewName.trim(),
        filter,
      });
      if (res.data) {
        setSavedViews((prev) => [...prev, res.data]);
        setActiveSavedViewId(res.data.id);
        setIsSaveViewDialogOpen(false);
        setNewViewName('');
        announce(`Saved view ${res.data.name} created`);
      }
    } catch (err: unknown) {
      announce((err as { message?: string })?.message || 'Failed to create saved view');
    }
  }, [newViewName, workspaceId, typeFilter, searchQuery, currentFolderId, announce]);

  const handleDeleteSavedView = useCallback(
    async (id: string) => {
      if (!workspaceId || !apiClientRef.current) return;
      try {
        await apiClientRef.current.deleteSavedView(workspaceId, id);
        setSavedViews((prev) => prev.filter((v) => v.id !== id));
        if (activeSavedViewId === id) {
          setActiveSavedViewId(null);
        }
        announce('Saved view removed');
      } catch {
        announce('Failed to delete saved view');
      }
    },
    [workspaceId, activeSavedViewId, announce]
  );

  const handleOpenItem = useCallback(
    async (item: LibraryItemRecord) => {
      if (item.kind === 'note' || item.kind === 'knowledge') {
        let doc: NoteDocument | undefined;
        let conflictInfo: {
          serverRevision: number;
          serverTitle?: string;
          serverDocument?: NoteDocument;
        } | null = null;

        if (localRepoRef.current) {
          try {
            const loaded = await localRepoRef.current.getNote(workspaceId || 'ws-local', item.id);
            if (loaded) {
              doc = loaded.document;
            }
            const pendingConflicts = await localRepoRef.current.listConflicts(
              workspaceId || 'ws-local'
            );
            const foundConflict = pendingConflicts.find((c) => c.entityId === item.id);
            if (foundConflict) {
              conflictInfo = {
                serverRevision: foundConflict.serverRevision,
                serverTitle: foundConflict.serverState?.['title'] as string | undefined,
                serverDocument: foundConflict.serverState?.['document'] as NoteDocument | undefined,
              };
            }
          } catch {
            /* ignore fallback */
          }
        }

        if (!doc && apiClientRef.current && workspaceId && isOnline) {
          try {
            const res = await apiClientRef.current.getNote(workspaceId, item.id);
            if (res.data?.document) {
              doc = res.data.document;
            }
          } catch {
            /* ignore fallback */
          }
        }

        setEditingNote({
          id: item.id,
          title: item.title,
          folderId: item.folderId,
          document: doc,
          isNew: false,
          kind: item.kind === 'knowledge' ? 'knowledge' : 'note',
          purpose: item.purpose,
          conflict: conflictInfo,
        });
        announce(`Opened note ${item.title}`);
      } else if (item.kind === 'file') {
        const f = filesMap[item.id];
        let isOffline = false;
        if (user) {
          try {
            isOffline = await OfflineFileCache.hasBinary(
              user.id,
              workspaceId || 'ws-local',
              item.id,
              Number(f?.version ?? item.revision)
            );
          } catch {
            isOffline = false;
          }
        }
        const folder = folders.find((fol) => fol.id === (f?.folderId ?? item.folderId));
        setActivePreviewFile({
          id: item.id,
          fileName: f?.fileName ?? item.title,
          detectedMimeType:
            f?.detectedMimeType ?? f?.declaredMimeType ?? 'application/octet-stream',
          byteSize: f?.byteSize ?? 0,
          version: Number(f?.version ?? item.revision),
          quarantineStatus:
            (f?.quarantineStatus as 'verified' | 'quarantined' | 'rejected' | 'deleted') ??
            'verified',
          sha256Checksum: f?.sha256Checksum ?? '',
          folderName: folder?.name ?? null,
          verifiedAt: f?.verifiedAt ?? null,
          isOfflineAvailable: isOffline,
          rejectionReason: f?.rejectionReason ?? null,
        });
        announce(`Opened preview for ${item.title}`);
      }
    },
    [workspaceId, announce, filesMap, user, folders]
  );

  const refreshFilesAndUsage = useCallback(async () => {
    if (!workspaceId || !apiClientRef.current) return;
    try {
      const uRes = await apiClientRef.current.getWorkspaceStorageQuota(workspaceId);
      if (uRes.data) {
        setStorageUsage({
          storedBytes: uRes.data.storedBytes,
          reservedBytes: uRes.data.reservedBytes,
          maxBytes: uRes.data.maxStorageBytes,
        });
      }
      if (localRepoRef.current) {
        const localFiles = await localRepoRef.current.listFiles(workspaceId);
        const mapped: Record<string, FileRecord> = {};
        for (const f of localFiles) {
          mapped[f.id] = f;
        }
        setFilesMap(mapped);
      }
    } catch {
      /* ignore */
    }
  }, [workspaceId]);

  const handlePerformUpload = useCallback(
    async (
      file: File,
      folderId: string | null,
      onProgress: (percent: number, loaded: number) => void,
      _abortSignal?: AbortSignal
    ): Promise<UploadExecutionResult> => {
      if (!workspaceId || !apiClientRef.current) {
        return { success: false, error: 'Workspace is not connected.' };
      }
      if (_abortSignal?.aborted) {
        return { success: false, error: 'Upload cancelled.' };
      }

      let reservationId: string | null = null;
      try {
        const buffer = await file.arrayBuffer();
        if (_abortSignal?.aborted) {
          return { success: false, error: 'Upload cancelled.' };
        }

        const sha256 = await computeBufferSha256(buffer);
        if (_abortSignal?.aborted) {
          return { success: false, error: 'Upload cancelled.' };
        }

        const reserveRes = await apiClientRef.current.reserveFileUpload(workspaceId, {
          fileName: file.name,
          declaredMimeType: file.type || 'application/octet-stream',
          declaredBytes: file.size,
          folderId: folderId ?? undefined,
        });

        reservationId = reserveRes.data.reservationId;
        const { uploadUrl, headers } = reserveRes.data;

        if (_abortSignal?.aborted) {
          await apiClientRef.current
            .cancelFileUploadReservation(workspaceId, reservationId)
            .catch(() => {});
          return { success: false, error: 'Upload cancelled.' };
        }

        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('PUT', uploadUrl);
          if (headers) {
            for (const [k, v] of Object.entries(headers)) {
              xhr.setRequestHeader(k, v);
            }
          }
          if (xhr.upload) {
            xhr.upload.onprogress = (evt) => {
              if (evt.lengthComputable && !_abortSignal?.aborted) {
                onProgress(Math.round((evt.loaded / evt.total) * 100), evt.loaded);
              }
            };
          }

          const onAbort = () => {
            xhr.abort();
            reject(new Error('Upload cancelled.'));
          };

          if (_abortSignal) {
            if (_abortSignal.aborted) {
              onAbort();
              return;
            }
            _abortSignal.addEventListener('abort', onAbort, { once: true });
          }

          xhr.onload = () => {
            if (_abortSignal) {
              _abortSignal.removeEventListener('abort', onAbort);
            }
            if (_abortSignal?.aborted) {
              reject(new Error('Upload cancelled.'));
            } else if (xhr.status >= 200 && xhr.status < 300) {
              resolve();
            } else {
              reject(new Error(`Storage transfer failed with status ${xhr.status}`));
            }
          };
          xhr.onerror = () => {
            if (_abortSignal) {
              _abortSignal.removeEventListener('abort', onAbort);
            }
            reject(new Error('Storage transfer network error.'));
          };
          xhr.onabort = () => {
            if (_abortSignal) {
              _abortSignal.removeEventListener('abort', onAbort);
            }
            reject(new Error('Upload cancelled.'));
          };
          xhr.send(buffer);
        });

        if (_abortSignal?.aborted) {
          await apiClientRef.current
            .cancelFileUploadReservation(workspaceId, reservationId)
            .catch(() => {});
          return { success: false, error: 'Upload cancelled.' };
        }

        const finalizeRes = await apiClientRef.current.finalizeFileUpload(
          workspaceId,
          reservationId,
          {
            clientChecksum: sha256,
          }
        );

        const rec = finalizeRes.data;
        const status = rec.status;
        const now = new Date().toISOString();

        if (localRepoRef.current) {
          const fileRecord: FileRecord = {
            id: rec.fileId,
            workspaceId,
            folderId: folderId ?? null,
            fileName: rec.fileName,
            declaredMimeType: file.type || 'application/octet-stream',
            detectedMimeType: rec.detectedMimeType,
            byteSize: rec.byteSize,
            sha256Checksum: rec.sha256Checksum,
            version: '1',
            quarantineStatus: status,
            rejectionReason: rec.rejectionReason ?? null,
            createdBy: user?.id || workspaceId,
            createdAt: now,
            updatedAt: now,
            verifiedAt: rec.verifiedAt ?? null,
          };
          await localRepoRef.current.upsertFile(fileRecord);
          const itemHeader: ItemHeaderRecord = {
            id: rec.fileId,
            workspaceId,
            kind: 'file',
            name: rec.fileName,
            parentId: folderId ?? null,
            folderId: folderId ?? null,
            rank: generateInitialRank(items.length),
            securityScope: 'standard',
            isArchived: false,
            isPinned: false,
            serverRevision: 1,
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
          };
          await localRepoRef.current.upsertItemHeader(itemHeader);
        }

        setFilesMap((prev) => ({
          ...prev,
          [rec.fileId]: {
            id: rec.fileId,
            workspaceId,
            folderId: folderId ?? null,
            fileName: rec.fileName,
            declaredMimeType: file.type || 'application/octet-stream',
            detectedMimeType: rec.detectedMimeType,
            byteSize: rec.byteSize,
            sha256Checksum: rec.sha256Checksum,
            version: '1',
            quarantineStatus: status,
            rejectionReason: rec.rejectionReason ?? null,
            createdBy: user?.id || workspaceId,
            createdAt: now,
            updatedAt: now,
            verifiedAt: rec.verifiedAt ?? null,
          },
        }));

        const newItem: LibraryItemRecord = {
          id: rec.fileId,
          title: rec.fileName,
          kind: 'file',
          folderId: folderId ?? null,
          rank: generateInitialRank(items.length),
          scope: 'workspace',
          revision: 1,
          metadata: `${formatByteSize(rec.byteSize)} • ${status}`,
        };
        setItems((prev) => [newItem, ...prev.filter((i) => i.id !== rec.fileId)]);
        void refreshFilesAndUsage();
        announce(`Uploaded ${rec.fileName} with status ${status}`);

        return {
          success: status === 'verified',
          quarantineStatus: status === 'deleted' ? 'rejected' : status,
          rejectionReason: rec.rejectionReason ?? undefined,
          fileItem: rec,
        };
      } catch (err: unknown) {
        if (reservationId && apiClientRef.current && workspaceId) {
          await apiClientRef.current
            .cancelFileUploadReservation(workspaceId, reservationId)
            .catch(() => {});
        }
        return {
          success: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
    [workspaceId, items.length, user?.id, announce, refreshFilesAndUsage]
  );

  const handleRequestDownloadUrl = useCallback(
    async (file: FileItemRecord): Promise<string> => {
      if (!workspaceId) return '';

      // Check if file binary is cached offline locally first
      if (user?.id) {
        try {
          const cached = await OfflineFileCache.getBinary(
            user.id,
            workspaceId,
            file.id,
            file.version
          );
          if (cached && cached.binaryData) {
            const blob = new Blob([cached.binaryData], {
              type: cached.mimeType || file.detectedMimeType || 'application/octet-stream',
            });
            const objectUrl = URL.createObjectURL(blob);
            localBlobUrlsRef.current.add(objectUrl);
            return objectUrl;
          }
        } catch {
          // Fall through to cloud download capability if local cache is corrupted
        }
      }

      if (!apiClientRef.current) return '';
      const res = await apiClientRef.current.getFileDownloadCapability(workspaceId, file.id);
      return res.data?.downloadUrl || '';
    },
    [workspaceId, user?.id]
  );

  const handleToggleOffline = useCallback(
    async (file: FileItemRecord, enable: boolean): Promise<void> => {
      if (!workspaceId || !user) return;
      if (enable) {
        if (apiClientRef.current) {
          const res = await apiClientRef.current.getFileDownloadCapability(workspaceId, file.id);
          const url = res.data?.downloadUrl;
          if (url) {
            const resp = await fetch(url);
            const buf = await resp.arrayBuffer();
            await OfflineFileCache.saveBinary({
              accountId: user.id,
              workspaceId,
              fileId: file.id,
              version: file.version,
              fileName: file.fileName,
              mimeType: file.detectedMimeType || 'application/octet-stream',
              expectedSha256: file.sha256Checksum,
              data: buf,
            });
            setActivePreviewFile((prev: FileItemRecord | null) =>
              prev ? { ...prev, isOfflineAvailable: true } : null
            );
            announce(`${file.fileName} is now available offline.`);
          }
        }
      } else {
        await OfflineFileCache.deleteBinary(user.id, workspaceId, file.id, file.version);
        setActivePreviewFile((prev: FileItemRecord | null) =>
          prev ? { ...prev, isOfflineAvailable: false } : null
        );
        announce(`${file.fileName} removed from offline storage.`);
      }
    },
    [workspaceId, user, announce]
  );

  const handleDeleteFile = useCallback(
    async (file: FileItemRecord): Promise<void> => {
      if (!workspaceId) return;
      if (apiClientRef.current) {
        await apiClientRef.current.deleteFile(workspaceId, file.id);
      }
      if (localRepoRef.current) {
        await localRepoRef.current.deleteFile(workspaceId, file.id);
        await localRepoRef.current.deleteItemHeader(workspaceId, file.id);
      }
      if (user) {
        await OfflineFileCache.deleteBinary(user.id, workspaceId, file.id, file.version);
      }
      setItems((prev) => prev.filter((i) => i.id !== file.id));
      setActivePreviewFile(null);
      void refreshFilesAndUsage();
      announce(`Deleted file ${file.fileName}`);
    },
    [workspaceId, user, announce, refreshFilesAndUsage]
  );

  const handleSaveNote = useCallback(
    async (saved: {
      title: string;
      document: NoteDocument;
      plainText: string;
      folderId?: string | null;
    }) => {
      if (!editingNote) return;
      const now = new Date().toISOString();
      const existing = items.find((i) => i.id === editingNote.id);
      const prevRev = existing?.revision ?? 0;
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

      const header: ItemHeaderRecord = {
        id: editingNote.id,
        workspaceId: workspaceId || 'ws-local',
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
      };

      try {
        if (syncEngineRef.current) {
          await syncEngineRef.current.saveItem(
            header,
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
          setLocalSaveStatus('Saved on device');
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
          if (isOnline) {
            void syncEngineRef.current.syncNow();
          }
        } else if (localRepoRef.current) {
          await localRepoRef.current.upsertItemHeader(header);
          await localRepoRef.current.upsertNote({
            id: editingNote.id,
            workspaceId: workspaceId || 'ws-local',
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
          setLocalSaveStatus('Saved on device');
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

        // Update items list in view only after durable persistence succeeds
        if (isNew) {
          setItems((prev) => [
            {
              id: editingNote.id,
              title: saved.title,
              kind: itemKind,
              folderId: targetFolderId,
              rank: header.rank,
              scope: 'workspace',
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
                  }
                : i
            )
          );
        }
      } catch (err) {
        setLocalSaveStatus('Save failed');
        throw err;
      }
    },
    [editingNote, items, workspaceId, currentFolderId, isOnline]
  );

  const handleResolveConflict = useCallback(
    async (resolution: 'keep_server' | 'keep_local' | 'save_copy') => {
      if (!editingNote) return;
      try {
        if (syncEngineRef.current) {
          await syncEngineRef.current.resolveConflict(editingNote.id, resolution);
          if (isOnline) {
            await syncEngineRef.current.syncNow();
          }
        }
        setEditingNote((prev) => (prev ? { ...prev, conflict: null } : null));
        announce(`Resolved conflict with option: ${resolution}`);
      } catch {
        announce('Failed to resolve conflict');
      }
    },
    [editingNote, isOnline, announce]
  );

  const handleDeleteNote = useCallback(async () => {
    if (!editingNote) return;
    const noteId = editingNote.id;
    const existing = items.find((i) => i.id === noteId);
    if (!existing) {
      setEditingNote(null);
      return;
    }
    const now = new Date().toISOString();
    setItems((prev) => prev.filter((i) => i.id !== noteId));
    setEditingNote(null);
    announce(`Deleted note ${existing.title}`);

    const header: ItemHeaderRecord = {
      id: noteId,
      workspaceId: workspaceId || 'ws-local',
      kind: 'note',
      name: existing.title,
      parentId: existing.folderId,
      folderId: existing.folderId,
      rank: existing.rank,
      securityScope: 'standard',
      isArchived: false,
      isPinned: false,
      serverRevision: existing.revision,
      createdAt: now,
      updatedAt: now,
      deletedAt: now,
    };

    if (syncEngineRef.current) {
      await syncEngineRef.current.saveItem(header, undefined, 'trashNote');
      if (isOnline) void syncEngineRef.current.syncNow();
    }
  }, [editingNote, items, workspaceId, isOnline, announce]);

  // Handle URL query parameters (?create=note|file, ?type=files, ?noteId=..., ?fileId=..., ?folderId=...)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);

    if (params.get('create') === 'note') {
      handleOpenNewNote();
    } else if (params.get('create') === 'file') {
      setFileUploadOpen(true);
    }
    if (params.get('type') === 'files') {
      setTypeFilter('files');
    }

    const folderId = params.get('folderId');
    if (folderId) {
      setCurrentFolderId(folderId);
    }

    const noteId = params.get('noteId');
    if (noteId) {
      const existing = items.find((i) => i.id === noteId);
      if (existing) {
        void handleOpenItem(existing);
      } else {
        // Asynchronously load requested canonical note
        void (async () => {
          let foundItem: LibraryItemRecord | null = null;
          if (localRepoRef.current && workspaceId) {
            try {
              const loaded = await localRepoRef.current.getNote(workspaceId, noteId);
              if (loaded) {
                foundItem = {
                  id: loaded.id,
                  title: loaded.title,
                  kind: loaded.purpose && loaded.purpose !== 'standard' ? 'knowledge' : 'note',
                  folderId: loaded.folderId,
                  rank: '0',
                  scope: 'workspace',
                  revision: 1,
                  purpose: loaded.purpose,
                  plainText: loaded.plainText,
                };
              }
            } catch {
              /* ignore */
            }
          }
          if (!foundItem && apiClientRef.current && workspaceId && isOnline) {
            try {
              const res = await apiClientRef.current.getNote(workspaceId, noteId);
              if (res.data) {
                foundItem = {
                  id: res.data.id,
                  title: res.data.title,
                  kind: res.data.purpose && res.data.purpose !== 'standard' ? 'knowledge' : 'note',
                  folderId: res.data.folderId,
                  rank: res.data.rank || '0',
                  scope: 'workspace',
                  revision: res.data.revision,
                  purpose: res.data.purpose,
                };
              }
            } catch {
              /* ignore */
            }
          }
          if (foundItem) {
            void handleOpenItem(foundItem);
          }
        })();
      }
    }

    const fileId = params.get('fileId');
    if (fileId) {
      const existing = items.find((i) => i.id === fileId);
      if (existing) {
        void handleOpenItem(existing);
      } else {
        // Asynchronously load requested canonical file
        void (async () => {
          let fileItem: LibraryItemRecord | null = null;
          if (localRepoRef.current && workspaceId) {
            try {
              const f = await localRepoRef.current.getFile(workspaceId, fileId);
              if (f) {
                fileItem = {
                  id: f.id,
                  title: f.fileName,
                  kind: 'file',
                  folderId: f.folderId,
                  rank: '0',
                  scope: 'workspace',
                  revision: Number(f.version),
                };
              }
            } catch {
              /* ignore */
            }
          }
          if (!fileItem && apiClientRef.current && workspaceId && isOnline) {
            try {
              const res = await apiClientRef.current.getFileMetadata(workspaceId, fileId);
              if (res.data) {
                fileItem = {
                  id: res.data.id,
                  title: res.data.fileName,
                  kind: 'file',
                  folderId: res.data.folderId,
                  rank: '0',
                  scope: 'workspace',
                  revision: Number(res.data.version),
                };
              }
            } catch {
              /* ignore */
            }
          }
          if (fileItem) {
            void handleOpenItem(fileItem);
          }
        })();
      }
    }
  }, [handleOpenNewNote, handleOpenItem, items, workspaceId, isOnline]);

  return (
    <div
      aria-busy={isLoading}
      style={{
        padding: spacing.md,
        maxWidth: 1200,
        margin: '0 auto',
        minHeight: '100%',
        color: palette.text.primary,
        fontFamily: typography.fontFamily.sans,
      }}
    >
      {/* Live Region for Screen-Reader Announcements */}
      <div
        id={liveRegionId}
        aria-live="polite"
        aria-atomic="true"
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          margin: -1,
          padding: 0,
          overflow: 'hidden',
          clip: 'rect(0, 0, 0, 0)',
          border: 0,
        }}
      >
        {liveAnnouncement}
      </div>

      {/* Header with Title and Sync Badges */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: spacing.sm,
          marginBottom: spacing.md,
        }}
      >
        <div>
          <h1
            style={{
              fontSize: typography.webScale.pageTitle,
              fontWeight: 700,
              margin: 0,
              color: palette.text.primary,
            }}
          >
            Library & Folders
          </h1>
          <p
            style={{
              fontSize: typography.webScale.supporting,
              color: palette.text.secondary,
              margin: '4px 0 0 0',
            }}
          >
            Canonical folder hierarchy with cross-module mixed items
          </p>
        </div>

        {/* Sync & Device Storage Badges */}
        <div style={{ display: 'flex', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: typography.webScale.metadata,
              padding: '4px 8px',
              borderRadius: radii.pill,
              backgroundColor: hasConsent ? palette.status.successBg : palette.surface,
              color: hasConsent ? palette.status.success : palette.text.secondary,
              border: `1px solid ${hasConsent ? palette.status.successBorder : palette.border.subtle}`,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                backgroundColor: hasConsent ? palette.status.success : palette.text.muted,
              }}
            />
            {localSaveStatus}
          </span>

          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: typography.webScale.metadata,
              padding: '4px 8px',
              borderRadius: radii.pill,
              backgroundColor: isOnline ? palette.status.successBg : palette.status.warningBg,
              color: isOnline ? palette.status.success : palette.status.warning,
              border: `1px solid ${isOnline ? palette.status.successBorder : palette.status.warningBorder}`,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                backgroundColor: isOnline ? palette.status.success : palette.status.warning,
              }}
            />
            {cloudSyncStatus}
          </span>
        </div>
      </div>

      {/* Conflict Notice if present */}
      {conflictMessage && (
        <div style={{ marginBottom: spacing.md }}>
          <Feedback
            severity="warning"
            message={`Conflict detected: ${conflictMessage}. Local intent preserved until resolved.`}
            onDismiss={() => setConflictMessage(null)}
          />
        </div>
      )}

      {activeQuickRef ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Button
              variant="subtle"
              onClick={() => setActiveQuickRef(null)}
              aria-label="Back to Library"
            >
              ← Back to Library
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                const item = items.find((i) => i.id === activeQuickRef.id) ?? {
                  id: activeQuickRef.id,
                  title: activeQuickRef.title,
                  kind: 'knowledge',
                  folderId: activeQuickRef.folderId,
                  rank: '00001000',
                  scope: 'workspace',
                  revision: 1,
                };
                setActiveQuickRef(null);
                void handleOpenItem(item);
              }}
              aria-label={`Edit ${activeQuickRef.title}`}
            >
              ✏️ Edit Note
            </Button>
          </div>
          <QuickReferenceView
            noteId={activeQuickRef.id}
            title={activeQuickRef.title}
            document={activeQuickRef.document}
            themeMode={themeMode}
            links={activeQuickRefLinks}
            onEditNote={() => {
              const item = items.find((i) => i.id === activeQuickRef.id) ?? {
                id: activeQuickRef.id,
                title: activeQuickRef.title,
                kind: 'knowledge',
                folderId: activeQuickRef.folderId,
                rank: '00001000',
                scope: 'workspace',
                revision: 1,
              };
              setActiveQuickRef(null);
              void handleOpenItem(item);
            }}
            onNavigateToItem={(targetId: string) => {
              const target = items.find((i) => i.id === targetId);
              if (target) {
                setActiveQuickRef(null);
                void handleOpenItem(target);
              }
            }}
          />
        </div>
      ) : editingNote ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Button
              variant="subtle"
              onClick={() => setEditingNote(null)}
              aria-label="Back to Library"
            >
              ← Back to Library
            </Button>
          </div>
          <NoteEditor
            id={editingNote.id}
            initialTitle={editingNote.title}
            initialDocument={editingNote.document}
            initialFolderId={editingNote.folderId}
            folders={folders.map((f) => ({ id: f.id, name: f.name }))}
            themeMode={themeMode}
            localSaveStatus={localSaveStatus}
            cloudSyncStatus={cloudSyncStatus}
            conflict={editingNote.conflict}
            onSave={handleSaveNote}
            onResolveConflict={handleResolveConflict}
            onClose={() => setEditingNote(null)}
            onDelete={handleDeleteNote}
          />
        </div>
      ) : (
        <>
          {/* Accessible Breadcrumbs */}
          <div style={{ marginBottom: spacing.md }}>
            <BreadcrumbNav items={breadcrumbItems} onNavigateBack={handleNavigateUp} />
          </div>

          {/* Storage Quota Usage Bar */}
          <div style={{ marginBottom: spacing.md }}>
            <StorageUsageBar
              storedBytes={storageUsage.storedBytes}
              reservedBytes={storageUsage.reservedBytes}
              maxBytes={storageUsage.maxBytes}
              themeMode={themeMode}
            />
          </div>

          {/* Toolbar: Search, Filters, and Actions */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: spacing.sm,
              marginBottom: spacing.md,
            }}
          >
            {/* Module Filter Tabs */}
            <div
              role="tablist"
              aria-label="Filter library content by type"
              style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}
            >
              {(
                [
                  { key: 'all', label: 'All Items' },
                  { key: 'notes', label: 'Notes' },
                  { key: 'knowledge', label: 'Knowledge' },
                  { key: 'files', label: 'Files' },
                  { key: 'tasks', label: 'Tasks' },
                ] as const
              ).map((tab) => {
                const isSelected = typeFilter === tab.key;
                return (
                  <button
                    key={tab.key}
                    role="tab"
                    aria-selected={isSelected}
                    onClick={() => {
                      setTypeFilter(tab.key);
                      setPage(1);
                      announce(`Filtered view by ${tab.label}`);
                    }}
                    style={{
                      minHeight: touchTargets.webMin,
                      padding: '6px 12px',
                      borderRadius: radii.sm,
                      fontSize: typography.webScale.supporting,
                      fontWeight: isSelected ? '600' : '400',
                      border: isSelected
                        ? `1px solid ${palette.action.primary}`
                        : `1px solid ${palette.border.subtle}`,
                      backgroundColor: isSelected ? palette.action.subtle : palette.surface,
                      color: isSelected ? palette.action.primary : palette.text.secondary,
                      cursor: 'pointer',
                    }}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* Action Buttons */}
            <div
              style={{ display: 'flex', gap: spacing.xs, alignItems: 'center', flexWrap: 'wrap' }}
            >
              <input
                type="search"
                placeholder="Search items..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                aria-label="Search items"
                style={{
                  padding: '6px 12px',
                  borderRadius: radii.sm,
                  border: `1px solid ${palette.border.subtle}`,
                  backgroundColor: palette.surface,
                  color: palette.text.primary,
                  fontSize: typography.webScale.supporting,
                  minHeight: touchTargets.webMin,
                }}
              />

              <Button variant="primary" onClick={handleOpenNewNote} aria-label="Create new note">
                + New Note
              </Button>

              <Button
                variant="secondary"
                onClick={() => handleOpenNewPresetNote('guide')}
                aria-label="Create new knowledge guide"
              >
                + Guide
              </Button>

              <Button
                variant="secondary"
                onClick={() => handleOpenNewPresetNote('cheatsheet')}
                aria-label="Create new cheatsheet"
              >
                + Cheatsheet
              </Button>

              <Button
                variant="secondary"
                onClick={() => setFileUploadOpen(true)}
                aria-label="Upload file to workspace folder"
              >
                + Upload File
              </Button>

              <Button
                variant="secondary"
                onClick={() => handleOpenCreateModal(currentFolderId)}
                aria-label="Create new workspace folder"
              >
                + New Folder
              </Button>

              {folders.length === 0 && (
                <Button
                  id="load-demo-journeys-btn"
                  variant="secondary"
                  onClick={handleLoadSampleJourneys}
                  aria-label="Load demo journeys"
                >
                  Demo Journeys
                </Button>
              )}

              {folders.length > 0 && (
                <Button
                  id="clear-demo-journeys-btn"
                  variant="subtle"
                  onClick={handleClearDemoJourneys}
                  aria-label="Clear demo journeys"
                >
                  Clear Demo
                </Button>
              )}

              <label
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: typography.webScale.metadata,
                  color: palette.text.secondary,
                  cursor: 'pointer',
                  marginLeft: spacing.xs,
                }}
              >
                <input
                  type="checkbox"
                  checked={showArchived}
                  onChange={(e) => setShowArchived(e.target.checked)}
                  aria-label="Show archived items and folders"
                />
                Show Archived
              </label>
            </div>
          </div>

          {/* Saved Views Bar */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: spacing.xs,
              flexWrap: 'wrap',
              marginBottom: spacing.md,
              padding: '6px 12px',
              backgroundColor: palette.surfaceRaised,
              borderRadius: radii.card,
              border: `1px solid ${palette.border.subtle}`,
            }}
          >
            <span
              style={{
                fontSize: typography.webScale.metadata,
                fontWeight: '600',
                color: palette.text.secondary,
                marginRight: 4,
              }}
            >
              Saved Views:
            </span>
            <button
              type="button"
              role="button"
              aria-pressed={activeSavedViewId === null}
              onClick={() => {
                setActiveSavedViewId(null);
                announce('Showing standard folder view');
              }}
              style={{
                padding: '4px 10px',
                borderRadius: radii.sm,
                fontSize: typography.webScale.metadata,
                border: `1px solid ${activeSavedViewId === null ? palette.action.primary : palette.border.subtle}`,
                backgroundColor:
                  activeSavedViewId === null ? palette.action.subtle : palette.surface,
                color: activeSavedViewId === null ? palette.action.primary : palette.text.secondary,
                cursor: 'pointer',
                fontWeight: activeSavedViewId === null ? '600' : '400',
              }}
            >
              Default
            </button>
            {savedViews.map((sv) => {
              const isSelected = activeSavedViewId === sv.id;
              return (
                <span
                  key={sv.id}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    borderRadius: radii.sm,
                    border: `1px solid ${isSelected ? palette.action.primary : palette.border.subtle}`,
                    backgroundColor: isSelected ? palette.action.subtle : palette.surface,
                  }}
                >
                  <button
                    type="button"
                    role="button"
                    aria-pressed={isSelected}
                    onClick={() => {
                      setActiveSavedViewId(sv.id);
                      announce(`Switched to saved view ${sv.name}`);
                    }}
                    style={{
                      padding: '4px 8px',
                      border: 'none',
                      background: 'none',
                      fontSize: typography.webScale.metadata,
                      color: isSelected ? palette.action.primary : palette.text.primary,
                      cursor: 'pointer',
                      fontWeight: isSelected ? '600' : '400',
                    }}
                  >
                    🔖 {sv.name}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDeleteSavedView(sv.id)}
                    aria-label={`Delete view ${sv.name}`}
                    style={{
                      padding: '4px 6px',
                      border: 'none',
                      background: 'none',
                      color: palette.text.muted,
                      fontSize: '11px',
                      cursor: 'pointer',
                    }}
                  >
                    ✕
                  </button>
                </span>
              );
            })}
            <Button
              variant="subtle"
              onClick={() => setIsSaveViewDialogOpen(true)}
              aria-label="Save current filter as view"
              style={{ padding: '2px 8px', fontSize: typography.webScale.metadata, minHeight: 28 }}
            >
              + Save View
            </Button>
          </div>

          {/* Subfolders Section */}
          {currentSubfolders.length > 0 && (
            <section aria-labelledby="subfolders-heading" style={{ marginBottom: spacing.lg }}>
              <h2
                id="subfolders-heading"
                style={{
                  fontSize: typography.webScale.body,
                  fontWeight: '600',
                  marginBottom: spacing.xs,
                  color: palette.text.primary,
                }}
              >
                {currentFolder ? 'Subfolders' : 'Workspace Folders'} ({currentSubfolders.length})
              </h2>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                  gap: spacing.sm,
                }}
              >
                {currentSubfolders.map((f, index) => {
                  const count = folderCounts[f.id] ?? 0;
                  return (
                    <div
                      key={f.id}
                      style={{
                        backgroundColor: palette.surface,
                        borderRadius: radii.card,
                        border: `1px solid ${palette.border.subtle}`,
                        padding: spacing.sm,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: spacing.xs,
                      }}
                    >
                      <button
                        onClick={() => {
                          setCurrentFolderId(f.id);
                          setPage(1);
                          announce(`Opened folder ${f.name}`);
                        }}
                        title={`Open ${f.name}`}
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          cursor: 'pointer',
                          textAlign: 'left',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          flex: 1,
                          minHeight: touchTargets.webMin,
                        }}
                      >
                        <span style={{ fontSize: typography.webScale.sectionHeading }}>
                          {f.icon ?? '📁'}
                        </span>
                        <div>
                          <div
                            style={{
                              fontSize: typography.webScale.supporting,
                              fontWeight: '600',
                              color: palette.text.primary,
                            }}
                          >
                            {f.name}
                          </div>
                          <div
                            style={{
                              fontSize: typography.webScale.metadata,
                              color: palette.text.muted,
                            }}
                          >
                            {count} {count === 1 ? 'item' : 'items'}
                            {f.archivedAt && ' • Archived'}
                          </div>
                        </div>
                      </button>

                      {/* Folder Actions Menu */}
                      <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                        <button
                          onClick={() => handleReorder(f.id, 'up')}
                          disabled={index === 0}
                          title="Move Up"
                          aria-label={`Move ${f.name} up`}
                          style={{
                            padding: '4px 6px',
                            background: 'none',
                            border: 'none',
                            cursor: index === 0 ? 'not-allowed' : 'pointer',
                            opacity: index === 0 ? 0.3 : 1,
                          }}
                        >
                          ▲
                        </button>
                        <button
                          onClick={() => handleReorder(f.id, 'down')}
                          disabled={index === currentSubfolders.length - 1}
                          title="Move Down"
                          aria-label={`Move ${f.name} down`}
                          style={{
                            padding: '4px 6px',
                            background: 'none',
                            border: 'none',
                            cursor:
                              index === currentSubfolders.length - 1 ? 'not-allowed' : 'pointer',
                            opacity: index === currentSubfolders.length - 1 ? 0.3 : 1,
                          }}
                        >
                          ▼
                        </button>
                        <button
                          onClick={() => handleOpenRename(f)}
                          title="Rename"
                          aria-label={`Rename ${f.name}`}
                          style={{
                            padding: '4px 6px',
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                          }}
                        >
                          ✏️
                        </button>
                        <button
                          onClick={() => handleOpenMove(f)}
                          title="Move"
                          aria-label={`Move ${f.name}`}
                          style={{
                            padding: '4px 6px',
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                          }}
                        >
                          ➡️
                        </button>
                        <button
                          onClick={() => handleToggleArchive(f)}
                          title={f.archivedAt ? 'Unarchive' : 'Archive'}
                          aria-label={`${f.archivedAt ? 'Unarchive' : 'Archive'} ${f.name}`}
                          style={{
                            padding: '4px 6px',
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                          }}
                        >
                          📦
                        </button>
                        <button
                          onClick={() => handleOpenTrash(f)}
                          title="Delete"
                          aria-label={`Delete ${f.name}`}
                          style={{
                            padding: '4px 6px',
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                          }}
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Items Section */}
          <section aria-labelledby="items-heading">
            <h2
              id="items-heading"
              style={{
                fontSize: typography.webScale.body,
                fontWeight: '600',
                marginBottom: spacing.xs,
                color: palette.text.primary,
              }}
            >
              {currentFolder ? `${currentFolder.name} Items` : 'Inbox & Unfiled Items'} (
              {totalItems})
            </h2>

            {paginatedItems.length === 0 ? (
              <EmptyState
                id="library-empty-state"
                title={folders.length === 0 ? 'Your library is empty' : 'No items found'}
                description={
                  currentSubfolders.length === 0
                    ? 'Your library is empty. Create a folder or load demo journeys.'
                    : 'No items in this folder matching your active filters.'
                }
                actionLabel={folders.length === 0 ? 'Load Demo Journeys' : 'New Folder'}
                onAction={
                  folders.length === 0
                    ? handleLoadSampleJourneys
                    : () => handleOpenCreateModal(currentFolderId)
                }
              />
            ) : (
              <div
                role="list"
                style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}
              >
                {paginatedItems.map((item) => (
                  <div
                    key={item.id}
                    role="listitem"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: `${spacing.sm} ${spacing.md}`,
                      backgroundColor: palette.surface,
                      border: `1px solid ${palette.border.subtle}`,
                      borderRadius: radii.card,
                      gap: spacing.sm,
                      cursor:
                        item.kind === 'note' || item.kind === 'knowledge' || item.kind === 'file'
                          ? 'pointer'
                          : 'default',
                    }}
                    onClick={() => {
                      if (item.kind === 'knowledge') {
                        void handleOpenQuickReference(item);
                      } else if (item.kind === 'note' || item.kind === 'file') {
                        void handleOpenItem(item);
                      }
                    }}
                  >
                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, flex: 1 }}
                    >
                      <ItemTypeBadge kind={item.kind} />
                      <div>
                        <div
                          style={{
                            fontSize: typography.webScale.supporting,
                            fontWeight: '500',
                            color: palette.text.primary,
                          }}
                        >
                          {item.title}
                        </div>
                        {item.metadata && (
                          <div
                            style={{
                              fontSize: typography.webScale.metadata,
                              color: palette.text.muted,
                            }}
                          >
                            {item.metadata}
                          </div>
                        )}
                      </div>
                    </div>

                    {item.kind === 'knowledge' && (
                      <div style={{ display: 'flex', gap: spacing.xs }}>
                        <Button
                          variant="primary"
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleOpenQuickReference(item);
                          }}
                          aria-label={`Quick reference for ${item.title}`}
                        >
                          Quick Ref
                        </Button>
                        <Button
                          variant="subtle"
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleOpenItem(item);
                          }}
                          aria-label={`Edit ${item.title}`}
                        >
                          Edit
                        </Button>
                      </div>
                    )}

                    {item.kind === 'note' && (
                      <div style={{ display: 'flex', gap: spacing.xs }}>
                        <Button
                          variant="subtle"
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleOpenQuickReference(item);
                          }}
                          aria-label={`Quick reference for ${item.title}`}
                        >
                          Quick Ref
                        </Button>
                        <Button
                          variant="subtle"
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleOpenItem(item);
                          }}
                          aria-label={`Edit note ${item.title}`}
                        >
                          Edit Note
                        </Button>
                      </div>
                    )}

                    {item.kind === 'file' && (
                      <Button
                        variant="subtle"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleOpenItem(item);
                        }}
                        aria-label={`Preview file ${item.title}`}
                      >
                        Preview
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Accessible Pagination */}
            {totalPages > 1 && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: spacing.sm,
                  marginTop: spacing.md,
                }}
              >
                <Button
                  variant="secondary"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  aria-label="Previous page"
                >
                  Previous
                </Button>
                <span
                  style={{
                    fontSize: typography.webScale.supporting,
                    color: palette.text.secondary,
                  }}
                >
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="secondary"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  aria-label="Next page"
                >
                  Next
                </Button>
              </div>
            )}
          </section>
        </>
      )}

      {/* Floating Reversible Undo Toast */}
      {undoToast && (
        <div
          role="status"
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            backgroundColor: palette.surfaceRaised,
            border: `1px solid ${palette.border.subtle}`,
            padding: `${spacing.sm} ${spacing.md}`,
            borderRadius: radii.card,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            display: 'flex',
            alignItems: 'center',
            gap: spacing.md,
            zIndex: 1000,
          }}
        >
          <span style={{ fontSize: typography.webScale.supporting }}>{undoToast.message}</span>
          <Button variant="primary" onClick={undoToast.onUndo}>
            Undo
          </Button>
        </div>
      )}

      {/* Create Folder Dialog */}
      <Dialog
        isOpen={isCreateModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title="Create New Folder"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
          <TextField
            id="create-folder-name"
            label="Folder Name"
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
            errorMessage={createError ?? undefined}
            autoFocus
          />

          <div style={{ display: 'flex', gap: spacing.sm }}>
            <div style={{ flex: 1 }}>
              <label
                htmlFor="create-folder-icon"
                style={{
                  display: 'block',
                  fontSize: typography.webScale.metadata,
                  fontWeight: '500',
                  marginBottom: 4,
                }}
              >
                Icon
              </label>
              <select
                id="create-folder-icon"
                value={createIcon}
                onChange={(e) => setCreateIcon(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px',
                  borderRadius: radii.card,
                  border: `1px solid ${palette.border.subtle}`,
                  backgroundColor: palette.surface,
                  color: palette.text.primary,
                }}
              >
                <option value="📁">📁 Folder</option>
                <option value="💻">💻 Code / Tech</option>
                <option value="📚">📚 Guides</option>
                <option value="🚀">🚀 Projects</option>
                <option value="🏛️">🏛️ Government</option>
                <option value="🌱">🌱 Personal</option>
                <option value="🎓">🎓 Learning</option>
              </select>
            </div>

            <div style={{ flex: 1 }}>
              <label
                htmlFor="create-folder-color"
                style={{
                  display: 'block',
                  fontSize: typography.webScale.metadata,
                  fontWeight: '500',
                  marginBottom: 4,
                }}
              >
                Color Tag
              </label>
              <select
                id="create-folder-color"
                value={createColor}
                onChange={(e) => setCreateColor(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px',
                  borderRadius: radii.card,
                  border: `1px solid ${palette.border.subtle}`,
                  backgroundColor: palette.surface,
                  color: palette.text.primary,
                }}
              >
                <option value="#3b82f6">Blue</option>
                <option value="#10b981">Green</option>
                <option value="#8b5cf6">Purple</option>
                <option value="#f59e0b">Amber</option>
                <option value="#ef4444">Red</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: spacing.xs }}>
            <Button variant="subtle" onClick={() => setCreateModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleConfirmCreate}>
              Create Folder
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Rename Dialog */}
      <Dialog
        isOpen={Boolean(renameModalFolder)}
        onClose={() => setRenameModalFolder(null)}
        title="Rename Folder"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
          <TextField
            id="rename-folder-name"
            label="Folder Name"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            errorMessage={renameError ?? undefined}
            autoFocus
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: spacing.xs }}>
            <Button variant="subtle" onClick={() => setRenameModalFolder(null)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleConfirmRename}>
              Save Name
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Move Folder Dialog */}
      <Dialog
        isOpen={Boolean(moveModalFolder)}
        onClose={() => setMoveModalFolder(null)}
        title={`Move Folder: ${moveModalFolder?.name}`}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
          <label
            htmlFor="move-target-select"
            style={{ fontSize: typography.webScale.supporting, fontWeight: '500' }}
          >
            Select Target Destination:
          </label>
          <select
            id="move-target-select"
            value={moveTargetParentId ?? 'root'}
            onChange={(e) =>
              setMoveTargetParentId(e.target.value === 'root' ? null : e.target.value)
            }
            style={{
              padding: '8px',
              borderRadius: radii.card,
              border: `1px solid ${palette.border.subtle}`,
              backgroundColor: palette.surface,
              color: palette.text.primary,
            }}
          >
            <option value="root">Workspace Root (Top Level)</option>
            {folders
              .filter((f) => f.id !== moveModalFolder?.id && !f.trashedAt)
              .map((f) => {
                const isCycle = moveModalFolder && detectCycle(moveModalFolder.id, f.id, folderMap);
                return (
                  <option key={f.id} value={f.id} disabled={Boolean(isCycle)}>
                    {f.name} {isCycle ? '(Cannot move inside descendant)' : ''}
                  </option>
                );
              })}
          </select>

          {moveError && <Feedback severity="danger" message={moveError} />}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: spacing.xs }}>
            <Button variant="subtle" onClick={() => setMoveModalFolder(null)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleConfirmMove}>
              Confirm Move
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Trash Folder Dialog */}
      <Dialog
        isOpen={Boolean(trashModalFolder)}
        onClose={() => setTrashModalFolder(null)}
        title={`Delete Folder: ${trashModalFolder?.name}`}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
          <p style={{ fontSize: typography.webScale.supporting, margin: 0 }}>
            Choose how to handle contents inside this folder:
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="radio"
                name="trash-mode"
                checked={trashMode === 'trash_subtree'}
                onChange={() => setTrashMode('trash_subtree')}
              />
              <span style={{ fontSize: typography.webScale.supporting }}>
                <strong>Delete entire subtree:</strong> Move this folder and all subfolders and
                items to trash.
              </span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="radio"
                name="trash-mode"
                checked={trashMode === 'preserve_to_parent'}
                onChange={() => setTrashMode('preserve_to_parent')}
              />
              <span style={{ fontSize: typography.webScale.supporting }}>
                <strong>Preserve contents:</strong> Move contained subfolders and items up to the
                parent folder.
              </span>
            </label>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: spacing.xs }}>
            <Button variant="subtle" onClick={() => setTrashModalFolder(null)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleConfirmTrash}>
              Delete Folder
            </Button>
          </div>
        </div>
      </Dialog>

      {/* File Upload Dialog */}
      <FileUploadDialog
        isOpen={isFileUploadOpen}
        onClose={() => setFileUploadOpen(false)}
        themeMode={themeMode}
        workspaceId={workspaceId || ''}
        folders={folders.map((f) => ({
          id: f.id,
          name: f.name,
          parentId: f.parentId,
          icon: f.icon || undefined,
        }))}
        initialFolderId={currentFolderId}
        storedBytes={storageUsage.storedBytes}
        reservedBytes={storageUsage.reservedBytes}
        maxBytes={storageUsage.maxBytes}
        onPerformUpload={handlePerformUpload}
      />

      {/* File Preview Dialog */}
      <FilePreviewDialog
        isOpen={activePreviewFile !== null}
        onClose={() => setActivePreviewFile(null)}
        themeMode={themeMode}
        workspaceId={workspaceId || ''}
        file={activePreviewFile}
        onRequestDownloadUrl={handleRequestDownloadUrl}
        onToggleOffline={handleToggleOffline}
        onDelete={handleDeleteFile}
      />

      {/* Save Current Filter as View Dialog */}
      <Dialog
        isOpen={isSaveViewDialogOpen}
        onClose={() => setIsSaveViewDialogOpen(false)}
        title="Save Current Filter as View"
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: spacing.md,
            padding: spacing.sm,
            minWidth: 320,
          }}
        >
          <TextField
            label="View Name"
            value={newViewName}
            onChange={(e) => setNewViewName(e.target.value)}
            placeholder="e.g. Quick Reference Guides, Project Cheatsheets"
            autoFocus
          />
          <div style={{ display: 'flex', gap: spacing.sm, justifyContent: 'flex-end' }}>
            <Button variant="subtle" onClick={() => setIsSaveViewDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleCreateSavedView}
              disabled={!newViewName.trim()}
            >
              Save View
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
