'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { colors, radii, spacing, touchTargets, typography } from '@daynori/design-tokens';
import { Button, Card, EmptyState, Feedback, ListRow } from '@daynori/ui-web';
import { useShell } from '../../components/ShellContext';

export default function PlanPage() {
  const { themeMode, openModal } = useShell();
  const palette = colors[themeMode];

  const [activeTab, setActiveTab] = useState<'tasks' | 'routines'>('tasks');
  const [priorityFilter, setPriorityFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  const [showEmpty, setShowEmpty] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [tasks, setTasks] = useState([
    {
      id: 't1',
      title: 'Review morning routine and priorities',
      priority: 'high',
      group: 'Today',
      completed: false,
    },
    {
      id: 't2',
      title: 'Prepare project handoff documentation',
      priority: 'medium',
      group: 'Today',
      completed: false,
    },
    {
      id: 't3',
      title: 'Read TypeScript architecture handbook',
      priority: 'low',
      group: 'Upcoming',
      completed: false,
    },
    {
      id: 't4',
      title: 'Government application verification',
      priority: 'high',
      group: 'Upcoming',
      completed: false,
    },
    {
      id: 't5',
      title: 'Initial workspace repository setup',
      priority: 'medium',
      group: 'Completed',
      completed: true,
    },
  ]);

  const routines = [
    {
      id: 'r1',
      title: 'Morning quiet reading',
      schedule: 'Daily at 08:00 AM',
      repeat: 'Every day',
    },
    {
      id: 'r2',
      title: 'Inbox zero triage and filing',
      schedule: 'Weekdays at 05:00 PM',
      repeat: 'Mon, Tue, Wed, Thu, Fri',
    },
    {
      id: 'r3',
      title: 'Weekly workspace backup review',
      schedule: 'Sundays at 10:00 AM',
      repeat: 'Weekly',
    },
  ];

  const filteredTasks = tasks.filter((task) => {
    if (priorityFilter !== 'all' && task.priority !== priorityFilter) return false;
    return true;
  });

  const toggleTask = (id: string) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t)));
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
      {/* Title & Navigation Tabs */}
      <div style={{ marginBottom: `${spacing.lg}px` }}>
        <h1
          style={{
            margin: 0,
            fontSize: `${typography.webScale.welcomeTitle}px`,
            fontWeight: 800,
            color: palette.text.primary,
          }}
        >
          Plan
        </h1>
        <p style={{ margin: '4px 0 16px 0', color: palette.text.secondary }}>
          Organize upcoming tasks, recurring routines, and view calendar projections.
        </p>

        {/* Tab Selection + Calendar Link */}
        <div
          role="tablist"
          aria-label="Plan sections"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: `${spacing.sm}px`,
            borderBottom: `1px solid ${palette.border.subtle}`,
            paddingBottom: `${spacing.xs}px`,
            flexWrap: 'wrap',
          }}
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'tasks'}
            id="tab-tasks"
            onClick={() => setActiveTab('tasks')}
            style={{
              padding: `${spacing.xs}px ${spacing.base}px`,
              minHeight: `${touchTargets.webMin}px`,
              border: 'none',
              borderRadius: `${radii.sm}px`,
              backgroundColor: activeTab === 'tasks' ? palette.action.primary : 'transparent',
              color: activeTab === 'tasks' ? palette.action.label : palette.text.primary,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Tasks ({tasks.filter((t) => !t.completed).length})
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'routines'}
            id="tab-routines"
            onClick={() => setActiveTab('routines')}
            style={{
              padding: `${spacing.xs}px ${spacing.base}px`,
              minHeight: `${touchTargets.webMin}px`,
              border: 'none',
              borderRadius: `${radii.sm}px`,
              backgroundColor: activeTab === 'routines' ? palette.action.primary : 'transparent',
              color: activeTab === 'routines' ? palette.action.label : palette.text.primary,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Routines ({routines.length})
          </button>

          <Link
            href="/plan/calendar"
            id="link-plan-calendar"
            style={{
              padding: `${spacing.xs}px ${spacing.base}px`,
              minHeight: `${touchTargets.webMin}px`,
              display: 'inline-flex',
              alignItems: 'center',
              borderRadius: `${radii.sm}px`,
              backgroundColor: palette.surfaceRaised,
              color: palette.text.primary,
              fontWeight: 600,
              textDecoration: 'none',
              border: `1px solid ${palette.border.subtle}`,
            }}
          >
            📅 Calendar Projection →
          </Link>
        </div>
      </div>

      {/* State simulation test triggers */}
      <div
        style={{
          display: 'flex',
          gap: `${spacing.xs}px`,
          marginBottom: `${spacing.base}px`,
          flexWrap: 'wrap',
        }}
      >
        <button
          type="button"
          onClick={() => setShowEmpty(!showEmpty)}
          style={{
            padding: '4px 10px',
            borderRadius: '4px',
            border: `1px solid ${palette.border.subtle}`,
            backgroundColor: palette.surface,
            color: palette.text.primary,
            cursor: 'pointer',
            minHeight: '32px',
          }}
        >
          {showEmpty ? 'Show Tasks' : 'Simulate Empty Plan'}
        </button>
        <button
          type="button"
          onClick={() => {
            setIsLoading(true);
            setTimeout(() => setIsLoading(false), 600);
          }}
          style={{
            padding: '4px 10px',
            borderRadius: '4px',
            border: `1px solid ${palette.border.subtle}`,
            backgroundColor: palette.surface,
            color: palette.text.primary,
            cursor: 'pointer',
            minHeight: '32px',
          }}
        >
          Simulate Loading
        </button>
        <button
          type="button"
          onClick={() => setErrorMessage('Network timeout loading plan records.')}
          style={{
            padding: '4px 10px',
            borderRadius: '4px',
            border: `1px solid ${palette.border.subtle}`,
            backgroundColor: palette.surface,
            color: palette.text.primary,
            cursor: 'pointer',
            minHeight: '32px',
          }}
        >
          Simulate Error
        </button>
      </div>

      {errorMessage && (
        <div style={{ marginBottom: `${spacing.base}px` }}>
          <Feedback
            severity="danger"
            title="Plan Loading Error"
            message={errorMessage}
            themeMode={themeMode}
            onDismiss={() => setErrorMessage(null)}
          />
          <div style={{ marginTop: `${spacing.xs}px` }}>
            <Button
              variant="secondary"
              size="compact"
              themeMode={themeMode}
              onClick={() => {
                setErrorMessage(null);
                setIsLoading(true);
                setTimeout(() => setIsLoading(false), 500);
              }}
            >
              Retry
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div
          role="status"
          aria-live="polite"
          aria-busy="true"
          style={{
            padding: `${spacing.xl}px`,
            textAlign: 'center',
            backgroundColor: palette.surface,
            borderRadius: `${radii.card}px`,
            border: `1px solid ${palette.border.subtle}`,
          }}
        >
          Loading plan details...
        </div>
      ) : showEmpty ? (
        <EmptyState
          id="plan-empty-state"
          title="No tasks scheduled in Plan"
          description="Your task backlog is empty. Add a new task or configure recurring daily routines."
          actionLabel="Add Task"
          onAction={() => openModal('create')}
          themeMode={themeMode}
          icon="📋"
        />
      ) : activeTab === 'tasks' ? (
        /* Tasks View */
        <div>
          {/* Priority Filter Chips */}
          <div
            role="group"
            aria-label="Filter tasks by priority"
            style={{
              display: 'flex',
              gap: `${spacing.xs}px`,
              marginBottom: `${spacing.base}px`,
              alignItems: 'center',
            }}
          >
            <span style={{ fontSize: '12px', color: palette.text.secondary, fontWeight: 600 }}>
              Priority:
            </span>
            {(['all', 'high', 'medium', 'low'] as const).map((pri) => (
              <button
                key={pri}
                type="button"
                onClick={() => setPriorityFilter(pri)}
                aria-pressed={priorityFilter === pri}
                style={{
                  padding: '4px 10px',
                  borderRadius: `${radii.pill}px`,
                  border: `1px solid ${
                    priorityFilter === pri ? palette.action.primary : palette.border.subtle
                  }`,
                  backgroundColor: priorityFilter === pri ? palette.surfaceRaised : palette.surface,
                  color: priorityFilter === pri ? palette.action.primary : palette.text.secondary,
                  fontWeight: priorityFilter === pri ? 700 : 500,
                  fontSize: '12px',
                  cursor: 'pointer',
                  minHeight: `${touchTargets.webMin}px`,
                  display: 'inline-flex',
                  alignItems: 'center',
                }}
              >
                {pri.charAt(0).toUpperCase() + pri.slice(1)}
              </button>
            ))}
          </div>

          <Card themeMode={themeMode}>
            <div role="list" aria-label="Task items">
              {filteredTasks.map((task) => (
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
                    id={`plan-task-${task.id}`}
                    checked={task.completed}
                    onChange={() => toggleTask(task.id)}
                    aria-label={`Mark task "${task.title}" as ${task.completed ? 'incomplete' : 'complete'}`}
                    style={{ width: '20px', height: '20px', accentColor: palette.action.primary }}
                  />
                  <label
                    htmlFor={`plan-task-${task.id}`}
                    style={{
                      flex: 1,
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
                      textTransform: 'uppercase',
                      padding: '2px 8px',
                      borderRadius: `${radii.pill}px`,
                      backgroundColor:
                        task.priority === 'high' ? palette.accent.subtle : palette.surfaceRaised,
                      color:
                        task.priority === 'high' ? palette.accent.label : palette.text.secondary,
                      border: `1px solid ${palette.border.subtle}`,
                    }}
                  >
                    {task.priority}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      ) : (
        /* Routines View */
        <Card themeMode={themeMode}>
          <div role="list" aria-label="Routine definitions">
            {routines.map((routine) => (
              <ListRow
                key={routine.id}
                title={routine.title}
                subtitle={`${routine.schedule} · Repeat: ${routine.repeat}`}
                themeMode={themeMode}
              />
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
