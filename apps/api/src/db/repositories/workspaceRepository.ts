import type { PoolClient } from 'pg';

export interface ProfileRecord {
  id: string;
  display_name: string;
  preferred_locale: string;
  time_zone: string;
  created_at: Date;
  updated_at: Date;
}

export interface WorkspaceRecord {
  id: string;
  name: string;
  kind: 'personal' | 'room';
  owner_id: string;
  created_at: Date;
  updated_at: Date;
}

export async function createProfile(
  client: PoolClient,
  profile: {
    id: string;
    displayName: string;
    preferredLocale?: string;
    timeZone?: string;
  }
): Promise<ProfileRecord> {
  const res = await client.query<ProfileRecord>(
    `INSERT INTO app.profiles (id, display_name, preferred_locale, time_zone)
     VALUES ($1, $2, $3, $4)
     RETURNING id, display_name, preferred_locale, time_zone, created_at, updated_at;`,
    [profile.id, profile.displayName, profile.preferredLocale || 'en', profile.timeZone || 'UTC']
  );
  return res.rows[0]!;
}

export async function getProfile(client: PoolClient, id: string): Promise<ProfileRecord | null> {
  const res = await client.query<ProfileRecord>(
    `SELECT id, display_name, preferred_locale, time_zone, created_at, updated_at
     FROM app.profiles
     WHERE id = $1;`,
    [id]
  );
  return res.rows[0] || null;
}

export async function createWorkspace(
  client: PoolClient,
  workspace: {
    id?: string;
    name: string;
    kind: 'personal' | 'room';
    ownerId: string;
  }
): Promise<WorkspaceRecord> {
  const res = await client.query<WorkspaceRecord>(
    `INSERT INTO app.workspaces (id, name, kind, owner_id)
     VALUES (COALESCE($1, gen_random_uuid()), $2, $3, $4)
     RETURNING id, name, kind, owner_id, created_at, updated_at;`,
    [workspace.id || null, workspace.name, workspace.kind, workspace.ownerId]
  );
  return res.rows[0]!;
}

export async function getWorkspace(
  client: PoolClient,
  workspaceId: string
): Promise<WorkspaceRecord | null> {
  const res = await client.query<WorkspaceRecord>(
    `SELECT id, name, kind, owner_id, created_at, updated_at
     FROM app.workspaces
     WHERE id = $1;`,
    [workspaceId]
  );
  return res.rows[0] || null;
}

export async function listWorkspaces(client: PoolClient): Promise<WorkspaceRecord[]> {
  const res = await client.query<WorkspaceRecord>(
    `SELECT id, name, kind, owner_id, created_at, updated_at
     FROM app.workspaces
     ORDER BY created_at DESC;`
  );
  return res.rows;
}

export async function updateWorkspace(
  client: PoolClient,
  workspaceId: string,
  updates: { name: string }
): Promise<WorkspaceRecord | null> {
  const res = await client.query<WorkspaceRecord>(
    `UPDATE app.workspaces
     SET name = $1, updated_at = now()
     WHERE id = $2
     RETURNING id, name, kind, owner_id, created_at, updated_at;`,
    [updates.name, workspaceId]
  );
  return res.rows[0] || null;
}

export async function deleteWorkspace(client: PoolClient, workspaceId: string): Promise<boolean> {
  const res = await client.query(`DELETE FROM app.workspaces WHERE id = $1;`, [workspaceId]);
  return (res.rowCount ?? 0) > 0;
}
