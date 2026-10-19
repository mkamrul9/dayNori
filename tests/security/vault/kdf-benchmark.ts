/**
 * KDF Latency Benchmark (Phase 44)
 *
 * Measures wall-clock latency distributions for candidate parameters on the
 * current Node host. Explicit limitations:
 * - JavaScript heap delta does NOT measure peak native Argon2 memory.
 * - Desktop Node latency does NOT establish Android or browser performance.
 * - A small sample count does NOT prove resistance to affordable password guessing.
 *
 * Candidate parameters remain justified for interactive unlock on capable devices;
 * they are never silently weakened based on this harness.
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
  p50DurationMs: number;
  p95DurationMs: number;
  /** Node process RSS delta (KiB) around the sample loop — NOT peak native Argon2 memory. */
  processRssDeltaKiB: number;
  /** Node JS heapUsed delta (KiB) — NOT peak native Argon2 memory. */
  jsHeapDeltaKiB: number;
  limitations: string[];
}

const BENCHMARK_LIMITATIONS = [
  'JavaScript heap delta does not measure peak native Argon2 memory allocation.',
  'process.memoryUsage().rss delta is an approximate host-process signal, not a precise peak-RSS or cgroup measurement.',
  'Desktop Node latency does not establish Android or browser performance.',
  'A few latency samples do not prove resistance to affordable offline password guessing.',
] as const;

export function runKdfBenchmark(samples = 5): KdfBenchmarkResult[] {
  if (!Number.isInteger(samples) || samples < 1 || samples > 50) {
    throw new Error('samples must be an integer in [1, 50].');
  }

  const salt = crypto.randomBytes(16);
  const passphrase = 'correct-horse-battery-staple-synthetic-passphrase';
  const results: KdfBenchmarkResult[] = [];

  const configs = [
    {
      name: 'Argon2id Candidate Production',
      fn: () =>
        deriveKeyArgon2id(passphrase, salt, {
          memoryKiB: 64 * 1024,
          passes: 3,
          parallelism: 1,
        }),
      params: { memoryKiB: 65536, passes: 3, parallelism: 1 },
    },
    {
      name: 'Argon2id Test Profile',
      fn: () =>
        deriveKeyArgon2id(passphrase, salt, {
          memoryKiB: 16 * 1024,
          passes: 2,
          parallelism: 1,
        }),
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
    const initialHeap = process.memoryUsage().heapUsed;
    const initialRss = process.memoryUsage().rss;

    for (let i = 0; i < samples; i++) {
      const start = performance.now();
      config.fn();
      const end = performance.now();
      durations.push(end - start);
    }

    const finalHeap = process.memoryUsage().heapUsed;
    const finalRss = process.memoryUsage().rss;
    durations.sort((a, b) => a - b);

    const sum = durations.reduce((acc, d) => acc + d, 0);
    const avg = sum / durations.length;
    const min = durations[0] ?? 0;
    const max = durations[durations.length - 1] ?? 0;
    const p50Index = Math.min(Math.floor(durations.length * 0.5), durations.length - 1);
    const p95Index = Math.min(Math.floor(durations.length * 0.95), durations.length - 1);
    const p50 = durations[p50Index] ?? 0;
    const p95 = durations[p95Index] ?? 0;

    results.push({
      algorithm: config.name,
      parameters: config.params,
      samples,
      minDurationMs: Math.round(min * 10) / 10,
      maxDurationMs: Math.round(max * 10) / 10,
      avgDurationMs: Math.round(avg * 10) / 10,
      p50DurationMs: Math.round(p50 * 10) / 10,
      p95DurationMs: Math.round(p95 * 10) / 10,
      processRssDeltaKiB: Math.round((finalRss - initialRss) / 1024),
      jsHeapDeltaKiB: Math.round((finalHeap - initialHeap) / 1024),
      limitations: [...BENCHMARK_LIMITATIONS],
    });
  }

  return results;
}
