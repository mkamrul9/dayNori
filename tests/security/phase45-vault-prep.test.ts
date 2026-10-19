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
  discloseRetainedOrdinaryCopy,
  assertSharedReferenceCleanupAllowed,
  applyCleanupEvidence,
  canMarkTransferComplete,
  assertVaultExcluded,
  VAULT_EXCLUSION_SURFACES,
  type TrustedCheckpoint,
} from './vault/phase45-prep/protocol-models.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '../..');

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
      const a = mergeConflictPreserving(null, {
        revision: 2,
        envelopeId: 'e1',
        ciphertextSha256: 'aa',
      }, 'item-1');
      const b = mergeConflictPreserving(a, {
        revision: 2,
        envelopeId: 'e2',
        ciphertextSha256: 'bb',
      }, 'item-1');
      expect(b.versions).toHaveLength(2);
    });
  });

  describe('transfer state machine (test-only model — not durable DB proof)', () => {
    it('forbids cleanup before verified ciphertext acceptance', () => {
      let t = createTransfer('op-1', 'ord-1', 1);
      t = transitionTransfer(t, 'encrypting', { operationId: 'op-1' });
      t = transitionTransfer(t, 'uploading', { operationId: 'op-1' });
      expect(() =>
        transitionTransfer(t, 'cleanup_ordinary', { operationId: 'op-1' })
      ).toThrow(/Illegal transfer transition/);
      t = transitionTransfer(t, 'ciphertext_accepted', {
        operationId: 'op-1',
        ciphertextVerified: true,
        vaultItemId: 'vault-1',
      });
      expect(t.ciphertextVerified).toBe(true);
      t = transitionTransfer(t, 'cleanup_ordinary', { operationId: 'op-1' });
      expect(t.state).toBe('cleanup_ordinary');
    });

    it('is idempotent on retried transitions and recovers from upload failure', () => {
      let t = createTransfer('op-2', 'ord-2', 1);
      t = transitionTransfer(t, 'encrypting', { operationId: 'op-2' });
      t = transitionTransfer(t, 'uploading', { operationId: 'op-2' });
      t = transitionTransfer(t, 'upload_failed', {
        operationId: 'op-2',
        failureReason: 'network',
      });
      t = transitionTransfer(t, 'uploading', { operationId: 'op-2' });
      const again = transitionTransfer(t, 'uploading', { operationId: 'op-2' });
      expect(again.state).toBe('uploading');
    });

    it('tracks ordinary-source edits during transfer and requires retained-copy disclosure', () => {
      let t = createTransfer('op-3', 'ord-3', 1);
      t = noteOrdinaryEditDuringTransfer(t, 2);
      expect(t.ordinarySourceRevisionLatest).toBe(2);
      expect(() => assertSharedReferenceCleanupAllowed(t, true)).toThrow(
        /retained-copy disclosure/
      );
      expect(() => assertSharedReferenceCleanupAllowed(t, false)).not.toThrow();
      t = discloseRetainedOrdinaryCopy(t);
      expect(() => assertSharedReferenceCleanupAllowed(t, true)).not.toThrow();
    });

    it('requires full cleanup evidence before transfer_complete', () => {
      let t = createTransfer('op-4', 'ord-4', 1);
      t = transitionTransfer(t, 'encrypting', { operationId: 'op-4' });
      t = transitionTransfer(t, 'uploading', { operationId: 'op-4' });
      t = transitionTransfer(t, 'ciphertext_accepted', {
        operationId: 'op-4',
        ciphertextVerified: true,
        vaultItemId: 'v4',
      });
      t = transitionTransfer(t, 'cleanup_ordinary', { operationId: 'op-4' });
      expect(canMarkTransferComplete(t)).toBe(false);
      t = applyCleanupEvidence(t, {
        searchIndexRemoved: true,
        previewsPurged: true,
        cachesCleared: true,
        versionsScheduled: true,
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
