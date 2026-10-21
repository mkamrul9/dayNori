/**
 * Phase 58 — Controlled fault scenarios (local synthetic).
 * Kill switches must not mark unsuccessful work completed.
 */
import crypto from 'node:crypto';
import { generateKeyPair, SignJWT, exportJWK, type JSONWebKeySet } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { buildServer, JwtVerifier } from '../../apps/api/src/index.js';
import { createAdminPool, createRuntimePool } from '../../apps/api/src/db/index.js';
import { Migrator } from '../../infra/supabase/migrator.js';
import { createApiClient } from '@daynori/api-client';
import { DaynoriWorker } from '../../apps/worker/src/worker.js';
import {
  MemoryStorageProvider,
  setDefaultStorageProvider,
} from '../../apps/api/src/modules/files/storageAdapter.js';

describe('Phase 58: fault injection and kill switches', () => {
  let adminPool: Pool;
  let runtimePool: Pool;
  let server: ReturnType<typeof buildServer>;
  let baseUrl: string;
  let keyPair: Awaited<ReturnType<typeof generateKeyPair>>;
  const issuer = 'https://auth.daynori.test';
  const audience = 'daynori-api';
  const kid = 'phase58-fault-key';
  let userId = '';
  let workspaceId = '';
  let token = '';

  beforeAll(async () => {
    process.env['NODE_ENV'] = 'test';
    adminPool = createAdminPool();
    runtimePool = createRuntimePool();
    await new Migrator().migrate();
    setDefaultStorageProvider(new MemoryStorageProvider());

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

    userId = crypto.randomUUID();
    const admin = await adminPool.connect();
    try {
      await admin.query(`INSERT INTO app.profiles (id, display_name) VALUES ($1,'F')`, [userId]);
    } finally {
      admin.release();
    }
    token = await new SignJWT({
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
    const client = createApiClient({ baseUrl, token });
    workspaceId = (await client.provisionPersonalWorkspace()).data.workspace.id;
  }, 120_000);

  afterAll(async () => {
    if (server) await server.close();
    if (runtimePool) await runtimePool.end();
    if (adminPool) await adminPool.end();
  });

  it('recovers worker lease after stop mid-flight (duplicate safe)', async () => {
    const jobId = crypto.randomUUID();
    const admin = await adminPool.connect();
    try {
      // Isolate: do not let unrelated pending jobs steal the poll slot.
      await admin.query(
        `UPDATE app.background_jobs SET status = 'dead_letter', last_error = 'phase58-fault-isolate'
         WHERE status IN ('pending', 'running')`
      );
      await admin.query(
        `INSERT INTO app.background_jobs (id, task_type, payload, run_at, status, attempts)
         VALUES ($1, 'noop_probe', '{"probe":true}'::jsonb, now(), 'pending', 0)`,
        [jobId]
      );
    } finally {
      admin.release();
    }

    const workerA = new DaynoriWorker(adminPool, { workerId: 'fault-a' });
    workerA.registerHandler('noop_probe', async () => {
      throw new Error('simulated crash before completion');
    });
    workerA.start(adminPool);
    const failResult = await workerA.pollAndProcessNextJob(adminPool);
    expect(failResult?.status).toBe('failed');
    workerA.stop();

    const workerB = new DaynoriWorker(adminPool, { workerId: 'fault-b' });
    let completions = 0;
    workerB.registerHandler('noop_probe', async () => {
      completions += 1;
      return { details: { recovered: true } };
    });
    workerB.start(adminPool);
    // Backoff may delay run_at; force immediate retry for the drill.
    await adminPool.query(`UPDATE app.background_jobs SET run_at = now() WHERE id = $1`, [jobId]);
    const okResult = await workerB.pollAndProcessNextJob(adminPool);
    expect(okResult?.status).toBe('completed');
    workerB.stop();

    const row = await adminPool.query<{ status: string; attempts: number }>(
      `SELECT status, attempts FROM app.background_jobs WHERE id = $1`,
      [jobId]
    );
    expect(row.rows[0]?.status).toBe('completed');
    expect(row.rows[0]!.attempts).toBeGreaterThanOrEqual(2);
    expect(completions).toBe(1);
  });

  it('feature kill switch keeps disabled modules unavailable (not successful)', async () => {
    const client = createApiClient({ baseUrl, token });
    // Vault is always fail-closed (403 is not success).
    const vaultRes = await fetch(`${baseUrl}/v1/vault/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(vaultRes.status).toBe(403);

    // NODE_ENV=test fail-opens rooms/AI/billing for harnesses. Exercise the real
    // development kill switch: flags unset ⇒ 403, never a successful module response.
    const prevNodeEnv = process.env['NODE_ENV'];
    process.env['NODE_ENV'] = 'development';
    delete process.env['DAYNORI_ROOMS_LOCAL_ENABLED'];
    delete process.env['DAYNORI_AI_LOCAL_ENABLED'];
    delete process.env['DAYNORI_BILLING_LOCAL_ENABLED'];

    const publicJwk = await exportJWK(keyPair.publicKey);
    publicJwk.kid = kid;
    publicJwk.alg = 'RS256';
    publicJwk.use = 'sig';
    const gated = buildServer({
      jwtVerifier: new JwtVerifier({
        issuer,
        audience,
        localJwks: { keys: [publicJwk] },
      }),
      runtimePool,
      rateLimitOptions: { windowMs: 60000, maxRequests: 50000 },
      enableChatPublicationRecovery: false,
    });
    await gated.listen({ port: 0, host: '127.0.0.1' });
    const gatedAddr = gated.server.address();
    if (!gatedAddr || typeof gatedAddr === 'string') throw new Error('no gated address');
    const gatedUrl = `http://127.0.0.1:${gatedAddr.port}`;
    try {
      const auth = { Authorization: `Bearer ${token}` };
      expect((await fetch(`${gatedUrl}/v1/rooms`, { headers: auth })).status).toBe(403);
      expect((await fetch(`${gatedUrl}/v1/ai/consent`, { headers: auth })).status).toBe(403);
      expect((await fetch(`${gatedUrl}/v1/billing/catalog`, { headers: auth })).status).toBe(403);
      expect((await fetch(`${gatedUrl}/v1/vault/status`, { headers: auth })).status).toBe(403);
    } finally {
      await gated.close();
      process.env['NODE_ENV'] = prevNodeEnv;
    }

    const note = await client.createNote(workspaceId, {
      title: 'core-ok',
      plainText: 'organizer remains usable',
    });
    expect(note.data.id).toBeTruthy();
  });

  it('creates distinct notes when client does not supply idempotency key', async () => {
    const client = createApiClient({ baseUrl, token });
    const a = await client.createNote(workspaceId, { title: 'a', plainText: 'one' });
    const b = await client.createNote(workspaceId, { title: 'b', plainText: 'two' });
    expect(a.data.id).not.toBe(b.data.id);
  });
});
