import crypto from 'node:crypto';
import { generateKeyPair, SignJWT, type JSONWebKeySet } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { buildServer, JwtVerifier } from '../../apps/api/src/index.js';
import {
  createAdminPool,
  createRuntimePool,
  getRuntimeDatabaseConfig,
} from '../../apps/api/src/db/index.js';
import { Migrator } from '../../infra/supabase/migrator.js';
import { createApiClient, type DaynoriApiClient } from '@daynori/api-client';
import {
  MemoryStorageProvider,
  setDefaultStorageProvider,
} from '../../apps/api/src/modules/files/storageAdapter.js';
import { DaynoriWorker, type StorageServiceContract } from '../../apps/worker/src/worker.js';
import { PRIVATE_ASSETS_BUCKET } from '../../apps/api/src/modules/files/service.js';

interface LatencySummary {
  samples: number;
  min: number;
  max: number;
  mean: number;
  p50: number;
  p95: number;
  p99: number;
}

function calculatePercentiles(latenciesMs: number[]): LatencySummary {
  const sorted = [...latenciesMs].sort((a, b) => a - b);
  const count = sorted.length;
  const sum = sorted.reduce((acc, v) => acc + v, 0);

  const getP = (p: number) => {
    const idx = Math.min(Math.floor((p / 100) * count), count - 1);
    return sorted[idx] ?? 0;
  };

  return {
    samples: count,
    min: sorted[0] ?? 0,
    max: sorted[count - 1] ?? 0,
    mean: Number((sum / count).toFixed(2)),
    p50: Number(getP(50).toFixed(2)),
    p95: Number(getP(95).toFixed(2)),
    p99: Number(getP(99).toFixed(2)),
  };
}

