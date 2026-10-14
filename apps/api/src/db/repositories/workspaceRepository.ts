import type { PoolClient } from 'pg';

export interface ProfileRecord {
  id: string;
  display_name: string;
  preferred_locale: string;
  time_zone: string;
  week_start: 'monday' | 'sunday' | 'saturday';
  preferences: {
    theme: 'system' | 'light' | 'dark';
    compactMode: boolean;
    [key: string]: unknown;
  };
  preferences_schema_version: number;
  revision: number;
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
    weekStart?: 'monday' | 'sunday' | 'saturday';
  }
): Promise<ProfileRecord> {
  const res = await client.query<ProfileRecord>(
    `INSERT INTO app.profiles (
       id, display_name, preferred_locale, time_zone, week_start,
       preferences, preferences_schema_version, revision
     )
     VALUES ($1, $2, $3, $4, $5, '{"theme": "system", "compactMode": false}'::jsonb, 1, 1)
     RETURNING id, display_name, preferred_locale, time_zone, week_start, preferences, preferences_schema_version, revision, created_at, updated_at;`,
    [
      profile.id,
      profile.displayName,
      profile.preferredLocale || 'en',
      profile.timeZone || 'UTC',
      profile.weekStart || 'monday',
    ]
  );
  return res.rows[0]!;
}

