import type { PoolClient } from 'pg';
import crypto from 'node:crypto';
import type {
  Routine,
  RoutineOccurrence,
  CreateRoutineRequest,
  UpdateRoutineRequest,
  RoutineListQuery,
  GenerateOccurrencesQuery,
  RoutineFrequency,
  Weekday,
  RoutineOccurrenceTransition,
} from '@daynori/contracts';
import {
  validateRoutineTitle,
  validateWeekdays,
  isValidCalendarDateString,
  isValidIanaTimezone,
  generateOccurrencesForDateRange,
  reconcileOccurrencesOnScheduleChange,
  completeOccurrence as pureCompleteOccurrence,
  skipOccurrence as pureSkipOccurrence,
  reopenOccurrence as pureReopenOccurrence,
  type RoutineTemplateRule,
  type Weekday as DomainWeekday,
} from '@daynori/domain';
import {
  lockWorkspaceSyncState,
  insertChange,
  insertOutboxIntent,
  updateWorkspaceSyncSeq,
} from '../sync/repository.js';
import { NotFoundError, ConflictError, ValidationError } from '../../plugins/errorHandler.js';

interface RoutineDbRow {
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
  frequency: RoutineFrequency;
  weekdays: number[];
  timezone: string;
  scheduled_time: string | null;
  active_from: string | Date;
  active_to: string | Date | null;
  is_paused: boolean;
  schedule_revision: number;
  effective_date: string | Date;
}

