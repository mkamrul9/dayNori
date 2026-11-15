import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('Phase 111: Theme Capture and Visual Verification Evidence Tests', () => {
  const phase111Dir = path.join(repoRoot, 'artifacts/phase111');
  const manifestBeforePath = path.join(phase111Dir, 'capture-manifest-before.json');
  const manifestAfterPath = path.join(phase111Dir, 'capture-manifest-after.json');
  const humanReviewPath = path.join(phase111Dir, 'human-design-review.md');
  const visualReportPath = path.join(phase111Dir, 'visual-verification-report.md');
  const summaryPath = path.join(phase111Dir, 'evidence-summary.json');

  interface ManifestCapture {
    screen: string;
    viewport: string;
    width: number;
    height: number;
    theme: string;
    filename: string;
    sha256: string;
    bytes: number;
    horizontalOverflow: boolean;
  }

  interface Manifest {
    phase: string;
    mode: string;
    timestamp: string;
    viewports: Array<{ name: string; width: number; height: number; isMobile: boolean }>;
    themes: string[];
    screens: string[];
    captures: ManifestCapture[];
    themeDifferenceVerification: {
      pairsTested: number;
      pairsDistinct: number;
      pairsIdentical: number;
      passed: boolean;
      failures: Array<{ screen: string; viewport: string; sha256: string }>;
    };
  }

  it('verifies before and after capture manifests exist and conform to schema', () => {
    expect(fs.existsSync(manifestBeforePath)).toBe(true);
    expect(fs.existsSync(manifestAfterPath)).toBe(true);

    const b = JSON.parse(fs.readFileSync(manifestBeforePath, 'utf8')) as Manifest;
    const a = JSON.parse(fs.readFileSync(manifestAfterPath, 'utf8')) as Manifest;

    expect(b.phase).toBe('111');
    expect(a.phase).toBe('111');
    expect(b.mode).toBe('before');
    expect(a.mode).toBe('after');

    const expectedScreens = ['today', 'plan', 'library', 'journal', 'settings', 'create', 'menus', 'assistant'];
    expect(b.screens).toEqual(expectedScreens);
    expect(a.screens).toEqual(expectedScreens);

    const expectedViewports = ['desktop-1280', 'mobile-412', 'mobile-390', 'mobile-360', 'mobile-320'];
    expect(b.viewports.map((v) => v.name)).toEqual(expectedViewports);
    expect(a.viewports.map((v) => v.name)).toEqual(expectedViewports);

    expect(b.captures.length).toBe(80);
    expect(a.captures.length).toBe(80);
  });

  it('guarantees zero byte-identical light/dark pairs across all viewports in before and after captures', () => {
    const b = JSON.parse(fs.readFileSync(manifestBeforePath, 'utf8')) as Manifest;
    const a = JSON.parse(fs.readFileSync(manifestAfterPath, 'utf8')) as Manifest;

    // Before captures verification
    expect(b.themeDifferenceVerification.pairsTested).toBe(40);
    expect(b.themeDifferenceVerification.pairsDistinct).toBe(40);
    expect(b.themeDifferenceVerification.pairsIdentical).toBe(0);
    expect(b.themeDifferenceVerification.passed).toBe(true);
    expect(b.themeDifferenceVerification.failures).toHaveLength(0);

    // After captures verification
    expect(a.themeDifferenceVerification.pairsTested).toBe(40);
    expect(a.themeDifferenceVerification.pairsDistinct).toBe(40);
    expect(a.themeDifferenceVerification.pairsIdentical).toBe(0);
    expect(a.themeDifferenceVerification.passed).toBe(true);
    expect(a.themeDifferenceVerification.failures).toHaveLength(0);

    // Explicit pair-by-pair check on disk files
    const checkPairs = (captures: ManifestCapture[], mode: string) => {
      const grouped = new Map<string, { light?: ManifestCapture; dark?: ManifestCapture }>();
      for (const c of captures) {
        const key = `${c.screen}_${c.viewport}`;
        const cur = grouped.get(key) || {};
        if (c.theme === 'light') cur.light = c;
        if (c.theme === 'dark') cur.dark = c;
        grouped.set(key, cur);
      }

      for (const [key, pair] of grouped) {
        expect(pair.light).toBeDefined();
        expect(pair.dark).toBeDefined();

        // Verify SHA-256 hashes differ
        expect(pair.light!.sha256).not.toBe(pair.dark!.sha256);

        // Verify disk files exist and have non-zero size
        const lightFile = path.join(phase111Dir, 'screenshots', mode, pair.light!.filename);
        const darkFile = path.join(phase111Dir, 'screenshots', mode, pair.dark!.filename);
        expect(fs.existsSync(lightFile)).toBe(true);
        expect(fs.existsSync(darkFile)).toBe(true);

        const lightStat = fs.statSync(lightFile);
        const darkStat = fs.statSync(darkFile);
        expect(lightStat.size).toBeGreaterThan(10000);
        expect(darkStat.size).toBeGreaterThan(10000);
      }
    };

    checkPairs(b.captures, 'before');
    checkPairs(a.captures, 'after');
  });

  it('guarantees zero horizontal overflow across all 80 captures and 5 viewports', () => {
    const a = JSON.parse(fs.readFileSync(manifestAfterPath, 'utf8')) as Manifest;

    for (const c of a.captures) {
      expect(c.horizontalOverflow).toBe(false);
    }
  });

  it('verifies human design review and visual verification report exist and document improvements', () => {
    expect(fs.existsSync(humanReviewPath)).toBe(true);
    expect(fs.existsSync(visualReportPath)).toBe(true);
    expect(fs.existsSync(summaryPath)).toBe(true);

    const report = fs.readFileSync(visualReportPath, 'utf8');
    expect(report).toContain('Phase 111');
    expect(report).toContain('Theme Capture Correction');
    expect(report).toContain('Today View');
    expect(report).toContain('Create Dialog');
    expect(report).toContain('Mobile Menu');
    expect(report).toContain('Settings Hub');
    expect(report).toContain('Ask Nori');

    const review = fs.readFileSync(humanReviewPath, 'utf8');
    expect(review).toContain('Human Design Feedback');
    expect(review).toContain('automated machine checks');

    const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8')) as {
      phase: string;
      status: string;
      standingGates: string[];
      zeroIdenticalLightDarkVerified: boolean;
    };
    expect(summary.phase).toBe('111');
    expect(summary.status).toBe('blocked');
    expect(summary.zeroIdenticalLightDarkVerified).toBe(true);
    expect(summary.standingGates).toContain('DEF-V2-008');
  });
});
