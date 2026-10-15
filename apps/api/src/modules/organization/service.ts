import type { PoolClient } from 'pg';
import crypto from 'node:crypto';
import type {
  CreateFolderRequest,
  UpdateFolderRequest,
  MoveFolderRequest,
  ReorderFolderRequest,
  ArchiveFolderRequest,
  PinFolderRequest,
  FolderDeletePolicy,
  CreateTagRequest,
  UpdateTagRequest,
  CreateItemLinkRequest,
  Tag,
  ItemTag,
  ItemLink,
} from '@daynori/contracts';
import {
  lockWorkspaceSyncState,
  insertChange,
  insertOutboxIntent,
  updateWorkspaceSyncSeq,
} from '../sync/repository.js';
import { rebalanceRanks } from '@daynori/domain';

import { ConflictError, ValidationError, NotFoundError } from '../../plugins/errorHandler.js';

export interface FolderRecord {
  id: string;
  workspaceId: string;
  parentId: string | null;
  name: string;
  color: string | null;
  icon: string | null;
  rank: string;
  isArchived: boolean;
  isPinned: boolean;
  securityScope: 'standard' | 'vault';
  revision: number;
  depth: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export async function createFolder(
  client: PoolClient,
  workspaceId: string,
  actorUserId: string,
  input: CreateFolderRequest
): Promise<FolderRecord> {
  const folderId = input.id || crypto.randomUUID();
  const parentId = input.parentId || null;
  const securityScope = input.securityScope || 'standard';
  const rank = input.rank || '1000';

  // 1. Acquire workspace sync state row-lock
  const syncState = await lockWorkspaceSyncState(client, workspaceId);

  // 2. Validate target parent, cycle prevention, and depth bounds using PostgreSQL helper function
  let depth = 1;
  try {
    const valRes = await client.query<{ depth: number }>(
      `SELECT app.validate_folder_parent($1, $2, $3) as depth;`,
      [workspaceId, folderId, parentId]
    );
    depth = valRes.rows[0]?.depth || 1;
  } catch (err: unknown) {
    const msg = (err as Error).message;
    throw new ValidationError(msg);
  }

  // 3. Insert into app.items (common item envelope)
  await client.query(
    `INSERT INTO app.items (
      id, workspace_id, folder_id, kind, created_by, updated_by,
      revision, rank, is_archived, is_pinned, security_scope
    ) VALUES ($1, $2, $3, 'folder', $4, $4, 1, $5, false, false, $6);`,
    [folderId, workspaceId, parentId, actorUserId, rank, securityScope]
  );

  // 4. Insert into app.folders (typed folder payload)
  const folderRes = await client.query<{
    id: string;
    workspace_id: string;
    parent_id: string | null;
    name: string;
    color: string | null;
    icon: string | null;
    created_at: Date;
    updated_at: Date;
  }>(
    `INSERT INTO app.folders (
      id, workspace_id, parent_id, name, color, icon
    ) VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING id, workspace_id, parent_id, name, color, icon, created_at, updated_at;`,
    [folderId, workspaceId, parentId, input.name, input.color || null, input.icon || null]
  );

  const row = folderRes.rows[0]!;
  const seq = syncState.nextChangeSeq;

  // 5. Commit change feed event and outbox intent
  await insertChange(client, {
    workspaceId,
    seq,
    entityType: 'folder',
    entityId: folderId,
    revision: 1,
    isTombstone: false,
    operationId: crypto.randomUUID(),
    changeData: {
      name: row.name,
      parentId: row.parent_id,
      color: row.color,
      icon: row.icon,
      rank,
      securityScope,
      depth,
    },
  });

  await insertOutboxIntent(client, {
    workspaceId,
    eventType: 'folder.created',
    payload: { folderId, revision: 1, seq },
  });

  await updateWorkspaceSyncSeq(client, workspaceId, seq + 1);

  return {
    id: row.id,
    workspaceId: row.workspace_id,
    parentId: row.parent_id,
    name: row.name,
    color: row.color,
    icon: row.icon,
    rank,
    isArchived: false,
    isPinned: false,
    securityScope,
    revision: 1,
    depth,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    deletedAt: null,
  };
}

export async function getFolder(
  client: PoolClient,
  workspaceId: string,
  folderId: string
): Promise<FolderRecord> {
  const res = await client.query<{
    id: string;
    workspace_id: string;
    parent_id: string | null;
    name: string;
    color: string | null;
    icon: string | null;
    rank: string;
    is_archived: boolean;
    is_pinned: boolean;
    security_scope: 'standard' | 'vault';
    revision: string;
    created_at: Date;
    updated_at: Date;
    deleted_at: Date | null;
  }>(
    `SELECT
      f.id, f.workspace_id, f.parent_id, f.name, f.color, f.icon,
      i.rank, i.is_archived, i.is_pinned, i.security_scope, i.revision,
      i.created_at, i.updated_at, i.deleted_at
    FROM app.folders f
    JOIN app.items i ON i.workspace_id = f.workspace_id AND i.id = f.id
    WHERE f.workspace_id = $1 AND f.id = $2;`,
    [workspaceId, folderId]
  );

  const row = res.rows[0];
  if (!row) {
    throw new NotFoundError(`Folder ${folderId} not found in workspace.`);
  }

  // Calculate depth
  let depth = 1;
  let currId = row.parent_id;
  while (currId !== null) {
    depth++;
    const pRes = await client.query<{ parent_id: string | null }>(
      `SELECT parent_id FROM app.folders WHERE workspace_id = $1 AND id = $2;`,
      [workspaceId, currId]
    );
    currId = pRes.rows[0]?.parent_id || null;
  }

  return {
    id: row.id,
    workspaceId: row.workspace_id,
    parentId: row.parent_id,
    name: row.name,
    color: row.color,
    icon: row.icon,
    rank: row.rank,
    isArchived: row.is_archived,
    isPinned: row.is_pinned,
    securityScope: row.security_scope,
    revision: Number(row.revision),
    depth,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    deletedAt: row.deleted_at ? row.deleted_at.toISOString() : null,
  };
}

export async function listFolders(
  client: PoolClient,
  workspaceId: string,
  options?: { includeDeleted?: boolean; parentId?: string | null }
): Promise<FolderRecord[]> {
  const params: unknown[] = [workspaceId];
  let query = `
    SELECT
      f.id, f.workspace_id, f.parent_id, f.name, f.color, f.icon,
      i.rank, i.is_archived, i.is_pinned, i.security_scope, i.revision,
      i.created_at, i.updated_at, i.deleted_at
    FROM app.folders f
    JOIN app.items i ON i.workspace_id = f.workspace_id AND i.id = f.id
    WHERE f.workspace_id = $1
  `;

  if (!options?.includeDeleted) {
    query += ` AND i.deleted_at IS NULL`;
  }

  if (options?.parentId !== undefined) {
    params.push(options.parentId);
    query += ` AND f.parent_id = $${params.length}`;
  }

  query += ` ORDER BY i.rank ASC, f.id ASC;`;

  const res = await client.query<{
    id: string;
    workspace_id: string;
    parent_id: string | null;
    name: string;
    color: string | null;
    icon: string | null;
    rank: string;
    is_archived: boolean;
    is_pinned: boolean;
    security_scope: 'standard' | 'vault';
    revision: string;
    created_at: Date;
    updated_at: Date;
    deleted_at: Date | null;
  }>(query, params);

  // Compute depth via map
  const parentMap = new Map<string, string | null>();
  for (const r of res.rows) {
    parentMap.set(r.id, r.parent_id);
  }

  const getDepth = (id: string): number => {
    let d = 1;
    let curr = parentMap.get(id);
    const seen = new Set<string>();
    while (curr && !seen.has(curr)) {
      seen.add(curr);
      d++;
      curr = parentMap.get(curr);
    }
    return d;
  };

  return res.rows.map((row) => ({
    id: row.id,
    workspaceId: row.workspace_id,
    parentId: row.parent_id,
    name: row.name,
    color: row.color,
    icon: row.icon,
    rank: row.rank,
    isArchived: row.is_archived,
    isPinned: row.is_pinned,
    securityScope: row.security_scope,
    revision: Number(row.revision),
    depth: getDepth(row.id),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    deletedAt: row.deleted_at ? row.deleted_at.toISOString() : null,
  }));
}

export async function updateFolder(
  client: PoolClient,
  workspaceId: string,
  actorUserId: string,
  folderId: string,
  input: UpdateFolderRequest
): Promise<FolderRecord> {
  const syncState = await lockWorkspaceSyncState(client, workspaceId);

  // Lock folder row for optimistic concurrency check
  const lockRes = await client.query<{ revision: string; deleted_at: Date | null }>(
    `SELECT revision, deleted_at FROM app.items
     WHERE workspace_id = $1 AND id = $2 AND kind = 'folder'
     FOR UPDATE;`,
    [workspaceId, folderId]
  );

  const currentItem = lockRes.rows[0];
  if (!currentItem) {
    throw new NotFoundError(`Folder ${folderId} not found.`);
  }
  if (currentItem.deleted_at) {
    throw new ValidationError(`Folder ${folderId} is deleted.`);
  }
  if (Number(currentItem.revision) !== input.baseRevision) {
    throw new ConflictError(
      `Stale revision: client base is ${input.baseRevision}, server is ${currentItem.revision}.`
    );
  }

  const newRevision = Number(currentItem.revision) + 1;
  const seq = syncState.nextChangeSeq;

  // Update folder attributes
  if (input.name !== undefined || input.color !== undefined || input.icon !== undefined) {
    await client.query(
      `UPDATE app.folders SET
        name = COALESCE($1, name),
        color = CASE WHEN $2::boolean THEN $3 ELSE color END,
        icon = CASE WHEN $4::boolean THEN $5 ELSE icon END,
        updated_at = now()
       WHERE workspace_id = $6 AND id = $7;`,
      [
        input.name ?? null,
        input.color !== undefined,
        input.color ?? null,
        input.icon !== undefined,
        input.icon ?? null,
        workspaceId,
        folderId,
      ]
    );
  }

  // Update item envelope revision
  await client.query(
    `UPDATE app.items SET revision = $1, updated_by = $2, updated_at = now()
     WHERE workspace_id = $3 AND id = $4;`,
    [newRevision, actorUserId, workspaceId, folderId]
  );

  await insertChange(client, {
    workspaceId,
    seq,
    entityType: 'folder',
    entityId: folderId,
    revision: newRevision,
    isTombstone: false,
    operationId: crypto.randomUUID(),
    changeData: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.color !== undefined ? { color: input.color } : {}),
      ...(input.icon !== undefined ? { icon: input.icon } : {}),
    },
  });

  await updateWorkspaceSyncSeq(client, workspaceId, seq + 1);

  return getFolder(client, workspaceId, folderId);
}

