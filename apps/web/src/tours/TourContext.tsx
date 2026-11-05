'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  TOUR_CHAPTER_TASK_CREATE_SAVE,
  applyTourControl,
  applyTourEvidence,
  ensureTourProgressMigrated,
  findChapterProgress,
  getActiveAttemptId,
  getDefaultTourProgress,
  getStepDefinition,
  getTourChapterDefinition,
  getTourPracticeTaskId,
  getTourPracticeEntityId,
  selectTourScope,
  storeTourScope,
  tourEvidenceForMutation,
  mergeTourProgressStates,
  type TourControl,
  type TourEvidenceEvent,
  type TourProgressState,
  type TourChapterProgress,
  type TourEntityType,
  type TourMutationResult,
} from '@daynori/domain';
import { useAuth } from '../components/AuthContext';
import { createWebApiClient } from '../data/webApiClient';
import { getTrustedDeviceConsent } from '../data/indexedDbRepository';
import { observeActiveWebSyncEngine } from '../data/syncAdapter';

export const PROOF_TOUR_CHAPTER_ID = TOUR_CHAPTER_TASK_CREATE_SAVE.id;
export const PROOF_LEARNING_CHAPTER_ID = TOUR_CHAPTER_TASK_CREATE_SAVE.learningChapterId;

type TargetEntry = { el: HTMLElement };
export type TourEvidencePayload = Omit<
  TourEvidenceEvent,
  | 'at'
  | 'accountUserId'
  | 'workspaceId'
  | 'chapterId'
  | 'definitionVersion'
  | 'runId'
  | 'stepId'
  | 'attemptId'
> &
  Partial<Pick<TourEvidenceEvent, 'runId' | 'stepId' | 'attemptId'>>;
export type TourEvidenceReporter = (payload: TourEvidencePayload) => Promise<boolean>;

export interface TourContextValue {
  progress: TourProgressState;
  activeChapterId: string | null;
  activeChapter: TourChapterProgress | null;
  practiceTaskId: string | null;
  getPracticeEntityId: (entityType: TourEntityType, role?: string) => string | null;
  getPracticeCreationId: (entityType: TourEntityType) => string | null;
  captureEvidence: (expectedEntityId?: string) => TourEvidenceReporter;
  captureMutation: () => (mutation: TourMutationResult) => Promise<boolean>;
  saveProgress: (next: TourProgressState) => Promise<boolean>;
  reusePractice: () => Promise<boolean>;
  storageMessage: string | null;
  isPresenting: boolean;
  announcement: string;
  targetReady: boolean;
  missingTarget: boolean;
  registerTarget: (targetId: string, el: HTMLElement | null) => void;
  getTargetElement: (targetId: string) => HTMLElement | null;
  startChapter: (chapterId?: string, options?: { practice: boolean }) => Promise<boolean>;
  applyControl: (control: TourControl) => Promise<void>;
  reportEvidence: (
    partial: Omit<
      TourEvidenceEvent,
      | 'at'
      | 'accountUserId'
      | 'workspaceId'
      | 'chapterId'
      | 'definitionVersion'
      | 'runId'
      | 'stepId'
      | 'attemptId'
    > &
      Partial<Pick<TourEvidenceEvent, 'stepId' | 'attemptId' | 'runId'>>
  ) => Promise<boolean>;
  reportTargetActivated: (targetId: string) => Promise<boolean>;
}

const TourContext = createContext<TourContextValue | null>(null);

function draftKey(userId: string, workspaceId: string): string {
  return `daynori:tour-progress:${userId}:${workspaceId}`;
}

