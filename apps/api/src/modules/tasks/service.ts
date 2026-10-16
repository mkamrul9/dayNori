import type { PoolClient } from 'pg';
import crypto from 'node:crypto';
import type {
  Task,
  CreateTaskRequest,
  UpdateTaskRequest,
  CompleteTaskRequest,
  ReopenTaskRequest,
  TaskListQuery,
  TaskDeadline,
  TaskCompletionHistoryItem,
} from '@daynori/contracts';
import {
  validateTaskTitle,
  isValidCalendarDateString,
  isValidIanaTimezone,
  validateSubtaskHierarchy,
  getCalendarDateInTimezone,
  compareTasksUpcoming,
} from '@daynori/domain';
import {
  lockWorkspaceSyncState,
  insertChange,
  insertOutboxIntent,
  updateWorkspaceSyncSeq,
} from '../sync/repository.js';
import { NotFoundError, ConflictError, ValidationError } from '../../plugins/errorHandler.js';

interface TaskDbRow {
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
  priority: 'low' | 'normal' | 'high' | 'urgent';
  status: 'todo' | 'in_progress' | 'completed' | 'cancelled';
  deadline_type: 'none' | 'date' | 'timed';
  deadline_date: string | null;
  deadline_time: Date | null;
  deadline_zone: string | null;
  completed_at: Date | null;
  reopened_at: Date | null;
  completion_history: TaskCompletionHistoryItem[] | string;
  parent_id: string | null;
  subtask_order: number;
  tags: string[];
}

function mapRowToTask(r: TaskDbRow): Task {
  let deadline: TaskDeadline = { type: 'none' };
  if (r.deadline_type === 'date' && r.deadline_date) {
    // If returned as Date object or string
    const dStr =
      typeof r.deadline_date === 'string'
        ? r.deadline_date.slice(0, 10)
        : new Date(r.deadline_date).toISOString().slice(0, 10);
    deadline = {
      type: 'date',
      date: dStr,
    };
  } else if (r.deadline_type === 'timed' && r.deadline_time && r.deadline_zone) {
    deadline = {
      type: 'timed',
      timestamp: new Date(r.deadline_time).toISOString(),
      timezone: r.deadline_zone,
    };
  }

  let history: TaskCompletionHistoryItem[] = [];
  if (Array.isArray(r.completion_history)) {
    history = r.completion_history;
  } else if (typeof r.completion_history === 'string') {
    try {
      history = JSON.parse(r.completion_history);
    } catch {
      history = [];
    }
  }

  return {
    id: r.id,
    workspaceId: r.workspace_id,
    folderId: r.folder_id,
    title: r.title,
    details: r.details,
    priority: r.priority,
    status: r.status,
    deadline,
    completedAt: r.completed_at ? r.completed_at.toISOString() : null,
    reopenedAt: r.reopened_at ? r.reopened_at.toISOString() : null,
    completionHistory: history,
    parentId: r.parent_id,
    subtaskOrder: Number(r.subtask_order || 0),
    tags: Array.isArray(r.tags) ? r.tags : [],
    rank: r.rank,
    isArchived: r.is_archived,
    isPinned: r.is_pinned,
    securityScope: r.security_scope,
    revision: Number(r.revision),
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
    deletedAt: r.deleted_at ? r.deleted_at.toISOString() : null,
  };
}

export type TaskWithSeq = Task & { seq: number };

