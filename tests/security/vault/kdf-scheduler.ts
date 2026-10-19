/**
 * Bounded Argon2id derivation scheduler (Phase 44 candidate).
 *
 * - Validates inputs before queue admission.
 * - Bounds both active work and queued waiters (rejects when full).
 * - Runs synchronous Argon2id off the main thread via worker_threads.
 * - Cancelled / failed tasks release capacity.
 *
 * This is an isolated proof harness, not a production unlock scheduler.
 */

import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { KDF_BOUNDS, assertFinitePositiveInteger } from './vault-crypto.js';

const here = dirname(fileURLToPath(import.meta.url));
const WORKER_PATH = join(here, 'kdf-worker.cjs');

export interface Argon2idJobOptions {
  memoryKiB?: number;
  passes?: number;
  parallelism?: number;
  keyLengthBytes?: number;
  signal?: AbortSignal;
}

export interface SchedulerStats {
  active: number;
  queued: number;
  peakActive: number;
  peakQueued: number;
  completed: number;
  rejected: number;
  cancelled: number;
  failed: number;
}

type JobResolve = (value: Buffer) => void;
type JobReject = (reason: Error) => void;

interface QueuedJob {
  passphrase: Buffer;
  salt: Buffer;
  memory: number;
  passes: number;
  parallelism: number;
  tagLength: number;
  signal?: AbortSignal;
  resolve: JobResolve;
  reject: JobReject;
  onAbort?: () => void;
}

function validatePassphraseBuffer(passphrase: string | Buffer): Buffer {
  const message =
    typeof passphrase === 'string' ? Buffer.from(passphrase, 'utf8') : Buffer.from(passphrase);
  if (message.length === 0) {
    throw new Error('Passphrase/secret must be non-empty.');
  }
  if (message.length > KDF_BOUNDS.ARGON2ID.MAX_PASSPHRASE_BYTES) {
    throw new Error(
      `Passphrase/secret exceeds maximum of ${KDF_BOUNDS.ARGON2ID.MAX_PASSPHRASE_BYTES} bytes.`
    );
  }
  return message;
}

function validateSaltBuffer(salt: Buffer): Buffer {
  if (!Buffer.isBuffer(salt) && !(salt instanceof Uint8Array)) {
    throw new Error('Argon2id salt must be a Buffer or Uint8Array.');
  }
  const buf = Buffer.from(salt);
  if (
    buf.length < KDF_BOUNDS.ARGON2ID.SALT_LENGTH_BYTES ||
    buf.length > KDF_BOUNDS.ARGON2ID.MAX_SALT_LENGTH_BYTES
  ) {
    throw new Error(
      `Argon2id salt length must be between ${KDF_BOUNDS.ARGON2ID.SALT_LENGTH_BYTES} and ${KDF_BOUNDS.ARGON2ID.MAX_SALT_LENGTH_BYTES} bytes; received ${buf.length}.`
    );
  }
  return buf;
}

