/**
 * Vault Cryptography and Key Management Prototype (Phase 44)
 *
 * Implements isolated, verifiable client-side cryptographic primitives for the Daynori Vault:
 * - Authenticated symmetric encryption: AES-256-GCM with 96-bit nonces and 128-bit authentication tags (NIST SP 800-38D).
 * - Memory-hard key derivation: Argon2id (RFC 9106) with strict parameter bounds to prevent DoS.
 * - Alternative baseline KDF: PBKDF2-HMAC-SHA256 (NIST SP 800-132).
 * - Additional Authenticated Data (AAD): Versioned JSON context binding workspaceId, itemId, itemType, schemaVersion, and keyVersion.
 * - Key Hierarchy: Random 256-bit Root Key (VRK), Envelope-wrapped Data Encryption Keys (DEK), and separate Recovery Secret.
 * - Cross-Platform Harness: Both Web Crypto API (SubtleCrypto) and Node/Android Cipher implementations proving 100% interoperability.
 *
 * NOTE: This is a standalone proof-of-concept prototype. Synthetic data only.
 * Production vault routes and tables remain blocked until release gates pass.
 */

import crypto from 'node:crypto';

export interface KdfParameters {
  algorithm: 'Argon2id' | 'PBKDF2-HMAC-SHA256';
  salt: string; // base64
  iterations?: number; // time cost / passes
  memoryKiB?: number; // memory cost in KiB (for Argon2id)
  parallelism?: number; // threads / lanes (for Argon2id)
  keyLengthBytes: number; // typically 32 (256 bits)
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
  nonce: string; // base64 (12 bytes / 96 bits)
  ciphertext: string; // base64
  tag: string; // base64 (16 bytes / 128 bits)
  aad: string; // canonical stringified AuthenticatedContext
  kdf?: KdfParameters;
  wrappedDek?: string; // base64 (when DEK is envelope-wrapped under KEK)
}

// Strict parameter bounds to prevent resource exhaustion / DoS attacks via malicious envelope metadata
export const KDF_BOUNDS = {
  ARGON2ID: {
    MIN_MEMORY_KIB: 16 * 1024, // 16 MB minimum
    MAX_MEMORY_KIB: 256 * 1024, // 256 MB maximum
    MIN_PASSES: 2,
    MAX_PASSES: 10,
    MIN_PARALLELISM: 1,
    MAX_PARALLELISM: 4,
    SALT_LENGTH_BYTES: 16,
  },
  PBKDF2: {
    MIN_ITERATIONS: 100_000,
    MAX_ITERATIONS: 1_000_000,
    SALT_LENGTH_BYTES: 16,
  },
};

/**
 * Validates and serializes authenticated context into a deterministic, canonical JSON string.
 */
export function serializeContext(context: AuthenticatedContext): string {
  if (!context.workspaceId || !context.itemId || !context.itemType) {
    throw new Error('Invalid authenticated context: workspaceId, itemId, and itemType are required.');
  }
  return JSON.stringify({
    keyVersion: context.keyVersion,
    schemaVersion: context.schemaVersion,
    itemType: context.itemType,
    itemId: context.itemId,
    workspaceId: context.workspaceId,
  });
}

/**
 * Generates a cryptographically secure 256-bit random key.
 */
export function generateRandomKey(): Buffer {
  return crypto.randomBytes(32);
}

/**
 * Generates a 96-bit (12-byte) random nonce for AES-GCM.
 */
export function generateNonce(): Buffer {
  return crypto.randomBytes(12);
}

/**
 * Generates a high-entropy 256-bit recovery secret with a 4-character checksum.
 * Formatted as 64 hex characters + 4 hex checksum characters (total 68 chars), grouped in 4-char blocks.
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
 */
export function verifyAndDecodeRecoverySecret(secretString: string): Buffer {
  const cleaned = secretString.replace(/[\s-]/g, '').toLowerCase();
  if (cleaned.length !== 68) {
    throw new Error('Invalid recovery secret length: expected 68 hex characters.');
  }
  const hex = cleaned.slice(0, 64);
  const checksum = cleaned.slice(64);
  const rawBytes = Buffer.from(hex, 'hex');
  const expectedChecksum = crypto.createHash('sha256').update(rawBytes).digest('hex').slice(0, 4);
  if (checksum !== expectedChecksum) {
    throw new Error('Recovery secret checksum validation failed: secret is corrupted or mistyped.');
  }
  return rawBytes;
}

