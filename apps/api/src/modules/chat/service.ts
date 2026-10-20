/**
 * Phase 53 — Durable room chat (persist-before-ack, idempotent send, authorized events).
 * Provisional local; gated by isRoomsLocallyEnabled (production fail-closed).
 */

import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import {
  canDeleteRoomMessage,
  canEditRoomMessage,
  canReadRoomChat,
  canSendRoomChat,
  clampRoomChatPageSize,
  isAllowedRoomChatAttachmentKind,
  isRoomMuteActive,
  isRoomsLocallyEnabled,
  ROOM_CHAT_RATE_LIMIT_COUNT,
  ROOM_CHAT_RATE_LIMIT_WINDOW_MS,
  validateRoomChatBody,
  type RoomRole,
} from '@daynori/domain';
import { NotFoundError, ValidationError } from '../../plugins/errorHandler.js';
import { publishRoomChatEvent } from './localRealtimeBus.js';

export class ChatServiceError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly code: string
  ) {
    super(message);
    this.name = 'ChatServiceError';
  }
}

export function assertChatLocallyEnabled(): void {
  if (!isRoomsLocallyEnabled(process.env)) {
    throw new ChatServiceError(
      'Room chat is disabled outside local/provisional development. Production never enables chat via DAYNORI_ROOMS_LOCAL_ENABLED.',
      403,
      'ROOMS_DISABLED'
    );
  }
}

type AccessRow = { kind: string; status: string; user_role: string | null };

async function assertRoomChatAccess(
  client: PoolClient,
  roomId: string,
  actorId: string,
  need: 'read' | 'send'
): Promise<RoomRole> {
  assertChatLocallyEnabled();
  const res = await client.query<AccessRow>(
    `SELECT kind, status, user_role FROM app.get_workspace_sync_access($1, $2)`,
    [roomId, actorId]
  );
  const row = res.rows[0];
  if (!row || row.kind !== 'room') {
    throw new NotFoundError('Room not found');
  }
  if (row.status === 'archived') {
    throw new ChatServiceError('Room is archived', 403, 'ROOM_ARCHIVED');
  }
  if (!row.user_role) {
    throw new ChatServiceError('Membership not found or revoked', 403, 'MEMBERSHIP_REVOKED');
  }
  const role = row.user_role as RoomRole;
  if (need === 'read' && !canReadRoomChat(role)) {
    throw new ChatServiceError('Membership not found or revoked', 403, 'MEMBERSHIP_REVOKED');
  }
  if (need === 'send' && !canSendRoomChat(role)) {
    throw new ChatServiceError(
      `ROOM_ROLE_INSUFFICIENT: editor required but user has ${role}`,
      403,
      'ROOM_ROLE_INSUFFICIENT'
    );
  }
  return role;
}

type MessageRow = {
  id: string;
  workspace_id: string;
  sender_id: string;
  client_message_id: string;
  body: string;
  body_revision: number;
  attachment_file_id: string | null;
  original_payload_hash: string;
  server_order: string | number;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};

export type ChatMutationResult = {
  message: ReturnType<typeof mapMessage>;
  eventServerOrder: number;
  /** True when returning a durable prior receipt — do not publish a new event. */
  isReplay: boolean;
};

function mapMessage(row: MessageRow) {
  return {
    id: row.id,
    roomId: row.workspace_id,
    senderId: row.sender_id,
    clientMessageId: row.client_message_id,
    body: row.deleted_at ? '' : row.body,
    bodyRevision: row.body_revision,
    attachmentFileId: row.attachment_file_id,
    serverOrder: Number(row.server_order),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    deletedAt: row.deleted_at?.toISOString() ?? null,
  };
}

async function lockChatState(client: PoolClient, roomId: string): Promise<void> {
  await client.query(
    `INSERT INTO app.room_chat_state (workspace_id, next_server_order)
     VALUES ($1, 1)
     ON CONFLICT (workspace_id) DO NOTHING`,
    [roomId]
  );
  await client.query(
    `SELECT workspace_id FROM app.room_chat_state WHERE workspace_id = $1 FOR UPDATE`,
    [roomId]
  );
}

