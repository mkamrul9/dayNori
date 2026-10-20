/**
 * Phase 54 — Reports, blocks, terms, moderation authorization (provisional local).
 */
import crypto from 'node:crypto';
import { generateKeyPair, SignJWT, exportJWK, type JSONWebKeySet } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { CURRENT_UGC_POLICY_VERSION } from '@daynori/domain';
import { buildServer, JwtVerifier } from '../../apps/api/src/index.js';
import { createAdminPool, createRuntimePool } from '../../apps/api/src/db/index.js';
import { Migrator } from '../../infra/supabase/migrator.js';
import { createApiClient, DaynoriApiClient } from '@daynori/api-client';

describe('Phase 54: collaboration safety and policy gate', () => {
  let adminPool: Pool;
  let runtimePool: Pool;
  let server: ReturnType<typeof buildServer>;
  let baseUrl: string;
  let keyPair: Awaited<ReturnType<typeof generateKeyPair>>;

  const issuer = 'https://auth.daynori.test';
  const audience = 'daynori-api';
  const kid = 'phase54-key';

  const ownerId = crypto.randomUUID();
  const editorId = crypto.randomUUID();
  const viewerId = crypto.randomUUID();
  const outsiderId = crypto.randomUUID();
  const moderatorId = crypto.randomUUID();

  let clientOwner: DaynoriApiClient;
  let clientEditor: DaynoriApiClient;
  let clientViewer: DaynoriApiClient;
  let clientOutsider: DaynoriApiClient;
  let clientModerator: DaynoriApiClient;

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
    const room = await clientOwner.createRoom({ name: `Safety ${crypto.randomUUID().slice(0, 8)}` });
    const invE = await clientOwner.createRoomInvitation(room.data.id, { role: 'editor' });
    await clientEditor.acceptRoomInvitation({ token: invE.data.inviteToken! });
    const invV = await clientOwner.createRoomInvitation(room.data.id, { role: 'viewer' });
    await clientViewer.acceptRoomInvitation({ token: invV.data.inviteToken! });
    return room.data;
  }

  beforeAll(async () => {
    process.env['NODE_ENV'] = 'test';
    process.env['DAYNORI_ROOMS_LOCAL_ENABLED'] = 'true';
    process.env['DAYNORI_PLATFORM_MODERATOR_IDS'] = moderatorId;

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
    clientOutsider = createApiClient({ baseUrl, token: await createToken(outsiderId) });
    clientModerator = createApiClient({ baseUrl, token: await createToken(moderatorId) });

    const setup = await adminPool.connect();
    try {
      await setup.query(
        `INSERT INTO app.profiles (id, display_name)
         VALUES ($1,$2),($3,$4),($5,$6),($7,$8),($9,$10)
         ON CONFLICT (id) DO NOTHING`,
        [
          ownerId,
          'Owner',
          editorId,
          'Editor',
          viewerId,
          'Viewer',
          outsiderId,
          'Outsider',
          moderatorId,
          'Moderator',
        ]
      );
      for (const uid of [ownerId, editorId, viewerId, moderatorId]) {
        await setup.query(
          `INSERT INTO app.ugc_terms_acceptances (user_id, policy_version)
           VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [uid, CURRENT_UGC_POLICY_VERSION]
        );
      }
    } finally {
      setup.release();
    }
  }, 120_000);

  afterAll(async () => {
    delete process.env['DAYNORI_PLATFORM_MODERATOR_IDS'];
    await server.close();
    await runtimePool.end();
    await adminPool.end();
  });

  it('requires terms before chat send; accepts current version', async () => {
    const room = await seedRoom();
    await expect(
      clientOutsider.sendRoomChatMessage(room.id, {
        clientMessageId: crypto.randomUUID(),
        body: 'no-terms',
      })
    ).rejects.toThrow();

    // Outsider is not a member — membership error first. Use editor without terms:
    const setup = await adminPool.connect();
    try {
      await setup.query(`DELETE FROM app.ugc_terms_acceptances WHERE user_id = $1`, [editorId]);
    } finally {
      setup.release();
    }
    await expect(
      clientEditor.sendRoomChatMessage(room.id, {
        clientMessageId: crypto.randomUUID(),
        body: 'needs-terms',
      })
    ).rejects.toThrow(/Accept UGC policy|UGC_TERMS_REQUIRED|terms/i);

    const accepted = await clientEditor.acceptUgcTerms({
      policyVersion: CURRENT_UGC_POLICY_VERSION,
    });
    expect(accepted.data.requiresAcceptance).toBe(false);

    await expect(
      clientEditor.acceptUgcTerms({ policyVersion: 'old-version' })
    ).rejects.toThrow(/POLICY_VERSION|current policy|mismatch/i);

    const sent = await clientEditor.sendRoomChatMessage(room.id, {
      clientMessageId: crypto.randomUUID(),
      body: 'after-terms',
    });
    expect(sent.data.body).toBe('after-terms');
  });

  it('viewer can report message; duplicate clientReportId is idempotent', async () => {
    const room = await seedRoom();
    const msg = await clientOwner.sendRoomChatMessage(room.id, {
      clientMessageId: crypto.randomUUID(),
      body: 'report-me',
    });
    const clientReportId = crypto.randomUUID();
    const a = await clientViewer.createUgcReport({
      clientReportId,
      targetType: 'message',
      roomId: room.id,
      messageId: msg.data.id,
      category: 'harassment',
      explanation: 'synthetic harassment sample',
    });
    const b = await clientViewer.createUgcReport({
      clientReportId,
      targetType: 'message',
      roomId: room.id,
      messageId: msg.data.id,
      category: 'harassment',
    });
    expect(a.data.id).toBe(b.data.id);
    expect(a.data.status).toBe('received');
  });

  it('rejects cross-room message report and outsider user report without membership', async () => {
    const roomA = await seedRoom();
    const roomB = await seedRoom();
    const msg = await clientOwner.sendRoomChatMessage(roomA.id, {
      clientMessageId: crypto.randomUUID(),
      body: 'cross',
    });
    await expect(
      clientViewer.createUgcReport({
        clientReportId: crypto.randomUUID(),
        targetType: 'message',
        roomId: roomB.id,
        messageId: msg.data.id,
        category: 'spam',
      })
    ).rejects.toThrow(/not found|403|400/i);

    await expect(
      clientOutsider.createUgcReport({
        clientReportId: crypto.randomUUID(),
        targetType: 'user',
        roomId: roomA.id,
        reportedUserId: ownerId,
        category: 'spam',
      })
    ).rejects.toThrow(/MEMBERSHIP|not a member|Not a member/i);
  });

  it('block prevents invitation accept; hide filters history for blocker only', async () => {
    const room = await seedRoom();
    const msg = await clientEditor.sendRoomChatMessage(room.id, {
      clientMessageId: crypto.randomUUID(),
      body: 'visible-then-hidden',
    });
    await clientViewer.blockUser({ blockedUserId: editorId });
    const histViewer = await clientViewer.listRoomChatMessages(room.id, { limit: 50 });
    expect(histViewer.data.messages.find((m) => m.id === msg.data.id)).toBeUndefined();

    const histOwner = await clientOwner.listRoomChatMessages(room.id, { limit: 50 });
    expect(histOwner.data.messages.find((m) => m.id === msg.data.id)).toBeTruthy();

    const inv = await clientOwner.createRoomInvitation(room.id, {
      role: 'viewer',
      recipientUserId: outsiderId,
    });
    // Block between outsider and owner after invite created by owner — accept as outsider
    // who blocks the owner first:
    await clientOutsider.blockUser({ blockedUserId: ownerId });
    await expect(
      clientOutsider.acceptRoomInvitation({ token: inv.data.inviteToken! })
    ).rejects.toThrow(/USER_BLOCKED|403|blocked/i);

    await clientViewer.unblockUser(editorId);
  });

  it('unauthorized users cannot list moderation queue; moderator can', async () => {
    await expect(clientOwner.listModerationReports()).rejects.toThrow(
      /MODERATION_FORBIDDEN|moderation access denied|403/i
    );
    const list = await clientModerator.listModerationReports();
    expect(Array.isArray(list.data.reports)).toBe(true);
  });

  it('evidence snapshot survives message delete', async () => {
    const room = await seedRoom();
    const msg = await clientEditor.sendRoomChatMessage(room.id, {
      clientMessageId: crypto.randomUUID(),
      body: 'evidence-body',
    });
    const report = await clientViewer.createUgcReport({
      clientReportId: crypto.randomUUID(),
      targetType: 'message',
      roomId: room.id,
      messageId: msg.data.id,
      category: 'hate',
    });
    await clientEditor.deleteRoomChatMessage(room.id, msg.data.id);
    const mod = await clientModerator.listModerationReports();
    const found = mod.data.reports.find((r) => r.id === report.data.id);
    expect(found).toBeTruthy();
    expect((found!.evidenceSnapshot as { message?: { body?: string } }).message?.body).toBe(
      'evidence-body'
    );
  });
});