function formatDateOnly(d: string | Date | null | undefined): string | null {
  if (!d) return null;
  if (typeof d === 'string') {
    return d.slice(0, 10);
  }
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function mapRowToRoutine(r: RoutineDbRow): Routine {
  const activeFromStr = formatDateOnly(r.active_from)!;
  const activeToStr = formatDateOnly(r.active_to);
  const effectiveDateStr = formatDateOnly(r.effective_date)!;

  return {
    id: r.id,
    workspaceId: r.workspace_id,
    folderId: r.folder_id,
    title: r.title,
    details: r.details,
    frequency: r.frequency,
    weekdays: (r.weekdays || []) as Weekday[],
    timezone: r.timezone,
    scheduledTime: r.scheduled_time,
    activeFrom: activeFromStr,
    activeTo: activeToStr,
    isPaused: r.is_paused,
    isArchived: r.is_archived,
    isPinned: r.is_pinned,
    scheduleRevision: Number(r.schedule_revision) || 1,
    effectiveDate: effectiveDateStr,
    revision: Number(r.revision) || 1,
    createdAt: new Date(r.created_at).toISOString(),
    updatedAt: new Date(r.updated_at).toISOString(),
    deletedAt: r.deleted_at ? new Date(r.deleted_at).toISOString() : null,
  };
}

interface OccurrenceDbRow {
  id: string;
  workspace_id: string;
  routine_id: string;
  scheduled_date: string | Date;
  schedule_revision: number;
  planned_instant: Date | null;
  timezone: string;
  status: 'pending' | 'done' | 'skipped';
  completed_at: Date | null;
  completed_by: string | null;
  history: RoutineOccurrenceTransition[] | string;
  server_revision: string | number;
  created_at: Date;
  updated_at: Date;
}

function mapRowToOccurrence(r: OccurrenceDbRow): RoutineOccurrence {
  const scheduledDateStr = formatDateOnly(r.scheduled_date)!;

  let history: RoutineOccurrenceTransition[] = [];
  if (Array.isArray(r.history)) {
    history = r.history;
  } else if (typeof r.history === 'string') {
    try {
      history = JSON.parse(r.history);
    } catch {
      history = [];
    }
  }

  return {
    id: r.id,
    workspaceId: r.workspace_id,
    routineId: r.routine_id,
    scheduledDate: scheduledDateStr,
    scheduleRevision: Number(r.schedule_revision) || 1,
    plannedInstant: r.planned_instant ? new Date(r.planned_instant).toISOString() : null,
    timezone: r.timezone,
    status: r.status,
    completedAt: r.completed_at ? new Date(r.completed_at).toISOString() : null,
    completedBy: r.completed_by,
    history,
    serverRevision: Number(r.server_revision) || 1,
    revision: Number(r.server_revision) || 1,
    createdAt: new Date(r.created_at).toISOString(),
    updatedAt: new Date(r.updated_at).toISOString(),
  };
}

export async function createRoutine(
  client: PoolClient,
  workspaceId: string,
  actorUserId: string,
  input: CreateRoutineRequest,
  operationId?: string
): Promise<Routine & { seq: number }> {
  const routineId = input.id || crypto.randomUUID();
  const opId = operationId || crypto.randomUUID();

  // Validate title
  const title = validateRoutineTitle(input.title);

  // Validate timezone
  if (!isValidIanaTimezone(input.timezone)) {
    throw new ValidationError(
      `INVALID_TIMEZONE: '${input.timezone}' is not a recognized IANA timezone.`
    );
  }

  // Validate frequency and weekdays
  const frequency: RoutineFrequency = input.frequency || 'daily';
  let weekdays: Weekday[] = [];
  if (frequency === 'weekdays') {
    if (!input.weekdays || input.weekdays.length === 0) {
      throw new ValidationError('Weekdays frequency requires at least one selected weekday.');
    }
    weekdays = validateWeekdays(input.weekdays);
  }

  // Validate active period dates
  const nowUtc = new Date();
  const todayStr = nowUtc.toISOString().slice(0, 10);
  const activeFrom = input.activeFrom || todayStr;
  if (!isValidCalendarDateString(activeFrom)) {
    throw new ValidationError(`Invalid activeFrom date: "${activeFrom}". Expected YYYY-MM-DD.`);
  }
  const activeTo = input.activeTo || null;
  if (activeTo !== null) {
    if (!isValidCalendarDateString(activeTo)) {
      throw new ValidationError(`Invalid activeTo date: "${activeTo}". Expected YYYY-MM-DD.`);
    }
    if (activeTo < activeFrom) {
      throw new ValidationError('activeTo date cannot be earlier than activeFrom date.');
    }
  }

  // Validate folder reference if provided
  const folderId = input.folderId || null;
  if (folderId) {
    const fRes = await client.query<{ id: string }>(
      `SELECT id FROM app.items
       WHERE workspace_id = $1 AND id = $2 AND kind = 'folder' AND deleted_at IS NULL;`,
      [workspaceId, folderId]
    );
    if (fRes.rows.length === 0) {
      throw new ValidationError(`Target folder ${folderId} does not exist or has been deleted.`);
    }
  }

  // Insert into app.items
  await client.query(
    `INSERT INTO app.items (
      id, workspace_id, folder_id, kind, created_by, updated_by,
      revision, rank, is_archived, is_pinned, security_scope
    ) VALUES ($1, $2, $3, 'routine', $4, $4, 1, '00001000', false, $5, 'standard');`,
    [routineId, workspaceId, folderId, actorUserId, Boolean(input.isPinned)]
  );

  // Insert into app.routines
  const routineRes = await client.query<RoutineDbRow>(
    `INSERT INTO app.routines (
      id, workspace_id, folder_id, title, details, frequency,
      weekdays, timezone, scheduled_time, active_from, active_to,
      is_paused, is_archived, is_pinned, schedule_revision, effective_date
    ) VALUES (
      $1, $2, $3, $4, $5, $6,
      $7, $8, $9, $10, $11,
      false, false, $12, 1, $10
    )
    RETURNING
      id, workspace_id, folder_id, title, details, frequency,
      weekdays, timezone, scheduled_time, active_from, active_to,
      is_paused, is_archived, is_pinned, schedule_revision, effective_date,
      created_at, updated_at;`,
    [
      routineId,
      workspaceId,
      folderId,
      title,
      input.details || null,
      frequency,
      weekdays,
      input.timezone,
      input.scheduledTime || null,
      activeFrom,
      activeTo,
      Boolean(input.isPinned),
    ]
  );

  // Allocate monotonic sync sequence
  const syncState = await lockWorkspaceSyncState(client, workspaceId);
  const nextSeq = syncState.nextChangeSeq;

  const fullRow: RoutineDbRow = {
    ...routineRes.rows[0]!,
    kind: 'routine',
    created_by: actorUserId,
    updated_by: actorUserId,
    deleted_at: null,
    revision: 1,
    rank: '00001000',
    security_scope: 'standard',
  };

  const routine = mapRowToRoutine(fullRow);

  await insertChange(client, {
    workspaceId,
    seq: nextSeq,
    entityType: 'routine',
    entityId: routineId,
    revision: 1,
    isTombstone: false,
    operationId: opId,
    changeData: routine,
  });

  await insertOutboxIntent(client, {
    workspaceId,
    eventType: 'routine.created',
    payload: { routineId, title, workspaceId },
  });

  await updateWorkspaceSyncSeq(client, workspaceId, nextSeq + 1);

  return { ...routine, seq: nextSeq };
}

export async function getRoutine(
  client: PoolClient,
  workspaceId: string,
  routineId: string
): Promise<Routine> {
  const res = await client.query<RoutineDbRow>(
    `SELECT
       r.id, r.workspace_id, r.folder_id, r.title, r.details, r.frequency,
       r.weekdays, r.timezone, r.scheduled_time, r.active_from, r.active_to,
       r.is_paused, r.is_archived, r.is_pinned, r.schedule_revision, r.effective_date,
       r.created_at, r.updated_at,
       i.kind, i.created_by, i.updated_by, i.deleted_at, i.revision, i.rank, i.security_scope
     FROM app.routines r
     JOIN app.items i ON i.workspace_id = r.workspace_id AND i.id = r.id
     WHERE r.workspace_id = $1 AND r.id = $2;`,
    [workspaceId, routineId]
  );

  if (res.rows.length === 0) {
    throw new NotFoundError(`Routine ${routineId} not found in workspace ${workspaceId}.`);
  }

  return mapRowToRoutine(res.rows[0]!);
}

export async function listRoutines(
  client: PoolClient,
  workspaceId: string,
  query: Partial<RoutineListQuery> = {}
): Promise<{ routines: Routine[]; nextCursor?: string }> {
  const conditions: string[] = ['r.workspace_id = $1'];
  const params: unknown[] = [workspaceId];
  let pIdx = 2;

  // Folder filter
  if (query.folderId !== undefined) {
    if (query.folderId === null) {
      conditions.push('r.folder_id IS NULL');
    } else {
      conditions.push(`r.folder_id = $${pIdx++}`);
      params.push(query.folderId);
    }
  }

  // Soft-deleted filter
  conditions.push('i.deleted_at IS NULL');

  // Archived filter
  if (!query.includeArchived) {
    conditions.push('r.is_archived = false');
  }

  // Paused filter
  if (!query.includePaused) {
    conditions.push('r.is_paused = false');
  }

  const limit = query.limit || 50;
  params.push(limit + 1);
  const limitParamIdx = pIdx++;

  const res = await client.query<RoutineDbRow>(
    `SELECT
       r.id, r.workspace_id, r.folder_id, r.title, r.details, r.frequency,
       r.weekdays, r.timezone, r.scheduled_time, r.active_from, r.active_to,
       r.is_paused, r.is_archived, r.is_pinned, r.schedule_revision, r.effective_date,
       r.created_at, r.updated_at,
       i.kind, i.created_by, i.updated_by, i.deleted_at, i.revision, i.rank, i.security_scope
     FROM app.routines r
     JOIN app.items i ON i.workspace_id = r.workspace_id AND i.id = r.id
     WHERE ${conditions.join(' AND ')}
     ORDER BY r.is_pinned DESC, r.created_at ASC
     LIMIT $${limitParamIdx};`,
    params
  );

  let nextCursor: string | undefined;
  let rows = res.rows;
  if (rows.length > limit) {
    rows = rows.slice(0, limit);
    nextCursor = rows[rows.length - 1]!.id;
  }

  return {
    routines: rows.map(mapRowToRoutine),
    nextCursor,
  };
}

export async function updateRoutine(
  client: PoolClient,
  workspaceId: string,
  routineId: string,
  actorUserId: string,
  input: UpdateRoutineRequest,
  operationId?: string
): Promise<Routine & { seq: number }> {
  const opId = operationId || crypto.randomUUID();

  // 1. Fetch current routine
  const current = await getRoutine(client, workspaceId, routineId);

  // 2. Concurrency check
  if (input.baseRevision !== current.revision) {
    throw new ConflictError(
      `REVISION_CONFLICT: Routine revision is ${current.revision}, but update requested baseRevision ${input.baseRevision}.`
    );
  }

  // 3. Validate title if provided
  const title = input.title !== undefined ? validateRoutineTitle(input.title) : current.title;

  // 4. Validate timezone if provided
  const timezone = input.timezone !== undefined ? input.timezone : current.timezone;
  if (!isValidIanaTimezone(timezone)) {
    throw new ValidationError(`INVALID_TIMEZONE: '${timezone}' is not a recognized IANA timezone.`);
  }

  // 5. Validate frequency and weekdays
  const frequency: RoutineFrequency =
    input.frequency !== undefined ? input.frequency : current.frequency;
  let weekdays: Weekday[] = current.weekdays;
  if (input.weekdays !== undefined) {
    weekdays = validateWeekdays(input.weekdays);
  }
  if (frequency === 'weekdays' && weekdays.length === 0) {
    throw new ValidationError('Weekdays frequency requires at least one selected weekday.');
  }

  // 6. Validate active period dates
  const activeFrom = input.activeFrom !== undefined ? input.activeFrom : current.activeFrom;
  if (!isValidCalendarDateString(activeFrom)) {
    throw new ValidationError(`Invalid activeFrom date: "${activeFrom}". Expected YYYY-MM-DD.`);
  }
  const activeTo = input.activeTo !== undefined ? input.activeTo : current.activeTo;
  if (activeTo !== null) {
    if (!isValidCalendarDateString(activeTo)) {
      throw new ValidationError(`Invalid activeTo date: "${activeTo}". Expected YYYY-MM-DD.`);
    }
    if (activeTo < activeFrom) {
      throw new ValidationError('activeTo date cannot be earlier than activeFrom date.');
    }
  }

  // 7. Folder check
  let folderId = current.folderId;
  if (input.folderId !== undefined) {
    folderId = input.folderId;
    if (folderId) {
      const fRes = await client.query<{ id: string }>(
        `SELECT id FROM app.items
         WHERE workspace_id = $1 AND id = $2 AND kind = 'folder' AND deleted_at IS NULL;`,
        [workspaceId, folderId]
      );
      if (fRes.rows.length === 0) {
        throw new ValidationError(`Target folder ${folderId} does not exist or has been deleted.`);
      }
    }
  }

  // 8. Detect schedule rule change
  const scheduledTime =
    input.scheduledTime !== undefined ? input.scheduledTime : current.scheduledTime;
  const isPaused = input.isPaused !== undefined ? input.isPaused : current.isPaused;
  const isArchived = input.isArchived !== undefined ? input.isArchived : current.isArchived;
  const isPinned = input.isPinned !== undefined ? input.isPinned : current.isPinned;

  const isScheduleChanged =
    frequency !== current.frequency ||
    JSON.stringify(weekdays) !== JSON.stringify(current.weekdays) ||
    timezone !== current.timezone ||
    scheduledTime !== current.scheduledTime ||
    activeFrom !== current.activeFrom ||
    activeTo !== current.activeTo ||
    isPaused !== current.isPaused;

  const newScheduleRevision = isScheduleChanged
    ? current.scheduleRevision + 1
    : current.scheduleRevision;

  const effectiveDate = input.effectiveDate || new Date().toISOString().slice(0, 10);
  if (!isValidCalendarDateString(effectiveDate)) {
    throw new ValidationError(`Invalid effectiveDate: "${effectiveDate}". Expected YYYY-MM-DD.`);
  }

  const nextRevision = current.revision + 1;

  // 9. Update app.items
  await client.query(
    `UPDATE app.items
     SET folder_id = $1, is_pinned = $2, is_archived = $3,
         revision = $4, updated_by = $5, updated_at = now()
     WHERE workspace_id = $6 AND id = $7;`,
    [folderId, isPinned, isArchived, nextRevision, actorUserId, workspaceId, routineId]
  );

  // 10. Update app.routines
  const rRes = await client.query<RoutineDbRow>(
    `UPDATE app.routines
     SET folder_id = $1, title = $2, details = $3, frequency = $4,
         weekdays = $5, timezone = $6, scheduled_time = $7, active_from = $8,
         active_to = $9, is_paused = $10, is_archived = $11, is_pinned = $12,
         schedule_revision = $13, effective_date = $14, updated_at = now()
     WHERE workspace_id = $15 AND id = $16
     RETURNING
       id, workspace_id, folder_id, title, details, frequency,
       weekdays, timezone, scheduled_time, active_from, active_to,
       is_paused, is_archived, is_pinned, schedule_revision, effective_date,
       created_at, updated_at;`,
    [
      folderId,
      title,
      input.details !== undefined ? input.details : current.details,
      frequency,
      weekdays,
      timezone,
      scheduledTime,
      activeFrom,
      activeTo,
      isPaused,
      isArchived,
      isPinned,
      newScheduleRevision,
      effectiveDate,
      workspaceId,
      routineId,
    ]
  );

  const updatedRoutine = mapRowToRoutine({
    ...rRes.rows[0]!,
    kind: 'routine',
    created_by: actorUserId,
    updated_by: actorUserId,
    deleted_at: null,
    revision: nextRevision,
    rank: '00001000',
    security_scope: 'standard',
  });

  // 11. If schedule changed, reconcile already-generated future pending occurrences
  if (isScheduleChanged) {
    const occRes = await client.query<OccurrenceDbRow>(
      `SELECT * FROM app.routine_occurrences
       WHERE workspace_id = $1 AND routine_id = $2 AND scheduled_date >= $3;`,
      [workspaceId, routineId, effectiveDate]
    );
    const existingOccurrences = occRes.rows.map(mapRowToOccurrence);

    const rule: RoutineTemplateRule = {
      ...updatedRoutine,
      weekdays: updatedRoutine.weekdays as DomainWeekday[],
      scheduleRevision: newScheduleRevision,
      effectiveDate,
    };

    const { retained, cancelledOccurrenceIds } = reconcileOccurrencesOnScheduleChange(
      existingOccurrences,
      rule,
      effectiveDate
    );

    // Cancel / remove occurrences that are no longer scheduled
    if (cancelledOccurrenceIds.length > 0) {
      await client.query(
        `DELETE FROM app.routine_occurrences
         WHERE workspace_id = $1 AND id = ANY($2::uuid[]) AND status = 'pending';`,
        [workspaceId, cancelledOccurrenceIds]
      );
    }

    // Update retained pending occurrences with new rule version, timezone, and planned instant
    for (const occ of retained) {
      if (occ.status === 'pending') {
        await client.query(
          `UPDATE app.routine_occurrences
           SET schedule_revision = $1, timezone = $2, planned_instant = $3,
               updated_at = now()
           WHERE workspace_id = $4 AND id = $5;`,
          [newScheduleRevision, timezone, occ.plannedInstant, workspaceId, occ.id]
        );
      }
    }
  }

  // 12. Monotonic change feed sequence
  const syncState = await lockWorkspaceSyncState(client, workspaceId);
  const nextSeq = syncState.nextChangeSeq;

  await insertChange(client, {
    workspaceId,
    seq: nextSeq,
    entityType: 'routine',
    entityId: routineId,
    revision: nextRevision,
    isTombstone: false,
    operationId: opId,
    changeData: updatedRoutine,
  });

  await insertOutboxIntent(client, {
    workspaceId,
    eventType: 'routine.updated',
    payload: { routineId, title: updatedRoutine.title, revision: nextRevision },
  });

  await updateWorkspaceSyncSeq(client, workspaceId, nextSeq + 1);

  return { ...updatedRoutine, seq: nextSeq };
}

export async function trashRoutine(
  client: PoolClient,
  workspaceId: string,
  routineId: string,
  actorUserId: string,
  baseRevision: number,
  operationId?: string
): Promise<{ id: string; revision: number; seq: number }> {
  const current = await getRoutine(client, workspaceId, routineId);
  if (current.revision !== baseRevision) {
    throw new ConflictError(
      `REVISION_CONFLICT: Routine revision is ${current.revision}, but trash requested baseRevision ${baseRevision}.`
    );
  }

  const nextRevision = current.revision + 1;
  const opId = operationId || crypto.randomUUID();

  await client.query(
    `UPDATE app.items
     SET deleted_at = now(), revision = $1, updated_by = $2, updated_at = now()
     WHERE workspace_id = $3 AND id = $4;`,
    [nextRevision, actorUserId, workspaceId, routineId]
  );

  const syncState = await lockWorkspaceSyncState(client, workspaceId);
  const nextSeq = syncState.nextChangeSeq;

  await insertChange(client, {
    workspaceId,
    seq: nextSeq,
    entityType: 'routine',
    entityId: routineId,
    revision: nextRevision,
    isTombstone: true,
    operationId: opId,
    changeData: { id: routineId, deletedAt: new Date().toISOString() },
  });

  await updateWorkspaceSyncSeq(client, workspaceId, nextSeq + 1);

  return { id: routineId, revision: nextRevision, seq: nextSeq };
}

export async function restoreRoutine(
  client: PoolClient,
  workspaceId: string,
  routineId: string,
  actorUserId: string,
  baseRevision: number,
  operationId?: string
): Promise<Routine & { seq: number }> {
  const res = await client.query<RoutineDbRow>(
    `SELECT
       r.id, r.workspace_id, r.folder_id, r.title, r.details, r.frequency,
       r.weekdays, r.timezone, r.scheduled_time, r.active_from, r.active_to,
       r.is_paused, r.is_archived, r.is_pinned, r.schedule_revision, r.effective_date,
       r.created_at, r.updated_at,
       i.kind, i.created_by, i.updated_by, i.deleted_at, i.revision, i.rank, i.security_scope
     FROM app.routines r
     JOIN app.items i ON i.workspace_id = r.workspace_id AND i.id = r.id
     WHERE r.workspace_id = $1 AND r.id = $2;`,
    [workspaceId, routineId]
  );

  if (res.rows.length === 0) {
    throw new NotFoundError(`Routine ${routineId} not found.`);
  }

  const current = mapRowToRoutine(res.rows[0]!);
  if (current.revision !== baseRevision) {
    throw new ConflictError(
      `REVISION_CONFLICT: Routine revision is ${current.revision}, but restore requested baseRevision ${baseRevision}.`
    );
  }

  const nextRevision = current.revision + 1;
  const opId = operationId || crypto.randomUUID();

  await client.query(
    `UPDATE app.items
     SET deleted_at = null, revision = $1, updated_by = $2, updated_at = now()
     WHERE workspace_id = $3 AND id = $4;`,
    [nextRevision, actorUserId, workspaceId, routineId]
  );

  const syncState = await lockWorkspaceSyncState(client, workspaceId);
  const nextSeq = syncState.nextChangeSeq;

  const restored = { ...current, revision: nextRevision, deletedAt: null };

  await insertChange(client, {
    workspaceId,
    seq: nextSeq,
    entityType: 'routine',
    entityId: routineId,
    revision: nextRevision,
    isTombstone: false,
    operationId: opId,
    changeData: restored,
  });

  await updateWorkspaceSyncSeq(client, workspaceId, nextSeq + 1);

  return { ...restored, seq: nextSeq };
}

// --- Occurrences Service ---

export async function generateOccurrences(
  client: PoolClient,
  workspaceId: string,
  _actorUserId: string,
  query: GenerateOccurrencesQuery
): Promise<RoutineOccurrence[]> {
  const { startDate, endDate, routineId } = query;

  if (!isValidCalendarDateString(startDate) || !isValidCalendarDateString(endDate)) {
    throw new ValidationError('startDate and endDate must be valid YYYY-MM-DD date strings.');
  }
  if (startDate > endDate) {
    throw new ValidationError(`startDate "${startDate}" cannot be after endDate "${endDate}".`);
  }

  // 1. Fetch matching active routines in workspace
  let routineSql = `
    SELECT
      r.id, r.workspace_id, r.folder_id, r.title, r.details, r.frequency,
      r.weekdays, r.timezone, r.scheduled_time, r.active_from, r.active_to,
      r.is_paused, r.is_archived, r.is_pinned, r.schedule_revision, r.effective_date,
      r.created_at, r.updated_at,
      i.kind, i.created_by, i.updated_by, i.deleted_at, i.revision, i.rank, i.security_scope
    FROM app.routines r
    JOIN app.items i ON i.workspace_id = r.workspace_id AND i.id = r.id
    WHERE r.workspace_id = $1 AND i.deleted_at IS NULL AND r.is_archived = false
  `;
  const params: unknown[] = [workspaceId];
  if (routineId) {
    routineSql += ' AND r.id = $2';
    params.push(routineId);
  }

  const routinesRes = await client.query<RoutineDbRow>(routineSql, params);
  if (routineId && routinesRes.rows.length === 0) {
    throw new NotFoundError(`Routine ${routineId} not found in workspace.`);
  }
  const routines = routinesRes.rows.map(mapRowToRoutine);

  // 2. Fetch existing occurrences in the date range
  let occSql = `
    SELECT * FROM app.routine_occurrences
    WHERE workspace_id = $1 AND scheduled_date >= $2 AND scheduled_date <= $3
  `;
  const occParams: unknown[] = [workspaceId, startDate, endDate];
  if (routineId) {
    occSql += ' AND routine_id = $4';
    occParams.push(routineId);
  }

  const existingOccRes = await client.query<OccurrenceDbRow>(occSql, occParams);
  const existingOccurrences = existingOccRes.rows.map(mapRowToOccurrence);

  // 3. Generate planned occurrences for each routine
  const newlyCreated: RoutineOccurrence[] = [];

  for (const routine of routines) {
    const rule: RoutineTemplateRule = {
      id: routine.id,
      workspaceId: routine.workspaceId,
      folderId: routine.folderId,
      title: routine.title,
      details: routine.details,
      frequency: routine.frequency,
      weekdays: routine.weekdays as DomainWeekday[],
      timezone: routine.timezone,
      scheduledTime: routine.scheduledTime,
      activeFrom: routine.activeFrom,
      activeTo: routine.activeTo,
      isPaused: routine.isPaused,
      isArchived: routine.isArchived,
      scheduleRevision: routine.scheduleRevision,
      effectiveDate: routine.effectiveDate,
    };

    const plannedOccs = generateOccurrencesForDateRange(
      rule,
      startDate,
      endDate,
      existingOccurrences
    );

    for (const occ of plannedOccs) {
      // Idempotent insertion using unique constraint (workspace_id, routine_id, scheduled_date)
      const insRes = await client.query<OccurrenceDbRow>(
        `INSERT INTO app.routine_occurrences (
          id, workspace_id, routine_id, scheduled_date, schedule_revision,
          planned_instant, timezone, status, completed_at, completed_by,
          history, server_revision
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, null, null,
          '[]'::jsonb, 1
        )
        ON CONFLICT (workspace_id, routine_id, scheduled_date) DO NOTHING
        RETURNING *;`,
        [
          occ.id,
          workspaceId,
          occ.routineId,
          occ.scheduledDate,
          occ.scheduleRevision,
          occ.plannedInstant,
          occ.timezone,
          occ.status,
        ]
      );

      if (insRes.rows.length > 0) {
        const created = mapRowToOccurrence(insRes.rows[0]!);
        newlyCreated.push(created);
        existingOccurrences.push(created);
      }
    }
  }

  // If any new occurrences were created, record in change feed
  if (newlyCreated.length > 0) {
    const syncState = await lockWorkspaceSyncState(client, workspaceId);
    let seq = syncState.nextChangeSeq;

    for (const occ of newlyCreated) {
      await insertChange(client, {
        workspaceId,
        seq,
        entityType: 'routine_occurrence',
        entityId: occ.id,
        revision: occ.serverRevision,
        isTombstone: false,
        operationId: crypto.randomUUID(),
        changeData: occ,
      });
      seq++;
    }

    await updateWorkspaceSyncSeq(client, workspaceId, seq);
  }

  // Return all occurrences in range, sorted by date
  return existingOccurrences.sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));
}