async function allocateServerOrder(client: PoolClient, roomId: string): Promise<number> {
  const res = await client.query<{ next_server_order: string | number }>(
    `UPDATE app.room_chat_state
     SET next_server_order = next_server_order + 1, updated_at = now()
     WHERE workspace_id = $1
     RETURNING next_server_order - 1 AS next_server_order`,
    [roomId]
  );
  return Number(res.rows[0]!.next_server_order);
}

async function insertChatEvent(
  client: PoolClient,
  params: {
    roomId: string;
    serverOrder: number;
    eventType: 'room_message.created' | 'room_message.edited' | 'room_message.deleted';
    messageId: string;
    payload: Record<string, unknown>;
  }
): Promise<void> {
  const outbox = await client.query<{ id: string }>(
    `INSERT INTO app.outbox_intents (workspace_id, event_type, payload, status)
     VALUES ($1, $2, $3::jsonb, 'pending')
     RETURNING id`,
    [
      params.roomId,
      params.eventType,
      JSON.stringify({
        messageId: params.messageId,
        serverOrder: params.serverOrder,
      }),
    ]
  );
  await client.query(
    `INSERT INTO app.room_chat_events (
       workspace_id, server_order, event_type, message_id, payload, outbox_intent_id
     ) VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
    [
      params.roomId,
      params.serverOrder,
      params.eventType,
      params.messageId,
      JSON.stringify(params.payload),
      outbox.rows[0]!.id,
    ]
  );
}

async function markEventPublished(
  client: PoolClient,
  roomId: string,
  serverOrder: number
): Promise<void> {
  await client.query(
    `UPDATE app.room_chat_events
     SET published_at = now()
     WHERE workspace_id = $1 AND server_order = $2 AND published_at IS NULL`,
    [roomId, serverOrder]
  );
}

async function assertAttachmentAllowed(
  client: PoolClient,
  roomId: string,
  fileId: string
): Promise<void> {
  const res = await client.query<{
    kind: string;
    security_scope: string | null;
    workspace_id: string;
    deleted_at: Date | null;
    quarantine_status: string | null;
  }>(
    `SELECT i.kind, i.security_scope, i.workspace_id, i.deleted_at,
            f.quarantine_status
     FROM app.items i
     LEFT JOIN app.file_items f ON f.id = i.id AND f.workspace_id = i.workspace_id
     WHERE i.id = $1`,
    [fileId]
  );
  const row = res.rows[0];
  if (!row || row.deleted_at) {
    throw new ValidationError('Attachment file not found in this room');
  }
  if (row.workspace_id !== roomId) {
    throw new ChatServiceError(
      'Chat attachments must reference room-owned files',
      400,
      'CHAT_ATTACHMENT_CROSS_WORKSPACE'
    );
  }
  if (!isAllowedRoomChatAttachmentKind(row.kind, row.security_scope)) {
    throw new ChatServiceError(
      'Chat attachments cannot reference vault or journal content',
      400,
      'CHAT_ATTACHMENT_FORBIDDEN'
    );
  }
  if (row.quarantine_status !== 'verified') {
    throw new ChatServiceError(
      `Chat attachments require a verified file (status=${row.quarantine_status ?? 'missing'})`,
      400,
      'CHAT_ATTACHMENT_NOT_READY'
    );
  }
}

async function assertSendRateLimit(
  client: PoolClient,
  roomId: string,
  senderId: string
): Promise<void> {
  const res = await client.query<{ c: string | number }>(
    `SELECT count(*)::int AS c FROM app.room_messages
     WHERE workspace_id = $1 AND sender_id = $2
       AND created_at > now() - ($3::text || ' milliseconds')::interval`,
    [roomId, senderId, String(ROOM_CHAT_RATE_LIMIT_WINDOW_MS)]
  );
  if (Number(res.rows[0]?.c ?? 0) >= ROOM_CHAT_RATE_LIMIT_COUNT) {
    throw new ChatServiceError('Chat rate limit exceeded', 429, 'RATE_LIMITED');
  }
}

function payloadHash(body: string, attachmentFileId: string | null): string {
  return createHash('sha256')
    .update(JSON.stringify({ body, attachmentFileId }))
    .digest('hex');
}

export async function sendRoomMessage(
  client: PoolClient,
  input: {
    roomId: string;
    actorId: string;
    clientMessageId: string;
    body: string;
    attachmentFileId?: string | null;
  }
): Promise<ChatMutationResult> {
  await assertRoomChatAccess(client, input.roomId, input.actorId, 'send');
  const validated = validateRoomChatBody(input.body);
  if (!validated.ok) throw new ValidationError(validated.message);

  const attachmentFileId = input.attachmentFileId ?? null;
  if (attachmentFileId) {
    await assertAttachmentAllowed(client, input.roomId, attachmentFileId);
  }
  const requestHash = payloadHash(validated.body, attachmentFileId);

  // Lock before idempotency/rate checks so concurrent retries serialize.
  await lockChatState(client, input.roomId);

  const existing = await client.query<MessageRow>(
    `SELECT * FROM app.room_messages
     WHERE workspace_id = $1 AND sender_id = $2 AND client_message_id = $3
     FOR UPDATE`,
    [input.roomId, input.actorId, input.clientMessageId]
  );
  if (existing.rows[0]) {
    const prev = existing.rows[0];
    if (prev.original_payload_hash !== requestHash) {
      throw new ChatServiceError(
        'Idempotency key reused with different content',
        409,
        'IDEMPOTENCY_KEY_REUSED'
      );
    }
    await assertRoomChatAccess(client, input.roomId, input.actorId, 'send');
    return {
      message: mapMessage(prev),
      eventServerOrder: Number(prev.server_order),
      isReplay: true,
    };
  }

  await assertSendRateLimit(client, input.roomId, input.actorId);
  const serverOrder = await allocateServerOrder(client, input.roomId);

  try {
    const inserted = await client.query<MessageRow>(
      `INSERT INTO app.room_messages (
         workspace_id, sender_id, client_message_id, body, attachment_file_id,
         original_payload_hash, server_order
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        input.roomId,
        input.actorId,
        input.clientMessageId,
        validated.body,
        attachmentFileId,
        requestHash,
        serverOrder,
      ]
    );
    const message = inserted.rows[0]!;
    await insertChatEvent(client, {
      roomId: input.roomId,
      serverOrder,
      eventType: 'room_message.created',
      messageId: message.id,
      payload: { senderId: input.actorId },
    });
    return { message: mapMessage(message), eventServerOrder: serverOrder, isReplay: false };
  } catch (err) {
    // Concurrent insert raced the unique constraint — treat as idempotent replay.
    const code = (err as { code?: string })?.code;
    if (code === '23505') {
      const raced = await client.query<MessageRow>(
        `SELECT * FROM app.room_messages
         WHERE workspace_id = $1 AND sender_id = $2 AND client_message_id = $3`,
        [input.roomId, input.actorId, input.clientMessageId]
      );
      const prev = raced.rows[0];
      if (prev && prev.original_payload_hash === requestHash) {
        await assertRoomChatAccess(client, input.roomId, input.actorId, 'send');
        return {
          message: mapMessage(prev),
          eventServerOrder: Number(prev.server_order),
          isReplay: true,
        };
      }
      throw new ChatServiceError(
        'Idempotency key reused with different content',
        409,
        'IDEMPOTENCY_KEY_REUSED'
      );
    }
    throw err;
  }
}

