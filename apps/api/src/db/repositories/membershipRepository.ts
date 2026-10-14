import type { PoolClient } from 'pg';

export interface MembershipRecord {
  workspace_id: string;
  user_id: string;
  role: 'owner' | 'editor' | 'viewer';
  created_at: Date;
  updated_at: Date;
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
  return (res.rowCount ?? 0) > 0;
}
