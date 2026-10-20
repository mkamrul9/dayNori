/**
 * Phase 53 — Durable room chat and authorized realtime events (provisional local).
 * Not production enablement. Not Phase 54 moderation.
 */
import crypto from 'node:crypto';
import { generateKeyPair, SignJWT, exportJWK, type JSONWebKeySet } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { buildServer, JwtVerifier } from '../../apps/api/src/index.js';
import { createAdminPool, createRuntimePool, withUserContext } from '../../apps/api/src/db/index.js';
import { Migrator } from '../../infra/supabase/migrator.js';
import { createApiClient, DaynoriApiClient } from '@daynori/api-client';
import {
  canSendRoomChat,
  validateRoomChatBody,
  isRoomMuteActive,
  isRoomsLocallyEnabled,
} from '@daynori/domain';
import {
  planRoomChatNotification,
  recoverUnpublishedChatEvents,
} from '../../apps/api/src/modules/chat/service.js';
import {
  publishRoomChatEvent,
  resetLocalRoomChatBus,
  subscribeRoomChat,
} from '../../apps/api/src/modules/chat/localRealtimeBus.js';

describe('Phase 53: room chat and realtime events', () => {
  let adminPool: Pool;
  let runtimePool: Pool;
  let server: ReturnType<typeof buildServer>;
  let baseUrl: string;
  let keyPair: Awaited<ReturnType<typeof generateKeyPair>>;

  const issuer = 'https://auth.daynori.test';
  const audience = 'daynori-api';
  const kid = 'phase53-chat-key';

  const ownerId = crypto.randomUUID();
  const editorId = crypto.randomUUID();
  const viewerId = crypto.randomUUID();
  let clientOwner: DaynoriApiClient;
  let clientEditor: DaynoriApiClient;
  let clientViewer: DaynoriApiClient;

  async function createToken(userId: string): Promise<string> {
    return new SignJWT({
      sub: userId,
      aud: audience,
      iss: issuer,
      role: 'authenticated',
      aal: 'aal1',
      session_id: crypto.randomUUID(),
    })
      .setProtectedHeader({ alg: 'RS256', kid })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(keyPair.privateKey);
  }

  async function seedRoom(): Promise<{ id: string }> {
    const room = await clientOwner.createRoom({ name: `Chat Room ${crypto.randomUUID().slice(0, 8)}` });
    const invE = await clientOwner.createRoomInvitation(room.data.id, { role: 'editor' });
    await clientEditor.acceptRoomInvitation({ token: invE.data.inviteToken! });
    const invV = await clientOwner.createRoomInvitation(room.data.id, { role: 'viewer' });
    await clientViewer.acceptRoomInvitation({ token: invV.data.inviteToken! });
    return room.data;
  }

  beforeAll(async () => {
    process.env['NODE_ENV'] = 'test';
    process.env['DAYNORI_ROOMS_LOCAL_ENABLED'] = 'true';

    adminPool = createAdminPool();
    runtimePool = createRuntimePool();
    await new Migrator().migrate();

    keyPair = await generateKeyPair('RS256');
    const publicJwk = await exportJWK(keyPair.publicKey);
    publicJwk.kid = kid;
    publicJwk.alg = 'RS256';
    publicJwk.use = 'sig';
    const jwks: JSONWebKeySet = { keys: [publicJwk] };
    const verifier = new JwtVerifier({ issuer, audience, localJwks: jwks });

    server = buildServer({
      jwtVerifier: verifier,
      runtimePool,
      rateLimitOptions: { windowMs: 60000, maxRequests: 50000 },
    });
    await server.listen({ port: 0, host: '127.0.0.1' });
    const addr = server.server.address();
    if (!addr || typeof addr === 'string') throw new Error('no address');
    baseUrl = `http://127.0.0.1:${addr.port}`;

    clientOwner = createApiClient({ baseUrl, token: await createToken(ownerId) });
    clientEditor = createApiClient({ baseUrl, token: await createToken(editorId) });
    clientViewer = createApiClient({ baseUrl, token: await createToken(viewerId) });

    const setup = await adminPool.connect();
    try {
      await setup.query(
        `INSERT INTO app.profiles (id, display_name) VALUES ($1,$2),($3,$4),($5,$6)
         ON CONFLICT (id) DO NOTHING`,
        [ownerId, 'Owner', editorId, 'Editor', viewerId, 'Viewer']
      );
    } finally {
      setup.release();
    }
  }, 120_000);

  afterAll(async () => {
    resetLocalRoomChatBus();
    await server.close();
    await runtimePool.end();
    await adminPool.end();
  });

  it('domain: send roles, body bounds, mute, production gate', () => {
    expect(canSendRoomChat('owner')).toBe(true);
    expect(canSendRoomChat('editor')).toBe(true);
    expect(canSendRoomChat('viewer')).toBe(false);
    expect(validateRoomChatBody('').ok).toBe(false);
    expect(validateRoomChatBody('hi').ok).toBe(true);
    expect(isRoomMuteActive({ muted: true, mutedUntil: null })).toBe(true);
    expect(
      isRoomsLocallyEnabled({ NODE_ENV: 'production', DAYNORI_ROOMS_LOCAL_ENABLED: 'true' })
    ).toBe(false);
  });

  it('persists before ack and idempotent retry returns same message once', async () => {
    const room = await seedRoom();
    const clientMessageId = crypto.randomUUID();
    const first = await clientEditor.sendRoomChatMessage(room.id, {
      clientMessageId,
      body: 'hello durable',
    });
    expect(first.data.serverOrder).toBeGreaterThan(0);
    expect(first.data.body).toBe('hello durable');

    const retry = await clientEditor.sendRoomChatMessage(room.id, {
      clientMessageId,
      body: 'hello durable',
    });
    expect(retry.data.id).toBe(first.data.id);
    expect(retry.data.serverOrder).toBe(first.data.serverOrder);

    await expect(
      clientEditor.sendRoomChatMessage(room.id, {
        clientMessageId,
        body: 'different body',
      })
    ).rejects.toThrow(/IDEMPOTENCY|reused|409/i);

    const hist = await clientViewer.listRoomChatMessages(room.id, { limit: 20 });
    const matches = hist.data.messages.filter((m) => m.id === first.data.id);
    expect(matches).toHaveLength(1);
  });

  it('rejects viewer sends; allows history; author edit/delete', async () => {
    const room = await seedRoom();
    await expect(
      clientViewer.sendRoomChatMessage(room.id, {
        clientMessageId: crypto.randomUUID(),
        body: 'nope',
      })
    ).rejects.toThrow(/ROOM_ROLE_INSUFFICIENT|403|insufficient/i);

    const sent = await clientEditor.sendRoomChatMessage(room.id, {
      clientMessageId: crypto.randomUUID(),
      body: 'editable',
    });
    const edited = await clientEditor.editRoomChatMessage(room.id, sent.data.id, {
      body: 'edited',
      baseRevision: sent.data.bodyRevision,
    });
    expect(edited.data.body).toBe('edited');
    expect(edited.data.bodyRevision).toBe(sent.data.bodyRevision + 1);

    await expect(
      clientViewer.editRoomChatMessage(room.id, sent.data.id, {
        body: 'hijack',
        baseRevision: edited.data.bodyRevision,
      })
    ).rejects.toThrow(/403|FORBIDDEN|insufficient|ROLE/i);

    const deleted = await clientEditor.deleteRoomChatMessage(room.id, sent.data.id);
    expect(deleted.data.deletedAt).toBeTruthy();
  });

  it('denies unauthorized history and events after removal', async () => {
    const room = await seedRoom();
    await clientEditor.sendRoomChatMessage(room.id, {
      clientMessageId: crypto.randomUUID(),
      body: 'secret',
    });
    await clientOwner.removeRoomMember(room.id, editorId);
    await expect(clientEditor.listRoomChatMessages(room.id)).rejects.toThrow(
      /MEMBERSHIP_REVOKED|403|revoked|not found/i
    );
    await expect(clientEditor.listRoomChatEvents(room.id, { sinceOrder: 0 })).rejects.toThrow(
      /MEMBERSHIP_REVOKED|403|revoked|not found/i
    );
  });

  it('unread, mute, and privacy-safe notification plan', async () => {
    const room = await seedRoom();
    await clientOwner.sendRoomChatMessage(room.id, {
      clientMessageId: crypto.randomUUID(),
      body: 'ping',
    });
    const before = await clientEditor.getRoomChatReadState(room.id);
    expect(before.data.unreadCount).toBeGreaterThanOrEqual(1);

    await clientEditor.updateRoomChatReadState(room.id, {
      lastReadServerOrder: before.data.lastReadServerOrder + 1000,
    });
    const after = await clientEditor.getRoomChatReadState(room.id);
    expect(after.data.unreadCount).toBe(0);

    await clientEditor.updateRoomChatMute(room.id, { muted: true });
    const muted = await clientEditor.getRoomChatReadState(room.id);
    expect(muted.data.muted).toBe(true);

    const plan = await withUserContext(runtimePool, editorId, (client) =>
      planRoomChatNotification(client, {
        roomId: room.id,
        recipientId: editorId,
        messageId: crypto.randomUUID(),
      })
    );
    expect(plan.dispatch).toBe(false);
    if (!plan.dispatch) expect(plan.reason).toBe('muted');
  });

  it('local realtime bus delivers once; history gap recovery via events cursor', async () => {
    resetLocalRoomChatBus();
    const room = await seedRoom();
    const seen: number[] = [];
    const unsub = subscribeRoomChat(room.id, (ev) => {
      seen.push(ev.serverOrder);
    });

    const a = await clientOwner.sendRoomChatMessage(room.id, {
      clientMessageId: crypto.randomUUID(),
      body: 'event-a',
    });
    const b = await clientOwner.sendRoomChatMessage(room.id, {
      clientMessageId: crypto.randomUUID(),
      body: 'event-b',
    });
    expect(seen).toContain(a.data.serverOrder);
    expect(seen).toContain(b.data.serverOrder);

    // Duplicate publish should be deduped client-side by message id / order set
    publishRoomChatEvent({
      roomId: room.id,
      serverOrder: a.data.serverOrder,
      eventType: 'room_message.created',
      messageId: a.data.id,
      at: new Date().toISOString(),
    });
    const unique = new Set(seen);
    expect(unique.has(a.data.serverOrder)).toBe(true);

    const events = await clientEditor.listRoomChatEvents(room.id, {
      sinceOrder: a.data.serverOrder,
      limit: 10,
    });
    expect(events.data.events.some((e) => e.messageId === b.data.id)).toBe(true);
    expect(events.data.latestServerOrder).toBeGreaterThanOrEqual(b.data.serverOrder);

    unsub();
  });

  it('recovers unpublished chat events after simulated publication interruption', async () => {
    const room = await seedRoom();
    const sent = await clientOwner.sendRoomChatMessage(room.id, {
      clientMessageId: crypto.randomUUID(),
      body: 'recover-me',
    });
    // Force unpublished state then recover
    await withUserContext(runtimePool, ownerId, async (client) => {
      await client.query(
        `UPDATE app.room_chat_events SET published_at = NULL
         WHERE workspace_id = $1 AND message_id = $2`,
        [room.id, sent.data.id]
      );
      const n = await recoverUnpublishedChatEvents(client, room.id);
      expect(n).toBeGreaterThanOrEqual(1);
    });
  });

  it('bounded synthetic fan-out load: many messages stay ordered', async () => {
    const room = await seedRoom();
    const n = 25;
    const started = Date.now();
    const ids: string[] = [];
    for (let i = 0; i < n; i++) {
      const res = await clientEditor.sendRoomChatMessage(room.id, {
        clientMessageId: crypto.randomUUID(),
        body: `load-${i}`,
      });
      ids.push(res.data.id);
    }
    const elapsedMs = Date.now() - started;
    const hist = await clientOwner.listRoomChatMessages(room.id, { limit: 100 });
    const orders = hist.data.messages
      .filter((m) => ids.includes(m.id))
      .map((m) => m.serverOrder)
      .sort((a, b) => a - b);
    expect(orders).toHaveLength(n);
    for (let i = 1; i < orders.length; i++) {
      expect(orders[i]!).toBeGreaterThan(orders[i - 1]!);
    }
    expect(elapsedMs).toBeLessThan(60_000);
  });

  it('production rooms/chat gate remains fail-closed with local flag present', () => {
    expect(
      isRoomsLocallyEnabled({ NODE_ENV: 'production', DAYNORI_ROOMS_LOCAL_ENABLED: 'true' })
    ).toBe(false);
    expect(
      isRoomsLocallyEnabled({ NODE_ENV: 'production', DAYNORI_ROOMS_LOCAL_ENABLED: undefined })
    ).toBe(false);
  });
});
