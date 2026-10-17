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
} from '@daynori/domain';
import {
  lockWorkspaceSyncState,
  insertChange,
  insertOutboxIntent,
  updateWorkspaceSyncSeq,
} from '../sync/repository.js';
import { NotFoundError, ConflictError, ValidationError } from '../../plugins/errorHandler.js';
import { invalidateTargetReminders, rebuildTargetReminders } from '../reminders/service.js';

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

/**
 * Computes ancestor depth of a task. Root tasks have depth 1.
 */
export function getTaskAncestorDepth(
  taskId: string,
  parentLookup: (id: string) => string | null | undefined
): number {
  let depth = 1;
  let curr = parentLookup(taskId);
  const visited = new Set<string>([taskId]);
  while (curr) {
    if (visited.has(curr)) break;
    visited.add(curr);
    depth++;
    curr = parentLookup(curr);
  }
  return depth;
}

/**
 * Computes descendant depth of a task subtree. A leaf task has depth 0.
 */
export function getSubtaskSubtreeDepth(
  taskId: string,
  parentMap: Map<string, string | null>
): number {
  let maxChildDepth = 0;
  for (const [id, pId] of parentMap.entries()) {
    if (pId === taskId) {
      const childDepth = 1 + getSubtaskSubtreeDepth(id, parentMap);
      if (childDepth > maxChildDepth) {
        maxChildDepth = childDepth;
      }
    }
  }
  return maxChildDepth;
}

/**
 * Reconciles task tags with canonical workspace app.tags and app.item_tags tables.
 */
async function syncItemTags(
  client: PoolClient,
  workspaceId: string,
  itemId: string,
  actorUserId: string,
  tagNames: string[]
): Promise<string[]> {
  const normalized = Array.from(new Set(tagNames.map((t) => t.trim()).filter(Boolean)));
  await client.query(`DELETE FROM app.item_tags WHERE workspace_id = $1 AND item_id = $2;`, [
    workspaceId,
    itemId,
  ]);
  if (normalized.length === 0) {
    return [];
  }
  for (const name of normalized) {
    const tagRes = await client.query<{ id: string }>(
      `INSERT INTO app.tags (workspace_id, name, created_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (workspace_id, lower(name))
       DO UPDATE SET deleted_at = NULL, updated_at = now()
       RETURNING id;`,
      [workspaceId, name, actorUserId]
    );
    const tagId = tagRes.rows[0]!.id;
    await client.query(
      `INSERT INTO app.item_tags (workspace_id, item_id, tag_id, created_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (workspace_id, item_id, tag_id) DO NOTHING;`,
      [workspaceId, itemId, tagId, actorUserId]
    );
  }
  return normalized;
}

export interface TaskCursorData {
  workspaceId: string;
  filter?: string;
  folderId?: string | null;
  status?: string;
  priority?: string;
  sortBy?: string;
  sortDirection?: string;
  userTimezone: string;
  offset: number;
}

export function encodeTaskCursor(data: TaskCursorData): string {
  return Buffer.from(JSON.stringify(data), 'utf8').toString('base64url');
}

export function decodeTaskCursor(
  cursorStr: string,
  workspaceId: string,
  query: TaskListQuery
): number {
  try {
    const raw = Buffer.from(cursorStr, 'base64url').toString('utf8');
    const parsed = JSON.parse(raw) as TaskCursorData;
    if (parsed.workspaceId !== workspaceId) {
      throw new ValidationError('INVALID_CURSOR: Cursor does not match current workspace');
    }
    const expectedTz = query.userTimezone || 'UTC';
    if (
      (parsed.filter || 'all') !== (query.filter || 'all') ||
      (parsed.sortBy || 'deadline') !== (query.sortBy || 'deadline') ||
      (parsed.sortDirection || 'asc') !== (query.sortDirection || 'asc') ||
      parsed.userTimezone !== expectedTz
    ) {
      throw new ValidationError('INVALID_CURSOR: Cursor parameters do not match query parameters');
    }
    if (typeof parsed.offset !== 'number' || parsed.offset < 0) {
      throw new ValidationError('INVALID_CURSOR: Cursor offset is invalid');
    }
    return parsed.offset;
  } catch (err: unknown) {
    if (err instanceof ValidationError) throw err;
    throw new ValidationError('INVALID_CURSOR: Malformed pagination cursor');
  }
}

