/**
 * Phase 51 — Shared rooms, invitations, membership lifecycle, and explicit personal→room copy.
 * Provisional local development; real-user enablement remains release-gated.
 */

import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import {
  ROOM_INVITE_DEFAULT_TTL_HOURS,
  ROOM_INVITE_MAX_PENDING_PER_ROOM,
  ROOM_INVITE_TOKEN_BYTES,
  canInviteWithRole,
  invitationPreviewSafe,
  isBlockedShareKind,
  isShareableItemKind,
  mapInviteExceptionMessage,
  roomPermissionsFor,
  validateInvitationTtlHours,
  type RoomInviteRole,
  type RoomRole,
} from '@daynori/domain';
import {
  addMembership,
  getMembership,
  listMemberships,
  removeMembership,
  rotateWorkspaceAccessEpoch,
  updateMembershipRole,
} from '../../db/repositories/membershipRepository.js';
import { recordAuditEvent } from '../../db/repositories/auditRepository.js';
import { NotFoundError, ValidationError } from '../../plugins/errorHandler.js';

export class RoomServiceError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly code: string
  ) {
    super(message);
    this.name = 'RoomServiceError';
  }
}

function hashInviteToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function generateInviteToken(): { token: string; hash: string; prefix: string } {
  const token = randomBytes(ROOM_INVITE_TOKEN_BYTES).toString('base64url');
  return { token, hash: hashInviteToken(token), prefix: token.slice(0, 8) };
}

type WorkspaceRow = {
  id: string;
  name: string;
  kind: string;
  owner_id: string;
  status: string;
  membership_revision: string | number;
  created_at: Date;
  updated_at: Date;
  archived_at: Date | null;
};

async function requireRoom(client: PoolClient, roomId: string): Promise<WorkspaceRow> {
  const res = await client.query<WorkspaceRow>(
    `SELECT id, name, kind, owner_id, status, membership_revision, created_at, updated_at, archived_at
     FROM app.workspaces WHERE id = $1`,
    [roomId]
  );
  const row = res.rows[0];
  if (!row || row.kind !== 'room') {
    throw new NotFoundError('Room not found');
  }
  return row;
}

async function requireActorRole(
  client: PoolClient,
  roomId: string,
  actorId: string,
  min: RoomRole
): Promise<RoomRole> {
  const membership = await getMembership(client, roomId, actorId);
  if (!membership) throw new NotFoundError('Room not found');
  const order = { viewer: 1, editor: 2, owner: 3 } as const;
  if (order[membership.role] < order[min]) {
    throw new RoomServiceError('Insufficient room role', 403, 'ROOM_FORBIDDEN');
  }
  return membership.role;
}

function mapRoom(row: WorkspaceRow, actorRole: RoomRole | null) {
  return {
    id: row.id,
    name: row.name,
    kind: 'room' as const,
    ownerId: row.owner_id,
    status: row.status as 'active' | 'archived',
    membershipRevision: Number(row.membership_revision),
    actorRole,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    archivedAt: row.archived_at?.toISOString() ?? null,
  };
}

/** Local provisional enablement — not public/release enablement. */
export function assertRoomsLocallyEnabled(): void {
  const enabled =
    process.env['NODE_ENV'] === 'test' ||
    process.env['DAYNORI_ROOMS_LOCAL_ENABLED'] === 'true' ||
    process.env['NODE_ENV'] === 'development';
  if (!enabled) {
    throw new RoomServiceError(
      'Shared rooms are disabled outside local/provisional development. Set DAYNORI_ROOMS_LOCAL_ENABLED=true for local harnesses only.',
      403,
      'ROOMS_DISABLED'
    );
  }
}

export async function createRoom(
  client: PoolClient,
  input: { actorId: string; name: string }
) {
  assertRoomsLocallyEnabled();
  const name = input.name.trim();
  if (!name) throw new ValidationError('Room name is required');

  const ws = await client.query<WorkspaceRow>(
    `INSERT INTO app.workspaces (name, kind, owner_id, status)
     VALUES ($1, 'room', $2, 'active')
     RETURNING id, name, kind, owner_id, status, membership_revision, created_at, updated_at, archived_at`,
    [name, input.actorId]
  );
  const room = ws.rows[0]!;
  await addMembership(client, {
    workspaceId: room.id,
    userId: input.actorId,
    role: 'owner',
  });

  // Audit RLS requires current_workspace_id to match (withUserContext may not set it).
  await client.query("SELECT set_config('app.current_workspace_id', $1, true)", [room.id]);

  await recordAuditEvent(client, {
    workspaceId: room.id,
    actorId: input.actorId,
    action: 'room.created',
    resourceType: 'workspace',
    resourceId: room.id,
    details: { name: room.name },
  });

  return mapRoom(room, 'owner');
}

