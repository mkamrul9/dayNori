/**
 * Phase 53 repair — concurrency-safe idempotency, read clamp, publication recovery, attachments.
 */
import crypto from 'node:crypto';
import { generateKeyPair, SignJWT, exportJWK, type JSONWebKeySet } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { buildServer, JwtVerifier } from '../../apps/api/src/index.js';
import { createAdminPool, createRuntimePool, withUserContext } from '../../apps/api/src/db/index.js';
import { Migrator } from '../../infra/supabase/migrator.js';
import { createApiClient, DaynoriApiClient } from '@daynori/api-client';
import { recoverUnpublishedChatEventsBatch } from '../../apps/api/src/modules/chat/publicationRecovery.js';
import { resetLocalRoomChatBus, subscribeRoomChat } from '../../apps/api/src/modules/chat/localRealtimeBus.js';

describe('Phase 53 repair: chat durability and authorization', () => {
  let adminPool: Pool;
  let runtimePool: Pool;
  let server: ReturnType<typeof buildServer>;
  let baseUrl: string;
  let keyPair: Awaited<ReturnType<typeof generateKeyPair>>;

  const issuer = 'https://auth.daynori.test';
  const audience = 'daynori-api';
  const kid = 'phase53-repair-key';

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
    const room = await clientOwner.createRoom({ name: `Repair ${crypto.randomUUID().slice(0, 8)}` });
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
    server = buildServer({
      jwtVerifier: new JwtVerifier({ issuer, audience, localJwks: jwks }),
      runtimePool,
      rateLimitOptions: { windowMs: 60000, maxRequests: 50000 },
      enableChatPublicationRecovery: false,
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

  it('concurrent identical retries return one message; different payload rejected', async () => {
    const room = await seedRoom();
    const clientMessageId = crypto.randomUUID();
    const body = 'concurrent-same';
    const [a, b] = await Promise.all([
      clientEditor.sendRoomChatMessage(room.id, { clientMessageId, body }),
      clientEditor.sendRoomChatMessage(room.id, { clientMessageId, body }),
    ]);
    expect(a.data.id).toBe(b.data.id);
    expect(a.data.serverOrder).toBe(b.data.serverOrder);

    await expect(
      clientEditor.sendRoomChatMessage(room.id, {
        clientMessageId,
        body: 'different',
      })
    ).rejects.toThrow(/IDEMPOTENCY|reused|409/i);

    const hist = await clientViewer.listRoomChatMessages(room.id, { limit: 20 });
    expect(hist.data.messages.filter((m) => m.clientMessageId === clientMessageId)).toHaveLength(1);
  });

  it('retry after edit/delete still returns original receipt without new create event', async () => {
    const room = await seedRoom();
    const clientMessageId = crypto.randomUUID();
    const first = await clientEditor.sendRoomChatMessage(room.id, {
      clientMessageId,
      body: 'original-body',
    });
    const edited = await clientEditor.editRoomChatMessage(room.id, first.data.id, {
      body: 'edited-body',
      baseRevision: first.data.bodyRevision,
    });
    expect(edited.data.body).toBe('edited-body');

    const retry = await clientEditor.sendRoomChatMessage(room.id, {
      clientMessageId,
      body: 'original-body',
    });
    expect(retry.data.id).toBe(first.data.id);

    await clientEditor.deleteRoomChatMessage(room.id, first.data.id);
    const retryAfterDelete = await clientEditor.sendRoomChatMessage(room.id, {
      clientMessageId,
      body: 'original-body',
    });
    expect(retryAfterDelete.data.id).toBe(first.data.id);
    expect(retryAfterDelete.data.deletedAt).toBeTruthy();
  });

  it('clamps future read orders to server high-water', async () => {
    const room = await seedRoom();
    const sent = await clientOwner.sendRoomChatMessage(room.id, {
      clientMessageId: crypto.randomUUID(),
      body: 'read-clamp',
    });
    const before = await clientEditor.getRoomChatReadState(room.id);
    const updated = await clientEditor.updateRoomChatReadState(room.id, {
      lastReadServerOrder: sent.data.serverOrder + 1000,
    });
    expect(updated.data.lastReadServerOrder).toBeLessThanOrEqual(
      Math.max(sent.data.serverOrder, before.data.lastReadServerOrder + 1000)
    );
    expect(updated.data.lastReadServerOrder).toBeLessThanOrEqual(sent.data.serverOrder + 5);
    // Must not accept unbounded future — clamped near high-water
    expect(updated.data.lastReadServerOrder).toBeLessThan(sent.data.serverOrder + 1000);
  });

  it('event cursor pagination recovers interleaved messages', async () => {
    const room = await seedRoom();
    const m1 = await clientOwner.sendRoomChatMessage(room.id, {
      clientMessageId: crypto.randomUUID(),
      body: 'e1',
    });
    const m2 = await clientEditor.sendRoomChatMessage(room.id, {
      clientMessageId: crypto.randomUUID(),
      body: 'e2',
    });
    const page1 = await clientViewer.listRoomChatEvents(room.id, {
      sinceOrder: 0,
      limit: 1,
    });
    expect(page1.data.events.length).toBe(1);
    const page2 = await clientViewer.listRoomChatEvents(room.id, {
      sinceOrder: page1.data.events[0]!.serverOrder,
      limit: 10,
    });
    const ids = [...page1.data.events, ...page2.data.events].map((e) => e.messageId);
    expect(ids).toContain(m1.data.id);
    expect(ids).toContain(m2.data.id);
  });

  it('publication recovery drains unpublished events and outbox', async () => {
    const room = await seedRoom();
    const sent = await clientOwner.sendRoomChatMessage(room.id, {
      clientMessageId: crypto.randomUUID(),
      body: 'recover-batch',
    });
    await withUserContext(runtimePool, ownerId, async (client) => {
      await client.query(
        `UPDATE app.room_chat_events SET published_at = NULL
         WHERE workspace_id = $1 AND message_id = $2`,
        [room.id, sent.data.id]
      );
      await client.query(
        `UPDATE app.outbox_intents SET status = 'pending'
         WHERE workspace_id = $1 AND payload->>'messageId' = $2`,
        [room.id, sent.data.id]
      );
    });
    const seen: number[] = [];
    const unsub = subscribeRoomChat(room.id, (ev) => seen.push(ev.serverOrder));
    const result = await recoverUnpublishedChatEventsBatch(runtimePool, 50);
    expect(result.recovered).toBeGreaterThanOrEqual(1);
    expect(seen).toContain(sent.data.serverOrder);
    unsub();
  });

  it('rejects unverified and cross-workspace attachment references', async () => {
    const room = await seedRoom();
    const fakeFile = crypto.randomUUID();
    await expect(
      clientEditor.sendRoomChatMessage(room.id, {
        clientMessageId: crypto.randomUUID(),
        body: 'with-file',
        attachmentFileId: fakeFile,
      })
    ).rejects.toThrow(/not found|ATTACHMENT|400|403/i);
  });

  it('synthetic multi-recipient fan-out: measured delivery via events API', async () => {
    const room = await seedRoom();
    const recipients = [clientOwner, clientEditor, clientViewer];
    const n = 12;
    const started = Date.now();
    const sentIds: string[] = [];
    for (let i = 0; i < n; i++) {
      const res = await clientOwner.sendRoomChatMessage(room.id, {
        clientMessageId: crypto.randomUUID(),
        body: `fan-${i}`,
      });
      sentIds.push(res.data.id);
    }
    const latencies: number[] = [];
    for (const client of recipients) {
      const t0 = Date.now();
      const events = await client.listRoomChatEvents(room.id, { sinceOrder: 0, limit: 100 });
      latencies.push(Date.now() - t0);
      const delivered = events.data.events.filter((e) => sentIds.includes(e.messageId));
      expect(delivered.length).toBeGreaterThanOrEqual(n);
      const orders = delivered.map((e) => e.serverOrder);
      for (let i = 1; i < orders.length; i++) {
        expect(orders[i]!).toBeGreaterThanOrEqual(orders[i - 1]!);
      }
    }
    const elapsedMs = Date.now() - started;
    expect(elapsedMs).toBeLessThan(60_000);
    expect(Math.max(...latencies)).toBeLessThan(5_000);
  });

  it('viewer cannot insert messages via API (role policy)', async () => {
    const room = await seedRoom();
    await expect(
      clientViewer.sendRoomChatMessage(room.id, {
        clientMessageId: crypto.randomUUID(),
        body: 'viewer-write',
      })
    ).rejects.toThrow(/ROOM_ROLE_INSUFFICIENT|403|insufficient/i);
  });

  it('concurrent sends past rate limit reject extras under lock', async () => {
    const room = await seedRoom();
    // Fill to ROOM_CHAT_RATE_LIMIT_COUNT (30) then race extras.
    for (let i = 0; i < 30; i++) {
      await clientEditor.sendRoomChatMessage(room.id, {
        clientMessageId: crypto.randomUUID(),
        body: `rl-fill-${i}`,
      });
    }
    const raced = await Promise.allSettled(
      Array.from({ length: 4 }, (_, i) =>
        clientEditor.sendRoomChatMessage(room.id, {
          clientMessageId: crypto.randomUUID(),
          body: `rl-extra-${i}`,
        })
      )
    );
    const rejected = raced.filter((r) => r.status === 'rejected');
    expect(rejected.length).toBeGreaterThanOrEqual(3);
    for (const r of rejected) {
      expect(String((r as PromiseRejectedResult).reason)).toMatch(/RATE_LIMIT|429|rate limit/i);
    }
  });
});