export async function listOccurrences(
  client: PoolClient,
  workspaceId: string,
  startDate: string,
  endDate: string,
  routineId?: string
): Promise<RoutineOccurrence[]> {
  let sql = `
    SELECT * FROM app.routine_occurrences
    WHERE workspace_id = $1 AND scheduled_date >= $2 AND scheduled_date <= $3
  `;
  const params: unknown[] = [workspaceId, startDate, endDate];
  if (routineId) {
    sql += ' AND routine_id = $4';
    params.push(routineId);
  }
  sql += ' ORDER BY scheduled_date ASC, created_at ASC;';

  const res = await client.query<OccurrenceDbRow>(sql, params);
  return res.rows.map(mapRowToOccurrence);
}

export async function getOccurrence(
  client: PoolClient,
  workspaceId: string,
  occurrenceId: string
): Promise<RoutineOccurrence> {
  const res = await client.query<OccurrenceDbRow>(
    `SELECT * FROM app.routine_occurrences
     WHERE workspace_id = $1 AND id = $2;`,
    [workspaceId, occurrenceId]
  );
  if (res.rows.length === 0) {
    throw new NotFoundError(`Routine occurrence ${occurrenceId} not found.`);
  }
  return mapRowToOccurrence(res.rows[0]!);
}

export async function completeOccurrenceService(
  client: PoolClient,
  workspaceId: string,
  occurrenceId: string,
  actorUserId: string,
  baseRevision: number,
  operationId?: string
): Promise<RoutineOccurrence & { seq: number }> {
  const current = await getOccurrence(client, workspaceId, occurrenceId);
  if (current.serverRevision !== baseRevision) {
    throw new ConflictError(
      `REVISION_CONFLICT: Occurrence revision is ${current.serverRevision}, but complete requested baseRevision ${baseRevision}.`
    );
  }

  const opId = operationId || crypto.randomUUID();
  const nextRevision = current.serverRevision + 1;
  const transitioned = pureCompleteOccurrence(current, actorUserId);

  await client.query(
    `UPDATE app.routine_occurrences
     SET status = 'done', completed_at = $1, completed_by = $2,
         history = $3::jsonb, server_revision = $4, updated_at = now()
     WHERE workspace_id = $5 AND id = $6;`,
    [
      transitioned.completedAt,
      transitioned.completedBy,
      JSON.stringify(transitioned.history),
      nextRevision,
      workspaceId,
      occurrenceId,
    ]
  );

  const updated: RoutineOccurrence = {
    ...transitioned,
    serverRevision: nextRevision,
    revision: nextRevision,
  };

  const syncState = await lockWorkspaceSyncState(client, workspaceId);
  const nextSeq = syncState.nextChangeSeq;

  await insertChange(client, {
    workspaceId,
    seq: nextSeq,
    entityType: 'routine_occurrence',
    entityId: occurrenceId,
    revision: nextRevision,
    isTombstone: false,
    operationId: opId,
    changeData: updated,
  });

  await updateWorkspaceSyncSeq(client, workspaceId, nextSeq + 1);

  return { ...updated, seq: nextSeq };
}

