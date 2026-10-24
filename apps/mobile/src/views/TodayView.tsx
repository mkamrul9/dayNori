import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  ActivityIndicator,
  AppState,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { colors, radii, spacing, type ThemeMode } from '@daynori/design-tokens';
import {
  Icon,
  MobileButton,
  MobileCard,
  MobileEmptyState,
  MobileFeedback,
  MobileListRow,
  MobileModalSheet,
  MobileRoutineRow
} from '@daynori/ui-mobile';
import {
  calculateGentleProgress,
  explainWhyDueToday,
  getCalendarDateInTimezone,
  addCalendarDays,
  calculatePlannedInstant,
  computeDeterministicOccurrenceId,
  isRoutineScheduledOnDate,
  isTaskOverdue,
  type RoutineFrequency,
  type Weekday,
  type RoutineOccurrenceStatus,
  type RoutineOccurrenceTransition,
  getDefaultHomeLayout,
  sanitizeAndMigrateHomeLayout,
  reorderWidgets,
  reorderModuleShortcuts,
  validateCustomLabel,
  filterRecentItemsForPrivacy,
  DEFAULT_WIDGET_LABELS,
  DEFAULT_MODULE_LABELS,
  UnsupportedLayoutVersionError,
  shouldShowOnboarding,
  type OnboardingState,
  type HomeLayout,
  type HomeWidgetId,
  type ModuleShortcutId,
  type HomeDensity,
  type RecentItemEntry
} from '@daynori/domain';
import type {
  LocalRepositoryPort,
  SyncEngine,
  RoutineOccurrenceRecord,
  TaskRecord,
  ItemHeaderRecord,
} from '@daynori/sync';
import type { DaynoriApiClient } from '@daynori/api-client';
import { ApiClientError } from '@daynori/api-client';

const MOBILE_MODULE_SHORTCUT_ICONS: Record<ModuleShortcutId, string> = {
  today: 'sun',
  plan: 'clipboard',
  library: 'library',
  journal: 'book',
  notes: 'note',
  tasks: 'check',
  routines: 'repeat',
  calendar: 'calendar',
  files: 'folder',
  knowledge: 'bulb',
};

export interface MobileRoutineItem {
  id: string;
  title: string;
  details?: string | null;
  frequency: RoutineFrequency;
  weekdays: Weekday[];
  timezone: string;
  scheduledTime?: string | null;
  activeFrom?: string;
  activeTo?: string | null;
  isPaused?: boolean;
  isArchived?: boolean;
}

export interface MobileOccurrenceItem {
  id: string;
  routineId: string;
  status: RoutineOccurrenceStatus;
  completedAt?: string | null;
  scheduledDate: string;
}

export interface MobileTaskItem {
  id: string;
  title: string;
  due: string;
  completed: boolean;
  isOverdue?: boolean;
}

export interface TodayViewProps {
  themeMode: ThemeMode;
  onNavigateToPlan: () => void;
  onNavigateToJournal: () => void;
  onNavigateToLibrary?: (folderId?: string) => void;
  onOpenCreate: () => void;
  onTriggerOnboarding?: () => void;
  testID?: string;
  todayDate?: string;
  initialRoutines?: MobileRoutineItem[];
  initialOccurrences?: MobileOccurrenceItem[];
  initialTasks?: MobileTaskItem[];
  initialFolders?: Array<{ id: string; name: string }>;
  repository?: LocalRepositoryPort;
  syncEngine?: SyncEngine;
  apiClient?: DaynoriApiClient;
  workspaceId?: string | null;
  userId?: string | null;
  isOnline?: boolean;
  refreshTrigger?: number;
}

const DEFAULT_TODAY = '2026-10-14';
const DEFAULT_YESTERDAY = '2026-10-13';

const DEFAULT_ROUTINES: MobileRoutineItem[] = [
  {
    id: 'r1',
    title: 'Morning deep work session',
    details: 'Focus on primary architectural deliverables without interruptions.',
    frequency: 'weekdays',
    weekdays: [1, 2, 3, 4, 5],
    timezone: 'America/New_York',
    scheduledTime: '08:30',
    activeFrom: '2026-01-01',
    activeTo: null,
    isPaused: false,
    isArchived: false,
  },
  {
    id: 'r2',
    title: 'Evening reflection & summary',
    details: 'Review completed items and write brief journal entry.',
    frequency: 'daily',
    weekdays: [1, 2, 3, 4, 5, 6, 7],
    timezone: 'America/New_York',
    scheduledTime: '20:00',
    activeFrom: '2026-01-01',
    activeTo: null,
    isPaused: false,
    isArchived: false,
  },
];

const DEFAULT_OCCURRENCES: MobileOccurrenceItem[] = [
  {
    id: 'occ_r1_today',
    routineId: 'r1',
    status: 'pending',
    completedAt: null,
    scheduledDate: DEFAULT_TODAY,
  },
  {
    id: 'occ_r2_today',
    routineId: 'r2',
    status: 'pending',
    completedAt: null,
    scheduledDate: DEFAULT_TODAY,
  },
  {
    id: 'occ_r1_yesterday',
    routineId: 'r1',
    status: 'done',
    completedAt: `${DEFAULT_YESTERDAY}T09:15:00.000Z`,
    scheduledDate: DEFAULT_YESTERDAY,
  },
  {
    id: 'occ_r2_yesterday',
    routineId: 'r2',
    status: 'done',
    completedAt: `${DEFAULT_YESTERDAY}T20:45:00.000Z`,
    scheduledDate: DEFAULT_YESTERDAY,
  },
];

const DEFAULT_TASKS: MobileTaskItem[] = [
  {
    id: 't1',
    title: 'Review quarterly architecture plan',
    due: 'Today, 4:00 PM',
    completed: false,
  },
  {
    id: 't2',
    title: 'Prepare project handoff documentation',
    due: 'Today, 6:00 PM',
    completed: false,
  },
];

