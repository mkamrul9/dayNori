'use client';

import React, { useState, useEffect, useRef, useId, useCallback, useMemo } from 'react';
import { colors, radii, spacing, touchTargets, typography } from '@daynori/design-tokens';
import { Button, Card, EmptyState, Feedback, TaskRow, TaskDetailEditor } from '@daynori/ui-web';
import { useShell } from '../../components/ShellContext';
import { useAuth } from '../../components/AuthContext';
import {
  IndexedDbLocalRepository,
  getTrustedDeviceConsent,
  setTrustedDeviceConsent,
} from '../../data/indexedDbRepository';
import {
  SyncEngine,
  ApiClientSyncTransport,
  type TaskRecord,
  type PendingMutationRecord,
} from '@daynori/sync';
import { createApiClient, type DaynoriApiClient } from '@daynori/api-client';
import {
  isTaskOverdue,
  isTaskDueToday,
  compareTasksUpcoming,
  type TaskPriority,
  type TaskStatus,
  type TaskDeadline,
} from '@daynori/domain';

export type PlanViewFilter = 'today' | 'upcoming' | 'overdue' | 'completed' | 'undated' | 'all';
export type PlanSortBy = 'deadline' | 'priority' | 'createdAt';
export type PlanSortDir = 'asc' | 'desc';

