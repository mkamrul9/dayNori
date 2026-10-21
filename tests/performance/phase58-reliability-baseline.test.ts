/**
 * Phase 58 — Engineering synthetic reliability baseline (not beta-derived capacity).
 *
 * Workload (documented):
 * - Concurrent synthetic actors: 40 (host-bounded proxy for ~100-active target)
 * - Heavy workspace: 10_000 ordinary note items + deep folder chain (depth 8)
 * - Mix: 70% metadata list/read, 20% note create, 10% search
 * - Warm-up: 20 requests; measurement window: full 90s soak (sample ceiling is safety only)
 * - Pacing: ~25ms yield between actor ops (host-bounded; not production traffic shape)
 * - Provider substitutes: memory storage; billing/AI/rooms/vault disabled
 * - Traffic uses daynori_runtime via API; seed uses admin pool (not measured)
 *
 * Results written to tests/performance/results/phase58-baseline.json
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { generateKeyPair, SignJWT, exportJWK, type JSONWebKeySet } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { buildServer, JwtVerifier } from '../../apps/api/src/index.js';
import { createAdminPool, createRuntimePool } from '../../apps/api/src/db/index.js';
import { Migrator } from '../../infra/supabase/migrator.js';
import { createApiClient, type DaynoriApiClient } from '@daynori/api-client';
import {
  MemoryStorageProvider,
  setDefaultStorageProvider,
} from '../../apps/api/src/modules/files/storageAdapter.js';

type Sample = { op: string; ok: boolean; ms: number; error?: string };

function percentiles(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? 0;
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    samples: sorted.length,
    min: sorted[0] ?? 0,
    max: sorted[sorted.length - 1] ?? 0,
    mean: sorted.length ? sum / sorted.length : 0,
    p50: at(50),
    p95: at(95),
    p99: at(99),
  };
}

describe('Phase 58: engineering synthetic reliability baseline', () => {
  let adminPool: Pool;
  let runtimePool: Pool;
  let server: ReturnType<typeof buildServer>;
  let baseUrl: string;
  let keyPair: Awaited<ReturnType<typeof generateKeyPair>>;
  const issuer = 'https://auth.daynori.test';
  const audience = 'daynori-api';
  const kid = 'phase58-key';
  const actors: { userId: string; client: DaynoriApiClient; workspaceId: string }[] = [];
  let heavyWorkspaceId = '';
  let heavyUserId = '';

  async function tokenFor(uid: string): Promise<string> {
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
      .setExpirationTime('2h')
      .sign(keyPair.privateKey);
  }

  beforeAll(async () => {
    process.env['NODE_ENV'] = 'test';
    delete process.env['DAYNORI_ROOMS_LOCAL_ENABLED'];
    delete process.env['DAYNORI_AI_LOCAL_ENABLED'];
    delete process.env['DAYNORI_BILLING_LOCAL_ENABLED'];

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
      rateLimitOptions: { windowMs: 60000, maxRequests: 200000 },
      enableChatPublicationRecovery: false,
    });
    await server.listen({ port: 0, host: '127.0.0.1' });
    const addr = server.server.address();
    if (!addr || typeof addr === 'string') throw new Error('no address');
    baseUrl = `http://127.0.0.1:${addr.port}`;

    const actorCount = 40;
    const admin = await adminPool.connect();
    try {
      for (let i = 0; i < actorCount; i++) {
        const userId = crypto.randomUUID();
        await admin.query(
          `INSERT INTO app.profiles (id, display_name) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [userId, `P58-${i}`]
        );
        const client = createApiClient({ baseUrl, token: await tokenFor(userId) });
        const prov = await client.provisionPersonalWorkspace();
        actors.push({ userId, client, workspaceId: prov.data.workspace.id });
      }
      heavyUserId = actors[0]!.userId;
      heavyWorkspaceId = actors[0]!.workspaceId;

      // Deep folder chain (depth 8) + 10k note items (admin seed — not measured traffic).
      let parent: string | null = null;
      for (let d = 0; d < 8; d++) {
        const id = crypto.randomUUID();
        await admin.query(
          `INSERT INTO app.items (id, workspace_id, kind, folder_id, created_by, updated_by)
           VALUES ($1,$2,'folder',$3,$4,$4)`,
          [id, heavyWorkspaceId, parent, heavyUserId]
        );
        parent = id;
      }
      await admin.query(
        `
        INSERT INTO app.items (id, workspace_id, kind, created_by, updated_by, created_at, updated_at)
        SELECT gen_random_uuid(), $1, 'note', $2, $2,
               now() - (g || ' seconds')::interval,
               now() - (g || ' seconds')::interval
        FROM generate_series(1, 10000) g;
        `,
        [heavyWorkspaceId, heavyUserId]
      );
    } finally {
      admin.release();
    }
  }, 300_000);

  afterAll(async () => {
    if (server) await server.close();
    if (runtimePool) await runtimePool.end();
    if (adminPool) await adminPool.end();
  });

  it('runs bounded soak with documented concurrency and records tails/errors', async () => {
    const samples: Sample[] = [];
    const warmUp = 20;
    /** Safety ceiling only — primary stop is soakMs (do not relabel a burst as a soak). */
    const maxSamples = 100_000;
    const soakMs = 90_000;
    const paceMs = 25;
    const started = Date.now();
    const heap0 = process.memoryUsage().heapUsed;
    let stopReason: 'soak_elapsed' | 'sample_ceiling' = 'soak_elapsed';

    for (let i = 0; i < warmUp; i++) {
      await actors[i % actors.length]!.client.listItems(actors[i % actors.length]!.workspaceId, {
        limit: 20,
      });
    }

    const runOne = async (actorIdx: number): Promise<void> => {
      const actor = actors[actorIdx % actors.length]!;
      const roll = Math.random();
      const t0 = performance.now();
      try {
        if (roll < 0.7) {
          // Only the heavy workspace owner may list the 10k workspace (tenant isolation).
          const ws =
            actor.userId === heavyUserId && actorIdx % 3 === 0
              ? heavyWorkspaceId
              : actor.workspaceId;
          await actor.client.listItems(ws, { limit: 50 });
          samples.push({ op: 'list', ok: true, ms: performance.now() - t0 });
        } else if (roll < 0.9) {
          await actor.client.createNote(actor.workspaceId, {
            title: `soak-${Date.now()}-${actorIdx}`,
            plainText: 'phase58 synthetic',
          });
          samples.push({ op: 'create', ok: true, ms: performance.now() - t0 });
        } else {
          await actor.client.searchWorkspace(actor.workspaceId, { q: 'Heavy', limit: 10 });
          samples.push({ op: 'search', ok: true, ms: performance.now() - t0 });
        }
      } catch (err) {
        samples.push({
          op: 'error',
          ok: false,
          ms: performance.now() - t0,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    };

    // 40 concurrent actors for the full soak window (paced).
    const workers = Array.from({ length: 40 }, (_, idx) =>
      (async () => {
        while (Date.now() - started < soakMs) {
          if (samples.length >= maxSamples) {
            stopReason = 'sample_ceiling';
            return;
          }
          await runOne(idx);
          await new Promise((r) => setTimeout(r, paceMs));
        }
      })()
    );
    await Promise.all(workers);

    const ok = samples.filter((s) => s.ok);
    const fail = samples.filter((s) => !s.ok);
    const byOp = (op: string) => ok.filter((s) => s.op === op).map((s) => s.ms);
    const readStats = percentiles(byOp('list').concat(byOp('search')));
    const writeStats = percentiles(byOp('create'));
    const allStats = percentiles(ok.map((s) => s.ms));
    const heap1 = process.memoryUsage().heapUsed;
    const durationMs = Date.now() - started;
    const errorRate = samples.length ? fail.length / samples.length : 1;

    const result = {
      label: 'engineering-synthetic-baseline',
      notBetaDerived: true,
      stopReason,
      host: {
        platform: os.platform(),
        release: os.release(),
        cpus: os.cpus().length,
        totalMemMb: Math.round(os.totalmem() / (1024 * 1024)),
        node: process.version,
      },
      workload: {
        concurrentActors: 40,
        heavyItems: 10000,
        folderDepth: 8,
        warmUp,
        maxSamples,
        soakMs,
        paceMs,
        mix: '70% list, 20% create, 10% search',
      },
      durationMs,
      sampleCount: samples.length,
      errorCount: fail.length,
      errorRate,
      latencyMs: { all: allStats, read: readStats, write: writeStats },
      heapGrowthMb: (heap1 - heap0) / (1024 * 1024),
      throughputRps: samples.length / (durationMs / 1000),
      recordedAt: new Date().toISOString(),
    };

    const outDir = path.resolve('tests/performance/results');
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'phase58-baseline.json'), JSON.stringify(result, null, 2));

    // Honest gates for local synthetic baseline (not production SLO claims).
    expect(stopReason).toBe('soak_elapsed');
    expect(durationMs).toBeGreaterThanOrEqual(soakMs - 2_000);
    expect(samples.length).toBeGreaterThan(100);
    expect(errorRate).toBeLessThan(0.05);
    expect(readStats.p95).toBeLessThan(2_000);
    expect(writeStats.p95).toBeLessThan(2_000);
  }, 240_000);

  it('keeps tenant isolation under concurrent list pressure', async () => {
    const a = actors[1]!;
    const b = actors[2]!;
    const created = await a.client.createNote(a.workspaceId, {
      title: 'secret-a',
      plainText: 'only-a',
    });
    const lists = await Promise.all(
      Array.from({ length: 20 }, () => b.client.listItems(b.workspaceId, { limit: 50 }))
    );
    for (const res of lists) {
      expect(res.data.every((item) => item.id !== created.data.id)).toBe(true);
    }
    await expect(b.client.listItems(a.workspaceId, { limit: 10 })).rejects.toThrow();
  });
});
