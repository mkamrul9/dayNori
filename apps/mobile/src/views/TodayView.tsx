import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing, type ThemeMode } from '@daynori/design-tokens';
import {
  MobileButton,
  MobileCard,
  MobileEmptyState,
  MobileFeedback,
  MobileListRow,
} from '@daynori/ui-mobile';

export interface TodayViewProps {
  themeMode: ThemeMode;
  onNavigateToPlan: () => void;
  onNavigateToJournal: () => void;
  onOpenCreate: () => void;
  testID?: string;
}

export const TodayView: React.FC<TodayViewProps> = ({
  themeMode,
  onNavigateToPlan,
  onNavigateToJournal,
  onOpenCreate,
  testID = 'today-view',
}) => {
  const palette = colors[themeMode];

  // Interactive state toggles for testing empty, loading, and error states
  const [demoState, setDemoState] = useState<'normal' | 'empty' | 'loading' | 'error'>('normal');
  const [tasks, setTasks] = useState([
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
  ]);
  const [routines, setRoutines] = useState([
    {
      id: 'r1',
      title: 'Morning deep work session',
      frequency: 'Repeats weekdays',
      completed: true,
    },
    {
      id: 'r2',
      title: 'Evening reflection & summary',
      frequency: 'Repeats daily',
      completed: false,
    },
  ]);

  const toggleTask = (id: string) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t)));
  };

  const toggleRoutine = (id: string) => {
    setRoutines((prev) => prev.map((r) => (r.id === id ? { ...r, completed: !r.completed } : r)));
  };

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
            Loading today's agenda...
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
          {/* Section 1: Upcoming Tasks */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: palette.text.primary }]}>
              Due Today ({tasks.filter((t) => !t.completed).length})
            </Text>
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

          {/* Section 2: Today's Routines */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: palette.text.primary }]}>
              Routines ({routines.filter((r) => r.completed).length}/{routines.length} completed)
            </Text>
            <MobileCard themeMode={themeMode}>
              {routines.map((routine) => (
                <MobileListRow
                  key={routine.id}
                  title={routine.title}
                  metadata={routine.frequency}
                  selected={routine.completed}
                  themeMode={themeMode}
                  onPress={() => toggleRoutine(routine.id)}
                  accessibilityLabel={`${routine.title}, ${routine.frequency}, ${routine.completed ? 'completed' : 'not completed'}`}
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
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: spacing.sm,
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
});
