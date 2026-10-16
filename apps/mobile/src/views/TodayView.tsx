import React, { useState, useMemo, useRef, useEffect } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing, touchTargets, type ThemeMode } from '@daynori/design-tokens';
import {
  MobileButton,
  MobileCard,
  MobileEmptyState,
  MobileFeedback,
  MobileListRow,
  MobileModalSheet,
  MobileRoutineRow,
} from '@daynori/ui-mobile';
import {
  calculateGentleProgress,
  explainWhyDueToday,
  type RoutineFrequency,
  type Weekday,
  type RoutineOccurrenceStatus,
} from '@daynori/domain';

export interface MobileRoutineItem {
  id: string;
  title: string;
  details?: string | null;
  frequency: RoutineFrequency;
  weekdays: Weekday[];
  timezone: string;
  scheduledTime?: string | null;
  activeFrom?: string;
  activeTo?: string | null;
  isPaused?: boolean;
  isArchived?: boolean;
}

export interface MobileOccurrenceItem {
  id: string;
  routineId: string;
  status: RoutineOccurrenceStatus;
  completedAt?: string | null;
  scheduledDate: string;
}

export interface MobileTaskItem {
  id: string;
  title: string;
  due: string;
  completed: boolean;
}

export interface TodayViewProps {
  themeMode: ThemeMode;
  onNavigateToPlan: () => void;
  onNavigateToJournal: () => void;
  onOpenCreate: () => void;
  testID?: string;
  todayDate?: string;
  initialRoutines?: MobileRoutineItem[];
  initialOccurrences?: MobileOccurrenceItem[];
  initialTasks?: MobileTaskItem[];
}

const DEFAULT_TODAY = '2026-10-14';
const DEFAULT_YESTERDAY = '2026-10-13';

const DEFAULT_ROUTINES: MobileRoutineItem[] = [
  {
    id: 'r1',
    title: 'Morning deep work session',
    details: 'Focus on primary architectural deliverables without interruptions.',
    frequency: 'weekdays',
    weekdays: [1, 2, 3, 4, 5],
    timezone: 'America/New_York',
    scheduledTime: '08:30',
    activeFrom: '2026-01-01',
    activeTo: null,
    isPaused: false,
    isArchived: false,
  },
  {
    id: 'r2',
    title: 'Evening reflection & summary',
    details: 'Review completed items and write brief journal entry.',
    frequency: 'daily',
    weekdays: [1, 2, 3, 4, 5, 6, 7],
    timezone: 'America/New_York',
    scheduledTime: '20:00',
    activeFrom: '2026-01-01',
    activeTo: null,
    isPaused: false,
    isArchived: false,
  },
];

const DEFAULT_OCCURRENCES: MobileOccurrenceItem[] = [
  // Today's occurrences
  {
    id: 'occ_r1_today',
    routineId: 'r1',
    status: 'pending',
    completedAt: null,
    scheduledDate: DEFAULT_TODAY,
  },
  {
    id: 'occ_r2_today',
    routineId: 'r2',
    status: 'pending',
    completedAt: null,
    scheduledDate: DEFAULT_TODAY,
  },
  // Yesterday's preserved history
  {
    id: 'occ_r1_yesterday',
    routineId: 'r1',
    status: 'done',
    completedAt: `${DEFAULT_YESTERDAY}T09:15:00.000Z`,
    scheduledDate: DEFAULT_YESTERDAY,
  },
  {
    id: 'occ_r2_yesterday',
    routineId: 'r2',
    status: 'done',
    completedAt: `${DEFAULT_YESTERDAY}T20:45:00.000Z`,
    scheduledDate: DEFAULT_YESTERDAY,
  },
];

const DEFAULT_TASKS: MobileTaskItem[] = [
  {
    id: 't1',
    title: 'Review quarterly architecture plan',
    due: 'Today, 4:00 PM',
    completed: false,
  },
  {
    id: 't2',
    title: 'Prepare project handoff documentation',
    due: 'Today, 6:00 PM',
    completed: false,
  },
];

