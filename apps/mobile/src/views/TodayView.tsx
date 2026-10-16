import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  ActivityIndicator,
  AppState,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors, radii, spacing, touchTargets, type ThemeMode } from '@daynori/design-tokens';
import {
  MobileButton,
  MobileCard,
  MobileEmptyState,
  MobileFeedback,
  MobileListRow,
  MobileModalSheet,
  MobileRoutineRow,
} from '@daynori/ui-mobile';
import {
  calculateGentleProgress,
  explainWhyDueToday,
  getCalendarDateInTimezone,
  addCalendarDays,
  calculatePlannedInstant,
  computeDeterministicOccurrenceId,
  isRoutineScheduledOnDate,
  isTaskDueToday,
  isTaskOverdue,
  type RoutineFrequency,
  type Weekday,
  type RoutineOccurrenceStatus,
  type RoutineOccurrenceTransition,
} from '@daynori/domain';
import type {
  LocalRepositoryPort,
  SyncEngine,
  RoutineOccurrenceRecord,
  TaskRecord,
  ItemHeaderRecord,
} from '@daynori/sync';

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
}

export interface TodayViewProps {
  themeMode: ThemeMode;
  onNavigateToPlan: () => void;
  onNavigateToJournal: () => void;
  onOpenCreate: () => void;
  testID?: string;
  todayDate?: string;
  initialRoutines?: MobileRoutineItem[];
  initialOccurrences?: MobileOccurrenceItem[];
  initialTasks?: MobileTaskItem[];
  repository?: LocalRepositoryPort;
  syncEngine?: SyncEngine;
  workspaceId?: string | null;
  userId?: string | null;
  isOnline?: boolean;
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
  // Today's occurrences
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
  // Yesterday's preserved history
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
  onOpenCreate,
  testID = 'today-view',
  todayDate: todayDateProp = DEFAULT_TODAY,
  initialRoutines = DEFAULT_ROUTINES,
  initialOccurrences = DEFAULT_OCCURRENCES,
  initialTasks = DEFAULT_TASKS,
  repository,
  syncEngine,
  workspaceId,
  userId,
  isOnline: _isOnline = true,
}) => {
  const palette = colors[themeMode];
  const isProduction = Boolean(repository && workspaceId);

  // Timezone & dynamic calendar reference
  const [viewingTimezone] = useState<string>(() => {
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

  // Interactive state toggles for testing empty, loading, and error states
  const [demoState, setDemoState] = useState<'normal' | 'empty' | 'loading' | 'error'>('normal');
  const [tasks, setTasks] = useState<MobileTaskItem[]>(initialTasks);
  const [routines, setRoutines] = useState<MobileRoutineItem[]>(initialRoutines);
  const [occurrences, setOccurrences] = useState<MobileOccurrenceItem[]>(initialOccurrences);
  const rawTasksRef = useRef<TaskRecord[]>([]);

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

    try {
      const loadedRoutines = await repository.listRoutines(workspaceId);
      const loadedOccurrences = await repository.listRoutineOccurrences(
        workspaceId,
        undefined,
        yesterdayDate,
        addCalendarDays(todayDate, 7)
      );

      // Generate missing occurrences for each routine using its scheduling timezone
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

      // Filter tasks due today
      const allTasks = await repository.listTasks(workspaceId);
      rawTasksRef.current = allTasks;
      const refDate = new Date();
      const todayTasks = allTasks.filter(
        (t) =>
          t.deletedAt === null &&
          (isTaskDueToday({ deadline: t.deadline }, refDate, viewingTimezone) ||
            isTaskOverdue({ status: t.status, deadline: t.deadline }, refDate, viewingTimezone))
      );

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
      setTasks(
        todayTasks.map((t) => ({
          id: t.id,
          title: t.title,
          due: t.deadline?.type === 'timed' ? `Due ${t.deadline.timestamp.slice(11, 16)}` : 'Today',
          completed: t.status === 'completed',
        }))
      );
    } catch {
      // ignore
    }
  }, [repository, workspaceId, yesterdayDate, todayDate, currentNow, viewingTimezone]);

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
      `Skipped "${routine?.title || 'routine'}".`,
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
    const prevHistory = (occ as RoutineOccurrenceRecord)?.history || [];
    const updatedHistory: RoutineOccurrenceTransition[] = [
      ...prevHistory,
      {
        fromStatus: occ.status,
        toStatus: 'pending',
        status: 'pending',
        changedAt: nowIso,
        transitionedAt: nowIso,
        actorId: userId || null,
        reason: null,
      },
    ];

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
        plannedInstant: (occ as RoutineOccurrenceRecord)?.plannedInstant || null,
        timezone: routine?.timezone || 'UTC',
        status: 'pending',
        completedAt: null,
        completedBy: null,
        history: updatedHistory,
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

  const handleUndo = async () => {
    if (!undoNotice) return;
    if (undoTimeoutRef.current) {
      clearTimeout(undoTimeoutRef.current);
    }
    const { occurrenceId, previousStatus, previousCompletedAt, previousHistory } = undoNotice;
    const occ = occurrences.find((o) => o.id === occurrenceId);
    if (!occ) return;

    const nowIso = new Date().toISOString();
    const routine = routines.find((r) => r.id === occ.routineId);

    // Revision-protected compensating transition
    const compensatingTransition: RoutineOccurrenceTransition = {
      fromStatus: occ.status,
      toStatus: previousStatus,
      status: previousStatus,
      previousStatus: occ.status,
      changedAt: nowIso,
      transitionedAt: nowIso,
      actorId: userId || null,
      reason: 'Compensating undo action',
    };

    setOccurrences((prev) =>
      prev.map((o) =>
        o.id === occurrenceId
          ? { ...o, status: previousStatus, completedAt: previousCompletedAt }
          : o
      )
    );

    if (isProduction && workspaceId) {
      const restoredOcc: RoutineOccurrenceRecord = {
        id: occurrenceId,
        workspaceId,
        routineId: occ.routineId,
        scheduledDate: occ.scheduledDate,
        scheduleRevision: 1,
        plannedInstant: (occ as RoutineOccurrenceRecord)?.plannedInstant || null,
        timezone: routine?.timezone || 'UTC',
        status: previousStatus,
        completedAt: previousStatus === 'done' ? previousCompletedAt || nowIso : null,
        completedBy: previousStatus === 'done' ? userId || null : null,
        history: [...previousHistory, compensatingTransition],
        serverRevision: (occ as RoutineOccurrenceRecord)?.serverRevision || 1,
        createdAt: (occ as RoutineOccurrenceRecord)?.createdAt || nowIso,
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
      } else if (repository) {
        await repository.upsertRoutineOccurrence(restoredOcc);
      }
    }

    setUndoNotice(null);
  };

  const handleOpenHistory = async (routine: MobileRoutineItem) => {
    setHistoryRoutine(routine);
    if (repository && workspaceId) {
      const routineDate = getCalendarDateInTimezone(currentNow, routine.timezone);
      const past90 = addCalendarDays(routineDate, -90);
      const list = await repository.listRoutineOccurrences(
        workspaceId,
        routine.id,
        past90,
        routineDate
      );
      setHistoryOccurrencesList(list);
    } else {
      setHistoryOccurrencesList(
        occurrences
          .filter((o) => o.routineId === routine.id)
          .map((o) => ({
            id: o.id,
            workspaceId: 'ws-sample',
            routineId: o.routineId,
            scheduledDate: o.scheduledDate,
            scheduleRevision: 1,
            plannedInstant: null,
            timezone: routine.timezone,
            status: o.status,
            completedAt: o.completedAt || null,
            completedBy: null,
            history: [],
            serverRevision: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }))
      );
    }
  };

  // Occurrences for currently selected history routine
  const historyOccurrences = useMemo(() => {
    if (!historyRoutine) return [];
    if (historyOccurrencesList.length > 0) {
      return historyOccurrencesList
        .filter((o) => o.routineId === historyRoutine.id)
        .sort((a, b) => b.scheduledDate.localeCompare(a.scheduledDate));
    }
    return occurrences
      .filter((o) => o.routineId === historyRoutine.id)
      .sort((a, b) => b.scheduledDate.localeCompare(a.scheduledDate));
  }, [historyRoutine, occurrences, historyOccurrencesList]);

  const historyProgress = useMemo(() => {
    return calculateGentleProgress(historyOccurrences);
  }, [historyOccurrences]);

  return (
    <ScrollView
      testID={testID}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
    >
      {/* Date & Restrained Greeting */}
      <View style={styles.greetingHeader}>
        <Text style={[styles.greetingDate, { color: palette.text.secondary }]}>
          Wednesday, October 14
        </Text>
        <Text
          accessibilityRole="header"
          style={[styles.greetingTitle, { color: palette.text.primary }]}
        >
          Good afternoon, Alex
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

      {/* Normal State */}
      {demoState === 'normal' && (
        <>
          {/* Section 1: Daily Routines Checklist */}
          <View style={styles.section} testID="today-routines-section">
            <View style={styles.sectionHeaderRow}>
              <Text style={[styles.sectionTitle, { color: palette.text.primary }]}>
                Today&apos;s Routines ({progress.completedCount}/{routines.length} completed)
              </Text>
            </View>

            {/* Gentle non-punitive encouragement */}
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
              {routines.map((routine) => {
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
              })}
            </MobileCard>
          </View>

          {/* Section 2: Tasks Due Today (Strictly Separate from Routines) */}
          <View style={styles.section} testID="today-tasks-section">
            <View style={styles.sectionHeaderRow}>
              <Text style={[styles.sectionTitle, { color: palette.text.primary }]}>
                Due Today ({tasks.filter((t) => !t.completed).length})
              </Text>
              <Text style={[styles.sectionSubtitle, { color: palette.text.secondary }]}>
                One-off tasks
              </Text>
            </View>

            <MobileCard themeMode={themeMode}>
              {tasks.map((task) => (
                <MobileListRow
                  key={task.id}
                  title={task.title}
                  metadata={task.due}
                  selected={task.completed}
                  themeMode={themeMode}
                  onPress={() => toggleTask(task.id)}
                  accessibilityLabel={`${task.title}, ${task.completed ? 'completed' : 'not completed'}`}
                />
              ))}
            </MobileCard>
          </View>

          {/* Section 3: Next 7 Days Preview linking to Plan */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: palette.text.primary }]}>
              Upcoming 7 Days
            </Text>
            <MobileCard themeMode={themeMode}>
              <Text style={[styles.cardBody, { color: palette.text.secondary }]}>
                3 deadlines scheduled across Thursday and Friday.
              </Text>
              <View style={styles.cardAction}>
                <MobileButton
                  variant="subtle"
                  themeMode={themeMode}
                  onPress={onNavigateToPlan}
                  accessibilityLabel="View full schedule in Plan"
                >
                  View Full Schedule in Plan &rarr;
                </MobileButton>
              </View>
            </MobileCard>
          </View>

          {/* Section 4: Journal Reflection Prompt */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: palette.text.primary }]}>
              Daily Reflection
            </Text>
            <MobileCard themeMode={themeMode}>
              <Text style={[styles.cardPrompt, { color: palette.text.primary }]}>
                What is one thing that brought clarity today?
              </Text>
              <Text style={[styles.cardBody, { color: palette.text.secondary }]}>
                Private entries are stored safely in your protected journal.
              </Text>
              <View style={styles.cardAction}>
                <MobileButton
                  variant="secondary"
                  themeMode={themeMode}
                  onPress={onNavigateToJournal}
                  accessibilityLabel="Write reflection in Journal"
                >
                  ✍️ Write in Journal
                </MobileButton>
              </View>
            </MobileCard>
          </View>
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

            {/* Gentle Progress Stats */}
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
                {historyProgress.message}
              </Text>
              <View style={styles.historyStatsRow}>
                <Text style={[styles.historyStatPill, { color: palette.text.primary }]}>
                  Completed: {historyProgress.completedCount}
                </Text>
                <Text style={[styles.historyStatPill, { color: palette.text.secondary }]}>
                  Skipped: {historyProgress.skippedCount}
                </Text>
              </View>
            </View>

            {/* Past Occurrences List */}
            <Text style={[styles.historyListTitle, { color: palette.text.primary }]}>
              Occurrences & Revisions
            </Text>
            {historyOccurrences.length === 0 ? (
              <Text style={{ color: palette.text.secondary, fontSize: 13, padding: spacing.sm }}>
                No recorded occurrences yet.
              </Text>
            ) : (
              historyOccurrences.map((occ) => (
                <View
                  key={occ.id}
                  testID={`history-occ-${occ.scheduledDate}`}
                  style={[
                    styles.historyItemRow,
                    {
                      borderBottomColor: palette.border.subtle,
                    },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.historyItemDate, { color: palette.text.primary }]}>
                      {occ.scheduledDate === todayDate
                        ? 'Today'
                        : occ.scheduledDate === DEFAULT_YESTERDAY
                          ? 'Yesterday'
                          : occ.scheduledDate}
                    </Text>
                    {occ.completedAt && (
                      <Text
                        style={[styles.historyItemTimestamp, { color: palette.text.secondary }]}
                      >
                        Completed at {new Date(occ.completedAt).toLocaleTimeString()}
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
    minHeight: 200,
  },
  loadingText: {
    marginTop: spacing.md,
    fontSize: 14,
  },
  errorContainer: {
    marginVertical: spacing.md,
  },
  section: {
    marginBottom: spacing.lg,
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
  },
  sectionSubtitle: {
    fontSize: 12,
    fontWeight: '500',
  },
  gentleProgressBanner: {
    padding: spacing.sm,
    borderRadius: radii.card,
    borderWidth: 1,
    marginBottom: spacing.sm,
  },
  gentleProgressText: {
    fontSize: 12,
    fontWeight: '500',
  },
  cardPrompt: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  cardBody: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: spacing.sm,
  },
  cardAction: {
    marginTop: spacing.xs,
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  undoToastText: {
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  undoToastButton: {
    minHeight: touchTargets.mobileMin,
    minWidth: touchTargets.mobileMin,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  undoToastButtonText: {
    fontSize: 13,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  historyContainer: {
    paddingVertical: spacing.sm,
  },
  historySubtitle: {
    fontSize: 13,
    marginBottom: spacing.md,
  },
  historyStatsCard: {
    padding: spacing.md,
    borderRadius: radii.card,
    borderWidth: 1,
    marginBottom: spacing.md,
  },
  historyStatsTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  historyStatsMessage: {
    fontSize: 12,
    lineHeight: 16,
    marginBottom: spacing.xs,
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