export async function createTask(
  client: PoolClient,
  workspaceId: string,
  actorUserId: string,
  input: CreateTaskRequest,
  operationId?: string
): Promise<TaskWithSeq> {
  // Acquire workspace lock first to serialize hierarchy and sync state
  const syncState = await lockWorkspaceSyncState(client, workspaceId);

  const taskId = input.id || crypto.randomUUID();
  const title = validateTaskTitle(input.title);
  let folderId = input.folderId || null;
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

  // 2. Validate subtask parent relationship and depth
  if (parentId) {
    if (parentId === taskId) {
      throw new ValidationError('TASK_SELF_PARENTING: A task cannot be its own parent');
    }
    const pRes = await client.query<{
      id: string;
      workspace_id: string;
      parent_id: string | null;
      folder_id: string | null;
      security_scope: 'standard' | 'vault';
    }>(
      `SELECT t.id, t.workspace_id, t.parent_id, i.folder_id, i.security_scope
       FROM app.tasks t
       JOIN app.items i ON i.workspace_id = t.workspace_id AND i.id = t.id
       WHERE t.workspace_id = $1 AND t.id = $2 AND i.deleted_at IS NULL;`,
      [workspaceId, parentId]
    );
    if (pRes.rows.length === 0) {
      throw new ValidationError(`Parent task ${parentId} does not exist in this workspace.`);
    }

    const parentRow = pRes.rows[0]!;
    if (parentRow.security_scope !== securityScope) {
      throw new ValidationError(
        `Parent task security scope '${parentRow.security_scope}' does not match task scope '${securityScope}'.`
      );
    }

    // Documented folder policy: inherit parent's folder placement unless explicitly placed
    if (!folderId && parentRow.folder_id) {
      folderId = parentRow.folder_id;
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

    const parentDepth = getTaskAncestorDepth(parentId, (id) => parentMap.get(id));
    if (parentDepth + 1 > 3) {
      throw new ValidationError('SUBTASK_DEPTH_EXCEEDED: Subtask hierarchy cannot exceed 3 levels');
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

  // 5. Insert into app.items
  await client.query(
    `INSERT INTO app.items (
      id, workspace_id, folder_id, kind, created_by, updated_by,
      revision, rank, is_archived, is_pinned, security_scope
    ) VALUES ($1, $2, $3, 'task', $4, $4, 1, $5, false, $6, $7);`,
    [taskId, workspaceId, folderId, actorUserId, rank, isPinned, securityScope]
  );

  // 6. Synchronize canonical tags
  const reconciledTags = await syncItemTags(client, workspaceId, taskId, actorUserId, tags);

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
      reconciledTags,
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
      tags: reconciledTags,
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
    tags: reconciledTags,
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
): Promise<{ tasks: Task[]; nextCursor?: string }> {
  if (query.userTimezone && !isValidIanaTimezone(query.userTimezone)) {
    throw new ValidationError(
      `INVALID_TIMEZONE: '${query.userTimezone}' is not a recognized IANA timezone`
    );
  }
  const userTz = query.userTimezone || 'UTC';
  const todayDateStr = getCalendarDateInTimezone(new Date(), userTz);

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
    conditions.push(
      `($${paramIdx} = ANY(t.tags) OR EXISTS (
        SELECT 1 FROM app.item_tags it
        JOIN app.tags tg ON tg.workspace_id = it.workspace_id AND tg.id = it.tag_id
        WHERE it.workspace_id = i.workspace_id AND it.item_id = i.id AND lower(tg.name) = lower($${paramIdx})
      ))`
    );
    params.push(query.tag);
    paramIdx++;
  }

  // View / filter rules
  if (query.filter === 'today') {
    conditions.push("t.status IN ('todo', 'in_progress')");
    conditions.push('i.is_archived = false');
    conditions.push(
      `((t.deadline_type = 'date' AND t.deadline_date = $${paramIdx++}) OR (t.deadline_type = 'timed' AND to_char(t.deadline_time AT TIME ZONE $${paramIdx++}, 'YYYY-MM-DD') = $${paramIdx++}))`
    );
    params.push(todayDateStr, userTz, todayDateStr);
  } else if (query.filter === 'overdue') {
    conditions.push("t.status NOT IN ('completed', 'cancelled')");
    conditions.push('i.is_archived = false');
    conditions.push("t.deadline_type <> 'none'");
    conditions.push(
      `((t.deadline_type = 'date' AND t.deadline_date < $${paramIdx++}) OR (t.deadline_type = 'timed' AND t.deadline_time < now()))`
    );
    params.push(todayDateStr);
  } else if (query.filter === 'undated') {
    conditions.push("t.status IN ('todo', 'in_progress')");
    conditions.push('i.is_archived = false');
    conditions.push("t.deadline_type = 'none'");
  } else if (query.filter === 'completed') {
    conditions.push("t.status = 'completed'");
  } else if (query.filter === 'upcoming') {
    conditions.push("t.status IN ('todo', 'in_progress')");
    conditions.push('i.is_archived = false');
    conditions.push(
      `((t.deadline_type = 'date' AND t.deadline_date >= $${paramIdx++}) OR (t.deadline_type = 'timed' AND t.deadline_time >= now()))`
    );
    params.push(todayDateStr);
  } else {
    // Default view: honor status filter if specified
    if (query.status) {
      if (query.status === 'incomplete') {
        conditions.push("t.status IN ('todo', 'in_progress')");
      } else if (query.status !== 'all') {
        conditions.push(`t.status = $${paramIdx++}`);
        params.push(query.status);
      }
    }
  }

  conditions.push('i.deleted_at IS NULL');

  // Handle pagination offset from cursor
  let offset = 0;
  if (query.cursor) {
    offset = decodeTaskCursor(query.cursor, workspaceId, query);
  }

  // Deterministic SQL ORDER BY before LIMIT
  const sortBy = query.sortBy || 'deadline';
  const sortDirection = query.sortDirection || 'asc';
  let orderByClause = '';

  if (sortBy === 'deadline') {
    const tzParamIdx = paramIdx++;
    params.push(userTz);

    if (sortDirection === 'desc') {
      orderByClause = `
        ORDER BY
          CASE WHEN t.deadline_type = 'none' THEN 1 ELSE 0 END DESC,
          CASE
            WHEN t.deadline_type = 'timed' THEN t.deadline_time
            WHEN t.deadline_date IS NOT NULL THEN (t.deadline_date || ' 23:59:59.999')::timestamp AT TIME ZONE $${tzParamIdx}
            ELSE NULL
          END DESC NULLS LAST,
          CASE t.priority
            WHEN 'urgent' THEN 4
            WHEN 'high' THEN 3
            WHEN 'normal' THEN 2
            WHEN 'low' THEN 1
            ELSE 2
          END DESC,
          i.created_at ASC,
          i.id ASC
      `;
    } else {
      orderByClause = `
        ORDER BY
          CASE WHEN t.deadline_type = 'none' THEN 1 ELSE 0 END ASC,
          CASE
            WHEN t.deadline_type = 'timed' THEN t.deadline_time
            WHEN t.deadline_date IS NOT NULL THEN (t.deadline_date || ' 23:59:59.999')::timestamp AT TIME ZONE $${tzParamIdx}
            ELSE NULL
          END ASC NULLS LAST,
          CASE t.priority
            WHEN 'urgent' THEN 4
            WHEN 'high' THEN 3
            WHEN 'normal' THEN 2
            WHEN 'low' THEN 1
            ELSE 2
          END DESC,
          i.created_at ASC,
          i.id ASC
      `;
    }
  } else if (sortBy === 'priority') {
    const dir = sortDirection === 'desc' ? 'ASC' : 'DESC';
    orderByClause = `
      ORDER BY
        CASE t.priority
          WHEN 'urgent' THEN 4
          WHEN 'high' THEN 3
          WHEN 'normal' THEN 2
          WHEN 'low' THEN 1
          ELSE 2
        END ${dir},
        i.created_at ASC,
        i.id ASC
    `;
  } else if (sortBy === 'created') {
    const dir = sortDirection === 'desc' ? 'DESC' : 'ASC';
    orderByClause = `ORDER BY i.created_at ${dir}, i.id ASC`;
  } else if (sortBy === 'rank') {
    const dir = sortDirection === 'desc' ? 'DESC' : 'ASC';
    orderByClause = `ORDER BY i.rank ${dir}, i.id ASC`;
  }

  const limit = query.limit || 50;
  const limitParamIdx = paramIdx++;
  params.push(limit + 1);
  const offsetParamIdx = paramIdx++;
  params.push(offset);

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
    ${orderByClause}
    LIMIT $${limitParamIdx} OFFSET $${offsetParamIdx};
  `;

  const res = await client.query<TaskDbRow>(sql, params);
  const rows = res.rows;
  let nextCursor: string | undefined;

  if (rows.length > limit) {
    rows.pop();
    nextCursor = encodeTaskCursor({
      workspaceId,
      filter: query.filter,
      folderId: query.folderId,
      status: typeof query.status === 'string' ? query.status : undefined,
      priority: query.priority,
      sortBy: query.sortBy,
      sortDirection: query.sortDirection,
      userTimezone: userTz,
      offset: offset + limit,
    });
  }

  const tasks = rows.map(mapRowToTask);
  return { tasks, nextCursor };
}

export async function updateTask(
  client: PoolClient,
  workspaceId: string,
  taskId: string,
  actorUserId: string,
  input: UpdateTaskRequest,
  operationId?: string
): Promise<TaskWithSeq> {
  // 1. Acquire workspace lock BEFORE reading authoritative state to eliminate TOCTOU race conditions
  const syncState = await lockWorkspaceSyncState(client, workspaceId);

  // 2. Authoritative read under the lock
  const current = await getTask(client, workspaceId, taskId);

  if (
    input.baseRevision === undefined ||
    input.baseRevision === 0 ||
    current.revision !== input.baseRevision
  ) {
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
      if (fRes.rows[0]!.security_scope !== current.securityScope) {
        throw new ValidationError(
          `Target folder security scope '${fRes.rows[0]!.security_scope}' does not match task scope '${current.securityScope}'.`
        );
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

      // Check parent exists and active in the same workspace
      const pRes = await client.query<{
        id: string;
        folder_id: string | null;
        security_scope: 'standard' | 'vault';
      }>(
        `SELECT t.id, i.folder_id, i.security_scope
         FROM app.tasks t
         JOIN app.items i ON i.workspace_id = t.workspace_id AND i.id = t.id
         WHERE t.workspace_id = $1 AND t.id = $2 AND i.deleted_at IS NULL;`,
        [workspaceId, parentId]
      );
      if (pRes.rows.length === 0) {
        throw new ValidationError(`Parent task ${parentId} does not exist or has been deleted.`);
      }
      const parentRow = pRes.rows[0]!;
      if (parentRow.security_scope !== current.securityScope) {
        throw new ValidationError(
          `Parent task security scope '${parentRow.security_scope}' does not match task scope '${current.securityScope}'.`
        );
      }

      // Documented folder policy: inherit parent folder if not explicitly specified
      if (input.folderId === undefined && parentRow.folder_id) {
        folderId = parentRow.folder_id;
      }

      const parentMapRes = await client.query<{ id: string; parent_id: string | null }>(
        `SELECT id, parent_id FROM app.tasks WHERE workspace_id = $1;`,
        [workspaceId]
      );
      const parentMap = new Map<string, string | null>();
      for (const row of parentMapRes.rows) {
        parentMap.set(row.id, row.parent_id);
      }

      // Validate cycle prevention
      const validation = validateSubtaskHierarchy(taskId, parentId, (id) => parentMap.get(id));
      if (!validation.isValid) {
        throw new ValidationError(validation.error || 'Invalid subtask hierarchy');
      }

      // Validate entire moved subtree depth
      const descendantDepth = getSubtaskSubtreeDepth(taskId, parentMap);
      const parentDepth = getTaskAncestorDepth(parentId, (id) => parentMap.get(id));
      if (parentDepth + 1 + descendantDepth > 3) {
        throw new ValidationError(
          'SUBTASK_DEPTH_EXCEEDED: Subtask hierarchy cannot exceed 3 levels'
        );
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

  // Synchronize tags
  let tags = current.tags;
  if (input.tags !== undefined) {
    tags = await syncItemTags(client, workspaceId, taskId, actorUserId, input.tags);
  }

  const nextRev = current.revision + 1;
  const nowIso = new Date().toISOString();

  // Atomic revision predicate on app.items
  const itemUpdateRes = await client.query(
    `UPDATE app.items SET
      folder_id = $1,
      updated_by = $2,
      revision = $3,
      rank = $4,
      is_archived = $5,
      is_pinned = $6,
      updated_at = $7
    WHERE workspace_id = $8 AND id = $9 AND revision = $10;`,
    [
      folderId,
      actorUserId,
      nextRev,
      rank,
      isArchived,
      isPinned,
      nowIso,
      workspaceId,
      taskId,
      input.baseRevision,
    ]
  );

  if (itemUpdateRes.rowCount === 0) {
    throw new ConflictError(
      `Revision conflict on task ${taskId}: baseRevision ${input.baseRevision} did not match concurrent revision`
    );
  }

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
      tags = $14
    WHERE workspace_id = $15 AND id = $16;`,
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
      workspaceId,
      taskId,
    ]
  );

  if (status === 'completed' || status === 'cancelled') {
    await invalidateTargetReminders(client, workspaceId, 'task', taskId, `task_${status}`);
  } else if (input.deadline !== undefined) {
    await rebuildTargetReminders(client, workspaceId, 'task', taskId, actorUserId, 'task_rescheduled');
  }

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
  // Acquire lock first to guard against concurrent writes
  const syncState = await lockWorkspaceSyncState(client, workspaceId);
  const current = await getTask(client, workspaceId, taskId);

  // Idempotent retry: if already completed, preserve existing instant and history
  if (current.status === 'completed') {
    return {
      ...current,
      seq: 0,
    };
  }

  const expectedRev = input.baseRevision !== undefined ? input.baseRevision : current.revision;
  if (input.baseRevision === 0 || expectedRev !== current.revision) {
    throw new ConflictError(
      `Revision conflict on completing task ${taskId}: baseRevision ${input.baseRevision} does not match current ${current.revision}`
    );
  }

  const nowIso = input.completedAt || new Date().toISOString();
  const nextRev = current.revision + 1;
  const completionHistory = [...current.completionHistory, { completedAt: nowIso }];

  const itemUpdateRes = await client.query(
    `UPDATE app.items SET
      revision = $1,
      updated_by = $2,
      updated_at = $3
    WHERE workspace_id = $4 AND id = $5 AND revision = $6;`,
    [nextRev, actorUserId, nowIso, workspaceId, taskId, current.revision]
  );

  if (itemUpdateRes.rowCount === 0) {
    throw new ConflictError(`Revision conflict on completing task ${taskId}`);
  }

  await client.query(
    `UPDATE app.tasks SET
      status = 'completed',
      completed_at = $1,
      reopened_at = null,
      completion_history = $2
    WHERE workspace_id = $3 AND id = $4;`,
    [nowIso, JSON.stringify(completionHistory), workspaceId, taskId]
  );

  await invalidateTargetReminders(client, workspaceId, 'task', taskId, 'task_completed');

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
      title: current.title,
      details: current.details,
      priority: current.priority,
      status: 'completed',
      deadline: current.deadline,
      completedAt: nowIso,
      reopenedAt: null,
      completionHistory,
      parentId: current.parentId,
      subtaskOrder: current.subtaskOrder,
      tags: current.tags,
      folderId: current.folderId,
      rank: current.rank,
      isPinned: current.isPinned,
      isArchived: current.isArchived,
      securityScope: current.securityScope,
    },
  });

  await insertOutboxIntent(client, {
    workspaceId,
    eventType: 'task.completed',
    payload: { taskId, revision: nextRev, seq },
  });

  await updateWorkspaceSyncSeq(client, workspaceId, seq + 1);

  return {
    ...current,
    status: 'completed',
    completedAt: nowIso,
    reopenedAt: null,
    completionHistory,
    revision: nextRev,
    updatedAt: nowIso,
    seq,
  };
}

