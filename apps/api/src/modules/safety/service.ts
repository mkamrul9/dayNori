/**
 * Phase 54 — Reporting, blocking, terms acceptance, moderation audit (provisional local).
 */

import type { PoolClient } from 'pg';
import {
  CURRENT_UGC_POLICY_VERSION,
  UGC_REPORT_RATE_LIMIT_COUNT,
  UGC_REPORT_RATE_LIMIT_WINDOW_MS,
  ROOM_INVITE_CREATE_RATE_LIMIT_COUNT,
  ROOM_INVITE_CREATE_RATE_LIMIT_WINDOW_MS,
  isPlatformModerator,
  isRoomsLocallyEnabled,
  isUgcReportCategory,
  requiresCurrentTermsAcceptance,
  validatePolicyVersion,
  validateReportExplanation,
  type UgcReportCategory,
  type UgcReportStatus,
  type UgcReportTargetType,
} from '@daynori/domain';
import { NotFoundError, ValidationError } from '../../plugins/errorHandler.js';

export class SafetyServiceError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly code: string
  ) {
    super(message);
    this.name = 'SafetyServiceError';
  }
}

function assertRoomsLocal(): void {
  if (!isRoomsLocallyEnabled(process.env)) {
    throw new SafetyServiceError(
      'Collaboration safety APIs require local rooms gate',
      403,
      'ROOMS_DISABLED'
    );
  }
}

export async function assertUsersNotBlocked(
  client: PoolClient,
  userA: string,
  userB: string
): Promise<void> {
  const res = await client.query<{ blocked: boolean }>(
    `SELECT app.are_users_blocked($1, $2) AS blocked`,
    [userA, userB]
  );
  if (res.rows[0]?.blocked) {
    throw new SafetyServiceError(
      'Interaction blocked between these users',
      403,
      'USER_BLOCKED'
    );
  }
}

export async function assertInviteCreateRateLimit(
  client: PoolClient,
  actorId: string
): Promise<void> {
  const res = await client.query<{ c: string | number }>(
    `SELECT count(*)::int AS c FROM app.room_invitations
     WHERE created_by = $1
       AND created_at > now() - ($2::text || ' milliseconds')::interval`,
    [actorId, String(ROOM_INVITE_CREATE_RATE_LIMIT_WINDOW_MS)]
  );
  if (Number(res.rows[0]?.c ?? 0) >= ROOM_INVITE_CREATE_RATE_LIMIT_COUNT) {
    throw new SafetyServiceError('Invitation create rate limit exceeded', 429, 'INVITE_RATE_LIMITED');
  }
}

export async function getUgcTermsStatus(client: PoolClient, userId: string) {
  assertRoomsLocal();
  const res = await client.query<{ policy_version: string; accepted_at: Date }>(
    `SELECT policy_version, accepted_at FROM app.ugc_terms_acceptances
     WHERE user_id = $1
     ORDER BY accepted_at DESC
     LIMIT 1`,
    [userId]
  );
  const row = res.rows[0];
  const acceptedVersion = row?.policy_version ?? null;
  return {
    currentVersion: CURRENT_UGC_POLICY_VERSION,
    acceptedVersion,
    acceptedAt: row?.accepted_at?.toISOString() ?? null,
    requiresAcceptance: requiresCurrentTermsAcceptance(acceptedVersion),
  };
}

export async function acceptUgcTerms(
  client: PoolClient,
  input: { userId: string; policyVersion: string }
) {
  assertRoomsLocal();
  const versionCheck = validatePolicyVersion(input.policyVersion);
  if (!versionCheck.ok) throw new ValidationError(versionCheck.message);
  if (input.policyVersion !== CURRENT_UGC_POLICY_VERSION) {
    throw new SafetyServiceError(
      `Must accept current policy version ${CURRENT_UGC_POLICY_VERSION}`,
      400,
      'POLICY_VERSION_MISMATCH'
    );
  }
  await client.query(
    `INSERT INTO app.ugc_terms_acceptances (user_id, policy_version)
     VALUES ($1, $2)
     ON CONFLICT (user_id, policy_version) DO UPDATE SET accepted_at = now()`,
    [input.userId, input.policyVersion]
  );
  return getUgcTermsStatus(client, input.userId);
}