function validateJobOptions(options: Argon2idJobOptions): {
  memory: number;
  passes: number;
  parallelism: number;
  tagLength: number;
} {
  const memory = assertFinitePositiveInteger(
    options.memoryKiB ?? 64 * 1024,
    'Argon2id memoryKiB'
  );
  const passes = assertFinitePositiveInteger(options.passes ?? 3, 'Argon2id passes');
  const parallelism = assertFinitePositiveInteger(
    options.parallelism ?? 1,
    'Argon2id parallelism'
  );
  const tagLength = assertFinitePositiveInteger(
    options.keyLengthBytes ?? KDF_BOUNDS.ARGON2ID.KEY_LENGTH_BYTES,
    'Argon2id keyLengthBytes'
  );

  if (
    memory < KDF_BOUNDS.ARGON2ID.MIN_MEMORY_KIB ||
    memory > KDF_BOUNDS.ARGON2ID.MAX_MEMORY_KIB
  ) {
    throw new Error(
      `Argon2id memoryKiB ${memory} is outside allowed bounds [${KDF_BOUNDS.ARGON2ID.MIN_MEMORY_KIB}, ${KDF_BOUNDS.ARGON2ID.MAX_MEMORY_KIB}].`
    );
  }
  if (passes < KDF_BOUNDS.ARGON2ID.MIN_PASSES || passes > KDF_BOUNDS.ARGON2ID.MAX_PASSES) {
    throw new Error(
      `Argon2id passes ${passes} is outside allowed bounds [${KDF_BOUNDS.ARGON2ID.MIN_PASSES}, ${KDF_BOUNDS.ARGON2ID.MAX_PASSES}].`
    );
  }
  if (
    parallelism < KDF_BOUNDS.ARGON2ID.MIN_PARALLELISM ||
    parallelism > KDF_BOUNDS.ARGON2ID.MAX_PARALLELISM
  ) {
    throw new Error(
      `Argon2id parallelism ${parallelism} is outside allowed bounds [${KDF_BOUNDS.ARGON2ID.MIN_PARALLELISM}, ${KDF_BOUNDS.ARGON2ID.MAX_PARALLELISM}].`
    );
  }
  if (tagLength !== KDF_BOUNDS.ARGON2ID.KEY_LENGTH_BYTES) {
    throw new Error(
      `Argon2id application keyLengthBytes must be exactly ${KDF_BOUNDS.ARGON2ID.KEY_LENGTH_BYTES}; received ${tagLength}. No silent downgrade.`
    );
  }
  return { memory, passes, parallelism, tagLength };
}

export class Argon2idDerivationScheduler {
  private active = 0;
  private readonly queue: QueuedJob[] = [];
  private peakActive = 0;
  private peakQueued = 0;
  private completed = 0;
  private rejected = 0;
  private cancelled = 0;
  private failed = 0;

  getStats(): SchedulerStats {
    return {
      active: this.active,
      queued: this.queue.length,
      peakActive: this.peakActive,
      peakQueued: this.peakQueued,
      completed: this.completed,
      rejected: this.rejected,
      cancelled: this.cancelled,
      failed: this.failed,
    };
  }

  /**
   * Schedule a derivation. Validates before admission.
   * Rejects immediately when active+queued capacity is exhausted.
   */
  derive(
    passphrase: string | Buffer,
    salt: Buffer,
    options: Argon2idJobOptions = {}
  ): Promise<Buffer> {
    // Validate before occupying any capacity (reject as Promise for async API consistency).
    let message: Buffer;
    let saltBuf: Buffer;
    let params: ReturnType<typeof validateJobOptions>;
    try {
      message = validatePassphraseBuffer(passphrase);
      saltBuf = validateSaltBuffer(salt);
      params = validateJobOptions(options);
    } catch (err) {
      return Promise.reject(err instanceof Error ? err : new Error(String(err)));
    }

    if (options.signal?.aborted) {
      this.cancelled += 1;
      return Promise.reject(new Error('KDF derivation cancelled before admission.'));
    }

    if (
      this.active >= KDF_BOUNDS.MAX_CONCURRENT_DERIVATIONS &&
      this.queue.length >= KDF_BOUNDS.MAX_QUEUED_DERIVATIONS
    ) {
      this.rejected += 1;
      return Promise.reject(
        new Error(
          `KDF overload: active=${this.active} queued=${this.queue.length} exceeds bounds ` +
            `(maxActive=${KDF_BOUNDS.MAX_CONCURRENT_DERIVATIONS}, maxQueued=${KDF_BOUNDS.MAX_QUEUED_DERIVATIONS}).`
        )
      );
    }

    return new Promise<Buffer>((resolve, reject) => {
      const job: QueuedJob = {
        passphrase: message,
        salt: saltBuf,
        ...params,
        signal: options.signal,
        resolve,
        reject,
      };

      if (options.signal) {
        const onAbort = () => {
          const idx = this.queue.indexOf(job);
          if (idx >= 0) {
            this.queue.splice(idx, 1);
            this.cancelled += 1;
            reject(new Error('KDF derivation cancelled while queued.'));
          }
          // If already active, worker completion path still releases the slot;
          // the promise is rejected when the abort fires during active work.
        };
        job.onAbort = onAbort;
        options.signal.addEventListener('abort', onAbort, { once: true });
      }

      this.queue.push(job);
      this.peakQueued = Math.max(this.peakQueued, this.queue.length);
      this.pump();
    });
  }

