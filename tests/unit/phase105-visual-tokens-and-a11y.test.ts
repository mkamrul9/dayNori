import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  colors,
  focusRing,
  getContrastRatio,
  iconPaths,
  meetsWcagAA,
  radii,
  spacing,
  touchTargets,
  typography,
} from '@daynori/design-tokens';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('Phase 105: Visual Tokens, Accessibility, and Contrast Matrix', () => {
  describe('1. Color Palette and WCAG 2.2 AA Contrast Compliance', () => {
    it('verifies light theme paper surfaces and text contrast ratios', () => {
      const light = colors.light;

      // Base background & surfaces
      expect(light.background).toBe('#F7F5EF'); // Warm paper
      expect(light.surface).toBe('#FFFFFF'); // Clean surface
      expect(light.surfaceRaised).toBe('#FBF9F4'); // Raised card surface

      // Primary text contrast >= 4.5:1
      const textOnPaper = getContrastRatio(light.text.primary, light.background);
      const textOnSurface = getContrastRatio(light.text.primary, light.surface);
      const textOnRaised = getContrastRatio(light.text.primary, light.surfaceRaised);
      expect(textOnPaper).toBeGreaterThanOrEqual(4.5);
      expect(textOnSurface).toBeGreaterThanOrEqual(4.5);
      expect(textOnRaised).toBeGreaterThanOrEqual(4.5);
      expect(meetsWcagAA(light.text.primary, light.background)).toBe(true);

      // Secondary text contrast >= 4.5:1
      const secOnPaper = getContrastRatio(light.text.secondary, light.background);
      const secOnSurface = getContrastRatio(light.text.secondary, light.surface);
      expect(secOnPaper).toBeGreaterThanOrEqual(4.5);
      expect(secOnSurface).toBeGreaterThanOrEqual(4.5);

      // Muted text on paper >= 4.5:1 (Phase 67/68 notebook muted token)
      const mutedOnPaper = getContrastRatio(light.text.muted, light.background);
      expect(mutedOnPaper).toBeGreaterThanOrEqual(4.5);

      // Action button contrast
      const actionLabelRatio = getContrastRatio(light.action.label, light.action.primary);
      expect(actionLabelRatio).toBeGreaterThanOrEqual(3.0);

      // Subtle action text on subtle background >= 4.5:1
      const subtleRatio = getContrastRatio(light.action.subtleText, light.action.subtle);
      expect(subtleRatio).toBeGreaterThanOrEqual(4.5);

      // Strong border contrast >= 3.0:1 (essential UI component border)
      const borderRatio = getContrastRatio(light.border.strong, light.background);
      expect(borderRatio).toBeGreaterThanOrEqual(3.0);
    });

    it('verifies dark theme ink surfaces and text contrast ratios', () => {
      const dark = colors.dark;

      // Base dark surfaces
      expect(dark.background).toBe('#0D1919'); // Deep ink
      expect(dark.surface).toBe('#132323'); // Dark surface
      expect(dark.surfaceRaised).toBe('#192C2C'); // Raised dark card

      // Primary text contrast >= 4.5:1
      const textOnInk = getContrastRatio(dark.text.primary, dark.background);
      const textOnSurface = getContrastRatio(dark.text.primary, dark.surface);
      const textOnRaised = getContrastRatio(dark.text.primary, dark.surfaceRaised);
      expect(textOnInk).toBeGreaterThanOrEqual(4.5);
      expect(textOnSurface).toBeGreaterThanOrEqual(4.5);
      expect(textOnRaised).toBeGreaterThanOrEqual(4.5);
      expect(meetsWcagAA(dark.text.primary, dark.background)).toBe(true);

      // Secondary text contrast >= 4.5:1
      const secOnInk = getContrastRatio(dark.text.secondary, dark.background);
      const secOnSurface = getContrastRatio(dark.text.secondary, dark.surface);
      expect(secOnInk).toBeGreaterThanOrEqual(4.5);
      expect(secOnSurface).toBeGreaterThanOrEqual(4.5);

      // Action button contrast
      const actionLabelRatio = getContrastRatio(dark.action.label, dark.action.primary);
      expect(actionLabelRatio).toBeGreaterThanOrEqual(3.0);

      // Subtle action text on subtle background >= 4.5:1
      const subtleRatio = getContrastRatio(dark.action.subtleText, dark.action.subtle);
      expect(subtleRatio).toBeGreaterThanOrEqual(4.5);

      // Strong border contrast >= 3.0:1
      const borderRatio = getContrastRatio(dark.border.strong, dark.background);
      expect(borderRatio).toBeGreaterThanOrEqual(3.0);
    });
  });

  describe('2. Touch Target and Focus Ring Invariants', () => {
    it('enforces web and mobile touch target minimum dimensions', () => {
      expect(touchTargets.webMin).toBeGreaterThanOrEqual(44);
      expect(touchTargets.mobileMin).toBeGreaterThanOrEqual(48);
    });

    it('enforces high-contrast visible focus indicators', () => {
      expect(focusRing.width).toBe(2);
      expect(focusRing.offset).toBe(2);
      expect(focusRing.light).toBe(colors.light.border.focus);
      expect(focusRing.dark).toBe(colors.dark.border.focus);

      const lightFocusContrast = getContrastRatio(focusRing.light, colors.light.background);
      const darkFocusContrast = getContrastRatio(focusRing.dark, colors.dark.background);
      expect(lightFocusContrast).toBeGreaterThanOrEqual(3.0);
      expect(darkFocusContrast).toBeGreaterThanOrEqual(3.0);
    });

    it('enforces warm notebook radii and spacing scale', () => {
      expect(radii.card).toBe(14);
      expect(radii.sheet).toBe(18);
      expect(radii.pill).toBe(9999);
      expect(spacing.base).toBe(16);
      expect(spacing.lg).toBe(24);
      expect(typography.webScale.body).toBe(16);
      expect(typography.webScale.pageTitle).toBe(24);
    });
  });

  describe('3. Strict No-Emoji Chrome Invariant', () => {
    it('verifies all iconPaths are valid SVG vector paths without emoji characters', () => {
      const emojiRegex = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;

      const iconKeys = Object.keys(iconPaths);
      expect(iconKeys.length).toBeGreaterThan(20);

      for (const [name, pathList] of Object.entries(iconPaths)) {
        expect(name).not.toMatch(emojiRegex);
        expect(Array.isArray(pathList)).toBe(true);
        for (const segment of pathList) {
          expect(segment).toMatch(/^[mM][0-9a-zA-Z\s,.-]+[zZ]?$/);
        }
      }
    });

    it('verifies apps/web/src components do not use app-authored unicode emojis in navigation or chrome', () => {
      const filesToCheck = [
        'apps/web/src/components/AppHeader.tsx',
        'apps/web/src/components/AppSidebar.tsx',
        'apps/web/src/components/AppBottomNav.tsx',
        'apps/web/src/components/AppModals.tsx',
        'packages/ui-web/src/CreationMenu.tsx',
        'packages/ui-web/src/EmptyState.tsx',
        'packages/ui-web/src/ListRow.tsx',
      ];

      const emojiRegex = /[\u{1F300}-\u{1FAFF}\u{1F000}-\u{1F02F}\u{1F0A0}-\u{1F0FF}]/u;

      for (const relPath of filesToCheck) {
        const fullPath = path.join(repoRoot, relPath);
        if (fs.existsSync(fullPath)) {
          const content = fs.readFileSync(fullPath, 'utf8');
          const hasEmoji = emojiRegex.test(content);
          expect(hasEmoji).toBe(false);
        }
      }
    });
  });

  describe('4. Component Variants & Modern Visual Structure', () => {
    it('verifies Card component supports subtle, outlined, elevated, and flat variants', () => {
      const cardPath = path.join(repoRoot, 'packages/ui-web/src/Card.tsx');
      const content = fs.readFileSync(cardPath, 'utf8');

      expect(content).toContain("variant?: 'subtle' | 'outlined' | 'elevated' | 'flat'");
      expect(content).toContain("variant === 'flat'");
      expect(content).toContain("variant === 'elevated'");
      expect(content).toContain("variant === 'subtle'");
      expect(content).toContain('radii.card');
    });

    it('verifies ListRow component supports card, flat, and divided variants with touch target compliance', () => {
      const listRowPath = path.join(repoRoot, 'packages/ui-web/src/ListRow.tsx');
      const content = fs.readFileSync(listRowPath, 'utf8');

      expect(content).toContain("variant?: 'card' | 'flat' | 'divided'");
      expect(content).toContain('minHeight: `${touchTargets.webMin}px`');
      expect(content).toContain("e.key === 'Enter' || e.key === ' '");
      expect(content).toContain('focusRing.width');
    });

    it('verifies CreationMenu and AppModals use vector icons and unified list design', () => {
      const menuPath = path.join(repoRoot, 'packages/ui-web/src/CreationMenu.tsx');
      const modalsPath = path.join(repoRoot, 'apps/web/src/components/AppModals.tsx');

      const menuContent = fs.readFileSync(menuPath, 'utf8');
      const modalsContent = fs.readFileSync(modalsPath, 'utf8');

      expect(menuContent).toContain('<Icon name={item.icon} size={18} />');
      expect(menuContent).toContain('CreationMenuItem');
      expect(modalsContent).toContain('variant="flat"');
      expect(modalsContent).toContain('check-square');
      expect(modalsContent).toContain('repeat');
      expect(modalsContent).toContain('journal');
    });
  });
});