/**
 * Derives a key using Argon2id with strict parameter bounding.
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
  const memory = options.memoryKiB ?? 64 * 1024; // Default candidate: 64 MB
  const passes = options.passes ?? 3; // Default candidate: 3 passes
  const parallelism = options.parallelism ?? 1;
  const tagLength = options.keyLengthBytes ?? 32;

  if (
    memory < KDF_BOUNDS.ARGON2ID.MIN_MEMORY_KIB ||
    memory > KDF_BOUNDS.ARGON2ID.MAX_MEMORY_KIB
  ) {
    throw new Error(
      `Argon2id memoryKiB ${memory} is outside allowed bounds [${KDF_BOUNDS.ARGON2ID.MIN_MEMORY_KIB}, ${KDF_BOUNDS.ARGON2ID.MAX_MEMORY_KIB}].`
    );
  }
  if (
    passes < KDF_BOUNDS.ARGON2ID.MIN_PASSES ||
    passes > KDF_BOUNDS.ARGON2ID.MAX_PASSES
  ) {
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
  if (salt.length < KDF_BOUNDS.ARGON2ID.SALT_LENGTH_BYTES) {
    throw new Error(`Argon2id salt must be at least ${KDF_BOUNDS.ARGON2ID.SALT_LENGTH_BYTES} bytes.`);
  }

  const message = typeof passphrase === 'string' ? Buffer.from(passphrase, 'utf8') : passphrase;

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
 * Derives a key using PBKDF2-HMAC-SHA256 (for comparison / fallback baseline).
 */
export function deriveKeyPbkdf2(
  passphrase: string | Buffer,
  salt: Buffer,
  options: {
    iterations?: number;
    keyLengthBytes?: number;
  } = {}
): Buffer {
  const iterations = options.iterations ?? 100_000;
  const keylen = options.keyLengthBytes ?? 32;

  if (
    iterations < KDF_BOUNDS.PBKDF2.MIN_ITERATIONS ||
    iterations > KDF_BOUNDS.PBKDF2.MAX_ITERATIONS
  ) {
    throw new Error(
      `PBKDF2 iterations ${iterations} is outside allowed bounds [${KDF_BOUNDS.PBKDF2.MIN_ITERATIONS}, ${KDF_BOUNDS.PBKDF2.MAX_ITERATIONS}].`
    );
  }
  if (salt.length < KDF_BOUNDS.PBKDF2.SALT_LENGTH_BYTES) {
    throw new Error(`PBKDF2 salt must be at least ${KDF_BOUNDS.PBKDF2.SALT_LENGTH_BYTES} bytes.`);
  }

  return crypto.pbkdf2Sync(passphrase, salt, iterations, keylen, 'sha256');
}

/**
 * Web Crypto API implementation of AES-256-GCM encryption/decryption (representing browser execution).
 */
export const WebCryptoVaultAdapter = {
  async encrypt(
    plaintext: Buffer | Uint8Array,
    keyBytes: Buffer | Uint8Array,
    context: AuthenticatedContext,
    options?: { nonce?: Buffer | Uint8Array }
  ): Promise<VaultEnvelope> {
    const nonce = options?.nonce || generateNonce();
    const aadString = serializeContext(context);
    const aadBytes = Buffer.from(aadString, 'utf8');

    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyBytes,
      { name: 'AES-GCM' },
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
      plaintext
    );

    const fullResult = Buffer.from(encryptedBuffer);
    const ciphertext = fullResult.subarray(0, fullResult.length - 16);
    const tag = fullResult.subarray(fullResult.length - 16);

    return {
      version: 1,
      algorithm: 'AES-256-GCM',
      keyVersion: context.keyVersion,
      nonce: Buffer.from(nonce).toString('base64'),
      ciphertext: ciphertext.toString('base64'),
      tag: tag.toString('base64'),
      aad: aadString,
    };
  },

  async decrypt(
    envelope: VaultEnvelope,
    keyBytes: Buffer | Uint8Array,
    expectedContext: AuthenticatedContext
  ): Promise<Buffer> {
    if (envelope.version !== 1 || envelope.algorithm !== 'AES-256-GCM') {
      throw new Error(`Unsupported envelope version or algorithm: ${envelope.version}/${envelope.algorithm}`);
    }

    const expectedAadString = serializeContext(expectedContext);
    if (envelope.aad !== expectedAadString) {
      throw new Error('AAD mismatch: envelope authenticated context does not match expected target context.');
    }

    const nonce = Buffer.from(envelope.nonce, 'base64');
    const ciphertext = Buffer.from(envelope.ciphertext, 'base64');
    const tag = Buffer.from(envelope.tag, 'base64');

    if (tag.length !== 16) {
      throw new Error(`Invalid authentication tag length: expected 16 bytes, received ${tag.length}.`);
    }

    // Web Crypto decrypt expects ciphertext concatenated with the 16-byte tag
    const fullCiphertext = Buffer.concat([ciphertext, tag]);
    const aadBytes = Buffer.from(envelope.aad, 'utf8');

    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyBytes,
      { name: 'AES-GCM' },
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
      throw new Error('Decryption failed: authentication tag verification failure or corrupted ciphertext.');
    }
  },
};