export const TodayView: React.FC<TodayViewProps> = ({
  themeMode,
  onNavigateToPlan,
  onNavigateToJournal,
  onOpenCreate,
  testID = 'today-view',
  todayDate = DEFAULT_TODAY,
  initialRoutines = DEFAULT_ROUTINES,
  initialOccurrences = DEFAULT_OCCURRENCES,
  initialTasks = DEFAULT_TASKS,
}) => {
  const palette = colors[themeMode];

  // Interactive state toggles for testing empty, loading, and error states
  const [demoState, setDemoState] = useState<'normal' | 'empty' | 'loading' | 'error'>('normal');
  const [tasks, setTasks] = useState<MobileTaskItem[]>(initialTasks);
  const [routines] = useState<MobileRoutineItem[]>(initialRoutines);
  const [occurrences, setOccurrences] = useState<MobileOccurrenceItem[]>(initialOccurrences);

  // Undo notification state
  const [undoNotice, setUndoNotice] = useState<{
    message: string;
    routineId: string;
    occurrenceId: string;
    previousStatus: RoutineOccurrenceStatus;
    previousCompletedAt: string | null;
  } | null>(null);
  const undoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // History sheet state
  const [historyRoutine, setHistoryRoutine] = useState<MobileRoutineItem | null>(null);

  useEffect(() => {
    return () => {
      if (undoTimeoutRef.current) {
        clearTimeout(undoTimeoutRef.current);
      }
    };
  }, []);

  const toggleTask = (id: string) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t)));
  };

  // Find occurrence for a routine today
  const getTodayOccurrence = (routineId: string): MobileOccurrenceItem | null => {
    return (
      occurrences.find(
        (o) =>
          o.routineId === routineId && o.scheduledDate === todayDate && o.status !== 'cancelled'
      ) || null
    );
  };

  // Gentle progress summary
  const progress = useMemo(() => {
    const todayOccs = routines
      .map((r) => getTodayOccurrence(r.id))
      .filter(Boolean) as MobileOccurrenceItem[];
    return calculateGentleProgress(todayOccs);
  }, [routines, occurrences, todayDate]);

  const showUndoToast = (
    message: string,
    routineId: string,
    occurrenceId: string,
    previousStatus: RoutineOccurrenceStatus,
    previousCompletedAt: string | null
  ) => {
    if (undoTimeoutRef.current) {
      clearTimeout(undoTimeoutRef.current);
    }
    setUndoNotice({
      message,
      routineId,
      occurrenceId,
      previousStatus,
      previousCompletedAt,
    });
    undoTimeoutRef.current = setTimeout(() => {
      setUndoNotice(null);
    }, 5000);
  };

  const handleCompleteRoutine = (routineId: string, occurrenceId?: string) => {
    const occ = occurrenceId
      ? occurrences.find((o) => o.id === occurrenceId)
      : getTodayOccurrence(routineId);

    const prevStatus = occ?.status || 'pending';
    const prevCompletedAt = occ?.completedAt || null;
    const nowIso = new Date().toISOString();
    const effectiveOccId = occ?.id || `occ_${routineId}_${todayDate}`;

    setOccurrences((prev) => {
      const existing = prev.find((o) => o.id === effectiveOccId);
      if (existing) {
        return prev.map((o) =>
          o.id === effectiveOccId ? { ...o, status: 'done', completedAt: nowIso } : o
        );
      }
      return [
        ...prev,
        {
          id: effectiveOccId,
          routineId,
          status: 'done',
          completedAt: nowIso,
          scheduledDate: todayDate,
        },
      ];
    });

    const routine = routines.find((r) => r.id === routineId);
    showUndoToast(
      `Marked "${routine?.title || 'routine'}" as done.`,
      routineId,
      effectiveOccId,
      prevStatus,
      prevCompletedAt
    );
  };

  const handleSkipRoutine = (routineId: string, occurrenceId?: string) => {
    const occ = occurrenceId
      ? occurrences.find((o) => o.id === occurrenceId)
      : getTodayOccurrence(routineId);

    const prevStatus = occ?.status || 'pending';
    const prevCompletedAt = occ?.completedAt || null;
    const effectiveOccId = occ?.id || `occ_${routineId}_${todayDate}`;

    setOccurrences((prev) => {
      const existing = prev.find((o) => o.id === effectiveOccId);
      if (existing) {
        return prev.map((o) =>
          o.id === effectiveOccId ? { ...o, status: 'skipped', completedAt: null } : o
        );
      }
      return [
        ...prev,
        {
          id: effectiveOccId,
          routineId,
          status: 'skipped',
          completedAt: null,
          scheduledDate: todayDate,
        },
      ];
    });

    const routine = routines.find((r) => r.id === routineId);
    showUndoToast(
      `Skipped "${routine?.title || 'routine'}".`,
      routineId,
      effectiveOccId,
      prevStatus,
      prevCompletedAt
    );
  };

  const handleReopenRoutine = (routineId: string, occurrenceId?: string) => {
    const effectiveOccId = occurrenceId || getTodayOccurrence(routineId)?.id;
    if (!effectiveOccId) return;

    setOccurrences((prev) =>
      prev.map((o) =>
        o.id === effectiveOccId ? { ...o, status: 'pending', completedAt: null } : o
      )
    );
  };

  const handleUndo = () => {
    if (!undoNotice) return;
    if (undoTimeoutRef.current) {
      clearTimeout(undoTimeoutRef.current);
    }
    const { occurrenceId, previousStatus, previousCompletedAt } = undoNotice;
    setOccurrences((prev) =>
      prev.map((o) =>
        o.id === occurrenceId
          ? { ...o, status: previousStatus, completedAt: previousCompletedAt }
          : o
      )
    );
    setUndoNotice(null);
  };

  // Occurrences for currently selected history routine
  const historyOccurrences = useMemo(() => {
    if (!historyRoutine) return [];
    return occurrences
      .filter((o) => o.routineId === historyRoutine.id)
      .sort((a, b) => b.scheduledDate.localeCompare(a.scheduledDate));
  }, [historyRoutine, occurrences]);

  const historyProgress = useMemo(() => {
    return calculateGentleProgress(historyOccurrences);
  }, [historyOccurrences]);

  return (
    <ScrollView
      testID={testID}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
    >
      {/* Date & Restrained Greeting */}
      <View style={styles.greetingHeader}>
        <Text style={[styles.greetingDate, { color: palette.text.secondary }]}>
          Wednesday, October 14
        </Text>
        <Text
          accessibilityRole="header"
          style={[styles.greetingTitle, { color: palette.text.primary }]}
        >
          Good afternoon, Alex
        </Text>
      </View>

      {/* State switchers for verification & demonstration */}
      <View style={styles.stateSelector}>
        <Text style={[styles.stateSelectorLabel, { color: palette.text.secondary }]}>
          State Preview:
        </Text>
        <View style={styles.stateButtonGroup}>
          {(['normal', 'empty', 'loading', 'error'] as const).map((s) => (
            <Pressable
              key={s}
              testID={`state-btn-${s}`}
              accessibilityRole="button"
              accessibilityLabel={`Show ${s} state`}
              accessibilityState={{ selected: demoState === s }}
              onPress={() => setDemoState(s)}
              style={[
                styles.stateButton,
                {
                  backgroundColor: demoState === s ? palette.action.primary : palette.surfaceRaised,
                  borderColor: palette.border.subtle,
                },
              ]}
            >
              <Text
                style={[
                  styles.stateButtonText,
                  { color: demoState === s ? palette.action.label : palette.text.primary },
                ]}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Loading State */}
      {demoState === 'loading' && (
        <View testID="today-loading-state" style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={palette.action.primary} />
          <Text style={[styles.loadingText, { color: palette.text.secondary }]}>
            Loading today&apos;s agenda...
          </Text>
        </View>
      )}

      {/* Error State */}
      {demoState === 'error' && (
        <View testID="today-error-state" style={styles.errorContainer}>
          <MobileFeedback
            severity="danger"
            message="Failed to synchronize today's items with workspace storage."
            themeMode={themeMode}
          />
          <View style={{ marginTop: spacing.sm }}>
            <MobileButton
              variant="secondary"
              themeMode={themeMode}
              onPress={() => setDemoState('normal')}
              accessibilityLabel="Retry connection"
            >
              Retry Connection
            </MobileButton>
          </View>
        </View>
      )}

      {/* Empty State */}
      {demoState === 'empty' && (
        <MobileEmptyState
          testID="today-empty-state"
          title="All caught up for today"
          description="You have no remaining tasks or routines scheduled for today. Take time to reflect or plan ahead."
          actionLabel="Create task"
          onAction={onOpenCreate}
          themeMode={themeMode}
        />
      )}

      {/* Normal State */}
      {demoState === 'normal' && (
        <>
          {/* Section 1: Daily Routines Checklist */}
          <View style={styles.section} testID="today-routines-section">
            <View style={styles.sectionHeaderRow}>
              <Text style={[styles.sectionTitle, { color: palette.text.primary }]}>
                Today&apos;s Routines ({progress.completedCount}/{routines.length} completed)
              </Text>
            </View>

            {/* Gentle non-punitive encouragement */}
            <View
              style={[
                styles.gentleProgressBanner,
                {
                  backgroundColor: palette.surfaceRaised,
                  borderColor: palette.border.subtle,
                },
              ]}
            >
              <Text style={[styles.gentleProgressText, { color: palette.text.primary }]}>
                {progress.message}
              </Text>
            </View>

            <MobileCard themeMode={themeMode}>
              {routines.map((routine) => {
                const occ = getTodayOccurrence(routine.id);
                return (
                  <MobileRoutineRow
                    key={routine.id}
                    routine={routine}
                    occurrence={occ}
                    viewingDate={todayDate}
                    themeMode={themeMode}
                    onComplete={handleCompleteRoutine}
                    onSkip={handleSkipRoutine}
                    onReopen={handleReopenRoutine}
                    onViewHistory={(id) => {
                      const r = routines.find((item) => item.id === id);
                      if (r) setHistoryRoutine(r);
                    }}
                    testID={`mobile-routine-row-${routine.id}`}
                  />
                );
              })}
            </MobileCard>
          </View>

          {/* Section 2: Tasks Due Today (Strictly Separate from Routines) */}
          <View style={styles.section} testID="today-tasks-section">
            <View style={styles.sectionHeaderRow}>
              <Text style={[styles.sectionTitle, { color: palette.text.primary }]}>
                Due Today ({tasks.filter((t) => !t.completed).length})
              </Text>
              <Text style={[styles.sectionSubtitle, { color: palette.text.secondary }]}>
                One-off tasks
              </Text>
            </View>

            <MobileCard themeMode={themeMode}>
              {tasks.map((task) => (
                <MobileListRow
                  key={task.id}
                  title={task.title}
                  metadata={task.due}
                  selected={task.completed}
                  themeMode={themeMode}
                  onPress={() => toggleTask(task.id)}
                  accessibilityLabel={`${task.title}, ${task.completed ? 'completed' : 'not completed'}`}
                />
              ))}
            </MobileCard>
          </View>

          {/* Section 3: Next 7 Days Preview linking to Plan */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: palette.text.primary }]}>
              Upcoming 7 Days
            </Text>
            <MobileCard themeMode={themeMode}>
              <Text style={[styles.cardBody, { color: palette.text.secondary }]}>
                3 deadlines scheduled across Thursday and Friday.
              </Text>
              <View style={styles.cardAction}>
                <MobileButton
                  variant="subtle"
                  themeMode={themeMode}
                  onPress={onNavigateToPlan}
                  accessibilityLabel="View full schedule in Plan"
                >
                  View Full Schedule in Plan &rarr;
                </MobileButton>
              </View>
            </MobileCard>
          </View>

          {/* Section 4: Journal Reflection Prompt */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: palette.text.primary }]}>
              Daily Reflection
            </Text>
            <MobileCard themeMode={themeMode}>
              <Text style={[styles.cardPrompt, { color: palette.text.primary }]}>
                What is one thing that brought clarity today?
              </Text>
              <Text style={[styles.cardBody, { color: palette.text.secondary }]}>
                Private entries are stored safely in your protected journal.
              </Text>
              <View style={styles.cardAction}>
                <MobileButton
                  variant="secondary"
                  themeMode={themeMode}
                  onPress={onNavigateToJournal}
                  accessibilityLabel="Write reflection in Journal"
                >
                  ✍️ Write in Journal
                </MobileButton>
              </View>
            </MobileCard>
          </View>
        </>
      )}

      {/* Floating Reversible Undo Toast */}
      {undoNotice && (
        <View
          testID="undo-toast"
          accessibilityLiveRegion="polite"
          style={[
            styles.undoToast,
            {
              backgroundColor: palette.action.primary,
            },
          ]}
        >
          <Text style={[styles.undoToastText, { color: palette.action.label }]}>
            {undoNotice.message}
          </Text>
          <Pressable
            testID="undo-toast-btn"
            accessibilityRole="button"
            accessibilityLabel="Undo action"
            onPress={handleUndo}
            style={styles.undoToastButton}
          >
            <Text style={[styles.undoToastButtonText, { color: palette.action.label }]}>Undo</Text>
          </Pressable>
        </View>
      )}

      {/* Routine History Sheet */}
      {historyRoutine && (
        <MobileModalSheet
          visible={Boolean(historyRoutine)}
          onClose={() => setHistoryRoutine(null)}
          title={`History: ${historyRoutine.title}`}
          themeMode={themeMode}
          testID="mobile-routine-history-sheet"
        >
          <View style={styles.historyContainer}>
            <Text style={[styles.historySubtitle, { color: palette.text.secondary }]}>
              {
                explainWhyDueToday(
                  {
                    frequency: historyRoutine.frequency,
                    weekdays: historyRoutine.weekdays,
                    timezone: historyRoutine.timezone,
                    scheduledTime: historyRoutine.scheduledTime || null,
                    activeFrom: historyRoutine.activeFrom || '2026-01-01',
                    activeTo: historyRoutine.activeTo || null,
                    isPaused: Boolean(historyRoutine.isPaused),
                    isArchived: Boolean(historyRoutine.isArchived),
                  },
                  todayDate
                ).cadenceDescription
              }
            </Text>

            {/* Gentle Progress Stats */}
            <View
              style={[
                styles.historyStatsCard,
                {
                  backgroundColor: palette.surfaceRaised,
                  borderColor: palette.border.subtle,
                },
              ]}
            >
              <Text style={[styles.historyStatsTitle, { color: palette.text.primary }]}>
                Gentle Routine Overview
              </Text>
              <Text style={[styles.historyStatsMessage, { color: palette.text.secondary }]}>
                {historyProgress.message}
              </Text>
              <View style={styles.historyStatsRow}>
                <Text style={[styles.historyStatPill, { color: palette.text.primary }]}>
                  Completed: {historyProgress.completedCount}
                </Text>
                <Text style={[styles.historyStatPill, { color: palette.text.secondary }]}>
                  Skipped: {historyProgress.skippedCount}
                </Text>
              </View>
            </View>

            {/* Past Occurrences List */}
            <Text style={[styles.historyListTitle, { color: palette.text.primary }]}>
              Occurrences & Revisions
            </Text>
            {historyOccurrences.length === 0 ? (
              <Text style={{ color: palette.text.secondary, fontSize: 13, padding: spacing.sm }}>
                No recorded occurrences yet.
              </Text>
            ) : (
              historyOccurrences.map((occ) => (
                <View
                  key={occ.id}
                  testID={`history-occ-${occ.scheduledDate}`}
                  style={[
                    styles.historyItemRow,
                    {
                      borderBottomColor: palette.border.subtle,
                    },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.historyItemDate, { color: palette.text.primary }]}>
                      {occ.scheduledDate === todayDate
                        ? 'Today'
                        : occ.scheduledDate === DEFAULT_YESTERDAY
                          ? 'Yesterday'
                          : occ.scheduledDate}
                    </Text>
                    {occ.completedAt && (
                      <Text
                        style={[styles.historyItemTimestamp, { color: palette.text.secondary }]}
                      >
                        Completed at {new Date(occ.completedAt).toLocaleTimeString()}
                      </Text>
                    )}
                  </View>
                  <View style={styles.historyBadgeGroup}>
                    <Text
                      style={[
                        styles.historyStatusBadge,
                        {
                          backgroundColor:
                            occ.status === 'done'
                              ? '#d1fae5'
                              : occ.status === 'skipped'
                                ? '#fef3c7'
                                : palette.surfaceRaised,
                          color:
                            occ.status === 'done'
                              ? '#065f46'
                              : occ.status === 'skipped'
                                ? '#92400e'
                                : palette.text.secondary,
                        },
                      ]}
                    >
                      {occ.status.toUpperCase()}
                    </Text>
                    {occ.status !== 'pending' && (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Reopen occurrence for ${occ.scheduledDate}`}
                        onPress={() => handleReopenRoutine(historyRoutine.id, occ.id)}
                        style={styles.historyReopenBtn}
                      >
                        <Text
                          style={{ color: palette.action.primary, fontSize: 12, fontWeight: '600' }}
                        >
                          Reopen
                        </Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              ))
            )}

            <View style={{ marginTop: spacing.lg }}>
              <MobileButton
                variant="secondary"
                themeMode={themeMode}
                onPress={() => setHistoryRoutine(null)}
                accessibilityLabel="Close history"
              >
                Close History
              </MobileButton>
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
  greetingHeader: {
    marginBottom: spacing.md,
  },
  greetingDate: {
    fontSize: 13,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  greetingTitle: {
    fontSize: 24,
    fontWeight: '800',
    marginTop: 2,
  },
  stateSelector: {
    marginBottom: spacing.md,
  },
  stateSelectorLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  stateButtonGroup: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  stateButton: {
    flex: 1,
    minHeight: 36,
    borderRadius: radii.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  stateButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  loadingContainer: {
    padding: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 200,
  },
  loadingText: {
    marginTop: spacing.md,
    fontSize: 14,
  },
  errorContainer: {
    marginVertical: spacing.md,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  sectionSubtitle: {
    fontSize: 12,
    fontWeight: '500',
  },
  gentleProgressBanner: {
    padding: spacing.sm,
    borderRadius: radii.card,
    borderWidth: 1,
    marginBottom: spacing.sm,
  },
  gentleProgressText: {
    fontSize: 12,
    fontWeight: '500',
  },
  cardPrompt: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  cardBody: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: spacing.sm,
  },
  cardAction: {
    marginTop: spacing.xs,
  },
  undoToast: {
    position: 'absolute',
    bottom: spacing.lg,
    left: spacing.md,
    right: spacing.md,
    padding: spacing.md,
    borderRadius: radii.card,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  undoToastText: {
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  undoToastButton: {
    minHeight: touchTargets.mobileMin,
    minWidth: touchTargets.mobileMin,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  undoToastButtonText: {
    fontSize: 13,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  historyContainer: {
    paddingVertical: spacing.sm,
  },
  historySubtitle: {
    fontSize: 13,
    marginBottom: spacing.md,
  },
  historyStatsCard: {
    padding: spacing.md,
    borderRadius: radii.card,
    borderWidth: 1,
    marginBottom: spacing.md,
  },
  historyStatsTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  historyStatsMessage: {
    fontSize: 12,
    lineHeight: 16,
    marginBottom: spacing.xs,
  },
  historyStatsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: 4,
  },
  historyStatPill: {
    fontSize: 12,
    fontWeight: '600',
  },
  historyListTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  historyItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
  },
  historyItemDate: {
    fontSize: 13,
    fontWeight: '600',
  },
  historyItemTimestamp: {
    fontSize: 11,
    marginTop: 2,
  },
  historyBadgeGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  historyStatusBadge: {
    fontSize: 10,
    fontWeight: '700',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.pill,
    overflow: 'hidden',
  },
  historyReopenBtn: {
    minHeight: 36,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
