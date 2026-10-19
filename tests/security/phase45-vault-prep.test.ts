/**
 * Phase 45 preparation — disconnected synthetic protocol fixtures.
 * Does not import application routes, migrations, or unlock UI.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { serializeContext, ENVELOPE_PROFILE } from './vault/vault-crypto.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '../..');

describe('Phase 45 preparation — synthetic vault protocol fixtures', () => {
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

  it('matches Phase 44 envelope profile constants', () => {
    expect(fixtures.schemaVersion).toBe(1);
    expect(fixtures.envelopeProfile.version).toBe(ENVELOPE_PROFILE.version);
    expect(fixtures.envelopeProfile.algorithm).toBe(ENVELOPE_PROFILE.algorithm);
    expect(fixtures.envelopeProfile.keyLengthBytes).toBe(ENVELOPE_PROFILE.keyLengthBytes);
    expect(fixtures.envelopeProfile.nonceLengthBytes).toBe(ENVELOPE_PROFILE.nonceLengthBytes);
    expect(fixtures.envelopeProfile.tagLengthBytes).toBe(ENVELOPE_PROFILE.tagLengthBytes);
  });

  it('canonical AAD matches serializeContext for the sample vault item', () => {
    expect(serializeContext(fixtures.sampleContext)).toBe(fixtures.sampleAadCanonical);
  });

  it('defines durable transfer states including failure recoverability', () => {
    for (const required of [
      'proposed',
      'encrypting',
      'uploading',
      'ciphertext_accepted',
      'cleanup_ordinary',
      'transfer_complete',
      'verify_failed',
      'cleanup_failed',
    ]) {
      expect(fixtures.transferStates).toContain(required);
    }
  });

  it('lists exclusion surfaces and acceptance scenarios for future implementation', () => {
    expect(fixtures.exclusionSurfaces).toEqual(
      expect.arrayContaining(['search', 'previews', 'ai_retrieval', 'logs'])
    );
    expect(fixtures.acceptanceScenarios.length).toBeGreaterThanOrEqual(8);
    expect(fixtures.acceptanceScenarios.map((s) => s.id)).toContain(
      'transfer-interrupt-before-accept'
    );
  });

  it('remains disconnected from application vault packages', () => {
    // Guard: production vault routes/migrations must not exist while Phase 44 gate is blocked.
    expect(existsSync(join(repoRoot, 'apps/api/src/modules/vault'))).toBe(false);
    const migrationsDir = join(repoRoot, 'infra/supabase/migrations');
    const files = existsSync(migrationsDir) ? readdirSync(migrationsDir) : [];
    expect(files.some((f) => /vault/i.test(f))).toBe(false);
  });
});