export async function assertCurrentTermsAccepted(
  client: PoolClient,
  userId: string
): Promise<void> {
  const status = await getUgcTermsStatus(client, userId);
  if (status.requiresAcceptance) {
    throw new SafetyServiceError(
      `Accept UGC policy ${CURRENT_UGC_POLICY_VERSION} before contributing shared content`,
      403,
      'UGC_TERMS_REQUIRED'
    );
  }
}

type ReportRow = {
  id: string;
  reporter_id: string;
  client_report_id: string;
  target_type: UgcReportTargetType;
  room_id: string | null;
  message_id: string | null;
  reported_user_id: string | null;
  category: string;
  explanation: string | null;
  status: UgcReportStatus;
  evidence_snapshot: Record<string, unknown>;
  created_at: Date;
};

function mapReceipt(row: ReportRow) {
  return {
    id: row.id,
    clientReportId: row.client_report_id,
    targetType: row.target_type,
    roomId: row.room_id,
    messageId: row.message_id,
    reportedUserId: row.reported_user_id,
    category: row.category as UgcReportCategory,
    status: row.status,
    createdAt: row.created_at.toISOString(),
  };
}

async function assertReportRateLimit(client: PoolClient, reporterId: string): Promise<void> {
  const res = await client.query<{ c: string | number }>(
    `SELECT count(*)::int AS c FROM app.ugc_reports
     WHERE reporter_id = $1
       AND created_at > now() - ($2::text || ' milliseconds')::interval`,
    [reporterId, String(UGC_REPORT_RATE_LIMIT_WINDOW_MS)]
  );
  if (Number(res.rows[0]?.c ?? 0) >= UGC_REPORT_RATE_LIMIT_COUNT) {
    throw new SafetyServiceError('Report rate limit exceeded', 429, 'REPORT_RATE_LIMITED');
  }
}