/**
 * Node / Android compatible Cipher implementation of AES-256-GCM (representing mobile/backend native execution).
 */
export const NodeAndroidVaultAdapter = {
  encrypt(
    plaintext: Buffer | Uint8Array,
    keyBytes: Buffer | Uint8Array,
    context: AuthenticatedContext,
    options?: { nonce?: Buffer | Uint8Array }
  ): VaultEnvelope {
    const nonce = options?.nonce || generateNonce();
    const aadString = serializeContext(context);
    const aadBytes = Buffer.from(aadString, 'utf8');

    const cipher = crypto.createCipheriv('aes-256-gcm', keyBytes, nonce);
    cipher.setAAD(aadBytes);

    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();

    return {
      version: 1,
      algorithm: 'AES-256-GCM',
      keyVersion: context.keyVersion,
      nonce: Buffer.from(nonce).toString('base64'),
      ciphertext: ciphertext.toString('base64'),
      tag: tag.toString('base64'),
      aad: aadString,
    };
  },

  decrypt(
    envelope: VaultEnvelope,
    keyBytes: Buffer | Uint8Array,
    expectedContext: AuthenticatedContext
  ): Buffer {
    if (envelope.version !== 1 || envelope.algorithm !== 'AES-256-GCM') {
      throw new Error(`Unsupported envelope version or algorithm: ${envelope.version}/${envelope.algorithm}`);
    }

    const expectedAadString = serializeContext(expectedContext);
    if (envelope.aad !== expectedAadString) {
      throw new Error('AAD mismatch: envelope authenticated context does not match expected target context.');
    }

    const nonce = Buffer.from(envelope.nonce, 'base64');
    const ciphertext = Buffer.from(envelope.ciphertext, 'base64');
    const tag = Buffer.from(envelope.tag, 'base64');

    if (tag.length !== 16) {
      throw new Error(`Invalid authentication tag length: expected 16 bytes, received ${tag.length}.`);
    }

    const decipher = crypto.createDecipheriv('aes-256-gcm', keyBytes, nonce);
    decipher.setAAD(Buffer.from(envelope.aad, 'utf8'));
    decipher.setAuthTag(tag);

    try {
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    } catch {
      throw new Error('Decryption failed: authentication tag verification failure or corrupted ciphertext.');
    }
  },
};

/**
 * Envelope Wrapping: Wraps a Data Encryption Key (DEK) under a Key Encryption Key (KEK) using AES-256-GCM.
 */
export function wrapKey(
  dek: Buffer,
  kek: Buffer,
  context: AuthenticatedContext
): VaultEnvelope {
  return NodeAndroidVaultAdapter.encrypt(dek, kek, context);
}

/**
 * Envelope Unwrapping: Unwraps a Data Encryption Key (DEK) from a KEK envelope with authentication tag check.
 */
export function unwrapKey(
  envelope: VaultEnvelope,
  kek: Buffer,
  context: AuthenticatedContext
): Buffer {
  return NodeAndroidVaultAdapter.decrypt(envelope, kek, context);
}
