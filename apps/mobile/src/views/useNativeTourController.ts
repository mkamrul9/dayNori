import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import {
  applyTourControl,
  applyTourEvidence,
  ensureTourProgressMigrated,
  findChapterProgress,
  getActiveAttemptId,
  getDefaultTourProgress,
  getStepDefinition,
  getTourChapterDefinition,
  getTourPracticeEntityId,
  getTourPracticeTaskId,
  mergeTourProgressStates,
  selectTourScope,
  storeTourScope,
  tourEvidenceForMutation,
  type TourControl,
  type TourEvidenceEvent,
  type TourProgressState,
  type TourChapterProgress,
  type TourStepDefinition,
  type TourEntityType,
} from '@daynori/domain';
import type { DaynoriApiClient } from '@daynori/api-client';
import type { LocalRepositoryPort, SyncEngine } from '@daynori/sync';

export type NativeTourSession = Pick<
  TourEvidenceEvent,
  | 'accountUserId'
  | 'workspaceId'
  | 'chapterId'
  | 'definitionVersion'
  | 'runId'
  | 'stepId'
  | 'attemptId'
> & {
  instruction: string;
  practiceCreation?: { id: string; entityType: TourEntityType };
};
export interface NativeTourOptions {
  visible: boolean;
  chapterId?: string;
  practiceOptIn?: boolean;
  apiClient?: DaynoriApiClient;
  repository?: LocalRepositoryPort;
  syncEngine?: SyncEngine;
  workspaceId?: string | null;
  userId?: string | null;
  onClose: () => void;
  onRequestRoute?: (route: string) => void;
  pendingEvidence?: Partial<TourEvidenceEvent> | null;
  onPendingEvidenceConsumed?: () => void;
  onSessionChange?: (session: NativeTourSession | null) => void;
}

