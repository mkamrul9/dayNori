/**
 * Phase 51 — Shared rooms, invitations, roles (provisional local).
 * Not public sharing / real-user invitation enablement.
 */
import crypto from 'node:crypto';
import { generateKeyPair, SignJWT, exportJWK, type JSONWebKeySet } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { buildServer, JwtVerifier } from '../../apps/api/src/index.js';
import {
  createAdminPool,
  createRuntimePool,
  withTenantContext,
} from '../../apps/api/src/db/index.js';
import { Migrator } from '../../infra/supabase/migrator.js';
import { createApiClient, DaynoriApiClient } from '@daynori/api-client';
import { CURRENT_UGC_POLICY_VERSION } from '@daynori/domain';

describe('Phase 51: shared rooms invitations and roles', () => {
  let adminPool: Pool;
  let runtimePool: Pool;
  let server: ReturnType<typeof buildServer>;
  let baseUrl: string;
  let keyPair: Awaited<ReturnType<typeof generateKeyPair>>;

  const issuer = 'https://auth.daynori.test';
  const audience = 'daynori-api';
  const kid = 'phase51-rooms-key';

  const ownerId = crypto.randomUUID();
  const editorId = crypto.randomUUID();
  const outsiderId = crypto.randomUUID();
  let clientOwner: DaynoriApiClient;
  let clientEditor: DaynoriApiClient;
  let clientOutsider: DaynoriApiClient;
  let personalOwnerId: string;

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
    clientOutsider = createApiClient({ baseUrl, token: await createToken(outsiderId) });

    const setup = await adminPool.connect();
    try {
      await setup.query(
        `INSERT INTO app.profiles (id, display_name) VALUES ($1,$2),($3,$4),($5,$6)
         ON CONFLICT (id) DO NOTHING`,
        [ownerId, 'Owner', editorId, 'Editor', outsiderId, 'Outsider']
      );
      const ws = await setup.query<{ id: string }>(
        `INSERT INTO app.workspaces (name, kind, owner_id) VALUES ('Owner Personal', 'personal', $1) RETURNING id`,
        [ownerId]
      );
      personalOwnerId = ws.rows[0]!.id;
      await setup.query(
        `INSERT INTO app.workspace_memberships (workspace_id, user_id, role) VALUES ($1,$2,'owner')`,
        [personalOwnerId, ownerId]
      );
    } finally {
      setup.release();
    }
  }, 120_000);

  beforeAll(async () => {
    await adminPool.query(
      `INSERT INTO app.ugc_terms_acceptances (user_id, policy_version) VALUES ($1, $3), ($2, $3) ON CONFLICT DO NOTHING`,
      [ownerId, editorId, CURRENT_UGC_POLICY_VERSION]
    );
  });

  afterAll(async () => {
    if (server) await server.close();
    if (runtimePool) await runtimePool.end();
    if (adminPool) await adminPool.end();
  });

  it('creates a room, invites via bearer link, accepts once, and protects personal workspace', async () => {
    const room = await clientOwner.createRoom({ name: 'Project Alpha' });
    expect(room.data.kind).toBe('room');
    expect(room.data.actorRole).toBe('owner');

    const invite = await clientOwner.createRoomInvitation(room.data.id, {
      role: 'editor',
      expiresInHours: 24,
    });
    expect(invite.data.inviteToken).toBeTruthy();
    expect(invite.data.deliveryPolicy).toBe('bearer_link');

    const preview = await clientEditor.previewRoomInvitation(invite.data.inviteToken!);
    expect(preview.data.roomName).toBe('Project Alpha');
    expect(preview.data.role).toBe('editor');

    const accepted = await clientEditor.acceptRoomInvitation({
      token: invite.data.inviteToken!,
    });
    expect(accepted.data.status).toBe('accepted');
    expect(accepted.data.room.actorRole).toBe('editor');

    // Replay by same acceptor is idempotent
    const replay = await clientEditor.acceptRoomInvitation({
      token: invite.data.inviteToken!,
    });
    expect(['already_accepted', 'already_member']).toContain(replay.data.status);

    // Outsider cannot reuse consumed invite
    await expect(
      clientOutsider.acceptRoomInvitation({ token: invite.data.inviteToken! })
    ).rejects.toThrow();

    // Personal workspace remains inaccessible to editor
    await expect(clientEditor.getWorkspace(personalOwnerId)).rejects.toThrow();

    // Direct member insert bypass blocked
    await expect(
      clientOwner.addMember(room.data.id, { userId: outsiderId, role: 'viewer' })
    ).rejects.toThrow(/invitation/i);
  });

  it('enforces role matrix, last-owner leave, and ownership transfer', async () => {
    const room = await clientOwner.createRoom({ name: 'Lifecycle Room' });
    const invite = await clientOwner.createRoomInvitation(room.data.id, { role: 'viewer' });
    await clientEditor.acceptRoomInvitation({ token: invite.data.inviteToken! });

    // Viewer cannot create invitations
    await expect(
      clientEditor.createRoomInvitation(room.data.id, { role: 'viewer' })
    ).rejects.toThrow();

    // Promote via transfer after first making editor an editor with a second invite path:
    // create another room where we transfer after accepting as editor
    const room2 = await clientOwner.createRoom({ name: 'Transfer Room' });
    const inv2 = await clientOwner.createRoomInvitation(room2.data.id, { role: 'editor' });
    await clientEditor.acceptRoomInvitation({ token: inv2.data.inviteToken! });

    const transferred = await clientOwner.transferRoomOwnership(room2.data.id, {
      newOwnerUserId: editorId,
    });
    expect(transferred.data.ownerId).toBe(editorId);

    // Previous owner is editor; can leave
    await clientOwner.leaveRoom(room2.data.id);

    // Last owner cannot leave
    await expect(clientEditor.leaveRoom(room2.data.id)).rejects.toThrow();
  });

  it('rejects journal/vault copy and copies a note with new identity', async () => {
    const room = await clientOwner.createRoom({ name: 'Copy Room' });

    // Seed a personal note
    const noteId = crypto.randomUUID();
    await withTenantContext(
      runtimePool,
      { userId: ownerId, workspaceId: personalOwnerId },
      async (client) => {
        await client.query(
          `INSERT INTO app.items (id, workspace_id, kind, created_by, updated_by, security_scope)
           VALUES ($1,$2,'note',$3,$3,'standard')`,
          [noteId, personalOwnerId, ownerId]
        );
        await client.query(
          `INSERT INTO app.notes (id, workspace_id, title, document, plain_text, word_count, char_count)
           VALUES ($1,$2,'Shared idea','{}'::jsonb,'Shared idea',2,12)`,
          [noteId, personalOwnerId]
        );
      }
    );

    const preview = await clientOwner.previewCopyPersonalItemToRoom({
      sourceWorkspaceId: personalOwnerId,
      sourceItemId: noteId,
      destinationRoomId: room.data.id,
    });
    expect(preview.data.blocked).toBe(false);
    expect(preview.data.ownershipExplanation).toMatch(/personal original/i);

    const copied = await clientOwner.copyPersonalItemToRoom({
      sourceWorkspaceId: personalOwnerId,
      sourceItemId: noteId,
      destinationRoomId: room.data.id,
    });
    expect(copied.data.sourcePreserved).toBe(true);
    expect(copied.data.destinationItemId).not.toBe(noteId);

    // Journal blocked
    const journalId = crypto.randomUUID();
    await withTenantContext(
      runtimePool,
      { userId: ownerId, workspaceId: personalOwnerId },
      async (client) => {
        await client.query(
          `INSERT INTO app.items (id, workspace_id, kind, created_by, updated_by, security_scope)
           VALUES ($1,$2,'journal_entry',$3,$3,'standard')`,
          [journalId, personalOwnerId, ownerId]
        );
      }
    );
    const journalPreview = await clientOwner.previewCopyPersonalItemToRoom({
      sourceWorkspaceId: personalOwnerId,
      sourceItemId: journalId,
      destinationRoomId: room.data.id,
    });
    expect(journalPreview.data.blocked).toBe(true);
  });

  it('rejects generic workspace room creation and concurrent last-owner demotion', async () => {
    await expect(clientOwner.createWorkspace({ name: 'Bypass', kind: 'room' })).rejects.toThrow(
      /POST \/v1\/rooms/i
    );

    const room = await clientOwner.createRoom({ name: 'Solo Owner' });
    await expect(
      clientOwner.updateRoomMemberRole(room.data.id, ownerId, { role: 'editor' })
    ).rejects.toThrow();
  });

  it('revokes invitations and rejects targeted recipient mismatch', async () => {
    const room = await clientOwner.createRoom({ name: 'Targeted' });
    const invite = await clientOwner.createRoomInvitation(room.data.id, {
      role: 'viewer',
      recipientUserId: editorId,
    });
    expect(invite.data.deliveryPolicy).toBe('targeted_recipient');

    await expect(
      clientOutsider.acceptRoomInvitation({ token: invite.data.inviteToken! })
    ).rejects.toThrow();

    await clientOwner.revokeRoomInvitation(room.data.id, invite.data.id);
    await expect(
      clientEditor.acceptRoomInvitation({ token: invite.data.inviteToken! })
    ).rejects.toThrow();
  });
});
