import {
  getCalendarDateTimeParts,
  checkLocalTimeDisambiguation,
  addCalendarDays,
  isValidIanaTimezone,
} from './tasks.js';

export type ReminderTargetType = 'task' | 'routine' | 'calendar_event';
export type ReminderRecurrence = 'none' | 'daily' | 'weekly' | 'weekdays';
export type QuietHoursBehavior = 'defer' | 'allow' | 'drop';
export type ReminderPrivacyLevel = 'generic' | 'detailed';
export type ReminderChannel = 'in_app' | 'push' | 'local';
export type ReminderInstanceStatus =
  | 'scheduled'
  | 'snoozed'
  | 'processing'
  | 'dispatched'
  | 'invalidated'
  | 'dismissed'
  | 'observed';

export interface ReminderRule {
  id: string;
  workspaceId: string;
  targetType: ReminderTargetType;
  targetId: string;
  ruleRevision: number;
  offsetMinutes?: number | null;
  scheduleTime?: string | null;
  timezone: string;
  recurrence: ReminderRecurrence;
  quietHoursBehavior: QuietHoursBehavior;
  channels: ReminderChannel[];
  privacyLevel: ReminderPrivacyLevel;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface ReminderInstance {
  id: string;
  workspaceId: string;
  ruleId: string;
  ruleRevision: number;
  occurrenceKey: string;
  targetType: ReminderTargetType;
  targetId: string;
  scheduledAt: string;
  originalScheduledAt: string;
  status: ReminderInstanceStatus;
  snoozeUntil?: string | null;
  invalidatedReason?: string | null;
  invalidationTime?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReminderDelivery {
  id: string;
  workspaceId: string;
  instanceId: string;
  channel: ReminderChannel;
  recipientUserId: string;
  provider: 'in_app' | 'fcm' | 'web_push';
  providerMessageId?: string | null;
  status: 'pending' | 'accepted' | 'failed' | 'delivered' | 'opened' | 'dropped_quiet_hours';
  redactedTitle: string;
  redactedBody?: string | null;
  attemptCount: number;
  lastAttemptAt?: string | null;
  errorMessage?: string | null;
  openedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface QuietHoursConfig {
  enabled: boolean;
  start: string; // 'HH:mm'
  end: string; // 'HH:mm'
  timezone: string;
}

/**
 * Checks whether a given UTC instant falls within the user's quiet hours in their configured timezone.
 * Supports quiet hours spanning midnight (e.g. 22:00 to 08:00).
 */
export function isTimeInQuietHours(timeUtc: string | Date, config: QuietHoursConfig): boolean {
  if (!config.enabled) return false;
  if (!config.start || !config.end) return false;

  const dateObj = typeof timeUtc === 'string' ? new Date(timeUtc) : timeUtc;
  if (isNaN(dateObj.getTime())) return false;

  const tz = config.timezone && isValidIanaTimezone(config.timezone) ? config.timezone : 'UTC';
  const localParts = getCalendarDateTimeParts(dateObj, tz);
  const current = localParts.time; // 'HH:mm'

  if (config.start === config.end) {
    return false;
  }

  if (config.start < config.end) {
    // Single-day window (e.g. 01:00 to 05:00)
    return current >= config.start && current < config.end;
  } else {
    // Window crosses midnight (e.g. 22:00 to 08:00)
    return current >= config.start || current < config.end;
  }
}

/**
 * Calculates the next UTC instant when quiet hours end.
 * If currently in quiet hours (e.g. 22:00 to 08:00), returns the instant corresponding to 08:00 in the target timezone.
 */
export function calculateNextQuietHoursEnd(timeUtc: string | Date, config: QuietHoursConfig): string {
  const dateObj = typeof timeUtc === 'string' ? new Date(timeUtc) : timeUtc;
  const tz = config.timezone && isValidIanaTimezone(config.timezone) ? config.timezone : 'UTC';
  const localParts = getCalendarDateTimeParts(dateObj, tz);

  let targetDate = localParts.date;

  if (config.start > config.end) {
    // Crosses midnight
    if (localParts.time >= config.start) {
      // It is late evening, end of quiet hours is tomorrow morning
      targetDate = addCalendarDays(targetDate, 1);
    }
    // Else it is early morning before config.end, targetDate remains today
  } else {
    // Standard window: if past end, next end is tomorrow
    if (localParts.time >= config.end) {
      targetDate = addCalendarDays(targetDate, 1);
    }
  }

  const disambig = checkLocalTimeDisambiguation(targetDate, config.end, tz);
  if (disambig.type === 'exact') {
    return disambig.utcTimestamp;
  }
  if (disambig.type === 'nonexistent') {
    return disambig.suggestedUtcTimestamp || new Date(`${targetDate}T${config.end}:00.000Z`).toISOString();
  }
  return disambig.earlierUtcTimestamp;
}

export interface ReminderTargetTiming {
  id: string;
  dueTimestamp?: string | null;
  startDate?: string | null;
  isDone?: boolean;
  isDeleted?: boolean;
  routine?: {
    frequency: 'daily' | 'weekdays';
    weekdays: number[]; // 1 = Mon ... 7 = Sun (ISO)
    scheduledTime: string | null;
    activeFrom: string;
    activeTo: string | null;
    isPaused: boolean;
    isArchived: boolean;
  } | null;
}

/**
 * Validates a snooze duration and returns the updated schedule time and status.
 * Bounds snooze duration between 5 minutes and 1440 minutes (24 hours),
 * calculating relative to the user action / current instant.
 * If the resulting snooze time falls in quiet hours and quiet hours config is provided,
 * adjusts snoozeUntil to the end of quiet hours.
 */
export function calculateSnoozeTime(
  fromTime: string | Date = new Date(),
  snoozeMinutes: number = 15,
  quietHoursConfig?: QuietHoursConfig
): { snoozeUntil: string; status: 'snoozed' } {
  const boundedMinutes = Math.max(5, Math.min(1440, Math.round(snoozeMinutes)));
  const baseMs = typeof fromTime === 'string' ? new Date(fromTime).getTime() : fromTime.getTime();
  const snoozeMs = baseMs + boundedMinutes * 60 * 1000;
  let snoozeIso = new Date(snoozeMs).toISOString();

  if (quietHoursConfig && quietHoursConfig.enabled) {
    if (isTimeInQuietHours(snoozeIso, quietHoursConfig)) {
      snoozeIso = calculateNextQuietHoursEnd(snoozeIso, quietHoursConfig);
    }
  }

  return {
    snoozeUntil: snoozeIso,
    status: 'snoozed',
  };
}

/**
 * Materializes occurrences for a reminder rule within a rolling horizon window.
 * Returns occurrence keys and UTC schedule instants with strict idempotency keys.
 */
export function materializeReminderOccurrences(params: {
  rule: ReminderRule;
  target: ReminderTargetTiming;
  horizonDays?: number;
  now?: Date;
}): Array<{ occurrenceKey: string; scheduledAt: string; originalScheduledAt: string }> {
  const { rule, target, horizonDays = 14, now = new Date() } = params;

  // Immediate invalidation: done or deleted targets do not materialize pending reminders
  if (target.isDone || target.isDeleted || !rule.isActive || rule.deletedAt) {
    return [];
  }

  // Routine-specific pause/archive checks
  if (rule.targetType === 'routine' && target.routine) {
    if (target.routine.isPaused || target.routine.isArchived) {
      return [];
    }
  }

  const results: Array<{ occurrenceKey: string; scheduledAt: string; originalScheduledAt: string }> = [];

  // 1. One-time offset before due/start timestamp (for non-recurrent rules)
  if (rule.recurrence === 'none') {
    if (target.dueTimestamp) {
      const dueMs = new Date(target.dueTimestamp).getTime();
      if (!isNaN(dueMs)) {
        const offsetMs = (rule.offsetMinutes ?? 0) * 60 * 1000;
        const scheduledMs = dueMs - offsetMs;
        // Include if within reasonable horizon (not more than 1 day in the past)
        if (scheduledMs >= now.getTime() - 24 * 60 * 60 * 1000) {
          const iso = new Date(scheduledMs).toISOString();
          results.push({
            occurrenceKey: `${rule.id}_rev${rule.ruleRevision}_once_${iso}`,
            scheduledAt: iso,
            originalScheduledAt: iso,
          });
        }
      }
    } else if (target.startDate && rule.scheduleTime) {
      // Date-only target with fixed schedule time
      const disambig = checkLocalTimeDisambiguation(target.startDate, rule.scheduleTime, rule.timezone);
      const scheduledIso =
        disambig.type === 'exact'
          ? disambig.utcTimestamp
          : disambig.type === 'nonexistent'
            ? disambig.suggestedUtcTimestamp || new Date(`${target.startDate}T${rule.scheduleTime}:00.000Z`).toISOString()
            : disambig.earlierUtcTimestamp;

      results.push({
        occurrenceKey: `${rule.id}_rev${rule.ruleRevision}_date_${target.startDate}`,
        scheduledAt: scheduledIso,
        originalScheduledAt: scheduledIso,
      });
    }
    return results;
  }

  // 2. Routine-specific recurrent occurrences (canonical date matching)
  if (rule.targetType === 'routine' && target.routine) {
    const routine = target.routine;
    const tz = rule.timezone && isValidIanaTimezone(rule.timezone) ? rule.timezone : 'UTC';
    const timeStr = routine.scheduledTime || rule.scheduleTime || '09:00';
    const currentDateStr = getCalendarDateTimeParts(now, tz).date;

    for (let i = 0; i < horizonDays; i++) {
      const candidateDate = addCalendarDays(currentDateStr, i);

      // Check effective dates
      if (candidateDate < routine.activeFrom) continue;
      if (routine.activeTo && candidateDate > routine.activeTo) continue;

      // Check frequency and weekdays
      const dateUtc = new Date(`${candidateDate}T12:00:00.000Z`);
      const utcDay = dateUtc.getUTCDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
      const isoWeekday = ((utcDay + 6) % 7) + 1; // 1 = Mon, ..., 7 = Sun

      if (routine.frequency === 'weekdays' && (utcDay === 0 || utcDay === 6)) {
        continue;
      }
      if (routine.weekdays && routine.weekdays.length > 0 && !routine.weekdays.includes(isoWeekday)) {
        continue;
      }

      const disambig = checkLocalTimeDisambiguation(candidateDate, timeStr, tz);
      const scheduledIso =
        disambig.type === 'exact'
          ? disambig.utcTimestamp
          : disambig.type === 'nonexistent'
            ? disambig.suggestedUtcTimestamp || new Date(`${candidateDate}T${timeStr}:00.000Z`).toISOString()
            : disambig.earlierUtcTimestamp;

      const scheduledMs = new Date(scheduledIso).getTime();
      if (scheduledMs >= now.getTime() - 15 * 60 * 1000) {
        results.push({
          occurrenceKey: `${rule.id}_rev${rule.ruleRevision}_routine_${candidateDate}`,
          scheduledAt: scheduledIso,
          originalScheduledAt: scheduledIso,
        });
      }
    }
    return results;
  }

  // 3. Generic recurrent schedules (daily, weekdays, weekly)
  const tz = rule.timezone && isValidIanaTimezone(rule.timezone) ? rule.timezone : 'UTC';
  const timeStr = rule.scheduleTime || '09:00';
  let currentDateStr = getCalendarDateTimeParts(now, tz).date;

  for (let i = 0; i < horizonDays; i++) {
    const candidateDate = addCalendarDays(currentDateStr, i);
    const dayOfWeek = new Date(`${candidateDate}T12:00:00.000Z`).getUTCDay(); // 0 = Sun, 1 = Mon ... 6 = Sat

    if (rule.recurrence === 'weekdays' && (dayOfWeek === 0 || dayOfWeek === 6)) {
      continue;
    }

    if (rule.recurrence === 'weekly') {
      // Once per week matching target start day or day 1
      const ruleDay = target.startDate ? new Date(`${target.startDate}T12:00:00.000Z`).getUTCDay() : 1;
      if (dayOfWeek !== ruleDay) {
        continue;
      }
    }

    const disambig = checkLocalTimeDisambiguation(candidateDate, timeStr, tz);
    const scheduledIso =
      disambig.type === 'exact'
        ? disambig.utcTimestamp
        : disambig.type === 'nonexistent'
          ? disambig.suggestedUtcTimestamp || new Date(`${candidateDate}T${timeStr}:00.000Z`).toISOString()
          : disambig.earlierUtcTimestamp;

    const scheduledMs = new Date(scheduledIso).getTime();
    if (scheduledMs >= now.getTime() - 15 * 60 * 1000) {
      results.push({
        occurrenceKey: `${rule.id}_rev${rule.ruleRevision}_${candidateDate}`,
        scheduledAt: scheduledIso,
        originalScheduledAt: scheduledIso,
      });
    }
  }

  return results;
}

/**
 * Strips sensitive content from notification delivery payloads according to privacy level.
 * Generic mode never leaks note titles, journal texts, or private details into OS alert buffers.
 */
export function redactReminderPayload(params: {
  title: string;
  targetType: ReminderTargetType;
  privacyLevel: ReminderPrivacyLevel;
}): { title: string; body: string } {
  const { title, targetType, privacyLevel } = params;

  if (privacyLevel === 'generic') {
    return {
      title: 'Daynori Reminder',
      body: 'You have a scheduled item waiting in your workspace.',
    };
  }

  // Detailed mode: includes item title, but redacts body to avoid exposing sensitive text
  const typeLabel =
    targetType === 'task'
      ? 'Task'
      : targetType === 'routine'
        ? 'Routine'
        : 'Calendar Event';

  return {
    title: `${typeLabel}: ${title.slice(0, 80)}`,
    body: 'Scheduled item reminder.',
  };
}
