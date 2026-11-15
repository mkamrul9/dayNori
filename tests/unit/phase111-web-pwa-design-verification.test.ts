import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  colors,
  focusRing,
  getContrastRatio,
  meetsWcagAA,
  radii,
  spacing,
  touchTargets,
} from '@daynori/design-tokens';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('Phase 111: Web/PWA Design Verification and Hierarchy Inspection', () => {
  describe('1. Color Palette Contrast and WCAG 2.2 AA Compliance', () => {
    it('verifies light and dark theme contrast ratios on primary, secondary, and elevated surfaces', () => {
      const light = colors.light;
      const dark = colors.dark;

      // Light theme contrast
      expect(getContrastRatio(light.text.primary, light.background)).toBeGreaterThanOrEqual(4.5);
      expect(getContrastRatio(light.text.secondary, light.background)).toBeGreaterThanOrEqual(4.5);
      expect(getContrastRatio(light.text.primary, light.surface)).toBeGreaterThanOrEqual(4.5);
      expect(getContrastRatio(light.text.primary, light.surfaceRaised)).toBeGreaterThanOrEqual(4.5);
      expect(meetsWcagAA(light.text.primary, light.background)).toBe(true);

      // Dark theme contrast
      expect(getContrastRatio(dark.text.primary, dark.background)).toBeGreaterThanOrEqual(4.5);
      expect(getContrastRatio(dark.text.secondary, dark.background)).toBeGreaterThanOrEqual(4.5);
      expect(getContrastRatio(dark.text.primary, dark.surface)).toBeGreaterThanOrEqual(4.5);
      expect(getContrastRatio(dark.text.primary, dark.surfaceRaised)).toBeGreaterThanOrEqual(4.5);
      expect(meetsWcagAA(dark.text.primary, dark.background)).toBe(true);

      // Border and UI component visibility (>= 3:1 for strong borders)
      expect(getContrastRatio(light.border.strong, light.background)).toBeGreaterThanOrEqual(3.0);
      expect(getContrastRatio(dark.border.strong, dark.background)).toBeGreaterThanOrEqual(3.0);
    });

    it('verifies focus ring parameters meet accessibility standards', () => {
      expect(focusRing.width).toBeGreaterThanOrEqual(2);
      expect(focusRing.offset).toBeGreaterThanOrEqual(2);
      expect(colors.light.border.focus).toBeDefined();
      expect(colors.dark.border.focus).toBeDefined();
    });
  });

  describe('2. ListRow Primitive Support for IDs and Touch Targets', () => {
    it('verifies ListRow implementation includes id prop, touch targets, and interactive accessibility attributes', () => {
      const listRowFile = path.join(repoRoot, 'packages/ui-web/src/ListRow.tsx');
      const content = fs.readFileSync(listRowFile, 'utf8');

      expect(content).toContain('id?: string;');
      expect(content).toContain('id={id}');
      expect(content).toContain("role={isInteractive ? 'button' : undefined}");
      expect(content).toContain('tabIndex={isInteractive ? 0 : undefined}');
      expect(content).toContain('minHeight: `${touchTargets.webMin}px`');
    });
  });

  describe('3. Code Inspection of the 5 Refined UI Areas', () => {
    it('verifies Today view streamlines header actions and hides duplicate create button on mobile', () => {
      const todayFile = path.join(repoRoot, 'apps/web/src/components/TodayView.tsx');
      const content = fs.readFileSync(todayFile, 'utf8');

      // #today-create-btn is secondary and desktop-only to avoid mobile action duplication with AppHeader
      expect(content).toContain('id="today-create-btn"');
      expect(content).toContain('className="desktop-only"');

      // #customize-today-btn is primary on Today view
      expect(content).toContain('id="customize-today-btn"');
      expect(content).toMatch(/id="customize-today-btn"[\s\S]*?variant="primary"/);
    });

    it('verifies Mobile Menu Drawer in AppModals includes mobile theme toggle with touch target', () => {
      const modalsFile = path.join(repoRoot, 'apps/web/src/components/AppModals.tsx');
      const content = fs.readFileSync(modalsFile, 'utf8');

      expect(content).toContain('id="mobile-menu-theme-toggle"');
      expect(content).toContain('toggleTheme');
      expect(content).toContain('Switch to Dark Theme');
      expect(content).toContain('Switch to Light Theme');
    });

    it('verifies Create Dialog eliminates bulky feedback box and adds crisp dark borders on chips', () => {
      const modalsFile = path.join(repoRoot, 'apps/web/src/components/AppModals.tsx');
      const content = fs.readFileSync(modalsFile, 'utf8');

      // The bulky 80px Feedback box ("Choose an item below to open its editor...") was removed
      expect(content).not.toContain('Choose an item below to open its editor');

      // Icon badges have dark mode boundary borders
      expect(content).toMatch(/themeMode === 'dark'[\s\S]*?1px solid \$\{palette\.border\.subtle\}/);

      // All 5 core creation tour targets exist
      expect(content).toContain('id="create.type.task"');
      expect(content).toContain('id="create.type.routine"');
      expect(content).toContain('id="create.type.note"');
      expect(content).toContain('id="create.type.journal"');
      expect(content).toContain('id="create.type.file"');
    });

    it('verifies Settings Hub adds focus-visible ring styles and dark icon badge borders', () => {
      const settingsFile = path.join(repoRoot, 'apps/web/src/app/settings/page.tsx');
      const content = fs.readFileSync(settingsFile, 'utf8');

      expect(content).toContain('palette.border.focus');
      expect(content).toContain('outlineOffset');
      expect(content).toContain("themeMode === 'dark'");
      expect(content).toContain('palette.border.subtle');
    });

    it('verifies Ask Nori assistant panel truthfully collapses auxiliary disabled boxes when gated', () => {
      const panelFile = path.join(repoRoot, 'apps/web/src/components/AssistantPanel.tsx');
      const content = fs.readFileSync(panelFile, 'utf8');

      // Preserves truthfulness requirements
      expect(content).toContain('data-testid="assistant-gated-banner"');
      expect(content).toContain('DEF-V2-008');
      expect(content).toContain("cursor: isGated ? 'not-allowed' : 'text'");

      // Auxiliary controls (knowledge sources, starter suggestions, voice recording) are collapsed when isGated is true
      expect(content).toContain('!isGated && (');
    });

    it('verifies ShellContext persists themePreference to localStorage and exposes __daynoriShell', () => {
      const shellFile = path.join(repoRoot, 'apps/web/src/components/ShellContext.tsx');
      const content = fs.readFileSync(shellFile, 'utf8');

      expect(content).toContain("window.localStorage.getItem('daynori_theme')");
      expect(content).toContain("window.localStorage.setItem('daynori_theme', themePreference)");
      expect(content).toContain('__daynoriShell');
    });
  });
});
