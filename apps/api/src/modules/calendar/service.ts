import type { PoolClient } from 'pg';
import crypto from 'node:crypto';
import type {
  CalendarEvent,
  CreateCalendarEventRequest,
  UpdateCalendarEventRequest,
  CalendarFeedQuery,
  CalendarReadModelResponse,
  TaskDeadline,
} from '@daynori/contracts';
import {
  validateCalendarEventTitle,
  validateCalendarEventInterval,
  buildCalendarReadModel,
  type CalendarEventEntity,
} from '@daynori/domain';
import {
  lockWorkspaceSyncState,
  insertChange,
  insertOutboxIntent,
  updateWorkspaceSyncSeq,
} from '../sync/repository.js';
import { NotFoundError, ConflictError, ValidationError } from '../../plugins/errorHandler.js';
import { invalidateTargetReminders } from '../reminders/service.js';

interface CalendarEventDbRow {
  id: string;
  workspace_id: string;
  folder_id: string | null;
  kind: string;
  created_by: string;
  updated_by: string;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
  revision: string | number;
  rank: string;
  is_archived: boolean;
  is_pinned: boolean;
  security_scope: 'standard' | 'vault';
  title: string;
  details: string | null;
  all_day: boolean;
  start_date: string | null;
  end_date: string | null;
  start_at: Date | null;
  end_at: Date | null;
  timezone: string;
}