export async function listRooms(client: PoolClient, actorId: string) {
  assertRoomsLocallyEnabled();
  const res = await client.query<WorkspaceRow & { actor_role: RoomRole }>(
    `SELECT w.id, w.name, w.owner_id, w.status, w.membership_revision,
            w.created_at, w.updated_at, w.archived_at, m.role as actor_role
     FROM app.workspaces w
     INNER JOIN app.workspace_memberships m
       ON m.workspace_id = w.id AND m.user_id = $1
     WHERE w.kind = 'room'
     ORDER BY w.updated_at DESC`,
    [actorId]
  );
  return res.rows.map((row) => mapRoom(row, row.actor_role));
}

export async function getRoom(client: PoolClient, roomId: string, actorId: string) {
  assertRoomsLocallyEnabled();
  const room = await requireRoom(client, roomId);
  const membership = await getMembership(client, roomId, actorId);
  if (!membership) throw new NotFoundError('Room not found');
  return mapRoom(room, membership.role);
}

export async function createRoomInvitation(
  client: PoolClient,
  input: {
    roomId: string;
    actorId: string;
    role: RoomInviteRole;
    expiresInHours?: number;
    recipientUserId?: string | null;
  }
) {
  assertRoomsLocallyEnabled();
  const room = await requireRoom(client, input.roomId);
  if (room.status !== 'active') {
    throw new ValidationError('Cannot invite to an archived room');
  }
  const shareable = await client.query<{ ok: boolean }>(
    `SELECT app.is_confirmed_shareable_room($1) as ok`,
    [input.roomId]
  );
  if (!shareable.rows[0]?.ok) {
    throw new RoomServiceError(
      'This room is not available for invitations (legacy quarantine or archived).',
      400,
      'ROOM_INVITE_UNAVAILABLE'
    );
  }

  const actorRole = await requireActorRole(client, input.roomId, input.actorId, 'owner');
  if (!canInviteWithRole(actorRole, input.role)) {
    throw new RoomServiceError('Cannot issue invitation with that role', 403, 'ROOM_FORBIDDEN');
  }

  const ttl = input.expiresInHours ?? ROOM_INVITE_DEFAULT_TTL_HOURS;
  const ttlCheck = validateInvitationTtlHours(ttl);
  if (!ttlCheck.ok) throw new ValidationError(ttlCheck.message);

  if (input.recipientUserId) {
    const profile = await client.query(`SELECT id FROM app.profiles WHERE id = $1`, [
      input.recipientUserId,
    ]);
    if (!profile.rows[0]) {
      throw new ValidationError('Recipient identity not found');
    }
  }

  const pending = await client.query<{ count: string }>(
    `SELECT count(*)::text as count FROM app.room_invitations
     WHERE workspace_id = $1 AND status = 'pending' AND expires_at > now()`,
    [input.roomId]
  );
  if (Number(pending.rows[0]?.count ?? 0) >= ROOM_INVITE_MAX_PENDING_PER_ROOM) {
    throw new ValidationError(
      `Pending invitation limit (${ROOM_INVITE_MAX_PENDING_PER_ROOM}) reached for this room`
    );
  }

  const { token, hash, prefix } = generateInviteToken();
  const ins = await client.query(
    `INSERT INTO app.room_invitations (
      workspace_id, created_by, role, token_hash, token_prefix, expires_at, recipient_user_id
    ) VALUES ($1,$2,$3,$4,$5, now() + ($6 || ' hours')::interval, $7)
    RETURNING id, workspace_id, role, status, token_prefix, expires_at, recipient_user_id, created_at`,
    [
      input.roomId,
      input.actorId,
      input.role,
      hash,
      prefix,
      String(ttl),
      input.recipientUserId ?? null,
    ]
  );
  const row = ins.rows[0]!;

  await recordAuditEvent(client, {
    workspaceId: input.roomId,
    actorId: input.actorId,
    action: 'room.invitation_created',
    resourceType: 'room_invitation',
    resourceId: row.id,
    details: {
      role: input.role,
      tokenPrefix: prefix,
      deliveryPolicy: input.recipientUserId ? 'targeted_recipient' : 'bearer_link',
    },
  });

  return {
    id: row.id as string,
    workspaceId: row.workspace_id as string,
    role: row.role as RoomInviteRole,
    status: row.status as 'pending',
    tokenPrefix: row.token_prefix as string,
    expiresAt: (row.expires_at as Date).toISOString(),
    recipientUserId: (row.recipient_user_id as string | null) ?? null,
    deliveryPolicy: (input.recipientUserId ? 'targeted_recipient' : 'bearer_link') as
      | 'bearer_link'
      | 'targeted_recipient',
    createdAt: (row.created_at as Date).toISOString(),
    inviteToken: token,
    invitePath: `/rooms/invitations/accept?token=${encodeURIComponent(token)}`,
  };
}