/** Call after the transaction that persisted the message commits. */
export function publishChatAfterCommit(params: {
  roomId: string;
  serverOrder: number;
  eventType: 'room_message.created' | 'room_message.edited' | 'room_message.deleted';
  messageId: string;
}): void {
  publishRoomChatEvent({
    roomId: params.roomId,
    serverOrder: params.serverOrder,
    eventType: params.eventType,
    messageId: params.messageId,
    at: new Date().toISOString(),
  });
}

export async function markChatEventPublished(
  client: PoolClient,
  roomId: string,
  serverOrder: number
): Promise<void> {
  await markEventPublished(client, roomId, serverOrder);
}

export async function listRoomMessages(
  client: PoolClient,
  input: {
    roomId: string;
    actorId: string;
    beforeOrder?: number;
    limit?: number;
  }
) {
  await assertRoomChatAccess(client, input.roomId, input.actorId, 'read');
  const limit = clampRoomChatPageSize(input.limit);
  const params: unknown[] = [input.roomId];
  let where = 'workspace_id = $1';
  if (input.beforeOrder !== undefined) {
    params.push(input.beforeOrder);
    where += ` AND server_order < $${params.length}`;
  }
  params.push(limit + 1);
  const res = await client.query<MessageRow>(
    `SELECT * FROM app.room_messages
     WHERE ${where}
     ORDER BY server_order DESC
     LIMIT $${params.length}`,
    params
  );
  const hasMore = res.rows.length > limit;
  const page = hasMore ? res.rows.slice(0, limit) : res.rows;
  const messages = page.map(mapMessage);
  const nextBeforeOrder =
    hasMore && page.length > 0 ? Number(page[page.length - 1]!.server_order) : null;
  return { messages, nextBeforeOrder, hasMore };
}