export default function PlanPage() {
  const liveRegionId = useId();
  const { themeMode } = useShell();
  const palette = colors[themeMode];
  const { workspaceId, user } = useAuth();

  // Active view filters
  const [activeView, setActiveView] = useState<PlanViewFilter>('today');
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [priorityFilter, setPriorityFilter] = useState<'all' | TaskPriority>('all');
  const [sortBy, setSortBy] = useState<PlanSortBy>('deadline');
  const [sortDir, setSortDir] = useState<PlanSortDir>('asc');

  // Viewing timezone (defaults to system detected IANA zone)
  const [viewingTimezone, setViewingTimezone] = useState<string>(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch {
      return 'UTC';
    }
  });

  // Tasks state
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [folders] = useState<Array<{ id: string; name: string }>>([
    { id: 'inbox', name: 'Inbox' },
    { id: 'work', name: 'Work' },
    { id: 'personal', name: 'Personal' },
  ]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [liveAnnouncement, setLiveAnnouncement] = useState<string>('');

  // Status & Sync Indicators
  const [localSaveStatus, setLocalSaveStatus] = useState<string>('Saved locally');
  const [cloudSyncStatus, setCloudSyncStatus] = useState<string>('Synced');
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  // Quick Capture State
  const [quickTitle, setQuickTitle] = useState('');
  const [quickDeadlinePreset, setQuickDeadlinePreset] = useState<'none' | 'today' | 'tomorrow'>(
    'today'
  );

  // Task Detail Editor State
  const [editingTask, setEditingTask] = useState<TaskRecord | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState<boolean>(false);

  // Bulk Selection State
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [bulkActionConfirm, setBulkActionConfirm] = useState<{
    action: 'complete' | 'delete' | 'move';
    count: number;
    folderId?: string;
  } | null>(null);

  // Undo Toast State
  const [undoToast, setUndoToast] = useState<{
    taskId: string;
    taskTitle: string;
    previousStatus: TaskStatus;
    expiresAt: number;
  } | null>(null);

  // Active references
  const localRepoRef = useRef<IndexedDbLocalRepository | null>(null);
  const syncEngineRef = useRef<SyncEngine | null>(null);
  const apiClientRef = useRef<DaynoriApiClient | null>(null);

  const announce = useCallback((msg: string) => {
    setLiveAnnouncement(msg);
  }, []);

  // Clear selection when view changes to prevent hidden actions
  useEffect(() => {
    setSelectedTaskIds(new Set());
  }, [activeView, selectedFolderId, priorityFilter]);

  // Online / Offline tracking
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      if (syncEngineRef.current) {
        syncEngineRef.current.setNetworkStatus('online');
      }
      setCloudSyncStatus('Synced');
      announce('Network connected. Changes syncing.');
    };
    const handleOffline = () => {
      setIsOnline(false);
      if (syncEngineRef.current) {
        syncEngineRef.current.setNetworkStatus('offline');
      }
      setCloudSyncStatus('Offline');
      announce('Network disconnected. Operating in offline mode.');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [announce]);

  // Undo Toast countdown
  useEffect(() => {
    if (!undoToast) return;
    const timer = setInterval(() => {
      if (Date.now() >= undoToast.expiresAt) {
        setUndoToast(null);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [undoToast]);

  // Create standard mutation helper
  const createMutation = useCallback(
    (params: {
      action: 'create' | 'update' | 'delete';
      command?: string;
      entityId: string;
      baseRevision: number;
      payload?: Record<string, unknown>;
      clientTimestamp?: string;
    }): PendingMutationRecord => ({
      operationId: crypto.randomUUID(),
      deviceId: 'web-browser-tab',
      workspaceId: workspaceId || '',
      userId: user?.id || '',
      entityType: 'task',
      entityId: params.entityId,
      action: params.action,
      command: params.command,
      baseRevision: params.baseRevision,
      payload: params.payload ?? {},
      dependencyOperationIds: [],
      clientTimestamp: params.clientTimestamp || new Date().toISOString(),
      retryCount: 0,
      status: 'pending',
      lastError: null,
    }),
    [workspaceId, user?.id]
  );

  // Initialize Local Repository & Sync Engine
  useEffect(() => {
    let isCancelled = false;

    async function initStorage() {
      if (!workspaceId || !user?.id) {
        setIsLoading(false);
        return;
      }

      try {
        if (!getTrustedDeviceConsent()) {
          setTrustedDeviceConsent(true);
        }

        const repo = new IndexedDbLocalRepository();
        await repo.initialize({
          userId: user.id,
          workspaceId,
        });

        if (isCancelled) {
          await repo.close();
          return;
        }

        localRepoRef.current = repo;

        // Initialize API Client
        const token =
          typeof window !== 'undefined' ? localStorage.getItem('daynori_token') || '' : '';
        const client = createApiClient({
          baseUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000',
          token,
        });
        apiClientRef.current = client;

        // Initialize Sync Engine
        const transport = new ApiClientSyncTransport({ client });
        const engine = new SyncEngine({
          workspaceId,
          userId: user.id,
          repository: repo,
          transport,
          deviceId: 'web-browser-tab',
        });
        syncEngineRef.current = engine;

        // Initial Local Load
        const localTasks = await repo.listTasks(workspaceId);
        if (!isCancelled) {
          setTasks(localTasks.filter((t) => t.deletedAt === null));
          setIsLoading(false);
          setLocalSaveStatus('Saved locally');
          setCloudSyncStatus(navigator.onLine ? 'Synced' : 'Offline');
        }

        // Trigger Sync in background
        if (navigator.onLine) {
          void engine.synchronize().then(() => {
            if (!isCancelled) {
              void repo.listTasks(workspaceId).then((refreshed) => {
                if (!isCancelled) {
                  setTasks(refreshed.filter((t) => t.deletedAt === null));
                }
              });
            }
          });
        }
      } catch (err: unknown) {
        if (!isCancelled) {
          setErrorMessage(
            err instanceof Error ? err.message : 'Failed to initialize task storage.'
          );
          setIsLoading(false);
        }
      }
    }

    void initStorage();

    return () => {
      isCancelled = true;
      if (localRepoRef.current) {
        void localRepoRef.current.close();
      }
    };
  }, [workspaceId, user?.id]);

  // Filter and Sort Tasks
  const displayedTasks = useMemo(() => {
    const now = new Date();

    return tasks
      .filter((t) => {
        // Folder filter
        if (selectedFolderId !== null) {
          if (t.folderId !== selectedFolderId) return false;
        }

        // Priority filter
        if (priorityFilter !== 'all') {
          if (t.priority !== priorityFilter) return false;
        }

        // Subtasks: root view shows top-level tasks (parentId === null) or all depending on view
        // Here we group subtasks under parents, so top list shows parentId === null
        if (t.parentId) {
          return false;
        }

        // View Filter
        switch (activeView) {
          case 'today':
            if (t.status === 'completed' || t.status === 'cancelled') return false;
            return (
              isTaskDueToday(t, now, viewingTimezone) || isTaskOverdue(t, now, viewingTimezone)
            );
          case 'upcoming':
            if (t.status === 'completed' || t.status === 'cancelled') return false;
            if (t.deadline.type === 'none') return false;
            return (
              !isTaskOverdue(t, now, viewingTimezone) && !isTaskDueToday(t, now, viewingTimezone)
            );
          case 'overdue':
            if (t.status === 'completed' || t.status === 'cancelled') return false;
            return isTaskOverdue(t, now, viewingTimezone);
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
      .sort((a, b) => {
        if (sortBy === 'deadline') {
          const comp = compareTasksUpcoming(a, b, viewingTimezone);
          return sortDir === 'asc' ? comp : -comp;
        }
        if (sortBy === 'priority') {
          const weights = { urgent: 4, high: 3, normal: 2, low: 1 };
          const diff = weights[b.priority] - weights[a.priority];
          return sortDir === 'asc' ? diff : -diff;
        }
        // createdAt
        const diff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        return sortDir === 'asc' ? diff : -diff;
      });
  }, [tasks, selectedFolderId, priorityFilter, activeView, viewingTimezone, sortBy, sortDir]);

  // Helper to find child subtasks for a parent task
  const getSubtasksForParent = useCallback(
    (parentId: string) => {
      return tasks.filter((t) => t.parentId === parentId && t.deletedAt === null);
    },
    [tasks]
  );

  // Quick Task Creation
  const handleQuickAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle = quickTitle.trim();
    if (!cleanTitle || !workspaceId || !user?.id) return;

    let deadline: TaskDeadline = { type: 'none' };
    const today = new Date();
    if (quickDeadlinePreset === 'today') {
      const todayDateStr = today.toISOString().slice(0, 10);
      deadline = { type: 'date', date: todayDateStr };
    } else if (quickDeadlinePreset === 'tomorrow') {
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowDateStr = tomorrow.toISOString().slice(0, 10);
      deadline = { type: 'date', date: tomorrowDateStr };
    }

    const taskId = crypto.randomUUID();
    const nowIso = new Date().toISOString();

    const newTask: TaskRecord = {
      id: taskId,
      workspaceId,
      folderId: selectedFolderId ?? null,
      title: cleanTitle,
      details: null,
      priority: 'normal',
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

    setQuickTitle('');
    setTasks((prev) => [newTask, ...prev]);
    announce(`Created task: ${cleanTitle}`);

    // Persist locally
    if (localRepoRef.current) {
      await localRepoRef.current.upsertTask(newTask);
      setLocalSaveStatus('Saved locally');

      // Enqueue mutation for sync
      const mutation = createMutation({
        action: 'create',
        command: 'createTask',
        entityId: taskId,
        baseRevision: 0,
        payload: {
          title: cleanTitle,
          priority: 'normal',
          deadline,
          folderId: selectedFolderId,
        },
      });
      await localRepoRef.current.enqueueMutation(mutation);

      if (syncEngineRef.current && navigator.onLine) {
        void syncEngineRef.current.synchronize();
      }
    }
  };

  // Toggle Task Completion
  const handleToggleComplete = async (taskId: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task || !workspaceId || !user?.id) return;

    const isCompleting = task.status !== 'completed';
    const newStatus: TaskStatus = isCompleting ? 'completed' : 'todo';
    const nowIso = new Date().toISOString();

    const updatedTask: TaskRecord = {
      ...task,
      status: newStatus,
      completedAt: isCompleting ? nowIso : null,
      reopenedAt: !isCompleting ? nowIso : task.reopenedAt,
      completionHistory: isCompleting
        ? [...task.completionHistory, { completedAt: nowIso }]
        : [
            ...task.completionHistory,
            { completedAt: task.completedAt || nowIso, reopenedAt: nowIso },
          ],
      serverRevision: task.serverRevision + 1,
      updatedAt: nowIso,
    };

    setTasks((prev) => prev.map((t) => (t.id === taskId ? updatedTask : t)));

    if (isCompleting) {
      announce(`Task "${task.title}" completed.`);
      setUndoToast({
        taskId,
        taskTitle: task.title,
        previousStatus: task.status,
        expiresAt: Date.now() + 5000,
      });
    } else {
      announce(`Task "${task.title}" reopened.`);
    }

    if (localRepoRef.current) {
      await localRepoRef.current.upsertTask(updatedTask);
      setLocalSaveStatus('Saved locally');

      const mutation = createMutation({
        action: 'update',
        command: isCompleting ? 'completeTask' : 'reopenTask',
        entityId: taskId,
        baseRevision: task.serverRevision,
        payload: {
          status: newStatus,
          completedAt: updatedTask.completedAt,
          reopenedAt: updatedTask.reopenedAt,
        },
      });
      await localRepoRef.current.enqueueMutation(mutation);

      if (syncEngineRef.current && navigator.onLine) {
        void syncEngineRef.current.synchronize();
      }
    }
  };

  // Undo Completion
  const handleUndo = async () => {
    if (!undoToast) return;
    const { taskId, previousStatus } = undoToast;
    setUndoToast(null);

    const task = tasks.find((t) => t.id === taskId);
    if (!task || !workspaceId || !user?.id) return;

    const nowIso = new Date().toISOString();
    const restoredTask: TaskRecord = {
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

    setTasks((prev) => prev.map((t) => (t.id === taskId ? restoredTask : t)));
    announce(`Undid completion for "${task.title}".`);

    if (localRepoRef.current) {
      await localRepoRef.current.upsertTask(restoredTask);
      const mutation = createMutation({
        action: 'update',
        command: 'reopenTask',
        entityId: taskId,
        baseRevision: task.serverRevision,
        payload: { status: previousStatus, reopenedAt: nowIso },
      });
      await localRepoRef.current.enqueueMutation(mutation);

      if (syncEngineRef.current && navigator.onLine) {
        void syncEngineRef.current.synchronize();
      }
    }
  };

  // Save Task from Detail Editor
  const handleSaveDetailTask = async (data: {
    title: string;
    details?: string | null;
    priority: TaskPriority;
    status: TaskStatus;
    deadline: TaskDeadline;
    folderId?: string | null;
    tags: string[];
    subtasks?: Array<{ id?: string; title: string; status: TaskStatus }>;
  }) => {
    if (!workspaceId || !user?.id) return;
    const nowIso = new Date().toISOString();

    if (editingTask) {
      // Update existing task
      const updated: TaskRecord = {
        ...editingTask,
        title: data.title,
        details: data.details ?? null,
        priority: data.priority,
        status: data.status,
        deadline: data.deadline,
        folderId: data.folderId ?? null,
        tags: data.tags,
        serverRevision: editingTask.serverRevision + 1,
        updatedAt: nowIso,
      };

      setTasks((prev) => prev.map((t) => (t.id === editingTask.id ? updated : t)));
      setEditingTask(null);
      announce(`Updated task "${data.title}"`);

      if (localRepoRef.current) {
        await localRepoRef.current.upsertTask(updated);
        const mutation = createMutation({
          action: 'update',
          command: 'updateTask',
          entityId: editingTask.id,
          baseRevision: editingTask.serverRevision,
          payload: {
            title: data.title,
            details: data.details ?? null,
            priority: data.priority,
            status: data.status,
            deadline: data.deadline,
            folderId: data.folderId ?? null,
            tags: data.tags,
          },
        });
        await localRepoRef.current.enqueueMutation(mutation);

        // Process newly added subtasks
        if (data.subtasks && data.subtasks.length > 0) {
          for (let i = 0; i < data.subtasks.length; i++) {
            const st = data.subtasks[i]!;
            if (!st.id) {
              const subtaskId = crypto.randomUUID();
              const newSubtask: TaskRecord = {
                id: subtaskId,
                workspaceId,
                folderId: data.folderId ?? null,
                title: st.title,
                details: null,
                priority: data.priority,
                status: st.status,
                deadline: { type: 'none' },
                completedAt: null,
                reopenedAt: null,
                completionHistory: [],
                parentId: editingTask.id,
                subtaskOrder: i + 1,
                tags: [],
                serverRevision: 1,
                createdAt: nowIso,
                updatedAt: nowIso,
                deletedAt: null,
              };
              await localRepoRef.current.upsertTask(newSubtask);
              const subMutation = createMutation({
                action: 'create',
                command: 'createTask',
                entityId: subtaskId,
                baseRevision: 0,
                payload: {
                  title: st.title,
                  parentId: editingTask.id,
                  subtaskOrder: i + 1,
                },
              });
              await localRepoRef.current.enqueueMutation(subMutation);
              setTasks((prev) => [...prev, newSubtask]);
            }
          }
        }

        if (syncEngineRef.current && navigator.onLine) {
          void syncEngineRef.current.synchronize();
        }
      }
    } else {
      // Create fresh task from editor
      const newId = crypto.randomUUID();
      const freshTask: TaskRecord = {
        id: newId,
        workspaceId,
        folderId: data.folderId ?? null,
        title: data.title,
        details: data.details ?? null,
        priority: data.priority,
        status: data.status,
        deadline: data.deadline,
        completedAt: data.status === 'completed' ? nowIso : null,
        reopenedAt: null,
        completionHistory: data.status === 'completed' ? [{ completedAt: nowIso }] : [],
        parentId: null,
        subtaskOrder: 0,
        tags: data.tags,
        serverRevision: 1,
        createdAt: nowIso,
        updatedAt: nowIso,
        deletedAt: null,
      };

      setTasks((prev) => [freshTask, ...prev]);
      setIsCreatingNew(false);
      announce(`Created task "${data.title}"`);

      if (localRepoRef.current) {
        await localRepoRef.current.upsertTask(freshTask);
        const mutation = createMutation({
          action: 'create',
          command: 'createTask',
          entityId: newId,
          baseRevision: 0,
          payload: {
            title: data.title,
            details: data.details ?? null,
            priority: data.priority,
            status: data.status,
            deadline: data.deadline,
            folderId: data.folderId ?? null,
            tags: data.tags,
          },
        });
        await localRepoRef.current.enqueueMutation(mutation);

        if (syncEngineRef.current && navigator.onLine) {
          void syncEngineRef.current.synchronize();
        }
      }
    }
  };

  // Delete / Trash Task
  const handleDeleteTask = async () => {
    if (!editingTask || !workspaceId || !user?.id) return;
    const taskId = editingTask.id;
    const taskTitle = editingTask.title;
    setEditingTask(null);

    setTasks((prev) => prev.filter((t) => t.id !== taskId && t.parentId !== taskId));
    announce(`Deleted task "${taskTitle}"`);

    if (localRepoRef.current) {
      await localRepoRef.current.deleteTask(workspaceId, taskId);
      const mutation = createMutation({
        action: 'delete',
        command: 'trashTask',
        entityId: taskId,
        baseRevision: editingTask.serverRevision,
      });
      await localRepoRef.current.enqueueMutation(mutation);

      if (syncEngineRef.current && navigator.onLine) {
        void syncEngineRef.current.synchronize();
      }
    }
  };

  // Bulk Actions
  const handleSelectTask = (taskId: string, selected: boolean) => {
    setSelectedTaskIds((prev) => {
      const next = new Set(prev);
      if (selected) {
        next.add(taskId);
      } else {
        next.delete(taskId);
      }
      return next;
    });
  };

  const handleSelectAllVisible = (selected: boolean) => {
    if (selected) {
      const allIds = new Set(displayedTasks.map((t) => t.id));
      setSelectedTaskIds(allIds);
    } else {
      setSelectedTaskIds(new Set());
    }
  };

  const handleExecuteBulkAction = async () => {
    if (!bulkActionConfirm || !workspaceId || !user?.id) return;
    const { action, folderId: targetFolderId } = bulkActionConfirm;
    const targetIds = Array.from(selectedTaskIds);
    setBulkActionConfirm(null);
    setSelectedTaskIds(new Set());

    const nowIso = new Date().toISOString();

    if (action === 'complete') {
      setTasks((prev) =>
        prev.map((t) =>
          targetIds.includes(t.id)
            ? {
                ...t,
                status: 'completed',
                completedAt: nowIso,
                completionHistory: [...t.completionHistory, { completedAt: nowIso }],
                serverRevision: t.serverRevision + 1,
                updatedAt: nowIso,
              }
            : t
        )
      );
      announce(`Completed ${targetIds.length} tasks.`);

      if (localRepoRef.current) {
        for (const id of targetIds) {
          const t = tasks.find((item) => item.id === id);
          if (t) {
            await localRepoRef.current.upsertTask({
              ...t,
              status: 'completed',
              completedAt: nowIso,
              serverRevision: t.serverRevision + 1,
              updatedAt: nowIso,
            });
            const mutation = createMutation({
              action: 'update',
              command: 'completeTask',
              entityId: id,
              baseRevision: t.serverRevision,
              payload: { status: 'completed', completedAt: nowIso },
            });
            await localRepoRef.current.enqueueMutation(mutation);
          }
        }
      }
    } else if (action === 'delete') {
      setTasks((prev) => prev.filter((t) => !targetIds.includes(t.id)));
      announce(`Deleted ${targetIds.length} tasks.`);

      if (localRepoRef.current) {
        for (const id of targetIds) {
          const t = tasks.find((item) => item.id === id);
          if (t) {
            await localRepoRef.current.deleteTask(workspaceId, id);
            const mutation = createMutation({
              action: 'delete',
              command: 'trashTask',
              entityId: id,
              baseRevision: t.serverRevision,
            });
            await localRepoRef.current.enqueueMutation(mutation);
          }
        }
      }
    } else if (action === 'move') {
      setTasks((prev) =>
        prev.map((t) =>
          targetIds.includes(t.id)
            ? {
                ...t,
                folderId: targetFolderId ?? null,
                serverRevision: t.serverRevision + 1,
                updatedAt: nowIso,
              }
            : t
        )
      );
      announce(`Moved ${targetIds.length} tasks.`);
    }

    if (syncEngineRef.current && navigator.onLine) {
      void syncEngineRef.current.synchronize();
    }
  };

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
      {/* Screen reader live announcements */}
      <div id={liveRegionId} role="status" aria-live="polite" className="sr-only">
        {liveAnnouncement}
      </div>

      {/* Page Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: `${spacing.sm}px`,
          marginBottom: `${spacing.md}px`,
        }}
      >
        <div>
          <h1
            style={{
              fontSize: `${typography.webScale.pageTitle}px`,
              lineHeight: typography.lineHeight.tight,
              fontFamily: typography.fontFamily.sans,
              fontWeight: 700,
              margin: 0,
              color: palette.text.primary,
            }}
          >
            Plan
          </h1>
          <p
            style={{
              fontSize: `${typography.webScale.body}px`,
              lineHeight: typography.lineHeight.relaxed,
              fontFamily: typography.fontFamily.sans,
              color: palette.text.secondary,
              margin: '4px 0 0',
            }}
          >
            Upcoming task lists, priorities, and deadlines
          </p>
        </div>

        {/* Sync & Save status indicators & timezone */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: `${spacing.sm}px`,
            flexWrap: 'wrap',
          }}
        >
          <select
            value={viewingTimezone}
            onChange={(e) => setViewingTimezone(e.target.value)}
            aria-label="Viewing timezone"
            style={{
              fontSize: '12px',
              padding: '3px 8px',
              borderRadius: radii.pill,
              border: `1px solid ${palette.border.subtle}`,
              backgroundColor: palette.surface,
              color: palette.text.primary,
            }}
          >
            <option value={viewingTimezone}>{viewingTimezone}</option>
            <option value="Asia/Dhaka">Asia/Dhaka (+06:00)</option>
            <option value="America/New_York">America/New_York</option>
            <option value="UTC">UTC (+00:00)</option>
          </select>
          <span
            style={{
              fontSize: '12px',
              padding: '3px 8px',
              borderRadius: radii.pill,
              backgroundColor: themeMode === 'dark' ? '#1e293b' : '#f1f5f9',
              color: palette.text.secondary,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            💾 {localSaveStatus}
          </span>
          <span
            style={{
              fontSize: '12px',
              padding: '3px 8px',
              borderRadius: radii.pill,
              backgroundColor: isOnline
                ? themeMode === 'dark'
                  ? '#064e3b'
                  : '#dcfce7'
                : themeMode === 'dark'
                  ? '#78350f'
                  : '#fef3c7',
              color: isOnline
                ? themeMode === 'dark'
                  ? '#a7f3d0'
                  : '#15803d'
                : themeMode === 'dark'
                  ? '#fde68a'
                  : '#b45309',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            {isOnline ? `☁️ ${cloudSyncStatus}` : '⚡ Offline'}
          </span>
          <Button variant="primary" size="compact" onClick={() => setIsCreatingNew(true)}>
            + New Task
          </Button>
        </div>
      </div>

      {/* Error message banner */}
      {errorMessage && (
        <div style={{ marginBottom: `${spacing.md}px` }}>
          <Feedback
            severity="danger"
            message={errorMessage}
            onDismiss={() => setErrorMessage(null)}
          />
        </div>
      )}

      {/* Quick Capture Bar */}
      <Card
        style={{
          marginBottom: `${spacing.lg}px`,
          padding: `${spacing.base}px`,
          backgroundColor: palette.surface,
          border: `1px solid ${palette.border.subtle}`,
        }}
      >
        <form
          onSubmit={handleQuickAdd}
          style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.sm}px` }}
        >
          <div style={{ display: 'flex', gap: `${spacing.sm}px`, alignItems: 'center' }}>
            <input
              type="text"
              value={quickTitle}
              onChange={(e) => setQuickTitle(e.target.value)}
              placeholder="Quick capture a task..."
              aria-label="Quick capture a task"
              style={{
                flex: 1,
                padding: `${spacing.sm}px ${spacing.base}px`,
                borderRadius: radii.sm,
                border: `1px solid ${palette.border.strong}`,
                backgroundColor: palette.background,
                color: palette.text.primary,
                fontSize: '15px',
                minHeight: `${touchTargets.webMin}px`,
                boxSizing: 'border-box',
              }}
            />
            <Button type="submit" variant="primary" disabled={!quickTitle.trim()}>
              Add Task
            </Button>
          </div>

          {/* Quick deadline pills */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '12px', color: palette.text.secondary }}>Due:</span>
            {(
              [
                { key: 'today', label: 'Today' },
                { key: 'tomorrow', label: 'Tomorrow' },
                { key: 'none', label: 'No date' },
              ] as const
            ).map((p) => {
              const active = quickDeadlinePreset === p.key;
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setQuickDeadlinePreset(p.key)}
                  style={{
                    padding: '3px 10px',
                    fontSize: '12px',
                    borderRadius: radii.pill,
                    border: `1px solid ${active ? palette.action.primary : palette.border.subtle}`,
                    backgroundColor: active ? palette.action.primary : 'transparent',
                    color: active ? '#ffffff' : palette.text.secondary,
                    cursor: 'pointer',
                  }}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </form>
      </Card>

      {/* View Tabs */}
      <div
        role="tablist"
        aria-label="Task views"
        style={{
          display: 'flex',
          gap: `${spacing.xs}px`,
          borderBottom: `2px solid ${palette.border}`,
          marginBottom: `${spacing.base}px`,
          overflowX: 'auto',
        }}
      >
        {(
          [
            { key: 'today', label: 'Today' },
            { key: 'upcoming', label: 'Upcoming' },
            { key: 'overdue', label: 'Overdue' },
            { key: 'completed', label: 'Completed' },
            { key: 'undated', label: 'Undated' },
            { key: 'all', label: 'All Tasks' },
          ] as const
        ).map((tab) => {
          const isSelected = activeView === tab.key;
          return (
            <button
              key={tab.key}
              role="tab"
              aria-selected={isSelected}
              onClick={() => setActiveView(tab.key)}
              style={{
                padding: `${spacing.sm}px ${spacing.base}px`,
                fontSize: '14px',
                fontWeight: isSelected ? 600 : 400,
                color: isSelected ? palette.action.primary : palette.text.secondary,
                border: 'none',
                background: 'transparent',
                borderBottom: isSelected
                  ? `2px solid ${palette.action.primary}`
                  : '2px solid transparent',
                marginBottom: '-2px',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Filter and Sort Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: `${spacing.sm}px`,
          marginBottom: `${spacing.base}px`,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: `${spacing.sm}px`,
            flexWrap: 'wrap',
          }}
        >
          {/* Select all checkbox */}
          {displayedTasks.length > 0 && (
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={
                  selectedTaskIds.size === displayedTasks.length && displayedTasks.length > 0
                }
                onChange={(e) => handleSelectAllVisible(e.target.checked)}
                aria-label="Select all visible tasks"
              />
              Select all
            </label>
          )}

          {/* Priority Filter */}
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value as 'all' | TaskPriority)}
            aria-label="Filter by priority"
            style={{
              padding: '4px 8px',
              fontSize: '13px',
              borderRadius: radii.sm,
              border: `1px solid ${palette.border.subtle}`,
              backgroundColor: palette.surface,
              color: palette.text.primary,
            }}
          >
            <option value="all">All Priorities</option>
            <option value="urgent">Urgent only</option>
            <option value="high">High only</option>
            <option value="normal">Normal only</option>
            <option value="low">Low only</option>
          </select>

          {/* Folder Filter */}
          {folders.length > 0 && (
            <select
              value={selectedFolderId || ''}
              onChange={(e) => setSelectedFolderId(e.target.value ? e.target.value : null)}
              aria-label="Filter by folder"
              style={{
                padding: '4px 8px',
                fontSize: '13px',
                borderRadius: radii.sm,
                border: `1px solid ${palette.border.subtle}`,
                backgroundColor: palette.surface,
                color: palette.text.primary,
              }}
            >
              <option value="">All Folders</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  📁 {f.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Sort Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '12px', color: palette.text.secondary }}>Sort:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as PlanSortBy)}
            aria-label="Sort tasks by"
            style={{
              padding: '4px 8px',
              fontSize: '13px',
              borderRadius: radii.sm,
              border: `1px solid ${palette.border.subtle}`,
              backgroundColor: palette.surface,
              color: palette.text.primary,
            }}
          >
            <option value="deadline">Deadline</option>
            <option value="priority">Priority</option>
            <option value="createdAt">Created time</option>
          </select>
          <button
            type="button"
            onClick={() => setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
            aria-label={`Sort direction ${sortDir === 'asc' ? 'ascending' : 'descending'}`}
            style={{
              padding: '4px 8px',
              fontSize: '13px',
              borderRadius: radii.sm,
              border: `1px solid ${palette.border.subtle}`,
              backgroundColor: palette.surface,
              color: palette.text.primary,
              cursor: 'pointer',
            }}
          >
            {sortDir === 'asc' ? '↑' : '↓'}
          </button>
        </div>
      </div>

      {/* Bulk Action Bar (when tasks are selected) */}
      {selectedTaskIds.size > 0 && (
        <div
          role="region"
          aria-label="Bulk actions"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: `${spacing.sm}px ${spacing.base}px`,
            backgroundColor: themeMode === 'dark' ? '#1e293b' : '#eff6ff',
            border: `1px solid ${palette.action.primary}`,
            borderRadius: radii.card,
            marginBottom: `${spacing.base}px`,
          }}
        >
          <span style={{ fontSize: '14px', fontWeight: 600, color: palette.action.primary }}>
            {selectedTaskIds.size} {selectedTaskIds.size === 1 ? 'task' : 'tasks'} selected
          </span>
          <div style={{ display: 'flex', gap: `${spacing.xs}px` }}>
            <Button
              size="compact"
              variant="secondary"
              onClick={() =>
                setBulkActionConfirm({ action: 'complete', count: selectedTaskIds.size })
              }
            >
              Mark Complete
            </Button>
            <Button
              size="compact"
              variant="danger"
              onClick={() =>
                setBulkActionConfirm({ action: 'delete', count: selectedTaskIds.size })
              }
            >
              Delete Selected
            </Button>
            <Button size="compact" variant="subtle" onClick={() => setSelectedTaskIds(new Set())}>
              Clear
            </Button>
          </div>
        </div>
      )}

      {/* Task List */}
      {isLoading ? (
        <div
          style={{ padding: `${spacing.xl}px`, textAlign: 'center', color: palette.text.secondary }}
        >
          Loading tasks...
        </div>
      ) : displayedTasks.length === 0 ? (
        <EmptyState
          title={
            activeView === 'today'
              ? 'No tasks due today'
              : activeView === 'overdue'
                ? 'No overdue tasks'
                : activeView === 'upcoming'
                  ? 'No upcoming tasks'
                  : activeView === 'completed'
                    ? 'No completed tasks'
                    : activeView === 'undated'
                      ? 'No undated tasks'
                      : 'No tasks found'
          }
          description="Keep focused on what matters today, or capture a new task above."
          actionLabel="+ Add Task"
          onAction={() => setIsCreatingNew(true)}
        />
      ) : (
        <div
          role="list"
          aria-label="Task list"
          style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}
        >
          {displayedTasks.map((task) => {
            const childSubtasks = getSubtasksForParent(task.id);
            const completedCount = childSubtasks.filter((s) => s.status === 'completed').length;
            const subtaskCount =
              childSubtasks.length > 0
                ? { completed: completedCount, total: childSubtasks.length }
                : undefined;

            return (
              <React.Fragment key={task.id}>
                <TaskRow
                  id={task.id}
                  title={task.title}
                  details={task.details}
                  priority={task.priority}
                  status={task.status}
                  deadline={task.deadline}
                  folderName={folders.find((f) => f.id === task.folderId)?.name}
                  tags={task.tags}
                  subtaskCount={subtaskCount}
                  depth={1}
                  isSelected={selectedTaskIds.has(task.id)}
                  themeMode={themeMode}
                  userTimezone={viewingTimezone}
                  onToggleComplete={handleToggleComplete}
                  onSelect={handleSelectTask}
                  onClick={() => setEditingTask(task)}
                />

                {/* Indented Subtask Rows */}
                {childSubtasks.map((subtask) => (
                  <TaskRow
                    key={subtask.id}
                    id={subtask.id}
                    title={subtask.title}
                    details={subtask.details}
                    priority={subtask.priority}
                    status={subtask.status}
                    deadline={subtask.deadline}
                    tags={subtask.tags}
                    depth={2}
                    isSelected={selectedTaskIds.has(subtask.id)}
                    themeMode={themeMode}
                    userTimezone={viewingTimezone}
                    onToggleComplete={handleToggleComplete}
                    onSelect={handleSelectTask}
                    onClick={() => setEditingTask(subtask)}
                  />
                ))}
              </React.Fragment>
            );
          })}
        </div>
      )}

      {/* Floating Undo Toast */}
      {undoToast && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            backgroundColor: themeMode === 'dark' ? '#1e293b' : '#0f172a',
            color: '#ffffff',
            padding: `${spacing.sm}px ${spacing.base}px`,
            borderRadius: radii.card,
            display: 'flex',
            alignItems: 'center',
            gap: `${spacing.base}px`,
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.3)',
            zIndex: 1100,
          }}
        >
          <span>Completed "{undoToast.taskTitle}".</span>
          <Button size="compact" variant="secondary" onClick={handleUndo}>
            Undo
          </Button>
        </div>
      )}

      {/* Bulk Action Confirmation Modal */}
      {bulkActionConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="bulk-confirm-title"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: `${spacing.md}px`,
            zIndex: 1200,
          }}
        >
          <div
            style={{
              backgroundColor: palette.surface,
              color: palette.text.primary,
              borderRadius: radii.sheet,
              padding: `${spacing.lg}px`,
              maxWidth: '440px',
              width: '100%',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
            }}
          >
            <h2
              id="bulk-confirm-title"
              style={{
                fontSize: `${typography.webScale.sectionHeading}px`,
                fontFamily: typography.fontFamily.sans,
                fontWeight: 600,
                margin: 0,
                marginBottom: '8px',
              }}
            >
              Confirm Bulk {bulkActionConfirm.action === 'complete' ? 'Completion' : 'Deletion'}
            </h2>
            <p
              style={{
                fontSize: `${typography.webScale.body}px`,
                fontFamily: typography.fontFamily.sans,
                color: palette.text.secondary,
                marginBottom: `${spacing.lg}px`,
              }}
            >
              Are you sure you want to{' '}
              {bulkActionConfirm.action === 'complete' ? 'mark as completed' : 'permanently delete'}{' '}
              <strong>{bulkActionConfirm.count} selected tasks</strong>? This action affects only
              visible, reviewed selections.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: `${spacing.sm}px` }}>
              <Button variant="subtle" size="compact" onClick={() => setBulkActionConfirm(null)}>
                Cancel
              </Button>
              <Button
                variant={bulkActionConfirm.action === 'delete' ? 'danger' : 'primary'}
                size="compact"
                onClick={handleExecuteBulkAction}
              >
                Confirm {bulkActionConfirm.action === 'complete' ? 'Complete' : 'Delete'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Task Detail Editor Modal */}
      {(editingTask || isCreatingNew) && (
        <TaskDetailEditor
          id={editingTask?.id}
          initialTitle={editingTask?.title || ''}
          initialDetails={editingTask?.details || ''}
          initialPriority={editingTask?.priority || 'normal'}
          initialStatus={editingTask?.status || 'todo'}
          initialDeadline={editingTask?.deadline || { type: 'none' }}
          initialFolderId={editingTask?.folderId || selectedFolderId}
          initialTags={editingTask?.tags || []}
          initialSubtasks={
            editingTask
              ? getSubtasksForParent(editingTask.id).map((s) => ({
                  id: s.id,
                  title: s.title,
                  status: s.status,
                }))
              : []
          }
          folders={folders}
          themeMode={themeMode}
          userTimezone={viewingTimezone}
          onSave={handleSaveDetailTask}
          onClose={() => {
            setEditingTask(null);
            setIsCreatingNew(false);
          }}
          onDelete={handleDeleteTask}
        />
      )}
    </div>
  );
}
