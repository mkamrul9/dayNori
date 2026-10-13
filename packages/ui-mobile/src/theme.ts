import { colors, spacing, radii, type DaynoriColors } from '@daynori/design-tokens';

export interface MobileTheme {
  colors: DaynoriColors;
  spacing: typeof spacing;
  radii: typeof radii;
}

export const lightMobileTheme: MobileTheme = {
  colors: colors.light,
  spacing,
  radii,
};

export const darkMobileTheme: MobileTheme = {
  colors: colors.dark,
  spacing,
  radii,
};
