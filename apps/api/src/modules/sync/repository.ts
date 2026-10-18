import type { PoolClient } from 'pg';

export interface WorkspaceSyncState {
  workspaceId: string;
  nextChangeSeq: number;
  accessEpoch: string;
  updatedAt: Date;
}

export interface MutationReceiptRecord {
  id: string;
  workspaceId: string;
  actorUserId: string;
  deviceId: string;
  operationId: string;
  command: string;
  entityType: string;
  entityId: string;
  schemaVersion: number;
  baseRevision: number;
  canonicalPayloadHash: string;
  status: 'accepted' | 'conflict' | 'rejected';
  acceptedRevision: number | null;
  appliedChangeSeq: number | null;
  resultPayload: Record<string, unknown>;
  createdAt: Date;
}

export interface ChangeDbRecord {
  seq: number;
  entityType: string;
  entityId: string;
  revision: number;
  isTombstone: boolean;
  operationId: string;
  changeData: Record<string, unknown>;
  createdAt: Date;
}

export interface SyncItemRecord {
  id: string;
  workspaceId: string;
  folderId: string | null;
  kind: string;
  createdBy: string;
  updatedBy: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  displayOrder: number;
  revision: number;
  rank: string;
  isArchived: boolean;
  isPinned: boolean;
  securityScope: 'standard' | 'vault';
  name?: string;
  color?: string | null;
  icon?: string | null;
  title?: string;
  document?: Record<string, unknown>;
  plainText?: string;
  wordCount?: number;
  charCount?: number;
}

/**
 * Acquires a row-level lock on the workspace sync state row.
 * Serializes mutations within one workspace while preserving concurrent execution
 * across different workspaces.
 */
export async function lockWorkspaceSyncState(
  client: PoolClient,
  workspaceId: string
): Promise<{ nextChangeSeq: number; accessEpoch: string }> {
  // Ensure row exists
  await client.query(
    `INSERT INTO app.workspace_sync_state (workspace_id, next_change_seq, access_epoch)
     VALUES ($1, 1, gen_random_uuid()::text)
     ON CONFLICT (workspace_id) DO NOTHING;`,
    [workspaceId]
  );

  const res = await client.query<{ next_change_seq: string; access_epoch: string }>(
    `SELECT next_change_seq, access_epoch
     FROM app.workspace_sync_state
     WHERE workspace_id = $1
     FOR UPDATE;`,
    [workspaceId]
  );

  const row = res.rows[0];
  if (!row) {
    throw new Error(`Failed to lock workspace_sync_state for workspace ${workspaceId}`);
  }

  return {
    nextChangeSeq: Number(row.next_change_seq),
    accessEpoch: row.access_epoch,
  };
}

export async function getWorkspaceSyncState(
  client: PoolClient,
  workspaceId: string
): Promise<{ nextChangeSeq: number; accessEpoch: string } | null> {
  const res = await client.query<{ next_change_seq: string; access_epoch: string }>(
    `SELECT next_change_seq, access_epoch
     FROM app.workspace_sync_state
     WHERE workspace_id = $1;`,
    [workspaceId]
  );
  const row = res.rows[0];
  if (!row) return null;
  return {
    nextChangeSeq: Number(row.next_change_seq),
    accessEpoch: row.access_epoch,
  };
}

export async function updateWorkspaceSyncSeq(
  client: PoolClient,
  workspaceId: string,
  nextSeq: number
): Promise<void> {
  await client.query(
    `UPDATE app.workspace_sync_state
     SET next_change_seq = $2, updated_at = now()
     WHERE workspace_id = $1;`,
    [workspaceId, nextSeq]
  );
}

export async function getMutationReceipt(
  client: PoolClient,
  actorUserId: string,
  deviceId: string,
  operationId: string
): Promise<MutationReceiptRecord | null> {
  const res = await client.query<{
    id: string;
    workspace_id: string;
    actor_user_id: string;
    device_id: string;
    operation_id: string;
    command: string;
    entity_type: string;
    entity_id: string;
    schema_version: number;
    base_revision: string;
    canonical_payload_hash: string;
    status: 'accepted' | 'conflict' | 'rejected';
    accepted_revision: string | null;
    applied_change_seq: string | null;
    result_payload: Record<string, unknown>;
    created_at: Date;
  }>(
    `SELECT * FROM app.mutation_receipts
     WHERE actor_user_id = $1 AND device_id = $2 AND operation_id = $3;`,
    [actorUserId, deviceId, operationId]
  );

  const r = res.rows[0];
  if (!r) return null;

  return {
    id: r.id,
    workspaceId: r.workspace_id,
    actorUserId: r.actor_user_id,
    deviceId: r.device_id,
    operationId: r.operation_id,
    command: r.command,
    entityType: r.entity_type,
    entityId: r.entity_id,
    schemaVersion: r.schema_version,
    baseRevision: Number(r.base_revision),
    canonicalPayloadHash: r.canonical_payload_hash,
    status: r.status,
    acceptedRevision: r.accepted_revision !== null ? Number(r.accepted_revision) : null,
    appliedChangeSeq: r.applied_change_seq !== null ? Number(r.applied_change_seq) : null,
    resultPayload: r.result_payload || {},
    createdAt: r.created_at,
  };
}

