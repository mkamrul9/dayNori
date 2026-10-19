import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import {
  NodeWebCryptoVaultAdapter,
  NodeCreateCipherivVaultAdapter,
  deriveKeyArgon2id,
  deriveKeyArgon2idLimited,
  deriveKeyPbkdf2,
  computeArgon2idReferenceVector,
  generateRandomKey,
  generateNonce,
  generateRecoverySecret,
  verifyAndDecodeRecoverySecret,
  wrapKey,
  unwrapKey,
  serializeContext,
  validateEnvelopeStructure,
  KDF_BOUNDS,
  ENVELOPE_PROFILE,
  KEY_WRAP_PURPOSE,
  documentRecoveryRewrapDoesNotInvalidateOldSecrets,
  assertFinitePositiveInteger,
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
    it('matches RFC 9106 §5.3 complete Argon2id fixture (password, salt, secret, AD)', () => {
      // https://www.rfc-editor.org/rfc/rfc9106.html#section-5.3
      // Memory: 32 KiB, Passes: 3, Parallelism: 4, Output: 32 bytes
      const password = Buffer.alloc(32, 0x01);
      const salt = Buffer.alloc(16, 0x02);
      const secret = Buffer.alloc(8, 0x03);
      const associatedData = Buffer.alloc(12, 0x04);

      const derived = computeArgon2idReferenceVector({
        password,
        salt,
        secret,
        associatedData,
        memoryKiB: 32,
        passes: 3,
        parallelism: 4,
        tagLength: 32,
      });

      expect(derived.toString('hex')).toBe(
        '0d640df58d78766c08c037a34a8b53c9d01ef0452d75b65eb52520e96b01e659'
      );
    });

    it('retains 03aab965… as a separately identified password+salt-only regression fixture (not the complete RFC vector)', () => {
      // Provenance: Node crypto.argon2Sync / common Argon2id implementations with
      // password=32×0x01, salt=16×0x02, m=32, t=3, p=4, tagLength=32, WITHOUT secret/AD.
      // This is NOT RFC 9106 §5.3 complete vector attribution.
      const password = Buffer.alloc(32, 0x01);
      const salt = Buffer.alloc(16, 0x02);

      const derived = computeArgon2idReferenceVector({
        password,
        salt,
        memoryKiB: 32,
        passes: 3,
        parallelism: 4,
        tagLength: 32,
      });

      expect(derived.toString('hex')).toBe(
        '03aab965c12001c9d7d0d2de33192c0494b684bb148196d73c1df1acaf6d0c2e'
      );
    });

    it('keeps low-cost RFC reference parameters isolated from application KDF policy', () => {
      expect(() =>
        deriveKeyArgon2id(Buffer.alloc(32, 1), Buffer.alloc(16, 2), {
          memoryKiB: 32, // RFC vector cost — below application minimum
          passes: 3,
          parallelism: 4,
        })
      ).toThrow(/outside allowed bounds/);
    });

    it('matches NIST SP 800-38D Appendix C AES-256-GCM Test Cases 13 and 14', () => {
      // Primary source: NIST SP 800-38D (Nov 2007), Appendix C — Examples of the GCM Mode.
      // Test Case 13: 256-bit all-zero key, 96-bit all-zero IV, empty plaintext, empty AAD.
      // Test Case 14: same key/IV, 16 zero-byte plaintext, empty AAD.
      // (Earlier reports incorrectly cited Appendix B.)
      const key13 = Buffer.alloc(32, 0);
      const iv13 = Buffer.alloc(12, 0);
      const pt13 = Buffer.alloc(0);

      const cipher13 = crypto.createCipheriv('aes-256-gcm', key13, iv13);
      const ct13 = Buffer.concat([cipher13.update(pt13), cipher13.final()]);
      const tag13 = cipher13.getAuthTag();

      expect(ct13.length).toBe(0);
      expect(tag13.toString('hex')).toBe('530f8afbc74536b9a963b4f1c4cb738b');

      const pt14 = Buffer.alloc(16, 0);
      const cipher14 = crypto.createCipheriv('aes-256-gcm', key13, iv13);
      const ct14 = Buffer.concat([cipher14.update(pt14), cipher14.final()]);
      const tag14 = cipher14.getAuthTag();

      expect(ct14.toString('hex')).toBe('cea7403d4d606b6e074ec5d3baf39d18');
      expect(tag14.toString('hex')).toBe('d0d1c8a799996bf0265b98b5d48ab919');
    });
  });

  describe('2. Node WebCrypto ↔ Node createCipheriv interoperability (not browser/Android)', () => {
    it('encrypts with Node WebCrypto and decrypts with Node createCipheriv', async () => {
      const dataKey = generateRandomKey();
      const rawText =
        'গোপন ভল্ট ডেটা - Synthetic Vault Content with Bangla & Special Characters: 🚀🔒';
      const plaintext = Buffer.from(rawText, 'utf8');

      const envelope = await NodeWebCryptoVaultAdapter.encrypt(plaintext, dataKey, sampleContext);
      expect(envelope.version).toBe(1);
      expect(envelope.algorithm).toBe('AES-256-GCM');
      expect(Buffer.from(envelope.nonce, 'base64').length).toBe(12);
      expect(Buffer.from(envelope.tag, 'base64').length).toBe(16);

      const decrypted = NodeCreateCipherivVaultAdapter.decrypt(envelope, dataKey, sampleContext);
      expect(decrypted.toString('utf8')).toBe(rawText);
    });

    it('encrypts with Node createCipheriv and decrypts with Node WebCrypto', async () => {
      const dataKey = generateRandomKey();
      const rawText = 'Node createCipheriv envelope payload for Node WebCrypto decryption.';
      const plaintext = Buffer.from(rawText, 'utf8');

      const envelope = NodeCreateCipherivVaultAdapter.encrypt(plaintext, dataKey, sampleContext);
      const decrypted = await NodeWebCryptoVaultAdapter.decrypt(envelope, dataKey, sampleContext);
      expect(decrypted.toString('utf8')).toBe(rawText);
    });

    it('round-trips binary attachment fixtures', async () => {
      const dataKey = generateRandomKey();
      const binaryPayload = crypto.randomBytes(4096);

      const envelope = NodeCreateCipherivVaultAdapter.encrypt(
        binaryPayload,
        dataKey,
        sampleContext
      );
      const decrypted = await NodeWebCryptoVaultAdapter.decrypt(envelope, dataKey, sampleContext);

      expect(decrypted.equals(binaryPayload)).toBe(true);
    });
  });

  describe('3. Key Hierarchy, Envelope Wrapping, and Recovery Limits', () => {
    it('wraps and unwraps DEK under VRK with explicit purpose separation', () => {
      const rootKey = generateRandomKey();
      const dek = generateRandomKey();

      const keyWrapContext: AuthenticatedContext = {
        ...sampleContext,
        itemType: KEY_WRAP_PURPOSE.DEK_UNDER_VRK,
        schemaVersion: 1,
        keyVersion: 1,
      };

      const wrappedKeyEnvelope = wrapKey(dek, rootKey, keyWrapContext);
      const unwrappedDek = unwrapKey(wrappedKeyEnvelope, rootKey, keyWrapContext);
      expect(unwrappedDek.equals(dek)).toBe(true);

      const wrongPurpose: AuthenticatedContext = {
        ...keyWrapContext,
        itemType: KEY_WRAP_PURPOSE.VRK_UNDER_RECOVERY,
      };
      expect(() => wrapKey(dek, rootKey, wrongPurpose, KEY_WRAP_PURPOSE.DEK_UNDER_VRK)).toThrow(
        /Key-wrap purpose mismatch/
      );
    });

    it('generates high-entropy recovery secret with verified checksum', () => {
      const { secret, rawBytes } = generateRecoverySecret();

      expect(rawBytes.length).toBe(32);
      expect(secret).toMatch(/^[0-9a-f]{4}(-[0-9a-f]{4}){16}$/);

      const decodedBytes = verifyAndDecodeRecoverySecret(secret);
      expect(decodedBytes.equals(rawBytes)).toBe(true);

      const tamperedSecret =
        secret.slice(0, 10) + (secret[10] === 'a' ? 'b' : 'a') + secret.slice(11);
      expect(() => verifyAndDecodeRecoverySecret(tamperedSecret)).toThrow(
        /Recovery secret checksum validation failed/
      );
    });

    it('rejects malformed, truncated, non-hex, oversized, and empty-buffer recovery secrets', () => {
      expect(() => verifyAndDecodeRecoverySecret('')).toThrow(/non-empty/);
      expect(() => verifyAndDecodeRecoverySecret('abcd')).toThrow(/68 hex/);
      expect(() => verifyAndDecodeRecoverySecret('z'.repeat(68))).toThrow(
        /only hexadecimal|checksum|32 decoded/
      );
      // Empty-buffer exploit: invalid hex that Buffer.from would decode to 0 bytes + empty SHA-256 prefix.
      const emptyChecksum = crypto.createHash('sha256').update(Buffer.alloc(0)).digest('hex').slice(0, 4);
      expect(() => verifyAndDecodeRecoverySecret('z'.repeat(64) + emptyChecksum)).toThrow();
      // Partial hex that Node Buffer.from would silently truncate.
      const partial = '0g'.repeat(32) + 'e3b0';
      expect(() => verifyAndDecodeRecoverySecret(partial)).toThrow();
      expect(() => verifyAndDecodeRecoverySecret('a'.repeat(201))).toThrow(/maximum length/);
      // Underscore separator not allowed
      expect(() =>
        verifyAndDecodeRecoverySecret(generateRecoverySecret().secret.replace(/-/g, '_'))
      ).toThrow(/only hexadecimal/);
    });

    it('wraps root key with recovery key and restores vault access on fresh simulated device', () => {
      const rootKey = generateRandomKey();
      const { rawBytes: recoverySecretBytes } = generateRecoverySecret();
      const recoverySalt = crypto.randomBytes(16);

      const recoveryKek = deriveKeyArgon2id(recoverySecretBytes, recoverySalt, {
        memoryKiB: 16 * 1024,
        passes: 2,
        parallelism: 1,
      });

      const recoveryContext: AuthenticatedContext = {
        workspaceId: sampleContext.workspaceId,
        itemId: 'vault-root-recovery-envelope',
        itemType: KEY_WRAP_PURPOSE.VRK_UNDER_RECOVERY,
        schemaVersion: 1,
        keyVersion: 1,
      };

      const recoveryEnvelope = wrapKey(
        rootKey,
        recoveryKek,
        recoveryContext,
        KEY_WRAP_PURPOSE.VRK_UNDER_RECOVERY
      );

      const recoveredKek = deriveKeyArgon2id(recoverySecretBytes, recoverySalt, {
        memoryKiB: 16 * 1024,
        passes: 2,
        parallelism: 1,
      });

      const recoveredRootKey = unwrapKey(
        recoveryEnvelope,
        recoveredKek,
        recoveryContext,
        KEY_WRAP_PURPOSE.VRK_UNDER_RECOVERY
      );
      expect(recoveredRootKey.equals(rootKey)).toBe(true);
    });

    it('documents that rewrapping the same VRK does NOT invalidate a saved old recovery envelope', () => {
      const rootKey = generateRandomKey();
      const { rawBytes: oldSecret } = generateRecoverySecret();
      const { rawBytes: newSecret } = generateRecoverySecret();
      const salt = crypto.randomBytes(16);

      const oldKek = deriveKeyArgon2id(oldSecret, salt, {
        memoryKiB: 16 * 1024,
        passes: 2,
        parallelism: 1,
      });
      const newKek = deriveKeyArgon2id(newSecret, salt, {
        memoryKiB: 16 * 1024,
        passes: 2,
        parallelism: 1,
      });

      const oldContext: AuthenticatedContext = {
        workspaceId: sampleContext.workspaceId,
        itemId: 'vault-root-recovery-envelope',
        itemType: KEY_WRAP_PURPOSE.VRK_UNDER_RECOVERY,
        schemaVersion: 1,
        keyVersion: 1,
      };

      // Attacker saves the OLD envelope + OLD secret before "rotation".
      const oldEnvelope = wrapKey(
        rootKey,
        oldKek,
        oldContext,
        KEY_WRAP_PURPOSE.VRK_UNDER_RECOVERY
      );

      const newContext: AuthenticatedContext = { ...oldContext, keyVersion: 2 };
      const activeEnvelope = wrapKey(
        rootKey,
        newKek,
        newContext,
        KEY_WRAP_PURPOSE.VRK_UNDER_RECOVERY
      );

      // New active envelope rejects old KEK — expected for the published envelope.
      expect(() =>
        unwrapKey(activeEnvelope, oldKek, newContext, KEY_WRAP_PURPOSE.VRK_UNDER_RECOVERY)
      ).toThrow(/Decryption failed/);

      // CRITICAL LIMITATION: old envelope + old secret still unwraps the SAME root key.
      const stillRecovered = unwrapKey(
        oldEnvelope,
        oldKek,
        oldContext,
        KEY_WRAP_PURPOSE.VRK_UNDER_RECOVERY
      );
      expect(stillRecovered.equals(rootKey)).toBe(true);

      const doc = documentRecoveryRewrapDoesNotInvalidateOldSecrets();
      expect(doc.limitation).toMatch(/retained an old recovery secret/);
    });
  });

  describe('4. Envelope Profile Enforcement', () => {
    it('rejects 16-byte keys while declaring AES-256-GCM', async () => {
      const key16 = crypto.randomBytes(16);
      await expect(
        NodeWebCryptoVaultAdapter.encrypt(Buffer.from('hi'), key16, sampleContext)
      ).rejects.toThrow(/exactly 32-byte keys/);
      expect(() =>
        NodeCreateCipherivVaultAdapter.encrypt(Buffer.from('hi'), key16, sampleContext)
      ).toThrow(/exactly 32-byte keys/);
    });

    it('rejects changing outer envelope.keyVersion while keeping AAD (inconsistency)', () => {
      const key = generateRandomKey();
      const envelope = NodeCreateCipherivVaultAdapter.encrypt(
        Buffer.from('secret'),
        key,
        sampleContext
      );
      const tampered: VaultEnvelope = { ...envelope, keyVersion: 999 };
      expect(() =>
        NodeCreateCipherivVaultAdapter.decrypt(tampered, key, sampleContext)
      ).toThrow(/inconsistent with authenticated context keyVersion/);
    });

    it('rejects 16-byte nonces despite historical AES-GCM allowing them', async () => {
      const key = generateRandomKey();
      const nonce16 = crypto.randomBytes(16);
      expect(() =>
        NodeCreateCipherivVaultAdapter.encrypt(Buffer.from('x'), key, sampleContext, {
          nonce: nonce16,
        })
      ).toThrow(/exactly 12-byte nonces/);
      await expect(
        NodeWebCryptoVaultAdapter.encrypt(Buffer.from('x'), key, sampleContext, {
          nonce: nonce16,
        })
      ).rejects.toThrow(/exactly 12-byte nonces/);
    });

    it('rejects four-byte KDF outputs (no silent downgrade)', () => {
      const salt = crypto.randomBytes(16);
      expect(() =>
        deriveKeyArgon2id('passphrase', salt, {
          memoryKiB: 16 * 1024,
          passes: 2,
          parallelism: 1,
          keyLengthBytes: 4,
        })
      ).toThrow(/exactly 32/);
    });

    it('rejects NaN, fractions, wrong types, and unsupported profiles before crypto work', () => {
      expect(() => assertFinitePositiveInteger(Number.NaN, 'x')).toThrow(/finite positive integer/);
      expect(() => assertFinitePositiveInteger(1.5, 'x')).toThrow(/finite positive integer/);
      expect(() => assertFinitePositiveInteger('3' as unknown as number, 'x')).toThrow(
        /finite positive integer/
      );

      const salt = crypto.randomBytes(16);
      expect(() =>
        deriveKeyArgon2id('pw', salt, { memoryKiB: Number.NaN as unknown as number })
      ).toThrow(/finite positive integer/);
      expect(() =>
        deriveKeyArgon2id('pw', salt, { passes: 2.5 as unknown as number, memoryKiB: 16 * 1024 })
      ).toThrow(/finite positive integer/);

      expect(() => serializeContext({ ...sampleContext, workspaceId: 'not-a-uuid' })).toThrow(
        /workspaceId must be a UUID/
      );
      expect(() => serializeContext({ ...sampleContext, keyVersion: 0 })).toThrow(
        /finite positive integer/
      );
      expect(() => serializeContext({ ...sampleContext, itemType: 'Bad Type!' })).toThrow(
        /itemType/
      );

      const key = generateRandomKey();
      const envelope = NodeCreateCipherivVaultAdapter.encrypt(Buffer.from('x'), key, sampleContext);
      expect(() =>
        validateEnvelopeStructure(
          { ...envelope, algorithm: 'AES-128-CBC' as VaultEnvelope['algorithm'] },
          sampleContext
        )
      ).toThrow(/Unsupported envelope algorithm/);
      expect(() =>
        validateEnvelopeStructure({ ...envelope, version: 99 as 1 }, sampleContext)
      ).toThrow(/Unsupported envelope version/);
      expect(() =>
        validateEnvelopeStructure(
          { ...envelope, tag: Buffer.from('short').toString('base64') },
          sampleContext
        )
      ).toThrow(/Invalid authentication tag length|malformed base64|non-canonical/);
    });
  });

  describe('5. Cryptographic Tamper Resistance and AAD Context Binding', () => {
    it('rejects bit-flip in ciphertext', () => {
      const key = generateRandomKey();
      const envelope = NodeCreateCipherivVaultAdapter.encrypt(
        Buffer.from('sensitive data'),
        key,
        sampleContext
      );

      const ctBuf = Buffer.from(envelope.ciphertext, 'base64');
      ctBuf[0]! ^= 0x01;
      const tamperedEnvelope: VaultEnvelope = {
        ...envelope,
        ciphertext: ctBuf.toString('base64'),
      };

      expect(() =>
        NodeCreateCipherivVaultAdapter.decrypt(tamperedEnvelope, key, sampleContext)
      ).toThrow(/Decryption failed: authentication tag verification failure/);
    });

    it('rejects bit-flip in authentication tag', () => {
      const key = generateRandomKey();
      const envelope = NodeCreateCipherivVaultAdapter.encrypt(
        Buffer.from('sensitive data'),
        key,
        sampleContext
      );

      const tagBuf = Buffer.from(envelope.tag, 'base64');
      tagBuf[0]! ^= 0x01;
      const tamperedEnvelope: VaultEnvelope = {
        ...envelope,
        tag: tagBuf.toString('base64'),
      };

      expect(() =>
        NodeCreateCipherivVaultAdapter.decrypt(tamperedEnvelope, key, sampleContext)
      ).toThrow(/Decryption failed: authentication tag verification failure/);
    });

    it('rejects modified AAD context (relocation attack prevention)', () => {
      const key = generateRandomKey();
      const envelope = NodeCreateCipherivVaultAdapter.encrypt(
        Buffer.from('sensitive data'),
        key,
        sampleContext
      );

      const differentWorkspaceContext: AuthenticatedContext = {
        ...sampleContext,
        workspaceId: '99999999-9999-4999-8999-999999999999',
      };

      expect(() =>
        NodeCreateCipherivVaultAdapter.decrypt(envelope, key, differentWorkspaceContext)
      ).toThrow(/AAD mismatch/);

      const tamperedAadEnvelope: VaultEnvelope = {
        ...envelope,
        aad: serializeContext(differentWorkspaceContext),
        keyVersion: differentWorkspaceContext.keyVersion,
      };

      expect(() =>
        NodeCreateCipherivVaultAdapter.decrypt(
          tamperedAadEnvelope,
          key,
          differentWorkspaceContext
        )
      ).toThrow(/Decryption failed: authentication tag verification failure/);
    });

    it('documents that AAD identity binding alone does not prevent replay of an older valid version', () => {
      const key = generateRandomKey();
      const v1 = { ...sampleContext, keyVersion: 1, schemaVersion: 1 };
      const olderEnvelope = NodeCreateCipherivVaultAdapter.encrypt(
        Buffer.from('version-one-plaintext'),
        key,
        v1
      );
      // Later "version" of the same item (same IDs, higher schemaVersion) does not
      // invalidate the older envelope — freshness/checkpoint design is required.
      const stillDecrypts = NodeCreateCipherivVaultAdapter.decrypt(olderEnvelope, key, v1);
      expect(stillDecrypts.toString('utf8')).toBe('version-one-plaintext');
      // Same-item older ciphertext remains valid under its original AAD forever unless
      // the client enforces monotonic version/checkpoint acceptance rules separately.
      expect(olderEnvelope.aad).toContain('"schemaVersion":1');
    });

    it('rejects wrong key or passphrase', () => {
      const key1 = generateRandomKey();
      const key2 = generateRandomKey();

      const envelope = NodeCreateCipherivVaultAdapter.encrypt(
        Buffer.from('sensitive payload'),
        key1,
        sampleContext
      );

      expect(() =>
        NodeCreateCipherivVaultAdapter.decrypt(envelope, key2, sampleContext)
      ).toThrow(/Decryption failed: authentication tag verification failure/);
    });
  });

  describe('6. KDF Bounds and Denial-of-Service Defense', () => {
    const salt = crypto.randomBytes(16);

    it('enforces lower and upper memory bounds on Argon2id', () => {
      expect(() => deriveKeyArgon2id('passphrase', salt, { memoryKiB: 1024 })).toThrow(
        /Argon2id memoryKiB 1024 is outside allowed bounds/
      );
      expect(() =>
        deriveKeyArgon2id('passphrase', salt, { memoryKiB: 512 * 1024 })
      ).toThrow(/Argon2id memoryKiB 524288 is outside allowed bounds/);
    });

    it('enforces passes and parallelism bounds on Argon2id', () => {
      expect(() =>
        deriveKeyArgon2id('passphrase', salt, { passes: 1, memoryKiB: 16 * 1024 })
      ).toThrow(/Argon2id passes 1 is outside allowed bounds/);
      expect(() =>
        deriveKeyArgon2id('passphrase', salt, { passes: 20, memoryKiB: 16 * 1024 })
      ).toThrow(/Argon2id passes 20 is outside allowed bounds/);
      expect(() =>
        deriveKeyArgon2id('passphrase', salt, { parallelism: 16, memoryKiB: 16 * 1024 })
      ).toThrow(/Argon2id parallelism 16 is outside allowed bounds/);
    });

    it('enforces salt length constraints', () => {
      const shortSalt = crypto.randomBytes(8);
      expect(() =>
        deriveKeyArgon2id('passphrase', shortSalt, { memoryKiB: 16 * 1024 })
      ).toThrow(/Argon2id salt length must be between/);
    });

    it('enforces PBKDF2 iteration bounds', () => {
      expect(() => deriveKeyPbkdf2('passphrase', salt, { iterations: 1000 })).toThrow(
        /PBKDF2 iterations 1000 is outside allowed bounds/
      );
      expect(() => deriveKeyPbkdf2('passphrase', salt, { iterations: 5_000_000 })).toThrow(
        /PBKDF2 iterations 5000000 is outside allowed bounds/
      );
    });

    it('limits concurrent Argon2id derivations', async () => {
      const tasks = Array.from({ length: 4 }, () =>
        deriveKeyArgon2idLimited('passphrase', salt, {
          memoryKiB: 16 * 1024,
          passes: 2,
          parallelism: 1,
        })
      );
      const keys = await Promise.all(tasks);
      expect(keys).toHaveLength(4);
      for (const k of keys) {
        expect(k.length).toBe(32);
      }
    });
  });

  describe('7. KDF Benchmark Profiling (honest limitations)', () => {
    it('executes KDF benchmark across candidate parameters and records limitations', () => {
      const results = runKdfBenchmark(2);
      expect(results.length).toBe(4);

      for (const res of results) {
        expect(res.samples).toBe(2);
        expect(res.avgDurationMs).toBeGreaterThan(0);
        expect(res.minDurationMs).toBeLessThanOrEqual(res.maxDurationMs);
        expect(res.limitations.join(' ')).toMatch(/does not measure peak native Argon2 memory/);
        expect(res.limitations.join(' ')).toMatch(/does not establish Android or browser/);
      }

      const argonProd = results.find((r) => r.algorithm === 'Argon2id Candidate Production');
      expect(argonProd).toBeDefined();
      expect(argonProd?.parameters.memoryKiB).toBe(65536);
      expect(argonProd?.parameters.passes).toBe(3);

      const pbkdf2 = results.find((r) => r.algorithm === 'PBKDF2-HMAC-SHA256 (100k)');
      expect(pbkdf2).toBeDefined();
    });
  });

  describe('8. Profile constants', () => {
    it('exports a single explicit envelope profile', () => {
      expect(ENVELOPE_PROFILE.keyLengthBytes).toBe(32);
      expect(ENVELOPE_PROFILE.nonceLengthBytes).toBe(12);
      expect(ENVELOPE_PROFILE.tagLengthBytes).toBe(16);
      expect(generateNonce().length).toBe(12);
      expect(generateRandomKey().length).toBe(32);
      expect(KDF_BOUNDS.ARGON2ID.KEY_LENGTH_BYTES).toBe(32);
    });
  });
});