export async function skipOccurrenceService(
  client: PoolClient,
  workspaceId: string,
  occurrenceId: string,
  actorUserId: string,
  baseRevision: number,
  operationId?: string
): Promise<RoutineOccurrence & { seq: number }> {
  const current = await getOccurrence(client, workspaceId, occurrenceId);
  if (current.serverRevision !== baseRevision) {
    throw new ConflictError(
      `REVISION_CONFLICT: Occurrence revision is ${current.serverRevision}, but skip requested baseRevision ${baseRevision}.`
    );
  }

  const opId = operationId || crypto.randomUUID();
  const nextRevision = current.serverRevision + 1;
  const transitioned = pureSkipOccurrence(current, actorUserId);

  await client.query(
    `UPDATE app.routine_occurrences
     SET status = 'skipped', completed_at = null, completed_by = null,
         history = $1::jsonb, server_revision = $2, updated_at = now()
     WHERE workspace_id = $3 AND id = $4;`,
    [JSON.stringify(transitioned.history), nextRevision, workspaceId, occurrenceId]
  );

  const updated: RoutineOccurrence = {
    ...transitioned,
    serverRevision: nextRevision,
    revision: nextRevision,
  };

  const syncState = await lockWorkspaceSyncState(client, workspaceId);
  const nextSeq = syncState.nextChangeSeq;

  await insertChange(client, {
    workspaceId,
    seq: nextSeq,
    entityType: 'routine_occurrence',
    entityId: occurrenceId,
    revision: nextRevision,
    isTombstone: false,
    operationId: opId,
    changeData: updated,
  });

  await updateWorkspaceSyncSeq(client, workspaceId, nextSeq + 1);

  return { ...updated, seq: nextSeq };
}

