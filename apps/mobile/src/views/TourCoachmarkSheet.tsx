import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AccessibilityInfo,
  BackHandler,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors, radii, spacing, type ThemeMode } from '@daynori/design-tokens';
import { MobileButton, MobileCard } from '@daynori/ui-mobile';
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
} from '@daynori/domain';
import type { DaynoriApiClient } from '@daynori/api-client';

export const MOBILE_PROOF_TOUR_ID = TOUR_CHAPTER_TASK_CREATE_SAVE.id;

export interface TourCoachmarkSheetProps {
  visible: boolean;
  themeMode: ThemeMode;
  apiClient?: DaynoriApiClient;
  workspaceId?: string | null;
  userId?: string | null;
  onClose: () => void;
  /** Called when the sheet wants navigation (e.g. open Create / Plan). */
  onRequestRoute?: (route: string) => void;
  /** External evidence from Create/Plan real controls. */
  pendingEvidence?: Omit<
    TourEvidenceEvent,
    | 'at'
    | 'accountUserId'
    | 'workspaceId'
    | 'chapterId'
    | 'definitionVersion'
    | 'runId'
    | 'stepId'
    | 'attemptId'
  > | null;
  onPendingEvidenceConsumed?: () => void;
}

/**
 * Native presentation adapter for the Phase 79 proof tour.
 * Targets are semantic IDs (testID); progress is account/workspace scoped.
 */
