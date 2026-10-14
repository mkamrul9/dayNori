'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { colors, radii, spacing, touchTargets, typography } from '@daynori/design-tokens';
import { Button, Card, Dialog, TextField } from '@daynori/ui-web';
import { useShell } from '../../../components/ShellContext';

export default function PlanCalendarPage() {
  const { themeMode } = useShell();
  const palette = colors[themeMode];

  const [viewMode, setViewMode] = useState<'agenda' | 'month'>('agenda');
  const [selectedDay, setSelectedDay] = useState('2026-10-14');
  const [isEventModalOpen, setEventModalOpen] = useState(false);
  const [newEventTitle, setNewEventTitle] = useState('');

  const agendaItems = [
    {
      id: 'ev1',
      time: '08:00 AM',
      title: 'Morning quiet reading',
      type: 'Routine',
      date: '2026-10-14',
    },
    {
      id: 'ev2',
      time: '10:30 AM',
      title: 'Review morning routine and priorities',
      type: 'Task',
      date: '2026-10-14',
    },
    {
      id: 'ev3',
      time: '02:00 PM',
      title: 'Product Architecture Sync',
      type: 'Event',
      date: '2026-10-14',
    },
    {
      id: 'ev4',
      time: '09:00 AM',
      title: 'Government application verification',
      type: 'Task',
      date: '2026-10-15',
    },
    {
      id: 'ev5',
      time: '05:00 PM',
      title: 'Weekly workspace backup review',
      type: 'Routine',
      date: '2026-10-18',
    },
  ];

  const daysInOctober = Array.from({ length: 31 }, (_, i) => {
    const day = i + 1;
    const dateStr = `2026-10-${String(day).padStart(2, '0')}`;
    const hasItems = agendaItems.some((item) => item.date === dateStr);
    return { day, dateStr, hasItems };
  });

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
      {/* Breadcrumb back to Plan */}
      <nav aria-label="Breadcrumb" style={{ marginBottom: `${spacing.sm}px` }}>
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
          ← Return to Plan
        </Link>
      </nav>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: `${spacing.sm}px`,
          marginBottom: `${spacing.base}px`,
        }}
      >
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: `${typography.webScale.welcomeTitle}px`,
              fontWeight: 800,
              color: palette.text.primary,
            }}
          >
            Calendar
          </h1>
          <p style={{ margin: '4px 0 0 0', color: palette.text.secondary }}>
            Agenda and schedule projections for underlying tasks and routines.
          </p>
        </div>

        {/* View Mode Toggle + Add Event */}
        <div style={{ display: 'flex', gap: `${spacing.xs}px`, alignItems: 'center' }}>
          <div
            role="group"
            aria-label="Calendar view type"
            style={{
              display: 'flex',
              backgroundColor: palette.surfaceRaised,
              borderRadius: `${radii.sm}px`,
              padding: '2px',
              border: `1px solid ${palette.border.subtle}`,
            }}
          >
            <button
              type="button"
              id="view-agenda-btn"
              aria-pressed={viewMode === 'agenda'}
              onClick={() => setViewMode('agenda')}
              style={{
                padding: '4px 12px',
                border: 'none',
                borderRadius: `${radii.sm}px`,
                backgroundColor: viewMode === 'agenda' ? palette.action.primary : 'transparent',
                color: viewMode === 'agenda' ? palette.action.label : palette.text.primary,
                fontWeight: 600,
                fontSize: '13px',
                cursor: 'pointer',
                minHeight: '36px',
              }}
            >
              Agenda List
            </button>
            <button
              type="button"
              id="view-month-btn"
              aria-pressed={viewMode === 'month'}
              onClick={() => setViewMode('month')}
              style={{
                padding: '4px 12px',
                border: 'none',
                borderRadius: `${radii.sm}px`,
                backgroundColor: viewMode === 'month' ? palette.action.primary : 'transparent',
                color: viewMode === 'month' ? palette.action.label : palette.text.primary,
                fontWeight: 600,
                fontSize: '13px',
                cursor: 'pointer',
                minHeight: '36px',
              }}
            >
              Month Grid
            </button>
          </div>

          <Button
            size="compact"
            variant="primary"
            themeMode={themeMode}
            onClick={() => setEventModalOpen(true)}
          >
            ＋ Add Event
          </Button>
        </div>
      </div>

      {viewMode === 'agenda' ? (
        /* Accessible Agenda List Alternative (Required for Reflow & Screen Readers) */
        <Card themeMode={themeMode}>
          <h2
            style={{
              margin: 0,
              fontSize: `${typography.webScale.sectionHeading}px`,
              color: palette.text.primary,
              marginBottom: `${spacing.md}px`,
            }}
          >
            October 2026 Agenda
          </h2>

          <div role="feed" aria-label="Scheduled agenda events">
            {agendaItems.map((item) => (
              <article
                key={item.id}
                aria-label={`${item.time} ${item.title}`}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  padding: `${spacing.sm}px 0`,
                  borderBottom: `1px solid ${palette.border.subtle}`,
                  gap: `${spacing.md}px`,
                  minHeight: `${touchTargets.webMin}px`,
                }}
              >
                <div
                  style={{
                    minWidth: '85px',
                    fontSize: '13px',
                    fontWeight: 700,
                    color: palette.action.primary,
                    paddingTop: '2px',
                  }}
                >
                  {item.time}
                </div>
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      fontSize: `${typography.webScale.body}px`,
                      fontWeight: 600,
                      color: palette.text.primary,
                    }}
                  >
                    {item.title}
                  </div>
                  <div
                    style={{
                      fontSize: '12px',
                      color: palette.text.secondary,
                      marginTop: '2px',
                    }}
                  >
                    Date: {item.date} · Type: {item.type}
                  </div>
                </div>
                <span
                  style={{
                    fontSize: '11px',
                    padding: '2px 8px',
                    borderRadius: `${radii.pill}px`,
                    backgroundColor: palette.surfaceRaised,
                    color: palette.text.secondary,
                    border: `1px solid ${palette.border.subtle}`,
                  }}
                >
                  {item.type}
                </span>
              </article>
            ))}
          </div>
        </Card>
      ) : (
        /* Month Calendar Grid */
        <Card themeMode={themeMode}>
          <h2
            style={{
              margin: 0,
              fontSize: `${typography.webScale.sectionHeading}px`,
              color: palette.text.primary,
              marginBottom: `${spacing.md}px`,
            }}
          >
            October 2026
          </h2>

          <div
            role="grid"
            aria-label="Month calendar grid"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(7, 1fr)',
              gap: '4px',
              textAlign: 'center',
            }}
          >
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div
                key={d}
                role="columnheader"
                style={{
                  fontSize: '12px',
                  fontWeight: 700,
                  color: palette.text.secondary,
                  padding: `${spacing.xs}px 0`,
                }}
              >
                {d}
              </div>
            ))}

            {/* Empty slots for Oct 1, 2026 (Thursday start) */}
            <div role="gridcell" aria-hidden="true" />
            <div role="gridcell" aria-hidden="true" />
            <div role="gridcell" aria-hidden="true" />
            <div role="gridcell" aria-hidden="true" />

            {daysInOctober.map((d) => {
              const isSelected = selectedDay === d.dateStr;
              return (
                <button
                  key={d.day}
                  type="button"
                  role="gridcell"
                  aria-selected={isSelected}
                  aria-label={`October ${d.day}, 2026${d.hasItems ? ' - has scheduled events' : ''}`}
                  onClick={() => setSelectedDay(d.dateStr)}
                  style={{
                    minHeight: '44px',
                    padding: '4px',
                    borderRadius: `${radii.sm}px`,
                    border: isSelected
                      ? `2px solid ${palette.action.primary}`
                      : `1px solid ${palette.border.subtle}`,
                    backgroundColor: isSelected ? palette.surfaceRaised : palette.surface,
                    color: palette.text.primary,
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: isSelected ? 700 : 500,
                  }}
                >
                  <span>{d.day}</span>
                  {d.hasItems && (
                    <span
                      aria-hidden="true"
                      style={{
                        width: '5px',
                        height: '5px',
                        borderRadius: '50%',
                        backgroundColor: palette.action.primary,
                        marginTop: '2px',
                      }}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </Card>
      )}

      {/* Add Event Dialog */}
      <Dialog
        isOpen={isEventModalOpen}
        onClose={() => setEventModalOpen(false)}
        title="Schedule Event"
        description="Add a standalone calendar event to your private schedule."
        themeMode={themeMode}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.base}px` }}>
          <TextField
            id="event-title-input"
            label="Event Title"
            placeholder="e.g. Weekly Strategy Sync"
            value={newEventTitle}
            onChange={(e) => setNewEventTitle(e.target.value)}
            themeMode={themeMode}
            autoFocus
          />

          <TextField
            id="event-date-input"
            label="Date (YYYY-MM-DD)"
            value={selectedDay}
            onChange={(e) => setSelectedDay(e.target.value)}
            themeMode={themeMode}
          />

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: `${spacing.sm}px` }}>
            <Button
              variant="secondary"
              themeMode={themeMode}
              onClick={() => setEventModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              themeMode={themeMode}
              onClick={() => setEventModalOpen(false)}
            >
              Save Event Preview
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