export async function moveFolder(
  client: PoolClient,
  workspaceId: string,
  actorUserId: string,
  folderId: string,
  input: MoveFolderRequest
): Promise<FolderRecord> {
  const syncState = await lockWorkspaceSyncState(client, workspaceId);

  const lockRes = await client.query<{ revision: string; deleted_at: Date | null }>(
    `SELECT revision, deleted_at FROM app.items
     WHERE workspace_id = $1 AND id = $2 AND kind = 'folder'
     FOR UPDATE;`,
    [workspaceId, folderId]
  );

  const currentItem = lockRes.rows[0];
  if (!currentItem) {
    throw new NotFoundError(`Folder ${folderId} not found.`);
  }
  if (currentItem.deleted_at) {
    throw new ValidationError(`Folder ${folderId} is deleted.`);
  }
  if (Number(currentItem.revision) !== input.baseRevision) {
    throw new ConflictError(
      `Stale revision: client base is ${input.baseRevision}, server is ${currentItem.revision}.`
    );
  }

  // Validate move: cycles, target parent existence, depth limits, and scope
  let newDepth = 1;
  try {
    const valRes = await client.query<{ depth: number }>(
      `SELECT app.validate_folder_parent($1, $2, $3) as depth;`,
      [workspaceId, folderId, input.targetParentId]
    );
    newDepth = valRes.rows[0]?.depth || 1;
  } catch (err: unknown) {
    const msg = (err as Error).message;
    throw new ValidationError(msg);
  }

  const newRevision = Number(currentItem.revision) + 1;
  const seq = syncState.nextChangeSeq;

  // Update folder parent_id
  await client.query(
    `UPDATE app.folders SET parent_id = $1, updated_at = now()
     WHERE workspace_id = $2 AND id = $3;`,
    [input.targetParentId, workspaceId, folderId]
  );

  // Update item folder_id and rank
  await client.query(
    `UPDATE app.items SET
      folder_id = $1,
      rank = COALESCE($2, rank),
      revision = $3,
      updated_by = $4,
      updated_at = now()
     WHERE workspace_id = $5 AND id = $6;`,
    [input.targetParentId, input.rank ?? null, newRevision, actorUserId, workspaceId, folderId]
  );

  await insertChange(client, {
    workspaceId,
    seq,
    entityType: 'folder',
    entityId: folderId,
    revision: newRevision,
    isTombstone: false,
    operationId: crypto.randomUUID(),
    changeData: {
      parentId: input.targetParentId,
      ...(input.rank !== undefined ? { rank: input.rank } : {}),
      depth: newDepth,
    },
  });

  await updateWorkspaceSyncSeq(client, workspaceId, seq + 1);

  return getFolder(client, workspaceId, folderId);
}