function parseDeadlineFields(deadline?: TaskDeadline | null): {
  deadlineType: 'none' | 'date' | 'timed';
  deadlineDate: string | null;
  deadlineTime: string | null;
  deadlineZone: string | null;
} {
  if (!deadline || deadline.type === 'none') {
    return {
      deadlineType: 'none',
      deadlineDate: null,
      deadlineTime: null,
      deadlineZone: null,
    };
  }

  if (deadline.type === 'date') {
    if (!isValidCalendarDateString(deadline.date)) {
      throw new ValidationError(
        `INVALID_CALENDAR_DATE: '${deadline.date}' is not a valid calendar date`
      );
    }
    return {
      deadlineType: 'date',
      deadlineDate: deadline.date,
      deadlineTime: null,
      deadlineZone: null,
    };
  }

  if (deadline.type === 'timed') {
    if (!isValidIanaTimezone(deadline.timezone)) {
      throw new ValidationError(
        `INVALID_TIMEZONE: '${deadline.timezone}' is not a recognized IANA timezone`
      );
    }
    const d = new Date(deadline.timestamp);
    if (isNaN(d.getTime())) {
      throw new ValidationError(
        `INVALID_TIMESTAMP: '${deadline.timestamp}' is not a valid ISO instant`
      );
    }
    return {
      deadlineType: 'timed',
      deadlineDate: null,
      deadlineTime: d.toISOString(),
      deadlineZone: deadline.timezone,
    };
  }

  return {
    deadlineType: 'none',
    deadlineDate: null,
    deadlineTime: null,
    deadlineZone: null,
  };
}