export async function editRoomMessage(
  client: PoolClient,
  input: {
    roomId: string;
    messageId: string;
    actorId: string;
    body: string;
    baseRevision: number;
  }
): Promise<ChatMutationResult> {
  const role = await assertRoomChatAccess(client, input.roomId, input.actorId, 'send');
  const validated = validateRoomChatBody(input.body);
  if (!validated.ok) throw new ValidationError(validated.message);

  await lockChatState(client, input.roomId);
  const existing = await client.query<MessageRow>(
    `SELECT * FROM app.room_messages WHERE id = $1 AND workspace_id = $2 FOR UPDATE`,
    [input.messageId, input.roomId]
  );
  const row = existing.rows[0];
  if (!row || row.deleted_at) throw new NotFoundError('Message not found');
  if (!canEditRoomMessage({ actorRole: role, actorId: input.actorId, senderId: row.sender_id })) {
    throw new ChatServiceError('Only the author may edit this message', 403, 'FORBIDDEN');
  }
  if (row.body_revision !== input.baseRevision) {
    throw new ChatServiceError('Message revision conflict', 409, 'REVISION_CONFLICT');
  }

  const serverOrder = await allocateServerOrder(client, input.roomId);
  const updated = await client.query<MessageRow>(
    `UPDATE app.room_messages
     SET body = $1, body_revision = body_revision + 1, updated_at = now()
     WHERE id = $2
     RETURNING *`,
    [validated.body, input.messageId]
  );
  const message = updated.rows[0]!;
  await insertChatEvent(client, {
    roomId: input.roomId,
    serverOrder,
    eventType: 'room_message.edited',
    messageId: message.id,
    payload: { bodyRevision: message.body_revision },
  });
  return { message: mapMessage(message), eventServerOrder: serverOrder, isReplay: false };
}

