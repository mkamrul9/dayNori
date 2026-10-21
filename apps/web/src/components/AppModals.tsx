'use client';

import { Icon } from '@daynori/ui-web';
import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { colors, radii, spacing } from '@daynori/design-tokens';
import {
  Button,
  Dialog,
  Feedback,
  ListRow,
  TextField,
  SyncDiagnosticsDialog,
  RecoveryExportDialog,
  ConflictReviewDialog,
  WorkspacePortabilityDialog,
} from '@daynori/ui-web';
import {
  exportRecoveryData,
  getRedactedSyncDiagnostics,
  type RedactedSyncDiagnostics,
  type RecoveryExport,
  type ConflictRecord,
  type FileRecord,
} from '@daynori/sync';
import { useShell } from './ShellContext';
import { useAuth } from './AuthContext';
import { AuthModal } from './AuthModal';
import { OnboardingTutorial } from './OnboardingTutorial';
import { createWebApiClient } from '../data/webApiClient';
import { IndexedDbLocalRepository } from '../data/indexedDbRepository';
import { getActiveWebSyncEngine, createWebSyncEngine } from '../data/syncAdapter';
import { OfflineFileCache } from '../data/offlineFileCache';
import { highlightMatch, searchDownloadedRecords } from '@daynori/domain';
import type { SearchResultItem, SearchItemType } from '@daynori/contracts';