export async function createTask(
  client: PoolClient,
  workspaceId: string,
  actorUserId: string,
  input: CreateTaskRequest,
  operationId?: string
): Promise<TaskWithSeq> {
  const taskId = input.id || crypto.randomUUID();
  const title = validateTaskTitle(input.title);
  const folderId = input.folderId || null;
  const rank = input.rank || '00001000';
  const isPinned = Boolean(input.isPinned);
  const securityScope = input.securityScope || 'standard';
  const priority = input.priority || 'normal';
  const status = input.status || 'todo';
  const parentId = input.parentId || null;
  const subtaskOrder = input.subtaskOrder ?? 0;
  const tags = input.tags || [];
  const details = input.details || null;

  // 1. Verify target folder exists and matches security scope
  if (folderId) {
    const fRes = await client.query<{ id: string; security_scope: string }>(
      `SELECT id, security_scope FROM app.items
       WHERE workspace_id = $1 AND id = $2 AND kind = 'folder' AND deleted_at IS NULL;`,
      [workspaceId, folderId]
    );
    if (fRes.rows.length === 0) {
      throw new ValidationError(`Target folder ${folderId} does not exist or has been deleted.`);
    }
    if (fRes.rows[0]!.security_scope !== securityScope) {
      throw new ValidationError(
        `Target folder security scope '${fRes.rows[0]!.security_scope}' does not match task scope '${securityScope}'.`
      );
    }
  }

  // 2. Validate subtask parent relationship
  if (parentId) {
    if (parentId === taskId) {
      throw new ValidationError('TASK_SELF_PARENTING: A task cannot be its own parent');
    }
    const pRes = await client.query<{
      id: string;
      workspace_id: string;
      parent_id: string | null;
      folder_id: string | null;
    }>(
      `SELECT t.id, t.workspace_id, t.parent_id, i.folder_id
       FROM app.tasks t
       JOIN app.items i ON i.workspace_id = t.workspace_id AND i.id = t.id
       WHERE t.workspace_id = $1 AND t.id = $2 AND i.deleted_at IS NULL;`,
      [workspaceId, parentId]
    );
    if (pRes.rows.length === 0) {
      throw new ValidationError(`Parent task ${parentId} does not exist in this workspace.`);
    }

    // Build hierarchy lookup to detect cycles and depth
    const parentMapRes = await client.query<{ id: string; parent_id: string | null }>(
      `SELECT id, parent_id FROM app.tasks WHERE workspace_id = $1;`,
      [workspaceId]
    );
    const parentMap = new Map<string, string | null>();
    for (const row of parentMapRes.rows) {
      parentMap.set(row.id, row.parent_id);
    }

    const validation = validateSubtaskHierarchy(taskId, parentId, (id) => parentMap.get(id));
    if (!validation.isValid) {
      throw new ValidationError(validation.error || 'Invalid subtask hierarchy');
    }
  }

  // 3. Parse deadline
  const { deadlineType, deadlineDate, deadlineTime, deadlineZone } = parseDeadlineFields(
    input.deadline
  );

  // 4. Determine initial completion state
  const isCompleted = status === 'completed';
  const nowIso = new Date().toISOString();
  const completedAt = isCompleted ? nowIso : null;
  const completionHistory = isCompleted ? [{ completedAt: nowIso }] : [];

  // 5. Acquire workspace row-lock
  const syncState = await lockWorkspaceSyncState(client, workspaceId);

  // 6. Insert into app.items
  await client.query(
    `INSERT INTO app.items (
      id, workspace_id, folder_id, kind, created_by, updated_by,
      revision, rank, is_archived, is_pinned, security_scope
    ) VALUES ($1, $2, $3, 'task', $4, $4, 1, $5, false, $6, $7);`,
    [taskId, workspaceId, folderId, actorUserId, rank, isPinned, securityScope]
  );

  // 7. Insert into app.tasks
  await client.query(
    `INSERT INTO app.tasks (
      id, workspace_id, title, details, priority, status,
      deadline_type, deadline_date, deadline_time, deadline_zone,
      completed_at, reopened_at, completion_history,
      parent_id, subtask_order, tags
    ) VALUES (
      $1, $2, $3, $4, $5, $6,
      $7, $8, $9, $10,
      $11, null, $12,
      $13, $14, $15
    );`,
    [
      taskId,
      workspaceId,
      title,
      details,
      priority,
      status,
      deadlineType,
      deadlineDate,
      deadlineTime,
      deadlineZone,
      completedAt,
      JSON.stringify(completionHistory),
      parentId,
      subtaskOrder,
      tags,
    ]
  );

  const seq = syncState.nextChangeSeq;

  // 8. Record change event and outbox intent
  await insertChange(client, {
    workspaceId,
    seq,
    entityType: 'item',
    entityId: taskId,
    revision: 1,
    isTombstone: false,
    operationId: operationId || crypto.randomUUID(),
    changeData: {
      kind: 'task',
      title,
      details,
      priority,
      status,
      deadline: input.deadline || { type: 'none' },
      completedAt,
      reopenedAt: null,
      completionHistory,
      parentId,
      subtaskOrder,
      tags,
      folderId,
      rank,
      isPinned,
      isArchived: false,
      securityScope,
    },
  });

  await insertOutboxIntent(client, {
    workspaceId,
    eventType: 'task.created',
    payload: { taskId, revision: 1, seq },
  });

  await updateWorkspaceSyncSeq(client, workspaceId, seq + 1);

  return {
    id: taskId,
    workspaceId,
    folderId,
    title,
    details,
    priority,
    status,
    deadline: input.deadline || { type: 'none' },
    completedAt,
    reopenedAt: null,
    completionHistory,
    parentId,
    subtaskOrder,
    tags,
    rank,
    isArchived: false,
    isPinned,
    securityScope,
    revision: 1,
    createdAt: nowIso,
    updatedAt: nowIso,
    deletedAt: null,
    seq,
  };
}

export async function getTask(
  client: PoolClient,
  workspaceId: string,
  taskId: string,
  includeDeleted = false
): Promise<Task> {
  const res = await client.query<TaskDbRow>(
    `SELECT
      i.id, i.workspace_id, i.folder_id, i.kind, i.created_by, i.updated_by,
      i.created_at, i.updated_at, i.deleted_at, i.revision, i.rank,
      i.is_archived, i.is_pinned, i.security_scope,
      t.title, t.details, t.priority, t.status,
      t.deadline_type, t.deadline_date, t.deadline_time, t.deadline_zone,
      t.completed_at, t.reopened_at, t.completion_history,
      t.parent_id, t.subtask_order, t.tags
    FROM app.items i
    JOIN app.tasks t ON t.workspace_id = i.workspace_id AND t.id = i.id
    WHERE i.workspace_id = $1 AND i.id = $2;`,
    [workspaceId, taskId]
  );

  if (res.rows.length === 0) {
    throw new NotFoundError(`Task ${taskId} not found in workspace ${workspaceId}`);
  }

  const row = res.rows[0]!;
  if (!includeDeleted && row.deleted_at) {
    throw new NotFoundError(`Task ${taskId} is in trash.`);
  }

  return mapRowToTask(row);
}

