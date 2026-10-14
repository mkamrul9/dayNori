import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { PATTERNS, scanFiles } from '../../scripts/scan-secrets.mjs';
import {
  checkProcessResult,
  evaluateAdvisories,
  parseReport,
  validateExceptions,
} from '../../scripts/audit-lib.mjs';

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

  describe('Dependency audit implementation (scripts/audit-lib.mjs and CLI)', () => {
    const root = path.resolve(__dirname, '../..');
    const tmp = path.join(root, 'node_modules', '.temp-audit-test');
    const NOW = new Date('2026-10-14T00:00:00Z');

    const advisory = (over: Record<string, unknown> = {}) => ({
      module_name: 'node-forge',
      severity: 'high',
      github_advisory_id: 'GHSA-aaaa-bbbb-cccc',
      title: 'synthetic',
      findings: [{ version: '1.4.0', paths: ['apps/mobile > node-forge@1.4.0'] }],
      ...over,
    });
    const report = (advisories: unknown) => JSON.stringify({ advisories });

    beforeAll(() => {
      fs.mkdirSync(path.join(tmp, 'ev'), { recursive: true });
      fs.writeFileSync(
        path.join(tmp, 'ev', 'approval.md'),
        'Approved by Jane Example for GHSA-aaaa-bbbb-cccc.'
      );
    });
    afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

    const exception = (over: Record<string, unknown> = {}) => ({
      ghsaId: 'GHSA-aaaa-bbbb-cccc',
      module: 'node-forge',
      installedVersions: ['1.4.0'],
      paths: ['apps/mobile > node-forge@1.4.0'],
      applicability: 'Dev-only tooling path; not reachable at runtime.',
      remediation: 'Upgrade when a patched release ships.',
      expiresAt: '2026-12-31',
      approval: {
        approvedBy: 'Jane Example',
        evidence: 'node_modules/.temp-audit-test/ev/approval.md',
      },
      ...over,
    });
    const valid = (ex: Record<string, unknown>) =>
      validateExceptions({ dependencyVulnerabilityExceptions: [ex] }, { now: NOW, root });

    it('rejects arrays posing as advisory objects and malformed entries', () => {
      expect(parseReport(report([])).error).toMatch(/advisories/);
      expect(parseReport(report(null)).error).toMatch(/advisories/);
      expect(parseReport(report({ '1': 'nope' })).error).toMatch(/invalid advisory/);
      expect(parseReport(report({ '1': advisory({ severity: 'severe' }) })).error).toMatch(
        /severity/
      );
      expect(
        parseReport(report({ '1': advisory({ github_advisory_id: undefined }) })).error
      ).toMatch(/GHSA/);
      expect(parseReport(report({ '1': advisory({ findings: [] }) })).error).toMatch(/findings/);
      expect(parseReport('').error).toMatch(/empty/);
      expect(parseReport('{not json').error).toMatch(/JSON/);
      expect(parseReport(JSON.stringify({ error: { code: 'E500' } })).error).toMatch(
        /service error/
      );
    });

    it('rejects process failure, termination and spawn errors', () => {
      expect(checkProcessResult({ status: 0, signal: null })).toBeNull();
      expect(checkProcessResult({ status: 1, signal: null })).toBeNull();
      expect(checkProcessResult({ status: 2, signal: null })).toMatch(/unexpectedly/);
      expect(checkProcessResult({ status: null, signal: 'SIGKILL' })).toMatch(/signal/);
      expect(checkProcessResult({ error: new Error('ENOENT') })).toMatch(/ENOENT/);
    });

    it('fails the CLI when pnpm exits unexpectedly even with valid-looking JSON', () => {
      const bin = path.join(tmp, 'bin');
      fs.mkdirSync(bin, { recursive: true });
      const json = JSON.stringify({ advisories: {} });
      const win = process.platform === 'win32';
      const shim = path.join(bin, win ? 'pnpm.cmd' : 'pnpm');
      fs.writeFileSync(
        shim,
        win ? `@echo off\r\necho ${json}\r\nexit /b 2\r\n` : `#!/bin/sh\necho '${json}'\nexit 2\n`,
        { mode: 0o755 }
      );
      const res = spawnSync(process.execPath, ['scripts/audit-dependencies.mjs'], {
        cwd: root,
        encoding: 'utf8',
        env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}` },
      });
      expect(res.status).toBe(1);
      expect(res.stderr).toMatch(/exited unexpectedly with status 2/);
    });

    it('honors a fully specified, human-approved exception', () => {
      const { errors, exceptions } = valid(exception());
      expect(errors).toEqual([]);
      const r = evaluateAdvisories(parseReport(report({ '1': advisory() })).report, exceptions);
      expect(r.unhandled).toHaveLength(0);
      expect(r.excepted).toHaveLength(1);
    });

    it('does not cover a different installed version or dependency path', () => {
      const { exceptions } = valid(exception());
      const otherVersion = advisory({
        findings: [{ version: '1.5.0', paths: ['apps/mobile > node-forge@1.4.0'] }],
      });
      const otherPath = advisory({
        findings: [{ version: '1.4.0', paths: ['apps/web > other > node-forge@1.4.0'] }],
      });
      const extraPath = advisory({
        findings: [
          {
            version: '1.4.0',
            paths: ['apps/mobile > node-forge@1.4.0', 'apps/web > node-forge@1.4.0'],
          },
        ],
      });
      for (const adv of [otherVersion, otherPath, extraPath]) {
        const r = evaluateAdvisories(parseReport(report({ '1': adv })).report, exceptions);
        expect(r.unhandled).toHaveLength(1);
      }
    });

    it('rejects an unrelated advisory within an excepted package', () => {
      const { exceptions } = valid(exception());
      const adv = advisory({ github_advisory_id: 'GHSA-zzzz-zzzz-zzzz' });
      const r = evaluateAdvisories(parseReport(report({ '1': adv })).report, exceptions);
      expect(r.unhandled).toHaveLength(1);
    });

    it('rejects expired, malformed and unapproved exceptions', () => {
      expect(valid(exception({ expiresAt: '2026-01-01' })).errors[0]).toMatch(/expired/);
      expect(valid(exception({ expiresAt: 'soon' })).errors[0]).toMatch(/expiresAt/);
      expect(valid(exception({ installedVersions: [] })).errors[0]).toMatch(/installedVersions/);
      expect(valid(exception({ approval: undefined })).errors[0]).toMatch(/approval record/);
      expect(
        valid(exception({ approval: { approvedBy: 'security-lead', evidence: 'README.md' } }))
          .errors[0]
      ).toMatch(/accountable person/);
      expect(
        valid(exception({ approval: { approvedBy: 'Jane Example', evidence: 'missing.md' } }))
          .errors[0]
      ).toMatch(/not found/);
      expect(
        valid(
          exception({
            approval: {
              approvedBy: 'Someone Else',
              evidence: 'node_modules/.temp-audit-test/ev/approval.md',
            },
          })
        ).errors[0]
      ).toMatch(/name the approver/);
      expect(
        valid(exception({ approval: { approvedBy: 'Jane Example', evidence: '../outside.md' } }))
          .errors[0]
      ).toMatch(/not found/);
    });

    it('does not treat non-blocking severities as failures', () => {
      const r = evaluateAdvisories(
        parseReport(report({ '1': advisory({ severity: 'moderate' }) })).report,
        []
      );
      expect(r.unhandled).toHaveLength(0);
    });
  });
});