export const TourCoachmarkSheet: React.FC<TourCoachmarkSheetProps> = ({
  visible,
  themeMode,
  apiClient,
  workspaceId,
  userId,
  onClose,
  onRequestRoute,
  pendingEvidence,
  onPendingEvidenceConsumed,
}) => {
  const palette = colors[themeMode];
  const [progress, setProgress] = useState<TourProgressState>(getDefaultTourProgress);
  const [revision, setRevision] = useState<number | null>(null);
  const [announce, setAnnounce] = useState('');
  const chapterId = MOBILE_PROOF_TOUR_ID;

  const chapter = useMemo(
    () => findChapterProgress(progress, chapterId) ?? null,
    [progress, chapterId]
  );
  const def = getTourChapterDefinition(chapterId)!;
  const step = chapter?.currentStepId
    ? getStepDefinition(def, chapter.currentStepId)
    : null;
  const practiceTaskId =
    userId && workspaceId ? getTourPracticeTaskId(workspaceId, userId, chapterId) : null;

  const persist = useCallback(
    async (next: TourProgressState) => {
      if (!apiClient || !userId || !workspaceId) return;
      let expected = revision;
      for (let i = 0; i < 3; i++) {
        try {
          if (expected == null) {
            const pref = await apiClient.getUserPreferences();
            expected = pref.data.revision;
          }
          const res = await apiClient.updateUserPreferences({
            preferences: { tourProgress: next },
            expectedRevision: expected,
          });
          setRevision(res.data.revision);
          return;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (!msg.includes('409') && !msg.includes('conflict')) return;
          const latest = await apiClient.getUserPreferences().catch(() => null);
          if (!latest?.data) return;
          expected = latest.data.revision;
          setRevision(expected);
          next = mergeTourProgressStates(
            next,
            ensureTourProgressMigrated({
              onboarding: latest.data.preferences?.onboarding,
              tourProgress: latest.data.preferences?.tourProgress,
            })
          );
          setProgress(next);
        }
      }
    },
    [apiClient, userId, workspaceId, revision]
  );

  useEffect(() => {
    if (!visible || !userId || !workspaceId) return;
    let cancelled = false;
    (async () => {
      if (!apiClient) {
        setProgress(getDefaultTourProgress());
        return;
      }
      try {
        const pref = await apiClient.getUserPreferences();
        if (cancelled) return;
        setRevision(pref.data.revision);
        const migrated = ensureTourProgressMigrated({
          onboarding: pref.data.preferences?.onboarding,
          tourProgress: validateTourProgressState(pref.data.preferences?.tourProgress),
        });
        setProgress(migrated);
        const existing = findChapterProgress(migrated, chapterId);
        const control: TourControl =
          existing?.lifecycle === 'completed' || existing?.lifecycle === 'skipped'
            ? 'restart_chapter'
            : existing?.lifecycle === 'paused' || existing?.lifecycle === 'blocked'
              ? 'resume'
              : 'start';
        const started = applyTourControl(migrated, chapterId, control, {
          accountUserId: userId,
          workspaceId,
        });
        if (started.ok) {
          setProgress(started.state);
          await persist(started.state);
          const s = started.chapter.currentStepId
            ? getStepDefinition(def, started.chapter.currentStepId)
            : null;
          const msg = `Started ${def.title.defaultText}. ${s?.instruction.defaultText ?? ''}`;
          setAnnounce(msg);
          AccessibilityInfo.announceForAccessibility?.(msg);
        }
      } catch {
        /* offline — keep local machine state */
        const started = applyTourControl(getDefaultTourProgress(), chapterId, 'start', {
          accountUserId: userId,
          workspaceId,
        });
        if (started.ok) setProgress(started.state);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- start once per open
  }, [visible, userId, workspaceId]);

  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!userId || !workspaceId) {
        onClose();
        return true;
      }
      const result = applyTourControl(progress, chapterId, 'exit', {
        accountUserId: userId,
        workspaceId,
      });
      if (result.ok) {
        setProgress(result.state);
        void persist(result.state);
      }
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [visible, progress, userId, workspaceId, onClose, persist]);

  useEffect(() => {
    if (!pendingEvidence || !visible || !userId || !workspaceId || !chapter) return;
    const attemptId = getActiveAttemptId(chapter);
    if (!attemptId || !chapter.runId || !chapter.currentStepId) return;
    const event: TourEvidenceEvent = {
      at: new Date().toISOString(),
      accountUserId: userId,
      workspaceId,
      chapterId,
      definitionVersion: chapter.definitionVersion,
      runId: chapter.runId,
      stepId: chapter.currentStepId,
      attemptId,
      ...pendingEvidence,
    };
    const result = applyTourEvidence(progress, chapterId, event, {
      accountUserId: userId,
      workspaceId,
      expectedPracticeEntityId: practiceTaskId,
    });
    onPendingEvidenceConsumed?.();
    if (!result.ok) return;
    setProgress(result.state);
    void persist(result.state);
    if (result.chapter.lifecycle === 'completed') {
      const msg = `${def.title.defaultText} completed.`;
      setAnnounce(msg);
      AccessibilityInfo.announceForAccessibility?.(msg);
      onClose();
    } else if (result.chapter.currentStepId) {
      const s = getStepDefinition(def, result.chapter.currentStepId);
      const msg = `Verified. ${s?.instruction.defaultText ?? ''}`;
      setAnnounce(msg);
      AccessibilityInfo.announceForAccessibility?.(msg);
      if (s?.route) onRequestRoute?.(s.route);
    }
  }, [
    pendingEvidence,
    visible,
    userId,
    workspaceId,
    chapter,
    progress,
    practiceTaskId,
    persist,
    onPendingEvidenceConsumed,
    onClose,
    onRequestRoute,
    def,
  ]);

  const runControl = async (control: TourControl) => {
    if (!userId || !workspaceId) return;
    const result = applyTourControl(progress, chapterId, control, {
      accountUserId: userId,
      workspaceId,
    });
    if (!result.ok) {
      setAnnounce(result.error);
      return;
    }
    setProgress(result.state);
    await persist(result.state);
    if (control === 'exit' || result.chapter.lifecycle === 'completed') {
      onClose();
    }
  };

  if (!visible || !step || !chapter) return null;

  const stepIndex = def.steps.findIndex((s) => s.id === step.id);

  return (
    <View
      style={[styles.overlay, { backgroundColor: 'transparent' }]}
      pointerEvents="box-none"
      testID="tour-coachmark-sheet"
    >
      <MobileCard
        themeMode={themeMode}
        style={[styles.card, { borderColor: palette.border.strong }]}
        accessibilityLabel={`${def.title.defaultText}, step ${stepIndex + 1} of ${def.steps.length}. ${step.instruction.defaultText}`}
      >
        <Text style={{ fontWeight: '700', color: palette.text.primary, fontSize: 16 }}>
          {def.title.defaultText} · {stepIndex + 1}/{def.steps.length}
        </Text>
        <Text style={{ marginTop: 4, fontWeight: '600', color: palette.text.primary }}>
          {step.title.defaultText}
        </Text>
        <Text style={{ marginTop: 6, color: palette.text.secondary, fontSize: 13 }}>
          {step.instruction.defaultText}
        </Text>
        <Text style={{ marginTop: 6, color: palette.text.secondary, fontSize: 12 }}>
          {step.recovery.defaultText}
        </Text>
        {announce ? (
          <Text style={{ marginTop: 6, color: palette.text.secondary, fontSize: 12 }}>{announce}</Text>
        ) : null}
        <View style={styles.row}>
          <MobileButton themeMode={themeMode} variant="secondary" onPress={() => void runControl('back')}>
            Back
          </MobileButton>
          {step.allowInformationalNext ? (
            <MobileButton themeMode={themeMode} variant="primary" onPress={() => void runControl('next')}>
              Next
            </MobileButton>
          ) : null}
          {step.allowSkip ? (
            <MobileButton
              themeMode={themeMode}
              variant="secondary"
              onPress={() => void runControl('skip_step')}
            >
              Skip step
            </MobileButton>
          ) : null}
          <MobileButton themeMode={themeMode} variant="secondary" onPress={() => void runControl('pause')}>
            Pause
          </MobileButton>
          <MobileButton
            themeMode={themeMode}
            variant="secondary"
            onPress={() => void runControl('restart_chapter')}
          >
            Restart
          </MobileButton>
          <MobileButton themeMode={themeMode} variant="secondary" onPress={() => void runControl('exit')}>
            Exit
          </MobileButton>
        </View>
        {step.targetId ? (
          <Text style={{ marginTop: 8, fontSize: 11, color: palette.text.secondary }}>
            Target: {step.targetId}
            {practiceTaskId ? ` · practice ${practiceTaskId.slice(0, 8)}…` : ''}
          </Text>
        ) : null}
      </MobileCard>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    zIndex: 80,
    elevation: 80,
  },
  card: {
    margin: spacing.base,
    padding: spacing.base,
    borderRadius: radii.lg,
    borderWidth: 1,
    marginBottom: spacing.xl,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: spacing.sm,
  },
});
