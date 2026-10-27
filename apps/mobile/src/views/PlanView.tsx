import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, radii, spacing, touchTargets, type ThemeMode } from '@daynori/design-tokens';
import {
  Icon,
  IconText,
  MobileCard,
  MobileListRow,
  MobileModalSheet,
  MobileButton,
  MobileTextField,
  MobileEmptyState,
  MobileFeedback,
} from '@daynori/ui-mobile';
import type { PlanSubView } from '../navigation/types';
import type {
  LocalRepositoryPort,
  SyncEngine,
  TaskRecord,
  CalendarEventRecord,
  RoutineRecord,
  RoutineOccurrenceRecord,
  JournalEntryRecord,
  PendingMutationRecord,
  ItemHeaderRecord,
} from '@daynori/sync';
import {
  isTaskOverdue,
  isTaskDueToday,
  compareTasksUpcoming,
  formatTaskDeadlineExplanation,
  getCalendarDateInTimezone,
  addCalendarDays,
  getCalendarDateTimeParts,
  checkLocalTimeDisambiguation,
  isValidCalendarDateString,
  buildMonthGrid,
  getItemsForDate,
  buildCalendarReadModel,
  validateCalendarEventTitle,
  validateCalendarEventInterval,
  generateUuid,
  explainWhyDueToday,
  isRoutineScheduledOnDate,
  computeDeterministicOccurrenceId,
  type TaskPriority,
  type TaskStatus,
  type TaskDeadline,
  type CalendarItem,
  type RoutineOccurrenceStatus,
  type RoutineOccurrenceTransition,
  type Weekday,
} from '@daynori/domain';

function formatRoutineSchedule(
  routine: Pick<RoutineRecord, 'frequency' | 'weekdays' | 'scheduledTime'>
): string {
  const timeSuffix = routine.scheduledTime ? ` at ${routine.scheduledTime}` : '';
  if (routine.frequency === 'daily') {
    return `Repeats every day${timeSuffix}`;
  }
  if (
    routine.weekdays.length === 5 &&
    [1, 2, 3, 4, 5].every((d) => routine.weekdays.includes(d as Weekday))
  ) {
    return `Repeats weekdays (Mon–Fri)${timeSuffix}`;
  }
  const dayNames = routine.weekdays
    .map((d) => ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][d - 1])
    .join(', ');
  return `Repeats on ${dayNames}${timeSuffix}`;
}

function resolveLocalTimeToUtc(dateStr: string, timeStr: string, timezone: string): string {
  const result = checkLocalTimeDisambiguation(dateStr, timeStr, timezone);
  if (result.type === 'exact') return result.utcTimestamp;
  if (result.type === 'nonexistent') {
    return result.suggestedUtcTimestamp || new Date(`${dateStr}T${timeStr}:00.000Z`).toISOString();
  }
  return result.earlierUtcTimestamp;
}

export type MobileTaskFilter = 'all' | 'today' | 'upcoming' | 'overdue' | 'completed' | 'undated';

export interface PlanViewProps {
  themeMode: ThemeMode;
  initialSubView?: PlanSubView;
  onSubViewChange?: (subView: PlanSubView) => void;
  testID?: string;
  initialTasks?: TaskRecord[];
  initialEvents?: CalendarEventRecord[];
  /** Explicit demo/test fixture only — never used as a production empty-state fallback. */
  initialRoutines?: RoutineRecord[];
  workspaceId?: string | null;
  userId?: string | null;
  repository?: LocalRepositoryPort;
  syncEngine?: SyncEngine;
  isOnline?: boolean;
  userTimezone?: string;
  isDemo?: boolean;
  targetTaskId?: string | null;
  onClearTarget?: () => void;
  /** Phase 80: correlated tour evidence from normal Plan commands (complete/undo/save). */
  onTourTaskMutation?: (info: {
    command: 'createTask' | 'updateTask' | 'completeTask' | 'reopenTask' | 'trashTask';
    entityId: string;
    operationId: string;
  }) => void;
}

export const SAMPLE_MOBILE_TASKS: TaskRecord[] = [
  {
    id: 't1',
    workspaceId: 'ws-sample',
    folderId: null,
    title: 'Review quarterly architecture plan',
    details: 'Verify platform adapter boundaries and sync invariant compliance',
    priority: 'high',
    status: 'todo',
    deadline: {
      type: 'timed',
      timestamp: new Date(Date.now() + 4 * 3600 * 1000).toISOString(),
      timezone: 'UTC',
    },
    completedAt: null,
    reopenedAt: null,
    completionHistory: [],
    parentId: null,
    subtaskOrder: 0,
    tags: ['Architecture'],
    serverRevision: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
  },
  {
    id: 't2',
    workspaceId: 'ws-sample',
    folderId: null,
    title: 'Update Android platform documentation',
    details: 'Document hardware KeyStore gates and TalkBack verification limits',
    priority: 'normal',
    status: 'todo',
    deadline: {
      type: 'date',
      date: new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10),
    },
    completedAt: null,
    reopenedAt: null,
    completionHistory: [],
    parentId: null,
    subtaskOrder: 0,
    tags: ['Docs'],
    serverRevision: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
  },
  {
    id: 't3',
    workspaceId: 'ws-sample',
    folderId: null,
    title: 'Prepare design system token audit',
    details: 'Audit contrast and minimum touch target dimensions across screens',
    priority: 'high',
    status: 'todo',
    deadline: {
      type: 'date',
      date: new Date(Date.now() - 48 * 3600 * 1000).toISOString().slice(0, 10),
    },
    completedAt: null,
    reopenedAt: null,
    completionHistory: [],
    parentId: null,
    subtaskOrder: 0,
    tags: ['Design'],
    serverRevision: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
  },
];

export function getItemTitle(item: CalendarItem): string {
  if (item.sourceType === 'routine_occurrence') return item.routineTitle;
  return item.title;
}

export const SAMPLE_MOBILE_EVENTS: CalendarEventRecord[] = [
  {
    id: 'e1',
    workspaceId: 'ws-sample',
    folderId: null,
    title: 'Engineering Handoff Review',
    details: 'Verify platform adapter boundaries and sync invariant compliance',
    allDay: false,
    startDate: null,
    endDate: null,
    startAt: new Date(Date.now() + 2 * 3600 * 1000).toISOString(),
    endAt: new Date(Date.now() + 3 * 3600 * 1000).toISOString(),
    timezone: 'UTC',
    isArchived: false,
    securityScope: 'standard',
    serverRevision: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
  },
  {
    id: 'e2',
    workspaceId: 'ws-sample',
    folderId: null,
    title: 'Accessible Primitives Walkthrough',
    details: 'Walkthrough mobile touch targets and accessibility announcements',
    allDay: false,
    startDate: null,
    endDate: null,
    startAt: new Date(Date.now() + 5 * 3600 * 1000).toISOString(),
    endAt: new Date(Date.now() + 6 * 3600 * 1000).toISOString(),
    timezone: 'UTC',
    isArchived: false,
    securityScope: 'standard',
    serverRevision: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
  },
];

/** Demo/test fixtures only — never injected into an empty production repository. */
export const SAMPLE_MOBILE_ROUTINES: RoutineRecord[] = [
  {
    id: 'r1',
    workspaceId: 'ws-sample',
    folderId: null,
    title: 'Morning deep work session',
    details: null,
    frequency: 'weekdays',
    weekdays: [1, 2, 3, 4, 5],
    timezone: 'UTC',
    scheduledTime: '09:00',
    activeFrom: '2020-01-01',
    activeTo: null,
    isPaused: false,
    isArchived: false,
    isPinned: false,
    scheduleRevision: 1,
    effectiveDate: '2020-01-01',
    serverRevision: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
  },
  {
    id: 'r2',
    workspaceId: 'ws-sample',
    folderId: null,
    title: 'Standup and priority check',
    details: null,
    frequency: 'daily',
    weekdays: [],
    timezone: 'UTC',
    scheduledTime: '10:00',
    activeFrom: '2020-01-01',
    activeTo: null,
    isPaused: false,
    isArchived: false,
    isPinned: false,
    scheduleRevision: 1,
    effectiveDate: '2020-01-01',
    serverRevision: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
  },
  {
    id: 'r3',
    workspaceId: 'ws-sample',
    folderId: null,
    title: 'Evening reflection & summary',
    details: null,
    frequency: 'daily',
    weekdays: [],
    timezone: 'UTC',
    scheduledTime: '17:30',
    activeFrom: '2020-01-01',
    activeTo: null,
    isPaused: false,
    isArchived: false,
    isPinned: false,
    scheduleRevision: 1,
    effectiveDate: '2020-01-01',
    serverRevision: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
  },
];

