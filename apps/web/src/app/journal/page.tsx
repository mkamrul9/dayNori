'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { colors, radii, spacing, touchTargets, typography } from '@daynori/design-tokens';
import {
  Button,
  Card,
  EmptyState,
  JournalEditor,
  RouteAnnouncer,
  TextField,
} from '@daynori/ui-web';
import {
  generateInitialRank,
  generateUuid,
  isEntryBackdated,
  resolveJournalTitle,
  type NoteDocument,
  type JournalPromptItem,
} from '@daynori/domain';
import { createApiClient, DaynoriApiClient } from '@daynori/api-client';
import type {
  ConflictRecord,
  DraftRecord,
  ItemHeaderRecord,
  JournalEntryRecord,
  PendingMutationRecord,
  SyncEngine,
} from '@daynori/sync';
import { useShell } from '../../components/ShellContext';
import { useAuth } from '../../components/AuthContext';
import { IndexedDbLocalRepository } from '../../data/indexedDbRepository';
import { createWebSyncEngine } from '../../data/syncAdapter';

/**
 * Computes calendar date YYYY-MM-DD for a given timezone.
 */
function getTodayIso(timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const y = parts.find((p) => p.type === 'year')?.value ?? '2026';
    const m = parts.find((p) => p.type === 'month')?.value ?? '10';
    const d = parts.find((p) => p.type === 'day')?.value ?? '16';
    return `${y}-${m}-${d}`;
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

/**
 * Adds or subtracts days from a YYYY-MM-DD string safely.
 */
function offsetDateIso(dateIso: string, dayOffset: number): string {
  try {
    const [y, m, d] = dateIso.split('-').map(Number);
    const date = new Date(Date.UTC(y!, m! - 1, d! + dayOffset));
    return date.toISOString().slice(0, 10);
  } catch {
    return dateIso;
  }
}

/**
 * Adds or subtracts months from a YYYY-MM-DD string safely.
 */
function offsetMonthIso(dateIso: string, monthOffset: number): string {
  try {
    const [y, m, d] = dateIso.split('-').map(Number);
    const date = new Date(Date.UTC(y!, m! - 1 + monthOffset, d!));
    return date.toISOString().slice(0, 10);
  } catch {
    return dateIso;
  }
}

export default function JournalPage() {
  const { themeMode } = useShell();
  const { isAuthenticated, openAuthModal, user, workspaceId } = useAuth();
  const palette = colors[themeMode];

  const userTimezone = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch {
      return 'UTC';
    }
  }, []);

  const todayIso = useMemo(() => getTodayIso(userTimezone), [userTimezone]);

  // Navigation & timeline filter state
  const [selectedDate, setSelectedDate] = useState<string>(todayIso);
  const [viewMode, setViewMode] = useState<'day' | 'timeline' | 'trash'>('day');
  const [searchQuery, setSearchQuery] = useState('');
  const [suppressSnippets, setSuppressSnippets] = useState(true);
  const [folders, setFolders] = useState<Array<{ id: string; name: string }>>([]);

  // Storage, sync engine, and namespace isolation
  const syncEngineRef = useRef<SyncEngine | null>(null);
  const localRepoRef = useRef<IndexedDbLocalRepository | null>(null);
  const apiClientRef = useRef<DaynoriApiClient | null>(null);
  const activeNamespaceRef = useRef<{ userId: string; workspaceId: string } | null>(null);

  // Status & live announcements
  const [localSaveStatus, setLocalSaveStatus] = useState<string>('Ready');
  const [cloudSyncStatus, setCloudSyncStatus] = useState<string>('Synced');
  const [liveAnnouncement, setLiveAnnouncement] = useState<string>('');

  // Entries and draft data
  const [entries, setEntries] = useState<JournalEntryRecord[]>([]);
  const [pendingDraft, setPendingDraft] = useState<DraftRecord | null>(null);
  const [activeConflict, setActiveConflict] = useState<ConflictRecord | null>(null);

  // Active writing surface state
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<JournalEntryRecord | null>(null);
  const activeDraftIdRef = useRef<string>(generateUuid());

  const announce = useCallback((msg: string) => {
    setLiveAnnouncement(msg);
  }, []);

  // Reload entries from local repository
  const reloadEntries = useCallback(async () => {
    const repo = localRepoRef.current;
    const currentNamespace = activeNamespaceRef.current;
    if (!repo || !currentNamespace) return;

    try {
      const allEntries = await repo.listJournalEntries(currentNamespace.workspaceId);
      // Guard against stale async resolution across account switch
      if (
        activeNamespaceRef.current?.userId !== currentNamespace.userId ||
        activeNamespaceRef.current?.workspaceId !== currentNamespace.workspaceId
      ) {
        return;
      }
      setEntries(allEntries);

      // Load folders for canonical placement from item headers
      const headers = await repo.listItemHeaders(currentNamespace.workspaceId);
      if (
        activeNamespaceRef.current?.userId === currentNamespace.userId &&
        activeNamespaceRef.current?.workspaceId === currentNamespace.workspaceId
      ) {
        setFolders(
          headers
            .filter((h) => h.kind === 'folder' && !h.deletedAt)
            .map((f) => ({ id: f.id, name: f.title || f.name || 'Untitled folder' }))
        );
      }

      // Check for pending recoverable drafts
      const drafts = await repo.listDrafts(currentNamespace.workspaceId, currentNamespace.userId);
      const journalDraft = drafts.find((d) => d.entityType === 'journal_entry');
      setPendingDraft(journalDraft || null);

      // Check for conflicts
      const conflicts = await repo.listConflicts(currentNamespace.workspaceId);
      const journalConflict = conflicts.find((c) => allEntries.some((e) => e.id === c.entityId));
      setActiveConflict(journalConflict || null);
    } catch {
      // Storage read error handled quietly
    }
  }, []);

  // Midnight date refresh timer for today
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const scheduleMidnight = () => {
      const now = new Date();
      const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
      timer = setTimeout(() => {
        setSelectedDate(getTodayIso(userTimezone));
        scheduleMidnight();
      }, midnight.getTime() - now.getTime());
    };
    scheduleMidnight();
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [userTimezone]);

  // Initialize storage & SyncEngine on mount / auth change
  useEffect(() => {
    let isCancelled = false;

    // Reset view state when account/workspace changes to prevent cross-account exposure
    setEntries([]);
    setPendingDraft(null);
    setActiveConflict(null);
    setIsEditorOpen(false);
    setEditingEntry(null);
    setFolders([]);

    if (syncEngineRef.current) {
      void syncEngineRef.current.stop();
      syncEngineRef.current = null;
    }
    if (localRepoRef.current) {
      void localRepoRef.current.close();
      localRepoRef.current = null;
    }

    if (!workspaceId || !user) {
      activeNamespaceRef.current = null;
      setLocalSaveStatus('Signed out');
      setCloudSyncStatus('Not connected');
      return;
    }

    activeNamespaceRef.current = { userId: user.id, workspaceId };

    const client = createApiClient({
      baseUrl: '/api',
    });
    apiClientRef.current = client;

    async function initStorage() {
      try {
        const repo = new IndexedDbLocalRepository();
        await repo.initialize({ userId: user!.id, workspaceId: workspaceId! });

        if (isCancelled) {
          await repo.close();
          return;
        }

        localRepoRef.current = repo;
        setLocalSaveStatus('Saved on this device');

        // Load persisted privacy preferences
        const snapshot = await repo.getPreferenceSnapshot(user!.id);
        const displayPrefs =
          (snapshot?.preferences?.displayPreferences as Record<string, unknown>) || {};
        if (typeof displayPrefs.suppressBodySnippets === 'boolean') {
          setSuppressSnippets(displayPrefs.suppressBodySnippets);
        }

        // Create and start sync engine
        const engine = createWebSyncEngine({
          repository: repo,
          apiClient: client,
          namespace: { userId: user!.id, workspaceId: workspaceId! },
        });
        syncEngineRef.current = engine;

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
                setCloudSyncStatus('Offline — saved on device');
                break;
              case 'conflict':
                setCloudSyncStatus('Sync conflict detected');
                break;
              case 'error':
                setCloudSyncStatus('Sync error');
                break;
            }
          } else if (
            evt.type === 'sync_completed' ||
            evt.type === 'conflict_detected' ||
            evt.type === 'conflict_resolved'
          ) {
            void reloadEntries();
          }
        });

        await engine.start();
        await reloadEntries();
      } catch {
        setLocalSaveStatus('Local storage unavailable');
      }
    }

    void initStorage();

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
  }, [user, workspaceId, reloadEntries]);

  // Open writing surface for a new entry
  const handleOpenNewEntry = useCallback(
    (targetDate: string = selectedDate) => {
      const newId = generateUuid();
      activeDraftIdRef.current = newId;
      setEditingEntry(null);
      setSelectedDate(targetDate);
      setIsEditorOpen(true);
      announce(`Opened reflection writing surface for ${targetDate}`);
    },
    [selectedDate, announce]
  );

  // Open writing surface to edit an existing entry
  const handleEditEntry = useCallback(
    (entry: JournalEntryRecord) => {
      setEditingEntry(entry);
      activeDraftIdRef.current = entry.id;
      setSelectedDate(entry.entryDate);
      setIsEditorOpen(true);
      announce(`Opened editor for ${entry.title || 'journal entry'}`);
    },
    [announce]
  );

  // Recover an existing draft
  const handleRecoverDraft = useCallback(() => {
    if (!pendingDraft?.payload) return;
    const p = pendingDraft.payload as {
      entryDate?: string;
      timezone?: string;
      title?: string;
      mood?: string | null;
      prompts?: JournalPromptItem[];
      tags?: string[];
      folderId?: string | null;
      document?: NoteDocument;
      plainText?: string;
      editingEntryId?: string | null;
    };

    if (p.editingEntryId) {
      const match = entries.find((e) => e.id === p.editingEntryId);
      if (match) {
        setEditingEntry({
          ...match,
          title: p.title ?? match.title,
          mood: p.mood ?? match.mood,
          prompts: p.prompts ?? match.prompts,
          tags: p.tags ?? match.tags,
          document: p.document ?? match.document,
          plainText: p.plainText ?? match.plainText,
          folderId: p.folderId !== undefined ? p.folderId : match.folderId,
        });
      }
    } else {
      setEditingEntry({
        id: pendingDraft.id,
        workspaceId: workspaceId ?? '',
        folderId: p.folderId ?? null,
        entryDate: p.entryDate ?? selectedDate,
        timezone: p.timezone ?? userTimezone,
        title: p.title ?? null,
        mood: p.mood ?? null,
        prompts: p.prompts ?? [],
        tags: p.tags ?? [],
        document: p.document ?? {
          version: 1,
          type: 'doc',
          content: [
            {
              id: generateUuid(),
              type: 'paragraph',
              content: [{ type: 'text', text: p.plainText ?? '' }],
            },
          ],
        },
        plainText: p.plainText ?? '',
        wordCount: 0,
        charCount: (p.plainText ?? '').length,
        isDraft: false,
        isArchived: false,
        isPinned: false,
        securityScope: 'standard',
        serverRevision: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      });
    }

    setPendingDraft(null);
    setIsEditorOpen(true);
    announce('Recovered unsaved draft into editor');
  }, [pendingDraft, entries, workspaceId, selectedDate, userTimezone, announce]);

  // Discard a pending draft
  const handleDiscardDraft = useCallback(async () => {
    if (!pendingDraft || !localRepoRef.current || !workspaceId || !user) return;
    try {
      await localRepoRef.current.deleteDraft(workspaceId, user.id, pendingDraft.id);
      setPendingDraft(null);
      announce('Unsaved draft discarded');
    } catch {
      // Discard error quieted
    }
  }, [pendingDraft, workspaceId, user, announce]);

  // Debounced durable draft persistence during writing
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleDraftChange = useCallback(
    (draftData: {
      title: string;
      entryDate: string;
      timezone: string;
      document: NoteDocument;
      plainText: string;
      mood: string | null;
      prompts: JournalPromptItem[];
      tags: string[];
      folderId?: string | null;
    }) => {
      const repo = localRepoRef.current;
      const currentNamespace = activeNamespaceRef.current;
      if (!repo || !currentNamespace) return;

      if (draftTimerRef.current) {
        clearTimeout(draftTimerRef.current);
      }

      draftTimerRef.current = setTimeout(async () => {
        try {
          if (
            activeNamespaceRef.current?.userId !== currentNamespace.userId ||
            activeNamespaceRef.current?.workspaceId !== currentNamespace.workspaceId
          ) {
            return;
          }
          await repo.saveDraft({
            id: activeDraftIdRef.current,
            workspaceId: currentNamespace.workspaceId,
            userId: currentNamespace.userId,
            entityType: 'journal_entry',
            entityId: editingEntry?.id ?? activeDraftIdRef.current,
            title: draftData.title || 'Untitled journal draft',
            payload: {
              ...draftData,
              editingEntryId: editingEntry?.id ?? null,
            },
            savedAt: new Date().toISOString(),
            isQuarantined: false,
            quarantinedAt: null,
          });
        } catch {
          // quiet draft error
        }
      }, 300);
    },
    [editingEntry]
  );

  // Serialized autosave executor
  const isSavingRef = useRef(false);
  const pendingSaveRef = useRef<{
    title: string;
    entryDate: string;
    timezone: string;
    document: NoteDocument;
    plainText: string;
    mood: string | null;
    prompts: JournalPromptItem[];
    tags: string[];
    folderId?: string | null;
  } | null>(null);

  // Save journal entry (atomic transaction with mutation intent and local persistence)
  const handleSaveEntry = useCallback(
    async (data: {
      title: string;
      entryDate: string;
      timezone: string;
      document: NoteDocument;
      plainText: string;
      mood: string | null;
      prompts: JournalPromptItem[];
      tags: string[];
      folderId?: string | null;
    }) => {
      const repo = localRepoRef.current;
      if (!repo || !workspaceId || !user) {
        setLocalSaveStatus('Storage error: not initialized');
        throw new Error('Storage not initialized');
      }

      if (isSavingRef.current) {
        pendingSaveRef.current = data;
        return;
      }

      isSavingRef.current = true;
      setLocalSaveStatus('Saving on device...');
      const nowIso = new Date().toISOString();
      const isNew = !editingEntry;
      const entryId = editingEntry?.id ?? activeDraftIdRef.current;
      const baseRev = editingEntry?.serverRevision ?? 0;

      const resolvedTitle =
        data.title.trim() ||
        resolveJournalTitle(null, data.entryDate, data.plainText, {
          suppressBodySnippet: suppressSnippets,
        });

      const itemHeader: ItemHeaderRecord = {
        id: entryId,
        workspaceId,
        kind: 'journal',
        title: resolvedTitle,
        folderId: data.folderId ?? null,
        rank: editingEntry ? generateInitialRank(0) : generateInitialRank(0),
        isArchived: editingEntry?.isArchived ?? false,
        isPinned: false,
        securityScope: 'standard',
        serverRevision: baseRev,
        createdAt: editingEntry?.createdAt ?? nowIso,
        updatedAt: nowIso,
        deletedAt: null,
      };

      const wordCount = data.plainText.split(/\s+/).filter(Boolean).length;

      const journalEntry: JournalEntryRecord = {
        id: entryId,
        workspaceId,
        folderId: data.folderId ?? null,
        entryDate: data.entryDate,
        timezone: data.timezone,
        title: data.title.trim() || null,
        mood: data.mood || null,
        prompts: data.prompts,
        tags: data.tags,
        document: data.document,
        plainText: data.plainText,
        wordCount,
        charCount: data.plainText.length,
        isDraft: false,
        isArchived: editingEntry?.isArchived ?? false,
        isPinned: false,
        securityScope: 'standard',
        serverRevision: baseRev,
        createdAt: editingEntry?.createdAt ?? nowIso,
        updatedAt: nowIso,
        deletedAt: null,
      };

      const mutation: PendingMutationRecord = {
        operationId: generateUuid(),
        deviceId: 'web-local',
        workspaceId,
        userId: user.id,
        entityType: 'journal',
        entityId: entryId,
        action: isNew ? 'create' : 'update',
        command: isNew ? 'createJournalEntry' : 'updateJournalEntry',
        baseRevision: baseRev,
        payload: {
          id: entryId,
          entryDate: data.entryDate,
          timezone: data.timezone,
          title: data.title.trim() || null,
          mood: data.mood || null,
          prompts: data.prompts,
          tags: data.tags,
          document: data.document,
          plainText: data.plainText,
          folderId: data.folderId ?? null,
          baseRevision: baseRev,
        },
        dependencyOperationIds: [],
        clientTimestamp: nowIso,
        retryCount: 0,
        status: 'pending',
        lastError: null,
      };

      try {
        await repo.saveItemTransaction(
          itemHeader,
          mutation,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          journalEntry
        );

        // Update editingEntry with the saved entry so subsequent saves are updates
        setEditingEntry(journalEntry);
        setLocalSaveStatus('Saved on this device');

        // Delete any draft tied to this editing session ONLY after replacement is durable
        await repo.deleteDraft(workspaceId, user.id, activeDraftIdRef.current);
        if (pendingDraft && pendingDraft.id === activeDraftIdRef.current) {
          setPendingDraft(null);
        }

        await reloadEntries();
        announce(`Journal reflection for ${data.entryDate} saved.`);

        // Trigger immediate sync push if engine is running
        if (syncEngineRef.current) {
          void syncEngineRef.current.syncNow().catch(() => {});
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Storage write failed';
        setLocalSaveStatus(`Save error: ${errorMsg}`);
        throw err;
      } finally {
        isSavingRef.current = false;
        if (pendingSaveRef.current) {
          const nextData = pendingSaveRef.current;
          pendingSaveRef.current = null;
          void handleSaveEntry(nextData);
        }
      }
    },
    [editingEntry, workspaceId, user, suppressSnippets, pendingDraft, reloadEntries, announce]
  );

  // Conflict resolution handler
  const handleResolveConflict = useCallback(
    async (resolution: 'keep_server' | 'keep_local' | 'save_copy') => {
      const engine = syncEngineRef.current;
      const repo = localRepoRef.current;
      const currentNamespace = activeNamespaceRef.current;
      if (!engine || !repo || !currentNamespace || !activeConflict) return;

      try {
        await engine.resolveConflict(activeConflict.id, resolution);
        setActiveConflict(null);
        await reloadEntries();
        announce(`Conflict resolved with ${resolution.replace('_', ' ')}.`);
      } catch (err) {
        setLocalSaveStatus(err instanceof Error ? err.message : 'Conflict resolution failed');
      }
    },
    [activeConflict, reloadEntries, announce]
  );

  // Privacy snippet toggle persisting to account preferences
  const handleToggleSnippets = useCallback(async () => {
    const nextVal = !suppressSnippets;
    setSuppressSnippets(nextVal);
    const repo = localRepoRef.current;
    const currentNamespace = activeNamespaceRef.current;
    if (repo && currentNamespace) {
      try {
        const snapshot = await repo.getPreferenceSnapshot(currentNamespace.userId);
        const existingPrefs = (snapshot?.preferences as Record<string, unknown>) || {};
        const existingDisplay = (existingPrefs.displayPreferences as Record<string, unknown>) || {};
        const updatedDisplay = {
          theme: (existingDisplay.theme as 'system' | 'light' | 'dark') || 'system',
          compactMode: Boolean(existingDisplay.compactMode),
          journalPreviewHidden:
            existingDisplay.journalPreviewHidden !== undefined
              ? Boolean(existingDisplay.journalPreviewHidden)
              : true,
          suppressBodySnippets: nextVal,
        };
        await repo.savePreferenceSnapshot({
          userId: currentNamespace.userId,
          preferences: {
            ...existingPrefs,
            displayPreferences: updatedDisplay,
          },
          schemaVersion: snapshot?.schemaVersion ?? 1,
          revision: (snapshot?.revision ?? 0) + 1,
          updatedAt: new Date().toISOString(),
        });
        if (apiClientRef.current) {
          void apiClientRef.current
            .updateUserPreferences({
              preferences: updatedDisplay,
            })
            .catch(() => {});
        }
      } catch {
        // quiet
      }
    }
  }, [suppressSnippets]);

  // Trash an entry
  const handleTrashEntry = useCallback(
    async (entry: JournalEntryRecord) => {
      const repo = localRepoRef.current;
      if (!repo || !workspaceId || !user) return;

      const nowIso = new Date().toISOString();
      const itemHeader: ItemHeaderRecord = {
        id: entry.id,
        workspaceId,
        kind: 'journal',
        title: entry.title || resolveJournalTitle(null, entry.entryDate, entry.plainText),
        folderId: entry.folderId ?? null,
        rank: generateInitialRank(0),
        isArchived: entry.isArchived,
        isPinned: false,
        securityScope: 'standard',
        serverRevision: entry.serverRevision,
        createdAt: entry.createdAt,
        updatedAt: nowIso,
        deletedAt: nowIso,
      };

      const updatedJournal: JournalEntryRecord = {
        ...entry,
        deletedAt: nowIso,
        updatedAt: nowIso,
      };

      const mutation: PendingMutationRecord = {
        operationId: generateUuid(),
        deviceId: 'web-local',
        workspaceId,
        userId: user.id,
        entityType: 'journal',
        entityId: entry.id,
        action: 'delete',
        command: 'trashJournalEntry',
        baseRevision: entry.serverRevision,
        payload: {
          baseRevision: entry.serverRevision,
        },
        dependencyOperationIds: [],
        clientTimestamp: nowIso,
        retryCount: 0,
        status: 'pending',
        lastError: null,
      };

      try {
        await repo.saveItemTransaction(
          itemHeader,
          mutation,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          updatedJournal
        );
        setIsEditorOpen(false);
        setEditingEntry(null);
        await reloadEntries();
        announce('Moved entry to Trash');
        if (syncEngineRef.current) {
          void syncEngineRef.current.syncNow().catch(() => {});
        }
      } catch {
        announce('Failed to move entry to Trash');
      }
    },
    [workspaceId, user, reloadEntries, announce]
  );

  // Restore an entry from Trash
  const handleRestoreEntry = useCallback(
    async (entry: JournalEntryRecord) => {
      const repo = localRepoRef.current;
      if (!repo || !workspaceId || !user) return;

      const nowIso = new Date().toISOString();
      const itemHeader: ItemHeaderRecord = {
        id: entry.id,
        workspaceId,
        kind: 'journal',
        title: entry.title || resolveJournalTitle(null, entry.entryDate, entry.plainText),
        folderId: entry.folderId ?? null,
        rank: generateInitialRank(0),
        isArchived: entry.isArchived,
        isPinned: false,
        securityScope: 'standard',
        serverRevision: entry.serverRevision,
        createdAt: entry.createdAt,
        updatedAt: nowIso,
        deletedAt: null,
      };

      const updatedJournal: JournalEntryRecord = {
        ...entry,
        deletedAt: null,
        updatedAt: nowIso,
      };

      const mutation: PendingMutationRecord = {
        operationId: generateUuid(),
        deviceId: 'web-local',
        workspaceId,
        userId: user.id,
        entityType: 'journal',
        entityId: entry.id,
        action: 'update',
        command: 'restoreJournalEntry',
        baseRevision: entry.serverRevision,
        payload: {
          baseRevision: entry.serverRevision,
        },
        dependencyOperationIds: [],
        clientTimestamp: nowIso,
        retryCount: 0,
        status: 'pending',
        lastError: null,
      };

      try {
        await repo.saveItemTransaction(
          itemHeader,
          mutation,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          updatedJournal
        );
        await reloadEntries();
        announce('Restored entry from Trash');
        if (syncEngineRef.current) {
          void syncEngineRef.current.syncNow().catch(() => {});
        }
      } catch {
        announce('Failed to restore entry');
      }
    },
    [workspaceId, user, reloadEntries, announce]
  );

  // Filtered entries for current view
  const visibleEntries = useMemo(() => {
    return entries.filter((e) => {
      if (viewMode === 'trash') {
        return Boolean(e.deletedAt);
      }
      if (e.deletedAt) return false;

      // In search mode, search across all non-deleted entries
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = (e.title ?? '').toLowerCase().includes(q);
        const matchesTags = (e.tags ?? []).some((t) => t.toLowerCase().includes(q));
        const matchesMood = (e.mood ?? '').toLowerCase().includes(q);
        const matchesBody = (e.plainText ?? '').toLowerCase().includes(q);
        return matchesTitle || matchesTags || matchesMood || matchesBody;
      }

      if (viewMode === 'day') {
        return e.entryDate === selectedDate;
      }

      return true; // timeline view
    });
  }, [entries, viewMode, searchQuery, selectedDate]);

  if (!isAuthenticated) {
    return (
      <div
        style={{
          maxWidth: '860px',
          margin: '0 auto',
          padding: `${spacing.lg}px ${spacing.base}px`,
          width: '100%',
          boxSizing: 'border-box',
        }}
      >
        <EmptyState
          id="journal-auth-required"
          title="Sign in required to view your Journal"
          description="Your reflection journal contains private records. Sign in or create an account to access your personal timeline."
          actionLabel="Sign In or Create Account"
          onAction={() => openAuthModal('/journal')}
          themeMode={themeMode}
          icon="🔒"
        />
      </div>
    );
  }

  // Active Writing / Editing Full Screen Surface
  if (isEditorOpen) {
    return (
      <main
        id="main-content"
        style={{
          maxWidth: '920px',
          margin: '0 auto',
          padding: `${spacing.base}px`,
          width: '100%',
          boxSizing: 'border-box',
        }}
      >
        <RouteAnnouncer message={liveAnnouncement} />
        <JournalEditor
          id={editingEntry?.id ?? activeDraftIdRef.current}
          initialTitle={editingEntry?.title ?? ''}
          initialEntryDate={editingEntry?.entryDate ?? selectedDate}
          initialTimezone={editingEntry?.timezone ?? userTimezone}
          initialDocument={editingEntry?.document}
          initialPlainText={editingEntry?.plainText ?? ''}
          initialMood={editingEntry?.mood ?? null}
          initialPrompts={editingEntry?.prompts ?? []}
          initialTags={editingEntry?.tags ?? []}
          initialFolderId={editingEntry?.folderId ?? null}
          folders={folders}
          themeMode={themeMode}
          localSaveStatus={localSaveStatus}
          cloudSyncStatus={cloudSyncStatus}
          conflict={
            activeConflict
              ? {
                  serverRevision: activeConflict.serverRevision,
                  serverTitle: (activeConflict.serverState as { title?: string })?.title,
                }
              : null
          }
          onDraftChange={handleDraftChange}
          onSave={handleSaveEntry}
          onResolveConflict={handleResolveConflict}
          onTrash={editingEntry ? () => handleTrashEntry(editingEntry) : undefined}
          onClose={() => {
            setIsEditorOpen(false);
            setEditingEntry(null);
          }}
          autoFocus={true}
        />
      </main>
    );
  }

  return (
    <main
      id="main-content"
      style={{
        maxWidth: '860px',
        margin: '0 auto',
        padding: `${spacing.lg}px ${spacing.base}px`,
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      <RouteAnnouncer message={liveAnnouncement} />

      {/* Header Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: `${spacing.sm}px`,
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
            Journal
          </h1>
          <p style={{ margin: '4px 0 0 0', color: palette.text.secondary }}>
            A calm, distraction-free space for daily reflections and personal notes.
          </p>
        </div>

        <div style={{ display: 'flex', gap: `${spacing.xs}px`, alignItems: 'center' }}>
          <Button
            size="compact"
            variant="primary"
            themeMode={themeMode}
            data-testid="write-entry-button"
            onClick={() => handleOpenNewEntry(selectedDate)}
          >
            ✍️ Write Entry
          </Button>
        </div>
      </div>

      {/* Recoverable Draft Notice Banner */}
      {pendingDraft && (
        <div
          data-testid="journal-draft-recovery-banner"
          style={{
            marginBottom: `${spacing.base}px`,
            padding: `${spacing.sm}px ${spacing.base}px`,
            backgroundColor: palette.action.subtle,
            border: `1px solid ${palette.border.subtle}`,
            borderRadius: `${radii.sm}px`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: `${spacing.sm}px`,
          }}
        >
          <div>
            <span style={{ fontWeight: 600, color: palette.action.subtleText }}>
              📝 Recoverable draft found
            </span>
            <span style={{ marginLeft: '8px', fontSize: '13px', color: palette.text.secondary }}>
              Unsaved draft from {new Date(pendingDraft.savedAt).toLocaleTimeString()}
            </span>
          </div>
          <div style={{ display: 'flex', gap: `${spacing.xs}px` }}>
            <Button
              size="compact"
              variant="subtle"
              themeMode={themeMode}
              onClick={handleDiscardDraft}
            >
              Discard
            </Button>
            <Button
              size="compact"
              variant="primary"
              themeMode={themeMode}
              data-testid="recover-draft-button"
              onClick={handleRecoverDraft}
            >
              Resume Writing
            </Button>
          </div>
        </div>
      )}

      {/* Navigation Controls: Views & Date Selector */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: `${spacing.sm}px`,
          padding: `${spacing.sm}px 0`,
          borderBottom: `1px solid ${palette.border.subtle}`,
          marginBottom: `${spacing.base}px`,
        }}
      >
        {/* View Mode Tabs */}
        <div role="tablist" aria-label="Journal views" style={{ display: 'flex', gap: '4px' }}>
          <Button
            size="compact"
            variant={viewMode === 'day' ? 'primary' : 'subtle'}
            themeMode={themeMode}
            role="tab"
            aria-selected={viewMode === 'day'}
            data-testid="tab-day-view"
            onClick={() => setViewMode('day')}
          >
            Day View
          </Button>
          <Button
            size="compact"
            variant={viewMode === 'timeline' ? 'primary' : 'subtle'}
            themeMode={themeMode}
            role="tab"
            aria-selected={viewMode === 'timeline'}
            data-testid="tab-timeline-view"
            onClick={() => setViewMode('timeline')}
          >
            Timeline
          </Button>
          <Button
            size="compact"
            variant={viewMode === 'trash' ? 'primary' : 'subtle'}
            themeMode={themeMode}
            role="tab"
            aria-selected={viewMode === 'trash'}
            data-testid="tab-trash-view"
            onClick={() => setViewMode('trash')}
          >
            Trash
          </Button>
        </div>

        {/* Date Stepper (When in Day View) */}
        {viewMode === 'day' && (
          <div
            data-testid="journal-date-stepper"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}
          >
            <Button
              size="compact"
              variant="subtle"
              themeMode={themeMode}
              aria-label="Previous month"
              data-testid="prev-month-button"
              onClick={() => setSelectedDate((d) => offsetMonthIso(d, -1))}
            >
              ◀ Month
            </Button>
            <Button
              size="compact"
              variant="subtle"
              themeMode={themeMode}
              aria-label="Previous day"
              data-testid="prev-day-button"
              onClick={() => setSelectedDate((d) => offsetDateIso(d, -1))}
            >
              ◀
            </Button>
            <input
              type="date"
              value={selectedDate}
              data-testid="journal-date-picker"
              aria-label="Jump to specific date"
              onChange={(e) => {
                if (e.target.value) setSelectedDate(e.target.value);
              }}
              style={{
                padding: '6px 10px',
                borderRadius: `${radii.sm}px`,
                border: `1px solid ${palette.border.strong}`,
                backgroundColor: palette.surface,
                color: palette.text.primary,
                fontSize: `${typography.webScale.body}px`,
                minHeight: `${touchTargets.webMin}px`,
              }}
            />
            <Button
              size="compact"
              variant="subtle"
              themeMode={themeMode}
              aria-label="Next day"
              data-testid="next-day-button"
              onClick={() => setSelectedDate((d) => offsetDateIso(d, 1))}
            >
              ▶
            </Button>
            <Button
              size="compact"
              variant="subtle"
              themeMode={themeMode}
              aria-label="Next month"
              data-testid="next-month-button"
              onClick={() => setSelectedDate((d) => offsetMonthIso(d, 1))}
            >
              Month ▶
            </Button>
            <Button
              size="compact"
              variant={selectedDate === todayIso ? 'subtle' : 'secondary'}
              themeMode={themeMode}
              data-testid="today-jump-button"
              onClick={() => setSelectedDate(todayIso)}
            >
              Today
            </Button>
          </div>
        )}
      </div>

      {/* Journal-Scoped Search & Privacy Snippet Toggle */}
      <div
        role="search"
        aria-label="Search Journal"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: `${spacing.sm}px`,
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: `${spacing.base}px`,
        }}
      >
        <div style={{ flex: '1 1 280px', display: 'flex', gap: '8px', alignItems: 'center' }}>
          <TextField
            id="journal-search-input"
            label="Search Journal"
            placeholder="Search entries by title, tags, or reflections..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            themeMode={themeMode}
          />
          <span
            data-testid="journal-scope-indicator"
            style={{
              fontSize: '11px',
              padding: '4px 8px',
              borderRadius: `${radii.pill}px`,
              backgroundColor: palette.action.subtle,
              color: palette.action.subtleText,
              fontWeight: 600,
              whiteSpace: 'nowrap',
              alignSelf: 'flex-end',
              marginBottom: '4px',
            }}
          >
            Scope: Journal only
          </span>
        </div>

        {/* Privacy snippet toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Button
            size="compact"
            variant="subtle"
            themeMode={themeMode}
            data-testid="toggle-snippets-button"
            aria-label={
              suppressSnippets
                ? 'Unhide reflection text snippets'
                : 'Hide reflection text snippets for privacy'
            }
            onClick={handleToggleSnippets}
          >
            {suppressSnippets ? '👁️ Show Snippets' : '🔒 Hide Snippets'}
          </Button>
        </div>
      </div>

      {/* Date Header for Day View */}
      {viewMode === 'day' && !searchQuery.trim() && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            marginBottom: `${spacing.sm}px`,
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: `${typography.webScale.sectionHeading}px`,
              fontWeight: 700,
              color: palette.text.primary,
            }}
          >
            {selectedDate === todayIso ? 'Today' : selectedDate}
            {isEntryBackdated(selectedDate, new Date(), userTimezone) && (
              <span
                data-testid="day-backdated-indicator"
                style={{
                  marginLeft: '8px',
                  fontSize: '11px',
                  padding: '2px 8px',
                  borderRadius: `${radii.pill}px`,
                  backgroundColor: palette.accent.subtle,
                  color: palette.accent.label,
                  fontWeight: 600,
                }}
              >
                Past date
              </span>
            )}
          </h2>
          <span style={{ fontSize: '13px', color: palette.text.secondary }}>
            {visibleEntries.length} {visibleEntries.length === 1 ? 'entry' : 'entries'}
          </span>
        </div>
      )}

      {/* Entries List or Empty State */}
      {visibleEntries.length === 0 ? (
        <EmptyState
          id="journal-empty-state"
          title={
            searchQuery.trim()
              ? 'No matching journal entries'
              : viewMode === 'trash'
                ? 'Trash is empty'
                : `No entries for ${selectedDate}`
          }
          description={
            searchQuery.trim()
              ? 'Try adjusting your search terms or clearing the query.'
              : viewMode === 'trash'
                ? 'Items moved to trash will appear here for recovery.'
                : 'Take a quiet moment to write about your day.'
          }
          actionLabel={
            viewMode === 'trash' || searchQuery.trim()
              ? undefined
              : `Write Entry for ${selectedDate}`
          }
          onAction={
            viewMode === 'trash' || searchQuery.trim()
              ? undefined
              : () => handleOpenNewEntry(selectedDate)
          }
          themeMode={themeMode}
          icon={viewMode === 'trash' ? '🗑️' : '📖'}
        />
      ) : (
        <div
          role="feed"
          aria-label="Journal entries"
          style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.base}px` }}
        >
          {visibleEntries.map((entry) => {
            const displayTitle = resolveJournalTitle(
              entry.title,
              entry.entryDate,
              entry.plainText,
              { suppressBodySnippet: suppressSnippets }
            );

            return (
              <Card key={entry.id} themeMode={themeMode}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    marginBottom: '4px',
                    flexWrap: 'wrap',
                    gap: '4px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span
                      style={{
                        fontSize: '12px',
                        fontWeight: 600,
                        color: palette.action.primary,
                      }}
                    >
                      📅 {entry.entryDate}
                    </span>
                    {isEntryBackdated(entry.entryDate, entry.createdAt, entry.timezone) && (
                      <span
                        data-testid="entry-backdated-badge"
                        style={{
                          fontSize: '11px',
                          padding: '2px 6px',
                          borderRadius: `${radii.pill}px`,
                          backgroundColor: palette.accent.subtle,
                          color: palette.accent.label,
                          fontWeight: 600,
                        }}
                      >
                        🕒 Backdated
                      </span>
                    )}
                    {entry.mood && (
                      <span
                        data-testid={`entry-mood-${entry.mood}`}
                        style={{
                          fontSize: '12px',
                          padding: '2px 8px',
                          borderRadius: `${radii.pill}px`,
                          backgroundColor: palette.surfaceRaised,
                          color: palette.text.primary,
                        }}
                      >
                        Mood: {entry.mood}
                      </span>
                    )}
                  </div>

                  {/* Actions Bar */}
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {viewMode === 'trash' ? (
                      <Button
                        size="compact"
                        variant="subtle"
                        themeMode={themeMode}
                        data-testid={`restore-entry-${entry.id}`}
                        onClick={() => handleRestoreEntry(entry)}
                      >
                        Restore
                      </Button>
                    ) : (
                      <>
                        <Button
                          size="compact"
                          variant="subtle"
                          themeMode={themeMode}
                          data-testid={`edit-entry-${entry.id}`}
                          onClick={() => handleEditEntry(entry)}
                        >
                          ✏️ Edit
                        </Button>
                        <Button
                          size="compact"
                          variant="subtle"
                          themeMode={themeMode}
                          data-testid={`trash-entry-${entry.id}`}
                          onClick={() => handleTrashEntry(entry)}
                        >
                          🗑️
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                <h2
                  tabIndex={0}
                  role="button"
                  data-testid={`entry-title-${entry.id}`}
                  onClick={() => handleEditEntry(entry)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleEditEntry(entry);
                    }
                  }}
                  style={{
                    margin: '0 0 8px 0',
                    fontSize: `${typography.webScale.sectionHeading}px`,
                    fontWeight: 700,
                    color: palette.text.primary,
                    cursor: 'pointer',
                  }}
                >
                  {displayTitle}
                </h2>

                {/* Privacy Snippet: suppressed by default */}
                {!suppressSnippets && entry.plainText && (
                  <p
                    data-testid={`entry-snippet-${entry.id}`}
                    style={{
                      margin: '0 0 8px 0',
                      fontSize: `${typography.webScale.body}px`,
                      color: palette.text.secondary,
                      lineHeight: typography.lineHeight.relaxed,
                      whiteSpace: 'pre-wrap',
                      overflowWrap: 'anywhere',
                    }}
                  >
                    {entry.plainText.slice(0, 160)}
                    {entry.plainText.length > 160 ? '…' : ''}
                  </p>
                )}

                {/* Tags Bar */}
                {entry.tags && entry.tags.length > 0 && (
                  <div
                    style={{
                      display: 'flex',
                      gap: '4px',
                      flexWrap: 'wrap',
                      marginTop: '6px',
                    }}
                  >
                    {entry.tags.map((t) => (
                      <span
                        key={t}
                        style={{
                          fontSize: '11px',
                          padding: '2px 8px',
                          borderRadius: `${radii.pill}px`,
                          backgroundColor: palette.action.subtle,
                          color: palette.action.subtleText,
                          fontWeight: 500,
                        }}
                      >
                        #{t}
                      </span>
                    ))}
                  </div>
                )}

                {/* Metadata Footer */}
                <div
                  style={{
                    marginTop: `${spacing.sm}px`,
                    fontSize: '12px',
                    color: palette.text.secondary,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    borderTop: `1px solid ${palette.border.subtle}`,
                    paddingTop: '6px',
                  }}
                >
                  <span>{entry.wordCount} words</span>
                  <span>{localSaveStatus}</span>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </main>
  );
}
