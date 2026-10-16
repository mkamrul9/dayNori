'use client';

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
import { createApiClient } from '@daynori/api-client';
import {
  getCalendarDateInTimezone,
  addCalendarDays,
  calculatePlannedInstant,
  computeDeterministicOccurrenceId,
  isRoutineScheduledOnDate,
  calculateGentleProgress,
  reconcileOccurrencesOnScheduleChange,
  isTaskDueToday,
  isTaskOverdue,
  type RoutineFrequency,
  type Weekday,
  type RoutineOccurrenceStatus,
  type RoutineOccurrence,
  type RoutineTemplateRule,
} from '@daynori/domain';

export const TodayView: React.FC = () => {
  const liveRegionId = useId();
  const { themeMode } = useShell();
  const palette = colors[themeMode];
  const { workspaceId, user } = useAuth();

  // Viewing timezone
  const [viewingTimezone] = useState<string>(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch {
      return 'UTC';
    }
  });

  // Calculate Today and Yesterday calendar dates in user's timezone
  const todayDate = useMemo(() => {
    return getCalendarDateInTimezone(new Date(), viewingTimezone);
  }, [viewingTimezone]);

  const yesterdayDate = useMemo(() => {
    return addCalendarDays(todayDate, -1);
  }, [todayDate]);

  // Routines & Occurrences state
  const [routines, setRoutines] = useState<RoutineRecord[]>([]);
  const [occurrences, setOccurrences] = useState<RoutineOccurrenceRecord[]>([]);
  const [tasks, setTasks] = useState<TaskRecord[]>([]);

  // Editor & History modal states
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingRoutine, setEditingRoutine] = useState<RoutineRecord | null>(null);
  const [historyRoutine, setHistoryRoutine] = useState<RoutineRecord | null>(null);

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
  const [showEmptyState, setShowEmptyState] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [liveAnnouncement, setLiveAnnouncement] = useState('');

  // Storage and Sync references
  const localRepoRef = useRef<IndexedDbLocalRepository | null>(null);
  const syncEngineRef = useRef<SyncEngine | null>(null);

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

  // Load and initialize data from IndexedDB & Sync Engine
  const loadData = useCallback(async () => {
    if (!workspaceId) {
      setIsLoading(false);
      return;
    }

    try {
      if (!localRepoRef.current) {
        const repo = new IndexedDbLocalRepository();
        await repo.initialize({
          userId: user?.id || 'anonymous',
          workspaceId,
        });
        localRepoRef.current = repo;
      }

      if (!syncEngineRef.current) {
        const client = createApiClient({
          baseUrl: typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000',
        });
        const engine = createWebSyncEngine({
          repository: localRepoRef.current,
          apiClient: client,
          namespace: {
            userId: user?.id || 'anonymous',
            workspaceId,
          },
        });
        syncEngineRef.current = engine;
        await engine.start();
      }

      const repo = localRepoRef.current;
      const loadedRoutines = await repo.listRoutines(workspaceId);
      const loadedOccurrences = await repo.listRoutineOccurrences(
        workspaceId,
        undefined,
        yesterdayDate,
        addCalendarDays(todayDate, 7)
      );

      // Generate missing occurrences for today if routine is scheduled today
      const updatedOccurrences = [...loadedOccurrences];
      for (const r of loadedRoutines) {
        if (!r.isPaused && !r.isArchived && isRoutineScheduledOnDate(r, todayDate)) {
          const exists = updatedOccurrences.some(
            (o) => o.routineId === r.id && o.scheduledDate === todayDate && o.status !== 'cancelled'
          );
          if (!exists) {
            const deterministicId = computeDeterministicOccurrenceId(workspaceId, r.id, todayDate);
            const plannedInstant = calculatePlannedInstant(todayDate, r.scheduledTime, r.timezone);
            const nowIso = new Date().toISOString();
            const newOcc: RoutineOccurrenceRecord = {
              id: deterministicId,
              workspaceId,
              routineId: r.id,
              scheduledDate: todayDate,
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
            await repo.upsertRoutineOccurrence(newOcc);
            updatedOccurrences.push(newOcc);
          }
        }
      }

      // Load tasks due today or overdue
      const allTasks = await repo.listTasks(workspaceId);
      const refDate = new Date();
      const todayTasks = allTasks.filter(
        (t) =>
          t.deletedAt === null &&
          (isTaskDueToday({ deadline: t.deadline }, refDate, viewingTimezone) ||
            isTaskOverdue({ status: t.status, deadline: t.deadline }, refDate, viewingTimezone))
      );

      setRoutines(loadedRoutines);
      setOccurrences(updatedOccurrences);
      setTasks(todayTasks);
      setIsLoading(false);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
      setIsLoading(false);
    }
  }, [workspaceId, user?.id, todayDate, yesterdayDate, viewingTimezone]);

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

  // Today's paired routine items: routines active today with their today occurrence
  const todayRoutineItems = useMemo(() => {
    return routines
      .filter((r) => isRoutineScheduledOnDate(r, todayDate) || r.isPaused)
      .map((routine) => {
        const occ = occurrences.find(
          (o) =>
            o.routineId === routine.id && o.scheduledDate === todayDate && o.status !== 'cancelled'
        );
        return { routine, occurrence: occ || null };
      });
  }, [routines, occurrences, todayDate]);

  // Gentle progress summary
  const progress = useMemo(() => {
    const todayOccs = todayRoutineItems
      .map((item) => item.occurrence)
      .filter((o): o is RoutineOccurrenceRecord => o !== null);
    return calculateGentleProgress(todayOccs);
  }, [todayRoutineItems]);

  // Routine Checklist Actions
  const handleCompleteOccurrence = async (occurrenceId: string) => {
    const occ = occurrences.find((o) => o.id === occurrenceId);
    if (!occ) return;
    const routine = routines.find((r) => r.id === occ.routineId);

    const prevStatus = occ.status;
    const prevCompletedAt = occ.completedAt;
    const prevHistory = [...occ.history];

    const nowIso = new Date().toISOString();
    const updatedHistory = [
      ...occ.history,
      {
        fromStatus: occ.status,
        toStatus: 'done' as const,
        status: 'done' as const,
        changedAt: nowIso,
        transitionedAt: nowIso,
        actorId: user?.id || null,
      },
    ];

    const updated: RoutineOccurrenceRecord = {
      ...occ,
      status: 'done',
      completedAt: nowIso,
      completedBy: user?.id || null,
      history: updatedHistory,
      updatedAt: nowIso,
      serverRevision: occ.serverRevision + 1,
    };

    setOccurrences((prev) => prev.map((o) => (o.id === occurrenceId ? updated : o)));

    if (localRepoRef.current) {
      await localRepoRef.current.upsertRoutineOccurrence(updated);
    }
    if (syncEngineRef.current) {
      await syncEngineRef.current.saveRoutineOccurrence(updated, 'completeOccurrence');
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
    const updatedHistory = [
      ...occ.history,
      {
        fromStatus: occ.status,
        toStatus: 'skipped' as const,
        status: 'skipped' as const,
        changedAt: nowIso,
        transitionedAt: nowIso,
        actorId: user?.id || null,
      },
    ];

    const updated: RoutineOccurrenceRecord = {
      ...occ,
      status: 'skipped',
      completedAt: null,
      completedBy: null,
      history: updatedHistory,
      updatedAt: nowIso,
      serverRevision: occ.serverRevision + 1,
    };

    setOccurrences((prev) => prev.map((o) => (o.id === occurrenceId ? updated : o)));

    if (localRepoRef.current) {
      await localRepoRef.current.upsertRoutineOccurrence(updated);
    }
    if (syncEngineRef.current) {
      await syncEngineRef.current.saveRoutineOccurrence(updated, 'skipOccurrence');
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
    const updatedHistory = [
      ...occ.history,
      {
        fromStatus: occ.status,
        toStatus: 'pending' as const,
        status: 'pending' as const,
        changedAt: nowIso,
        transitionedAt: nowIso,
        actorId: user?.id || null,
      },
    ];

    const updated: RoutineOccurrenceRecord = {
      ...occ,
      status: 'pending',
      completedAt: null,
      completedBy: null,
      history: updatedHistory,
      updatedAt: nowIso,
      serverRevision: occ.serverRevision + 1,
    };

    setOccurrences((prev) => prev.map((o) => (o.id === occurrenceId ? updated : o)));

    if (localRepoRef.current) {
      await localRepoRef.current.upsertRoutineOccurrence(updated);
    }
    if (syncEngineRef.current) {
      await syncEngineRef.current.saveRoutineOccurrence(updated, 'reopenOccurrence');
    }

    setUndoToast(null);
    announce(`Reopened ${routine?.title || 'routine'} for today.`);
  };

  const handleUndo = async () => {
    if (!undoToast) return;
    const occ = occurrences.find((o) => o.id === undoToast.occurrenceId);
    if (!occ) return;

    const nowIso = new Date().toISOString();
    const restored: RoutineOccurrenceRecord = {
      ...occ,
      status: undoToast.previousStatus,
      completedAt: undoToast.previousCompletedAt,
      history: undoToast.previousHistory,
      updatedAt: nowIso,
      serverRevision: occ.serverRevision + 1,
    };

    setOccurrences((prev) => prev.map((o) => (o.id === undoToast.occurrenceId ? restored : o)));

    if (localRepoRef.current) {
      await localRepoRef.current.upsertRoutineOccurrence(restored);
    }
    if (syncEngineRef.current) {
      const command =
        restored.status === 'done'
          ? 'completeOccurrence'
          : restored.status === 'skipped'
            ? 'skipOccurrence'
            : 'reopenOccurrence';
      await syncEngineRef.current.saveRoutineOccurrence(restored, command);
    }

    setUndoToast(null);
    announce(`Undid change for ${undoToast.routineTitle}.`);
  };

  // Toggle routine pause/resume
  const handleTogglePauseRoutine = async (routineId: string) => {
    const routine = routines.find((r) => r.id === routineId);
    if (!routine) return;

    const newPaused = !routine.isPaused;
    const updated: RoutineRecord = {
      ...routine,
      isPaused: newPaused,
      serverRevision: routine.serverRevision + 1,
      updatedAt: new Date().toISOString(),
    };

    setRoutines((prev) => prev.map((r) => (r.id === routineId ? updated : r)));

    if (localRepoRef.current) {
      await localRepoRef.current.upsertRoutine(updated);
    }
    if (syncEngineRef.current) {
      await syncEngineRef.current.saveRoutine(
        updated,
        newPaused ? 'pauseRoutine' : 'resumeRoutine'
      );
    }

    announce(
      newPaused ? `Paused routine "${routine.title}".` : `Resumed routine "${routine.title}".`
    );
  };

  // Save routine from RoutineDetailEditor
  const handleSaveRoutine = async (formData: {
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

    if (editingRoutine) {
      // Update routine
      const nextRev = editingRoutine.serverRevision + 1;
      const nextScheduleRev = editingRoutine.scheduleRevision + 1;

      const updated: RoutineRecord = {
        ...editingRoutine,
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
        scheduleRevision: nextScheduleRev,
        serverRevision: nextRev,
        updatedAt: nowIso,
      };

      // Schedule reconciliation for future occurrences
      const domainOccurrences: RoutineOccurrence[] = occurrences.map((o) => ({
        ...o,
        revision: o.serverRevision,
      }));
      const rule: RoutineTemplateRule = {
        id: updated.id,
        workspaceId: updated.workspaceId,
        folderId: updated.folderId,
        title: updated.title,
        details: updated.details,
        frequency: updated.frequency,
        weekdays: updated.weekdays,
        timezone: updated.timezone,
        scheduledTime: updated.scheduledTime,
        activeFrom: updated.activeFrom,
        activeTo: updated.activeTo,
        isPaused: updated.isPaused,
        isArchived: updated.isArchived,
        scheduleRevision: updated.scheduleRevision,
        effectiveDate: updated.effectiveDate,
      };

      const { retained, cancelledOccurrences } = reconcileOccurrencesOnScheduleChange(
        domainOccurrences,
        rule,
        formData.effectiveDate
      );

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
        await localRepoRef.current.upsertRoutine(updated);
        for (const o of reconciledOccurrences) {
          await localRepoRef.current.upsertRoutineOccurrence(o);
        }
      }

      if (syncEngineRef.current) {
        await syncEngineRef.current.saveRoutine(updated, 'updateRoutine');
      }

      announce(`Updated routine "${updated.title}".`);
    } else {
      // Create new routine
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

      const newOccs: RoutineOccurrenceRecord[] = [];
      if (isRoutineScheduledOnDate(newRoutine, todayDate)) {
        const occId = computeDeterministicOccurrenceId(workspaceId, newId, todayDate);
        const plannedInstant = calculatePlannedInstant(
          todayDate,
          newRoutine.scheduledTime,
          newRoutine.timezone
        );
        const occ: RoutineOccurrenceRecord = {
          id: occId,
          workspaceId,
          routineId: newId,
          scheduledDate: todayDate,
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
        await localRepoRef.current.upsertRoutine(newRoutine);
        for (const o of newOccs) {
          await localRepoRef.current.upsertRoutineOccurrence(o);
        }
      }

      if (syncEngineRef.current) {
        await syncEngineRef.current.saveRoutine(newRoutine, 'createRoutine');
        for (const o of newOccs) {
          await syncEngineRef.current.saveRoutineOccurrence(o, 'completeOccurrence');
        }
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
      serverRevision: task.serverRevision + 1,
    };

    setTasks((prev) => prev.map((t) => (t.id === taskId ? updated : t)));

    if (localRepoRef.current) {
      await localRepoRef.current.upsertTask(updated);
    }
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
    }

    announce(
      newStatus === 'completed'
        ? `Completed task "${task.title}".`
        : `Reopened task "${task.title}".`
    );
  };

  const handleSimulateLoading = () => {
    setIsLoading(true);
    setTimeout(() => setIsLoading(false), 600);
  };

  const handleSimulateError = () => {
    setErrorMessage('Simulated error: Failed to sync offline routine occurrences.');
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
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            flexWrap: 'wrap',
            gap: `${spacing.xs}px`,
          }}
        >
          <div>
            <h1
              id="today-heading"
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
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: `${spacing.xs}px`,
              flexWrap: 'wrap',
            }}
          >
            <div
              style={{
                fontSize: '12px',
                color: palette.text.secondary,
                padding: `${spacing.xs}px ${spacing.sm}px`,
                borderRadius: `${radii.sm}px`,
                backgroundColor: palette.surfaceRaised,
                border: `1px solid ${palette.border.subtle}`,
              }}
            >
              Timezone: {viewingTimezone}
            </div>

            <Button
              id="create-routine-btn"
              variant="primary"
              size="compact"
              themeMode={themeMode}
              onClick={() => {
                setEditingRoutine(null);
                setIsEditorOpen(true);
              }}
            >
              + New Routine
            </Button>
          </div>
        </div>

        {/* State Simulation Controls (preserved for testability) */}
        <div
          role="region"
          aria-label="State simulation controls"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: `${spacing.xs}px`,
            padding: `${spacing.sm}px`,
            backgroundColor: palette.surfaceRaised,
            borderRadius: `${radii.card}px`,
            border: `1px solid ${palette.border.subtle}`,
            marginTop: `${spacing.sm}px`,
            alignItems: 'center',
          }}
        >
          <span
            style={{
              fontSize: '12px',
              fontWeight: 700,
              color: palette.text.secondary,
              marginRight: `${spacing.xs}px`,
            }}
          >
            Demo States:
          </span>
          <button
            type="button"
            onClick={() => setShowEmptyState((v) => !v)}
            style={{
              padding: '4px 10px',
              fontSize: '12px',
              borderRadius: '4px',
              border: `1px solid ${palette.border.subtle}`,
              backgroundColor: showEmptyState ? palette.action.primary : palette.surface,
              color: showEmptyState ? '#ffffff' : palette.text.primary,
              cursor: 'pointer',
              minHeight: '32px',
              fontWeight: 500,
            }}
          >
            {showEmptyState ? 'Show Content' : 'Simulate Empty'}
          </button>
          <button
            type="button"
            onClick={handleSimulateLoading}
            style={{
              padding: '4px 10px',
              fontSize: '12px',
              borderRadius: '4px',
              border: `1px solid ${palette.border.subtle}`,
              backgroundColor: palette.surface,
              color: palette.text.primary,
              cursor: 'pointer',
              minHeight: '32px',
              fontWeight: 500,
            }}
          >
            Simulate Loading
          </button>
          <button
            type="button"
            onClick={handleSimulateError}
            style={{
              padding: '4px 10px',
              fontSize: '12px',
              borderRadius: '4px',
              border: `1px solid ${palette.border.subtle}`,
              backgroundColor: palette.surface,
              color: palette.text.primary,
              cursor: 'pointer',
              minHeight: '32px',
              fontWeight: 500,
            }}
          >
            Simulate Error
          </button>
        </div>
      </section>

      {/* Error / Retry Banner */}
      {errorMessage && (
        <div style={{ marginBottom: `${spacing.base}px` }}>
          <Feedback
            severity="danger"
            title="Synchronization Alert"
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
          <span>Refreshing Today content...</span>
        </div>
      ) : showEmptyState || (todayRoutineItems.length === 0 && tasks.length === 0) ? (
        <EmptyState
          id="today-empty-state"
          title="All caught up for today"
          description="You have no pending tasks or routines scheduled for today. Create a routine to build consistent habits!"
          actionLabel="Create Routine"
          onAction={() => {
            setEditingRoutine(null);
            setIsEditorOpen(true);
          }}
          themeMode={themeMode}
          icon="☀️"
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.base}px` }}>
          {/* Card 1: Today's Daily Routine Checklist */}
          <Card themeMode={themeMode}>
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
                  style={{
                    margin: 0,
                    fontSize: `${typography.webScale.sectionHeading}px`,
                    color: palette.text.primary,
                    fontWeight: 700,
                  }}
                >
                  Today&apos;s Routines
                </h2>
                <span
                  style={{
                    fontSize: '12px',
                    color: palette.text.secondary,
                  }}
                >
                  Gentle daily habit checklist · Independent from one-off tasks
                </span>
              </div>

              {/* Gentle Progress Counter */}
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

            {/* Gentle Progress Bar */}
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
                todayRoutineItems.map(({ routine, occurrence }) => (
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
                    viewingDate={todayDate}
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
                        setHistoryRoutine(r);
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

              <span style={{ fontSize: '11px', color: palette.text.secondary }}>
                Yesterday&apos;s completions preserved in History
              </span>
            </div>
          </Card>

          {/* Card 2: Tasks Due Today (Strictly Separate from Routines) */}
          <Card themeMode={themeMode}>
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
                  style={{
                    margin: 0,
                    fontSize: `${typography.webScale.sectionHeading}px`,
                    color: palette.text.primary,
                    fontWeight: 700,
                  }}
                >
                  Tasks Due Today
                </h2>
                <span style={{ fontSize: '12px', color: palette.text.secondary }}>
                  One-off tasks and project action items
                </span>
              </div>
              <span
                style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  color: palette.text.secondary,
                }}
              >
                {tasks.filter((t) => t.status === 'completed').length} of {tasks.length} done
              </span>
            </div>

            <div role="list" aria-label="Tasks due today">
              {tasks.length === 0 ? (
                <div
                  style={{
                    padding: `${spacing.md}px 0`,
                    color: palette.text.secondary,
                    fontSize: '13px',
                    textAlign: 'center',
                  }}
                >
                  No tasks due today.
                </div>
              ) : (
                tasks.map((task) => (
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
                        textDecoration: task.status === 'completed' ? 'line-through' : 'none',
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
                  minHeight: '36px',
                }}
              >
                View all tasks in Plan →
              </Link>
            </div>
          </Card>
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
                  effectiveDate: editingRoutine.effectiveDate,
                  isPaused: editingRoutine.isPaused,
                }
              : null
          }
          todayDate={todayDate}
          defaultTimezone={viewingTimezone}
          themeMode={themeMode}
        />
      )}

      {/* Routine History Viewer Modal */}
      {historyRoutine && (
        <RoutineHistoryViewer
          isOpen={Boolean(historyRoutine)}
          onClose={() => setHistoryRoutine(null)}
          routineTitle={historyRoutine.title}
          occurrences={occurrences
            .filter((o) => o.routineId === historyRoutine.id)
            .map((o) => ({
              ...o,
              scheduleRevision: o.scheduleRevision,
            }))}
          themeMode={themeMode}
          onReopenOccurrence={handleReopenOccurrence}
          onCompleteOccurrence={handleCompleteOccurrence}
        />
      )}

      {/* Floating Reversible Undo Toast */}
      {undoToast && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            backgroundColor: palette.surfaceRaised,
            color: palette.text.primary,
            border: `1px solid ${palette.border.strong}`,
            borderRadius: `${radii.card}px`,
            padding: `${spacing.sm}px ${spacing.base}px`,
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.25)',
            display: 'flex',
            alignItems: 'center',
            gap: `${spacing.md}px`,
            zIndex: 9999,
            animation: 'daynori-fade-in 150ms ease',
          }}
        >
          <span style={{ fontSize: '13px', fontWeight: 500 }}>
            Updated <strong>{undoToast.routineTitle}</strong>
          </span>
          <button
            type="button"
            onClick={handleUndo}
            style={{
              padding: '4px 12px',
              borderRadius: `${radii.sm}px`,
              border: `1px solid ${palette.action.primary}`,
              backgroundColor: palette.action.primary,
              color: '#ffffff',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              minHeight: '28px',
            }}
          >
            Undo
          </button>
        </div>
      )}
    </div>
  );
};