export const PlanView: React.FC<PlanViewProps> = ({
  themeMode,
  initialSubView = 'tasks',
  onSubViewChange,
  testID = 'plan-view',
  initialTasks,
  initialEvents,
  initialRoutines,
  workspaceId,
  userId,
  repository,
  syncEngine,
  isOnline: _isOnline = true,
  userTimezone = 'UTC',
  isDemo,
  targetTaskId,
  onClearTarget,
  onTourTaskMutation,
}) => {
  const palette = colors[themeMode];
  const [activeSubView, setActiveSubView] = useState<PlanSubView>(initialSubView);
  const [taskFilter, setTaskFilter] = useState<MobileTaskFilter>('all');

  // Handle arrival navigation from search
  useEffect(() => {
    if (targetTaskId) {
      setActiveSubView('tasks');
      setTaskFilter('all');
      onClearTarget?.();
    }
  }, [targetTaskId, onClearTarget]);

  // Confine synthetic sample fixtures to explicit demo/test environments
  const isDemoOrTest =
    isDemo ||
    Boolean(initialTasks) ||
    Boolean(initialEvents) ||
    Boolean(initialRoutines) ||
    (typeof process !== 'undefined' && process.env.NODE_ENV === 'test' && !repository);

  // Tasks state
  const [tasks, setTasks] = useState<TaskRecord[]>(() => {
    if (initialTasks) return initialTasks;
    if (isDemoOrTest) return SAMPLE_MOBILE_TASKS;
    return [];
  });

  // Calendar & Projection State
  const [personalEvents, setPersonalEvents] = useState<CalendarEventRecord[]>(() => {
    if (initialEvents) return initialEvents;
    if (isDemoOrTest) return SAMPLE_MOBILE_EVENTS;
    return [];
  });
  const [routineRecords, setRoutineRecords] = useState<RoutineRecord[]>(() => {
    if (initialRoutines) return initialRoutines;
    if (isDemoOrTest) return SAMPLE_MOBILE_ROUTINES;
    return [];
  });
  const [routineOccurrences, setRoutineOccurrences] = useState<RoutineOccurrenceRecord[]>([]);
  const [journalEntries, setJournalEntries] = useState<JournalEntryRecord[]>([]);
  const [routinesLoading, setRoutinesLoading] = useState(Boolean(repository && workspaceId));
  const [routinesLoadError, setRoutinesLoadError] = useState<string | null>(null);
  const [editingRoutine, setEditingRoutine] = useState<RoutineRecord | null>(null);
  const [routineActionError, setRoutineActionError] = useState<string | null>(null);
  const loadGenerationRef = useRef(0);
  const activeNamespaceRef = useRef(`${workspaceId ?? ''}:${userId ?? ''}`);

  const [calendarViewMode, setCalendarViewMode] = useState<'agenda' | 'day' | 'month'>('agenda');
  const [calendarSelectedDate, setCalendarSelectedDate] = useState(() =>
    getCalendarDateInTimezone(new Date(), userTimezone)
  );
  const [calendarMonthDate, setCalendarMonthDate] = useState(() => new Date());
  const [weekStartPreference, setWeekStartPreference] = useState<1 | 6 | 7>(1); // 1 = Mon, 7 = Sun, 6 = Sat
  const [filterIncludeTasks, setFilterIncludeTasks] = useState(true);
  const [filterIncludeRoutines, setFilterIncludeRoutines] = useState(true);
  const [filterIncludeEvents, setFilterIncludeEvents] = useState(true);

  // Add Calendar Event Sheet State
  const [isEventSheetOpen, setIsEventSheetOpen] = useState(false);
  const [eventSheetTitle, setEventSheetTitle] = useState('');
  const [eventSheetDescription, setEventSheetDescription] = useState('');
  const [eventSheetLocation, setEventSheetLocation] = useState('');
  const [eventSheetAllDay, setEventSheetAllDay] = useState(true);
  const [eventSheetStartDate, setEventSheetStartDate] = useState(calendarSelectedDate);
  const [eventSheetEndDate, setEventSheetEndDate] = useState(() =>
    addCalendarDays(calendarSelectedDate, 1)
  );
  const [eventSheetStartAtTime, setEventSheetStartAtTime] = useState('09:00');
  const [eventSheetEndAtTime, setEventSheetEndAtTime] = useState('10:00');
  const [eventSheetError, setEventSheetError] = useState<string | null>(null);

  // Quick Capture State
  const [quickTitle, setQuickTitle] = useState('');
  const [quickDeadlinePreset, setQuickDeadlinePreset] = useState<'none' | 'today' | 'tomorrow'>(
    'today'
  );
  const [quickPriority] = useState<TaskPriority>('normal');

  // Task Detail Sheet State
  const [editingTask, setEditingTask] = useState<TaskRecord | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDetails, setEditDetails] = useState('');
  const [editPriority, setEditPriority] = useState<TaskPriority>('normal');
  const [editStatus, setEditStatus] = useState<TaskStatus>('todo');
  const [editDeadlineType, setEditDeadlineType] = useState<'none' | 'date' | 'timed'>('none');
  const [editDeadlineDate, setEditDeadlineDate] = useState('');
  const [editDeadlineTime, setEditDeadlineTime] = useState('12:00');
  const [editError, setEditError] = useState<string | null>(null);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [taskDetailsExpanded, setTaskDetailsExpanded] = useState(false);

  // Undo Toast state
  const [undoToast, setUndoToast] = useState<{
    taskId: string;
    taskTitle: string;
    previousStatus: TaskStatus;
    previousCompletedAt: string | null;
    previousReopenedAt: string | null;
    previousHistory: TaskRecord['completionHistory'];
    previousRevision: number;
    expiresAt: number;
  } | null>(null);

  const setSubView = (subView: PlanSubView) => {
    setActiveSubView(subView);
    if (onSubViewChange) onSubViewChange(subView);
  };

  // Account/workspace boundary: clear obsolete display state without wiping drafts/records
  useEffect(() => {
    const key = `${workspaceId ?? ''}:${userId ?? ''}`;
    if (activeNamespaceRef.current === key) return;
    activeNamespaceRef.current = key;
    loadGenerationRef.current += 1;
    setEditingRoutine(null);
    setRoutineActionError(null);
    setRoutinesLoadError(null);
    setUndoToast(null);
    if (!repository || !workspaceId) {
      setRoutinesLoading(false);
      if (!isDemoOrTest) {
        setTasks(initialTasks ?? []);
        setPersonalEvents(initialEvents ?? []);
        setRoutineRecords(initialRoutines ?? []);
        setRoutineOccurrences([]);
        setJournalEntries([]);
      }
      return;
    }
    setRoutinesLoading(true);
    setTasks([]);
    setPersonalEvents([]);
    setRoutineRecords([]);
    setRoutineOccurrences([]);
    setJournalEntries([]);
  }, [
    workspaceId,
    userId,
    repository,
    isDemoOrTest,
    initialTasks,
    initialEvents,
    initialRoutines,
  ]);

  // Subscribe to production repository and sync engine (including local saves)
  useEffect(() => {
    if (!repository || !workspaceId) {
      setRoutinesLoading(false);
      return;
    }
    let isCancelled = false;
    const generation = ++loadGenerationRef.current;

    const reloadData = async () => {
      setRoutinesLoading(true);
      setRoutinesLoadError(null);
      try {
        const [loadedTasks, loadedEvents, loadedRoutines, loadedOccurrences, loadedJournals] =
          await Promise.all([
            repository.listTasks(workspaceId),
            repository.listCalendarEvents(workspaceId),
            repository.listRoutines(workspaceId),
            repository.listRoutineOccurrences(workspaceId),
            repository.listJournalEntries(workspaceId),
          ]);
        if (isCancelled || loadGenerationRef.current !== generation) return;
        setTasks(loadedTasks.filter((t) => t.deletedAt === null));
        setPersonalEvents(loadedEvents.filter((e) => e.deletedAt === null));
        setRoutineRecords(loadedRoutines.filter((r) => r.deletedAt === null));
        setRoutineOccurrences(loadedOccurrences);
        setJournalEntries(loadedJournals.filter((j) => j.deletedAt === null));
        setRoutinesLoadError(null);
      } catch (err) {
        if (isCancelled || loadGenerationRef.current !== generation) return;
        setRoutinesLoadError(
          err instanceof Error ? err.message : 'Failed to load Plan records.'
        );
      } finally {
        if (!isCancelled && loadGenerationRef.current === generation) {
          setRoutinesLoading(false);
        }
      }
    };

    void reloadData();

    if (syncEngine) {
      const unsub = syncEngine.onEvent((evt) => {
        if (isCancelled) return;
        if (
          evt.type === 'sync_completed' ||
          evt.type === 'conflict_resolved' ||
          evt.type === 'local_mutation_committed'
        ) {
          if (
            evt.type === 'local_mutation_committed' &&
            evt.workspaceId !== workspaceId
          ) {
            return;
          }
          void reloadData();
        }
      });
      return () => {
        isCancelled = true;
        unsub?.();
      };
    }

    return () => {
      isCancelled = true;
    };
  }, [repository, workspaceId, syncEngine]);

  // Undo timer
  useEffect(() => {
    if (!undoToast) return;
    const interval = setInterval(() => {
      if (Date.now() >= undoToast.expiresAt) {
        setUndoToast(null);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [undoToast]);

  const visibleRoutines = useMemo(
    () => routineRecords.filter((r) => !r.isArchived && r.deletedAt === null),
    [routineRecords]
  );

  // Transactional persistence helper for personal calendar events
  const persistEventChange = async (
    action: 'create' | 'update' | 'delete',
    command: 'createCalendarEvent' | 'updateCalendarEvent' | 'deleteCalendarEvent',
    event: CalendarEventRecord,
    payload: Record<string, unknown>
  ): Promise<boolean> => {
    const activeWorkspace = workspaceId || (isDemoOrTest ? 'ws-sample' : null);
    const activeUser = userId || (isDemoOrTest ? 'usr-sample' : null);

    if (!activeWorkspace || !activeUser) return false;

    const nowIso = new Date().toISOString();
    const itemHeader: ItemHeaderRecord = {
      id: event.id,
      workspaceId: activeWorkspace,
      folderId: event.folderId,
      name: event.title,
      kind: 'calendar_event',
      rank: '00001000',
      securityScope: 'standard',
      isArchived: false,
      isPinned: false,
      serverRevision: event.serverRevision,
      createdAt: event.createdAt,
      updatedAt: event.updatedAt,
      deletedAt: event.deletedAt,
    };

    if (syncEngine) {
      try {
        await syncEngine.saveItem(itemHeader, undefined, command, { payload });
        return true;
      } catch {
        return false;
      }
    } else if (repository) {
      try {
        const mutation: PendingMutationRecord = {
          operationId: generateUuid(),
          deviceId: 'mobile-local',
          workspaceId: activeWorkspace,
          userId: activeUser,
          entityType: 'calendar_event',
          entityId: event.id,
          action,
          command,
          baseRevision: event.serverRevision,
          payload,
          dependencyOperationIds: [],
          clientTimestamp: nowIso,
          retryCount: 0,
          status: 'pending',
          lastError: null,
        };
        await repository.saveItemTransaction(
          itemHeader,
          mutation,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          event
        );
        return true;
      } catch {
        return false;
      }
    }

    return true; // memory fallback for standalone test rendering
  };

  const handleSaveEvent = async () => {
    setEventSheetError(null);
    let trimmedTitle = '';
    const startAtIso = !eventSheetAllDay
      ? resolveLocalTimeToUtc(eventSheetStartDate, eventSheetStartAtTime, userTimezone)
      : null;
    const endAtIso = !eventSheetAllDay
      ? resolveLocalTimeToUtc(eventSheetStartDate, eventSheetEndAtTime, userTimezone)
      : null;

    try {
      trimmedTitle = validateCalendarEventTitle(eventSheetTitle);
      validateCalendarEventInterval({
        title: trimmedTitle,
        allDay: eventSheetAllDay,
        startDate: eventSheetAllDay ? eventSheetStartDate : null,
        endDate: eventSheetAllDay ? eventSheetEndDate : null,
        startAt: startAtIso,
        endAt: endAtIso,
        timezone: userTimezone,
      });
    } catch (err: unknown) {
      setEventSheetError(err instanceof Error ? err.message : String(err));
      return;
    }

    const activeWorkspace = workspaceId || (isDemoOrTest ? 'ws-sample' : null);
    const newId = generateUuid();
    const nowIso = new Date().toISOString();

    const newEvent: CalendarEventRecord = {
      id: newId,
      workspaceId: activeWorkspace || 'ws-sample',
      folderId: null,
      title: trimmedTitle,
      details: eventSheetDescription.trim() || null,
      allDay: eventSheetAllDay,
      startDate: eventSheetAllDay ? eventSheetStartDate : null,
      endDate: eventSheetAllDay ? eventSheetEndDate : null,
      startAt: startAtIso,
      endAt: endAtIso,
      timezone: userTimezone,
      isArchived: false,
      securityScope: 'standard',
      serverRevision: 0,
      createdAt: nowIso,
      updatedAt: nowIso,
      deletedAt: null,
    };

    const success = await persistEventChange('create', 'createCalendarEvent', newEvent, {
      ...newEvent,
    });

    if (success) {
      setPersonalEvents((prev) => [newEvent, ...prev]);
      setIsEventSheetOpen(false);
      setEventSheetTitle('');
      setEventSheetDescription('');
      setEventSheetLocation('');
    } else {
      setEventSheetError('Failed to persist calendar event.');
    }
  };

  // Build unified calendar projection read model
  const calendarReadModel = useMemo(() => {
    const y = calendarMonthDate.getFullYear();
    const m = calendarMonthDate.getMonth() + 1;
    const startRange = new Date(y, m - 2, 1).toISOString().slice(0, 10);
    const endRange = new Date(y, m + 1, 0).toISOString().slice(0, 10);

    // Group journal entries by entryDate (privacy: entry count only)
    const journalCounts = new Map<string, number>();
    for (const j of journalEntries) {
      if (j.entryDate) {
        journalCounts.set(j.entryDate, (journalCounts.get(j.entryDate) || 0) + 1);
      }
    }
    const journalDates = Array.from(journalCounts.entries()).map(([date, count]) => ({
      date,
      count,
    }));

    return buildCalendarReadModel({
      startDate: startRange,
      endDate: endRange,
      timezone: userTimezone,
      tasks: filterIncludeTasks ? tasks : [],
      // Never invent sample routines for an empty authorized workspace.
      routines: filterIncludeRoutines
        ? visibleRoutines.map((r) => ({
            id: r.id,
            title: r.title,
            timezone: r.timezone || userTimezone,
          }))
        : [],
      routineOccurrences: filterIncludeRoutines ? routineOccurrences : [],
      events: filterIncludeEvents
        ? personalEvents.map((e) => ({
            id: e.id,
            workspaceId: e.workspaceId,
            folderId: e.folderId,
            title: e.title,
            details: e.details,
            allDay: e.allDay,
            startDate: e.startDate,
            endDate: e.endDate,
            startAt: e.startAt,
            endAt: e.endAt,
            timezone: e.timezone,
            isArchived: e.isArchived,
            securityScope: e.securityScope,
            revision: e.serverRevision,
            createdAt: e.createdAt,
            updatedAt: e.updatedAt,
            deletedAt: e.deletedAt,
          }))
        : [],
      journalDates,
    });
  }, [
    calendarMonthDate,
    userTimezone,
    filterIncludeTasks,
    tasks,
    filterIncludeRoutines,
    visibleRoutines,
    routineOccurrences,
    filterIncludeEvents,
    personalEvents,
    journalEntries,
  ]);

  const getTodayOccurrenceForRoutine = useCallback(
    (routine: RoutineRecord): RoutineOccurrenceRecord | null => {
      const today = getCalendarDateInTimezone(new Date(), routine.timezone || userTimezone);
      return (
        routineOccurrences.find(
          (o) =>
            o.routineId === routine.id &&
            o.scheduledDate === today &&
            o.status !== 'cancelled'
        ) || null
      );
    },
    [routineOccurrences, userTimezone]
  );

  const handleOpenRoutineDetail = (routine: RoutineRecord) => {
    setEditingRoutine(routine);
    setRoutineActionError(null);
  };

  const persistOccurrenceChange = async (
    occ: RoutineOccurrenceRecord,
    command: 'completeOccurrence' | 'reopenOccurrence'
  ): Promise<boolean> => {
    try {
      if (syncEngine) {
        await syncEngine.saveRoutineOccurrence(occ, command);
        return true;
      }
      if (repository) {
        await repository.upsertRoutineOccurrence(occ);
        return true;
      }
      // Demo/test path: update local state only
      setRoutineOccurrences((prev) => {
        const idx = prev.findIndex((o) => o.id === occ.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = occ;
          return next;
        }
        return [...prev, occ];
      });
      return true;
    } catch (err) {
      setRoutineActionError(
        err instanceof Error ? err.message : 'Failed to update routine occurrence.'
      );
      return false;
    }
  };

  const handleCompleteRoutineOccurrence = async (routine: RoutineRecord) => {
    const activeWorkspace = workspaceId || (isDemoOrTest ? 'ws-sample' : null);
    if (!activeWorkspace) {
      setRoutineActionError('Workspace is required to complete a routine.');
      return;
    }
    const today = getCalendarDateInTimezone(new Date(), routine.timezone || userTimezone);
    if (!isRoutineScheduledOnDate(routine, today)) {
      setRoutineActionError('This routine is not scheduled for today.');
      return;
    }
    const existing = getTodayOccurrenceForRoutine(routine);
    const nowIso = new Date().toISOString();
    const prevStatus: RoutineOccurrenceStatus = existing?.status || 'pending';
    const prevHistory = existing?.history || [];
    const occId =
      existing?.id ||
      computeDeterministicOccurrenceId(activeWorkspace, routine.id, today);
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
    const occ: RoutineOccurrenceRecord = {
      id: occId,
      workspaceId: activeWorkspace,
      routineId: routine.id,
      scheduledDate: today,
      scheduleRevision: routine.scheduleRevision,
      plannedInstant: existing?.plannedInstant ?? null,
      timezone: routine.timezone || userTimezone,
      status: 'done',
      completedAt: nowIso,
      completedBy: userId || null,
      history: updatedHistory,
      serverRevision: (existing?.serverRevision || 0) + 1,
      createdAt: existing?.createdAt || nowIso,
      updatedAt: nowIso,
    };
    const ok = await persistOccurrenceChange(occ, 'completeOccurrence');
    if (ok) {
      setRoutineOccurrences((prev) => {
        const idx = prev.findIndex((o) => o.id === occ.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = occ;
          return next;
        }
        return [...prev, occ];
      });
    }
  };

  const handleUndoRoutineOccurrence = async (routine: RoutineRecord) => {
    const existing = getTodayOccurrenceForRoutine(routine);
    if (!existing || existing.status !== 'done') return;
    const activeWorkspace = workspaceId || existing.workspaceId;
    const nowIso = new Date().toISOString();
    const updatedHistory: RoutineOccurrenceTransition[] = [
      ...existing.history,
      {
        fromStatus: existing.status,
        toStatus: 'pending',
        status: 'pending',
        previousStatus: existing.status,
        changedAt: nowIso,
        transitionedAt: nowIso,
        actorId: userId || null,
        reason: 'Mobile user undid occurrence completion',
      },
    ];
    const occ: RoutineOccurrenceRecord = {
      ...existing,
      workspaceId: activeWorkspace,
      status: 'pending',
      completedAt: null,
      completedBy: null,
      history: updatedHistory,
      serverRevision: existing.serverRevision + 1,
      updatedAt: nowIso,
    };
    const ok = await persistOccurrenceChange(occ, 'reopenOccurrence');
    if (ok) {
      setRoutineOccurrences((prev) => prev.map((o) => (o.id === occ.id ? occ : o)));
    }
  };

  // Filter tasks
  const filteredTasks = useMemo(() => {
    const now = new Date();
    return tasks
      .filter((t) => {
        // Subtasks: parent view only shows top level
        if (t.parentId) return false;

        switch (taskFilter) {
          case 'today':
            if (t.status === 'completed' || t.status === 'cancelled') return false;
            return isTaskDueToday(t, now, userTimezone) || isTaskOverdue(t, now, userTimezone);
          case 'upcoming':
            if (t.status === 'completed' || t.status === 'cancelled') return false;
            if (t.deadline.type === 'none') return false;
            return !isTaskOverdue(t, now, userTimezone) && !isTaskDueToday(t, now, userTimezone);
          case 'overdue':
            if (t.status === 'completed' || t.status === 'cancelled') return false;
            return isTaskOverdue(t, now, userTimezone);
          case 'completed':
            return t.status === 'completed';
          case 'undated':
            if (t.status === 'completed' || t.status === 'cancelled') return false;
            return t.deadline.type === 'none';
          case 'all':
          default:
            return true;
        }
      })
      .sort((a, b) => compareTasksUpcoming(a, b, userTimezone));
  }, [tasks, taskFilter, userTimezone]);

  // Subtasks for parent
  const getSubtasks = useCallback(
    (parentId: string) => {
      return tasks.filter((t) => t.parentId === parentId && t.deletedAt === null);
    },
    [tasks]
  );

  // Atomic transactional persistence helper
  const persistTaskChange = async (
    action: 'create' | 'update' | 'delete',
    command: 'createTask' | 'updateTask' | 'completeTask' | 'reopenTask' | 'trashTask',
    task: TaskRecord,
    payload: Record<string, unknown>
  ): Promise<boolean> => {
    const activeWorkspace = workspaceId || (isDemoOrTest ? 'ws-sample' : null);
    const activeUser = userId || (isDemoOrTest ? 'usr-sample' : null);

    if (!activeWorkspace || !activeUser) return false;

    const nowIso = new Date().toISOString();
    const itemHeader: ItemHeaderRecord = {
      id: task.id,
      workspaceId: activeWorkspace,
      folderId: task.folderId,
      name: task.title,
      kind: 'task',
      rank: '00001000',
      securityScope: 'standard',
      isArchived: false,
      isPinned: false,
      serverRevision: task.serverRevision,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      deletedAt: task.deletedAt,
    };

    if (syncEngine) {
      try {
        const mutation = await syncEngine.saveItem(itemHeader, undefined, command, { payload });
        onTourTaskMutation?.({
          command,
          entityId: task.id,
          operationId: mutation.operationId,
        });
        return true;
      } catch {
        return false;
      }
    } else if (repository) {
      try {
        const mutation: PendingMutationRecord = {
          operationId: generateUuid(),
          deviceId: 'mobile-local',
          workspaceId: activeWorkspace,
          userId: activeUser,
          entityType: 'task',
          entityId: task.id,
          action,
          command,
          baseRevision: task.serverRevision,
          payload,
          dependencyOperationIds: [],
          clientTimestamp: nowIso,
          retryCount: 0,
          status: 'pending',
          lastError: null,
        };
        await repository.saveItemTransaction(itemHeader, mutation, undefined, undefined, task);
        onTourTaskMutation?.({
          command,
          entityId: task.id,
          operationId: mutation.operationId,
        });
        return true;
      } catch {
        return false;
      }
    }

    // memory fallback for standalone test rendering
    onTourTaskMutation?.({
      command,
      entityId: task.id,
      operationId: generateUuid(),
    });
    return true;
  };

  // Quick Add Task with timezone-aware calendar dates
  const handleQuickAdd = async () => {
    const trimmed = quickTitle.trim();
    if (!trimmed) return;

    const activeWorkspace = workspaceId || (isDemoOrTest ? 'ws-sample' : null);
    if (!activeWorkspace && !isDemoOrTest) return;

    let deadline: TaskDeadline = { type: 'none' };
    const now = new Date();
    const todayDateStr = getCalendarDateInTimezone(now, userTimezone);
    if (quickDeadlinePreset === 'today') {
      deadline = { type: 'date', date: todayDateStr };
    } else if (quickDeadlinePreset === 'tomorrow') {
      const tomorrowDateStr = addCalendarDays(todayDateStr, 1);
      deadline = { type: 'date', date: tomorrowDateStr };
    }

    const newId = generateUuid();
    const nowIso = now.toISOString();

    const newTask: TaskRecord = {
      id: newId,
      workspaceId: activeWorkspace || 'ws-sample',
      folderId: null,
      title: trimmed,
      details: null,
      priority: quickPriority,
      status: 'todo',
      deadline,
      completedAt: null,
      reopenedAt: null,
      completionHistory: [],
      parentId: null,
      subtaskOrder: 0,
      tags: [],
      serverRevision: 1,
      createdAt: nowIso,
      updatedAt: nowIso,
      deletedAt: null,
    };

    if (!repository && !syncEngine) {
      setTasks((prev) => [newTask, ...prev]);
      setQuickTitle('');
      return;
    }

    const mutationPayload = { title: trimmed, priority: quickPriority, deadline };
    const ok = await persistTaskChange('create', 'createTask', newTask, mutationPayload);
    if (ok) {
      setTasks((prev) => [newTask, ...prev]);
      setQuickTitle('');
    }
  };

  // Toggle Complete / Reopen
  const handleToggleComplete = async (task: TaskRecord) => {
    const isCompleting = task.status !== 'completed';
    const nowIso = new Date().toISOString();
    const newStatus: TaskStatus = isCompleting ? 'completed' : 'todo';

    const previousHistory = [...task.completionHistory];
    const previousCompletedAt = task.completedAt;
    const previousReopenedAt = task.reopenedAt;
    const previousStatus = task.status;
    const previousRevision = task.serverRevision;

    const updated: TaskRecord = {
      ...task,
      status: newStatus,
      completedAt: isCompleting ? nowIso : null,
      reopenedAt: !isCompleting ? nowIso : (task.reopenedAt ?? null),
      completionHistory: isCompleting
        ? [...task.completionHistory, { completedAt: nowIso }]
        : [
            ...task.completionHistory,
            { completedAt: task.completedAt || nowIso, reopenedAt: nowIso },
          ],
      serverRevision: task.serverRevision + 1,
      updatedAt: nowIso,
    };

    if (!repository && !syncEngine) {
      setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)));
      if (isCompleting) {
        setUndoToast({
          taskId: task.id,
          taskTitle: task.title,
          previousStatus,
          previousCompletedAt,
          previousReopenedAt,
          previousHistory,
          previousRevision,
          expiresAt: Date.now() + 5000,
        });
      }
      return;
    }

    const ok = await persistTaskChange(
      'update',
      isCompleting ? 'completeTask' : 'reopenTask',
      updated,
      { status: newStatus, completedAt: updated.completedAt, reopenedAt: updated.reopenedAt }
    );

    if (ok) {
      setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)));

      if (isCompleting) {
        setUndoToast({
          taskId: task.id,
          taskTitle: task.title,
          previousStatus,
          previousCompletedAt,
          previousReopenedAt,
          previousHistory,
          previousRevision,
          expiresAt: Date.now() + 5000,
        });
      }
    }
  };

  // Revision-protected Undo without fabricating extra history
  const handleUndo = async () => {
    if (!undoToast) return;
    const {
      taskId,
      previousStatus,
      previousCompletedAt,
      previousReopenedAt,
      previousHistory,
      previousRevision,
    } = undoToast;
    setUndoToast(null);

    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    const nowIso = new Date().toISOString();
    const restored: TaskRecord = {
      ...task,
      status: previousStatus,
      completedAt: previousCompletedAt,
      reopenedAt: previousReopenedAt,
      completionHistory: previousHistory,
      serverRevision: task.serverRevision + 1,
      updatedAt: nowIso,
    };

    if (!repository && !syncEngine) {
      setTasks((prev) => prev.map((t) => (t.id === taskId ? restored : t)));
      return;
    }

    const ok = await persistTaskChange('update', 'reopenTask', restored, {
      status: previousStatus,
      completedAt: previousCompletedAt,
      reopenedAt: previousReopenedAt,
      baseRevision: previousRevision,
    });

    if (ok) {
      setTasks((prev) => prev.map((t) => (t.id === taskId ? restored : t)));
    }
  };

  // Open Detail Sheet
  const handleOpenDetail = (task: TaskRecord) => {
    setEditingTask(task);
    setEditTitle(task.title);
    setEditDetails(task.details || '');
    setEditPriority(task.priority);
    setEditStatus(task.status);
    setEditDeadlineType(task.deadline.type);
    if (task.deadline.type === 'date') {
      setEditDeadlineDate(task.deadline.date);
      setEditDeadlineTime('12:00');
    } else if (task.deadline.type === 'timed') {
      const parts = getCalendarDateTimeParts(
        new Date(task.deadline.timestamp),
        task.deadline.timezone || userTimezone
      );
      setEditDeadlineDate(parts.date);
      setEditDeadlineTime(parts.time);
    } else {
      setEditDeadlineDate(getCalendarDateInTimezone(new Date(), userTimezone));
      setEditDeadlineTime('12:00');
    }
    const subtaskCount = tasks.filter((t) => t.parentId === task.id).length;
    setTaskDetailsExpanded(
      Boolean((task.details || '').trim()) ||
        task.priority !== 'normal' ||
        task.status !== 'todo' ||
        subtaskCount > 0
    );
    setEditError(null);
  };

  const handleOpenCalendarItem = (item: CalendarItem) => {
    if (item.sourceType === 'task_deadline') {
      const task = tasks.find((t) => t.id === item.taskId && t.deletedAt === null);
      if (task) handleOpenDetail(task);
      return;
    }
    if (item.sourceType === 'routine_occurrence') {
      const routine = routineRecords.find((r) => r.id === item.routineId && r.deletedAt === null);
      if (routine) setEditingRoutine(routine);
      return;
    }
    if (item.sourceType === 'calendar_event') {
      // Personal events stay on the calendar surface; edits target the same event id.
      setActiveSubView('calendar');
      setCalendarViewMode('agenda');
    }
  };

  // Save Detail Sheet with verified timezone rules and no fixed 18:00 UTC substitution
  const handleSaveDetail = async () => {
    if (!editingTask) return;
    const trimmed = editTitle.trim();
    if (!trimmed) {
      setEditError('Task title is required');
      return;
    }

    let deadline: TaskDeadline = { type: 'none' };
    if (editDeadlineType === 'date') {
      if (!isValidCalendarDateString(editDeadlineDate)) {
        setEditError('Invalid calendar date format (expected YYYY-MM-DD)');
        return;
      }
      deadline = { type: 'date', date: editDeadlineDate };
    } else if (editDeadlineType === 'timed') {
      if (!isValidCalendarDateString(editDeadlineDate)) {
        setEditError('Invalid calendar date format (expected YYYY-MM-DD)');
        return;
      }
      try {
        const disambig = checkLocalTimeDisambiguation(
          editDeadlineDate,
          editDeadlineTime || '12:00',
          userTimezone
        );
        if (disambig.type === 'exact') {
          deadline = {
            type: 'timed',
            timestamp: disambig.utcTimestamp,
            timezone: userTimezone,
          };
        } else if (disambig.type === 'ambiguous') {
          deadline = {
            type: 'timed',
            timestamp: disambig.earlierUtcTimestamp,
            timezone: userTimezone,
          };
        } else {
          setEditError(`Nonexistent local time: ${disambig.explanation}`);
          return;
        }
      } catch (err: unknown) {
        setEditError(err instanceof Error ? err.message : 'Invalid time string');
        return;
      }
    }

    const nowIso = new Date().toISOString();
    const updated: TaskRecord = {
      ...editingTask,
      title: trimmed,
      details: editDetails.trim() || null,
      priority: editPriority,
      status: editStatus,
      deadline,
      serverRevision: editingTask.serverRevision + 1,
      updatedAt: nowIso,
    };

    const mutationPayload = {
      title: trimmed,
      details: editDetails.trim() || null,
      priority: editPriority,
      status: editStatus,
      deadline,
    };

    const ok = await persistTaskChange('update', 'updateTask', updated, mutationPayload);
    if (ok) {
      setTasks((prev) => prev.map((t) => (t.id === editingTask.id ? updated : t)));
      setEditingTask(null);
    }
  };

  // Add Subtask from Detail Sheet
  const handleAddSubtask = async () => {
    if (!editingTask) return;
    const trimmed = newSubtaskTitle.trim();
    if (!trimmed) return;

    const newId = generateUuid();
    const nowIso = new Date().toISOString();
    const newSubtask: TaskRecord = {
      id: newId,
      workspaceId: editingTask.workspaceId,
      folderId: editingTask.folderId,
      title: trimmed,
      details: null,
      priority: editingTask.priority,
      status: 'todo',
      deadline: { type: 'none' },
      completedAt: null,
      reopenedAt: null,
      completionHistory: [],
      parentId: editingTask.id,
      subtaskOrder: tasks.filter((t) => t.parentId === editingTask.id).length + 1,
      tags: [],
      serverRevision: 1,
      createdAt: nowIso,
      updatedAt: nowIso,
      deletedAt: null,
    };

    const ok = await persistTaskChange('create', 'createTask', newSubtask, {
      title: trimmed,
      parentId: editingTask.id,
    });
    if (ok) {
      setTasks((prev) => [...prev, newSubtask]);
      setNewSubtaskTitle('');
    }
  };

  // Delete / Trash preserving task payload
  const handleDeleteTask = async () => {
    if (!editingTask) return;
    const nowIso = new Date().toISOString();
    const trashed: TaskRecord = {
      ...editingTask,
      deletedAt: nowIso,
      serverRevision: editingTask.serverRevision + 1,
      updatedAt: nowIso,
    };

    const ok = await persistTaskChange('delete', 'trashTask', trashed, { deletedAt: nowIso });
    if (ok) {
      setTasks((prev) =>
        prev.filter((t) => t.id !== editingTask.id && t.parentId !== editingTask.id)
      );
      setEditingTask(null);
    }
  };

  // Fail clearly when required production dependencies are missing in production
  if (!isDemoOrTest && (!workspaceId || !repository || !userId)) {
    return (
      <View
        testID={testID}
        style={[
          styles.scrollContent,
          { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.lg },
        ]}
      >
        <Text style={[styles.sectionTitle, { color: palette.text.primary, textAlign: 'center' }]}>
          Sign In Required
        </Text>
        <Text
          style={[
            styles.sectionCaption,
            { color: palette.text.secondary, textAlign: 'center', marginTop: 8 },
          ]}
        >
          An authenticated workspace and encrypted storage repository are required to manage tasks.
          Please sign in or connect a workspace in Settings.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      testID={testID}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
    >
      {/* Three-tab Sub-view Selector */}
      <View
        style={[
          styles.subViewSelector,
          { backgroundColor: palette.surface, borderColor: palette.border.subtle },
        ]}
      >
        {(
          [
            { id: 'tasks', label: 'Tasks', testID: 'plan-tab-tasks' },
            { id: 'routines', label: 'Routines', testID: 'plan-tab-routines' },
            { id: 'calendar', label: 'Calendar', testID: 'plan-tab-calendar' },
          ] as const
        ).map((tab) => {
          const active = activeSubView === tab.id;
          return (
            <Pressable
              key={tab.id}
              testID={tab.testID}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`Switch to ${tab.label} sub-view`}
              onPress={() => setSubView(tab.id)}
              style={[
                styles.subViewTab,
                { backgroundColor: active ? palette.action.primary : 'transparent' },
              ]}
            >
              <Text
                style={[
                  styles.subViewTabText,
                  {
                    color: active ? palette.action.label : palette.text.primary,
                    fontWeight: active ? '700' : '400',
                  },
                ]}
              >
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Sub-view 1: Tasks */}
      {activeSubView === 'tasks' && (
        <View testID="plan-tasks-subview" style={styles.section}>
          {/* Quick Capture Bar */}
          <View
            style={[
              styles.quickAddContainer,
              { backgroundColor: palette.surface, borderColor: palette.border.subtle },
            ]}
          >
            <TextInput
              testID="plan-quick-add-input"
              value={quickTitle}
              onChangeText={setQuickTitle}
              placeholder="Quick capture a task..."
              placeholderTextColor={palette.text.muted}
              style={[styles.quickAddInput, { color: palette.text.primary }]}
              accessibilityLabel="Quick capture task title input"
            />
            <View style={styles.quickAddButtonsRow}>
              {/* Presets */}
              <View style={styles.presetButtonsRow}>
                {(['today', 'tomorrow', 'none'] as const).map((preset) => (
                  <Pressable
                    key={preset}
                    onPress={() => setQuickDeadlinePreset(preset)}
                    style={[
                      styles.presetPill,
                      {
                        backgroundColor:
                          quickDeadlinePreset === preset ? palette.action.primary : 'transparent',
                        borderColor: palette.border.subtle,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.presetPillText,
                        {
                          color:
                            quickDeadlinePreset === preset
                              ? palette.action.label
                              : palette.text.secondary,
                        },
                      ]}
                    >
                      {preset === 'today'
                        ? 'Today'
                        : preset === 'tomorrow'
                          ? 'Tomorrow'
                          : 'No date'}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Pressable
                testID="plan-quick-add-btn"
                accessibilityRole="button"
                accessibilityLabel="Add task"
                disabled={!quickTitle.trim()}
                onPress={handleQuickAdd}
                style={[
                  styles.quickAddBtn,
                  {
                    backgroundColor: quickTitle.trim()
                      ? palette.action.primary
                      : palette.action.disabled,
                  },
                ]}
              >
                <Text style={[styles.quickAddBtnText, { color: palette.action.label }]}>+ Add</Text>
              </Pressable>
            </View>
          </View>

          {/* Module Filter Chips */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterChipRow}
          >
            {(
              [
                { id: 'all', label: 'All' },
                { id: 'today', label: 'Today' },
                { id: 'upcoming', label: 'Upcoming' },
                { id: 'overdue', label: 'Overdue' },
                { id: 'completed', label: 'Completed' },
                { id: 'undated', label: 'Undated' },
              ] as const
            ).map((filter) => {
              const active = taskFilter === filter.id;
              return (
                <Pressable
                  key={filter.id}
                  testID={`plan-filter-${filter.id}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`Filter by ${filter.label}`}
                  onPress={() => setTaskFilter(filter.id)}
                  style={[
                    styles.filterChip,
                    {
                      backgroundColor: active ? palette.action.primary : palette.surface,
                      borderColor: palette.border.subtle,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      { color: active ? palette.action.label : palette.text.primary },
                    ]}
                  >
                    {filter.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Task Items List */}
          <MobileCard themeMode={themeMode}>
            {filteredTasks.length === 0 ? (
              <View style={styles.emptyTasksContainer}>
                <Text style={[styles.emptyTasksText, { color: palette.text.secondary }]}>
                  {taskFilter === 'today'
                    ? 'No tasks due today'
                    : taskFilter === 'overdue'
                      ? 'No overdue tasks'
                      : taskFilter === 'upcoming'
                        ? 'No upcoming tasks'
                        : taskFilter === 'completed'
                          ? 'No completed tasks'
                          : taskFilter === 'undated'
                            ? 'No undated tasks'
                            : 'No tasks found'}
                </Text>
              </View>
            ) : (
              filteredTasks.map((task) => {
                const isCompleted = task.status === 'completed';
                const subtasks = getSubtasks(task.id);
                const deadlineExp = formatTaskDeadlineExplanation(
                  task.deadline,
                  userTimezone,
                  new Date()
                );

                return (
                  <View key={task.id} style={styles.taskItemWrapper}>
                    <View style={styles.taskItemRow}>
                      {/* Completion Checkbox */}
                      <Pressable
                        testID={`task-toggle-${task.id}`}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: isCompleted }}
                        accessibilityLabel={`Mark "${task.title}" as ${isCompleted ? 'incomplete' : 'complete'}`}
                        onPress={() => handleToggleComplete(task)}
                        style={[
                          styles.checkbox,
                          {
                            borderColor: isCompleted
                              ? palette.action.primary
                              : palette.border.strong,
                            backgroundColor: isCompleted ? palette.action.primary : 'transparent',
                          },
                        ]}
                      >
                        {isCompleted && (
                          <Text style={styles.checkmarkText}>
                            <Icon name="check" />
                          </Text>
                        )}
                      </Pressable>

                      {/* Content */}
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Open details for task ${task.title}`}
                        onPress={() => handleOpenDetail(task)}
                        style={styles.taskContent}
                      >
                        <Text
                          style={[
                            styles.taskTitle,
                            {
                              color: isCompleted ? palette.text.muted : palette.text.primary,
                              textDecorationLine: isCompleted ? 'line-through' : 'none',
                            },
                          ]}
                        >
                          {task.title}
                        </Text>

                        {/* Metadata row: Priority badge + Overdue text / date */}
                        <View style={styles.metaRow}>
                          <Text
                            style={[
                              styles.priorityBadge,
                              {
                                backgroundColor:
                                  task.priority === 'urgent'
                                    ? '#fee2e2'
                                    : task.priority === 'high'
                                      ? '#fef3c7'
                                      : palette.action.subtle,
                                color:
                                  task.priority === 'urgent'
                                    ? '#991b1b'
                                    : task.priority === 'high'
                                      ? '#92400e'
                                      : palette.text.primary,
                              },
                            ]}
                          >
                            {task.priority.toUpperCase()}
                          </Text>

                          {/* Overdue explanation with explicit text and dates, not color alone */}
                          {task.deadline.type !== 'none' && (
                            <Text
                              style={[
                                styles.deadlineText,
                                {
                                  color:
                                    deadlineExp.isOverdue && !isCompleted
                                      ? '#b91c1c'
                                      : palette.text.secondary,
                                  fontWeight: deadlineExp.isOverdue && !isCompleted ? '700' : '500',
                                },
                              ]}
                            >
                              {deadlineExp.isOverdue && !isCompleted ? (
                                <>
                                  <Icon name="warning" />{' '}
                                  {deadlineExp.overdueText || deadlineExp.label}
                                </>
                              ) : (
                                <>
                                  <Icon name="calendar" /> {deadlineExp.label}
                                </>
                              )}
                            </Text>
                          )}
                        </View>
                      </Pressable>
                    </View>

                    {/* Subtasks indented */}
                    {subtasks.length > 0 && (
                      <View style={styles.subtasksContainer}>
                        {subtasks.map((st) => (
                          <View key={st.id} style={styles.subtaskRow}>
                            <Text
                              style={[styles.subtaskIndentMarker, { color: palette.text.muted }]}
                            >
                              <Icon name="corner-down-right" />
                            </Text>
                            <Pressable
                              accessibilityRole="checkbox"
                              accessibilityLabel={`Mark subtask "${st.title}" completed`}
                              onPress={() => handleToggleComplete(st)}
                              style={[
                                styles.subtaskCheckbox,
                                {
                                  borderColor:
                                    st.status === 'completed'
                                      ? palette.action.primary
                                      : palette.border.subtle,
                                  backgroundColor:
                                    st.status === 'completed'
                                      ? palette.action.primary
                                      : 'transparent',
                                },
                              ]}
                            >
                              {st.status === 'completed' && (
                                <Text style={styles.checkmarkText}>
                                  <Icon name="check" />
                                </Text>
                              )}
                            </Pressable>
                            <Text
                              style={[
                                styles.subtaskTitle,
                                {
                                  color:
                                    st.status === 'completed'
                                      ? palette.text.muted
                                      : palette.text.secondary,
                                  textDecorationLine:
                                    st.status === 'completed' ? 'line-through' : 'none',
                                },
                              ]}
                            >
                              {st.title}
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                );
              })
            )}
          </MobileCard>
        </View>
      )}

      {/* Sub-view 2: Routines — authorized workspace records only */}
      {activeSubView === 'routines' && (
        <View testID="plan-routines-subview" style={styles.section}>
          <Text style={[styles.sectionCaption, { color: palette.text.secondary }]}>
            Each scheduled day maintains independent completion records.
          </Text>
          {routinesLoadError ? (
            <View testID="plan-routines-load-error" style={{ gap: spacing.sm }}>
              <MobileFeedback
                severity="danger"
                themeMode={themeMode}
                title="Could not load routines"
                message={routinesLoadError}
              />
              <MobileButton
                themeMode={themeMode}
                variant="secondary"
                accessibilityLabel="Retry loading routines"
                onPress={() => {
                  loadGenerationRef.current += 1;
                  setRoutinesLoadError(null);
                  setRoutinesLoading(true);
                  if (repository && workspaceId) {
                    void (async () => {
                      const generation = loadGenerationRef.current;
                      try {
                        const loaded = await repository.listRoutines(workspaceId);
                        if (loadGenerationRef.current !== generation) return;
                        setRoutineRecords(loaded.filter((r) => r.deletedAt === null));
                        setRoutinesLoadError(null);
                      } catch (err) {
                        if (loadGenerationRef.current !== generation) return;
                        setRoutinesLoadError(
                          err instanceof Error ? err.message : 'Failed to load Plan records.'
                        );
                      } finally {
                        if (loadGenerationRef.current === generation) {
                          setRoutinesLoading(false);
                        }
                      }
                    })();
                  } else {
                    setRoutinesLoading(false);
                  }
                }}
              >
                Retry
              </MobileButton>
            </View>
          ) : null}
          {routinesLoading && visibleRoutines.length === 0 ? (
            <Text
              testID="plan-routines-loading"
              style={[styles.sectionCaption, { color: palette.text.muted }]}
            >
              Loading routines…
            </Text>
          ) : null}
          {!routinesLoading && !routinesLoadError && visibleRoutines.length === 0 ? (
            <MobileEmptyState
              testID="plan-routines-empty"
              themeMode={themeMode}
              title="No routines yet"
              description="Create a routine from Create. An empty workspace stays empty until you save one."
            />
          ) : null}
          {visibleRoutines.length > 0 ? (
            <MobileCard themeMode={themeMode}>
              {visibleRoutines.map((routine) => {
                const schedule = formatRoutineSchedule(routine);
                const today = getCalendarDateInTimezone(
                  new Date(),
                  routine.timezone || userTimezone
                );
                const due = explainWhyDueToday(routine, today);
                const occ = getTodayOccurrenceForRoutine(routine);
                const statusHint =
                  occ?.status === 'done'
                    ? 'Completed today'
                    : due.isDue
                      ? 'Due today'
                      : 'Not due today';
                return (
                  <View key={routine.id} testID={`plan-routine-row-${routine.id}`}>
                    <MobileListRow
                      title={routine.title}
                      metadata={`${schedule} • ${statusHint}`}
                      themeMode={themeMode}
                      onPress={() => handleOpenRoutineDetail(routine)}
                      accessibilityLabel={`${routine.title}, ${schedule}, ${statusHint}`}
                    />
                  </View>
                );
              })}
            </MobileCard>
          ) : null}
        </View>
      )}

      {/* Sub-view 3: Calendar */}
      {activeSubView === 'calendar' && (
        <View testID="plan-calendar-subview" style={styles.section}>
          {/* Controls: View Mode Switcher and + Add Event */}
          <View style={styles.calendarControlsRow}>
            <View
              style={[
                styles.calendarModeSelector,
                { backgroundColor: palette.surface, borderColor: palette.border.subtle },
              ]}
            >
              {(['agenda', 'day', 'month'] as const).map((mode) => {
                const active = calendarViewMode === mode;
                return (
                  <Pressable
                    key={mode}
                    testID={`plan-calendar-view-${mode}`}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={`Switch to ${mode} view`}
                    onPress={() => setCalendarViewMode(mode)}
                    style={[
                      styles.calendarModeTab,
                      { backgroundColor: active ? palette.action.primary : 'transparent' },
                    ]}
                  >
                    <Text
                      style={[
                        styles.calendarModeTabText,
                        {
                          color: active ? palette.action.label : palette.text.primary,
                          fontWeight: active ? '700' : '500',
                        },
                      ]}
                    >
                      {mode.charAt(0).toUpperCase() + mode.slice(1)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Pressable
              testID="plan-calendar-add-event-btn"
              accessibilityRole="button"
              accessibilityLabel="Add new calendar event"
              onPress={() => {
                setEventSheetError(null);
                setEventSheetStartDate(calendarSelectedDate);
                try {
                  setEventSheetEndDate(addCalendarDays(calendarSelectedDate, 1));
                } catch {
                  setEventSheetEndDate(calendarSelectedDate);
                }
                setIsEventSheetOpen(true);
              }}
              style={[styles.addEventBtn, { backgroundColor: palette.action.primary }]}
            >
              <Text style={[styles.addEventBtnText, { color: palette.action.label }]}>
                + Add Event
              </Text>
            </Pressable>
          </View>

          {/* Source Filter Chips */}
          <View style={styles.calendarFilterRow}>
            <Pressable
              testID="plan-calendar-filter-tasks"
              accessibilityRole="button"
              accessibilityState={{ selected: filterIncludeTasks }}
              accessibilityLabel="Toggle task deadlines"
              onPress={() => setFilterIncludeTasks((prev) => !prev)}
              style={[
                styles.calendarFilterChip,
                {
                  backgroundColor: filterIncludeTasks ? palette.action.primary : palette.surface,
                  borderColor: palette.border.subtle,
                },
              ]}
            >
              <Text
                style={[
                  styles.calendarFilterChipText,
                  { color: filterIncludeTasks ? palette.action.label : palette.text.secondary },
                ]}
              >
                <Icon name="timer" /> Tasks <IconText text={filterIncludeTasks ? 'check' : ''} />
              </Text>
            </Pressable>

            <Pressable
              testID="plan-calendar-filter-routines"
              accessibilityRole="button"
              accessibilityState={{ selected: filterIncludeRoutines }}
              accessibilityLabel="Toggle routine occurrences"
              onPress={() => setFilterIncludeRoutines((prev) => !prev)}
              style={[
                styles.calendarFilterChip,
                {
                  backgroundColor: filterIncludeRoutines ? palette.action.primary : palette.surface,
                  borderColor: palette.border.subtle,
                },
              ]}
            >
              <Text
                style={[
                  styles.calendarFilterChipText,
                  { color: filterIncludeRoutines ? palette.action.label : palette.text.secondary },
                ]}
              >
                <Icon name="refresh" /> Routines{' '}
                <IconText text={filterIncludeRoutines ? 'check' : ''} />
              </Text>
            </Pressable>

            <Pressable
              testID="plan-calendar-filter-events"
              accessibilityRole="button"
              accessibilityState={{ selected: filterIncludeEvents }}
              accessibilityLabel="Toggle personal events"
              onPress={() => setFilterIncludeEvents((prev) => !prev)}
              style={[
                styles.calendarFilterChip,
                {
                  backgroundColor: filterIncludeEvents ? palette.action.primary : palette.surface,
                  borderColor: palette.border.subtle,
                },
              ]}
            >
              <Text
                style={[
                  styles.calendarFilterChipText,
                  { color: filterIncludeEvents ? palette.action.label : palette.text.secondary },
                ]}
              >
                <Icon name="calendar" /> Events{' '}
                <IconText text={filterIncludeEvents ? 'check' : ''} />
              </Text>
            </Pressable>
          </View>

          {/* Agenda Mode */}
          {calendarViewMode === 'agenda' && (
            <MobileCard themeMode={themeMode}>
              {calendarReadModel.items.length === 0 ? (
                <View style={styles.emptyTasksContainer}>
                  <Text style={[styles.emptyTasksText, { color: palette.text.secondary }]}>
                    No upcoming deadlines or calendar events found.
                  </Text>
                </View>
              ) : (
                calendarReadModel.items.map((item) => {
                  let timeLabel = '';
                  let badgeLabel = '';
                  let badgeBg: string = palette.action.subtle;
                  let badgeColor: string = palette.text.primary;

                  if (item.sourceType === 'calendar_event') {
                    badgeLabel = 'Event';
                    timeLabel = item.allDay
                      ? `All-day (${item.startDate})`
                      : item.startAt && item.endAt
                        ? `${getCalendarDateTimeParts(new Date(item.startAt), userTimezone).time} – ${getCalendarDateTimeParts(new Date(item.endAt), userTimezone).time}`
                        : item.startDate;
                  } else if (item.sourceType === 'task_deadline') {
                    badgeLabel = item.isOverdue ? 'Overdue Task' : 'Task';
                    badgeBg = item.isOverdue ? '#fee2e2' : '#fef3c7';
                    badgeColor = item.isOverdue ? '#991b1b' : '#92400e';
                    timeLabel = item.deadlineTime
                      ? getCalendarDateTimeParts(new Date(item.deadlineTime), userTimezone).time
                      : item.deadlineDate;
                  } else {
                    badgeLabel = item.status === 'done' ? 'Routine Done' : 'Routine';
                    timeLabel = item.scheduledDate;
                  }

                  return (
                    <Pressable
                      key={item.id}
                      accessibilityRole="button"
                      accessibilityLabel={`Open ${badgeLabel}: ${getItemTitle(item)}`}
                      testID={`plan-calendar-item-${item.id}`}
                      onPress={() => handleOpenCalendarItem(item)}
                      style={styles.calendarItemRow}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.taskTitle, { color: palette.text.primary }]}>
                          {getItemTitle(item)}
                        </Text>
                        <Text style={[styles.calendarItemTime, { color: palette.text.secondary }]}>
                          {timeLabel}
                        </Text>
                      </View>
                      <View style={[styles.calendarItemTypeBadge, { backgroundColor: badgeBg }]}>
                        <Text style={[styles.calendarItemTypeBadgeText, { color: badgeColor }]}>
                          {badgeLabel}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })
              )}
            </MobileCard>
          )}

          {/* Day Mode */}
          {calendarViewMode === 'day' && (
            <View style={{ gap: spacing.sm }}>
              <View style={styles.monthHeaderRow}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Previous day"
                  onPress={() => setCalendarSelectedDate((prev) => addCalendarDays(prev, -1))}
                  style={[
                    styles.monthNavBtn,
                    { backgroundColor: palette.surface, borderColor: palette.border.subtle },
                  ]}
                >
                  <Text style={[styles.monthNavBtnText, { color: palette.text.primary }]}>
                    <Icon name="arrow-left" />
                  </Text>
                </Pressable>
                <Text style={[styles.monthTitleText, { color: palette.text.primary }]}>
                  {calendarSelectedDate}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Next day"
                  onPress={() => setCalendarSelectedDate((prev) => addCalendarDays(prev, 1))}
                  style={[
                    styles.monthNavBtn,
                    { backgroundColor: palette.surface, borderColor: palette.border.subtle },
                  ]}
                >
                  <Text style={[styles.monthNavBtnText, { color: palette.text.primary }]}>
                    <Icon name="arrow-right" />
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Jump to today"
                  onPress={() =>
                    setCalendarSelectedDate(getCalendarDateInTimezone(new Date(), userTimezone))
                  }
                  style={[
                    styles.monthNavBtn,
                    { backgroundColor: palette.action.primary, paddingHorizontal: 12 },
                  ]}
                >
                  <Text style={[styles.monthNavBtnText, { color: palette.action.label }]}>
                    Today
                  </Text>
                </Pressable>
              </View>

              <MobileCard themeMode={themeMode}>
                {(() => {
                  const dayItems = getItemsForDate(
                    calendarReadModel.items,
                    calendarSelectedDate,
                    userTimezone
                  );
                  const journalInd = calendarReadModel.journalIndicators[calendarSelectedDate];

                  return (
                    <View style={{ gap: spacing.sm }}>
                      {journalInd && (
                        <View
                          style={{
                            padding: spacing.xs,
                            backgroundColor: palette.action.subtle,
                            borderRadius: radii.sm,
                            marginBottom: spacing.xs,
                          }}
                        >
                          <Text style={{ fontSize: 12, color: palette.text.primary }}>
                            <Icon name="journal" /> Journal: {journalInd.count}{' '}
                            {journalInd.count === 1 ? 'entry' : 'entries'} on this date (private)
                          </Text>
                        </View>
                      )}
                      {dayItems.length === 0 ? (
                        <View style={styles.emptyTasksContainer}>
                          <Text style={[styles.emptyTasksText, { color: palette.text.secondary }]}>
                            No items scheduled for this date.
                          </Text>
                        </View>
                      ) : (
                        dayItems.map((item) => (
                          <Pressable
                            key={item.id}
                            accessibilityRole="button"
                            accessibilityLabel={`Open calendar item: ${getItemTitle(item)}`}
                            testID={`plan-calendar-day-item-${item.id}`}
                            onPress={() => handleOpenCalendarItem(item)}
                            style={styles.calendarItemRow}
                          >
                            <View style={{ flex: 1 }}>
                              <Text style={[styles.taskTitle, { color: palette.text.primary }]}>
                                {getItemTitle(item)}
                              </Text>
                              <Text
                                style={[styles.calendarItemTime, { color: palette.text.secondary }]}
                              >
                                {item.sourceType === 'calendar_event'
                                  ? item.allDay
                                    ? 'All-day'
                                    : item.startAt && item.endAt
                                      ? `${getCalendarDateTimeParts(new Date(item.startAt), userTimezone).time} – ${getCalendarDateTimeParts(new Date(item.endAt), userTimezone).time}`
                                      : 'Scheduled'
                                  : item.sourceType === 'task_deadline' && item.deadlineTime
                                    ? getCalendarDateTimeParts(
                                        new Date(item.deadlineTime),
                                        userTimezone
                                      ).time
                                    : 'Scheduled'}
                              </Text>
                            </View>
                            <View
                              style={[
                                styles.calendarItemTypeBadge,
                                { backgroundColor: palette.action.subtle },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.calendarItemTypeBadgeText,
                                  { color: palette.text.primary },
                                ]}
                              >
                                {item.sourceType === 'calendar_event' ? (
                                  <>
                                    <Icon name="calendar" /> Event
                                  </>
                                ) : item.sourceType === 'task_deadline' ? (
                                  <>
                                    <Icon name="timer" /> Task
                                  </>
                                ) : (
                                  <>
                                    <Icon name="repeat" /> Routine
                                  </>
                                )}
                              </Text>
                            </View>
                          </Pressable>
                        ))
                      )}
                    </View>
                  );
                })()}
              </MobileCard>
            </View>
          )}

          {/* Month Mode */}
          {calendarViewMode === 'month' && (
            <View style={{ gap: spacing.sm }}>
              <View style={styles.monthHeaderRow}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Previous month"
                  onPress={() =>
                    setCalendarMonthDate(
                      (prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1)
                    )
                  }
                  style={[
                    styles.monthNavBtn,
                    { backgroundColor: palette.surface, borderColor: palette.border.subtle },
                  ]}
                >
                  <Text style={[styles.monthNavBtnText, { color: palette.text.primary }]}>
                    <Icon name="arrow-left" />
                  </Text>
                </Pressable>
                <Text style={[styles.monthTitleText, { color: palette.text.primary }]}>
                  {calendarMonthDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Next month"
                  onPress={() =>
                    setCalendarMonthDate(
                      (prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1)
                    )
                  }
                  style={[
                    styles.monthNavBtn,
                    { backgroundColor: palette.surface, borderColor: palette.border.subtle },
                  ]}
                >
                  <Text style={[styles.monthNavBtnText, { color: palette.text.primary }]}>
                    <Icon name="arrow-right" />
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Jump to today's month"
                  onPress={() => {
                    const today = new Date();
                    setCalendarMonthDate(today);
                    setCalendarSelectedDate(getCalendarDateInTimezone(today, userTimezone));
                  }}
                  style={[
                    styles.monthNavBtn,
                    { backgroundColor: palette.action.primary, paddingHorizontal: 12 },
                  ]}
                >
                  <Text style={[styles.monthNavBtnText, { color: palette.action.label }]}>
                    Today
                  </Text>
                </Pressable>
              </View>

              {/* Week-start preference selector */}
              <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', marginBottom: 4 }}>
                <Text style={{ fontSize: 11, color: palette.text.muted }}>Week starts:</Text>
                {([1, 7, 6] as const).map((ws) => (
                  <Pressable
                    key={ws}
                    accessibilityRole="button"
                    accessibilityLabel={`Set week start to ${ws === 1 ? 'Monday' : ws === 7 ? 'Sunday' : 'Saturday'}`}
                    onPress={() => setWeekStartPreference(ws)}
                    style={[
                      styles.sheetPill,
                      {
                        backgroundColor:
                          weekStartPreference === ws ? palette.action.primary : palette.surface,
                        borderColor: palette.border.subtle,
                        paddingVertical: 2,
                        paddingHorizontal: 8,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.sheetPillText,
                        {
                          color:
                            weekStartPreference === ws
                              ? palette.action.label
                              : palette.text.primary,
                        },
                      ]}
                    >
                      {ws === 1 ? 'Mon' : ws === 7 ? 'Sun' : 'Sat'}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {/* Weekday Labels Header */}
              <View style={styles.weekdayHeaderRow}>
                {(weekStartPreference === 1
                  ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
                  : weekStartPreference === 7
                    ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
                    : ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri']
                ).map((dayName) => (
                  <Text
                    key={dayName}
                    style={[styles.weekdayHeaderText, { color: palette.text.muted }]}
                  >
                    {dayName}
                  </Text>
                ))}
              </View>

              {/* Month Grid Weeks */}
              <View style={{ gap: 2 }}>
                {buildMonthGrid({
                  year: calendarMonthDate.getFullYear(),
                  month: calendarMonthDate.getMonth() + 1,
                  weekStart: weekStartPreference,
                  todayDate: getCalendarDateInTimezone(new Date(), userTimezone),
                  items: calendarReadModel.items,
                  journalIndicators: calendarReadModel.journalIndicators,
                  viewingTimezone: userTimezone,
                }).map((week, wIdx) => (
                  <View key={`week-${wIdx}`} style={styles.monthGridRow}>
                    {week.cells.map((cell) => {
                      const isSelected = cell.date === calendarSelectedDate;
                      const dayItems = cell.items;
                      const hasJournal = Boolean(cell.journalIndicator?.hasEntry);

                      return (
                        <Pressable
                          key={cell.date}
                          accessibilityRole="button"
                          accessibilityLabel={`${cell.date}, ${dayItems.length} items`}
                          onPress={() => {
                            setCalendarSelectedDate(cell.date);
                            setCalendarViewMode('day');
                          }}
                          style={[
                            styles.monthDayCell,
                            {
                              backgroundColor: isSelected
                                ? palette.action.primary
                                : cell.isToday
                                  ? palette.action.subtle
                                  : palette.surface,
                              borderColor: isSelected
                                ? palette.action.primary
                                : palette.border.subtle,
                              opacity: cell.isCurrentMonth ? 1 : 0.4,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.monthDayNumber,
                              {
                                color: isSelected
                                  ? palette.action.label
                                  : cell.isToday
                                    ? palette.action.primary
                                    : palette.text.primary,
                                fontWeight: cell.isToday || isSelected ? '700' : '400',
                              },
                            ]}
                          >
                            {cell.dayNumber}
                          </Text>
                          <View style={styles.monthDayDotsRow}>
                            {dayItems.length > 0 && (
                              <View
                                style={[
                                  styles.monthDayDot,
                                  {
                                    backgroundColor: isSelected
                                      ? palette.action.label
                                      : palette.action.primary,
                                  },
                                ]}
                              />
                            )}
                            {hasJournal && (
                              <View
                                style={[
                                  styles.journalIndicatorDot,
                                  {
                                    backgroundColor: isSelected ? palette.action.label : '#8b5cf6',
                                  },
                                ]}
                              />
                            )}
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                ))}
              </View>
            </View>
          )}

          <View style={styles.calendarNote}>
            <Text style={[styles.calendarNoteText, { color: palette.text.muted }]}>
              Calendar appointments remain independent of task records and do not mutate task state.
            </Text>
          </View>
        </View>
      )}

      {/* Floating Undo Banner */}
      {undoToast && (
        <View
          testID="plan-undo-banner"
          accessibilityRole="alert"
          style={[
            styles.undoBanner,
            { backgroundColor: palette.surface, borderColor: palette.action.primary },
          ]}
        >
          <Text style={[styles.undoBannerText, { color: palette.text.primary }]}>
            Completed "{undoToast.taskTitle}".
          </Text>
          <Pressable
            testID="plan-undo-btn"
            accessibilityRole="button"
            accessibilityLabel="Undo task completion"
            onPress={handleUndo}
            style={[styles.undoBtn, { backgroundColor: palette.action.primary }]}
          >
            <Text style={[styles.undoBtnText, { color: palette.action.label }]}>Undo</Text>
          </Pressable>
        </View>
      )}

      {/* Routine Detail Modal Sheet — canonical record reopen + today occurrence actions */}
      {editingRoutine && (
        <MobileModalSheet
          visible={Boolean(editingRoutine)}
          title="Routine"
          themeMode={themeMode}
          onClose={() => {
            setEditingRoutine(null);
            setRoutineActionError(null);
          }}
          testID="plan-routine-detail-sheet"
        >
          <View style={styles.sheetContent} testID={`plan-routine-detail-${editingRoutine.id}`}>
            {routineActionError ? (
              <MobileFeedback
                severity="danger"
                themeMode={themeMode}
                title="Action failed"
                message={routineActionError}
              />
            ) : null}
            <Text
              accessibilityRole="header"
              style={{ color: palette.text.primary, fontSize: 18, fontWeight: '700' }}
            >
              {editingRoutine.title}
            </Text>
            <Text style={{ color: palette.text.secondary, fontSize: 14 }}>
              {formatRoutineSchedule(editingRoutine)}
            </Text>
            <Text style={{ color: palette.text.muted, fontSize: 13 }}>
              {
                explainWhyDueToday(
                  editingRoutine,
                  getCalendarDateInTimezone(
                    new Date(),
                    editingRoutine.timezone || userTimezone
                  )
                ).reason
              }
            </Text>
            {editingRoutine.isPaused ? (
              <MobileFeedback
                severity="warning"
                themeMode={themeMode}
                message="This routine is paused and will not generate new due days."
              />
            ) : null}
            {(() => {
              const today = getCalendarDateInTimezone(
                new Date(),
                editingRoutine.timezone || userTimezone
              );
              const dueToday = isRoutineScheduledOnDate(editingRoutine, today);
              const occ = getTodayOccurrenceForRoutine(editingRoutine);
              if (!dueToday) {
                return (
                  <Text style={{ color: palette.text.secondary, fontSize: 13 }}>
                    No occurrence action available for today.
                  </Text>
                );
              }
              if (occ?.status === 'done') {
                return (
                  <View testID="plan-routine-undo-occurrence">
                    <MobileButton
                      themeMode={themeMode}
                      variant="secondary"
                      accessibilityLabel={`Undo completion for ${editingRoutine.title}`}
                      onPress={() => {
                        void handleUndoRoutineOccurrence(editingRoutine);
                      }}
                    >
                      Undo today
                    </MobileButton>
                  </View>
                );
              }
              return (
                <View testID="plan-routine-complete-occurrence">
                  <MobileButton
                    themeMode={themeMode}
                    variant="primary"
                    accessibilityLabel={`Mark ${editingRoutine.title} complete for today`}
                    onPress={() => {
                      void handleCompleteRoutineOccurrence(editingRoutine);
                    }}
                  >
                    Complete today
                  </MobileButton>
                </View>
              );
            })()}
          </View>
        </MobileModalSheet>
      )}

      {/* Task Detail Modal Sheet */}
      {editingTask && (
        <MobileModalSheet
          visible={Boolean(editingTask)}
          title="Task Details"
          themeMode={themeMode}
          onClose={() => setEditingTask(null)}
          testID="plan-task-detail-sheet"
        >
          <View style={styles.sheetContent}>
            {editError && (
              <View
                accessibilityRole="alert"
                style={{
                  padding: spacing.sm,
                  backgroundColor: palette.status.dangerBg,
                  borderColor: palette.status.dangerBorder,
                  borderWidth: 1,
                  borderRadius: radii.sm,
                }}
              >
                <Text style={{ color: palette.status.danger, fontSize: 13, fontWeight: '600' }}>
                  {editError}
                </Text>
              </View>
            )}

            <MobileTextField
              label="Title"
              value={editTitle}
              onChangeText={setEditTitle}
              placeholder="Task title"
              themeMode={themeMode}
              testID="plan-task-title-input"
            />

            {/* Deadline Selector (primary) */}
            <View style={styles.sheetFieldGroup}>
              <Text style={[styles.sheetLabel, { color: palette.text.secondary }]}>Deadline</Text>
              <View style={styles.sheetPillRow}>
                {(['none', 'date', 'timed'] as const).map((dtype) => (
                  <Pressable
                    key={dtype}
                    onPress={() => setEditDeadlineType(dtype)}
                    style={[
                      styles.sheetPill,
                      {
                        backgroundColor:
                          editDeadlineType === dtype ? palette.action.primary : palette.surface,
                        borderColor: palette.border.subtle,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.sheetPillText,
                        {
                          color:
                            editDeadlineType === dtype
                              ? palette.action.label
                              : palette.text.primary,
                        },
                      ]}
                    >
                      {dtype === 'none' ? 'None' : dtype === 'date' ? 'Date Only' : 'Timed'}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {editDeadlineType !== 'none' && (
                <View style={{ gap: 8, marginTop: 4 }}>
                  <MobileTextField
                    label="Calendar Date (YYYY-MM-DD)"
                    value={editDeadlineDate}
                    onChangeText={setEditDeadlineDate}
                    placeholder="2026-10-16"
                    themeMode={themeMode}
                  />
                  {editDeadlineType === 'timed' && (
                    <MobileTextField
                      label="Time (HH:mm)"
                      value={editDeadlineTime}
                      onChangeText={setEditDeadlineTime}
                      placeholder="17:00"
                      themeMode={themeMode}
                    />
                  )}
                </View>
              )}
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: taskDetailsExpanded }}
              accessibilityLabel="Details optional"
              testID="plan-task-details-toggle"
              onPress={() => setTaskDetailsExpanded((open) => !open)}
              style={[
                styles.sheetFieldGroup,
                {
                  borderWidth: 1,
                  borderColor: palette.border.subtle,
                  borderRadius: radii.sm,
                  padding: spacing.sm,
                },
              ]}
            >
              <Text style={[styles.sheetLabel, { color: palette.text.primary, marginBottom: 0 }]}>
                {taskDetailsExpanded ? 'Hide details' : 'Details (optional)'}
              </Text>
            </Pressable>

            {taskDetailsExpanded && (
              <>
            <MobileTextField
              label="Notes"
              value={editDetails}
              onChangeText={setEditDetails}
              placeholder="Add description or notes..."
              themeMode={themeMode}
            />

            {/* Priority Selector */}
            <View style={styles.sheetFieldGroup}>
              <Text style={[styles.sheetLabel, { color: palette.text.secondary }]}>Priority</Text>
              <View style={styles.sheetPillRow}>
                {(['low', 'normal', 'high', 'urgent'] as const).map((p) => (
                  <Pressable
                    key={p}
                    onPress={() => setEditPriority(p)}
                    style={[
                      styles.sheetPill,
                      {
                        backgroundColor:
                          editPriority === p ? palette.action.primary : palette.surface,
                        borderColor: palette.border.subtle,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.sheetPillText,
                        { color: editPriority === p ? palette.action.label : palette.text.primary },
                      ]}
                    >
                      {p.toUpperCase()}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Subtasks Section */}
            <View style={styles.sheetFieldGroup}>
              <Text style={[styles.sheetLabel, { color: palette.text.secondary }]}>Subtasks</Text>
              <View style={styles.addSubtaskRow}>
                <TextInput
                  value={newSubtaskTitle}
                  onChangeText={setNewSubtaskTitle}
                  placeholder="New subtask..."
                  placeholderTextColor={palette.text.muted}
                  style={[
                    styles.subtaskInput,
                    { color: palette.text.primary, borderColor: palette.border.subtle },
                  ]}
                />
                <MobileButton title="+ Add" onPress={handleAddSubtask} themeMode={themeMode} />
              </View>
            </View>
              </>
            )}

            <View style={styles.sheetActionsRow}>
              <MobileButton
                title="Save Task"
                variant="primary"
                onPress={handleSaveDetail}
                themeMode={themeMode}
              />
              <View style={{ height: 8 }} />
              <MobileButton
                title="Move to Trash"
                variant="subtle"
                onPress={handleDeleteTask}
                themeMode={themeMode}
              />
            </View>
          </View>
        </MobileModalSheet>
      )}

      {/* Calendar Add Event Modal Sheet */}
      <MobileModalSheet
        visible={isEventSheetOpen}
        title="New Calendar Event"
        themeMode={themeMode}
        onClose={() => setIsEventSheetOpen(false)}
        testID="plan-calendar-event-modal"
      >
        <View style={styles.sheetContent}>
          {eventSheetError && (
            <View
              accessibilityRole="alert"
              style={{
                padding: spacing.sm,
                backgroundColor: palette.status.dangerBg,
                borderColor: palette.status.dangerBorder,
                borderWidth: 1,
                borderRadius: radii.sm,
              }}
            >
              <Text style={{ color: palette.status.danger, fontSize: 13, fontWeight: '600' }}>
                {eventSheetError}
              </Text>
            </View>
          )}

          <MobileTextField
            label="Title *"
            value={eventSheetTitle}
            onChangeText={setEventSheetTitle}
            placeholder="Event title"
            themeMode={themeMode}
            testID="plan-event-title-input"
          />

          <MobileTextField
            label="Location"
            value={eventSheetLocation}
            onChangeText={setEventSheetLocation}
            placeholder="Meeting room, link, or address"
            themeMode={themeMode}
            testID="plan-event-location-input"
          />

          <MobileTextField
            label="Description"
            value={eventSheetDescription}
            onChangeText={setEventSheetDescription}
            placeholder="Notes or agenda..."
            themeMode={themeMode}
            testID="plan-event-description-input"
          />

          {/* All Day Toggle */}
          <View style={styles.sheetFieldGroup}>
            <Text style={[styles.sheetLabel, { color: palette.text.secondary }]}>Timing</Text>
            <View style={styles.sheetPillRow}>
              <Pressable
                testID="plan-event-allday-toggle"
                accessibilityRole="checkbox"
                accessibilityState={{ checked: eventSheetAllDay }}
                accessibilityLabel="All day event"
                onPress={() => setEventSheetAllDay((prev) => !prev)}
                style={[
                  styles.sheetPill,
                  {
                    backgroundColor: eventSheetAllDay ? palette.action.primary : palette.surface,
                    borderColor: palette.border.subtle,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.sheetPillText,
                    { color: eventSheetAllDay ? palette.action.label : palette.text.primary },
                  ]}
                >
                  {eventSheetAllDay ? (
                    <>
                      <Icon name="check" /> {'All-Day Event'}
                    </>
                  ) : (
                    <Icon name="Timed Event" />
                  )}
                </Text>
              </Pressable>
            </View>
          </View>

          {/* Date & Time Inputs */}
          {eventSheetAllDay ? (
            <View style={{ gap: spacing.sm }}>
              <MobileTextField
                label="Start Date (YYYY-MM-DD)"
                value={eventSheetStartDate}
                onChangeText={setEventSheetStartDate}
                placeholder="YYYY-MM-DD"
                themeMode={themeMode}
                testID="plan-event-start-date-input"
              />
              <MobileTextField
                label="End Date Exclusive (YYYY-MM-DD)"
                value={eventSheetEndDate}
                onChangeText={setEventSheetEndDate}
                placeholder="YYYY-MM-DD"
                themeMode={themeMode}
                testID="plan-event-end-date-input"
              />
            </View>
          ) : (
            <View style={{ gap: spacing.sm }}>
              <MobileTextField
                label="Date (YYYY-MM-DD)"
                value={eventSheetStartDate}
                onChangeText={setEventSheetStartDate}
                placeholder="YYYY-MM-DD"
                themeMode={themeMode}
                testID="plan-event-timed-date-input"
              />
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <View style={{ flex: 1 }}>
                  <MobileTextField
                    label="Start Time (HH:MM)"
                    value={eventSheetStartAtTime}
                    onChangeText={setEventSheetStartAtTime}
                    placeholder="09:00"
                    themeMode={themeMode}
                    testID="plan-event-start-time-input"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <MobileTextField
                    label="End Time (HH:MM)"
                    value={eventSheetEndAtTime}
                    onChangeText={setEventSheetEndAtTime}
                    placeholder="10:00"
                    themeMode={themeMode}
                    testID="plan-event-end-time-input"
                  />
                </View>
              </View>
            </View>
          )}

          <View style={styles.sheetActionsRow}>
            <MobileButton
              title="Save Event"
              variant="primary"
              themeMode={themeMode}
              onPress={handleSaveEvent}
              testID="plan-event-save-btn"
            />
          </View>
        </View>
      </MobileModalSheet>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  scrollContent: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  subViewSelector: {
    flexDirection: 'row',
    borderRadius: radii.sm,
    borderWidth: 1,
    padding: 3,
    marginBottom: spacing.md,
  },
  subViewTab: {
    flex: 1,
    minHeight: touchTargets.mobileMin, // 48dp minimum
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.sm - 2,
    paddingHorizontal: 8,
  },
  subViewTabText: {
    fontSize: 14,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  sectionCaption: {
    fontSize: 13,
    marginBottom: spacing.sm,
    lineHeight: 18,
  },
  quickAddContainer: {
    borderWidth: 1,
    borderRadius: radii.card,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  quickAddInput: {
    fontSize: 15,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    minHeight: 40,
  },
  quickAddButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.xs,
    flexWrap: 'wrap',
    gap: 8,
  },
  presetButtonsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  presetPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radii.sm,
    borderWidth: 1,
  },
  presetPillText: {
    fontSize: 12,
  },
  quickAddBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.sm,
    minHeight: 32,
    justifyContent: 'center',
  },
  quickAddBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  filterChipRow: {
    flexDirection: 'row',
    gap: 8,
    paddingBottom: spacing.sm,
    marginBottom: spacing.xs,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.pill,
    borderWidth: 1,
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '500',
  },
  emptyTasksContainer: {
    padding: spacing.xl,
    alignItems: 'center',
  },
  emptyTasksText: {
    fontSize: 14,
  },
  taskItemWrapper: {
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(150, 150, 150, 0.2)',
  },
  taskItemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: radii.sm,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  checkmarkText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  taskContent: {
    flex: 1,
    gap: 4,
  },
  taskTitle: {
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 20,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  priorityBadge: {
    fontSize: 10,
    fontWeight: '700',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.sm,
  },
  deadlineText: {
    fontSize: 12,
  },
  subtasksContainer: {
    marginTop: spacing.xs,
    paddingLeft: spacing.lg,
    gap: 4,
  },
  subtaskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  subtaskIndentMarker: {
    fontSize: 13,
  },
  subtaskCheckbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subtaskTitle: {
    fontSize: 13,
  },
  undoBanner: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    right: 16,
    borderWidth: 1.5,
    borderRadius: radii.card,
    padding: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    elevation: 4,
  },
  undoBannerText: {
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  undoBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.sm,
  },
  undoBtnText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  sheetContent: {
    gap: spacing.md,
    paddingBottom: spacing.lg,
  },
  sheetFieldGroup: {
    gap: 6,
  },
  sheetLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  sheetPillRow: {
    flexDirection: 'row',
    gap: 6,
  },
  sheetPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.sm,
    borderWidth: 1,
  },
  sheetPillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  addSubtaskRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    alignItems: 'center',
  },
  subtaskInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    fontSize: 13,
  },
  sheetActionsRow: {
    marginTop: spacing.sm,
  },
  calendarNote: {
    marginTop: spacing.md,
    padding: spacing.sm,
  },
  calendarNoteText: {
    fontSize: 12,
    lineHeight: 17,
  },
  calendarControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  calendarModeSelector: {
    flex: 1,
    flexDirection: 'row',
    borderRadius: radii.sm,
    borderWidth: 1,
    padding: 2,
  },
  calendarModeTab: {
    flex: 1,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.sm - 2,
  },
  calendarModeTabText: {
    fontSize: 12,
  },
  addEventBtn: {
    paddingHorizontal: 12,
    minHeight: 36,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addEventBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  calendarFilterRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  calendarFilterChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.pill,
    borderWidth: 1,
  },
  calendarFilterChipText: {
    fontSize: 11,
    fontWeight: '600',
  },
  calendarItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  calendarItemTypeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.sm,
  },
  calendarItemTypeBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  calendarItemTime: {
    fontSize: 12,
    marginTop: 2,
  },
  monthHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  monthNavBtn: {
    minHeight: 36,
    minWidth: 36,
    borderRadius: radii.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  monthNavBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
  monthTitleText: {
    fontSize: 15,
    fontWeight: '700',
  },
  weekdayHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 4,
  },
  weekdayHeaderText: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '600',
  },
  monthGridRow: {
    flexDirection: 'row',
    gap: 2,
  },
  monthDayCell: {
    flex: 1,
    aspectRatio: 1,
    borderWidth: 1,
    borderRadius: radii.sm - 2,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 2,
  },
  monthDayNumber: {
    fontSize: 11,
  },
  monthDayDotsRow: {
    flexDirection: 'row',
    gap: 2,
    marginTop: 2,
  },
  monthDayDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  journalIndicatorDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
});