export async function listTasks(
  client: PoolClient,
  workspaceId: string,
  query: TaskListQuery
): Promise<Task[]> {
  const conditions: string[] = ['i.workspace_id = $1', "i.kind IN ('task', 'todo')"];
  const params: unknown[] = [workspaceId];
  let paramIdx = 2;

  // Folder filter
  if (query.folderId !== undefined) {
    if (query.folderId === null) {
      conditions.push('i.folder_id IS NULL');
    } else {
      conditions.push(`i.folder_id = $${paramIdx++}`);
      params.push(query.folderId);
    }
  }

  // Priority filter
  if (query.priority) {
    conditions.push(`t.priority = $${paramIdx++}`);
    params.push(query.priority);
  }

  // Parent filter (subtasks)
  if (query.parentId !== undefined) {
    if (query.parentId === null) {
      conditions.push('t.parent_id IS NULL');
    } else {
      conditions.push(`t.parent_id = $${paramIdx++}`);
      params.push(query.parentId);
    }
  }

  // Tag filter
  if (query.tag) {
    conditions.push(`$${paramIdx++} = ANY(t.tags)`);
    params.push(query.tag);
  }

  // Status / View filter
  if (query.status) {
    if (query.status === 'incomplete') {
      conditions.push("t.status IN ('todo', 'in_progress')");
    } else if (query.status !== 'all') {
      conditions.push(`t.status = $${paramIdx++}`);
      params.push(query.status);
    }
  }

  const userTz = query.userTimezone || 'UTC';
  const todayDateStr = getCalendarDateInTimezone(new Date(), userTz);

  if (query.filter === 'today') {
    conditions.push(
      `(t.deadline_type = 'date' AND t.deadline_date = $${paramIdx++}) OR (t.deadline_type = 'timed' AND to_char(t.deadline_time AT TIME ZONE '${userTz}', 'YYYY-MM-DD') = $${paramIdx++})`
    );
    params.push(todayDateStr, todayDateStr);
  } else if (query.filter === 'overdue') {
    conditions.push("t.status NOT IN ('completed', 'cancelled')");
    conditions.push(
      `((t.deadline_type = 'date' AND t.deadline_date < $${paramIdx++}) OR (t.deadline_type = 'timed' AND t.deadline_time < now()))`
    );
    params.push(todayDateStr);
  } else if (query.filter === 'undated') {
    conditions.push("t.deadline_type = 'none'");
  } else if (query.filter === 'completed') {
    conditions.push("t.status = 'completed'");
  } else if (query.filter === 'upcoming') {
    conditions.push(
      `((t.deadline_type = 'date' AND t.deadline_date >= $${paramIdx++}) OR (t.deadline_type = 'timed' AND t.deadline_time >= now()))`
    );
    params.push(todayDateStr);
  }

  conditions.push('i.deleted_at IS NULL');

  const sql = `
    SELECT
      i.id, i.workspace_id, i.folder_id, i.kind, i.created_by, i.updated_by,
      i.created_at, i.updated_at, i.deleted_at, i.revision, i.rank,
      i.is_archived, i.is_pinned, i.security_scope,
      t.title, t.details, t.priority, t.status,
      t.deadline_type, t.deadline_date, t.deadline_time, t.deadline_zone,
      t.completed_at, t.reopened_at, t.completion_history,
      t.parent_id, t.subtask_order, t.tags
    FROM app.items i
    JOIN app.tasks t ON t.workspace_id = i.workspace_id AND t.id = i.id
    WHERE ${conditions.join(' AND ')}
    LIMIT $${paramIdx};
  `;
  params.push(query.limit || 50);

  const res = await client.query<TaskDbRow>(sql, params);
  const tasks = res.rows.map(mapRowToTask);

  // Apply deterministic domain sorting
  if (query.sortBy === 'deadline' || !query.sortBy) {
    tasks.sort((a, b) => compareTasksUpcoming(a, b, userTz));
    if (query.sortDirection === 'desc') {
      tasks.reverse();
    }
  }

  return tasks;
}

