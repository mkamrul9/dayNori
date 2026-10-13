/**
 * Daynori semantic design tokens
 * Source: docs/design/design-system.md
 */

export const colors = {
  light: {
    background: '#F7F5EF',
    surface: '#FFFFFF',
    text: {
      primary: '#172C2C',
      secondary: '#526363',
    },
    action: {
      primary: '#146B63',
      label: '#FFFFFF',
    },
    accent: {
      warm: '#D9A441',
      label: '#172C2C',
    },
    border: {
      strong: '#81918A',
      subtle: '#D6DDD8',
    },
    status: {
      danger: '#B3261E',
      success: '#1B6A3F',
      warning: '#B26200',
      info: '#115E7C',
    },
  },
  dark: {
    background: '#0D1919',
    surface: '#132323',
    text: {
      primary: '#E9F0ED',
      secondary: '#AEC0BB',
    },
    action: {
      primary: '#73C2B6',
      label: '#102020',
    },
    accent: {
      warm: '#E6B85A',
      label: '#102020',
    },
    border: {
      strong: '#3B4E4A',
      subtle: '#223432',
    },
    status: {
      danger: '#F2B8B5',
      success: '#87D3A6',
      warning: '#FFB951',
      info: '#8ACAE6',
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
  sm: 8,
  card: 12,
  sheet: 16,
  pill: 9999,
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
    relaxed: 1.5,
    tight: 1.25,
  },
} as const;

export const tokens = {
  colors,
  spacing,
  radii,
  typography,
} as const;

export interface DaynoriColors {
  readonly background: string;
  readonly surface: string;
  readonly text: {
    readonly primary: string;
    readonly secondary: string;
  };
  readonly action: {
    readonly primary: string;
    readonly label: string;
  };
  readonly accent: {
    readonly warm: string;
    readonly label: string;
  };
  readonly border: {
    readonly strong: string;
    readonly subtle: string;
  };
  readonly status: {
    readonly danger: string;
    readonly success: string;
    readonly warning: string;
    readonly info: string;
  };
}

export type ThemeMode = 'light' | 'dark';
export type SpacingTokens = typeof spacing;
export type RadiiTokens = typeof radii;
