import type { PoolClient } from 'pg';

export interface ItemRecord {
  id: string;
  workspace_id: string;
  folder_id: string | null;
  kind: string;
  created_by: string;
  updated_by: string;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
  display_order: number;
  revision: number;
  rank: string;
  is_archived: boolean;
  is_pinned: boolean;
  security_scope: 'standard' | 'vault';
}

interface RawItemRow {
  id: string;
  workspace_id: string;
  folder_id: string | null;
  kind: string;
  created_by: string;
  updated_by: string;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
  display_order: number;
  revision: string | number;
  rank: string;
  is_archived: boolean;
  is_pinned: boolean;
  security_scope: 'standard' | 'vault';
}

function mapRowToItem(r: RawItemRow): ItemRecord {
  return {
    id: r.id,
    workspace_id: r.workspace_id,
    folder_id: r.folder_id,
    kind: r.kind,
    created_by: r.created_by,
    updated_by: r.updated_by,
    created_at: r.created_at,
    updated_at: r.updated_at,
    deleted_at: r.deleted_at,
    display_order: r.display_order,
    revision: Number(r.revision),
    rank: r.rank || '0',
    is_archived: Boolean(r.is_archived),
    is_pinned: Boolean(r.is_pinned),
    security_scope: r.security_scope || 'standard',
  };
}

export async function createItem(
  client: PoolClient,
  item: {
    id?: string;
    workspaceId: string;
    folderId?: string | null;
    kind: string;
    createdBy: string;
    displayOrder?: number;
    rank?: string;
    revision?: number;
    securityScope?: 'standard' | 'vault';
  }
): Promise<ItemRecord> {
  const res = await client.query<RawItemRow>(
    `INSERT INTO app.items (
       id, workspace_id, folder_id, kind, created_by, updated_by, display_order,
       rank, revision, security_scope
     )
     VALUES (
       COALESCE($1, gen_random_uuid()), $2, $3, $4, $5, $5, COALESCE($6, 0),
       COALESCE($7, '0'), COALESCE($8, 1), COALESCE($9, 'standard')
     )
     RETURNING id, workspace_id, folder_id, kind, created_by, updated_by, created_at, updated_at, deleted_at,
               display_order, revision, rank, is_archived, is_pinned, security_scope;`,
    [
      item.id || null,
      item.workspaceId,
      item.folderId || null,
      item.kind,
      item.createdBy,
      item.displayOrder || 0,
      item.rank || '0',
      item.revision || 1,
      item.securityScope || 'standard',
    ]
  );
  return mapRowToItem(res.rows[0]!);
}

export async function getItem(
  client: PoolClient,
  workspaceId: string,
  itemId: string
): Promise<ItemRecord | null> {
  const res = await client.query<RawItemRow>(
    `SELECT id, workspace_id, folder_id, kind, created_by, updated_by, created_at, updated_at, deleted_at,
            display_order, revision, rank, is_archived, is_pinned, security_scope
     FROM app.items
     WHERE workspace_id = $1 AND id = $2;`,
    [workspaceId, itemId]
  );
  return res.rows[0] ? mapRowToItem(res.rows[0]) : null;
}

export async function listItems(
  client: PoolClient,
  workspaceId: string,
  options?: {
    kind?: string;
    folderId?: string | null;
    includeDeleted?: boolean;
    limit?: number;
    cursor?: { createdAt: Date; id: string } | null;
  }
): Promise<ItemRecord[]> {
  const conditions: string[] = ['workspace_id = $1'];
  const values: unknown[] = [workspaceId];

  if (!options?.includeDeleted) {
    conditions.push('deleted_at IS NULL');
  }

  if (options?.kind) {
    values.push(options.kind);
    conditions.push(`kind = $${values.length}`);
  }

  if (options?.folderId !== undefined) {
    if (options.folderId === null) {
      conditions.push('folder_id IS NULL');
    } else {
      values.push(options.folderId);
      conditions.push(`folder_id = $${values.length}`);
    }
  }

  if (options?.cursor) {
    values.push(options.cursor.createdAt, options.cursor.id);
    conditions.push(`(created_at, id) < ($${values.length - 1}, $${values.length})`);
  }

  let limitClause = '';
  if (options?.limit) {
    values.push(options.limit);
    limitClause = `LIMIT $${values.length}`;
  }

  const query = `
    SELECT id, workspace_id, folder_id, kind, created_by, updated_by, created_at, updated_at, deleted_at,
           display_order, revision, rank, is_archived, is_pinned, security_scope
    FROM app.items
    WHERE ${conditions.join(' AND ')}
    ORDER BY created_at DESC, id DESC
    ${limitClause};
  `;

  const res = await client.query<RawItemRow>(query, values);
  return res.rows.map(mapRowToItem);
}

export async function updateItem(
  client: PoolClient,
  workspaceId: string,
  itemId: string,
  updates: {
    folderId?: string | null;
    deletedAt?: Date | null;
    displayOrder?: number;
    updatedBy?: string;
    revision?: number;
    rank?: string;
    isArchived?: boolean;
    isPinned?: boolean;
  }
): Promise<ItemRecord | null> {
  const setClauses: string[] = ['updated_at = now()'];
  const values: unknown[] = [workspaceId, itemId];

  if (updates.folderId !== undefined) {
    values.push(updates.folderId);
    setClauses.push(`folder_id = $${values.length}`);
  }

  if (updates.deletedAt !== undefined) {
    values.push(updates.deletedAt);
    setClauses.push(`deleted_at = $${values.length}`);
  }

  if (updates.displayOrder !== undefined) {
    values.push(updates.displayOrder);
    setClauses.push(`display_order = $${values.length}`);
  }

  if (updates.updatedBy !== undefined) {
    values.push(updates.updatedBy);
    setClauses.push(`updated_by = $${values.length}`);
  }

  if (updates.revision !== undefined) {
    values.push(updates.revision);
    setClauses.push(`revision = $${values.length}`);
  }

  if (updates.rank !== undefined) {
    values.push(updates.rank);
    setClauses.push(`rank = $${values.length}`);
  }

  if (updates.isArchived !== undefined) {
    values.push(updates.isArchived);
    setClauses.push(`is_archived = $${values.length}`);
  }

  if (updates.isPinned !== undefined) {
    values.push(updates.isPinned);
    setClauses.push(`is_pinned = $${values.length}`);
  }

  const query = `
    UPDATE app.items
    SET ${setClauses.join(', ')}
    WHERE workspace_id = $1 AND id = $2
    RETURNING id, workspace_id, folder_id, kind, created_by, updated_by, created_at, updated_at, deleted_at,
              display_order, revision, rank, is_archived, is_pinned, security_scope;
  `;

  const res = await client.query<RawItemRow>(query, values);
  return res.rows[0] ? mapRowToItem(res.rows[0]) : null;
}

export async function deleteItem(
  client: PoolClient,
  workspaceId: string,
  itemId: string
): Promise<boolean> {
  const res = await client.query(`DELETE FROM app.items WHERE workspace_id = $1 AND id = $2;`, [
    workspaceId,
    itemId,
  ]);
  return (res.rowCount ?? 0) > 0;
}
