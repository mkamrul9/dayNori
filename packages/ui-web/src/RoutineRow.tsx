import React from 'react';
import {
  colors,
  radii,
  spacing,
  touchTargets,
  typography,
  type ThemeMode,
} from '@daynori/design-tokens';
import {
  type RoutineFrequency,
  type Weekday,
  type RoutineOccurrenceStatus,
  explainWhyDueToday,
} from '@daynori/domain';

export interface RoutineRowItem {
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

export interface RoutineRowOccurrence {
  id: string;
  routineId: string;
  scheduledDate: string;
  status: RoutineOccurrenceStatus;
  completedAt?: string | null;
}

export interface RoutineRowProps {
  routine: RoutineRowItem;
  occurrence?: RoutineRowOccurrence | null;
  viewingDate: string;
  themeMode?: ThemeMode;
  onComplete?: (occurrenceId: string) => void;
  onSkip?: (occurrenceId: string) => void;
  onReopen?: (occurrenceId: string) => void;
  onEdit?: (routineId: string) => void;
  onViewHistory?: (routineId: string) => void;
  onTogglePause?: (routineId: string) => void;
  readOnly?: boolean;
}

export const RoutineRow: React.FC<RoutineRowProps> = ({
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
  readOnly = false,
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
      isPaused: isPaused,
      isArchived: Boolean(routine.isArchived),
    },
    viewingDate
  );

  const getStatusBadge = () => {
    if (isPaused) {
      return {
        bg: themeMode === 'dark' ? '#334155' : '#f1f5f9',
        color: themeMode === 'dark' ? '#94a3b8' : '#64748b',
        border: themeMode === 'dark' ? '#475569' : '#cbd5e1',
        label: 'Paused',
      };
    }
    if (isDone) {
      return {
        bg: themeMode === 'dark' ? '#064e3b' : '#ecfdf5',
        color: themeMode === 'dark' ? '#6ee7b7' : '#047857',
        border: themeMode === 'dark' ? '#059669' : '#a7f3d0',
        label: 'Done',
      };
    }
    if (isSkipped) {
      return {
        bg: themeMode === 'dark' ? '#451a03' : '#fffbeb',
        color: themeMode === 'dark' ? '#fcd34d' : '#b45309',
        border: themeMode === 'dark' ? '#d97706' : '#fde68a',
        label: 'Skipped',
      };
    }
    return {
      bg: themeMode === 'dark' ? '#1e293b' : '#f8fafc',
      color: themeMode === 'dark' ? '#cbd5e1' : '#475569',
      border: themeMode === 'dark' ? '#334155' : '#e2e8f0',
      label: 'Pending',
    };
  };

  const badge = getStatusBadge();

