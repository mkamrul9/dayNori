/**
 * Daynori semantic design tokens
 * Source: docs/design/design-system.md & docs/design/accessibility.md
 *
 * Implements the violet/coral Day Path identity for light and dark themes
 * with strict WCAG 2.2 AA contrast compliance.
 */

export const colors = {
  light: {
    background: '#F7F7FF',
    surface: '#FFFFFF', // Clean surface
    surfaceRaised: '#EFEFFF',
    text: {
      primary: '#1C2142',
      secondary: '#4F5877',
      muted: '#626B87',
      inverse: '#FFFFFF', // Pure white text for dark actions
    },
    action: {
      primary: '#623DE8',
      primaryHover: '#4F2CC8',
      label: '#FFFFFF', // Pure white label
      subtle: '#EEE9FF',
      subtleText: '#4724AB',
      disabled: '#D8DBEC',
      disabledText: '#65708A',
      danger: '#B3261E', // Deep red action
      dangerHover: '#8F1D18',
      dangerLabel: '#FFFFFF', // Pure white label on deep red (6.55:1)
    },
    accent: {
      warm: '#B93865', // Coral accent; retained key for shared contract compatibility
      label: '#FFFFFF',
      subtle: '#FFEAF1',
    },
    border: {
      strong: '#7580A1',
      subtle: '#DDE0F1',
      focus: '#623DE8',
    },
    status: {
      danger: '#B3261E',
      dangerBg: '#FDF2F2',
      dangerBorder: '#F5C2C0',
      success: '#2854B8',
      successBg: '#EAF0FF',
      successBorder: '#B7CAFA',
      warning: '#8F4E00',
      warningBg: '#FFFBEB',
      warningBorder: '#FDE68A',
      info: '#115E7C',
      infoBg: '#F0F9FF',
      infoBorder: '#BAE6FD',
    },
  },
  dark: {
    background: '#0E1024',
    surface: '#181B36',
    surfaceRaised: '#24284B',
    text: {
      primary: '#F7F5FF',
      secondary: '#C7C9E3',
      muted: '#ADB3D4',
      inverse: '#1B1735',
    },
    action: {
      primary: '#B8A3FF',
      primaryHover: '#D0C1FF',
      label: '#1B1735',
      subtle: '#382B65',
      subtleText: '#DDD3FF',
      disabled: '#343955',
      disabledText: '#98A0C0',
      danger: '#F2B8B5', // Soft coral red action
      dangerHover: '#F7C8C5',
      dangerLabel: '#381615', // High-contrast dark red ink label (9.58:1)
    },
    accent: {
      warm: '#FF9DBB',
      label: '#37182A',
      subtle: '#49243D',
    },
    border: {
      strong: '#8892B9',
      subtle: '#373C60',
      focus: '#B8A3FF',
    },
    status: {
      danger: '#F2B8B5',
      dangerBg: '#381615',
      dangerBorder: '#5C2220',
      success: '#B8A3FF',
      successBg: '#202A50',
      successBorder: '#43559A',
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

/** Shared radii retained across the Phase 131 palette refresh. */
export const radii = {
  sm: 10, // Controls (buttons, inputs)
  md: 14, // Alias for card density
  card: 14, // Cards, list containers
  lg: 18, // Large surfaces
  sheet: 18, // Modal dialogs, bottom sheets
  pill: 9999, // Tags, badges, filters
} as const;

/** Shared density — page/card padding and list row gaps. */
export const density = {
  padPage: 28,
  padCard: 20,
  rowGap: 14,
  listRow: 14,
  headerHeight: 56,
  navHeight: 64,
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
  /** Prefer these when prefers-reduced-motion: reduce (or RN reduceMotion). */
  reduced: {
    duration: {
      fast: 0,
      standard: 0,
      none: 0,
    },
    easing: 'linear',
  },
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
  density,
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
export type DensityTokens = typeof density;
