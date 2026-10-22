import { describe, expect, it } from 'vitest';
import {
  ONBOARDING_INTEREST_LABELS,
  ONBOARDING_STEP_METADATA,
  PWA_INSTALL_GUIDE_STEPS,
  SAMPLE_STARTER_TEMPLATE,
  TUTORIAL_STEPS,
  getDefaultOnboardingState,
  resetOnboardingForReplay,
  shouldShowOnboarding,
  skipOnboarding,
  completeOnboarding,
} from '@daynori/domain';
import { iconPaths } from '@daynori/design-tokens';
import {
  corePreviewDetails,
  corePreviewNotice,
  corePreviewSummary,
} from '../../apps/web/src/config/preview.js';

describe('Mobile PWA usability — onboarding and preview copy', () => {
  it('keeps three skippable tutorial steps with plain-language metadata', () => {
    expect(TUTORIAL_STEPS).toEqual(['capture', 'planning', 'organize']);
    for (const step of TUTORIAL_STEPS) {
      const meta = ONBOARDING_STEP_METADATA[step];
      expect(meta.title.length).toBeGreaterThan(0);
      expect(meta.title.length).toBeLessThan(48);
      expect(meta.description.length).toBeGreaterThan(20);
      expect(meta.description.toLowerCase()).not.toMatch(/widget|authorization|dashboard/);
    }
    expect(ONBOARDING_STEP_METADATA.capture.description.toLowerCase()).toContain('today');
    expect(ONBOARDING_STEP_METADATA.capture.description.toLowerCase()).toContain('plan');
    expect(ONBOARDING_STEP_METADATA.planning.description.toLowerCase()).toMatch(/task/);
    expect(ONBOARDING_STEP_METADATA.organize.description.toLowerCase()).toMatch(/sync|account/);
  });

  it('uses semantic icon names instead of emoji chrome for interests', () => {
    for (const interest of Object.keys(ONBOARDING_INTEREST_LABELS) as Array<
      keyof typeof ONBOARDING_INTEREST_LABELS
    >) {
      const icon = ONBOARDING_INTEREST_LABELS[interest].icon;
      expect(icon).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
      expect(iconPaths[icon as keyof typeof iconPaths]).toBeDefined();
    }
  });

  it('labels sample content and keeps install guide short', () => {
    expect(SAMPLE_STARTER_TEMPLATE.noteTitle.toLowerCase()).toContain('sample');
    expect(SAMPLE_STARTER_TEMPLATE.taskTitle.toLowerCase()).toContain('sample');
    expect(SAMPLE_STARTER_TEMPLATE.folderName.toLowerCase()).toContain('sample');
    expect(PWA_INSTALL_GUIDE_STEPS.length).toBeGreaterThanOrEqual(3);
    expect(PWA_INSTALL_GUIDE_STEPS.length).toBeLessThanOrEqual(6);
  });

  it('preserves skip, complete, and replay invariants', () => {
    const base = getDefaultOnboardingState();
    expect(shouldShowOnboarding(base)).toBe(true);
    const skipped = skipOnboarding(base);
    expect(shouldShowOnboarding(skipped)).toBe(false);
    const completed = completeOnboarding({
      ...base,
      createdSampleItemIds: ['note-1'],
      createdFolderId: 'folder-1',
    });
    const replay = resetOnboardingForReplay(completed);
    expect(replay.completed).toBe(false);
    expect(replay.createdSampleItemIds).toEqual(['note-1']);
    expect(replay.createdFolderId).toBe('folder-1');
  });

  it('keeps preview notice compact with expandable detail lines', () => {
    expect(corePreviewSummary.length).toBeLessThan(80);
    expect(corePreviewDetails.length).toBeGreaterThanOrEqual(3);
    expect(corePreviewNotice).toContain(corePreviewSummary);
  });
});