export async function listRoomInvitations(
  client: PoolClient,
  roomId: string,
  actorId: string
) {
  assertRoomsLocallyEnabled();
  await requireActorRole(client, roomId, actorId, 'owner');
  const res = await client.query(
    `SELECT id, workspace_id, role, status, token_prefix, expires_at, recipient_user_id, created_at
     FROM app.room_invitations
     WHERE workspace_id = $1
     ORDER BY created_at DESC
     LIMIT 100`,
    [roomId]
  );
  return res.rows.map((row) => ({
    id: row.id as string,
    workspaceId: row.workspace_id as string,
    role: row.role as RoomInviteRole,
    status: row.status as 'pending' | 'accepted' | 'revoked' | 'expired',
    tokenPrefix: row.token_prefix as string,
    expiresAt: (row.expires_at as Date).toISOString(),
    recipientUserId: (row.recipient_user_id as string | null) ?? null,
    deliveryPolicy: (row.recipient_user_id ? 'targeted_recipient' : 'bearer_link') as
      | 'bearer_link'
      | 'targeted_recipient',
    createdAt: (row.created_at as Date).toISOString(),
  }));
}

export async function revokeRoomInvitation(
  client: PoolClient,
  input: { roomId: string; invitationId: string; actorId: string }
) {
  assertRoomsLocallyEnabled();
  await requireActorRole(client, input.roomId, input.actorId, 'owner');
  const res = await client.query(
    `UPDATE app.room_invitations
     SET status = 'revoked', revoked_at = now(), updated_at = now()
     WHERE id = $1 AND workspace_id = $2 AND status = 'pending'
     RETURNING id`,
    [input.invitationId, input.roomId]
  );
  if (!res.rows[0]) throw new NotFoundError('Invitation not found');
  await recordAuditEvent(client, {
    workspaceId: input.roomId,
    actorId: input.actorId,
    action: 'room.invitation_revoked',
    resourceType: 'room_invitation',
    resourceId: input.invitationId,
    details: {},
  });
}

export async function previewRoomInvitation(client: PoolClient, token: string) {
  assertRoomsLocallyEnabled();
  const hash = hashInviteToken(token);
  const res = await client.query<{
    res: {
      roomName: string;
      role: RoomInviteRole;
      expiresAt: string;
      status: string;
      deliveryPolicy: 'bearer_link' | 'targeted_recipient';
    };
  }>(`SELECT app.preview_room_invitation($1) as res`, [hash]);
  const raw = res.rows[0]?.res;
  if (!raw) {
    return {
      ...invitationPreviewSafe({
        roomName: 'Unavailable',
        role: 'viewer',
        expiresAt: new Date(0).toISOString(),
        status: 'unavailable',
      }),
      deliveryPolicy: 'bearer_link' as const,
    };
  }
  const expiresAt =
    typeof raw.expiresAt === 'string'
      ? raw.expiresAt
      : new Date(raw.expiresAt as unknown as string).toISOString();
  return {
    ...invitationPreviewSafe({
      roomName: raw.roomName,
      role: raw.role,
      expiresAt,
      status: raw.status,
    }),
    deliveryPolicy: raw.deliveryPolicy,
  };
}

