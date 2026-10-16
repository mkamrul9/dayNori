import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
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
  type JournalPromptItem,
} from '@daynori/domain';
import type {
  ItemHeaderRecord,
  JournalEntryRecord,
  LocalRepositoryPort,
  PendingMutationRecord,
  SyncEngine,
} from '@daynori/sync';

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
  isOnline?: boolean;
  userTimezone?: string;
}

interface LocalJournalItem {
  id: string;
  date: string;
  entryDate: string;
  title: string;
  snippet: string;
  plainText: string;
  mood?: string | null;
  tags?: string[];
  prompts?: JournalPromptItem[];
  serverRevision?: number;
  createdAt?: string;
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
  userTimezone: propTimezone,
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

  const todayIso = useMemo(() => getTodayIso(userTimezone), [userTimezone]);

  // Timeline and navigation state
  const [selectedDate, setSelectedDate] = useState<string>(todayIso);
  const [searchQuery, setSearchQuery] = useState('');
  const [suppressSnippets, setSuppressSnippets] = useState(true);
  const [showPromptTray, setShowPromptTray] = useState(false);

  // Editor form state
  const [isWriting, setIsWriting] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editingRevision, setEditingRevision] = useState<number>(0);
  const [editingCreatedAt, setEditingCreatedAt] = useState<string | null>(null);
  const [entryTitle, setEntryTitle] = useState('');
  const [entryDate, setEntryDate] = useState(todayIso);
  const [entryBody, setEntryBody] = useState('');
  const [entryMood, setEntryMood] = useState<string | null>(null);
  const [entryTags, setEntryTags] = useState<string[]>([]);
  const [entryTagInput, setEntryTagInput] = useState('');
  const [entryPrompts, setEntryPrompts] = useState<JournalPromptItem[]>([]);

  // Default demonstration entries for standalone / unpersisted test fallback
  const [entries, setEntries] = useState<LocalJournalItem[]>([
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
  ]);

  // Load real journal entries from repository when available
  const reloadFromRepository = useCallback(async () => {
    if (!repository || !workspaceId) return;
    try {
      const persisted = await repository.listJournalEntries(workspaceId);
      const active = persisted.filter((e) => !e.deletedAt);
      const mapped: LocalJournalItem[] = active.map((e) => ({
        id: e.id,
        date: e.entryDate,
        entryDate: e.entryDate,
        title: e.title || resolveJournalTitle(null, e.entryDate, e.plainText),
        snippet: e.plainText ? e.plainText.slice(0, 100) : '',
        plainText: e.plainText || '',
        mood: e.mood,
        tags: e.tags,
        prompts: e.prompts,
        serverRevision: e.serverRevision,
        createdAt: e.createdAt,
      }));
      setEntries(mapped);
    } catch {
      // Quiet read error
    }
  }, [repository, workspaceId]);

  useEffect(() => {
    if (isAuthenticated && repository && workspaceId) {
      void reloadFromRepository();
    }
  }, [isAuthenticated, repository, workspaceId, reloadFromRepository]);

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

  // Open writing form for a new reflection
  const handleOpenNewEntry = useCallback(() => {
    setEditingEntryId(null);
    setEditingRevision(0);
    setEditingCreatedAt(null);
    setEntryTitle('');
    setEntryDate(selectedDate);
    setEntryBody('');
    setEntryMood(null);
    setEntryTags([]);
    setEntryPrompts([]);
    setShowPromptTray(false);
    setIsWriting(true);
  }, [selectedDate]);

  // Open writing form to edit an existing entry
  const handleEditEntry = useCallback((item: LocalJournalItem) => {
    setEditingEntryId(item.id);
    setEditingRevision(item.serverRevision ?? 0);
    setEditingCreatedAt(item.createdAt ?? null);
    setEntryTitle(item.title);
    setEntryDate(item.entryDate);
    setEntryBody(item.plainText);
    setEntryMood(item.mood ?? null);
    setEntryTags(item.tags ?? []);
    setEntryPrompts(item.prompts ?? []);
    setShowPromptTray((item.prompts ?? []).length > 0);
    setIsWriting(true);
  }, []);

  // Tag addition
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

  // Save entry (persisting to repository if available or updating local state)
  const handleSaveEntry = useCallback(async () => {
    if (!entryTitle.trim() && !entryBody.trim()) {
      setIsWriting(false);
      return;
    }

    const isNew = !editingEntryId;
    const id = editingEntryId ?? generateUuid();
    const baseRev = editingRevision;
    const nowIso = new Date().toISOString();
    const resolvedTitle = entryTitle.trim() || resolveJournalTitle(null, entryDate, entryBody);

    if (repository && workspaceId) {
      const itemHeader: ItemHeaderRecord = {
        id,
        workspaceId,
        kind: 'journal',
        title: resolvedTitle,
        folderId: null,
        rank: generateInitialRank(0),
        isArchived: false,
        isPinned: false,
        securityScope: 'standard',
        serverRevision: baseRev,
        createdAt: editingCreatedAt ?? nowIso,
        updatedAt: nowIso,
        deletedAt: null,
      };

      const wordCount = entryBody.split(/\s+/).filter(Boolean).length;
      const journalEntry: JournalEntryRecord = {
        id,
        workspaceId,
        folderId: null,
        entryDate,
        timezone: userTimezone,
        title: entryTitle.trim() || null,
        mood: entryMood || null,
        prompts: entryPrompts,
        tags: entryTags,
        document: {
          version: 1,
          type: 'doc',
          content: [
            {
              id: generateUuid(),
              type: 'paragraph',
              content: [{ type: 'text', text: entryBody }],
            },
          ],
        },
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
        userId: userId ?? 'unknown',
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
          document: journalEntry.document,
          plainText: entryBody,
          folderId: null,
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
        await reloadFromRepository();
        if (syncEngine) {
          void syncEngine.syncNow().catch(() => {});
        }
      } catch {
        // Quiet save error
      }
    } else {
      // In-memory fallback
      const newEntry: LocalJournalItem = {
        id,
        date: entryDate,
        entryDate,
        title: resolvedTitle,
        snippet: entryBody.trim().slice(0, 100),
        plainText: entryBody.trim(),
        mood: entryMood,
        tags: entryTags,
        prompts: entryPrompts,
        serverRevision: baseRev,
        createdAt: editingCreatedAt ?? nowIso,
      };

      if (isNew) {
        setEntries((prev) => [newEntry, ...prev]);
      } else {
        setEntries((prev) => prev.map((e) => (e.id === id ? newEntry : e)));
      }
    }

    setIsWriting(false);
  }, [
    editingEntryId,
    editingRevision,
    editingCreatedAt,
    entryTitle,
    entryDate,
    entryBody,
    entryMood,
    entryTags,
    entryPrompts,
    repository,
    workspaceId,
    userId,
    userTimezone,
    reloadFromRepository,
    syncEngine,
  ]);

  // Trash entry
  const handleTrashEntry = useCallback(
    async (item: LocalJournalItem) => {
      if (repository && workspaceId) {
        const nowIso = new Date().toISOString();
        const itemHeader: ItemHeaderRecord = {
          id: item.id,
          workspaceId,
          kind: 'journal',
          title: item.title,
          folderId: null,
          rank: generateInitialRank(0),
          isArchived: false,
          isPinned: false,
          securityScope: 'standard',
          serverRevision: item.serverRevision ?? 0,
          createdAt: item.createdAt ?? nowIso,
          updatedAt: nowIso,
          deletedAt: nowIso,
        };

        const updatedJournal: JournalEntryRecord = {
          id: item.id,
          workspaceId,
          folderId: null,
          entryDate: item.entryDate,
          timezone: userTimezone,
          title: item.title,
          mood: item.mood ?? null,
          prompts: item.prompts ?? [],
          tags: item.tags ?? [],
          document: {
            version: 1,
            type: 'doc',
            content: [
              {
                id: generateUuid(),
                type: 'paragraph',
                content: [{ type: 'text', text: item.plainText }],
              },
            ],
          },
          plainText: item.plainText,
          wordCount: item.plainText.split(/\s+/).filter(Boolean).length,
          charCount: item.plainText.length,
          isDraft: false,
          isArchived: false,
          isPinned: false,
          securityScope: 'standard',
          serverRevision: item.serverRevision ?? 0,
          createdAt: item.createdAt ?? nowIso,
          updatedAt: nowIso,
          deletedAt: nowIso,
        };

        const mutation: PendingMutationRecord = {
          operationId: generateUuid(),
          deviceId: 'mobile-local',
          workspaceId,
          userId: userId ?? 'unknown',
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
      } else {
        setEntries((prev) => prev.filter((e) => e.id !== item.id));
      }
      setIsWriting(false);
    },
    [repository, workspaceId, userTimezone, userId, reloadFromRepository, syncEngine]
  );

  // Filter entries based on search and selectedDate
  const filteredEntries = useMemo(() => {
    return entries.filter((e) => {
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
  }, [entries, searchQuery, selectedDate]);

  // If user is unauthenticated, show protected gate screen
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

  return (
    <ScrollView
      testID={testID}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
    >
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

      {/* Writing Entry Form */}
      {isWriting ? (
        <View style={styles.writeContainer}>
          <MobileCard themeMode={themeMode}>
            <Text style={[styles.writeCardTitle, { color: palette.text.primary }]}>
              {editingEntryId ? 'Edit Reflection' : 'New Reflection'}
            </Text>

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
                Save Reflection
              </MobileButton>

              <View style={{ height: spacing.xs }} />

              <MobileButton
                variant="subtle"
                themeMode={themeMode}
                onPress={() => setIsWriting(false)}
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
                    onPress={() => {
                      const item = entries.find((e) => e.id === editingEntryId);
                      if (item) void handleTrashEntry(item);
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
                onPress={() => setSuppressSnippets((prev) => !prev)}
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
              Entries ({filteredEntries.length})
            </Text>

            {filteredEntries.length === 0 ? (
              <MobileEmptyState
                title={
                  searchQuery.trim() ? 'No matching reflections' : `No entries for ${selectedDate}`
                }
                description="Take a moment to record your daily reflections."
                actionLabel="Write First Entry"
                onAction={handleOpenNewEntry}
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
    paddingHorizontal: 12,
    paddingVertical: 8,
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
