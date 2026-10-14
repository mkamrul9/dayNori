import type { PoolClient } from 'pg';

export interface AuditEventRecord {
  id: string;
  workspace_id: string;
  actor_id: string;
  action: string;
  resource_type: string;
  resource_id: string;
  details: Record<string, unknown>;
  created_at: Date;
}

export async function recordAuditEvent(
  client: PoolClient,
  event: {
    workspaceId: string;
    actorId: string;
    action: string;
    resourceType: string;
    resourceId: string;
    details?: Record<string, unknown>;
  }
): Promise<AuditEventRecord> {
  const res = await client.query<AuditEventRecord>(
    `INSERT INTO app.audit_events (
       workspace_id, actor_id, action, resource_type, resource_id, details
     )
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, workspace_id, actor_id, action, resource_type, resource_id, details, created_at;`,
    [
      event.workspaceId,
      event.actorId,
      event.action,
      event.resourceType,
      event.resourceId,
      JSON.stringify(event.details || {}),
    ]
  );
  return res.rows[0]!;
}

export async function listAuditEvents(
  client: PoolClient,
  workspaceId: string,
  limit = 50
): Promise<AuditEventRecord[]> {
  const res = await client.query<AuditEventRecord>(
    `SELECT id, workspace_id, actor_id, action, resource_type, resource_id, details, created_at
     FROM app.audit_events
     WHERE workspace_id = $1
     ORDER BY created_at DESC
     LIMIT $2;`,
    [workspaceId, limit]
  );
  return res.rows;
}