export async function acceptRoomInvitation(
  client: PoolClient,
  input: { actorId: string; token: string }
) {
  assertRoomsLocallyEnabled();
  const hash = hashInviteToken(input.token);
  let raw: { status: string; workspaceId: string; role: string; invitationId: string };
  try {
    const res = await client.query<{ res: typeof raw }>(
      `SELECT app.accept_room_invitation($1, $2) as res`,
      [hash, input.actorId]
    );
    raw = res.rows[0]!.res;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const code = mapInviteExceptionMessage(msg);
    throw new RoomServiceError('Invitation is not available', 400, code);
  }

  await client.query("SELECT set_config('app.current_workspace_id', $1, true)", [raw.workspaceId]);
  await recordAuditEvent(client, {
    workspaceId: raw.workspaceId,
    actorId: input.actorId,
    action: 'room.invitation_accepted',
    resourceType: 'room_invitation',
    resourceId: raw.invitationId,
    details: { result: raw.status, role: raw.role },
  });

  const room = await getRoom(client, raw.workspaceId, input.actorId);
  return {
    status: raw.status as 'accepted' | 'already_accepted' | 'already_member',
    room,
  };
}

export async function updateRoomMemberRole(
  client: PoolClient,
  input: { roomId: string; actorId: string; targetUserId: string; role: RoomRole }
) {
  assertRoomsLocallyEnabled();
  await requireRoom(client, input.roomId);
  await requireActorRole(client, input.roomId, input.actorId, 'owner');

  if (input.role === 'owner') {
    throw new ValidationError('Use ownership transfer to grant owner role');
  }

  const target = await getMembership(client, input.roomId, input.targetUserId);
  if (!target) throw new NotFoundError('Member not found');

  try {
    const updated = await updateMembershipRole(
      client,
      input.roomId,
      input.targetUserId,
      input.role
    );
    if (!updated) throw new NotFoundError('Member not found');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('ROOM_LAST_OWNER')) {
      throw new RoomServiceError('Cannot demote the last owner', 409, 'ROOM_LAST_OWNER');
    }
    throw err;
  }

  await recordAuditEvent(client, {
    workspaceId: input.roomId,
    actorId: input.actorId,
    action: 'room.member_role_changed',
    resourceType: 'membership',
    resourceId: input.targetUserId,
    details: { role: input.role },
  });
  return getMembership(client, input.roomId, input.targetUserId);
}

export async function removeRoomMember(
  client: PoolClient,
  input: { roomId: string; actorId: string; targetUserId: string }
) {
  assertRoomsLocallyEnabled();
  await requireRoom(client, input.roomId);
  await requireActorRole(client, input.roomId, input.actorId, 'owner');
  if (input.actorId === input.targetUserId) {
    throw new ValidationError('Use leave room to remove yourself');
  }
  try {
    const ok = await removeMembership(client, input.roomId, input.targetUserId);
    if (!ok) throw new NotFoundError('Member not found');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('ROOM_LAST_OWNER')) {
      throw new RoomServiceError('Cannot remove the last owner', 409, 'ROOM_LAST_OWNER');
    }
    throw err;
  }
  await recordAuditEvent(client, {
    workspaceId: input.roomId,
    actorId: input.actorId,
    action: 'room.member_removed',
    resourceType: 'membership',
    resourceId: input.targetUserId,
    details: {},
  });
}

export async function leaveRoom(
  client: PoolClient,
  input: { roomId: string; actorId: string }
) {
  assertRoomsLocallyEnabled();
  await requireRoom(client, input.roomId);
  const membership = await getMembership(client, input.roomId, input.actorId);
  if (!membership) throw new NotFoundError('Room not found');
  // Audit while membership still exists (RLS requires viewer role).
  await recordAuditEvent(client, {
    workspaceId: input.roomId,
    actorId: input.actorId,
    action: 'room.member_left',
    resourceType: 'membership',
    resourceId: input.actorId,
    details: { priorRole: membership.role },
  });
  try {
    const ok = await removeMembership(client, input.roomId, input.actorId);
    if (!ok) throw new NotFoundError('Membership not found');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('ROOM_LAST_OWNER')) {
      throw new RoomServiceError(
        'Transfer ownership or archive the room before the last owner leaves',
        409,
        'ROOM_LAST_OWNER'
      );
    }
    throw err;
  }
}

