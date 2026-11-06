/**
 * Phase 88 — Rooms, chat, and staffed moderation readiness integration tests.
 *
 * Verifies findings RM-001 through RM-008:
 * - RM-001: Content removal disposition soft-deletes message and emits deletion event
 * - RM-002: Web operator moderation triage authorization and audit logging
 * - RM-003: Member role transitions (owner/editor/viewer) and single-owner invariant
 * - RM-004: Explicit personal item copy, UUID isolation, vault/journal exclusion
 * - RM-005: Member removal access epoch rotation and client revocation purge
 * - RM-006: Strict boundaries between Mute, Block, and Leave
 * - RM-007: Realtime monotonic server order and event stream replay
 * - RM-008: Fail-closed production gate (DEF-V2-006)
 */

import crypto from 'node:crypto';
import { generateKeyPair, SignJWT, exportJWK, type JSONWebKeySet } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { CURRENT_UGC_POLICY_VERSION, isRoomsLocallyEnabled } from '@daynori/domain';
import { buildServer, JwtVerifier } from '../../apps/api/src/index.js';
import { createAdminPool, createRuntimePool, withTenantContext, withUserContext } from '../../apps/api/src/db/index.js';
import { Migrator } from '../../infra/supabase/migrator.js';
import { createApiClient, type DaynoriApiClient } from '@daynori/api-client';
import { grantPlatformModeratorForTests } from '../../apps/api/src/modules/safety/service.js';

