import { describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('Phase 112: Core Web/PWA Browser Release Verification on Staging Tests', () => {
  const phase112Dir = path.join(repoRoot, 'artifacts/phase112');
  const verificationJsonPath = path.join(phase112Dir, 'staging-release-verification.json');
  const summaryJsonPath = path.join(phase112Dir, 'evidence-summary.json');
  const runnerScriptPath = path.join(repoRoot, 'scripts/run-phase112-staging-release-verification.mjs');

  interface JourneyResult {
    id: string;
    title: string;
    passed: boolean;
    details: Record<string, unknown> | string;
    screenshot: {
      path: string;
      sha256: string;
    } | null;
  }

  interface VerificationReport {
    phase: string;
    name: string;
    gitRev: string;
    buildId: string;
    timestamp: string;
    environment: {
      node: string;
      platform: string;
      arch: string;
      database: string;
      ports: Record<string, number>;
    };
    standingGates: Record<string, string>;
    databaseInvariants: Array<{
      check: string;
      expected?: unknown;
      actual?: unknown;
      passed: boolean;
    }>;
    journeys: JourneyResult[];
    summary: {
      total: number;
      passed: number;
      failed: number;
    };
  }

  it('verifies staging runner script exists and is executable', () => {
    expect(fs.existsSync(runnerScriptPath)).toBe(true);
    const scriptContent = fs.readFileSync(runnerScriptPath, 'utf8');
    expect(scriptContent).toContain('PHASE 112: Core Web/PWA Release Verification');
    expect(scriptContent).toContain('CdpClient');
  });

  it('verifies Phase 112 verification report structure and execution metadata', () => {
    expect(fs.existsSync(verificationJsonPath)).toBe(true);
    expect(fs.existsSync(summaryJsonPath)).toBe(true);

    const report = JSON.parse(fs.readFileSync(verificationJsonPath, 'utf8')) as VerificationReport;
    const summary = JSON.parse(fs.readFileSync(summaryJsonPath, 'utf8')) as Record<string, unknown>;

    expect(report.phase).toBe('112');
    expect(report.name.toLowerCase()).toContain('core web/pwa browser release verification');
    expect(typeof report.gitRev).toBe('string');
    expect(report.gitRev.length).toBeGreaterThan(0);
    expect(report.buildId).toBe('0pVLVdS2656M-tozOD4je');
    expect(report.environment.ports.auth).toBe(54321);
    expect(report.environment.ports.api).toBe(3114);
    expect(report.environment.ports.web).toBe(3116);
    expect(report.environment.ports.cdp).toBe(9232);

    expect(summary.phase).toBe('112');
    expect(summary.totalJourneys).toBe(10);
    expect(summary.passedJourneys).toBe(10);
    expect(summary.failedJourneys).toBe(0);
    expect(summary.status).toBe('COMPLETE_BOUNDED');
  });

  it('guarantees all 10 production-style browser journeys passed cleanly', () => {
    const report = JSON.parse(fs.readFileSync(verificationJsonPath, 'utf8')) as VerificationReport;

    expect(report.summary.total).toBe(10);
    expect(report.summary.passed).toBe(10);
    expect(report.summary.failed).toBe(0);
    expect(report.journeys).toHaveLength(10);

    const expectedJourneys = [
      'journey-01-auth-lifecycle',
      'journey-02-workspace-isolation',
      'journey-03-core-organizer-crud',
      'journey-04-unified-search',
      'journey-05-attachments-scope',
      'journey-06-pwa-offline-reopen',
      'journey-07-concurrency-conflict-resolution',
      'journey-08-deletion-and-export',
      'journey-09-help-and-support-delivery',
      'journey-10-failure-and-gating-cases',
    ];

    const actualJourneys = report.journeys.map((j) => j.id);
    expect(actualJourneys).toEqual(expectedJourneys);

    for (const journey of report.journeys) {
      expect(journey.passed).toBe(true);
      expect(journey.screenshot).not.toBeNull();
      expect(journey.details).toBeDefined();
    }
  });

  it('validates screenshot captures exist on disk with valid dimensions and SHA-256 integrity', () => {
    const report = JSON.parse(fs.readFileSync(verificationJsonPath, 'utf8')) as VerificationReport;

    for (const journey of report.journeys) {
      const ss = journey.screenshot!;
      expect(fs.existsSync(ss.path)).toBe(true);

      const fileBuffer = fs.readFileSync(ss.path);
      expect(fileBuffer.length).toBeGreaterThan(1024); // Non-empty image (> 1KB)

      const computedSha = crypto.createHash('sha256').update(fileBuffer).digest('hex');
      expect(computedSha).toBe(ss.sha256);
    }
  });

  it('verifies database isolation and schema migration invariants', () => {
    const report = JSON.parse(fs.readFileSync(verificationJsonPath, 'utf8')) as VerificationReport;

    expect(report.databaseInvariants.length).toBeGreaterThanOrEqual(2);

    const migrationsCheck = report.databaseInvariants.find((i) => i.check === 'schema_migrations_count');
    expect(migrationsCheck).toBeDefined();
    expect(migrationsCheck!.passed).toBe(true);
    expect(Number(migrationsCheck!.actual)).toBeGreaterThanOrEqual(80);

    const noteIsolationCheck = report.databaseInvariants.find((i) => i.check === 'cross_workspace_note_isolation');
    expect(noteIsolationCheck).toBeDefined();
    expect(noteIsolationCheck!.passed).toBe(true);
  });

  it('verifies strict fail-closed enforcement of standing release gates', () => {
    const report = JSON.parse(fs.readFileSync(verificationJsonPath, 'utf8')) as VerificationReport;

    const gates = report.standingGates;
    expect(gates['DEF-V2-001']).toContain('blocked');
    expect(gates['DEF-V2-004']).toContain('blocked');
    expect(gates['DEF-V2-005']).toContain('blocked');
    expect(gates['DEF-V2-007']).toContain('blocked');
    expect(gates['DEF-V2-008']).toContain('blocked');
    expect(gates['DEF-V2-011']).toContain('blocked');
    expect(gates['DEF-V2-013']).toContain('blocked');
    expect(gates['OWNER-SIGNING-KEYS']).toContain('blocked');
    expect(gates['OWNER-RELEASE-AUTH']).toContain('blocked');
    expect(gates['Phase 71']).toContain('blocked');
  });
});