export async function reorderFolder(
  client: PoolClient,
  workspaceId: string,
  actorUserId: string,
  folderId: string,
  input: ReorderFolderRequest
): Promise<FolderRecord> {
  const syncState = await lockWorkspaceSyncState(client, workspaceId);

  const lockRes = await client.query<{ revision: string; deleted_at: Date | null }>(
    `SELECT revision, deleted_at FROM app.items
     WHERE workspace_id = $1 AND id = $2 AND kind = 'folder'
     FOR UPDATE;`,
    [workspaceId, folderId]
  );

  const currentItem = lockRes.rows[0];
  if (!currentItem) {
    throw new NotFoundError(`Folder ${folderId} not found.`);
  }
  if (currentItem.deleted_at) {
    throw new ValidationError(`Folder ${folderId} is deleted.`);
  }
  if (Number(currentItem.revision) !== input.baseRevision) {
    throw new ConflictError(
      `Stale revision: client base is ${input.baseRevision}, server is ${currentItem.revision}.`
    );
  }

  const newRevision = Number(currentItem.revision) + 1;
  const seq = syncState.nextChangeSeq;

  await client.query(
    `UPDATE app.items SET rank = $1, revision = $2, updated_by = $3, updated_at = now()
     WHERE workspace_id = $4 AND id = $5;`,
    [input.rank, newRevision, actorUserId, workspaceId, folderId]
  );

  await insertChange(client, {
    workspaceId,
    seq,
    entityType: 'folder',
    entityId: folderId,
    revision: newRevision,
    isTombstone: false,
    operationId: crypto.randomUUID(),
    changeData: { rank: input.rank },
  });

  await updateWorkspaceSyncSeq(client, workspaceId, seq + 1);

  return getFolder(client, workspaceId, folderId);
}

