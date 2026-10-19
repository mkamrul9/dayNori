/**
 * KDF Latency and Memory Benchmark (Phase 44)
 *
 * Measures performance distributions for:
 * 1. Argon2id Candidate Production Settings (m=64MB, t=3, p=1)
 * 2. Argon2id Lightweight Test Settings (m=16MB, t=2, p=1)
 * 3. PBKDF2 Baseline (100,000 iterations)
 * 4. PBKDF2 OWASP Recommendation (600,000 iterations)
 */

import crypto from 'node:crypto';
import { deriveKeyArgon2id, deriveKeyPbkdf2 } from './vault-crypto.js';

export interface KdfBenchmarkResult {
  algorithm: string;
  parameters: Record<string, unknown>;
  samples: number;
  minDurationMs: number;
  maxDurationMs: number;
  avgDurationMs: number;
  p95DurationMs: number;
  memoryUsageDeltaKiB: number;
}

export function runKdfBenchmark(samples = 5): KdfBenchmarkResult[] {
  const salt = crypto.randomBytes(16);
  const passphrase = 'correct-horse-battery-staple-synthetic-passphrase';
  const results: KdfBenchmarkResult[] = [];

  // Configuration sets
  const configs = [
    {
      name: 'Argon2id Candidate Production',
      fn: () => deriveKeyArgon2id(passphrase, salt, { memoryKiB: 64 * 1024, passes: 3, parallelism: 1 }),
      params: { memoryKiB: 65536, passes: 3, parallelism: 1 },
    },
    {
      name: 'Argon2id Test Profile',
      fn: () => deriveKeyArgon2id(passphrase, salt, { memoryKiB: 16 * 1024, passes: 2, parallelism: 1 }),
      params: { memoryKiB: 16384, passes: 2, parallelism: 1 },
    },
    {
      name: 'PBKDF2-HMAC-SHA256 (100k)',
      fn: () => deriveKeyPbkdf2(passphrase, salt, { iterations: 100_000 }),
      params: { iterations: 100_000, hash: 'sha256' },
    },
    {
      name: 'PBKDF2-HMAC-SHA256 (600k OWASP)',
      fn: () => deriveKeyPbkdf2(passphrase, salt, { iterations: 600_000 }),
      params: { iterations: 600_000, hash: 'sha256' },
    },
  ];

  for (const config of configs) {
    const durations: number[] = [];
    let initialMem = process.memoryUsage().heapUsed;

    for (let i = 0; i < samples; i++) {
      const start = performance.now();
      config.fn();
      const end = performance.now();
      durations.push(end - start);
    }

    const finalMem = process.memoryUsage().heapUsed;
    durations.sort((a, b) => a - b);

    const sum = durations.reduce((acc, d) => acc + d, 0);
    const avg = sum / durations.length;
    const min = durations[0];
    const max = durations[durations.length - 1];
    const p95Index = Math.min(Math.floor(durations.length * 0.95), durations.length - 1);
    const p95 = durations[p95Index];
    const memDeltaKiB = Math.max(0, Math.round((finalMem - initialMem) / 1024));

    results.push({
      algorithm: config.name,
      parameters: config.params,
      samples,
      minDurationMs: Math.round(min * 10) / 10,
      maxDurationMs: Math.round(max * 10) / 10,
      avgDurationMs: Math.round(avg * 10) / 10,
      p95DurationMs: Math.round(p95 * 10) / 10,
      memoryUsageDeltaKiB: memDeltaKiB,
    });
  }

  return results;
}
