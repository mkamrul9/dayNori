import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('Phase 105: Web/PWA Visual Refinement and Modern Interface E2E Evidence', () => {
  const phase105Dir = path.join(repoRoot, 'artifacts/phase105');
  const manifestBeforePath = path.join(phase105Dir, 'capture-manifest-before.json');
  const manifestAfterPath = path.join(phase105Dir, 'capture-manifest-after.json');
  const reportPath = path.join(phase105Dir, 'visual-comparison-report.md');
  const summaryPath = path.join(phase105Dir, 'evidence-summary.json');

  interface Manifest {
    phase: string;
    mode: string;
    timestamp: string;
    viewports: Array<{ name: string; width: number; height: number; isMobile: boolean }>;
    themes: string[];
    screens: string[];
    captures: Array<{
      screen: string;
      viewport: string;
      width: number;
      height: number;
      theme: string;
      filename: string;
      sha256: string;
      bytes: number;
      horizontalOverflow: boolean;
    }>;
  }

  it('verifies baseline and post-refinement capture manifests and evidence files', () => {
    expect(fs.existsSync(manifestBeforePath)).toBe(true);
    expect(fs.existsSync(manifestAfterPath)).toBe(true);
    expect(fs.existsSync(reportPath)).toBe(true);
    expect(fs.existsSync(summaryPath)).toBe(true);

    const manifestBefore = JSON.parse(fs.readFileSync(manifestBeforePath, 'utf8')) as Manifest;
    const manifestAfter = JSON.parse(fs.readFileSync(manifestAfterPath, 'utf8')) as Manifest;

    expect(manifestBefore.phase).toBe('105');
    expect(manifestAfter.phase).toBe('105');
    expect(manifestBefore.mode).toBe('before');
    expect(manifestAfter.mode).toBe('after');

    const expectedScreens = ['today', 'plan', 'library', 'journal', 'settings', 'create', 'menus', 'assistant'];
    expect(manifestBefore.screens).toEqual(expectedScreens);
    expect(manifestAfter.screens).toEqual(expectedScreens);

    const expectedViewports = ['desktop-1280', 'mobile-412', 'mobile-390', 'mobile-360', 'mobile-320'];
    expect(manifestBefore.viewports.map((v) => v.name)).toEqual(expectedViewports);
    expect(manifestAfter.viewports.map((v) => v.name)).toEqual(expectedViewports);

    expect(manifestBefore.themes).toEqual(['light', 'dark']);
    expect(manifestAfter.themes).toEqual(['light', 'dark']);

    // 8 screens * 5 viewports * 2 themes = 80 captures
    expect(manifestBefore.captures.length).toBe(80);
    expect(manifestAfter.captures.length).toBe(80);

    // Verify all files exist on disk and have non-zero size
    for (const capture of manifestBefore.captures) {
      const filePath = path.join(phase105Dir, 'screenshots/before', capture.filename);
      expect(fs.existsSync(filePath)).toBe(true);
      const stat = fs.statSync(filePath);
      expect(stat.size).toBeGreaterThan(10000);
      expect(capture.horizontalOverflow).toBe(false);
    }

    for (const capture of manifestAfter.captures) {
      const filePath = path.join(phase105Dir, 'screenshots/after', capture.filename);
      expect(fs.existsSync(filePath)).toBe(true);
      const stat = fs.statSync(filePath);
      expect(stat.size).toBeGreaterThan(10000);
      expect(capture.horizontalOverflow).toBe(false);
    }
  });

  it('verifies visual comparison report covers all screens and viewports', () => {
    const report = fs.readFileSync(reportPath, 'utf8');
    expect(report).toContain('Executive Summary');
    expect(report).toContain('2.1 Today View');
    expect(report).toContain('2.2 Plan View');
    expect(report).toContain('2.3 Library View');
    expect(report).toContain('2.4 Journal View');
    expect(report).toContain('2.5 Create Menu & Dialog');
    expect(report).toContain('2.6 Navigation Chrome: Header, Sidebar, Bottom Nav');
    expect(report).toContain('2.7 Settings View');
    expect(report).toContain('2.8 Ask Nori Assistant Drawer');
    expect(report).toContain('320px');
    expect(report).toContain('412px');
    expect(report).toContain('1280px');
    expect(report).toContain('WCAG 2.2 AA');
  });

  it('verifies evidence summary records blocked release status and standing gates', () => {
    const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8')) as {
      phase: string;
      status: string;
      visualEvidence: { totalScreenshotsBefore: number; totalScreenshotsAfter: number };
      blockingGates: Array<{ gate: string }>;
    };

    expect(summary.phase).toBe('105');
    expect(summary.status).toBe('blocked');
    expect(summary.visualEvidence.totalScreenshotsBefore).toBe(80);
    expect(summary.visualEvidence.totalScreenshotsAfter).toBe(80);

    const gateNames = summary.blockingGates.map((g) => g.gate);
    expect(gateNames).toContain('OWNER-RELEASE-AUTH');
    expect(gateNames).toContain('DEF-V2-001');
    expect(gateNames).toContain('DEF-V2-008');
    expect(gateNames).toContain('DEF-V2-013');
  });

  it('verifies AppHeader calm navigation, ghost buttons, and prominent create action', () => {
    const headerPath = path.join(repoRoot, 'apps/web/src/components/AppHeader.tsx');
    const content = fs.readFileSync(headerPath, 'utf8');

    // Ghost button styling
    expect(content).toContain("border: '1px solid transparent'");
    expect(content).toContain("backgroundColor: 'transparent'");

    // Primary create button prominence
    expect(content).toContain('backgroundColor: palette.action.primary');
    expect(content).toContain('color: palette.action.label');
    expect(content).toContain('fontWeight: 600');

    // Accessibility & touch targets
    expect(content).toContain('minHeight: `${touchTargets.webMin}px`');
    expect(content).toContain('minWidth: `${touchTargets.webMin}px`');
    expect(content).toContain('aria-label="Create item (Shortcut C)"');
    expect(content).toContain('aria-label="Search items (Shortcut /)"');
    expect(content).toContain("aria-label={`Switch to ${themeMode === 'light' ? 'dark' : 'light'} theme`}");
  });

  it('verifies AppBottomNav mobile navigation height and active pill indicator', () => {
    const bottomNavPath = path.join(repoRoot, 'apps/web/src/components/AppBottomNav.tsx');
    const content = fs.readFileSync(bottomNavPath, 'utf8');

    expect(content).toContain("minHeight: 'var(--daynori-bottom-nav-height)'");
    expect(content).toContain('borderRadius: `${radii.pill}px`');
    expect(content).toContain("backgroundColor: isActive ? palette.action.subtle : 'transparent'");
    expect(content).toContain('minHeight: `${touchTargets.webMin}px`');
    expect(content).toContain('daynori-bottom-nav-label');
  });

  it('verifies AppSidebar active pill styling and uppercase category hierarchy', () => {
    const sidebarPath = path.join(repoRoot, 'apps/web/src/components/AppSidebar.tsx');
    const content = fs.readFileSync(sidebarPath, 'utf8');

    expect(content).toContain("letterSpacing: '0.06em'");
    expect(content).toContain("textTransform: 'uppercase'");
    expect(content).toContain('Primary');
    expect(content).toContain('Pins');
    expect(content).toContain('Utilities');
    expect(content).toContain("backgroundColor: isActive ? palette.action.subtle : 'transparent'");
    expect(content).toContain("color: isActive ? palette.action.primary : palette.text.primary");
  });

  it('verifies TodayView first viewport desktop layout and softened stat cards', () => {
    const todayPath = path.join(repoRoot, 'apps/web/src/components/TodayView.tsx');
    const content = fs.readFileSync(todayPath, 'utf8');

    expect(content).toContain("flexDirection: 'row'");
    expect(content).toContain("justifyContent: 'space-between'");
    expect(content).toContain("alignItems: 'flex-start'");
    expect(content).toContain('radii.pill');
  });

  it('verifies Settings page unified card structure and Library clean search', () => {
    const settingsPath = path.join(repoRoot, 'apps/web/src/app/settings/page.tsx');
    const libraryPath = path.join(repoRoot, 'apps/web/src/app/library/page.tsx');

    const settingsContent = fs.readFileSync(settingsPath, 'utf8');
    const libraryContent = fs.readFileSync(libraryPath, 'utf8');

    // Settings consolidated card
    expect(settingsContent).toContain('SETTINGS_GROUPS.map((group, index)');
    expect(settingsContent).toContain("borderBottom: isLast ? 'none' : `1px solid ${palette.border.subtle}`");

    // Library clean search and bullet separator
    expect(libraryContent).toContain('placeholder="Search notes and folders..."');
    expect(libraryContent).toContain('·');
  });
});
