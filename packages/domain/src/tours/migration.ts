import type { OnboardingState } from '../onboarding.js';
import { getDefaultTourProgress, validateTourProgressState } from './progress.js';
import type { TourProgressState } from './types.js';

/**
 * Migrates V1 onboarding into tour progress without fabricating action-verified chapter completion.
 * Preserves practice/sample IDs for non-destructive replay.
 */
export function migrateOnboardingV1ToTourProgress(
  onboarding: OnboardingState | null | undefined,
  existingTour?: TourProgressState | null,
  at: string = new Date().toISOString()
): TourProgressState {
  const base = validateTourProgressState(existingTour ?? getDefaultTourProgress());
  if (base.migratedFromOnboardingV1) {
    return base;
  }

  // V1 completion/skip does not invent proof-chapter completion.
  // Sample IDs remain on onboarding.createdSampleItemIds — do not copy them into
  // tour practiceEntityIds (that would poison action correlation for the proof task).
  void onboarding;

  return {
    ...base,
    migratedFromOnboardingV1: true,
    migratedAt: at,
  };
}

/**
 * Idempotent migration entry used by preference loaders.
 */
export function ensureTourProgressMigrated(
  preferences: {
    onboarding?: OnboardingState | null;
    tourProgress?: TourProgressState | null;
  }
): TourProgressState {
  const current = validateTourProgressState(preferences.tourProgress ?? null);
  if (current.migratedFromOnboardingV1) return current;
  return migrateOnboardingV1ToTourProgress(preferences.onboarding ?? null, current);
}
