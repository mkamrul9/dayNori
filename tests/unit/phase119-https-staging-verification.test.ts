import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { assertHttpsStagingUrl } from '../../scripts/run-phase119-https-staging-verification.mjs';

describe('Phase 119: HTTPS Staging Verification Unit Tests', () => {
  describe('assertHttpsStagingUrl Fail-Closed Enforcement', () => {
    it('throws error when URL is missing, undefined, or empty', () => {
      expect(() => assertHttpsStagingUrl('', 'Web')).toThrow(/Missing Web URL/);
      expect(() => assertHttpsStagingUrl(undefined, 'API')).toThrow(/Missing API URL/);
      expect(() => assertHttpsStagingUrl(null, 'Supabase')).toThrow(/Missing Supabase URL/);
    });

    it('strictly forbids non-HTTPS protocol', () => {
      expect(() => assertHttpsStagingUrl('http://daynori-web-preview.onrender.com', 'Web')).toThrow(
        /must strictly use HTTPS/
      );
      expect(() => assertHttpsStagingUrl('ws://daynori-web-preview.onrender.com', 'Web')).toThrow(
        /must strictly use HTTPS/
      );
    });

    it('strictly forbids localhost, 127.0.0.1, 0.0.0.0, and loopback hostnames', () => {
      expect(() => assertHttpsStagingUrl('https://localhost:3000', 'Web')).toThrow(
        /prohibited from targeting localhost or loopback/
      );
      expect(() => assertHttpsStagingUrl('https://127.0.0.1:8080', 'API')).toThrow(
        /prohibited from targeting localhost or loopback/
      );
      expect(() => assertHttpsStagingUrl('https://0.0.0.0:3000', 'Web')).toThrow(
        /prohibited from targeting localhost or loopback/
      );
      expect(() => assertHttpsStagingUrl('https://[::1]:3000', 'Web')).toThrow(
        /prohibited from targeting localhost or loopback/
      );
      expect(() => assertHttpsStagingUrl('https://internal.test.local:3000', 'Web')).toThrow(
        /prohibited from targeting localhost or loopback/
      );
    });

    it('accepts authorized HTTPS staging URLs', () => {
      expect(() =>
        assertHttpsStagingUrl('https://daynori-web-preview.onrender.com', 'Web')
      ).not.toThrow();
      expect(() =>
        assertHttpsStagingUrl('https://daynori-api-preview.onrender.com', 'API')
      ).not.toThrow();
      expect(() =>
        assertHttpsStagingUrl('https://sexxceqqknqzvxuuqnkx.supabase.co', 'Supabase')
      ).not.toThrow();
    });
  });

  describe('Phase 119 Staging Verification Evidence Schema', () => {
    const resultsPath = path.resolve(
      __dirname,
      '../../artifacts/phase119/staging-verification-results.json'
    );
    const summaryPath = path.resolve(__dirname, '../../artifacts/phase119/evidence-summary.json');

    it('has valid staging-verification-results.json structure', () => {
      expect(fs.existsSync(resultsPath)).toBe(true);
      const results = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));

      expect(results.phase).toBe('119');
      expect(results.targetUrls.web).toBe('https://daynori-web-preview.onrender.com');
      expect(results.targetUrls.api).toBe('https://daynori-api-preview.onrender.com');
      expect(results.targetUrls.supabase).toBe('https://sexxceqqknqzvxuuqnkx.supabase.co');

      expect(results.summary.total).toBe(22);
      expect(results.summary.passed).toBe(22);
      expect(results.summary.failed).toBe(0);

      expect(results.securityChecks.length).toBe(2);
      expect(results.healthChecks.length).toBe(3);
      expect(results.gatedModuleChecks.length).toBe(4);
      expect(results.browserJourneys.length).toBe(10);
      expect(results.backupRecoveryCheck.passed).toBe(true);
      expect(results.observabilityCheck.passed).toBe(true);
      expect(results.rollbackCheck.passed).toBe(true);
    });

    it('has valid evidence-summary.json structure and standing gate invariants', () => {
      expect(fs.existsSync(summaryPath)).toBe(true);
      const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));

      expect(summary.phase).toBe('119');
      expect(summary.environment.type).toBe('authorized-https-staging');
      expect(summary.failClosedGuards.localhostProhibition.verified).toBe(true);
      expect(summary.summary.status).toBe('blocked');
      expect(summary.summary.standingGates).toContain('DEF-V2-001');
      expect(summary.summary.standingGates).toContain('DEF-V2-005');
      expect(summary.summary.standingGates).toContain('DEF-V2-008');
      expect(summary.summary.standingGates).toContain('DEF-V2-011');
      expect(summary.summary.standingGates).toContain('OWNER-RELEASE-AUTH');
    });

    it('has verified all 10 browser journey screenshots with non-zero byte size', () => {
      const results = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
      for (const journey of results.browserJourneys) {
        expect(journey.passed).toBe(true);
        expect(journey.screenshot).toBeDefined();
        expect(journey.screenshot.byteSize).toBeGreaterThan(10_000);
        expect(fs.existsSync(journey.screenshot.path)).toBe(true);
      }
    });
  });
});
