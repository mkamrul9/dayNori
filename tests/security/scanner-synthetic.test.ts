import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { PATTERNS, scanFiles } from '../../scripts/scan-secrets.mjs';

interface AuditAdvisory {
  module_name: string;
  severity: string;
  github_advisory_id: string;
}

interface AuditReport {
  error?: { code: string; summary: string };
  advisories?: Record<string, AuditAdvisory>;
}

interface SecurityException {
  ghsaId?: string;
  module?: string;
  severity?: string;
  approvedBy?: string;
  remediation?: string;
  expiresAt?: string;
}

interface UnhandledAdvisory {
  id: string;
  ghsaId: string;
  module: string;
}

describe('Security Scanners Synthetic Test Suite', () => {
  describe('Secret Scanner Detection and Redaction', () => {
    it('detects a real AWS Access Key pattern', () => {
      const awsRegex = PATTERNS.find((p) => p.name === 'AWS Access Key ID')!.regex;
      // Real AWS Access Key format: AKIA + 16 alphanumeric characters = 20 characters total
      const syntheticKey = ['AKIA', 'IOSFODNN7EXAMPLE'].join('');
      expect(syntheticKey.length).toBe(20);
      expect(awsRegex.test(syntheticKey)).toBe(true);
      expect(awsRegex.test('AKIA_TEST_KEY_PLACEHOLDER')).toBe(false); // Validates why the previous test was flawed
    });

    it('detects GitHub PAT, Slack token, and private key headers', () => {
      const ghpRegex = PATTERNS.find((p) => p.name === 'GitHub Personal Access Token')!.regex;
      const slackRegex = PATTERNS.find((p) => p.name === 'Slack Bot Token')!.regex;
      const rsaRegex = PATTERNS.find((p) => p.name === 'RSA/EC Private Key')!.regex;

      expect(ghpRegex.test(['ghp_', '012345678901234567890123456789012345'].join(''))).toBe(true);
      expect(slackRegex.test(['xoxb-', '1234567890-abcdef12345678'].join(''))).toBe(true);
      expect(rsaRegex.test(['-----BEGIN ', 'RSA PRIVATE KEY-----'].join(''))).toBe(true);
    });

    it('strictly redacts secret values and reports only file, line, and rule', () => {
      const tempDir = path.resolve(__dirname, '../../node_modules/.temp-scan-test');
      fs.mkdirSync(tempDir, { recursive: true });
      const testFile = path.join(tempDir, 'synthetic-secret.txt');
      const secretValue = ['AKIA', 'IOSFODNN7EXAMPLE'].join('');

      fs.writeFileSync(testFile, `const key = "${secretValue}";\n`);

      try {
        const { violations, readErrors } = scanFiles([testFile]);
        expect(readErrors).toHaveLength(0);
        expect(violations).toHaveLength(1);

        const v = violations[0];
        expect(v.file).toContain('synthetic-secret.txt');
        expect(v.line).toBe(1);
        expect(v.rule).toBe('AWS Access Key ID');

        // CRITICAL REQUIREMENT: violation object must NEVER contain the secret value
        expect((v as Record<string, unknown>).snippet).toBeUndefined();
        expect(JSON.stringify(v)).not.toContain(secretValue);
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('explicitly reports file read errors instead of silent bypassing', () => {
      const nonExistentFile = path.resolve(__dirname, 'non-existent-secret-file.txt');
      const { violations, readErrors } = scanFiles([nonExistentFile]);

      expect(violations).toHaveLength(0);
      expect(readErrors).toHaveLength(1);
      expect(readErrors[0].file).toContain('non-existent-secret-file.txt');
      expect(readErrors[0].message).toBeDefined();
    });
  });

  describe('Dependency Vulnerability Auditor Logic', () => {
    function evaluateAuditReport(
      report: AuditReport,
      exceptions: SecurityException[]
    ): UnhandledAdvisory[] {
      const unhandled: UnhandledAdvisory[] = [];
      const now = new Date();

      // Validate exceptions contract
      for (const ex of exceptions) {
        if (!ex.ghsaId?.startsWith('GHSA-')) {
          throw new Error(`Invalid ghsaId: ${ex.ghsaId}`);
        }
        if (!ex.module) {
          throw new Error(`Missing module in exception: ${ex.ghsaId}`);
        }
        if (!ex.approvedBy || !ex.remediation) {
          throw new Error(`Missing approval or remediation in exception: ${ex.ghsaId}`);
        }
        if (!ex.expiresAt || isNaN(Date.parse(ex.expiresAt))) {
          throw new Error(`Invalid expiresAt in exception: ${ex.ghsaId}`);
        }
        if (new Date(ex.expiresAt) < now) {
          throw new Error(`Expired exception: ${ex.ghsaId}`);
        }
      }

      if (report.error) {
        throw new Error(`Registry error: ${JSON.stringify(report.error)}`);
      }

      if (!report.advisories || typeof report.advisories !== 'object') {
        throw new Error('Malformed report');
      }

      for (const [id, adv] of Object.entries(report.advisories)) {
        if (adv.severity === 'high' || adv.severity === 'critical') {
          const match = exceptions.find(
            (ex) => ex.ghsaId === adv.github_advisory_id && ex.module === adv.module_name
          );
          if (!match) {
            unhandled.push({ id, ghsaId: adv.github_advisory_id, module: adv.module_name });
          }
        }
      }

      return unhandled;
    }

    it('rejects unapproved high/critical advisories', () => {
      const mockReport: AuditReport = {
        advisories: {
          '100': {
            module_name: 'some-lib',
            severity: 'high',
            github_advisory_id: 'GHSA-unapproved-1234',
          },
        },
      };
      const exceptions: SecurityException[] = [];

      const unhandled = evaluateAuditReport(mockReport, exceptions);
      expect(unhandled).toHaveLength(1);
      expect(unhandled[0].ghsaId).toBe('GHSA-unapproved-1234');
    });

    it('rejects an unrelated advisory even within an excepted package', () => {
      const mockReport: AuditReport = {
        advisories: {
          '101': {
            module_name: 'next',
            severity: 'critical',
            github_advisory_id: 'GHSA-new-unapproved-vuln',
          },
        },
      };
      // Exception exists for Next.js, but for a different GHSA
      const exceptions: SecurityException[] = [
        {
          ghsaId: 'GHSA-m99w-x7hq-7vfj',
          module: 'next',
          severity: 'high',
          approvedBy: 'security-lead',
          remediation: 'Upgrade to Next 15',
          expiresAt: '2026-12-31',
        },
      ];

      const unhandled = evaluateAuditReport(mockReport, exceptions);
      // It must NOT bypass just because module is 'next'
      expect(unhandled).toHaveLength(1);
      expect(unhandled[0].ghsaId).toBe('GHSA-new-unapproved-vuln');
    });

    it('rejects expired exceptions', () => {
      const mockReport: AuditReport = {
        advisories: {
          '102': {
            module_name: 'next',
            severity: 'high',
            github_advisory_id: 'GHSA-m99w-x7hq-7vfj',
          },
        },
      };
      const expiredExceptions: SecurityException[] = [
        {
          ghsaId: 'GHSA-m99w-x7hq-7vfj',
          module: 'next',
          severity: 'high',
          approvedBy: 'security-lead',
          remediation: 'Upgrade to Next 15',
          expiresAt: '2026-01-01', // Expired
        },
      ];

      expect(() => evaluateAuditReport(mockReport, expiredExceptions)).toThrow(/Expired exception/);
    });

    it('rejects invalid configuration and missing approval metadata', () => {
      const mockReport: AuditReport = { advisories: {} };
      const invalidExceptions: SecurityException[] = [
        {
          ghsaId: 'GHSA-m99w-x7hq-7vfj',
          module: 'next',
          severity: 'high',
          // Missing approvedBy and remediation
          expiresAt: '2026-12-31',
        },
      ];

      expect(() => evaluateAuditReport(mockReport, invalidExceptions)).toThrow(
        /Missing approval or remediation/
      );
    });

    it('rejects audit service and registry errors', () => {
      const errorReport: AuditReport = {
        error: { code: 'E500', summary: 'Registry Internal Server Error' },
      };

      expect(() => evaluateAuditReport(errorReport, [])).toThrow(/Registry error/);
    });
  });
});