export function formatCalendarDate(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  if (typeof d === 'string') return d.slice(0, 10);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function mapRowToCalendarEvent(r: CalendarEventDbRow): CalendarEvent {
  const startDateStr = formatCalendarDate(r.start_date);
  const endDateStr = formatCalendarDate(r.end_date);

  return {
    id: r.id,
    workspaceId: r.workspace_id,
    folderId: r.folder_id,
    title: r.title,
    details: r.details,
    allDay: r.all_day,
    startDate: startDateStr,
    endDate: endDateStr,
    startAt: r.start_at ? new Date(r.start_at).toISOString() : null,
    endAt: r.end_at ? new Date(r.end_at).toISOString() : null,
    timezone: r.timezone || 'UTC',
    isArchived: r.is_archived ?? false,
    securityScope: r.security_scope ?? 'standard',
    revision: Number(r.revision),
    createdAt: new Date(r.created_at).toISOString(),
    updatedAt: new Date(r.updated_at).toISOString(),
    deletedAt: r.deleted_at ? new Date(r.deleted_at).toISOString() : null,
  };
}

/**
 * Asserts that the workspace exists and is personal.
 * Calendar events are strictly personal-isolated domain objects.
 */
export async function assertPersonalWorkspace(client: PoolClient, workspaceId: string): Promise<void> {
  const wsRes = await client.query<{ kind: string }>(
    `SELECT kind FROM app.workspaces WHERE id = $1;`,
    [workspaceId]
  );
  if (wsRes.rows.length === 0) {
    throw new NotFoundError(`Workspace with ID ${workspaceId} was not found.`);
  }
  if (wsRes.rows[0]!.kind !== 'personal') {
    throw new ValidationError('Personal calendar events are strictly isolated to personal workspaces.');
  }
}

/**
 * Validates folder reference integrity: must exist, belong to same workspace, be kind='folder', and not deleted.
 */
async function validateFolderReference(
  client: PoolClient,
  workspaceId: string,
  folderId: string | null | undefined
): Promise<string | null> {
  if (!folderId) return null;
  const fRes = await client.query<{ id: string; security_scope: string }>(
    `SELECT id, security_scope FROM app.items
     WHERE workspace_id = $1 AND id = $2 AND kind = 'folder' AND deleted_at IS NULL;`,
    [workspaceId, folderId]
  );
  if (fRes.rows.length === 0) {
    throw new ValidationError(`Target folder ${folderId} does not exist, has been deleted, or is not a folder.`);
  }
  if (fRes.rows[0]!.security_scope !== 'standard') {
    throw new ValidationError('Calendar events only support standard security scope.');
  }
  return folderId;
}

/**
 * Creates a personal standalone calendar event.
 * Atomic persistence in app.items and app.calendar_events with change feed and outbox intent.
 */
export async function createCalendarEvent(
  client: PoolClient,
  workspaceId: string,
  actorUserId: string,
  input: CreateCalendarEventRequest,
  operationId?: string
): Promise<CalendarEvent> {
  await assertPersonalWorkspace(client, workspaceId);

  // 1. Validation
  let title = '';
  try {
    title = validateCalendarEventTitle(input.title);
    validateCalendarEventInterval({
      title,
      allDay: input.allDay,
      startDate: input.startDate,
      endDate: input.endDate,
      startAt: input.startAt,
      endAt: input.endAt,
      timezone: input.timezone,
    });
  } catch (err: unknown) {
    throw new ValidationError(err instanceof Error ? err.message : String(err));
  }

  const eventId = input.id || crypto.randomUUID();
  const folderId = await validateFolderReference(client, workspaceId, input.folderId);
  const timezone = input.timezone || 'UTC';
  const details = input.details?.trim() || null;

  // 2. Acquire sync state lock
  const syncState = await lockWorkspaceSyncState(client, workspaceId);

  // 3. Insert into app.items
  await client.query(
    `INSERT INTO app.items (
      id, workspace_id, folder_id, kind, created_by, updated_by, rank, is_pinned, security_scope, revision
    ) VALUES ($1, $2, $3, 'calendar_event', $4, $4, '0', false, 'standard', 1);`,
    [eventId, workspaceId, folderId, actorUserId]
  );

  // 4. Insert into app.calendar_events
  const eventRes = await client.query<CalendarEventDbRow>(
    `INSERT INTO app.calendar_events (
      id, workspace_id, folder_id, title, details, all_day, start_date, end_date, start_at, end_at, timezone
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    RETURNING id, workspace_id, folder_id, title, details, all_day, start_date, end_date, start_at, end_at, timezone, created_at, updated_at;`,
    [
      eventId,
      workspaceId,
      folderId,
      title,
      details,
      input.allDay,
      input.allDay ? input.startDate : null,
      input.allDay ? input.endDate : null,
      input.allDay ? null : input.startAt,
      input.allDay ? null : input.endAt,
      timezone,
    ]
  );

  const eventRow = eventRes.rows[0]!;
  const seq = syncState.nextChangeSeq;

  // 5. Record change feed & outbox intent
  await insertChange(client, {
    workspaceId,
    seq,
    entityType: 'item',
    entityId: eventId,
    revision: 1,
    isTombstone: false,
    operationId: operationId || crypto.randomUUID(),
    changeData: {
      kind: 'calendar_event',
      title,
      details,
      allDay: input.allDay,
      startDate: input.allDay ? input.startDate : null,
      endDate: input.allDay ? input.endDate : null,
      startAt: input.allDay ? null : input.startAt,
      endAt: input.allDay ? null : input.endAt,
      timezone,
      folderId,
      isArchived: false,
      securityScope: 'standard',
    },
  });

  await insertOutboxIntent(client, {
    workspaceId,
    eventType: 'calendar_event.created',
    payload: { eventId, revision: 1, seq },
  });

  await updateWorkspaceSyncSeq(client, workspaceId, seq + 1);

  return {
    id: eventId,
    workspaceId,
    folderId,
    title,
    details,
    allDay: input.allDay,
    startDate: input.allDay ? (input.startDate ?? null) : null,
    endDate: input.allDay ? (input.endDate ?? null) : null,
    startAt: input.allDay ? null : (input.startAt ?? null),
    endAt: input.allDay ? null : (input.endAt ?? null),
    timezone,
    isArchived: false,
    securityScope: 'standard',
    revision: 1,
    createdAt: new Date(eventRow.created_at).toISOString(),
    updatedAt: new Date(eventRow.updated_at).toISOString(),
    deletedAt: null,
  };
}

/**
 * Retrieves a calendar event by ID.
 */
export async function getCalendarEvent(
  client: PoolClient,
  workspaceId: string,
  eventId: string
): Promise<CalendarEvent> {
  await assertPersonalWorkspace(client, workspaceId);

  const res = await client.query<CalendarEventDbRow>(
    `SELECT
      i.id, i.workspace_id, i.folder_id, i.kind, i.created_by, i.updated_by,
      i.created_at, i.updated_at, i.deleted_at, i.revision, i.rank,
      i.is_archived, i.is_pinned, i.security_scope,
      e.title, e.details, e.all_day, e.start_date::text as start_date, e.end_date::text as end_date, e.start_at, e.end_at, e.timezone
    FROM app.items i
    JOIN app.calendar_events e ON i.id = e.id AND i.workspace_id = e.workspace_id
    WHERE i.id = $1 AND i.workspace_id = $2 AND i.deleted_at IS NULL`,
    [eventId, workspaceId]
  );

  if (res.rowCount === 0) {
    throw new NotFoundError(`Calendar event ${eventId} not found`);
  }

  return mapRowToCalendarEvent(res.rows[0]!);
}

/**
 * Updates a personal calendar event with strict optimistic concurrency protection.
 * Reads authoritative state and checks revisions after acquiring workspace sync lock.
 */
export async function updateCalendarEvent(
  client: PoolClient,
  workspaceId: string,
  eventId: string,
  actorUserId: string,
  input: UpdateCalendarEventRequest,
  operationId?: string
): Promise<CalendarEvent> {
  await assertPersonalWorkspace(client, workspaceId);

  // 1. Acquire workspace sync lock first to prevent concurrent check races
  const syncState = await lockWorkspaceSyncState(client, workspaceId);

  // 2. Fetch existing event under lock
  const currentRes = await client.query<CalendarEventDbRow>(
    `SELECT
      i.id, i.workspace_id, i.folder_id, i.kind, i.created_by, i.updated_by,
      i.created_at, i.updated_at, i.deleted_at, i.revision, i.rank,
      i.is_archived, i.is_pinned, i.security_scope,
      e.title, e.details, e.all_day, e.start_date::text as start_date, e.end_date::text as end_date, e.start_at, e.end_at, e.timezone
    FROM app.items i
    JOIN app.calendar_events e ON i.id = e.id AND i.workspace_id = e.workspace_id
    WHERE i.id = $1 AND i.workspace_id = $2`,
    [eventId, workspaceId]
  );

  if (currentRes.rowCount === 0) {
    throw new NotFoundError(`Calendar event ${eventId} not found`);
  }

  const currentRow = currentRes.rows[0]!;
  if (currentRow.deleted_at) {
    throw new NotFoundError(`Calendar event ${eventId} is in trash`);
  }

  const current = mapRowToCalendarEvent(currentRow);
  const currentRev = current.revision;

  // 3. Optimistic concurrency check under lock
  if (input.expectedRevision !== undefined && currentRev !== input.expectedRevision) {
    throw new ConflictError(
      `Conflict updating calendar event ${eventId}: expected revision ${input.expectedRevision}, but current is ${currentRev}`
    );
  }

  const title = input.title !== undefined ? validateCalendarEventTitle(input.title) : current.title;
  const allDay = input.allDay !== undefined ? input.allDay : current.allDay;
  const startDate = input.startDate !== undefined ? input.startDate : current.startDate;
  const endDate = input.endDate !== undefined ? input.endDate : current.endDate;
  const startAt = input.startAt !== undefined ? input.startAt : current.startAt;
  const endAt = input.endAt !== undefined ? input.endAt : current.endAt;
  const timezone = input.timezone !== undefined ? input.timezone : current.timezone;
  const details = input.details !== undefined ? input.details?.trim() || null : current.details;
  const isArchived = input.isArchived !== undefined ? input.isArchived : current.isArchived;

  // Validate folder if updated
  let folderId = current.folderId;
  if (input.folderId !== undefined) {
    folderId = await validateFolderReference(client, workspaceId, input.folderId);
  }

  try {
    validateCalendarEventInterval({
      title,
      allDay,
      startDate: allDay ? startDate : null,
      endDate: allDay ? endDate : null,
      startAt: allDay ? null : startAt,
      endAt: allDay ? null : endAt,
      timezone,
    });
  } catch (err: unknown) {
    throw new ValidationError(err instanceof Error ? err.message : String(err));
  }

  const nextRevision = currentRev + 1;

  // 4. Update app.items
  await client.query(
    `UPDATE app.items
     SET folder_id = $1, updated_by = $2, updated_at = now(), revision = $3, is_archived = $4
     WHERE id = $5 AND workspace_id = $6`,
    [folderId, actorUserId, nextRevision, isArchived, eventId, workspaceId]
  );

  // 5. Update app.calendar_events
  const eventRes = await client.query<CalendarEventDbRow>(
    `UPDATE app.calendar_events
     SET folder_id = $1, title = $2, details = $3, all_day = $4,
         start_date = $5, end_date = $6, start_at = $7, end_at = $8,
         timezone = $9, is_archived = $10, updated_at = now()
     WHERE id = $11 AND workspace_id = $12
     RETURNING *`,
    [
      folderId,
      title,
      details,
      allDay,
      allDay ? startDate : null,
      allDay ? endDate : null,
      allDay ? null : startAt,
      allDay ? null : endAt,
      timezone,
      isArchived,
      eventId,
      workspaceId,
    ]
  );

  const eventRow = eventRes.rows[0]!;

  if (isArchived) {
    await invalidateTargetReminders(client, workspaceId, 'calendar_event', eventId, 'event_archived');
  } else if (
    input.startDate !== undefined ||
    input.endDate !== undefined ||
    input.startAt !== undefined ||
    input.endAt !== undefined ||
    input.timezone !== undefined
  ) {
    await invalidateTargetReminders(client, workspaceId, 'calendar_event', eventId, 'event_rescheduled');
  }

  const seq = syncState.nextChangeSeq;

  await insertChange(client, {
    workspaceId,
    seq,
    entityType: 'item',
    entityId: eventId,
    revision: nextRevision,
    isTombstone: false,
    operationId: operationId || crypto.randomUUID(),
    changeData: {
      kind: 'calendar_event',
      title,
      details,
      allDay,
      startDate: allDay ? startDate : null,
      endDate: allDay ? endDate : null,
      startAt: allDay ? null : startAt,
      endAt: allDay ? null : endAt,
      timezone,
      folderId,
      isArchived,
      securityScope: current.securityScope,
    },
  });

  await insertOutboxIntent(client, {
    workspaceId,
    eventType: 'calendar_event.updated',
    payload: { eventId, revision: nextRevision, seq },
  });

  await updateWorkspaceSyncSeq(client, workspaceId, seq + 1);

  return {
    id: eventId,
    workspaceId,
    folderId,
    title,
    details,
    allDay,
    startDate: allDay ? startDate : null,
    endDate: allDay ? endDate : null,
    startAt: allDay ? null : startAt,
    endAt: allDay ? null : endAt,
    timezone,
    isArchived,
    securityScope: current.securityScope,
    revision: nextRevision,
    createdAt: current.createdAt,
    updatedAt: new Date(eventRow.updated_at).toISOString(),
    deletedAt: null,
  };
}

/**
 * Trashes a personal calendar event (soft deletion with sync tombstone).
 * Reads authoritative state under workspace lock to guarantee ordering.
 */
export async function trashCalendarEvent(
  client: PoolClient,
  workspaceId: string,
  eventId: string,
  actorUserId: string,
  expectedRevision?: number,
  operationId?: string
): Promise<{ success: boolean; eventId: string; revision: number; seq: number }> {
  await assertPersonalWorkspace(client, workspaceId);

  const syncState = await lockWorkspaceSyncState(client, workspaceId);

  const currentRes = await client.query<{ revision: number; deleted_at: Date | null }>(
    `SELECT revision, deleted_at FROM app.items WHERE id = $1 AND workspace_id = $2;`,
    [eventId, workspaceId]
  );

  if (currentRes.rowCount === 0) {
    throw new NotFoundError(`Calendar event ${eventId} not found`);
  }

  const current = currentRes.rows[0]!;
  const currentRev = Number(current.revision);
  if (current.deleted_at) {
    return { success: true, eventId, revision: currentRev, seq: 0 };
  }

  if (expectedRevision !== undefined && expectedRevision !== currentRev) {
    throw new ConflictError(
      `Conflict trashing calendar event ${eventId}: expected revision ${expectedRevision}, current is ${currentRev}`
    );
  }

  const nextRevision = currentRev + 1;
  const seq = syncState.nextChangeSeq;

  await client.query(
    `UPDATE app.items
     SET deleted_at = now(), updated_by = $1, updated_at = now(), revision = $2
     WHERE id = $3 AND workspace_id = $4`,
    [actorUserId, nextRevision, eventId, workspaceId]
  );

  await invalidateTargetReminders(client, workspaceId, 'calendar_event', eventId, 'event_deleted');

  await insertChange(client, {
    workspaceId,
    seq,
    entityType: 'item',
    entityId: eventId,
    revision: nextRevision,
    isTombstone: true,
    operationId: operationId || crypto.randomUUID(),
    changeData: {
      kind: 'calendar_event',
      deletedAt: new Date().toISOString(),
    },
  });

  await insertOutboxIntent(client, {
    workspaceId,
    eventType: 'calendar_event.deleted',
    payload: { eventId, revision: nextRevision, seq },
  });

  await updateWorkspaceSyncSeq(client, workspaceId, seq + 1);

  return { success: true, eventId, revision: nextRevision, seq };
}

/**
 * Restores a personal calendar event from trash.
 */
export async function restoreCalendarEvent(
  client: PoolClient,
  workspaceId: string,
  eventId: string,
  actorUserId: string,
  expectedRevision?: number,
  operationId?: string
): Promise<{ success: boolean; eventId: string; revision: number; seq: number }> {
  await assertPersonalWorkspace(client, workspaceId);

  const syncState = await lockWorkspaceSyncState(client, workspaceId);

  const currentRes = await client.query<{ revision: number; deleted_at: Date | null }>(
    `SELECT revision, deleted_at FROM app.items WHERE id = $1 AND workspace_id = $2;`,
    [eventId, workspaceId]
  );

  if (currentRes.rowCount === 0) {
    throw new NotFoundError(`Calendar event ${eventId} not found`);
  }

  const current = currentRes.rows[0]!;
  const currentRev = Number(current.revision);
  if (!current.deleted_at) {
    return { success: true, eventId, revision: currentRev, seq: 0 };
  }

  if (expectedRevision !== undefined && expectedRevision !== currentRev) {
    throw new ConflictError(
      `Conflict restoring calendar event ${eventId}: expected revision ${expectedRevision}, current is ${currentRev}`
    );
  }

  const nextRevision = currentRev + 1;
  const seq = syncState.nextChangeSeq;

  await client.query(
    `UPDATE app.items
     SET deleted_at = NULL, updated_by = $1, updated_at = now(), revision = $2
     WHERE id = $3 AND workspace_id = $4`,
    [actorUserId, nextRevision, eventId, workspaceId]
  );

  await insertChange(client, {
    workspaceId,
    seq,
    entityType: 'item',
    entityId: eventId,
    revision: nextRevision,
    isTombstone: false,
    operationId: operationId || crypto.randomUUID(),
    changeData: {
      kind: 'calendar_event',
      restoredAt: new Date().toISOString(),
    },
  });

  await insertOutboxIntent(client, {
    workspaceId,
    eventType: 'calendar_event.restored',
    payload: { eventId, revision: nextRevision, seq },
  });

  await updateWorkspaceSyncSeq(client, workspaceId, seq + 1);

  return { success: true, eventId, revision: nextRevision, seq };
}

/**
 * Backward compatibility delete alias mapping to trashCalendarEvent.
 */
export async function deleteCalendarEvent(
  client: PoolClient,
  workspaceId: string,
  eventId: string,
  actorUserId: string,
  operationId?: string
): Promise<{ success: boolean; eventId: string }> {
  const res = await trashCalendarEvent(client, workspaceId, eventId, actorUserId, undefined, operationId);
  return { success: res.success, eventId: res.eventId };
}

/**
 * Builds the aggregated calendar feed combining task deadlines, routine occurrences,
 * personal events, and journal date indicators without duplicating task records.
 * Pushes date-range and non-deleted filters into database queries with bounded loading limits.
 */
export async function getCalendarFeed(
  client: PoolClient,
  workspaceId: string,
  query: CalendarFeedQuery,
  now = new Date()
): Promise<CalendarReadModelResponse['data']> {
  await assertPersonalWorkspace(client, workspaceId);

  const {
    startDate,
    endDate,
    timezone = 'UTC',
    includeTasks = true,
    includeRoutines = true,
    includeEvents = true,
    includeJournalIndicators = true,
  } = query;

  // Approximate range boundaries for timestamp filtering
  const rangeStartInstant = `${startDate}T00:00:00.000Z`;
  const rangeEndInstant = `${endDate}T23:59:59.999Z`;

  // 1. Fetch tasks with deadlines if requested (bounded to active and matching range)
  const tasksList: Array<{
    id: string;
    workspaceId: string;
    folderId: string | null;
    title: string;
    priority: 'low' | 'normal' | 'high' | 'urgent';
    status: 'todo' | 'in_progress' | 'completed' | 'cancelled';
    deadline: TaskDeadline;
    tags?: string[];
  }> = [];

  if (includeTasks) {
    const taskRows = await client.query<{
      id: string;
      workspace_id: string;
      folder_id: string | null;
      title: string;
      priority: 'low' | 'normal' | 'high' | 'urgent';
      status: 'todo' | 'in_progress' | 'completed' | 'cancelled';
      deadline_type: 'none' | 'date' | 'timed';
      deadline_date: string | null;
      deadline_time: Date | null;
      deadline_zone: string | null;
      tags: string[];
    }>(
      `SELECT
        t.id, t.workspace_id, i.folder_id as folder_id, t.title, t.priority, t.status,
        t.deadline_type, t.deadline_date::text as deadline_date, t.deadline_time, t.deadline_zone, t.tags
      FROM app.tasks t
      JOIN app.items i ON t.id = i.id AND t.workspace_id = i.workspace_id
      WHERE t.workspace_id = $1
        AND i.deleted_at IS NULL
        AND i.is_archived = false
        AND t.deadline_type != 'none'
        AND (
          (t.deadline_type = 'date' AND t.deadline_date >= $2 AND t.deadline_date <= $3)
          OR
          (t.deadline_type = 'timed' AND t.deadline_time >= $4::timestamptz AND t.deadline_time <= $5::timestamptz)
        )
      LIMIT 500;`,
      [workspaceId, startDate, endDate, rangeStartInstant, rangeEndInstant]
    );

    for (const r of taskRows.rows) {
      let deadline: TaskDeadline = { type: 'none' };
      if (r.deadline_type === 'date' && r.deadline_date) {
        const dStr = formatCalendarDate(r.deadline_date) || String(r.deadline_date).slice(0, 10);
        deadline = { type: 'date', date: dStr };
      } else if (r.deadline_type === 'timed' && r.deadline_time && r.deadline_zone) {
        deadline = {
          type: 'timed',
          timestamp: new Date(r.deadline_time).toISOString(),
          timezone: r.deadline_zone,
        };
      }

      tasksList.push({
        id: r.id,
        workspaceId: r.workspace_id,
        folderId: r.folder_id,
        title: r.title,
        priority: r.priority,
        status: r.status,
        deadline,
        tags: r.tags || [],
      });
    }
  }

  // 2. Fetch routines and occurrences if requested
  const routinesList: Array<{ id: string; title: string; timezone: string }> = [];
  const occurrencesList: Array<{
    id: string;
    routineId: string;
    workspaceId: string;
    scheduledDate: string;
    plannedInstant: string | null;
    timezone: string;
    status: 'pending' | 'done' | 'skipped' | 'cancelled';
  }> = [];

  if (includeRoutines) {
    const routineRows = await client.query<{ id: string; title: string; timezone: string }>(
      `SELECT r.id, r.title, r.timezone
       FROM app.routines r
       JOIN app.items i ON r.id = i.id AND r.workspace_id = i.workspace_id
       WHERE r.workspace_id = $1 AND i.deleted_at IS NULL AND i.is_archived = false`,
      [workspaceId]
    );
    for (const r of routineRows.rows) {
      routinesList.push({ id: r.id, title: r.title, timezone: r.timezone });
    }

    const occRows = await client.query<{
      id: string;
      routine_id: string;
      workspace_id: string;
      scheduled_date: string;
      planned_instant: Date | null;
      timezone: string;
      status: 'pending' | 'done' | 'skipped' | 'cancelled';
    }>(
      `SELECT id, routine_id, workspace_id, scheduled_date::text as scheduled_date, planned_instant, timezone, status
       FROM app.routine_occurrences
       WHERE workspace_id = $1 AND scheduled_date >= $2 AND scheduled_date <= $3
       LIMIT 500;`,
      [workspaceId, startDate, endDate]
    );

    for (const occ of occRows.rows) {
      const dateStr =
        formatCalendarDate(occ.scheduled_date) || String(occ.scheduled_date).slice(0, 10);

      occurrencesList.push({
        id: occ.id,
        routineId: occ.routine_id,
        workspaceId: occ.workspace_id,
        scheduledDate: dateStr,
        plannedInstant: occ.planned_instant ? new Date(occ.planned_instant).toISOString() : null,
        timezone: occ.timezone,
        status: occ.status,
      });
    }
  }

  // 3. Fetch personal calendar events with date-range query pushdown
  const eventsList: CalendarEventEntity[] = [];
  if (includeEvents) {
    const eventRows = await client.query<CalendarEventDbRow>(
      `SELECT
        i.id, i.workspace_id, i.folder_id, i.kind, i.created_by, i.updated_by,
        i.created_at, i.updated_at, i.deleted_at, i.revision, i.rank,
        i.is_archived, i.is_pinned, i.security_scope,
        e.title, e.details, e.all_day, e.start_date::text as start_date, e.end_date::text as end_date, e.start_at, e.end_at, e.timezone
      FROM app.items i
      JOIN app.calendar_events e ON i.id = e.id AND i.workspace_id = e.workspace_id
      WHERE i.workspace_id = $1
        AND i.deleted_at IS NULL
        AND i.is_archived = false
        AND (
          (e.all_day = true AND e.start_date <= $3 AND e.end_date >= $2)
          OR
          (e.all_day = false AND e.start_at <= $5::timestamptz AND e.end_at >= $4::timestamptz)
        )
      LIMIT 500;`,
      [workspaceId, startDate, endDate, rangeStartInstant, rangeEndInstant]
    );

    for (const r of eventRows.rows) {
      const parsed = mapRowToCalendarEvent(r);
      eventsList.push({
        ...parsed,
        startDate: parsed.startDate,
        endDate: parsed.endDate,
      });
    }
  }

  // 4. Fetch journal date indicators (count only, strictly NO bodies or prompts, excludes trash and archived)
  const journalDatesList: Array<{ date: string; count: number }> = [];
  if (includeJournalIndicators) {
    const journalRows = await client.query<{ entry_date: string; count: string | number }>(
      `SELECT j.entry_date::text as entry_date, COUNT(*)::int as count
       FROM app.journal_entries j
       JOIN app.items i ON j.id = i.id AND j.workspace_id = i.workspace_id
       WHERE j.workspace_id = $1
         AND i.deleted_at IS NULL
         AND i.is_archived = false
         AND j.entry_date >= $2 AND j.entry_date <= $3
       GROUP BY j.entry_date;`,
      [workspaceId, startDate, endDate]
    );

    for (const jr of journalRows.rows) {
      const dateStr = formatCalendarDate(jr.entry_date) || String(jr.entry_date).slice(0, 10);
      journalDatesList.push({ date: dateStr, count: Number(jr.count) || 1 });
    }
  }

  // 5. Build pure read model via domain projection
  const readModel = buildCalendarReadModel({
    startDate,
    endDate,
    timezone,
    tasks: tasksList,
    routines: routinesList,
    routineOccurrences: occurrencesList,
    events: eventsList,
    journalDates: journalDatesList,
    now,
  });

  return readModel;
}
