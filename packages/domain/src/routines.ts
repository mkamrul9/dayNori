import {
  isValidCalendarDateString,
  isValidIanaTimezone,
  addCalendarDays,
  checkLocalTimeDisambiguation,
} from './tasks.js';

export const MAX_ROUTINE_TITLE_LENGTH = 255;
export const MAX_GENERATION_RANGE_DAYS = 90;

export type RoutineFrequency = 'daily' | 'weekdays';
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type RoutineOccurrenceStatus = 'pending' | 'done' | 'skipped';

export interface RoutineOccurrenceTransition {
  status?: RoutineOccurrenceStatus;
  toStatus?: RoutineOccurrenceStatus;
  previousStatus?: RoutineOccurrenceStatus;
  fromStatus?: RoutineOccurrenceStatus;
  changedAt?: string;
  transitionedAt?: string;
  actorId?: string | null;
  reason?: string | null;
}

export interface RoutineOccurrence {
  id: string;
  workspaceId: string;
  routineId: string;
  scheduledDate: string;
  scheduleRevision: number;
  plannedInstant: string | null;
  timezone: string;
  status: RoutineOccurrenceStatus;
  completedAt: string | null;
  completedBy: string | null;
  history: RoutineOccurrenceTransition[];
  serverRevision: number;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export interface RoutineTemplateRule {
  id: string;
  workspaceId: string;
  folderId: string | null;
  title: string;
  details: string | null;
  frequency: RoutineFrequency;
  weekdays: Weekday[];
  timezone: string;
  scheduledTime: string | null;
  activeFrom: string;
  activeTo: string | null;
  isPaused: boolean;
  isArchived: boolean;
  scheduleRevision: number;
  effectiveDate: string;
}

/**
 * Validates and trims routine title.
 * Enforces non-empty, max 255 chars, preserving Unicode and scripts.
 */
export function validateRoutineTitle(title: string): string {
  if (typeof title !== 'string') {
    throw new TypeError('Routine title must be a string.');
  }
  const trimmed = title.trim();
  if (trimmed.length === 0) {
    throw new RangeError('Routine title cannot be empty.');
  }
  if (trimmed.length > MAX_ROUTINE_TITLE_LENGTH) {
    throw new RangeError(
      `Routine title cannot exceed ${MAX_ROUTINE_TITLE_LENGTH} characters (received ${trimmed.length}).`
    );
  }
  return trimmed;
}

/**
 * Returns ISO weekday number for a calendar date (YYYY-MM-DD):
 * 1 = Monday, 2 = Tuesday, ..., 7 = Sunday (ISO 8601 standard).
 */
export function getIsoWeekday(dateStr: string): Weekday {
  if (!isValidCalendarDateString(dateStr)) {
    throw new RangeError(`Invalid calendar date string: "${dateStr}". Expected YYYY-MM-DD.`);
  }
  const [yStr, mStr, dStr] = dateStr.split('-');
  const y = parseInt(yStr!, 10);
  const m = parseInt(mStr!, 10);
  const d = parseInt(dStr!, 10);
  const dateUtc = new Date(Date.UTC(y, m - 1, d));
  const utcDay = dateUtc.getUTCDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  const isoDay = ((utcDay + 6) % 7) + 1; // 1 = Monday, ..., 7 = Sunday
  return isoDay as Weekday;
}

/**
 * Validates and sorts selected weekdays without duplicates.
 */
export function validateWeekdays(weekdays: number[]): Weekday[] {
  if (!Array.isArray(weekdays)) {
    throw new TypeError('Weekdays must be an array.');
  }
  if (weekdays.length === 0) {
    throw new RangeError('Weekdays array cannot be empty.');
  }
  const unique = Array.from(new Set(weekdays));
  for (const w of unique) {
    if (!Number.isInteger(w) || w < 1 || w > 7) {
      throw new RangeError(`Invalid weekday number: ${w}. Must be an integer from 1 to 7.`);
    }
  }
  return unique.sort((a, b) => a - b) as Weekday[];
}

/**
 * Computes the planned UTC instant for a local scheduled date and time in an explicit timezone.
 */
export function calculatePlannedInstant(
  dateStr: string,
  timeStr: string | null,
  timeZone: string
): string | null {
  if (!timeStr) return null;
  if (!isValidCalendarDateString(dateStr)) {
    throw new RangeError(`Invalid date string: ${dateStr}`);
  }
  if (!isValidIanaTimezone(timeZone)) {
    throw new RangeError(`Invalid timezone: ${timeZone}`);
  }

  const disambig = checkLocalTimeDisambiguation(dateStr, timeStr, timeZone);
  if (disambig.type === 'exact') {
    return disambig.utcTimestamp;
  }
  if (disambig.type === 'ambiguous') {
    // For automatic routine generation, default to earlier UTC timestamp during DST fold
    return disambig.earlierUtcTimestamp;
  }
  // If time falls in nonexistent DST spring-forward gap, resolve to suggested timestamp if available
  return disambig.suggestedUtcTimestamp || null;
}

/**
 * Determines whether a routine is scheduled to occur on a specific calendar date.
 */
export function isRoutineScheduledOnDate(
  routine: Pick<
    RoutineTemplateRule,
    'frequency' | 'weekdays' | 'activeFrom' | 'activeTo' | 'isPaused' | 'isArchived'
  >,
  dateStr: string
): boolean {
  if (!isValidCalendarDateString(dateStr)) {
    throw new RangeError(`Invalid date string: ${dateStr}`);
  }

  // Archived or paused routines do not generate occurrences
  if (routine.isArchived || routine.isPaused) {
    return false;
  }

  // Active period bounds
  if (dateStr < routine.activeFrom) {
    return false;
  }
  if (routine.activeTo !== null && dateStr > routine.activeTo) {
    return false;
  }

  // Frequency check
  if (routine.frequency === 'daily') {
    return true;
  }

  if (routine.frequency === 'weekdays') {
    const dayOfWeek = getIsoWeekday(dateStr);
    return routine.weekdays.includes(dayOfWeek);
  }

  return false;
}

/**
 * Pure generator producing planned occurrences for a date range without duplicate dates.
 * Enforces bounded ranges to protect memory and execution time.
 */
export function generateOccurrencesForDateRange(
  routine: RoutineTemplateRule,
  startDate: string,
  endDate: string,
  existingOccurrences: RoutineOccurrence[] = [],
  idGenerator?: () => string
): RoutineOccurrence[] {
  if (!isValidCalendarDateString(startDate) || !isValidCalendarDateString(endDate)) {
    throw new RangeError('startDate and endDate must be valid YYYY-MM-DD calendar date strings.');
  }
  if (startDate > endDate) {
    throw new RangeError(`startDate "${startDate}" cannot be after endDate "${endDate}".`);
  }

  // Existing occurrences mapped by scheduled date
  const existingByDate = new Map<string, RoutineOccurrence>();
  for (const occ of existingOccurrences) {
    if (occ.routineId === routine.id) {
      existingByDate.set(occ.scheduledDate, occ);
    }
  }

  const generated: RoutineOccurrence[] = [];
  let currentDate = startDate;
  let dayCount = 0;

  while (currentDate <= endDate) {
    dayCount++;
    if (dayCount > MAX_GENERATION_RANGE_DAYS) {
      throw new RangeError(
        `Occurrence generation range exceeds maximum of ${MAX_GENERATION_RANGE_DAYS} days.`
      );
    }

    if (!existingByDate.has(currentDate) && isRoutineScheduledOnDate(routine, currentDate)) {
      const plannedInstant = calculatePlannedInstant(
        currentDate,
        routine.scheduledTime,
        routine.timezone
      );
      const nowIso = new Date().toISOString();
      const id = idGenerator ? idGenerator() : defaultId();

      generated.push({
        id,
        workspaceId: routine.workspaceId,
        routineId: routine.id,
        scheduledDate: currentDate,
        scheduleRevision: routine.scheduleRevision,
        plannedInstant,
        timezone: routine.timezone,
        status: 'pending',
        completedAt: null,
        completedBy: null,
        history: [],
        serverRevision: 1,
        revision: 1,
        createdAt: nowIso,
        updatedAt: nowIso,
      });
    }

    currentDate = addCalendarDays(currentDate, 1);
  }

  return generated;
}

function defaultId(): string {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function parseActorAndTimestamp(
  arg2?: string | null,
  arg3?: string | null
): { timestamp: string; actorOrReason: string | null } {
  let timestamp = new Date().toISOString();
  let actorOrReason: string | null = null;

  if (typeof arg2 === 'string') {
    if (arg2.includes('T') || /^\d{4}-\d{2}-\d{2}/.test(arg2)) {
      timestamp = arg2;
      actorOrReason = arg3 || null;
    } else {
      actorOrReason = arg2;
      if (typeof arg3 === 'string') {
        timestamp = arg3;
      }
    }
  }

  return { timestamp, actorOrReason };
}

/**
 * Transitions occurrence to 'done' state idempotently.
 * Preserves transition history and does not mutate other dates.
 */
export function completeOccurrence(
  occurrence: RoutineOccurrence,
  arg2?: string | null,
  arg3?: string | null
): RoutineOccurrence {
  if (occurrence.status === 'done') {
    return occurrence;
  }
  const { timestamp, actorOrReason } = parseActorAndTimestamp(arg2, arg3);
  const actorId = actorOrReason ?? occurrence.completedBy ?? null;

  return {
    ...occurrence,
    status: 'done',
    completedAt: timestamp,
    completedBy: actorId,
    updatedAt: timestamp,
    history: [
      ...occurrence.history,
      {
        status: 'done',
        toStatus: 'done',
        previousStatus: occurrence.status,
        fromStatus: occurrence.status,
        changedAt: timestamp,
        transitionedAt: timestamp,
        actorId,
        reason: null,
      },
    ],
  };
}

/**
 * Transitions occurrence to 'skipped' state idempotently.
 * Preserves transition history and does not mutate other dates.
 */
export function skipOccurrence(
  occurrence: RoutineOccurrence,
  arg2?: string | null,
  arg3?: string | null
): RoutineOccurrence {
  if (occurrence.status === 'skipped') {
    return occurrence;
  }
  const { timestamp, actorOrReason } = parseActorAndTimestamp(arg2, arg3);
  const reason = actorOrReason ?? null;

  return {
    ...occurrence,
    status: 'skipped',
    completedAt: null,
    completedBy: null,
    updatedAt: timestamp,
    history: [
      ...occurrence.history,
      {
        status: 'skipped',
        toStatus: 'skipped',
        previousStatus: occurrence.status,
        fromStatus: occurrence.status,
        changedAt: timestamp,
        transitionedAt: timestamp,
        actorId: null,
        reason,
      },
    ],
  };
}

/**
 * Reopens occurrence back to 'pending' state idempotently.
 * Preserves transition history and clears completedAt.
 */
export function reopenOccurrence(
  occurrence: RoutineOccurrence,
  arg2?: string | null,
  arg3?: string | null
): RoutineOccurrence {
  if (occurrence.status === 'pending') {
    return occurrence;
  }
  const { timestamp, actorOrReason } = parseActorAndTimestamp(arg2, arg3);
  const actorId = actorOrReason ?? null;

  return {
    ...occurrence,
    status: 'pending',
    completedAt: null,
    completedBy: null,
    updatedAt: timestamp,
    history: [
      ...occurrence.history,
      {
        status: 'pending',
        toStatus: 'pending',
        previousStatus: occurrence.status,
        fromStatus: occurrence.status,
        changedAt: timestamp,
        transitionedAt: timestamp,
        actorId,
        reason: null,
      },
    ],
  };
}

/**
 * Reconciles existing occurrences when a routine schedule is modified:
 * - Dates prior to effectiveDate: strictly retained and unchanged.
 * - Completed / skipped occurrences on or after effectiveDate: strictly retained and unchanged.
 * - Pending occurrences on or after effectiveDate:
 *     - If no longer scheduled under newRule -> cancelled (omitted).
 *     - If still scheduled -> updated with new scheduleRevision, timezone, and plannedInstant.
 */
export function reconcileOccurrencesOnScheduleChange(
  occurrences: RoutineOccurrence[],
  newRule: RoutineTemplateRule,
  effectiveDate: string
): {
  retained: RoutineOccurrence[];
  cancelledOccurrenceIds: string[];
} {
  const retained: RoutineOccurrence[] = [];
  const cancelledOccurrenceIds: string[] = [];

  for (const occ of occurrences) {
    if (occ.routineId !== newRule.id) {
      retained.push(occ);
      continue;
    }

    // Historical occurrences before effectiveDate are strictly immutable
    if (occ.scheduledDate < effectiveDate) {
      retained.push(occ);
      continue;
    }

    // Already completed or skipped occurrences on/after effectiveDate are retained intact
    if (occ.status !== 'pending') {
      retained.push(occ);
      continue;
    }

    // For future pending occurrences: check if date is still scheduled under new schedule
    if (isRoutineScheduledOnDate(newRule, occ.scheduledDate)) {
      const plannedInstant = calculatePlannedInstant(
        occ.scheduledDate,
        newRule.scheduledTime,
        newRule.timezone
      );
      retained.push({
        ...occ,
        scheduleRevision: newRule.scheduleRevision,
        timezone: newRule.timezone,
        plannedInstant,
        updatedAt: new Date().toISOString(),
      });
    } else {
      cancelledOccurrenceIds.push(occ.id);
    }
  }

  return { retained, cancelledOccurrenceIds };
}
