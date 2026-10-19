/**
 * Worker-thread Argon2id derivation (CommonJS for Worker entry without TS loader).
 * Isolated Phase 44 candidate — not production unlock code.
 */
'use strict';

const { parentPort, workerData } = require('node:worker_threads');
const crypto = require('node:crypto');

try {
  const { message, salt, memory, passes, parallelism, tagLength } = workerData;
  const derived = crypto.argon2Sync('argon2id', {
    message: Buffer.from(message),
    nonce: Buffer.from(salt),
    memory,
    passes,
    parallelism,
    tagLength,
  });
  parentPort.postMessage({ ok: true, key: Buffer.from(derived) });
} catch (err) {
  parentPort.postMessage({
    ok: false,
    error: err && err.message ? String(err.message) : String(err),
  });
}
