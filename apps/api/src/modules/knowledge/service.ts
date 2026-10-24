import type { PoolClient } from 'pg';
import crypto from 'node:crypto';
import type {
  SavedView,
  CreateSavedViewRequest,
  UpdateSavedViewRequest,
  ResolvedItemLink,
  KnowledgeSavedViewFilter,
} from '@daynori/contracts';
import { NotFoundError, ValidationError, ConflictError } from '../../plugins/errorHandler.js';

interface SavedViewRow {
  id: string;
  workspace_id: string;
  user_id: string;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  entity_type: 'knowledge' | 'notes' | 'all';
  filter: KnowledgeSavedViewFilter;
  rank: string;
  is_pinned: boolean;
  is_shared?: boolean;
  revision?: number;
  created_at: Date;
  updated_at: Date;
}

function mapSavedViewRow(row: SavedViewRow): SavedView {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    userId: row.user_id,
    name: row.name,
    description: row.description,
    icon: row.icon,
    color: row.color,
    entityType: row.entity_type,
    filter: row.filter || {},
    rank: row.rank || '0',
    isPinned: Boolean(row.is_pinned),
    isShared: Boolean(row.is_shared),
    revision: typeof row.revision === 'number' ? row.revision : 1,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export async function createSavedView(
  client: PoolClient,
  workspaceId: string,
  userId: string,
  input: CreateSavedViewRequest
): Promise<SavedView> {
  const id = input.id || crypto.randomUUID();
  const name = input.name.trim();
  if (name.length === 0 || name.length > 100) {
    throw new ValidationError('Saved view name must be between 1 and 100 characters.');
  }

  // Bound: max 50 saved views per user in this workspace
  const countRes = await client.query<{ count: string }>(
    `SELECT count(*) as count FROM app.saved_views WHERE workspace_id = $1 AND user_id = $2;`,
    [workspaceId, userId]
  );
  if (Number(countRes.rows[0]?.count || 0) >= 50) {
    throw new ValidationError('Maximum limit of 50 saved views per user reached.');
  }

  const res = await client.query<SavedViewRow>(
    `INSERT INTO app.saved_views (
       id, workspace_id, user_id, name, description, icon, color, entity_type, filter, rank, is_pinned, is_shared, revision, created_at, updated_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 1, now(), now())
     RETURNING *;`,
    [
      id,
      workspaceId,
      userId,
      name,
      input.description?.trim() || null,
      input.icon?.trim() || null,
      input.color?.trim() || null,
      input.entityType || 'knowledge',
      JSON.stringify(input.filter || {}),
      input.rank || '0',
      Boolean(input.isPinned),
      Boolean(input.isShared),
    ]
  );

  return mapSavedViewRow(res.rows[0]!);
}

export async function getSavedView(
  client: PoolClient,
  workspaceId: string,
  userId: string,
  viewId: string
): Promise<SavedView> {
  const res = await client.query<SavedViewRow>(
    `SELECT * FROM app.saved_views
     WHERE workspace_id = $1 AND id = $2 AND (user_id = $3 OR is_shared = true);`,
    [workspaceId, viewId, userId]
  );
  if (res.rows.length === 0) {
    throw new NotFoundError('Saved view not found');
  }
  return mapSavedViewRow(res.rows[0]!);
}

export async function listSavedViews(
  client: PoolClient,
  workspaceId: string,
  userId: string
): Promise<SavedView[]> {
  const res = await client.query<SavedViewRow>(
    `SELECT * FROM app.saved_views
     WHERE workspace_id = $1 AND (user_id = $2 OR is_shared = true)
     ORDER BY is_pinned DESC, rank ASC, updated_at DESC;`,
    [workspaceId, userId]
  );
  return res.rows.map(mapSavedViewRow);
}

export async function updateSavedView(
  client: PoolClient,
  workspaceId: string,
  userId: string,
  viewId: string,
  input: UpdateSavedViewRequest
): Promise<SavedView> {
  const current = await getSavedView(client, workspaceId, userId, viewId);

  // If view is not owned by user, only allow editing if it's shared
  if (current.userId !== userId && !current.isShared) {
    throw new NotFoundError('Saved view not found');
  }

  if (input.expectedRevision !== undefined && current.revision !== undefined) {
    if (current.revision !== input.expectedRevision) {
      throw new ConflictError(
        `REVISION_CONFLICT: Expected revision ${input.expectedRevision}, but found ${current.revision}.`
      );
    }
  }

  const name = input.name !== undefined ? input.name.trim() : current.name;
  if (name.length === 0 || name.length > 100) {
    throw new ValidationError('Saved view name must be between 1 and 100 characters.');
  }

  const description =
    input.description !== undefined
      ? input.description
        ? input.description.trim()
        : null
      : current.description;

  const icon = input.icon !== undefined ? (input.icon ? input.icon.trim() : null) : current.icon;
  const color = input.color !== undefined ? (input.color ? input.color.trim() : null) : current.color;
  const filter = input.filter !== undefined ? input.filter : current.filter;
  const rank = input.rank !== undefined ? input.rank : current.rank;
  const isPinned = input.isPinned !== undefined ? Boolean(input.isPinned) : current.isPinned;
  const isShared = input.isShared !== undefined ? Boolean(input.isShared) : Boolean(current.isShared);
  const nextRevision = (current.revision || 1) + 1;

  const res = await client.query<SavedViewRow>(
    `UPDATE app.saved_views
     SET name = $1, description = $2, icon = $3, color = $4, filter = $5, rank = $6, is_pinned = $7, is_shared = $8, revision = $9, updated_at = now()
     WHERE workspace_id = $10 AND id = $11
     RETURNING *;`,
    [name, description, icon, color, JSON.stringify(filter), rank, isPinned, isShared, nextRevision, workspaceId, viewId]
  );

  return mapSavedViewRow(res.rows[0]!);
}

export async function deleteSavedView(
  client: PoolClient,
  workspaceId: string,
  userId: string,
  viewId: string
): Promise<void> {
  const current = await getSavedView(client, workspaceId, userId, viewId);
  if (current.userId !== userId) {
    throw new NotFoundError('Saved view not found');
  }
  const res = await client.query(
    `DELETE FROM app.saved_views
     WHERE workspace_id = $1 AND id = $2 AND user_id = $3;`,
    [workspaceId, viewId, userId]
  );
  if ((res.rowCount ?? 0) === 0) {
    throw new NotFoundError('Saved view not found');
  }
}

// --- Item Links & Backlinks Resolution ---

export async function resolveItemLinksAndBacklinks(
  client: PoolClient,
  workspaceId: string,
  itemId: string
): Promise<ResolvedItemLink[]> {
  // 1. Verify source item exists and is authorized in this workspace
  const srcRes = await client.query<{ id: string; security_scope: string }>(
    `SELECT id, security_scope FROM app.items
     WHERE workspace_id = $1 AND id = $2 AND deleted_at IS NULL;`,
    [workspaceId, itemId]
  );
  if (srcRes.rows.length === 0 || srcRes.rows[0]?.security_scope === 'vault') {
    return [];
  }

  // Query all links connected to this item in the workspace
  const linksRes = await client.query<{
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

  if (linksRes.rows.length === 0) {
    return [];
  }

  // Collect connected other-item IDs
  const otherItemIds = Array.from(
    new Set(
      linksRes.rows.map((r) => (r.source_item_id === itemId ? r.target_item_id : r.source_item_id))
    )
  );

  // Look up item metadata across items, notes, files, and folders in current workspace
  const itemsRes = await client.query<{
    id: string;
    kind: string;
    folder_id: string | null;
    deleted_at: Date | null;
    security_scope: string;
    title: string | null;
  }>(
    `SELECT i.id, i.kind, i.folder_id, i.deleted_at, i.security_scope,
            COALESCE(n.title, fl.file_name, f.name, 'Untitled') as title
     FROM app.items i
     LEFT JOIN app.notes n ON n.workspace_id = i.workspace_id AND n.id = i.id
     LEFT JOIN app.folders f ON f.workspace_id = i.workspace_id AND f.id = i.id
     LEFT JOIN app.file_items fl ON fl.workspace_id = i.workspace_id AND fl.id = i.id
     WHERE i.workspace_id = $1 AND i.id = ANY($2::uuid[]);`,
    [workspaceId, otherItemIds]
  );

  const itemMap = new Map<
    string,
    { id: string; kind: string; folderId: string | null; isDeleted: boolean; securityScope: string; title: string }
  >();

  for (const row of itemsRes.rows) {
    itemMap.set(row.id, {
      id: row.id,
      kind: row.kind,
      folderId: row.folder_id,
      isDeleted: row.deleted_at !== null,
      securityScope: row.security_scope,
      title: row.title || 'Untitled',
    });
  }

  const results: ResolvedItemLink[] = [];

  for (const row of linksRes.rows) {
    const isOutgoing = row.source_item_id === itemId;
    const otherId = isOutgoing ? row.target_item_id : row.source_item_id;
    const itemInfo = itemMap.get(otherId);

    let isAvailable = false;
    let unavailableReason: 'deleted' | 'not_found' | 'unauthorized' | undefined = undefined;

    if (!itemInfo) {
      isAvailable = false;
      unavailableReason = 'not_found';
    } else if (itemInfo.securityScope === 'vault') {
      // Vault content must never leak through ordinary links
      isAvailable = false;
      unavailableReason = 'unauthorized';
    } else if (itemInfo.isDeleted) {
      isAvailable = false;
      unavailableReason = 'deleted';
    } else {
      isAvailable = true;
    }

    const targetTitle =
      itemInfo && isAvailable
        ? itemInfo.title
        : itemInfo && itemInfo.isDeleted
          ? itemInfo.title
          : null;

    results.push({
      id: row.id,
      workspaceId: row.workspace_id,
      sourceItemId: row.source_item_id,
      targetItemId: row.target_item_id,
      linkType: row.link_type,
      direction: isOutgoing ? 'outgoing' : 'incoming',
      targetId: otherId,
      targetTitle,
      isAvailable,
      unavailableReason,
      createdAt: row.created_at.toISOString(),
      target: {
        id: otherId,
        title: itemInfo && itemInfo.securityScope !== 'vault' ? itemInfo.title : 'Unavailable Item',
        kind: itemInfo ? itemInfo.kind : 'item',
        folderId: itemInfo && itemInfo.securityScope !== 'vault' ? itemInfo.folderId : null,
        isAvailable,
        unavailableReason,
      },
    });
  }

  return results;
}

