/**
 * Phase 58 repair — Engineering synthetic reliability baseline (not beta-derived capacity).
 *
 * Workload (documented):
 * - Concurrent synthetic actors: 40 (short local baseline; not sustained 100-user production)
 * - Heavy workspace: 10_000 complete note records + folder chain depth 5 (MAX_FOLDER_DEPTH)
 * - Mix: 50% list, 15% getNote (full-record read), 20% create, 15% search (meaningful hits)
 * - Heavy-workspace list share: ~1/3 of list ops by the heavy owner only
 * - Warm-up: 20 requests (outside measured interval)
 * - Measurement: full 90s soak; sample ceiling is safety only
 * - Pacing: 25ms yield; seeded RNG (seed=58) for reproducibility
 * - Provider substitutes: memory storage; optional modules gated
 *
 * Quality.md targets (p95 read≤300ms / write≤500ms under ~100 users) are evaluated
 * separately from harness guardrails and must not be silently replaced by loose asserts.
 *
 * Results: tests/performance/results/phase58-baseline.json
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { generateKeyPair, SignJWT, exportJWK, type JSONWebKeySet } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { MAX_FOLDER_DEPTH } from '@daynori/domain';
import { buildServer, JwtVerifier } from '../../apps/api/src/index.js';
import { createAdminPool, createRuntimePool } from '../../apps/api/src/db/index.js';
import { Migrator } from '../../infra/supabase/migrator.js';
import { createApiClient, type DaynoriApiClient } from '@daynori/api-client';
import {
  MemoryStorageProvider,
  setDefaultStorageProvider,
} from '../../apps/api/src/modules/files/storageAdapter.js';

type Sample = { op: string; ok: boolean; ms: number; error?: string; timedOut?: boolean };

const SEARCH_MARKER = 'HeavySearchMarker';
const WORKLOAD_SEED = 58;

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function percentiles(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (p: number) =>
    sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? 0;
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
  const heavyNoteIds: string[] = [];

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

      // Folder chain within domain MAX_FOLDER_DEPTH (root depth 1 … depth 5).
      let parent: string | null = null;
      for (let d = 0; d < MAX_FOLDER_DEPTH; d++) {
        const id = crypto.randomUUID();
        await admin.query(
          `INSERT INTO app.items (id, workspace_id, kind, folder_id, created_by, updated_by)
           VALUES ($1,$2,'folder',$3,$4,$4)`,
          [id, heavyWorkspaceId, parent, heavyUserId]
        );
        parent = id;
      }

      // 10k complete note records (items + notes) — admin seed outside measurement.
      await admin.query(
        `
        WITH seeded AS (
          SELECT gen_random_uuid() AS id, g
          FROM generate_series(1, 10000) g
        ),
        items AS (
          INSERT INTO app.items (id, workspace_id, kind, created_by, updated_by, created_at, updated_at)
          SELECT id, $1, 'note', $2, $2,
                 now() - (g || ' seconds')::interval,
                 now() - (g || ' seconds')::interval
          FROM seeded
          RETURNING id
        )
        INSERT INTO app.notes (id, workspace_id, title, document, plain_text, word_count, char_count)
        SELECT i.id, $1,
               'Heavy note ' || s.g,
               jsonb_build_object('type', 'doc', 'content', jsonb_build_array()),
               CASE WHEN s.g % 20 = 0 THEN $3 || ' body ' || s.g ELSE 'ordinary body ' || s.g END,
               4, 40
        FROM items i
        JOIN seeded s ON s.id = i.id
        `,
        [heavyWorkspaceId, heavyUserId, SEARCH_MARKER]
      );

      const ids = await admin.query<{ id: string }>(
        `SELECT id FROM app.notes WHERE workspace_id = $1 ORDER BY updated_at DESC LIMIT 200`,
        [heavyWorkspaceId]
      );
      heavyNoteIds.push(...ids.rows.map((r) => r.id));
    } finally {
      admin.release();
    }

    // Validate fixtures through normal application reads (not measurement).
    const heavyClient = actors[0]!.client;
    const listed = await heavyClient.listItems(heavyWorkspaceId, { limit: 5 });
    expect(listed.data.length).toBeGreaterThan(0);
    const note = await heavyClient.getNote(heavyWorkspaceId, heavyNoteIds[0]!);
    expect(note.data.plainText.length).toBeGreaterThan(0);
    const search = await heavyClient.searchWorkspace(heavyWorkspaceId, {
      q: SEARCH_MARKER,
      limit: 5,
    });
    expect(search.data.length).toBeGreaterThan(0);
  }, 600_000);

  afterAll(async () => {
    if (server) await server.close();
    if (runtimePool) await runtimePool.end();
    if (adminPool) await adminPool.end();
  });

  it('runs bounded soak with documented concurrency and records tails/errors', async () => {
    const samples: Sample[] = [];
    const warmUp = 20;
    const maxSamples = 100_000;
    const soakMs = 90_000;
    const paceMs = 25;
    const rand = mulberry32(WORKLOAD_SEED);
    const heap0 = process.memoryUsage().heapUsed;
    let stopReason: 'soak_elapsed' | 'sample_ceiling' = 'soak_elapsed';
    let heavyListOps = 0;
    let listOps = 0;

    // Warm-up outside measured interval.
    for (let i = 0; i < warmUp; i++) {
      await actors[i % actors.length]!.client.listItems(actors[i % actors.length]!.workspaceId, {
        limit: 20,
      });
    }

    const started = Date.now();

    const runOne = async (actorIdx: number): Promise<void> => {
      const actor = actors[actorIdx % actors.length]!;
      const roll = rand();
      let op = 'list';
      const t0 = performance.now();
      try {
        if (roll < 0.5) {
          op = 'list';
          listOps += 1;
          const useHeavy = actor.userId === heavyUserId && actorIdx % 3 === 0;
          if (useHeavy) heavyListOps += 1;
          const ws = useHeavy ? heavyWorkspaceId : actor.workspaceId;
          await actor.client.listItems(ws, { limit: 50 });
          samples.push({ op, ok: true, ms: performance.now() - t0 });
        } else if (roll < 0.65) {
          op = 'getNote';
          const noteId =
            actor.userId === heavyUserId
              ? heavyNoteIds[Math.floor(rand() * heavyNoteIds.length)]!
              : (
                  await actor.client.listItems(actor.workspaceId, { limit: 5, kind: 'note' })
                ).data[0]?.id;
          if (!noteId) {
            samples.push({
              op,
              ok: false,
              ms: performance.now() - t0,
              error: 'no note id for getNote',
            });
            return;
          }
          await actor.client.getNote(actor.userId === heavyUserId ? heavyWorkspaceId : actor.workspaceId, noteId);
          samples.push({ op, ok: true, ms: performance.now() - t0 });
        } else if (roll < 0.85) {
          op = 'create';
          await actor.client.createNote(actor.workspaceId, {
            title: `soak-${actorIdx}`,
            plainText: 'phase58 synthetic',
          });
          samples.push({ op, ok: true, ms: performance.now() - t0 });
        } else {
          op = 'search';
          const ws = actor.userId === heavyUserId ? heavyWorkspaceId : actor.workspaceId;
          const q = actor.userId === heavyUserId ? SEARCH_MARKER : 'phase58';
          await actor.client.searchWorkspace(ws, { q, limit: 10 });
          samples.push({ op, ok: true, ms: performance.now() - t0 });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        samples.push({
          op,
          ok: false,
          ms: performance.now() - t0,
          error: msg,
          timedOut: /timeout|ETIMEDOUT|AbortError/i.test(msg),
        });
      }
    };

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
    const readStats = percentiles(
      byOp('list').concat(byOp('search')).concat(byOp('getNote'))
    );
    const writeStats = percentiles(byOp('create'));
    const allStats = percentiles(ok.map((s) => s.ms));
    const heap1 = process.memoryUsage().heapUsed;
    const durationMs = Date.now() - started;
    const errorRate = samples.length ? fail.length / samples.length : 1;

    const qualityTargetReadP95Ms = 300;
    const qualityTargetWriteP95Ms = 500;
    const qualityTargetsMet = {
      readP95: readStats.p95 <= qualityTargetReadP95Ms,
      writeP95: writeStats.p95 <= qualityTargetWriteP95Ms,
      note: 'quality.md ~100-user targets evaluated separately; this run is a 40-actor short local baseline',
    };

    const result = {
      label: 'engineering-synthetic-baseline-short-local',
      notBetaDerived: true,
      notSustained100UserCapacity: true,
      notLongDurationMemoryStability: true,
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
        folderDepth: MAX_FOLDER_DEPTH,
        warmUp,
        maxSamples,
        soakMs,
        paceMs,
        seed: WORKLOAD_SEED,
        mix: '50% list, 15% getNote, 20% create, 15% search',
        heavyListShareOfListOps: listOps ? heavyListOps / listOps : 0,
        searchMarker: SEARCH_MARKER,
      },
      durationMs,
      sampleCount: samples.length,
      errorCount: fail.length,
      timedOutCount: fail.filter((f) => f.timedOut).length,
      errorRate,
      failedOps: fail.slice(0, 20).map((f) => ({ op: f.op, error: f.error, timedOut: f.timedOut })),
      latencyMs: { all: allStats, read: readStats, write: writeStats },
      qualityTargets: {
        readP95TargetMs: qualityTargetReadP95Ms,
        writeP95TargetMs: qualityTargetWriteP95Ms,
        ...qualityTargetsMet,
      },
      heapGrowthMb: (heap1 - heap0) / (1024 * 1024),
      throughputRps: samples.length / (durationMs / 1000),
      recordedAt: new Date().toISOString(),
    };

    const outDir = path.resolve('tests/performance/results');
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'phase58-baseline.json'), JSON.stringify(result, null, 2));

    // Harness guardrails (not a silent substitute for quality.md targets).
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
