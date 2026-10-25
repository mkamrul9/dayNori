import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ONBOARDING_INTEREST_LABELS,
  ONBOARDING_STEP_METADATA,
  PWA_INSTALL_GUIDE_STEPS,
  PRACTICE_STARTER,
  SAMPLE_STARTER_TEMPLATE,
  TUTORIAL_STEPS,
  getDefaultOnboardingState,
  getPracticeNoteId,
  getPracticeTaskId,
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

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

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

  it('keeps practice create ids distinct from labeled sample starters', () => {
    const ws = '11111111-1111-5111-8111-111111111111';
    const user = '22222222-2222-5222-8222-222222222222';
    const practiceNote = getPracticeNoteId(ws, user);
    const practiceTask = getPracticeTaskId(ws, user);
    expect(practiceNote).not.toBe(SAMPLE_STARTER_TEMPLATE.noteTitle);
    expect(practiceNote).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
    expect(practiceTask).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
    expect(practiceNote).not.toEqual(practiceTask);
    expect(PRACTICE_STARTER.noteTitle.toLowerCase()).not.toContain('sample');
    expect(PRACTICE_STARTER.taskTitle.toLowerCase()).not.toContain('sample');
  });

  it('uses viewport-safe shared layout CSS without fixed narrow minmax traps', () => {
    const css = fs.readFileSync(path.join(repoRoot, 'apps/web/src/app/globals.css'), 'utf8');
    expect(css).toContain('--daynori-bottom-nav-height');
    expect(css).toContain('--daynori-main-bottom-pad');
    expect(css).toContain('daynori-responsive-grid');
    expect(css).toMatch(/minmax\(min\(100%,\s*11rem\)/);
    expect(css).toContain('daynori-status-banners');
    expect(css).toContain('--daynori-keyboard-inset');
    const library = fs.readFileSync(path.join(repoRoot, 'apps/web/src/app/library/page.tsx'), 'utf8');
    expect(library).not.toMatch(/minmax\(280px/);
    expect(library).not.toMatch(/minWidth:\s*320/);
    const manifest = JSON.parse(
      fs.readFileSync(path.join(repoRoot, 'apps/web/public/manifest.json'), 'utf8')
    ) as { start_url: string; scope: string };
    expect(manifest.start_url).toBe('/today');
    expect(manifest.scope).toBe('/');
    const sw = fs.readFileSync(path.join(repoRoot, 'apps/web/public/sw.js'), 'utf8');
    expect(sw).toMatch(/daynori-static-v7/);
    expect(sw).toContain("path.startsWith('/api/')");
  });
});
