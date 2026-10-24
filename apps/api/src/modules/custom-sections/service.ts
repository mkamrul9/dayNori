import type { PoolClient } from 'pg';
import crypto from 'node:crypto';
import {
  type CreateCustomSectionRecordRequest,
  type CreateCustomSectionRequest,
  type CreateCustomSectionSchemaRequest,
  type CreateCustomSectionTemplateRequest,
  type CustomBlockDefinition,
  type CustomSectionItem,
  type CustomSectionRecordItem,
  type CustomSectionSchemaPayload,
  type CustomSectionTemplateItem,
  type ExistingRecordViewBlock,
  type ExistingRecordViewItemSummary,
  type QueryExistingRecordViewRequest,
  type SchemaMigrationPreviewData,
  type UpdateCustomSectionRecordRequest,
  type UpdateCustomSectionRequest,
  CustomSectionSchemaPayloadSchema,
  MAX_BLOCKS_PER_SECTION,
  MAX_FIELDS_PER_COLLECTION,
  MAX_RECORDS_PER_SECTION,
} from '@daynori/contracts';
import {
  APPROVED_SECTION_TEMPLATES,
  formatMinorUnitsToDecimal,
  generateSchemaMigrationPreview,
  migrateRecordValues,
  validateRecordAgainstSchema,
} from '@daynori/domain';
import {
  insertChange,
  lockWorkspaceSyncState,
  updateWorkspaceSyncSeq,
} from '../sync/repository.js';

export class CustomSectionTemplateNotFoundError extends Error {
  constructor(message = 'Custom section template not found') {
    super(message);
    this.name = 'CustomSectionTemplateNotFoundError';
  }
}

export class CustomSectionNotFoundError extends Error {
  constructor(message = 'Custom section not found') {
    super(message);
    this.name = 'CustomSectionNotFoundError';
  }
}

export class CustomSectionRecordNotFoundError extends Error {
  constructor(message = 'Custom section record not found') {
    super(message);
    this.name = 'CustomSectionRecordNotFoundError';
  }
}

export class CustomSectionSchemaVersionNotFoundError extends Error {
  constructor(message = 'Custom section schema version not found') {
    super(message);
    this.name = 'CustomSectionSchemaVersionNotFoundError';
  }
}

export class CustomSectionRevisionConflictError extends Error {
  constructor(message = 'Revision conflict: The custom section has been modified by another process') {
    super(message);
    this.name = 'CustomSectionRevisionConflictError';
  }
}

export class CustomSectionValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CustomSectionValidationError';
  }
}

/**
 * Creates a new custom section with an initial version 1 schema.
 */
export async function createCustomSection(
  client: PoolClient,
  workspaceId: string,
  userId: string,
  data: CreateCustomSectionRequest,
  operationId?: string
): Promise<CustomSectionItem> {
  if (data.initialSchema.blocks.length > MAX_BLOCKS_PER_SECTION) {
    throw new CustomSectionValidationError(
      `Section exceeds maximum limit of ${MAX_BLOCKS_PER_SECTION} blocks`
    );
  }

  for (const block of data.initialSchema.blocks) {
    if (block.type === 'field_collection' && block.fields.length > MAX_FIELDS_PER_COLLECTION) {
      throw new CustomSectionValidationError(
        `Field collection "${block.title}" exceeds maximum limit of ${MAX_FIELDS_PER_COLLECTION} fields`
      );
    }
  }

  const sectionRes = await client.query(
    `
    INSERT INTO app.custom_sections (
      workspace_id,
      name,
      description,
      icon,
      current_schema_version,
      layout_mode,
      status,
      rank,
      created_by,
      updated_by,
      revision,
      created_at,
      updated_at
    )
    VALUES ($1, $2, $3, $4, 1, $5, 'active', $6, $7, $7, 1, now(), now())
    RETURNING
      id,
      workspace_id,
      name,
      description,
      icon,
      current_schema_version,
      layout_mode,
      status,
      rank,
      created_by,
      updated_by,
      revision,
      created_at,
      updated_at
    `,
    [
      workspaceId,
      data.name.trim(),
      data.description?.trim() || null,
      data.icon || null,
      data.layoutMode || 'single_column',
      data.rank || '0|hzzzzz:',
      userId,
    ]
  );

  const row = sectionRes.rows[0];
  const sectionId = row.id;

  // Insert initial version 1 schema
  await client.query(
    `
    INSERT INTO app.custom_section_schemas (
      section_id,
      workspace_id,
      version,
      blocks,
      created_by,
      created_at
    )
    VALUES ($1, $2, 1, $3, $4, now())
    `,
    [sectionId, workspaceId, JSON.stringify(data.initialSchema.blocks), userId]
  );

  // Sync change feed
  const syncState = await lockWorkspaceSyncState(client, workspaceId);
  const changeSeq = syncState.nextChangeSeq;
  await updateWorkspaceSyncSeq(client, workspaceId, changeSeq + 1);
  await insertChange(client, {
    workspaceId,
    seq: changeSeq,
    entityType: 'custom_section',
    entityId: sectionId,
    revision: 1,
    isTombstone: false,
    operationId: operationId || crypto.randomUUID(),
    changeData: {
      id: sectionId,
      name: row.name,
      currentSchemaVersion: 1,
    },
  });

  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    description: row.description,
    icon: row.icon,
    currentSchemaVersion: row.current_schema_version,
    layoutMode: row.layout_mode,
    status: row.status,
    rank: row.rank,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    revision: row.revision,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    currentSchema: {
      version: 1,
      blocks: data.initialSchema.blocks,
    },
  };
}

/**
 * Lists active custom sections in a workspace with their current schemas.
 */
export async function listCustomSections(
  client: PoolClient,
  workspaceId: string,
  status: 'active' | 'archived' = 'active'
): Promise<CustomSectionItem[]> {
  const res = await client.query(
    `
    SELECT
      s.id,
      s.workspace_id,
      s.name,
      s.description,
      s.icon,
      s.current_schema_version,
      s.layout_mode,
      s.status,
      s.rank,
      s.created_by,
      s.updated_by,
      s.revision,
      s.created_at,
      s.updated_at,
      sch.blocks AS current_blocks
    FROM app.custom_sections s
    LEFT JOIN app.custom_section_schemas sch
      ON sch.section_id = s.id AND sch.version = s.current_schema_version
    WHERE s.workspace_id = $1 AND s.status = $2 AND s.deleted_at IS NULL
    ORDER BY s.rank ASC, s.created_at ASC
    `,
    [workspaceId, status]
  );

  return res.rows.map((row) => ({
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    description: row.description,
    icon: row.icon,
    currentSchemaVersion: row.current_schema_version,
    layoutMode: row.layout_mode,
    status: row.status,
    rank: row.rank,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    revision: row.revision,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    currentSchema: row.current_blocks
      ? {
          version: row.current_schema_version,
          blocks: row.current_blocks,
        }
      : undefined,
  }));
}

