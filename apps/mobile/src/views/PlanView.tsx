import { useState, useEffect, useMemo, useCallback } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, radii, spacing, touchTargets, type ThemeMode } from '@daynori/design-tokens';
import {
  MobileCard,
  MobileListRow,
  MobileModalSheet,
  MobileButton,
  MobileTextField,
} from '@daynori/ui-mobile';
import type { PlanSubView } from '../navigation/types';
import type {
  LocalRepositoryPort,
  SyncEngine,
  TaskRecord,
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
  type TaskPriority,
  type TaskStatus,
  type TaskDeadline,
} from '@daynori/domain';

export type MobileTaskFilter = 'all' | 'today' | 'upcoming' | 'overdue' | 'completed' | 'undated';

export interface PlanViewProps {
  themeMode: ThemeMode;
  initialSubView?: PlanSubView;
  onSubViewChange?: (subView: PlanSubView) => void;
  testID?: string;
  initialTasks?: TaskRecord[];
  workspaceId?: string | null;
  userId?: string | null;
  repository?: LocalRepositoryPort;
  syncEngine?: SyncEngine;
  isOnline?: boolean;
  userTimezone?: string;
  isDemo?: boolean;
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

export const PlanView: React.FC<PlanViewProps> = ({
  themeMode,
  initialSubView = 'tasks',
  onSubViewChange,
  testID = 'plan-view',
  initialTasks,
  workspaceId,
  userId,
  repository,
  syncEngine,
  isOnline: _isOnline = true,
  userTimezone = 'UTC',
  isDemo,
}) => {
  const palette = colors[themeMode];
  const [activeSubView, setActiveSubView] = useState<PlanSubView>(initialSubView);
  const [taskFilter, setTaskFilter] = useState<MobileTaskFilter>('all');

  // Confine synthetic sample tasks to explicit demo/test environments
  const isDemoOrTest =
    isDemo ||
    Boolean(initialTasks) ||
    (typeof process !== 'undefined' && process.env.NODE_ENV === 'test' && !repository);

  // Tasks state
  const [tasks, setTasks] = useState<TaskRecord[]>(() => {
    if (initialTasks) return initialTasks;
    if (isDemoOrTest) return SAMPLE_MOBILE_TASKS;
    return [];
  });

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

  // Subscribe to production repository and sync engine
  useEffect(() => {
    if (!repository || !workspaceId) return;
    let isCancelled = false;

    // Load initial tasks from local durable storage
    void repository.listTasks(workspaceId).then((loaded) => {
      if (!isCancelled && loaded) {
        setTasks(loaded.filter((t) => t.deletedAt === null));
      }
    });

    // Subscribe to durable sync events
    if (syncEngine) {
      const unsub = syncEngine.onEvent((evt) => {
        if (isCancelled) return;
        if (evt.type === 'sync_completed' || evt.type === 'conflict_resolved') {
          void repository.listTasks(workspaceId).then((loaded) => {
            if (!isCancelled && loaded) {
              setTasks(loaded.filter((t) => t.deletedAt === null));
            }
          });
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

  const routines = [
    {
      id: 'r1',
      title: 'Morning deep work session',
      frequency: 'Repeats weekdays (Mon–Fri)',
      time: '9:00 AM',
    },
    { id: 'r2', title: 'Standup and priority check', frequency: 'Repeats daily', time: '10:00 AM' },
    {
      id: 'r3',
      title: 'Evening reflection & summary',
      frequency: 'Repeats daily',
      time: '5:30 PM',
    },
  ];

  const calendarEvents = [
    { id: 'e1', time: '10:00 AM – 10:30 AM', title: 'Engineering Handoff Review', type: 'Event' },
    {
      id: 'e2',
      time: '2:00 PM – 3:00 PM',
      title: 'Accessible Primitives Walkthrough',
      type: 'Event',
    },
    {
      id: 'e3',
      time: '4:00 PM',
      title: 'Review quarterly architecture plan',
      type: 'Task Projection',
    },
  ];

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
        await syncEngine.saveItem(itemHeader, undefined, command, { payload });
        return true;
      } catch {
        return false;
      }
    } else if (repository) {
      try {
        const mutation: PendingMutationRecord = {
          operationId: `op-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
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
        return true;
      } catch {
        return false;
      }
    }

    return true; // memory fallback for standalone test rendering
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

    const newId = `t-${Date.now()}`;
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
    setEditError(null);
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

    const newId = `st-${Date.now()}`;
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
                        {isCompleted && <Text style={styles.checkmarkText}>✓</Text>}
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
                              {deadlineExp.isOverdue && !isCompleted
                                ? `⚠️ ${deadlineExp.overdueText || deadlineExp.label}`
                                : `🗓 ${deadlineExp.label}`}
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
                              ↳
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
                                <Text style={styles.checkmarkText}>✓</Text>
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

      {/* Sub-view 2: Routines */}
      {activeSubView === 'routines' && (
        <View testID="plan-routines-subview" style={styles.section}>
          <Text style={[styles.sectionCaption, { color: palette.text.secondary }]}>
            Each scheduled day maintains independent completion records.
          </Text>
          <MobileCard themeMode={themeMode}>
            {routines.map((routine) => (
              <MobileListRow
                key={routine.id}
                title={routine.title}
                metadata={`${routine.frequency} • ${routine.time}`}
                themeMode={themeMode}
                onPress={() => {}}
                accessibilityLabel={`${routine.title}, ${routine.frequency}, at ${routine.time}`}
              />
            ))}
          </MobileCard>
        </View>
      )}

      {/* Sub-view 3: Calendar */}
      {activeSubView === 'calendar' && (
        <View testID="plan-calendar-subview" style={styles.section}>
          <Text style={[styles.sectionCaption, { color: palette.text.secondary }]}>
            Chronological projection combining appointments and prioritized tasks.
          </Text>
          <MobileCard themeMode={themeMode}>
            {calendarEvents.map((evt) => (
              <MobileListRow
                key={evt.id}
                title={evt.title}
                metadata={`${evt.time} • ${evt.type}`}
                themeMode={themeMode}
                onPress={() => {}}
                accessibilityLabel={`${evt.title}, ${evt.time}, ${evt.type}`}
              />
            ))}
          </MobileCard>
          <View style={styles.calendarNote}>
            <Text style={[styles.calendarNoteText, { color: palette.text.muted }]}>
              Calendar appointments remain independent of local storage and do not overwrite task
              state.
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
            />

            <MobileTextField
              label="Details / Notes"
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

            {/* Deadline Selector */}
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
});
