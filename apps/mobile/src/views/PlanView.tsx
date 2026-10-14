import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing, touchTargets, type ThemeMode } from '@daynori/design-tokens';
import { MobileCard, MobileListRow } from '@daynori/ui-mobile';
import type { PlanSubView } from '../navigation/types';

export interface PlanViewProps {
  themeMode: ThemeMode;
  initialSubView?: PlanSubView;
  onSubViewChange?: (subView: PlanSubView) => void;
  testID?: string;
}

export const PlanView: React.FC<PlanViewProps> = ({
  themeMode,
  initialSubView = 'tasks',
  onSubViewChange,
  testID = 'plan-view',
}) => {
  const palette = colors[themeMode];
  const [activeSubView, setActiveSubView] = useState<PlanSubView>(initialSubView);
  const [taskFilter, setTaskFilter] = useState<'all' | 'today' | 'upcoming'>('all');

  const setSubView = (subView: PlanSubView) => {
    setActiveSubView(subView);
    if (onSubViewChange) onSubViewChange(subView);
  };

  // Synthetic items
  const tasks = [
    {
      id: 't1',
      title: 'Review quarterly architecture plan',
      due: 'Today, 4:00 PM',
      priority: 'High',
      category: 'today',
    },
    {
      id: 't2',
      title: 'Update Android platform documentation',
      due: 'Tomorrow, 11:00 AM',
      priority: 'Normal',
      category: 'upcoming',
    },
    {
      id: 't3',
      title: 'Prepare design system token audit',
      due: 'Friday, 2:00 PM',
      priority: 'High',
      category: 'upcoming',
    },
  ];

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

  const filteredTasks =
    taskFilter === 'all' ? tasks : tasks.filter((t) => t.category === taskFilter);

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
          {/* Filter Pills */}
          <View style={styles.filterBar}>
            {(['all', 'today', 'upcoming'] as const).map((filter) => (
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
            ))}
          </View>

          <MobileCard themeMode={themeMode}>
            {filteredTasks.map((task) => (
              <MobileListRow
                key={task.id}
                title={task.title}
                metadata={`${task.due} • [${task.priority}]`}
                themeMode={themeMode}
                onPress={() => {}}
                accessibilityLabel={`${task.title}, due ${task.due}, priority ${task.priority}`}
              />
            ))}
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
  filterBar: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginBottom: spacing.sm,
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
  calendarNote: {
    marginTop: spacing.md,
    padding: spacing.sm,
  },
  calendarNoteText: {
    fontSize: 12,
    lineHeight: 17,
  },
});