/**
 * Gets a custom section by ID with its current schema.
 */
export async function getCustomSection(
  client: PoolClient,
  workspaceId: string,
  sectionId: string
): Promise<CustomSectionItem> {
  const res = await client.query(
    `
    SELECT
      s.id,
      s.workspace_id,
      s.name,
      s.description,
      s.icon,
      s.current_schema_version,
      s.layout_mode,
      s.status,
      s.rank,
      s.created_by,
      s.updated_by,
      s.revision,
      s.created_at,
      s.updated_at,
      sch.blocks AS current_blocks
    FROM app.custom_sections s
    LEFT JOIN app.custom_section_schemas sch
      ON sch.section_id = s.id AND sch.version = s.current_schema_version
    WHERE s.workspace_id = $1 AND s.id = $2 AND s.deleted_at IS NULL
    `,
    [workspaceId, sectionId]
  );

  if (res.rows.length === 0) {
    throw new CustomSectionNotFoundError(`Custom section ${sectionId} not found`);
  }

  const row = res.rows[0];
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    description: row.description,
    icon: row.icon,
    currentSchemaVersion: row.current_schema_version,
    layoutMode: row.layout_mode,
    status: row.status,
    rank: row.rank,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    revision: row.revision,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    currentSchema: row.current_blocks
      ? {
          version: row.current_schema_version,
          blocks: row.current_blocks,
        }
      : undefined,
  };
}

/**
 * Updates section metadata with optimistic concurrency control.
 */
export async function updateCustomSection(
  client: PoolClient,
  workspaceId: string,
  userId: string,
  sectionId: string,
  data: UpdateCustomSectionRequest,
  operationId?: string
): Promise<CustomSectionItem> {
  const currentRes = await client.query<{
    id: string;
    revision: number;
    current_schema_version: number;
  }>(
    `SELECT id, revision, current_schema_version
     FROM app.custom_sections
     WHERE workspace_id = $1 AND id = $2 AND deleted_at IS NULL
     FOR UPDATE`,
    [workspaceId, sectionId]
  );
  if (currentRes.rows.length === 0 || !currentRes.rows[0]) {
    throw new CustomSectionNotFoundError(`Custom section ${sectionId} not found`);
  }
  const current = currentRes.rows[0];
  if (current.revision !== data.expectedRevision) {
    throw new CustomSectionRevisionConflictError(
      `Expected revision ${data.expectedRevision} but found ${current.revision}`
    );
  }

  const newRevision = current.revision + 1;
  const res = await client.query(
    `
    UPDATE app.custom_sections
    SET
      name = COALESCE($1, name),
      description = CASE WHEN $2::boolean THEN $3 ELSE description END,
      icon = CASE WHEN $4::boolean THEN $5 ELSE icon END,
      layout_mode = COALESCE($6, layout_mode),
      status = COALESCE($7, status),
      rank = COALESCE($8, rank),
      revision = $9,
      updated_by = $10,
      updated_at = now()
    WHERE workspace_id = $11 AND id = $12 AND revision = $13 AND deleted_at IS NULL
    RETURNING
      id,
      name,
      revision
    `,
    [
      data.name ? data.name.trim() : null,
      data.description !== undefined,
      data.description?.trim() || null,
      data.icon !== undefined,
      data.icon || null,
      data.layoutMode || null,
      data.status || null,
      data.rank || null,
      newRevision,
      userId,
      workspaceId,
      sectionId,
      data.expectedRevision,
    ]
  );

  if (res.rows.length === 0 || !res.rows[0]) {
    throw new CustomSectionRevisionConflictError(
      `Revision conflict on custom section ${sectionId}`
    );
  }

  const row = res.rows[0];

  // Sync change feed
  const syncState = await lockWorkspaceSyncState(client, workspaceId);
  const changeSeq = syncState.nextChangeSeq;
  await updateWorkspaceSyncSeq(client, workspaceId, changeSeq + 1);
  await insertChange(client, {
    workspaceId,
    seq: changeSeq,
    entityType: 'custom_section',
    entityId: sectionId,
    revision: newRevision,
    isTombstone: false,
    operationId: operationId || crypto.randomUUID(),
    changeData: {
      id: sectionId,
      name: row.name,
      revision: newRevision,
    },
  });

  return getCustomSection(client, workspaceId, sectionId);
}

/**
 * Deletes a custom section.
 * Note: Removing a section must NOT delete its referenced canonical items.
 */
export async function deleteCustomSection(
  client: PoolClient,
  workspaceId: string,
  _userId: string,
  sectionId: string,
  operationId?: string
): Promise<{ deleted: boolean }> {
  const res = await client.query(
    `
    UPDATE app.custom_sections
    SET deleted_at = now(), updated_at = now()
    WHERE workspace_id = $1 AND id = $2 AND deleted_at IS NULL
    RETURNING id
    `,
    [workspaceId, sectionId]
  );

  if (res.rows.length === 0) {
    throw new CustomSectionNotFoundError(`Custom section ${sectionId} not found`);
  }

  // Sync change feed
  const syncState = await lockWorkspaceSyncState(client, workspaceId);
  const changeSeq = syncState.nextChangeSeq;
  await updateWorkspaceSyncSeq(client, workspaceId, changeSeq + 1);
  await insertChange(client, {
    workspaceId,
    seq: changeSeq,
    entityType: 'custom_section',
    entityId: sectionId,
    revision: 1,
    isTombstone: true,
    operationId: operationId || crypto.randomUUID(),
    changeData: { id: sectionId },
  });

  return { deleted: true };
}

/**
 * Creates a new schema version for a section and safely migrates all existing records.
 */
