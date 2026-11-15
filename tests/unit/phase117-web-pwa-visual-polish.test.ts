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

describe('Phase 117: Web/PWA Visual Polish and Usability Refinement Tests', () => {
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

  describe('2. Modernized UI Primitives Inspection', () => {
    it('verifies EmptyState primitive supports variants, softer borders, and circular action badges', () => {
      const emptyStateFile = path.join(repoRoot, 'packages/ui-web/src/EmptyState.tsx');
      const content = fs.readFileSync(emptyStateFile, 'utf8');

      expect(content).toContain("variant?: 'card' | 'subtle' | 'inline';");
      expect(content).toContain('borderRadius: `${radii.card}px`');
      expect(content).toContain('themeMode === \'dark\' ? palette.border.subtle : \'rgba(23, 44, 44, 0.08)\'');
      expect(content).toContain('width: \'52px\'');
      expect(content).toContain('height: \'52px\'');
    });

    it('verifies Card primitive supports calm variant and softer border delineations', () => {
      const cardFile = path.join(repoRoot, 'packages/ui-web/src/Card.tsx');
      const content = fs.readFileSync(cardFile, 'utf8');

      expect(content).toContain("variant?: 'subtle' | 'outlined' | 'elevated' | 'flat' | 'calm';");
      expect(content).toContain("variant === 'calm'");
      expect(content).toContain('rgba(23, 44, 44, 0.08)');
    });

    it('verifies Dialog primitive includes softened backdrop, sheet radii, and focus-visible close button', () => {
      const dialogFile = path.join(repoRoot, 'packages/ui-web/src/Dialog.tsx');
      const content = fs.readFileSync(dialogFile, 'utf8');

      expect(content).toContain("backdropFilter: 'blur(3px)'");
      expect(content).toContain('borderRadius: `${radii.sheet}px`');
      expect(content).toContain('aria-modal="true"');
      expect(content).toContain('Close dialog');
    });

    it('verifies CreationMenu bottom sheet includes >= 48px touch targets and icon badge borders', () => {
      const menuFile = path.join(repoRoot, 'packages/ui-web/src/CreationMenu.tsx');
      const content = fs.readFileSync(menuFile, 'utf8');

      expect(content).toContain('Math.max(touchTargets.webMin, 48)');
      expect(content).toContain("themeMode === 'dark'");
      expect(content).toContain("border: '1px solid transparent'");
    });
  });

  describe('3. Core Surface Polish and Clutter Reduction', () => {
    it('verifies Today view applies calm card styling across all widgets', () => {
      const todayFile = path.join(repoRoot, 'apps/web/src/components/TodayView.tsx');
      const content = fs.readFileSync(todayFile, 'utf8');

      expect(content).toContain('<Card key={widget.id} variant="calm" themeMode={themeMode}>');
      expect(content).toContain('id="today-create-btn"');
      expect(content).toContain('className="desktop-only"');
      expect(content).toContain('id="customize-today-btn"');
      expect(content).toContain('id="write-journal-today-btn"');
    });

    it('verifies AppHeader streamlines ghost buttons and primary Create action elevation', () => {
      const headerFile = path.join(repoRoot, 'apps/web/src/components/AppHeader.tsx');
      const content = fs.readFileSync(headerFile, 'utf8');

      expect(content).toContain('ghostButtonStyle');
      expect(content).toContain('createButtonStyle');
      expect(content).toContain('id="global-create-btn"');
      expect(content).toContain('id="global-search-btn"');
      expect(content).toContain('id="global-theme-toggle"');
      expect(content).toContain('borderBottom: `1px solid ${themeMode === \'dark\' ? palette.border.subtle : \'rgba(23, 44, 44, 0.08)\'}`');
    });

    it('verifies AppSidebar applies soft borders, uppercase headers, and active pill state', () => {
      const sidebarFile = path.join(repoRoot, 'apps/web/src/components/AppSidebar.tsx');
      const content = fs.readFileSync(sidebarFile, 'utf8');

      expect(content).toContain('borderRight: `1px solid ${themeMode === \'dark\' ? palette.border.subtle : \'rgba(23, 44, 44, 0.08)\'}`');
      expect(content).toContain('letterSpacing: \'0.06em\'');
      expect(content).toContain('palette.action.subtle');
    });

    it('verifies AppBottomNav applies refined border and >= 48px touch targets without label clipping', () => {
      const bottomNavFile = path.join(repoRoot, 'apps/web/src/components/AppBottomNav.tsx');
      const content = fs.readFileSync(bottomNavFile, 'utf8');

      expect(content).toContain('borderTop: `1px solid ${themeMode === \'dark\' ? palette.border.subtle : \'rgba(23, 44, 44, 0.08)\'}`');
      expect(content).toContain('minHeight: `${touchTargets.webMin}px`');
      expect(content).toContain('daynori-bottom-nav-label');
    });

    it('verifies Library view streamlines folder cards and item list rows with subtle borders', () => {
      const libraryFile = path.join(repoRoot, 'apps/web/src/app/library/page.tsx');
      const content = fs.readFileSync(libraryFile, 'utf8');

      expect(content).toContain('themeMode === \'dark\' ? palette.border.subtle : \'rgba(23, 44, 44, 0.08)\'');
      expect(content).toContain('ItemTypeBadge');
      expect(content).toContain('Search notes and folders...');
    });

    it('verifies Journal view applies calm styling to entry cards and segmented navigation controls', () => {
      const journalFile = path.join(repoRoot, 'apps/web/src/app/journal/page.tsx');
      const content = fs.readFileSync(journalFile, 'utf8');

      expect(content).toContain('<Card key={entry.id} variant="calm" themeMode={themeMode}>');
      expect(content).toContain('borderBottom: `1px solid ${themeMode === \'dark\' ? palette.border.subtle : \'rgba(23, 44, 44, 0.08)\'}`');
      expect(content).toContain('data-testid="tab-day-view"');
      expect(content).toContain('data-testid="tab-timeline-view"');
      expect(content).toContain('data-testid="tab-trash-view"');
    });
  });
});
