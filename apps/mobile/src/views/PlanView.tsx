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
} from '@daynori/sync';
import {
  isTaskOverdue,
  isTaskDueToday,
  compareTasksUpcoming,
  formatTaskDeadlineExplanation,
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
  workspaceId = 'ws-mobile',
  userId = 'user-mobile',
  repository,
  syncEngine: _syncEngine,
  isOnline: _isOnline = true,
  userTimezone = 'UTC',
}) => {
  const palette = colors[themeMode];
  const [activeSubView, setActiveSubView] = useState<PlanSubView>(initialSubView);
  const [taskFilter, setTaskFilter] = useState<MobileTaskFilter>('all');

  // Tasks state
  const [tasks, setTasks] = useState<TaskRecord[]>(initialTasks || SAMPLE_MOBILE_TASKS);

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
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');

  // Undo Toast state
  const [undoToast, setUndoToast] = useState<{
    taskId: string;
    taskTitle: string;
    previousStatus: TaskStatus;
    expiresAt: number;
  } | null>(null);

  const setSubView = (subView: PlanSubView) => {
    setActiveSubView(subView);
    if (onSubViewChange) onSubViewChange(subView);
  };

  // Load from repository if provided
  useEffect(() => {
    if (!repository || !workspaceId) return;
    let active = true;
    void repository.listTasks(workspaceId).then((loaded) => {
      if (active && loaded && loaded.length > 0) {
        setTasks(loaded.filter((t) => t.deletedAt === null));
      }
    });
    return () => {
      active = false;
    };
  }, [repository, workspaceId]);

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

  // Find subtasks for parent
  const getSubtasks = useCallback(
    (parentId: string) => {
      return tasks.filter((t) => t.parentId === parentId && t.deletedAt === null);
    },
    [tasks]
  );

  // Quick Add Task
  const handleQuickAdd = async () => {
    const trimmed = quickTitle.trim();
    if (!trimmed) return;

    let deadline: TaskDeadline = { type: 'none' };
    const now = new Date();
    if (quickDeadlinePreset === 'today') {
      deadline = { type: 'date', date: now.toISOString().slice(0, 10) };
    } else if (quickDeadlinePreset === 'tomorrow') {
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      deadline = { type: 'date', date: tomorrow.toISOString().slice(0, 10) };
    }

    const newId = `t-${Date.now()}`;
    const nowIso = now.toISOString();

    const newTask: TaskRecord = {
      id: newId,
      workspaceId: workspaceId || 'ws-mobile',
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

    setTasks((prev) => [newTask, ...prev]);
    setQuickTitle('');

    if (repository && workspaceId) {
      await repository.upsertTask(newTask);
      if (userId) {
        const mutation: PendingMutationRecord = {
          operationId: `op-${Date.now()}`,
          deviceId: 'mobile-local',
          entityType: 'task',
          action: 'create',
          command: 'createTask',
          status: 'pending',
          retryCount: 0,
          lastError: null,
          workspaceId,
          userId,
          entityId: newId,
          clientTimestamp: nowIso,
          baseRevision: 0,
          dependencyOperationIds: [],
          payload: { title: trimmed, priority: quickPriority, deadline },
        };
        await repository.enqueueMutation(mutation);
      }
    }
  };

  // Toggle Complete / Reopen
  const handleToggleComplete = async (task: TaskRecord) => {
    const isCompleting = task.status !== 'completed';
    const nowIso = new Date().toISOString();
    const newStatus: TaskStatus = isCompleting ? 'completed' : 'todo';

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

    setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)));

    if (isCompleting) {
      setUndoToast({
        taskId: task.id,
        taskTitle: task.title,
        previousStatus: task.status,
        expiresAt: Date.now() + 5000,
      });
    }

    if (repository && workspaceId && userId) {
      await repository.upsertTask(updated);
      const mutation: PendingMutationRecord = {
        operationId: `op-${Date.now()}`,
        deviceId: 'mobile-local',
        entityType: 'task',
        action: 'update',
        command: isCompleting ? 'completeTask' : 'reopenTask',
        status: 'pending',
        retryCount: 0,
        lastError: null,
        workspaceId,
        userId,
        entityId: task.id,
        clientTimestamp: nowIso,
        baseRevision: task.serverRevision,
        dependencyOperationIds: [],
        payload: { status: newStatus },
      };
      await repository.enqueueMutation(mutation);
    }
  };

  // Undo
  const handleUndo = async () => {
    if (!undoToast) return;
    const { taskId, previousStatus } = undoToast;
    setUndoToast(null);

    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    const nowIso = new Date().toISOString();
    const restored: TaskRecord = {
      ...task,
      status: previousStatus,
      completedAt: null,
      reopenedAt: nowIso,
      completionHistory: [
        ...task.completionHistory,
        { completedAt: task.completedAt || nowIso, reopenedAt: nowIso },
      ],
      serverRevision: task.serverRevision + 1,
      updatedAt: nowIso,
    };

    setTasks((prev) => prev.map((t) => (t.id === taskId ? restored : t)));

    if (repository && workspaceId && userId) {
      await repository.upsertTask(restored);
      const mutation: PendingMutationRecord = {
        operationId: `op-${Date.now()}`,
        deviceId: 'mobile-local',
        entityType: 'task',
        action: 'update',
        command: 'reopenTask',
        status: 'pending',
        retryCount: 0,
        lastError: null,
        workspaceId,
        userId,
        entityId: taskId,
        clientTimestamp: nowIso,
        baseRevision: task.serverRevision,
        dependencyOperationIds: [],
        payload: { status: previousStatus },
      };
      await repository.enqueueMutation(mutation);
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
    setEditDeadlineDate(
      task.deadline.type === 'date'
        ? task.deadline.date
        : task.deadline.type === 'timed'
          ? task.deadline.timestamp.slice(0, 10)
          : new Date().toISOString().slice(0, 10)
    );
  };

  // Save Detail Sheet
  const handleSaveDetail = async () => {
    if (!editingTask) return;
    const trimmed = editTitle.trim();
    if (!trimmed) return;

    let deadline: TaskDeadline = { type: 'none' };
    if (editDeadlineType === 'date') {
      deadline = { type: 'date', date: editDeadlineDate || new Date().toISOString().slice(0, 10) };
    } else if (editDeadlineType === 'timed') {
      deadline = {
        type: 'timed',
        timestamp: `${editDeadlineDate || new Date().toISOString().slice(0, 10)}T18:00:00.000Z`,
        timezone: userTimezone,
      };
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

    setTasks((prev) => prev.map((t) => (t.id === editingTask.id ? updated : t)));
    setEditingTask(null);

    if (repository && workspaceId && userId) {
      await repository.upsertTask(updated);
      const mutation: PendingMutationRecord = {
        operationId: `op-${Date.now()}`,
        deviceId: 'mobile-local',
        entityType: 'task',
        action: 'update',
        command: 'updateTask',
        status: 'pending',
        retryCount: 0,
        lastError: null,
        workspaceId,
        userId,
        entityId: editingTask.id,
        clientTimestamp: nowIso,
        baseRevision: editingTask.serverRevision,
        dependencyOperationIds: [],
        payload: {
          title: trimmed,
          details: editDetails.trim() || null,
          priority: editPriority,
          status: editStatus,
          deadline,
        },
      };
      await repository.enqueueMutation(mutation);
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
      workspaceId: workspaceId || 'ws-mobile',
      folderId: null,
      title: trimmed,
      details: null,
      priority: editingTask.priority,
      status: 'todo',
      deadline: { type: 'none' },
      completedAt: null,
      reopenedAt: null,
      completionHistory: [],
      parentId: editingTask.id,
      subtaskOrder: 1,
      tags: [],
      serverRevision: 1,
      createdAt: nowIso,
      updatedAt: nowIso,
      deletedAt: null,
    };

    setTasks((prev) => [...prev, newSubtask]);
    setNewSubtaskTitle('');

    if (repository && workspaceId) {
      await repository.upsertTask(newSubtask);
    }
  };

  return (
    <ScrollView
      testID={testID}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
    >
      {/* Sub-view navigation selector (Tasks | Routines | Calendar) */}
      <View
        accessibilityRole="tablist"
        accessibilityLabel="Plan sub-views"
        style={[
          styles.subViewSelector,
          {
            backgroundColor: palette.surface,
            borderColor: palette.border.subtle,
          },
        ]}
      >
        {(
          [
            { key: 'tasks', label: 'Tasks' },
            { key: 'routines', label: 'Routines' },
            { key: 'calendar', label: 'Calendar' },
          ] as const
        ).map((tab) => {
          const isSelected = activeSubView === tab.key;
          return (
            <Pressable
              key={tab.key}
              testID={`plan-tab-${tab.key}`}
              accessibilityRole="tab"
              accessibilityLabel={`${tab.label} sub-view`}
              accessibilityState={{ selected: isSelected }}
              onPress={() => setSubView(tab.key)}
              style={[
                styles.subViewTab,
                {
                  backgroundColor: isSelected ? palette.action.primary : 'transparent',
                },
              ]}
            >
              <Text
                style={[
                  styles.subViewTabText,
                  {
                    color: isSelected ? palette.action.label : palette.text.secondary,
                    fontWeight: isSelected ? '700' : '600',
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
          {/* Quick Capture Input */}
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
              accessibilityLabel="Quick capture a task title"
              style={[styles.quickAddInput, { color: palette.text.primary }]}
            />
            <View style={styles.quickAddButtonsRow}>
              {/* Due Date Presets */}
              <View style={styles.presetGroup}>
                {(['today', 'tomorrow', 'none'] as const).map((p) => (
                  <Pressable
                    key={p}
                    onPress={() => setQuickDeadlinePreset(p)}
                    style={[
                      styles.smallPill,
                      {
                        backgroundColor:
                          quickDeadlinePreset === p ? palette.action.primary : 'transparent',
                        borderColor: palette.border.subtle,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.smallPillText,
                        {
                          color:
                            quickDeadlinePreset === p
                              ? palette.action.label
                              : palette.text.secondary,
                        },
                      ]}
                    >
                      {p.charAt(0).toUpperCase() + p.slice(1)}
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
                  styles.quickAddSubmitBtn,
                  {
                    backgroundColor: quickTitle.trim()
                      ? palette.action.primary
                      : palette.border.subtle,
                  },
                ]}
              >
                <Text style={[styles.quickAddBtnText, { color: palette.action.label }]}>+ Add</Text>
              </Pressable>
            </View>
          </View>

          {/* Filter Pills */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
            <View style={styles.filterBar}>
              {(['all', 'today', 'upcoming', 'overdue', 'completed', 'undated'] as const).map(
                (filter) => (
                  <Pressable
                    key={filter}
                    testID={`filter-task-${filter}`}
                    accessibilityRole="button"
                    accessibilityLabel={`Filter ${filter} tasks`}
                    accessibilityState={{ selected: taskFilter === filter }}
                    onPress={() => setTaskFilter(filter)}
                    style={[
                      styles.filterPill,
                      {
                        backgroundColor:
                          taskFilter === filter ? palette.action.subtle : palette.surface,
                        borderColor:
                          taskFilter === filter ? palette.action.primary : palette.border.subtle,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.filterPillText,
                        {
                          color:
                            taskFilter === filter ? palette.action.primary : palette.text.secondary,
                          fontWeight: taskFilter === filter ? '700' : '500',
                        },
                      ]}
                    >
                      {filter.charAt(0).toUpperCase() + filter.slice(1)}
                    </Text>
                  </Pressable>
                )
              )}
            </View>
          </ScrollView>

          {/* Task List */}
          <MobileCard themeMode={themeMode}>
            {filteredTasks.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Text style={[styles.emptyText, { color: palette.text.muted }]}>
                  No tasks matching "{taskFilter}".
                </Text>
              </View>
            ) : (
              filteredTasks.map((task) => {
                const isCompleted = task.status === 'completed';
                const deadlineExp = formatTaskDeadlineExplanation(task.deadline, userTimezone);
                const subtasks = getSubtasks(task.id);

                return (
                  <View key={task.id} style={styles.taskRowContainer}>
                    <View style={styles.taskMainRow}>
                      {/* Checkbox */}
                      <Pressable
                        testID={`task-toggle-${task.id}`}
                        accessibilityRole="checkbox"
                        accessibilityLabel={
                          isCompleted
                            ? `Reopen task "${task.title}"`
                            : `Mark task "${task.title}" as completed`
                        }
                        accessibilityState={{ checked: isCompleted }}
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
          <Text style={[styles.sectionTitle, { color: palette.text.primary }]}>
            Agenda — Wednesday, Oct 14
          </Text>
          <Text style={[styles.sectionCaption, { color: palette.text.secondary }]}>
            Agenda and projections of scheduled tasks and private event records.
          </Text>

          <MobileCard themeMode={themeMode}>
            {calendarEvents.map((event) => (
              <MobileListRow
                key={event.id}
                title={event.title}
                metadata={`${event.time} • ${event.type}`}
                themeMode={themeMode}
                onPress={() => {}}
                accessibilityLabel={`${event.title}, ${event.time}, type ${event.type}`}
              />
            ))}
          </MobileCard>

          <View style={styles.calendarNote}>
            <Text style={[styles.calendarNoteText, { color: palette.text.muted }]}>
              ℹ️ Editing a projected task updates its canonical task. Standalone events are stored
              locally. External calendar sync is excluded from the initial event workflow.
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
  },
  presetGroup: {
    flexDirection: 'row',
    gap: 4,
  },
  smallPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radii.sm,
    borderWidth: 1,
  },
  smallPillText: {
    fontSize: 11,
    fontWeight: '600',
  },
  quickAddSubmitBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radii.sm,
    minHeight: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quickAddBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  filterScroll: {
    marginBottom: spacing.sm,
  },
  filterBar: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  filterPill: {
    minHeight: 36,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterPillText: {
    fontSize: 12,
  },
  emptyContainer: {
    padding: spacing.lg,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
  },
  taskRowContainer: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.06)',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  taskMainRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  checkbox: {
    width: 28,
    height: 28,
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
  },
  taskTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
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
