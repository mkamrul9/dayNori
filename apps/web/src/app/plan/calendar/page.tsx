'use client';

import React, { useState, useEffect, useRef, useId, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { colors, radii, spacing, touchTargets, typography } from '@daynori/design-tokens';
import { Button, Card, Dialog, TextField } from '@daynori/ui-web';
import { useShell } from '../../../components/ShellContext';
import { useAuth } from '../../../components/AuthContext';
import { createApiClient, type DaynoriApiClient } from '@daynori/api-client';
import {
  buildMonthGrid,
  buildCalendarReadModel,
  getCalendarDateTimeParts,
  checkLocalTimeDisambiguation,
  validateCalendarEventTitle,
  validateCalendarEventInterval,
  type CalendarItem,
  type CalendarPersonalEventItem,
  type JournalDateIndicator,
} from '@daynori/domain';
import { IndexedDbLocalRepository } from '../../../data/indexedDbRepository';

export type CalendarViewMode = 'agenda' | 'day' | 'month';

function getItemDate(item: CalendarItem): string {
  if (item.sourceType === 'task_deadline') return item.deadlineDate;
  if (item.sourceType === 'routine_occurrence') return item.scheduledDate;
  return item.startDate;
}

function getItemTitle(item: CalendarItem): string {
  if (item.sourceType === 'routine_occurrence') return item.routineTitle;
  return item.title;
}

const weekdayLabels: Record<1 | 6 | 7, string[]> = {
  1: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  7: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  6: ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
};

export default function PlanCalendarPage() {
  const liveRegionId = useId();
  const { themeMode } = useShell();
  const palette = colors[themeMode];
  const { workspaceId, user } = useAuth();

  const [viewMode, setViewMode] = useState<CalendarViewMode>('agenda');
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedDateStr, setSelectedDateStr] = useState(() => {
    const now = new Date();
    return now.toISOString().slice(0, 10);
  });

  const timezone = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch {
      return 'UTC';
    }
  }, []);

  const [weekStart, setWeekStart] = useState<1 | 6 | 7>(1); // 1 = Mon, 7 = Sun, 6 = Sat
  const [sourceTasks, setSourceTasks] = useState(true);
  const [sourceRoutines, setSourceRoutines] = useState(true);
  const [sourceEvents, setSourceEvents] = useState(true);

  // Data states
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [journalIndicators, setJournalIndicators] = useState<Record<string, JournalDateIndicator>>(
    {}
  );
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [liveAnnouncement, setLiveAnnouncement] = useState('');

  // Event modal state
  const [isEventModalOpen, setEventModalOpen] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [eventRevision, setEventRevision] = useState<number | undefined>(undefined);
  const [eventTitle, setEventTitle] = useState('');
  const [eventDetails, setEventDetails] = useState('');
  const [eventAllDay, setEventAllDay] = useState(true);
  const [eventStartDate, setEventStartDate] = useState(selectedDateStr);
  const [eventEndDate, setEventEndDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  });
  const [eventStartAt, setEventStartAt] = useState(`${selectedDateStr}T09:00`);
  const [eventEndAt, setEventEndAt] = useState(`${selectedDateStr}T10:00`);
  const [eventTimezone, setEventTimezone] = useState(timezone);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const apiClientRef = useRef<DaynoriApiClient | null>(null);
  const requestIdRef = useRef(0);

  if (!apiClientRef.current) {
    apiClientRef.current = createApiClient({
      baseUrl: '/api',
    });
  }

  // Clear sensitive state on workspace change
  useEffect(() => {
    setItems([]);
    setJournalIndicators({});
    setErrorMessage(null);
  }, [workspaceId]);

  // Calculate visible range based on currentDate
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1;

  const visibleRange = useMemo(() => {
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);

    const startRange = new Date(firstDay);
    startRange.setDate(startRange.getDate() - 14);
    const endRange = new Date(lastDay);
    endRange.setDate(endRange.getDate() + 14);

    return {
      startDate: startRange.toISOString().slice(0, 10),
      endDate: endRange.toISOString().slice(0, 10),
    };
  }, [year, month]);

  // Load feed from API with IndexedDB offline fallback
  const loadFeed = useCallback(async () => {
    if (!workspaceId) {
      setItems([]);
      setJournalIndicators({});
      return;
    }
    const currentReqId = ++requestIdRef.current;
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const client = apiClientRef.current;
      if (!client) return;

      const feedRes = await client.getCalendarFeed(workspaceId, {
        startDate: visibleRange.startDate,
        endDate: visibleRange.endDate,
        timezone,
        includeTasks: sourceTasks,
        includeRoutines: sourceRoutines,
        includeEvents: sourceEvents,
        includeJournalIndicators: true,
      });

      if (currentReqId !== requestIdRef.current) return;

      if (feedRes.data) {
        setItems(feedRes.data.items);
        setJournalIndicators(feedRes.data.journalIndicators);
      }
    } catch (err: unknown) {
      if (currentReqId !== requestIdRef.current) return;

      // Offline fallback: try reading from IndexedDB
      try {
        const repo = new IndexedDbLocalRepository();
        await repo.initialize({
          userId: user?.id || 'offline-user',
          workspaceId,
        });

        const [localEvents, localTasks, localOccurrences, localJournals] = await Promise.all([
          sourceEvents
            ? repo.listCalendarEvents(workspaceId, {
                startDate: visibleRange.startDate,
                endDate: visibleRange.endDate,
                includeDeleted: false,
              })
            : Promise.resolve([]),
          sourceTasks ? repo.listTasks(workspaceId) : Promise.resolve([]),
          sourceRoutines
            ? repo.listRoutineOccurrences(
                workspaceId,
                undefined,
                visibleRange.startDate,
                visibleRange.endDate
              )
            : Promise.resolve([]),
          repo.listJournalEntries(workspaceId, { includeDeleted: false }),
        ]);

        if (currentReqId !== requestIdRef.current) {
          await repo.close();
          return;
        }

        const journalDateCounts: Record<string, number> = {};
        for (const j of localJournals) {
          if (!j.deletedAt && !j.isArchived) {
            journalDateCounts[j.entryDate] = (journalDateCounts[j.entryDate] || 0) + 1;
          }
        }
        const journalDates = Object.entries(journalDateCounts).map(([date, count]) => ({
          date,
          count,
        }));

        const readModel = buildCalendarReadModel({
          startDate: visibleRange.startDate,
          endDate: visibleRange.endDate,
          timezone,
          tasks: localTasks.map((t) => ({
            id: t.id,
            workspaceId: t.workspaceId,
            folderId: t.folderId,
            title: t.title,
            priority: t.priority,
            status: t.status,
            deadline: t.deadline,
            tags: t.tags,
          })),
          routines: [],
          routineOccurrences: localOccurrences.map((o) => ({
            id: o.id,
            routineId: o.routineId,
            workspaceId: o.workspaceId,
            scheduledDate: o.scheduledDate,
            plannedInstant: o.plannedInstant,
            timezone: o.timezone,
            status: o.status,
          })),
          events: localEvents.map((e) => ({
            id: e.id,
            workspaceId: e.workspaceId,
            folderId: e.folderId,
            title: e.title,
            details: e.details,
            allDay: e.allDay,
            startDate: e.startDate,
            endDate: e.endDate,
            startAt: e.startAt,
            endAt: e.endAt,
            timezone: e.timezone,
            isArchived: e.isArchived,
            securityScope: e.securityScope,
            createdAt: e.createdAt,
            updatedAt: e.updatedAt,
            deletedAt: e.deletedAt,
            revision: e.serverRevision,
          })),
          journalDates,
        });

        setItems(readModel.items);
        setJournalIndicators(readModel.journalIndicators);
        await repo.close();
      } catch {
        setErrorMessage(err instanceof Error ? err.message : 'Failed to load calendar items');
      }
    } finally {
      if (currentReqId === requestIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [workspaceId, user, visibleRange, timezone, sourceTasks, sourceRoutines, sourceEvents]);

  useEffect(() => {
    void loadFeed();
  }, [loadFeed]);

  // Month navigation (safe from 31st rollover)
  const handlePrevMonth = () => {
    setCurrentDate((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
    setLiveAnnouncement(`Navigated to previous month.`);
  };

  const handleNextMonth = () => {
    setCurrentDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
    setLiveAnnouncement(`Navigated to next month.`);
  };

  const handleTodayJump = () => {
    const today = new Date();
    setCurrentDate(today);
    setSelectedDateStr(today.toISOString().slice(0, 10));
    setLiveAnnouncement(`Jumped to today, ${today.toISOString().slice(0, 10)}.`);
  };

  // Month grid
  const monthWeeks = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    return buildMonthGrid({
      year,
      month,
      weekStart,
      todayDate: todayStr,
      items,
      journalIndicators,
      viewingTimezone: timezone,
    });
  }, [year, month, weekStart, items, journalIndicators, timezone]);

  // Group items by date for agenda view
  const itemsByDate = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    for (const item of items) {
      const dateKey = getItemDate(item);
      if (!map.has(dateKey)) {
        map.set(dateKey, []);
      }
      map.get(dateKey)!.push(item);
    }

    const sortedDates = Array.from(map.keys()).sort();
    return sortedDates.map((date) => ({
      date,
      items: map.get(date)!,
    }));
  }, [items]);

  // Items for selected day
  const selectedDayItems = useMemo(() => {
    return items.filter((item) => getItemDate(item) === selectedDateStr);
  }, [items, selectedDateStr]);

  // Open modal for new event
  const handleOpenAddEvent = (presetDate?: string) => {
    const date = presetDate || selectedDateStr;
    const nextDay = new Date(date);
    nextDay.setDate(nextDay.getDate() + 1);

    setEditingEventId(null);
    setEventRevision(undefined);
    setEventTitle('');
    setEventDetails('');
    setEventAllDay(true);
    setEventStartDate(date);
    setEventEndDate(nextDay.toISOString().slice(0, 10));
    setEventStartAt(`${date}T09:00`);
    setEventEndAt(`${date}T10:00`);
    setEventTimezone(timezone);
    setFormError(null);
    setEventModalOpen(true);
  };

  // Open modal for editing event
  const handleOpenEditEvent = (ev: CalendarPersonalEventItem) => {
    setEditingEventId(ev.id);
    setEventRevision(ev.revision);
    setEventTitle(ev.title);
    setEventDetails(ev.details || '');
    setEventAllDay(ev.allDay);
    setEventStartDate(ev.startDate || getItemDate(ev));
    setEventEndDate(ev.endDate || getItemDate(ev));
    const evTz = ev.timezone || timezone;
    if (ev.startAt) {
      const parts = getCalendarDateTimeParts(new Date(ev.startAt), evTz);
      setEventStartAt(`${parts.date}T${parts.time}`);
    } else {
      setEventStartAt(`${getItemDate(ev)}T09:00`);
    }
    if (ev.endAt) {
      const parts = getCalendarDateTimeParts(new Date(ev.endAt), evTz);
      setEventEndAt(`${parts.date}T${parts.time}`);
    } else {
      setEventEndAt(`${getItemDate(ev)}T10:00`);
    }
    setEventTimezone(evTz);
    setFormError(null);
    setEventModalOpen(true);
  };

  // Save event
  const handleSaveEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workspaceId) return;

    let normalizedTitle = '';
    const [startDatePart, startTimePart] = eventStartAt.split('T');
    const [endDatePart, endTimePart] = eventEndAt.split('T');

    let startAtIso: string | undefined = undefined;
    let endAtIso: string | undefined = undefined;

    if (!eventAllDay) {
      const startResult = checkLocalTimeDisambiguation(
        startDatePart || eventStartDate,
        startTimePart || '09:00',
        eventTimezone
      );
      startAtIso =
        startResult.type === 'exact'
          ? startResult.utcTimestamp
          : startResult.type === 'nonexistent'
            ? startResult.suggestedUtcTimestamp || new Date(`${startDatePart || eventStartDate}T${startTimePart || '09:00'}:00.000Z`).toISOString()
            : startResult.earlierUtcTimestamp;

      const endResult = checkLocalTimeDisambiguation(
        endDatePart || eventStartDate,
        endTimePart || '10:00',
        eventTimezone
      );
      endAtIso =
        endResult.type === 'exact'
          ? endResult.utcTimestamp
          : endResult.type === 'nonexistent'
            ? endResult.suggestedUtcTimestamp || new Date(`${endDatePart || eventStartDate}T${endTimePart || '10:00'}:00.000Z`).toISOString()
            : endResult.earlierUtcTimestamp;
    }

    try {
      normalizedTitle = validateCalendarEventTitle(eventTitle);
      validateCalendarEventInterval({
        title: normalizedTitle,
        allDay: eventAllDay,
        startDate: eventAllDay ? eventStartDate : undefined,
        endDate: eventAllDay ? eventEndDate : undefined,
        startAt: startAtIso,
        endAt: endAtIso,
        timezone: eventTimezone,
      });
    } catch (valErr: unknown) {
      setFormError(valErr instanceof Error ? valErr.message : String(valErr));
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      const client = apiClientRef.current;
      if (!client) throw new Error('API client unavailable');

      if (editingEventId) {
        await client.updateCalendarEvent(workspaceId, editingEventId, {
          title: normalizedTitle,
          details: eventDetails || null,
          allDay: eventAllDay,
          startDate: eventAllDay ? eventStartDate : undefined,
          endDate: eventAllDay ? eventEndDate : undefined,
          startAt: startAtIso,
          endAt: endAtIso,
          timezone: eventTimezone,
          expectedRevision: eventRevision,
        });
        setLiveAnnouncement(`Event "${normalizedTitle}" updated.`);
      } else {
        await client.createCalendarEvent(workspaceId, {
          title: normalizedTitle,
          details: eventDetails || null,
          allDay: eventAllDay,
          startDate: eventAllDay ? eventStartDate : undefined,
          endDate: eventAllDay ? eventEndDate : undefined,
          startAt: startAtIso,
          endAt: endAtIso,
          timezone: eventTimezone,
        });
        setLiveAnnouncement(`Event "${normalizedTitle}" scheduled.`);
      }

      setEventModalOpen(false);
      await loadFeed();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Failed to save calendar event');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete event
  const handleDeleteEvent = async (id: string, title: string) => {
    if (!workspaceId) return;
    if (!confirm(`Are you sure you want to delete "${title}"?`)) return;

    try {
      const client = apiClientRef.current;
      if (!client) throw new Error('API client unavailable');

      await client.deleteCalendarEvent(workspaceId, id);
      setLiveAnnouncement(`Event "${title}" deleted.`);
      await loadFeed();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to delete event');
    }
  };

  const monthNames = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];

  return (
    <div
      style={{
        maxWidth: '960px',
        margin: '0 auto',
        padding: `${spacing.lg}px ${spacing.base}px`,
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      {/* Live Region for Screen Readers */}
      <div
        id={liveRegionId}
        aria-live="polite"
        aria-atomic="true"
        style={{
          position: 'absolute',
          width: '1px',
          height: '1px',
          padding: 0,
          margin: '-1px',
          overflow: 'hidden',
          clip: 'rect(0, 0, 0, 0)',
          whiteSpace: 'nowrap',
          border: 0,
        }}
      >
        {liveAnnouncement}
      </div>

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

      {/* Top Header & Actions */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: `${spacing.base}px`,
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
            Calendar & Deadlines
          </h1>
          <p style={{ margin: '4px 0 0 0', color: palette.text.secondary }}>
            Unified schedule projecting canonical task deadlines, routine occurrences, and personal
            events.
          </p>
        </div>

        {/* View Mode Toggle + Add Event Button */}
        <div
          style={{
            display: 'flex',
            gap: `${spacing.xs}px`,
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
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
                padding: '6px 14px',
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
              Agenda
            </button>
            <button
              type="button"
              id="view-day-btn"
              aria-pressed={viewMode === 'day'}
              onClick={() => setViewMode('day')}
              style={{
                padding: '6px 14px',
                border: 'none',
                borderRadius: `${radii.sm}px`,
                backgroundColor: viewMode === 'day' ? palette.action.primary : 'transparent',
                color: viewMode === 'day' ? palette.action.label : palette.text.primary,
                fontWeight: 600,
                fontSize: '13px',
                cursor: 'pointer',
                minHeight: '36px',
              }}
            >
              Day
            </button>
            <button
              type="button"
              id="view-month-btn"
              aria-pressed={viewMode === 'month'}
              onClick={() => setViewMode('month')}
              style={{
                padding: '6px 14px',
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
              Month
            </button>
          </div>

          <Button
            size="compact"
            variant="primary"
            themeMode={themeMode}
            onClick={() => handleOpenAddEvent()}
          >
            ＋ Add Event
          </Button>
        </div>
      </div>

      {/* Navigation & Controls Bar */}
      <Card themeMode={themeMode} style={{ marginBottom: `${spacing.base}px` }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: `${spacing.sm}px`,
          }}
        >
          {/* Month/Date Header & Prev/Today/Next Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: `${spacing.xs}px` }}>
            <h2
              style={{
                margin: 0,
                fontSize: `${typography.webScale.sectionHeading}px`,
                color: palette.text.primary,
                minWidth: '180px',
              }}
            >
              {viewMode === 'day' ? selectedDateStr : `${monthNames[month - 1]} ${year}`}
            </h2>

            <Button
              size="compact"
              variant="secondary"
              themeMode={themeMode}
              onClick={handlePrevMonth}
              aria-label="Previous month"
            >
              ← Prev
            </Button>
            <Button
              size="compact"
              variant="secondary"
              themeMode={themeMode}
              onClick={handleTodayJump}
              aria-label="Jump to today"
            >
              Today
            </Button>
            <Button
              size="compact"
              variant="secondary"
              themeMode={themeMode}
              onClick={handleNextMonth}
              aria-label="Next month"
            >
              Next →
            </Button>
          </div>

          {/* Preferences: Week Start, Timezone & Source Filters */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: `${spacing.sm}px`,
              flexWrap: 'wrap',
            }}
          >
            <label
              style={{
                fontSize: '12px',
                color: palette.text.secondary,
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              Week Start:
              <select
                value={weekStart}
                onChange={(e) => setWeekStart(Number(e.target.value) as 1 | 6 | 7)}
                style={{
                  fontSize: '12px',
                  padding: '3px 8px',
                  borderRadius: `${radii.sm}px`,
                  border: `1px solid ${palette.border.subtle}`,
                  backgroundColor: palette.surface,
                  color: palette.text.primary,
                }}
              >
                <option value={1}>Monday</option>
                <option value={7}>Sunday</option>
                <option value={6}>Saturday</option>
              </select>
            </label>

            {/* Source Filters */}
            <div
              role="group"
              aria-label="Filter calendar item sources"
              style={{ display: 'flex', gap: `${spacing.xs}px` }}
            >
              <label
                style={{
                  fontSize: '12px',
                  color: palette.text.primary,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={sourceTasks}
                  onChange={(e) => setSourceTasks(e.target.checked)}
                />
                Tasks
              </label>
              <label
                style={{
                  fontSize: '12px',
                  color: palette.text.primary,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={sourceRoutines}
                  onChange={(e) => setSourceRoutines(e.target.checked)}
                />
                Routines
              </label>
              <label
                style={{
                  fontSize: '12px',
                  color: palette.text.primary,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={sourceEvents}
                  onChange={(e) => setSourceEvents(e.target.checked)}
                />
                Events
              </label>
            </div>
          </div>
        </div>
      </Card>

      {/* Error state */}
      {errorMessage && (
        <div
          role="alert"
          style={{
            padding: `${spacing.sm}px`,
            backgroundColor: '#fee2e2',
            color: '#991b1b',
            borderRadius: `${radii.sm}px`,
            marginBottom: `${spacing.base}px`,
            fontSize: '13px',
          }}
        >
          {errorMessage}
        </div>
      )}

      {/* 1. Agenda View */}
      {viewMode === 'agenda' && (
        <Card themeMode={themeMode}>
          <div role="feed" aria-label="Calendar agenda items">
            {itemsByDate.length === 0 ? (
              <div
                style={{
                  textAlign: 'center',
                  padding: `${spacing.xl}px 0`,
                  color: palette.text.secondary,
                }}
              >
                {isLoading
                  ? 'Loading calendar schedule...'
                  : 'No scheduled tasks, routines, or events found in this date range.'}
              </div>
            ) : (
              itemsByDate.map(({ date, items: dayItems }) => (
                <section
                  key={date}
                  aria-labelledby={`date-heading-${date}`}
                  style={{
                    marginBottom: `${spacing.md}px`,
                    borderBottom: `1px solid ${palette.border.subtle}`,
                    paddingBottom: `${spacing.sm}px`,
                  }}
                >
                  <h3
                    id={`date-heading-${date}`}
                    style={{
                      margin: '0 0 8px 0',
                      fontSize: '14px',
                      fontWeight: 700,
                      color:
                        date === selectedDateStr ? palette.action.primary : palette.text.secondary,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span>{date}</span>
                    {journalIndicators[date]?.hasEntry && (
                      <span
                        title="Journal entries recorded on this day"
                        style={{
                          fontSize: '11px',
                          fontWeight: 500,
                          backgroundColor: palette.surfaceRaised,
                          padding: '1px 6px',
                          borderRadius: `${radii.pill}px`,
                          color: palette.text.secondary,
                        }}
                      >
                        📓 Journal recorded
                      </span>
                    )}
                  </h3>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.xs}px` }}>
                    {dayItems.map((item) => (
                      <CalendarItemRow
                        key={item.id}
                        item={item}
                        themeMode={themeMode}
                        onEditEvent={handleOpenEditEvent}
                        onDeleteEvent={handleDeleteEvent}
                      />
                    ))}
                  </div>
                </section>
              ))
            )}
          </div>
        </Card>
      )}

      {/* 2. Day View */}
      {viewMode === 'day' && (
        <Card themeMode={themeMode}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: `${spacing.md}px`,
            }}
          >
            <h2
              style={{
                margin: 0,
                fontSize: `${typography.webScale.sectionHeading}px`,
                color: palette.text.primary,
              }}
            >
              Schedule for {selectedDateStr}
            </h2>
            <Button
              size="compact"
              variant="secondary"
              themeMode={themeMode}
              onClick={() => handleOpenAddEvent(selectedDateStr)}
            >
              ＋ Add Event on this Day
            </Button>
          </div>

          {selectedDayItems.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: `${spacing.xl}px 0`,
                color: palette.text.secondary,
              }}
            >
              Nothing scheduled on {selectedDateStr}.
            </div>
          ) : (
            <div
              role="list"
              aria-label={`Events on ${selectedDateStr}`}
              style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.sm}px` }}
            >
              {selectedDayItems.map((item) => (
                <CalendarItemRow
                  key={item.id}
                  item={item}
                  themeMode={themeMode}
                  onEditEvent={handleOpenEditEvent}
                  onDeleteEvent={handleDeleteEvent}
                />
              ))}
            </div>
          )}
        </Card>
      )}

      {/* 3. Month Grid View */}
      {viewMode === 'month' && (
        <Card themeMode={themeMode}>
          <div
            role="grid"
            aria-label={`Calendar grid for ${monthNames[month - 1]} ${year}`}
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(7, 1fr)',
              gap: '4px',
              textAlign: 'center',
            }}
          >
            {/* Weekday column headers */}
            {weekdayLabels[weekStart].map((label) => (
              <div
                key={label}
                role="columnheader"
                style={{
                  fontSize: '12px',
                  fontWeight: 700,
                  color: palette.text.secondary,
                  padding: `${spacing.xs}px 0`,
                }}
              >
                {label}
              </div>
            ))}

            {/* Grid days */}
            {monthWeeks
              .flatMap((w) => w.cells)
              .map((cell) => {
                const isSelected = selectedDateStr === cell.date;

                return (
                  <button
                    key={cell.date}
                    type="button"
                    role="gridcell"
                    aria-selected={isSelected}
                    aria-label={`${cell.date}${cell.items.length > 0 ? ` with ${cell.items.length} items` : ''}${cell.journalIndicator?.hasEntry ? ' has journal entry' : ''}`}
                    onClick={() => setSelectedDateStr(cell.date)}
                    style={{
                      minHeight: '64px',
                      padding: '4px',
                      borderRadius: `${radii.sm}px`,
                      border: isSelected
                        ? `2px solid ${palette.action.primary}`
                        : `1px solid ${palette.border.subtle}`,
                      backgroundColor: isSelected
                        ? palette.surfaceRaised
                        : cell.isCurrentMonth
                          ? palette.surface
                          : palette.surfaceRaised,
                      opacity: cell.isCurrentMonth ? 1 : 0.45,
                      color: palette.text.primary,
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'flex-start',
                      boxSizing: 'border-box',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '13px',
                        fontWeight: cell.isToday ? 800 : isSelected ? 700 : 500,
                        color: cell.isToday ? palette.action.primary : palette.text.primary,
                      }}
                    >
                      {cell.dayNumber}
                    </span>

                    {/* Badges / dots container */}
                    <div
                      style={{
                        display: 'flex',
                        gap: '3px',
                        marginTop: '4px',
                        flexWrap: 'wrap',
                        justifyContent: 'center',
                      }}
                    >
                      {cell.items.slice(0, 3).map((item) => (
                        <span
                          key={item.id}
                          title={`${item.sourceType}: ${getItemTitle(item)}`}
                          style={{
                            width: '6px',
                            height: '6px',
                            borderRadius: '50%',
                            backgroundColor:
                              item.sourceType === 'task_deadline'
                                ? '#ef4444'
                                : item.sourceType === 'routine_occurrence'
                                  ? '#3b82f6'
                                  : '#10b981',
                          }}
                        />
                      ))}
                      {/* Privacy invariant: indicator dot only */}
                      {cell.journalIndicator?.hasEntry && (
                        <span
                          title="Journal entry recorded"
                          style={{
                            width: '6px',
                            height: '6px',
                            borderRadius: '50%',
                            backgroundColor: '#8b5cf6',
                          }}
                        />
                      )}
                    </div>

                    {cell.items.length > 3 && (
                      <span
                        style={{
                          fontSize: '10px',
                          color: palette.text.secondary,
                          marginTop: '2px',
                        }}
                      >
                        +{cell.items.length - 3}
                      </span>
                    )}
                  </button>
                );
              })}
          </div>

          {/* Details for selected day below month grid */}
          <div
            style={{
              marginTop: `${spacing.lg}px`,
              borderTop: `1px solid ${palette.border.subtle}`,
              paddingTop: `${spacing.base}px`,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: `${spacing.sm}px`,
              }}
            >
              <h3
                style={{
                  margin: 0,
                  fontSize: '15px',
                  fontWeight: 700,
                  color: palette.text.primary,
                }}
              >
                Selected Date: {selectedDateStr}
              </h3>
              <Button
                size="compact"
                variant="secondary"
                themeMode={themeMode}
                onClick={() => handleOpenAddEvent(selectedDateStr)}
              >
                ＋ Add Event
              </Button>
            </div>

            {selectedDayItems.length === 0 ? (
              <p style={{ fontSize: '13px', color: palette.text.secondary, margin: 0 }}>
                No scheduled items for this date.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.xs}px` }}>
                {selectedDayItems.map((item) => (
                  <CalendarItemRow
                    key={item.id}
                    item={item}
                    themeMode={themeMode}
                    onEditEvent={handleOpenEditEvent}
                    onDeleteEvent={handleDeleteEvent}
                  />
                ))}
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Add / Edit Personal Calendar Event Modal */}
      <Dialog
        isOpen={isEventModalOpen}
        onClose={() => setEventModalOpen(false)}
        title={editingEventId ? 'Edit Event' : 'Schedule Personal Event'}
        description="Add a standalone calendar event to your workspace schedule."
        themeMode={themeMode}
      >
        <form
          onSubmit={handleSaveEvent}
          style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.base}px` }}
        >
          {formError && (
            <div
              role="alert"
              style={{
                padding: '8px 12px',
                backgroundColor: '#fee2e2',
                color: '#991b1b',
                borderRadius: `${radii.sm}px`,
                fontSize: '13px',
              }}
            >
              {formError}
            </div>
          )}

          <TextField
            id="event-title-input"
            label="Event Title"
            placeholder="e.g. Design Architecture Review"
            value={eventTitle}
            onChange={(e) => setEventTitle(e.target.value)}
            themeMode={themeMode}
            autoFocus
            required
          />

          <div>
            <label
              htmlFor="event-details-input"
              style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: 600,
                color: palette.text.primary,
                marginBottom: '4px',
              }}
            >
              Details / Notes (Optional)
            </label>
            <textarea
              id="event-details-input"
              rows={3}
              value={eventDetails}
              onChange={(e) => setEventDetails(e.target.value)}
              placeholder="Add optional notes, links, or agenda..."
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: `${radii.sm}px`,
                border: `1px solid ${palette.border.subtle}`,
                backgroundColor: palette.surface,
                color: palette.text.primary,
                fontSize: '13px',
                boxSizing: 'border-box',
                fontFamily: 'inherit',
              }}
            />
          </div>

          {/* All Day Toggle */}
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '13px',
              fontWeight: 600,
              color: palette.text.primary,
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              id="event-allday-checkbox"
              checked={eventAllDay}
              onChange={(e) => setEventAllDay(e.target.checked)}
            />
            All-Day Event (Uses exclusive end date)
          </label>

          {/* All-Day Inputs */}
          {eventAllDay ? (
            <div
              style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: `${spacing.sm}px` }}
            >
              <TextField
                id="event-start-date"
                label="Start Date"
                type="date"
                value={eventStartDate}
                onChange={(e) => setEventStartDate(e.target.value)}
                themeMode={themeMode}
                required
              />
              <TextField
                id="event-end-date"
                label="End Date (Exclusive)"
                type="date"
                value={eventEndDate}
                onChange={(e) => setEventEndDate(e.target.value)}
                themeMode={themeMode}
                required
              />
            </div>
          ) : (
            /* Timed Inputs */
            <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.sm}px` }}>
              <div
                style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: `${spacing.sm}px` }}
              >
                <TextField
                  id="event-start-at"
                  label="Start Time"
                  type="datetime-local"
                  value={eventStartAt}
                  onChange={(e) => setEventStartAt(e.target.value)}
                  themeMode={themeMode}
                  required
                />
                <TextField
                  id="event-end-at"
                  label="End Time"
                  type="datetime-local"
                  value={eventEndAt}
                  onChange={(e) => setEventEndAt(e.target.value)}
                  themeMode={themeMode}
                  required
                />
              </div>
              <TextField
                id="event-timezone"
                label="Timezone (IANA)"
                value={eventTimezone}
                onChange={(e) => setEventTimezone(e.target.value)}
                themeMode={themeMode}
                required
              />
            </div>
          )}

          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: `${spacing.sm}px`,
              marginTop: `${spacing.sm}px`,
            }}
          >
            <Button
              type="button"
              variant="secondary"
              themeMode={themeMode}
              onClick={() => setEventModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" themeMode={themeMode} disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : editingEventId ? 'Save Changes' : 'Schedule Event'}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}

interface CalendarItemRowProps {
  item: CalendarItem;
  themeMode: 'light' | 'dark';
  onEditEvent: (ev: CalendarPersonalEventItem) => void;
  onDeleteEvent: (id: string, title: string) => void;
}

function CalendarItemRow({ item, themeMode, onEditEvent, onDeleteEvent }: CalendarItemRowProps) {
  const palette = colors[themeMode];
  const isTask = item.sourceType === 'task_deadline';
  const isRoutine = item.sourceType === 'routine_occurrence';
  const isPersonal = item.sourceType === 'calendar_event';

  const badgeColor = isTask ? '#ef4444' : isRoutine ? '#3b82f6' : '#10b981';
  const badgeLabel = isTask ? 'Task Deadline' : isRoutine ? 'Routine' : 'Personal Event';

  let timeStr = 'All Day';
  if (isPersonal) {
    const p = item as CalendarPersonalEventItem;
    if (!p.allDay && p.startAt) {
      try {
        const d = new Date(p.startAt);
        timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      } catch {
        timeStr = 'Timed';
      }
    }
  } else if (isRoutine) {
    timeStr = 'Routine';
  } else if (isTask) {
    timeStr = 'Due Date';
  }

  const title = getItemTitle(item);

  return (
    <article
      role="article"
      aria-label={`${title} (${badgeLabel})`}
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '8px 12px',
        borderRadius: `${radii.sm}px`,
        backgroundColor: palette.surfaceRaised,
        border: `1px solid ${palette.border.subtle}`,
        gap: `${spacing.md}px`,
        minHeight: `${touchTargets.webMin}px`,
      }}
    >
      {/* Time indicator */}
      <div
        style={{
          minWidth: '70px',
          fontSize: '12px',
          fontWeight: 700,
          color: palette.text.secondary,
        }}
      >
        {timeStr}
      </div>

      {/* Title & canonical linking */}
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            style={{
              fontSize: `${typography.webScale.body}px`,
              fontWeight: 600,
              color: palette.text.primary,
            }}
          >
            {title}
          </span>
          {isTask && (
            <Link
              href={`/plan?task=${(item as { taskId: string }).taskId}`}
              style={{
                fontSize: '11px',
                color: palette.action.primary,
                textDecoration: 'none',
                fontWeight: 600,
              }}
            >
              View Task ↗
            </Link>
          )}
        </div>
      </div>

      {/* Source Badge */}
      <span
        style={{
          fontSize: '11px',
          padding: '2px 8px',
          borderRadius: `${radii.pill}px`,
          backgroundColor: `${badgeColor}18`,
          color: badgeColor,
          fontWeight: 600,
        }}
      >
        {badgeLabel}
      </span>

      {/* Actions for personal events */}
      {isPersonal && (
        <div style={{ display: 'flex', gap: '4px' }}>
          <Button
            size="compact"
            variant="secondary"
            themeMode={themeMode}
            onClick={() => onEditEvent(item as CalendarPersonalEventItem)}
            aria-label={`Edit ${title}`}
          >
            Edit
          </Button>
          <Button
            size="compact"
            variant="secondary"
            themeMode={themeMode}
            onClick={() => onDeleteEvent(item.id, title)}
            aria-label={`Delete ${title}`}
          >
            ✕
          </Button>
        </div>
      )}
    </article>
  );
}