  return (
    <div
      role="listitem"
      data-routine-id={routine.id}
      data-occurrence-id={occurrence?.id}
      data-status={status}
      style={{
        display: 'flex',
        alignItems: 'center',
        minHeight: `${touchTargets.webMin}px`,
        padding: `${spacing.sm}px ${spacing.md}px`,
        borderBottom: `1px solid ${palette.border.subtle}`,
        backgroundColor: isDone
          ? themeMode === 'dark'
            ? '#0f172a80'
            : '#f8fafc'
          : isSkipped
            ? themeMode === 'dark'
              ? '#1c191780'
              : '#fffdfa'
            : palette.surface,
        gap: `${spacing.sm}px`,
        opacity: isPaused ? 0.75 : 1,
        transition: 'background-color 150ms ease, opacity 150ms ease',
      }}
    >
      {/* Complete checkbox / button */}
      {!readOnly && occurrence && !isPaused && (
        <button
          type="button"
          role="checkbox"
          aria-checked={isDone}
          aria-label={
            isDone
              ? `Mark routine "${routine.title}" as pending`
              : `Mark routine "${routine.title}" as done for ${viewingDate}`
          }
          onClick={() => {
            if (isDone) {
              onReopen?.(occurrence.id);
            } else {
              onComplete?.(occurrence.id);
            }
          }}
          style={{
            width: '24px',
            height: '24px',
            minWidth: '24px',
            minHeight: '24px',
            borderRadius: '6px',
            border: `2px solid ${isDone ? palette.action.primary : palette.border.strong}`,
            backgroundColor: isDone ? palette.action.primary : 'transparent',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            padding: 0,
            color: '#ffffff',
            outline: 'none',
          }}
        >
          {isDone && (
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
        </button>
      )}

      {/* Routine title and explanation */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: `${spacing.xs}px`,
            flexWrap: 'wrap',
          }}
        >
          <span
            style={{
              fontSize: `${typography.webScale.body}px`,
              fontWeight: 600,
              color: isDone ? palette.text.secondary : palette.text.primary,
              textDecoration: isDone ? 'line-through' : 'none',
              wordBreak: 'break-word',
            }}
          >
            {routine.title}
          </span>

          {/* Status Badge */}
          <span
            style={{
              fontSize: '11px',
              fontWeight: 700,
              padding: '2px 8px',
              borderRadius: `${radii.pill}px`,
              backgroundColor: badge.bg,
              color: badge.color,
              border: `1px solid ${badge.border}`,
            }}
          >
            {badge.label}
          </span>

          {/* Cadence badge */}
          <span
            style={{
              fontSize: '11px',
              color: palette.text.secondary,
              backgroundColor: palette.surfaceRaised,
              padding: '2px 6px',
              borderRadius: `${radii.sm}px`,
              border: `1px solid ${palette.border.subtle}`,
            }}
          >
            {dueExplanation.cadenceDescription}
          </span>
        </div>

        {/* Details or Why due today note */}
        <div
          style={{
            marginTop: '2px',
            fontSize: '12px',
            color: palette.text.secondary,
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
          }}
        >
          {routine.details && <span>{routine.details}</span>}
          <span style={{ fontSize: '11px', fontStyle: 'italic' }}>{dueExplanation.reason}</span>
        </div>
      </div>

      {/* Action Buttons */}
      {!readOnly && (
        <div style={{ display: 'flex', alignItems: 'center', gap: `${spacing.xs}px` }}>
          {/* Skip button (only for pending or done occurrences) */}
          {occurrence && !isPaused && !isSkipped && (
            <button
              type="button"
              aria-label={`Skip routine "${routine.title}" for ${viewingDate}`}
              onClick={() => onSkip?.(occurrence.id)}
              style={{
                fontSize: '12px',
                padding: '4px 8px',
                minHeight: '32px',
                borderRadius: `${radii.sm}px`,
                border: `1px solid ${palette.border.subtle}`,
                backgroundColor: palette.surface,
                color: palette.text.secondary,
                cursor: 'pointer',
              }}
            >
              Skip
            </button>
          )}

          {/* Reopen button (if skipped) */}
          {occurrence && isSkipped && (
            <button
              type="button"
              aria-label={`Reopen routine "${routine.title}" for ${viewingDate}`}
              onClick={() => onReopen?.(occurrence.id)}
              style={{
                fontSize: '12px',
                padding: '4px 8px',
                minHeight: '32px',
                borderRadius: `${radii.sm}px`,
                border: `1px solid ${palette.border.subtle}`,
                backgroundColor: palette.surface,
                color: palette.action.primary,
                cursor: 'pointer',
              }}
            >
              Undo Skip
            </button>
          )}

          {/* History viewer button */}
          {onViewHistory && (
            <button
              type="button"
              aria-label={`View history for "${routine.title}"`}
              onClick={() => onViewHistory(routine.id)}
              style={{
                fontSize: '12px',
                padding: '4px 8px',
                minHeight: '32px',
                borderRadius: `${radii.sm}px`,
                border: `1px solid ${palette.border.subtle}`,
                backgroundColor: palette.surface,
                color: palette.text.secondary,
                cursor: 'pointer',
              }}
            >
              History
            </button>
          )}

          {/* Edit button */}
          {onEdit && (
            <button
              type="button"
              aria-label={`Edit routine "${routine.title}"`}
              onClick={() => onEdit(routine.id)}
              style={{
                fontSize: '12px',
                padding: '4px 8px',
                minHeight: '32px',
                borderRadius: `${radii.sm}px`,
                border: `1px solid ${palette.border.subtle}`,
                backgroundColor: palette.surface,
                color: palette.text.secondary,
                cursor: 'pointer',
              }}
            >
              Edit
            </button>
          )}

          {/* Pause / Resume button */}
          {onTogglePause && (
            <button
              type="button"
              aria-label={
                isPaused ? `Resume routine "${routine.title}"` : `Pause routine "${routine.title}"`
              }
              onClick={() => onTogglePause(routine.id)}
              style={{
                fontSize: '12px',
                padding: '4px 8px',
                minHeight: '32px',
                borderRadius: `${radii.sm}px`,
                border: `1px solid ${palette.border.subtle}`,
                backgroundColor: palette.surface,
                color: isPaused ? palette.action.primary : palette.text.secondary,
                cursor: 'pointer',
              }}
            >
              {isPaused ? 'Resume' : 'Pause'}
            </button>
          )}
        </div>
      )}
    </div>
  );
};
