'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { colors, radii, spacing, touchTargets, typography } from '@daynori/design-tokens';
import { Button, Card, EmptyState, Feedback } from '@daynori/ui-web';
import { useShell } from './ShellContext';

export const TodayView: React.FC = () => {
  const { themeMode, openModal } = useShell();
  const palette = colors[themeMode];

  // Simulation states for testing empty, loading, error, and retry states
  const [showEmptyState, setShowEmptyState] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [promptDismissed, setPromptDismissed] = useState(false);

  // Synthetic items
  const [tasks, setTasks] = useState([
    {
      id: 't1',
      title: 'Review morning routine and priorities',
      priority: 'High',
      completed: false,
      tag: 'Planning',
    },
    {
      id: 't2',
      title: 'Prepare project handoff documentation',
      priority: 'Medium',
      completed: false,
      tag: 'Work',
    },
    {
      id: 't3',
      title: 'Verify accessible contrast and keyboard focus',
      priority: 'High',
      completed: true,
      tag: 'Engineering',
    },
  ]);

  const [routines, setRoutines] = useState([
    { id: 'r1', title: 'Morning quiet reading (20 min)', completed: true, frequency: 'Daily' },
    { id: 'r2', title: 'Review unfiled inbox notes', completed: false, frequency: 'Daily' },
  ]);

  const toggleTask = (id: string) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t)));
  };

  const toggleRoutine = (id: string) => {
    setRoutines((prev) => prev.map((r) => (r.id === id ? { ...r, completed: !r.completed } : r)));
  };

  const handleSimulateLoading = () => {
    setIsLoading(true);
    setTimeout(() => setIsLoading(false), 800);
  };

  const handleSimulateError = () => {
    setErrorMessage('Failed to sync offline changes with local repository.');
  };

  const handleRetry = () => {
    setIsLoading(true);
    setErrorMessage(null);
    setTimeout(() => {
      setIsLoading(false);
    }, 600);
  };

  return (
    <div
      style={{
        maxWidth: '860px',
        margin: '0 auto',
        padding: `${spacing.lg}px ${spacing.base}px`,
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      {/* Header and Welcome */}
      <section
        aria-label="Today summary"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: `${spacing.xs}px`,
          marginBottom: `${spacing.lg}px`,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            flexWrap: 'wrap',
          }}
        >
          <div>
            <h1
              id="today-heading"
              style={{
                margin: 0,
                fontSize: `${typography.webScale.welcomeTitle}px`,
                fontWeight: 800,
                color: palette.text.primary,
                letterSpacing: '-0.5px',
              }}
            >
              Today
            </h1>
            <p
              style={{
                margin: 0,
                marginTop: '4px',
                fontSize: `${typography.webScale.body}px`,
                color: palette.text.secondary,
              }}
            >
              Wednesday, October 14 · Good afternoon
            </p>
          </div>

          <div
            style={{
              fontSize: '12px',
              color: palette.text.secondary,
              padding: `${spacing.xs}px ${spacing.sm}px`,
              borderRadius: `${radii.sm}px`,
              backgroundColor: palette.surfaceRaised,
              border: `1px solid ${palette.border.subtle}`,
              marginTop: '4px',
            }}
          >
            Local: Asia/Dhaka (UTC+6)
          </div>
        </div>

        {/* State Simulation Toolbar for testing */}
        <div
          role="region"
          aria-label="State simulation controls"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: `${spacing.xs}px`,
            padding: `${spacing.sm}px`,
            borderRadius: `${radii.sm}px`,
            backgroundColor: palette.surfaceRaised,
            border: `1px dashed ${palette.border.strong}`,
            marginTop: `${spacing.sm}px`,
            fontSize: '12px',
            alignItems: 'center',
          }}
        >
          <span style={{ fontWeight: 600, color: palette.text.secondary }}>Shell Test States:</span>
          <button
            type="button"
            id="toggle-empty-state-btn"
            onClick={() => setShowEmptyState(!showEmptyState)}
            style={{
              padding: '4px 10px',
              borderRadius: '4px',
              border: `1px solid ${palette.border.subtle}`,
              backgroundColor: palette.surface,
              color: palette.text.primary,
              cursor: 'pointer',
              minHeight: '32px',
              fontWeight: 500,
            }}
          >
            {showEmptyState ? 'Show Sample Content' : 'Simulate Empty State'}
          </button>
          <button
            type="button"
            id="simulate-loading-btn"
            onClick={handleSimulateLoading}
            style={{
              padding: '4px 10px',
              borderRadius: '4px',
              border: `1px solid ${palette.border.subtle}`,
              backgroundColor: palette.surface,
              color: palette.text.primary,
              cursor: 'pointer',
              minHeight: '32px',
              fontWeight: 500,
            }}
          >
            Simulate Loading
          </button>
          <button
            type="button"
            id="simulate-error-btn"
            onClick={handleSimulateError}
            style={{
              padding: '4px 10px',
              borderRadius: '4px',
              border: `1px solid ${palette.border.subtle}`,
              backgroundColor: palette.surface,
              color: palette.text.primary,
              cursor: 'pointer',
              minHeight: '32px',
              fontWeight: 500,
            }}
          >
            Simulate Error
          </button>
        </div>
      </section>

      {/* Error / Retry Banner */}
      {errorMessage && (
        <div style={{ marginBottom: `${spacing.base}px` }}>
          <Feedback
            severity="danger"
            title="Synchronization Error"
            message={errorMessage}
            themeMode={themeMode}
            onDismiss={() => setErrorMessage(null)}
          />
          <div style={{ marginTop: `${spacing.xs}px` }}>
            <Button
              id="retry-state-btn"
              variant="secondary"
              size="compact"
              themeMode={themeMode}
              onClick={handleRetry}
            >
              Retry Operation
            </Button>
          </div>
        </div>
      )}

      {/* Loading Indicator */}
      {isLoading ? (
        <div
          role="status"
          aria-live="polite"
          aria-busy="true"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: `${spacing.xxl}px`,
            backgroundColor: palette.surface,
            borderRadius: `${radii.card}px`,
            border: `1px solid ${palette.border.subtle}`,
            color: palette.text.secondary,
            gap: `${spacing.md}px`,
          }}
        >
          <div
            style={{
              width: '28px',
              height: '28px',
              border: `3px solid ${palette.border.subtle}`,
              borderTopColor: palette.action.primary,
              borderRadius: '50%',
              animation: 'daynori-spin 0.8s linear infinite',
            }}
          />
          <span>Refreshing Today content...</span>
        </div>
      ) : showEmptyState ? (
        /* Empty State */
        <EmptyState
          id="today-empty-state"
          title="All caught up for today"
          description="You have no pending tasks or routines scheduled for today. Enjoy your day or add a new task."
          actionLabel="Create Task"
          onAction={() => openModal('create')}
          themeMode={themeMode}
          icon="☀️"
        />
      ) : (
        /* Primary Cards Stack (3-5 cards) */
        <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.base}px` }}>
          {/* Card 1: Due Today Tasks */}
          <Card themeMode={themeMode}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: `${spacing.sm}px`,
              }}
            >
              <h2
                style={{
                  margin: 0,
                  fontSize: `${typography.webScale.sectionHeading}px`,
                  color: palette.text.primary,
                  fontWeight: 700,
                }}
              >
                Tasks Due Today
              </h2>
              <span
                style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  color: palette.text.secondary,
                }}
              >
                {tasks.filter((t) => t.completed).length} of {tasks.length} done
              </span>
            </div>

            <div role="list" aria-label="Tasks due today">
              {tasks.map((task) => (
                <div
                  key={task.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    minHeight: `${touchTargets.webMin}px`,
                    padding: `${spacing.xs}px 0`,
                    borderBottom: `1px solid ${palette.border.subtle}`,
                    gap: `${spacing.sm}px`,
                  }}
                >
                  <input
                    type="checkbox"
                    id={`check-${task.id}`}
                    checked={task.completed}
                    onChange={() => toggleTask(task.id)}
                    aria-label={`Mark "${task.title}" as ${task.completed ? 'incomplete' : 'complete'}`}
                    style={{
                      width: '20px',
                      height: '20px',
                      cursor: 'pointer',
                      accentColor: palette.action.primary,
                    }}
                  />
                  <label
                    htmlFor={`check-${task.id}`}
                    style={{
                      flex: 1,
                      cursor: 'pointer',
                      fontSize: `${typography.webScale.body}px`,
                      color: task.completed ? palette.text.secondary : palette.text.primary,
                      textDecoration: task.completed ? 'line-through' : 'none',
                    }}
                  >
                    {task.title}
                  </label>
                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: `${radii.pill}px`,
                      backgroundColor:
                        task.priority === 'High' ? palette.accent.subtle : palette.surfaceRaised,
                      color:
                        task.priority === 'High' ? palette.accent.label : palette.text.secondary,
                      border: `1px solid ${palette.border.subtle}`,
                    }}
                  >
                    {task.priority}
                  </span>
                </div>
              ))}
            </div>

            <div style={{ marginTop: `${spacing.md}px` }}>
              <Link
                href="/plan"
                style={{
                  color: palette.action.primary,
                  fontSize: '13px',
                  fontWeight: 600,
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  minHeight: '36px',
                }}
              >
                View all tasks in Plan →
              </Link>
            </div>
          </Card>

          {/* Card 2: Today's Routines */}
          <Card themeMode={themeMode}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: `${spacing.sm}px`,
              }}
            >
              <h2
                style={{
                  margin: 0,
                  fontSize: `${typography.webScale.sectionHeading}px`,
                  color: palette.text.primary,
                  fontWeight: 700,
                }}
              >
                Today&apos;s Routines
              </h2>
              <span
                style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  color: palette.text.secondary,
                }}
              >
                Independent Daily Habit Tracker
              </span>
            </div>

            <div role="list" aria-label="Today's routines">
              {routines.map((routine) => (
                <div
                  key={routine.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    minHeight: `${touchTargets.webMin}px`,
                    padding: `${spacing.xs}px 0`,
                    borderBottom: `1px solid ${palette.border.subtle}`,
                    gap: `${spacing.sm}px`,
                  }}
                >
                  <input
                    type="checkbox"
                    id={`routine-${routine.id}`}
                    checked={routine.completed}
                    onChange={() => toggleRoutine(routine.id)}
                    aria-label={`Mark routine "${routine.title}" for today`}
                    style={{
                      width: '20px',
                      height: '20px',
                      cursor: 'pointer',
                      accentColor: palette.action.primary,
                    }}
                  />
                  <label
                    htmlFor={`routine-${routine.id}`}
                    style={{
                      flex: 1,
                      cursor: 'pointer',
                      fontSize: `${typography.webScale.body}px`,
                      color: routine.completed ? palette.text.secondary : palette.text.primary,
                      textDecoration: routine.completed ? 'line-through' : 'none',
                    }}
                  >
                    {routine.title}
                  </label>
                  <span
                    style={{
                      fontSize: '11px',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      backgroundColor: palette.surfaceRaised,
                      color: palette.text.secondary,
                    }}
                  >
                    {routine.frequency}
                  </span>
                </div>
              ))}
            </div>
          </Card>

          {/* Card 3: Next 7 Days Summary linking to Plan */}
          <Card themeMode={themeMode}>
            <h2
              style={{
                margin: 0,
                marginBottom: `${spacing.xs}px`,
                fontSize: `${typography.webScale.sectionHeading}px`,
                color: palette.text.primary,
                fontWeight: 700,
              }}
            >
              Upcoming Schedule (Next 7 Days)
            </h2>
            <p
              style={{
                margin: 0,
                marginBottom: `${spacing.md}px`,
                fontSize: `${typography.webScale.body}px`,
                color: palette.text.secondary,
              }}
            >
              4 tasks and 2 scheduled calendar events coming up this week.
            </p>
            <div style={{ display: 'flex', gap: `${spacing.sm}px` }}>
              <Link
                href="/plan/calendar"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minHeight: `${touchTargets.webMin}px`,
                  padding: `0 ${spacing.base}px`,
                  borderRadius: `${radii.sm}px`,
                  backgroundColor: palette.action.primary,
                  color: palette.action.label,
                  fontWeight: 600,
                  fontSize: '14px',
                  textDecoration: 'none',
                }}
              >
                Open Calendar →
              </Link>
            </div>
          </Card>

          {/* Card 4: Optional Journal Prompt */}
          {!promptDismissed && (
            <Card
              themeMode={themeMode}
              style={{
                borderLeft: `4px solid ${palette.accent.warm}`,
                backgroundColor: palette.surfaceRaised,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: '11px',
                      textTransform: 'uppercase',
                      fontWeight: 700,
                      color: palette.accent.warm,
                      letterSpacing: '0.05em',
                      marginBottom: '4px',
                    }}
                  >
                    Reflection Prompt
                  </div>
                  <h3
                    style={{
                      margin: 0,
                      fontSize: `${typography.webScale.sectionHeading}px`,
                      color: palette.text.primary,
                      fontWeight: 600,
                    }}
                  >
                    What made you smile or feel grateful today?
                  </h3>
                  <p
                    style={{
                      margin: '6px 0 12px 0',
                      fontSize: `${typography.webScale.supporting}px`,
                      color: palette.text.secondary,
                    }}
                  >
                    Writing a few lines can help anchor your day. Entry previews remain private.
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Dismiss reflection prompt"
                  onClick={() => setPromptDismissed(true)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '16px',
                    color: palette.text.secondary,
                    minHeight: `${touchTargets.webMin}px`,
                    minWidth: `${touchTargets.webMin}px`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  ✕
                </button>
              </div>

              <div style={{ display: 'flex', gap: `${spacing.sm}px` }}>
                <Link
                  href="/journal"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: `${touchTargets.webMin}px`,
                    padding: `0 ${spacing.base}px`,
                    borderRadius: `${radii.sm}px`,
                    backgroundColor: palette.surface,
                    border: `1px solid ${palette.border.strong}`,
                    color: palette.text.primary,
                    fontWeight: 600,
                    fontSize: '14px',
                    textDecoration: 'none',
                  }}
                >
                  Write in Journal
                </Link>
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
};