export const TodayView: React.FC<TodayViewProps> = ({
  themeMode,
  onNavigateToPlan,
  onNavigateToJournal,
  onNavigateToLibrary,
  onOpenCreate,
  onTriggerOnboarding,
  testID = 'today-view',
  todayDate: todayDateProp = DEFAULT_TODAY,
  initialRoutines = DEFAULT_ROUTINES,
  initialOccurrences = DEFAULT_OCCURRENCES,
  initialTasks = DEFAULT_TASKS,
  initialFolders = [],
  repository,
  syncEngine,
  apiClient,
  workspaceId,
  userId,
  isOnline: _isOnline = true,
  refreshTrigger = 0,
}) => {
  const palette = colors[themeMode];
  const isProduction = Boolean(repository && workspaceId);

  // Timezone & dynamic calendar reference
  const [viewingTimezone, setViewingTimezone] = useState<string>(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch {
      return 'UTC';
    }
  });

  const [currentNow, setCurrentNow] = useState<Date>(() => new Date());

  const todayDate = useMemo(() => {
    if (!isProduction) return todayDateProp;
    return getCalendarDateInTimezone(currentNow, viewingTimezone);
  }, [isProduction, todayDateProp, currentNow, viewingTimezone]);

  const yesterdayDate = useMemo(() => {
    return addCalendarDays(todayDate, -1);
  }, [todayDate]);

  // Production vs Interactive demo states
  const [demoState, setDemoState] = useState<'normal' | 'empty' | 'loading' | 'error'>('normal');
  const [isLoading, setIsLoading] = useState<boolean>(isProduction);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Clear demo fixtures during authenticated production load
  const [tasks, setTasks] = useState<MobileTaskItem[]>(isProduction ? [] : initialTasks);
  const [routines, setRoutines] = useState<MobileRoutineItem[]>(
    isProduction ? [] : initialRoutines
  );
  const [occurrences, setOccurrences] = useState<MobileOccurrenceItem[]>(
    isProduction ? [] : initialOccurrences
  );
  const [recentItems, setRecentItems] = useState<RecentItemEntry[]>([]);
  const [workspaceFolders, setWorkspaceFolders] =
    useState<Array<{ id: string; name: string }>>(initialFolders);
  const rawTasksRef = useRef<TaskRecord[]>([]);

  // Phase 30 Customization & Synchronization State
  const [homeLayout, setHomeLayout] = useState<HomeLayout>(() => getDefaultHomeLayout());
  const [preferencesRevision, setPreferencesRevision] = useState<number>(0);
  const [isCustomizing, setIsCustomizing] = useState(false);
  const [isOverdueExpanded, setIsOverdueExpanded] = useState(false);
  const [hasUnsupportedVersion, setHasUnsupportedVersion] = useState(false);
  const [conflictState, setConflictState] = useState<{
    serverRevision: number;
    serverLayout: HomeLayout;
  } | null>(null);

  // Scope tracker to clear stale visible data on account changes and ignore late results
  const activeScopeRef = useRef<{ workspaceId: string | null; userId: string | null }>({
    workspaceId: workspaceId ?? null,
    userId: userId ?? null,
  });

  useEffect(() => {
    activeScopeRef.current = { workspaceId: workspaceId ?? null, userId: userId ?? null };
    if (isProduction) {
      setTasks([]);
      setRoutines([]);
      setOccurrences([]);
      setRecentItems([]);
      setWorkspaceFolders([]);
      setHomeLayout(getDefaultHomeLayout());
      setPreferencesRevision(0);
      setConflictState(null);
      setHasUnsupportedVersion(false);
      setIsLoading(true);
      setErrorMessage(null);
    }
  }, [workspaceId, userId, isProduction]);

  // History sheet state
  const [historyRoutine, setHistoryRoutine] = useState<MobileRoutineItem | null>(null);
  const [historyOccurrencesList, setHistoryOccurrencesList] = useState<RoutineOccurrenceRecord[]>(
    []
  );

  // Undo notification state
  const [undoNotice, setUndoNotice] = useState<{
    message: string;
    routineId: string;
    occurrenceId: string;
    previousStatus: RoutineOccurrenceStatus;
    previousCompletedAt: string | null;
    previousHistory: RoutineOccurrenceTransition[];
  } | null>(null);
  const undoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Production data loader
  const loadProductionData = useCallback(async () => {
    if (!repository || !workspaceId) return;

    const currentScope = { workspaceId, userId: userId ?? null };
    setIsLoading(true);
    setErrorMessage(null);

    try {
      // 1. Load preferences
      let loadedRevision = 0;
      if (apiClient) {
        try {
          const prefRes = await apiClient.getUserPreferences();
          if (
            activeScopeRef.current.workspaceId !== currentScope.workspaceId ||
            activeScopeRef.current.userId !== currentScope.userId
          ) {
            return;
          }
          if (prefRes?.data) {
            loadedRevision = prefRes.data.revision;
            setPreferencesRevision(loadedRevision);
            if (prefRes.data.timeZone) {
              setViewingTimezone(prefRes.data.timeZone);
            }
            if (prefRes.data.preferences?.homeLayout) {
              try {
                setHomeLayout(sanitizeAndMigrateHomeLayout(prefRes.data.preferences.homeLayout));
                setHasUnsupportedVersion(false);
              } catch (err) {
                if (err instanceof UnsupportedLayoutVersionError) {
                  setHasUnsupportedVersion(true);
                }
              }
            }
            let pendingOnboarding: unknown = undefined;
            try {
              const snap = await repository.getPreferenceSnapshot(userId || 'anonymous');
              const snapPending = snap?.preferences?.['_pendingPreferences'] as
                Record<string, unknown> | undefined;
              if (snapPending?.['onboarding']) {
                pendingOnboarding = snapPending['onboarding'];
              }
              if (snapPending && apiClient) {
                const expectedRev =
                  (snap?.preferences?.['_pendingExpectedRevision'] as number | undefined) ??
                  prefRes.data.revision;
                void apiClient
                  .updateUserPreferences({
                    preferences: snapPending,
                    expectedRevision: expectedRev,
                  })
                  .then(async (res) => {
                    if (res?.data) {
                      const clean = { ...snap?.preferences };
                      delete clean['_pendingPreferences'];
                      delete clean['_pendingExpectedRevision'];
                      await repository.savePreferenceSnapshot({
                        userId: userId || 'anonymous',
                        preferences: clean,
                        schemaVersion: 1,
                        revision: res.data.revision,
                        updatedAt: new Date().toISOString(),
                      });
                      setPreferencesRevision(res.data.revision);
                    }
                  })
                  .catch(() => {});
              }
            } catch {
              /* ignore */
            }

            const effectiveOnboarding = (pendingOnboarding ||
              prefRes.data.preferences?.onboarding) as OnboardingState | undefined;
            if (shouldShowOnboarding(effectiveOnboarding)) {
              onTriggerOnboarding?.();
            }
          }
        } catch {
          // Fall back to local snapshot if offline
        }
      }

      if (loadedRevision === 0) {
        try {
          const snapshot = await repository.getPreferenceSnapshot(userId || 'anonymous');
          if (
            activeScopeRef.current.workspaceId !== currentScope.workspaceId ||
            activeScopeRef.current.userId !== currentScope.userId
          ) {
            return;
          }
          if (snapshot) {
            setPreferencesRevision(snapshot.revision);
            const snapPrefs = (snapshot.preferences as Record<string, unknown> | undefined) || {};
            const snapTz = snapPrefs.timeZone;
            if (typeof snapTz === 'string' && snapTz) {
              setViewingTimezone(snapTz);
            }

            const pendingPrefs = snapPrefs['_pendingPreferences'] as
              Record<string, unknown> | undefined;
            const effectiveLayout = (pendingPrefs?.['homeLayout'] || snapPrefs.homeLayout) as
              HomeLayout | undefined;

            if (effectiveLayout) {
              try {
                setHomeLayout(sanitizeAndMigrateHomeLayout(effectiveLayout));
                setHasUnsupportedVersion(false);
              } catch (err) {
                if (err instanceof UnsupportedLayoutVersionError) {
                  setHasUnsupportedVersion(true);
                }
              }
            }

            // If online and pending preference changes exist, perform durable outbound sync
            if (pendingPrefs && apiClient) {
              const expectedRev =
                (snapPrefs['_pendingExpectedRevision'] as number | undefined) ?? snapshot.revision;
              void apiClient
                .updateUserPreferences({
                  preferences: pendingPrefs,
                  expectedRevision: expectedRev,
                })
                .then(async (res) => {
                  if (res?.data) {
                    const cleanPrefs = { ...snapPrefs };
                    delete cleanPrefs['_pendingPreferences'];
                    delete cleanPrefs['_pendingExpectedRevision'];
                    await repository.savePreferenceSnapshot({
                      userId: userId || 'anonymous',
                      preferences: cleanPrefs,
                      schemaVersion: 1,
                      revision: res.data.revision,
                      updatedAt: new Date().toISOString(),
                    });
                    setPreferencesRevision(res.data.revision);
                  }
                })
                .catch(() => {});
            }

            const effectiveOnb = (pendingPrefs?.['onboarding'] || snapPrefs.onboarding) as
              OnboardingState | undefined;
            if (shouldShowOnboarding(effectiveOnb)) {
              onTriggerOnboarding?.();
            }
          }
        } catch {
          // Fall back to defaults
        }
      }

      // 2. Load workspace folders
      try {
        if (apiClient) {
          const folderRes = await apiClient.listFolders(workspaceId).catch(() => null);
          if (
            folderRes?.data &&
            activeScopeRef.current.workspaceId === currentScope.workspaceId &&
            activeScopeRef.current.userId === currentScope.userId
          ) {
            setWorkspaceFolders(
              folderRes.data.map((f: { id: string; name: string }) => ({ id: f.id, name: f.name }))
            );
          }
        }
      } catch {
        // Non-blocking
      }

      // 3. Load routines
      const loadedRoutines = await repository.listRoutines(workspaceId);
      const loadedOccurrences = await repository.listRoutineOccurrences(
        workspaceId,
        undefined,
        yesterdayDate,
        addCalendarDays(todayDate, 7)
      );

      // Generate missing occurrences
      const updatedOccurrences = [...loadedOccurrences];
      for (const r of loadedRoutines) {
        const routineDate = getCalendarDateInTimezone(currentNow, r.timezone);
        if (!r.isPaused && !r.isArchived && isRoutineScheduledOnDate(r, routineDate)) {
          const exists = updatedOccurrences.some(
            (o) =>
              o.routineId === r.id && o.scheduledDate === routineDate && o.status !== 'cancelled'
          );
          if (!exists) {
            const deterministicId = computeDeterministicOccurrenceId(
              workspaceId,
              r.id,
              routineDate
            );
            const plannedInstant = calculatePlannedInstant(
              routineDate,
              r.scheduledTime,
              r.timezone
            );
            const nowIso = new Date().toISOString();
            const newOcc: RoutineOccurrenceRecord = {
              id: deterministicId,
              workspaceId,
              routineId: r.id,
              scheduledDate: routineDate,
              scheduleRevision: r.scheduleRevision,
              plannedInstant,
              timezone: r.timezone,
              status: 'pending',
              completedAt: null,
              completedBy: null,
              history: [],
              serverRevision: 1,
              createdAt: nowIso,
              updatedAt: nowIso,
            };
            await repository.upsertRoutineOccurrence(newOcc);
            updatedOccurrences.push(newOcc);
          }
        }
      }

      // 4. Load tasks
      const allTasks = await repository.listTasks(workspaceId);
      rawTasksRef.current = allTasks;
      const refDate = new Date();

      const activeTasks = allTasks.filter((t) => t.deletedAt === null);
      const todayTasks = activeTasks
        .map((t) => {
          const isOver = isTaskOverdue(
            { status: t.status, deadline: t.deadline },
            refDate,
            viewingTimezone
          );
          return {
            id: t.id,
            title: t.title,
            due:
              t.deadline?.type === 'timed'
                ? `Due ${t.deadline.timestamp.slice(11, 16)}`
                : isOver
                  ? 'Overdue'
                  : 'Today',
            completed: t.status === 'completed',
            isOverdue: isOver && t.status !== 'completed',
          };
        })
        .filter((t) => t.isOverdue || t.due.includes('Due') || t.due === 'Today');

      // 5. Load recent items
      try {
        const notes = await repository.listNotes(workspaceId);
        const files = await repository.listFiles(workspaceId);
        const journalEntries = await repository.listJournalEntries(workspaceId, {
          includeDeleted: false,
        });

        const rawRecent: RecentItemEntry[] = [
          ...notes.map((n) => ({
            id: n.id,
            type: 'note' as const,
            title: n.title,
            updatedAt: n.updatedAt,
            folderId: n.folderId,
          })),
          ...allTasks.map((t) => ({
            id: t.id,
            type: 'task' as const,
            title: t.title,
            updatedAt: t.updatedAt,
            folderId: t.folderId,
          })),
          ...loadedRoutines.map((r) => ({
            id: r.id,
            type: 'routine' as const,
            title: r.title,
            updatedAt: r.updatedAt,
            folderId: r.folderId,
          })),
          ...files.map((f) => ({
            id: f.id,
            type: 'file' as const,
            title: f.fileName,
            updatedAt: f.updatedAt,
            folderId: f.folderId,
          })),
          ...journalEntries.map((j) => ({
            id: j.id,
            type: 'journal' as const,
            title: j.title || 'Journal entry',
            updatedAt: j.updatedAt,
            folderId: j.folderId,
            bodyPreview: 'redacted',
          })),
        ];

        rawRecent.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
        const safeRecent = filterRecentItemsForPrivacy(rawRecent.slice(0, 5), {
          hideJournalSnippets: true,
        });
        setRecentItems(safeRecent);
      } catch {
        // Non-blocking
      }

      if (
        activeScopeRef.current.workspaceId !== currentScope.workspaceId ||
        activeScopeRef.current.userId !== currentScope.userId
      ) {
        return;
      }

      setRoutines(
        loadedRoutines.map((r) => ({
          id: r.id,
          title: r.title,
          details: r.details,
          frequency: r.frequency,
          weekdays: r.weekdays,
          timezone: r.timezone,
          scheduledTime: r.scheduledTime,
          activeFrom: r.activeFrom,
          activeTo: r.activeTo,
          isPaused: r.isPaused,
          isArchived: r.isArchived,
        }))
      );
      setOccurrences(
        updatedOccurrences.map((o) => ({
          id: o.id,
          routineId: o.routineId,
          status: o.status,
          completedAt: o.completedAt,
          scheduledDate: o.scheduledDate,
        }))
      );
      setTasks(todayTasks);
      setIsLoading(false);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
      setIsLoading(false);
    }
  }, [
    repository,
    workspaceId,
    userId,
    yesterdayDate,
    todayDate,
    currentNow,
    viewingTimezone,
    apiClient,
    refreshTrigger,
  ]);

  useEffect(() => {
    if (isProduction) {
      void loadProductionData();
    }
  }, [isProduction, loadProductionData]);

  // AppState foreground resume listener
  useEffect(() => {
    if (!isProduction) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        setCurrentNow(new Date());
        void loadProductionData();
      }
    });
    return () => sub.remove();
  }, [isProduction, loadProductionData]);

  // SyncEngine event listener
  useEffect(() => {
    if (!syncEngine || !isProduction) return;
    const unsub = syncEngine.onEvent((event) => {
      if (event.type === 'sync_completed' && event.changesCount > 0) {
        void loadProductionData();
      }
    });
    return unsub;
  }, [syncEngine, isProduction, loadProductionData]);

  useEffect(() => {
    return () => {
      if (undoTimeoutRef.current) {
        clearTimeout(undoTimeoutRef.current);
      }
    };
  }, []);

  const toggleTask = async (id: string) => {
    const task = tasks.find((t) => t.id === id);
    if (!task) return;
    const newCompleted = !task.completed;
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, completed: newCompleted } : t)));

    if (rawTasksRef.current && workspaceId) {
      const rawTask = rawTasksRef.current.find((t) => t.id === id);
      if (rawTask) {
        const nowIso = new Date().toISOString();
        const updatedTask: TaskRecord = {
          ...rawTask,
          status: newCompleted ? 'completed' : 'todo',
          completedAt: newCompleted ? nowIso : null,
          updatedAt: nowIso,
        };
        if (syncEngine) {
          const itemHeader: ItemHeaderRecord = {
            id: rawTask.id,
            workspaceId,
            folderId: rawTask.folderId,
            name: rawTask.title,
            kind: 'task',
            rank: '00001000',
            securityScope: 'standard',
            isArchived: false,
            isPinned: false,
            serverRevision: rawTask.serverRevision,
            createdAt: rawTask.createdAt,
            updatedAt: nowIso,
            deletedAt: null,
          };
          await syncEngine.saveItem(
            itemHeader,
            undefined,
            newCompleted ? 'completeTask' : 'reopenTask',
            { payload: { status: updatedTask.status, completedAt: updatedTask.completedAt } }
          );
        } else if (repository) {
          await repository.upsertTask(updatedTask);
        }
      }
    }
  };

  // Find occurrence for a routine today
  const getTodayOccurrence = (routineId: string): MobileOccurrenceItem | null => {
    const routine = routines.find((r) => r.id === routineId);
    const routineDate =
      isProduction && routine ? getCalendarDateInTimezone(currentNow, routine.timezone) : todayDate;
    return (
      occurrences.find(
        (o) =>
          o.routineId === routineId && o.scheduledDate === routineDate && o.status !== 'cancelled'
      ) || null
    );
  };

  // Gentle progress summary
  const progress = useMemo(() => {
    const todayOccs = routines
      .map((r) => getTodayOccurrence(r.id))
      .filter(Boolean) as MobileOccurrenceItem[];
    return calculateGentleProgress(todayOccs);
  }, [routines, occurrences, todayDate]);

  const showUndoToast = (
    message: string,
    routineId: string,
    occurrenceId: string,
    previousStatus: RoutineOccurrenceStatus,
    previousCompletedAt: string | null,
    previousHistory: RoutineOccurrenceTransition[] = []
  ) => {
    if (undoTimeoutRef.current) {
      clearTimeout(undoTimeoutRef.current);
    }
    setUndoNotice({
      message,
      routineId,
      occurrenceId,
      previousStatus,
      previousCompletedAt,
      previousHistory,
    });
    undoTimeoutRef.current = setTimeout(() => {
      setUndoNotice(null);
    }, 5000);
  };

  const handleUndo = async () => {
    if (!undoNotice) return;
    const { occurrenceId, previousStatus, previousCompletedAt } = undoNotice;

    setOccurrences((prev) =>
      prev.map((o) =>
        o.id === occurrenceId
          ? {
              ...o,
              status: previousStatus,
              completedAt: previousCompletedAt,
            }
          : o
      )
    );

    if (isProduction && workspaceId && repository) {
      const existingOcc = await repository.getRoutineOccurrence(workspaceId, occurrenceId);
      if (existingOcc) {
        const nowIso = new Date().toISOString();
        const compensatingTransition: RoutineOccurrenceTransition = {
          fromStatus: existingOcc.status,
          toStatus: previousStatus,
          status: previousStatus,
          previousStatus: existingOcc.status,
          changedAt: nowIso,
          transitionedAt: nowIso,
          actorId: userId || null,
          reason: 'Mobile user compensated transition via undo toast',
        };

        const restoredOcc: RoutineOccurrenceRecord = {
          ...existingOcc,
          status: previousStatus,
          completedAt: previousCompletedAt,
          completedBy: previousStatus === 'done' ? userId || null : null,
          history: [...existingOcc.history, compensatingTransition],
          updatedAt: nowIso,
        };

        if (syncEngine) {
          const command =
            previousStatus === 'done'
              ? 'completeOccurrence'
              : previousStatus === 'skipped'
                ? 'skipOccurrence'
                : 'reopenOccurrence';
          await syncEngine.saveRoutineOccurrence(restoredOcc, command);
        } else {
          await repository.upsertRoutineOccurrence(restoredOcc);
        }
      }
    }

    setUndoNotice(null);
  };

  const handleCompleteRoutine = async (routineId: string, occurrenceId?: string) => {
    const occ = occurrenceId
      ? occurrences.find((o) => o.id === occurrenceId)
      : getTodayOccurrence(routineId);

    const prevStatus = occ?.status || 'pending';
    const prevCompletedAt = occ?.completedAt || null;
    const nowIso = new Date().toISOString();
    const routine = routines.find((r) => r.id === routineId);
    const routineDate =
      isProduction && routine ? getCalendarDateInTimezone(currentNow, routine.timezone) : todayDate;
    const effectiveOccId =
      occ?.id ||
      (workspaceId
        ? computeDeterministicOccurrenceId(workspaceId, routineId, routineDate)
        : `occ_${routineId}_${todayDate}`);

    const prevHistory = (occ as RoutineOccurrenceRecord)?.history || [];
    const updatedHistory: RoutineOccurrenceTransition[] = [
      ...prevHistory,
      {
        fromStatus: prevStatus,
        toStatus: 'done',
        status: 'done',
        changedAt: nowIso,
        transitionedAt: nowIso,
        actorId: userId || null,
        reason: null,
      },
    ];

    setOccurrences((prev) => {
      const existing = prev.find((o) => o.id === effectiveOccId);
      if (existing) {
        return prev.map((o) =>
          o.id === effectiveOccId ? { ...o, status: 'done', completedAt: nowIso } : o
        );
      }
      return [
        ...prev,
        {
          id: effectiveOccId,
          routineId,
          status: 'done',
          completedAt: nowIso,
          scheduledDate: routineDate,
        },
      ];
    });

    if (isProduction && workspaceId) {
      const occRecord: RoutineOccurrenceRecord = {
        id: effectiveOccId,
        workspaceId,
        routineId,
        scheduledDate: occ?.scheduledDate || routineDate,
        scheduleRevision: 1,
        plannedInstant: null,
        timezone: routine?.timezone || 'UTC',
        status: 'done',
        completedAt: nowIso,
        completedBy: userId || null,
        history: updatedHistory,
        serverRevision: (occ as RoutineOccurrenceRecord)?.serverRevision || 1,
        createdAt: (occ as RoutineOccurrenceRecord)?.createdAt || nowIso,
        updatedAt: nowIso,
      };

      if (syncEngine) {
        await syncEngine.saveRoutineOccurrence(occRecord, 'completeOccurrence');
      } else if (repository) {
        await repository.upsertRoutineOccurrence(occRecord);
      }
    }

    showUndoToast(
      `Marked "${routine?.title || 'routine'}" as done.`,
      routineId,
      effectiveOccId,
      prevStatus,
      prevCompletedAt,
      prevHistory
    );
  };

  const handleSkipRoutine = async (routineId: string, occurrenceId?: string) => {
    const occ = occurrenceId
      ? occurrences.find((o) => o.id === occurrenceId)
      : getTodayOccurrence(routineId);

    const prevStatus = occ?.status || 'pending';
    const prevCompletedAt = occ?.completedAt || null;
    const nowIso = new Date().toISOString();
    const routine = routines.find((r) => r.id === routineId);
    const routineDate =
      isProduction && routine ? getCalendarDateInTimezone(currentNow, routine.timezone) : todayDate;
    const effectiveOccId =
      occ?.id ||
      (workspaceId
        ? computeDeterministicOccurrenceId(workspaceId, routineId, routineDate)
        : `occ_${routineId}_${todayDate}`);

    const prevHistory = (occ as RoutineOccurrenceRecord)?.history || [];
    const updatedHistory: RoutineOccurrenceTransition[] = [
      ...prevHistory,
      {
        fromStatus: prevStatus,
        toStatus: 'skipped',
        status: 'skipped',
        changedAt: nowIso,
        transitionedAt: nowIso,
        actorId: userId || null,
        reason: null,
      },
    ];

    setOccurrences((prev) => {
      const existing = prev.find((o) => o.id === effectiveOccId);
      if (existing) {
        return prev.map((o) =>
          o.id === effectiveOccId ? { ...o, status: 'skipped', completedAt: null } : o
        );
      }
      return [
        ...prev,
        {
          id: effectiveOccId,
          routineId,
          status: 'skipped',
          completedAt: null,
          scheduledDate: routineDate,
        },
      ];
    });

    if (isProduction && workspaceId) {
      const occRecord: RoutineOccurrenceRecord = {
        id: effectiveOccId,
        workspaceId,
        routineId,
        scheduledDate: occ?.scheduledDate || routineDate,
        scheduleRevision: 1,
        plannedInstant: null,
        timezone: routine?.timezone || 'UTC',
        status: 'skipped',
        completedAt: null,
        completedBy: null,
        history: updatedHistory,
        serverRevision: (occ as RoutineOccurrenceRecord)?.serverRevision || 1,
        createdAt: (occ as RoutineOccurrenceRecord)?.createdAt || nowIso,
        updatedAt: nowIso,
      };

      if (syncEngine) {
        await syncEngine.saveRoutineOccurrence(occRecord, 'skipOccurrence');
      } else if (repository) {
        await repository.upsertRoutineOccurrence(occRecord);
      }
    }

    showUndoToast(
      `Skipped "${routine?.title || 'routine'}" for today.`,
      routineId,
      effectiveOccId,
      prevStatus,
      prevCompletedAt,
      prevHistory
    );
  };

  const handleReopenRoutine = async (routineId: string, occurrenceId?: string) => {
    const occ = occurrenceId
      ? occurrences.find((o) => o.id === occurrenceId)
      : getTodayOccurrence(routineId);

    if (!occ) return;
    const nowIso = new Date().toISOString();
    const routine = routines.find((r) => r.id === routineId);

    setOccurrences((prev) =>
      prev.map((o) => (o.id === occ.id ? { ...o, status: 'pending', completedAt: null } : o))
    );

    if (isProduction && workspaceId) {
      const occRecord: RoutineOccurrenceRecord = {
        id: occ.id,
        workspaceId,
        routineId,
        scheduledDate: occ.scheduledDate,
        scheduleRevision: 1,
        plannedInstant: null,
        timezone: routine?.timezone || 'UTC',
        status: 'pending',
        completedAt: null,
        completedBy: null,
        history: [
          ...((occ as RoutineOccurrenceRecord)?.history || []),
          {
            fromStatus: occ.status,
            toStatus: 'pending',
            status: 'pending',
            changedAt: nowIso,
            transitionedAt: nowIso,
            actorId: userId || null,
            reason: 'Reopened occurrence',
          },
        ],
        serverRevision: (occ as RoutineOccurrenceRecord)?.serverRevision || 1,
        createdAt: (occ as RoutineOccurrenceRecord)?.createdAt || nowIso,
        updatedAt: nowIso,
      };

      if (syncEngine) {
        await syncEngine.saveRoutineOccurrence(occRecord, 'reopenOccurrence');
      } else if (repository) {
        await repository.upsertRoutineOccurrence(occRecord);
      }
    }
  };

  const handleOpenHistory = async (routine: MobileRoutineItem) => {
    setHistoryRoutine(routine);
    if (repository && workspaceId) {
      const routineDate = getCalendarDateInTimezone(currentNow, routine.timezone);
      const past90 = addCalendarDays(routineDate, -90);
      const loaded = await repository.listRoutineOccurrences(
        workspaceId,
        routine.id,
        past90,
        routineDate
      );
      setHistoryOccurrencesList(loaded);
    } else {
      setHistoryOccurrencesList(
        occurrences
          .filter((o) => o.routineId === routine.id)
          .map((o) => ({
            id: o.id,
            workspaceId: 'mock-ws',
            routineId: o.routineId,
            scheduledDate: o.scheduledDate,
            scheduleRevision: 1,
            plannedInstant: null,
            timezone: 'UTC',
            status: o.status,
            completedAt: o.completedAt || null,
            completedBy: null,
            history: [],
            serverRevision: 1,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          }))
      );
    }
  };

  // Phase 30 Customization Handlers
  const handleToggleWidget = (id: HomeWidgetId) => {
    setHomeLayout((prev) => ({
      ...prev,
      widgets: prev.widgets.map((w) => (w.id === id ? { ...w, visible: !w.visible } : w)),
    }));
  };

  const handleMoveWidget = (id: HomeWidgetId, direction: 'up' | 'down') => {
    setHomeLayout((prev) => ({
      ...prev,
      widgets: reorderWidgets(prev.widgets, id, direction),
    }));
  };

  const handleLabelChange = (id: HomeWidgetId, label: string) => {
    const validated = validateCustomLabel(label);
    setHomeLayout((prev) => ({
      ...prev,
      widgets: prev.widgets.map((w) => (w.id === id ? { ...w, customLabel: validated } : w)),
    }));
  };

  // Module Shortcuts Handlers
  const handleToggleShortcut = (id: ModuleShortcutId) => {
    setHomeLayout((prev) => ({
      ...prev,
      moduleShortcuts: prev.moduleShortcuts.map((s) =>
        s.id === id ? { ...s, visible: !s.visible } : s
      ),
    }));
  };

  const handleShortcutLabelChange = (id: ModuleShortcutId, label: string) => {
    const validated = validateCustomLabel(label);
    setHomeLayout((prev) => ({
      ...prev,
      moduleShortcuts: prev.moduleShortcuts.map((s) =>
        s.id === id ? { ...s, customLabel: validated } : s
      ),
    }));
  };

  const handleMoveShortcut = (id: ModuleShortcutId, direction: 'up' | 'down') => {
    setHomeLayout((prev) => ({
      ...prev,
      moduleShortcuts: reorderModuleShortcuts(prev.moduleShortcuts, id, direction),
    }));
  };

  const handleDensityChange = (density: HomeDensity) => {
    setHomeLayout((prev) => ({ ...prev, density }));
  };

  const handleToggleFavoriteFolder = (folderId: string) => {
    setHomeLayout((prev) => {
      const exists = prev.favoriteFolderIds.includes(folderId);
      return {
        ...prev,
        favoriteFolderIds: exists
          ? prev.favoriteFolderIds.filter((id) => id !== folderId)
          : [...prev.favoriteFolderIds, folderId],
      };
    });
  };

  const handleRestoreDefaults = () => {
    setHomeLayout(getDefaultHomeLayout());
  };

  const handleSaveCustomization = async (forceOverwriteRevision?: number) => {
    if (!repository) {
      setIsCustomizing(false);
      return;
    }

    const targetRevision =
      forceOverwriteRevision !== undefined ? forceOverwriteRevision : preferencesRevision;

    try {
      let isSynced = false;
      let newRevision = targetRevision;

      // 1. If online and apiClient available, submit to server
      if (apiClient) {
        try {
          const res = await apiClient.updateUserPreferences({
            preferences: {
              homeLayout,
              compactMode: homeLayout.density === 'compact',
            },
            expectedRevision: targetRevision,
          });
          if (res.data) {
            newRevision = res.data.revision;
            setPreferencesRevision(newRevision);
            setConflictState(null);
            isSynced = true;
          }
        } catch (err: unknown) {
          const isConflict =
            (err instanceof ApiClientError && err.statusCode === 409) ||
            (err instanceof Error &&
              (err.message.includes('conflict') ||
                err.message.includes('revision') ||
                err.message.includes('409')));

          if (isConflict) {
            try {
              const latest = await apiClient.getUserPreferences();
              if (latest.data) {
                setConflictState({
                  serverRevision: latest.data.revision,
                  serverLayout: latest.data.preferences?.homeLayout
                    ? sanitizeAndMigrateHomeLayout(latest.data.preferences.homeLayout, {
                        allowUnsupportedVersion: true,
                      })
                    : getDefaultHomeLayout(),
                });
              }
            } catch {
              // ignore
            }
            setErrorMessage(
              'Preference conflict: layout was modified on another device. Keep your edits or discard to reload.'
            );
            return; // Keep unsaved customization sheet open
          }
        }
      }

      // 2. Persist to local repository snapshot, retaining separate local and authoritative server state
      const existingSnapshot = await repository.getPreferenceSnapshot(userId || 'anonymous');
      const existingPrefs =
        (existingSnapshot?.preferences as Record<string, unknown> | undefined) || {};
      const mergedPreferences: Record<string, unknown> = {
        ...existingPrefs,
        homeLayout,
        compactMode: homeLayout.density === 'compact',
      };

      if (!isSynced) {
        mergedPreferences['_pendingPreferences'] = {
          homeLayout,
          compactMode: homeLayout.density === 'compact',
        };
        mergedPreferences['_pendingExpectedRevision'] = targetRevision;
      } else {
        delete mergedPreferences['_pendingPreferences'];
        delete mergedPreferences['_pendingExpectedRevision'];
      }

      await repository.savePreferenceSnapshot({
        userId: userId || 'anonymous',
        preferences: mergedPreferences,
        schemaVersion: 1,
        revision: newRevision,
        updatedAt: new Date().toISOString(),
      });

      setIsCustomizing(false);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
    }
  };

  const handleKeepMyEdits = () => {
    if (!conflictState) return;
    const newRev = conflictState.serverRevision;
    setPreferencesRevision(newRev);
    void handleSaveCustomization(newRev);
  };

  const handleDiscardAndReload = () => {
    if (!conflictState) return;
    setHomeLayout(conflictState.serverLayout);
    setPreferencesRevision(conflictState.serverRevision);
    setConflictState(null);
    setErrorMessage(null);
  };

  const handleShortcutPress = (id: ModuleShortcutId) => {
    switch (id) {
      case 'today':
        break;
      case 'plan':
      case 'tasks':
      case 'routines':
      case 'calendar':
        onNavigateToPlan();
        break;
      case 'library':
      case 'notes':
      case 'files':
      case 'knowledge':
        if (onNavigateToLibrary) {
          onNavigateToLibrary();
        }
        break;
      case 'journal':
        onNavigateToJournal();
        break;
    }
  };

  const visibleWidgets = useMemo(() => {
    return [...homeLayout.widgets].filter((w) => w.visible).sort((a, b) => a.order - b.order);
  }, [homeLayout.widgets]);

  const visibleShortcuts = useMemo(() => {
    return [...homeLayout.moduleShortcuts]
      .filter((s) => s.visible)
      .sort((a, b) => a.order - b.order);
  }, [homeLayout.moduleShortcuts]);

  const dueTodayTasks = tasks.filter((t) => !t.isOverdue);
  const overdueTasks = tasks.filter((t) => t.isOverdue);

  return (
    <ScrollView
      testID={testID}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
    >
      {/* Date & Restrained Greeting */}
      <View style={styles.greetingHeader}>
        <View
          style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
        >
          <Text style={[styles.greetingDate, { color: palette.text.secondary }]}>
            {todayDate} · {viewingTimezone}
          </Text>
          <Pressable
            testID="mobile-customize-today-btn"
            accessibilityRole="button"
            accessibilityLabel="Customize Today screen"
            onPress={() => setIsCustomizing(true)}
            style={{ padding: spacing.xs }}
          >
            <Text style={{ fontSize: 13, fontWeight: '700', color: palette.action.primary }}>
              <Icon name="settings" /> Customize
            </Text>
          </Pressable>
        </View>
        <Text
          accessibilityRole="header"
          style={[styles.greetingTitle, { color: palette.text.primary }]}
        >
          Today
        </Text>
      </View>

      {/* State switchers for verification & demonstration */}
      <View style={styles.stateSelector}>
        <Text style={[styles.stateSelectorLabel, { color: palette.text.secondary }]}>
          State Preview:
        </Text>
        <View style={styles.stateButtonGroup}>
          {(['normal', 'empty', 'loading', 'error'] as const).map((s) => (
            <Pressable
              key={s}
              testID={`state-btn-${s}`}
              accessibilityRole="button"
              accessibilityLabel={`Show ${s} state`}
              accessibilityState={{ selected: demoState === s }}
              onPress={() => setDemoState(s)}
              style={[
                styles.stateButton,
                {
                  backgroundColor: demoState === s ? palette.action.primary : palette.surfaceRaised,
                  borderColor: palette.border.subtle,
                },
              ]}
            >
              <Text
                style={[
                  styles.stateButtonText,
                  { color: demoState === s ? palette.action.label : palette.text.primary },
                ]}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Production Loading State */}
      {isProduction && isLoading && (
        <View testID="today-production-loading" style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={palette.action.primary} />
          <Text style={[styles.loadingText, { color: palette.text.secondary }]}>
            Loading today&apos;s agenda...
          </Text>
        </View>
      )}

      {/* Production Error State */}
      {isProduction && errorMessage && !isLoading && (
        <View testID="today-production-error" style={styles.errorContainer}>
          <MobileFeedback severity="danger" message={errorMessage} themeMode={themeMode} />
        </View>
      )}

      {/* Conflict Resolution Banner */}
      {conflictState && (
        <View
          style={{
            marginHorizontal: spacing.sm,
            marginBottom: spacing.sm,
            padding: spacing.sm,
            borderRadius: radii.sm,
            backgroundColor: palette.surfaceRaised,
            borderWidth: 1,
            borderColor: palette.status.warning,
            gap: spacing.xs,
          }}
        >
          <Text style={{ fontWeight: '700', color: palette.text.primary, fontSize: 13 }}>
            <Icon name="warning" /> Settings Conflict Detected
          </Text>
          <Text style={{ fontSize: 12, color: palette.text.secondary }}>
            Preferences were updated on another device (rev {conflictState.serverRevision}). Your
            unsaved changes are preserved.
          </Text>
          <View style={{ flexDirection: 'row', gap: spacing.xs, marginTop: 4 }}>
            <MobileButton variant="primary" themeMode={themeMode} onPress={handleKeepMyEdits}>
              Keep My Edits
            </MobileButton>
            <MobileButton
              variant="secondary"
              themeMode={themeMode}
              onPress={handleDiscardAndReload}
            >
              Discard & Reload
            </MobileButton>
          </View>
        </View>
      )}

      {/* Module Shortcuts Navigation Bar */}
      {visibleShortcuts.length > 0 && (!isProduction || !isLoading) && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{
            gap: spacing.xs,
            paddingHorizontal: spacing.xs,
            marginBottom: spacing.sm,
          }}
        >
          {visibleShortcuts.map((shortcut) => {
            const label = shortcut.customLabel || DEFAULT_MODULE_LABELS[shortcut.id] || shortcut.id;
            return (
              <Pressable
                key={shortcut.id}
                testID={`mobile-shortcut-${shortcut.id}`}
                accessibilityRole="button"
                accessibilityLabel={`Navigate to ${label}`}
                onPress={() => handleShortcutPress(shortcut.id)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  paddingHorizontal: spacing.sm,
                  paddingVertical: spacing.xs,
                  borderRadius: radii.pill,
                  backgroundColor: palette.surfaceRaised,
                  borderWidth: 1,
                  borderColor: palette.border.subtle,
                }}
              >
                <Text style={{ fontSize: 14 }}>
                  <Icon name={MOBILE_MODULE_SHORTCUT_ICONS[shortcut.id]} />
                </Text>
                <Text style={{ fontSize: 13, fontWeight: '600', color: palette.text.primary }}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {/* Loading State */}
      {demoState === 'loading' && (
        <View testID="today-loading-state" style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={palette.action.primary} />
          <Text style={[styles.loadingText, { color: palette.text.secondary }]}>
            Loading today&apos;s agenda...
          </Text>
        </View>
      )}

      {/* Error State */}
      {demoState === 'error' && (
        <View testID="today-error-state" style={styles.errorContainer}>
          <MobileFeedback
            severity="danger"
            message="Failed to synchronize today's items with workspace storage."
            themeMode={themeMode}
          />
          <View style={{ marginTop: spacing.sm }}>
            <MobileButton
              variant="secondary"
              themeMode={themeMode}
              onPress={() => setDemoState('normal')}
              accessibilityLabel="Retry connection"
            >
              Retry Connection
            </MobileButton>
          </View>
        </View>
      )}

      {/* Empty State */}
      {demoState === 'empty' && (
        <MobileEmptyState
          testID="today-empty-state"
          title="All caught up for today"
          description="You have no remaining tasks or routines scheduled for today. Take time to reflect or plan ahead."
          actionLabel="Create task"
          onAction={onOpenCreate}
          themeMode={themeMode}
        />
      )}

      {/* Normal State: Render Customizable Cards */}
      {demoState === 'normal' && (!isProduction || (!isLoading && !errorMessage)) && (
        <>
          {visibleWidgets.map((widget) => {
            const cardTitle = widget.customLabel || DEFAULT_WIDGET_LABELS[widget.id];

            // 1. Routines Card
            if (widget.id === 'routines') {
              return (
                <View key={widget.id} style={styles.section} testID="today-routines-section">
                  <View style={styles.sectionHeaderRow}>
                    <Text style={[styles.sectionTitle, { color: palette.text.primary }]}>
                      {cardTitle} ({progress.completedCount}/{routines.length} completed)
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.gentleProgressBanner,
                      {
                        backgroundColor: palette.surfaceRaised,
                        borderColor: palette.border.subtle,
                      },
                    ]}
                  >
                    <Text style={[styles.gentleProgressText, { color: palette.text.primary }]}>
                      {progress.message}
                    </Text>
                  </View>

                  <MobileCard themeMode={themeMode}>
                    {routines.length === 0 ? (
                      <Text
                        style={{ color: palette.text.secondary, fontSize: 13, padding: spacing.sm }}
                      >
                        No routines scheduled for today.
                      </Text>
                    ) : (
                      routines.map((routine) => {
                        const occ = getTodayOccurrence(routine.id);
                        return (
                          <MobileRoutineRow
                            key={routine.id}
                            routine={routine}
                            occurrence={occ}
                            viewingDate={todayDate}
                            themeMode={themeMode}
                            onComplete={handleCompleteRoutine}
                            onSkip={handleSkipRoutine}
                            onReopen={handleReopenRoutine}
                            onViewHistory={(id) => {
                              const r = routines.find((item) => item.id === id);
                              if (r) void handleOpenHistory(r);
                            }}
                            testID={`mobile-routine-row-${routine.id}`}
                          />
                        );
                      })
                    )}
                  </MobileCard>
                </View>
              );
            }

            // 2. Tasks Card
            if (widget.id === 'tasks') {
              return (
                <View key={widget.id} style={styles.section} testID="today-tasks-section">
                  <View style={styles.sectionHeaderRow}>
                    <Text style={[styles.sectionTitle, { color: palette.text.primary }]}>
                      {cardTitle} ({dueTodayTasks.filter((t) => !t.completed).length})
                    </Text>
                    <Text style={[styles.sectionSubtitle, { color: palette.text.secondary }]}>
                      One-off tasks
                    </Text>
                  </View>

                  <MobileCard themeMode={themeMode}>
                    {dueTodayTasks.length === 0 ? (
                      <Text
                        style={{ color: palette.text.secondary, fontSize: 13, padding: spacing.sm }}
                      >
                        No tasks due today.
                      </Text>
                    ) : (
                      dueTodayTasks.map((task) => (
                        <MobileListRow
                          key={task.id}
                          title={task.title}
                          metadata={task.due}
                          selected={task.completed}
                          themeMode={themeMode}
                          onPress={() => toggleTask(task.id)}
                          accessibilityLabel={`${task.title}, ${task.completed ? 'completed' : 'not completed'}`}
                        />
                      ))
                    )}
                  </MobileCard>

                  {/* Overdue collapsible group */}
                  {overdueTasks.length > 0 && (
                    <View style={{ marginTop: spacing.sm }}>
                      <Pressable
                        testID="mobile-toggle-overdue-btn"
                        accessibilityRole="button"
                        accessibilityLabel="Toggle overdue tasks"
                        onPress={() => setIsOverdueExpanded((v) => !v)}
                        style={{ paddingVertical: spacing.xs }}
                      >
                        <Text
                          style={{ fontSize: 12, fontWeight: '700', color: palette.status.danger }}
                        >
                          <Icon name={isOverdueExpanded ? 'chevron-down' : 'chevron-right'} /> {overdueTasks.length}{' '}
                          Overdue Task
                          {overdueTasks.length === 1 ? '' : 's'}
                        </Text>
                      </Pressable>

                      {isOverdueExpanded && (
                        <MobileCard themeMode={themeMode}>
                          {overdueTasks.map((task) => (
                            <MobileListRow
                              key={task.id}
                              title={task.title}
                              metadata={task.due}
                              selected={task.completed}
                              themeMode={themeMode}
                              onPress={() => toggleTask(task.id)}
                              accessibilityLabel={`${task.title}, overdue`}
                            />
                          ))}
                        </MobileCard>
                      )}
                    </View>
                  )}
                </View>
              );
            }

            // 3. Upcoming Summary Card
            if (widget.id === 'upcoming_summary') {
              return (
                <View key={widget.id} style={styles.section} testID="today-upcoming-section">
                  <Text style={[styles.sectionTitle, { color: palette.text.primary }]}>
                    {cardTitle}
                  </Text>
                  <MobileCard themeMode={themeMode}>
                    <Text style={[styles.cardBody, { color: palette.text.secondary }]}>
                      Upcoming priorities and routine schedule for the next seven days.
                    </Text>
                    <View style={styles.cardAction}>
                      <MobileButton
                        variant="subtle"
                        themeMode={themeMode}
                        onPress={onNavigateToPlan}
                        accessibilityLabel="View full schedule in Plan"
                      >
                        View Full Schedule in Plan <Icon name="arrow-right" />
                      </MobileButton>
                    </View>
                  </MobileCard>
                </View>
              );
            }

            // 4. Quick Capture Card
            if (widget.id === 'quick_capture') {
              return (
                <View key={widget.id} style={styles.section} testID="today-quick-capture-section">
                  <Text style={[styles.sectionTitle, { color: palette.text.primary }]}>
                    {cardTitle}
                  </Text>
                  <MobileCard themeMode={themeMode}>
                    <View style={{ flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' }}>
                      <Pressable
                        testID="mobile-quick-task"
                        onPress={onOpenCreate}
                        style={[styles.quickButton, { borderColor: palette.border.subtle }]}
                      >
                        <Text
                          style={{ fontSize: 13, color: palette.text.primary, fontWeight: '600' }}
                        >
                          <Icon name="check" /> Task
                        </Text>
                      </Pressable>
                      <Pressable
                        testID="mobile-quick-routine"
                        onPress={onOpenCreate}
                        style={[styles.quickButton, { borderColor: palette.border.subtle }]}
                      >
                        <Text
                          style={{ fontSize: 13, color: palette.text.primary, fontWeight: '600' }}
                        >
                          <Icon name="refresh" /> Routine
                        </Text>
                      </Pressable>
                      <Pressable
                        testID="mobile-quick-journal"
                        onPress={onNavigateToJournal}
                        style={[styles.quickButton, { borderColor: palette.border.subtle }]}
                      >
                        <Text
                          style={{ fontSize: 13, color: palette.text.primary, fontWeight: '600' }}
                        >
                          <Icon name="book" /> Journal
                        </Text>
                      </Pressable>
                    </View>
                  </MobileCard>
                </View>
              );
            }

            // 5. Journal Reflection Card (No body preview!)
            if (widget.id === 'journal_prompt') {
              return (
                <View key={widget.id} style={styles.section} testID="today-journal-section">
                  <Text style={[styles.sectionTitle, { color: palette.text.primary }]}>
                    {cardTitle}
                  </Text>
                  <MobileCard themeMode={themeMode}>
                    <Text style={[styles.cardPrompt, { color: palette.text.primary }]}>
                      What is one thing that brought clarity today?
                    </Text>
                    <Text style={[styles.cardBody, { color: palette.text.secondary }]}>
                      Private reflection entries are protected.
                    </Text>
                    <View style={styles.cardAction}>
                      <MobileButton
                        variant="secondary"
                        themeMode={themeMode}
                        onPress={onNavigateToJournal}
                        accessibilityLabel="Write reflection in Journal"
                      >
                        <Icon name="edit" /> Write in Journal
                      </MobileButton>
                    </View>
                  </MobileCard>
                </View>
              );
            }

            // 6. Recent Items Card
            if (widget.id === 'recent_items') {
              return (
                <View key={widget.id} style={styles.section} testID="today-recent-items-section">
                  <Text style={[styles.sectionTitle, { color: palette.text.primary }]}>
                    {cardTitle}
                  </Text>
                  <MobileCard themeMode={themeMode}>
                    {recentItems.length === 0 ? (
                      <Text
                        style={{ color: palette.text.secondary, fontSize: 13, padding: spacing.sm }}
                      >
                        No recent items recorded.
                      </Text>
                    ) : (
                      recentItems.map((item) => (
                        <Pressable
                          key={item.id}
                          testID={`mobile-recent-item-${item.id}`}
                          accessibilityRole="button"
                          accessibilityLabel={`Open ${item.title}`}
                          onPress={() => {
                            if (item.type === 'task' || item.type === 'routine') {
                              onNavigateToPlan();
                            } else if (item.type === 'journal') {
                              onNavigateToJournal();
                            } else {
                              onNavigateToLibrary?.(item.folderId ?? undefined);
                            }
                          }}
                          style={{
                            flexDirection: 'row',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            paddingVertical: spacing.xs,
                            borderBottomWidth: 1,
                            borderBottomColor: palette.border.subtle,
                          }}
                        >
                          <Text
                            style={{ color: palette.text.primary, fontSize: 13, fontWeight: '500' }}
                          >
                            {item.title}
                          </Text>
                          <Text
                            style={{
                              color: palette.text.secondary,
                              fontSize: 11,
                              textTransform: 'uppercase',
                            }}
                          >
                            {item.type}
                          </Text>
                        </Pressable>
                      ))
                    )}
                  </MobileCard>
                </View>
              );
            }

            // 7. Favorite Folders Card
            if (widget.id === 'favorite_folders') {
              const activeFavs = workspaceFolders.filter((f) =>
                homeLayout.favoriteFolderIds.includes(f.id)
              );

              return (
                <View key={widget.id} style={styles.section} testID="today-favorites-section">
                  <Text style={[styles.sectionTitle, { color: palette.text.primary }]}>
                    {cardTitle}
                  </Text>
                  <MobileCard themeMode={themeMode}>
                    {activeFavs.length === 0 ? (
                      <Text
                        style={{ color: palette.text.secondary, fontSize: 13, padding: spacing.sm }}
                      >
                        No favorite folders pinned.
                      </Text>
                    ) : (
                      activeFavs.map((f) => (
                        <Pressable
                          key={f.id}
                          testID={`mobile-fav-folder-${f.id}`}
                          accessibilityRole="button"
                          accessibilityLabel={`Open folder ${f.name}`}
                          onPress={() => onNavigateToLibrary?.(f.id)}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            paddingVertical: spacing.sm,
                            borderBottomWidth: 1,
                            borderBottomColor: palette.border.subtle,
                          }}
                        >
                          <Text
                            style={{ color: palette.text.primary, fontSize: 14, fontWeight: '600' }}
                          >
                            <Icon name="folder" /> {f.name}
                          </Text>
                        </Pressable>
                      ))
                    )}
                  </MobileCard>
                </View>
              );
            }

            return null;
          })}
        </>
      )}

      {/* Floating Reversible Undo Toast */}
      {undoNotice && (
        <View
          testID="undo-toast"
          accessibilityLiveRegion="polite"
          style={[
            styles.undoToast,
            {
              backgroundColor: palette.action.primary,
            },
          ]}
        >
          <Text style={[styles.undoToastText, { color: palette.action.label }]}>
            {undoNotice.message}
          </Text>
          <Pressable
            testID="undo-toast-btn"
            accessibilityRole="button"
            accessibilityLabel="Undo action"
            onPress={handleUndo}
            style={styles.undoToastButton}
          >
            <Text style={[styles.undoToastButtonText, { color: palette.action.label }]}>Undo</Text>
          </Pressable>
        </View>
      )}

      {/* Routine History Sheet */}
      {historyRoutine && (
        <MobileModalSheet
          visible={Boolean(historyRoutine)}
          onClose={() => {
            setHistoryRoutine(null);
            setHistoryOccurrencesList([]);
          }}
          title={`History: ${historyRoutine.title}`}
          themeMode={themeMode}
          testID="mobile-routine-history-sheet"
        >
          <View style={styles.historyContainer}>
            <Text style={[styles.historySubtitle, { color: palette.text.secondary }]}>
              {
                explainWhyDueToday(
                  {
                    frequency: historyRoutine.frequency,
                    weekdays: historyRoutine.weekdays,
                    timezone: historyRoutine.timezone,
                    scheduledTime: historyRoutine.scheduledTime || null,
                    activeFrom: historyRoutine.activeFrom || '2026-01-01',
                    activeTo: historyRoutine.activeTo || null,
                    isPaused: Boolean(historyRoutine.isPaused),
                    isArchived: Boolean(historyRoutine.isArchived),
                  },
                  todayDate
                ).cadenceDescription
              }
            </Text>

            <View
              style={[
                styles.historyStatsCard,
                {
                  backgroundColor: palette.surfaceRaised,
                  borderColor: palette.border.subtle,
                },
              ]}
            >
              <Text style={[styles.historyStatsTitle, { color: palette.text.primary }]}>
                Gentle Routine Overview
              </Text>
              <Text style={[styles.historyStatsMessage, { color: palette.text.secondary }]}>
                {calculateGentleProgress(historyOccurrencesList).message}
              </Text>
            </View>

            <View style={{ marginTop: spacing.lg }}>
              <MobileButton
                variant="secondary"
                themeMode={themeMode}
                onPress={() => setHistoryRoutine(null)}
                accessibilityLabel="Close history"
              >
                Close History
              </MobileButton>
            </View>
          </View>
        </MobileModalSheet>
      )}

      {/* Phase 30: Customize Today ModalSheet */}
      {isCustomizing && (
        <MobileModalSheet
          visible={isCustomizing}
          onClose={() => setIsCustomizing(false)}
          title="Customize Today"
          themeMode={themeMode}
          testID="mobile-customization-sheet"
        >
          <ScrollView style={{ maxHeight: 400, padding: spacing.sm }}>
            <Text
              style={{
                fontSize: 13,
                fontWeight: '700',
                color: palette.text.primary,
                marginBottom: spacing.sm,
              }}
            >
              Cards & Ordering
            </Text>

            {[...homeLayout.widgets]
              .sort((a, b) => a.order - b.order)
              .map((w, idx, arr) => (
                <View
                  key={w.id}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingVertical: spacing.xs,
                    borderBottomWidth: 1,
                    borderBottomColor: palette.border.subtle,
                  }}
                >
                  <Pressable
                    testID={`mobile-toggle-${w.id}`}
                    onPress={() => handleToggleWidget(w.id)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flex: 1 }}
                  >
                    <Text style={{ fontSize: 14 }}>
                      <Icon name={w.visible ? 'check-square' : 'square'} />
                    </Text>
                    <Text style={{ color: palette.text.primary, fontSize: 13, fontWeight: '600' }}>
                      {DEFAULT_WIDGET_LABELS[w.id]}
                    </Text>
                  </Pressable>

                  <TextInput
                    testID={`mobile-label-input-${w.id}`}
                    defaultValue={w.customLabel || ''}
                    placeholder={DEFAULT_WIDGET_LABELS[w.id]}
                    placeholderTextColor={palette.text.secondary}
                    onChangeText={(txt) => handleLabelChange(w.id, txt)}
                    maxLength={40}
                    style={{
                      borderWidth: 1,
                      borderColor: palette.border.subtle,
                      borderRadius: radii.sm,
                      padding: 4,
                      fontSize: 12,
                      width: 110,
                      color: palette.text.primary,
                      marginHorizontal: spacing.xs,
                    }}
                  />

                  <View style={{ flexDirection: 'row', gap: 4 }}>
                    <Pressable
                      testID={`mobile-move-up-${w.id}`}
                      onPress={() => handleMoveWidget(w.id, 'up')}
                      disabled={idx === 0}
                      style={{ padding: 4, opacity: idx === 0 ? 0.3 : 1 }}
                    >
                      <Text style={{ color: palette.action.primary, fontSize: 14 }}>
                        <Icon name="chevron-up" />
                      </Text>
                    </Pressable>
                    <Pressable
                      testID={`mobile-move-down-${w.id}`}
                      onPress={() => handleMoveWidget(w.id, 'down')}
                      disabled={idx === arr.length - 1}
                      style={{ padding: 4, opacity: idx === arr.length - 1 ? 0.3 : 1 }}
                    >
                      <Text style={{ color: palette.action.primary, fontSize: 14 }}>
                        <Icon name="chevron-down" />
                      </Text>
                    </Pressable>
                  </View>
                </View>
              ))}

            {/* Module Shortcuts & Ordering */}
            <Text
              style={{
                fontSize: 13,
                fontWeight: '700',
                color: palette.text.primary,
                marginTop: spacing.md,
                marginBottom: spacing.sm,
              }}
            >
              Module Shortcuts & Ordering
            </Text>

            {[...homeLayout.moduleShortcuts]
              .sort((a, b) => a.order - b.order)
              .map((sc, idx, arr) => (
                <View
                  key={sc.id}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingVertical: spacing.xs,
                    borderBottomWidth: 1,
                    borderBottomColor: palette.border.subtle,
                  }}
                >
                  <Pressable
                    testID={`mobile-toggle-shortcut-${sc.id}`}
                    onPress={() => handleToggleShortcut(sc.id)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flex: 1 }}
                  >
                    <Text style={{ fontSize: 14 }}>
                      <Icon name={sc.visible ? 'check-square' : 'square'} />
                    </Text>
                    <Text style={{ color: palette.text.primary, fontSize: 13, fontWeight: '600' }}>
                      <Icon name={MOBILE_MODULE_SHORTCUT_ICONS[sc.id]} />{' '}
                      {DEFAULT_MODULE_LABELS[sc.id] || sc.id}
                    </Text>
                  </Pressable>

                  <TextInput
                    testID={`mobile-shortcut-label-input-${sc.id}`}
                    defaultValue={sc.customLabel || ''}
                    placeholder={DEFAULT_MODULE_LABELS[sc.id] || sc.id}
                    placeholderTextColor={palette.text.secondary}
                    onChangeText={(txt) => handleShortcutLabelChange(sc.id, txt)}
                    maxLength={40}
                    style={{
                      borderWidth: 1,
                      borderColor: palette.border.subtle,
                      borderRadius: radii.sm,
                      padding: 4,
                      fontSize: 12,
                      width: 110,
                      color: palette.text.primary,
                      marginHorizontal: spacing.xs,
                    }}
                  />

                  <View style={{ flexDirection: 'row', gap: 4 }}>
                    <Pressable
                      testID={`mobile-shortcut-move-up-${sc.id}`}
                      onPress={() => handleMoveShortcut(sc.id, 'up')}
                      disabled={idx === 0}
                      style={{ padding: 4, opacity: idx === 0 ? 0.3 : 1 }}
                    >
                      <Text style={{ color: palette.action.primary, fontSize: 14 }}>
                        <Icon name="chevron-up" />
                      </Text>
                    </Pressable>
                    <Pressable
                      testID={`mobile-shortcut-move-down-${sc.id}`}
                      onPress={() => handleMoveShortcut(sc.id, 'down')}
                      disabled={idx === arr.length - 1}
                      style={{ padding: 4, opacity: idx === arr.length - 1 ? 0.3 : 1 }}
                    >
                      <Text style={{ color: palette.action.primary, fontSize: 14 }}>
                        <Icon name="chevron-down" />
                      </Text>
                    </Pressable>
                  </View>
                </View>
              ))}

            {/* Layout Density */}
            <Text
              style={{
                fontSize: 13,
                fontWeight: '700',
                color: palette.text.primary,
                marginTop: spacing.md,
                marginBottom: spacing.xs,
              }}
            >
              Density
            </Text>
            <View style={{ flexDirection: 'row', gap: spacing.md, marginBottom: spacing.sm }}>
              <Pressable
                testID="mobile-density-comfortable"
                onPress={() => handleDensityChange('comfortable')}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
              >
                <Text style={{ fontSize: 14 }}>
                  <Icon name={homeLayout.density === 'comfortable' ? 'radio-selected' : 'circle'} />
                </Text>
                <Text style={{ color: palette.text.primary, fontSize: 13 }}>Comfortable</Text>
              </Pressable>
              <Pressable
                testID="mobile-density-compact"
                onPress={() => handleDensityChange('compact')}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
              >
                <Text style={{ fontSize: 14 }}>
                  <Icon name={homeLayout.density === 'compact' ? 'radio-selected' : 'circle'} />
                </Text>
                <Text style={{ color: palette.text.primary, fontSize: 13 }}>Compact</Text>
              </Pressable>
            </View>

            {/* Favorite Folders Picker */}
            {workspaceFolders.length > 0 && (
              <>
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: '700',
                    color: palette.text.primary,
                    marginTop: spacing.md,
                    marginBottom: spacing.xs,
                  }}
                >
                  Favorite Folders
                </Text>
                {workspaceFolders.map((folder) => {
                  const isFav = homeLayout.favoriteFolderIds.includes(folder.id);
                  return (
                    <Pressable
                      key={folder.id}
                      testID={`mobile-toggle-fav-${folder.id}`}
                      onPress={() => handleToggleFavoriteFolder(folder.id)}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: spacing.xs,
                        paddingVertical: 4,
                      }}
                    >
                      <Text style={{ fontSize: 14 }}>
                        <Icon name={isFav ? 'check-square' : 'square'} />
                      </Text>
                      <Text style={{ color: palette.text.primary, fontSize: 13 }}>
                        <Icon name="folder" /> {folder.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </>
            )}

            {/* Conflict Notification in Sheet */}
            {conflictState && (
              <View
                style={{
                  marginVertical: spacing.sm,
                  padding: spacing.sm,
                  borderRadius: radii.sm,
                  backgroundColor: palette.surfaceRaised,
                  borderWidth: 1,
                  borderColor: palette.status.warning,
                  gap: spacing.xs,
                }}
              >
                <Text style={{ fontWeight: '700', color: palette.text.primary, fontSize: 12 }}>
                  <Icon name="warning" /> Cloud Conflict (rev {conflictState.serverRevision})
                </Text>
                <View style={{ flexDirection: 'row', gap: spacing.xs, marginTop: 4 }}>
                  <MobileButton variant="primary" themeMode={themeMode} onPress={handleKeepMyEdits}>
                    Keep My Edits
                  </MobileButton>
                  <MobileButton
                    variant="secondary"
                    themeMode={themeMode}
                    onPress={handleDiscardAndReload}
                  >
                    Discard & Reload
                  </MobileButton>
                </View>
              </View>
            )}

            <View style={{ marginTop: spacing.base, gap: spacing.xs }}>
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <MobileButton
                  testID="mobile-restore-defaults-btn"
                  variant="subtle"
                  themeMode={themeMode}
                  onPress={handleRestoreDefaults}
                  accessibilityLabel="Restore default layout"
                >
                  Restore Defaults
                </MobileButton>

                <MobileButton
                  testID="mobile-save-customization-btn"
                  variant="primary"
                  themeMode={themeMode}
                  onPress={() => void handleSaveCustomization()}
                  accessibilityLabel="Save customization"
                  disabled={hasUnsupportedVersion}
                >
                  Save
                </MobileButton>
              </View>
              <Text style={{ fontSize: 11, color: palette.text.secondary, marginTop: 4 }}>
                Restores default layout presentation without modifying notes, tasks, or routines.
              </Text>
            </View>
          </ScrollView>
        </MobileModalSheet>
      )}

      {/* Routine History Sheet */}
      {historyRoutine && (
        <MobileModalSheet
          visible={Boolean(historyRoutine)}
          onClose={() => setHistoryRoutine(null)}
          title={historyRoutine ? `History: ${historyRoutine.title}` : 'Routine History'}
          themeMode={themeMode}
          testID="mobile-routine-history-sheet"
        >
          <View style={styles.historyContainer}>
            <Text style={[styles.historySubtitle, { color: palette.text.secondary }]}>
              Recent occurrence records and daily completion stats
            </Text>

            {/* Gentle Progress Banner */}
            <View
              style={[
                styles.historyStatsCard,
                {
                  backgroundColor: palette.surface,
                  borderColor: palette.border.subtle,
                },
              ]}
            >
              <Text style={[styles.historyStatsTitle, { color: palette.text.primary }]}>
                Routine Progress
              </Text>
              <Text style={[styles.historyStatsMessage, { color: palette.text.secondary }]}>
                {progress.message}
              </Text>
              <View style={styles.historyStatsRow}>
                <Text style={[styles.historyStatPill, { color: palette.action.primary }]}>
                  Done: {progress.completedCount}
                </Text>
                <Text style={[styles.historyStatPill, { color: palette.accent.warm }]}>
                  Skipped: {progress.skippedCount}
                </Text>
                <Text style={[styles.historyStatPill, { color: palette.text.muted }]}>
                  Pending: {progress.pendingCount}
                </Text>
              </View>
            </View>

            <Text style={[styles.historyListTitle, { color: palette.text.primary }]}>
              Past Occurrences (90 Days)
            </Text>

            {historyOccurrencesList.length === 0 ? (
              <Text
                style={{ color: palette.text.muted, fontSize: 13, paddingVertical: spacing.md }}
              >
                No past occurrences found for this routine.
              </Text>
            ) : (
              historyOccurrencesList.map((occ) => (
                <View
                  key={occ.id}
                  testID={`history-occ-${occ.scheduledDate}`}
                  style={[styles.historyItemRow, { borderBottomColor: palette.border.subtle }]}
                >
                  <View>
                    <Text style={[styles.historyItemDate, { color: palette.text.primary }]}>
                      {occ.scheduledDate}
                    </Text>
                    {occ.completedAt && (
                      <Text style={[styles.historyItemTimestamp, { color: palette.text.muted }]}>
                        Completed at {occ.completedAt.slice(11, 16)} UTC
                      </Text>
                    )}
                  </View>
                  <View style={styles.historyBadgeGroup}>
                    <Text
                      style={[
                        styles.historyStatusBadge,
                        {
                          backgroundColor:
                            occ.status === 'done'
                              ? '#d1fae5'
                              : occ.status === 'skipped'
                                ? '#fef3c7'
                                : palette.surfaceRaised,
                          color:
                            occ.status === 'done'
                              ? '#065f46'
                              : occ.status === 'skipped'
                                ? '#92400e'
                                : palette.text.secondary,
                        },
                      ]}
                    >
                      {occ.status.toUpperCase()}
                    </Text>
                    {occ.status !== 'pending' && (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Reopen occurrence for ${occ.scheduledDate}`}
                        onPress={() => handleReopenRoutine(historyRoutine.id, occ.id)}
                        style={styles.historyReopenBtn}
                      >
                        <Text
                          style={{ color: palette.action.primary, fontSize: 12, fontWeight: '600' }}
                        >
                          Reopen
                        </Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              ))
            )}

            <View style={{ marginTop: spacing.lg }}>
              <MobileButton
                variant="secondary"
                themeMode={themeMode}
                onPress={() => setHistoryRoutine(null)}
                accessibilityLabel="Close history"
              >
                Close History
              </MobileButton>
            </View>
          </View>
        </MobileModalSheet>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  scrollContent: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  greetingHeader: {
    marginBottom: spacing.md,
  },
  greetingDate: {
    fontSize: 13,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  greetingTitle: {
    fontSize: 24,
    fontWeight: '800',
    marginTop: 2,
  },
  stateSelector: {
    marginBottom: spacing.md,
  },
  stateSelectorLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  stateButtonGroup: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  stateButton: {
    flex: 1,
    minHeight: 36,
    borderRadius: radii.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  stateButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  loadingContainer: {
    padding: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  loadingText: {
    fontSize: 13,
  },
  errorContainer: {
    padding: spacing.sm,
  },
  section: {
    marginBottom: spacing.base,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  sectionSubtitle: {
    fontSize: 12,
  },
  gentleProgressBanner: {
    padding: spacing.sm,
    borderRadius: radii.sm,
    borderWidth: 1,
    marginBottom: spacing.sm,
  },
  gentleProgressText: {
    fontSize: 13,
    fontWeight: '500',
  },
  cardBody: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: spacing.sm,
  },
  cardPrompt: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  cardAction: {
    alignItems: 'flex-start',
  },
  quickButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.sm,
    borderWidth: 1,
  },
  undoToast: {
    position: 'absolute',
    bottom: spacing.lg,
    left: spacing.md,
    right: spacing.md,
    padding: spacing.md,
    borderRadius: radii.card,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    elevation: 4,
  },
  undoToastText: {
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },
  undoToastButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  undoToastButtonText: {
    fontSize: 13,
    fontWeight: '700',
  },
  historyContainer: {
    padding: spacing.sm,
  },
  historySubtitle: {
    fontSize: 13,
    marginBottom: spacing.sm,
  },
  historyStatsCard: {
    padding: spacing.sm,
    borderRadius: radii.sm,
    borderWidth: 1,
    marginBottom: spacing.md,
  },
  historyStatsTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  historyStatsMessage: {
    fontSize: 13,
  },
  historyStatsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: 4,
  },
  historyStatPill: {
    fontSize: 12,
    fontWeight: '600',
  },
  historyListTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  historyItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
  },
  historyItemDate: {
    fontSize: 13,
    fontWeight: '600',
  },
  historyItemTimestamp: {
    fontSize: 11,
    marginTop: 2,
  },
  historyBadgeGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  historyStatusBadge: {
    fontSize: 10,
    fontWeight: '700',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.pill,
    overflow: 'hidden',
  },
  historyReopenBtn: {
    minHeight: 36,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