export async function createUgcReport(
  client: PoolClient,
  input: {
    reporterId: string;
    clientReportId: string;
    targetType: UgcReportTargetType;
    roomId?: string;
    messageId?: string;
    reportedUserId?: string;
    category: string;
    explanation?: string;
  }
) {
  assertRoomsLocal();
  if (!isUgcReportCategory(input.category)) {
    throw new ValidationError('Invalid report category');
  }
  const expl = validateReportExplanation(input.explanation);
  if (!expl.ok) throw new ValidationError(expl.message);

  const existing = await client.query<ReportRow>(
    `SELECT * FROM app.ugc_reports
     WHERE reporter_id = $1 AND client_report_id = $2`,
    [input.reporterId, input.clientReportId]
  );
  if (existing.rows[0]) {
    return { receipt: mapReceipt(existing.rows[0]), isReplay: true as const };
  }

  await assertReportRateLimit(client, input.reporterId);

  let roomId: string | null = input.roomId ?? null;
  let messageId: string | null = input.messageId ?? null;
  let reportedUserId: string | null = input.reportedUserId ?? null;
  const evidence: Record<string, unknown> = {
    capturedAt: new Date().toISOString(),
    policyNote:
      'Evidence snapshot is frozen at report time; later message edit/delete does not rewrite this row.',
  };

  if (input.targetType === 'message') {
    if (!input.messageId || !input.roomId) {
      throw new ValidationError('Message reports require roomId and messageId');
    }
    const access = await client.query<{ user_role: string | null; kind: string }>(
      `SELECT user_role, kind FROM app.get_workspace_sync_access($1, $2)`,
      [input.roomId, input.reporterId]
    );
    const row = access.rows[0];
    if (!row || row.kind !== 'room' || !row.user_role) {
      throw new SafetyServiceError('Not a member of this room', 403, 'MEMBERSHIP_REVOKED');
    }
    const msg = await client.query<{
      id: string;
      workspace_id: string;
      sender_id: string;
      body: string;
      body_revision: number;
      server_order: string | number;
      deleted_at: Date | null;
      attachment_file_id: string | null;
    }>(
      `SELECT id, workspace_id, sender_id, body, body_revision, server_order, deleted_at, attachment_file_id
       FROM app.room_messages WHERE id = $1 AND workspace_id = $2`,
      [input.messageId, input.roomId]
    );
    const m = msg.rows[0];
    if (!m) throw new NotFoundError('Message not found in this room');
    roomId = m.workspace_id;
    messageId = m.id;
    reportedUserId = m.sender_id;
    evidence['message'] = {
      id: m.id,
      senderId: m.sender_id,
      body: m.body,
      bodyRevision: m.body_revision,
      serverOrder: Number(m.server_order),
      deletedAt: m.deleted_at?.toISOString() ?? null,
      attachmentFileId: m.attachment_file_id,
    };
  } else {
    if (!input.reportedUserId) {
      throw new ValidationError('User reports require reportedUserId');
    }
    if (input.reportedUserId === input.reporterId) {
      throw new ValidationError('Cannot report yourself');
    }
    reportedUserId = input.reportedUserId;
    if (input.roomId) {
      const access = await client.query<{ user_role: string | null; kind: string }>(
        `SELECT user_role, kind FROM app.get_workspace_sync_access($1, $2)`,
        [input.roomId, input.reporterId]
      );
      const row = access.rows[0];
      if (!row || row.kind !== 'room' || !row.user_role) {
        throw new SafetyServiceError('Not a member of this room', 403, 'MEMBERSHIP_REVOKED');
      }
      const other = await client.query<{ user_role: string | null }>(
        `SELECT user_role FROM app.get_workspace_sync_access($1, $2)`,
        [input.roomId, input.reportedUserId]
      );
      if (!other.rows[0]?.user_role) {
        throw new ValidationError('Reported user is not a member of this room');
      }
      roomId = input.roomId;
    } else {
      // Profiles are not generally readable cross-user; existence is enforced by FK on insert.
      const exists = await client.query<{ ok: boolean }>(
        `SELECT EXISTS(SELECT 1 FROM app.profiles WHERE id = $1) AS ok`,
        [input.reportedUserId]
      );
      if (!exists.rows[0]?.ok) {
        // May be false under RLS; reject without leaking other rooms.
        throw new NotFoundError('Reported user not found');
      }
    }
    evidence['user'] = { reportedUserId };
  }

  const inserted = await client.query<ReportRow>(
    `INSERT INTO app.ugc_reports (
       reporter_id, client_report_id, target_type, room_id, message_id,
       reported_user_id, category, explanation, status, evidence_snapshot
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'received',$9::jsonb)
     RETURNING *`,
    [
      input.reporterId,
      input.clientReportId,
      input.targetType,
      roomId,
      messageId,
      reportedUserId,
      input.category,
      expl.explanation,
      JSON.stringify(evidence),
    ]
  );
  return { receipt: mapReceipt(inserted.rows[0]!), isReplay: false as const };
}

export async function blockUser(
  client: PoolClient,
  input: { blockerId: string; blockedUserId: string }
) {
  assertRoomsLocal();
  if (input.blockerId === input.blockedUserId) {
    throw new ValidationError('Cannot block yourself');
  }
  let ins;
  try {
    ins = await client.query<{ blocker_id: string; blocked_id: string; created_at: Date }>(
      `INSERT INTO app.user_blocks (blocker_id, blocked_id)
       VALUES ($1, $2)
       ON CONFLICT (blocker_id, blocked_id) DO UPDATE SET blocker_id = EXCLUDED.blocker_id
       RETURNING blocker_id, blocked_id, created_at`,
      [input.blockerId, input.blockedUserId]
    );
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === '23503') throw new NotFoundError('User not found');
    throw err;
  }
  const row = ins.rows[0]!;
  await client.query(
    `SELECT app.record_moderation_audit($1, 'platform', NULL, 'user.blocked', NULL, 'user', $2)`,
    [input.blockerId, input.blockedUserId]
  );
  return {
    blockerId: row.blocker_id,
    blockedUserId: row.blocked_id,
    createdAt: row.created_at.toISOString(),
  };
}