export async function updateTask(
  client: PoolClient,
  workspaceId: string,
  taskId: string,
  actorUserId: string,
  input: UpdateTaskRequest,
  operationId?: string
): Promise<TaskWithSeq> {
  const current = await getTask(client, workspaceId, taskId);

  if (current.revision !== input.baseRevision) {
    throw new ConflictError(
      `Revision conflict on task ${taskId}: baseRevision ${input.baseRevision} does not match current ${current.revision}`
    );
  }

  const title = input.title !== undefined ? validateTaskTitle(input.title) : current.title;
  const details = input.details !== undefined ? input.details : current.details;
  const priority = input.priority !== undefined ? input.priority : current.priority;
  const rank = input.rank !== undefined ? input.rank : current.rank;
  const isPinned = input.isPinned !== undefined ? input.isPinned : current.isPinned;
  const isArchived = input.isArchived !== undefined ? input.isArchived : current.isArchived;
  const tags = input.tags !== undefined ? input.tags : current.tags;
  const subtaskOrder = input.subtaskOrder !== undefined ? input.subtaskOrder : current.subtaskOrder;

  let folderId = current.folderId;
  if (input.folderId !== undefined) {
    folderId = input.folderId;
    if (folderId) {
      const fRes = await client.query<{ id: string; security_scope: string }>(
        `SELECT id, security_scope FROM app.items
         WHERE workspace_id = $1 AND id = $2 AND kind = 'folder' AND deleted_at IS NULL;`,
        [workspaceId, folderId]
      );
      if (fRes.rows.length === 0) {
        throw new ValidationError(`Target folder ${folderId} does not exist or has been deleted.`);
      }
    }
  }

  let parentId = current.parentId;
  if (input.parentId !== undefined) {
    parentId = input.parentId;
    if (parentId) {
      if (parentId === taskId) {
        throw new ValidationError('TASK_SELF_PARENTING: A task cannot be its own parent');
      }
      const parentMapRes = await client.query<{ id: string; parent_id: string | null }>(
        `SELECT id, parent_id FROM app.tasks WHERE workspace_id = $1;`,
        [workspaceId]
      );
      const parentMap = new Map<string, string | null>();
      for (const row of parentMapRes.rows) {
        parentMap.set(row.id, row.parent_id);
      }
      const validation = validateSubtaskHierarchy(taskId, parentId, (id) => parentMap.get(id));
      if (!validation.isValid) {
        throw new ValidationError(validation.error || 'Invalid subtask hierarchy');
      }
    }
  }

  // Handle status transitions and completion/reopening history
  let status = current.status;
  let completedAt = current.completedAt;
  let reopenedAt = current.reopenedAt;
  const completionHistory = [...current.completionHistory];

  if (input.status !== undefined && input.status !== current.status) {
    status = input.status;
    const nowIso = new Date().toISOString();
    if (status === 'completed') {
      completedAt = nowIso;
      reopenedAt = null;
      completionHistory.push({ completedAt: nowIso });
    } else if (current.status === 'completed' || current.status === 'cancelled') {
      completedAt = null;
      reopenedAt = nowIso;
      if (completionHistory.length > 0) {
        const last = completionHistory[completionHistory.length - 1]!;
        if (!last.reopenedAt) {
          completionHistory[completionHistory.length - 1] = { ...last, reopenedAt: nowIso };
        } else {
          completionHistory.push({ completedAt: nowIso, reopenedAt: nowIso });
        }
      }
    }
  }

  // Handle deadline updates
  let deadline = current.deadline;
  let deadlineType = current.deadline.type;
  let deadlineDate: string | null = null;
  let deadlineTime: string | null = null;
  let deadlineZone: string | null = null;

  if (input.deadline !== undefined) {
    const parsed = parseDeadlineFields(input.deadline);
    deadlineType = parsed.deadlineType;
    deadlineDate = parsed.deadlineDate;
    deadlineTime = parsed.deadlineTime;
    deadlineZone = parsed.deadlineZone;
    deadline = input.deadline || { type: 'none' };
  } else {
    const parsed = parseDeadlineFields(current.deadline);
    deadlineType = parsed.deadlineType;
    deadlineDate = parsed.deadlineDate;
    deadlineTime = parsed.deadlineTime;
    deadlineZone = parsed.deadlineZone;
  }

  const nextRev = current.revision + 1;
  const nowIso = new Date().toISOString();

  // Lock sync state
  const syncState = await lockWorkspaceSyncState(client, workspaceId);

  // Update app.items
  await client.query(
    `UPDATE app.items SET
      folder_id = $1,
      updated_by = $2,
      revision = $3,
      rank = $4,
      is_archived = $5,
      is_pinned = $6,
      updated_at = $7
    WHERE workspace_id = $8 AND id = $9;`,
    [folderId, actorUserId, nextRev, rank, isArchived, isPinned, nowIso, workspaceId, taskId]
  );

  // Update app.tasks
  await client.query(
    `UPDATE app.tasks SET
      title = $1,
      details = $2,
      priority = $3,
      status = $4,
      deadline_type = $5,
      deadline_date = $6,
      deadline_time = $7,
      deadline_zone = $8,
      completed_at = $9,
      reopened_at = $10,
      completion_history = $11,
      parent_id = $12,
      subtask_order = $13,
      tags = $14,
      updated_at = $15
    WHERE workspace_id = $16 AND id = $17;`,
    [
      title,
      details,
      priority,
      status,
      deadlineType,
      deadlineDate,
      deadlineTime,
      deadlineZone,
      completedAt,
      reopenedAt,
      JSON.stringify(completionHistory),
      parentId,
      subtaskOrder,
      tags,
      nowIso,
      workspaceId,
      taskId,
    ]
  );

  const seq = syncState.nextChangeSeq;

  await insertChange(client, {
    workspaceId,
    seq,
    entityType: 'item',
    entityId: taskId,
    revision: nextRev,
    isTombstone: false,
    operationId: operationId || crypto.randomUUID(),
    changeData: {
      kind: 'task',
      title,
      details,
      priority,
      status,
      deadline,
      completedAt,
      reopenedAt,
      completionHistory,
      parentId,
      subtaskOrder,
      tags,
      folderId,
      rank,
      isPinned,
      isArchived,
      securityScope: current.securityScope,
    },
  });

  await insertOutboxIntent(client, {
    workspaceId,
    eventType: 'task.updated',
    payload: { taskId, revision: nextRev, seq },
  });

  await updateWorkspaceSyncSeq(client, workspaceId, seq + 1);

  return {
    ...current,
    title,
    details,
    priority,
    status,
    deadline,
    completedAt,
    reopenedAt,
    completionHistory,
    parentId,
    subtaskOrder,
    tags,
    folderId,
    rank,
    isArchived,
    isPinned,
    revision: nextRev,
    updatedAt: nowIso,
    seq,
  };
}

