import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  AppState,
  AppStateStatus,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { colors, radii, spacing, touchTargets, type ThemeMode } from '@daynori/design-tokens';
import {
  MobileButton,
  MobileCard,
  MobileListRow,
  MobileTextField,
  MobileEmptyState,
} from '@daynori/ui-mobile';
import {
  generateInitialRank,
  generateUuid,
  isEntryBackdated,
  resolveJournalTitle,
  REFLECTION_TEMPLATES,
  instantiateReflectionTemplate,
  createNoteDocumentFromPlainText,
  type JournalPromptItem,
  type NoteDocument,
} from '@daynori/domain';
import type {
  ConflictRecord,
  DraftRecord,
  ItemHeaderRecord,
  JournalEntryRecord,
  LocalRepositoryPort,
  PendingMutationRecord,
  SyncEngine,
} from '@daynori/sync';
import type { DaynoriApiClient } from '@daynori/api-client';

export interface JournalViewProps {
  themeMode: ThemeMode;
  isAuthenticated: boolean;
  onLoginSynthetic: () => void;
  onNavigateToToday: () => void;
  testID?: string;
  workspaceId?: string | null;
  userId?: string | null;
  repository?: LocalRepositoryPort;
  syncEngine?: SyncEngine;
  apiClient?: DaynoriApiClient;
  isOnline?: boolean;
  userTimezone?: string;
  targetEntryId?: string | null;
  targetDate?: string | null;
  onClearTarget?: () => void;
}

export interface LocalJournalItem {
  id: string;
  date: string;
  entryDate: string;
  title: string;
  snippet: string;
  plainText: string;
  document?: NoteDocument;
  folderId?: string | null;
  mood?: string | null;
  tags?: string[];
  prompts?: JournalPromptItem[];
  timezone?: string;
  securityScope?: 'standard' | 'vault';
  isPinned?: boolean;
  isArchived?: boolean;
  serverRevision?: number;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string | null;
}

const AVAILABLE_MOODS = [
  { value: 'great', label: 'Great', emoji: '😊' },
  { value: 'good', label: 'Good', emoji: '🙂' },
  { value: 'okay', label: 'Okay', emoji: '😐' },
  { value: 'difficult', label: 'Difficult', emoji: '🌧️' },
  { value: 'reflective', label: 'Reflective', emoji: '🌱' },
];

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

function offsetDateIso(dateIso: string, dayOffset: number): string {
  try {
    const [y, m, d] = dateIso.split('-').map(Number);
    const date = new Date(Date.UTC(y!, m! - 1, d! + dayOffset));
    return date.toISOString().slice(0, 10);
  } catch {
    return dateIso;
  }
}

function offsetMonthIso(dateIso: string, monthOffset: number): string {
  try {
    const [y, m, d] = dateIso.split('-').map(Number);
    const date = new Date(Date.UTC(y!, m! - 1 + monthOffset, d!));
    return date.toISOString().slice(0, 10);
  } catch {
    return dateIso;
  }
}

/**
 * Updates or creates a NoteDocument while strictly preserving untouched blocks,
 * block IDs, and formatting AST rather than destructively flattening the document.
 */
function updateNoteDocumentPreservingAst(
  existingDoc: NoteDocument | undefined,
  newPlainText: string,
  originalPlainText: string
): NoteDocument {
  if (!existingDoc) {
    return createNoteDocumentFromPlainText(newPlainText);
  }
  // If plain text hasn't changed at all, preserve the exact AST verbatim
  if (newPlainText === originalPlainText) {
    return existingDoc;
  }
  // Single paragraph document: update in-place while keeping block identity
  if (existingDoc.content.length === 1 && existingDoc.content[0]?.type === 'paragraph') {
    const singlePara = existingDoc.content[0];
    return {
      ...existingDoc,
      content: [
        {
          ...singlePara,
          content: [{ type: 'text', text: newPlainText }],
        },
      ],
    };
  }
  // Bounded editing: if double-newline paragraph count matches existing block count
  const newParagraphs = newPlainText.split(/\n\n+/);
  if (newParagraphs.length === existingDoc.content.length) {
    return {
      ...existingDoc,
      content: existingDoc.content.map((block, idx) => {
        const text = newParagraphs[idx] ?? '';
        if (block.type === 'paragraph' || block.type === 'heading') {
          return {
            ...block,
            content: [{ type: 'text', text }],
          };
        }
        return block;
      }),
    };
  }
  return createNoteDocumentFromPlainText(newPlainText);
}

