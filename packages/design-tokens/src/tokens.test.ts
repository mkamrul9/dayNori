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
    expect(colors.light.background).toBe('#F7F5EF');
    expect(colors.light.action.primary).toBe('#146B63');
    expect(colors.light.text.primary).toBe('#172C2C');
    expect(colors.light.accent.warm).toBe('#D9A441');
  });

  it('defines dark theme color values with valid hex strings', () => {
    expect(colors.dark.background).toBe('#0D1919');
    expect(colors.dark.action.primary).toBe('#73C2B6');
    expect(colors.dark.text.primary).toBe('#E9F0ED');
    expect(colors.dark.accent.warm).toBe('#E6B85A');
  });

  it('provides standard layout spacing, radii, and touch target scales', () => {
    expect(spacing.base).toBe(16);
    expect(radii.card).toBe(12);
    expect(touchTargets.webMin).toBe(44);
    expect(touchTargets.mobileMin).toBe(48);
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
      // Ink text on warm paper background
      const inkOnPaper = getContrastRatio(colors.light.text.primary, colors.light.background);
      expect(inkOnPaper).toBeGreaterThanOrEqual(4.5);
      expect(meetsWcagAA(colors.light.text.primary, colors.light.background)).toBe(true);

      // Slate secondary text on warm paper background
      const slateOnPaper = getContrastRatio(colors.light.text.secondary, colors.light.background);
      expect(slateOnPaper).toBeGreaterThanOrEqual(4.5);

      // White label on deep teal action
      const whiteOnTeal = getContrastRatio(colors.light.action.label, colors.light.action.primary);
      expect(whiteOnTeal).toBeGreaterThanOrEqual(4.5);

      // Ink label on amber accent
      const inkOnAmber = getContrastRatio(colors.light.accent.label, colors.light.accent.warm);
      expect(inkOnAmber).toBeGreaterThanOrEqual(4.5);
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

      // Dark label on soft teal action
      const darkOnSoftTeal = getContrastRatio(colors.dark.action.label, colors.dark.action.primary);
      expect(darkOnSoftTeal).toBeGreaterThanOrEqual(4.5);

      // Dark label on soft amber accent
      const darkOnSoftAmber = getContrastRatio(colors.dark.accent.label, colors.dark.accent.warm);
      expect(darkOnSoftAmber).toBeGreaterThanOrEqual(4.5);
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
