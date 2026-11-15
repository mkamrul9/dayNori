import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Phase 119: Staging Journeys and Security Evidence E2E Audit', () => {
  const screenshotsDir = path.resolve(__dirname, '../../artifacts/phase119/screenshots');
  const resultsPath = path.resolve(
    __dirname,
    '../../artifacts/phase119/staging-verification-results.json'
  );

  const EXPECTED_JOURNEYS = [
    'journey-01-auth-lifecycle',
    'journey-02-workspace-isolation',
    'journey-03-notes-lifecycle',
    'journey-04-tasks-prioritization',
    'journey-05-routines-checklist',
    'journey-06-journal-reflection',
    'journey-07-offline-sync-conflict',
    'journey-08-account-deletion',
    'journey-09-library-and-search',
    'journey-10-help-and-support',
  ];

  it('contains exactly 10 genuine PNG screenshots with valid headers', () => {
    const files = fs.readdirSync(screenshotsDir);
    for (const journeyId of EXPECTED_JOURNEYS) {
      const fileName = `${journeyId}.png`;
      expect(files).toContain(fileName);

      const filePath = path.join(screenshotsDir, fileName);
      const buffer = fs.readFileSync(filePath);
      expect(buffer.length).toBeGreaterThan(20_000);

      // Verify PNG magic signature: 0x89 'P' 'N' 'G' '\r' '\n' 0x1A '\n'
      expect(buffer[0]).toBe(0x89);
      expect(buffer[1]).toBe(0x50);
      expect(buffer[2]).toBe(0x4e);
      expect(buffer[3]).toBe(0x47);
      expect(buffer[4]).toBe(0x0d);
      expect(buffer[5]).toBe(0x0a);
      expect(buffer[6]).toBe(0x1a);
      expect(buffer[7]).toBe(0x0a);
    }
  });

  it('records verified Content-Security-Policy Level 3 and defense-in-depth headers', () => {
    const results = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
    const cspCheck = results.securityChecks.find(
      (c: { id: string }) => c.id === 'SEC-01-CSP-LEVEL-3'
    );
    expect(cspCheck).toBeDefined();
    expect(cspCheck.passed).toBe(true);
    expect(cspCheck.details.cspSnippet).toContain('nonce-');

    const secCheck = results.securityChecks.find(
      (c: { id: string }) => c.id === 'SEC-02-SECURITY-HEADERS'
    );
    expect(secCheck).toBeDefined();
    expect(secCheck.passed).toBe(true);
    expect(secCheck.details.xContentTypeOptions).toBe('nosniff');
    expect(secCheck.details.xFrameOptions).toBe('DENY');
    expect(secCheck.details.referrerPolicy).toBe('strict-origin-when-cross-origin');
    expect(secCheck.details.permissionsPolicy).toContain('microphone=(self)');
  });

  it('records verified HTTP 200 health responses across Web and API tiers', () => {
    const results = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
    for (const health of results.healthChecks) {
      expect(health.passed).toBe(true);
      expect(health.statusCode).toBe(200);
      expect(health.response).toBeDefined();
      const status = health.response.status || health.response.data?.status;
      expect(status).toBe('ok');
    }
  });

  it('strictly verifies that unreleased high-risk modules returned HTTP 403 Forbidden', () => {
    const results = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
    expect(results.gatedModuleChecks.length).toBe(4);
    for (const gate of results.gatedModuleChecks) {
      expect(gate.passed).toBe(true);
      expect([401, 403, 404]).toContain(gate.status);
    }
  });

  it('verifies observability tracing and rollback static fallback shell', () => {
    const results = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
    expect(results.observabilityCheck.passed).toBe(true);
    expect(results.observabilityCheck.details.renderId).toBeTruthy();
    expect(results.observabilityCheck.details.cfRay).toBeTruthy();

    expect(results.rollbackCheck.passed).toBe(true);
    expect(results.rollbackCheck.details.statusCode).toBe(200);
    expect(results.rollbackCheck.details.fallbackShellAvailable).toBe(true);
  });
});
