import type { PoolClient } from 'pg';
import crypto from 'node:crypto';
import {
  type CreateCustomSectionRecordRequest,
  type CreateCustomSectionRequest,
  type CreateCustomSectionSchemaRequest,
  type CustomSectionItem,
  type CustomSectionRecordItem,
  type CustomSectionSchemaPayload,
  type ExistingRecordViewBlock,
  type ExistingRecordViewItemSummary,
  type QueryExistingRecordViewRequest,
  type UpdateCustomSectionRecordRequest,
  type UpdateCustomSectionRequest,
  MAX_BLOCKS_PER_SECTION,
  MAX_FIELDS_PER_COLLECTION,
  MAX_RECORDS_PER_SECTION,
} from '@daynori/contracts';
import {
  migrateRecordValues,
  validateRecordAgainstSchema,
} from '@daynori/domain';
import {
  insertChange,
  lockWorkspaceSyncState,
  updateWorkspaceSyncSeq,
} from '../sync/repository.js';

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
  const current = await getCustomSection(client, workspaceId, sectionId);
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
    WHERE workspace_id = $11 AND id = $12 AND deleted_at IS NULL
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
    ]
  );

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
    currentSchema: current.currentSchema,
  };
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

  const sanitized = validation.sanitizedValues || {};

  const recordRes = await client.query(
    `
    INSERT INTO app.custom_section_records (
      section_id,
      workspace_id,
      schema_version,
      field_values,
      archived_values,
      rank,
      created_by,
      updated_by,
      revision,
      created_at,
      updated_at
    )
    VALUES ($1, $2, $3, $4, '{}'::jsonb, $5, $6, $6, 1, now(), now())
    RETURNING
      id,
      section_id,
      workspace_id,
      schema_version,
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
      sectionId,
      workspaceId,
      section.currentSchemaVersion,
      JSON.stringify(sanitized),
      data.rank || '0|hzzzzz:',
      userId,
    ]
  );

  const row = recordRes.rows[0];

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
  const limit = Math.min(100, Math.max(1, options?.limit ?? 50));

  const res = await client.query(
    `
    SELECT
      id,
      section_id,
      workspace_id,
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
  const current = await getCustomSectionRecord(client, workspaceId, sectionId, recordId);
  if (current.revision !== data.expectedRevision) {
    throw new CustomSectionRevisionConflictError(
      `Expected revision ${data.expectedRevision} but found ${current.revision}`
    );
  }

  const section = await getCustomSection(client, workspaceId, sectionId);
  if (!section.currentSchema) {
    throw new CustomSectionValidationError('Section has no active schema');
  }

  // Validate updated values against current schema
  const mergedValues = { ...current.fieldValues, ...data.fieldValues };
  const validation = validateRecordAgainstSchema(section.currentSchema, mergedValues);
  if (!validation.valid) {
    throw new CustomSectionValidationError(validation.errors.join('; '));
  }

  const sanitized = validation.sanitizedValues || {};
  const newRevision = current.revision + 1;

  const res = await client.query(
    `
    UPDATE app.custom_section_records
    SET
      field_values = $1,
      rank = COALESCE($2, rank),
      revision = $3,
      updated_by = $4,
      updated_at = now()
    WHERE workspace_id = $5 AND section_id = $6 AND id = $7 AND deleted_at IS NULL
    RETURNING
      id,
      section_id,
      workspace_id,
      schema_version,
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
    ]
  );

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

  switch (viewBlock.targetKind) {
    case 'note': {
      let query = `
        SELECT id, kind, folder_id, revision, updated_at
        FROM app.items
        WHERE workspace_id = $1 AND kind = 'note' AND deleted_at IS NULL
      `;
      const params: unknown[] = [workspaceId];
      if (folderId) {
        params.push(folderId);
        query += ` AND folder_id = $${params.length}`;
      }
      params.push(limit);
      query += ` ORDER BY updated_at DESC LIMIT $${params.length}`;

      const res = await client.query(query, params);
      return res.rows.map((row) => ({
        id: row.id,
        targetKind: 'note',
        title: `Note: ${row.id.slice(0, 8)}`,
        subtitle: row.folder_id ? `Folder: ${row.folder_id.slice(0, 8)}` : 'Root',
        updatedAt: row.updated_at.toISOString(),
        referenceUri: `item:${row.id}`,
      }));
    }

    case 'task': {
      let query = `
        SELECT id, kind, revision, updated_at
        FROM app.items
        WHERE workspace_id = $1 AND kind = 'task' AND deleted_at IS NULL
      `;
      const params: unknown[] = [workspaceId];
      params.push(limit);
      query += ` ORDER BY updated_at DESC LIMIT $${params.length}`;

      const res = await client.query(query, params);
      return res.rows.map((row) => ({
        id: row.id,
        targetKind: 'task',
        title: `Task: ${row.id.slice(0, 8)}`,
        updatedAt: row.updated_at.toISOString(),
        referenceUri: `item:${row.id}`,
      }));
    }

    case 'routine': {
      const res = await client.query(
        `
        SELECT id, kind, updated_at
        FROM app.items
        WHERE workspace_id = $1 AND kind = 'routine' AND deleted_at IS NULL
        ORDER BY updated_at DESC
        LIMIT $2
        `,
        [workspaceId, limit]
      );
      return res.rows.map((row) => ({
        id: row.id,
        targetKind: 'routine',
        title: `Routine: ${row.id.slice(0, 8)}`,
        updatedAt: row.updated_at.toISOString(),
        referenceUri: `item:${row.id}`,
      }));
    }

    case 'file': {
      let query = `
        SELECT id, file_name, byte_size, declared_mime_type, updated_at
        FROM app.file_items
        WHERE workspace_id = $1 AND deleted_at IS NULL AND quarantine_status = 'verified'
      `;
      const params: unknown[] = [workspaceId];
      if (folderId) {
        params.push(folderId);
        query += ` AND folder_id = $${params.length}`;
      }
      params.push(limit);
      query += ` ORDER BY updated_at DESC LIMIT $${params.length}`;

      const res = await client.query(query, params);
      return res.rows.map((row) => ({
        id: row.id,
        targetKind: 'file',
        title: row.file_name,
        subtitle: `${row.declared_mime_type} • ${row.byte_size} bytes`,
        updatedAt: row.updated_at.toISOString(),
        referenceUri: `item:${row.id}`,
      }));
    }

    case 'journal': {
      const res = await client.query(
        `
        SELECT id, entry_date, updated_at
        FROM app.journal_entries
        WHERE workspace_id = $1 AND deleted_at IS NULL
        ORDER BY entry_date DESC
        LIMIT $2
        `,
        [workspaceId, limit]
      );
      return res.rows.map((row) => ({
        id: row.id,
        targetKind: 'journal',
        title: `Journal: ${row.entry_date}`,
        updatedAt: row.updated_at.toISOString(),
        referenceUri: `item:${row.id}`,
      }));
    }

    case 'expense_summary': {
      // Respect module availability: check user display preferences for expensesEnabled
      const prefRes = await client.query(
        `
        SELECT display_preferences
        FROM app.user_profiles
        WHERE id = $1
        `,
        [userId]
      );
      const isExpensesEnabled = Boolean(prefRes.rows[0]?.display_preferences?.expensesEnabled);
      if (!isExpensesEnabled) {
        // Module is disabled; return empty result rather than leaking financial records
        return [];
      }

      const res = await client.query(
        `
        SELECT id, amount, currency, kind, transaction_date, updated_at
        FROM app.expense_items
        WHERE workspace_id = $1 AND deleted_at IS NULL
        ORDER BY transaction_date DESC
        LIMIT $2
        `,
        [workspaceId, limit]
      );
      return res.rows.map((row) => ({
        id: row.id,
        targetKind: 'expense_summary',
        title: `${row.kind.toUpperCase()} ${row.currency} ${row.amount}`,
        subtitle: `Date: ${row.transaction_date}`,
        updatedAt: row.updated_at.toISOString(),
        referenceUri: `item:${row.id}`,
      }));
    }

    default:
      return [];
  }
}
