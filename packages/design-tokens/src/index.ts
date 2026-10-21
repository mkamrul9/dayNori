/**
 * Daynori semantic design tokens
 * Source: docs/design/design-system.md & docs/design/accessibility.md
 *
 * Implements paper/ink/teal/amber direction for light and dark themes
 * with strict WCAG 2.2 AA contrast compliance.
 */

export const colors = {
  light: {
    background: '#F7F5EF', // Warm paper
    surface: '#FFFFFF', // Clean surface
    surfaceRaised: '#FBF9F4', // Slightly raised card surface
    text: {
      primary: '#172C2C', // Dark ink
      secondary: '#526363', // Slate
      muted: '#697A7A', // Muted slate
      inverse: '#FFFFFF', // Pure white text for dark actions
    },
    action: {
      primary: '#146B63', // Deep teal
      primaryHover: '#0E524C',
      label: '#FFFFFF', // Pure white label
      subtle: '#E4EFEA', // Light teal tint
      subtleText: '#105650', // High-contrast teal text on subtle bg
      disabled: '#D3DAD7',
      disabledText: '#7B8985',
      danger: '#B3261E', // Deep red action
      dangerHover: '#8F1D18',
      dangerLabel: '#FFFFFF', // Pure white label on deep red (6.55:1)
    },
    accent: {
      warm: '#D9A441', // Amber priority / highlight
      label: '#172C2C', // Ink text on amber
      subtle: '#FDF6E8',
    },
    border: {
      strong: '#758680', // Essential field/control border on paper (>=3:1)
      subtle: '#D9DFDC', // Decorative card divider
      focus: '#146B63', // Deep teal focus indicator
    },
    status: {
      danger: '#B3261E',
      dangerBg: '#FDF2F2',
      dangerBorder: '#F5C2C0',
      success: '#1B6A3F',
      successBg: '#F0FDF4',
      successBorder: '#B6ECC8',
      warning: '#8F4E00',
      warningBg: '#FFFBEB',
      warningBorder: '#FDE68A',
      info: '#115E7C',
      infoBg: '#F0F9FF',
      infoBorder: '#BAE6FD',
    },
  },
  dark: {
    background: '#0D1919', // Deep ink
    surface: '#132323', // Dark teal-gray surface
    surfaceRaised: '#192C2C', // Raised card surface
    text: {
      primary: '#E9F0ED', // Pale paper
      secondary: '#AEC0BB', // Pale slate
      muted: '#7E918C', // Muted pale slate
      inverse: '#102020', // Dark ink text for soft actions
    },
    action: {
      primary: '#73C2B6', // Soft teal
      primaryHover: '#8BD1C6',
      label: '#102020', // Dark ink label on soft teal
      subtle: '#1C312E', // Dark subtle container
      subtleText: '#73C2B6',
      disabled: '#243533',
      disabledText: '#5A6E6A',
      danger: '#F2B8B5', // Soft coral red action
      dangerHover: '#F7C8C5',
      dangerLabel: '#381615', // High-contrast dark red ink label (9.58:1)
    },
    accent: {
      warm: '#E6B85A', // Soft amber
      label: '#102020', // Dark ink label
      subtle: '#302613',
    },
    border: {
      strong: '#5C7670', // Essential field/control border in dark (>=3.0:1)
      subtle: '#223432', // Decorative divider
      focus: '#73C2B6', // Soft teal focus indicator
    },
    status: {
      danger: '#F2B8B5',
      dangerBg: '#381615',
      dangerBorder: '#5C2220',
      success: '#87D3A6',
      successBg: '#122D1D',
      successBorder: '#1F4F33',
      warning: '#FFB951',
      warningBg: '#362208',
      warningBorder: '#5E3B0E',
      info: '#8ACAE6',
      infoBg: '#0F2937',
      infoBorder: '#194963',
    },
  },
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radii = {
  sm: 8, // Controls (buttons, inputs)
  card: 12, // Cards, list containers
  sheet: 16, // Modal dialogs, bottom sheets
  pill: 9999, // Tags, badges, filters
} as const;

export const touchTargets = {
  webMin: 44, // Minimum 44 CSS px for web interactive controls
  mobileMin: 48, // Minimum 48 dp for native touch targets
} as const;

export const typography = {
  webScale: {
    metadata: 12,
    supporting: 14,
    body: 16,
    sectionHeading: 20,
    pageTitle: 24,
    welcomeTitle: 32,
  },
  lineHeight: {
    tight: 1.25,
    relaxed: 1.5,
    bangla: 1.6, // Extended line-height for conjunct characters
  },
  fontFamily: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    bangla: "'Hind Siliguri', 'Kalpurush', system-ui, -apple-system, sans-serif",
  },
} as const;