export async function transferRoomOwnership(
  client: PoolClient,
  input: { roomId: string; actorId: string; newOwnerUserId: string }
) {
  assertRoomsLocallyEnabled();
  const room = await requireRoom(client, input.roomId);
  await requireActorRole(client, input.roomId, input.actorId, 'owner');
  if (input.newOwnerUserId === input.actorId) {
    throw new ValidationError('Already the owner');
  }
  const target = await getMembership(client, input.roomId, input.newOwnerUserId);
  if (!target) throw new NotFoundError('Target member not found in this room');

  // Update canonical owner_id while actor still has owner membership (RLS).
  await client.query(
    `UPDATE app.workspaces SET owner_id = $2, updated_at = now() WHERE id = $1 AND kind = 'room'`,
    [input.roomId, input.newOwnerUserId]
  );
  await client.query(
    `UPDATE app.workspace_memberships SET role = 'owner', updated_at = now()
     WHERE workspace_id = $1 AND user_id = $2`,
    [input.roomId, input.newOwnerUserId]
  );
  await client.query(
    `UPDATE app.workspace_memberships SET role = 'editor', updated_at = now()
     WHERE workspace_id = $1 AND user_id = $2 AND role = 'owner'`,
    [input.roomId, input.actorId]
  );
  await rotateWorkspaceAccessEpoch(client, input.roomId);

  await recordAuditEvent(client, {
    workspaceId: input.roomId,
    actorId: input.actorId,
    action: 'room.ownership_transferred',
    resourceType: 'workspace',
    resourceId: room.id,
    details: { newOwnerUserId: input.newOwnerUserId },
  });

  return getRoom(client, input.roomId, input.actorId);
}

export async function archiveRoom(
  client: PoolClient,
  input: { roomId: string; actorId: string }
) {
  assertRoomsLocallyEnabled();
  await requireRoom(client, input.roomId);
  await requireActorRole(client, input.roomId, input.actorId, 'owner');
  await client.query(
    `UPDATE app.workspaces
     SET status = 'archived', archived_at = now(), updated_at = now()
     WHERE id = $1 AND kind = 'room'`,
    [input.roomId]
  );
  await client.query(
    `UPDATE app.room_invitations SET status = 'revoked', revoked_at = now(), updated_at = now()
     WHERE workspace_id = $1 AND status = 'pending'`,
    [input.roomId]
  );
  await rotateWorkspaceAccessEpoch(client, input.roomId);
  await recordAuditEvent(client, {
    workspaceId: input.roomId,
    actorId: input.actorId,
    action: 'room.archived',
    resourceType: 'workspace',
    resourceId: input.roomId,
    details: {},
  });
  return getRoom(client, input.roomId, input.actorId);
}

export async function previewCopyPersonalItemToRoom(
  client: PoolClient,
  input: {
    actorId: string;
    sourceWorkspaceId: string;
    sourceItemId: string;
    destinationRoomId: string;
  }
) {
  assertRoomsLocallyEnabled();
  const sourceWs = await client.query<{ kind: string; owner_id: string }>(
    `SELECT kind, owner_id FROM app.workspaces WHERE id = $1`,
    [input.sourceWorkspaceId]
  );
  if (!sourceWs.rows[0] || sourceWs.rows[0].kind !== 'personal') {
    throw new ValidationError('Source must be your personal workspace');
  }
  if (sourceWs.rows[0].owner_id !== input.actorId) {
    throw new RoomServiceError('Cannot copy from another personal workspace', 403, 'ROOM_FORBIDDEN');
  }
  const dest = await requireRoom(client, input.destinationRoomId);
  const destRole = await getMembership(client, input.destinationRoomId, input.actorId);
  if (!destRole || !roomPermissionsFor(destRole.role).editContent) {
    throw new RoomServiceError('Editor role required in destination room', 403, 'ROOM_FORBIDDEN');
  }

  const item = await client.query<{
    id: string;
    kind: string;
    security_scope: string | null;
    title: string | null;
  }>(
    `SELECT i.id, i.kind, i.security_scope,
            COALESCE(n.title, t.title, i.kind::text) as title
     FROM app.items i
     LEFT JOIN app.notes n ON n.id = i.id AND n.workspace_id = i.workspace_id
     LEFT JOIN app.tasks t ON t.id = i.id AND t.workspace_id = i.workspace_id
     WHERE i.id = $1 AND i.workspace_id = $2 AND i.deleted_at IS NULL`,
    [input.sourceItemId, input.sourceWorkspaceId]
  );
  const row = item.rows[0];
  if (!row) throw new NotFoundError('Source item not found');

  let blocked = false;
  let blockReason: string | null = null;
  if (isBlockedShareKind(row.kind, row.security_scope)) {
    blocked = true;
    blockReason = 'Journal and vault content cannot be shared into rooms';
  } else if (!isShareableItemKind(row.kind)) {
    blocked = true;
    blockReason = `Item kind '${row.kind}' is not shareable in Phase 51`;
  }

  return {
    sourceItemId: row.id,
    sourceTitle: row.title ?? row.kind,
    sourceKind: row.kind,
    destinationRoomId: dest.id,
    destinationRoomName: dest.name,
    ownershipExplanation:
      'A new copy will be created in the room. The personal original stays private in your personal workspace. Room members will not gain access to your personal workspace.',
    blocked,
    blockReason,
  };
}