export async function archiveFolder(
  client: PoolClient,
  workspaceId: string,
  actorUserId: string,
  folderId: string,
  input: ArchiveFolderRequest
): Promise<FolderRecord> {
  const syncState = await lockWorkspaceSyncState(client, workspaceId);

  const lockRes = await client.query<{ revision: string; deleted_at: Date | null }>(
    `SELECT revision, deleted_at FROM app.items
     WHERE workspace_id = $1 AND id = $2 AND kind = 'folder'
     FOR UPDATE;`,
    [workspaceId, folderId]
  );

  const currentItem = lockRes.rows[0];
  if (!currentItem) {
    throw new NotFoundError(`Folder ${folderId} not found.`);
  }
  if (currentItem.deleted_at) {
    throw new ValidationError(`Folder ${folderId} is deleted.`);
  }
  if (Number(currentItem.revision) !== input.baseRevision) {
    throw new ConflictError(
      `Stale revision: client base is ${input.baseRevision}, server is ${currentItem.revision}.`
    );
  }

  const newRevision = Number(currentItem.revision) + 1;
  const seq = syncState.nextChangeSeq;

  await client.query(
    `UPDATE app.items SET is_archived = $1, revision = $2, updated_by = $3, updated_at = now()
     WHERE workspace_id = $4 AND id = $5;`,
    [input.isArchived, newRevision, actorUserId, workspaceId, folderId]
  );

  await insertChange(client, {
    workspaceId,
    seq,
    entityType: 'folder',
    entityId: folderId,
    revision: newRevision,
    isTombstone: false,
    operationId: crypto.randomUUID(),
    changeData: { isArchived: input.isArchived },
  });

  await updateWorkspaceSyncSeq(client, workspaceId, seq + 1);

  return getFolder(client, workspaceId, folderId);
}

export async function pinFolder(
  client: PoolClient,
  workspaceId: string,
  actorUserId: string,
  folderId: string,
  input: PinFolderRequest
): Promise<FolderRecord> {
  const syncState = await lockWorkspaceSyncState(client, workspaceId);

  const lockRes = await client.query<{ revision: string; deleted_at: Date | null }>(
    `SELECT revision, deleted_at FROM app.items
     WHERE workspace_id = $1 AND id = $2 AND kind = 'folder'
     FOR UPDATE;`,
    [workspaceId, folderId]
  );

  const currentItem = lockRes.rows[0];
  if (!currentItem) {
    throw new NotFoundError(`Folder ${folderId} not found.`);
  }
  if (currentItem.deleted_at) {
    throw new ValidationError(`Folder ${folderId} is deleted.`);
  }
  if (Number(currentItem.revision) !== input.baseRevision) {
    throw new ConflictError(
      `Stale revision: client base is ${input.baseRevision}, server is ${currentItem.revision}.`
    );
  }

  const newRevision = Number(currentItem.revision) + 1;
  const seq = syncState.nextChangeSeq;

  await client.query(
    `UPDATE app.items SET is_pinned = $1, revision = $2, updated_by = $3, updated_at = now()
     WHERE workspace_id = $4 AND id = $5;`,
    [input.isPinned, newRevision, actorUserId, workspaceId, folderId]
  );

  await insertChange(client, {
    workspaceId,
    seq,
    entityType: 'folder',
    entityId: folderId,
    revision: newRevision,
    isTombstone: false,
    operationId: crypto.randomUUID(),
    changeData: { isPinned: input.isPinned },
  });

  await updateWorkspaceSyncSeq(client, workspaceId, seq + 1);

  return getFolder(client, workspaceId, folderId);
}

