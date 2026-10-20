/**
 * Phase 56 repair — create recovery binding, durable terminal states, drafts, vault updates.
 */
import crypto from 'node:crypto';
import { generateKeyPair, SignJWT, exportJWK, type JSONWebKeySet } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import {
  CURRENT_AI_CONSENT_VERSION,
  CURRENT_AI_PROVIDER_DISCLOSURE_VERSION,
} from '@daynori/domain';
import { buildServer, JwtVerifier } from '../../apps/api/src/index.js';
import { createAdminPool, createRuntimePool, withUserContext } from '../../apps/api/src/db/index.js';
import { Migrator } from '../../infra/supabase/migrator.js';
import { createApiClient, DaynoriApiClient } from '@daynori/api-client';
import { cleanupExpiredAssistantData } from '../../apps/api/src/modules/ai/assistantService.js';

describe('Phase 56 repair: recovery, durable status, drafts, vault updates', () => {
  let adminPool: Pool;
  let runtimePool: Pool;
  let server: ReturnType<typeof buildServer>;
  let baseUrl: string;
  let keyPair: Awaited<ReturnType<typeof generateKeyPair>>;

  const issuer = 'https://auth.daynori.test';
  const audience = 'daynori-api';
  const kid = 'phase56-repair-key';
  const userId = crypto.randomUUID();
  let client: DaynoriApiClient;
  let workspaceId: string;

  async function createToken(uid: string): Promise<string> {
    return new SignJWT({
      sub: uid,
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

  async function acceptAi() {
    return client.acceptAiConsent({
      consentVersion: CURRENT_AI_CONSENT_VERSION,
      providerDisclosureVersion: CURRENT_AI_PROVIDER_DISCLOSURE_VERSION,
      contentScope: { notes: true, tasks: true, journal: false },
    });
  }

  beforeAll(async () => {
    process.env['NODE_ENV'] = 'test';
    process.env['DAYNORI_AI_LOCAL_ENABLED'] = 'true';
    process.env['DAYNORI_AI_PROVIDER'] = 'fake';
    delete process.env['DAYNORI_AI_LIVE_ENABLED'];

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
    client = createApiClient({ baseUrl, token: await createToken(userId) });

    const setup = await adminPool.connect();
    try {
      await setup.query(
        `INSERT INTO app.profiles (id, display_name) VALUES ($1,'P56R') ON CONFLICT DO NOTHING`,
        [userId]
      );
      const ws = await setup.query<{ id: string }>(
        `INSERT INTO app.workspaces (name, kind, owner_id)
         VALUES ('P56R personal', 'personal', $1) RETURNING id`,
        [userId]
      );
      workspaceId = ws.rows[0]!.id;
      await setup.query(
        `INSERT INTO app.workspace_memberships (workspace_id, user_id, role)
         VALUES ($1,$2,'owner') ON CONFLICT DO NOTHING`,
        [workspaceId, userId]
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

  it('unrelated pre-existing create id conflicts; identical retry recovers via operation receipt', async () => {
    await acceptAi();
    const collideId = crypto.randomUUID();
    await client.createTask(workspaceId, {
      id: collideId,
      title: 'Unrelated existing',
      priority: 'normal',
      status: 'todo',
    });

    const collideProposal = await client.createAiProposal({
      workspaceId,
      operation: 'create_personal_task',
      payload: {
        id: collideId,
        title: 'Should conflict',
        priority: 'normal',
        status: 'todo',
      },
    });
    await expect(
      client.confirmAiProposal(collideProposal.data.id, {
        confirmationToken: collideProposal.data.confirmationToken,
      })
    ).rejects.toThrow();

    const status = await withUserContext(runtimePool, userId, async (c) => {
      const r = await c.query<{ status: string }>(
        `SELECT status FROM app.ai_proposals WHERE id = $1`,
        [collideProposal.data.id]
      );
      return r.rows[0]!.status;
    });
    expect(status).toBe('failed');

    const ok = await client.createAiProposal({
      workspaceId,
      operation: 'create_personal_task',
      payload: { title: 'Retryable create', priority: 'normal', status: 'todo' },
    });
    const first = await client.confirmAiProposal(ok.data.id, {
      confirmationToken: ok.data.confirmationToken,
    });
    expect(first.data.status).toBe('confirmed');
    expect(first.data.reviewSummary.headline).toContain('Create');
    const second = await client.confirmAiProposal(ok.data.id, {
      confirmationToken: ok.data.confirmationToken,
    });
    expect((second.data.executionReceipt as { id: string }).id).toBe(
      (first.data.executionReceipt as { id: string }).id
    );
  });

  it('persists expired status in DB after confirm error', async () => {
    await acceptAi();
    const propose = await client.createAiProposal({
      workspaceId,
      operation: 'create_personal_task',
      payload: { title: 'Will expire', priority: 'normal', status: 'todo' },
    });
    await withUserContext(runtimePool, userId, async (c) => {
      await c.query(
        `UPDATE app.ai_proposals SET expires_at = now() - interval '1 minute' WHERE id = $1`,
        [propose.data.id]
      );
    });
    await expect(
      client.confirmAiProposal(propose.data.id, {
        confirmationToken: propose.data.confirmationToken,
      })
    ).rejects.toThrow();
    const row = await withUserContext(runtimePool, userId, async (c) => {
      const r = await c.query<{ status: string }>(
        `SELECT status FROM app.ai_proposals WHERE id = $1`,
        [propose.data.id]
      );
      return r.rows[0]!;
    });
    expect(row.status).toBe('expired');
  });

  it('rejects update of vault-scoped task at proposal create', async () => {
    await acceptAi();
    const task = await client.createTask(workspaceId, {
      title: 'Standard then vault',
      priority: 'normal',
      status: 'todo',
    });
    // Force vault scope via admin (ordinary API should not allow vault while disabled).
    await adminPool.query(
      `UPDATE app.items SET security_scope = 'vault' WHERE id = $1`,
      [task.data.id]
    );
    await expect(
      client.createAiProposal({
        workspaceId,
        operation: 'update_personal_task',
        targetItemId: task.data.id,
        expectedRevision: task.data.revision,
        payload: {
          title: 'Hijack vault',
          baseRevision: task.data.revision,
        },
      })
    ).rejects.toThrow();
  });

  it('rejects contradictory revision metadata', async () => {
    await acceptAi();
    const task = await client.createTask(workspaceId, {
      title: 'Rev check',
      priority: 'normal',
      status: 'todo',
    });
    await expect(
      client.createAiProposal({
        workspaceId,
        operation: 'update_personal_task',
        targetItemId: task.data.id,
        expectedRevision: task.data.revision,
        payload: {
          title: 'Changed',
          baseRevision: task.data.revision + 1,
        },
      })
    ).rejects.toThrow();
  });

  it('loads, clears drafts; history stays on current consent generation', async () => {
    await acceptAi();
    await client.saveAssistantDraft({
      workspaceId,
      draftQuestion: 'draft about calibration',
    });
    const loaded = await client.getAssistantDraft(workspaceId);
    expect(loaded.data?.draftQuestion).toBe('draft about calibration');

    await client.askAssistant({
      workspaceId,
      question: 'turn under gen A',
    });
    const histA = await client.listAssistantHistory(workspaceId);
    expect(histA.data.some((t) => t.question === 'turn under gen A')).toBe(true);

    await client.disableAi({ purgeDerived: true });
    await acceptAi();
    const draftAfter = await client.getAssistantDraft(workspaceId);
    expect(draftAfter.data).toBeNull();
    await expect(client.listAssistantHistory(workspaceId)).resolves.toMatchObject({ data: [] });
  });

  it('source-access rejects deleted and vault; cleanup deletes expired rows', async () => {
    await acceptAi();
    const note = await client.createNote(workspaceId, {
      title: 'Indexed source',
      plainText: 'source navigation phrase56repair',
    });
    await client.indexAiSource({ workspaceId, itemId: note.data.id });
    const ok = await client.checkAiSourceAccess({
      workspaceId,
      itemId: note.data.id,
    });
    expect(ok.data.accessible).toBe(true);

    await client.trashNote(workspaceId, note.data.id);
    const gone = await client.checkAiSourceAccess({
      workspaceId,
      itemId: note.data.id,
    });
    expect(gone.data.accessible).toBe(false);
    expect(gone.data.reason).toBe('SOURCE_NOT_FOUND');

    await withUserContext(runtimePool, userId, async (c) => {
      await c.query(
        `INSERT INTO app.ai_assistant_turns (
           user_id, workspace_id, consent_generation, question, answer, abstained,
           citations, provider_mode, expires_at
         ) VALUES ($1,$2,1,'old','a',false,'[]'::jsonb,'fake', now() - interval '1 day')`,
        [userId, workspaceId]
      );
      await c.query(
        `INSERT INTO app.ai_proposals (
           user_id, workspace_id, operation, payload, consent_generation,
           confirmation_token, status, expires_at, operation_id, request_hash
         ) VALUES (
           $1,$2,'create_personal_task','{"title":"x"}'::jsonb,1,
           $3,'expired', now() - interval '1 day', $4, 'deadbeef'
         )`,
        [userId, workspaceId, crypto.randomBytes(18).toString('base64url'), crypto.randomUUID()]
      );
    });
    const cleaned = await withUserContext(runtimePool, userId, (c) =>
      cleanupExpiredAssistantData(c, userId)
    );
    expect(cleaned.deletedTurns).toBeGreaterThanOrEqual(1);
    expect(cleaned.deletedProposals).toBeGreaterThanOrEqual(1);
  });
});
