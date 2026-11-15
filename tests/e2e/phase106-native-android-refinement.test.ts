import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('Phase 106: Native Android Interface Refinement and Component Overhaul E2E Evidence', () => {
  const phase106Dir = path.join(repoRoot, 'artifacts/phase106');
  const summaryPath = path.join(phase106Dir, 'evidence-summary.json');
  const manifestPath = path.join(phase106Dir, 'capture-manifest.json');
  const screenshotsDir = path.join(phase106Dir, 'screenshots');
  const uiDumpsDir = path.join(phase106Dir, 'ui-dumps');

  interface EvidenceSummary {
    phase: string;
    title: string;
    createdAt: string;
    device: {
      serial: string;
      model: string;
      androidRelease: string;
      abi: string;
      density: string;
      size: string;
      classification: string;
    };
    steps: Array<{
      step: string;
      ok: boolean;
      detail: string;
      at: string;
    }>;
    passCount: number;
    failCount: number;
    captures: Array<{
      filename: string;
      bytes: number;
    }>;
    physicalDeviceStatus: string;
    talkbackSpokenListenThrough: string;
    phase71Status: string;
    phase106Status: string;
  }

  it('verifies emulator evidence summary exists and records 12 passed steps', () => {
    expect(fs.existsSync(summaryPath)).toBe(true);
    expect(fs.existsSync(manifestPath)).toBe(true);

    const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8')) as EvidenceSummary;
    expect(summary.phase).toBe('106');
    expect(summary.device.classification).toBe('emulator');
    expect(summary.device.serial).toBe('emulator-5554');
    expect(summary.passCount).toBe(12);
    expect(summary.failCount).toBe(0);

    const stepNames = summary.steps.map((s) => s.step);
    expect(stepNames).toEqual([
      '01-today-overview',
      '02-plan-tab',
      '03-library-tab',
      '04-create-sheet',
      '05-back-navigation-create',
      '06-settings-hub',
      '07-back-navigation-settings',
      '08-assistant-gated-truthful',
      '09-large-text-scaling',
      '10-landscape-adaptation',
      '11-account-workspace-isolation',
      '12-device-settings-restored',
    ]);
  });

  it('verifies emulator captures exist on disk with valid dimensions', () => {
    const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8')) as EvidenceSummary;
    expect(summary.captures.length).toBeGreaterThanOrEqual(6);

    for (const cap of summary.captures) {
      const filePath = path.join(screenshotsDir, cap.filename);
      expect(fs.existsSync(filePath)).toBe(true);
      const stat = fs.statSync(filePath);
      expect(stat.size).toBeGreaterThan(10000);
      expect(cap.bytes).toBeGreaterThan(10000);
    }
  });

  it('verifies truthful gate reporting: Phase 71 remains blocked, Phase 106 release gates intact', () => {
    const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8')) as EvidenceSummary;

    // Physical hardware and spoken TalkBack must be declared unavailable
    expect(summary.physicalDeviceStatus).toMatch(/UNAVAILABLE/);
    expect(summary.talkbackSpokenListenThrough).toMatch(/UNAVAILABLE/);

    // Phase 71 must remain BLOCKED
    expect(summary.phase71Status).toMatch(/BLOCKED/);

    // Phase 106 deployment must remain blocked pending release gates
    expect(summary.phase106Status).toMatch(/BLOCKED/);
    expect(summary.phase106Status).toMatch(/OWNER-SIGNING-KEYS/);
    expect(summary.phase106Status).toMatch(/OWNER-RELEASE-AUTH/);
    expect(summary.phase106Status).toMatch(/DEF-V2-011/);
  });

  it('verifies UI dumps exist and confirm native mobile hierarchy', () => {
    expect(fs.existsSync(uiDumpsDir)).toBe(true);
    const dumps = fs.readdirSync(uiDumpsDir).filter((f) => f.endsWith('.xml'));
    expect(dumps.length).toBeGreaterThanOrEqual(6);

    // Inspect Today overview UI dump
    const todayXml = fs.readFileSync(path.join(uiDumpsDir, '01-today-overview.xml'), 'utf8');
    expect(todayXml).toContain('com.daynori.app');
    expect(todayXml).toContain('Today');
    expect(todayXml).toContain('mobile-nav-bar');
    expect(todayXml).toContain('header-search-btn');
  });
});
