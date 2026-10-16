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
import { createWebSyncEngine } from '../../data/syncAdapter';
import {
  type SyncEngine,
  type TaskRecord,
  type ItemHeaderRecord,
  type PendingMutationRecord,
} from '@daynori/sync';
import { createApiClient, type DaynoriApiClient } from '@daynori/api-client';
import {
  isTaskOverdue,
  isTaskDueToday,
  compareTasksUpcoming,
  getCalendarDateInTimezone,
  addCalendarDays,
  type TaskPriority,
  type TaskStatus,
  type TaskDeadline,
} from '@daynori/domain';

export type PlanViewFilter = 'today' | 'upcoming' | 'overdue' | 'completed' | 'undated' | 'all';
export type PlanSortBy = 'deadline' | 'priority' | 'createdAt';
export type PlanSortDir = 'asc' | 'desc';

export interface BulkActionReviewItem {
  id: string;
  revision: number;
  title: string;
}

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

  // Consent & storage state
  const [hasConsent, setHasConsent] = useState<boolean>(() => getTrustedDeviceConsent());
  const [consentRefused, setConsentRefused] = useState<boolean>(false);

  // Tasks & real folders state
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [folders, setFolders] = useState<Array<{ id: string; name: string }>>([]);
  const [bulkMoveTargetFolderId, setBulkMoveTargetFolderId] = useState<string>('');

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [liveAnnouncement, setLiveAnnouncement] = useState<string>('');

  // Status & Sync Indicators
  const [localSaveStatus, setLocalSaveStatus] = useState<string>(
    hasConsent ? 'Saved locally' : 'Device storage off (consent needed)'
  );
  const [cloudSyncStatus, setCloudSyncStatus] = useState<string>('Connecting...');
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
    folderId?: string | null;
    reviewedItems: BulkActionReviewItem[];
  } | null>(null);

  // Undo Toast State
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

  // Initialize Storage, API Proxy, and Sync Engine
  useEffect(() => {
    let isCancelled = false;

    // Reset view state when account/workspace changes to prevent cross-account exposure
    setTasks([]);
    setFolders([]);
    setSelectedTaskIds(new Set());

    // Stop prior sync engine & close prior repository
    if (syncEngineRef.current) {
      void syncEngineRef.current.stop();
      syncEngineRef.current = null;
    }
    if (localRepoRef.current) {
      void localRepoRef.current.close();
      localRepoRef.current = null;
    }

    if (!workspaceId || !user?.id) {
      setLocalSaveStatus('Signed out');
      setCloudSyncStatus('Not connected');
      setIsLoading(false);
      return;
    }

    // Reuse authenticated same-origin API proxy
    const client = createApiClient({
      baseUrl: '/api',
    });
    apiClientRef.current = client;

    async function initStorage() {
      setIsLoading(true);

      const consent = getTrustedDeviceConsent();
      setHasConsent(consent);

      // Load real workspace folders via API proxy
      try {
        const folderRes = await client.listFolders(workspaceId!);
        if (!isCancelled && folderRes.data) {
          setFolders(folderRes.data.map((f) => ({ id: f.id, name: f.name })));
        }
      } catch {
        /* Ignore folder fetch failure in offline mode */
      }

      if (consent) {
        try {
          const repo = new IndexedDbLocalRepository();
          await repo.initialize({
            userId: user!.id,
            workspaceId: workspaceId!,
          });

          if (isCancelled) {
            await repo.close();
            return;
          }

          localRepoRef.current = repo;
          setLocalSaveStatus('Saved locally');

          // Initialize Web Sync Engine with multi-tab coordination
          const engine = createWebSyncEngine({
            repository: repo,
            apiClient: client,
            namespace: { userId: user!.id, workspaceId: workspaceId! },
          });
          syncEngineRef.current = engine;

          // Subscribe to sync engine status changes
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
                  setCloudSyncStatus('Offline — saved locally');
                  break;
                case 'conflict':
                  setCloudSyncStatus('Conflict detected');
                  break;
                case 'error':
                  setCloudSyncStatus('Sync error');
                  break;
                default:
                  setCloudSyncStatus('Synced');
              }
            }
          });

          await engine.start();

          // Load local tasks
          const localTasks = await repo.listTasks(workspaceId!);
          if (!isCancelled) {
            setTasks(localTasks.filter((t) => t.deletedAt === null));
            setIsLoading(false);
            setCloudSyncStatus(navigator.onLine ? 'Synced' : 'Offline');
          }
        } catch (err: unknown) {
          if (!isCancelled) {
            setErrorMessage(
              err instanceof Error ? err.message : 'Failed to initialize local task storage.'
            );
            setIsLoading(false);
          }
        }
      } else {
        // Honest indication: deliberate consent not yet granted
        setLocalSaveStatus('Device storage off (consent needed)');
        setCloudSyncStatus(navigator.onLine ? 'Online only' : 'Offline');

        // When consent is not granted, load directly from authenticated API
        try {
          const res = await client.listTasks(workspaceId!);
          if (!isCancelled && res.data) {
            setTasks(
              res.data.map((t) => ({
                ...t,
                serverRevision: t.revision,
              }))
            );
          }
        } catch {
          /* Fallback offline/unconnected */
        }
        if (!isCancelled) {
          setIsLoading(false);
        }
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
  }, [workspaceId, user?.id, hasConsent]);

  // Execute shared atomic transactional commands across storage and sync
  const executeTaskCommand = async (
    action: 'create' | 'update' | 'delete',
    command: 'createTask' | 'updateTask' | 'completeTask' | 'reopenTask' | 'trashTask',
    task: TaskRecord,
    mutationPayload: Record<string, unknown>
  ): Promise<boolean> => {
    if (!workspaceId || !user?.id) return false;

    const nowIso = new Date().toISOString();
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
      updatedAt: task.updatedAt,
      deletedAt: task.deletedAt,
    };

    if (syncEngineRef.current) {
      try {
        await syncEngineRef.current.saveItem(itemHeader, undefined, command, {
          payload: mutationPayload,
        });
        setLocalSaveStatus('Saved locally');
        return true;
      } catch (err) {
        setErrorMessage(
          err instanceof Error ? err.message : 'Storage write failed. Changes were not persisted.'
        );
        setLocalSaveStatus('Error saving locally');
        return false;
      }
    } else if (localRepoRef.current) {
      try {
        const mutation: PendingMutationRecord = {
          operationId: crypto.randomUUID(),
          deviceId: 'web-browser-tab',
          workspaceId,
          userId: user.id,
          entityType: 'task',
          entityId: task.id,
          action,
          command,
          baseRevision: task.serverRevision,
          payload: mutationPayload,
          dependencyOperationIds: [],
          clientTimestamp: nowIso,
          retryCount: 0,
          status: 'pending',
          lastError: null,
        };
        await localRepoRef.current.saveItemTransaction(
          itemHeader,
          mutation,
          undefined,
          undefined,
          task
        );
        setLocalSaveStatus('Saved locally');
        return true;
      } catch (err) {
        setErrorMessage(
          err instanceof Error ? err.message : 'Storage write failed. Changes were not persisted.'
        );
        setLocalSaveStatus('Error saving locally');
        return false;
      }
    } else if (apiClientRef.current) {
      // Direct API proxy write when trusted-device storage is refused
      try {
        if (command === 'createTask') {
          await apiClientRef.current.createTask(workspaceId, {
            id: task.id,
            title: task.title,
            details: task.details,
            priority: task.priority,
            status: task.status,
            deadline: task.deadline,
            folderId: task.folderId,
            parentId: task.parentId,
            subtaskOrder: task.subtaskOrder,
            tags: task.tags,
            isPinned: false,
            securityScope: 'standard',
          });
        } else if (command === 'trashTask') {
          await apiClientRef.current.trashTask(workspaceId, task.id);
        } else {
          await apiClientRef.current.updateTask(workspaceId, task.id, {
            title: task.title,
            details: task.details,
            priority: task.priority,
            status: task.status,
            deadline: task.deadline,
            folderId: task.folderId,
            parentId: task.parentId,
            subtaskOrder: task.subtaskOrder,
            tags: task.tags,
            baseRevision: task.serverRevision,
          });
        }
        setLocalSaveStatus('Online only (no device storage)');
        return true;
      } catch (err) {
        setErrorMessage(
          err instanceof Error ? err.message : 'API write failed. Changes were not persisted.'
        );
        return false;
      }
    }
    return false;
  };

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

        // Subtasks: root view shows top-level tasks (parentId === null)
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

  // Quick Task Creation (timezone-aware calendar dates)
  const handleQuickAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle = quickTitle.trim();
    if (!cleanTitle || !workspaceId || !user?.id) return;

    let deadline: TaskDeadline = { type: 'none' };
    const todayDateStr = getCalendarDateInTimezone(new Date(), viewingTimezone);
    if (quickDeadlinePreset === 'today') {
      deadline = { type: 'date', date: todayDateStr };
    } else if (quickDeadlinePreset === 'tomorrow') {
      const tomorrowDateStr = addCalendarDays(todayDateStr, 1);
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

    const mutationPayload = {
      title: cleanTitle,
      priority: 'normal',
      deadline,
      folderId: selectedFolderId,
    };

    // Atomic durable write
    const ok = await executeTaskCommand('create', 'createTask', newTask, mutationPayload);
    if (ok) {
      setQuickTitle('');
      setTasks((prev) => [newTask, ...prev]);
      announce(`Created task: ${cleanTitle}`);
    }
    // On failure, quickTitle is deliberately retained
  };

  // Toggle Task Completion
  const handleToggleComplete = async (taskId: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task || !workspaceId || !user?.id) return;

    const isCompleting = task.status !== 'completed';
    const newStatus: TaskStatus = isCompleting ? 'completed' : 'todo';
    const nowIso = new Date().toISOString();

    const previousHistory = [...task.completionHistory];
    const previousCompletedAt = task.completedAt;
    const previousReopenedAt = task.reopenedAt;
    const previousStatus = task.status;
    const previousRevision = task.serverRevision;

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

    const mutationPayload = {
      status: newStatus,
      completedAt: updatedTask.completedAt,
      reopenedAt: updatedTask.reopenedAt,
    };

    const ok = await executeTaskCommand(
      'update',
      isCompleting ? 'completeTask' : 'reopenTask',
      updatedTask,
      mutationPayload
    );

    if (ok) {
      setTasks((prev) => prev.map((t) => (t.id === taskId ? updatedTask : t)));

      if (isCompleting) {
        announce(`Task "${task.title}" completed.`);
        setUndoToast({
          taskId,
          taskTitle: task.title,
          previousStatus,
          previousCompletedAt,
          previousReopenedAt,
          previousHistory,
          previousRevision,
          expiresAt: Date.now() + 5000,
        });
      } else {
        announce(`Task "${task.title}" reopened.`);
      }
    }
  };

  // Revision-protected Undo Completion without fabricating extra history
  const handleUndo = async () => {
    if (!undoToast) return;
    const {
      taskId,
      taskTitle,
      previousStatus,
      previousCompletedAt,
      previousReopenedAt,
      previousHistory,
      previousRevision,
    } = undoToast;
    setUndoToast(null);

    const task = tasks.find((t) => t.id === taskId);
    if (!task || !workspaceId || !user?.id) return;

    const nowIso = new Date().toISOString();
    const restoredTask: TaskRecord = {
      ...task,
      status: previousStatus,
      completedAt: previousCompletedAt,
      reopenedAt: previousReopenedAt,
      completionHistory: previousHistory,
      serverRevision: task.serverRevision + 1,
      updatedAt: nowIso,
    };

    const ok = await executeTaskCommand('update', 'reopenTask', restoredTask, {
      status: previousStatus,
      completedAt: previousCompletedAt,
      reopenedAt: previousReopenedAt,
      baseRevision: previousRevision,
    });

    if (ok) {
      setTasks((prev) => prev.map((t) => (t.id === taskId ? restoredTask : t)));
      announce(`Undid completion for "${taskTitle}".`);
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

      const mutationPayload = {
        title: data.title,
        details: data.details ?? null,
        priority: data.priority,
        status: data.status,
        deadline: data.deadline,
        folderId: data.folderId ?? null,
        tags: data.tags,
      };

      const ok = await executeTaskCommand('update', 'updateTask', updated, mutationPayload);
      if (ok) {
        setTasks((prev) => prev.map((t) => (t.id === editingTask.id ? updated : t)));

        // Persist newly added subtasks atomically
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
              const subOk = await executeTaskCommand('create', 'createTask', newSubtask, {
                title: st.title,
                parentId: editingTask.id,
                subtaskOrder: i + 1,
              });
              if (subOk) {
                setTasks((prev) => [...prev, newSubtask]);
              }
            }
          }
        }

        setEditingTask(null);
        announce(`Updated task "${data.title}"`);
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

      const mutationPayload = {
        title: data.title,
        details: data.details ?? null,
        priority: data.priority,
        status: data.status,
        deadline: data.deadline,
        folderId: data.folderId ?? null,
        tags: data.tags,
      };

      const ok = await executeTaskCommand('create', 'createTask', freshTask, mutationPayload);
      if (ok) {
        setTasks((prev) => [freshTask, ...prev]);
        setIsCreatingNew(false);
        announce(`Created task "${data.title}"`);
      }
    }
  };

  // Delete / Trash Task preserving payload as tombstone
  const handleDeleteTask = async () => {
    if (!editingTask || !workspaceId || !user?.id) return;
    const taskId = editingTask.id;
    const taskTitle = editingTask.title;
    const nowIso = new Date().toISOString();

    const trashedTask: TaskRecord = {
      ...editingTask,
      deletedAt: nowIso,
      serverRevision: editingTask.serverRevision + 1,
      updatedAt: nowIso,
    };

    const ok = await executeTaskCommand('delete', 'trashTask', trashedTask, {
      deletedAt: nowIso,
    });

    if (ok) {
      setTasks((prev) => prev.filter((t) => t.id !== taskId && t.parentId !== taskId));
      setEditingTask(null);
      announce(`Moved task "${taskTitle}" to trash.`);
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

  // Open Bulk Action Confirmation capturing reviewed IDs and revisions
  const handleOpenBulkConfirm = (
    action: 'complete' | 'delete' | 'move',
    folderId?: string | null
  ) => {
    const reviewedItems: BulkActionReviewItem[] = [];
    for (const id of selectedTaskIds) {
      const t = tasks.find((item) => item.id === id);
      if (t) {
        reviewedItems.push({ id: t.id, revision: t.serverRevision, title: t.title });
      }
    }

    if (reviewedItems.length === 0) return;

    setBulkActionConfirm({
      action,
      count: reviewedItems.length,
      folderId: folderId ?? null,
      reviewedItems,
    });
  };

  // Execute Bulk Action with scope revalidation and explicit partial failure reporting
  const handleExecuteBulkAction = async () => {
    if (!bulkActionConfirm || !workspaceId || !user?.id) return;
    const { action, folderId: targetFolderId, reviewedItems } = bulkActionConfirm;
    setBulkActionConfirm(null);
    setSelectedTaskIds(new Set());

    const nowIso = new Date().toISOString();
    let succeededCount = 0;
    const failedTitles: string[] = [];

    for (const reviewed of reviewedItems) {
      // Revalidate item presence, scope, and revision
      const currentTask = tasks.find((t) => t.id === reviewed.id && t.workspaceId === workspaceId);
      if (!currentTask || currentTask.serverRevision !== reviewed.revision) {
        failedTitles.push(reviewed.title);
        continue;
      }

      if (action === 'complete') {
        const updated: TaskRecord = {
          ...currentTask,
          status: 'completed',
          completedAt: nowIso,
          completionHistory: [...currentTask.completionHistory, { completedAt: nowIso }],
          serverRevision: currentTask.serverRevision + 1,
          updatedAt: nowIso,
        };
        const ok = await executeTaskCommand('update', 'completeTask', updated, {
          status: 'completed',
          completedAt: nowIso,
        });
        if (ok) {
          setTasks((prev) => prev.map((t) => (t.id === reviewed.id ? updated : t)));
          succeededCount++;
        } else {
          failedTitles.push(reviewed.title);
        }
      } else if (action === 'delete') {
        const trashed: TaskRecord = {
          ...currentTask,
          deletedAt: nowIso,
          serverRevision: currentTask.serverRevision + 1,
          updatedAt: nowIso,
        };
        const ok = await executeTaskCommand('delete', 'trashTask', trashed, {
          deletedAt: nowIso,
        });
        if (ok) {
          setTasks((prev) =>
            prev.filter((t) => t.id !== reviewed.id && t.parentId !== reviewed.id)
          );
          succeededCount++;
        } else {
          failedTitles.push(reviewed.title);
        }
      } else if (action === 'move') {
        const moved: TaskRecord = {
          ...currentTask,
          folderId: targetFolderId ?? null,
          serverRevision: currentTask.serverRevision + 1,
          updatedAt: nowIso,
        };
        const ok = await executeTaskCommand('update', 'updateTask', moved, {
          folderId: targetFolderId ?? null,
        });
        if (ok) {
          setTasks((prev) => prev.map((t) => (t.id === reviewed.id ? moved : t)));
          succeededCount++;
        } else {
          failedTitles.push(reviewed.title);
        }
      }
    }

    if (failedTitles.length > 0) {
      setErrorMessage(
        `Action partially succeeded: ${succeededCount} processed, but ${failedTitles.length} items failed or had conflicting edits (${failedTitles.join(', ')}).`
      );
    } else {
      announce(`Processed ${succeededCount} tasks successfully.`);
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
            <option value="Pacific/Kiritimati">Pacific/Kiritimati (+14:00)</option>
            <option value="UTC">UTC (+00:00)</option>
          </select>

          <span
            style={{
              fontSize: '12px',
              padding: '3px 8px',
              borderRadius: radii.pill,
              backgroundColor: hasConsent
                ? themeMode === 'dark'
                  ? '#1e293b'
                  : '#f1f5f9'
                : palette.status.warningBg,
              color: hasConsent ? palette.text.secondary : palette.status.warning,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              border: `1px solid ${hasConsent ? palette.border.subtle : palette.status.warningBorder}`,
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

      {/* Honest Trusted-Device Consent Banner & Refusal Path */}
      {!hasConsent && !consentRefused && (
        <Card
          style={{
            marginBottom: `${spacing.md}px`,
            padding: `${spacing.base}px`,
            backgroundColor: themeMode === 'dark' ? 'rgba(234, 179, 8, 0.1)' : '#fffbeb',
            border: '1px solid #f59e0b',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span style={{ fontSize: '14px', fontWeight: 600, color: palette.text.primary }}>
              🔒 Trusted-Device Local Storage Consent
            </span>
            <p
              style={{
                fontSize: '13px',
                margin: 0,
                color: palette.text.secondary,
                lineHeight: 1.4,
              }}
            >
              Offline device storage is disabled on this browser. To keep tasks available offline
              and speed up navigation, enable trusted-device storage. You may also refuse and
              continue in online-only mode.
            </p>
            <div style={{ display: 'flex', gap: `${spacing.sm}px`, marginTop: '4px' }}>
              <Button
                variant="primary"
                size="compact"
                onClick={() => {
                  setTrustedDeviceConsent(true);
                  setHasConsent(true);
                  announce('Trusted-device storage enabled.');
                }}
              >
                Enable Device Storage
              </Button>
              <Button
                variant="subtle"
                size="compact"
                onClick={() => {
                  setConsentRefused(true);
                  announce('Operating in online-only mode without local persistence.');
                }}
              >
                Continue without Device Storage
              </Button>
            </div>
          </div>
        </Card>
      )}

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
            flexWrap: 'wrap',
            gap: `${spacing.sm}px`,
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
          <div
            style={{
              display: 'flex',
              gap: `${spacing.xs}px`,
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
            <Button
              size="compact"
              variant="secondary"
              onClick={() => handleOpenBulkConfirm('complete')}
            >
              Mark Complete
            </Button>
            {folders.length > 0 && (
              <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                <select
                  value={bulkMoveTargetFolderId}
                  onChange={(e) => setBulkMoveTargetFolderId(e.target.value)}
                  aria-label="Select target folder for bulk move"
                  style={{
                    padding: '3px 8px',
                    fontSize: '12px',
                    borderRadius: radii.sm,
                    border: `1px solid ${palette.border.subtle}`,
                    backgroundColor: palette.surface,
                    color: palette.text.primary,
                  }}
                >
                  <option value="">Move to Inbox (None)</option>
                  {folders.map((f) => (
                    <option key={f.id} value={f.id}>
                      📁 {f.name}
                    </option>
                  ))}
                </select>
                <Button
                  size="compact"
                  variant="secondary"
                  onClick={() => handleOpenBulkConfirm('move', bulkMoveTargetFolderId || null)}
                >
                  Move
                </Button>
              </div>
            )}
            <Button size="compact" variant="danger" onClick={() => handleOpenBulkConfirm('delete')}>
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
              Confirm Bulk{' '}
              {bulkActionConfirm.action === 'complete'
                ? 'Completion'
                : bulkActionConfirm.action === 'delete'
                  ? 'Deletion'
                  : 'Move'}
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
              {bulkActionConfirm.action === 'complete'
                ? 'mark as completed'
                : bulkActionConfirm.action === 'delete'
                  ? 'move to trash'
                  : `move to ${folders.find((f) => f.id === bulkActionConfirm.folderId)?.name || 'Inbox'}`}{' '}
              <strong>{bulkActionConfirm.count} selected tasks</strong>? This action will apply to
              all reviewed selections.
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
                Confirm{' '}
                {bulkActionConfirm.action === 'complete'
                  ? 'Complete'
                  : bulkActionConfirm.action === 'delete'
                    ? 'Delete'
                    : 'Move'}
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