export async function completeTaskService(
  client: PoolClient,
  workspaceId: string,
  taskId: string,
  actorUserId: string,
  input: CompleteTaskRequest = {},
  operationId?: string
): Promise<TaskWithSeq> {
  const current = await getTask(client, workspaceId, taskId);

  // Idempotent completion retry: if already completed, return existing without rewriting instant
  if (current.status === 'completed') {
    return {
      ...current,
      seq: 0,
    };
  }

  return updateTask(
    client,
    workspaceId,
    taskId,
    actorUserId,
    {
      baseRevision: input.baseRevision ?? current.revision,
      status: 'completed',
    },
    operationId
  );
}

export async function reopenTaskService(
  client: PoolClient,
  workspaceId: string,
  taskId: string,
  actorUserId: string,
  input: ReopenTaskRequest = {},
  operationId?: string
): Promise<TaskWithSeq> {
  const current = await getTask(client, workspaceId, taskId);

  if (current.status === 'todo') {
    return {
      ...current,
      seq: 0,
    };
  }

  return updateTask(
    client,
    workspaceId,
    taskId,
    actorUserId,
    {
      baseRevision: input.baseRevision ?? current.revision,
      status: 'todo',
    },
    operationId
  );
}

export async function trashTask(
  client: PoolClient,
  workspaceId: string,
  taskId: string,
  actorUserId: string,
  expectedRevision?: number,
  operationId?: string
): Promise<{ id: string; revision: number; seq: number }> {
  const current = await getTask(client, workspaceId, taskId);

  if (expectedRevision !== undefined && current.revision !== expectedRevision) {
    throw new ConflictError(
      `Revision conflict on trashing task ${taskId}: expected ${expectedRevision}, found ${current.revision}`
    );
  }

  const nextRev = current.revision + 1;
  const nowIso = new Date().toISOString();
  const syncState = await lockWorkspaceSyncState(client, workspaceId);

  await client.query(
    `UPDATE app.items SET
      deleted_at = $1,
      updated_by = $2,
      revision = $3,
      updated_at = $1
    WHERE workspace_id = $4 AND id = $5;`,
    [nowIso, actorUserId, nextRev, workspaceId, taskId]
  );

  const seq = syncState.nextChangeSeq;

  await insertChange(client, {
    workspaceId,
    seq,
    entityType: 'item',
    entityId: taskId,
    revision: nextRev,
    isTombstone: true,
    operationId: operationId || crypto.randomUUID(),
    changeData: {
      deletedAt: nowIso,
    },
  });

  await insertOutboxIntent(client, {
    workspaceId,
    eventType: 'task.trashed',
    payload: { taskId, revision: nextRev, seq },
  });

  await updateWorkspaceSyncSeq(client, workspaceId, seq + 1);

  return { id: taskId, revision: nextRev, seq };
}