export async function trashFolder(
  client: PoolClient,
  workspaceId: string,
  actorUserId: string,
  folderId: string,
  policy: FolderDeletePolicy,
  baseRevision: number
): Promise<{
  folderId: string;
  policy: FolderDeletePolicy;
  affectedItemsCount: number;
  affectedFoldersCount: number;
  targetParentId?: string | null;
}> {
  const syncState = await lockWorkspaceSyncState(client, workspaceId);

  const lockRes = await client.query<{ revision: string; deleted_at: Date | null }>(
    `SELECT revision, deleted_at FROM app.items
     WHERE workspace_id = $1 AND id = $2 AND kind = 'folder'
     FOR UPDATE;`,
    [workspaceId, folderId]
  );

  const currentItem = lockRes.rows[0];
  if (!currentItem) {
    throw new NotFoundError(`Folder ${folderId} not found.`);
  }
  if (currentItem.deleted_at) {
    throw new ValidationError(`Folder ${folderId} is already deleted.`);
  }
  if (Number(currentItem.revision) !== baseRevision) {
    throw new ConflictError(
      `Stale revision: client base is ${baseRevision}, server is ${currentItem.revision}.`
    );
  }

  // Get current folder's parent
  const parentRes = await client.query<{ parent_id: string | null }>(
    `SELECT parent_id FROM app.folders WHERE workspace_id = $1 AND id = $2;`,
    [workspaceId, folderId]
  );
  const targetParentId = parentRes.rows[0]?.parent_id || null;

  let affectedItemsCount = 0;
  let affectedFoldersCount = 0;
  let currentSeq = syncState.nextChangeSeq;

  if (policy === 'preserve_to_parent') {
    // 1. Move direct child folders to targetParentId
    const childFoldersRes = await client.query<{ id: string }>(
      `SELECT id FROM app.folders WHERE workspace_id = $1 AND parent_id = $2;`,
      [workspaceId, folderId]
    );

    for (const cf of childFoldersRes.rows) {
      await client.query(
        `UPDATE app.folders SET parent_id = $1, updated_at = now()
         WHERE workspace_id = $2 AND id = $3;`,
        [targetParentId, workspaceId, cf.id]
      );
      await client.query(
        `UPDATE app.items SET folder_id = $1, revision = revision + 1, updated_by = $2, updated_at = now()
         WHERE workspace_id = $3 AND id = $4;`,
        [targetParentId, actorUserId, workspaceId, cf.id]
      );

      await insertChange(client, {
        workspaceId,
        seq: currentSeq++,
        entityType: 'folder',
        entityId: cf.id,
        revision: 0,
        isTombstone: false,
        operationId: crypto.randomUUID(),
        changeData: { parentId: targetParentId },
      });
      affectedFoldersCount++;
    }

    // 2. Move direct items (notes, tasks, files, etc.) to targetParentId (null = Inbox)
    const childItemsRes = await client.query<{ id: string }>(
      `SELECT id FROM app.items
       WHERE workspace_id = $1 AND folder_id = $2 AND kind <> 'folder' AND deleted_at IS NULL;`,
      [workspaceId, folderId]
    );

    for (const item of childItemsRes.rows) {
      await client.query(
        `UPDATE app.items SET folder_id = $1, revision = revision + 1, updated_by = $2, updated_at = now()
         WHERE workspace_id = $3 AND id = $4;`,
        [targetParentId, actorUserId, workspaceId, item.id]
      );

      await insertChange(client, {
        workspaceId,
        seq: currentSeq++,
        entityType: 'item',
        entityId: item.id,
        revision: 0,
        isTombstone: false,
        operationId: crypto.randomUUID(),
        changeData: { folderId: targetParentId },
      });
      affectedItemsCount++;
    }

    // 3. Tombstone the folder itself
    const newRevision = Number(currentItem.revision) + 1;
    await client.query(
      `UPDATE app.items SET deleted_at = now(), revision = $1, updated_by = $2, updated_at = now()
       WHERE workspace_id = $3 AND id = $4;`,
      [newRevision, actorUserId, workspaceId, folderId]
    );

    await insertChange(client, {
      workspaceId,
      seq: currentSeq++,
      entityType: 'folder',
      entityId: folderId,
      revision: newRevision,
      isTombstone: true,
      operationId: crypto.randomUUID(),
      changeData: { deleted: true },
    });
  } else if (policy === 'trash_subtree') {
    // Recursively find all descendant folders
    const subFoldersRes = await client.query<{ id: string }>(
      `WITH RECURSIVE sub AS (
        SELECT id FROM app.folders WHERE workspace_id = $1 AND id = $2
        UNION ALL
        SELECT f.id FROM app.folders f
        JOIN sub ON f.parent_id = sub.id
        WHERE f.workspace_id = $1
      )
      SELECT id FROM sub WHERE id <> $2;`,
      [workspaceId, folderId]
    );

    const allSubFolderIds = subFoldersRes.rows.map((r) => r.id);
    const allFolderIds = [folderId, ...allSubFolderIds];

    // Find all items inside any of these folders
    const itemsRes = await client.query<{ id: string }>(
      `SELECT id FROM app.items
       WHERE workspace_id = $1 AND folder_id = ANY($2::uuid[]) AND kind <> 'folder' AND deleted_at IS NULL;`,
      [workspaceId, allFolderIds]
    );

    // Tombstone descendant items
    for (const item of itemsRes.rows) {
      await client.query(
        `UPDATE app.items SET deleted_at = now(), revision = revision + 1, updated_by = $1, updated_at = now()
         WHERE workspace_id = $2 AND id = $3;`,
        [actorUserId, workspaceId, item.id]
      );
      await insertChange(client, {
        workspaceId,
        seq: currentSeq++,
        entityType: 'item',
        entityId: item.id,
        revision: 0,
        isTombstone: true,
        operationId: crypto.randomUUID(),
        changeData: { deleted: true },
      });
      affectedItemsCount++;
    }

    // Tombstone descendant folders
    for (const subId of allSubFolderIds) {
      await client.query(
        `UPDATE app.items SET deleted_at = now(), revision = revision + 1, updated_by = $1, updated_at = now()
         WHERE workspace_id = $2 AND id = $3;`,
        [actorUserId, workspaceId, subId]
      );
      await insertChange(client, {
        workspaceId,
        seq: currentSeq++,
        entityType: 'folder',
        entityId: subId,
        revision: 0,
        isTombstone: true,
        operationId: crypto.randomUUID(),
        changeData: { deleted: true },
      });
      affectedFoldersCount++;
    }

    // Tombstone the target folder itself
    const newRevision = Number(currentItem.revision) + 1;
    await client.query(
      `UPDATE app.items SET deleted_at = now(), revision = $1, updated_by = $2, updated_at = now()
       WHERE workspace_id = $3 AND id = $4;`,
      [newRevision, actorUserId, workspaceId, folderId]
    );

    await insertChange(client, {
      workspaceId,
      seq: currentSeq++,
      entityType: 'folder',
      entityId: folderId,
      revision: newRevision,
      isTombstone: true,
      operationId: crypto.randomUUID(),
      changeData: { deleted: true },
    });
  }

  await updateWorkspaceSyncSeq(client, workspaceId, currentSeq);

  return {
    folderId,
    policy,
    affectedItemsCount,
    affectedFoldersCount,
    targetParentId: policy === 'preserve_to_parent' ? targetParentId : undefined,
  };
}

