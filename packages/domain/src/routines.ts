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
export type RoutineOccurrenceStatus = 'pending' | 'done' | 'skipped' | 'cancelled';

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
 * Computes calendar difference in days between two YYYY-MM-DD date strings.
 */
export function getCalendarDateDifferenceDays(startDate: string, endDate: string): number {
  if (!isValidCalendarDateString(startDate) || !isValidCalendarDateString(endDate)) {
    throw new RangeError('startDate and endDate must be valid YYYY-MM-DD calendar date strings.');
  }
  const [y1Str, m1Str, d1Str] = startDate.split('-');
  const [y2Str, m2Str, d2Str] = endDate.split('-');
  const t1 = Date.UTC(parseInt(y1Str!, 10), parseInt(m1Str!, 10) - 1, parseInt(d1Str!, 10));
  const t2 = Date.UTC(parseInt(y2Str!, 10), parseInt(m2Str!, 10) - 1, parseInt(d2Str!, 10));
  return Math.round((t2 - t1) / (24 * 60 * 60 * 1000));
}

/**
 * Standard SHA-1 implementation for deterministic RFC 4122 UUID v5 generation.
 * Pure TypeScript, synchronous, and cross-platform (Web, Node, Mobile).
 */
function sha1(bytes: Uint8Array): Uint8Array {
  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;

  const msgLen = bytes.length;
  const bitLen = msgLen * 8;
  const padLen = (msgLen + 9 + 63) & ~63;
  const padded = new Uint8Array(padLen);
  padded.set(bytes);
  padded[msgLen] = 0x80;

  const view = new DataView(padded.buffer);
  view.setUint32(padLen - 4, bitLen & 0xffffffff);
  view.setUint32(padLen - 8, Math.floor(bitLen / 0x100000000));

  const w = new Uint32Array(80);

  for (let offset = 0; offset < padLen; offset += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = view.getUint32(offset + i * 4);
    }
    for (let i = 16; i < 80; i++) {
      const v = w[i - 3]! ^ w[i - 8]! ^ w[i - 14]! ^ w[i - 16]!;
      w[i] = (v << 1) | (v >>> 31);
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;

    for (let i = 0; i < 80; i++) {
      let f: number;
      let k: number;
      if (i < 20) {
        f = (b & c) | (~b & d);
        k = 0x5a827999;
      } else if (i < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (i < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }

      const temp = (((a << 5) | (a >>> 27)) + f + e + k + w[i]!) | 0;
      e = d;
      d = c;
      c = (b << 30) | (b >>> 2);
      b = a;
      a = temp;
    }

    h0 = (h0 + a) | 0;
    h1 = (h1 + b) | 0;
    h2 = (h2 + c) | 0;
    h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0;
  }

  const result = new Uint8Array(20);
  const outView = new DataView(result.buffer);
  outView.setUint32(0, h0);
  outView.setUint32(4, h1);
  outView.setUint32(8, h2);
  outView.setUint32(12, h3);
  outView.setUint32(16, h4);
  return result;
}

/**
 * Computes a deterministic, collision-resistant RFC 4122 v5 UUID for an occurrence
 * based on workspaceId, routineId, and scheduledDate.
 * Guaranteed to produce the exact identical UUID on any client or server.
 */
export function computeDeterministicOccurrenceId(
  workspaceId: string,
  routineId: string,
  scheduledDate: string
): string {
  const name = `daynori:routine_occurrence:${workspaceId}:${routineId}:${scheduledDate}`;
  const enc = new TextEncoder();
  const bytes = enc.encode(name);
  const hash = sha1(bytes);

  // Set RFC 4122 version 5 and variant 1
  hash[6] = (hash[6]! & 0x0f) | 0x50;
  hash[8] = (hash[8]! & 0x3f) | 0x80;

  const hex: string[] = [];
  for (let i = 0; i < 16; i++) {
    hex.push(hash[i]!.toString(16).padStart(2, '0'));
  }

  return [
    hex.slice(0, 4).join(''),
    hex.slice(4, 6).join(''),
    hex.slice(6, 8).join(''),
    hex.slice(8, 10).join(''),
    hex.slice(10, 16).join(''),
  ].join('-');
}

export interface RoutineScheduleRevisionRule {
  id?: string;
  workspaceId: string;
  routineId: string;
  scheduleRevision: number;
  frequency: RoutineFrequency;
  weekdays: Weekday[];
  timezone: string;
  scheduledTime: string | null;
  activeFrom: string;
  activeTo: string | null;
  effectiveDate: string;
  createdAt?: string;
}

/**
 * Selects the schedule rule applicable to a specific calendar date:
 * - Selects the latest revision with effectiveDate <= dateStr.
 * - If dateStr is before all revisions' effective dates, selects the earliest revision.
 */
export function selectApplicableScheduleRule(
  revisions: RoutineScheduleRevisionRule[],
  currentRule: RoutineTemplateRule,
  dateStr: string
): RoutineScheduleRevisionRule | RoutineTemplateRule {
  if (!revisions || revisions.length === 0) {
    return currentRule;
  }
  const sorted = [...revisions].sort((a, b) => {
    if (a.effectiveDate !== b.effectiveDate) {
      return a.effectiveDate.localeCompare(b.effectiveDate);
    }
    return a.scheduleRevision - b.scheduleRevision;
  });

  let applicable: RoutineScheduleRevisionRule | null = null;
  for (const rev of sorted) {
    if (rev.effectiveDate <= dateStr) {
      applicable = rev;
    } else {
      break;
    }
  }

  return applicable ?? sorted[0] ?? currentRule;
}

/**
 * Pure generator producing planned occurrences for a date range without duplicate dates.
 * Defaults to deterministic occurrence identity so multiple devices converge on the same ID.
 * Enforces bounded ranges to protect memory and execution time.
 */
export function generateOccurrencesForDateRange(
  routine: RoutineTemplateRule,
  startDate: string,
  endDate: string,
  existingOccurrences: RoutineOccurrence[] = [],
  idGenerator?: (date: string) => string
): RoutineOccurrence[] {
  if (!isValidCalendarDateString(startDate) || !isValidCalendarDateString(endDate)) {
    throw new RangeError('startDate and endDate must be valid YYYY-MM-DD calendar date strings.');
  }
  if (startDate > endDate) {
    throw new RangeError(`startDate "${startDate}" cannot be after endDate "${endDate}".`);
  }
  const diffDays = getCalendarDateDifferenceDays(startDate, endDate);
  if (diffDays > MAX_GENERATION_RANGE_DAYS) {
    throw new RangeError(
      `Occurrence generation range exceeds maximum of ${MAX_GENERATION_RANGE_DAYS} days (requested ${diffDays} days).`
    );
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

  while (currentDate <= endDate) {
    if (!existingByDate.has(currentDate) && isRoutineScheduledOnDate(routine, currentDate)) {
      const plannedInstant = calculatePlannedInstant(
        currentDate,
        routine.scheduledTime,
        routine.timezone
      );
      const nowIso = new Date().toISOString();
      const id = idGenerator
        ? idGenerator(currentDate)
        : computeDeterministicOccurrenceId(routine.workspaceId, routine.id, currentDate);

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

/**
 * Generator supporting historical schedule versions for backfill:
 * Selects the schedule rule applicable to each date rather than applying today's rule to historical dates.
 */
export function generateOccurrencesForDateRangeWithHistory(
  routine: RoutineTemplateRule,
  revisions: RoutineScheduleRevisionRule[],
  startDate: string,
  endDate: string,
  existingOccurrences: RoutineOccurrence[] = [],
  idGenerator?: (date: string) => string
): RoutineOccurrence[] {
  if (!isValidCalendarDateString(startDate) || !isValidCalendarDateString(endDate)) {
    throw new RangeError('startDate and endDate must be valid YYYY-MM-DD calendar date strings.');
  }
  if (startDate > endDate) {
    throw new RangeError(`startDate "${startDate}" cannot be after endDate "${endDate}".`);
  }
  const diffDays = getCalendarDateDifferenceDays(startDate, endDate);
  if (diffDays > MAX_GENERATION_RANGE_DAYS) {
    throw new RangeError(
      `Occurrence generation range exceeds maximum of ${MAX_GENERATION_RANGE_DAYS} days (requested ${diffDays} days).`
    );
  }

  const existingByDate = new Map<string, RoutineOccurrence>();
  for (const occ of existingOccurrences) {
    if (occ.routineId === routine.id) {
      existingByDate.set(occ.scheduledDate, occ);
    }
  }

  const generated: RoutineOccurrence[] = [];
  let currentDate = startDate;

  while (currentDate <= endDate) {
    if (!existingByDate.has(currentDate)) {
      const applicable = selectApplicableScheduleRule(revisions, routine, currentDate);
      const isScheduled = isRoutineScheduledOnDate(
        {
          frequency: applicable.frequency,
          weekdays: applicable.weekdays,
          activeFrom: applicable.activeFrom,
          activeTo: applicable.activeTo,
          isPaused: routine.isPaused,
          isArchived: routine.isArchived,
        },
        currentDate
      );

      if (isScheduled) {
        const plannedInstant = calculatePlannedInstant(
          currentDate,
          applicable.scheduledTime,
          applicable.timezone
        );
        const nowIso = new Date().toISOString();
        const id = idGenerator
          ? idGenerator(currentDate)
          : computeDeterministicOccurrenceId(routine.workspaceId, routine.id, currentDate);

        generated.push({
          id,
          workspaceId: routine.workspaceId,
          routineId: routine.id,
          scheduledDate: currentDate,
          scheduleRevision: applicable.scheduleRevision,
          plannedInstant,
          timezone: applicable.timezone,
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
    }

    currentDate = addCalendarDays(currentDate, 1);
  }

  return generated;
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

export interface ReconcileScheduleOccurrencesResult {
  retained: RoutineOccurrence[];
  modifiedOccurrences: RoutineOccurrence[];
  cancelledOccurrences: RoutineOccurrence[];
  cancelledOccurrenceIds: string[];
}

/**
 * Reconciles existing occurrences when a routine schedule is modified:
 * - Dates prior to effectiveDate: strictly retained and unchanged.
 * - Completed / skipped occurrences on or after effectiveDate: strictly retained and unchanged.
 * - Pending occurrences on or after effectiveDate:
 *     - If no longer scheduled under newRule -> marked cancelled, revision advanced, history retained.
 *     - If still scheduled -> updated with new scheduleRevision, timezone, plannedInstant, and advanced revision.
 */
export function reconcileOccurrencesOnScheduleChange(
  occurrences: RoutineOccurrence[],
  newRule: RoutineTemplateRule,
  effectiveDate: string
): ReconcileScheduleOccurrencesResult {
  const retained: RoutineOccurrence[] = [];
  const modifiedOccurrences: RoutineOccurrence[] = [];
  const cancelledOccurrences: RoutineOccurrence[] = [];
  const cancelledOccurrenceIds: string[] = [];
  const nowIso = new Date().toISOString();

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
      const isModified =
        occ.scheduleRevision !== newRule.scheduleRevision ||
        occ.timezone !== newRule.timezone ||
        occ.plannedInstant !== plannedInstant;

      const updatedOcc: RoutineOccurrence = {
        ...occ,
        scheduleRevision: newRule.scheduleRevision,
        timezone: newRule.timezone,
        plannedInstant,
        serverRevision: isModified ? occ.serverRevision + 1 : occ.serverRevision,
        revision: isModified ? occ.revision + 1 : occ.revision,
        updatedAt: nowIso,
      };

      retained.push(updatedOcc);
      if (isModified) {
        modifiedOccurrences.push(updatedOcc);
      }
    } else {
      cancelledOccurrenceIds.push(occ.id);
      const nextRev = occ.serverRevision + 1;
      const cancelledOcc: RoutineOccurrence = {
        ...occ,
        status: 'cancelled',
        serverRevision: nextRev,
        revision: nextRev,
        updatedAt: nowIso,
        history: [
          ...occ.history,
          {
            status: 'cancelled',
            toStatus: 'cancelled',
            previousStatus: occ.status,
            fromStatus: occ.status,
            changedAt: nowIso,
            transitionedAt: nowIso,
            actorId: null,
            reason: 'schedule_reconciliation',
          },
        ],
      };
      cancelledOccurrences.push(cancelledOcc);
    }
  }

  return { retained, modifiedOccurrences, cancelledOccurrences, cancelledOccurrenceIds };
}
