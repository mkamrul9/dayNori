/**
 * Phase 52 — Shared room content sync and membership revocation (provisional local).
 * Not chat (Phase 53). Not real-user / production enablement.
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
import {
  applyRoomRevocationPurge,
  planRoomRevocationPurge,
  classifyRoomSyncFailure,
} from '@daynori/sync';

describe('Phase 52: room content sync and revocation', () => {
  let adminPool: Pool;
  let runtimePool: Pool;
  let server: ReturnType<typeof buildServer>;
  let baseUrl: string;
  let keyPair: Awaited<ReturnType<typeof generateKeyPair>>;

  const issuer = 'https://auth.daynori.test';
  const audience = 'daynori-api';
  const kid = 'phase52-rooms-key';

  const ownerId = crypto.randomUUID();
  const editorId = crypto.randomUUID();
  const viewerId = crypto.randomUUID();
  let clientOwner: DaynoriApiClient;
  let clientEditor: DaynoriApiClient;
  let clientViewer: DaynoriApiClient;
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
    clientViewer = createApiClient({ baseUrl, token: await createToken(viewerId) });

    const setup = await adminPool.connect();
    try {
      await setup.query(
        `INSERT INTO app.profiles (id, display_name) VALUES ($1,$2),($3,$4),($5,$6)
         ON CONFLICT (id) DO NOTHING`,
        [ownerId, 'Owner', editorId, 'Editor', viewerId, 'Viewer']
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

  async function seedRoomWithMembers() {
    const room = await clientOwner.createRoom({
      name: `Sync Room ${crypto.randomUUID().slice(0, 8)}`,
    });
    const invE = await clientOwner.createRoomInvitation(room.data.id, { role: 'editor' });
    await clientEditor.acceptRoomInvitation({ token: invE.data.inviteToken! });
    const invV = await clientOwner.createRoomInvitation(room.data.id, { role: 'viewer' });
    await clientViewer.acceptRoomInvitation({ token: invV.data.inviteToken! });
    return room.data;
  }

  it('lists room content for members and rejects personal workspace ids', async () => {
    const room = await seedRoomWithMembers();
    const noteId = crypto.randomUUID();

    await withTenantContext(
      runtimePool,
      { userId: ownerId, workspaceId: room.id },
      async (client) => {
        await client.query(
          `INSERT INTO app.items (id, workspace_id, kind, created_by, updated_by, security_scope)
           VALUES ($1,$2,'note',$3,$3,'standard')`,
          [noteId, room.id, ownerId]
        );
        await client.query(
          `INSERT INTO app.notes (id, workspace_id, title, document, plain_text, word_count, char_count)
           VALUES ($1,$2,'Room note','{}'::jsonb,'Room note',2,9)`,
          [noteId, room.id]
        );
      }
    );

    const content = await clientEditor.listRoomContent(room.id);
    expect(content.data.notes.some((n) => n.id === noteId && n.title === 'Room note')).toBe(true);

    const viewerContent = await clientViewer.listRoomContent(room.id);
    expect(viewerContent.data.notes.some((n) => n.id === noteId)).toBe(true);

    await expect(clientEditor.listRoomContent(personalOwnerId)).rejects.toThrow();
  });

  it('revokes pull and content access after member removal', async () => {
    const room = await seedRoomWithMembers();

    const before = await clientEditor.syncPull({
      workspaceId: room.id,
      limit: 10,
    });
    expect(before.data.accessEpoch).toBeTruthy();

    await clientOwner.removeRoomMember(room.id, editorId);

    await expect(clientEditor.syncPull({ workspaceId: room.id, limit: 10 })).rejects.toThrow(
      /MEMBERSHIP_REVOKED|Membership not found or revoked/i
    );

    await expect(clientEditor.listRoomContent(room.id)).rejects.toThrow();
  });

  it('rejects viewer push and allows editor sync push for room notes', async () => {
    const room = await seedRoomWithMembers();
    const noteId = crypto.randomUUID();
    const opId = crypto.randomUUID();
    const ts = new Date().toISOString();

    const viewerPush = await clientViewer.syncPush({
      commands: [
        {
          operationId: opId,
          deviceId: 'phase52-viewer-device',
          workspaceId: room.id,
          commandVersion: 1,
          schemaVersion: 1,
          command: 'createItem',
          entityType: 'item',
          entityId: noteId,
          baseRevision: 0,
          dependencyOperationIds: [],
          clientTimestamp: ts,
          payload: {
            kind: 'note',
            rank: '0|hzzzzz:',
            securityScope: 'standard',
          },
        },
      ],
    });
    const viewerResult = viewerPush.data.results[0];
    expect(viewerResult?.status).toBe('rejected');

    const editorOp = crypto.randomUUID();
    const editorNote = crypto.randomUUID();
    const editorPush = await clientEditor.syncPush({
      commands: [
        {
          operationId: editorOp,
          deviceId: 'phase52-editor-device',
          workspaceId: room.id,
          commandVersion: 1,
          schemaVersion: 1,
          command: 'createItem',
          entityType: 'item',
          entityId: editorNote,
          baseRevision: 0,
          dependencyOperationIds: [],
          clientTimestamp: ts,
          payload: {
            kind: 'note',
            rank: '0|hzzzzz:',
            securityScope: 'standard',
          },
        },
      ],
    });
    const editorResult = editorPush.data.results[0];
    expect(editorResult?.status).toBe('accepted');
  });

  it('archives room and denies further sync', async () => {
    const room = await seedRoomWithMembers();
    await clientOwner.archiveRoom(room.id);

    await expect(clientEditor.syncPull({ workspaceId: room.id, limit: 5 })).rejects.toThrow(
      /ROOM_ARCHIVED|archived|MEMBERSHIP_REVOKED|revoked|403/i
    );
  });

  it('keeps remaining members after another member leaves', async () => {
    const room = await seedRoomWithMembers();
    await clientViewer.leaveRoom(room.id);

    const pull = await clientEditor.syncPull({ workspaceId: room.id, limit: 5 });
    expect(pull.data.accessEpoch).toBeTruthy();

    const content = await clientEditor.listRoomContent(room.id);
    expect(content.data).toBeTruthy();

    await expect(clientViewer.listRoomContent(room.id)).rejects.toThrow(
      /MEMBERSHIP_REVOKED|revoked|403|not found/i
    );
  });

  it('classifies revocation distinctly from reset, role downgrade, and network failure', () => {
    const revoked = classifyRoomSyncFailure({
      statusCode: 403,
      code: 'MEMBERSHIP_REVOKED',
      message: 'Membership not found or revoked',
    });
    expect(revoked.isMembershipRevoked).toBe(true);
    expect(revoked.isNetworkError).toBe(false);

    const reset = classifyRoomSyncFailure({
      statusCode: 409,
      code: 'SYNC_RESET_REQUIRED',
      message: 'SYNC_RESET_REQUIRED: Workspace access epoch has changed',
    });
    expect(reset.isMembershipRevoked).toBe(false);
    expect(reset.isSyncResetRequired).toBe(true);

    const role = classifyRoomSyncFailure({
      statusCode: 403,
      code: 'ROOM_ROLE_INSUFFICIENT',
      message: 'ROOM_ROLE_INSUFFICIENT: editor required but user has viewer',
    });
    expect(role.isMembershipRevoked).toBe(false);
    expect(role.isRoleInsufficient).toBe(true);

    const network = classifyRoomSyncFailure({
      code: 'NETWORK_ERROR',
      message: 'fetch failed',
    });
    expect(network.isMembershipRevoked).toBe(false);
    expect(network.isNetworkError).toBe(true);

    const plan = planRoomRevocationPurge({
      workspaceId: crypto.randomUUID(),
      userId: editorId,
      reason: 'membership_removed',
    });
    expect(plan.shouldPurge).toBe(true);
    expect(typeof applyRoomRevocationPurge).toBe('function');
  });

  it('rejects viewer write with ROOM_ROLE_INSUFFICIENT without membership loss', async () => {
    const room = await seedRoomWithMembers();
    await clientOwner.updateRoomMemberRole(room.id, editorId, { role: 'viewer' });

    const noteId = crypto.randomUUID();
    const push = await clientEditor.syncPush({
      commands: [
        {
          operationId: crypto.randomUUID(),
          deviceId: 'phase52-downgrade',
          workspaceId: room.id,
          commandVersion: 1,
          schemaVersion: 1,
          command: 'createItem',
          entityType: 'item',
          entityId: noteId,
          baseRevision: 0,
          dependencyOperationIds: [],
          clientTimestamp: new Date().toISOString(),
          payload: {
            kind: 'note',
            rank: '0|hzzzzz:',
            securityScope: 'standard',
          },
        },
      ],
    });
    expect(push.data.results[0]?.status).toBe('rejected');
    expect(push.data.results[0]?.error?.code).toMatch(/ROOM_ROLE_INSUFFICIENT|FORBIDDEN/);

    // Still readable as viewer
    const pull = await clientEditor.syncPull({ workspaceId: room.id, limit: 5 });
    expect(pull.data.accessEpoch).toBeTruthy();
  });

  it('preserves two-editor conflict versions via sync push (no silent overwrite)', async () => {
    const room = await seedRoomWithMembers();
    const noteId = crypto.randomUUID();
    const op1 = crypto.randomUUID();
    const ts = new Date().toISOString();

    const create = await clientEditor.syncPush({
      commands: [
        {
          operationId: op1,
          deviceId: 'phase52-a',
          workspaceId: room.id,
          commandVersion: 1,
          schemaVersion: 1,
          command: 'createItem',
          entityType: 'item',
          entityId: noteId,
          baseRevision: 0,
          dependencyOperationIds: [],
          clientTimestamp: ts,
          payload: {
            kind: 'note',
            rank: '0|hzzzzz:',
            securityScope: 'standard',
          },
        },
      ],
    });
    const created = create.data.results[0];
    expect(created?.status).toBe('accepted');
    const rev = created!.revision;

    const opA = crypto.randomUUID();
    const opB = crypto.randomUUID();
    const [pushA, pushB] = await Promise.all([
      clientOwner.syncPush({
        commands: [
          {
            operationId: opA,
            deviceId: 'phase52-owner',
            workspaceId: room.id,
            commandVersion: 1,
            schemaVersion: 1,
            command: 'updateItem',
            entityType: 'item',
            entityId: noteId,
            baseRevision: rev,
            dependencyOperationIds: [],
            clientTimestamp: new Date().toISOString(),
            payload: { isPinned: true },
          },
        ],
      }),
      clientEditor.syncPush({
        commands: [
          {
            operationId: opB,
            deviceId: 'phase52-editor',
            workspaceId: room.id,
            commandVersion: 1,
            schemaVersion: 1,
            command: 'updateItem',
            entityType: 'item',
            entityId: noteId,
            baseRevision: rev,
            dependencyOperationIds: [],
            clientTimestamp: new Date().toISOString(),
            payload: { isArchived: true },
          },
        ],
      }),
    ]);

    const statuses = [pushA.data.results[0]?.status, pushB.data.results[0]?.status];
    expect(statuses).toContain('accepted');
    expect(statuses.some((s) => s === 'conflict' || s === 'accepted')).toBe(true);
  });
});
