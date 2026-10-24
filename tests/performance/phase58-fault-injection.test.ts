/**
 * Phase 58 repair — Controlled fault scenarios (local synthetic).
 * Does NOT mutate unrelated background jobs. Kill switches must not mark work completed.
 */
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';
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
  /** Unrelated queued work that must survive every test. */
  let sentinelJobId = '';

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
    sentinelJobId = crypto.randomUUID();
    const admin = await adminPool.connect();
    try {
      await admin.query(`INSERT INTO app.profiles (id, display_name) VALUES ($1,'F')`, [userId]);
      // Sentinel: pending far in the future so scoped probes can run without global dead-lettering.
      await admin.query(
        `INSERT INTO app.background_jobs (id, task_type, payload, run_at, status, attempts)
         VALUES ($1, 'phase58_sentinel', '{"survive":true}'::jsonb, now() + interval '7 days', 'pending', 0)`,
        [sentinelJobId]
      );
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

  async function assertSentinelIntact(): Promise<void> {
    const row = await adminPool.query<{ status: string; attempts: number }>(
      `SELECT status, attempts FROM app.background_jobs WHERE id = $1`,
      [sentinelJobId]
    );
    expect(row.rows[0]?.status).toBe('pending');
    expect(row.rows[0]?.attempts).toBe(0);
  }

  it('handler failure retries without touching unrelated queued work', async () => {
    const jobId = crypto.randomUUID();
    const taskType = `phase58_handler_fail_${jobId.slice(0, 8)}`;
    // Scoped cleanup of prior probe leftovers only (never global pending/running).
    await adminPool.query(
      `DELETE FROM app.background_jobs WHERE task_type LIKE 'phase58_handler_fail_%' AND id <> $1`,
      [sentinelJobId]
    );
    await adminPool.query(
      `INSERT INTO app.background_jobs (id, task_type, payload, run_at, status, attempts, max_attempts)
       VALUES ($1, $2, '{"probe":true}'::jsonb, now(), 'pending', 0, 5)`,
      [jobId, taskType]
    );

    const workerA = new DaynoriWorker(adminPool, { workerId: 'fault-handler-a' });
    workerA.registerHandler(taskType, async () => {
      throw new Error('simulated handler failure');
    });
    workerA.start(adminPool);
    const failResult = await workerA.pollAndProcessNextJob(adminPool, {
      taskTypes: [taskType],
    });
    expect(failResult?.status).toBe('failed');
    expect(failResult?.jobId).toBe(jobId);
    workerA.stop();

    await adminPool.query(`UPDATE app.background_jobs SET run_at = now() WHERE id = $1`, [jobId]);

    const workerB = new DaynoriWorker(adminPool, { workerId: 'fault-handler-b' });
    workerB.registerHandler(taskType, async () => ({
      details: { recovered: true },
    }));
    workerB.start(adminPool);
    const okResult = await workerB.pollAndProcessNextJob(adminPool, {
      taskTypes: [taskType],
    });
    expect(okResult?.status).toBe('completed');
    expect(okResult?.jobId).toBe(jobId);
    workerB.stop();

    const row = await adminPool.query<{ status: string; attempts: number }>(
      `SELECT status, attempts FROM app.background_jobs WHERE id = $1`,
      [jobId]
    );
    expect(row.rows[0]?.status).toBe('completed');
    expect(row.rows[0]!.attempts).toBeGreaterThanOrEqual(2);
    await assertSentinelIntact();
  });

  it('reclaims after worker-process interruption and lease expiry with durable effect', async () => {
    const jobId = crypto.randomUUID();
    const taskType = `phase58_lease_reclaim_${jobId.slice(0, 8)}`;
    const marker = `phase58-durable-${jobId}`;
    await adminPool.query(
      `DELETE FROM app.background_jobs WHERE task_type LIKE 'phase58_lease_reclaim_%' AND id <> $1`,
      [sentinelJobId]
    );
    await adminPool.query(
      `INSERT INTO app.background_jobs (id, task_type, payload, run_at, status, attempts, max_attempts)
       VALUES ($1, $2, $3::jsonb, now(), 'pending', 0, 5)`,
      [jobId, taskType, JSON.stringify({ marker, workspaceId, userId })]
    );

    // Genuine process interruption: child claims the lease then exits without completing.
    const claimScript = `
      import pg from 'pg';
      import fs from 'node:fs';
      import path from 'node:path';
      try {
        const envPath = path.resolve(process.cwd(), '.env');
        if (typeof process.loadEnvFile === 'function' && fs.existsSync(envPath)) process.loadEnvFile(envPath);
      } catch {}
      const c = new pg.Client({
        host: process.env.PGHOST || '127.0.0.1',
        port: Number(process.env.PGPORT || 5432),
        database: process.env.PGDATABASE || 'daynori_test',
        user: process.env.PGUSER || 'postgres',
        password: process.env.PGPASSWORD || '',
      });
      await c.connect();
      const r = await c.query(
        \`UPDATE app.background_jobs
         SET status = 'running', leased_by = 'interrupted-child', leased_until = now() + interval '60 seconds',
             attempts = attempts + 1, updated_at = now()
         WHERE id = $1 AND status = 'pending'
         RETURNING id\`,
        ['${jobId}']
      );
      if (r.rowCount !== 1) { console.error('claim-failed'); process.exit(2); }
      await c.end();
      process.exit(1);
    `;
    const child = spawn(process.execPath, ['--input-type=module', '-e', claimScript], {
      cwd: path.resolve('.'),
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });
    const [code] = await Promise.all([
      new Promise<number | null>((resolve) => child.on('close', resolve)),
    ]);
    expect(code).toBe(1);

    // Expire the abandoned lease so another worker can reclaim.
    await adminPool.query(
      `UPDATE app.background_jobs SET leased_until = now() - interval '1 second' WHERE id = $1`,
      [jobId]
    );

    const workerB = new DaynoriWorker(adminPool, { workerId: 'fault-reclaim-b' });
    workerB.registerHandler(taskType, async (_jobId, payload, client) => {
      if (!client) throw new Error('client required for durable effect');
      const p = payload as { marker: string; workspaceId: string; userId: string };
      await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [p.userId]);
      await client.query(`SELECT set_config('app.current_workspace_id', $1, true)`, [p.workspaceId]);
      const existing = await client.query(
        `SELECT 1 FROM app.audit_events WHERE action = 'phase58_lease_reclaim' AND details->>'marker' = $1`,
        [p.marker]
      );
      if ((existing.rowCount ?? 0) === 0) {
        await client.query(
          `INSERT INTO app.audit_events (id, workspace_id, actor_id, action, resource_type, resource_id, details)
           VALUES ($1, $2, $3, 'phase58_lease_reclaim', 'background_job', $4, $5::jsonb)`,
          [
            crypto.randomUUID(),
            p.workspaceId,
            p.userId,
            jobId,
            JSON.stringify({ marker: p.marker }),
          ]
        );
      }
      return { details: { marker: p.marker } };
    });
    workerB.start(adminPool);
    const ok = await workerB.pollAndProcessNextJob(adminPool, {
      taskTypes: [taskType],
    });
    expect(ok?.error).toBeUndefined();
    expect(ok?.status).toBe('completed');
    expect(ok?.jobId).toBe(jobId);
    workerB.stop();

    const job = await adminPool.query<{ status: string; attempts: number }>(
      `SELECT status, attempts FROM app.background_jobs WHERE id = $1`,
      [jobId]
    );
    expect(job.rows[0]?.status).toBe('completed');
    expect(job.rows[0]!.attempts).toBeGreaterThanOrEqual(2);

    const durable = await adminPool.query(
      `SELECT 1 FROM app.audit_events WHERE action = 'phase58_lease_reclaim' AND details->>'marker' = $1`,
      [marker]
    );
    expect(durable.rowCount).toBe(1);
    await assertSentinelIntact();
  });

  it('feature kill switch keeps disabled modules unavailable (not successful)', async () => {
    const client = createApiClient({ baseUrl, token });
    expect(
      (await fetch(`${baseUrl}/v1/vault/status`, { headers: { Authorization: `Bearer ${token}` } }))
        .status
    ).toBe(403);

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
    await assertSentinelIntact();
  });
});