export async function unblockUser(
  client: PoolClient,
  input: { blockerId: string; blockedUserId: string }
) {
  assertRoomsLocal();
  await client.query(
    `DELETE FROM app.user_blocks WHERE blocker_id = $1 AND blocked_id = $2`,
    [input.blockerId, input.blockedUserId]
  );
  await client.query(
    `SELECT app.record_moderation_audit($1, 'platform', NULL, 'user.unblocked', NULL, 'user', $2)`,
    [input.blockerId, input.blockedUserId]
  );
  return { ok: true as const };
}

export async function listBlocks(client: PoolClient, blockerId: string) {
  assertRoomsLocal();
  const res = await client.query<{ blocker_id: string; blocked_id: string; created_at: Date }>(
    `SELECT blocker_id, blocked_id, created_at FROM app.user_blocks
     WHERE blocker_id = $1 ORDER BY created_at DESC LIMIT 200`,
    [blockerId]
  );
  return res.rows.map((r) => ({
    blockerId: r.blocker_id,
    blockedUserId: r.blocked_id,
    createdAt: r.created_at.toISOString(),
  }));
}

export async function listHiddenSenderIdsForActor(
  client: PoolClient,
  actorId: string
): Promise<Set<string>> {
  const res = await client.query<{ blocked_id: string }>(
    `SELECT blocked_id FROM app.user_blocks WHERE blocker_id = $1`,
    [actorId]
  );
  return new Set(res.rows.map((r) => r.blocked_id));
}

export async function listReportsForModeration(client: PoolClient, actorId: string, limit = 50) {
  assertRoomsLocal();
  if (!isPlatformModerator(actorId, process.env)) {
    throw new SafetyServiceError('Platform moderation access denied', 403, 'MODERATION_FORBIDDEN');
  }
  const res = await client.query<ReportRow>(
    `SELECT * FROM app.list_ugc_reports_for_moderation($1)`,
    [limit]
  );
  return res.rows.map((row) => ({
    id: row.id,
    reporterId: row.reporter_id,
    targetType: row.target_type,
    roomId: row.room_id,
    messageId: row.message_id,
    reportedUserId: row.reported_user_id,
    category: row.category as UgcReportCategory,
    explanation: row.explanation,
    status: row.status,
    evidenceSnapshot: row.evidence_snapshot ?? {},
    createdAt: row.created_at.toISOString(),
  }));
}

export async function updateReportStatus(
  client: PoolClient,
  input: {
    actorId: string;
    reportId: string;
    status: UgcReportStatus;
    reason?: string;
  }
) {
  assertRoomsLocal();
  if (!isPlatformModerator(input.actorId, process.env)) {
    throw new SafetyServiceError('Platform moderation access denied', 403, 'MODERATION_FORBIDDEN');
  }
  const res = await client.query<ReportRow>(
    `SELECT * FROM app.update_ugc_report_status($1, $2)`,
    [input.reportId, input.status]
  );
  const row = res.rows[0];
  if (!row) throw new NotFoundError('Report not found');
  await client.query(
    `SELECT app.record_moderation_audit($1, 'platform', $2, $3, $4, 'report', $5)`,
    [
      input.actorId,
      row.room_id,
      `report.status.${input.status}`,
      input.reason ?? null,
      input.reportId,
    ]
  );
  return {
    id: row.id,
    reporterId: row.reporter_id,
    targetType: row.target_type,
    roomId: row.room_id,
    messageId: row.message_id,
    reportedUserId: row.reported_user_id,
    category: row.category as UgcReportCategory,
    explanation: row.explanation,
    status: row.status,
    evidenceSnapshot: row.evidence_snapshot ?? {},
    createdAt: row.created_at.toISOString(),
  };
}