export const AppModals: React.FC = () => {
  const router = useRouter();
  const { themeMode, activeModal, openModal, closeModal, isMobileDrawerOpen, setMobileDrawerOpen } =
    useShell();
  const { user, isAuthenticated, signOut, openAuthModal, workspaceId, csrfToken } = useAuth();

  const palette = colors[themeMode];
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<SearchItemType>('all');
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [coverage, setCoverage] = useState<'complete' | 'offline_limited' | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [retryTrigger, setRetryTrigger] = useState(0);

  const localRepoRef = useRef<IndexedDbLocalRepository | null>(null);
  const searchAbortControllerRef = useRef<AbortController | null>(null);
  const requestGenRef = useRef(0);

  // Clear search immediately on namespace change
  useEffect(() => {
    requestGenRef.current += 1;
    if (searchAbortControllerRef.current) {
      searchAbortControllerRef.current.abort();
    }
    localRepoRef.current = null;
    setSearchQuery('');
    setSelectedType('all');
    setSearchResults([]);
    setCoverage(null);
    setIsOffline(false);
    setIsLoading(false);
    setError(null);
    setOffset(0);
    setTotalCount(0);
    setStartDate('');
    setEndDate('');
    setSyncDiagnostics(null);
    setRecoveryExport(null);
    setActiveConflict(null);
  }, [user?.id, workspaceId]);

  const [syncDiagnostics, setSyncDiagnostics] = useState<RedactedSyncDiagnostics | null>(null);
  const [recoveryExport, setRecoveryExport] = useState<RecoveryExport | null>(null);
  const [activeConflict, setActiveConflict] = useState<ConflictRecord | null>(null);

  const loadDiagnostics = React.useCallback(async () => {
    if (!workspaceId || !user?.id) return;
    try {
      const activeEngine = getActiveWebSyncEngine();
      if (activeEngine) {
        const diag = await activeEngine.getDiagnostics();
        setSyncDiagnostics(getRedactedSyncDiagnostics(diag));
        return;
      }

      if (!localRepoRef.current) {
        localRepoRef.current = new IndexedDbLocalRepository();
        await localRepoRef.current.initialize({ workspaceId, userId: user.id });
      }
      const pending = await localRepoRef.current.getPendingMutations(workspaceId, user.id);
      const conflicts = await localRepoRef.current.listConflicts(workspaceId);
      const cursor = await localRepoRef.current.getCursor(workspaceId, user.id);
      const activeConflicts = conflicts.filter((c) => !c.resolved);
      const rawDiag = {
        workspaceId,
        userId: user.id,
        deviceId: 'web-browser',
        isLeader: false,
        networkStatus:
          typeof navigator !== 'undefined' && !navigator.onLine
            ? ('offline' as const)
            : ('online' as const),
        cloudSyncStatus:
          activeConflicts.length > 0
            ? ('conflict' as const)
            : pending.length > 0
              ? ('saved_locally' as const)
              : ('synced' as const),
        queueLength: pending.length,
        inFlightCount: 0,
        failedCount: pending.filter((m) => m.status === 'failed').length,
        lastSyncedAt: cursor?.lastSyncedAt || null,
        lastSyncSequence: cursor?.lastServerRevision ?? 0,
        accessEpoch: cursor?.epoch || null,
        consecutiveFailures: 0,
        activeConflictsCount: activeConflicts.length,
      };
      setSyncDiagnostics(getRedactedSyncDiagnostics(rawDiag));
    } catch {
      // fallback on error
    }
  }, [workspaceId, user?.id]);

  const loadRecoveryExport = React.useCallback(async () => {
    if (!workspaceId || !user?.id) return;
    try {
      if (!localRepoRef.current) {
        localRepoRef.current = new IndexedDbLocalRepository();
        await localRepoRef.current.initialize({ workspaceId, userId: user.id });
      }
      const exportData = await exportRecoveryData({
        repository: localRepoRef.current,
        workspaceId,
        userId: user.id,
        deviceId: 'web-browser',
        checkAttachmentCached: (f: FileRecord) =>
          OfflineFileCache.hasBinary(user.id, workspaceId, f.id, Number(f.version) || 1),
      });
      setRecoveryExport(exportData);
    } catch {
      // fallback on error
    }
  }, [workspaceId, user?.id]);

  const handleSyncNow = React.useCallback(async () => {
    const engine = getActiveWebSyncEngine();
    if (engine) {
      await engine.syncNow();
      await loadDiagnostics();
    }
  }, [loadDiagnostics]);

  useEffect(() => {
    const engine = getActiveWebSyncEngine();
    if (!engine) return;
    const unsub = engine.onEvent((evt) => {
      if (evt.type === 'conflict_detected') {
        setActiveConflict(evt.conflict);
      } else if (evt.type === 'conflict_resolved') {
        setActiveConflict((prev) => (prev?.id === evt.conflictId ? null : prev));
      }
    });
    return unsub;
  }, [workspaceId, user?.id]);

  const handleOpenConflictReview = React.useCallback(async () => {
    if (!workspaceId) return;
    const engine = getActiveWebSyncEngine();
    if (engine) {
      const conflicts = engine.getConflicts();
      if (conflicts.length > 0) {
        setActiveConflict(conflicts[0] ?? null);
        openModal('conflict-review');
        return;
      }
    }
    if (!localRepoRef.current && user?.id) {
      localRepoRef.current = new IndexedDbLocalRepository();
      await localRepoRef.current.initialize({ workspaceId, userId: user.id });
    }
    if (localRepoRef.current) {
      const persisted = await localRepoRef.current.listConflicts(workspaceId);
      const unresolved = persisted.filter((c) => !c.resolved);
      if (unresolved.length > 0) {
        setActiveConflict(unresolved[0] ?? null);
        openModal('conflict-review');
      }
    }
  }, [workspaceId, user?.id, openModal]);

  const handleResolveConflict = React.useCallback(
    async (
      resolution: 'keep_server' | 'keep_local' | 'save_copy' | 'merge',
      customPayload?: Record<string, unknown>
    ) => {
      if (!activeConflict) return;
      let engine = getActiveWebSyncEngine();
      if (!engine && user?.id && workspaceId) {
        if (!localRepoRef.current) {
          localRepoRef.current = new IndexedDbLocalRepository();
          await localRepoRef.current.initialize({ workspaceId, userId: user.id });
        }
        const client = createWebApiClient({ csrfToken });
        engine = createWebSyncEngine({
          repository: localRepoRef.current,
          apiClient: client,
          namespace: { userId: user.id, workspaceId },
        });
      }
      if (engine) {
        await engine.resolveConflict(activeConflict.id, resolution, customPayload);
        await engine.syncNow();
      }
      setActiveConflict(null);
      if (activeModal === 'conflict-review') {
        closeModal();
      }
      await loadDiagnostics();
    },
    [activeConflict, activeModal, closeModal, loadDiagnostics, user?.id, workspaceId, csrfToken]
  );

  useEffect(() => {
    if (activeModal === 'sync-diagnostics') {
      void loadDiagnostics();
    } else if (activeModal === 'recovery-export') {
      void loadRecoveryExport();
    }
  }, [activeModal, loadDiagnostics, loadRecoveryExport]);

  const searchableDestinations = [
    {
      title: 'Today',
      subtitle: 'Immediate action, upcoming tasks and daily routines',
      href: '/today',
      icon: 'sun',
    },
    {
      title: 'Plan: Tasks & Routines',
      subtitle: 'Organize tasks, recurring habits, and priorities',
      href: '/plan',
      icon: 'clipboard',
    },
    {
      title: 'Plan: Calendar',
      subtitle: 'Agenda and calendar projection under Plan',
      href: '/plan/calendar',
      icon: 'calendar',
    },
    {
      title: 'Library: Folders & Files',
      subtitle: 'Workspace folder hierarchy, notes, and documents',
      href: '/library',
      icon: 'library',
    },
    {
      title: 'Files & Storage',
      subtitle: 'Upload files, safe previews, and storage quota',
      href: '/library?type=files',
      icon: 'attachment',
    },
    {
      title: 'Journal: Reflection Timeline',
      subtitle: 'Date-grouped timeline and private writing',
      href: '/journal',
      icon: 'book',
    },
    {
      title: 'Settings',
      subtitle: 'Theme, text size, motion, and language settings',
      href: '/settings',
      icon: 'settings',
    },
    {
      title: 'Help & Shortcuts',
      subtitle: 'Keyboard shortcuts and accessible navigation guide',
      href: '/help',
      icon: 'help',
    },
    {
      title: 'Component Review Gallery',
      subtitle: 'Phase 04 design token and primitive test gallery',
      href: '/review',
      icon: 'palette',
    },
  ];

  const filteredDestinations = searchQuery.trim()
    ? searchableDestinations.filter(
        (d) =>
          d.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          d.subtitle.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : searchableDestinations;

  const navigateTo = (href: string) => {
    closeModal();
    setMobileDrawerOpen(false);
    router.push(href);
  };

  const navigateToSearchResult = (item: SearchResultItem) => {
    const wsParam = workspaceId ? `workspaceId=${encodeURIComponent(workspaceId)}` : '';
    let href = '/today';

    if (item.displayType === 'note' || item.displayType === 'knowledge') {
      href = `/library?noteId=${encodeURIComponent(item.id)}${wsParam ? `&${wsParam}` : ''}`;
    } else if (item.displayType === 'task') {
      href = `/plan?targetId=${encodeURIComponent(item.id)}&targetType=task${wsParam ? `&${wsParam}` : ''}`;
    } else if (item.displayType === 'journal') {
      const entryDate = (item.metadata?.entryDate as string) || '';
      href = `/journal?entryId=${encodeURIComponent(item.id)}${entryDate ? `&date=${encodeURIComponent(entryDate)}` : ''}${wsParam ? `&${wsParam}` : ''}`;
    } else if (item.displayType === 'file') {
      href = `/library?fileId=${encodeURIComponent(item.id)}&type=files${wsParam ? `&${wsParam}` : ''}`;
    } else if (item.displayType === 'folder') {
      href = `/library?folderId=${encodeURIComponent(item.id)}${wsParam ? `&${wsParam}` : ''}`;
    }

    navigateTo(href);
  };

  // Debounced search query handler
  useEffect(() => {
    if (activeModal !== 'search') return;

    const trimmedQuery = searchQuery.trim();
    if (!trimmedQuery && selectedType === 'all' && !startDate && !endDate) {
      setSearchResults([]);
      setCoverage(null);
      setIsLoading(false);
      setError(null);
      setTotalCount(0);
      return;
    }

    if (!workspaceId) return;

    if (searchAbortControllerRef.current) {
      searchAbortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    searchAbortControllerRef.current = abortController;

    const currentGen = ++requestGenRef.current;

    const timer = setTimeout(async () => {
      setIsLoading(true);
      setError(null);

      const types = selectedType !== 'all' ? [selectedType] : undefined;

      try {
        const client = createWebApiClient({ csrfToken });
        const res = await client.searchWorkspace(
          workspaceId,
          {
            q: trimmedQuery,
            types,
            startDate: startDate ? new Date(startDate).toISOString() : undefined,
            endDate: endDate ? new Date(endDate).toISOString() : undefined,
            limit: 20,
            offset,
          },
          { signal: abortController.signal }
        );

        if (abortController.signal.aborted || currentGen !== requestGenRef.current) return;

        setSearchResults(res.data);
        setCoverage(res.meta.coverage);
        setTotalCount(res.meta.totalCount);
        setIsOffline(false);
        setIsLoading(false);
      } catch (err: unknown) {
        if (abortController.signal.aborted || currentGen !== requestGenRef.current) return;

        const errObj = err as { statusCode?: number; code?: string; message?: string };
        const status = errObj.statusCode ?? 0;

        // Classify errors: Auth/Forbidden vs Validation vs Server vs Network
        if (status === 401 || status === 403) {
          setError('Authorization failed: you do not have permission to search this workspace.');
          setSearchResults([]);
          setTotalCount(0);
          setCoverage(null);
          setIsLoading(false);
          return;
        }

        if (status === 400) {
          setError('Invalid search query or filter parameters.');
          setSearchResults([]);
          setTotalCount(0);
          setCoverage(null);
          setIsLoading(false);
          return;
        }

        if (status >= 500) {
          setError('Server error occurred during search. Please retry.');
          setSearchResults([]);
          setTotalCount(0);
          setCoverage(null);
          setIsLoading(false);
          return;
        }

        // Fallback to offline search across downloaded items only for network failure
        try {
          if (!localRepoRef.current) {
            const repo = new IndexedDbLocalRepository();
            await repo.initialize({
              userId: user?.id || 'anonymous',
              workspaceId,
            });
            localRepoRef.current = repo;
          }

          const repo = localRepoRef.current;
          const [headers, notes, tasks, journals, files, prefSnapshot] = await Promise.all([
            repo.listItemHeaders(workspaceId),
            repo.listNotes(workspaceId),
            repo.listTasks(workspaceId),
            repo.listJournalEntries(workspaceId),
            repo.listFiles(workspaceId),
            repo.getPreferenceSnapshot(user?.id || 'anonymous'),
          ]);

          if (abortController.signal.aborted || currentGen !== requestGenRef.current) return;

          const displayPrefs = (prefSnapshot?.preferences as Record<string, unknown>)
            ?.displayPreferences as Record<string, unknown> | undefined;
          const journalPreviewHidden =
            displayPrefs?.journalPreviewHidden !== undefined
              ? Boolean(displayPrefs.journalPreviewHidden)
              : true;
          const suppressBodySnippets =
            displayPrefs?.suppressBodySnippets !== undefined
              ? Boolean(displayPrefs.suppressBodySnippets)
              : true;

          const localRes = searchDownloadedRecords({
            workspaceId,
            query: {
              q: trimmedQuery,
              types,
              startDate: startDate ? new Date(startDate).toISOString() : undefined,
              endDate: endDate ? new Date(endDate).toISOString() : undefined,
              limit: 20,
              offset,
            },
            items: {
              headers,
              notes,
              tasks,
              journalEntries: journals,
              files,
            },
            preferences: {
              journalPreviewHidden,
              suppressBodySnippets,
            },
          });

          if (abortController.signal.aborted || currentGen !== requestGenRef.current) return;

          setSearchResults(localRes.data);
          setCoverage('offline_limited');
          setTotalCount(localRes.totalCount);
          setIsOffline(true);
        } catch {
          if (abortController.signal.aborted || currentGen !== requestGenRef.current) return;
          setError('Unable to search offline records.');
          setSearchResults([]);
          setCoverage('offline_limited');
          setTotalCount(0);
        } finally {
          if (!abortController.signal.aborted && currentGen === requestGenRef.current) {
            setIsLoading(false);
          }
        }
      }
    }, 180);

    return () => {
      clearTimeout(timer);
      abortController.abort();
    };
  }, [
    searchQuery,
    selectedType,
    startDate,
    endDate,
    offset,
    workspaceId,
    csrfToken,
    activeModal,
    user?.id,
    retryTrigger,
  ]);

  const typeFilters: Array<{ id: SearchItemType; label: string }> = [
    { id: 'all', label: 'All' },
    { id: 'note', label: 'Notes' },
    { id: 'task', label: 'Tasks' },
    { id: 'journal', label: 'Journal' },
    { id: 'file', label: 'Files' },
    { id: 'knowledge', label: 'Knowledge' },
  ];

  const getItemIcon = (type: SearchResultItem['displayType']) => {
    switch (type) {
      case 'note':
        return 'note';
      case 'knowledge':
        return 'book';
      case 'task':
        return 'clipboard';
      case 'journal':
        return 'edit';
      case 'file':
        return 'attachment';
      case 'folder':
        return 'folder';
      default:
        return 'file';
    }
  };

  const renderHighlight = (text: string, query: string) => {
    const segments = highlightMatch(text, query);
    return segments.map((seg, i) =>
      seg.match ? (
        <mark
          key={i}
          style={{
            backgroundColor: palette.action.subtle,
            color: palette.text.primary,
            fontWeight: '600',
            padding: '0 2px',
            borderRadius: '2px',
          }}
        >
          {seg.text}
        </mark>
      ) : (
        <span key={i}>{seg.text}</span>
      )
    );
  };

  const hasSearchActive = Boolean(
    searchQuery.trim() || selectedType !== 'all' || startDate || endDate
  );

  return (
    <>
      {/* 1. Global Search Dialog */}
      <Dialog
        isOpen={activeModal === 'search'}
        onClose={closeModal}
        title="Search Organizer"
        description="Search notes, tasks, files, journal reflections, and folders."
        themeMode={themeMode}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.sm}px` }}>
          {isOffline && (
            <Feedback
              severity="info"
              message="Showing downloaded offline results — server index will be queried upon reconnect."
              themeMode={themeMode}
            />
          )}

          {error && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: `${spacing.xs}px`,
              }}
            >
              <div style={{ flex: 1 }}>
                <Feedback severity="danger" message={error} themeMode={themeMode} />
              </div>
              <Button
                variant="secondary"
                themeMode={themeMode}
                onClick={() => setRetryTrigger((r) => r + 1)}
              >
                Retry
              </Button>
            </div>
          )}

          <TextField
            id="search-input"
            label="Search Query"
            placeholder="Search notes, tasks, files, or journal reflections..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setOffset(0);
            }}
            themeMode={themeMode}
            autoFocus
          />

          {/* Type Filter Chips */}
          <div
            role="toolbar"
            aria-label="Filter by type"
            style={{
              display: 'flex',
              gap: `${spacing.xs}px`,
              flexWrap: 'wrap',
              marginTop: `${spacing.xs}px`,
            }}
          >
            {typeFilters.map((tf) => {
              const isSelected = selectedType === tf.id;
              return (
                <button
                  key={tf.id}
                  type="button"
                  id={`search-filter-${tf.id}`}
                  onClick={() => {
                    setSelectedType(tf.id);
                    setOffset(0);
                  }}
                  aria-pressed={isSelected}
                  style={{
                    padding: '4px 10px',
                    borderRadius: `${radii.sm}px`,
                    fontSize: '12px',
                    fontWeight: isSelected ? '600' : '400',
                    border: `1px solid ${isSelected ? palette.action.primary : palette.border.subtle}`,
                    backgroundColor: isSelected ? palette.action.subtle : 'transparent',
                    color: isSelected ? palette.text.primary : palette.text.secondary,
                    cursor: 'pointer',
                  }}
                >
                  {tf.label}
                </button>
              );
            })}
          </div>

          {/* Date Boundary Filters */}
          <div
            style={{
              display: 'flex',
              gap: `${spacing.sm}px`,
              alignItems: 'center',
              marginTop: '4px',
            }}
          >
            <div style={{ flex: 1 }}>
              <label
                htmlFor="search-start-date"
                style={{
                  fontSize: '11px',
                  color: palette.text.muted,
                  display: 'block',
                  marginBottom: '2px',
                }}
              >
                From Date
              </label>
              <input
                id="search-start-date"
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setOffset(0);
                }}
                style={{
                  width: '100%',
                  padding: '4px 8px',
                  borderRadius: `${radii.sm}px`,
                  border: `1px solid ${palette.border.subtle}`,
                  backgroundColor: palette.surface,
                  color: palette.text.primary,
                  fontSize: '12px',
                }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label
                htmlFor="search-end-date"
                style={{
                  fontSize: '11px',
                  color: palette.text.muted,
                  display: 'block',
                  marginBottom: '2px',
                }}
              >
                To Date
              </label>
              <input
                id="search-end-date"
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setOffset(0);
                }}
                style={{
                  width: '100%',
                  padding: '4px 8px',
                  borderRadius: `${radii.sm}px`,
                  border: `1px solid ${palette.border.subtle}`,
                  backgroundColor: palette.surface,
                  color: palette.text.primary,
                  fontSize: '12px',
                }}
              />
            </div>
            {(startDate || endDate) && (
              <button
                type="button"
                onClick={() => {
                  setStartDate('');
                  setEndDate('');
                  setOffset(0);
                }}
                style={{
                  alignSelf: 'flex-end',
                  marginBottom: '2px',
                  padding: '4px 8px',
                  fontSize: '11px',
                  borderRadius: `${radii.sm}px`,
                  border: `1px solid ${palette.border.subtle}`,
                  background: 'transparent',
                  color: palette.text.muted,
                  cursor: 'pointer',
                }}
              >
                Clear Dates
              </button>
            )}
          </div>

          {/* Results List */}
          <div
            role="list"
            aria-label="Search results"
            style={{
              maxHeight: '320px',
              overflowY: 'auto',
              border: `1px solid ${palette.border.subtle}`,
              borderRadius: `${radii.sm}px`,
              marginTop: `${spacing.xs}px`,
            }}
          >
            {isLoading ? (
              <div
                style={{
                  padding: `${spacing.lg}px`,
                  textAlign: 'center',
                  color: palette.text.secondary,
                }}
              >
                Searching organizer...
              </div>
            ) : hasSearchActive ? (
              searchResults.length > 0 ? (
                searchResults.map((item) => (
                  <div
                    key={item.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => navigateToSearchResult(item)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        navigateToSearchResult(item);
                      }
                    }}
                    style={{
                      padding: `${spacing.sm}px ${spacing.md}px`,
                      borderBottom: `1px solid ${palette.border.subtle}`,
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                      backgroundColor: palette.surface,
                    }}
                    aria-label={`${item.title}, ${item.displayType}, in ${item.folderPath}`}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <span
                        style={{ fontWeight: '600', color: palette.text.primary, fontSize: '14px' }}
                      >
                        <Icon name={getItemIcon(item.displayType)} />{' '}
                        {renderHighlight(item.title, searchQuery)}
                      </span>
                      <span
                        style={{
                          fontSize: '11px',
                          textTransform: 'uppercase',
                          fontWeight: '700',
                          letterSpacing: '0.5px',
                          color: palette.text.muted,
                        }}
                      >
                        {item.displayType}
                      </span>
                    </div>

                    {item.snippet && (
                      <p
                        style={{
                          fontSize: '12px',
                          color: palette.text.secondary,
                          margin: 0,
                          lineHeight: '1.4',
                        }}
                      >
                        {renderHighlight(item.snippet, searchQuery)}
                      </p>
                    )}

                    <div
                      style={{
                        display: 'flex',
                        gap: '8px',
                        fontSize: '11px',
                        color: palette.text.muted,
                      }}
                    >
                      <span>
                        <Icon name="folder" /> {item.folderPath}
                      </span>
                      {item.tags.length > 0 && (
                        <span>
                          <Icon name="tag" /> {item.tags.map((t) => `#${t}`).join(' ')}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div
                  style={{
                    padding: `${spacing.lg}px`,
                    textAlign: 'center',
                    color: palette.text.secondary,
                  }}
                >
                  No matching organizer items found for "{searchQuery}".
                </div>
              )
            ) : (
              // When no search query is active, show Quick Navigation Destinations
              <div>
                <div
                  style={{
                    padding: `${spacing.xs}px ${spacing.md}px`,
                    fontSize: '11px',
                    fontWeight: '700',
                    textTransform: 'uppercase',
                    color: palette.text.muted,
                    letterSpacing: '0.5px',
                    borderBottom: `1px solid ${palette.border.subtle}`,
                  }}
                >
                  Quick Navigation
                </div>
                {filteredDestinations.map((item) => (
                  <ListRow
                    key={item.href}
                    title={`${item.icon} ${item.title}`}
                    subtitle={item.subtitle}
                    onClick={() => navigateTo(item.href)}
                    themeMode={themeMode}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Pagination Controls */}
          {hasSearchActive && totalCount > 20 && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '4px 0',
                borderTop: `1px solid ${palette.border.subtle}`,
              }}
            >
              <span style={{ fontSize: '11px', color: palette.text.secondary }}>
                Showing {offset + 1}–{Math.min(offset + 20, totalCount)} of {totalCount}
              </span>
              <div style={{ display: 'flex', gap: `${spacing.xs}px` }}>
                <Button
                  variant="secondary"
                  themeMode={themeMode}
                  disabled={offset === 0 || isLoading}
                  onClick={() => setOffset((prev) => Math.max(0, prev - 20))}
                >
                  Previous
                </Button>
                <Button
                  variant="secondary"
                  themeMode={themeMode}
                  disabled={offset + 20 >= totalCount || isLoading}
                  onClick={() => setOffset((prev) => prev + 20)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: `${spacing.xs}px`,
            }}
          >
            <span style={{ fontSize: '12px', color: palette.text.muted }}>
              {hasSearchActive && !isLoading
                ? `${totalCount} item${totalCount === 1 ? '' : 's'} found (${coverage === 'offline_limited' ? 'offline limited' : 'complete'})`
                : 'Tip: Press / anywhere to open search'}
            </span>
            <Button variant="secondary" themeMode={themeMode} onClick={closeModal}>
              Close
            </Button>
          </div>
        </div>
      </Dialog>

      {/* 2. Global Create Dialog */}
      <Dialog
        isOpen={activeModal === 'create'}
        onClose={closeModal}
        title="Create Item"
        description="Add a new task, routine, note, or entry to your workspace."
        themeMode={themeMode}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.md}px` }}>
          <Feedback
            severity="info"
            message="Phase 05 Navigation Shell — Creation preview. Persistent storage for tasks, routines, and notes will be wired in Phase 07 and subsequent feature phases."
            themeMode={themeMode}
          />

          <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.xs}px` }}>
            <ListRow
              title="New Task"
              subtitle="Add a one-off task with optional deadline and priority"
              onClick={() => navigateTo('/plan')}
              themeMode={themeMode}
            />
            <ListRow
              title="New Routine"
              subtitle="Add a recurring daily or weekday habit with independent completion"
              onClick={() => navigateTo('/plan')}
              themeMode={themeMode}
            />
            <ListRow
              title="New Note"
              subtitle="Save reference knowledge, guides, or rich documents"
              onClick={() => navigateTo('/library?create=note')}
              themeMode={themeMode}
            />
            <ListRow
              title="Upload File"
              subtitle="Upload PDFs, images, or documents to workspace folders"
              onClick={() => navigateTo('/library?create=file')}
              themeMode={themeMode}
            />
            <ListRow
              title="New Journal Entry"
              subtitle="Open a quiet writing surface for reflection"
              onClick={() => navigateTo('/journal')}
              themeMode={themeMode}
            />
            <ListRow
              title="New Folder"
              subtitle="Create a workspace folder to group tasks and documents"
              onClick={() => navigateTo('/library')}
              themeMode={themeMode}
            />
          </div>

          <div
            style={{ display: 'flex', justifyContent: 'flex-end', marginTop: `${spacing.sm}px` }}
          >
            <Button variant="secondary" themeMode={themeMode} onClick={closeModal}>
              Cancel
            </Button>
          </div>
        </div>
      </Dialog>

      {/* 3. Global Help & Shortcuts Dialog */}
      <Dialog
        isOpen={activeModal === 'help'}
        onClose={closeModal}
        title="Keyboard Shortcuts & Navigation"
        description="Quickly navigate Daynori using single-key shortcuts."
        themeMode={themeMode}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.base}px` }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '14px',
              textAlign: 'left',
            }}
          >
            <thead>
              <tr style={{ borderBottom: `2px solid ${palette.border.strong}` }}>
                <th style={{ padding: `${spacing.xs}px ${spacing.sm}px` }}>Shortcut</th>
                <th style={{ padding: `${spacing.xs}px ${spacing.sm}px` }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {[
                { key: '?', action: 'Open Keyboard Shortcuts and Help' },
                { key: '/', action: 'Open Search modal' },
                { key: 'C', action: 'Open Create item modal' },
                { key: 'T', action: 'Navigate to Today view' },
                { key: 'P', action: 'Navigate to Plan view' },
                { key: 'K', action: 'Navigate to Calendar under Plan' },
                { key: 'L', action: 'Navigate to Library' },
                { key: 'J', action: 'Navigate to Journal' },
                { key: ',', action: 'Navigate to Settings' },
                { key: 'Esc', action: 'Close dialog, menu, or drawer' },
              ].map((row) => (
                <tr key={row.key} style={{ borderBottom: `1px solid ${palette.border.subtle}` }}>
                  <td style={{ padding: `${spacing.xs}px ${spacing.sm}px` }}>
                    <kbd
                      style={{
                        padding: '2px 6px',
                        borderRadius: '4px',
                        backgroundColor: palette.surfaceRaised,
                        border: `1px solid ${palette.border.strong}`,
                        fontWeight: 700,
                        color: palette.text.primary,
                      }}
                    >
                      {row.key}
                    </kbd>
                  </td>
                  <td style={{ padding: `${spacing.xs}px ${spacing.sm}px` }}>{row.action}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <Feedback
            severity="info"
            message="Shortcuts are suppressed while typing in inputs, textareas, or editable note content."
            themeMode={themeMode}
          />

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button variant="primary" themeMode={themeMode} onClick={closeModal}>
              Got It
            </Button>
          </div>
        </div>
      </Dialog>

      {/* 4. Global Account / Workspace Dialog */}
      <Dialog
        isOpen={activeModal === 'account'}
        onClose={closeModal}
        title="Workspace Profile"
        description="Current workspace scope and membership."
        themeMode={themeMode}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.base}px` }}>
          <div
            style={{
              padding: `${spacing.base}px`,
              backgroundColor: palette.surfaceRaised,
              borderRadius: `${radii.sm}px`,
              border: `1px solid ${palette.border.subtle}`,
            }}
          >
            {isAuthenticated && user ? (
              <>
                <div style={{ fontWeight: 700, fontSize: '16px' }}>
                  {user.displayName || user.email}
                </div>
                <div style={{ fontSize: '13px', color: palette.text.secondary, marginTop: '4px' }}>
                  User ID: {user.id}
                </div>
                <div style={{ fontSize: '13px', color: palette.text.secondary, marginTop: '2px' }}>
                  Email: {user.email} | Verified Session
                </div>
              </>
            ) : (
              <>
                <div style={{ fontWeight: 700, fontSize: '16px' }}>Not Signed In</div>
                <div style={{ fontSize: '13px', color: palette.text.secondary, marginTop: '4px' }}>
                  Operating in local offline mode.
                </div>
                <div style={{ fontSize: '13px', color: palette.text.secondary, marginTop: '2px' }}>
                  Sign in or create an account to synchronize across devices.
                </div>
              </>
            )}
          </div>

          <div style={{ display: 'flex', gap: `${spacing.sm}px`, justifyContent: 'flex-end' }}>
            {isAuthenticated ? (
              <Button
                variant="secondary"
                themeMode={themeMode}
                onClick={async () => {
                  await signOut();
                  closeModal();
                }}
              >
                Sign Out
              </Button>
            ) : (
              <Button
                variant="primary"
                themeMode={themeMode}
                onClick={() => {
                  closeModal();
                  openAuthModal();
                }}
              >
                Sign In / Sign Up
              </Button>
            )}
            <Button
              variant="secondary"
              themeMode={themeMode}
              onClick={() => navigateTo('/settings')}
            >
              Workspace Settings
            </Button>
            <Button variant="primary" themeMode={themeMode} onClick={closeModal}>
              Done
            </Button>
          </div>
        </div>
      </Dialog>

      {/* 5. Mobile Navigation Drawer */}
      <Dialog
        isOpen={isMobileDrawerOpen}
        onClose={() => setMobileDrawerOpen(false)}
        title="Navigation Menu"
        description="All organizer sections and workspace tools."
        themeMode={themeMode}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.xs}px` }}>
          <ListRow
            title="Today"
            subtitle="Immediate action, due tasks and routines"
            onClick={() => navigateTo('/today')}
            themeMode={themeMode}
          />
          <ListRow
            title="Plan: Tasks & Routines"
            subtitle="Task backlog, scheduled routines, and filters"
            onClick={() => navigateTo('/plan')}
            themeMode={themeMode}
          />
          <ListRow
            title="Plan: Calendar"
            subtitle="Agenda and month projections under Plan"
            onClick={() => navigateTo('/plan/calendar')}
            themeMode={themeMode}
          />
          <ListRow
            title="Library"
            subtitle="Folder hierarchy, notes, and files"
            onClick={() => navigateTo('/library')}
            themeMode={themeMode}
          />
          <ListRow
            title="Journal"
            subtitle="Reflective date timeline and entry editor"
            onClick={() => navigateTo('/journal')}
            themeMode={themeMode}
          />
          <div
            style={{
              borderTop: `1px solid ${palette.border.subtle}`,
              margin: `${spacing.xs}px 0`,
            }}
          />
          <ListRow
            title="Component Gallery"
            subtitle="Phase 04 design system and primitive test gallery"
            onClick={() => navigateTo('/review')}
            themeMode={themeMode}
          />
          <ListRow
            title="Settings"
            subtitle="Theme, text scaling, language, and motion"
            onClick={() => navigateTo('/settings')}
            themeMode={themeMode}
          />
          <ListRow
            title="Sync Diagnostics"
            subtitle="Queue status, connection health, and offline metrics"
            onClick={() => {
              closeModal();
              openModal('sync-diagnostics');
            }}
            themeMode={themeMode}
          />
          <ListRow
            title="Local Recovery Export"
            subtitle="Export offline drafts, conflicts, and pending work"
            onClick={() => {
              closeModal();
              openModal('recovery-export');
            }}
            themeMode={themeMode}
          />
        </div>
      </Dialog>

      {/* 6. Accessible Auth Modal */}
      <AuthModal />

      {/* 7. Onboarding Tutorial Dialog */}
      <OnboardingTutorial
        isOpen={activeModal === 'onboarding' || activeModal === 'onboarding-replay'}
        onClose={closeModal}
        isReplay={activeModal === 'onboarding-replay'}
      />

      {/* 8. Phase 34 Sync Diagnostics Dialog */}
      <SyncDiagnosticsDialog
        isOpen={activeModal === 'sync-diagnostics'}
        onClose={closeModal}
        diagnostics={syncDiagnostics}
        onRefresh={loadDiagnostics}
        onSyncNow={handleSyncNow}
        onOpenRecoveryExport={() => {
          void loadRecoveryExport();
          openModal('recovery-export');
        }}
        onReviewConflicts={handleOpenConflictReview}
        themeMode={themeMode}
      />

      {/* 9. Phase 34 Recovery Export Dialog */}
      <RecoveryExportDialog
        isOpen={activeModal === 'recovery-export'}
        onClose={closeModal}
        exportData={recoveryExport}
        themeMode={themeMode}
      />

      {/* 10. Phase 34 Conflict Review Dialog */}
      <ConflictReviewDialog
        isOpen={
          activeModal === 'conflict-review' || (activeConflict !== null && activeModal === null)
        }
        onClose={() => {
          setActiveConflict(null);
          if (activeModal === 'conflict-review') closeModal();
        }}
        conflict={activeConflict}
        onResolve={handleResolveConflict}
        themeMode={themeMode}
      />
      {/* 11. Phase 35 Workspace Portability Dialog (Export & Import) */}
      <WorkspacePortabilityDialog
        isOpen={activeModal === 'workspace-portability'}
        onClose={closeModal}
        workspaceId={workspaceId || ''}
        themeMode={themeMode}
        onRequestExport={async (password) => {
          if (!workspaceId) throw new Error('No active workspace selected');
          const client = createWebApiClient({ csrfToken });
          const reauthRes = await client.reauthenticate({
            purpose: 'protected_export',
            password,
            sessionBinding: workspaceId,
          });
          return await client.createWorkspaceExport(workspaceId, {
            reauthToken: reauthRes.reauthToken,
            includeAttachments: true,
          });
        }}
        onPreviewImport={async (archiveBase64) => {
          if (!workspaceId) throw new Error('No active workspace selected');
          const client = createWebApiClient({ csrfToken });
          return await client.previewWorkspaceImport(workspaceId, { archiveBase64 });
        }}
        onExecuteImport={async (previewId, duplicateStrategy) => {
          if (!workspaceId) throw new Error('No active workspace selected');
          const client = createWebApiClient({ csrfToken });
          return await client.executeWorkspaceImport(workspaceId, {
            previewId,
            duplicateStrategy,
          });
        }}
      />
    </>
  );
};