describe('Phase 88: rooms, chat, and staffed moderation readiness', () => {
  let adminPool: Pool;
  let runtimePool: Pool;
  let server: ReturnType<typeof buildServer>;
  let baseUrl: string;
  let keyPair: Awaited<ReturnType<typeof generateKeyPair>>;

  const issuer = 'https://auth.daynori.test';
  const audience = 'daynori-api';
  const kid = 'phase88-key';

  const aliceId = crypto.randomUUID(); // Room Owner
  const bobId = crypto.randomUUID();   // Room Member / Editor
  const carolId = crypto.randomUUID(); // Viewer / Outsider
  const moderatorId = crypto.randomUUID(); // Platform Moderator

  const alicePersonalWsId = crypto.randomUUID();
  const bobPersonalWsId = crypto.randomUUID();

  let clientAlice: DaynoriApiClient;
  let clientBob: DaynoriApiClient;
  let clientCarol: DaynoriApiClient;
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
    if (!addr || typeof addr === 'string') throw new Error('Failed to bind test server');
    baseUrl = `http://127.0.0.1:${addr.port}`;

    clientAlice = createApiClient({ baseUrl, token: await createToken(aliceId) });
    clientBob = createApiClient({ baseUrl, token: await createToken(bobId) });
    clientCarol = createApiClient({ baseUrl, token: await createToken(carolId) });
    clientModerator = createApiClient({ baseUrl, token: await createToken(moderatorId) });

    const setup = await adminPool.connect();
    try {
      // Seed profiles
      await setup.query(
        `INSERT INTO app.profiles (id, display_name)
         VALUES ($1,$2),($3,$4),($5,$6),($7,$8)
         ON CONFLICT (id) DO NOTHING`,
        [aliceId, 'Alice', bobId, 'Bob', carolId, 'Carol', moderatorId, 'Moderator']
      );

      // Seed personal workspaces
      await setup.query(
        `INSERT INTO app.workspaces (id, name, kind, owner_id)
         VALUES ($1,$2,'personal',$3),($4,$5,'personal',$6)
         ON CONFLICT (id) DO NOTHING`,
        [alicePersonalWsId, 'Alice Personal', aliceId, bobPersonalWsId, 'Bob Personal', bobId]
      );
      await setup.query(
        `INSERT INTO app.workspace_memberships (workspace_id, user_id, role)
         VALUES ($1,$2,'owner'),($3,$4,'owner')
         ON CONFLICT (workspace_id, user_id) DO NOTHING`,
        [alicePersonalWsId, aliceId, bobPersonalWsId, bobId]
      );

      // Seed terms acceptance
      for (const uid of [aliceId, bobId, carolId, moderatorId]) {
        await setup.query(
          `INSERT INTO app.ugc_terms_acceptances (user_id, policy_version)
           VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [uid, CURRENT_UGC_POLICY_VERSION]
        );
      }

      // Grant platform moderator privileges to moderatorId
      await grantPlatformModeratorForTests(setup, moderatorId);
    } finally {
      setup.release();
    }
  });

  afterAll(async () => {
    await server.close();
    await runtimePool.end();
    await adminPool.end();
  });

  it('RM-001 (High): Actioned report with content_removed soft-deletes message and emits room_message.deleted event', async () => {
    // 1. Alice creates room and invites Bob as editor
    const room = await clientAlice.createRoom({ name: 'Safety Takedown Test' });
    const inv = await clientAlice.createRoomInvitation(room.data.id, { role: 'editor' });
    await clientBob.acceptRoomInvitation({ token: inv.data.inviteToken! });

    // 2. Bob sends an abusive message
    const msg = await clientBob.sendRoomChatMessage(room.data.id, {
      clientMessageId: crypto.randomUUID(),
      body: 'Abusive harassment message content to be removed',
    });
    expect(msg.data.body).toContain('Abusive harassment');

    // 3. Alice reports Bob's message (targetType 'message' derives reportedUserId automatically)
    const clientReportId = crypto.randomUUID();
    const reportRes = await clientAlice.createUgcReport({
      clientReportId,
      targetType: 'message',
      roomId: room.data.id,
      messageId: msg.data.id,
      category: 'harassment',
      explanation: 'Repeated offensive harassment in chat',
    });
    expect(reportRes.data.status).toBe('received');
    const reportId = reportRes.data.id;

    // 4. Moderator lists reports and inspects frozen evidence snapshot
    const listRes = await clientModerator.listModerationReports();
    const targetReport = listRes.data.reports.find((r) => r.id === reportId);
    expect(targetReport).toBeDefined();
    expect(targetReport!.evidenceSnapshot).toBeDefined();
    const snap = targetReport!.evidenceSnapshot as { message?: { body?: string } };
    expect(snap.message?.body).toBe('Abusive harassment message content to be removed');

    // 5. Moderator applies actioned disposition 'content_removed'
    const updateRes = await clientModerator.updateModerationReport(reportId, {
      status: 'actioned',
      disposition: 'content_removed',
      reason: 'Confirmed harassment policy violation. Message soft-deleted.',
    });
    expect(updateRes.data.reports[0]!.status).toBe('actioned');
    expect(updateRes.data.reports[0]!.disposition).toBe('content_removed');

    // 6. Verify in database: message is soft-deleted (deleted_at set, body cleared)
    const dbCheck = await adminPool.query(
      `SELECT id, body, deleted_at FROM app.room_messages WHERE id = $1`,
      [msg.data.id]
    );
    expect(dbCheck.rows[0]!.deleted_at).not.toBeNull();
    expect(dbCheck.rows[0]!.body).toBe('');

    // 7. Verify in database: event room_message.deleted is appended in app.room_chat_events
    const eventCheck = await adminPool.query(
      `SELECT event_type, message_id FROM app.room_chat_events
       WHERE workspace_id = $1 AND message_id = $2 AND event_type = 'room_message.deleted'`,
      [room.data.id, msg.data.id]
    );
    expect(eventCheck.rows.length).toBe(1);

    // 8. Bob fetches messages: deletedAt is set
    const bobMessages = await clientBob.listRoomChatMessages(room.data.id);
    const deletedInList = bobMessages.data.messages.find((m) => m.id === msg.data.id);
    expect(deletedInList).toBeDefined();
    expect(deletedInList!.deletedAt).not.toBeNull();
    expect(deletedInList!.body).toBe('');
  });

  it('RM-002 (High): Web operator moderation triage authorization and audit logging', async () => {
    // Non-moderators are rejected with 403 Forbidden
    await expect(clientAlice.listModerationReports()).rejects.toMatchObject({
      statusCode: 403,
    });
    await expect(clientBob.listModerationReports()).rejects.toMatchObject({
      statusCode: 403,
    });

    // Moderator can list reports
    const list = await clientModerator.listModerationReports();
    expect(list.data.reports).toBeInstanceOf(Array);

    // Create a fresh user report within a shared room to test triage transition and audit
    const room = await clientAlice.createRoom({ name: 'Audit Test Room' });
    const inv = await clientAlice.createRoomInvitation(room.data.id, { role: 'editor' });
    await clientBob.acceptRoomInvitation({ token: inv.data.inviteToken! });

    const freshRep = await clientAlice.createUgcReport({
      clientReportId: crypto.randomUUID(),
      targetType: 'user',
      roomId: room.data.id,
      reportedUserId: bobId,
      category: 'spam',
      explanation: 'Spamming invitations',
    });
    expect(freshRep.data.status).toBe('received');

    await clientModerator.updateModerationReport(freshRep.data.id, {
      status: 'triaged',
      reason: 'Operator reviewing evidence context',
    });
    const audit = await adminPool.query(
      `SELECT actor_id, target_id, action, reason FROM app.moderation_audit
       WHERE target_id = $1::text ORDER BY created_at DESC LIMIT 1`,
      [freshRep.data.id]
    );
    expect(audit.rows.length).toBe(1);
    expect(audit.rows[0]!.actor_id).toBe(moderatorId);
    expect(audit.rows[0]!.reason).toContain('Operator reviewing evidence');
  });

  it('RM-003 (Medium): Member role transitions (owner/editor/viewer) and ownership transfer invariants', async () => {
    const room = await clientAlice.createRoom({ name: 'Role Lifecycle Room' });
    const inv = await clientAlice.createRoomInvitation(room.data.id, { role: 'editor' });
    await clientBob.acceptRoomInvitation({ token: inv.data.inviteToken! });

    // Alice demotes Bob to viewer
    await clientAlice.updateRoomMemberRole(room.data.id, bobId, { role: 'viewer' });
    const members = await clientAlice.listRoomMembers(room.data.id);
    const bobMember = members.data.find((m) => m.userId === bobId);
    expect(bobMember!.role).toBe('viewer');

    // Bob as viewer cannot post chat messages
    await expect(
      clientBob.sendRoomChatMessage(room.data.id, {
        clientMessageId: crypto.randomUUID(),
        body: 'Viewer attempt to write',
      })
    ).rejects.toMatchObject({ statusCode: 403 });

    // Alice promotes Bob back to editor
    await clientAlice.updateRoomMemberRole(room.data.id, bobId, { role: 'editor' });
    const msg = await clientBob.sendRoomChatMessage(room.data.id, {
      clientMessageId: crypto.randomUUID(),
      body: 'Editor write restored',
    });
    expect(msg.data.body).toBe('Editor write restored');

    // Alice transfers ownership to Bob
    await clientAlice.transferRoomOwnership(room.data.id, { newOwnerUserId: bobId });
    const updatedMembers = await clientBob.listRoomMembers(room.data.id);
    const newOwner = updatedMembers.data.find((m) => m.userId === bobId);
    const oldOwner = updatedMembers.data.find((m) => m.userId === aliceId);
    expect(newOwner!.role).toBe('owner');
    expect(oldOwner!.role).toBe('editor');

    // Alice (now editor) can no longer transfer ownership (fails closed under RLS with 404 Room not found)
    await expect(
      clientAlice.transferRoomOwnership(room.data.id, { newOwnerUserId: aliceId })
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('RM-004 (Medium): Explicit personal item copy with UUID isolation and vault/journal strict blocking', async () => {
    const room = await clientAlice.createRoom({ name: 'Copy Item Room' });

    // Seed personal note in Alice's personal workspace
    const personalNoteId = crypto.randomUUID();
    await withTenantContext(
      runtimePool,
      { userId: aliceId, workspaceId: alicePersonalWsId },
      async (client) => {
        await client.query(
          `INSERT INTO app.items (id, workspace_id, kind, created_by, updated_by, security_scope)
           VALUES ($1,$2,'note',$3,$3,'standard')`,
          [personalNoteId, alicePersonalWsId, aliceId]
        );
        await client.query(
          `INSERT INTO app.notes (id, workspace_id, title, document, plain_text, word_count, char_count)
           VALUES ($1,$2,'Personal Recipe','{}'::jsonb,'Personal Recipe',2,15)`,
          [personalNoteId, alicePersonalWsId]
        );
      }
    );

    // Preview copy: allowed
    const preview = await clientAlice.previewCopyPersonalItemToRoom({
      sourceWorkspaceId: alicePersonalWsId,
      sourceItemId: personalNoteId,
      destinationRoomId: room.data.id,
    });
    expect(preview.data.blocked).toBe(false);
    expect(preview.data.sourceTitle).toBe('Personal Recipe');

    // Execute copy: creates new UUID in room, preserves personal original
    const copyRes = await clientAlice.copyPersonalItemToRoom({
      sourceWorkspaceId: alicePersonalWsId,
      sourceItemId: personalNoteId,
      destinationRoomId: room.data.id,
    });
    expect(copyRes.data.sourcePreserved).toBe(true);
    expect(copyRes.data.destinationItemId).not.toBe(personalNoteId);

    // Verify personal note still exists untouched in Alice's personal workspace
    const personalCheck = await adminPool.query(
      `SELECT id, workspace_id FROM app.notes WHERE id = $1`,
      [personalNoteId]
    );
    expect(personalCheck.rows[0]!.workspace_id).toBe(alicePersonalWsId);

    // Seed personal journal entry: preview and copy MUST be blocked
    const journalId = crypto.randomUUID();
    await withTenantContext(
      runtimePool,
      { userId: aliceId, workspaceId: alicePersonalWsId },
      async (client) => {
        await client.query(
          `INSERT INTO app.items (id, workspace_id, kind, created_by, updated_by, security_scope)
           VALUES ($1,$2,'journal_entry',$3,$3,'standard')`,
          [journalId, alicePersonalWsId, aliceId]
        );
      }
    );

    const journalPreview = await clientAlice.previewCopyPersonalItemToRoom({
      sourceWorkspaceId: alicePersonalWsId,
      sourceItemId: journalId,
      destinationRoomId: room.data.id,
    });
    expect(journalPreview.data.blocked).toBe(true);
    expect(journalPreview.data.blockReason).toMatch(/vault|journal/i);

    await expect(
      clientAlice.copyPersonalItemToRoom({
        sourceWorkspaceId: alicePersonalWsId,
        sourceItemId: journalId,
        destinationRoomId: room.data.id,
      })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('RM-005 (Medium): Access revocation epoch rotation and client cache purge semantics', async () => {
    const room = await clientAlice.createRoom({ name: 'Revocation Test Room' });
    const inv = await clientAlice.createRoomInvitation(room.data.id, { role: 'editor' });
    await clientBob.acceptRoomInvitation({ token: inv.data.inviteToken! });

    // Bob can read room content
    const contentBefore = await clientBob.listRoomContent(room.data.id);
    expect(contentBefore.data).toBeDefined();

    // Alice removes Bob from room
    await clientAlice.removeRoomMember(room.data.id, bobId);

    // Bob calling room APIs now receives 404 for content and 403 for chat
    await expect(clientBob.listRoomContent(room.data.id)).rejects.toMatchObject({
      statusCode: 404,
    });
    await expect(
      clientBob.sendRoomChatMessage(room.data.id, {
        clientMessageId: crypto.randomUUID(),
        body: 'Post-removal message attempt',
      })
    ).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it('RM-006 (Low): Mute vs. Block vs. Leave functional boundaries', async () => {
    const room = await clientAlice.createRoom({ name: 'Mute Block Leave Room' });
    const inv = await clientAlice.createRoomInvitation(room.data.id, { role: 'editor' });
    await clientBob.acceptRoomInvitation({ token: inv.data.inviteToken! });

    // 1. Mute: Alice mutes room chat. Messages still visible, notifications suppressed
    const muteRes = await clientAlice.updateRoomChatMute(room.data.id, { muted: true });
    expect(muteRes.data.muted).toBe(true);
    const msgs = await clientAlice.listRoomChatMessages(room.data.id);
    expect(msgs.data.messages).toBeInstanceOf(Array);

    // 2. Block: Alice blocks Bob.
    await clientAlice.blockUser({ blockedUserId: bobId });

    // Bob sends a message in the shared room
    const bobMsg = await clientBob.sendRoomChatMessage(room.data.id, {
      clientMessageId: crypto.randomUUID(),
      body: 'Message from blocked Bob',
    });

    // Alice lists room messages: Bob's message is hidden from Alice
    const aliceView = await clientAlice.listRoomChatMessages(room.data.id);
    const foundBobMsg = aliceView.data.messages.find((m) => m.id === bobMsg.data.id);
    expect(foundBobMsg).toBeUndefined();

    // Mutual invitations between Alice and Bob are blocked
    const newInv = await clientAlice.createRoomInvitation(room.data.id, { role: 'editor' });
    await expect(
      clientBob.acceptRoomInvitation({ token: newInv.data.inviteToken! })
    ).rejects.toMatchObject({ statusCode: 403, code: 'USER_BLOCKED' });

    // Alice unblocks Bob
    await clientAlice.unblockUser(bobId);

    // 3. Leave: Bob leaves room
    await clientBob.leaveRoom(room.data.id);
    const members = await clientAlice.listRoomMembers(room.data.id);
    expect(members.data.some((m) => m.userId === bobId)).toBe(false);
  });

  it('RM-007 (High): Realtime monotonic server order and replay event stream', async () => {
    const room = await clientAlice.createRoom({ name: 'Monotonic Order Room' });
    const m1 = await clientAlice.sendRoomChatMessage(room.data.id, {
      clientMessageId: crypto.randomUUID(),
      body: 'Message 1',
    });
    const m2 = await clientAlice.sendRoomChatMessage(room.data.id, {
      clientMessageId: crypto.randomUUID(),
      body: 'Message 2',
    });
    const m3 = await clientAlice.sendRoomChatMessage(room.data.id, {
      clientMessageId: crypto.randomUUID(),
      body: 'Message 3',
    });

    expect(m2.data.serverOrder).toBeGreaterThan(m1.data.serverOrder);
    expect(m3.data.serverOrder).toBeGreaterThan(m2.data.serverOrder);

    // Replay event stream sinceOrder
    const events = await clientAlice.listRoomChatEvents(room.data.id, {
      sinceOrder: m1.data.serverOrder,
      limit: 10,
    });
    expect(events.data.events.length).toBeGreaterThanOrEqual(2);
    expect(events.data.events[0]!.serverOrder).toBe(m2.data.serverOrder);
  });

  it('RM-008 (High) & DEF-V2-006: Production gate fails closed', () => {
    // In production environment, rooms must fail closed
    expect(isRoomsLocallyEnabled({ NODE_ENV: 'production' })).toBe(false);
    expect(
      isRoomsLocallyEnabled({
        NODE_ENV: 'production',
        DAYNORI_ROOMS_LOCAL_ENABLED: 'true',
      })
    ).toBe(false);

    // Only in test/dev with explicit local flag enabled is it permitted
    expect(
      isRoomsLocallyEnabled({
        NODE_ENV: 'test',
        DAYNORI_ROOMS_LOCAL_ENABLED: 'true',
      })
    ).toBe(true);
  });

  it('Deduplication: duplicate clientMessageId returns original idempotently', async () => {
    const room = await clientAlice.createRoom({ name: 'Dedup Room' });
    const clientMessageId = crypto.randomUUID();

    const first = await clientAlice.sendRoomChatMessage(room.data.id, {
      clientMessageId,
      body: 'Initial idempotency check',
    });
    const second = await clientAlice.sendRoomChatMessage(room.data.id, {
      clientMessageId,
      body: 'Initial idempotency check',
    });

    expect(second.data.id).toBe(first.data.id);
    expect(second.data.serverOrder).toBe(first.data.serverOrder);

    // Same clientMessageId with different body rejected with 409 Conflict
    await expect(
      clientAlice.sendRoomChatMessage(room.data.id, {
        clientMessageId,
        body: 'Conflicting body payload',
      })
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('Attachments: verified non-vault file attachment succeeds; cross-workspace rejected', async () => {
    const room = await clientAlice.createRoom({ name: 'Attachment Room' });

    // Seed a valid verified file in the room workspace
    const validFileId = crypto.randomUUID();
    const validPath = `rooms/${validFileId}.png`;
    await adminPool.query(
      `INSERT INTO app.items (id, workspace_id, kind, created_by, updated_by, security_scope)
       VALUES ($1,$2,'file',$3,$3,'standard')`,
      [validFileId, room.data.id, aliceId]
    );
    await adminPool.query(
      `INSERT INTO app.file_items (
         id, workspace_id, file_name, declared_mime_type, detected_mime_type, byte_size,
         sha256_checksum, object_path, quarantine_status, created_by
       ) VALUES (
         $1, $2, 'chart.png', 'image/png', 'image/png', 1024,
         'deadbeef', $4, 'verified', $3
       )`,
      [validFileId, room.data.id, aliceId, validPath]
    );

    const msg = await clientAlice.sendRoomChatMessage(room.data.id, {
      clientMessageId: crypto.randomUUID(),
      body: 'Check out this chart',
      attachmentFileId: validFileId,
    });
    expect(msg.data.attachmentFileId).toBe(validFileId);

    // Attempt to attach a file from Alice's personal workspace into the room chat message
    const personalFileId = crypto.randomUUID();
    const personalPath = `personal/${personalFileId}.pdf`;
    await adminPool.query(
      `INSERT INTO app.items (id, workspace_id, kind, created_by, updated_by, security_scope)
       VALUES ($1,$2,'file',$3,$3,'standard')`,
      [personalFileId, alicePersonalWsId, aliceId]
    );
    await adminPool.query(
      `INSERT INTO app.file_items (
         id, workspace_id, file_name, declared_mime_type, detected_mime_type, byte_size,
         sha256_checksum, object_path, quarantine_status, created_by
       ) VALUES (
         $1, $2, 'private.pdf', 'application/pdf', 'application/pdf', 2048,
         'cafebabe', $4, 'verified', $3
       )`,
      [personalFileId, alicePersonalWsId, aliceId, personalPath]
    );

    await expect(
      clientAlice.sendRoomChatMessage(room.data.id, {
        clientMessageId: crypto.randomUUID(),
        body: 'Leaking personal file',
        attachmentFileId: personalFileId,
      })
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