export async function insertMutationReceipt(
  client: PoolClient,
  receipt: {
    workspaceId: string;
    actorUserId: string;
    deviceId: string;
    operationId: string;
    command: string;
    entityType: string;
    entityId: string;
    schemaVersion: number;
    baseRevision: number;
    canonicalPayloadHash: string;
    status: 'accepted' | 'conflict' | 'rejected';
    acceptedRevision: number | null;
    appliedChangeSeq: number | null;
    resultPayload: Record<string, unknown>;
  }
): Promise<void> {
  await client.query(
    `INSERT INTO app.mutation_receipts (
      workspace_id, actor_user_id, device_id, operation_id, command, entity_type,
      entity_id, schema_version, base_revision, canonical_payload_hash, status,
      accepted_revision, applied_change_seq, result_payload
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14);`,
    [
      receipt.workspaceId,
      receipt.actorUserId,
      receipt.deviceId,
      receipt.operationId,
      receipt.command,
      receipt.entityType,
      receipt.entityId,
      receipt.schemaVersion,
      receipt.baseRevision,
      receipt.canonicalPayloadHash,
      receipt.status,
      receipt.acceptedRevision,
      receipt.appliedChangeSeq,
      JSON.stringify(receipt.resultPayload),
    ]
  );
}

export async function insertChange(
  client: PoolClient,
  change: {
    workspaceId: string;
    seq: number;
    entityType: string;
    entityId: string;
    revision: number;
    isTombstone: boolean;
    operationId: string;
    changeData: Record<string, unknown>;
  }
): Promise<void> {
  await client.query(
    `INSERT INTO app.changes (
      workspace_id, seq, entity_type, entity_id, revision, is_tombstone, operation_id, change_data
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8);`,
    [
      change.workspaceId,
      change.seq,
      change.entityType,
      change.entityId,
      change.revision,
      change.isTombstone,
      change.operationId,
      JSON.stringify(change.changeData),
    ]
  );
}

export async function insertOutboxIntent(
  client: PoolClient,
  intent: {
    workspaceId: string;
    eventType: string;
    payload: Record<string, unknown>;
  }
): Promise<void> {
  await client.query(
    `INSERT INTO app.outbox_intents (workspace_id, event_type, payload)
     VALUES ($1, $2, $3);`,
    [intent.workspaceId, intent.eventType, JSON.stringify(intent.payload)]
  );
}

export async function getItemForSync(
  client: PoolClient,
  workspaceId: string,
  itemId: string
): Promise<SyncItemRecord | null> {
  const res = await client.query<{
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
    revision: string;
    rank: string;
    is_archived: boolean;
    is_pinned: boolean;
    security_scope: 'standard' | 'vault';
  }>(
    `SELECT id, workspace_id, folder_id, kind, created_by, updated_by, created_at, updated_at, deleted_at,
            display_order, revision, rank, is_archived, is_pinned, security_scope
     FROM app.items
     WHERE workspace_id = $1 AND id = $2;`,
    [workspaceId, itemId]
  );

  const r = res.rows[0];
  if (!r) return null;

  return {
    id: r.id,
    workspaceId: r.workspace_id,
    folderId: r.folder_id,
    kind: r.kind,
    createdBy: r.created_by,
    updatedBy: r.updated_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at,
    displayOrder: r.display_order,
    revision: Number(r.revision),
    rank: r.rank,
    isArchived: r.is_archived,
    isPinned: r.is_pinned,
    securityScope: r.security_scope,
  };
}

