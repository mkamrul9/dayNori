import { colors, spacing, radii, touchTargets, type DaynoriColors } from '@daynori/design-tokens';

export interface MobileTheme {
  colors: DaynoriColors;
  spacing: typeof spacing;
  radii: typeof radii;
  touchTargets: typeof touchTargets;
}

export const lightMobileTheme: MobileTheme = {
  colors: colors.light,
  spacing,
  radii,
  touchTargets,
};

export const darkMobileTheme: MobileTheme = {
  colors: colors.dark,
  spacing,
  radii,
  touchTargets,
};
