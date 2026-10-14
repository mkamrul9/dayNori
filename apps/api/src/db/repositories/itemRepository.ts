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
  }
): Promise<ItemRecord> {
  const res = await client.query<ItemRecord>(
    `INSERT INTO app.items (
       id, workspace_id, folder_id, kind, created_by, updated_by, display_order
     )
     VALUES (
       COALESCE($1, gen_random_uuid()), $2, $3, $4, $5, $5, COALESCE($6, 0)
     )
     RETURNING id, workspace_id, folder_id, kind, created_by, updated_by, created_at, updated_at, deleted_at, display_order;`,
    [
      item.id || null,
      item.workspaceId,
      item.folderId || null,
      item.kind,
      item.createdBy,
      item.displayOrder || 0,
    ]
  );
  return res.rows[0]!;
}

export async function getItem(
  client: PoolClient,
  workspaceId: string,
  itemId: string
): Promise<ItemRecord | null> {
  const res = await client.query<ItemRecord>(
    `SELECT id, workspace_id, folder_id, kind, created_by, updated_by, created_at, updated_at, deleted_at, display_order
     FROM app.items
     WHERE workspace_id = $1 AND id = $2;`,
    [workspaceId, itemId]
  );
  return res.rows[0] || null;
}

export async function listItems(
  client: PoolClient,
  workspaceId: string,
  options?: {
    kind?: string;
    folderId?: string | null;
    includeDeleted?: boolean;
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

  const query = `
    SELECT id, workspace_id, folder_id, kind, created_by, updated_by, created_at, updated_at, deleted_at, display_order
    FROM app.items
    WHERE ${conditions.join(' AND ')}
    ORDER BY display_order ASC, created_at DESC;
  `;

  const res = await client.query<ItemRecord>(query, values);
  return res.rows;
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

  const query = `
    UPDATE app.items
    SET ${setClauses.join(', ')}
    WHERE workspace_id = $1 AND id = $2
    RETURNING id, workspace_id, folder_id, kind, created_by, updated_by, created_at, updated_at, deleted_at, display_order;
  `;

  const res = await client.query<ItemRecord>(query, values);
  return res.rows[0] || null;
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
