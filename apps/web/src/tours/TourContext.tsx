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
  mergeTourProgressStates,
  validateTourProgressState,
  type TourControl,
  type TourEvidenceEvent,
  type TourProgressState,
  type TourChapterProgress,
} from '@daynori/domain';
import { useAuth } from '../components/AuthContext';
import { createWebApiClient } from '../data/webApiClient';

export const PROOF_TOUR_CHAPTER_ID = TOUR_CHAPTER_TASK_CREATE_SAVE.id;
export const PROOF_LEARNING_CHAPTER_ID = TOUR_CHAPTER_TASK_CREATE_SAVE.learningChapterId;

type TargetEntry = { el: HTMLElement };

export interface TourContextValue {
  progress: TourProgressState;
  activeChapterId: string | null;
  activeChapter: TourChapterProgress | null;
  practiceTaskId: string | null;
  isPresenting: boolean;
  announcement: string;
  targetReady: boolean;
  missingTarget: boolean;
  registerTarget: (targetId: string, el: HTMLElement | null) => void;
  getTargetElement: (targetId: string) => HTMLElement | null;
  startChapter: (chapterId?: string) => Promise<void>;
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
  const targetsRef = useRef<Map<string, TargetEntry>>(new Map());
  const [, bumpTargets] = useState(0);

  const accountUserId = user?.id ?? null;
  const wsId = workspaceId ?? user?.workspaceId ?? null;

  const practiceTaskId = useMemo(() => {
    if (!accountUserId || !wsId || !activeChapterId) return null;
    return getTourPracticeTaskId(wsId, accountUserId, activeChapterId);
  }, [accountUserId, wsId, activeChapterId]);

  const activeChapter = useMemo(() => {
    if (!activeChapterId) return null;
    return findChapterProgress(progress, activeChapterId) ?? null;
  }, [progress, activeChapterId]);

  const isPresenting = Boolean(
    activeChapter &&
      (activeChapter.lifecycle === 'active' || activeChapter.lifecycle === 'paused')
  );

  const currentStepDef = useMemo(() => {
    if (!activeChapter?.currentStepId || !activeChapterId) return null;
    const def = getTourChapterDefinition(activeChapterId);
    return def ? getStepDefinition(def, activeChapter.currentStepId) ?? null : null;
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
    async (next: TourProgressState) => {
      if (!accountUserId || !wsId) return;
      try {
        window.localStorage.setItem(draftKey(accountUserId, wsId), JSON.stringify(next));
      } catch {
        /* ignore quota */
      }
      if (!csrfToken) return;
      const client = createWebApiClient({ csrfToken });
      let expected = revision;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          if (expected == null) {
            const pref = await client.getUserPreferences();
            expected = pref.data.revision;
            setRevision(pref.data.revision);
          }
          const res = await client.updateUserPreferences({
            preferences: { tourProgress: next },
            expectedRevision: expected,
          });
          setRevision(res.data.revision);
          return;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (!msg.includes('409') && !msg.includes('conflict')) return;
          try {
            const latest = await client.getUserPreferences();
            expected = latest.data.revision;
            setRevision(latest.data.revision);
            const serverTour = validateTourProgressState(latest.data.preferences?.tourProgress);
            next = mergeTourProgressStates(next, ensureTourProgressMigrated({
              onboarding: latest.data.preferences?.onboarding,
              tourProgress: serverTour,
            }));
            setProgress(next);
          } catch {
            return;
          }
        }
      }
    },
    [accountUserId, wsId, csrfToken, revision]
  );

  // Hydrate on account/workspace change — isolate progress per scope.
  useEffect(() => {
    let cancelled = false;
    setActiveChapterId(null);
    setProgress(getDefaultTourProgress());
    if (!accountUserId || !wsId) return;

    (async () => {
      let local: TourProgressState | null = null;
      try {
        const raw = window.localStorage.getItem(draftKey(accountUserId, wsId));
        if (raw) local = validateTourProgressState(JSON.parse(raw));
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
          server = validateTourProgressState(pref.data.preferences?.tourProgress);
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

  const applyControl = useCallback(
    async (control: TourControl) => {
      if (!accountUserId || !wsId || !activeChapterId) return;
      const result = applyTourControl(progress, activeChapterId, control, {
        accountUserId,
        workspaceId: wsId,
      });
      if (!result.ok) {
        setAnnouncement(result.error);
        return;
      }
      setProgress(result.state);
      await persist(result.state);
      const def = getTourChapterDefinition(activeChapterId);
      const step = result.chapter.currentStepId
        ? getStepDefinition(def!, result.chapter.currentStepId)
        : null;
      if (control === 'exit' || result.chapter.lifecycle === 'paused') {
        setAnnouncement('Tour paused. Progress saved.');
      } else if (result.chapter.lifecycle === 'completed') {
        setAnnouncement(
          `${def?.title.defaultText ?? 'Chapter'} completed. Verified on real controls.`
        );
        setActiveChapterId(null);
      } else if (step) {
        setAnnouncement(
          `${def?.title.defaultText ?? 'Chapter'}: step ${result.chapter.currentStepId}. ${step.instruction.defaultText}`
        );
      }
      if (control === 'exit') {
        // Keep chapter id so resume works from Help; lifecycle already paused.
      }
    },
    [accountUserId, wsId, activeChapterId, progress, persist]
  );

  const startChapter = useCallback(
    async (chapterId: string = PROOF_TOUR_CHAPTER_ID) => {
      if (!accountUserId || !wsId) {
        setAnnouncement('Sign in and open a workspace to start the guided chapter.');
        return;
      }
      let state = progress;
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
        return;
      }
      setActiveChapterId(chapterId);
      setProgress(result.state);
      await persist(result.state);
      const def = getTourChapterDefinition(chapterId);
      const step = result.chapter.currentStepId
        ? getStepDefinition(def!, result.chapter.currentStepId)
        : null;
      setAnnouncement(
        `Started ${def?.title.defaultText ?? chapterId}. ${step?.instruction.defaultText ?? ''}`
      );
    },
    [accountUserId, wsId, progress, persist]
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
        Partial<Pick<TourEvidenceEvent, 'stepId' | 'attemptId' | 'runId'>>
    ): Promise<boolean> => {
      if (!accountUserId || !wsId || !activeChapterId || !activeChapter) return false;
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

      const result = applyTourEvidence(progress, activeChapterId, event, {
        accountUserId,
        workspaceId: wsId,
        expectedPracticeEntityId: practiceTaskId,
      });
      if (!result.ok) return false;
      setProgress(result.state);
      await persist(result.state);
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
    },
    [accountUserId, wsId, activeChapterId, activeChapter, progress, persist, practiceTaskId]
  );

  const reportTargetActivated = useCallback(
    async (targetId: string) => {
      if (!currentStepDef || currentStepDef.targetId !== targetId) return false;
      if (currentStepDef.completionPredicate === 'target_activated') {
        return reportEvidence({ type: 'target_activated', targetId, expectedAction: 'open_create' });
      }
      if (currentStepDef.completionPredicate === 'create_sheet_task_selected') {
        return reportEvidence({
          type: 'create_type_selected',
          createType: 'task',
          targetId,
          expectedAction: 'select_task_type',
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
