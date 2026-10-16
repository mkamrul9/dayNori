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
 * Produces a stable, comparable sort key for a task deadline.
 */
export function getTaskDeadlineSortKey(deadline: TaskDeadline, _userTimezone = 'UTC'): string {
  if (deadline.type === 'none') {
    return '9999-99-99T99:99:99.999Z';
  }
  if (deadline.type === 'date') {
    // Date-only deadlines sort at end of that day in the user's timezone
    return `${deadline.date}T23:59:59.999Z`;
  }
  return new Date(deadline.timestamp).toISOString();
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