export async function createCustomSectionSchema(
  client: PoolClient,
  workspaceId: string,
  userId: string,
  sectionId: string,
  data: CreateCustomSectionSchemaRequest,
  operationId?: string
): Promise<CustomSectionSchemaPayload> {
  const section = await getCustomSection(client, workspaceId, sectionId);

  if (data.blocks.length > MAX_BLOCKS_PER_SECTION) {
    throw new CustomSectionValidationError(
      `Section exceeds maximum limit of ${MAX_BLOCKS_PER_SECTION} blocks`
    );
  }

  for (const block of data.blocks) {
    if (block.type === 'field_collection' && block.fields.length > MAX_FIELDS_PER_COLLECTION) {
      throw new CustomSectionValidationError(
        `Field collection "${block.title}" exceeds maximum limit of ${MAX_FIELDS_PER_COLLECTION} fields`
      );
    }
  }

  const oldVersion = section.currentSchemaVersion;
  const newVersion = oldVersion + 1;

  // Insert new schema version
  await client.query(
    `
    INSERT INTO app.custom_section_schemas (
      section_id,
      workspace_id,
      version,
      blocks,
      created_by,
      created_at
    )
    VALUES ($1, $2, $3, $4, $5, now())
    `,
    [sectionId, workspaceId, newVersion, JSON.stringify(data.blocks), userId]
  );

  // Update section's current_schema_version
  await client.query(
    `
    UPDATE app.custom_sections
    SET
      current_schema_version = $1,
      revision = revision + 1,
      updated_by = $2,
      updated_at = now()
    WHERE workspace_id = $3 AND id = $4
    `,
    [newVersion, userId, workspaceId, sectionId]
  );

  // Migrate existing records: preserve values, archive removed or incompatible fields
  if (section.currentSchema) {
    const recordsRes = await client.query(
      `
      SELECT id, field_values, archived_values, revision
      FROM app.custom_section_records
      WHERE workspace_id = $1 AND section_id = $2 AND deleted_at IS NULL
      `,
      [workspaceId, sectionId]
    );

    const newSchemaPayload: CustomSectionSchemaPayload = {
      version: newVersion,
      blocks: data.blocks,
    };

    for (const rec of recordsRes.rows) {
      const migration = migrateRecordValues(
        section.currentSchema,
        newSchemaPayload,
        rec.field_values || {},
        rec.archived_values || {}
      );

      await client.query(
        `
        UPDATE app.custom_section_records
        SET
          schema_version = $1,
          field_values = $2,
          archived_values = $3,
          revision = revision + 1,
          updated_by = $4,
          updated_at = now()
        WHERE id = $5
        `,
        [
          newVersion,
          JSON.stringify(migration.fieldValues),
          JSON.stringify(migration.archivedValues),
          userId,
          rec.id,
        ]
      );
    }
  }

  // Sync change feed
  const syncState = await lockWorkspaceSyncState(client, workspaceId);
  const changeSeq = syncState.nextChangeSeq;
  await updateWorkspaceSyncSeq(client, workspaceId, changeSeq + 1);
  await insertChange(client, {
    workspaceId,
    seq: changeSeq,
    entityType: 'custom_section',
    entityId: sectionId,
    revision: section.revision + 1,
    isTombstone: false,
    operationId: operationId || crypto.randomUUID(),
    changeData: {
      id: sectionId,
      currentSchemaVersion: newVersion,
    },
  });

  return {
    version: newVersion,
    blocks: data.blocks,
  };
}

/**
 * Gets a specific schema version for a section.
 */
export async function getCustomSectionSchemaVersion(
  client: PoolClient,
  workspaceId: string,
  sectionId: string,
  version: number
): Promise<CustomSectionSchemaPayload> {
  const res = await client.query(
    `
    SELECT blocks, version
    FROM app.custom_section_schemas
    WHERE workspace_id = $1 AND section_id = $2 AND version = $3
    `,
    [workspaceId, sectionId, version]
  );

  if (res.rows.length === 0) {
    throw new CustomSectionSchemaVersionNotFoundError(
      `Schema version ${version} not found for custom section ${sectionId}`
    );
  }

  return {
    version: res.rows[0].version,
    blocks: res.rows[0].blocks,
  };
}

/**
 * Validates that referenced file attachments and canonical item links exist in the same workspace,
 * are verified (not quarantined or deleted), and are not encrypted vault items.
 * Records attachment references in app.item_attachments and reconciles deleted references.
 */
async function validateAndLinkReferences(
  client: PoolClient,
  workspaceId: string,
  recordId: string,
  userId: string,
  schema: CustomSectionSchemaPayload,
  sanitized: Record<string, unknown>
): Promise<void> {
  const activeAttachmentIds: string[] = [];

  for (const block of schema.blocks) {
    if (block.type === 'field_collection') {
      for (const field of block.fields) {
        const val = sanitized[field.id];
        if (!val) continue;

        if (field.type === 'attachment' && typeof val === 'string') {
          const fileRes = await client.query<{
            id: string;
            file_name: string;
            declared_mime_type: string;
            byte_size: string;
            quarantine_status: string;
          }>(
            `SELECT f.id, f.file_name, f.declared_mime_type, f.byte_size, f.quarantine_status
             FROM app.file_items f
             JOIN app.items i ON i.id = f.id AND i.workspace_id = f.workspace_id
             WHERE f.id = $1 AND f.workspace_id = $2 AND i.deleted_at IS NULL AND f.quarantine_status != 'deleted' AND i.security_scope = 'standard'`,
            [val, workspaceId]
          );
          if (fileRes.rows.length === 0 || !fileRes.rows[0]) {
            throw new CustomSectionValidationError(
              `Referenced file attachment "${val}" does not exist, is deleted, or belongs to a different security scope/workspace`
            );
          }
          const file = fileRes.rows[0];
          if (file.quarantine_status !== 'verified') {
            throw new CustomSectionValidationError(
              `Referenced file attachment "${val}" has not passed security verification`
            );
          }
          if (field.allowedMimeTypes && field.allowedMimeTypes.length > 0) {
            if (!field.allowedMimeTypes.includes(file.declared_mime_type)) {
              throw new CustomSectionValidationError(
                `Attachment MIME type "${file.declared_mime_type}" is not allowed for field "${field.label}"`
              );
            }
          }

          const attachmentType = file.declared_mime_type.startsWith('audio/') ? 'audio' : 'file';
          const byteSize = BigInt(file.byte_size || '1');

          await client.query(
            `INSERT INTO app.item_attachments (
               workspace_id, item_id, file_id, attachment_type, file_name, mime_type, byte_size, created_by, created_at, updated_at
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now(), now())
             ON CONFLICT (workspace_id, item_id, file_id) DO UPDATE
             SET file_name = EXCLUDED.file_name, mime_type = EXCLUDED.mime_type, byte_size = EXCLUDED.byte_size, updated_at = now()`,
            [workspaceId, recordId, val, attachmentType, file.file_name, file.declared_mime_type, byteSize.toString(), userId]
          );
          activeAttachmentIds.push(val);
        } else if (field.type === 'link' && typeof val === 'string') {
          if (val.startsWith('item:')) {
            const targetItemId = val.slice(5);
            const itemRes = await client.query<{ id: string }>(
              `SELECT id
               FROM app.items
               WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL AND security_scope = 'standard'`,
              [targetItemId, workspaceId]
            );
            if (itemRes.rows.length === 0 || !itemRes.rows[0]) {
              throw new CustomSectionValidationError(
                `Referenced item link "${val}" does not exist, is deleted, or belongs to a different security scope/workspace`
              );
            }
          }
        }
      }
    }
  }

  // Reconcile attachments: unreferenced attachments for this record are deleted without deleting shared files
  if (activeAttachmentIds.length > 0) {
    await client.query(
      `DELETE FROM app.item_attachments
       WHERE workspace_id = $1 AND item_id = $2 AND NOT (file_id = ANY($3::uuid[]))`,
      [workspaceId, recordId, activeAttachmentIds]
    );
  } else {
    await client.query(
      `DELETE FROM app.item_attachments
       WHERE workspace_id = $1 AND item_id = $2`,
      [workspaceId, recordId]
    );
  }
}