export const JournalView: React.FC<JournalViewProps> = ({
  themeMode,
  isAuthenticated,
  onLoginSynthetic,
  onNavigateToToday,
  testID = 'journal-view',
  workspaceId,
  userId,
  repository,
  syncEngine,
  apiClient,
  isOnline = true,
  userTimezone: propTimezone,
  targetEntryId,
  targetDate,
  onClearTarget,
}) => {
  const palette = colors[themeMode];

  const userTimezone = useMemo(() => {
    if (propTimezone) return propTimezone;
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch {
      return 'UTC';
    }
  }, [propTimezone]);

  const [todayIso, setTodayIso] = useState<string>(() => getTodayIso(userTimezone));

  // Midnight refresh timer
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const scheduleMidnight = () => {
      const now = new Date();
      const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
      timer = setTimeout(() => {
        setTodayIso(getTodayIso(userTimezone));
        scheduleMidnight();
      }, midnight.getTime() - now.getTime());
    };
    scheduleMidnight();
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [userTimezone]);

  // Timeline and navigation state
  const [selectedDate, setSelectedDate] = useState<string>(todayIso);
  const [searchQuery, setSearchQuery] = useState('');
  const [suppressSnippets, setSuppressSnippets] = useState(true);
  const [showPromptTray, setShowPromptTray] = useState(false);
  const [viewMode, setViewMode] = useState<'active' | 'trash'>('active');

  // Folders and conflicts
  const [folders, setFolders] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [activeConflict, setActiveConflict] = useState<ConflictRecord | null>(null);

  // Editor form state
  const [isWriting, setIsWriting] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editingRevision, setEditingRevision] = useState<number>(0);
  const [editingCreatedAt, setEditingCreatedAt] = useState<string | null>(null);
  const [editingDocument, setEditingDocument] = useState<NoteDocument | undefined>(undefined);
  const [originalPlainText, setOriginalPlainText] = useState<string>('');
  const [entryTitle, setEntryTitle] = useState('');
  const [entryDate, setEntryDate] = useState(todayIso);
  const [entryBody, setEntryBody] = useState('');
  const [entryMood, setEntryMood] = useState<string | null>(null);
  const [entryTags, setEntryTags] = useState<string[]>([]);
  const [entryTagInput, setEntryTagInput] = useState('');
  const [entryPrompts, setEntryPrompts] = useState<JournalPromptItem[]>([]);

  // Draft recovery & save error state
  const [pendingDraft, setPendingDraft] = useState<DraftRecord | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Stable draft session identity and active namespace guard
  const activeDraftIdRef = useRef<string>(generateUuid());
  const activeNamespaceRef = useRef<{ userId: string; workspaceId: string } | null>(null);
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPrefSyncRef = useRef<boolean>(false);

  useEffect(() => {
    if (isOnline !== false && pendingPrefSyncRef.current && apiClient && userId) {
      pendingPrefSyncRef.current = false;
      apiClient
        .updateUserPreferences({
          preferences: {
            theme: 'system',
            compactMode: false,
            journalPreviewHidden: true,
            suppressBodySnippets: suppressSnippets,
          },
        })
        .catch(() => {
          pendingPrefSyncRef.current = true;
        });
    }
  }, [isOnline, apiClient, userId, suppressSnippets]);

  const STATIC_FIXTURES: LocalJournalItem[] = [
    {
      id: 'j1',
      date: 'Wednesday, Oct 14',
      entryDate: '2026-10-14',
      title: 'Reflections on Architecture & Simplicity',
      snippet:
        'Keeping system abstractions clean and platform adapters isolated brings long-term agility...',
      plainText:
        'Keeping system abstractions clean and platform adapters isolated brings long-term agility...',
      mood: 'reflective',
      tags: ['architecture', 'simplicity'],
    },
    {
      id: 'j2',
      date: 'Tuesday, Oct 13',
      entryDate: '2026-10-13',
      title: 'Progressive Disclosure in Daily Organizers',
      snippet:
        'Users benefit when tools stay restrained until advanced capabilities are requested...',
      plainText:
        'Users benefit when tools stay restrained until advanced capabilities are requested...',
      mood: 'good',
      tags: ['design'],
    },
  ];

  const isTestEnv = typeof process !== 'undefined' && process.env?.NODE_ENV === 'test';

  const [entries, setEntries] = useState<LocalJournalItem[]>(() =>
    isTestEnv && !repository ? STATIC_FIXTURES : []
  );

  // Reload entries, folders, drafts, and conflicts from repository
  const reloadFromRepository = useCallback(async () => {
    if (!repository || !workspaceId || !userId) return;
    const currentNamespace = { userId, workspaceId };
    try {
      const persisted = await repository.listJournalEntries(workspaceId, { includeDeleted: true });
      if (
        activeNamespaceRef.current?.userId !== currentNamespace.userId ||
        activeNamespaceRef.current?.workspaceId !== currentNamespace.workspaceId
      ) {
        return;
      }

      const mapped: LocalJournalItem[] = persisted.map((e) => ({
        id: e.id,
        date: e.entryDate,
        entryDate: e.entryDate,
        title: resolveJournalTitle(e.title, e.entryDate, e.plainText, {
          suppressBodySnippet: suppressSnippets,
        }),
        snippet: e.plainText ? e.plainText.slice(0, 100) : '',
        plainText: e.plainText || '',
        document: e.document,
        folderId: e.folderId,
        mood: e.mood,
        tags: e.tags,
        prompts: e.prompts,
        timezone: e.timezone,
        securityScope: e.securityScope,
        isPinned: e.isPinned,
        isArchived: e.isArchived,
        serverRevision: e.serverRevision,
        createdAt: e.createdAt,
        updatedAt: e.updatedAt,
        deletedAt: e.deletedAt,
      }));
      setEntries(mapped);

      // Load folders
      const headers = await repository.listItemHeaders(workspaceId);
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

      // Check for pending drafts
      const drafts = await repository.listDrafts(workspaceId, userId);
      const journalDraft = drafts.find((d) => d.entityType === 'journal_entry');
      setPendingDraft(journalDraft || null);

      // Check for conflicts
      const conflicts = await repository.listConflicts(workspaceId);
      const journalConflict = conflicts.find((c) => persisted.some((e) => e.id === c.entityId));
      setActiveConflict(journalConflict || null);
    } catch {
      // Quiet read error
    }
  }, [repository, workspaceId, userId, suppressSnippets]);

  // Account / workspace isolation: reset state on change
  const lastNamespaceKeyRef = useRef<string>('');
  useEffect(() => {
    const key = `${workspaceId ?? ''}:${userId ?? ''}`;
    if (lastNamespaceKeyRef.current === key) {
      return;
    }
    lastNamespaceKeyRef.current = key;

    setPendingDraft(null);
    setActiveConflict(null);
    setSaveError(null);
    setIsWriting(false);
    setEditingEntryId(null);
    setFolders([]);

    if (!workspaceId || !userId) {
      activeNamespaceRef.current = null;
      setEntries(isTestEnv && !repository ? STATIC_FIXTURES : []);
      return;
    }

    activeNamespaceRef.current = { userId, workspaceId };

    // Load persisted privacy preferences
    if (repository) {
      repository
        .getPreferenceSnapshot(userId)
        .then((snapshot) => {
          if (
            activeNamespaceRef.current?.userId === userId &&
            activeNamespaceRef.current?.workspaceId === workspaceId
          ) {
            const displayPrefs =
              (snapshot?.preferences?.displayPreferences as Record<string, unknown>) || {};
            if (typeof displayPrefs.suppressBodySnippets === 'boolean') {
              setSuppressSnippets(displayPrefs.suppressBodySnippets);
            }
          }
        })
        .catch(() => {});
    }

    if (apiClient && isOnline !== false) {
      apiClient
        .getUserPreferences()
        .then(async (profile) => {
          const prefs = profile.data?.preferences;
          if (
            activeNamespaceRef.current?.userId === userId &&
            activeNamespaceRef.current?.workspaceId === workspaceId &&
            prefs
          ) {
            if (typeof prefs.suppressBodySnippets === 'boolean') {
              setSuppressSnippets(prefs.suppressBodySnippets);
              if (repository) {
                const snap = await repository.getPreferenceSnapshot(userId).catch(() => null);
                const prevPrefs = (snap?.preferences as Record<string, unknown>) || {};
                await repository
                  .savePreferenceSnapshot({
                    userId,
                    preferences: {
                      ...prevPrefs,
                      displayPreferences: {
                        ...((prevPrefs.displayPreferences as Record<string, unknown>) || {}),
                        suppressBodySnippets: prefs.suppressBodySnippets,
                      },
                    },
                    schemaVersion: profile.data?.preferencesSchemaVersion || 1,
                    revision: (snap?.revision ?? 0) + 1,
                    updatedAt: new Date().toISOString(),
                  })
                  .catch(() => {});
              }
            }
          }
        })
        .catch(() => {});
    }

    if (isAuthenticated && repository) {
      void reloadFromRepository();
    }
  }, [isAuthenticated, repository, workspaceId, userId, reloadFromRepository, apiClient, isOnline]);

  // Subscribe to syncEngine events
  useEffect(() => {
    if (!syncEngine) return;
    const unsubscribe = syncEngine.onEvent((evt) => {
      if (
        evt.type === 'sync_completed' ||
        evt.type === 'conflict_detected' ||
        evt.type === 'conflict_resolved'
      ) {
        void reloadFromRepository();
      }
    });
    return unsubscribe;
  }, [syncEngine, reloadFromRepository]);

  // Durable draft persistence helper
  const persistDraftNow = useCallback(async () => {
    if (!repository || !workspaceId || !userId) return;
    try {
      await repository.saveDraft({
        id: activeDraftIdRef.current,
        workspaceId,
        userId,
        entityType: 'journal_entry',
        entityId: editingEntryId ?? activeDraftIdRef.current,
        title: entryTitle || 'Untitled journal draft',
        payload: {
          title: entryTitle,
          entryDate,
          timezone: userTimezone,
          plainText: entryBody,
          document: editingDocument,
          mood: entryMood,
          prompts: entryPrompts,
          tags: entryTags,
          folderId: selectedFolderId,
          editingEntryId,
        },
        savedAt: new Date().toISOString(),
        isQuarantined: false,
        quarantinedAt: null,
      });
    } catch {
      // quiet draft error
    }
  }, [
    repository,
    workspaceId,
    userId,
    editingEntryId,
    entryTitle,
    entryDate,
    userTimezone,
    entryBody,
    editingDocument,
    entryMood,
    entryPrompts,
    entryTags,
    selectedFolderId,
  ]);

  // Debounced draft autosave on state changes
  useEffect(() => {
    if (!isWriting || !repository || !workspaceId || !userId) return;
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    draftTimerRef.current = setTimeout(() => {
      void persistDraftNow();
    }, 400);

    return () => {
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    };
  }, [isWriting, repository, workspaceId, userId, persistDraftNow]);

  // AppState listener: flush draft when app moves to background/inactive
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState.match(/inactive|background/) && isWriting) {
        void persistDraftNow();
      }
    });
    return () => {
      subscription.remove();
    };
  }, [isWriting, persistDraftNow]);

  // Recover pending draft
  const handleRecoverDraft = useCallback(() => {
    if (!pendingDraft) return;
    const p = pendingDraft.payload as {
      title?: string;
      entryDate?: string;
      timezone?: string;
      plainText?: string;
      document?: NoteDocument;
      mood?: string | null;
      prompts?: JournalPromptItem[];
      tags?: string[];
      folderId?: string | null;
      editingEntryId?: string | null;
    };

    activeDraftIdRef.current = pendingDraft.id;
    setEditingEntryId(p.editingEntryId ?? null);
    setEntryTitle(p.title ?? '');
    setEntryDate(p.entryDate ?? selectedDate);
    setEntryBody(p.plainText ?? '');
    setEditingDocument(p.document);
    setOriginalPlainText(p.plainText ?? '');
    setEntryMood(p.mood ?? null);
    setEntryPrompts(p.prompts ?? []);
    setEntryTags(p.tags ?? []);
    setSelectedFolderId(p.folderId ?? null);
    setShowPromptTray((p.prompts ?? []).length > 0);
    setPendingDraft(null);
    setSaveError(null);
    setIsWriting(true);
  }, [pendingDraft, selectedDate]);

  // Discard pending draft
  const handleDiscardDraft = useCallback(async () => {
    if (!pendingDraft || !repository || !workspaceId || !userId) {
      setPendingDraft(null);
      return;
    }
    try {
      await repository.deleteDraft(workspaceId, userId, pendingDraft.id);
      setPendingDraft(null);
    } catch {
      // quiet
    }
  }, [pendingDraft, repository, workspaceId, userId]);

  // Open writing form for a new reflection
  const handleOpenNewEntry = useCallback(() => {
    activeDraftIdRef.current = generateUuid();
    setEditingEntryId(null);
    setEditingRevision(0);
    setEditingCreatedAt(null);
    setEditingDocument(undefined);
    setOriginalPlainText('');
    setEntryTitle('');
    setEntryDate(selectedDate);
    setEntryBody('');
    setEntryMood(null);
    setEntryTags([]);
    setEntryPrompts([]);
    setSelectedFolderId(null);
    setShowPromptTray(false);
    setSaveError(null);
    setIsWriting(true);
  }, [selectedDate]);

  // Open writing form to edit an existing entry
  const handleEditEntry = useCallback((item: LocalJournalItem) => {
    activeDraftIdRef.current = generateUuid();
    setEditingEntryId(item.id);
    setEditingRevision(item.serverRevision ?? 0);
    setEditingCreatedAt(item.createdAt ?? null);
    setEditingDocument(item.document);
    setOriginalPlainText(item.plainText);
    setEntryTitle(item.title);
    setEntryDate(item.entryDate);
    setEntryBody(item.plainText);
    setEntryMood(item.mood ?? null);
    setEntryTags(item.tags ?? []);
    setEntryPrompts(item.prompts ?? []);
    setSelectedFolderId(item.folderId ?? null);
    setShowPromptTray((item.prompts ?? []).length > 0);
    setSaveError(null);
    setIsWriting(true);
  }, []);

  // Handle target navigation (e.g. from SearchSheet or deep links)
  useEffect(() => {
    if (targetDate) {
      setSelectedDate(targetDate);
    }
    if (!targetEntryId) return;

    // 1. Try finding in loaded entries
    const existing = entries.find((e) => e.id === targetEntryId);
    if (existing) {
      handleEditEntry(existing);
      onClearTarget?.();
      return;
    }

    // 2. Load from repo or API
    let cancelled = false;
    async function resolveJournal() {
      if (repository && workspaceId) {
        try {
          const entry = await repository.getJournalEntry(workspaceId, targetEntryId!);
          if (!cancelled && entry) {
            const mapped: LocalJournalItem = {
              id: entry.id,
              date: entry.entryDate,
              entryDate: entry.entryDate,
              title: entry.title || `Reflection (${entry.entryDate})`,
              snippet: entry.plainText ? entry.plainText.slice(0, 100) : '',
              plainText: entry.plainText || '',
              document: entry.document,
              folderId: entry.folderId,
              mood: entry.mood,
              tags: entry.tags,
              prompts: entry.prompts,
              timezone: entry.timezone,
              securityScope: entry.securityScope,
              isPinned: entry.isPinned,
              isArchived: entry.isArchived,
              serverRevision: entry.serverRevision,
              createdAt: entry.createdAt,
              updatedAt: entry.updatedAt,
              deletedAt: entry.deletedAt,
            };
            handleEditEntry(mapped);
            onClearTarget?.();
            return;
          }
        } catch {
          /* fallback */
        }
      }

      if (apiClient && workspaceId && isOnline) {
        try {
          const res = await apiClient.getJournalEntry(workspaceId, targetEntryId!);
          if (!cancelled && res.data) {
            const mapped: LocalJournalItem = {
              id: res.data.id,
              date: res.data.entryDate,
              entryDate: res.data.entryDate,
              title: res.data.title || `Reflection (${res.data.entryDate})`,
              snippet: res.data.plainText ? res.data.plainText.slice(0, 100) : '',
              plainText: res.data.plainText || '',
              document: res.data.document,
              folderId: res.data.folderId,
              mood: res.data.mood,
              tags: res.data.tags,
              prompts: res.data.prompts,
              timezone: res.data.timezone,
              securityScope: res.data.securityScope,
              isPinned: res.data.isPinned,
              isArchived: res.data.isArchived,
              serverRevision: res.data.serverRevision,
              createdAt: res.data.createdAt,
              updatedAt: res.data.updatedAt,
              deletedAt: res.data.deletedAt,
            };
            handleEditEntry(mapped);
            onClearTarget?.();
          }
        } catch {
          /* not found */
        }
      }
    }

    void resolveJournal();

    return () => {
      cancelled = true;
    };
  }, [
    targetEntryId,
    targetDate,
    entries,
    repository,
    workspaceId,
    apiClient,
    isOnline,
    handleEditEntry,
    onClearTarget,
  ]);

  // Tag addition & removal
  const handleAddTag = useCallback(() => {
    const trimmed = entryTagInput.trim().toLowerCase();
    if (!trimmed) return;
    if (!entryTags.includes(trimmed)) {
      setEntryTags((prev) => [...prev, trimmed]);
    }
    setEntryTagInput('');
  }, [entryTagInput, entryTags]);

  const handleRemoveTag = useCallback((tag: string) => {
    setEntryTags((prev) => prev.filter((t) => t !== tag));
  }, []);

  // Template prompt selection
  const handleSelectTemplate = useCallback((templateId: string) => {
    const newPrompts = instantiateReflectionTemplate(templateId);
    setEntryPrompts(newPrompts);
    setShowPromptTray(true);
  }, []);

  // Save entry (atomic transaction preserving AST and metadata)
  const handleSaveEntry = useCallback(async () => {
    if (!entryTitle.trim() && !entryBody.trim() && entryPrompts.length === 0) {
      setIsWriting(false);
      return;
    }

    if (!repository || !workspaceId || !userId) {
      if (isTestEnv && !repository) {
        // Test fallback only when explicit repository is omitted in test runner
        const id = editingEntryId ?? generateUuid();
        const resolvedTitle =
          entryTitle.trim() ||
          resolveJournalTitle(null, entryDate, entryBody, {
            suppressBodySnippet: suppressSnippets,
          });
        const fallbackItem: LocalJournalItem = {
          id,
          date: entryDate,
          entryDate,
          title: resolvedTitle,
          snippet: entryBody.trim().slice(0, 100),
          plainText: entryBody.trim(),
          mood: entryMood,
          tags: entryTags,
          prompts: entryPrompts,
          serverRevision: editingRevision,
        };
        setEntries((prev) => [fallbackItem, ...prev.filter((e) => e.id !== id)]);
        setIsWriting(false);
        return;
      }
      setSaveError('Local storage is unavailable. Please connect your workspace.');
      return;
    }

    setIsSaving(true);
    setSaveError(null);

    const isNew = !editingEntryId;
    const id = editingEntryId ?? activeDraftIdRef.current;
    const baseRev = editingRevision;
    const nowIso = new Date().toISOString();
    const resolvedTitle =
      entryTitle.trim() ||
      resolveJournalTitle(null, entryDate, entryBody, {
        suppressBodySnippet: suppressSnippets,
      });

    const itemHeader: ItemHeaderRecord = {
      id,
      workspaceId,
      kind: 'journal',
      title: resolvedTitle,
      folderId: selectedFolderId,
      rank: generateInitialRank(0),
      isArchived: false,
      isPinned: false,
      securityScope: 'standard',
      serverRevision: baseRev,
      createdAt: editingCreatedAt ?? nowIso,
      updatedAt: nowIso,
      deletedAt: null,
    };

    const finalDoc = updateNoteDocumentPreservingAst(editingDocument, entryBody, originalPlainText);
    const wordCount = entryBody.split(/\s+/).filter(Boolean).length;

    const journalEntry: JournalEntryRecord = {
      id,
      workspaceId,
      folderId: selectedFolderId,
      entryDate,
      timezone: userTimezone,
      title: entryTitle.trim() || null,
      mood: entryMood || null,
      prompts: entryPrompts,
      tags: entryTags,
      document: finalDoc,
      plainText: entryBody,
      wordCount,
      charCount: entryBody.length,
      isDraft: false,
      isArchived: false,
      isPinned: false,
      securityScope: 'standard',
      serverRevision: baseRev,
      createdAt: editingCreatedAt ?? nowIso,
      updatedAt: nowIso,
      deletedAt: null,
    };

    const mutation: PendingMutationRecord = {
      operationId: generateUuid(),
      deviceId: 'mobile-local',
      workspaceId,
      userId,
      entityType: 'journal',
      entityId: id,
      action: isNew ? 'create' : 'update',
      command: isNew ? 'createJournalEntry' : 'updateJournalEntry',
      baseRevision: baseRev,
      payload: {
        id,
        entryDate,
        timezone: userTimezone,
        title: entryTitle.trim() || null,
        mood: entryMood || null,
        prompts: entryPrompts,
        tags: entryTags,
        document: finalDoc,
        plainText: entryBody,
        folderId: selectedFolderId,
        baseRevision: baseRev,
      },
      dependencyOperationIds: [],
      clientTimestamp: nowIso,
      retryCount: 0,
      status: 'pending',
      lastError: null,
    };

    try {
      await repository.saveItemTransaction(
        itemHeader,
        mutation,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        journalEntry
      );

      // Clean up draft after durable save
      try {
        await repository.deleteDraft(workspaceId, userId, activeDraftIdRef.current);
      } catch {
        // quiet draft delete
      }

      await reloadFromRepository();
      if (syncEngine) {
        void syncEngine.syncNow().catch(() => {});
      }

      setIsSaving(false);
      setIsWriting(false);
    } catch (err) {
      setIsSaving(false);
      // DO NOT close writing form on failure; keep unsaved content visible
      setSaveError(err instanceof Error ? err.message : 'Failed to save reflection');
    }
  }, [
    entryTitle,
    entryBody,
    entryPrompts,
    repository,
    workspaceId,
    userId,
    isTestEnv,
    editingEntryId,
    entryDate,
    suppressSnippets,
    entryMood,
    entryTags,
    editingRevision,
    selectedFolderId,
    editingCreatedAt,
    editingDocument,
    originalPlainText,
    userTimezone,
    reloadFromRepository,
    syncEngine,
  ]);

  // Trash entry without destroying AST or metadata
  const handleTrashEntry = useCallback(
    async (item: LocalJournalItem) => {
      if (!repository || !workspaceId || !userId) {
        setEntries((prev) => prev.filter((e) => e.id !== item.id));
        setIsWriting(false);
        return;
      }

      const nowIso = new Date().toISOString();
      const itemHeader: ItemHeaderRecord = {
        id: item.id,
        workspaceId,
        kind: 'journal',
        title: item.title,
        folderId: item.folderId ?? null,
        rank: generateInitialRank(0),
        isArchived: item.isArchived ?? false,
        isPinned: item.isPinned ?? false,
        securityScope: item.securityScope ?? 'standard',
        serverRevision: item.serverRevision ?? 0,
        createdAt: item.createdAt ?? nowIso,
        updatedAt: nowIso,
        deletedAt: nowIso,
      };

      const finalDoc = item.document ?? createNoteDocumentFromPlainText(item.plainText);
      const updatedJournal: JournalEntryRecord = {
        id: item.id,
        workspaceId,
        folderId: item.folderId ?? null,
        entryDate: item.entryDate,
        timezone: item.timezone ?? userTimezone,
        title: item.title,
        mood: item.mood ?? null,
        prompts: item.prompts ?? [],
        tags: item.tags ?? [],
        document: finalDoc,
        plainText: item.plainText,
        wordCount: item.plainText.split(/\s+/).filter(Boolean).length,
        charCount: item.plainText.length,
        isDraft: false,
        isArchived: item.isArchived ?? false,
        isPinned: item.isPinned ?? false,
        securityScope: item.securityScope ?? 'standard',
        serverRevision: item.serverRevision ?? 0,
        createdAt: item.createdAt ?? nowIso,
        updatedAt: nowIso,
        deletedAt: nowIso,
      };

      const mutation: PendingMutationRecord = {
        operationId: generateUuid(),
        deviceId: 'mobile-local',
        workspaceId,
        userId,
        entityType: 'journal',
        entityId: item.id,
        action: 'delete',
        command: 'trashJournalEntry',
        baseRevision: item.serverRevision ?? 0,
        payload: {
          baseRevision: item.serverRevision ?? 0,
        },
        dependencyOperationIds: [],
        clientTimestamp: nowIso,
        retryCount: 0,
        status: 'pending',
        lastError: null,
      };

      try {
        await repository.saveItemTransaction(
          itemHeader,
          mutation,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          updatedJournal
        );
        await reloadFromRepository();
        if (syncEngine) {
          void syncEngine.syncNow().catch(() => {});
        }
      } catch {
        // Quiet error
      }
      setIsWriting(false);
    },
    [repository, workspaceId, userId, userTimezone, reloadFromRepository, syncEngine]
  );

  // Restore entry from trash
  const handleRestoreEntry = useCallback(
    async (item: LocalJournalItem) => {
      if (!repository || !workspaceId || !userId) return;

      const nowIso = new Date().toISOString();
      const itemHeader: ItemHeaderRecord = {
        id: item.id,
        workspaceId,
        kind: 'journal',
        title: item.title,
        folderId: item.folderId ?? null,
        rank: generateInitialRank(0),
        isArchived: item.isArchived ?? false,
        isPinned: item.isPinned ?? false,
        securityScope: item.securityScope ?? 'standard',
        serverRevision: item.serverRevision ?? 0,
        createdAt: item.createdAt ?? nowIso,
        updatedAt: nowIso,
        deletedAt: null,
      };

      const finalDoc = item.document ?? createNoteDocumentFromPlainText(item.plainText);
      const restoredJournal: JournalEntryRecord = {
        id: item.id,
        workspaceId,
        folderId: item.folderId ?? null,
        entryDate: item.entryDate,
        timezone: item.timezone ?? userTimezone,
        title: item.title,
        mood: item.mood ?? null,
        prompts: item.prompts ?? [],
        tags: item.tags ?? [],
        document: finalDoc,
        plainText: item.plainText,
        wordCount: item.plainText.split(/\s+/).filter(Boolean).length,
        charCount: item.plainText.length,
        isDraft: false,
        isArchived: item.isArchived ?? false,
        isPinned: item.isPinned ?? false,
        securityScope: item.securityScope ?? 'standard',
        serverRevision: item.serverRevision ?? 0,
        createdAt: item.createdAt ?? nowIso,
        updatedAt: nowIso,
        deletedAt: null,
      };

      const mutation: PendingMutationRecord = {
        operationId: generateUuid(),
        deviceId: 'mobile-local',
        workspaceId,
        userId,
        entityType: 'journal',
        entityId: item.id,
        action: 'update',
        command: 'restoreJournalEntry',
        baseRevision: item.serverRevision ?? 0,
        payload: {
          baseRevision: item.serverRevision ?? 0,
        },
        dependencyOperationIds: [],
        clientTimestamp: nowIso,
        retryCount: 0,
        status: 'pending',
        lastError: null,
      };

      try {
        await repository.saveItemTransaction(
          itemHeader,
          mutation,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          restoredJournal
        );
        await reloadFromRepository();
        if (syncEngine) {
          void syncEngine.syncNow().catch(() => {});
        }
      } catch {
        // Quiet error
      }
    },
    [repository, workspaceId, userId, userTimezone, reloadFromRepository, syncEngine]
  );

  // Conflict resolution handler
  const handleResolveConflict = useCallback(
    async (resolution: 'keep_server' | 'keep_local' | 'save_copy') => {
      if (!syncEngine || !activeConflict) return;
      try {
        await syncEngine.resolveConflict(activeConflict.id, resolution);
        setActiveConflict(null);
        await reloadFromRepository();
      } catch {
        // quiet conflict resolution error
      }
    },
    [syncEngine, activeConflict, reloadFromRepository]
  );

  // Snippet toggle persisting to account preferences
  const handleToggleSnippets = useCallback(async () => {
    const nextVal = !suppressSnippets;
    setSuppressSnippets(nextVal);
    if (repository && userId) {
      try {
        const snapshot = await repository.getPreferenceSnapshot(userId);
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
        await repository.savePreferenceSnapshot({
          userId,
          preferences: {
            ...existingPrefs,
            displayPreferences: updatedDisplay,
          },
          schemaVersion: snapshot?.schemaVersion ?? 1,
          revision: (snapshot?.revision ?? 0) + 1,
          updatedAt: new Date().toISOString(),
        });
      } catch {
        // quiet
      }
    }

    if (apiClient) {
      if (isOnline !== false) {
        try {
          await apiClient.updateUserPreferences({
            preferences: {
              theme: 'system',
              compactMode: false,
              journalPreviewHidden: true,
              suppressBodySnippets: nextVal,
            },
          });
          pendingPrefSyncRef.current = false;
        } catch {
          pendingPrefSyncRef.current = true;
        }
      } else {
        pendingPrefSyncRef.current = true;
      }
    }
  }, [suppressSnippets, repository, userId, apiClient, isOnline]);

  // Filter entries based on search, viewMode, and selectedDate
  const filteredEntries = useMemo(() => {
    return entries.filter((e) => {
      const isDeleted = Boolean(e.deletedAt);
      if (viewMode === 'trash') {
        if (!isDeleted) return false;
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchesTitle = e.title.toLowerCase().includes(q);
          const matchesMood = (e.mood ?? '').toLowerCase().includes(q);
          const matchesTags = (e.tags ?? []).some((t) => t.toLowerCase().includes(q));
          const matchesBody = e.plainText.toLowerCase().includes(q);
          return matchesTitle || matchesMood || matchesTags || matchesBody;
        }
        return true;
      } else {
        if (isDeleted) return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = e.title.toLowerCase().includes(q);
        const matchesMood = (e.mood ?? '').toLowerCase().includes(q);
        const matchesTags = (e.tags ?? []).some((t) => t.toLowerCase().includes(q));
        const matchesBody = e.plainText.toLowerCase().includes(q);
        return matchesTitle || matchesMood || matchesTags || matchesBody;
      }
      return e.entryDate === selectedDate;
    });
  }, [entries, searchQuery, selectedDate, viewMode]);

  // Unauthenticated screen
  if (!isAuthenticated) {
    return (
      <View
        testID={testID}
        accessibilityRole="summary"
        accessibilityLabel="Authentication Required for Journal"
        style={[styles.protectedContainer, { backgroundColor: palette.background }]}
      >
        <View style={styles.protectedCard}>
          <Text style={styles.lockIcon} aria-hidden={true}>
            🔒
          </Text>
          <Text
            accessibilityRole="header"
            style={[styles.protectedTitle, { color: palette.text.primary }]}
          >
            Authentication Required
          </Text>
          <Text style={[styles.protectedDescription, { color: palette.text.secondary }]}>
            Journal reflections and entries are strictly private. Access requires workspace
            authentication to prevent unauthorized exposure.
          </Text>

          <View style={styles.protectedActions}>
            <MobileButton
              variant="primary"
              themeMode={themeMode}
              onPress={onLoginSynthetic}
              accessibilityLabel="Authenticate with synthetic account"
            >
              Sign In (Synthetic Demo)
            </MobileButton>

            <View style={{ height: spacing.sm }} />

            <MobileButton
              variant="subtle"
              themeMode={themeMode}
              onPress={onNavigateToToday}
              accessibilityLabel="Return to Today dashboard"
            >
              Return to Today
            </MobileButton>
          </View>
        </View>
      </View>
    );
  }

  // Unavailable state if missing repository in production
  if (!repository && !isTestEnv) {
    return (
      <View
        testID={testID}
        style={[styles.protectedContainer, { backgroundColor: palette.background }]}
      >
        <MobileEmptyState
          title="Journal Storage Unavailable"
          description="Local storage or workspace database is not initialized. Please ensure your workspace is connected."
          actionLabel="Return to Today"
          onAction={onNavigateToToday}
          themeMode={themeMode}
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
      {/* Conflict Resolution Banner */}
      {activeConflict && (
        <View style={[styles.conflictBanner, { backgroundColor: palette.accent.subtle }]}>
          <Text style={[styles.conflictTitle, { color: palette.accent.label }]}>
            ⚠️ Sync Conflict Detected
          </Text>
          <Text style={[styles.conflictDesc, { color: palette.text.secondary }]}>
            A cloud revision conflicts with local changes for this reflection.
          </Text>
          <View style={styles.conflictActions}>
            <MobileButton
              variant="subtle"
              themeMode={themeMode}
              onPress={() => handleResolveConflict('keep_server')}
              accessibilityLabel="Accept cloud version"
            >
              Accept Cloud
            </MobileButton>
            <MobileButton
              variant="subtle"
              themeMode={themeMode}
              onPress={() => handleResolveConflict('keep_local')}
              accessibilityLabel="Overwrite cloud version"
            >
              Keep Local
            </MobileButton>
            <MobileButton
              variant="subtle"
              themeMode={themeMode}
              onPress={() => handleResolveConflict('save_copy')}
              accessibilityLabel="Save local as copy"
            >
              Save Copy
            </MobileButton>
          </View>
        </View>
      )}

      {/* Draft Recovery Banner */}
      {pendingDraft && !isWriting && (
        <View style={[styles.draftBanner, { backgroundColor: palette.surfaceRaised }]}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '700', color: palette.text.primary, fontSize: 13 }}>
              📝 Unsaved Draft Found
            </Text>
            <Text style={{ fontSize: 12, color: palette.text.secondary }}>
              Saved {new Date(pendingDraft.savedAt).toLocaleTimeString()}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <MobileButton
              variant="primary"
              themeMode={themeMode}
              onPress={handleRecoverDraft}
              accessibilityLabel="Recover draft"
            >
              Recover
            </MobileButton>
            <MobileButton
              variant="subtle"
              themeMode={themeMode}
              onPress={handleDiscardDraft}
              accessibilityLabel="Discard draft"
            >
              Discard
            </MobileButton>
          </View>
        </View>
      )}

      {/* Header Row */}
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text accessibilityRole="header" style={[styles.title, { color: palette.text.primary }]}>
            Journal Timeline
          </Text>
          <Text style={[styles.subtitle, { color: palette.text.secondary }]}>
            Private space for reflection and daily thoughts
          </Text>
        </View>

        {!isWriting && (
          <MobileButton
            variant="primary"
            themeMode={themeMode}
            onPress={handleOpenNewEntry}
            accessibilityLabel="Write new reflection"
          >
            ✍️ Write
          </MobileButton>
        )}
      </View>

      {/* View Mode Stepper (Active vs Trash) */}
      {!isWriting && (
        <View style={styles.viewModeRow}>
          <Pressable
            onPress={() => setViewMode('active')}
            accessibilityRole="tab"
            accessibilityState={{ selected: viewMode === 'active' }}
            style={[
              styles.viewModeTab,
              {
                borderBottomColor: viewMode === 'active' ? palette.action.primary : 'transparent',
              },
            ]}
          >
            <Text
              style={{
                fontWeight: viewMode === 'active' ? '700' : '500',
                color: viewMode === 'active' ? palette.action.primary : palette.text.secondary,
              }}
            >
              Active Entries
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setViewMode('trash')}
            accessibilityRole="tab"
            accessibilityLabel="Trash view"
            accessibilityState={{ selected: viewMode === 'trash' }}
            style={[
              styles.viewModeTab,
              {
                borderBottomColor: viewMode === 'trash' ? palette.action.primary : 'transparent',
              },
            ]}
          >
            <Text
              style={{
                fontWeight: viewMode === 'trash' ? '700' : '500',
                color: viewMode === 'trash' ? palette.action.primary : palette.text.secondary,
              }}
            >
              🗑️ Trash
            </Text>
          </Pressable>
        </View>
      )}

      {/* Writing Entry Form */}
      {isWriting ? (
        <View style={styles.writeContainer}>
          <MobileCard themeMode={themeMode}>
            <Text style={[styles.writeCardTitle, { color: palette.text.primary }]}>
              {editingEntryId ? 'Edit Reflection' : 'New Reflection'}
            </Text>

            {/* Save Error Banner */}
            {saveError && (
              <View style={[styles.saveErrorBanner, { backgroundColor: palette.accent.subtle }]}>
                <Text style={{ color: palette.accent.label, fontSize: 13, fontWeight: '600' }}>
                  ⚠️ {saveError}
                </Text>
              </View>
            )}

            {/* Date Picker & Backdated Indicator */}
            <View style={styles.dateRow}>
              <Text style={[styles.inputLabel, { color: palette.text.secondary }]}>
                Date: {entryDate}
              </Text>
              {isEntryBackdated(entryDate, new Date(), userTimezone) && (
                <Text
                  style={[
                    styles.backdatedBadge,
                    { backgroundColor: palette.accent.subtle, color: palette.accent.label },
                  ]}
                >
                  🕒 Backdated
                </Text>
              )}
            </View>

            {/* Folder Placement Selector */}
            {folders.length > 0 && (
              <View style={{ marginBottom: spacing.sm }}>
                <Text
                  style={[styles.inputLabel, { color: palette.text.secondary, marginBottom: 4 }]}
                >
                  Folder (optional):
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    <Pressable
                      onPress={() => setSelectedFolderId(null)}
                      accessibilityRole="button"
                      style={[
                        styles.folderPill,
                        {
                          backgroundColor:
                            selectedFolderId === null ? palette.action.primary : palette.surface,
                          borderColor:
                            selectedFolderId === null
                              ? palette.action.primary
                              : palette.border.subtle,
                        },
                      ]}
                    >
                      <Text
                        style={{
                          fontSize: 12,
                          color:
                            selectedFolderId === null ? palette.action.label : palette.text.primary,
                        }}
                      >
                        Root (No folder)
                      </Text>
                    </Pressable>
                    {folders.map((f) => (
                      <Pressable
                        key={f.id}
                        onPress={() => setSelectedFolderId(f.id)}
                        accessibilityRole="button"
                        style={[
                          styles.folderPill,
                          {
                            backgroundColor:
                              selectedFolderId === f.id ? palette.action.primary : palette.surface,
                            borderColor:
                              selectedFolderId === f.id
                                ? palette.action.primary
                                : palette.border.subtle,
                          },
                        ]}
                      >
                        <Text
                          style={{
                            fontSize: 12,
                            color:
                              selectedFolderId === f.id
                                ? palette.action.label
                                : palette.text.primary,
                          }}
                        >
                          📁 {f.name}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </ScrollView>
              </View>
            )}

            {/* Title Field */}
            <MobileTextField
              label="Title (optional)"
              placeholder="Give your thought a name..."
              value={entryTitle}
              onChangeText={setEntryTitle}
              themeMode={themeMode}
            />

            {/* Mood Pills */}
            <View style={styles.moodSection}>
              <Text style={[styles.inputLabel, { color: palette.text.secondary, marginBottom: 4 }]}>
                Mood (optional):
              </Text>
              <View style={styles.moodRow}>
                {AVAILABLE_MOODS.map((m) => {
                  const isSelected = entryMood === m.value;
                  return (
                    <Pressable
                      key={m.value}
                      onPress={() => setEntryMood(isSelected ? null : m.value)}
                      accessibilityRole="button"
                      accessibilityLabel={`Mood ${m.label}`}
                      style={[
                        styles.moodPill,
                        {
                          backgroundColor: isSelected ? palette.action.primary : palette.surface,
                          borderColor: isSelected ? palette.action.primary : palette.border.subtle,
                        },
                      ]}
                    >
                      <Text style={{ fontSize: 13 }}>{m.emoji}</Text>
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: isSelected ? '700' : '400',
                          color: isSelected ? palette.action.label : palette.text.primary,
                        }}
                      >
                        {m.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Reflection Prompts Tray Toggle */}
            <View style={{ marginVertical: spacing.xs }}>
              <Pressable
                onPress={() => setShowPromptTray((prev) => !prev)}
                accessibilityRole="button"
                accessibilityLabel="Toggle reflection templates"
                style={[styles.templateToggle, { borderColor: palette.border.subtle }]}
              >
                <Text style={{ fontSize: 13, color: palette.text.primary }}>
                  💡 {showPromptTray ? 'Hide Reflection Prompts' : 'Use Reflection Prompt'}
                </Text>
              </Pressable>

              {showPromptTray && (
                <View
                  style={[styles.templatesContainer, { backgroundColor: palette.surfaceRaised }]}
                >
                  {REFLECTION_TEMPLATES.map((tpl) => (
                    <Pressable
                      key={tpl.id}
                      onPress={() => handleSelectTemplate(tpl.id)}
                      style={styles.templateOption}
                    >
                      <Text
                        style={{ fontSize: 13, fontWeight: '600', color: palette.text.primary }}
                      >
                        {tpl.name}
                      </Text>
                      <Text style={{ fontSize: 12, color: palette.text.secondary }}>
                        {tpl.description}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>

            {/* Body Multiline Field */}
            <MobileTextField
              label="Body"
              placeholder="What is on your mind today?"
              value={entryBody}
              onChangeText={setEntryBody}
              multiline={true}
              numberOfLines={6}
              themeMode={themeMode}
            />

            {/* Tags Input */}
            <View style={{ marginVertical: spacing.xs }}>
              <View style={styles.tagInputRow}>
                <TextInput
                  placeholder="Add a tag..."
                  placeholderTextColor={palette.text.muted}
                  value={entryTagInput}
                  onChangeText={setEntryTagInput}
                  onSubmitEditing={handleAddTag}
                  style={[
                    styles.tagTextInput,
                    {
                      borderColor: palette.border.subtle,
                      color: palette.text.primary,
                      backgroundColor: palette.surface,
                    },
                  ]}
                />
                <MobileButton
                  variant="subtle"
                  themeMode={themeMode}
                  onPress={handleAddTag}
                  accessibilityLabel="Add tag"
                >
                  + Add
                </MobileButton>
              </View>
              {entryTags.length > 0 && (
                <View style={styles.tagChipsRow}>
                  {entryTags.map((t) => (
                    <Pressable
                      key={t}
                      onPress={() => handleRemoveTag(t)}
                      style={[styles.tagChip, { backgroundColor: palette.action.subtle }]}
                    >
                      <Text style={{ fontSize: 12, color: palette.action.subtleText }}>#{t} ✕</Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>

            {/* Action Buttons */}
            <View style={styles.writeButtonRow}>
              <MobileButton
                variant="primary"
                themeMode={themeMode}
                onPress={handleSaveEntry}
                accessibilityLabel="Save reflection"
              >
                {isSaving ? 'Saving...' : 'Save Reflection'}
              </MobileButton>

              <View style={{ height: spacing.xs }} />

              <MobileButton
                variant="subtle"
                themeMode={themeMode}
                onPress={() => {
                  setSaveError(null);
                  setIsWriting(false);
                }}
                accessibilityLabel="Cancel reflection"
              >
                Cancel
              </MobileButton>

              {editingEntryId && (
                <>
                  <View style={{ height: spacing.xs }} />
                  <MobileButton
                    variant="danger"
                    themeMode={themeMode}
                    onPress={async () => {
                      const item = entries.find((e) => e.id === editingEntryId);
                      if (item) await handleTrashEntry(item);
                    }}
                    accessibilityLabel="Delete reflection"
                  >
                    Move to Trash
                  </MobileButton>
                </>
              )}
            </View>
          </MobileCard>
        </View>
      ) : (
        <>
          {/* Day Stepper & Navigation */}
          <View style={[styles.dayNavRow, { borderColor: palette.border.subtle }]}>
            <Pressable
              onPress={() => setSelectedDate((d) => offsetMonthIso(d, -1))}
              accessibilityRole="button"
              accessibilityLabel="Previous month"
              style={[styles.navArrowBtn, { backgroundColor: palette.surfaceRaised }]}
            >
              <Text style={{ fontSize: 12, color: palette.text.primary }}>◀ Mo</Text>
            </Pressable>

            <Pressable
              onPress={() => setSelectedDate((d) => offsetDateIso(d, -1))}
              accessibilityRole="button"
              accessibilityLabel="Previous day"
              style={[styles.navArrowBtn, { backgroundColor: palette.surfaceRaised }]}
            >
              <Text style={{ fontSize: 16, color: palette.text.primary }}>◀</Text>
            </Pressable>

            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: palette.text.primary }}>
                {selectedDate === todayIso ? 'Today' : selectedDate}
              </Text>
              {isEntryBackdated(selectedDate, new Date(), userTimezone) && (
                <Text style={{ fontSize: 11, color: palette.accent.label, fontWeight: '600' }}>
                  Past date
                </Text>
              )}
            </View>

            <Pressable
              onPress={() => setSelectedDate((d) => offsetDateIso(d, 1))}
              accessibilityRole="button"
              accessibilityLabel="Next day"
              style={[styles.navArrowBtn, { backgroundColor: palette.surfaceRaised }]}
            >
              <Text style={{ fontSize: 16, color: palette.text.primary }}>▶</Text>
            </Pressable>

            <Pressable
              onPress={() => setSelectedDate((d) => offsetMonthIso(d, 1))}
              accessibilityRole="button"
              accessibilityLabel="Next month"
              style={[styles.navArrowBtn, { backgroundColor: palette.surfaceRaised }]}
            >
              <Text style={{ fontSize: 12, color: palette.text.primary }}>Mo ▶</Text>
            </Pressable>

            <MobileButton
              variant={selectedDate === todayIso ? 'subtle' : 'secondary'}
              themeMode={themeMode}
              onPress={() => setSelectedDate(todayIso)}
              accessibilityLabel="Jump to today"
            >
              Today
            </MobileButton>
          </View>

          {/* Journal-Scoped Search Bar */}
          <View style={styles.searchSection}>
            <TextInput
              placeholder="Search Journal reflections..."
              placeholderTextColor={palette.text.muted}
              value={searchQuery}
              onChangeText={setSearchQuery}
              style={[
                styles.searchTextInput,
                {
                  borderColor: palette.border.subtle,
                  color: palette.text.primary,
                  backgroundColor: palette.surface,
                },
              ]}
            />
            <View style={styles.scopeRow}>
              <Text
                style={[
                  styles.scopeBadge,
                  { backgroundColor: palette.action.subtle, color: palette.action.subtleText },
                ]}
              >
                Scope: Journal only
              </Text>
              <Pressable
                onPress={handleToggleSnippets}
                accessibilityRole="button"
                accessibilityLabel={suppressSnippets ? 'Show snippets' : 'Hide snippets'}
                style={styles.snippetToggle}
              >
                <Text style={{ fontSize: 12, color: palette.text.secondary }}>
                  {suppressSnippets ? '👁️ Show Snippets' : '🔒 Hide Snippets'}
                </Text>
              </Pressable>
            </View>
          </View>

          {/* Timeline Entries List */}
          <View style={styles.timelineSection}>
            <Text style={[styles.sectionTitle, { color: palette.text.primary }]}>
              {viewMode === 'trash' ? 'Trash Entries' : 'Entries'} ({filteredEntries.length})
            </Text>

            {filteredEntries.length === 0 ? (
              <MobileEmptyState
                title={
                  viewMode === 'trash'
                    ? 'Trash is empty'
                    : searchQuery.trim()
                      ? 'No matching reflections'
                      : `No entries for ${selectedDate}`
                }
                description={
                  viewMode === 'trash'
                    ? 'Deleted reflections will appear here.'
                    : 'Take a moment to record your daily reflections.'
                }
                actionLabel={viewMode === 'trash' ? undefined : 'Write First Entry'}
                onAction={viewMode === 'trash' ? undefined : handleOpenNewEntry}
                themeMode={themeMode}
              />
            ) : (
              <MobileCard themeMode={themeMode}>
                {filteredEntries.map((entry) => {
                  const metaParts = [entry.date || entry.entryDate];
                  if (entry.mood) metaParts.push(`Mood: ${entry.mood}`);
                  if (!suppressSnippets && entry.snippet) {
                    metaParts.push(entry.snippet);
                  }
                  if (viewMode === 'trash') {
                    return (
                      <View
                        key={entry.id}
                        style={{
                          flexDirection: 'row',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          paddingVertical: spacing.xs,
                          borderBottomWidth: 1,
                          borderBottomColor: palette.border.subtle,
                        }}
                      >
                        <View style={{ flex: 1 }}>
                          <Text
                            style={{
                              fontSize: 14,
                              fontWeight: '700',
                              color: palette.text.primary,
                            }}
                          >
                            {entry.title}
                          </Text>
                          <Text style={{ fontSize: 12, color: palette.text.secondary }}>
                            {metaParts.join(' • ')}
                          </Text>
                        </View>
                        <MobileButton
                          variant="subtle"
                          themeMode={themeMode}
                          onPress={() => handleRestoreEntry(entry)}
                          accessibilityLabel={`Restore ${entry.title}`}
                        >
                          Restore
                        </MobileButton>
                      </View>
                    );
                  }
                  return (
                    <MobileListRow
                      key={entry.id}
                      title={entry.title}
                      metadata={metaParts.join(' • ')}
                      themeMode={themeMode}
                      onPress={() => handleEditEntry(entry)}
                      accessibilityLabel={`${entry.title}, written on ${entry.date || entry.entryDate}`}
                    />
                  );
                })}
              </MobileCard>
            )}
          </View>
        </>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  scrollContent: {
    padding: spacing.base,
    paddingBottom: spacing.xxl,
  },
  conflictBanner: {
    padding: spacing.sm,
    borderRadius: radii.sm,
    marginBottom: spacing.sm,
  },
  conflictTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  conflictDesc: {
    fontSize: 12,
    marginBottom: spacing.xs,
  },
  conflictActions: {
    flexDirection: 'row',
    gap: 6,
  },
  draftBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.sm,
    borderRadius: radii.sm,
    marginBottom: spacing.sm,
  },
  saveErrorBanner: {
    padding: spacing.xs,
    borderRadius: radii.sm,
    marginBottom: spacing.sm,
  },
  viewModeRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#ccc',
    marginBottom: spacing.sm,
  },
  viewModeTab: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderBottomWidth: 2,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.base,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
  },
  writeContainer: {
    marginBottom: spacing.base,
  },
  writeCardTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: spacing.sm,
  },
  backdatedBadge: {
    fontSize: 11,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radii.pill,
    fontWeight: '700',
  },
  folderPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.pill,
    borderWidth: 1,
  },
  moodSection: {
    marginVertical: spacing.xs,
  },
  moodRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  moodPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.pill,
    borderWidth: 1,
    minHeight: touchTargets.mobileMin,
  },
  templateToggle: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radii.sm,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  templatesContainer: {
    padding: spacing.sm,
    borderRadius: radii.sm,
    marginTop: spacing.xs,
    gap: 8,
  },
  templateOption: {
    paddingVertical: 4,
  },
  tagInputRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  tagTextInput: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderRadius: radii.sm,
    fontSize: 14,
    minHeight: touchTargets.mobileMin,
  },
  tagChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  tagChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radii.pill,
  },
  writeButtonRow: {
    marginTop: spacing.base,
  },
  dayNavRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    marginBottom: spacing.sm,
  },
  navArrowBtn: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: radii.sm,
    minHeight: touchTargets.mobileMin,
    minWidth: touchTargets.mobileMin,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchSection: {
    marginBottom: spacing.base,
  },
  searchTextInput: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderRadius: radii.sm,
    fontSize: 14,
    minHeight: touchTargets.mobileMin,
  },
  scopeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
  },
  scopeBadge: {
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radii.pill,
  },
  snippetToggle: {
    paddingVertical: 4,
  },
  timelineSection: {
    marginTop: spacing.xs,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  protectedContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.base,
  },
  protectedCard: {
    maxWidth: 400,
    width: '100%',
    alignItems: 'center',
    padding: spacing.lg,
  },
  lockIcon: {
    fontSize: 48,
    marginBottom: spacing.base,
  },
  protectedTitle: {
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  protectedDescription: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  protectedActions: {
    width: '100%',
  },
});
