import type { PoolClient } from 'pg';

export interface StorageObjectRecord {
  id: string;
  workspace_id: string;
  owner_id: string;
  bucket_id: string;
  object_path: string;
  byte_size: string;
  mime_type: string;
  created_at: Date;
}

export async function createStorageObject(
  client: PoolClient,
  object: {
    id?: string;
    workspaceId: string;
    ownerId: string;
    bucketId?: string;
    objectPath: string;
    byteSize: number;
    mimeType: string;
  }
): Promise<StorageObjectRecord> {
  const res = await client.query<StorageObjectRecord>(
    `INSERT INTO app.storage_objects (
       id, workspace_id, owner_id, bucket_id, object_path, byte_size, mime_type
     )
     VALUES (
       COALESCE($1, gen_random_uuid()), $2, $3, $4, $5, $6, $7
     )
     RETURNING id, workspace_id, owner_id, bucket_id, object_path, byte_size, mime_type, created_at;`,
    [
      object.id || null,
      object.workspaceId,
      object.ownerId,
      object.bucketId || 'private_assets',
      object.objectPath,
      object.byteSize,
      object.mimeType,
    ]
  );
  return res.rows[0]!;
}

export async function getStorageObject(
  client: PoolClient,
  workspaceId: string,
  bucketId: string,
  objectPath: string
): Promise<StorageObjectRecord | null> {
  const res = await client.query<StorageObjectRecord>(
    `SELECT id, workspace_id, owner_id, bucket_id, object_path, byte_size, mime_type, created_at
     FROM app.storage_objects
     WHERE workspace_id = $1 AND bucket_id = $2 AND object_path = $3;`,
    [workspaceId, bucketId, objectPath]
  );
  return res.rows[0] || null;
}

export async function listStorageObjects(
  client: PoolClient,
  workspaceId: string,
  bucketId = 'private_assets'
): Promise<StorageObjectRecord[]> {
  const res = await client.query<StorageObjectRecord>(
    `SELECT id, workspace_id, owner_id, bucket_id, object_path, byte_size, mime_type, created_at
     FROM app.storage_objects
     WHERE workspace_id = $1 AND bucket_id = $2
     ORDER BY created_at DESC;`,
    [workspaceId, bucketId]
  );
  return res.rows;
}