/**
 * Creates a record in a section's field collection.
 */
export async function createCustomSectionRecord(
  client: PoolClient,
  workspaceId: string,
  userId: string,
  sectionId: string,
  data: CreateCustomSectionRecordRequest,
  operationId?: string
): Promise<CustomSectionRecordItem> {
  const section = await getCustomSection(client, workspaceId, sectionId);
  if (!section.currentSchema) {
    throw new CustomSectionValidationError('Section has no active schema');
  }

  // Check section record count limit
  const countRes = await client.query(
    `
    SELECT COUNT(*)::int AS count
    FROM app.custom_section_records
    WHERE workspace_id = $1 AND section_id = $2 AND deleted_at IS NULL
    `,
    [workspaceId, sectionId]
  );
  if ((countRes.rows[0]?.count ?? 0) >= MAX_RECORDS_PER_SECTION) {
    throw new CustomSectionValidationError(
      `Custom section record limit of ${MAX_RECORDS_PER_SECTION} reached`
    );
  }

  // Validate values against schema
  const validation = validateRecordAgainstSchema(section.currentSchema, data.fieldValues);
  if (!validation.valid) {
    throw new CustomSectionValidationError(validation.errors.join('; '));
  }

  // Validate folder placement if provided
  if (data.folderId) {
    const folderRes = await client.query<{ id: string }>(
      `SELECT i.id
       FROM app.folders f
       JOIN app.items i ON i.id = f.id AND i.workspace_id = f.workspace_id
       WHERE f.id = $1 AND f.workspace_id = $2 AND i.deleted_at IS NULL AND i.security_scope = 'standard'`,
      [data.folderId, workspaceId]
    );
    if (folderRes.rows.length === 0) {
      throw new CustomSectionValidationError(
        `Folder "${data.folderId}" does not exist, is deleted, or belongs to a different security scope/workspace`
      );
    }
  }

  // Validate collectionId if provided
  if (data.collectionId) {
    const matchingCollection = section.currentSchema.blocks.find(
      (b) => b.type === 'field_collection' && b.id === data.collectionId
    );
    if (!matchingCollection) {
      throw new CustomSectionValidationError(
        `Collection "${data.collectionId}" does not exist in section "${sectionId}" schema version ${section.currentSchema.version}`
      );
    }
  }

  const sanitized = validation.sanitizedValues || {};
  const recordId = crypto.randomUUID();
  const folderId = data.folderId || null;
  const collectionId = data.collectionId || null;
  const rank = data.rank || '0|hzzzzz:';

  // 1. Insert canonical app.items row
  await client.query(
    `INSERT INTO app.items (
      id, workspace_id, folder_id, kind, created_by, updated_by,
      revision, rank, is_archived, is_pinned, security_scope, created_at, updated_at
    ) VALUES ($1, $2, $3, 'custom_record', $4, $4, 1, $5, false, false, 'standard', now(), now());`,
    [recordId, workspaceId, folderId, userId, rank]
  );

  // 2. Insert into app.custom_section_records with shared ID
  const recordRes = await client.query(
    `
    INSERT INTO app.custom_section_records (
      id,
      section_id,
      workspace_id,
      schema_version,
      folder_id,
      collection_id,
      field_values,
      archived_values,
      rank,
      created_by,
      updated_by,
      revision,
      created_at,
      updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, '{}'::jsonb, $8, $9, $9, 1, now(), now())
    RETURNING
      id,
      section_id,
      workspace_id,
      schema_version,
      folder_id,
      collection_id,
      field_values,
      archived_values,
      rank,
      created_by,
      updated_by,
      revision,
      created_at,
      updated_at
    `,
    [
      recordId,
      sectionId,
      workspaceId,
      section.currentSchemaVersion,
      folderId,
      collectionId,
      JSON.stringify(sanitized),
      rank,
      userId,
    ]
  );

  const row = recordRes.rows[0];

  // Validate and link file attachments / internal item links
  await validateAndLinkReferences(client, workspaceId, row.id, userId, section.currentSchema, sanitized);

  // Sync change feed
  const syncState = await lockWorkspaceSyncState(client, workspaceId);
  const changeSeq = syncState.nextChangeSeq;
  await updateWorkspaceSyncSeq(client, workspaceId, changeSeq + 1);
  await insertChange(client, {
    workspaceId,
    seq: changeSeq,
    entityType: 'custom_section_record',
    entityId: row.id,
    revision: 1,
    isTombstone: false,
    operationId: operationId || crypto.randomUUID(),
    changeData: {
      id: row.id,
      sectionId,
      revision: 1,
    },
  });

  return {
    id: row.id,
    sectionId: row.section_id,
    workspaceId: row.workspace_id,
    collectionId: row.collection_id ?? undefined,
    folderId: row.folder_id ?? undefined,
    schemaVersion: row.schema_version,
    fieldValues: row.field_values,
    archivedValues: row.archived_values,
    rank: row.rank,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    revision: row.revision,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

/**
 * Lists records in a custom section.
 */
export async function listCustomSectionRecords(
  client: PoolClient,
  workspaceId: string,
  sectionId: string,
  options?: { limit?: number; cursor?: string }
): Promise<CustomSectionRecordItem[]> {
  await getCustomSection(client, workspaceId, sectionId);
  const limit = Math.min(100, Math.max(1, options?.limit ?? 50));

  const res = await client.query(
    `
    SELECT
      id,
      section_id,
      workspace_id,
      schema_version,
      folder_id,
      collection_id,
      field_values,
      archived_values,
      rank,
      created_by,
      updated_by,
      revision,
      created_at,
      updated_at
    FROM app.custom_section_records
    WHERE workspace_id = $1 AND section_id = $2 AND deleted_at IS NULL
    ORDER BY rank ASC, created_at ASC
    LIMIT $3
    `,
    [workspaceId, sectionId, limit]
  );

  return res.rows.map((row) => ({
    id: row.id,
    sectionId: row.section_id,
    workspaceId: row.workspace_id,
    collectionId: row.collection_id ?? undefined,
    folderId: row.folder_id ?? undefined,
    schemaVersion: row.schema_version,
    fieldValues: row.field_values,
    archivedValues: row.archived_values,
    rank: row.rank,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    revision: row.revision,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  }));
}

/**
 * Gets a single record by ID.
 */
export async function getCustomSectionRecord(
  client: PoolClient,
  workspaceId: string,
  sectionId: string,
  recordId: string
): Promise<CustomSectionRecordItem> {
  const res = await client.query(
    `
    SELECT
      id,
      section_id,
      workspace_id,
      schema_version,
      folder_id,
      collection_id,
      field_values,
      archived_values,
      rank,
      created_by,
      updated_by,
      revision,
      created_at,
      updated_at
    FROM app.custom_section_records
    WHERE workspace_id = $1 AND section_id = $2 AND id = $3 AND deleted_at IS NULL
    `,
    [workspaceId, sectionId, recordId]
  );

  if (res.rows.length === 0) {
    throw new CustomSectionRecordNotFoundError(
      `Record ${recordId} not found in custom section ${sectionId}`
    );
  }

  const row = res.rows[0];
  return {
    id: row.id,
    sectionId: row.section_id,
    workspaceId: row.workspace_id,
    collectionId: row.collection_id ?? undefined,
    folderId: row.folder_id ?? undefined,
    schemaVersion: row.schema_version,
    fieldValues: row.field_values,
    archivedValues: row.archived_values,
    rank: row.rank,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    revision: row.revision,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

/**
 * Updates a custom section record with optimistic revision concurrency.
 */
export async function updateCustomSectionRecord(
  client: PoolClient,
  workspaceId: string,
  userId: string,
  sectionId: string,
  recordId: string,
  data: UpdateCustomSectionRecordRequest,
  operationId?: string
): Promise<CustomSectionRecordItem> {
  const currentRes = await client.query<{
    id: string;
    section_id: string;
    workspace_id: string;
    folder_id: string | null;
    collection_id: string | null;
    schema_version: number;
    field_values: Record<string, unknown>;
    archived_values: Record<string, unknown>;
    rank: string;
    created_by: string;
    updated_by: string;
    revision: number;
    created_at: Date;
    updated_at: Date;
  }>(
    `
    SELECT
      id,
      section_id,
      workspace_id,
      folder_id,
      collection_id,
      schema_version,
      field_values,
      archived_values,
      rank,
      created_by,
      updated_by,
      revision,
      created_at,
      updated_at
    FROM app.custom_section_records
    WHERE workspace_id = $1 AND section_id = $2 AND id = $3 AND deleted_at IS NULL
    FOR UPDATE
    `,
    [workspaceId, sectionId, recordId]
  );

  if (currentRes.rows.length === 0 || !currentRes.rows[0]) {
    throw new CustomSectionRecordNotFoundError(
      `Record ${recordId} not found in custom section ${sectionId}`
    );
  }

  const current = currentRes.rows[0];
  if (current.revision !== data.expectedRevision) {
    throw new CustomSectionRevisionConflictError(
      `Expected revision ${data.expectedRevision} but found ${current.revision}`
    );
  }

  const section = await getCustomSection(client, workspaceId, sectionId);
  if (!section.currentSchema) {
    throw new CustomSectionValidationError('Section has no active schema');
  }

  // Validate folder placement if provided
  if (data.folderId && data.folderId !== null) {
    const folderRes = await client.query<{ id: string }>(
      `SELECT i.id
       FROM app.folders f
       JOIN app.items i ON i.id = f.id AND i.workspace_id = f.workspace_id
       WHERE f.id = $1 AND f.workspace_id = $2 AND i.deleted_at IS NULL AND i.security_scope = 'standard'`,
      [data.folderId, workspaceId]
    );
    if (folderRes.rows.length === 0) {
      throw new CustomSectionValidationError(
        `Folder "${data.folderId}" does not exist, is deleted, or belongs to a different security scope/workspace`
      );
    }
  }

  // Validate collectionId if provided
  if (data.collectionId) {
    const matchingCollection = section.currentSchema.blocks.find(
      (b) => b.type === 'field_collection' && b.id === data.collectionId
    );
    if (!matchingCollection) {
      throw new CustomSectionValidationError(
        `Collection "${data.collectionId}" does not exist in section "${sectionId}" schema version ${section.currentSchema.version}`
      );
    }
  }

  // Validate updated values against current schema
  const mergedValues = { ...current.field_values, ...data.fieldValues };
  const validation = validateRecordAgainstSchema(section.currentSchema, mergedValues);
  if (!validation.valid) {
    throw new CustomSectionValidationError(validation.errors.join('; '));
  }

  const sanitized = validation.sanitizedValues || {};
  const newRevision = current.revision + 1;

  // Validate and link file attachments / internal item links
  await validateAndLinkReferences(client, workspaceId, recordId, userId, section.currentSchema, sanitized);

  // Sync canonical app.items row
  const resolvedFolderId = data.folderId === null ? null : (data.folderId ?? current.folder_id);
  await client.query(
    `UPDATE app.items
     SET folder_id = $1, rank = COALESCE($2, rank), revision = $3, updated_by = $4, updated_at = now()
     WHERE id = $5 AND workspace_id = $6`,
    [resolvedFolderId, data.rank || null, newRevision, userId, recordId, workspaceId]
  );

  const res = await client.query(
    `
    UPDATE app.custom_section_records
    SET
      field_values = $1,
      rank = COALESCE($2, rank),
      folder_id = CASE WHEN $9::text = '__CLEAR__' THEN NULL WHEN $9 IS NOT NULL THEN $9::uuid ELSE folder_id END,
      collection_id = COALESCE($10, collection_id),
      revision = $3,
      updated_by = $4,
      updated_at = now()
    WHERE workspace_id = $5 AND section_id = $6 AND id = $7 AND revision = $8 AND deleted_at IS NULL
    RETURNING
      id,
      section_id,
      workspace_id,
      schema_version,
      folder_id,
      collection_id,
      field_values,
      archived_values,
      rank,
      created_by,
      updated_by,
      revision,
      created_at,
      updated_at
    `,
    [
      JSON.stringify(sanitized),
      data.rank || null,
      newRevision,
      userId,
      workspaceId,
      sectionId,
      recordId,
      data.expectedRevision,
      data.folderId === null ? '__CLEAR__' : (data.folderId || null),
      data.collectionId || null,
    ]
  );

  if (res.rows.length === 0 || !res.rows[0]) {
    throw new CustomSectionRevisionConflictError(
      `Revision conflict on record ${recordId}`
    );
  }

  const row = res.rows[0];

  // Sync change feed
  const syncState = await lockWorkspaceSyncState(client, workspaceId);
  const changeSeq = syncState.nextChangeSeq;
  await updateWorkspaceSyncSeq(client, workspaceId, changeSeq + 1);
  await insertChange(client, {
    workspaceId,
    seq: changeSeq,
    entityType: 'custom_section_record',
    entityId: row.id,
    revision: newRevision,
    isTombstone: false,
    operationId: operationId || crypto.randomUUID(),
    changeData: {
      id: row.id,
      sectionId,
      revision: newRevision,
    },
  });

  return {
    id: row.id,
    sectionId: row.section_id,
    workspaceId: row.workspace_id,
    collectionId: row.collection_id ?? undefined,
    folderId: row.folder_id ?? undefined,
    schemaVersion: row.schema_version,
    fieldValues: row.field_values,
    archivedValues: row.archived_values,
    rank: row.rank,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    revision: row.revision,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

/**
 * Deletes a custom section record.
 */
export async function deleteCustomSectionRecord(
  client: PoolClient,
  workspaceId: string,
  _userId: string,
  sectionId: string,
  recordId: string,
  operationId?: string
): Promise<{ deleted: boolean }> {
  const res = await client.query(
    `
    UPDATE app.custom_section_records
    SET deleted_at = now(), updated_at = now()
    WHERE workspace_id = $1 AND section_id = $2 AND id = $3 AND deleted_at IS NULL
    RETURNING id
    `,
    [workspaceId, sectionId, recordId]
  );

  if (res.rows.length === 0) {
    throw new CustomSectionRecordNotFoundError(
      `Record ${recordId} not found in custom section ${sectionId}`
    );
  }

  // Soft-delete in app.items and app.item_attachments
  await client.query(
    `UPDATE app.items
     SET deleted_at = now(), updated_by = $1, revision = revision + 1
     WHERE id = $2 AND workspace_id = $3`,
    [_userId, recordId, workspaceId]
  );
  await client.query(
    `UPDATE app.item_attachments
     SET deleted_at = now(), updated_at = now()
     WHERE workspace_id = $1 AND item_id = $2 AND deleted_at IS NULL`,
    [workspaceId, recordId]
  );

  // Sync change feed
  const syncState = await lockWorkspaceSyncState(client, workspaceId);
  const changeSeq = syncState.nextChangeSeq;
  await updateWorkspaceSyncSeq(client, workspaceId, changeSeq + 1);
  await insertChange(client, {
    workspaceId,
    seq: changeSeq,
    entityType: 'custom_section_record',
    entityId: recordId,
    revision: 1,
    isTombstone: true,
    operationId: operationId || crypto.randomUUID(),
    changeData: { id: recordId, sectionId },
  });

  return { deleted: true };
}

/**
 * Queries an existing-record view block in a section, enforcing tenant isolation,
 * module availability, and source privacy rules.
 * Does not copy content; returns canonical item references only.
 */
export async function queryExistingRecordView(
  client: PoolClient,
  workspaceId: string,
  userId: string,
  sectionId: string,
  blockId: string,
  queryOptions?: QueryExistingRecordViewRequest
): Promise<ExistingRecordViewItemSummary[]> {
  const section = await getCustomSection(client, workspaceId, sectionId);
  if (!section.currentSchema) {
    throw new CustomSectionValidationError('Section has no active schema');
  }

  const block = section.currentSchema.blocks.find((b) => b.id === blockId);
  if (!block) {
    throw new CustomSectionValidationError(`Block "${blockId}" not found in section schema`);
  }

  if (block.type !== 'existing_record_view') {
    throw new CustomSectionValidationError(`Block "${blockId}" is not an existing_record_view block`);
  }

  const viewBlock = block as ExistingRecordViewBlock;
  const limit = Math.min(50, Math.max(1, queryOptions?.limit || viewBlock.limit || 20));
  const folderId = queryOptions?.folderId || viewBlock.filter?.folderId;
  const tags = queryOptions?.tags || viewBlock.filter?.tags;
  const statusFilter = queryOptions?.status || viewBlock.filter?.status || 'all';

  const rawKind = String(viewBlock.targetKind);
  switch (rawKind) {
    case 'note':
    case 'notes': {
      let query = `
        SELECT n.id, n.title, i.folder_id, n.updated_at
        FROM app.notes n
        JOIN app.items i ON i.id = n.id AND i.workspace_id = n.workspace_id
        WHERE n.workspace_id = $1 AND i.deleted_at IS NULL AND i.security_scope = 'standard'
      `;
      const params: unknown[] = [workspaceId];
      if (folderId) {
        params.push(folderId);
        query += ` AND i.folder_id = $${params.length}`;
      }
      if (tags && tags.length > 0) {
        params.push(tags);
        query += ` AND EXISTS (
          SELECT 1 FROM app.item_tags it
          JOIN app.tags tg ON tg.id = it.tag_id
          WHERE it.item_id = n.id AND tg.name = ANY($${params.length})
        )`;
      }
      params.push(limit);
      query += ` ORDER BY n.updated_at DESC, n.id ASC LIMIT $${params.length}`;

      const res = await client.query(query, params);
      return res.rows.map((row) => ({
        id: row.id,
        targetKind: 'note' as const,
        title: row.title || 'Untitled Note',
        subtitle: row.folder_id ? `Folder: ${row.folder_id.slice(0, 8)}` : 'Root',
        updatedAt: row.updated_at.toISOString(),
        referenceUri: `item:${row.id}`,
      }));
    }

    case 'task':
    case 'tasks': {
      let query = `
        SELECT t.id, t.title, t.status, t.deadline_date, i.folder_id, t.updated_at
        FROM app.tasks t
        JOIN app.items i ON i.id = t.id AND i.workspace_id = t.workspace_id
        WHERE t.workspace_id = $1 AND i.deleted_at IS NULL AND i.security_scope = 'standard'
      `;
      const params: unknown[] = [workspaceId];
      if (folderId) {
        params.push(folderId);
        query += ` AND i.folder_id = $${params.length}`;
      }
      if (statusFilter === 'active') {
        query += ` AND t.status != 'completed' AND t.status != 'cancelled'`;
      } else if (statusFilter === 'completed') {
        query += ` AND t.status = 'completed'`;
      }
      if (tags && tags.length > 0) {
        params.push(tags);
        query += ` AND EXISTS (
          SELECT 1 FROM app.item_tags it
          JOIN app.tags tg ON tg.id = it.tag_id
          WHERE it.item_id = t.id AND tg.name = ANY($${params.length})
        )`;
      }
      params.push(limit);
      query += ` ORDER BY t.updated_at DESC, t.id ASC LIMIT $${params.length}`;

      const res = await client.query(query, params);
      return res.rows.map((row) => ({
        id: row.id,
        targetKind: 'task' as const,
        title: row.title,
        subtitle: `Status: ${row.status}${row.deadline_date ? ` • Due: ${row.deadline_date}` : ''}`,
        status: row.status,
        updatedAt: row.updated_at.toISOString(),
        referenceUri: `item:${row.id}`,
      }));
    }

    case 'routine':
    case 'routines': {
      let query = `
        SELECT r.id, r.title, r.description, r.updated_at
        FROM app.routines r
        JOIN app.items i ON i.id = r.id AND i.workspace_id = r.workspace_id
        WHERE r.workspace_id = $1 AND i.deleted_at IS NULL AND i.security_scope = 'standard'
      `;
      const params: unknown[] = [workspaceId];
      params.push(limit);
      query += ` ORDER BY r.updated_at DESC, r.id ASC LIMIT $${params.length}`;

      const res = await client.query(query, params);
      return res.rows.map((row) => ({
        id: row.id,
        targetKind: 'routine' as const,
        title: row.title,
        subtitle: row.description || 'Routine Schedule',
        updatedAt: row.updated_at.toISOString(),
        referenceUri: `item:${row.id}`,
      }));
    }

    case 'file':
    case 'files': {
      let query = `
        SELECT f.id, f.file_name, f.byte_size, f.declared_mime_type, f.folder_id, f.updated_at
        FROM app.file_items f
        JOIN app.items i ON i.id = f.id AND i.workspace_id = f.workspace_id
        WHERE f.workspace_id = $1 AND i.deleted_at IS NULL AND f.quarantine_status = 'verified' AND i.security_scope = 'standard'
      `;
      const params: unknown[] = [workspaceId];
      if (folderId) {
        params.push(folderId);
        query += ` AND f.folder_id = $${params.length}`;
      }
      params.push(limit);
      query += ` ORDER BY f.updated_at DESC, f.id ASC LIMIT $${params.length}`;

      const res = await client.query(query, params);
      return res.rows.map((row) => ({
        id: row.id,
        targetKind: 'file' as const,
        title: row.file_name,
        subtitle: `${row.declared_mime_type} • ${row.byte_size} bytes`,
        updatedAt: row.updated_at.toISOString(),
        referenceUri: `item:${row.id}`,
      }));
    }

    case 'journal':
    case 'journals': {
      let query = `
        SELECT j.id, j.entry_date, j.title, j.updated_at
        FROM app.journal_entries j
        JOIN app.items i ON i.id = j.id AND i.workspace_id = j.workspace_id
        WHERE j.workspace_id = $1 AND i.deleted_at IS NULL AND i.security_scope = 'standard'
      `;
      const params: unknown[] = [workspaceId];
      params.push(limit);
      query += ` ORDER BY j.entry_date DESC, j.id ASC LIMIT $${params.length}`;

      const res = await client.query(query, params);
      return res.rows.map((row) => ({
        id: row.id,
        targetKind: 'journal' as const,
        title: row.title ? `${row.title} (${row.entry_date})` : `Journal: ${row.entry_date}`,
        subtitle: `Date: ${row.entry_date}`,
        updatedAt: row.updated_at.toISOString(),
        referenceUri: `item:${row.id}`,
      }));
    }

    case 'expenses':
    case 'expense_summary': {
      // Respect module availability: check preferences in app.profiles
      const prefRes = await client.query<{
        display_preferences?: { expensesEnabled?: boolean };
        preferences?: { expensesEnabled?: boolean };
      }>(
        `SELECT display_preferences, preferences
         FROM app.profiles
         WHERE id = $1`,
        [userId]
      );
      // Explicit opt-in only; do not default missing preferences to enabled
      const isExpensesEnabled =
        prefRes.rows[0]?.display_preferences?.expensesEnabled === true ||
        prefRes.rows[0]?.preferences?.expensesEnabled === true;
      if (!isExpensesEnabled) {
        return [];
      }

      // Exact currency-separated aggregation respecting refund reduction and items lifecycle
      const res = await client.query<{
        currency: string;
        total_minor_units: string;
        count: string;
        last_updated_at: Date;
      }>(
        `SELECT
           e.currency,
           SUM(CASE WHEN e.kind = 'expense' THEN e.amount_minor_units::bigint
                    WHEN e.kind = 'refund' THEN -e.amount_minor_units::bigint
                    ELSE 0 END) AS total_minor_units,
           COUNT(CASE WHEN e.kind = 'expense' OR e.kind = 'refund' THEN 1 END) AS count,
           MAX(e.updated_at) AS last_updated_at
         FROM app.expense_items e
         JOIN app.items i ON i.id = e.id AND i.workspace_id = e.workspace_id
         WHERE e.workspace_id = $1 AND i.deleted_at IS NULL AND i.security_scope = 'standard'
         GROUP BY e.currency
         ORDER BY e.currency ASC
         LIMIT $2`,
        [workspaceId, limit]
      );

      return res.rows.map((row) => {
        const totalMinor = BigInt(row.total_minor_units || '0');
        const decimalStr = formatMinorUnitsToDecimal(totalMinor, row.currency);
        const hash = crypto
          .createHash('sha256')
          .update(`${workspaceId}:expense_summary:${row.currency}`)
          .digest('hex');
        const summaryUuid = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
        return {
          id: summaryUuid,
          targetKind: 'expense_summary' as const,
          title: `${row.currency} ${decimalStr}`,
          subtitle: `${row.count} transaction${row.count === '1' ? '' : 's'} recorded`,
          updatedAt: (row.last_updated_at || new Date()).toISOString(),
          referenceUri: `workspace:${workspaceId}/expenses?currency=${row.currency}`,
        };
      });
    }

    default:
      return [];
  }
}

/**
 * Creates a personal custom section template.
 */
export async function createCustomSectionTemplate(
  client: PoolClient,
  workspaceId: string,
  userId: string,
  data: CreateCustomSectionTemplateRequest
): Promise<CustomSectionTemplateItem> {
  const schemaValidation = CustomSectionSchemaPayloadSchema.safeParse(data.schema);
  if (!schemaValidation.success) {
    throw new CustomSectionValidationError(
      `Invalid template schema: ${schemaValidation.error.message}`
    );
  }

  const res = await client.query<{
    id: string;
    workspace_id: string;
    name: string;
    description: string | null;
    icon: string | null;
    layout_mode: 'single_column' | 'two_column' | 'grid';
    schema: CustomSectionSchemaPayload;
    is_starter: boolean;
    created_by: string;
    created_at: Date;
    updated_at: Date;
  }>(
    `
    INSERT INTO app.custom_section_templates (
      workspace_id,
      name,
      description,
      icon,
      layout_mode,
      schema,
      is_starter,
      created_by,
      created_at,
      updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, false, $7, now(), now())
    RETURNING
      id,
      workspace_id,
      name,
      description,
      icon,
      layout_mode,
      schema,
      is_starter,
      created_by,
      created_at,
      updated_at
    `,
    [
      workspaceId,
      data.name.trim(),
      data.description?.trim() || null,
      data.icon || null,
      data.layoutMode || 'single_column',
      JSON.stringify(data.schema),
      userId,
    ]
  );

  const row = res.rows[0];
  if (!row) {
    throw new Error('Failed to create custom section template');
  }

  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    description: row.description,
    icon: row.icon,
    layoutMode: row.layout_mode,
    schema: row.schema,
    isStarter: row.is_starter,
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

/**
 * Lists custom section templates for a workspace, including approved starters and personal templates.
 */
export async function listCustomSectionTemplates(
  client: PoolClient,
  workspaceId: string
): Promise<CustomSectionTemplateItem[]> {
  const res = await client.query<{
    id: string;
    workspace_id: string;
    name: string;
    description: string | null;
    icon: string | null;
    layout_mode: 'single_column' | 'two_column' | 'grid';
    schema: CustomSectionSchemaPayload;
    is_starter: boolean;
    created_by: string;
    created_at: Date;
    updated_at: Date;
  }>(
    `
    SELECT
      id,
      workspace_id,
      name,
      description,
      icon,
      layout_mode,
      schema,
      is_starter,
      created_by,
      created_at,
      updated_at
    FROM app.custom_section_templates
    WHERE workspace_id = $1
    ORDER BY created_at ASC
    `,
    [workspaceId]
  );

  const personalTemplates: CustomSectionTemplateItem[] = res.rows.map((row) => ({
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    description: row.description,
    icon: row.icon,
    layoutMode: row.layout_mode,
    schema: row.schema,
    isStarter: row.is_starter,
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  }));

  // Standard approved starter templates
  const starterTemplates: CustomSectionTemplateItem[] = [
    {
      id: '00000000-0000-0000-0000-000000000001',
      workspaceId,
      name: APPROVED_SECTION_TEMPLATES.READING_LIST.name,
      description: APPROVED_SECTION_TEMPLATES.READING_LIST.description,
      icon: 'library',
      layoutMode: APPROVED_SECTION_TEMPLATES.READING_LIST.layoutMode,
      schema: APPROVED_SECTION_TEMPLATES.READING_LIST.schema,
      isStarter: true,
      createdBy: '00000000-0000-0000-0000-000000000000',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: '00000000-0000-0000-0000-000000000002',
      workspaceId,
      name: APPROVED_SECTION_TEMPLATES.STUDY_DASHBOARD.name,
      description: APPROVED_SECTION_TEMPLATES.STUDY_DASHBOARD.description,
      icon: 'graduation',
      layoutMode: APPROVED_SECTION_TEMPLATES.STUDY_DASHBOARD.layoutMode,
      schema: APPROVED_SECTION_TEMPLATES.STUDY_DASHBOARD.schema,
      isStarter: true,
      createdBy: '00000000-0000-0000-0000-000000000000',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ];

  return [...starterTemplates, ...personalTemplates];
}

/**
 * Gets a single custom section template by ID.
 */
export async function getCustomSectionTemplate(
  client: PoolClient,
  workspaceId: string,
  templateId: string
): Promise<CustomSectionTemplateItem> {
  const all = await listCustomSectionTemplates(client, workspaceId);
  const found = all.find((t) => t.id === templateId);
  if (!found) {
    throw new CustomSectionTemplateNotFoundError(
      `Custom section template ${templateId} not found`
    );
  }
  return found;
}

/**
 * Deletes a personal custom section template.
 */
export async function deleteCustomSectionTemplate(
  client: PoolClient,
  workspaceId: string,
  templateId: string
): Promise<void> {
  const res = await client.query(
    `DELETE FROM app.custom_section_templates WHERE workspace_id = $1 AND id = $2`,
    [workspaceId, templateId]
  );
  if (res.rowCount === 0) {
    throw new CustomSectionTemplateNotFoundError(
      `Custom section template ${templateId} not found in this workspace`
    );
  }
}

/**
 * Previews schema migration impact before publishing.
 */
export async function previewCustomSectionSchema(
  client: PoolClient,
  workspaceId: string,
  sectionId: string,
  proposedBlocks: CustomBlockDefinition[]
): Promise<SchemaMigrationPreviewData> {
  const section = await getCustomSection(client, workspaceId, sectionId);
  if (!section.currentSchema) {
    throw new CustomSectionValidationError('Section has no active schema to preview against');
  }

  // Count existing records affected
  const countRes = await client.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM app.custom_section_records WHERE workspace_id = $1 AND section_id = $2 AND deleted_at IS NULL`,
    [workspaceId, sectionId]
  );
  const count = Number(countRes.rows[0]?.count || 0);

  return generateSchemaMigrationPreview(section.currentSchema, proposedBlocks, count);
}
