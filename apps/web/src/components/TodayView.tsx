'use client';

import { Icon } from '@daynori/ui-web';
import React, { useState, useEffect, useRef, useId, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { colors, radii, spacing, touchTargets, typography } from '@daynori/design-tokens';
import {
  Button,
  Card,
  EmptyState,
  Feedback,
  RoutineRow,
  RoutineDetailEditor,
  RoutineHistoryViewer,
} from '@daynori/ui-web';
import { useShell } from './ShellContext';
import { useAuth } from './AuthContext';
import { IndexedDbLocalRepository } from '../data/indexedDbRepository';
import { createWebSyncEngine } from '../data/syncAdapter';
import {
  type SyncEngine,
  type RoutineRecord,
  type RoutineOccurrenceRecord,
  type TaskRecord,
  type ItemHeaderRecord,
} from '@daynori/sync';
import { ApiClientError } from '@daynori/api-client';
import { createWebApiClient } from '../data/webApiClient';
import {
  getCalendarDateInTimezone,
  addCalendarDays,
  calculatePlannedInstant,
  computeDeterministicOccurrenceId,
  isRoutineScheduledOnDate,
  calculateGentleProgress,
  reconcileOccurrencesOnScheduleChange,
  selectApplicableScheduleRule,
  isTaskDueToday,
  isTaskOverdue,
  type RoutineFrequency,
  type Weekday,
  type RoutineOccurrenceStatus,
  type RoutineTemplateRule,
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
  type RecentItemEntry,
} from '@daynori/domain';

const MODULE_SHORTCUT_HREFS: Record<ModuleShortcutId, string> = {
  today: '/today',
  plan: '/plan',
  library: '/library',
  journal: '/journal',
  notes: '/library?view=notes',
  tasks: '/plan?view=tasks',
  routines: '/plan?view=routines',
  calendar: '/plan?view=calendar',
  files: '/library?view=files',
  knowledge: '/library?view=knowledge',
};

const MODULE_SHORTCUT_ICONS: Record<ModuleShortcutId, string> = {
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

function getRecentItemHref(item: RecentItemEntry): string {
  switch (item.type) {
    case 'note':
      return `/library?folderId=${item.folderId || ''}&noteId=${item.id}`;
    case 'task':
      return `/plan?taskId=${item.id}`;
    case 'routine':
      return `/plan?routineId=${item.id}`;
    case 'file':
      return `/library?fileId=${item.id}`;
    case 'journal':
      return `/journal?id=${item.id}`;
    default:
      return '/';
  }
}

export const TodayView: React.FC = () => {
  const liveRegionId = useId();
  const { themeMode, themePreference, setTheme, openModal, activeModal } = useShell();
  const palette = colors[themeMode];
  const { workspaceId, user, csrfToken, preferences: authPreferences } = useAuth();

  // Viewing timezone from account preferences with device timezone fallback
  const savedAccountTimezone = authPreferences?.timeZone;
  const [viewingTimezone, setViewingTimezone] = useState<string>(() => {
    return (
      savedAccountTimezone ||
      (() => {
        try {
          return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
        } catch {
          return 'UTC';
        }
      })()
    );
  });

  useEffect(() => {
    if (savedAccountTimezone && savedAccountTimezone !== viewingTimezone) {
      setViewingTimezone(savedAccountTimezone);
    }
  }, [savedAccountTimezone, viewingTimezone]);

  // Current calendar reference time
  const [currentNow, setCurrentNow] = useState<Date>(() => new Date());

  // Calculate Today and Yesterday calendar dates in user's viewing timezone
  const todayDate = useMemo(() => {
    return getCalendarDateInTimezone(currentNow, viewingTimezone);
  }, [currentNow, viewingTimezone]);

  const yesterdayDate = useMemo(() => {
    return addCalendarDays(todayDate, -1);
  }, [todayDate]);

  // Routines & Occurrences state
  const [routines, setRoutines] = useState<RoutineRecord[]>([]);
  const [occurrences, setOccurrences] = useState<RoutineOccurrenceRecord[]>([]);
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [recentItems, setRecentItems] = useState<RecentItemEntry[]>([]);
  const [workspaceFolders, setWorkspaceFolders] = useState<Array<{ id: string; name: string }>>([]);

  // Phase 30 Customization & Personalization State
  const [homeLayout, setHomeLayout] = useState<HomeLayout>(() => getDefaultHomeLayout());
  const [preferencesRevision, setPreferencesRevision] = useState<number>(0);
  const [isCustomizing, setIsCustomizing] = useState(false);
  const [isOverdueExpanded, setIsOverdueExpanded] = useState(false);
  const [isSavingLayout, setIsSavingLayout] = useState(false);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);
  const [hasUnsupportedVersion, setHasUnsupportedVersion] = useState(false);
  const [conflictState, setConflictState] = useState<{
    serverRevision: number;
    serverLayout: HomeLayout;
  } | null>(null);

  // Editor & History modal states
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingRoutine, setEditingRoutine] = useState<RoutineRecord | null>(null);
  const [historyRoutine, setHistoryRoutine] = useState<RoutineRecord | null>(null);
  const [historyOccurrences, setHistoryOccurrences] = useState<RoutineOccurrenceRecord[]>([]);

  // Undo Toast state
  const [undoToast, setUndoToast] = useState<{
    occurrenceId: string;
    routineTitle: string;
    previousStatus: RoutineOccurrenceStatus;
    previousCompletedAt: string | null;
    previousHistory: RoutineOccurrenceRecord['history'];
    expiresAt: number;
  } | null>(null);

  // Simulation & Feedback states
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [liveAnnouncement, setLiveAnnouncement] = useState('');

  // Storage and Sync references
  const localRepoRef = useRef<IndexedDbLocalRepository | null>(null);
  const syncEngineRef = useRef<SyncEngine | null>(null);

  // Scope tracker to clear stale visible data on account changes and ignore late results
  const activeScopeRef = useRef<{ workspaceId: string | null; userId: string | null }>({
    workspaceId,
    userId: user?.id || null,
  });

  useEffect(() => {
    activeScopeRef.current = { workspaceId, userId: user?.id || null };
    // Clear visible state on account/workspace change
    setRoutines([]);
    setOccurrences([]);
    setTasks([]);
    setRecentItems([]);
    setWorkspaceFolders([]);
    setHomeLayout(getDefaultHomeLayout());
    setPreferencesRevision(0);
    setConflictState(null);
    setHasUnsupportedVersion(false);
  }, [workspaceId, user?.id]);

  const announce = useCallback((msg: string) => {
    setLiveAnnouncement(msg);
  }, []);

  // Undo countdown timer
  useEffect(() => {
    if (!undoToast) return;
    const interval = setInterval(() => {
      if (Date.now() >= undoToast.expiresAt) {
        setUndoToast(null);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [undoToast]);

  // Load and initialize data from IndexedDB, API & Sync Engine
  const loadData = useCallback(async () => {
    if (!workspaceId) {
      setIsLoading(false);
      return;
    }

    const currentScope = { workspaceId, userId: user?.id || null };

    try {
      if (!localRepoRef.current) {
        const repo = new IndexedDbLocalRepository();
        await repo.initialize({
          userId: user?.id || 'anonymous',
          workspaceId,
        });
        localRepoRef.current = repo;
      }

      const client = createWebApiClient({ csrfToken });

      if (!syncEngineRef.current) {
        const engine = createWebSyncEngine({
          repository: localRepoRef.current,
          apiClient: client,
          namespace: {
            userId: user?.id || 'anonymous',
            workspaceId,
          },
        });
        syncEngineRef.current = engine;

        // Subscribe to synchronization updates so arriving records appear without manual reload
        engine.onEvent((event) => {
          if (event.type === 'sync_completed' && event.changesCount > 0) {
            void loadData();
          }
        });

        await engine.start();
      }

      const repo = localRepoRef.current;

      // 1. Load preferences (HomeLayout and display preferences)
      try {
        const prefRes = await client.getUserPreferences().catch(() => null);
        if (
          activeScopeRef.current.workspaceId !== currentScope.workspaceId ||
          activeScopeRef.current.userId !== currentScope.userId
        ) {
          return;
        }

        if (prefRes?.data) {
          // Authoritative revision adopted independently from whether optional layout exists
          setPreferencesRevision(prefRes.data.revision);
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

          let localDraftCompletedOrSkipped = false;
          if (typeof window !== 'undefined' && user?.id) {
            const rawDraft = window.localStorage.getItem(`daynori:onboarding:${user.id}`);
            if (rawDraft) {
              try {
                const parsed = JSON.parse(rawDraft);
                if (parsed.step === 'completed' || parsed.skipped) {
                  localDraftCompletedOrSkipped = true;
                }
              } catch {
                /* ignore */
              }
            }
            const pendingKey = `daynori:preferences:pending:${user.id}`;
            const rawPending = window.localStorage.getItem(pendingKey);
            if (rawPending) {
              try {
                const pending = JSON.parse(rawPending);
                if (pending?.preferences?.onboarding) {
                  const onb = pending.preferences.onboarding;
                  if (onb.step === 'completed') {
                    localDraftCompletedOrSkipped = true;
                  }
                }
                void client
                  .updateUserPreferences({
                    preferences: pending.preferences,
                    expectedRevision: pending.expectedRevision ?? prefRes.data.revision,
                  })
                  .then((res) => {
                    if (res?.data) {
                      window.localStorage.removeItem(pendingKey);
                      setPreferencesRevision(res.data.revision);
                    }
                  })
                  .catch(() => {});
              } catch {
                /* ignore */
              }
            }
          }

          // Trigger skippable first-use onboarding tutorial on fresh account sign-in
          if (
            !localDraftCompletedOrSkipped &&
            shouldShowOnboarding(prefRes.data.preferences?.onboarding)
          ) {
            openModal('onboarding');
          }
        } else {
          // Fall back to local repository snapshot
          const snapshot = await repo.getPreferenceSnapshot(user?.id || 'anonymous');
          if (snapshot) {
            setPreferencesRevision(snapshot.revision);
            if (snapshot.preferences?.homeLayout) {
              try {
                setHomeLayout(sanitizeAndMigrateHomeLayout(snapshot.preferences.homeLayout));
                setHasUnsupportedVersion(false);
              } catch (err) {
                if (err instanceof UnsupportedLayoutVersionError) {
                  setHasUnsupportedVersion(true);
                }
              }
            }
            let localDraftCompletedOrSkipped = false;
            if (typeof window !== 'undefined' && user?.id) {
              const rawDraft = window.localStorage.getItem(`daynori:onboarding:${user.id}`);
              if (rawDraft) {
                try {
                  const parsed = JSON.parse(rawDraft);
                  if (parsed.step === 'completed' || parsed.skipped) {
                    localDraftCompletedOrSkipped = true;
                  }
                } catch {
                  /* ignore */
                }
              }
            }
            if (
              !localDraftCompletedOrSkipped &&
              shouldShowOnboarding(snapshot.preferences?.onboarding as OnboardingState | undefined)
            ) {
              openModal('onboarding');
            }
          }
        }
      } catch {
        // Keep default home layout on preference fetch error
      }

      // 2. Load workspace folders for Favorite Folders card
      try {
        const folderRes = await client.listFolders(workspaceId).catch(() => null);
        if (folderRes?.data) {
          if (
            activeScopeRef.current.workspaceId === currentScope.workspaceId &&
            activeScopeRef.current.userId === currentScope.userId
          ) {
            setWorkspaceFolders(folderRes.data.map((f) => ({ id: f.id, name: f.name })));
          }
        }
      } catch {
        // Non-blocking for offline
      }

      // 3. Load routines and occurrences
      const loadedRoutines = await repo.listRoutines(workspaceId);
      const loadedOccurrences = await repo.listRoutineOccurrences(
        workspaceId,
        undefined,
        yesterdayDate,
        addCalendarDays(todayDate, 7)
      );

      // Generate missing occurrences for each routine
      const updatedOccurrences = [...loadedOccurrences];
      for (const r of loadedRoutines) {
        const routineDate = getCalendarDateInTimezone(currentNow, r.timezone);
        const rule: RoutineTemplateRule = {
          id: r.id,
          workspaceId: r.workspaceId,
          folderId: r.folderId,
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
          scheduleRevision: r.scheduleRevision,
          effectiveDate: r.effectiveDate,
        };
        const applicable = selectApplicableScheduleRule([], rule, routineDate);
        const ruleTarget = {
          frequency: applicable.frequency,
          weekdays: applicable.weekdays,
          activeFrom: applicable.activeFrom,
          activeTo: applicable.activeTo,
          isPaused: r.isPaused,
          isArchived: r.isArchived,
        };

        if (!r.isPaused && !r.isArchived && isRoutineScheduledOnDate(ruleTarget, routineDate)) {
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
              applicable.scheduledTime,
              applicable.timezone
            );
            const nowIso = new Date().toISOString();
            const newOcc: RoutineOccurrenceRecord = {
              id: deterministicId,
              workspaceId,
              routineId: r.id,
              scheduledDate: routineDate,
              scheduleRevision: applicable.scheduleRevision,
              plannedInstant,
              timezone: applicable.timezone,
              status: 'pending',
              completedAt: null,
              completedBy: null,
              history: [],
              serverRevision: 1,
              createdAt: nowIso,
              updatedAt: nowIso,
            };
            await repo.upsertRoutineOccurrence(newOcc);
            updatedOccurrences.push(newOcc);
          }
        }
      }

      // 4. Load tasks
      const allTasks = await repo.listTasks(workspaceId);

      // 5. Load recent items across canonical types (with privacy redaction)
      try {
        const notes = await repo.listNotes(workspaceId);
        const files = await repo.listFiles(workspaceId);
        const journalEntries = await repo.listJournalEntries(workspaceId, {
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
        const privacyFiltered = filterRecentItemsForPrivacy(rawRecent.slice(0, 5), {
          hideJournalSnippets: true,
        });
        setRecentItems(privacyFiltered);
      } catch {
        // Non-blocking
      }

      setRoutines(loadedRoutines);
      setOccurrences(updatedOccurrences);
      setTasks(allTasks);
      setIsLoading(false);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
      setIsLoading(false);
    }
  }, [workspaceId, user?.id, todayDate, yesterdayDate, viewingTimezone, currentNow]);

  // Calendar boundary rollover, resume, and timezone change listeners
  useEffect(() => {
    const checkCalendarDate = () => {
      const now = new Date();
      const currentCalDate = getCalendarDateInTimezone(now, viewingTimezone);
      if (currentCalDate !== todayDate) {
        setCurrentNow(now);
      }
      if (!savedAccountTimezone) {
        try {
          const detectedTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
          if (detectedTz !== viewingTimezone) {
            setViewingTimezone(detectedTz);
          }
        } catch {
          // ignore
        }
      }
    };

    const intervalId = setInterval(checkCalendarDate, 15000);

    const handleResume = () => {
      checkCalendarDate();
      void loadData();
    };

    window.addEventListener('focus', handleResume);
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        handleResume();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(intervalId);
      window.removeEventListener('focus', handleResume);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [viewingTimezone, todayDate, loadData]);

  useEffect(() => {
    void loadData();
    return () => {
      if (syncEngineRef.current) {
        void syncEngineRef.current.stop();
        syncEngineRef.current = null;
      }
      if (localRepoRef.current) {
        void localRepoRef.current.close();
        localRepoRef.current = null;
      }
    };
  }, [loadData]);

  // Refresh Today layout and shortcut presentation when onboarding or replay finishes
  const prevModalRef = useRef(activeModal);
  useEffect(() => {
    if (
      (prevModalRef.current === 'onboarding' || prevModalRef.current === 'onboarding-replay') &&
      activeModal === null
    ) {
      void loadData();
    }
    prevModalRef.current = activeModal;
  }, [activeModal, loadData]);

  // Filter tasks due today vs overdue
  const tasksDueToday = useMemo(() => {
    const refDate = new Date();
    return tasks.filter(
      (t) =>
        t.deletedAt === null && isTaskDueToday({ deadline: t.deadline }, refDate, viewingTimezone)
    );
  }, [tasks, viewingTimezone]);

  const overdueTasks = useMemo(() => {
    const refDate = new Date();
    return tasks.filter(
      (t) =>
        t.deletedAt === null &&
        isTaskOverdue({ status: t.status, deadline: t.deadline }, refDate, viewingTimezone)
    );
  }, [tasks, viewingTimezone]);

  // Upcoming 7-day summary metrics
  const upcomingSummary = useMemo(() => {
    const in7Days = addCalendarDays(todayDate, 7);
    const upcomingTaskCount = tasks.filter((t) => {
      if (t.deletedAt !== null || t.status === 'completed' || !t.deadline) return false;
      const refDate = new Date();
      if (isTaskDueToday({ deadline: t.deadline }, refDate, viewingTimezone)) return false;
      if (isTaskOverdue({ status: t.status, deadline: t.deadline }, refDate, viewingTimezone))
        return false;
      let dStr: string | null = null;
      if (t.deadline.type === 'date') {
        dStr = t.deadline.date;
      } else if (t.deadline.type === 'timed') {
        dStr = getCalendarDateInTimezone(new Date(t.deadline.timestamp), viewingTimezone);
      }
      if (!dStr) return false;
      return dStr > todayDate && dStr <= in7Days;
    }).length;

    const upcomingRoutineCount = occurrences.filter(
      (o) => o.scheduledDate > todayDate && o.scheduledDate <= in7Days && o.status !== 'cancelled'
    ).length;

    return {
      upcomingTaskCount,
      upcomingRoutineCount,
      totalUpcoming: upcomingTaskCount + upcomingRoutineCount,
    };
  }, [tasks, occurrences, todayDate, viewingTimezone]);

  // Today's paired routine items
  const todayRoutineItems = useMemo(() => {
    return routines
      .map((routine) => {
        const routineDate = getCalendarDateInTimezone(currentNow, routine.timezone);
        const rule: RoutineTemplateRule = {
          id: routine.id,
          workspaceId: routine.workspaceId,
          folderId: routine.folderId,
          title: routine.title,
          details: routine.details,
          frequency: routine.frequency,
          weekdays: routine.weekdays,
          timezone: routine.timezone,
          scheduledTime: routine.scheduledTime,
          activeFrom: routine.activeFrom,
          activeTo: routine.activeTo,
          isPaused: routine.isPaused,
          isArchived: routine.isArchived,
          scheduleRevision: routine.scheduleRevision,
          effectiveDate: routine.effectiveDate,
        };
        const applicable = selectApplicableScheduleRule([], rule, routineDate);
        const ruleTarget = {
          frequency: applicable.frequency,
          weekdays: applicable.weekdays,
          activeFrom: applicable.activeFrom,
          activeTo: applicable.activeTo,
          isPaused: routine.isPaused,
          isArchived: routine.isArchived,
        };
        const isScheduled = isRoutineScheduledOnDate(ruleTarget, routineDate);
        if (!isScheduled && !routine.isPaused) {
          return null;
        }
        const occ = occurrences.find(
          (o) =>
            o.routineId === routine.id &&
            o.scheduledDate === routineDate &&
            o.status !== 'cancelled'
        );
        return { routine, occurrence: occ || null, routineDate };
      })
      .filter(
        (
          item
        ): item is {
          routine: RoutineRecord;
          occurrence: RoutineOccurrenceRecord | null;
          routineDate: string;
        } => item !== null
      );
  }, [routines, occurrences, currentNow]);

  // Gentle progress summary
  const progress = useMemo(() => {
    const todayOccs = todayRoutineItems
      .map((item) => item.occurrence)
      .filter((o): o is RoutineOccurrenceRecord => o !== null);
    return calculateGentleProgress(todayOccs);
  }, [todayRoutineItems]);

  // Bounded History Loading
  const handleOpenHistory = async (routine: RoutineRecord) => {
    setHistoryRoutine(routine);
    if (localRepoRef.current && workspaceId) {
      const routineDate = getCalendarDateInTimezone(currentNow, routine.timezone);
      const past90 = addCalendarDays(routineDate, -90);
      const loaded = await localRepoRef.current.listRoutineOccurrences(
        workspaceId,
        routine.id,
        past90,
        routineDate
      );
      setHistoryOccurrences(loaded);
    } else {
      setHistoryOccurrences(occurrences.filter((o) => o.routineId === routine.id));
    }
  };

  // Routine Checklist Actions
  const handleCompleteOccurrence = async (occurrenceId: string) => {
    const occ = occurrences.find((o) => o.id === occurrenceId);
    if (!occ) return;
    const routine = routines.find((r) => r.id === occ.routineId);

    const prevStatus = occ.status;
    const prevCompletedAt = occ.completedAt;
    const prevHistory = [...occ.history];

    const nowIso = new Date().toISOString();
    const updatedHistory: RoutineOccurrenceRecord['history'] = [
      ...occ.history,
      {
        fromStatus: occ.status,
        toStatus: 'done' as const,
        status: 'done' as const,
        changedAt: nowIso,
        transitionedAt: nowIso,
        actorId: user?.id || null,
        reason: null,
      },
    ];

    const updated: RoutineOccurrenceRecord = {
      ...occ,
      status: 'done',
      completedAt: nowIso,
      completedBy: user?.id || null,
      history: updatedHistory,
      updatedAt: nowIso,
    };

    setOccurrences((prev) => prev.map((o) => (o.id === occurrenceId ? updated : o)));
    setHistoryOccurrences((prev) => prev.map((o) => (o.id === occurrenceId ? updated : o)));

    if (syncEngineRef.current) {
      await syncEngineRef.current.saveRoutineOccurrence(updated, 'completeOccurrence');
    } else if (localRepoRef.current) {
      await localRepoRef.current.upsertRoutineOccurrence(updated);
    }

    setUndoToast({
      occurrenceId,
      routineTitle: routine?.title || 'Routine',
      previousStatus: prevStatus,
      previousCompletedAt: prevCompletedAt,
      previousHistory: prevHistory,
      expiresAt: Date.now() + 5000,
    });

    announce(`Completed ${routine?.title || 'routine'} for today.`);
  };

  const handleSkipOccurrence = async (occurrenceId: string) => {
    const occ = occurrences.find((o) => o.id === occurrenceId);
    if (!occ) return;
    const routine = routines.find((r) => r.id === occ.routineId);

    const prevStatus = occ.status;
    const prevCompletedAt = occ.completedAt;
    const prevHistory = [...occ.history];

    const nowIso = new Date().toISOString();
    const updatedHistory: RoutineOccurrenceRecord['history'] = [
      ...occ.history,
      {
        fromStatus: occ.status,
        toStatus: 'skipped' as const,
        status: 'skipped' as const,
        changedAt: nowIso,
        transitionedAt: nowIso,
        actorId: user?.id || null,
        reason: 'User skipped occurrence',
      },
    ];

    const updated: RoutineOccurrenceRecord = {
      ...occ,
      status: 'skipped',
      completedAt: null,
      completedBy: null,
      history: updatedHistory,
      updatedAt: nowIso,
    };

    setOccurrences((prev) => prev.map((o) => (o.id === occurrenceId ? updated : o)));
    setHistoryOccurrences((prev) => prev.map((o) => (o.id === occurrenceId ? updated : o)));

    if (syncEngineRef.current) {
      await syncEngineRef.current.saveRoutineOccurrence(updated, 'skipOccurrence');
    } else if (localRepoRef.current) {
      await localRepoRef.current.upsertRoutineOccurrence(updated);
    }

    setUndoToast({
      occurrenceId,
      routineTitle: routine?.title || 'Routine',
      previousStatus: prevStatus,
      previousCompletedAt: prevCompletedAt,
      previousHistory: prevHistory,
      expiresAt: Date.now() + 5000,
    });

    announce(`Skipped ${routine?.title || 'routine'} for today.`);
  };

  const handleReopenOccurrence = async (occurrenceId: string) => {
    const occ = occurrences.find((o) => o.id === occurrenceId);
    if (!occ) return;
    const routine = routines.find((r) => r.id === occ.routineId);

    const nowIso = new Date().toISOString();
    const updatedHistory: RoutineOccurrenceRecord['history'] = [
      ...occ.history,
      {
        fromStatus: occ.status,
        toStatus: 'pending' as const,
        status: 'pending' as const,
        changedAt: nowIso,
        transitionedAt: nowIso,
        actorId: user?.id || null,
        reason: null,
      },
    ];

    const updated: RoutineOccurrenceRecord = {
      ...occ,
      status: 'pending',
      completedAt: null,
      completedBy: null,
      history: updatedHistory,
      updatedAt: nowIso,
    };

    setOccurrences((prev) => prev.map((o) => (o.id === occurrenceId ? updated : o)));
    setHistoryOccurrences((prev) => prev.map((o) => (o.id === occurrenceId ? updated : o)));

    if (syncEngineRef.current) {
      await syncEngineRef.current.saveRoutineOccurrence(updated, 'reopenOccurrence');
    } else if (localRepoRef.current) {
      await localRepoRef.current.upsertRoutineOccurrence(updated);
    }

    setUndoToast(null);
    announce(`Reopened ${routine?.title || 'routine'} for today.`);
  };

  const handleUndo = async () => {
    if (!undoToast) return;
    const occ = occurrences.find((o) => o.id === undoToast.occurrenceId);
    if (!occ) return;

    const targetStatus = undoToast.previousStatus;
    const nowIso = new Date().toISOString();
    const compensatingTransition: RoutineOccurrenceTransition = {
      fromStatus: occ.status,
      toStatus: targetStatus,
      status: targetStatus,
      previousStatus: occ.status,
      changedAt: nowIso,
      transitionedAt: nowIso,
      actorId: user?.id || null,
      reason: 'Compensating undo action',
    };

    const restored: RoutineOccurrenceRecord = {
      ...occ,
      status: targetStatus,
      completedAt: targetStatus === 'done' ? undoToast.previousCompletedAt || nowIso : null,
      completedBy: targetStatus === 'done' ? user?.id || null : null,
      history: [...occ.history, compensatingTransition],
      updatedAt: nowIso,
    };

    setOccurrences((prev) => prev.map((o) => (o.id === undoToast.occurrenceId ? restored : o)));
    setHistoryOccurrences((prev) =>
      prev.map((o) => (o.id === undoToast.occurrenceId ? restored : o))
    );

    if (syncEngineRef.current) {
      const command =
        restored.status === 'done'
          ? 'completeOccurrence'
          : restored.status === 'skipped'
            ? 'skipOccurrence'
            : 'reopenOccurrence';
      await syncEngineRef.current.saveRoutineOccurrence(restored, command);
    } else if (localRepoRef.current) {
      await localRepoRef.current.upsertRoutineOccurrence(restored);
    }

    setUndoToast(null);
    announce(`Undid change for ${undoToast.routineTitle}.`);
  };

  const handleTogglePauseRoutine = async (routineId: string) => {
    const routine = routines.find((r) => r.id === routineId);
    if (!routine) return;

    const newPaused = !routine.isPaused;
    const updated: RoutineRecord = {
      ...routine,
      isPaused: newPaused,
      updatedAt: new Date().toISOString(),
    };

    setRoutines((prev) => prev.map((r) => (r.id === routineId ? updated : r)));

    if (syncEngineRef.current) {
      await syncEngineRef.current.saveRoutine(
        updated,
        newPaused ? 'pauseRoutine' : 'resumeRoutine'
      );
    } else if (localRepoRef.current) {
      await localRepoRef.current.upsertRoutine(updated);
    }

    announce(newPaused ? `Paused ${routine.title}.` : `Resumed ${routine.title}.`);
  };

  const handleSaveRoutine = async (formData: {
    id?: string;
    title: string;
    details: string | null;
    frequency: RoutineFrequency;
    weekdays: Weekday[];
    timezone: string;
    scheduledTime: string | null;
    activeFrom: string;
    activeTo: string | null;
    effectiveDate: string;
    isPaused: boolean;
  }) => {
    if (!workspaceId) return;
    const nowIso = new Date().toISOString();

    if (formData.id) {
      const existing = routines.find((r) => r.id === formData.id);
      if (!existing) return;

      const scheduleChanged =
        existing.frequency !== formData.frequency ||
        JSON.stringify(existing.weekdays) !== JSON.stringify(formData.weekdays) ||
        existing.timezone !== formData.timezone ||
        existing.scheduledTime !== formData.scheduledTime ||
        existing.activeFrom !== formData.activeFrom ||
        existing.activeTo !== formData.activeTo;

      const newScheduleRevision = scheduleChanged
        ? existing.scheduleRevision + 1
        : existing.scheduleRevision;

      const updated: RoutineRecord = {
        ...existing,
        title: formData.title,
        details: formData.details,
        frequency: formData.frequency,
        weekdays: formData.weekdays,
        timezone: formData.timezone,
        scheduledTime: formData.scheduledTime,
        activeFrom: formData.activeFrom,
        activeTo: formData.activeTo,
        effectiveDate: formData.effectiveDate,
        isPaused: formData.isPaused,
        scheduleRevision: newScheduleRevision,
        updatedAt: nowIso,
      };

      const domainOccurrences = occurrences.map((o) => ({
        ...o,
        revision: o.serverRevision,
      }));
      const { retained, modifiedOccurrences, cancelledOccurrences } =
        reconcileOccurrencesOnScheduleChange(domainOccurrences, updated, formData.effectiveDate);

      const reconciledOccurrences: RoutineOccurrenceRecord[] = [
        ...retained.map((o) => ({
          id: o.id,
          workspaceId: o.workspaceId,
          routineId: o.routineId,
          scheduledDate: o.scheduledDate,
          scheduleRevision: o.scheduleRevision,
          plannedInstant: o.plannedInstant,
          timezone: o.timezone,
          status: o.status,
          completedAt: o.completedAt,
          completedBy: o.completedBy,
          history: o.history,
          serverRevision: o.serverRevision,
          createdAt: o.createdAt,
          updatedAt: o.updatedAt,
        })),
        ...modifiedOccurrences.map((o) => ({
          id: o.id,
          workspaceId: o.workspaceId,
          routineId: o.routineId,
          scheduledDate: o.scheduledDate,
          scheduleRevision: o.scheduleRevision,
          plannedInstant: o.plannedInstant,
          timezone: o.timezone,
          status: o.status,
          completedAt: o.completedAt,
          completedBy: o.completedBy,
          history: o.history,
          serverRevision: o.serverRevision,
          createdAt: o.createdAt,
          updatedAt: o.updatedAt,
        })),
        ...cancelledOccurrences.map((o) => ({
          id: o.id,
          workspaceId: o.workspaceId,
          routineId: o.routineId,
          scheduledDate: o.scheduledDate,
          scheduleRevision: o.scheduleRevision,
          plannedInstant: o.plannedInstant,
          timezone: o.timezone,
          status: o.status,
          completedAt: o.completedAt,
          completedBy: o.completedBy,
          history: o.history,
          serverRevision: o.serverRevision,
          createdAt: o.createdAt,
          updatedAt: o.updatedAt,
        })),
      ];

      setRoutines((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      setOccurrences(reconciledOccurrences);

      if (localRepoRef.current) {
        for (const o of reconciledOccurrences) {
          await localRepoRef.current.upsertRoutineOccurrence(o);
        }
      }

      if (syncEngineRef.current) {
        await syncEngineRef.current.saveRoutine(updated, 'updateRoutine');
      } else if (localRepoRef.current) {
        await localRepoRef.current.upsertRoutine(updated);
      }

      announce(`Updated routine "${updated.title}".`);
    } else {
      const newId = crypto.randomUUID();
      const newRoutine: RoutineRecord = {
        id: newId,
        workspaceId,
        folderId: null,
        title: formData.title,
        details: formData.details,
        frequency: formData.frequency,
        weekdays: formData.weekdays,
        timezone: formData.timezone,
        scheduledTime: formData.scheduledTime,
        activeFrom: formData.activeFrom,
        activeTo: formData.activeTo,
        effectiveDate: formData.effectiveDate,
        isPaused: formData.isPaused,
        isArchived: false,
        isPinned: false,
        scheduleRevision: 1,
        serverRevision: 1,
        createdAt: nowIso,
        updatedAt: nowIso,
        deletedAt: null,
      };

      const routineDate = getCalendarDateInTimezone(currentNow, newRoutine.timezone);
      const newOccs: RoutineOccurrenceRecord[] = [];
      if (isRoutineScheduledOnDate(newRoutine, routineDate)) {
        const occId = computeDeterministicOccurrenceId(workspaceId, newId, routineDate);
        const plannedInstant = calculatePlannedInstant(
          routineDate,
          newRoutine.scheduledTime,
          newRoutine.timezone
        );
        const occ: RoutineOccurrenceRecord = {
          id: occId,
          workspaceId,
          routineId: newId,
          scheduledDate: routineDate,
          scheduleRevision: 1,
          plannedInstant,
          timezone: newRoutine.timezone,
          status: 'pending',
          completedAt: null,
          completedBy: null,
          history: [],
          serverRevision: 1,
          createdAt: nowIso,
          updatedAt: nowIso,
        };
        newOccs.push(occ);
      }

      setRoutines((prev) => [...prev, newRoutine]);
      setOccurrences((prev) => [...prev, ...newOccs]);

      if (localRepoRef.current) {
        for (const o of newOccs) {
          await localRepoRef.current.upsertRoutineOccurrence(o);
        }
      }

      if (syncEngineRef.current) {
        await syncEngineRef.current.saveRoutine(newRoutine, 'createRoutine');
      } else if (localRepoRef.current) {
        await localRepoRef.current.upsertRoutine(newRoutine);
      }

      announce(`Created new routine "${newRoutine.title}".`);
    }
  };

  // Toggle tasks (strictly separate from routines)
  const toggleTask = async (taskId: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task || !workspaceId) return;

    const newStatus = task.status === 'completed' ? 'todo' : 'completed';
    const nowIso = new Date().toISOString();
    const updated: TaskRecord = {
      ...task,
      status: newStatus,
      completedAt: newStatus === 'completed' ? nowIso : null,
      updatedAt: nowIso,
    };

    setTasks((prev) => prev.map((t) => (t.id === taskId ? updated : t)));

    if (syncEngineRef.current) {
      const itemHeader: ItemHeaderRecord = {
        id: task.id,
        workspaceId,
        folderId: task.folderId,
        name: task.title,
        kind: 'task',
        rank: '00001000',
        securityScope: 'standard',
        isArchived: false,
        isPinned: false,
        serverRevision: task.serverRevision,
        createdAt: task.createdAt,
        updatedAt: nowIso,
        deletedAt: null,
      };
      await syncEngineRef.current.saveItem(
        itemHeader,
        undefined,
        newStatus === 'completed' ? 'completeTask' : 'reopenTask',
        {
          payload: { status: newStatus, completedAt: updated.completedAt },
        }
      );
    } else if (localRepoRef.current) {
      await localRepoRef.current.upsertTask(updated);
    }

    announce(
      newStatus === 'completed'
        ? `Completed task "${task.title}".`
        : `Reopened task "${task.title}".`
    );
  };

  // Phase 30: Personalization Handlers
  const handleToggleWidget = (id: HomeWidgetId) => {
    setHomeLayout((prev) => {
      const updated = {
        ...prev,
        widgets: prev.widgets.map((w) => (w.id === id ? { ...w, visible: !w.visible } : w)),
      };
      announce(`Toggled visibility for ${DEFAULT_WIDGET_LABELS[id]}.`);
      return updated;
    });
  };

  const handleMoveWidget = (id: HomeWidgetId, direction: 'up' | 'down') => {
    setHomeLayout((prev) => {
      const reordered = reorderWidgets(prev.widgets, id, direction);
      const newIdx = reordered.find((w) => w.id === id)?.order ?? 0;
      announce(`Moved ${DEFAULT_WIDGET_LABELS[id]} ${direction} to position ${newIdx + 1}.`);
      return { ...prev, widgets: reordered };
    });
  };

  const handleLabelChange = (id: HomeWidgetId, label: string) => {
    const validated = validateCustomLabel(label);
    setHomeLayout((prev) => ({
      ...prev,
      widgets: prev.widgets.map((w) => (w.id === id ? { ...w, customLabel: validated } : w)),
    }));
  };

  const handleToggleFavoriteFolder = (folderId: string) => {
    setHomeLayout((prev) => {
      const exists = prev.favoriteFolderIds.includes(folderId);
      const updated = exists
        ? prev.favoriteFolderIds.filter((id) => id !== folderId)
        : [...prev.favoriteFolderIds, folderId];
      return { ...prev, favoriteFolderIds: updated };
    });
  };

  const handleDensityChange = (density: 'comfortable' | 'compact') => {
    setHomeLayout((prev) => ({ ...prev, density }));
    announce(`Density changed to ${density}.`);
  };

  // Module Shortcuts Handlers
  const handleToggleShortcut = (id: ModuleShortcutId) => {
    setHomeLayout((prev) => {
      const updated = {
        ...prev,
        moduleShortcuts: prev.moduleShortcuts.map((s) =>
          s.id === id ? { ...s, visible: !s.visible } : s
        ),
      };
      announce(`Toggled shortcut visibility for ${DEFAULT_MODULE_LABELS[id] || id}.`);
      return updated;
    });
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
    setHomeLayout((prev) => {
      const reordered = reorderModuleShortcuts(prev.moduleShortcuts, id, direction);
      announce(`Moved shortcut ${DEFAULT_MODULE_LABELS[id] || id} ${direction}.`);
      return { ...prev, moduleShortcuts: reordered };
    });
  };

  const handleRestoreDefaults = () => {
    const defaults = getDefaultHomeLayout();
    setHomeLayout(defaults);
    announce(
      'Restored default home layout and module shortcuts. Personal content, notes, routines, and tasks remain intact.'
    );
  };

  const handleSavePreferences = async (forceOverwriteRevision?: number) => {
    if (!workspaceId) return;
    setIsSavingLayout(true);
    setSaveSuccessMessage(null);
    setErrorMessage(null);

    const targetRevision =
      forceOverwriteRevision !== undefined ? forceOverwriteRevision : preferencesRevision;

    try {
      const client = createWebApiClient({ csrfToken });

      const res = await client.updateUserPreferences({
        preferences: {
          homeLayout,
          compactMode: homeLayout.density === 'compact',
          theme: themePreference,
        },
        expectedRevision: targetRevision,
      });

      if (res.data) {
        setPreferencesRevision(res.data.revision);
        setConflictState(null);

        // Preserve full preference snapshot locally
        if (localRepoRef.current) {
          const existingSnapshot = await localRepoRef.current.getPreferenceSnapshot(
            user?.id || 'anonymous'
          );
          const mergedPreferences = {
            ...existingSnapshot?.preferences,
            homeLayout,
            compactMode: homeLayout.density === 'compact',
            theme: themePreference,
          };
          await localRepoRef.current.savePreferenceSnapshot({
            userId: user?.id || 'anonymous',
            preferences: mergedPreferences,
            schemaVersion: 1,
            revision: res.data.revision,
            updatedAt: new Date().toISOString(),
          });
        }

        setSaveSuccessMessage('Home customization saved successfully.');
        announce('Home customization saved successfully.');
        setIsCustomizing(false);
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
          const client = createWebApiClient({ csrfToken });
          const latest = await client.getUserPreferences();
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
          // ignore error fetching latest
        }
        setErrorMessage(
          'Preference conflict: settings were modified on another device. You can keep your unsaved edits or discard them to load latest settings.'
        );
      } else {
        setErrorMessage(
          `Failed to save preferences: ${err instanceof Error ? err.message : String(err)}`
        );
      }
      announce('Failed to save layout preferences.');
    } finally {
      setIsSavingLayout(false);
    }
  };

  const handleKeepMyEdits = () => {
    if (!conflictState) return;
    const newRev = conflictState.serverRevision;
    setPreferencesRevision(newRev);
    void handleSavePreferences(newRev);
  };

  const handleDiscardAndReload = () => {
    if (!conflictState) return;
    setHomeLayout(conflictState.serverLayout);
    setPreferencesRevision(conflictState.serverRevision);
    setConflictState(null);
    setErrorMessage(null);
    announce('Loaded latest preferences from cloud.');
  };

  const visibleWidgets = useMemo(() => {
    return [...homeLayout.widgets].filter((w) => w.visible).sort((a, b) => a.order - b.order);
  }, [homeLayout.widgets]);

  const visibleShortcuts = useMemo(() => {
    return [...homeLayout.moduleShortcuts]
      .filter((s) => s.visible)
      .sort((a, b) => a.order - b.order);
  }, [homeLayout.moduleShortcuts]);

  const cardPadding = homeLayout.density === 'compact' ? spacing.sm : spacing.base;

  return (
    <div className="daynori-page">
      {/* Live Region for Screen Reader Announcements */}
      <div
        id={liveRegionId}
        role="status"
        aria-live="polite"
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

      {/* Header and Welcome */}
      <section
        aria-label="Today summary"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: `${spacing.xs}px`,
          marginBottom: `${spacing.lg}px`,
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'stretch',
            gap: `${spacing.sm}px`,
            minWidth: 0,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <h1
              id="today-heading"
              className="daynori-break"
              style={{
                margin: 0,
                fontSize: `${typography.webScale.welcomeTitle}px`,
                fontWeight: 800,
                color: palette.text.primary,
                letterSpacing: '-0.5px',
              }}
            >
              Today
            </h1>
            <p
              className="daynori-break"
              style={{
                margin: 0,
                marginTop: '4px',
                fontSize: `${typography.webScale.body}px`,
                color: palette.text.secondary,
              }}
            >
              {new Date().toLocaleDateString(undefined, {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              })}
            </p>
            <p
              className="daynori-break"
              style={{
                margin: '6px 0 0',
                fontSize: '12px',
                color: palette.text.muted,
              }}
            >
              Timezone: {viewingTimezone}
            </p>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: `${spacing.xs}px`,
              flexWrap: 'wrap',
              minWidth: 0,
            }}
          >
            <Button
              id="customize-today-btn"
              variant="secondary"
              size="compact"
              themeMode={themeMode}
              onClick={() => setIsCustomizing(true)}
              aria-label="Customize Today"
            >
              <Icon name="settings" /> Customize
            </Button>

            <Button
              id="create-routine-btn"
              variant="primary"
              size="compact"
              themeMode={themeMode}
              onClick={() => {
                setEditingRoutine(null);
                setIsEditorOpen(true);
              }}
              aria-label="Add routine"
            >
              <Icon name="plus" /> <span className="hide-below-380">Add </span>routine
            </Button>
          </div>
        </div>
      </section>

      {/* Success Notification */}
      {saveSuccessMessage && (
        <div style={{ marginBottom: `${spacing.base}px` }}>
          <Feedback
            severity="success"
            title="Saved"
            message={saveSuccessMessage}
            themeMode={themeMode}
            onDismiss={() => setSaveSuccessMessage(null)}
          />
        </div>
      )}

      {/* Unsupported Newer Version Warning */}
      {hasUnsupportedVersion && (
        <div style={{ marginBottom: `${spacing.base}px` }}>
          <Feedback
            severity="warning"
            title="Newer Layout Version Detected"
            message="Your layout was created or modified by a newer version of Daynori. To prevent data loss, changes cannot be saved until you update your application."
            themeMode={themeMode}
          />
        </div>
      )}

      {/* Conflict Resolution Banner */}
      {conflictState && (
        <div
          style={{
            marginBottom: `${spacing.base}px`,
            padding: `${spacing.base}px`,
            borderRadius: `${radii.card}px`,
            backgroundColor: palette.surfaceRaised,
            border: `1px solid ${palette.status.warning || palette.border.subtle}`,
            display: 'flex',
            flexDirection: 'column',
            gap: `${spacing.sm}px`,
          }}
        >
          <div style={{ fontWeight: 700, color: palette.text.primary, fontSize: '14px' }}>
            <Icon name="warning" /> Layout Conflict Detected
          </div>
          <div style={{ fontSize: '13px', color: palette.text.secondary }}>
            Your settings were modified on another device (revision {conflictState.serverRevision}).
            Your unsaved local edits are currently preserved in this view.
          </div>
          <div style={{ display: 'flex', gap: `${spacing.xs}px`, flexWrap: 'wrap' }}>
            <Button
              id="keep-my-edits-btn"
              variant="primary"
              size="compact"
              themeMode={themeMode}
              onClick={handleKeepMyEdits}
            >
              Keep My Edits & Overwrite
            </Button>
            <Button
              id="discard-reload-btn"
              variant="secondary"
              size="compact"
              themeMode={themeMode}
              onClick={handleDiscardAndReload}
            >
              Discard & Load Latest
            </Button>
          </div>
        </div>
      )}

      {/* Module Shortcuts Navigation Bar */}
      {visibleShortcuts.length > 0 && (
        <nav
          aria-label="Quick Navigation Shortcuts"
          style={{
            display: 'flex',
            gap: `${spacing.xs}px`,
            flexWrap: 'wrap',
            marginBottom: `${spacing.lg}px`,
          }}
        >
          {visibleShortcuts.map((shortcut) => {
            const label = shortcut.customLabel || DEFAULT_MODULE_LABELS[shortcut.id] || shortcut.id;
            const href = MODULE_SHORTCUT_HREFS[shortcut.id] || '/';
            const duplicatesBottomNav = ['today', 'plan', 'library', 'journal'].includes(
              shortcut.id
            );
            return (
              <Link
                key={shortcut.id}
                href={href}
                id={`shortcut-${shortcut.id}`}
                className={duplicatesBottomNav ? 'desktop-only' : undefined}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  borderRadius: `${radii.pill}px`,
                  backgroundColor: palette.surfaceRaised,
                  border: `1px solid ${palette.border.subtle}`,
                  color: palette.text.primary,
                  fontSize: '13px',
                  fontWeight: 600,
                  textDecoration: 'none',
                  maxWidth: '100%',
                  minWidth: 0,
                }}
              >
                <span>
                  <Icon name={MODULE_SHORTCUT_ICONS[shortcut.id]} />
                </span>
                <span className="daynori-break">{label}</span>
              </Link>
            );
          })}
        </nav>
      )}

      {/* Error / Retry Banner */}
      {errorMessage && (
        <div style={{ marginBottom: `${spacing.base}px` }}>
          <Feedback
            severity="danger"
            title="Notification"
            message={errorMessage}
            themeMode={themeMode}
            onDismiss={() => setErrorMessage(null)}
          />
          <div style={{ marginTop: `${spacing.xs}px` }}>
            <Button
              id="retry-state-btn"
              variant="secondary"
              size="compact"
              themeMode={themeMode}
              onClick={() => {
                setErrorMessage(null);
                void loadData();
              }}
            >
              Retry
            </Button>
          </div>
        </div>
      )}

      {/* Undo Toast */}
      {undoToast && (
        <div
          role="alert"
          style={{
            marginBottom: `${spacing.base}px`,
            padding: `${spacing.sm}px ${spacing.base}px`,
            backgroundColor: palette.surfaceRaised,
            borderRadius: `${radii.card}px`,
            border: `1px solid ${palette.action.primary}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span style={{ fontSize: '13px', color: palette.text.primary, fontWeight: 500 }}>
            Updated {undoToast.routineTitle}.
          </span>
          <button
            type="button"
            id="undo-routine-btn"
            onClick={handleUndo}
            style={{
              background: 'none',
              border: 'none',
              color: palette.action.primary,
              fontWeight: 700,
              cursor: 'pointer',
              padding: '4px 8px',
            }}
          >
            Undo
          </button>
        </div>
      )}

      {/* Loading Indicator */}
      {isLoading ? (
        <div
          role="status"
          aria-live="polite"
          aria-busy="true"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: `${spacing.xxl}px`,
            backgroundColor: palette.surface,
            borderRadius: `${radii.card}px`,
            border: `1px solid ${palette.border.subtle}`,
            color: palette.text.secondary,
            gap: `${spacing.md}px`,
          }}
        >
          <div
            style={{
              width: '28px',
              height: '28px',
              border: `3px solid ${palette.border.subtle}`,
              borderTopColor: palette.action.primary,
              borderRadius: '50%',
              animation: 'daynori-spin 0.8s linear infinite',
            }}
          />
          <span className="daynori-break" style={{ textAlign: 'center', maxWidth: '100%' }}>
            Updating Today…
          </span>
        </div>
      ) : visibleWidgets.length === 0 ? (
        <EmptyState
          id="today-empty-state"
          title="All cards hidden"
          description="You have hidden all cards on your Today home. Customize your home to enable cards."
          actionLabel="Customize Home"
          onAction={() => setIsCustomizing(true)}
          themeMode={themeMode}
          icon={<Icon name="sun" size={32} />}
        />
      ) : (
        /* Render Customizable Cards in Configured Order */
        <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.base}px` }}>
          {visibleWidgets.map((widget) => {
            const cardTitle = widget.customLabel || DEFAULT_WIDGET_LABELS[widget.id];

            // 1. Tasks Card
            if (widget.id === 'tasks') {
              return (
                <Card key={widget.id} themeMode={themeMode}>
                  <div style={{ padding: `${cardPadding}px` }}>
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
                          id="tasks-card-heading"
                          style={{
                            margin: 0,
                            fontSize: `${typography.webScale.sectionHeading}px`,
                            color: palette.text.primary,
                            fontWeight: 700,
                          }}
                        >
                          {cardTitle}
                        </h2>
                        <span style={{ fontSize: '12px', color: palette.text.secondary }}>
                          One-off tasks and deadlines due today
                        </span>
                      </div>
                      <span
                        style={{
                          fontSize: '12px',
                          fontWeight: 600,
                          color: palette.text.secondary,
                        }}
                      >
                        {tasksDueToday.filter((t) => t.status === 'completed').length} of{' '}
                        {tasksDueToday.length} done
                      </span>
                    </div>

                    {/* Tasks Due Today List */}
                    <div role="list" aria-label="Tasks due today">
                      {tasksDueToday.length === 0 ? (
                        <div
                          style={{
                            padding: `${spacing.sm}px 0`,
                            color: palette.text.secondary,
                            fontSize: '13px',
                          }}
                        >
                          No tasks due today.
                        </div>
                      ) : (
                        tasksDueToday.map((task) => (
                          <div
                            key={task.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              minHeight: `${touchTargets.webMin}px`,
                              padding: `${spacing.xs}px 0`,
                              borderBottom: `1px solid ${palette.border.subtle}`,
                              gap: `${spacing.sm}px`,
                            }}
                          >
                            <input
                              type="checkbox"
                              id={`check-${task.id}`}
                              checked={task.status === 'completed'}
                              onChange={() => toggleTask(task.id)}
                              aria-label={`Mark "${task.title}" as ${task.status === 'completed' ? 'incomplete' : 'complete'}`}
                              style={{
                                width: '20px',
                                height: '20px',
                                cursor: 'pointer',
                                accentColor: palette.action.primary,
                              }}
                            />
                            <label
                              htmlFor={`check-${task.id}`}
                              style={{
                                flex: 1,
                                cursor: 'pointer',
                                fontSize: `${typography.webScale.body}px`,
                                color:
                                  task.status === 'completed'
                                    ? palette.text.secondary
                                    : palette.text.primary,
                                textDecoration:
                                  task.status === 'completed' ? 'line-through' : 'none',
                              }}
                            >
                              {task.title}
                            </label>
                            <span
                              style={{
                                fontSize: '11px',
                                fontWeight: 700,
                                padding: '2px 8px',
                                borderRadius: `${radii.pill}px`,
                                backgroundColor: palette.surfaceRaised,
                                color: palette.text.secondary,
                                border: `1px solid ${palette.border.subtle}`,
                              }}
                            >
                              {task.priority}
                            </span>
                          </div>
                        ))
                      )}
                    </div>

                    {/* Collapsible Overdue Tasks Group */}
                    {overdueTasks.length > 0 && (
                      <div style={{ marginTop: `${spacing.sm}px` }}>
                        <button
                          type="button"
                          id="toggle-overdue-btn"
                          onClick={() => setIsOverdueExpanded((v) => !v)}
                          aria-expanded={isOverdueExpanded}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: `${spacing.xs}px`,
                            background: 'none',
                            border: 'none',
                            color: palette.status.danger,
                            fontSize: '12px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            padding: '4px 0',
                          }}
                        >
                          <span>
                            <Icon name={isOverdueExpanded ? 'chevron-down' : 'chevron-right'} />
                          </span>
                          <span>
                            {overdueTasks.length} overdue task{overdueTasks.length === 1 ? '' : 's'}
                          </span>
                        </button>

                        {isOverdueExpanded && (
                          <div
                            role="list"
                            aria-label="Overdue tasks"
                            style={{
                              marginTop: `${spacing.xs}px`,
                              paddingLeft: `${spacing.base}px`,
                              borderLeft: `2px solid ${palette.status.danger}`,
                            }}
                          >
                            {overdueTasks.map((task) => (
                              <div
                                key={task.id}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  minHeight: '36px',
                                  padding: '4px 0',
                                  gap: `${spacing.sm}px`,
                                }}
                              >
                                <input
                                  type="checkbox"
                                  id={`check-overdue-${task.id}`}
                                  checked={task.status === 'completed'}
                                  onChange={() => toggleTask(task.id)}
                                  aria-label={`Mark overdue "${task.title}" as complete`}
                                  style={{
                                    width: '18px',
                                    height: '18px',
                                    cursor: 'pointer',
                                    accentColor: palette.action.primary,
                                  }}
                                />
                                <label
                                  htmlFor={`check-overdue-${task.id}`}
                                  style={{
                                    flex: 1,
                                    fontSize: '13px',
                                    color: palette.text.primary,
                                  }}
                                >
                                  {task.title}
                                </label>
                                <span style={{ fontSize: '11px', color: palette.status.danger }}>
                                  Overdue
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    <div style={{ marginTop: `${spacing.md}px` }}>
                      <Link
                        href="/plan"
                        style={{
                          color: palette.action.primary,
                          fontSize: '13px',
                          fontWeight: 600,
                          textDecoration: 'none',
                          display: 'inline-flex',
                          alignItems: 'center',
                          minHeight: '32px',
                        }}
                      >
                        View all tasks in Plan <Icon name="arrow-right" />
                      </Link>
                    </div>
                  </div>
                </Card>
              );
            }

            // 2. Routines Card
            if (widget.id === 'routines') {
              return (
                <Card key={widget.id} themeMode={themeMode}>
                  <div style={{ padding: `${cardPadding}px` }}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: `${spacing.xs}px`,
                        flexWrap: 'wrap',
                        gap: `${spacing.xs}px`,
                      }}
                    >
                      <div>
                        <h2
                          id="routines-card-heading"
                          style={{
                            margin: 0,
                            fontSize: `${typography.webScale.sectionHeading}px`,
                            color: palette.text.primary,
                            fontWeight: 700,
                          }}
                        >
                          {cardTitle}
                        </h2>
                        <span style={{ fontSize: '12px', color: palette.text.secondary }}>
                          Gentle daily habit checklist · Independent completion
                        </span>
                      </div>

                      <div
                        style={{
                          fontSize: '13px',
                          fontWeight: 700,
                          color: palette.action.primary,
                        }}
                      >
                        {progress.completedCount} of {progress.totalScheduled} completed
                      </div>
                    </div>

                    {/* Progress Bar */}
                    {progress.totalScheduled > 0 && (
                      <div
                        style={{
                          width: '100%',
                          height: '6px',
                          backgroundColor: palette.surfaceRaised,
                          borderRadius: `${radii.pill}px`,
                          overflow: 'hidden',
                          margin: `${spacing.xs}px 0 ${spacing.sm}px 0`,
                        }}
                      >
                        <div
                          style={{
                            width: `${progress.completionRate}%`,
                            height: '100%',
                            backgroundColor: palette.action.primary,
                            borderRadius: `${radii.pill}px`,
                            transition: 'width 250ms ease',
                          }}
                        />
                      </div>
                    )}

                    {/* Routine Checklist Items */}
                    <div role="list" aria-label="Today's routines checklist">
                      {todayRoutineItems.length === 0 ? (
                        <div
                          style={{
                            padding: `${spacing.md}px 0`,
                            color: palette.text.secondary,
                            fontSize: '13px',
                            textAlign: 'center',
                          }}
                        >
                          No routines scheduled for today.
                        </div>
                      ) : (
                        todayRoutineItems.map(({ routine, occurrence, routineDate }) => (
                          <RoutineRow
                            key={routine.id}
                            routine={{
                              id: routine.id,
                              title: routine.title,
                              details: routine.details,
                              frequency: routine.frequency,
                              weekdays: routine.weekdays,
                              timezone: routine.timezone,
                              scheduledTime: routine.scheduledTime,
                              isPaused: routine.isPaused,
                              isArchived: routine.isArchived,
                            }}
                            occurrence={occurrence}
                            viewingDate={routineDate}
                            themeMode={themeMode}
                            onComplete={handleCompleteOccurrence}
                            onSkip={handleSkipOccurrence}
                            onReopen={handleReopenOccurrence}
                            onEdit={(id) => {
                              const r = routines.find((item) => item.id === id);
                              if (r) {
                                setEditingRoutine(r);
                                setIsEditorOpen(true);
                              }
                            }}
                            onViewHistory={(id) => {
                              const r = routines.find((item) => item.id === id);
                              if (r) {
                                void handleOpenHistory(r);
                              }
                            }}
                            onTogglePause={handleTogglePauseRoutine}
                          />
                        ))
                      )}
                    </div>

                    <div
                      style={{
                        marginTop: `${spacing.sm}px`,
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setEditingRoutine(null);
                          setIsEditorOpen(true);
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: palette.action.primary,
                          fontSize: '13px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          padding: 0,
                          minHeight: '32px',
                          display: 'inline-flex',
                          alignItems: 'center',
                        }}
                      >
                        + Add another routine
                      </button>
                    </div>
                  </div>
                </Card>
              );
            }

            // 3. Upcoming Summary Card (Next 7 Days)
            if (widget.id === 'upcoming_summary') {
              return (
                <Card key={widget.id} themeMode={themeMode}>
                  <div style={{ padding: `${cardPadding}px` }}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: `${spacing.xs}px`,
                      }}
                    >
                      <div>
                        <h2
                          id="upcoming-card-heading"
                          style={{
                            margin: 0,
                            fontSize: `${typography.webScale.sectionHeading}px`,
                            color: palette.text.primary,
                            fontWeight: 700,
                          }}
                        >
                          {cardTitle}
                        </h2>
                        <span style={{ fontSize: '12px', color: palette.text.secondary }}>
                          Lookahead for the coming week
                        </span>
                      </div>
                      <Link
                        href="/plan"
                        style={{
                          fontSize: '13px',
                          color: palette.action.primary,
                          fontWeight: 600,
                          textDecoration: 'none',
                        }}
                      >
                        Open Plan <Icon name="arrow-right" />
                      </Link>
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        gap: `${spacing.base}px`,
                        marginTop: `${spacing.sm}px`,
                        flexWrap: 'wrap',
                      }}
                    >
                      <div
                        style={{
                          flex: 1,
                          minWidth: '140px',
                          padding: `${spacing.sm}px`,
                          backgroundColor: palette.surfaceRaised,
                          borderRadius: `${radii.sm}px`,
                          border: `1px solid ${palette.border.subtle}`,
                        }}
                      >
                        <div
                          style={{
                            fontSize: '20px',
                            fontWeight: 800,
                            color: palette.action.primary,
                          }}
                        >
                          {upcomingSummary.upcomingTaskCount}
                        </div>
                        <div style={{ fontSize: '12px', color: palette.text.secondary }}>
                          Tasks in next 7 days
                        </div>
                      </div>

                      <div
                        style={{
                          flex: 1,
                          minWidth: '140px',
                          padding: `${spacing.sm}px`,
                          backgroundColor: palette.surfaceRaised,
                          borderRadius: `${radii.sm}px`,
                          border: `1px solid ${palette.border.subtle}`,
                        }}
                      >
                        <div
                          style={{
                            fontSize: '20px',
                            fontWeight: 800,
                            color: palette.action.primary,
                          }}
                        >
                          {upcomingSummary.upcomingRoutineCount}
                        </div>
                        <div style={{ fontSize: '12px', color: palette.text.secondary }}>
                          Scheduled routines
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>
              );
            }

            // 4. Quick Capture Card
            if (widget.id === 'quick_capture') {
              return (
                <Card key={widget.id} themeMode={themeMode}>
                  <div style={{ padding: `${cardPadding}px` }}>
                    <h2
                      id="quick-capture-heading"
                      style={{
                        margin: 0,
                        fontSize: `${typography.webScale.sectionHeading}px`,
                        color: palette.text.primary,
                        fontWeight: 700,
                        marginBottom: `${spacing.xs}px`,
                      }}
                    >
                      {cardTitle}
                    </h2>
                    <span style={{ fontSize: '12px', color: palette.text.secondary }}>
                      Quickly capture ideas and items directly into your inbox
                    </span>

                    <div
                      style={{
                        display: 'flex',
                        gap: `${spacing.xs}px`,
                        marginTop: `${spacing.sm}px`,
                        flexWrap: 'wrap',
                      }}
                    >
                      <Link
                        href="/plan?create=task"
                        id="quick-capture-task"
                        style={{
                          padding: '6px 12px',
                          borderRadius: `${radii.sm}px`,
                          backgroundColor: palette.surfaceRaised,
                          border: `1px solid ${palette.border.subtle}`,
                          color: palette.text.primary,
                          fontSize: '13px',
                          fontWeight: 600,
                          textDecoration: 'none',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <span>
                          <Icon name="check" />
                        </span>{' '}
                        New Task
                      </Link>

                      <Link
                        href="/library?create=note"
                        id="quick-capture-note"
                        style={{
                          padding: '6px 12px',
                          borderRadius: `${radii.sm}px`,
                          backgroundColor: palette.surfaceRaised,
                          border: `1px solid ${palette.border.subtle}`,
                          color: palette.text.primary,
                          fontSize: '13px',
                          fontWeight: 600,
                          textDecoration: 'none',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <span>
                          <Icon name="note" />
                        </span>{' '}
                        New Note
                      </Link>

                      <button
                        type="button"
                        id="quick-capture-routine"
                        onClick={() => {
                          setEditingRoutine(null);
                          setIsEditorOpen(true);
                        }}
                        style={{
                          padding: '6px 12px',
                          borderRadius: `${radii.sm}px`,
                          backgroundColor: palette.surfaceRaised,
                          border: `1px solid ${palette.border.subtle}`,
                          color: palette.text.primary,
                          fontSize: '13px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <span>
                          <Icon name="refresh" />
                        </span>{' '}
                        Routine
                      </button>

                      <Link
                        href="/journal"
                        id="quick-capture-journal"
                        style={{
                          padding: '6px 12px',
                          borderRadius: `${radii.sm}px`,
                          backgroundColor: palette.surfaceRaised,
                          border: `1px solid ${palette.border.subtle}`,
                          color: palette.text.primary,
                          fontSize: '13px',
                          fontWeight: 600,
                          textDecoration: 'none',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <span>
                          <Icon name="book" />
                        </span>{' '}
                        Write Journal
                      </Link>

                      <Link
                        href="/library"
                        id="quick-capture-file"
                        style={{
                          padding: '6px 12px',
                          borderRadius: `${radii.sm}px`,
                          backgroundColor: palette.surfaceRaised,
                          border: `1px solid ${palette.border.subtle}`,
                          color: palette.text.primary,
                          fontSize: '13px',
                          fontWeight: 600,
                          textDecoration: 'none',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <span>
                          <Icon name="folder" />
                        </span>{' '}
                        Upload File
                      </Link>
                    </div>
                  </div>
                </Card>
              );
            }

            // 5. Journal Reflection Card (No body preview!)
            if (widget.id === 'journal_prompt') {
              return (
                <Card key={widget.id} themeMode={themeMode}>
                  <div style={{ padding: `${cardPadding}px` }}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: `${spacing.xs}px`,
                      }}
                    >
                      <div>
                        <h2
                          id="journal-card-heading"
                          style={{
                            margin: 0,
                            fontSize: `${typography.webScale.sectionHeading}px`,
                            color: palette.text.primary,
                            fontWeight: 700,
                          }}
                        >
                          {cardTitle}
                        </h2>
                        <span style={{ fontSize: '12px', color: palette.text.secondary }}>
                          Take a quiet moment to write about your day
                        </span>
                      </div>
                      <Link
                        href="/journal"
                        id="write-journal-today-btn"
                        style={{
                          padding: '6px 14px',
                          borderRadius: `${radii.sm}px`,
                          backgroundColor: palette.action.primary,
                          color: '#ffffff',
                          fontSize: '13px',
                          fontWeight: 600,
                          textDecoration: 'none',
                          display: 'inline-flex',
                          alignItems: 'center',
                          minHeight: '32px',
                        }}
                      >
                        Write reflection <Icon name="arrow-right" />
                      </Link>
                    </div>
                  </div>
                </Card>
              );
            }

            // 6. Recent Items Card
            if (widget.id === 'recent_items') {
              return (
                <Card key={widget.id} themeMode={themeMode}>
                  <div style={{ padding: `${cardPadding}px` }}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: `${spacing.sm}px`,
                      }}
                    >
                      <h2
                        id="recent-items-heading"
                        style={{
                          margin: 0,
                          fontSize: `${typography.webScale.sectionHeading}px`,
                          color: palette.text.primary,
                          fontWeight: 700,
                        }}
                      >
                        {cardTitle}
                      </h2>
                      <span style={{ fontSize: '12px', color: palette.text.secondary }}>
                        Recently updated
                      </span>
                    </div>

                    <div role="list" aria-label="Recent items">
                      {recentItems.length === 0 ? (
                        <div
                          style={{
                            fontSize: '13px',
                            color: palette.text.secondary,
                            padding: '4px 0',
                          }}
                        >
                          No recent items found.
                        </div>
                      ) : (
                        recentItems.map((item) => (
                          <Link
                            key={item.id}
                            href={getRecentItemHref(item)}
                            id={`recent-item-${item.id}`}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: `${spacing.xs}px 0`,
                              borderBottom: `1px solid ${palette.border.subtle}`,
                              textDecoration: 'none',
                              color: 'inherit',
                            }}
                          >
                            <span
                              style={{
                                fontSize: '13px',
                                color: palette.text.primary,
                                fontWeight: 500,
                              }}
                            >
                              {item.title}
                            </span>
                            <span
                              style={{
                                fontSize: '11px',
                                textTransform: 'uppercase',
                                padding: '2px 6px',
                                borderRadius: `${radii.pill}px`,
                                backgroundColor: palette.surfaceRaised,
                                color: palette.text.secondary,
                              }}
                            >
                              {item.type}
                            </span>
                          </Link>
                        ))
                      )}
                    </div>
                  </div>
                </Card>
              );
            }

            // 7. Favorite Folders Card
            if (widget.id === 'favorite_folders') {
              const activeFavs = workspaceFolders.filter((f) =>
                homeLayout.favoriteFolderIds.includes(f.id)
              );

              return (
                <Card key={widget.id} themeMode={themeMode}>
                  <div style={{ padding: `${cardPadding}px` }}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: `${spacing.sm}px`,
                      }}
                    >
                      <h2
                        id="favorite-folders-heading"
                        style={{
                          margin: 0,
                          fontSize: `${typography.webScale.sectionHeading}px`,
                          color: palette.text.primary,
                          fontWeight: 700,
                        }}
                      >
                        {cardTitle}
                      </h2>
                      <Link
                        href="/library"
                        style={{
                          fontSize: '12px',
                          color: palette.action.primary,
                          textDecoration: 'none',
                        }}
                      >
                        Browse all <Icon name="arrow-right" />
                      </Link>
                    </div>

                    <div style={{ display: 'flex', gap: `${spacing.xs}px`, flexWrap: 'wrap' }}>
                      {activeFavs.length === 0 ? (
                        <div
                          style={{
                            fontSize: '13px',
                            color: palette.text.secondary,
                            padding: '4px 0',
                          }}
                        >
                          No favorite folders pinned yet. Use Customize Today to pin your key
                          folders.
                        </div>
                      ) : (
                        activeFavs.map((f) => (
                          <Link
                            key={f.id}
                            href={`/library?folderId=${f.id}`}
                            style={{
                              padding: '6px 12px',
                              borderRadius: `${radii.sm}px`,
                              backgroundColor: palette.surfaceRaised,
                              border: `1px solid ${palette.border.subtle}`,
                              color: palette.text.primary,
                              fontSize: '13px',
                              fontWeight: 600,
                              textDecoration: 'none',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                            }}
                          >
                            <span>
                              <Icon name="folder" />
                            </span>{' '}
                            {f.name}
                          </Link>
                        ))
                      )}
                    </div>
                  </div>
                </Card>
              );
            }

            return null;
          })}
        </div>
      )}

      {/* Routine Detail Editor Modal */}
      {isEditorOpen && (
        <RoutineDetailEditor
          isOpen={isEditorOpen}
          onClose={() => {
            setIsEditorOpen(false);
            setEditingRoutine(null);
          }}
          onSave={handleSaveRoutine}
          initialRoutine={
            editingRoutine
              ? {
                  id: editingRoutine.id,
                  title: editingRoutine.title,
                  details: editingRoutine.details,
                  frequency: editingRoutine.frequency,
                  weekdays: editingRoutine.weekdays,
                  timezone: editingRoutine.timezone,
                  scheduledTime: editingRoutine.scheduledTime,
                  activeFrom: editingRoutine.activeFrom,
                  activeTo: editingRoutine.activeTo,
                  effectiveDate: editingRoutine.effectiveDate ?? todayDate,
                  isPaused: editingRoutine.isPaused,
                }
              : undefined
          }
          defaultTimezone={viewingTimezone}
          todayDate={todayDate}
          themeMode={themeMode}
        />
      )}

      {/* Routine History Modal */}
      {historyRoutine && (
        <RoutineHistoryViewer
          isOpen={Boolean(historyRoutine)}
          onClose={() => setHistoryRoutine(null)}
          routineTitle={historyRoutine.title}
          occurrences={historyOccurrences.map((o) => ({
            id: o.id,
            routineId: o.routineId,
            scheduledDate: o.scheduledDate,
            scheduleRevision: o.scheduleRevision,
            plannedInstant: o.plannedInstant,
            timezone: o.timezone,
            status: o.status,
            completedAt: o.completedAt,
            completedBy: o.completedBy,
            history: o.history,
          }))}
          themeMode={themeMode}
        />
      )}

      {/* Phase 30: Customize Today Modal */}
      {isCustomizing && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="customization-modal-title"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: `${spacing.base}px`,
            zIndex: 1000,
          }}
        >
          <div
            style={{
              backgroundColor: palette.surface,
              borderRadius: `${radii.card}px`,
              border: `1px solid ${palette.border.subtle}`,
              maxWidth: '600px',
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              padding: `${spacing.lg}px`,
              boxSizing: 'border-box',
              display: 'flex',
              flexDirection: 'column',
              gap: `${spacing.base}px`,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2
                id="customization-modal-title"
                style={{
                  margin: 0,
                  fontSize: `${typography.webScale.sectionHeading}px`,
                  color: palette.text.primary,
                  fontWeight: 700,
                }}
              >
                Customize Today
              </h2>
              <button
                type="button"
                id="close-customization-btn"
                onClick={() => setIsCustomizing(false)}
                aria-label="Close customization modal"
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '20px',
                  color: palette.text.secondary,
                  cursor: 'pointer',
                  padding: '4px 8px',
                }}
              >
                <Icon name="x" />
              </button>
            </div>

            <p style={{ margin: 0, fontSize: '13px', color: palette.text.secondary }}>
              Rearrange cards, rename custom labels, toggle visibility, and configure display
              options.
            </p>

            {/* Widget Reordering & Visibility */}
            <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
              <legend
                style={{
                  fontWeight: 700,
                  fontSize: '14px',
                  color: palette.text.primary,
                  marginBottom: `${spacing.xs}px`,
                }}
              >
                Cards & Ordering
              </legend>
              <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.xs}px` }}>
                {[...homeLayout.widgets]
                  .sort((a, b) => a.order - b.order)
                  .map((widget, idx, arr) => (
                    <div
                      key={widget.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: `${spacing.xs}px ${spacing.sm}px`,
                        backgroundColor: palette.surfaceRaised,
                        borderRadius: `${radii.sm}px`,
                        border: `1px solid ${palette.border.subtle}`,
                        gap: `${spacing.sm}px`,
                      }}
                    >
                      <label
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: `${spacing.xs}px`,
                          cursor: 'pointer',
                          flex: 1,
                        }}
                      >
                        <input
                          type="checkbox"
                          id={`toggle-widget-${widget.id}`}
                          checked={widget.visible}
                          onChange={() => handleToggleWidget(widget.id)}
                          style={{
                            width: '18px',
                            height: '18px',
                            accentColor: palette.action.primary,
                          }}
                        />
                        <span
                          style={{ fontSize: '13px', fontWeight: 600, color: palette.text.primary }}
                        >
                          {DEFAULT_WIDGET_LABELS[widget.id]}
                        </span>
                      </label>

                      {/* Custom Label Input */}
                      <input
                        type="text"
                        id={`label-input-${widget.id}`}
                        placeholder={DEFAULT_WIDGET_LABELS[widget.id]}
                        value={widget.customLabel || ''}
                        onChange={(e) => handleLabelChange(widget.id, e.target.value)}
                        maxLength={40}
                        aria-label={`Custom label for ${DEFAULT_WIDGET_LABELS[widget.id]}`}
                        style={{
                          fontSize: '12px',
                          padding: '4px 8px',
                          borderRadius: `${radii.sm}px`,
                          border: `1px solid ${palette.border.subtle}`,
                          backgroundColor: palette.surface,
                          color: palette.text.primary,
                          width: '160px',
                        }}
                      />

                      {/* Accessible Reorder Controls */}
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button
                          type="button"
                          id={`move-up-${widget.id}`}
                          onClick={() => handleMoveWidget(widget.id, 'up')}
                          disabled={idx === 0}
                          aria-label={`Move ${DEFAULT_WIDGET_LABELS[widget.id]} up`}
                          style={{
                            padding: '4px 8px',
                            fontSize: '12px',
                            cursor: idx === 0 ? 'not-allowed' : 'pointer',
                            opacity: idx === 0 ? 0.4 : 1,
                            backgroundColor: palette.surface,
                            border: `1px solid ${palette.border.subtle}`,
                            borderRadius: '4px',
                            color: palette.text.primary,
                          }}
                        >
                          <Icon name="chevron-up" />
                        </button>
                        <button
                          type="button"
                          id={`move-down-${widget.id}`}
                          onClick={() => handleMoveWidget(widget.id, 'down')}
                          disabled={idx === arr.length - 1}
                          aria-label={`Move ${DEFAULT_WIDGET_LABELS[widget.id]} down`}
                          style={{
                            padding: '4px 8px',
                            fontSize: '12px',
                            cursor: idx === arr.length - 1 ? 'not-allowed' : 'pointer',
                            opacity: idx === arr.length - 1 ? 0.4 : 1,
                            backgroundColor: palette.surface,
                            border: `1px solid ${palette.border.subtle}`,
                            borderRadius: '4px',
                            color: palette.text.primary,
                          }}
                        >
                          <Icon name="chevron-down" />
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            </fieldset>

            {/* Module Shortcuts Reordering & Visibility */}
            <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
              <legend
                style={{
                  fontWeight: 700,
                  fontSize: '14px',
                  color: palette.text.primary,
                  marginBottom: `${spacing.xs}px`,
                }}
              >
                Navigation Shortcuts & Ordering
              </legend>
              <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.xs}px` }}>
                {[...homeLayout.moduleShortcuts]
                  .sort((a, b) => a.order - b.order)
                  .map((shortcut, idx, arr) => (
                    <div
                      key={shortcut.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: `${spacing.xs}px ${spacing.sm}px`,
                        backgroundColor: palette.surfaceRaised,
                        borderRadius: `${radii.sm}px`,
                        border: `1px solid ${palette.border.subtle}`,
                        gap: `${spacing.sm}px`,
                      }}
                    >
                      <label
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: `${spacing.xs}px`,
                          cursor: 'pointer',
                          flex: 1,
                        }}
                      >
                        <input
                          type="checkbox"
                          id={`toggle-shortcut-${shortcut.id}`}
                          checked={shortcut.visible}
                          onChange={() => handleToggleShortcut(shortcut.id)}
                          style={{
                            width: '18px',
                            height: '18px',
                            accentColor: palette.action.primary,
                          }}
                        />
                        <span
                          style={{ fontSize: '13px', fontWeight: 600, color: palette.text.primary }}
                        >
                          <Icon name={MODULE_SHORTCUT_ICONS[shortcut.id]} />{' '}
                          {DEFAULT_MODULE_LABELS[shortcut.id] || shortcut.id}
                        </span>
                      </label>

                      {/* Custom Label Input */}
                      <input
                        type="text"
                        id={`shortcut-label-input-${shortcut.id}`}
                        placeholder={DEFAULT_MODULE_LABELS[shortcut.id] || shortcut.id}
                        value={shortcut.customLabel || ''}
                        onChange={(e) => handleShortcutLabelChange(shortcut.id, e.target.value)}
                        maxLength={40}
                        aria-label={`Custom label for ${DEFAULT_MODULE_LABELS[shortcut.id] || shortcut.id}`}
                        style={{
                          fontSize: '12px',
                          padding: '4px 8px',
                          borderRadius: `${radii.sm}px`,
                          border: `1px solid ${palette.border.subtle}`,
                          backgroundColor: palette.surface,
                          color: palette.text.primary,
                          width: '160px',
                        }}
                      />

                      {/* Accessible Reorder Controls */}
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button
                          type="button"
                          id={`shortcut-move-up-${shortcut.id}`}
                          onClick={() => handleMoveShortcut(shortcut.id, 'up')}
                          disabled={idx === 0}
                          aria-label={`Move ${DEFAULT_MODULE_LABELS[shortcut.id] || shortcut.id} up`}
                          style={{
                            padding: '4px 8px',
                            fontSize: '12px',
                            cursor: idx === 0 ? 'not-allowed' : 'pointer',
                            opacity: idx === 0 ? 0.4 : 1,
                            backgroundColor: palette.surface,
                            border: `1px solid ${palette.border.subtle}`,
                            borderRadius: '4px',
                            color: palette.text.primary,
                          }}
                        >
                          <Icon name="chevron-up" />
                        </button>
                        <button
                          type="button"
                          id={`shortcut-move-down-${shortcut.id}`}
                          onClick={() => handleMoveShortcut(shortcut.id, 'down')}
                          disabled={idx === arr.length - 1}
                          aria-label={`Move ${DEFAULT_MODULE_LABELS[shortcut.id] || shortcut.id} down`}
                          style={{
                            padding: '4px 8px',
                            fontSize: '12px',
                            cursor: idx === arr.length - 1 ? 'not-allowed' : 'pointer',
                            opacity: idx === arr.length - 1 ? 0.4 : 1,
                            backgroundColor: palette.surface,
                            border: `1px solid ${palette.border.subtle}`,
                            borderRadius: '4px',
                            color: palette.text.primary,
                          }}
                        >
                          <Icon name="chevron-down" />
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            </fieldset>

            {/* Display Density */}
            <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
              <legend
                style={{
                  fontWeight: 700,
                  fontSize: '14px',
                  color: palette.text.primary,
                  marginBottom: `${spacing.xs}px`,
                }}
              >
                Layout Density
              </legend>
              <div style={{ display: 'flex', gap: `${spacing.base}px` }}>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '13px',
                    color: palette.text.primary,
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="radio"
                    name="density"
                    id="density-comfortable"
                    value="comfortable"
                    checked={homeLayout.density === 'comfortable'}
                    onChange={() => handleDensityChange('comfortable')}
                  />
                  Comfortable
                </label>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '13px',
                    color: palette.text.primary,
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="radio"
                    name="density"
                    id="density-compact"
                    value="compact"
                    checked={homeLayout.density === 'compact'}
                    onChange={() => handleDensityChange('compact')}
                  />
                  Compact
                </label>
              </div>
            </fieldset>

            {/* Theme Selection */}
            <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
              <legend
                style={{
                  fontWeight: 700,
                  fontSize: '14px',
                  color: palette.text.primary,
                  marginBottom: `${spacing.xs}px`,
                }}
              >
                Theme
              </legend>
              <div style={{ display: 'flex', gap: `${spacing.base}px` }}>
                {(['system', 'light', 'dark'] as const).map((mode) => (
                  <label
                    key={mode}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '13px',
                      color: palette.text.primary,
                      cursor: 'pointer',
                      textTransform: 'capitalize',
                    }}
                  >
                    <input
                      type="radio"
                      name="theme"
                      id={`theme-${mode}`}
                      value={mode}
                      checked={themePreference === mode}
                      onChange={() => setTheme(mode)}
                    />
                    {mode}
                  </label>
                ))}
              </div>
            </fieldset>

            {/* Favorite Folders Selection */}
            {workspaceFolders.length > 0 && (
              <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
                <legend
                  style={{
                    fontWeight: 700,
                    fontSize: '14px',
                    color: palette.text.primary,
                    marginBottom: `${spacing.xs}px`,
                  }}
                >
                  Pin Favorite Folders
                </legend>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {workspaceFolders.map((folder) => (
                    <label
                      key={folder.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        fontSize: '13px',
                        color: palette.text.primary,
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="checkbox"
                        id={`fav-folder-${folder.id}`}
                        checked={homeLayout.favoriteFolderIds.includes(folder.id)}
                        onChange={() => handleToggleFavoriteFolder(folder.id)}
                        style={{
                          width: '16px',
                          height: '16px',
                          accentColor: palette.action.primary,
                        }}
                      />
                      <span>
                        <Icon name="folder" /> {folder.name}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}

            {/* Modal Conflict Notice */}
            {conflictState && (
              <div
                style={{
                  padding: `${spacing.sm}px`,
                  borderRadius: `${radii.sm}px`,
                  backgroundColor: palette.surfaceRaised,
                  border: `1px solid ${palette.status.warning || palette.border.subtle}`,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: `${spacing.xs}px`,
                }}
              >
                <div style={{ fontWeight: 700, color: palette.text.primary, fontSize: '13px' }}>
                  <Icon name="warning" /> Cloud Settings Conflict (revision{' '}
                  {conflictState.serverRevision})
                </div>
                <div style={{ fontSize: '12px', color: palette.text.secondary }}>
                  Another device saved preferences since this page was loaded. Your unsaved edits
                  are kept in this form.
                </div>
                <div style={{ display: 'flex', gap: `${spacing.xs}px` }}>
                  <Button
                    id="modal-keep-my-edits-btn"
                    variant="primary"
                    size="compact"
                    themeMode={themeMode}
                    onClick={handleKeepMyEdits}
                  >
                    Keep My Edits & Overwrite
                  </Button>
                  <Button
                    id="modal-discard-reload-btn"
                    variant="secondary"
                    size="compact"
                    themeMode={themeMode}
                    onClick={handleDiscardAndReload}
                  >
                    Discard & Load Cloud
                  </Button>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: `${spacing.sm}px`,
                paddingTop: `${spacing.base}px`,
                borderTop: `1px solid ${palette.border.subtle}`,
                flexWrap: 'wrap',
                gap: `${spacing.sm}px`,
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <button
                  type="button"
                  id="restore-defaults-btn"
                  onClick={handleRestoreDefaults}
                  style={{
                    background: 'none',
                    border: `1px solid ${palette.border.subtle}`,
                    borderRadius: `${radii.sm}px`,
                    padding: '6px 12px',
                    fontSize: '13px',
                    color: palette.text.secondary,
                    cursor: 'pointer',
                    alignSelf: 'flex-start',
                  }}
                >
                  Restore Defaults
                </button>
                <span style={{ fontSize: '11px', color: palette.text.secondary }}>
                  Applies default card order and shortcut visibility without modifying personal
                  content.
                </span>
              </div>

              <div style={{ display: 'flex', gap: `${spacing.xs}px` }}>
                <Button
                  id="cancel-customization-btn"
                  variant="secondary"
                  size="compact"
                  themeMode={themeMode}
                  onClick={() => setIsCustomizing(false)}
                >
                  Cancel
                </Button>
                <Button
                  id="save-customization-btn"
                  variant="primary"
                  size="compact"
                  themeMode={themeMode}
                  onClick={() => void handleSavePreferences()}
                  disabled={isSavingLayout || hasUnsupportedVersion}
                >
                  {isSavingLayout ? 'Saving...' : 'Save Preferences'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