export async function copyPersonalItemToRoom(
  client: PoolClient,
  input: {
    actorId: string;
    sourceWorkspaceId: string;
    sourceItemId: string;
    destinationRoomId: string;
  }
) {
  const preview = await previewCopyPersonalItemToRoom(client, input);
  if (preview.blocked) {
    throw new RoomServiceError(preview.blockReason ?? 'Share blocked', 400, 'ROOM_SHARE_BLOCKED');
  }

  const source = await client.query<{
    kind: string;
    security_scope: string;
    rank: string;
  }>(
    `SELECT kind, security_scope, rank
     FROM app.items
     WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL
     FOR UPDATE`,
    [input.sourceItemId, input.sourceWorkspaceId]
  );
  const src = source.rows[0];
  if (!src) throw new NotFoundError('Source item not found');
  if (src.security_scope === 'vault') {
    throw new RoomServiceError('Vault content cannot be shared into rooms', 400, 'ROOM_SHARE_BLOCKED');
  }

  const destinationItemId = randomUUID();
  const itemKind = src.kind === 'todo' ? 'task' : src.kind;

  // Switch tenant GUC to destination room so RLS allows the insert (source was authorized above).
  await client.query("SELECT set_config('app.current_workspace_id', $1, true)", [
    input.destinationRoomId,
  ]);

  await client.query(
    `INSERT INTO app.items (
      id, workspace_id, folder_id, kind, created_by, updated_by,
      revision, rank, is_archived, is_pinned, security_scope
    ) VALUES (
      $1, $2, NULL, $3, $4, $4, 1, $5, false, false, 'standard'
    )`,
    [destinationItemId, input.destinationRoomId, itemKind, input.actorId, src.rank]
  );

  if (src.kind === 'note') {
    await client.query(
      `INSERT INTO app.notes (
         id, workspace_id, title, document, plain_text, word_count, char_count, created_at, updated_at
       )
       SELECT $1, $2, title, document, plain_text, word_count, char_count, now(), now()
       FROM app.notes WHERE id = $3 AND workspace_id = $4`,
      [destinationItemId, input.destinationRoomId, input.sourceItemId, input.sourceWorkspaceId]
    );
  } else if (src.kind === 'task' || src.kind === 'todo') {
    await client.query(
      `INSERT INTO app.tasks (
         id, workspace_id, title, details, priority, status, deadline_type,
         deadline_date, deadline_zone, created_at, updated_at
       )
       SELECT $1, $2, title, details, priority, status, deadline_type,
              deadline_date, deadline_zone, now(), now()
       FROM app.tasks WHERE id = $3 AND workspace_id = $4`,
      [destinationItemId, input.destinationRoomId, input.sourceItemId, input.sourceWorkspaceId]
    );
  } else {
    throw new RoomServiceError('Unsupported share kind', 400, 'ROOM_SHARE_BLOCKED');
  }

  await recordAuditEvent(client, {
    workspaceId: input.destinationRoomId,
    actorId: input.actorId,
    action: 'room.item_copied_from_personal',
    resourceType: 'item',
    resourceId: destinationItemId,
    details: {
      sourceWorkspaceId: input.sourceWorkspaceId,
      sourceItemId: input.sourceItemId,
      kind: src.kind,
    },
  });

  return {
    destinationItemId,
    destinationRoomId: input.destinationRoomId,
    sourcePreserved: true as const,
  };
}

export async function listRoomMembers(client: PoolClient, roomId: string, actorId: string) {
  assertRoomsLocallyEnabled();
  await requireActorRole(client, roomId, actorId, 'viewer');
  return listMemberships(client, roomId);
}