export function TourProvider({ children }: { children: React.ReactNode }) {
  const { user, workspaceId, csrfToken } = useAuth();
  const [progress, setProgress] = useState<TourProgressState>(getDefaultTourProgress);
  const [activeChapterId, setActiveChapterId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [revision, setRevision] = useState<number | null>(null);
  const [storageMessage, setStorageMessage] = useState<string | null>(null);
  const progressRef = useRef(progress);
  progressRef.current = progress;
  const scopeRef = useRef('');
  const serverProgressRef = useRef<unknown>(null);
  const persistQueue = useRef<Promise<unknown>>(Promise.resolve());
  const transitionQueue = useRef<Promise<unknown>>(Promise.resolve());
  const enqueueTransition = useCallback(<T,>(operation: () => Promise<T>): Promise<T> => {
    const next = transitionQueue.current.then(operation, operation);
    transitionQueue.current = next;
    return next;
  }, []);
  const targetsRef = useRef<Map<string, TargetEntry>>(new Map());
  const [, bumpTargets] = useState(0);

  const accountUserId = user?.id ?? null;
  const wsId = workspaceId ?? user?.workspaceId ?? null;
  scopeRef.current = `${accountUserId}:${wsId}`;
  const getPracticeEntityId = useCallback(
    (kind: TourEntityType, role = 'primary') => {
      const chapter = progressRef.current.chapters.find((c) => c.lifecycle === 'active');
      if (!accountUserId || !wsId || !chapter) return null;
      return kind === 'task'
        ? getTourPracticeTaskId(wsId, accountUserId, chapter.chapterId)
        : getTourPracticeEntityId(wsId, accountUserId, chapter.chapterId, kind, role);
    },
    [accountUserId, wsId]
  );

  const practiceTaskId = useMemo(() => {
    if (!accountUserId || !wsId || !activeChapterId) return null;
    return getTourPracticeTaskId(wsId, accountUserId, activeChapterId);
  }, [accountUserId, wsId, activeChapterId]);

  const activeChapter = useMemo(() => {
    if (!activeChapterId) return null;
    return findChapterProgress(progress, activeChapterId) ?? null;
  }, [progress, activeChapterId]);

  const isPresenting = Boolean(
    activeChapter && (activeChapter.lifecycle === 'active' || activeChapter.lifecycle === 'paused')
  );

  const currentStepDef = useMemo(() => {
    if (!activeChapter?.currentStepId || !activeChapterId) return null;
    const def = getTourChapterDefinition(activeChapterId);
    return def ? (getStepDefinition(def, activeChapter.currentStepId) ?? null) : null;
  }, [activeChapter, activeChapterId]);

  const targetReady = Boolean(
    currentStepDef?.targetId && targetsRef.current.has(currentStepDef.targetId)
  );
  const missingTarget = Boolean(
    isPresenting &&
    activeChapter?.lifecycle === 'active' &&
    currentStepDef?.kind === 'action' &&
    currentStepDef.targetId &&
    !targetsRef.current.has(currentStepDef.targetId)
  );

  const persist = useCallback(
    async (next: TourProgressState): Promise<boolean> => {
      if (!accountUserId || !wsId) return false;
      const scope = { accountUserId, workspaceId: wsId };
      const scopeKey = `${accountUserId}:${wsId}`;
      const current = () => scopeRef.current === scopeKey;
      if (!current()) return false;
      next = { ...next, scope };
      let savedLocally = false;
      if (getTrustedDeviceConsent()) {
        try {
          window.localStorage.setItem(draftKey(accountUserId, wsId), JSON.stringify(next));
          savedLocally = true;
        } catch {
          setStorageMessage('Tour progress could not be saved on this device. Retry or reconnect.');
        }
      }
      if (!csrfToken) {
        if (!savedLocally)
          setStorageMessage(
            'Your sign-in session is not ready to save tour progress. Reopen Account or enable trusted-device storage.'
          );
        return savedLocally;
      }
      const client = createWebApiClient({ csrfToken });
      const sync = async () => {
        let expected: number | null = null;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            if (!current()) return false;
            if (expected == null) {
              const pref = await client.getUserPreferences();
              if (!current()) return false;
              expected = pref.data.revision;
              serverProgressRef.current = pref.data.preferences?.tourProgress;
              setRevision(pref.data.revision);
            }
            const res = await client.updateUserPreferences({
              preferences: { tourProgress: storeTourScope(next, serverProgressRef.current) },
              expectedRevision: expected,
            });
            if (!current()) return false;
            serverProgressRef.current = res.data.preferences?.tourProgress;
            setRevision(res.data.revision);
            setStorageMessage(null);
            return true;
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (!current()) return false;
            if (!msg.includes('409') && !msg.includes('conflict')) {
              setStorageMessage(
                savedLocally
                  ? 'Progress saved on this device; waiting to sync.'
                  : 'Progress could not be saved. Reconnect and retry.'
              );
              return false;
            }
            try {
              const latest = await client.getUserPreferences();
              if (!current()) return false;
              expected = latest.data.revision;
              setRevision(latest.data.revision);
              serverProgressRef.current = latest.data.preferences?.tourProgress;
              const serverTour = selectTourScope(latest.data.preferences?.tourProgress, scope);
              next = mergeTourProgressStates(
                next,
                ensureTourProgressMigrated({
                  onboarding: latest.data.preferences?.onboarding,
                  tourProgress: serverTour,
                })
              );
            } catch {
              setStorageMessage('Progress remains on this device; preference sync needs retry.');
              return false;
            }
          }
        }
        return false;
      };
      const queued = persistQueue.current.then(sync, sync);
      persistQueue.current = queued;
      if (savedLocally) {
        void queued;
        return true;
      }
      return queued;
    },
    [accountUserId, wsId, csrfToken, revision]
  );

  // Hydrate on account/workspace change — isolate progress per scope.
  useEffect(() => {
    let cancelled = false;
    setActiveChapterId(null);
    setProgress(getDefaultTourProgress());
    progressRef.current = getDefaultTourProgress();
    serverProgressRef.current = null;
    setRevision(null);
    setStorageMessage(null);
    if (!accountUserId || !wsId) return;

    (async () => {
      let local: TourProgressState | null = null;
      try {
        const raw = window.localStorage.getItem(draftKey(accountUserId, wsId));
        if (raw)
          local = selectTourScope(JSON.parse(raw), { accountUserId, workspaceId: wsId }, true);
      } catch {
        local = null;
      }

      let server: TourProgressState | null = null;
      let onboarding = null;
      if (csrfToken) {
        try {
          const client = createWebApiClient({ csrfToken });
          const pref = await client.getUserPreferences();
          if (cancelled) return;
          setRevision(pref.data.revision);
          serverProgressRef.current = pref.data.preferences?.tourProgress;
          server = selectTourScope(pref.data.preferences?.tourProgress, {
            accountUserId,
            workspaceId: wsId,
          });
          onboarding = pref.data.preferences?.onboarding ?? null;
        } catch {
          /* offline */
        }
      }

      let merged = ensureTourProgressMigrated({
        onboarding,
        tourProgress: server ?? local ?? getDefaultTourProgress(),
      });
      if (local && server) {
        merged = mergeTourProgressStates(local, merged);
        merged = { ...merged, migratedFromOnboardingV1: true, migratedAt: merged.migratedAt };
      } else if (local && !server) {
        merged = ensureTourProgressMigrated({ onboarding, tourProgress: local });
      }
      if (!cancelled) {
        merged = { ...merged, scope: { accountUserId, workspaceId: wsId } };
        progressRef.current = merged;
        setProgress(merged);
        const active = merged.chapters.find(
          (c) => c.lifecycle === 'active' || c.lifecycle === 'paused'
        );
        if (active) setActiveChapterId(active.chapterId);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accountUserId, wsId, csrfToken]);

  const registerTarget = useCallback((targetId: string, el: HTMLElement | null) => {
    if (targetsRef.current.get(targetId)?.el === el || (!el && !targetsRef.current.has(targetId)))
      return;
    if (el) {
      targetsRef.current.set(targetId, { el });
    } else {
      targetsRef.current.delete(targetId);
    }
    bumpTargets((n) => n + 1);
  }, []);

  const getTargetElement = useCallback((targetId: string) => {
    return targetsRef.current.get(targetId)?.el ?? null;
  }, []);

  useEffect(() => {
    let frame = 0;
    const scan = () => {
      frame = 0;
      const next = new Map<string, TargetEntry>();
      for (const node of document.querySelectorAll<HTMLElement>('[data-tour-target]')) {
        const id = node.dataset.tourTarget;
        const el =
          node.style.display === 'contents' ? (node.firstElementChild as HTMLElement | null) : node;
        if (id && el?.getClientRects().length && !next.has(id)) next.set(id, { el });
      }
      if (
        next.size !== targetsRef.current.size ||
        [...next].some(([id, target]) => targetsRef.current.get(id)?.el !== target.el)
      ) {
        targetsRef.current = next;
        bumpTargets((n) => n + 1);
      }
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(scan);
    };
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-tour-target', 'hidden'],
    });
    window.addEventListener('resize', schedule);
    scan();
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', schedule);
      cancelAnimationFrame(frame);
    };
  }, []);

  const applyControl = useCallback(
    async (control: TourControl) => {
      return enqueueTransition(async () => {
        if (!accountUserId || !wsId || !activeChapterId) return;
        const result = applyTourControl(progressRef.current, activeChapterId, control, {
          accountUserId,
          workspaceId: wsId,
        });
        if (!result.ok) {
          setAnnouncement(result.error);
          return;
        }
        if (!(await persist(result.state)) || scopeRef.current !== `${accountUserId}:${wsId}`)
          return;
        progressRef.current = result.state;
        setProgress(result.state);
        const def = getTourChapterDefinition(activeChapterId);
        const step = result.chapter.currentStepId
          ? getStepDefinition(def!, result.chapter.currentStepId)
          : null;
        if (control === 'exit' || result.chapter.lifecycle === 'paused') {
          setAnnouncement('Tour paused. Progress saved.');
        } else if (result.chapter.lifecycle === 'completed') {
          setAnnouncement(
            result.chapter.steps.some((step) => step.outcome === 'skipped')
              ? `${def?.title.defaultText ?? 'Chapter'} finished with skipped steps.`
              : `${def?.title.defaultText ?? 'Chapter'} completed. Verified on real controls.`
          );
          setActiveChapterId(null);
        } else if (step) {
          setAnnouncement(
            `${def?.title.defaultText ?? 'Chapter'}: step ${result.chapter.currentStepId}. ${step.instruction.defaultText}`
          );
        }
        if (control === 'exit') {
          setActiveChapterId(null);
        }
      });
    },
    [accountUserId, wsId, activeChapterId, persist, enqueueTransition]
  );

  const startChapter = useCallback(
    async (
      chapterId: string = PROOF_TOUR_CHAPTER_ID,
      options?: { practice: boolean }
    ): Promise<boolean> => {
      return enqueueTransition(async () => {
        if (!accountUserId || !wsId) {
          setAnnouncement('Sign in and open a workspace to start the guided chapter.');
          setStorageMessage('Sign in and open a workspace to start the guided chapter.');
          return false;
        }
        const state = progressRef.current;
        const existing = findChapterProgress(state, chapterId);
        const control: TourControl =
          existing?.lifecycle === 'completed' || existing?.lifecycle === 'skipped'
            ? 'restart_chapter'
            : existing?.lifecycle === 'paused' || existing?.lifecycle === 'blocked'
              ? 'resume'
              : 'start';
        if (!existing && control === 'start') {
          // ensure chapter shell via start
        }
        let result = applyTourControl(state, chapterId, control, {
          accountUserId,
          workspaceId: wsId,
        });
        if (!result.ok && result.code === 'already_finished') {
          result = applyTourControl(state, chapterId, 'restart_chapter', {
            accountUserId,
            workspaceId: wsId,
          });
        }
        if (!result.ok) {
          setAnnouncement(result.error);
          setStorageMessage(result.error);
          return false;
        }
        if (control === 'start' || control === 'restart_chapter') {
          result.chapter.practiceOptIn = options?.practice === true;
        }
        if (!(await persist(result.state)) || scopeRef.current !== `${accountUserId}:${wsId}`)
          return false;
        setActiveChapterId(chapterId);
        progressRef.current = result.state;
        setProgress(result.state);
        const def = getTourChapterDefinition(chapterId);
        const step = result.chapter.currentStepId
          ? getStepDefinition(def!, result.chapter.currentStepId)
          : null;
        setAnnouncement(
          `Started ${def?.title.defaultText ?? chapterId}. ${step?.instruction.defaultText ?? ''}`
        );
        return true;
      });
    },
    [accountUserId, wsId, persist, enqueueTransition]
  );

  const reportEvidence = useCallback(
    async (
      partial: Omit<
        TourEvidenceEvent,
        | 'at'
        | 'accountUserId'
        | 'workspaceId'
        | 'chapterId'
        | 'definitionVersion'
        | 'runId'
        | 'stepId'
        | 'attemptId'
      > &
        Partial<Pick<TourEvidenceEvent, 'stepId' | 'attemptId' | 'runId'>>,
      expectedEntityId?: string
    ): Promise<boolean> => {
      return enqueueTransition(async () => {
        if (!accountUserId || !wsId || !activeChapterId || !activeChapter) return false;
        if (scopeRef.current !== `${accountUserId}:${wsId}`) return false;
        if (activeChapter.lifecycle !== 'active') return false;
        const attemptId = getActiveAttemptId(activeChapter);
        if (!attemptId || !activeChapter.runId || !activeChapter.currentStepId) return false;

        const event: TourEvidenceEvent = {
          at: new Date().toISOString(),
          accountUserId,
          workspaceId: wsId,
          chapterId: activeChapterId,
          definitionVersion: activeChapter.definitionVersion,
          runId: partial.runId ?? activeChapter.runId,
          stepId: partial.stepId ?? activeChapter.currentStepId,
          attemptId: partial.attemptId ?? attemptId,
          ...partial,
        };

        const result = applyTourEvidence(progressRef.current, activeChapterId, event, {
          accountUserId,
          workspaceId: wsId,
          expectedPracticeEntityId: expectedEntityId,
        });
        if (!result.ok) return false;
        if (!(await persist(result.state)) || scopeRef.current !== `${accountUserId}:${wsId}`)
          return false;
        progressRef.current = result.state;
        setProgress(result.state);
        const def = getTourChapterDefinition(activeChapterId);
        if (result.chapter.lifecycle === 'completed') {
          setAnnouncement(`${def?.title.defaultText ?? 'Chapter'} completed.`);
          setActiveChapterId(null);
        } else if (result.chapter.currentStepId) {
          const step = getStepDefinition(def!, result.chapter.currentStepId);
          setAnnouncement(
            `Verified. Next: ${step?.title.defaultText ?? result.chapter.currentStepId}. ${step?.instruction.defaultText ?? ''}`
          );
        }
        return true;
      });
    },
    [accountUserId, wsId, activeChapterId, activeChapter, persist, enqueueTransition]
  );

  const captureEvidence = useCallback(
    (expectedEntityId?: string): TourEvidenceReporter => {
      if (!activeChapter?.currentStepId || !activeChapter.runId) return async () => false;
      const captured = {
        stepId: activeChapter.currentStepId,
        runId: activeChapter.runId,
        attemptId: getActiveAttemptId(activeChapter) ?? '',
      };
      // Keep this reporter (including actor/workspace closure) across the command's await.
      return (payload) => reportEvidence({ ...payload, ...captured }, expectedEntityId);
    },
    [activeChapter, reportEvidence]
  );
  const captureRef = useRef(captureEvidence);
  captureRef.current = captureEvidence;
  const captureMutation = useCallback(() => {
    const report = captureEvidence();
    const chapter = activeChapter;
    const step = currentStepDef;
    const scope = accountUserId && wsId ? { accountUserId, workspaceId: wsId } : null;
    return async (mutation: TourMutationResult) => {
      if (!chapter || !step || !scope) return false;
      const evidence = tourEvidenceForMutation(step, chapter, scope, mutation);
      return evidence ? report(evidence) : false;
    };
  }, [captureEvidence, activeChapter, currentStepDef, accountUserId, wsId]);

  useEffect(() => {
    if (!accountUserId || !wsId) return;
    let unsubscribe: (() => void) | undefined;
    const scope = { accountUserId, workspaceId: wsId };
    const stop = observeActiveWebSyncEngine((engine) => {
      unsubscribe?.();
      if (
        !engine ||
        engine.getAccountNamespace().userId !== accountUserId ||
        engine.getAccountNamespace().workspaceId !== wsId
      )
        return;
      const tickets = new Map<
        string,
        {
          report: TourEvidenceReporter;
          chapter: TourChapterProgress;
          step: NonNullable<ReturnType<typeof getStepDefinition>>;
        }
      >();
      unsubscribe = engine.onEvent((event) => {
        if (event.type === 'local_mutation_started') {
          const chapter = progressRef.current.chapters.find((c) => c.lifecycle === 'active');
          const definition = chapter && getTourChapterDefinition(chapter.chapterId);
          const step =
            definition &&
            chapter.currentStepId &&
            getStepDefinition(definition, chapter.currentStepId);
          if (!chapter || !step) return;
          if (tickets.size >= 100) tickets.delete(tickets.keys().next().value!);
          tickets.set(event.operationId, { report: captureRef.current(), chapter, step });
        } else if (event.type === 'local_mutation_committed') {
          const ticket = tickets.get(event.operationId);
          tickets.delete(event.operationId);
          if (!ticket) return;
          const evidence = tourEvidenceForMutation(ticket.step, ticket.chapter, scope, event);
          if (evidence) void ticket.report(evidence);
        }
      });
    });
    return () => {
      stop();
      unsubscribe?.();
    };
  }, [accountUserId, wsId]);

  const getPracticeCreationId = useCallback(
    (kind: TourEntityType) => {
      const chapter = progressRef.current.chapters.find((c) => c.lifecycle === 'active');
      const definition = chapter && getTourChapterDefinition(chapter.chapterId);
      const step =
        definition && chapter.currentStepId && getStepDefinition(definition, chapter.currentStepId);
      if (
        !chapter?.practiceOptIn ||
        !step ||
        step.entityType !== kind ||
        !['practice_task_saved_locally', 'entity_saved_locally'].includes(step.completionPredicate)
      )
        return null;
      return getPracticeEntityId(kind);
    },
    [getPracticeEntityId]
  );

  const saveProgress = useCallback(
    async (next: TourProgressState) => {
      if (!(await persist(next)) || scopeRef.current !== `${accountUserId}:${wsId}`) return false;
      progressRef.current = next;
      setProgress(next);
      return true;
    },
    [persist, accountUserId, wsId]
  );

  const reusePractice = useCallback(async () => {
    if (!activeChapter || !currentStepDef || !accountUserId || !wsId) return false;
    const artifact = activeChapter.practiceArtifacts?.find(
      (a) =>
        a.entityType === currentStepDef.entityType &&
        a.createdByTour &&
        !a.userOwned &&
        a.creationOperationId
    );
    if (!artifact) return false;
    const report = captureEvidence(artifact.entityId);
    const { getActiveWebSyncEngine } = await import('../data/syncAdapter');
    const engine = getActiveWebSyncEngine();
    if (
      !engine ||
      engine.getAccountNamespace().userId !== accountUserId ||
      engine.getAccountNamespace().workspaceId !== wsId
    )
      return false;
    const record = await engine.getItemHeader(artifact.entityId);
    if (!record || record.deletedAt) return false;
    return report({
      type: 'practice_reused',
      entityId: record.id,
      entityType: artifact.entityType,
      operationId: artifact.creationOperationId,
      recordLoaded: true,
    });
  }, [activeChapter, currentStepDef, accountUserId, wsId, captureEvidence]);

  const reportTargetActivated = useCallback(
    async (targetId: string) => {
      if (!currentStepDef || currentStepDef.targetId !== targetId) return false;
      if (currentStepDef.completionPredicate === 'target_activated') {
        return reportEvidence({
          type: 'target_activated',
          targetId,
          expectedAction: currentStepDef.expectedAction,
        });
      }
      if (
        currentStepDef.completionPredicate === 'create_sheet_task_selected' ||
        currentStepDef.completionPredicate === 'create_type_selected'
      ) {
        return reportEvidence({
          type: 'create_type_selected',
          createType: currentStepDef.createType ?? 'task',
          targetId,
          expectedAction: currentStepDef.expectedAction,
        });
      }
      if (currentStepDef.completionPredicate === 'practice_task_visible_in_plan') {
        return reportEvidence({
          type: 'target_activated',
          targetId,
          entityId: practiceTaskId ?? undefined,
          expectedAction: 'reopen_practice_task',
        });
      }
      return false;
    },
    [currentStepDef, reportEvidence, practiceTaskId]
  );

  // Escape pauses without discarding drafts.
  useEffect(() => {
    if (!isPresenting || activeChapter?.lifecycle !== 'active') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        void applyControl('pause');
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [isPresenting, activeChapter?.lifecycle, applyControl]);

  const value: TourContextValue = {
    progress,
    activeChapterId,
    activeChapter,
    practiceTaskId,
    getPracticeEntityId,
    getPracticeCreationId,
    captureEvidence,
    captureMutation,
    saveProgress,
    reusePractice,
    storageMessage,
    isPresenting,
    announcement,
    targetReady,
    missingTarget,
    registerTarget,
    getTargetElement,
    startChapter,
    applyControl,
    reportEvidence,
    reportTargetActivated,
  };

  return (
    <TourContext.Provider value={value}>
      {children}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          overflow: 'hidden',
          clip: 'rect(0 0 0 0)',
        }}
      >
        {announcement}
      </div>
    </TourContext.Provider>
  );
}

export function useTour(): TourContextValue {
  const ctx = useContext(TourContext);
  if (!ctx) {
    throw new Error('useTour must be used within TourProvider');
  }
  return ctx;
}

export function useTourOptional(): TourContextValue | null {
  return useContext(TourContext);
}