export const focusRing = {
  width: 2,
  offset: 2,
  light: colors.light.border.focus,
  dark: colors.dark.border.focus,
} as const;

export const motion = {
  duration: {
    fast: 120,
    standard: 200,
    none: 0,
  },
  easing: 'cubic-bezier(0, 0, 0.2, 1)',
} as const;

/**
 * WCAG 2.2 Relative Luminance and Contrast Ratio calculation
 * Specification: https://www.w3.org/TR/WCAG22/#dfn-relative-luminance
 */
export function getRelativeLuminance(hex: string): number {
  const sanitized = hex.replace('#', '');
  const r = parseInt(sanitized.substring(0, 2), 16) / 255;
  const g = parseInt(sanitized.substring(2, 4), 16) / 255;
  const b = parseInt(sanitized.substring(4, 6), 16) / 255;

  const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

  const R = toLinear(r);
  const G = toLinear(g);
  const B = toLinear(b);

  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

export function getContrastRatio(hex1: string, hex2: string): number {
  const lum1 = getRelativeLuminance(hex1);
  const lum2 = getRelativeLuminance(hex2);
  const lighter = Math.max(lum1, lum2);
  const darker = Math.min(lum1, lum2);
  return Number(((lighter + 0.05) / (darker + 0.05)).toFixed(2));
}

export function meetsWcagAA(
  foreground: string,
  background: string,
  options: { isLargeText?: boolean; isUiComponent?: boolean } = {}
): boolean {
  const ratio = getContrastRatio(foreground, background);
  if (options.isLargeText || options.isUiComponent) {
    return ratio >= 3.0;
  }
  return ratio >= 4.5;
}

export const tokens = {
  colors,
  spacing,
  radii,
  touchTargets,
  typography,
  focusRing,
  motion,
} as const;

export interface DaynoriColors {
  readonly background: string;
  readonly surface: string;
  readonly surfaceRaised: string;
  readonly text: {
    readonly primary: string;
    readonly secondary: string;
    readonly muted: string;
    readonly inverse: string;
  };
  readonly action: {
    readonly primary: string;
    readonly primaryHover: string;
    readonly label: string;
    readonly subtle: string;
    readonly subtleText: string;
    readonly disabled: string;
    readonly disabledText: string;
    readonly danger: string;
    readonly dangerHover: string;
    readonly dangerLabel: string;
  };
  readonly accent: {
    readonly warm: string;
    readonly label: string;
    readonly subtle: string;
  };
  readonly border: {
    readonly strong: string;
    readonly subtle: string;
    readonly focus: string;
  };
  readonly status: {
    readonly danger: string;
    readonly dangerBg: string;
    readonly dangerBorder: string;
    readonly success: string;
    readonly successBg: string;
    readonly successBorder: string;
    readonly warning: string;
    readonly warningBg: string;
    readonly warningBorder: string;
    readonly info: string;
    readonly infoBg: string;
    readonly infoBorder: string;
  };
}

export type ThemeMode = 'light' | 'dark';
export { iconPaths, resolveIconName, splitIconText, type IconName } from './icons.js';
export type SpacingTokens = typeof spacing;
export type RadiiTokens = typeof radii;