export async function reopenOccurrenceService(
  client: PoolClient,
  workspaceId: string,
  occurrenceId: string,
  actorUserId: string,
  baseRevision: number,
  operationId?: string
): Promise<RoutineOccurrence & { seq: number }> {
  const current = await getOccurrence(client, workspaceId, occurrenceId);
  if (current.serverRevision !== baseRevision) {
    throw new ConflictError(
      `REVISION_CONFLICT: Occurrence revision is ${current.serverRevision}, but reopen requested baseRevision ${baseRevision}.`
    );
  }

  const opId = operationId || crypto.randomUUID();
  const nextRevision = current.serverRevision + 1;
  const transitioned = pureReopenOccurrence(current, actorUserId);

  await client.query(
    `UPDATE app.routine_occurrences
     SET status = 'pending', completed_at = null, completed_by = null,
         history = $1::jsonb, server_revision = $2, updated_at = now()
     WHERE workspace_id = $3 AND id = $4;`,
    [JSON.stringify(transitioned.history), nextRevision, workspaceId, occurrenceId]
  );

  const updated: RoutineOccurrence = {
    ...transitioned,
    serverRevision: nextRevision,
    revision: nextRevision,
  };

  const syncState = await lockWorkspaceSyncState(client, workspaceId);
  const nextSeq = syncState.nextChangeSeq;

  await insertChange(client, {
    workspaceId,
    seq: nextSeq,
    entityType: 'routine_occurrence',
    entityId: occurrenceId,
    revision: nextRevision,
    isTombstone: false,
    operationId: opId,
    changeData: updated,
  });

  await updateWorkspaceSyncSeq(client, workspaceId, nextSeq + 1);

  return { ...updated, seq: nextSeq };
}
