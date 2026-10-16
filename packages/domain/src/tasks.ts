export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent';
export type TaskStatus = 'todo' | 'in_progress' | 'completed' | 'cancelled';

export interface TaskDeadlineNone {
  type: 'none';
}

export interface TaskDeadlineDate {
  type: 'date';
  date: string;
}

export interface TaskDeadlineTimed {
  type: 'timed';
  timestamp: string;
  timezone: string;
}

export type TaskDeadline = TaskDeadlineNone | TaskDeadlineDate | TaskDeadlineTimed;

export interface TaskCompletionHistoryItem {
  completedAt: string;
  reopenedAt?: string;
}

export interface TaskEntity {
  id: string;
  workspaceId: string;
  folderId: string | null;
  title: string;
  details?: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  deadline: TaskDeadline;
  completedAt: string | null;
  reopenedAt: string | null;
  completionHistory: TaskCompletionHistoryItem[];
  parentId: string | null;
  subtaskOrder: number;
  tags: string[];
  rank: string;
  isArchived: boolean;
  isPinned: boolean;
  securityScope: 'standard' | 'vault';
  revision: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export const MAX_TASK_TITLE_LENGTH = 255;
export const MAX_TASK_DETAILS_LENGTH = 10000;
export const MAX_SUBTASK_DEPTH = 3;

export const PRIORITY_WEIGHTS: Record<TaskPriority, number> = {
  urgent: 4,
  high: 3,
  normal: 2,
  low: 1,
};

/**
 * Checks if a given year is a leap year in the Gregorian calendar.
 */
export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * Validates a calendar date string (YYYY-MM-DD), ensuring real calendar months,
 * exact day limits, and accurate February leap day boundaries.
 */
export function isValidCalendarDateString(dateStr: string): boolean {
  if (!dateStr || typeof dateStr !== 'string') return false;
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;

  const daysInMonth = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  return day <= daysInMonth[month - 1]!;
}

/**
 * Validates whether an IANA timezone identifier is valid and supported by the runtime.
 */
export function isValidIanaTimezone(tz: string): boolean {
  if (!tz || typeof tz !== 'string') return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Validates and sanitizes a task title.
 * Must be non-empty, trimmed, and at most 255 characters.
 * Supports Unicode, Bangla script, and emojis.
 */
export function validateTaskTitle(rawTitle: string): string {
  if (!rawTitle || typeof rawTitle !== 'string') {
    throw new Error('TASK_TITLE_REQUIRED: Task title must be a non-empty string');
  }
  const trimmed = rawTitle.trim();
  if (trimmed.length === 0) {
    throw new Error('TASK_TITLE_REQUIRED: Task title cannot be empty or whitespace');
  }
  if (trimmed.length > MAX_TASK_TITLE_LENGTH) {
    throw new Error(
      `TASK_TITLE_TOO_LONG: Task title cannot exceed ${MAX_TASK_TITLE_LENGTH} characters`
    );
  }
  return trimmed;
}

/**
 * Returns the calendar date (YYYY-MM-DD) for a given instant in an explicit IANA timezone.
 */
export function getCalendarDateInTimezone(instant: Date, timeZone: string): string {
  const safeZone = isValidIanaTimezone(timeZone) ? timeZone : 'UTC';
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: safeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(instant);
}

/**
 * Determines whether a task is overdue.
 *
 * Exact overdue invariant:
 * - Completed and cancelled tasks are NEVER overdue.
 * - Tasks without a deadline are NEVER overdue.
 * - Timed deadlines are overdue when the current instant is strictly after the due instant.
 * - Date-only deadlines expire at 23:59:59.999 of the specified calendar day in the user's timezone;
 *   therefore, a date-only task is overdue if and only if the current calendar date in the user's
 *   timezone is strictly greater than the deadline date.
 * - Clearing a deadline immediately removes the task from Overdue without marking it completed.
 */
export function isTaskOverdue(
  task: { status: TaskStatus; deadline: TaskDeadline },
  now: Date = new Date(),
  userTimezone = 'UTC'
): boolean {
  if (!isValidIanaTimezone(userTimezone)) {
    throw new Error(`INVALID_TIMEZONE: '${userTimezone}' is not a recognized IANA timezone`);
  }
  if (task.status === 'completed' || task.status === 'cancelled') {
    return false;
  }
  if (!task.deadline || task.deadline.type === 'none') {
    return false;
  }

  if (task.deadline.type === 'timed') {
    const dueTime = new Date(task.deadline.timestamp).getTime();
    return now.getTime() > dueTime;
  }

  if (task.deadline.type === 'date') {
    if (!isValidCalendarDateString(task.deadline.date)) {
      return false;
    }
    const today = getCalendarDateInTimezone(now, userTimezone);
    return today > task.deadline.date;
  }

  return false;
}

/**
 * Determines whether a task is due today in the user's timezone.
 */
export function isTaskDueToday(
  task: { deadline: TaskDeadline },
  now: Date = new Date(),
  userTimezone = 'UTC'
): boolean {
  if (!isValidIanaTimezone(userTimezone)) {
    throw new Error(`INVALID_TIMEZONE: '${userTimezone}' is not a recognized IANA timezone`);
  }
  if (!task.deadline || task.deadline.type === 'none') {
    return false;
  }
  const today = getCalendarDateInTimezone(now, userTimezone);

  if (task.deadline.type === 'date') {
    return task.deadline.date === today;
  }

  if (task.deadline.type === 'timed') {
    const dueDate = new Date(task.deadline.timestamp);
    const dueCalendarDate = getCalendarDateInTimezone(dueDate, userTimezone);
    return dueCalendarDate === today;
  }

  return false;
}

/**
 * Calculates the exact UTC ISO instant corresponding to 23:59:59.999 in a specific IANA timezone.
 */
export function getEndOfDayInstantInTimezone(dateStr: string, timezone: string): string {
  if (!isValidIanaTimezone(timezone)) {
    throw new Error(`INVALID_TIMEZONE: '${timezone}' is not a recognized IANA timezone`);
  }
  if (!isValidCalendarDateString(dateStr)) {
    throw new Error(`INVALID_CALENDAR_DATE: '${dateStr}' is not a valid calendar date`);
  }
  const [yearStr, monthStr, dayStr] = dateStr.split('-');
  const y = parseInt(yearStr!, 10);
  const m = parseInt(monthStr!, 10);
  const d = parseInt(dayStr!, 10);
  const targetUtc = Date.UTC(y, m - 1, d, 23, 59, 59, 999);

  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
  });