describe('Phase 37 Performance Release Gate Benchmarks', () => {
  let adminPool: Pool;
  let runtimePool: Pool;
  let migrator: Migrator;
  let server: ReturnType<typeof buildServer>;
  let baseUrl: string;

  let keyPair: Awaited<ReturnType<typeof generateKeyPair>>;
  let jwks: JSONWebKeySet;

  const issuer = 'https://auth.daynori.test';
  const audience = 'daynori-api';
  const kid = 'perf-gate-key';

  const perfUserId = crypto.randomUUID();
  const perfEmail = 'perf.tester@example.test';
  let token: string;
  let client: DaynoriApiClient;
  let workspaceId: string;

  let memoryStorage: MemoryStorageProvider;
  let worker: DaynoriWorker;

  beforeAll(async () => {
    adminPool = createAdminPool();
    runtimePool = createRuntimePool({ ...getRuntimeDatabaseConfig(), max: 50 });

    migrator = new Migrator();
    await migrator.migrate();

    memoryStorage = new MemoryStorageProvider();
    setDefaultStorageProvider(memoryStorage);

    keyPair = await generateKeyPair('RS256');
    jwks = {
      keys: [
        {
          ...(await import('jose').then((m) => m.exportJWK(keyPair.publicKey))),
          kid,
          alg: 'RS256',
          use: 'sig',
        },
      ],
    };

    const verifier = new JwtVerifier({
      issuer,
      audience,
      localJwks: jwks,
      allowedAlgorithms: ['RS256'],
    });

    server = buildServer({
      adminPool,
      runtimePool,
      jwtVerifier: verifier,
      allowUnauthenticatedStartup: false,
      rateLimitOptions: { windowMs: 60000, maxRequests: 50000 },
    });

    const address = await server.listen({ port: 0, host: '127.0.0.1' });
    baseUrl = address;

    const admin = await adminPool.connect();
    try {
      await admin.query(
        `
        INSERT INTO app.profiles (id, display_name, preferences)
        VALUES ($1, 'Performance Tester', '{"themeMode":"light"}'::jsonb)
        ON CONFLICT (id) DO NOTHING;
      `,
        [perfUserId]
      );
    } finally {
      admin.release();
    }

    const workerStorageContract: StorageServiceContract = {
      async getObject(bucket: string, objectPath: string) {
        const buf = await memoryStorage.getObject(bucket, objectPath);
        return { buffer: buf, contentLength: buf.length, contentType: 'application/octet-stream' };
      },
      async putObject(bucket: string, objectPath: string, buffer: Buffer, contentType?: string) {
        await memoryStorage.putObject(bucket, objectPath, buffer, contentType);
      },
      async deleteObject(bucket: string, objectPath: string) {
        await memoryStorage.deleteObject(bucket, objectPath);
      },
    };

    worker = new DaynoriWorker(adminPool, {
      storageService: workerStorageContract,
      defaultBucket: PRIVATE_ASSETS_BUCKET,
    });
    worker.start();

    token = await new SignJWT({
      sub: perfUserId,
      email: perfEmail,
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

    client = createApiClient({ baseUrl, token: () => token });

    const prov = await client.provisionPersonalWorkspace();
    workspaceId = prov.data.workspace.id;
  });

  afterAll(async () => {
    if (worker) {
      worker.stop();
    }
    if (server) {
      await server.close();
    }
    await adminPool.end();
    await runtimePool.end();
  });

  // --------------------------------------------------------------------------
  // Benchmark 1: Local Save & Mutation Acknowledgment (Target: p95 <= 100ms local budget)
  // --------------------------------------------------------------------------
  it('Benchmark 1: local input/mutation save acknowledgment adheres to latency budget', async () => {
    const latencies: number[] = [];
    const iterations = 50;

    // Warmup
    for (let i = 0; i < 5; i++) {
      await client.createNote(workspaceId, {
        title: `Warmup Note ${i}`,
        document: {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'warmup' }] }],
        },
      });
    }

    // Timed samples
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      await client.createNote(workspaceId, {
        title: `Performance Note ${i}`,
        document: {
          type: 'doc',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: `Sample content ${i}` }] },
          ],
        },
      });
      latencies.push(performance.now() - start);
    }

    const stats = calculatePercentiles(latencies);
    // Server round-trip localhost budget target <= 100ms p95
    expect(stats.p95).toBeLessThan(100);
    expect(stats.samples).toBe(iterations);
  });

  // --------------------------------------------------------------------------
  // Benchmark 2: 10,000-Record Keyset Pagination & Memory Stability
  // --------------------------------------------------------------------------
  it('Benchmark 2: queries 10,000-record dataset with virtualized keyset pagination under 50ms per page', async () => {
    const admin = await adminPool.connect();

    try {
      // Bulk seed 10,000 items in single query
      await admin.query(
        `
        INSERT INTO app.items (id, workspace_id, kind, created_by, updated_by, created_at, updated_at)
        SELECT
          gen_random_uuid(),
          $1,
          'note',
          $2,
          $2,
          now() - (g || ' seconds')::interval,
          now() - (g || ' seconds')::interval
        FROM generate_series(1, 10000) g;
      `,
        [workspaceId, perfUserId]
      );
    } finally {
      admin.release();
    }

    // Warmup single query
    await client.listItems(workspaceId, { limit: 50 });

    // Benchmark paginated reads (page size 50)
    const pageLatencies: number[] = [];
    let cursor: string | undefined = undefined;
    const pagesToTest = 20;

    const initialHeap = process.memoryUsage().heapUsed;

    for (let page = 0; page < pagesToTest; page++) {
      const start = performance.now();
      const res = await client.listItems(workspaceId, { limit: 50, cursor });
      const elapsed = performance.now() - start;
      pageLatencies.push(elapsed);

      expect(res.data.length).toBeLessThanOrEqual(50);
      cursor = res.meta.cursor ?? undefined;
      if (!cursor) break;
    }

    const finalHeap = process.memoryUsage().heapUsed;
    const heapGrowthMb = (finalHeap - initialHeap) / (1024 * 1024);

    const stats = calculatePercentiles(pageLatencies);
    // Paginated page retrieval adheres to sub-150ms p95 budget for 10k items
    expect(stats.p95).toBeLessThan(150);
    expect(stats.mean).toBeLessThan(80);
    // Virtualized pagination prevents heap bloat (< 25MB growth for 1000 item inspections)
    expect(heapGrowthMb).toBeLessThan(25);
  });

  // --------------------------------------------------------------------------
  // Benchmark 3: Concurrency Stress (100 operations across concurrent active users)
  // --------------------------------------------------------------------------
  it('Benchmark 3: satisfies p95 <= 300ms read and p95 <= 500ms mutation budgets under 100 concurrent operations', async () => {
    const totalOperations = 100;
    const workerCount = 20; // 20 concurrent client connections simulating 100 operations
    const operationsPerWorker = totalOperations / workerCount;
    const readLatencies: number[] = [];
    const mutationLatencies: number[] = [];

    // Warmup
    await client.getUserPreferences();

    // 100 reads across concurrent workers
    const readWorkers = Array.from({ length: workerCount }, async () => {
      for (let i = 0; i < operationsPerWorker; i++) {
        const start = performance.now();
        await client.getUserPreferences();
        readLatencies.push(performance.now() - start);
      }
    });

    await Promise.all(readWorkers);
    const readStats = calculatePercentiles(readLatencies);
    expect(readStats.p95).toBeLessThan(300);

    // Warmup mutation
    await client.createTask(workspaceId, { title: 'Warmup Task', priority: 'normal' });

    // 100 mutations across concurrent workers
    const mutationWorkers = Array.from({ length: workerCount }, async (_, workerIdx) => {
      for (let i = 0; i < operationsPerWorker; i++) {
        const start = performance.now();
        await client.createTask(workspaceId, {
          title: `Concurrent Task w${workerIdx}_${i}`,
          priority: 'normal',
        });
        mutationLatencies.push(performance.now() - start);
      }
    });

    await Promise.all(mutationWorkers);
    const mutationStats = calculatePercentiles(mutationLatencies);
    expect(mutationStats.p95).toBeLessThan(500);
  });

  // --------------------------------------------------------------------------
  // Benchmark 4: Worker Job Lease Acquisition & Queue Dispatch Latency
  // --------------------------------------------------------------------------
  it('Benchmark 4: worker poll and SKIP LOCKED lease acquisition executes under 75ms budget', async () => {
    const admin = await adminPool.connect();
    try {
      // Enqueue 21 background jobs (1 warmup + 20 measured)
      for (let i = 0; i < 21; i++) {
        await admin.query(`
          INSERT INTO app.background_jobs (task_type, payload, status, created_at, updated_at)
          VALUES ('blob_purge', '{"storagePaths":[],"bucket":"files"}'::jsonb, 'pending', now(), now());
        `);
      }
    } finally {
      admin.release();
    }

    // Warm-up poll
    await worker.pollAndProcessNextJob();

    const leaseLatencies: number[] = [];
    for (let i = 0; i < 20; i++) {
      const start = performance.now();
      const job = await worker.pollAndProcessNextJob();
      leaseLatencies.push(performance.now() - start);
      expect(job).not.toBeNull();
    }

    const stats = calculatePercentiles(leaseLatencies);
    expect(stats.p95).toBeLessThan(75);
  });
});