export function useNativeTourController(options: NativeTourOptions) {
  const { userId, workspaceId, repository, apiClient, syncEngine, visible } = options;
  const chapterId = options.chapterId ?? 'tour.task-create-save';
  const definition = getTourChapterDefinition(chapterId);
  const key = [userId, workspaceId, chapterId, visible].join(':');
  const liveKey = useRef(key);
  liveKey.current = key;
  const [progress, setProgress] = useState<TourProgressState>(getDefaultTourProgress);
  const current = useRef(progress);
  current.current = progress;
  const [message, setMessage] = useState('');
  const transitions = useRef<Promise<unknown>>(Promise.resolve());
  const uploads = useRef<Promise<unknown>>(Promise.resolve());
  const callbacks = useRef(options);
  callbacks.current = options;
  const chapter = findChapterProgress(progress, chapterId);
  const step =
    definition && chapter?.currentStepId
      ? getStepDefinition(definition, chapter.currentStepId)
      : undefined;

  const save = useCallback(
    async (state: TourProgressState): Promise<boolean> => {
      if (!userId || !workspaceId || liveKey.current !== key) return false;
      const scope = { accountUserId: userId, workspaceId };
      state = { ...state, scope };
      let local = false;
      if (repository) {
        try {
          const cached = await repository.getPreferenceSnapshot(userId);
          if (liveKey.current !== key) return false;
          await repository.savePreferenceSnapshot({
            userId,
            schemaVersion: cached?.schemaVersion ?? 1,
            revision: cached?.revision ?? 0,
            updatedAt: new Date().toISOString(),
            preferences: {
              ...cached?.preferences,
              tourProgress: storeTourScope(state, cached?.preferences.tourProgress),
            },
          });
          local = true;
        } catch {
          setMessage('Device storage could not save tour progress. Reconnect and retry.');
        }
      }
      const push = async () => {
        if (!apiClient || liveKey.current !== key) return false;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const latest = await apiClient.getUserPreferences();
            if (liveKey.current !== key) return false;
            const merged = mergeTourProgressStates(
              state,
              selectTourScope(latest.data.preferences.tourProgress, scope)
            );
            await apiClient.updateUserPreferences({
              expectedRevision: latest.data.revision,
              preferences: {
                tourProgress: storeTourScope(merged, latest.data.preferences.tourProgress),
              },
            });
            return liveKey.current === key;
          } catch (error) {
            if (liveKey.current !== key) return false;
            if (!(error instanceof Error) || !/409|conflict/i.test(error.message)) {
              setMessage(
                local
                  ? 'Progress saved on this device; waiting to sync.'
                  : 'Progress could not be saved. Reconnect and retry.'
              );
              return false;
            }
          }
        }
        return false;
      };
      const upload = uploads.current.then(push, push);
      uploads.current = upload;
      const durable = local || (await upload);
      if (!durable || liveKey.current !== key) return false;
      current.current = state;
      setProgress(state);
      return true;
    },
    [userId, workspaceId, repository, apiClient, key]
  );

  const transition = useCallback(
    (transform: (state: TourProgressState) => ReturnType<typeof applyTourControl>) => {
      const run = async () => {
        if (liveKey.current !== key) return false;
        const result = transform(current.current);
        if (!result.ok) {
          setMessage(result.error);
          return false;
        }
        if (!(await save(result.state)) || liveKey.current !== key) return false;
        const next =
          result.chapter.currentStepId && definition
            ? getStepDefinition(definition, result.chapter.currentStepId)
            : null;
        const announcement =
          result.chapter.lifecycle === 'completed'
            ? 'Chapter completed with verified actions.'
            : (next?.instruction.defaultText ?? 'Progress saved.');
        setMessage(announcement);
        AccessibilityInfo.announceForAccessibility(announcement);
        return true;
      };
      const task = transitions.current.then(run, run);
      transitions.current = task;
      return task;
    },
    [key, definition, save]
  );

  const control = useCallback(
    (value: TourControl) => {
      if (!userId || !workspaceId) return Promise.resolve(false);
      return transition((state) =>
        applyTourControl(state, chapterId, value, { accountUserId: userId, workspaceId })
      );
    },
    [userId, workspaceId, chapterId, transition]
  );

  useEffect(() => {
    if (!visible || !userId || !workspaceId || !definition) return;
    let cancelled = false;
    const scope = { accountUserId: userId, workspaceId };
    void (async () => {
      try {
        const cached = await repository?.getPreferenceSnapshot(userId);
        let state = selectTourScope(cached?.preferences.tourProgress, scope, true);
        if (apiClient) {
          try {
            const latest = await apiClient.getUserPreferences();
            state = mergeTourProgressStates(
              state,
              selectTourScope(latest.data.preferences.tourProgress, scope)
            );
          } catch {
            /* A validated SQLite snapshot remains usable offline. */
          }
        }
        if (cancelled || liveKey.current !== key) return;
        state = ensureTourProgressMigrated({ tourProgress: state });
        const existing = findChapterProgress(state, chapterId);
        if (existing?.lifecycle === 'active') {
          current.current = state;
          setProgress(state);
          return;
        }
        const result = applyTourControl(
          state,
          chapterId,
          existing?.lifecycle === 'completed' || existing?.lifecycle === 'skipped'
            ? 'restart_chapter'
            : existing
              ? 'resume'
              : 'start',
          scope
        );
        if (!result.ok) {
          setMessage(result.error);
          return;
        }
        if (!existing || existing.lifecycle === 'completed' || existing.lifecycle === 'skipped')
          result.chapter.practiceOptIn = options.practiceOptIn === true;
        if (!cancelled) await save(result.state);
      } catch {
        if (!cancelled)
          setMessage('Could not recover progress. Retry without clearing device data.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, key, repository, apiClient]);

  useEffect(() => {
    if (!visible || !syncEngine || !userId || !workspaceId) return;
    const scope = { accountUserId: userId, workspaceId };
    const tickets = new Map<
      string,
      { base: NativeTourSession; chapter: TourChapterProgress; step: TourStepDefinition }
    >();
    return syncEngine.onEvent((event) => {
      if (event.type === 'local_mutation_started') {
        const ch = findChapterProgress(current.current, chapterId);
        const def = getTourChapterDefinition(chapterId);
        const st = ch?.currentStepId && def ? getStepDefinition(def, ch.currentStepId) : null;
        const attempt = ch && getActiveAttemptId(ch);
        if (!ch || !st || !attempt || !ch.runId) return;
        if (tickets.size >= 100) tickets.delete(tickets.keys().next().value!);
        tickets.set(event.operationId, {
          chapter: ch,
          step: st,
          base: {
            ...scope,
            chapterId,
            definitionVersion: ch.definitionVersion,
            runId: ch.runId,
            stepId: ch.currentStepId!,
            attemptId: attempt,
            instruction: st.instruction.defaultText,
          },
        });
      } else if (event.type === 'local_mutation_committed') {
        const captured = tickets.get(event.operationId);
        tickets.delete(event.operationId);
        if (!captured) return;
        const evidence = tourEvidenceForMutation(captured.step, captured.chapter, scope, event);
        if (evidence)
          void transition((state) =>
            applyTourEvidence(
              state,
              chapterId,
              { ...evidence, ...captured.base, at: new Date().toISOString() } as TourEvidenceEvent,
              scope
            )
          );
      }
    });
  }, [visible, key, syncEngine, transition]);

  useEffect(() => {
    const notify = callbacks.current.onSessionChange;
    if (
      !visible ||
      !userId ||
      !workspaceId ||
      !chapter ||
      chapter.lifecycle !== 'active' ||
      !step ||
      !chapter.runId
    ) {
      notify?.(null);
      return;
    }
    const type = step.entityType;
    const practiceCreation =
      chapter.practiceOptIn &&
      type &&
      ['entity_saved_locally', 'practice_task_saved_locally'].includes(step.completionPredicate)
        ? {
            entityType: type,
            id:
              type === 'task'
                ? getTourPracticeTaskId(workspaceId, userId, chapterId)
                : getTourPracticeEntityId(workspaceId, userId, chapterId, type),
          }
        : undefined;
    notify?.({
      accountUserId: userId,
      workspaceId,
      chapterId,
      definitionVersion: chapter.definitionVersion,
      runId: chapter.runId,
      stepId: chapter.currentStepId!,
      attemptId: getActiveAttemptId(chapter)!,
      instruction: step.instruction.defaultText,
      practiceCreation,
    });
  }, [visible, key, chapter, step]);

  useEffect(() => {
    const event = options.pendingEvidence;
    if (!visible || !event || !userId || !workspaceId) return;
    callbacks.current.onPendingEvidenceConsumed?.();
    if (
      !event.type ||
      !event.runId ||
      !event.stepId ||
      !event.attemptId ||
      !event.accountUserId ||
      !event.workspaceId ||
      !event.chapterId ||
      !event.definitionVersion
    )
      return;
    void transition((state) =>
      applyTourEvidence(
        state,
        chapterId,
        { ...event, at: new Date().toISOString() } as TourEvidenceEvent,
        {
          accountUserId: userId,
          workspaceId,
          expectedPracticeEntityId:
            event.type === 'search_result_opened' && event.recordLoaded === true
              ? event.entityId
              : undefined,
        }
      )
    );
  }, [options.pendingEvidence, visible, key, transition]);

  const capture = useCallback(() => {
    const ch = findChapterProgress(current.current, chapterId);
    const attemptId = ch && getActiveAttemptId(ch);
    const base =
      ch?.runId && ch.currentStepId && attemptId && userId && workspaceId
        ? {
            accountUserId: userId,
            workspaceId,
            chapterId,
            definitionVersion: ch.definitionVersion,
            runId: ch.runId,
            stepId: ch.currentStepId,
            attemptId,
          }
        : null;
    return (evidence: Partial<TourEvidenceEvent>) =>
      base
        ? transition((state) =>
            applyTourEvidence(
              state,
              chapterId,
              { ...evidence, ...base, at: new Date().toISOString() } as TourEvidenceEvent,
              { accountUserId: base.accountUserId, workspaceId: base.workspaceId }
            )
          )
        : Promise.resolve(false);
  }, [chapterId, userId, workspaceId, transition]);
  const reusePractice = async () => {
    const report = capture();
    const artifact = chapter?.practiceArtifacts?.find(
      (item) =>
        item.entityType === step?.entityType &&
        item.createdByTour &&
        !item.userOwned &&
        item.creationOperationId
    );
    if (!artifact || !syncEngine) return false;
    const namespace = syncEngine.getAccountNamespace();
    if (namespace.userId !== userId || namespace.workspaceId !== workspaceId) return false;
    const record = await syncEngine.getItemHeader(artifact.entityId);
    if (!record || record.deletedAt) return false;
    return report({
      type: 'practice_reused',
      entityId: record.id,
      entityType: artifact.entityType,
      operationId: artifact.creationOperationId,
      recordLoaded: true,
    });
  };
  return { progress, chapter, step, definition, message, control, save, capture, reusePractice };
}