  function getLocalTimeForUtc(utcMs: number): number {
    const parts = dtf.formatToParts(new Date(utcMs));
    const p: Record<string, string> = {};
    for (const part of parts) {
      p[part.type] = part.value;
    }
    let hr = parseInt(p.hour || '0', 10);
    if (hr === 24) hr = 0;
    return Date.UTC(
      parseInt(p.year || '0', 10),
      parseInt(p.month || '1', 10) - 1,
      parseInt(p.day || '1', 10),
      hr,
      parseInt(p.minute || '0', 10),
      parseInt(p.second || '0', 10),
      999
    );
  }

  let utc = targetUtc;
  for (let i = 0; i < 3; i++) {
    const local = getLocalTimeForUtc(utc);
    const diff = local - targetUtc;
    if (diff === 0) break;
    utc -= diff;
  }
  return new Date(utc).toISOString();
}

/**
 * Produces a stable, comparable sort key for a task deadline in the user's viewing timezone.
 */
export function getTaskDeadlineSortKey(deadline: TaskDeadline, userTimezone = 'UTC'): string {
  if (!isValidIanaTimezone(userTimezone)) {
    throw new Error(`INVALID_TIMEZONE: '${userTimezone}' is not a recognized IANA timezone`);
  }
  if (deadline.type === 'none') {
    return '9999-99-99T99:99:99.999Z';
  }
  if (deadline.type === 'timed') {
    return new Date(deadline.timestamp).toISOString();
  }
  if (deadline.type === 'date') {
    return getEndOfDayInstantInTimezone(deadline.date, userTimezone);
  }
  return '9999-99-99T99:99:99.999Z';
}