  private pump(): void {
    while (
      this.active < KDF_BOUNDS.MAX_CONCURRENT_DERIVATIONS &&
      this.queue.length > 0
    ) {
      const job = this.queue.shift();
      if (!job) break;

      if (job.signal?.aborted) {
        this.cancelled += 1;
        job.reject(new Error('KDF derivation cancelled while queued.'));
        continue;
      }

      this.active += 1;
      this.peakActive = Math.max(this.peakActive, this.active);
      this.runWorker(job);
    }
  }

  private runWorker(job: QueuedJob): void {
    let promiseSettled = false;
    let slotReleased = false;

    const releaseSlot = () => {
      if (slotReleased) return;
      slotReleased = true;
      if (job.signal && job.onAbort) {
        job.signal.removeEventListener('abort', job.onAbort);
      }
      this.active = Math.max(0, this.active - 1);
      this.pump();
    };

    const resolveOnce = (value: Buffer) => {
      if (promiseSettled) return;
      promiseSettled = true;
      this.completed += 1;
      job.resolve(value);
      releaseSlot();
    };

    const rejectOnce = (err: Error, kind: 'failed' | 'cancelled') => {
      if (promiseSettled) return;
      promiseSettled = true;
      if (kind === 'cancelled') this.cancelled += 1;
      else this.failed += 1;
      job.reject(err);
      releaseSlot();
    };

    const worker = new Worker(WORKER_PATH, {
      workerData: {
        message: job.passphrase,
        salt: job.salt,
        memory: job.memory,
        passes: job.passes,
        parallelism: job.parallelism,
        tagLength: job.tagLength,
      },
    });

    const onAbortActive = () => {
      rejectOnce(new Error('KDF derivation cancelled while active.'), 'cancelled');
      void worker.terminate();
    };
    if (job.signal) {
      job.signal.addEventListener('abort', onAbortActive, { once: true });
    }

    worker.on('message', (msg: { ok: boolean; key?: Buffer; error?: string }) => {
      if (job.signal?.aborted) {
        rejectOnce(new Error('KDF derivation cancelled while active.'), 'cancelled');
        return;
      }
      if (msg.ok && msg.key) {
        resolveOnce(Buffer.from(msg.key));
      } else {
        rejectOnce(new Error(msg.error || 'KDF worker failed.'), 'failed');
      }
    });

    worker.on('error', (err) => {
      rejectOnce(
        err instanceof Error ? err : new Error(String(err)),
        'failed'
      );
    });

    worker.on('exit', (code) => {
      if (!promiseSettled) {
        rejectOnce(
          new Error(`KDF worker exited unexpectedly with code ${code}.`),
          'failed'
        );
      } else if (!slotReleased) {
        releaseSlot();
      }
    });
  }
}

/** Process-wide candidate scheduler used by deriveKeyArgon2idLimited. */
export const defaultArgon2idScheduler = new Argon2idDerivationScheduler();

export async function deriveKeyArgon2idLimited(
  passphrase: string | Buffer,
  salt: Buffer,
  options: Argon2idJobOptions = {}
): Promise<Buffer> {
  return defaultArgon2idScheduler.derive(passphrase, salt, options);
}

export function getSchedulerStats(): SchedulerStats {
  return defaultArgon2idScheduler.getStats();
}