export async function deleteRoomMessage(
  client: PoolClient,
  input: { roomId: string; messageId: string; actorId: string }
): Promise<ChatMutationResult> {
  const role = await assertRoomChatAccess(client, input.roomId, input.actorId, 'read');
  await lockChatState(client, input.roomId);
  const existing = await client.query<MessageRow>(
    `SELECT * FROM app.room_messages WHERE id = $1 AND workspace_id = $2 FOR UPDATE`,
    [input.messageId, input.roomId]
  );
  const row = existing.rows[0];
  if (!row) throw new NotFoundError('Message not found');
  if (!canDeleteRoomMessage({ actorRole: role, actorId: input.actorId, senderId: row.sender_id })) {
    throw new ChatServiceError('Not authorized to delete this message', 403, 'FORBIDDEN');
  }
  if (row.deleted_at) {
    return {
      message: mapMessage(row),
      eventServerOrder: Number(row.server_order),
      isReplay: true,
    };
  }

  // Deleting requires send privilege unless owner moderating
  if (role !== 'owner' && !canSendRoomChat(role)) {
    throw new ChatServiceError(
      'ROOM_ROLE_INSUFFICIENT: editor required but user has viewer',
      403,
      'ROOM_ROLE_INSUFFICIENT'
    );
  }

  const serverOrder = await allocateServerOrder(client, input.roomId);
  const updated = await client.query<MessageRow>(
    `UPDATE app.room_messages
     SET deleted_at = now(), body = '', updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [input.messageId]
  );
  const message = updated.rows[0]!;
  await insertChatEvent(client, {
    roomId: input.roomId,
    serverOrder,
    eventType: 'room_message.deleted',
    messageId: message.id,
    payload: {},
  });
  return { message: mapMessage(message), eventServerOrder: serverOrder, isReplay: false };
}

export async function getRoomChatReadState(
  client: PoolClient,
  input: { roomId: string; actorId: string }
) {
  await assertRoomChatAccess(client, input.roomId, input.actorId, 'read');
  const readRes = await client.query<{
    last_read_server_order: string | number;
    last_read_at: Date;
  }>(
    `SELECT last_read_server_order, last_read_at
     FROM app.room_message_read_state
     WHERE workspace_id = $1 AND user_id = $2`,
    [input.roomId, input.actorId]
  );
  const lastRead = Number(readRes.rows[0]?.last_read_server_order ?? 0);
  const unreadRes = await client.query<{ c: string | number }>(
    `SELECT count(*)::int AS c FROM app.room_messages
     WHERE workspace_id = $1 AND server_order > $2 AND deleted_at IS NULL
       AND sender_id <> $3`,
    [input.roomId, lastRead, input.actorId]
  );
  const muteRes = await client.query<{ muted: boolean; muted_until: Date | null }>(
    `SELECT muted, muted_until FROM app.room_mutes
     WHERE workspace_id = $1 AND user_id = $2`,
    [input.roomId, input.actorId]
  );
  const mute = muteRes.rows[0];
  return {
    roomId: input.roomId,
    lastReadServerOrder: lastRead,
    unreadCount: Number(unreadRes.rows[0]?.c ?? 0),
    muted: mute
      ? isRoomMuteActive({ muted: mute.muted, mutedUntil: mute.muted_until })
      : false,
    mutedUntil: mute?.muted_until?.toISOString() ?? null,
    lastReadAt: readRes.rows[0]?.last_read_at?.toISOString() ?? null,
  };
}

export async function updateRoomChatReadState(
  client: PoolClient,
  input: { roomId: string; actorId: string; lastReadServerOrder: number }
) {
  await assertRoomChatAccess(client, input.roomId, input.actorId, 'read');
  const highWater = await client.query<{ m: string | number | null }>(
    `SELECT GREATEST(
       coalesce((SELECT max(server_order) FROM app.room_messages WHERE workspace_id = $1), 0),
       coalesce((SELECT max(server_order) FROM app.room_chat_events WHERE workspace_id = $1), 0)
     ) AS m`,
    [input.roomId]
  );
  const maxOrder = Number(highWater.rows[0]?.m ?? 0);
  const requested = Math.max(0, Math.floor(input.lastReadServerOrder));
  const clamped = Math.min(requested, maxOrder);

  await client.query(
    `INSERT INTO app.room_message_read_state (workspace_id, user_id, last_read_server_order, last_read_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (workspace_id, user_id) DO UPDATE
       SET last_read_server_order = GREATEST(
             app.room_message_read_state.last_read_server_order,
             EXCLUDED.last_read_server_order
           ),
           last_read_at = now()`,
    [input.roomId, input.actorId, clamped]
  );
  return getRoomChatReadState(client, input);
}

export async function updateRoomChatMute(
  client: PoolClient,
  input: {
    roomId: string;
    actorId: string;
    muted: boolean;
    mutedUntil?: string | null;
  }
) {
  await assertRoomChatAccess(client, input.roomId, input.actorId, 'read');
  await client.query(
    `INSERT INTO app.room_mutes (workspace_id, user_id, muted, muted_until, updated_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (workspace_id, user_id) DO UPDATE
       SET muted = EXCLUDED.muted,
           muted_until = EXCLUDED.muted_until,
           updated_at = now()`,
    [input.roomId, input.actorId, input.muted, input.mutedUntil ?? null]
  );
  return getRoomChatReadState(client, input);
}

export async function listRoomChatEvents(
  client: PoolClient,
  input: {
    roomId: string;
    actorId: string;
    sinceOrder?: number;
    limit?: number;
  }
) {
  await assertRoomChatAccess(client, input.roomId, input.actorId, 'read');
  const limit = clampRoomChatPageSize(input.limit);
  const since = input.sinceOrder ?? 0;
  const eventsRes = await client.query<{
    id: string;
    workspace_id: string;
    server_order: string | number;
    event_type: 'room_message.created' | 'room_message.edited' | 'room_message.deleted';
    message_id: string;
    created_at: Date;
  }>(
    `SELECT id, workspace_id, server_order, event_type, message_id, created_at
     FROM app.room_chat_events
     WHERE workspace_id = $1 AND server_order > $2
     ORDER BY server_order ASC
     LIMIT $3`,
    [input.roomId, since, limit]
  );

  const messageIds = [...new Set(eventsRes.rows.map((e) => e.message_id))];
  const messagesById = new Map<string, ReturnType<typeof mapMessage>>();
  if (messageIds.length > 0) {
    const msgRes = await client.query<MessageRow>(
      `SELECT * FROM app.room_messages WHERE workspace_id = $1 AND id = ANY($2::uuid[])`,
      [input.roomId, messageIds]
    );
    for (const row of msgRes.rows) {
      messagesById.set(row.id, mapMessage(row));
    }
  }

  const latestRes = await client.query<{ m: string | number | null }>(
    `SELECT max(server_order) AS m FROM app.room_chat_events WHERE workspace_id = $1`,
    [input.roomId]
  );

  return {
    events: eventsRes.rows.map((e) => ({
      id: e.id,
      roomId: e.workspace_id,
      serverOrder: Number(e.server_order),
      eventType: e.event_type,
      messageId: e.message_id,
      message: messagesById.get(e.message_id) ?? null,
      createdAt: e.created_at.toISOString(),
    })),
    latestServerOrder: Number(latestRes.rows[0]?.m ?? 0),
    connectionStatus: 'connected' as const,
  };
}

/**
 * Synthetic notification decision — never sends real push.
 * Rechecks membership and mute; returns a privacy-safe preview label.
 */
export async function planRoomChatNotification(
  client: PoolClient,
  input: { roomId: string; recipientId: string; messageId: string }
): Promise<
  | { dispatch: false; reason: string }
  | { dispatch: true; preview: 'generic' | 'detailed'; title: string; body: string }
> {
  try {
    await assertRoomChatAccess(client, input.roomId, input.recipientId, 'read');
  } catch {
    return { dispatch: false, reason: 'not_a_member' };
  }
  const muteRes = await client.query<{ muted: boolean; muted_until: Date | null }>(
    `SELECT muted, muted_until FROM app.room_mutes
     WHERE workspace_id = $1 AND user_id = $2`,
    [input.roomId, input.recipientId]
  );
  const mute = muteRes.rows[0];
  if (mute && isRoomMuteActive({ muted: mute.muted, mutedUntil: mute.muted_until })) {
    return { dispatch: false, reason: 'muted' };
  }
  // Default lock-screen privacy: generic preview (no message body).
  return {
    dispatch: true,
    preview: 'generic',
    title: 'Room message',
    body: 'New activity in a shared room',
  };
}

/**
 * @deprecated Prefer recoverUnpublishedChatEventsBatch from publicationRecovery.ts
 * Kept for room-scoped test helpers; does not claim user delivery.
 */
export async function recoverUnpublishedChatEvents(
  client: PoolClient,
  roomId: string
): Promise<number> {
  const res = await client.query<{
    id: string;
    server_order: string | number;
    event_type: 'room_message.created' | 'room_message.edited' | 'room_message.deleted';
    message_id: string;
  }>(
    `SELECT id, server_order, event_type, message_id
     FROM app.room_chat_events
     WHERE workspace_id = $1 AND published_at IS NULL
     ORDER BY server_order ASC
     LIMIT 100
     FOR UPDATE`,
    [roomId]
  );
  for (const row of res.rows) {
    publishRoomChatEvent({
      roomId,
      serverOrder: Number(row.server_order),
      eventType: row.event_type,
      messageId: row.message_id,
      at: new Date().toISOString(),
    });
    await client.query(`SELECT app.mark_room_chat_event_published($1)`, [row.id]).catch(async () => {
      await markEventPublished(client, roomId, Number(row.server_order));
    });
  }
  return res.rows.length;
}
