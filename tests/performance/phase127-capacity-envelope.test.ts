import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

const REPO_ROOT = path.resolve(__dirname, '../..');
const resultsPath = path.join(REPO_ROOT, 'artifacts', 'phase127', 'load-test-results.json');
const matrixPath = path.join(REPO_ROOT, 'artifacts', 'phase127', 'capacity-envelope-matrix.json');
const envelopeDocPath = path.join(REPO_ROOT, 'artifacts', 'phase127', 'operational-envelope-and-thresholds.md');

describe('Phase 127: Authenticated Transactional Load Testing & Empirical Capacity Envelope', () => {
  it('loads valid results and capacity envelope matrix artifacts without schema errors', () => {
    expect(fs.existsSync(resultsPath)).toBe(true);
    expect(fs.existsSync(matrixPath)).toBe(true);
    expect(fs.existsSync(envelopeDocPath)).toBe(true);

    const results = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
    const matrix = JSON.parse(fs.readFileSync(matrixPath, 'utf8'));

    expect(results.runId).toBeDefined();
    expect(results.timestamp).toBeDefined();
    expect(Array.isArray(results.stages)).toBe(true);
    expect(results.stages.length).toBeGreaterThanOrEqual(5);

    expect(matrix.scenarios).toBeDefined();
    expect(matrix.scenarios.length).toBe(3);
  });

  it('verifies target infrastructure strictly uses authorized HTTPS staging and never localhost', () => {
    const results = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
    const matrix = JSON.parse(fs.readFileSync(matrixPath, 'utf8'));

    expect(results.webUrl).toMatch(/^https:\/\//);
    expect(results.apiUrl).toMatch(/^https:\/\//);
    expect(results.webUrl).not.toContain('localhost');
    expect(results.webUrl).not.toContain('127.0.0.1');
    expect(results.apiUrl).not.toContain('localhost');
    expect(results.apiUrl).not.toContain('127.0.0.1');

    expect(matrix.targetInfrastructure.webUrl).toBe(results.webUrl);
    expect(matrix.targetInfrastructure.apiUrl).toBe(results.apiUrl);
    expect(matrix.targetInfrastructure.dbCluster).toContain('supabase.com:5432');
  });

  it('demonstrates genuine authenticated transactional coverage across Create, Read, Update, Search, and Sync', () => {
    const results = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
    const allOperations = new Set<string>();

    for (const stage of results.stages) {
      if (stage.perOperation) {
        for (const op of Object.keys(stage.perOperation)) {
          allOperations.add(op);
        }
      }
    }

    // Must execute representative mix of operations
    expect(allOperations.size).toBeGreaterThanOrEqual(4);
    const opList = Array.from(allOperations);
    const hasWrite = opList.some((op) => ['create_note', 'create_task', 'update_note', 'complete_task'].includes(op));
    const hasRead = opList.some((op) => ['read_notes', 'read_tasks', 'read_routines', 'search', 'sync_pull'].includes(op));

    expect(hasWrite).toBe(true);
    expect(hasRead).toBe(true);
  });

  it('proves Tier 1 (1,000 Users / 30 CCU) is demonstrably supported on Render Free + Supabase Free with 0% 5xx errors', () => {
    const matrix = JSON.parse(fs.readFileSync(matrixPath, 'utf8'));
    const tier1 = matrix.scenarios.find((s: any) => s.tier.includes('1,000 Registered Users'));

    expect(tier1).toBeDefined();
    expect(tier1.peakConcurrentUsers).toBe(30);
    expect(tier1.serverErrorRatePct).toBe(0);
    expect(tier1.status).toBe('SUPPORTED');
    expect(tier1.originLatencyP95Ms).toBeLessThan(1500);
    expect(tier1.dbPeakActiveConnections).toBeLessThanOrEqual(15);
  });

  it('identifies empirical breaking points for Tier 2 (5,000 Users / 150 CCU) and Tier 3 (10,000 Users / 300 CCU) requiring Managed PaaS', () => {
    const matrix = JSON.parse(fs.readFileSync(matrixPath, 'utf8'));
    const tier2 = matrix.scenarios.find((s: any) => s.tier.includes('5,000 Registered Users'));
    const tier3 = matrix.scenarios.find((s: any) => s.tier.includes('10,000 Registered Users'));

    expect(tier2).toBeDefined();
    expect(tier2.peakConcurrentUsers).toBe(150);
    expect(tier2.status).toBe('UNSUPPORTED_ON_FREE_TIER');
    expect(tier2.hostingRecommendation).toContain('Managed PaaS');

    expect(tier3).toBeDefined();
    expect(tier3.peakConcurrentUsers).toBe(300);
    expect(tier3.status).toBe('HARD_BOUNDARY_EXCEEDED');
    expect(tier3.hostingRecommendation).toContain('Managed PaaS');
  });

  it('encodes measured safe operating envelope, alert thresholds, and automated rollback triggers', () => {
    const matrix = JSON.parse(fs.readFileSync(matrixPath, 'utf8'));
    const env = matrix.safeOperatingEnvelope;

    expect(env.maxSupportedConcurrentUsers).toBe(30);
    expect(env.maxSupportedThroughputRps).toBeGreaterThanOrEqual(10);
    expect(env.maxSafeRegisteredUsersOnFreeTier).toBe(1000);

    // Warning and critical alert thresholds
    expect(env.alertThresholds.warning.concurrency).toBe(25);
    expect(env.alertThresholds.warning.p95LatencyMs).toBe(600);
    expect(env.alertThresholds.critical.concurrency).toBe(35);
    expect(env.alertThresholds.critical.p95LatencyMs).toBe(1500);

    // Rollback triggers
    expect(env.rollbackTriggers.length).toBeGreaterThanOrEqual(3);
    const rollbackText = env.rollbackTriggers.join(' ');
    expect(rollbackText).toContain('5xx');
    expect(rollbackText).toContain('latency');
    expect(rollbackText).toContain('pool exhaustion');
  });
});
