import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import {
  WebCryptoVaultAdapter,
  NodeAndroidVaultAdapter,
  deriveKeyArgon2id,
  deriveKeyPbkdf2,
  generateRandomKey,
  generateNonce,
  generateRecoverySecret,
  verifyAndDecodeRecoverySecret,
  wrapKey,
  unwrapKey,
  serializeContext,
  KDF_BOUNDS,
  type AuthenticatedContext,
  type VaultEnvelope,
} from './vault/vault-crypto.js';
import { runKdfBenchmark } from './vault/kdf-benchmark.js';

describe('Phase 44 — Vault Cryptography and Recovery Proof', () => {
  const sampleContext: AuthenticatedContext = {
    workspaceId: '11111111-1111-4111-8111-111111111111',
    itemId: '22222222-2222-4222-8222-222222222222',
    itemType: 'vault_note',
    schemaVersion: 1,
    keyVersion: 1,
  };

  describe('1. Standards Compliance and Published Test Vectors', () => {
    it('matches RFC 9106 Argon2id published test vector', () => {
      // RFC 9106 Section 5.3 Test Vector:
      // Type: Argon2id, passes: 3, memory: 32 KiB, parallelism: 4, tagLength: 32
      // Password: 32 bytes of 0x01
      // Salt: 16 bytes of 0x02
      // Expected tag: 03aab965c12001c9d7d0d2de33192c0494b684bb148196d73c1df1acaf6d0c2e
      const password = Buffer.alloc(32, 1);
      const salt = Buffer.alloc(16, 2);

      const derived = crypto.argon2Sync('argon2id', {
        message: password,
        nonce: salt,
        memory: 32,
        passes: 3,
        parallelism: 4,
        tagLength: 32,
      });

      expect(derived.toString('hex')).toBe('03aab965c12001c9d7d0d2de33192c0494b684bb148196d73c1df1acaf6d0c2e');
    });

    it('matches NIST SP 800-38D AES-256-GCM published test vectors', () => {
      // NIST SP 800-38D Appendix B - Test Case 13 (256-bit key, 96-bit IV, empty plaintext, empty AAD)
      const key13 = Buffer.alloc(32, 0);
      const iv13 = Buffer.alloc(12, 0);
      const pt13 = Buffer.alloc(0);

      const cipher13 = crypto.createCipheriv('aes-256-gcm', key13, iv13);
      const ct13 = Buffer.concat([cipher13.update(pt13), cipher13.final()]);
      const tag13 = cipher13.getAuthTag();

      expect(ct13.length).toBe(0);
      expect(tag13.toString('hex')).toBe('530f8afbc74536b9a963b4f1c4cb738b');

      // NIST SP 800-38D Appendix B - Test Case 14 (256-bit key, 96-bit IV, 16 zero bytes)
      const pt14 = Buffer.alloc(16, 0);
      const cipher14 = crypto.createCipheriv('aes-256-gcm', key13, iv13);
      const ct14 = Buffer.concat([cipher14.update(pt14), cipher14.final()]);
      const tag14 = cipher14.getAuthTag();

      expect(ct14.toString('hex')).toBe('cea7403d4d606b6e074ec5d3baf39d18');
      expect(tag14.toString('hex')).toBe('d0d1c8a799996bf0265b98b5d48ab919');
    });
  });

  describe('2. Cross-Platform AEAD Interoperability (WebCrypto vs Node/Android)', () => {
    it('encrypts in WebCrypto (Browser) and decrypts in Node/Android', async () => {
      const dataKey = generateRandomKey();
      const rawText = 'গোপন ভল্ট ডেটা - Synthetic Vault Content with Bangla & Special Characters: 🚀🔒';
      const plaintext = Buffer.from(rawText, 'utf8');

      // Browser encrypts
      const envelope = await WebCryptoVaultAdapter.encrypt(plaintext, dataKey, sampleContext);
      expect(envelope.version).toBe(1);
      expect(envelope.algorithm).toBe('AES-256-GCM');
      expect(Buffer.from(envelope.nonce, 'base64').length).toBe(12);
      expect(Buffer.from(envelope.tag, 'base64').length).toBe(16);

      // Mobile/Android decrypts
      const decrypted = NodeAndroidVaultAdapter.decrypt(envelope, dataKey, sampleContext);
      expect(decrypted.toString('utf8')).toBe(rawText);
    });

    it('encrypts in Node/Android and decrypts in WebCrypto (Browser)', async () => {
      const dataKey = generateRandomKey();
      const rawText = 'Android native cipher envelope payload for browser decryption.';
      const plaintext = Buffer.from(rawText, 'utf8');

      // Android encrypts
      const envelope = NodeAndroidVaultAdapter.encrypt(plaintext, dataKey, sampleContext);

      // Browser decrypts
      const decrypted = await WebCryptoVaultAdapter.decrypt(envelope, dataKey, sampleContext);
      expect(decrypted.toString('utf8')).toBe(rawText);
    });

    it('round-trips binary attachment fixtures', async () => {
      const dataKey = generateRandomKey();
      const binaryPayload = crypto.randomBytes(4096); // 4KB synthetic binary

      const envelope = NodeAndroidVaultAdapter.encrypt(binaryPayload, dataKey, sampleContext);
      const decrypted = await WebCryptoVaultAdapter.decrypt(envelope, dataKey, sampleContext);

      expect(decrypted.equals(binaryPayload)).toBe(true);
    });
  });

  describe('3. Key Hierarchy and Envelope Wrapping', () => {
    it('wraps and unwraps Data Encryption Key (DEK) under Root Key (VRK)', () => {
      const rootKey = generateRandomKey();
      const dek = generateRandomKey();

      const keyWrapContext: AuthenticatedContext = {
        ...sampleContext,
        itemType: 'wrapped_key',
        schemaVersion: 1,
        keyVersion: 1,
      };

      // Wrap DEK with VRK
      const wrappedKeyEnvelope = wrapKey(dek, rootKey, keyWrapContext);
      expect(wrappedKeyEnvelope.ciphertext).toBeDefined();
      expect(wrappedKeyEnvelope.tag).toBeDefined();

      // Unwrap DEK
      const unwrappedDek = unwrapKey(wrappedKeyEnvelope, rootKey, keyWrapContext);
      expect(unwrappedDek.equals(dek)).toBe(true);
    });

    it('generates high-entropy recovery secret with verified checksum', () => {
      const { secret, rawBytes } = generateRecoverySecret();

      expect(rawBytes.length).toBe(32); // 256 bits
      expect(secret).toMatch(/^[0-9a-f]{4}(-[0-9a-f]{4}){16}$/); // 17 groups of 4 = 68 hex chars

      // Successful decode
      const decodedBytes = verifyAndDecodeRecoverySecret(secret);
      expect(decodedBytes.equals(rawBytes)).toBe(true);

      // Checksum tamper detection: mutate one character in the secret
      const tamperedSecret = secret.slice(0, 10) + (secret[10] === 'a' ? 'b' : 'a') + secret.slice(11);
      expect(() => verifyAndDecodeRecoverySecret(tamperedSecret)).toThrow(
        /Recovery secret checksum validation failed/
      );
    });

    it('wraps root key with recovery key and restores vault access on fresh device', () => {
      const rootKey = generateRandomKey();
      const { rawBytes: recoverySecretBytes } = generateRecoverySecret();
      const recoverySalt = crypto.randomBytes(16);

      // Derive Recovery Key Encryption Key (KEK) using Argon2id
      const recoveryKek = deriveKeyArgon2id(recoverySecretBytes, recoverySalt, {
        memoryKiB: 16 * 1024,
        passes: 2,
        parallelism: 1,
      });

      const recoveryContext: AuthenticatedContext = {
        workspaceId: sampleContext.workspaceId,
        itemId: 'vault-root-recovery-envelope',
        itemType: 'recovery_root_key',
        schemaVersion: 1,
        keyVersion: 1,
      };

      // Wrap root key under recovery KEK
      const recoveryEnvelope = wrapKey(rootKey, recoveryKek, recoveryContext);

      // Simulate recovery on fresh device: derive same recovery KEK from recovery secret
      const recoveredKek = deriveKeyArgon2id(recoverySecretBytes, recoverySalt, {
        memoryKiB: 16 * 1024,
        passes: 2,
        parallelism: 1,
      });

      const recoveredRootKey = unwrapKey(recoveryEnvelope, recoveredKek, recoveryContext);
      expect(recoveredRootKey.equals(rootKey)).toBe(true);
    });

    it('invalidates prior recovery envelope upon recovery key rotation', () => {
      const rootKey = generateRandomKey();
      const { rawBytes: oldSecret } = generateRecoverySecret();
      const { rawBytes: newSecret } = generateRecoverySecret();
      const salt = crypto.randomBytes(16);

      const oldKek = deriveKeyArgon2id(oldSecret, salt, { memoryKiB: 16 * 1024, passes: 2, parallelism: 1 });
      const newKek = deriveKeyArgon2id(newSecret, salt, { memoryKiB: 16 * 1024, passes: 2, parallelism: 1 });

      const recoveryContext: AuthenticatedContext = {
        workspaceId: sampleContext.workspaceId,
        itemId: 'vault-root-recovery-envelope',
        itemType: 'recovery_root_key',
        schemaVersion: 1,
        keyVersion: 2, // Rotated to version 2
      };

      // Active envelope is wrapped under newKek
      const activeEnvelope = wrapKey(rootKey, newKek, recoveryContext);

      // Old secret cannot unwrap active envelope
      expect(() => unwrapKey(activeEnvelope, oldKek, recoveryContext)).toThrow(
        /Decryption failed: authentication tag verification failure/
      );

      // New secret successfully unwraps active envelope
      const unwrapped = unwrapKey(activeEnvelope, newKek, recoveryContext);
      expect(unwrapped.equals(rootKey)).toBe(true);
    });
  });

  describe('4. Cryptographic Tamper Resistance and AAD Context Binding', () => {
    it('rejects bit-flip in ciphertext', () => {
      const key = generateRandomKey();
      const envelope = NodeAndroidVaultAdapter.encrypt(Buffer.from('sensitive data'), key, sampleContext);

      // Flip 1 bit in ciphertext
      const ctBuf = Buffer.from(envelope.ciphertext, 'base64');
      ctBuf[0] ^= 0x01;
      const tamperedEnvelope: VaultEnvelope = {
        ...envelope,
        ciphertext: ctBuf.toString('base64'),
      };

      expect(() => NodeAndroidVaultAdapter.decrypt(tamperedEnvelope, key, sampleContext)).toThrow(
        /Decryption failed: authentication tag verification failure/
      );
    });

    it('rejects bit-flip in authentication tag', () => {
      const key = generateRandomKey();
      const envelope = NodeAndroidVaultAdapter.encrypt(Buffer.from('sensitive data'), key, sampleContext);

      // Flip 1 bit in tag
      const tagBuf = Buffer.from(envelope.tag, 'base64');
      tagBuf[0] ^= 0x01;
      const tamperedEnvelope: VaultEnvelope = {
        ...envelope,
        tag: tagBuf.toString('base64'),
      };

      expect(() => NodeAndroidVaultAdapter.decrypt(tamperedEnvelope, key, sampleContext)).toThrow(
        /Decryption failed: authentication tag verification failure/
      );
    });

    it('rejects modified AAD context (relocation attack prevention)', () => {
      const key = generateRandomKey();
      const envelope = NodeAndroidVaultAdapter.encrypt(Buffer.from('sensitive data'), key, sampleContext);

      // Attacker tries to decrypt payload in a different workspace or item
      const differentWorkspaceContext: AuthenticatedContext = {
        ...sampleContext,
        workspaceId: '99999999-9999-4999-8999-999999999999',
      };

      expect(() => NodeAndroidVaultAdapter.decrypt(envelope, key, differentWorkspaceContext)).toThrow(
        /AAD mismatch/
      );

      // Attacker tampers with the envelope's aad field to match target
      const tamperedAadEnvelope: VaultEnvelope = {
        ...envelope,
        aad: serializeContext(differentWorkspaceContext),
      };

      // GCM tag verification will now fail because the ciphertext was computed with the original AAD
      expect(() => NodeAndroidVaultAdapter.decrypt(tamperedAadEnvelope, key, differentWorkspaceContext)).toThrow(
        /Decryption failed: authentication tag verification failure/
      );
    });

    it('rejects wrong key or passphrase', () => {
      const key1 = generateRandomKey();
      const key2 = generateRandomKey();

      const envelope = NodeAndroidVaultAdapter.encrypt(Buffer.from('sensitive payload'), key1, sampleContext);

      expect(() => NodeAndroidVaultAdapter.decrypt(envelope, key2, sampleContext)).toThrow(
        /Decryption failed: authentication tag verification failure/
      );
    });

    it('rejects truncated or malformed envelopes', () => {
      const key = generateRandomKey();
      const envelope = NodeAndroidVaultAdapter.encrypt(Buffer.from('sensitive payload'), key, sampleContext);

      // Truncated tag
      const invalidTagEnvelope: VaultEnvelope = {
        ...envelope,
        tag: Buffer.from('short').toString('base64'),
      };
      expect(() => NodeAndroidVaultAdapter.decrypt(invalidTagEnvelope, key, sampleContext)).toThrow(
        /Invalid authentication tag length/
      );

      // Unsupported algorithm
      const invalidAlgoEnvelope = {
        ...envelope,
        algorithm: 'AES-128-CBC' as any,
      };
      expect(() => NodeAndroidVaultAdapter.decrypt(invalidAlgoEnvelope, key, sampleContext)).toThrow(
        /Unsupported envelope version or algorithm/
      );
    });
  });

  describe('5. KDF Bounds and Denial-of-Service Defense', () => {
    const salt = crypto.randomBytes(16);

    it('enforces lower and upper memory bounds on Argon2id', () => {
      // Memory below minimum (16 MB)
      expect(() =>
        deriveKeyArgon2id('passphrase', salt, { memoryKiB: 1024 })
      ).toThrow(/Argon2id memoryKiB 1024 is outside allowed bounds/);

      // Memory above maximum (256 MB)
      expect(() =>
        deriveKeyArgon2id('passphrase', salt, { memoryKiB: 512 * 1024 })
      ).toThrow(/Argon2id memoryKiB 524288 is outside allowed bounds/);
    });

    it('enforces passes and parallelism bounds on Argon2id', () => {
      // Passes below minimum (2)
      expect(() =>
        deriveKeyArgon2id('passphrase', salt, { passes: 1, memoryKiB: 16 * 1024 })
      ).toThrow(/Argon2id passes 1 is outside allowed bounds/);

      // Passes above maximum (10)
      expect(() =>
        deriveKeyArgon2id('passphrase', salt, { passes: 20, memoryKiB: 16 * 1024 })
      ).toThrow(/Argon2id passes 20 is outside allowed bounds/);

      // Parallelism above maximum (4)
      expect(() =>
        deriveKeyArgon2id('passphrase', salt, { parallelism: 16, memoryKiB: 16 * 1024 })
      ).toThrow(/Argon2id parallelism 16 is outside allowed bounds/);
    });

    it('enforces salt length constraints', () => {
      const shortSalt = crypto.randomBytes(8);
      expect(() =>
        deriveKeyArgon2id('passphrase', shortSalt, { memoryKiB: 16 * 1024 })
      ).toThrow(/Argon2id salt must be at least 16 bytes/);
    });

    it('enforces PBKDF2 iteration bounds', () => {
      expect(() =>
        deriveKeyPbkdf2('passphrase', salt, { iterations: 1000 })
      ).toThrow(/PBKDF2 iterations 1000 is outside allowed bounds/);

      expect(() =>
        deriveKeyPbkdf2('passphrase', salt, { iterations: 5_000_000 })
      ).toThrow(/PBKDF2 iterations 5000000 is outside allowed bounds/);
    });
  });

  describe('6. KDF Benchmark Profiling', () => {
    it('executes KDF benchmark across candidate parameters and measures latency', () => {
      const results = runKdfBenchmark(2);
      expect(results.length).toBe(4);

      for (const res of results) {
        expect(res.samples).toBe(2);
        expect(res.avgDurationMs).toBeGreaterThan(0);
        expect(res.minDurationMs).toBeLessThanOrEqual(res.maxDurationMs);
      }

      // Verify Argon2id Candidate Production settings
      const argonProd = results.find((r) => r.algorithm === 'Argon2id Candidate Production');
      expect(argonProd).toBeDefined();
      expect(argonProd?.parameters.memoryKiB).toBe(65536);
      expect(argonProd?.parameters.passes).toBe(3);

      // Verify PBKDF2 100k
      const pbkdf2 = results.find((r) => r.algorithm === 'PBKDF2-HMAC-SHA256 (100k)');
      expect(pbkdf2).toBeDefined();
    });
  });
});
