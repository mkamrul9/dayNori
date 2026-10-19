/**
 * Vault Cryptography and Key Management Prototype (Phase 44)
 *
 * Isolated, verifiable client-side cryptographic primitives for the Daynori Vault.
 * This is a standalone proof-of-concept. Synthetic data only.
 * Production vault routes and tables remain blocked until release gates pass.
 *
 * Platform naming (honest attribution):
 * - NodeWebCryptoVaultAdapter: Node.js Web Crypto API (SubtleCrypto) — NOT a browser runtime.
 * - NodeCreateCipherivVaultAdapter: Node.js createCipheriv/createDecipheriv — NOT Android.
 * Node↔Node interoperability is useful format evidence; it does not establish browser↔Android execution.
 */

import crypto from 'node:crypto';

/** Explicit AES-256-GCM envelope profile — no silent downgrade. */
export const ENVELOPE_PROFILE = {
  version: 1 as const,
  algorithm: 'AES-256-GCM' as const,
  keyLengthBytes: 32,
  nonceLengthBytes: 12,
  tagLengthBytes: 16,
  /** Maximum accepted ciphertext payload (bytes) before crypto work. */
  maxCiphertextBytes: 16 * 1024 * 1024,
  /** Maximum accepted AAD string length (UTF-8 bytes). */
  maxAadBytes: 4096,
  /** Maximum accepted base64 field character length (rough bound). */
  maxBase64FieldChars: 24 * 1024 * 1024,
} as const;

/** Application KDF policy — never used for published low-cost reference vectors. */
export const KDF_BOUNDS = {
  ARGON2ID: {
    MIN_MEMORY_KIB: 16 * 1024,
    MAX_MEMORY_KIB: 256 * 1024,
    MIN_PASSES: 2,
    MAX_PASSES: 10,
    MIN_PARALLELISM: 1,
    MAX_PARALLELISM: 4,
    SALT_LENGTH_BYTES: 16,
    MAX_SALT_LENGTH_BYTES: 64,
    KEY_LENGTH_BYTES: 32,
    MAX_PASSPHRASE_BYTES: 1024,
  },
  PBKDF2: {
    MIN_ITERATIONS: 100_000,
    MAX_ITERATIONS: 1_000_000,
    SALT_LENGTH_BYTES: 16,
    MAX_SALT_LENGTH_BYTES: 64,
    KEY_LENGTH_BYTES: 32,
    MAX_PASSPHRASE_BYTES: 1024,
  },
  /** Max concurrent application Argon2id derivations in this process. */
  MAX_CONCURRENT_DERIVATIONS: 2,
  /** Max queued derivations waiting for a slot (unbounded waiters are rejected). */
  MAX_QUEUED_DERIVATIONS: 4,
} as const;

/** Key-wrapping purpose tags — must appear in authenticated context itemType. */
export const KEY_WRAP_PURPOSE = {
  DEK_UNDER_VRK: 'wrap:dek_under_vrk',
  VRK_UNDER_PASSPHRASE: 'wrap:vrk_under_passphrase',
  VRK_UNDER_RECOVERY: 'wrap:vrk_under_recovery',
} as const;

export type KeyWrapPurpose = (typeof KEY_WRAP_PURPOSE)[keyof typeof KEY_WRAP_PURPOSE];

export interface KdfParameters {
  algorithm: 'Argon2id' | 'PBKDF2-HMAC-SHA256';
  salt: string; // base64
  iterations?: number;
  memoryKiB?: number;
  parallelism?: number;
  keyLengthBytes: number;
}

export interface AuthenticatedContext {
  workspaceId: string;
  itemId: string;
  itemType: string;
  schemaVersion: number;
  keyVersion: number;
}

