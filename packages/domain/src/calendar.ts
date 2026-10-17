import {
  isValidCalendarDateString,
  isValidIanaTimezone,
  getCalendarDateInTimezone,
  addCalendarDays,
  type TaskDeadline,
} from './tasks.js';
import type { Weekday } from './routines.js';

export const MAX_CALENDAR_EVENT_TITLE_LENGTH = 255;
export const MAX_CALENDAR_EVENT_DETAILS_LENGTH = 10000;

export type CalendarItemSourceType = 'task_deadline' | 'routine_occurrence' | 'calendar_event';

export interface CalendarEventEntity {
  id: string;
  workspaceId: string;
  folderId: string | null;
  title: string;
  details: string | null;
  allDay: boolean;
  startDate: string | null; // YYYY-MM-DD (inclusive) for all-day events
  endDate: string | null; // YYYY-MM-DD (exclusive) for all-day events (endDate > startDate)
  startAt: string | null; // ISO 8601 UTC timestamp for timed events
  endAt: string | null; // ISO 8601 UTC timestamp for timed events (endAt > startAt)
  timezone: string; // IANA timezone identifier
  isArchived: boolean;
  securityScope: 'standard' | 'vault';
  revision: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface CalendarEventInput {
  title: string;
  details?: string | null;
  folderId?: string | null;
  allDay: boolean;
  startDate?: string | null;
  endDate?: string | null;
  startAt?: string | null;
  endAt?: string | null;
  timezone?: string;
}

export interface CalendarTaskDeadlineItem {
  sourceType: 'task_deadline';
  id: string;
  taskId: string;
  workspaceId: string;
  folderId: string | null;
  title: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  status: 'todo' | 'in_progress' | 'completed' | 'cancelled';
  deadlineType: 'date' | 'timed';
  deadlineDate: string; // YYYY-MM-DD in viewing timezone
  deadlineTime?: string;
  deadlineZone?: string;
  isOverdue: boolean;
  tags: string[];
}

export interface CalendarRoutineOccurrenceItem {
  sourceType: 'routine_occurrence';
  id: string;
  routineId: string;
  occurrenceId: string;
  workspaceId: string;
  routineTitle: string;
  scheduledDate: string; // YYYY-MM-DD
  plannedInstant: string | null;
  timezone: string;
  status: 'pending' | 'done' | 'skipped' | 'cancelled';
}

export interface CalendarPersonalEventItem {
  sourceType: 'calendar_event';
  id: string;
  eventId: string;
  workspaceId: string;
  folderId: string | null;
  title: string;
  details: string | null;
  allDay: boolean;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD (exclusive)
  startAt: string | null; // ISO timestamp
  endAt: string | null; // ISO timestamp
  timezone: string;
  revision?: number;
}

export type CalendarItem =
  CalendarTaskDeadlineItem | CalendarRoutineOccurrenceItem | CalendarPersonalEventItem;

export interface JournalDateIndicator {
  date: string;
  hasEntry: boolean;
  count: number;
}

export interface CalendarDaySummary {
  date: string;
  items: CalendarItem[];
  journalIndicator?: JournalDateIndicator;
}

export interface CalendarMonthCell {
  date: string;
  dayNumber: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  items: CalendarItem[];
  journalIndicator?: JournalDateIndicator;
}

export interface CalendarMonthWeek {
  weekIndex: number;
  cells: CalendarMonthCell[];
}

export interface CalendarReadModel {
  startDate: string;
  endDate: string;
  timezone: string;
  items: CalendarItem[];
  journalIndicators: Record<string, JournalDateIndicator>;
}

/**
 * Validates and sanitizes calendar event title.
 * Enforces non-empty, trimmed string, max 255 characters, preserving Unicode and scripts.
 */
export function validateCalendarEventTitle(rawTitle: string): string {
  if (!rawTitle || typeof rawTitle !== 'string') {
    throw new Error('EVENT_TITLE_REQUIRED: Calendar event title must be a non-empty string');
  }
  const trimmed = rawTitle.trim();
  if (trimmed.length === 0) {
    throw new Error('EVENT_TITLE_REQUIRED: Calendar event title cannot be empty or whitespace');
  }
  if (trimmed.length > MAX_CALENDAR_EVENT_TITLE_LENGTH) {
    throw new Error(
      `EVENT_TITLE_TOO_LONG: Calendar event title cannot exceed ${MAX_CALENDAR_EVENT_TITLE_LENGTH} characters`
    );
  }
  return trimmed;
}

/**
 * Validates calendar event input intervals and semantics:
 * - All-day events require valid date-only strings (YYYY-MM-DD) and exclusive endDate strictly after startDate.
 * - Timed events require valid ISO datetimes and endAt strictly after startAt.
 * - Timezone must be a recognized IANA timezone identifier.
 */
export function validateCalendarEventInterval(input: CalendarEventInput): void {
  const tz = input.timezone || 'UTC';
  if (!isValidIanaTimezone(tz)) {
    throw new Error(`INVALID_TIMEZONE: '${tz}' is not a recognized IANA timezone`);
  }

  if (input.allDay) {
    if (!input.startDate || typeof input.startDate !== 'string') {
      throw new Error(
        'ALL_DAY_START_DATE_REQUIRED: All-day event requires a valid startDate (YYYY-MM-DD)'
      );
    }
    if (!isValidCalendarDateString(input.startDate)) {
      throw new Error(
        `INVALID_START_DATE: '${input.startDate}' is not a valid calendar date format (YYYY-MM-DD)`
      );
    }

    if (!input.endDate || typeof input.endDate !== 'string') {
      throw new Error(
        'ALL_DAY_END_DATE_REQUIRED: All-day event requires a valid exclusive endDate (YYYY-MM-DD)'
      );
    }
    if (!isValidCalendarDateString(input.endDate)) {
      throw new Error(
        `INVALID_END_DATE: '${input.endDate}' is not a valid calendar date format (YYYY-MM-DD)`
      );
    }

    if (input.endDate <= input.startDate) {
      throw new Error(
        `INVALID_INTERVAL: All-day exclusive endDate (${input.endDate}) must be strictly after startDate (${input.startDate})`
      );
    }
  } else {
    if (!input.startAt || typeof input.startAt !== 'string') {
      throw new Error(
        'TIMED_START_AT_REQUIRED: Timed event requires a valid startAt ISO timestamp'
      );
    }
    const startMs = new Date(input.startAt).getTime();
    if (isNaN(startMs)) {
      throw new Error(`INVALID_START_AT: '${input.startAt}' is not a valid ISO datetime`);
    }

    if (!input.endAt || typeof input.endAt !== 'string') {
      throw new Error('TIMED_END_AT_REQUIRED: Timed event requires a valid endAt ISO timestamp');
    }
    const endMs = new Date(input.endAt).getTime();
    if (isNaN(endMs)) {
      throw new Error(`INVALID_END_AT: '${input.endAt}' is not a valid ISO datetime`);
    }

    if (endMs <= startMs) {
      throw new Error(
        `INVALID_INTERVAL: Timed event endAt (${input.endAt}) must be strictly after startAt (${input.startAt})`
      );
    }
  }
}

/**
 * Computes all calendar dates (YYYY-MM-DD) covered by an all-day event
 * using its inclusive startDate and exclusive endDate.
 * Example: startDate '2026-10-14', endDate '2026-10-15' -> ['2026-10-14']
 * Example: startDate '2026-10-14', endDate '2026-10-16' -> ['2026-10-14', '2026-10-15']
 */
export function getDaysCoveredByAllDayEvent(startDate: string, endDate: string): string[] {
  if (!isValidCalendarDateString(startDate) || !isValidCalendarDateString(endDate)) {
    return [];
  }
  if (endDate <= startDate) {
    return [];
  }

  const days: string[] = [];
  let current = startDate;
  // Bounded safety limit to prevent runaway loops (maximum 366 days for a single event)
  let count = 0;
  while (current < endDate && count < 366) {
    days.push(current);
    current = addCalendarDays(current, 1);
    count++;
  }
  return days;
}

/**
 * Checks whether an event interval intersects with a given target calendar date in a viewing timezone.
 */
export function isEventActiveOnDate(
  event: Pick<CalendarEventEntity, 'allDay' | 'startDate' | 'endDate' | 'startAt' | 'endAt'>,
  dateStr: string,
  viewingTimezone = 'UTC'
): boolean {
  if (!isValidCalendarDateString(dateStr)) return false;

  if (event.allDay) {
    if (!event.startDate || !event.endDate) return false;
    return dateStr >= event.startDate && dateStr < event.endDate;
  }

  if (!event.startAt || !event.endAt) return false;
  const startMs = new Date(event.startAt).getTime();
  const endMs = new Date(event.endAt).getTime();
  if (isNaN(startMs) || isNaN(endMs) || endMs <= startMs) return false;

  const startCalDate = getCalendarDateInTimezone(new Date(startMs), viewingTimezone);
  const effectiveEndMs = Math.max(startMs, endMs - 1);
  const endCalDate = getCalendarDateInTimezone(new Date(effectiveEndMs), viewingTimezone);

  return dateStr >= startCalDate && dateStr <= endCalDate;
}

/**
 * Checks whether two time intervals overlap.
 */
export function isIntervalOverlapping(
  startA: number,
  endA: number,
  startB: number,
  endB: number
): boolean {
  return startA < endB && endA > startB;
}

/**
 * Determines whether a task deadline falls on a specific calendar date in the viewing timezone.
 */
export function isTaskDeadlineOnDate(
  deadline: TaskDeadline,
  targetDate: string,
  viewingTimezone = 'UTC'
): boolean {
  if (!deadline || deadline.type === 'none') return false;
  if (!isValidCalendarDateString(targetDate)) return false;

  if (deadline.type === 'date') {
    return deadline.date === targetDate;
  }

  if (deadline.type === 'timed') {
    const taskDate = new Date(deadline.timestamp);
    if (isNaN(taskDate.getTime())) return false;
    const taskCalDate = getCalendarDateInTimezone(taskDate, viewingTimezone);
    return taskCalDate === targetDate;
  }

  return false;
}

/**
 * Generates an accessible, complete month grid layout honoring user week-start preference.
 * Week starts can be:
 * - 1: Monday (ISO default)
 * - 7: Sunday (North American / traditional)
 * - 6: Saturday (Middle East / regional standard)
 */
export function buildMonthGrid(params: {
  year: number;
  month: number; // 1 to 12
  weekStart?: Weekday; // 1 = Monday, 6 = Saturday, 7 = Sunday
  todayDate: string; // YYYY-MM-DD
  items: CalendarItem[];
  journalIndicators?: Record<string, JournalDateIndicator>;
  viewingTimezone?: string;
}): CalendarMonthWeek[] {
  const {
    year,
    month,
    weekStart = 1,
    todayDate,
    items,
    journalIndicators = {},
    viewingTimezone = 'UTC',
  } = params;

  if (month < 1 || month > 12) {
    throw new RangeError(`INVALID_MONTH: Month must be between 1 and 12, received ${month}`);
  }

  // Days in current month
  const daysInCurrentMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  // Find weekday of first day of the month (1 = Mon, 7 = Sun)
  const firstDayUtc = new Date(Date.UTC(year, month - 1, 1));
  const rawFirstDay = firstDayUtc.getUTCDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
  const isoFirstDay = (((rawFirstDay + 6) % 7) + 1) as Weekday;

  // Calculate leading padding days from previous month
  const leadingDaysCount = (isoFirstDay - weekStart + 7) % 7;

  // Days in previous month
  const prevMonthDate = new Date(Date.UTC(year, month - 1, 0));
  const daysInPrevMonth = prevMonthDate.getUTCDate();
  const prevYear = prevMonthDate.getUTCFullYear();
  const prevMonth = prevMonthDate.getUTCMonth() + 1;

  const nextMonthDate = new Date(Date.UTC(year, month, 1));
  const nextYear = nextMonthDate.getUTCFullYear();
  const nextMonth = nextMonthDate.getUTCMonth() + 1;

  const cells: CalendarMonthCell[] = [];

  // 1. Previous month trailing days
  for (let i = leadingDaysCount - 1; i >= 0; i--) {
    const dayNum = daysInPrevMonth - i;
    const dateStr = `${prevYear}-${String(prevMonth).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
    cells.push({
      date: dateStr,
      dayNumber: dayNum,
      isCurrentMonth: false,
      isToday: dateStr === todayDate,
      items: getItemsForDate(items, dateStr, viewingTimezone),
      journalIndicator: journalIndicators[dateStr],
    });
  }

  // 2. Current month days
  for (let dayNum = 1; dayNum <= daysInCurrentMonth; dayNum++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
    cells.push({
      date: dateStr,
      dayNumber: dayNum,
      isCurrentMonth: true,
      isToday: dateStr === todayDate,
      items: getItemsForDate(items, dateStr, viewingTimezone),
      journalIndicator: journalIndicators[dateStr],
    });
  }

  // 3. Next month leading days to complete grid (multiples of 7, up to 35 or 42 cells)
  const totalCells = Math.ceil(cells.length / 7) * 7;
  const trailingDaysCount = totalCells - cells.length;
  for (let dayNum = 1; dayNum <= trailingDaysCount; dayNum++) {
    const dateStr = `${nextYear}-${String(nextMonth).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
    cells.push({
      date: dateStr,
      dayNumber: dayNum,
      isCurrentMonth: false,
      isToday: dateStr === todayDate,
      items: getItemsForDate(items, dateStr, viewingTimezone),
      journalIndicator: journalIndicators[dateStr],
    });
  }

  // Group into weeks
  const weeks: CalendarMonthWeek[] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push({
      weekIndex: i / 7,
      cells: cells.slice(i, i + 7),
    });
  }

  return weeks;
}

/**
 * Filters items that are active on a specific calendar date in the viewing timezone.
 */
export function getItemsForDate(
  items: CalendarItem[],
  dateStr: string,
  viewingTimezone = 'UTC'
): CalendarItem[] {
  return items.filter((item) => {
    if (item.sourceType === 'task_deadline') {
      return item.deadlineDate === dateStr;
    }
    if (item.sourceType === 'routine_occurrence') {
      return item.scheduledDate === dateStr;
    }
    if (item.sourceType === 'calendar_event') {
      return isEventActiveOnDate(item, dateStr, viewingTimezone);
    }
    return false;
  });
}

/**
 * Builds unified read model across upcoming tasks, routine occurrences, and personal events.
 * Crucially avoids storing or duplicating task records.
 */
export function buildCalendarReadModel(params: {
  startDate: string;
  endDate: string;
  timezone: string;
  tasks: Array<{
    id: string;
    workspaceId: string;
    folderId: string | null;
    title: string;
    priority: 'low' | 'normal' | 'high' | 'urgent';
    status: 'todo' | 'in_progress' | 'completed' | 'cancelled';
    deadline: TaskDeadline;
    tags?: string[];
  }>;
  routines: Array<{
    id: string;
    title: string;
    timezone: string;
  }>;
  routineOccurrences: Array<{
    id: string;
    routineId: string;
    workspaceId: string;
    scheduledDate: string;
    plannedInstant: string | null;
    timezone: string;
    status: 'pending' | 'done' | 'skipped' | 'cancelled';
  }>;
  events: CalendarEventEntity[];
  journalDates?: Array<{ date: string; count?: number }>;
  now?: Date;
}): CalendarReadModel {
  const {
    startDate,
    endDate,
    timezone,
    tasks,
    routines,
    routineOccurrences,
    events,
    journalDates = [],
    now = new Date(),
  } = params;

  const routineTitleMap = new Map<string, string>();
  for (const r of routines) {
    routineTitleMap.set(r.id, r.title);
  }

  const items: CalendarItem[] = [];

  // 1. Task Deadlines
  for (const task of tasks) {
    if (!task.deadline || task.deadline.type === 'none') continue;
    let deadlineDate = '';
    let deadlineTime: string | undefined;
    let deadlineZone: string | undefined;

    if (task.deadline.type === 'date') {
      deadlineDate = task.deadline.date;
    } else if (task.deadline.type === 'timed') {
      const d = new Date(task.deadline.timestamp);
      deadlineDate = getCalendarDateInTimezone(d, timezone);
      deadlineTime = task.deadline.timestamp;
      deadlineZone = task.deadline.timezone;
    }

    // Filter within range [startDate, endDate]
    if (deadlineDate >= startDate && deadlineDate <= endDate) {
      const isOverdue =
        task.status !== 'completed' &&
        task.status !== 'cancelled' &&
        (task.deadline.type === 'timed'
          ? now.getTime() > new Date(task.deadline.timestamp).getTime()
          : getCalendarDateInTimezone(now, timezone) > task.deadline.date);

      items.push({
        sourceType: 'task_deadline',
        id: `task-${task.id}`,
        taskId: task.id,
        workspaceId: task.workspaceId,
        folderId: task.folderId,
        title: task.title,
        priority: task.priority,
        status: task.status,
        deadlineType: task.deadline.type,
        deadlineDate,
        deadlineTime,
        deadlineZone,
        isOverdue,
        tags: task.tags ?? [],
      });
    }
  }

  // 2. Routine Occurrences
  for (const occ of routineOccurrences) {
    if (occ.scheduledDate >= startDate && occ.scheduledDate <= endDate) {
      items.push({
        sourceType: 'routine_occurrence',
        id: `routine-occ-${occ.id}`,
        routineId: occ.routineId,
        occurrenceId: occ.id,
        workspaceId: occ.workspaceId,
        routineTitle: routineTitleMap.get(occ.routineId) ?? 'Scheduled Routine',
        scheduledDate: occ.scheduledDate,
        plannedInstant: occ.plannedInstant,
        timezone: occ.timezone,
        status: occ.status,
      });
    }
  }

  // 3. Calendar Personal Events
  for (const evt of events) {
    if (evt.deletedAt) continue;

    if (evt.allDay) {
      if (!evt.startDate || !evt.endDate) continue;
      // Overlap check with [startDate, endDate]
      // Event spans [evt.startDate, evt.endDate) (exclusive end)
      // Requested range is [startDate, endDate] inclusive (or exclusive of next day)
      const requestedEndExclusive = addCalendarDays(endDate, 1);
      if (evt.startDate < requestedEndExclusive && evt.endDate > startDate) {
        items.push({
          sourceType: 'calendar_event',
          id: `event-${evt.id}`,
          eventId: evt.id,
          workspaceId: evt.workspaceId,
          folderId: evt.folderId,
          title: evt.title,
          details: evt.details,
          allDay: true,
          startDate: evt.startDate,
          endDate: evt.endDate,
          startAt: null,
          endAt: null,
          timezone: evt.timezone,
          revision: evt.revision,
        });
      }
    } else {
      if (!evt.startAt || !evt.endAt) continue;
      const startMs = new Date(evt.startAt).getTime();
      const endMs = new Date(evt.endAt).getTime();
      const startCal = getCalendarDateInTimezone(new Date(startMs), timezone);
      const effectiveEndMs = Math.max(startMs, endMs - 1);
      const endCal = getCalendarDateInTimezone(new Date(effectiveEndMs), timezone);

      if (startCal <= endDate && endCal >= startDate) {
        items.push({
          sourceType: 'calendar_event',
          id: `event-${evt.id}`,
          eventId: evt.id,
          workspaceId: evt.workspaceId,
          folderId: evt.folderId,
          title: evt.title,
          details: evt.details,
          allDay: false,
          startDate: startCal,
          endDate: addCalendarDays(endCal, 1),
          startAt: evt.startAt,
          endAt: evt.endAt,
          timezone: evt.timezone,
          revision: evt.revision,
        });
      }
    }
  }

  // 4. Journal Date Indicators (strictly count and presence, NO body/prompts)
  const journalIndicators: Record<string, JournalDateIndicator> = {};
  for (const j of journalDates) {
    if (j.date >= startDate && j.date <= endDate) {
      journalIndicators[j.date] = {
        date: j.date,
        hasEntry: true,
        count: j.count ?? 1,
      };
    }
  }

  return {
    startDate,
    endDate,
    timezone,
    items,
    journalIndicators,
  };
}