export async function reopenTaskService(
  client: PoolClient,
  workspaceId: string,
  taskId: string,
  actorUserId: string,
  input: ReopenTaskRequest = {},
  operationId?: string
): Promise<TaskWithSeq> {
  const syncState = await lockWorkspaceSyncState(client, workspaceId);
  const current = await getTask(client, workspaceId, taskId);

  if (current.status === 'todo') {
    return {
      ...current,
      seq: 0,
    };
  }

  const expectedRev = input.baseRevision !== undefined ? input.baseRevision : current.revision;
  if (input.baseRevision === 0 || expectedRev !== current.revision) {
    throw new ConflictError(
      `Revision conflict on reopening task ${taskId}: baseRevision ${input.baseRevision} does not match current ${current.revision}`
    );
  }

  const nowIso = input.reopenedAt || new Date().toISOString();
  const nextRev = current.revision + 1;
  const completionHistory = [...current.completionHistory];
  if (completionHistory.length > 0) {
    const last = completionHistory[completionHistory.length - 1]!;
    if (!last.reopenedAt) {
      completionHistory[completionHistory.length - 1] = { ...last, reopenedAt: nowIso };
    } else {
      completionHistory.push({ completedAt: nowIso, reopenedAt: nowIso });
    }
  }

  const itemUpdateRes = await client.query(
    `UPDATE app.items SET
      revision = $1,
      updated_by = $2,
      updated_at = $3
    WHERE workspace_id = $4 AND id = $5 AND revision = $6;`,
    [nextRev, actorUserId, nowIso, workspaceId, taskId, current.revision]
  );

  if (itemUpdateRes.rowCount === 0) {
    throw new ConflictError(`Revision conflict on reopening task ${taskId}`);
  }

  await client.query(
    `UPDATE app.tasks SET
      status = 'todo',
      completed_at = null,
      reopened_at = $1,
      completion_history = $2
    WHERE workspace_id = $3 AND id = $4;`,
    [nowIso, JSON.stringify(completionHistory), workspaceId, taskId]
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
      title: current.title,
      details: current.details,
      priority: current.priority,
      status: 'todo',
      deadline: current.deadline,
      completedAt: null,
      reopenedAt: nowIso,
      completionHistory,
      parentId: current.parentId,
      subtaskOrder: current.subtaskOrder,
      tags: current.tags,
      folderId: current.folderId,
      rank: current.rank,
      isPinned: current.isPinned,
      isArchived: current.isArchived,
      securityScope: current.securityScope,
    },
  });

  await insertOutboxIntent(client, {
    workspaceId,
    eventType: 'task.reopened',
    payload: { taskId, revision: nextRev, seq },
  });

  await updateWorkspaceSyncSeq(client, workspaceId, seq + 1);

  return {
    ...current,
    status: 'todo',
    completedAt: null,
    reopenedAt: nowIso,
    completionHistory,
    revision: nextRev,
    updatedAt: nowIso,
    seq,
  };
}

