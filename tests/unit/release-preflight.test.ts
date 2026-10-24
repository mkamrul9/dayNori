import { describe, expect, it } from 'vitest';
import { evaluateReleaseEligibility } from '../../scripts/release-preflight.mjs';

const baseManifest = {
  manifestVersion: '0.1.0-provisional',
  label: 'local-launch-preparation',
  notAnApprovalToLaunch: true,
  versions: {
    monorepo: '0.1.0',
    web: '0.1.0',
    mobile: '0.1.0',
    api: '0.1.0',
    androidVersionCode: 'UNRESOLVED_UNTIL_SIGNED_BUILD',
  },
  enabledInProposedRelease: {
    personalNotes: { enabled: true, evidence: 'Phases 14+ reports' },
  },
  disabledInProposedRelease: {
    vault: { enabled: false },
    roomsChat: { enabled: false },
  },
  migrationsRequired: 'through 00069_billing_role_password_align.sql',
};

describe('release preflight boundaries', () => {
  it('never treats a provisional valid manifest as release-eligible', () => {
    const result = evaluateReleaseEligibility({
      manifest: baseManifest,
      env: { NODE_ENV: 'production' },
      gitRevision: 'abc123',
      androidInspection: {
        ok: true,
        errors: [],
        findings: { targetSdk: 36, compileSdk: 36 },
      },
      evidence: {
        deviceEvidence: null,
        betaEvidence: null,
        accessibilityEvidence: null,
        backupRecoveryEvidence: null,
        opsEvidence: null,
        signedArtifactEvidence: null,
        sixteenKbEvidence: null,
        ownerApproval: null,
        dbRolesVerified: null,
      },
      nodeVersion: 'v24.11.1',
    });
    expect(result.eligible).toBe(false);
    expect(result.checks.some((c) => c.id === 'manifest-provisional' && c.status === 'BLOCKED')).toBe(
      true
    );
    expect(
      result.checks.some((c) => c.id === 'human-launch-authorization' && c.status === 'BLOCKED')
    ).toBe(true);
  });

  it('fails closed when debug release signing flag is set', () => {
    const result = evaluateReleaseEligibility({
      manifest: { ...baseManifest, notAnApprovalToLaunch: true },
      env: { NODE_ENV: 'development', DAYNORI_ALLOW_DEBUG_RELEASE_SIGNING: 'true' },
      gitRevision: 'abc123',
      androidInspection: null,
      evidence: {},
      nodeVersion: 'v24.21.0',
    });
    expect(result.summary.fail).toBeGreaterThan(0);
    expect(
      result.checks.some((c) => c.id === 'debug-release-signing' && c.status === 'FAIL')
    ).toBe(true);
  });

  it('fails when android tree still has silent debug fallback', () => {
    const result = evaluateReleaseEligibility({
      manifest: baseManifest,
      env: {},
      gitRevision: 'abc123',
      androidInspection: {
        ok: false,
        errors: ['Stale release signingConfig silently falls back to debug.keystore'],
        findings: {},
      },
      evidence: {},
      nodeVersion: 'v24.21.0',
    });
    expect(
      result.checks.some((c) => c.id === 'android-workspace-tree' && c.status === 'FAIL')
    ).toBe(true);
    expect(result.engineeringClear).toBe(false);
  });

  it('records disposable prebuild PASS alongside stale workspace FAIL', () => {
    const result = evaluateReleaseEligibility({
      manifest: baseManifest,
      env: {},
      gitRevision: 'abc123',
      androidInspection: {
        ok: false,
        errors: ['Stale release signingConfig silently falls back to debug.keystore'],
        findings: {},
      },
      evidence: {
        androidDisposablePrebuildOk: true,
        androidDisposablePrebuildPath: 'artifacts/release/android-prebuild-inspection.json',
      },
      nodeVersion: 'v24.21.0',
    });
    expect(
      result.checks.some((c) => c.id === 'android-disposable-prebuild' && c.status === 'PASS')
    ).toBe(true);
  });

  it('fails when notAnApprovalToLaunch is omitted', () => {
    const result = evaluateReleaseEligibility({
      manifest: { ...baseManifest, notAnApprovalToLaunch: false },
      env: {},
      gitRevision: 'abc123',
      androidInspection: null,
      evidence: {},
      nodeVersion: 'v24.21.0',
    });
    expect(
      result.checks.some((c) => c.id === 'manifest-not-approval' && c.status === 'FAIL')
    ).toBe(true);
  });

  it('records Node engines mismatch as BLOCKED without suppressing it', () => {
    const result = evaluateReleaseEligibility({
      manifest: baseManifest,
      env: {},
      gitRevision: 'abc123',
      androidInspection: null,
      evidence: {},
      nodeVersion: 'v24.11.1',
    });
    const nodeCheck = result.checks.find((c) => c.id === 'node-engines');
    expect(nodeCheck?.status).toBe('BLOCKED');
  });
});