export async function insertItemForSync(
  client: PoolClient,
  item: {
    id: string;
    workspaceId: string;
    kind: string;
    folderId: string | null;
    createdBy: string;
    rank: string;
    revision: number;
    securityScope: 'standard' | 'vault';
  }
): Promise<void> {
  await client.query(
    `INSERT INTO app.items (
      id, workspace_id, kind, folder_id, created_by, updated_by,
      rank, revision, security_scope, display_order, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $5, $6, $7, $8, 0, now(), now());`,
    [
      item.id,
      item.workspaceId,
      item.kind,
      item.folderId,
      item.createdBy,
      item.rank,
      item.revision,
      item.securityScope,
    ]
  );
}

export async function updateItemForSync(
  client: PoolClient,
  item: {
    id: string;
    workspaceId: string;
    folderId?: string | null;
    clearFolderId?: boolean;
    rank?: string;
    updatedBy: string;
    revision: number;
  }
): Promise<void> {
  await client.query(
    `UPDATE app.items
     SET folder_id = CASE WHEN $3::boolean THEN NULL ELSE COALESCE($4, folder_id) END,
         rank = COALESCE($5, rank),
         updated_by = $6,
         revision = $7,
         updated_at = now()
     WHERE workspace_id = $1 AND id = $2;`,
    [
      item.workspaceId,
      item.id,
      Boolean(item.clearFolderId || item.folderId === null),
      item.folderId ?? null,
      item.rank ?? null,
      item.updatedBy,
      item.revision,
    ]
  );
}

export async function setItemFlagsForSync(
  client: PoolClient,
  params: {
    workspaceId: string;
    id: string;
    isArchived?: boolean;
    isPinned?: boolean;
    updatedBy: string;
    revision: number;
  }
): Promise<void> {
  await client.query(
    `UPDATE app.items
     SET is_archived = COALESCE($3, is_archived),
         is_pinned = COALESCE($4, is_pinned),
         updated_by = $5,
         revision = $6,
         updated_at = now()
     WHERE workspace_id = $1 AND id = $2;`,
    [
      params.workspaceId,
      params.id,
      params.isArchived !== undefined ? params.isArchived : null,
      params.isPinned !== undefined ? params.isPinned : null,
      params.updatedBy,
      params.revision,
    ]
  );
}

export async function tombstoneItemForSync(
  client: PoolClient,
  workspaceId: string,
  itemId: string,
  actorUserId: string,
  newRevision: number
): Promise<void> {
  await client.query(
    `UPDATE app.items
     SET deleted_at = now(),
         updated_by = $3,
         revision = $4,
         updated_at = now()
     WHERE workspace_id = $1 AND id = $2;`,
    [workspaceId, itemId, actorUserId, newRevision]
  );
}

export async function restoreItemForSync(
  client: PoolClient,
  workspaceId: string,
  itemId: string,
  actorUserId: string,
  newRevision: number
): Promise<void> {
  await client.query(
    `UPDATE app.items
     SET deleted_at = NULL,
         updated_by = $3,
         revision = $4,
         updated_at = now()
     WHERE workspace_id = $1 AND id = $2;`,
    [workspaceId, itemId, actorUserId, newRevision]
  );
}

export async function pullChanges(
  client: PoolClient,
  workspaceId: string,
  sinceSeq: number,
  limit: number
): Promise<ChangeDbRecord[]> {
  const res = await client.query<{
    seq: string;
    entity_type: string;
    entity_id: string;
    revision: string;
    is_tombstone: boolean;
    operation_id: string;
    change_data: Record<string, unknown>;
    created_at: Date;
  }>(
    `SELECT seq, entity_type, entity_id, revision, is_tombstone, operation_id, change_data, created_at
     FROM app.changes
     WHERE workspace_id = $1 AND seq > $2
     ORDER BY seq ASC
     LIMIT $3;`,
    [workspaceId, sinceSeq, limit]
  );

  return res.rows.map((r) => ({
    seq: Number(r.seq),
    entityType: r.entity_type,
    entityId: r.entity_id,
    revision: Number(r.revision),
    isTombstone: r.is_tombstone,
    operationId: r.operation_id,
    changeData: r.change_data || {},
    createdAt: r.created_at,
  }));
}