export async function restoreFolder(
  client: PoolClient,
  workspaceId: string,
  actorUserId: string,
  folderId: string,
  baseRevision: number
): Promise<FolderRecord> {
  const syncState = await lockWorkspaceSyncState(client, workspaceId);

  const lockRes = await client.query<{ revision: string; deleted_at: Date | null }>(
    `SELECT revision, deleted_at FROM app.items
     WHERE workspace_id = $1 AND id = $2 AND kind = 'folder'
     FOR UPDATE;`,
    [workspaceId, folderId]
  );

  const currentItem = lockRes.rows[0];
  if (!currentItem) {
    throw new NotFoundError(`Folder ${folderId} not found.`);
  }
  if (!currentItem.deleted_at) {
    throw new ValidationError(`Folder ${folderId} is not deleted.`);
  }
  if (Number(currentItem.revision) !== baseRevision) {
    throw new ConflictError(
      `Stale revision: client base is ${baseRevision}, server is ${currentItem.revision}.`
    );
  }

  // Check parent status: if parent is deleted, restore to root (null)
  const fRes = await client.query<{ parent_id: string | null }>(
    `SELECT parent_id FROM app.folders WHERE workspace_id = $1 AND id = $2;`,
    [workspaceId, folderId]
  );
  let parentId = fRes.rows[0]?.parent_id || null;

  if (parentId) {
    const parentCheck = await client.query<{ deleted_at: Date | null }>(
      `SELECT deleted_at FROM app.items WHERE workspace_id = $1 AND id = $2;`,
      [workspaceId, parentId]
    );
    if (!parentCheck.rows[0] || parentCheck.rows[0].deleted_at !== null) {
      parentId = null; // Reparent to root
      await client.query(
        `UPDATE app.folders SET parent_id = NULL WHERE workspace_id = $1 AND id = $2;`,
        [workspaceId, folderId]
      );
    }
  }

  const newRevision = Number(currentItem.revision) + 1;
  const seq = syncState.nextChangeSeq;

  await client.query(
    `UPDATE app.items SET deleted_at = NULL, folder_id = $1, revision = $2, updated_by = $3, updated_at = now()
     WHERE workspace_id = $4 AND id = $5;`,
    [parentId, newRevision, actorUserId, workspaceId, folderId]
  );

  await insertChange(client, {
    workspaceId,
    seq,
    entityType: 'folder',
    entityId: folderId,
    revision: newRevision,
    isTombstone: false,
    operationId: crypto.randomUUID(),
    changeData: { restored: true, parentId },
  });

  await updateWorkspaceSyncSeq(client, workspaceId, seq + 1);

  return getFolder(client, workspaceId, folderId);
}

export async function rebalanceSiblings(
  client: PoolClient,
  workspaceId: string,
  actorUserId: string,
  _parentId: string | null,
  siblingIds: string[]
): Promise<Array<{ id: string; rank: string; revision: number }>> {
  const syncState = await lockWorkspaceSyncState(client, workspaceId);

  // Compute rebalanced ranks using domain sparse interval spacing
  const rebalanced = rebalanceRanks(
    siblingIds.map((id) => ({ id })),
    10000
  );

  let currentSeq = syncState.nextChangeSeq;
  const results: Array<{ id: string; rank: string; revision: number }> = [];

  for (const item of rebalanced) {
    const updateRes = await client.query<{ revision: string }>(
      `UPDATE app.items SET
        rank = $1,
        revision = revision + 1,
        updated_by = $2,
        updated_at = now()
       WHERE workspace_id = $3 AND id = $4
       RETURNING revision;`,
      [item.rank, actorUserId, workspaceId, item.id]
    );

    const rev = updateRes.rows[0] ? Number(updateRes.rows[0].revision) : 1;
    results.push({ id: item.id, rank: item.rank, revision: rev });

    await insertChange(client, {
      workspaceId,
      seq: currentSeq++,
      entityType: 'folder',
      entityId: item.id,
      revision: rev,
      isTombstone: false,
      operationId: crypto.randomUUID(),
      changeData: { rank: item.rank },
    });
  }

  await updateWorkspaceSyncSeq(client, workspaceId, currentSeq);

  return results;
}