/**
 * Canonical Upcoming task comparator:
 * 1. Tasks with deadlines before tasks without deadlines.
 * 2. Group by due date/instant ascending.
 * 3. Priority descending: urgent (4) > high (3) > normal (2) > low (1).
 * 4. Stable creation order: createdAt ascending.
 * 5. Deterministic tie-breaker: id ascending.
 */
export function compareTasksUpcoming(
  a: {
    id: string;
    priority: TaskPriority;
    deadline: TaskDeadline;
    createdAt: string;
  },
  b: {
    id: string;
    priority: TaskPriority;
    deadline: TaskDeadline;
    createdAt: string;
  },
  userTimezone = 'UTC'
): number {
  if (!isValidIanaTimezone(userTimezone)) {
    throw new Error(`INVALID_TIMEZONE: '${userTimezone}' is not a recognized IANA timezone`);
  }
  const aHasDeadline = a.deadline && a.deadline.type !== 'none';
  const bHasDeadline = b.deadline && b.deadline.type !== 'none';

  if (aHasDeadline && !bHasDeadline) return -1;
  if (!aHasDeadline && bHasDeadline) return 1;

  if (aHasDeadline && bHasDeadline) {
    const aKey = getTaskDeadlineSortKey(a.deadline, userTimezone);
    const bKey = getTaskDeadlineSortKey(b.deadline, userTimezone);
    if (aKey !== bKey) {
      return aKey.localeCompare(bKey);
    }
  }

  // Priority tie-breaker: urgent > high > normal > low
  const aWeight = PRIORITY_WEIGHTS[a.priority] ?? 2;
  const bWeight = PRIORITY_WEIGHTS[b.priority] ?? 2;
  if (aWeight !== bWeight) {
    return bWeight - aWeight;
  }

  // Creation order: oldest first
  if (a.createdAt !== b.createdAt) {
    return a.createdAt.localeCompare(b.createdAt);
  }

  // Deterministic tie-breaker: id
  return a.id.localeCompare(b.id);
}

/**
 * Handles task completion idempotency:
 * If the task is already completed, the original completedAt and completionHistory are preserved.
 * Duplicate completion retries do NOT append duplicate history or overwrite completedAt.
 */
export function completeTask(
  currentTask: TaskEntity,
  completionInstant?: string
): {
  task: TaskEntity;
  changed: boolean;
} {
  if (currentTask.status === 'completed') {
    return { task: currentTask, changed: false };
  }

  const completedAt = completionInstant || new Date().toISOString();
  const historyItem: TaskCompletionHistoryItem = {
    completedAt,
  };

  return {
    task: {
      ...currentTask,
      status: 'completed',
      completedAt,
      reopenedAt: null,
      completionHistory: [...(currentTask.completionHistory || []), historyItem],
      updatedAt: completedAt,
    },
    changed: true,
  };
}

/**
 * Handles task reopening:
 * Sets status back to 'todo', clears completedAt, records reopenedAt,
 * and updates completionHistory.
 */
export function reopenTask(
  currentTask: TaskEntity,
  reopeningInstant?: string
): {
  task: TaskEntity;
  changed: boolean;
} {
  if (currentTask.status !== 'completed' && currentTask.status !== 'cancelled') {
    return { task: currentTask, changed: false };
  }

  const reopenedAt = reopeningInstant || new Date().toISOString();
  const history = [...(currentTask.completionHistory || [])];

  if (history.length > 0) {
    const last = history[history.length - 1]!;
    if (!last.reopenedAt) {
      history[history.length - 1] = {
        ...last,
        reopenedAt,
      };
    } else {
      history.push({
        completedAt: currentTask.completedAt || reopenedAt,
        reopenedAt,
      });
    }
  } else {
    history.push({
      completedAt: currentTask.completedAt || reopenedAt,
      reopenedAt,
    });
  }

  return {
    task: {
      ...currentTask,
      status: 'todo',
      completedAt: null,
      reopenedAt,
      completionHistory: history,
      updatedAt: reopenedAt,
    },
    changed: true,
  };
}

