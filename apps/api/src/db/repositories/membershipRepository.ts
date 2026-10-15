import type { PoolClient } from 'pg';

export interface MembershipRecord {
  workspace_id: string;
  user_id: string;
  role: 'owner' | 'editor' | 'viewer';
  created_at: Date;
  updated_at: Date;
}

/**
 * Rotates the workspace access epoch on relevant membership modifications,
 * forcing clients to safely re-authorize on their next pull request.
 */
export async function rotateWorkspaceAccessEpoch(
  client: PoolClient,
  workspaceId: string
): Promise<string> {
  const res = await client.query<{ access_epoch: string }>(
    `UPDATE app.workspace_sync_state
     SET access_epoch = gen_random_uuid()::text, updated_at = now()
     WHERE workspace_id = $1
     RETURNING access_epoch;`,
    [workspaceId]
  );
  return res.rows[0]?.access_epoch || '';
}

export async function addMembership(
  client: PoolClient,
  membership: {
    workspaceId: string;
    userId: string;
    role: 'owner' | 'editor' | 'viewer';
  }
): Promise<MembershipRecord> {
  const res = await client.query<MembershipRecord>(
    `INSERT INTO app.workspace_memberships (workspace_id, user_id, role)
     VALUES ($1, $2, $3)
     RETURNING workspace_id, user_id, role, created_at, updated_at;`,
    [membership.workspaceId, membership.userId, membership.role]
  );

  // Rotate access epoch on membership grant
  await rotateWorkspaceAccessEpoch(client, membership.workspaceId);

  return res.rows[0]!;
}

export async function getMembership(
  client: PoolClient,
  workspaceId: string,
  userId: string
): Promise<MembershipRecord | null> {
  const res = await client.query<MembershipRecord>(
    `SELECT workspace_id, user_id, role, created_at, updated_at
     FROM app.workspace_memberships
     WHERE workspace_id = $1 AND user_id = $2;`,
    [workspaceId, userId]
  );
  return res.rows[0] || null;
}

export async function listMemberships(
  client: PoolClient,
  workspaceId: string
): Promise<MembershipRecord[]> {
  const res = await client.query<MembershipRecord>(
    `SELECT workspace_id, user_id, role, created_at, updated_at
     FROM app.workspace_memberships
     WHERE workspace_id = $1
     ORDER BY created_at ASC;`,
    [workspaceId]
  );
  return res.rows;
}

export async function updateMembershipRole(
  client: PoolClient,
  workspaceId: string,
  userId: string,
  newRole: 'owner' | 'editor' | 'viewer'
): Promise<MembershipRecord | null> {
  const res = await client.query<MembershipRecord>(
    `UPDATE app.workspace_memberships
     SET role = $1, updated_at = now()
     WHERE workspace_id = $2 AND user_id = $3
     RETURNING workspace_id, user_id, role, created_at, updated_at;`,
    [newRole, workspaceId, userId]
  );

  if (res.rows[0]) {
    await rotateWorkspaceAccessEpoch(client, workspaceId);
  }

  return res.rows[0] || null;
}

export async function removeMembership(
  client: PoolClient,
  workspaceId: string,
  userId: string
): Promise<boolean> {
  const res = await client.query(
    `DELETE FROM app.workspace_memberships
     WHERE workspace_id = $1 AND user_id = $2;`,
    [workspaceId, userId]
  );

  const deleted = (res.rowCount ?? 0) > 0;
  if (deleted) {
    await rotateWorkspaceAccessEpoch(client, workspaceId);
  }

  return deleted;
}