// ----------------- TAGS -----------------

export async function createTag(
  client: PoolClient,
  workspaceId: string,
  actorUserId: string,
  input: CreateTagRequest
): Promise<Tag> {
  const tagId = input.id || crypto.randomUUID();

  // Check unique name case-insensitively
  const existing = await client.query<{ id: string }>(
    `SELECT id FROM app.tags WHERE workspace_id = $1 AND lower(name) = lower($2) AND deleted_at IS NULL;`,
    [workspaceId, input.name]
  );
  if (existing.rows[0]) {
    throw new ValidationError(`Tag "${input.name}" already exists in workspace.`);
  }

  const res = await client.query<{
    id: string;
    workspace_id: string;
    name: string;
    color: string | null;
    revision: string;
    created_at: Date;
    updated_at: Date;
    deleted_at: Date | null;
  }>(
    `INSERT INTO app.tags (id, workspace_id, name, color, created_by, revision)
     VALUES ($1, $2, $3, $4, $5, 1)
     RETURNING id, workspace_id, name, color, revision, created_at, updated_at, deleted_at;`,
    [tagId, workspaceId, input.name, input.color || null, actorUserId]
  );

  const row = res.rows[0]!;
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    color: row.color,
    revision: Number(row.revision),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    deletedAt: row.deleted_at ? row.deleted_at.toISOString() : null,
  };
}

export async function listTags(client: PoolClient, workspaceId: string): Promise<Tag[]> {
  const res = await client.query<{
    id: string;
    workspace_id: string;
    name: string;
    color: string | null;
    revision: string;
    created_at: Date;
    updated_at: Date;
    deleted_at: Date | null;
  }>(
    `SELECT id, workspace_id, name, color, revision, created_at, updated_at, deleted_at
     FROM app.tags
     WHERE workspace_id = $1 AND deleted_at IS NULL
     ORDER BY lower(name) ASC;`,
    [workspaceId]
  );

  return res.rows.map((row) => ({
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    color: row.color,
    revision: Number(row.revision),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    deletedAt: row.deleted_at ? row.deleted_at.toISOString() : null,
  }));
}

export async function updateTag(
  client: PoolClient,
  workspaceId: string,
  _actorUserId: string,
  tagId: string,
  input: UpdateTagRequest
): Promise<Tag> {
  const lockRes = await client.query<{ revision: string; deleted_at: Date | null }>(
    `SELECT revision, deleted_at FROM app.tags WHERE workspace_id = $1 AND id = $2 FOR UPDATE;`,
    [workspaceId, tagId]
  );

  const current = lockRes.rows[0];
  if (!current || current.deleted_at) {
    throw new NotFoundError(`Tag ${tagId} not found.`);
  }
  if (Number(current.revision) !== input.baseRevision) {
    throw new ConflictError(
      `Stale tag revision: client is ${input.baseRevision}, server is ${current.revision}.`
    );
  }

  const newRevision = Number(current.revision) + 1;

  const res = await client.query<{
    id: string;
    workspace_id: string;
    name: string;
    color: string | null;
    revision: string;
    created_at: Date;
    updated_at: Date;
    deleted_at: Date | null;
  }>(
    `UPDATE app.tags SET
      name = COALESCE($1, name),
      color = CASE WHEN $2::boolean THEN $3 ELSE color END,
      revision = $4,
      updated_at = now()
     WHERE workspace_id = $5 AND id = $6
     RETURNING id, workspace_id, name, color, revision, created_at, updated_at, deleted_at;`,
    [
      input.name ?? null,
      input.color !== undefined,
      input.color ?? null,
      newRevision,
      workspaceId,
      tagId,
    ]
  );

  const row = res.rows[0]!;
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    color: row.color,
    revision: Number(row.revision),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    deletedAt: row.deleted_at ? row.deleted_at.toISOString() : null,
  };
}

export async function deleteTag(
  client: PoolClient,
  workspaceId: string,
  tagId: string
): Promise<void> {
  await client.query(
    `UPDATE app.tags SET deleted_at = now() WHERE workspace_id = $1 AND id = $2;`,
    [workspaceId, tagId]
  );
}

// ----------------- ITEM TAGS -----------------