export async function restoreTask(
  client: PoolClient,
  workspaceId: string,
  taskId: string,
  actorUserId: string,
  expectedRevision?: number,
  operationId?: string
): Promise<TaskWithSeq> {
  const current = await getTask(client, workspaceId, taskId, true);

  if (expectedRevision !== undefined && current.revision !== expectedRevision) {
    throw new ConflictError(
      `Revision conflict on restoring task ${taskId}: expected ${expectedRevision}, found ${current.revision}`
    );
  }

  if (!current.deletedAt) {
    return {
      ...current,
      seq: 0,
    };
  }

  const nextRev = current.revision + 1;
  const nowIso = new Date().toISOString();
  const syncState = await lockWorkspaceSyncState(client, workspaceId);

  await client.query(
    `UPDATE app.items SET
      deleted_at = null,
      updated_by = $1,
      revision = $2,
      updated_at = $3
    WHERE workspace_id = $4 AND id = $5;`,
    [actorUserId, nextRev, nowIso, workspaceId, taskId]
  );

  const seq = syncState.nextChangeSeq;

  await insertChange(client, {
    workspaceId,
    seq,
    entityType: 'item',
    entityId: taskId,
    revision: nextRev,
    isTombstone: false,
    operationId: operationId || crypto.randomUUID(),
    changeData: {
      ...current,
      revision: nextRev,
      deletedAt: null,
      updatedAt: nowIso,
    },
  });

  await insertOutboxIntent(client, {
    workspaceId,
    eventType: 'task.restored',
    payload: { taskId, revision: nextRev, seq },
  });

  await updateWorkspaceSyncSeq(client, workspaceId, seq + 1);

  return {
    ...current,
    deletedAt: null,
    revision: nextRev,
    updatedAt: nowIso,
    seq,
  };
}
