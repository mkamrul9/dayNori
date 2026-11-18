import { describe, expect, it } from 'vitest';
import {
  colors,
  focusRing,
  getContrastRatio,
  meetsWcagAA,
  motion,
  radii,
  spacing,
  tokens,
  touchTargets,
  typography,
} from './index.js';

describe('Design Tokens & Contrast Verification', () => {
  it('defines light theme color values with valid hex strings', () => {
    expect(colors.light.background).toBe('#F7F7FF');
    expect(colors.light.action.primary).toBe('#623DE8');
    expect(colors.light.text.primary).toBe('#1C2142');
    expect(colors.light.accent.warm).toBe('#B93865');
  });

  it('defines dark theme color values with valid hex strings', () => {
    expect(colors.dark.background).toBe('#0E1024');
    expect(colors.dark.action.primary).toBe('#B8A3FF');
    expect(colors.dark.text.primary).toBe('#F7F5FF');
    expect(colors.dark.accent.warm).toBe('#FF9DBB');
  });

  it('provides shared layout spacing, radii, and touch target scales', () => {
    expect(spacing.base).toBe(16);
    expect(radii.sm).toBe(10);
    expect(radii.card).toBe(14);
    expect(radii.sheet).toBe(18);
    expect(touchTargets.webMin).toBe(44);
    expect(touchTargets.mobileMin).toBe(48);
  });

  it('keeps muted text ≥4.5:1 on the current light background', () => {
    expect(colors.light.text.muted).toBe('#626B87');
    expect(
      getContrastRatio(colors.light.text.muted, colors.light.background)
    ).toBeGreaterThanOrEqual(4.5);
  });

  it('exposes reduced-motion duration equivalents', () => {
    expect(motion.reduced.duration.standard).toBe(0);
  });

  it('defines typography scales and line-heights including Bangla support', () => {
    expect(typography.webScale.body).toBe(16);
    expect(typography.lineHeight.relaxed).toBe(1.5);
    expect(typography.lineHeight.bangla).toBe(1.6);
  });

  it('defines focus and motion tokens', () => {
    expect(focusRing.width).toBe(2);
    expect(motion.duration.standard).toBe(200);
    expect(motion.duration.none).toBe(0);
    expect(tokens.colors).toEqual(colors);
  });

  describe('WCAG 2.2 Level AA Contrast Calculations', () => {
    it('verifies light theme normal text contrast >= 4.5:1', () => {
      // Primary text on the light background
      const inkOnPaper = getContrastRatio(colors.light.text.primary, colors.light.background);
      expect(inkOnPaper).toBeGreaterThanOrEqual(4.5);
      expect(meetsWcagAA(colors.light.text.primary, colors.light.background)).toBe(true);

      // Secondary text on the light background
      const slateOnPaper = getContrastRatio(colors.light.text.secondary, colors.light.background);
      expect(slateOnPaper).toBeGreaterThanOrEqual(4.5);

      // White label on violet action
      const whiteOnViolet = getContrastRatio(
        colors.light.action.label,
        colors.light.action.primary
      );
      expect(whiteOnViolet).toBeGreaterThanOrEqual(4.5);

      // White label on deep red danger action (F03 fix)
      const whiteOnDanger = getContrastRatio(
        colors.light.action.dangerLabel,
        colors.light.action.danger
      );
      expect(whiteOnDanger).toBeGreaterThanOrEqual(4.5);
      expect(
        getContrastRatio(colors.light.action.dangerLabel, colors.light.action.dangerHover)
      ).toBeGreaterThanOrEqual(4.5);

      // Selected row metadata (secondary slate on subtle container, F04 fix)
      const lightSelectedMeta = getContrastRatio(
        colors.light.text.secondary,
        colors.light.action.subtle
      );
      expect(lightSelectedMeta).toBeGreaterThanOrEqual(4.5);

      // White label on coral accent
      const whiteOnCoral = getContrastRatio(colors.light.accent.label, colors.light.accent.warm);
      expect(whiteOnCoral).toBeGreaterThanOrEqual(4.5);
    });

    it('verifies dark theme normal text contrast >= 4.5:1', () => {
      // Pale paper text on dark background
      const textOnDarkBg = getContrastRatio(colors.dark.text.primary, colors.dark.background);
      expect(textOnDarkBg).toBeGreaterThanOrEqual(4.5);
      expect(meetsWcagAA(colors.dark.text.primary, colors.dark.background)).toBe(true);

      // Pale paper text on dark surface
      const textOnDarkSurface = getContrastRatio(colors.dark.text.primary, colors.dark.surface);
      expect(textOnDarkSurface).toBeGreaterThanOrEqual(4.5);

      // Pale slate secondary text on dark surface
      const secondaryOnDark = getContrastRatio(colors.dark.text.secondary, colors.dark.surface);
      expect(secondaryOnDark).toBeGreaterThanOrEqual(4.5);

      // Dark label on lavender action
      const darkOnLavender = getContrastRatio(colors.dark.action.label, colors.dark.action.primary);
      expect(darkOnLavender).toBeGreaterThanOrEqual(4.5);

      // Dark ink label on soft red danger action (F03 fix)
      const darkOnDanger = getContrastRatio(
        colors.dark.action.dangerLabel,
        colors.dark.action.danger
      );
      expect(darkOnDanger).toBeGreaterThanOrEqual(4.5);
      expect(
        getContrastRatio(colors.dark.action.dangerLabel, colors.dark.action.dangerHover)
      ).toBeGreaterThanOrEqual(4.5);

      // Dark selected row metadata (secondary pale slate on subtle container, F04 fix)
      const darkSelectedMeta = getContrastRatio(
        colors.dark.text.secondary,
        colors.dark.action.subtle
      );
      expect(darkSelectedMeta).toBeGreaterThanOrEqual(4.5);

      // Dark label on soft coral accent
      const darkOnSoftCoral = getContrastRatio(colors.dark.accent.label, colors.dark.accent.warm);
      expect(darkOnSoftCoral).toBeGreaterThanOrEqual(4.5);
    });

    it('verifies essential UI component boundaries meet >= 3.0:1', () => {
      // Essential input border on paper in light theme
      const lightBorderOnPaper = getContrastRatio(
        colors.light.border.strong,
        colors.light.background
      );
      expect(lightBorderOnPaper).toBeGreaterThanOrEqual(3.0);
      expect(
        meetsWcagAA(colors.light.border.strong, colors.light.background, { isUiComponent: true })
      ).toBe(true);

      // Essential input border on dark surface
      const darkBorderOnSurface = getContrastRatio(colors.dark.border.strong, colors.dark.surface);
      expect(darkBorderOnSurface).toBeGreaterThanOrEqual(3.0);
      expect(
        meetsWcagAA(colors.dark.border.strong, colors.dark.surface, { isUiComponent: true })
      ).toBe(true);
    });
  });
});
