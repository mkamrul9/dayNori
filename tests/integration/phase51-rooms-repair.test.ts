/**
 * Phase 51 repair — legacy quarantine by inventory, concurrent ownership,
 * invitation binding, and copy payload boundaries.
 */
import crypto from 'node:crypto';
import { generateKeyPair, SignJWT, exportJWK, type JSONWebKeySet } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool, PoolClient } from 'pg';
import { buildServer, JwtVerifier } from '../../apps/api/src/index.js';
import { createAdminPool, createRuntimePool, withTenantContext } from '../../apps/api/src/db/index.js';
import { Migrator } from '../../infra/supabase/migrator.js';
import { createApiClient, DaynoriApiClient } from '@daynori/api-client';

describe('Phase 51 repair: quarantine, ownership concurrency, copy boundaries', () => {
  let adminPool: Pool;
  let runtimePool: Pool;
  let server: ReturnType<typeof buildServer>;
  let baseUrl: string;
  let keyPair: Awaited<ReturnType<typeof generateKeyPair>>;

  const issuer = 'https://auth.daynori.test';
  const audience = 'daynori-api';
  const kid = 'phase51-repair-key';

  const ownerId = crypto.randomUUID();
  const editorId = crypto.randomUUID();
  const outsiderId = crypto.randomUUID();
  let clientOwner: DaynoriApiClient;
  let clientEditor: DaynoriApiClient;
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

  afterAll(async () => {
    if (server) await server.close();
    if (runtimePool) await runtimePool.end();
    if (adminPool) await adminPool.end();
  });

  it('quarantines legacy rooms by inventory even after rename', async () => {
    const admin = await adminPool.connect();
    let legacyId = '';
    try {
      const ws = await admin.query<{ id: string }>(
        `INSERT INTO app.workspaces (name, kind, owner_id, status)
         VALUES ('Secret Legacy (Legacy Room)', 'room', $1, 'active') RETURNING id`,
        [ownerId]
      );
      legacyId = ws.rows[0]!.id;
      await admin.query(
        `INSERT INTO app.workspace_memberships (workspace_id, user_id, role) VALUES ($1,$2,'owner')`,
        [legacyId, ownerId]
      );
      await admin.query(
        `INSERT INTO app.legacy_workspace_reconciliation_inventory (
           workspace_id, owner_id, original_kind, current_kind, status, reconciliation_notes
         ) VALUES ($1,$2,'personal','room','quarantined_pending_review','test quarantine')`,
        [legacyId, ownerId]
      );

      const before = await admin.query<{ ok: boolean }>(
        `SELECT app.is_confirmed_shareable_room($1) AS ok`,
        [legacyId]
      );
      expect(before.rows[0]?.ok).toBe(false);

      await admin.query(`UPDATE app.workspaces SET name = 'Renamed Friendly' WHERE id = $1`, [
        legacyId,
      ]);

      const afterRename = await admin.query<{ ok: boolean }>(
        `SELECT app.is_confirmed_shareable_room($1) AS ok`,
        [legacyId]
      );
      expect(afterRename.rows[0]?.ok).toBe(false);

      await expect(
        clientOwner.createRoomInvitation(legacyId, { role: 'viewer' })
      ).rejects.toThrow();

      await admin.query(
        `SELECT app.reconcile_legacy_workspace($1, 'confirm_room', $2, 'operator confirmed')`,
        [legacyId, ownerId]
      );

      const afterConfirm = await admin.query<{ ok: boolean }>(
        `SELECT app.is_confirmed_shareable_room($1) AS ok`,
        [legacyId]
      );
      expect(afterConfirm.rows[0]?.ok).toBe(true);

      const invite = await clientOwner.createRoomInvitation(legacyId, { role: 'viewer' });
      expect(invite.data.inviteToken).toBeTruthy();
      const accepted = await clientEditor.acceptRoomInvitation({
        token: invite.data.inviteToken!,
      });
      expect(accepted.data.status).toBe('accepted');
    } finally {
      admin.release();
    }
  });

  it(
    'rejects concurrent last-owner demotion on independent connections with overlap',
    async () => {
      const room = await clientOwner.createRoom({ name: 'Concurrent Solo' });
      const roomId = room.data.id;

      const c1 = await adminPool.connect();
      const c2 = await adminPool.connect();
      try {
        // Lock order: both take workspace FOR UPDATE first (same as the trigger),
        // then demote — avoids membership-row vs workspace deadlock.
        await c1.query('BEGIN');
        await c1.query(`SELECT id FROM app.workspaces WHERE id = $1 FOR UPDATE`, [roomId]);

        await c2.query('BEGIN');
        await c2.query(`SET LOCAL lock_timeout = '1500ms'`);

        const c2LockAndDemote = (async () => {
          await c2.query(`SELECT id FROM app.workspaces WHERE id = $1 FOR UPDATE`, [roomId]);
          await c2.query(
            `UPDATE app.workspace_memberships SET role = 'editor'
             WHERE workspace_id = $1 AND user_id = $2`,
            [roomId, ownerId]
          );
        })();

        await new Promise((r) => setTimeout(r, 80));

        let c1Error: string | null = null;
        try {
          await c1.query(
            `UPDATE app.workspace_memberships SET role = 'editor'
             WHERE workspace_id = $1 AND user_id = $2`,
            [roomId, ownerId]
          );
        } catch (err) {
          c1Error = err instanceof Error ? err.message : String(err);
        }
        await c1.query('ROLLBACK');

        let c2Error: string | null = null;
        try {
          await c2LockAndDemote;
        } catch (err) {
          c2Error = err instanceof Error ? err.message : String(err);
        }
        try {
          await c2.query('ROLLBACK');
        } catch {
          /* already aborted */
        }

        // Verify on c1 before release — adminPool may be saturated by the two held clients.
        const stillOwner = await c1.query<{ role: string; owner_id: string }>(
          `SELECT m.role, w.owner_id
           FROM app.workspace_memberships m
           JOIN app.workspaces w ON w.id = m.workspace_id
           WHERE m.workspace_id = $1 AND m.user_id = $2`,
          [roomId, ownerId]
        );
        expect(stillOwner.rows[0]?.role).toBe('owner');
        expect(stillOwner.rows[0]?.owner_id).toBe(ownerId);
        expect(`${c1Error ?? ''}\n${c2Error ?? ''}`).toMatch(/ROOM_LAST_OWNER/);
      } finally {
        c1.release();
        c2.release();
      }
    },
    20_000
  );

  it('rejects concurrent API leave and demote for the sole owner', async () => {
    const room = await clientOwner.createRoom({ name: 'API Concurrent Solo' });
    const results = await Promise.allSettled([
      clientOwner.leaveRoom(room.data.id),
      clientOwner.updateRoomMemberRole(room.data.id, ownerId, { role: 'editor' }),
    ]);
    expect(results.every((r) => r.status === 'rejected')).toBe(true);
    const still = await adminPool.query<{ role: string; owner_id: string }>(
      `SELECT m.role, w.owner_id FROM app.workspace_memberships m
       JOIN app.workspaces w ON w.id = m.workspace_id
       WHERE m.workspace_id = $1 AND m.user_id = $2`,
      [room.data.id, ownerId]
    );
    expect(still.rows[0]?.role).toBe('owner');
    expect(still.rows[0]?.owner_id).toBe(ownerId);
  });

  it('handles transfer racing with member removal on independent connections', async () => {
    const room = await clientOwner.createRoom({ name: 'Transfer Race' });
    const inv = await clientOwner.createRoomInvitation(room.data.id, { role: 'editor' });
    await clientEditor.acceptRoomInvitation({ token: inv.data.inviteToken! });

    const transferred = await clientOwner.transferRoomOwnership(room.data.id, {
      newOwnerUserId: editorId,
    });
    expect(transferred.data.ownerId).toBe(editorId);

    // Concurrent remove of previous owner (now editor) vs leave — both should be safe.
    const results = await Promise.allSettled([
      clientEditor.removeRoomMember(room.data.id, ownerId),
      clientOwner.leaveRoom(room.data.id),
    ]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled').length;
    expect(fulfilled).toBeGreaterThanOrEqual(1);

    const memberships = await adminPool.query(
      `SELECT user_id, role FROM app.workspace_memberships WHERE workspace_id = $1`,
      [room.data.id]
    );
    const ownerRow = memberships.rows.find((r) => r.role === 'owner');
    expect(ownerRow?.user_id).toBe(editorId);
    const ws = await adminPool.query<{ owner_id: string }>(
      `SELECT owner_id FROM app.workspaces WHERE id = $1`,
      [room.data.id]
    );
    expect(ws.rows[0]?.owner_id).toBe(editorId);
  });

  it('copies note payload text and rejects private embedded references', async () => {
    const room = await clientOwner.createRoom({ name: 'Copy Payload' });
    const noteId = crypto.randomUUID();
    const otherId = crypto.randomUUID();

    await withTenantContext(
      runtimePool,
      { userId: ownerId, workspaceId: personalOwnerId },
      async (client: PoolClient) => {
        await client.query(
          `INSERT INTO app.items (id, workspace_id, kind, created_by, updated_by, security_scope)
           VALUES ($1,$2,'note',$3,$3,'standard'), ($4,$2,'note',$3,$3,'standard')`,
          [noteId, personalOwnerId, ownerId, otherId]
        );
        await client.query(
          `INSERT INTO app.notes (id, workspace_id, title, document, plain_text, word_count, char_count)
           VALUES ($1,$2,'Shared idea','{"body":"Shared idea"}'::jsonb,'Shared idea',2,12)`,
          [noteId, personalOwnerId]
        );
        await client.query(
          `INSERT INTO app.notes (id, workspace_id, title, document, plain_text, word_count, char_count)
           VALUES ($1,$2,'Other','{}'::jsonb,'Other',1,5)`,
          [otherId, personalOwnerId]
        );
      }
    );

    const copied = await clientOwner.copyPersonalItemToRoom({
      sourceWorkspaceId: personalOwnerId,
      sourceItemId: noteId,
      destinationRoomId: room.data.id,
    });
    expect(copied.data.sourcePreserved).toBe(true);

    const dest = await withTenantContext(
      runtimePool,
      { userId: ownerId, workspaceId: room.data.id },
      async (client) => {
        const res = await client.query<{ title: string; plain_text: string }>(
          `SELECT title, plain_text FROM app.notes WHERE id = $1 AND workspace_id = $2`,
          [copied.data.destinationItemId, room.data.id]
        );
        return res.rows[0];
      }
    );
    expect(dest?.title).toBe('Shared idea');
    expect(dest?.plain_text).toBe('Shared idea');

    // Note with embedded private UUID reference must be rejected.
    const linkedId = crypto.randomUUID();
    await withTenantContext(
      runtimePool,
      { userId: ownerId, workspaceId: personalOwnerId },
      async (client) => {
        await client.query(
          `INSERT INTO app.items (id, workspace_id, kind, created_by, updated_by, security_scope)
           VALUES ($1,$2,'note',$3,$3,'standard')`,
          [linkedId, personalOwnerId, ownerId]
        );
        await client.query(
          `INSERT INTO app.notes (id, workspace_id, title, document, plain_text, word_count, char_count)
           VALUES ($1,$2,'Linked', $3::jsonb, $4, 1, 6)`,
          [
            linkedId,
            personalOwnerId,
            JSON.stringify({ seeAlso: otherId }),
            `see ${otherId}`,
          ]
        );
      }
    );

    await expect(
      clientOwner.copyPersonalItemToRoom({
        sourceWorkspaceId: personalOwnerId,
        sourceItemId: linkedId,
        destinationRoomId: room.data.id,
      })
    ).rejects.toThrow(/private|reference|embed/i);
  });

  it('does not enable production rooms via local flag alone or when flag is present', async () => {
    const prev = process.env['NODE_ENV'];
    const prevFlag = process.env['DAYNORI_ROOMS_LOCAL_ENABLED'];
    try {
      const { assertRoomsLocallyEnabled } = await import(
        '../../apps/api/src/modules/rooms/service.js'
      );
      const { isRoomsLocallyEnabled } = await import('@daynori/domain');

      process.env['NODE_ENV'] = 'production';
      delete process.env['DAYNORI_ROOMS_LOCAL_ENABLED'];
      expect(isRoomsLocallyEnabled(process.env)).toBe(false);
      expect(() => assertRoomsLocallyEnabled()).toThrow(/disabled|ROOMS_DISABLED/i);

      process.env['DAYNORI_ROOMS_LOCAL_ENABLED'] = 'true';
      expect(isRoomsLocallyEnabled(process.env)).toBe(false);
      expect(() => assertRoomsLocallyEnabled()).toThrow(/disabled|ROOMS_DISABLED|Production/i);
    } finally {
      process.env['NODE_ENV'] = prev;
      if (prevFlag !== undefined) process.env['DAYNORI_ROOMS_LOCAL_ENABLED'] = prevFlag;
      else process.env['DAYNORI_ROOMS_LOCAL_ENABLED'] = 'true';
    }
  });
});