export async function listActiveItemsForBootstrap(
  client: PoolClient,
  workspaceId: string
): Promise<SyncItemRecord[]> {
  const res = await client.query<{
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
    revision: string;
    rank: string;
    is_archived: boolean;
    is_pinned: boolean;
    security_scope: 'standard' | 'vault';
    folder_name: string | null;
    folder_color: string | null;
    folder_icon: string | null;
    note_title: string | null;
    note_document: Record<string, unknown> | null;
    note_plain_text: string | null;
    note_word_count: string | number | null;
    note_char_count: string | number | null;
    note_purpose: string | null;
  }>(
    `SELECT i.id, i.workspace_id, i.folder_id, i.kind, i.created_by, i.updated_by, i.created_at, i.updated_at, i.deleted_at,
            i.display_order, i.revision, i.rank, i.is_archived, i.is_pinned, i.security_scope,
            f.name as folder_name, f.color as folder_color, f.icon as folder_icon,
            COALESCE(n.title, j.title, fi.file_name) as note_title,
            COALESCE(n.document, j.document) as note_document,
            COALESCE(n.plain_text, j.plain_text) as note_plain_text,
            COALESCE(n.word_count, j.word_count) as note_word_count,
            COALESCE(n.char_count, j.char_count) as note_char_count,
            n.purpose as note_purpose
     FROM app.items i
     LEFT JOIN app.folders f ON f.workspace_id = i.workspace_id AND f.id = i.id
     LEFT JOIN app.notes n ON n.workspace_id = i.workspace_id AND n.id = i.id
     LEFT JOIN app.journal_entries j ON j.workspace_id = i.workspace_id AND j.id = i.id
     LEFT JOIN app.file_items fi ON fi.workspace_id = i.workspace_id AND fi.id = i.id
     WHERE i.workspace_id = $1 AND i.deleted_at IS NULL
     ORDER BY i.created_at ASC;`,
    [workspaceId]
  );

  return res.rows.map((r) => {
    const isKnowledge = r.note_purpose && r.note_purpose !== 'standard';
    return {
      id: r.id,
      workspaceId: r.workspace_id,
      folderId: r.folder_id,
      kind: isKnowledge ? 'knowledge' : r.kind,
      createdBy: r.created_by,
      updatedBy: r.updated_by,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      deletedAt: r.deleted_at,
      displayOrder: r.display_order,
      revision: Number(r.revision),
      rank: r.rank,
      isArchived: r.is_archived,
      isPinned: r.is_pinned,
      securityScope: r.security_scope,
      purpose: r.note_purpose || 'standard',
      name: r.folder_name ?? r.note_title ?? undefined,
      color: r.folder_color,
      icon: r.folder_icon,
      title: r.note_title ?? r.folder_name ?? undefined,
      document: r.note_document ?? undefined,
      plainText: r.note_plain_text ?? undefined,
      wordCount: r.note_word_count !== null ? Number(r.note_word_count) : undefined,
      charCount: r.note_char_count !== null ? Number(r.note_char_count) : undefined,
    };
  });
}

export async function listActiveFilesForBootstrap(
  client: PoolClient,
  workspaceId: string
): Promise<
  Array<{
    id: string;
    workspaceId: string;
    folderId: string | null;
    fileName: string;
    declaredMimeType: string;
    detectedMimeType: string;
    byteSize: number;
    sha256Checksum: string;
    version: string;
    quarantineStatus: 'quarantined' | 'verified' | 'rejected' | 'deleted';
    rejectionReason: string | null;
    createdBy: string;
    createdAt: string;
    updatedAt: string;
    verifiedAt: string | null;
  }>
> {
  const res = await client.query<{
    id: string;
    workspace_id: string;
    folder_id: string | null;
    file_name: string;
    declared_mime_type: string;
    detected_mime_type: string;
    byte_size: string;
    sha256_checksum: string;
    version: string;
    quarantine_status: 'quarantined' | 'verified' | 'rejected' | 'deleted';
    rejection_reason: string | null;
    created_by: string;
    created_at: Date;
    updated_at: Date;
    verified_at: Date | null;
  }>(
    `SELECT id, workspace_id, folder_id, file_name, declared_mime_type, detected_mime_type,
            byte_size, sha256_checksum, version, quarantine_status, rejection_reason,
            created_by, created_at, updated_at, verified_at
     FROM app.file_items
     WHERE workspace_id = $1 AND quarantine_status = 'verified'
     ORDER BY created_at ASC;`,
    [workspaceId]
  );

  return res.rows.map((r) => ({
    id: r.id,
    workspaceId: r.workspace_id,
    folderId: r.folder_id,
    fileName: r.file_name,
    declaredMimeType: r.declared_mime_type,
    detectedMimeType: r.detected_mime_type,
    byteSize: Number(r.byte_size),
    sha256Checksum: r.sha256_checksum,
    version: r.version,
    quarantineStatus: r.quarantine_status,
    rejectionReason: r.rejection_reason,
    createdBy: r.created_by,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
    verifiedAt: r.verified_at ? r.verified_at.toISOString() : null,
  }));
}
