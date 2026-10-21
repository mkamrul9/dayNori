import { Icon } from './Icon.js';
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
  type RoutineOccurrenceStatus,
  type RoutineOccurrenceTransition,
  calculateGentleProgress,
} from '@daynori/domain';

export interface HistoryOccurrenceItem {
  id: string;
  routineId: string;
  scheduledDate: string;
  scheduleRevision: number;
  plannedInstant: string | null;
  timezone: string;
  status: RoutineOccurrenceStatus;
  completedAt: string | null;
  completedBy: string | null;
  history: RoutineOccurrenceTransition[];
}

export interface RoutineHistoryViewerProps {
  isOpen: boolean;
  onClose: () => void;
  routineTitle: string;
  occurrences: HistoryOccurrenceItem[];
  themeMode?: ThemeMode;
  onReopenOccurrence?: (occurrenceId: string) => void;
  onCompleteOccurrence?: (occurrenceId: string) => void;
}

export const RoutineHistoryViewer: React.FC<RoutineHistoryViewerProps> = ({
  isOpen,
  onClose,
  routineTitle,
  occurrences,
  themeMode = 'light',
  onReopenOccurrence,
  onCompleteOccurrence,
}) => {
  const palette = colors[themeMode];

  if (!isOpen) return null;

  // Filter non-cancelled occurrences and sort descending by date (most recent first)
  const activeOccurrences = occurrences
    .filter((o) => o.status !== 'cancelled')
    .sort((a, b) => b.scheduledDate.localeCompare(a.scheduledDate));

  const progress = calculateGentleProgress(activeOccurrences);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="routine-history-title"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: `${spacing.md}px`,
        boxSizing: 'border-box',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '600px',
          maxHeight: '90vh',
          backgroundColor: palette.surface,
          borderRadius: `${radii.card}px`,
          border: `1px solid ${palette.border.subtle}`,
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.2)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: `${spacing.base}px`,
            borderBottom: `1px solid ${palette.border.subtle}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <h2
              id="routine-history-title"
              style={{
                margin: 0,
                fontSize: `${typography.webScale.sectionHeading}px`,
                fontWeight: 700,
                color: palette.text.primary,
              }}
            >
              Completion History
            </h2>
            <p
              style={{
                margin: 0,
                marginTop: '2px',
                fontSize: '13px',
                color: palette.text.secondary,
              }}
            >
              {routineTitle}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close dialog"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '20px',
              color: palette.text.secondary,
              cursor: 'pointer',
              padding: `${spacing.xs}px`,
            }}
          >
            <Icon name="x" />
          </button>
        </div>

        {/* Gentle Progress Banner */}
        <div
          style={{
            padding: `${spacing.sm}px ${spacing.base}px`,
            backgroundColor: palette.surfaceRaised,
            borderBottom: `1px solid ${palette.border.subtle}`,
            display: 'flex',
            flexDirection: 'column',
            gap: `${spacing.xs}px`,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: palette.text.primary }}>
              {progress.message}
            </span>
            <span style={{ fontSize: '12px', fontWeight: 700, color: palette.action.primary }}>
              {progress.completionRate}% completed
            </span>
          </div>

          {/* Gentle Progress Bar */}
          <div
            style={{
              width: '100%',
              height: '6px',
              backgroundColor: palette.border.subtle,
              borderRadius: `${radii.pill}px`,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${progress.completionRate}%`,
                height: '100%',
                backgroundColor: palette.action.primary,
                borderRadius: `${radii.pill}px`,
                transition: 'width 300ms ease',
              }}
            />
          </div>

          <span style={{ fontSize: '11px', color: palette.text.secondary }}>
            Gentle tracking · No broken streaks or penalties
          </span>
        </div>

        {/* History List */}
        <div
          role="list"
          aria-label="Past occurrences"
          style={{
            padding: `${spacing.base}px`,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: `${spacing.xs}px`,
          }}
        >
          {activeOccurrences.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: `${spacing.xl}px`,
                color: palette.text.secondary,
                fontSize: '14px',
              }}
            >
              No occurrences recorded yet for this routine.
            </div>
          ) : (
            activeOccurrences.map((occ) => {
              const isDone = occ.status === 'done';
              const isSkipped = occ.status === 'skipped';

              return (
                <div
                  key={occ.id}
                  role="listitem"
                  data-history-occurrence-id={occ.id}
                  data-history-status={occ.status}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: `${spacing.sm}px ${spacing.md}px`,
                    borderRadius: `${radii.sm}px`,
                    backgroundColor: isDone
                      ? themeMode === 'dark'
                        ? '#064e3b20'
                        : '#ecfdf5'
                      : isSkipped
                        ? themeMode === 'dark'
                          ? '#451a0320'
                          : '#fffbeb'
                        : palette.surfaceRaised,
                    border: `1px solid ${
                      isDone
                        ? themeMode === 'dark'
                          ? '#05966940'
                          : '#a7f3d0'
                        : isSkipped
                          ? themeMode === 'dark'
                            ? '#d9770640'
                            : '#fde68a'
                          : palette.border.subtle
                    }`,
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: `${spacing.xs}px` }}>
                      <span
                        style={{
                          fontSize: '13px',
                          fontWeight: 600,
                          color: palette.text.primary,
                        }}
                      >
                        {occ.scheduledDate}
                      </span>

                      {/* Status indicator badge */}
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          padding: '1px 6px',
                          borderRadius: `${radii.pill}px`,
                          backgroundColor: isDone
                            ? themeMode === 'dark'
                              ? '#064e3b'
                              : '#d1fae5'
                            : isSkipped
                              ? themeMode === 'dark'
                                ? '#451a03'
                                : '#fef3c7'
                              : themeMode === 'dark'
                                ? '#334155'
                                : '#f1f5f9',
                          color: isDone
                            ? themeMode === 'dark'
                              ? '#6ee7b7'
                              : '#065f46'
                            : isSkipped
                              ? themeMode === 'dark'
                                ? '#fcd34d'
                                : '#92400e'
                              : palette.text.secondary,
                        }}
                      >
                        {isDone ? 'Completed' : isSkipped ? 'Skipped' : 'Pending'}
                      </span>
                    </div>

                    {/* Completion timestamp */}
                    {isDone && occ.completedAt && (
                      <span
                        style={{
                          fontSize: '11px',
                          color: palette.text.secondary,
                          marginTop: '2px',
                          display: 'block',
                        }}
                      >
                        Completed at{' '}
                        {new Date(occ.completedAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    )}

                    {/* Transition history count */}
                    {occ.history && occ.history.length > 1 && (
                      <span style={{ fontSize: '10px', color: palette.text.secondary }}>
                        {occ.history.length} status transitions recorded
                      </span>
                    )}
                  </div>

                  {/* Actions for past occurrences */}
                  <div style={{ display: 'flex', gap: `${spacing.xs}px` }}>
                    {isDone && onReopenOccurrence && (
                      <button
                        type="button"
                        onClick={() => onReopenOccurrence(occ.id)}
                        style={{
                          fontSize: '11px',
                          padding: '4px 8px',
                          borderRadius: `${radii.sm}px`,
                          border: `1px solid ${palette.border.subtle}`,
                          backgroundColor: palette.surface,
                          color: palette.text.secondary,
                          cursor: 'pointer',
                        }}
                      >
                        Reopen
                      </button>
                    )}

                    {!isDone && onCompleteOccurrence && (
                      <button
                        type="button"
                        onClick={() => onCompleteOccurrence(occ.id)}
                        style={{
                          fontSize: '11px',
                          padding: '4px 8px',
                          borderRadius: `${radii.sm}px`,
                          border: `1px solid ${palette.action.primary}`,
                          backgroundColor: palette.action.primary,
                          color: '#ffffff',
                          cursor: 'pointer',
                          fontWeight: 600,
                        }}
                      >
                        Mark Done
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: `${spacing.sm}px ${spacing.base}px`,
            borderTop: `1px solid ${palette.border.subtle}`,
            display: 'flex',
            justifyContent: 'flex-end',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '6px 16px',
              borderRadius: `${radii.sm}px`,
              border: `1px solid ${palette.border.strong}`,
              backgroundColor: palette.surface,
              color: palette.text.primary,
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '13px',
              minHeight: `${touchTargets.webMin}px`,
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
