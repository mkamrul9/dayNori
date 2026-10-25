import {
  sanitizeAndMigrateFeaturePersonalization,
  type FeaturePersonalization,
  type HomeLayout,
} from '@daynori/domain';
import type {
  DisplayPreferences,
  QuietHoursPreference,
  OnboardingState,
  ThemePreference,
} from '@daynori/contracts';

/**
 * Resolve feature personalization from stored prefs + legacy homeLayout shortcuts.
 */
export function resolveFeaturePersonalization(
  preferences: Record<string, unknown> | null | undefined
): FeaturePersonalization {
  const homeLayout = preferences?.['homeLayout'] as HomeLayout | undefined;
  return sanitizeAndMigrateFeaturePersonalization(
    preferences?.['featurePersonalization'],
    homeLayout?.moduleShortcuts ?? null
  );
}

function asTheme(value: unknown): ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system' ? value : 'system';
}

/** Map stored preference JSON to API display preferences (includes Phase 66 personalization). */
export function mapDisplayPreferences(
  prefs: Record<string, unknown> | null | undefined
): DisplayPreferences {
  return {
    theme: asTheme(prefs?.['theme']),
    compactMode: Boolean(prefs?.['compactMode']),
    journalPreviewHidden: prefs?.['journalPreviewHidden'] !== false,
    suppressBodySnippets: prefs?.['suppressBodySnippets'] !== false,
    expensesEnabled: Boolean(prefs?.['expensesEnabled']),
    quietHours: (prefs?.['quietHours'] as QuietHoursPreference | undefined) || undefined,
    homeLayout: (prefs?.['homeLayout'] as HomeLayout | undefined) || undefined,
    onboarding: (prefs?.['onboarding'] as OnboardingState | undefined) || undefined,
    featurePersonalization: resolveFeaturePersonalization(prefs ?? undefined),
  };
}

/**
 * Sanitize incoming preference patch for featurePersonalization before merge.
 */
export function sanitizeFeaturePersonalizationPatch(
  preferences: Record<string, unknown> | undefined,
  existing: Record<string, unknown> | null | undefined
): Record<string, unknown> | undefined {
  if (!preferences || preferences['featurePersonalization'] === undefined) {
    return preferences;
  }
  const homeLayout =
    (preferences['homeLayout'] as HomeLayout | undefined) ??
    (existing?.['homeLayout'] as HomeLayout | undefined);
  const cleaned = sanitizeAndMigrateFeaturePersonalization(
    preferences['featurePersonalization'],
    homeLayout?.moduleShortcuts ?? null
  );
  return {
    ...preferences,
    featurePersonalization: cleaned,
  };
}
