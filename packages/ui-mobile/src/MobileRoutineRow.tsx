import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing, touchTargets, type ThemeMode } from '@daynori/design-tokens';
import {
  type RoutineFrequency,
  type Weekday,
  type RoutineOccurrenceStatus,
  explainWhyDueToday,
} from '@daynori/domain';

export interface MobileRoutineItem {
  id: string;
  title: string;
  details?: string | null;
  frequency: RoutineFrequency;
  weekdays: Weekday[];
  timezone: string;
  scheduledTime?: string | null;
  isPaused?: boolean;
  isArchived?: boolean;
}

export interface MobileRoutineOccurrence {
  id: string;
  routineId: string;
  scheduledDate: string;
  status: RoutineOccurrenceStatus;
  completedAt?: string | null;
}

export interface MobileRoutineRowProps {
  routine: MobileRoutineItem;
  occurrence?: MobileRoutineOccurrence | null;
  viewingDate: string;
  themeMode?: ThemeMode;
  onComplete?: (occurrenceId: string) => void;
  onSkip?: (occurrenceId: string) => void;
  onReopen?: (occurrenceId: string) => void;
  onEdit?: (routineId: string) => void;
  onViewHistory?: (routineId: string) => void;
  onTogglePause?: (routineId: string) => void;
  testID?: string;
}

export const MobileRoutineRow: React.FC<MobileRoutineRowProps> = ({
  routine,
  occurrence,
  viewingDate,
  themeMode = 'light',
  onComplete,
  onSkip,
  onReopen,
  onEdit,
  onViewHistory,
  onTogglePause,
  testID = `routine-row-${routine.id}`,
}) => {
  const palette = colors[themeMode];
  const status: RoutineOccurrenceStatus = occurrence?.status || 'pending';
  const isDone = status === 'done';
  const isSkipped = status === 'skipped';
  const isPaused = Boolean(routine.isPaused);

  const dueExplanation = explainWhyDueToday(
    {
      frequency: routine.frequency,
      weekdays: routine.weekdays,
      scheduledTime: routine.scheduledTime || null,
      timezone: routine.timezone,
      activeFrom: '2000-01-01',
      activeTo: null,
      isPaused,
      isArchived: Boolean(routine.isArchived),
    },
    viewingDate
  );

  return (
    <View
      testID={testID}
      style={[
        styles.container,
        {
          backgroundColor: isDone
            ? themeMode === 'dark'
              ? '#0f172a'
              : '#f8fafc'
            : isSkipped
              ? themeMode === 'dark'
                ? '#1c1917'
                : '#fffdfa'
              : palette.surface,
          borderColor: palette.border.subtle,
          opacity: isPaused ? 0.75 : 1,
        },
      ]}
    >
      {/* Checkbox button */}
      {occurrence && !isPaused && (
        <Pressable
          accessible={true}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: isDone }}
          accessibilityLabel={
            isDone
              ? `Mark "${routine.title}" as pending`
              : `Mark "${routine.title}" as done for ${viewingDate}`
          }
          onPress={() => {
            if (isDone) {
              onReopen?.(occurrence.id);
            } else {
              onComplete?.(occurrence.id);
            }
          }}
          style={({ pressed }) => [
            styles.checkbox,
            {
              borderColor: isDone ? palette.action.primary : palette.border.strong,
              backgroundColor: isDone ? palette.action.primary : 'transparent',
              opacity: pressed ? 0.7 : 1,
            },
          ]}
        >
          {isDone && <Text style={styles.checkmarkText}>✓</Text>}
        </Pressable>
      )}

      {/* Routine Info */}
      <View style={styles.content}>
        <View style={styles.titleRow}>
          <Text
            style={[
              styles.title,
              {
                color: isDone ? palette.text.secondary : palette.text.primary,
                textDecorationLine: isDone ? 'line-through' : 'none',
              },
            ]}
          >
            {routine.title}
          </Text>

          {/* Status Badge */}
          <View
            style={[
              styles.badge,
              {
                backgroundColor: isPaused
                  ? palette.surfaceRaised
                  : isDone
                    ? themeMode === 'dark'
                      ? '#064e3b'
                      : '#ecfdf5'
                    : isSkipped
                      ? themeMode === 'dark'
                        ? '#451a03'
                        : '#fffbeb'
                      : palette.surfaceRaised,
                borderColor: palette.border.subtle,
              },
            ]}
          >
            <Text
              style={[
                styles.badgeText,
                {
                  color: isPaused
                    ? palette.text.secondary
                    : isDone
                      ? themeMode === 'dark'
                        ? '#6ee7b7'
                        : '#047857'
                      : isSkipped
                        ? themeMode === 'dark'
                          ? '#fcd34d'
                          : '#b45309'
                        : palette.text.secondary,
                },
              ]}
            >
              {isPaused ? 'Paused' : isDone ? 'Done' : isSkipped ? 'Skipped' : 'Pending'}
            </Text>
          </View>
        </View>

        {/* Cadence note & due reason */}
        <Text style={[styles.cadenceText, { color: palette.text.secondary }]}>
          {dueExplanation.cadenceDescription} · {dueExplanation.reason}
        </Text>

        {/* Action Pills */}
        <View style={styles.actionsRow}>
          {occurrence && !isPaused && !isSkipped && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Skip routine "${routine.title}"`}
              onPress={() => onSkip?.(occurrence.id)}
              style={[styles.actionPill, { borderColor: palette.border.subtle }]}
            >
              <Text style={[styles.actionText, { color: palette.text.secondary }]}>Skip</Text>
            </Pressable>
          )}

          {occurrence && isSkipped && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Undo skip for "${routine.title}"`}
              onPress={() => onReopen?.(occurrence.id)}
              style={[styles.actionPill, { borderColor: palette.action.primary }]}
            >
              <Text style={[styles.actionText, { color: palette.action.primary }]}>Undo Skip</Text>
            </Pressable>
          )}

          {onViewHistory && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`View history for "${routine.title}"`}
              onPress={() => onViewHistory(routine.id)}
              style={[styles.actionPill, { borderColor: palette.border.subtle }]}
            >
              <Text style={[styles.actionText, { color: palette.text.secondary }]}>History</Text>
            </Pressable>
          )}

          {onEdit && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Edit routine "${routine.title}"`}
              onPress={() => onEdit(routine.id)}
              style={[styles.actionPill, { borderColor: palette.border.subtle }]}
            >
              <Text style={[styles.actionText, { color: palette.text.secondary }]}>Edit</Text>
            </Pressable>
          )}

          {onTogglePause && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                isPaused ? `Resume routine "${routine.title}"` : `Pause routine "${routine.title}"`
              }
              onPress={() => onTogglePause(routine.id)}
              style={[styles.actionPill, { borderColor: palette.border.subtle }]}
            >
              <Text
                style={[
                  styles.actionText,
                  { color: isPaused ? palette.action.primary : palette.text.secondary },
                ]}
              >
                {isPaused ? 'Resume' : 'Pause'}
              </Text>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    minHeight: touchTargets.mobileMin,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.sm,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginVertical: spacing.xs,
    gap: spacing.sm,
  },
  checkbox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  checkmarkText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
    lineHeight: 18,
  },
  content: {
    flex: 1,
    gap: 4,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 4,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radii.pill,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  cadenceText: {
    fontSize: 12,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
    flexWrap: 'wrap',
  },
  actionPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.sm,
    borderWidth: 1,
    minHeight: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