export interface VaultEnvelope {
  version: 1;
  algorithm: 'AES-256-GCM';
  keyVersion: number;
  nonce: string; // base64 (exactly 12 bytes)
  ciphertext: string; // base64
  tag: string; // base64 (exactly 16 bytes)
  aad: string; // canonical stringified AuthenticatedContext
  kdf?: KdfParameters;
  wrappedDek?: string;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ITEM_TYPE_RE = /^[a-z][a-z0-9_:]{0,63}$/;
const STRICT_HEX_RE = /^[0-9a-f]+$/;
const STRICT_BASE64_RE = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

/** Finite positive integer (rejects NaN, Infinity, fractions, non-numbers). */
export function assertFinitePositiveInteger(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a finite positive integer; received ${String(value)}.`);
  }
  return value;
}

/**
 * Strict base64 decode.
 * Authenticated empty AES-GCM payloads use an empty ciphertext string (`""` → 0 bytes).
 * Nonce and tag fields must never be empty — pass `allowEmpty: false` (default).
 */
export function decodeStrictBase64(
  value: string,
  fieldName: string,
  options: { allowEmpty?: boolean } = {}
): Buffer {
  if (typeof value !== 'string') {
    throw new Error(`Invalid ${fieldName}: non-string base64.`);
  }
  if (value.length === 0) {
    if (options.allowEmpty) {
      return Buffer.alloc(0);
    }
    throw new Error(`Invalid ${fieldName}: empty base64 is not permitted for this field.`);
  }
  if (value.length > ENVELOPE_PROFILE.maxBase64FieldChars) {
    throw new Error(`Invalid ${fieldName}: exceeds maximum encoding length.`);
  }
  if (value.includes('\n') || value.includes('\r') || value.includes(' ')) {
    throw new Error(`Invalid ${fieldName}: whitespace is not permitted in base64 fields.`);
  }
  if (!STRICT_BASE64_RE.test(value)) {
    throw new Error(`Invalid ${fieldName}: malformed base64 encoding.`);
  }
  const decoded = Buffer.from(value, 'base64');
  // Round-trip check rejects non-canonical / truncated base64 that Node silently accepts.
  if (decoded.toString('base64') !== value) {
    throw new Error(`Invalid ${fieldName}: non-canonical or truncated base64 encoding.`);
  }
  return decoded;
}

function assertAes256Key(keyBytes: Buffer | Uint8Array): Buffer {
  const key = Buffer.from(keyBytes);
  if (key.length !== ENVELOPE_PROFILE.keyLengthBytes) {
    throw new Error(
      `AES-256-GCM requires exactly ${ENVELOPE_PROFILE.keyLengthBytes}-byte keys; received ${key.length}.`
    );
  }
  return key;
}

function assertNonce(nonce: Buffer | Uint8Array): Buffer {
  const n = Buffer.from(nonce);
  if (n.length !== ENVELOPE_PROFILE.nonceLengthBytes) {
    throw new Error(
      `AES-256-GCM profile requires exactly ${ENVELOPE_PROFILE.nonceLengthBytes}-byte nonces; received ${n.length}.`
    );
  }
  return n;
}

/**
 * Validates and serializes authenticated context into a deterministic, canonical JSON string.
 */
export function serializeContext(context: AuthenticatedContext): string {
  if (!context || typeof context !== 'object') {
    throw new Error('Invalid authenticated context: object required.');
  }
  if (typeof context.workspaceId !== 'string' || !UUID_RE.test(context.workspaceId)) {
    throw new Error('Invalid authenticated context: workspaceId must be a UUID.');
  }
  if (typeof context.itemId !== 'string' || context.itemId.length < 1 || context.itemId.length > 128) {
    throw new Error('Invalid authenticated context: itemId must be a non-empty identifier ≤ 128 chars.');
  }
  if (typeof context.itemType !== 'string' || !ITEM_TYPE_RE.test(context.itemType)) {
    throw new Error('Invalid authenticated context: itemType must match [a-z][a-z0-9_:]{0,63}.');
  }
  assertFinitePositiveInteger(context.schemaVersion, 'schemaVersion');
  assertFinitePositiveInteger(context.keyVersion, 'keyVersion');

  return JSON.stringify({
    keyVersion: context.keyVersion,
    schemaVersion: context.schemaVersion,
    itemType: context.itemType,
    itemId: context.itemId,
    workspaceId: context.workspaceId,
  });
}

/**
 * Validates outer envelope metadata against the fixed profile and expected AAD context.
 * Rejects before expensive cryptographic work.
 */
export function validateEnvelopeStructure(
  envelope: VaultEnvelope,
  expectedContext: AuthenticatedContext
): {
  nonce: Buffer;
  ciphertext: Buffer;
  tag: Buffer;
  aadString: string;
} {
  if (!envelope || typeof envelope !== 'object') {
    throw new Error('Invalid envelope: object required.');
  }
  if (envelope.version !== ENVELOPE_PROFILE.version) {
    throw new Error(`Unsupported envelope version: ${String(envelope.version)}.`);
  }
  if (envelope.algorithm !== ENVELOPE_PROFILE.algorithm) {
    throw new Error(`Unsupported envelope algorithm: ${String(envelope.algorithm)}.`);
  }
  assertFinitePositiveInteger(envelope.keyVersion, 'envelope.keyVersion');

  const expectedAadString = serializeContext(expectedContext);
  if (envelope.keyVersion !== expectedContext.keyVersion) {
    throw new Error(
      `Envelope keyVersion ${envelope.keyVersion} is inconsistent with authenticated context keyVersion ${expectedContext.keyVersion}.`
    );
  }
  if (typeof envelope.aad !== 'string' || envelope.aad !== expectedAadString) {
    throw new Error('AAD mismatch: envelope authenticated context does not match expected target context.');
  }
  const aadBytes = Buffer.byteLength(envelope.aad, 'utf8');
  if (aadBytes > ENVELOPE_PROFILE.maxAadBytes) {
    throw new Error(`AAD exceeds maximum size of ${ENVELOPE_PROFILE.maxAadBytes} bytes.`);
  }

  // Nonce and tag must be non-empty encodings. Ciphertext may be empty for AEAD of zero-length PT.
  const nonce = decodeStrictBase64(envelope.nonce, 'nonce', { allowEmpty: false });
  const ciphertext = decodeStrictBase64(envelope.ciphertext, 'ciphertext', { allowEmpty: true });
  const tag = decodeStrictBase64(envelope.tag, 'tag', { allowEmpty: false });

  if (nonce.length !== ENVELOPE_PROFILE.nonceLengthBytes) {
    throw new Error(
      `Invalid nonce length: expected ${ENVELOPE_PROFILE.nonceLengthBytes} bytes, received ${nonce.length}.`
    );
  }
  if (tag.length !== ENVELOPE_PROFILE.tagLengthBytes) {
    throw new Error(
      `Invalid authentication tag length: expected ${ENVELOPE_PROFILE.tagLengthBytes} bytes, received ${tag.length}.`
    );
  }
  if (ciphertext.length > ENVELOPE_PROFILE.maxCiphertextBytes) {
    throw new Error(
      `Ciphertext exceeds maximum size of ${ENVELOPE_PROFILE.maxCiphertextBytes} bytes.`
    );
  }

  return { nonce, ciphertext, tag, aadString: envelope.aad };
}

export function generateRandomKey(): Buffer {
  return crypto.randomBytes(ENVELOPE_PROFILE.keyLengthBytes);
}

export function generateNonce(): Buffer {
  return crypto.randomBytes(ENVELOPE_PROFILE.nonceLengthBytes);
}

/**
 * Generates a high-entropy 256-bit recovery secret with a 4-hex-char checksum.
 * Format: 64 hex chars + 4 checksum hex chars, grouped as 17 blocks of 4 separated by '-'.
 *
 * The checksum detects transcription errors only; it does not authenticate a recovery package.
 */
export function generateRecoverySecret(): { secret: string; rawBytes: Buffer } {
  const rawBytes = crypto.randomBytes(32);
  const hex = rawBytes.toString('hex');
  const checksum = crypto.createHash('sha256').update(rawBytes).digest('hex').slice(0, 4);
  const combined = hex + checksum;
  const grouped = combined.match(/.{1,4}/g)?.join('-') || combined;
  return { secret: grouped, rawBytes };
}

/**
 * Verifies and decodes a recovery secret string.
 * Accepts only hexadecimal digits with optional '-' or ASCII space separators.
 * Requires exactly 32 decoded bytes after checksum verification.
 */
export function verifyAndDecodeRecoverySecret(secretString: string): Buffer {
  if (typeof secretString !== 'string' || secretString.length === 0) {
    throw new Error('Invalid recovery secret: non-empty string required.');
  }
  if (secretString.length > 200) {
    throw new Error('Invalid recovery secret: input exceeds maximum length.');
  }
  // Only allow hex digits and optional grouping separators (hyphen / ASCII space).
  if (!/^[0-9a-fA-F\s-]+$/.test(secretString)) {
    throw new Error('Invalid recovery secret: only hexadecimal digits and hyphen/space separators are allowed.');
  }

  const cleaned = secretString.replace(/[\s-]/g, '').toLowerCase();
  if (cleaned.length !== 68) {
    throw new Error('Invalid recovery secret length: expected 68 hex characters.');
  }
  if (!STRICT_HEX_RE.test(cleaned)) {
    throw new Error('Invalid recovery secret: non-hexadecimal characters after separator removal.');
  }

  const hex = cleaned.slice(0, 64);
  const checksum = cleaned.slice(64);
  // Strict even-length hex decode — reject partial/invalid pairs before hashing.
  if (hex.length % 2 !== 0) {
    throw new Error('Invalid recovery secret: hex payload must have even length.');
  }
  const rawBytes = Buffer.from(hex, 'hex');
  if (rawBytes.length !== 32) {
    throw new Error(
      `Invalid recovery secret: expected exactly 32 decoded bytes, received ${rawBytes.length}.`
    );
  }
  // Ensure Buffer.from did not silently drop invalid pairs (defense in depth).
  if (rawBytes.toString('hex') !== hex) {
    throw new Error('Invalid recovery secret: hex decoding lost or altered bytes.');
  }

  const expectedChecksum = crypto.createHash('sha256').update(rawBytes).digest('hex').slice(0, 4);
  if (checksum !== expectedChecksum) {
    throw new Error('Recovery secret checksum validation failed: secret is corrupted or mistyped.');
  }
  return rawBytes;
}

function validatePassphraseInput(passphrase: string | Buffer): Buffer {
  const message = typeof passphrase === 'string' ? Buffer.from(passphrase, 'utf8') : Buffer.from(passphrase);
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

function validateSalt(salt: Buffer, min: number, max: number, label: string): void {
  if (!Buffer.isBuffer(salt) && !(salt instanceof Uint8Array)) {
    throw new Error(`${label} salt must be a Buffer or Uint8Array.`);
  }
  if (salt.length < min || salt.length > max) {
    throw new Error(`${label} salt length must be between ${min} and ${max} bytes; received ${salt.length}.`);
  }
}

/**
 * RFC 9106 / low-cost reference-vector Argon2id.
 * Intentionally isolated from application KDF policy — do not use for vault unlock.
 */
export function computeArgon2idReferenceVector(options: {
  password: Buffer;
  salt: Buffer;
  secret?: Buffer;
  associatedData?: Buffer;
  memoryKiB: number;
  passes: number;
  parallelism: number;
  tagLength: number;
}): Buffer {
  const memory = assertFinitePositiveInteger(options.memoryKiB, 'memoryKiB');
  const passes = assertFinitePositiveInteger(options.passes, 'passes');
  const parallelism = assertFinitePositiveInteger(options.parallelism, 'parallelism');
  const tagLength = assertFinitePositiveInteger(options.tagLength, 'tagLength');
  if (tagLength > 64) {
    throw new Error('Reference-vector tagLength must be ≤ 64 bytes.');
  }

  return crypto.argon2Sync('argon2id', {
    message: options.password,
    nonce: options.salt,
    secret: options.secret,
    associatedData: options.associatedData,
    memory,
    passes,
    parallelism,
    tagLength,
  });
}

/**
 * Application Argon2id derivation with strict parameter bounding.
 * Does not silently downgrade strength or select a fallback algorithm.
 */
export function deriveKeyArgon2id(
  passphrase: string | Buffer,
  salt: Buffer,
  options: {
    memoryKiB?: number;
    passes?: number;
    parallelism?: number;
    keyLengthBytes?: number;
  } = {}
): Buffer {
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
  validateSalt(
    salt,
    KDF_BOUNDS.ARGON2ID.SALT_LENGTH_BYTES,
    KDF_BOUNDS.ARGON2ID.MAX_SALT_LENGTH_BYTES,
    'Argon2id'
  );
  const message = validatePassphraseInput(passphrase);

  return crypto.argon2Sync('argon2id', {
    message,
    nonce: salt,
    memory,
    passes,
    parallelism,
    tagLength,
  });
}

/**
 * PBKDF2-HMAC-SHA256 comparative baseline (application bounds).
 * Not a silent fallback for Argon2id failures.
 */
export function deriveKeyPbkdf2(
  passphrase: string | Buffer,
  salt: Buffer,
  options: {
    iterations?: number;
    keyLengthBytes?: number;
  } = {}
): Buffer {
  const iterations = assertFinitePositiveInteger(
    options.iterations ?? 100_000,
    'PBKDF2 iterations'
  );
  const keylen = assertFinitePositiveInteger(
    options.keyLengthBytes ?? KDF_BOUNDS.PBKDF2.KEY_LENGTH_BYTES,
    'PBKDF2 keyLengthBytes'
  );

  if (
    iterations < KDF_BOUNDS.PBKDF2.MIN_ITERATIONS ||
    iterations > KDF_BOUNDS.PBKDF2.MAX_ITERATIONS
  ) {
    throw new Error(
      `PBKDF2 iterations ${iterations} is outside allowed bounds [${KDF_BOUNDS.PBKDF2.MIN_ITERATIONS}, ${KDF_BOUNDS.PBKDF2.MAX_ITERATIONS}].`
    );
  }
  if (keylen !== KDF_BOUNDS.PBKDF2.KEY_LENGTH_BYTES) {
    throw new Error(
      `PBKDF2 application keyLengthBytes must be exactly ${KDF_BOUNDS.PBKDF2.KEY_LENGTH_BYTES}; received ${keylen}. No silent downgrade.`
    );
  }
  validateSalt(
    salt,
    KDF_BOUNDS.PBKDF2.SALT_LENGTH_BYTES,
    KDF_BOUNDS.PBKDF2.MAX_SALT_LENGTH_BYTES,
    'PBKDF2'
  );
  const message = validatePassphraseInput(passphrase);

  return crypto.pbkdf2Sync(message, salt, iterations, keylen, 'sha256');
}

function buildEnvelope(
  context: AuthenticatedContext,
  nonce: Buffer,
  ciphertext: Buffer,
  tag: Buffer,
  aadString: string
): VaultEnvelope {
  return {
    version: ENVELOPE_PROFILE.version,
    algorithm: ENVELOPE_PROFILE.algorithm,
    keyVersion: context.keyVersion,
    nonce: nonce.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
    tag: tag.toString('base64'),
    aad: aadString,
  };
}

/**
 * Node.js Web Crypto API adapter (SubtleCrypto).
 * Runs in Node — not evidence of browser execution.
 */
export const NodeWebCryptoVaultAdapter = {
  async encrypt(
    plaintext: Buffer | Uint8Array,
    keyBytes: Buffer | Uint8Array,
    context: AuthenticatedContext,
    options?: { nonce?: Buffer | Uint8Array }
  ): Promise<VaultEnvelope> {
    const key = assertAes256Key(keyBytes);
    const nonce = assertNonce(options?.nonce || generateNonce());
    const aadString = serializeContext(context);
    const aadBytes = Buffer.from(aadString, 'utf8');
    const pt = Buffer.from(plaintext);
    if (pt.length > ENVELOPE_PROFILE.maxCiphertextBytes) {
      throw new Error('Plaintext exceeds maximum envelope payload size.');
    }

    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      key,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt']
    );

    const encryptedBuffer = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: nonce,
        additionalData: aadBytes,
        tagLength: 128,
      },
      cryptoKey,
      pt
    );

    const fullResult = Buffer.from(encryptedBuffer);
    const ciphertext = fullResult.subarray(0, fullResult.length - ENVELOPE_PROFILE.tagLengthBytes);
    const tag = fullResult.subarray(fullResult.length - ENVELOPE_PROFILE.tagLengthBytes);

    return buildEnvelope(context, nonce, ciphertext, tag, aadString);
  },

  async decrypt(
    envelope: VaultEnvelope,
    keyBytes: Buffer | Uint8Array,
    expectedContext: AuthenticatedContext
  ): Promise<Buffer> {
    const key = assertAes256Key(keyBytes);
    const { nonce, ciphertext, tag, aadString } = validateEnvelopeStructure(
      envelope,
      expectedContext
    );

    const fullCiphertext = Buffer.concat([ciphertext, tag]);
    const aadBytes = Buffer.from(aadString, 'utf8');

    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      key,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    );

    try {
      const decrypted = await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: nonce,
          additionalData: aadBytes,
          tagLength: 128,
        },
        cryptoKey,
        fullCiphertext
      );
      return Buffer.from(decrypted);
    } catch {
      throw new Error(
        'Decryption failed: authentication tag verification failure or corrupted ciphertext.'
      );
    }
  },
};

/**
 * Node.js createCipheriv/createDecipheriv adapter.
 * Runs in Node — not evidence of Android/Java/Kotlin crypto execution.
 */
export const NodeCreateCipherivVaultAdapter = {
  encrypt(
    plaintext: Buffer | Uint8Array,
    keyBytes: Buffer | Uint8Array,
    context: AuthenticatedContext,
    options?: { nonce?: Buffer | Uint8Array }
  ): VaultEnvelope {
    const key = assertAes256Key(keyBytes);
    const nonce = assertNonce(options?.nonce || generateNonce());
    const aadString = serializeContext(context);
    const aadBytes = Buffer.from(aadString, 'utf8');
    const pt = Buffer.from(plaintext);
    if (pt.length > ENVELOPE_PROFILE.maxCiphertextBytes) {
      throw new Error('Plaintext exceeds maximum envelope payload size.');
    }

    const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce);
    cipher.setAAD(aadBytes);

    const ciphertext = Buffer.concat([cipher.update(pt), cipher.final()]);
    const tag = cipher.getAuthTag();
    if (tag.length !== ENVELOPE_PROFILE.tagLengthBytes) {
      throw new Error('Unexpected authentication tag length from createCipheriv.');
    }

    return buildEnvelope(context, nonce, ciphertext, tag, aadString);
  },

  decrypt(
    envelope: VaultEnvelope,
    keyBytes: Buffer | Uint8Array,
    expectedContext: AuthenticatedContext
  ): Buffer {
    const key = assertAes256Key(keyBytes);
    const { nonce, ciphertext, tag, aadString } = validateEnvelopeStructure(
      envelope,
      expectedContext
    );

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce);
    decipher.setAAD(Buffer.from(aadString, 'utf8'));
    decipher.setAuthTag(tag);

    try {
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    } catch {
      throw new Error(
        'Decryption failed: authentication tag verification failure or corrupted ciphertext.'
      );
    }
  },
};

/** @deprecated Use NodeWebCryptoVaultAdapter — name falsely implied browser execution. */
export const WebCryptoVaultAdapter = NodeWebCryptoVaultAdapter;
/** @deprecated Use NodeCreateCipherivVaultAdapter — name falsely implied Android execution. */
export const NodeAndroidVaultAdapter = NodeCreateCipherivVaultAdapter;

function assertKeyWrapPurpose(context: AuthenticatedContext, purpose: KeyWrapPurpose): void {
  if (context.itemType !== purpose) {
    throw new Error(
      `Key-wrap purpose mismatch: expected itemType "${purpose}", received "${context.itemType}".`
    );
  }
}

/**
 * Wraps a DEK under a VRK (or similar KEK) with explicit purpose separation.
 */
export function wrapKey(
  dek: Buffer,
  kek: Buffer,
  context: AuthenticatedContext,
  purpose: KeyWrapPurpose = KEY_WRAP_PURPOSE.DEK_UNDER_VRK
): VaultEnvelope {
  assertKeyWrapPurpose(context, purpose);
  if (dek.length !== ENVELOPE_PROFILE.keyLengthBytes) {
    throw new Error(
      `Wrapped key material must be exactly ${ENVELOPE_PROFILE.keyLengthBytes} bytes; received ${dek.length}.`
    );
  }
  return NodeCreateCipherivVaultAdapter.encrypt(dek, kek, context);
}

export function unwrapKey(
  envelope: VaultEnvelope,
  kek: Buffer,
  context: AuthenticatedContext,
  purpose: KeyWrapPurpose = KEY_WRAP_PURPOSE.DEK_UNDER_VRK
): Buffer {
  assertKeyWrapPurpose(context, purpose);
  const unwrapped = NodeCreateCipherivVaultAdapter.decrypt(envelope, kek, context);
  if (unwrapped.length !== ENVELOPE_PROFILE.keyLengthBytes) {
    throw new Error(
      `Unwrapped key must be exactly ${ENVELOPE_PROFILE.keyLengthBytes} bytes; received ${unwrapped.length}.`
    );
  }
  return unwrapped;
}

/**
 * Documents recovery-secret rotation limitation:
 * Rewrapping the same root key under a new recovery secret does NOT invalidate an
 * attacker's previously saved (old envelope + old recovery secret) pair.
 * True invalidation requires root-key rotation and re-encryption of all DEKs/content.
 */
export function documentRecoveryRewrapDoesNotInvalidateOldSecrets(): {
  claim: string;
  limitation: string;
} {
  return {
    claim:
      'Publishing a new recovery envelope for the same VRK does not cryptographically revoke prior recovery envelopes.',
    limitation:
      'An adversary who retained an old recovery secret and its matching envelope can still unwrap the same VRK until the VRK itself is rotated and all dependent ciphertext is re-encrypted under the new hierarchy.',
  };
}
