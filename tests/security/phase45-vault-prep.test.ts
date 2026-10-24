/**
 * Phase 45 PREPARATION CHECKS ONLY.
 * These tests validate disconnected fixtures and executable protocol models.
 * They do NOT establish production authorization, durable transfer integration,
 * ciphertext-only persistence in app stores, or plaintext-leak scanning of live paths.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { serializeContext, ENVELOPE_PROFILE } from './vault/vault-crypto.js';
import {
  purposeBoundAad,
  assertPurposeMatch,
  evaluateEnvelopeAgainstCheckpoint,
  mergeConflictPreserving,
  createTransfer,
  transitionTransfer,
  noteOrdinaryEditDuringTransfer,
  applySourceEditDisposition,
  discloseRetainedOrdinaryCopy,
  assertSharedReferenceCleanupAllowed,
  applyCleanupEvidence,
  scheduleVersionsCleanupJob,
  canMarkTransferComplete,
  hasRequiredCleanupCompletionEvidence,
  assertVaultExcluded,
  VAULT_EXCLUSION_SURFACES,
  type TrustedCheckpoint,
  type CiphertextVerificationEvidence,
} from './vault/phase45-prep/protocol-models.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '../..');

function validEvidence(
  overrides: Partial<CiphertextVerificationEvidence> = {}
): CiphertextVerificationEvidence {
  return {
    vaultItemId: 'vault-1',
    sourceRevision: 1,
    ciphertextIdentity: 'sha256:aabbcc',
    decryptVerified: true,
    ...overrides,
  };
}

function advanceToUploading(operationId: string, sourceRev = 1) {
  let t = createTransfer(operationId, `ord-${operationId}`, sourceRev);
  t = transitionTransfer(t, 'encrypting', { operationId });
  t = transitionTransfer(t, 'uploading', { operationId });
  return t;
}

describe('Phase 45 preparation checks (not production integration)', () => {
  const fixtures = JSON.parse(
    readFileSync(join(here, 'vault/phase45-prep/synthetic-envelopes.json'), 'utf8')
  ) as {
    schemaVersion: number;
    envelopeProfile: typeof ENVELOPE_PROFILE;
    acceptanceScenarios: Array<{ id: string; assert: string }>;
    transferStates: string[];
    sampleContext: {
      workspaceId: string;
      itemId: string;
      itemType: string;
      schemaVersion: number;
      keyVersion: number;
    };
    sampleAadCanonical: string;
    exclusionSurfaces: string[];
  };

  describe('fixture inventory (preparation)', () => {
    it('matches Phase 44 envelope profile constants', () => {
      expect(fixtures.schemaVersion).toBe(1);
      expect(fixtures.envelopeProfile.keyLengthBytes).toBe(ENVELOPE_PROFILE.keyLengthBytes);
    });

    it('canonical AAD matches serializeContext for the sample vault item', () => {
      expect(serializeContext(fixtures.sampleContext)).toBe(fixtures.sampleAadCanonical);
    });

    it('lists exclusion surfaces and acceptance scenarios for future implementation', () => {
      expect(fixtures.exclusionSurfaces).toEqual(
        expect.arrayContaining(['search', 'previews', 'ai_retrieval', 'logs'])
      );
      expect(fixtures.acceptanceScenarios.map((s) => s.id)).toContain(
        'transfer-interrupt-before-accept'
      );
    });

    it('confirms production vault packages remain absent (gate still blocked)', () => {
      expect(existsSync(join(repoRoot, 'apps/api/src/modules/vault'))).toBe(false);
      const migrationsDir = join(repoRoot, 'infra/supabase/migrations');
      const files = existsSync(migrationsDir) ? readdirSync(migrationsDir) : [];
      expect(files.some((f) => /vault/i.test(f))).toBe(false);
    });
  });

  describe('purpose-bound field roles (test-only model)', () => {
    const identity = {
      workspaceId: fixtures.sampleContext.workspaceId,
      itemId: fixtures.sampleContext.itemId,
      schemaVersion: 1,
      keyVersion: 1,
      revision: 3,
    };

    it('binds title vs body so envelopes cannot be substituted within one item', () => {
      const titleAad = purposeBoundAad(identity, 'title');
      const bodyAad = purposeBoundAad(identity, 'body');
      expect(titleAad).not.toBe(bodyAad);
      expect(() => assertPurposeMatch(titleAad, identity, 'body')).toThrow(/Purpose\/field-role/);
      expect(() => assertPurposeMatch(titleAad, identity, 'title')).not.toThrow();
    });
  });

  describe('checkpoint / replay rules (test-only model)', () => {
    it('rejects stale revisions when a trusted checkpoint exists', () => {
      const checkpoint: TrustedCheckpoint = {
        workspaceId: fixtures.sampleContext.workspaceId,
        deviceId: 'device-a',
        acceptedRevisions: { [fixtures.sampleContext.itemId]: 5 },
        keyEpoch: 2,
        updatedAt: '2026-10-19T00:00:00.000Z',
      };
      const stale = evaluateEnvelopeAgainstCheckpoint(
        checkpoint,
        fixtures.sampleContext.itemId,
        4,
        2
      );
      expect(stale.decision).toBe('reject_stale');
    });

    it('documents reduced assurance when checkpoint is missing (fresh device)', () => {
      const fresh = evaluateEnvelopeAgainstCheckpoint(null, 'item', 1, 1);
      expect(fresh.decision).toBe('accept_with_reduced_assurance');
    });

    it('preserves distinct ciphertext conflicts without silent overwrite', () => {
      const a = mergeConflictPreserving(
        null,
        {
          revision: 2,
          envelopeId: 'e1',
          ciphertextSha256: 'aa',
        },
        'item-1'
      );
      const b = mergeConflictPreserving(
        a,
        {
          revision: 2,
          envelopeId: 'e2',
          ciphertextSha256: 'bb',
        },
        'item-1'
      );
      expect(b.versions).toHaveLength(2);
    });
  });

  describe('transfer state machine (test-only model — not durable DB proof)', () => {
    it('forbids cleanup before verified ciphertext acceptance', () => {
      let t = advanceToUploading('op-1');
      expect(() =>
        transitionTransfer(t, 'cleanup_ordinary', { operationId: 'op-1' })
      ).toThrow(/Illegal transfer transition/);
      t = transitionTransfer(t, 'ciphertext_accepted', {
        operationId: 'op-1',
        verificationEvidence: validEvidence(),
      });
      expect(t.ciphertextVerified).toBe(true);
      expect(t.vaultItemId).toBe('vault-1');
      t = transitionTransfer(t, 'cleanup_ordinary', { operationId: 'op-1' });
      expect(t.state).toBe('cleanup_ordinary');
    });

    it('negative: ciphertext_accepted without verification evidence does not set verified', () => {
      const t = advanceToUploading('op-bypass-ev');
      expect(() =>
        transitionTransfer(t, 'ciphertext_accepted', { operationId: 'op-bypass-ev' })
      ).toThrow(/explicit verification evidence/);
      expect(t.ciphertextVerified).toBe(false);
      expect(t.vaultItemId).toBeNull();
    });

    it('negative: acceptance without vault destination or decrypt proof is rejected', () => {
      const t = advanceToUploading('op-bypass-dest');
      expect(() =>
        transitionTransfer(t, 'ciphertext_accepted', {
          operationId: 'op-bypass-dest',
          verificationEvidence: validEvidence({ vaultItemId: '', decryptVerified: true }),
        })
      ).toThrow(/vault destination/);
      expect(() =>
        transitionTransfer(t, 'ciphertext_accepted', {
          operationId: 'op-bypass-dest',
          verificationEvidence: validEvidence({ decryptVerified: false }),
        })
      ).toThrow(/decrypt\/tag verification/);
    });

    it('negative: source edit before cleanup blocks silent deletion', () => {
      let t = advanceToUploading('op-src-edit');
      t = transitionTransfer(t, 'ciphertext_accepted', {
        operationId: 'op-src-edit',
        verificationEvidence: validEvidence(),
      });
      t = noteOrdinaryEditDuringTransfer(t, 2);
      expect(() =>
        transitionTransfer(t, 'cleanup_ordinary', { operationId: 'op-src-edit' })
      ).toThrow(/Ordinary source changed|Silent deletion/);
    });

    it('source edit with preserve_changed_source + disclosure allows cleanup without deleting newer content claim', () => {
      let t = advanceToUploading('op-preserve');
      t = transitionTransfer(t, 'ciphertext_accepted', {
        operationId: 'op-preserve',
        verificationEvidence: validEvidence(),
      });
      t = noteOrdinaryEditDuringTransfer(t, 2);
      t = applySourceEditDisposition(t, 'preserve_changed_source');
      expect(() =>
        transitionTransfer(t, 'cleanup_ordinary', { operationId: 'op-preserve' })
      ).toThrow(/retained ordinary-copy disclosure/);
      t = discloseRetainedOrdinaryCopy(t);
      t = transitionTransfer(t, 'cleanup_ordinary', { operationId: 'op-preserve' });
      expect(t.state).toBe('cleanup_ordinary');
      expect(t.ordinarySourceRevisionLatest).toBe(2);
    });

    it('source edit with restart_reconcile clears acceptance and rebinds source revision', () => {
      let t = advanceToUploading('op-restart');
      t = transitionTransfer(t, 'ciphertext_accepted', {
        operationId: 'op-restart',
        verificationEvidence: validEvidence(),
      });
      t = noteOrdinaryEditDuringTransfer(t, 3);
      t = applySourceEditDisposition(t, 'restart_reconcile');
      expect(t.state).toBe('encrypting');
      expect(t.ciphertextVerified).toBe(false);
      expect(t.vaultItemId).toBeNull();
      expect(t.ordinarySourceRevisionAtStart).toBe(3);
      t = transitionTransfer(t, 'uploading', { operationId: 'op-restart' });
      expect(() =>
        transitionTransfer(t, 'ciphertext_accepted', {
          operationId: 'op-restart',
          verificationEvidence: validEvidence({ sourceRevision: 1 }),
        })
      ).toThrow(/does not match encrypted source revision/);
      t = transitionTransfer(t, 'ciphertext_accepted', {
        operationId: 'op-restart',
        verificationEvidence: validEvidence({
          sourceRevision: 3,
          vaultItemId: 'vault-restart',
          ciphertextIdentity: 'sha256:new',
        }),
      });
      expect(t.vaultItemId).toBe('vault-restart');
    });

    it('negative: transitionTransfer enforces completion guards (helper bypass impossible)', () => {
      let t = advanceToUploading('op-complete-bypass');
      t = transitionTransfer(t, 'ciphertext_accepted', {
        operationId: 'op-complete-bypass',
        verificationEvidence: validEvidence({ vaultItemId: 'v-c' }),
      });
      t = transitionTransfer(t, 'cleanup_ordinary', { operationId: 'op-complete-bypass' });
      expect(canMarkTransferComplete(t)).toBe(false);
      expect(() =>
        transitionTransfer(t, 'transfer_complete', { operationId: 'op-complete-bypass' })
      ).toThrow(/cleanup completion evidence missing/);
    });

    it('negative: scheduling versions-cleanup job alone does not establish completed cleanup', () => {
      let t = advanceToUploading('op-sched');
      t = transitionTransfer(t, 'ciphertext_accepted', {
        operationId: 'op-sched',
        verificationEvidence: validEvidence({ vaultItemId: 'v-s' }),
      });
      t = transitionTransfer(t, 'cleanup_ordinary', { operationId: 'op-sched' });
      t = scheduleVersionsCleanupJob(t);
      t = applyCleanupEvidence(t, {
        searchIndexRemoved: true,
        previewsPurged: true,
        cachesCleared: true,
        pendingJobsDrained: true,
        // versionsCleanupCompleted deliberately omitted
      });
      expect(t.versionsCleanupJobScheduled).toBe(true);
      expect(hasRequiredCleanupCompletionEvidence(t)).toBe(false);
      expect(canMarkTransferComplete(t)).toBe(false);
      expect(() =>
        transitionTransfer(t, 'transfer_complete', { operationId: 'op-sched' })
      ).toThrow(/scheduling a versions-cleanup job is not sufficient|cleanup completion evidence/);
    });

    it('negative: shared-reference cleanup without disclosure is rejected at transition boundary', () => {
      let t = advanceToUploading('op-shared');
      t = transitionTransfer(t, 'ciphertext_accepted', {
        operationId: 'op-shared',
        verificationEvidence: validEvidence({ vaultItemId: 'v-sh' }),
      });
      expect(() =>
        transitionTransfer(t, 'cleanup_ordinary', {
          operationId: 'op-shared',
          sharedFileStillReferenced: true,
        })
      ).toThrow(/retained-copy disclosure/);
      t = discloseRetainedOrdinaryCopy(t);
      t = transitionTransfer(t, 'cleanup_ordinary', {
        operationId: 'op-shared',
        sharedFileStillReferenced: true,
      });
      expect(t.state).toBe('cleanup_ordinary');
    });

    it('negative: idempotent retry cannot substitute destination or ciphertext under same operationId', () => {
      let t = advanceToUploading('op-idem');
      t = transitionTransfer(t, 'ciphertext_accepted', {
        operationId: 'op-idem',
        verificationEvidence: validEvidence({
          vaultItemId: 'vault-a',
          ciphertextIdentity: 'sha256:one',
        }),
      });
      expect(() =>
        transitionTransfer(t, 'ciphertext_accepted', {
          operationId: 'op-idem',
          verificationEvidence: validEvidence({
            vaultItemId: 'vault-b',
            ciphertextIdentity: 'sha256:one',
          }),
        })
      ).toThrow(/different vault destination/);
      expect(() =>
        transitionTransfer(t, 'ciphertext_accepted', {
          operationId: 'op-idem',
          verificationEvidence: validEvidence({
            vaultItemId: 'vault-a',
            ciphertextIdentity: 'sha256:two',
          }),
        })
      ).toThrow(/different ciphertext identity/);
      const again = transitionTransfer(t, 'ciphertext_accepted', {
        operationId: 'op-idem',
        verificationEvidence: validEvidence({
          vaultItemId: 'vault-a',
          ciphertextIdentity: 'sha256:one',
        }),
      });
      expect(again.state).toBe('ciphertext_accepted');
      expect(again.vaultItemId).toBe('vault-a');
    });

    it('failed and retried transitions recover without inventing verification', () => {
      let t = advanceToUploading('op-fail');
      t = transitionTransfer(t, 'upload_failed', {
        operationId: 'op-fail',
        failureReason: 'network',
      });
      expect(t.ciphertextVerified).toBe(false);
      t = transitionTransfer(t, 'uploading', { operationId: 'op-fail' });
      const again = transitionTransfer(t, 'uploading', { operationId: 'op-fail' });
      expect(again.state).toBe('uploading');
      t = transitionTransfer(t, 'verify_failed', {
        operationId: 'op-fail',
        failureReason: 'tag mismatch',
      });
      expect(t.ciphertextVerified).toBe(false);
      t = transitionTransfer(t, 'uploading', { operationId: 'op-fail' });
      t = transitionTransfer(t, 'ciphertext_accepted', {
        operationId: 'op-fail',
        verificationEvidence: validEvidence({ vaultItemId: 'v-fail' }),
      });
      expect(t.ciphertextVerified).toBe(true);
    });

    it('tracks ordinary-source edits and retained-copy disclosure helper', () => {
      let t = createTransfer('op-3', 'ord-3', 1);
      t = noteOrdinaryEditDuringTransfer(t, 2);
      expect(t.ordinarySourceRevisionLatest).toBe(2);
      expect(() => assertSharedReferenceCleanupAllowed(t, true)).toThrow(/retained-copy disclosure/);
      expect(() => assertSharedReferenceCleanupAllowed(t, false)).not.toThrow();
      t = discloseRetainedOrdinaryCopy(t);
      expect(() => assertSharedReferenceCleanupAllowed(t, true)).not.toThrow();
    });

    it('requires full cleanup completion evidence before transfer_complete', () => {
      let t = advanceToUploading('op-4');
      t = transitionTransfer(t, 'ciphertext_accepted', {
        operationId: 'op-4',
        verificationEvidence: validEvidence({ vaultItemId: 'v4' }),
      });
      t = transitionTransfer(t, 'cleanup_ordinary', { operationId: 'op-4' });
      expect(canMarkTransferComplete(t)).toBe(false);
      t = applyCleanupEvidence(t, {
        searchIndexRemoved: true,
        previewsPurged: true,
        cachesCleared: true,
        versionsCleanupCompleted: true,
        pendingJobsDrained: true,
      });
      expect(canMarkTransferComplete(t)).toBe(true);
      t = transitionTransfer(t, 'transfer_complete', { operationId: 'op-4' });
      expect(t.state).toBe('transfer_complete');
    });
  });

  describe('default-deny exclusion registry (test-only model)', () => {
    it('accepts registered surfaces and rejects unknown consumers', () => {
      for (const s of VAULT_EXCLUSION_SURFACES) {
        expect(() => assertVaultExcluded(s)).not.toThrow();
      }
      expect(() => assertVaultExcluded('brand_new_widget_feed')).toThrow(/default-deny/);
    });
  });
});