export async function trashTask(
  client: PoolClient,
  workspaceId: string,
  taskId: string,
  actorUserId: string,
  expectedRevision?: number,
  operationId?: string
): Promise<{ id: string; revision: number; seq: number }> {
  const syncState = await lockWorkspaceSyncState(client, workspaceId);
  const current = await getTask(client, workspaceId, taskId);

  if (expectedRevision !== undefined && current.revision !== expectedRevision) {
    throw new ConflictError(
      `Revision conflict on trashing task ${taskId}: expected ${expectedRevision}, found ${current.revision}`
    );
  }

  const nextRev = current.revision + 1;
  const nowIso = new Date().toISOString();

  const itemRes = await client.query(
    `UPDATE app.items SET
      deleted_at = $1,
      updated_by = $2,
      revision = $3,
      updated_at = $1
    WHERE workspace_id = $4 AND id = $5 AND revision = $6;`,
    [nowIso, actorUserId, nextRev, workspaceId, taskId, current.revision]
  );

  if (itemRes.rowCount === 0) {
    throw new ConflictError(`Revision conflict on trashing task ${taskId}`);
  }

  await invalidateTargetReminders(client, workspaceId, 'task', taskId, 'task_deleted');

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
  const syncState = await lockWorkspaceSyncState(client, workspaceId);
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

  const itemRes = await client.query(
    `UPDATE app.items SET
      deleted_at = null,
      updated_by = $1,
      revision = $2,
      updated_at = $3
    WHERE workspace_id = $4 AND id = $5 AND revision = $6;`,
    [actorUserId, nextRev, nowIso, workspaceId, taskId, current.revision]
  );

  if (itemRes.rowCount === 0) {
    throw new ConflictError(`Revision conflict on restoring task ${taskId}`);
  }

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
      deletedAt: null,
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