export async function addItemTag(
  client: PoolClient,
  workspaceId: string,
  actorUserId: string,
  itemId: string,
  tagId: string
): Promise<void> {
  // Verify item and tag exist in workspace
  const itemCheck = await client.query(
    `SELECT id FROM app.items WHERE workspace_id = $1 AND id = $2 AND deleted_at IS NULL;`,
    [workspaceId, itemId]
  );
  if (!itemCheck.rows[0]) {
    throw new NotFoundError(`Item ${itemId} not found in workspace.`);
  }

  const tagCheck = await client.query(
    `SELECT id FROM app.tags WHERE workspace_id = $1 AND id = $2 AND deleted_at IS NULL;`,
    [workspaceId, tagId]
  );
  if (!tagCheck.rows[0]) {
    throw new NotFoundError(`Tag ${tagId} not found in workspace.`);
  }

  await client.query(
    `INSERT INTO app.item_tags (workspace_id, item_id, tag_id, created_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (workspace_id, item_id, tag_id) DO NOTHING;`,
    [workspaceId, itemId, tagId, actorUserId]
  );
}

export async function removeItemTag(
  client: PoolClient,
  workspaceId: string,
  itemId: string,
  tagId: string
): Promise<void> {
  await client.query(
    `DELETE FROM app.item_tags WHERE workspace_id = $1 AND item_id = $2 AND tag_id = $3;`,
    [workspaceId, itemId, tagId]
  );
}

export async function listItemTags(
  client: PoolClient,
  workspaceId: string,
  itemId: string
): Promise<ItemTag[]> {
  const res = await client.query<{
    workspace_id: string;
    item_id: string;
    tag_id: string;
    tag_name: string;
    tag_color: string | null;
    created_at: Date;
  }>(
    `SELECT it.workspace_id, it.item_id, it.tag_id, t.name as tag_name, t.color as tag_color, it.created_at
     FROM app.item_tags it
     JOIN app.tags t ON t.workspace_id = it.workspace_id AND t.id = it.tag_id
     WHERE it.workspace_id = $1 AND it.item_id = $2 AND t.deleted_at IS NULL
     ORDER BY lower(t.name) ASC;`,
    [workspaceId, itemId]
  );

  return res.rows.map((r) => ({
    workspaceId: r.workspace_id,
    itemId: r.item_id,
    tagId: r.tag_id,
    tagName: r.tag_name,
    tagColor: r.tag_color,
    createdAt: r.created_at.toISOString(),
  }));
}

// ----------------- ITEM LINKS -----------------

export async function createItemLink(
  client: PoolClient,
  workspaceId: string,
  actorUserId: string,
  sourceItemId: string,
  input: CreateItemLinkRequest
): Promise<ItemLink> {
  if (sourceItemId === input.targetItemId) {
    throw new ValidationError('Cannot link an item to itself.');
  }

  // Verify source and target items exist in same workspace
  const check = await client.query<{ id: string }>(
    `SELECT id FROM app.items
     WHERE workspace_id = $1 AND id IN ($2, $3) AND deleted_at IS NULL;`,
    [workspaceId, sourceItemId, input.targetItemId]
  );
  if (check.rows.length < 2) {
    throw new NotFoundError('Source or target item not found in workspace.');
  }

  const linkId = crypto.randomUUID();
  const res = await client.query<{
    id: string;
    workspace_id: string;
    source_item_id: string;
    target_item_id: string;
    link_type: string;
    created_at: Date;
  }>(
    `INSERT INTO app.item_links (id, workspace_id, source_item_id, target_item_id, link_type, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (workspace_id, source_item_id, target_item_id, link_type)
     DO UPDATE SET created_at = now()
     RETURNING id, workspace_id, source_item_id, target_item_id, link_type, created_at;`,
    [
      linkId,
      workspaceId,
      sourceItemId,
      input.targetItemId,
      input.linkType || 'related',
      actorUserId,
    ]
  );

  const row = res.rows[0]!;
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    sourceItemId: row.source_item_id,
    targetItemId: row.target_item_id,
    linkType: row.link_type,
    createdAt: row.created_at.toISOString(),
  };
}

export async function deleteItemLink(
  client: PoolClient,
  workspaceId: string,
  sourceItemId: string,
  targetItemId: string,
  linkType?: string
): Promise<void> {
  let query = `DELETE FROM app.item_links WHERE workspace_id = $1 AND source_item_id = $2 AND target_item_id = $3`;
  const params: unknown[] = [workspaceId, sourceItemId, targetItemId];
  if (linkType) {
    params.push(linkType);
    query += ` AND link_type = $4`;
  }
  await client.query(query, params);
}

export async function listItemLinks(
  client: PoolClient,
  workspaceId: string,
  itemId: string
): Promise<ItemLink[]> {
  const res = await client.query<{
    id: string;
    workspace_id: string;
    source_item_id: string;
    target_item_id: string;
    link_type: string;
    created_at: Date;
  }>(
    `SELECT id, workspace_id, source_item_id, target_item_id, link_type, created_at
     FROM app.item_links
     WHERE workspace_id = $1 AND (source_item_id = $2 OR target_item_id = $2)
     ORDER BY created_at ASC;`,
    [workspaceId, itemId]
  );

  return res.rows.map((r) => ({
    id: r.id,
    workspaceId: r.workspace_id,
    sourceItemId: r.source_item_id,
    targetItemId: r.target_item_id,
    linkType: r.link_type,
    createdAt: r.created_at.toISOString(),
  }));
}