/**
 * Detects cycles and calculates nesting depth for subtasks.
 *
 * Invariants:
 * - Task cannot be its own parent.
 * - Parent chain cannot contain cycles.
 * - Maximum subtask depth is bounded (MAX_SUBTASK_DEPTH = 3).
 */
export function validateSubtaskHierarchy(
  taskId: string,
  newParentId: string | null | undefined,
  lookupParent: (id: string) => string | null | undefined
): { isValid: boolean; depth: number; error?: string } {
  if (!newParentId) {
    return { isValid: true, depth: 1 };
  }

  if (newParentId === taskId) {
    return {
      isValid: false,
      depth: 1,
      error: 'TASK_SELF_PARENTING: A task cannot be its own parent',
    };
  }

  let currentParentId: string | null | undefined = newParentId;
  let depth = 2; // taskId is child of newParentId, so at least depth 2
  const visited = new Set<string>([taskId]);

  while (currentParentId) {
    if (visited.has(currentParentId)) {
      return {
        isValid: false,
        depth,
        error: 'TASK_SUBTASK_CYCLE: A cyclic subtask relationship was detected',
      };
    }
    visited.add(currentParentId);

    const ancestorParentId = lookupParent(currentParentId);
    if (ancestorParentId) {
      if (visited.has(ancestorParentId)) {
        return {
          isValid: false,
          depth,
          error: 'TASK_SUBTASK_CYCLE: A cyclic subtask relationship was detected',
        };
      }
      depth++;
      if (depth > MAX_SUBTASK_DEPTH) {
        return {
          isValid: false,
          depth,
          error: `TASK_MAX_SUBTASK_DEPTH_EXCEEDED: Subtask depth cannot exceed ${MAX_SUBTASK_DEPTH}`,
        };
      }
    }
    currentParentId = ancestorParentId;
  }

  return { isValid: true, depth };
}

/**
 * Reconciles task vs todo aliases:
 * Maps legacy 'todo' items to canonical 'task' items without data loss.
 */
export function reconcileTaskKind(kind: string): 'task' {
  if (kind === 'todo' || kind === 'task') {
    return 'task';
  }
  throw new Error(`INVALID_ITEM_KIND: Expected task or todo, received ${kind}`);
}

export interface TaskDeadlineExplanation {
  label: string;
  isOverdue: boolean;
  overdueText?: string;
  timezoneNote?: string;
}

/**
 * Explains and formats a task deadline with explicit text and dates,
 * fulfilling accessibility and timezone disclosure requirements.
 */