export async function getProfile(client: PoolClient, id: string): Promise<ProfileRecord | null> {
  const res = await client.query<ProfileRecord>(
    `SELECT id, display_name, preferred_locale, time_zone, week_start, preferences, preferences_schema_version, revision, created_at, updated_at
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

export async function createWorkspaceWithOwner(
  client: PoolClient,
  workspace: {
    id?: string;
    name: string;
    kind: 'personal' | 'room';
    ownerId: string;
  }
): Promise<{ workspace: WorkspaceRecord }> {
  const ws = await createWorkspace(client, workspace);
  await client.query(
    `INSERT INTO app.workspace_memberships (workspace_id, user_id, role)
     VALUES ($1, $2, 'owner');`,
    [ws.id, workspace.ownerId]
  );
  return { workspace: ws };
}

/**
 * Idempotently provision the single personal workspace and user profile for a verified actor.
 * Enforces exactly-one uniqueness in the database, preventing concurrent duplicates.
 */
export async function provisionPersonalWorkspace(
  client: PoolClient,
  params: {
    userId: string;
    displayName?: string;
    preferredLocale?: string;
    timeZone?: string;
    weekStart?: 'monday' | 'sunday' | 'saturday';
  }
): Promise<{
  workspace: WorkspaceRecord;
  profile: ProfileRecord;
  isNew: boolean;
}> {
  // 1. Upsert profile idempotently
  const profileRes = await client.query<ProfileRecord>(
    `INSERT INTO app.profiles (
       id, display_name, preferred_locale, time_zone, week_start,
       preferences, preferences_schema_version, revision
     )
     VALUES ($1, $2, $3, $4, $5, '{"theme": "system", "compactMode": false}'::jsonb, 1, 1)
     ON CONFLICT (id) DO UPDATE
       SET updated_at = app.profiles.updated_at
     RETURNING id, display_name, preferred_locale, time_zone, week_start, preferences, preferences_schema_version, revision, created_at, updated_at;`,
    [
      params.userId,
      params.displayName || 'User',
      params.preferredLocale || 'en',
      params.timeZone || 'UTC',
      params.weekStart || 'monday',
    ]
  );
  const profile = profileRes.rows[0]!;

  // 2. Check if a personal workspace already exists for this owner
  const existingWsRes = await client.query<WorkspaceRecord>(
    `SELECT id, name, kind, owner_id, created_at, updated_at
     FROM app.workspaces
     WHERE owner_id = $1 AND kind = 'personal'
     LIMIT 1;`,
    [params.userId]
  );

  if (existingWsRes.rows[0]) {
    const ws = existingWsRes.rows[0];
    await client.query(
      `INSERT INTO app.workspace_memberships (workspace_id, user_id, role)
       VALUES ($1, $2, 'owner')
       ON CONFLICT (workspace_id, user_id) DO NOTHING;`,
      [ws.id, params.userId]
    );
    return { workspace: ws, profile, isNew: false };
  }

  // 3. Atomically create personal workspace enforcing partial unique constraint
  const newWsRes = await client.query<WorkspaceRecord>(
    `INSERT INTO app.workspaces (id, name, kind, owner_id)
     VALUES (gen_random_uuid(), 'Personal', 'personal', $1)
     ON CONFLICT (owner_id) WHERE kind = 'personal'
     DO UPDATE SET updated_at = app.workspaces.updated_at
     RETURNING id, name, kind, owner_id, created_at, updated_at;`,
    [params.userId]
  );
  const workspace = newWsRes.rows[0]!;

  // 4. Ensure owner membership exists
  await client.query(
    `INSERT INTO app.workspace_memberships (workspace_id, user_id, role)
     VALUES ($1, $2, 'owner')
     ON CONFLICT (workspace_id, user_id) DO NOTHING;`,
    [workspace.id, params.userId]
  );

  return { workspace, profile, isNew: true };
}

/**
 * Retrieve personal workspace for a user.
 */
export async function getPersonalWorkspace(
  client: PoolClient,
  userId: string
): Promise<WorkspaceRecord | null> {
  const res = await client.query<WorkspaceRecord>(
    `SELECT w.id, w.name, w.kind, w.owner_id, w.created_at, w.updated_at
     FROM app.workspaces w
     JOIN app.workspace_memberships m ON w.id = m.workspace_id
     WHERE w.owner_id = $1 AND w.kind = 'personal' AND m.user_id = $1
     LIMIT 1;`,
    [userId]
  );
  return res.rows[0] || null;
}

/**
 * Update user preferences with optimistic revision concurrency control.
 */
export async function updateProfilePreferences(
  client: PoolClient,
  params: {
    userId: string;
    displayName?: string;
    preferredLocale?: string;
    timeZone?: string;
    weekStart?: 'monday' | 'sunday' | 'saturday';
    preferences?: Record<string, unknown>;
    expectedRevision?: number;
  }
): Promise<{ profile: ProfileRecord; conflict: boolean; currentRevision?: number }> {
  // Read current revision
  const currentRes = await client.query<ProfileRecord>(
    `SELECT id, display_name, preferred_locale, time_zone, week_start, preferences, preferences_schema_version, revision, created_at, updated_at
     FROM app.profiles
     WHERE id = $1;`,
    [params.userId]
  );

  const current = currentRes.rows[0];
  if (!current) {
    throw new Error('Profile not found');
  }

  // Concurrency control: check revision if supplied
  if (
    params.expectedRevision !== undefined &&
    Number(current.revision) !== params.expectedRevision
  ) {
    return { profile: current, conflict: true, currentRevision: Number(current.revision) };
  }

  const updatedRes = await client.query<ProfileRecord>(
    `UPDATE app.profiles
     SET display_name = COALESCE($2, display_name),
         preferred_locale = COALESCE($3, preferred_locale),
         time_zone = COALESCE($4, time_zone),
         week_start = COALESCE($5, week_start),
         preferences = COALESCE($6::jsonb, preferences),
         revision = revision + 1,
         updated_at = now()
     WHERE id = $1
     RETURNING id, display_name, preferred_locale, time_zone, week_start, preferences, preferences_schema_version, revision, created_at, updated_at;`,
    [
      params.userId,
      params.displayName || null,
      params.preferredLocale || null,
      params.timeZone || null,
      params.weekStart || null,
      params.preferences ? JSON.stringify(params.preferences) : null,
    ]
  );

  return { profile: updatedRes.rows[0]!, conflict: false };
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