export function formatTaskDeadlineExplanation(
  deadline: TaskDeadline,
  userTimezone = 'UTC',
  referenceDate = new Date()
): TaskDeadlineExplanation {
  if (!isValidIanaTimezone(userTimezone)) {
    throw new Error(`INVALID_TIMEZONE: '${userTimezone}' is not a recognized IANA timezone`);
  }

  if (deadline.type === 'none') {
    return {
      label: 'No deadline',
      isOverdue: false,
    };
  }

  const todayStr = getCalendarDateInTimezone(referenceDate, userTimezone);

  if (deadline.type === 'date') {
    if (!isValidCalendarDateString(deadline.date)) {
      return {
        label: `Invalid date: ${deadline.date}`,
        isOverdue: false,
      };
    }

    const [dYear, dMonth, dDay] = deadline.date.split('-').map(Number);
    const [tYear, tMonth, tDay] = todayStr.split('-').map(Number);
    const dUtc = Date.UTC(dYear!, dMonth! - 1, dDay!);
    const tUtc = Date.UTC(tYear!, tMonth! - 1, tDay!);
    const diffDays = Math.round((dUtc - tUtc) / (24 * 60 * 60 * 1000));

    if (diffDays < 0) {
      const daysOverdue = Math.abs(diffDays);
      const text =
        daysOverdue === 1
          ? `Overdue by 1 day (Due ${deadline.date})`
          : `Overdue by ${daysOverdue} days (Due ${deadline.date})`;
      return {
        label: `Due ${deadline.date}`,
        isOverdue: true,
        overdueText: text,
      };
    } else if (diffDays === 0) {
      return {
        label: `Due Today (${deadline.date})`,
        isOverdue: false,
      };
    } else if (diffDays === 1) {
      return {
        label: `Due Tomorrow (${deadline.date})`,
        isOverdue: false,
      };
    } else {
      return {
        label: `Due in ${diffDays} days (${deadline.date})`,
        isOverdue: false,
      };
    }
  }

  if (deadline.type === 'timed') {
    const dueTime = new Date(deadline.timestamp);
    if (isNaN(dueTime.getTime())) {
      return {
        label: 'Invalid timestamp',
        isOverdue: false,
      };
    }

    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: userTimezone,
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
    const formatted = formatter.format(dueTime);
    const isOverdue = dueTime.getTime() < referenceDate.getTime();

    let timezoneNote: string | undefined;
    if (deadline.timezone && deadline.timezone !== userTimezone) {
      timezoneNote = `Scheduled in ${deadline.timezone} (viewing in ${userTimezone})`;
    }

    if (isOverdue) {
      const overdueHours = Math.round(
        (referenceDate.getTime() - dueTime.getTime()) / (60 * 60 * 1000)
      );
      const overdueText =
        overdueHours >= 24
          ? `Overdue by ${Math.floor(overdueHours / 24)}d (${formatted})`
          : `Overdue (${formatted})`;
      return {
        label: `Due ${formatted}`,
        isOverdue: true,
        overdueText,
        timezoneNote,
      };
    }

    return {
      label: `Due ${formatted}`,
      isOverdue: false,
      timezoneNote,
    };
  }

  return {
    label: 'No deadline',
    isOverdue: false,
  };
}

export type LocalTimeDisambiguation =
  | { type: 'exact'; utcTimestamp: string }
  | { type: 'nonexistent'; explanation: string; suggestedUtcTimestamp?: string }
  | {
      type: 'ambiguous';
      explanation: string;
      earlierUtcTimestamp: string;
      laterUtcTimestamp: string;
    };

/**
 * Adds an integer number of calendar days to a YYYY-MM-DD date string using pure Gregorian calendar rules.
 */
export function addCalendarDays(dateStr: string, days: number): string {
  if (!isValidCalendarDateString(dateStr)) {
    throw new Error(`INVALID_CALENDAR_DATE: '${dateStr}' is not a valid calendar date`);
  }
  const [yearStr, monthStr, dayStr] = dateStr.split('-');
  const y = parseInt(yearStr!, 10);
  const m = parseInt(monthStr!, 10);
  const d = parseInt(dayStr!, 10);
  const dt = new Date(Date.UTC(y, m - 1, d + days, 12, 0, 0, 0));
  const resYear = dt.getUTCFullYear();
  const resMonth = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const resDay = String(dt.getUTCDate()).padStart(2, '0');
  return `${resYear}-${resMonth}-${resDay}`;
}

/**
 * Derives both the calendar date (YYYY-MM-DD) and 24h clock time (HH:mm) from the exact same instant
 * and IANA timezone, ensuring zero date-shift or desynchronization when reopening tasks.
 */
export function getCalendarDateTimeParts(
  instant: Date,
  timeZone: string
): { date: string; time: string } {
  const safeZone = isValidIanaTimezone(timeZone) ? timeZone : 'UTC';
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone: safeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = dtf.formatToParts(instant);
  const p: Record<string, string> = {};
  for (const part of parts) {
    p[part.type] = part.value;
  }
  let hr = p.hour || '00';
  if (hr === '24') hr = '00';
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    time: `${hr}:${p.minute || '00'}`,
  };
}

/**
 * Checks a calendar date and local time string for nonexistent or ambiguous local times
 * caused by daylight saving transitions in the specified timezone.
 *
 * Scans candidate window derived from timezone offset to accurately cover UTC+14,
 * negative offsets, half/quarter hour zones, and DST transition gaps/folds.
 */
export function checkLocalTimeDisambiguation(
  dateStr: string,
  timeStr: string,
  timezone: string
): LocalTimeDisambiguation {
  if (!isValidIanaTimezone(timezone)) {
    throw new Error(`INVALID_TIMEZONE: '${timezone}' is not a recognized IANA timezone`);
  }
  if (!isValidCalendarDateString(dateStr)) {
    throw new Error(`INVALID_CALENDAR_DATE: '${dateStr}' is not a valid calendar date`);
  }

  if (!timeStr || typeof timeStr !== 'string') {
    throw new Error('INVALID_TIME_STRING: Time must be a valid non-empty string in HH:mm format');
  }

  const timeMatch = timeStr.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!timeMatch) {
    throw new Error(`INVALID_TIME_STRING: '${timeStr}' is not a valid time string. Expected HH:mm`);
  }

  const targetHour = parseInt(timeMatch[1]!, 10);
  const targetMin = parseInt(timeMatch[2]!, 10);

  if (targetHour < 0 || targetHour > 23 || targetMin < 0 || targetMin > 59) {
    throw new Error(
      `INVALID_TIME_STRING: Time values out of bounds (hour: ${targetHour}, minute: ${targetMin}). Hours must be 0-23, minutes 0-59.`
    );
  }

  const [yearStr, monthStr, dayStr] = dateStr.split('-');
  const y = parseInt(yearStr!, 10);
  const m = parseInt(monthStr!, 10);
  const d = parseInt(dayStr!, 10);

  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  });

  function getLocalParts(ms: number) {
    const parts = dtf.formatToParts(new Date(ms));
    const p: Record<string, string> = {};
    for (const part of parts) {
      p[part.type] = part.value;
    }
    let hr = parseInt(p.hour || '0', 10);
    if (hr === 24) hr = 0;
    return {
      year: parseInt(p.year || '0', 10),
      month: parseInt(p.month || '0', 10),
      day: parseInt(p.day || '0', 10),
      hour: hr,
      minute: parseInt(p.minute || '0', 10),
    };
  }

  // Derive candidate UTC instant based on probe local-to-UTC offset
  const probeUtc = Date.UTC(y, m - 1, d, targetHour, targetMin, 0, 0);
  const probeLocal = getLocalParts(probeUtc);
  const probeLocalAsUtc = Date.UTC(
    probeLocal.year,
    probeLocal.month - 1,
    probeLocal.day,
    probeLocal.hour,
    probeLocal.minute,
    0,
    0
  );
  const offsetMs = probeLocalAsUtc - probeUtc;
  const candidateUtc = probeUtc - offsetMs;

  // Scan +/- 4 hours around candidate instant at 1-minute steps
  const matches: number[] = [];
  const startScanUtc = candidateUtc - 4 * 60 * 60 * 1000;
  const endScanUtc = candidateUtc + 4 * 60 * 60 * 1000;

  for (let t = startScanUtc; t <= endScanUtc; t += 60 * 1000) {
    const lp = getLocalParts(t);
    if (
      lp.year === y &&
      lp.month === m &&
      lp.day === d &&
      lp.hour === targetHour &&
      lp.minute === targetMin
    ) {
      // Check if this match is distinct from the previous match (e.g., at least 15 min apart for folds)
      if (matches.length === 0 || t - matches[matches.length - 1]! >= 15 * 60 * 1000) {
        matches.push(t);
      }
    }
  }

  if (matches.length === 0) {
    return {
      type: 'nonexistent',
      explanation: `The time ${timeStr} does not exist on ${dateStr} in ${timezone} due to a daylight saving time transition.`,
      suggestedUtcTimestamp: new Date(candidateUtc).toISOString(),
    };
  }

  if (matches.length === 1) {
    return {
      type: 'exact',
      utcTimestamp: new Date(matches[0]!).toISOString(),
    };
  }

  return {
    type: 'ambiguous',
    explanation: `The time ${timeStr} occurs twice on ${dateStr} in ${timezone} due to a daylight saving time transition.`,
    earlierUtcTimestamp: new Date(matches[0]!).toISOString(),
    laterUtcTimestamp: new Date(matches[matches.length - 1]!).toISOString(),
  };
}
