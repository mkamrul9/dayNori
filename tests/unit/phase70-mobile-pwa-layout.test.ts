import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SETTINGS_GROUPS } from '../../apps/web/src/components/settings/settingsGroups.js';
import {
  getVisualViewportInsets,
  KEYBOARD_VAR,
  VV_HEIGHT_VAR,
} from '../../apps/web/src/browser/visualViewportAdapter.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('Phase 70 — mobile/PWA layout and Settings groups', () => {
  it('defines six stable Settings subpage routes', () => {
    expect(SETTINGS_GROUPS).toHaveLength(6);
    const ids = SETTINGS_GROUPS.map((g) => g.id);
    expect(ids).toEqual([
      'account',
      'appearance',
      'notifications',
      'workspace',
      'privacy',
      'help',
    ]);
    for (const group of SETTINGS_GROUPS) {
      expect(group.href).toBe(`/settings/${group.id}`);
      expect(group.title.length).toBeGreaterThan(3);
      expect(fs.existsSync(path.join(repoRoot, 'apps/web/src/app/settings', group.id, 'page.tsx'))).toBe(
        true
      );
    }
  });

  it('keeps viewport-safe CSS variables for keyboard, banners, and mobile editors', () => {
    const css = fs.readFileSync(path.join(repoRoot, 'apps/web/src/app/globals.css'), 'utf8');
    expect(css).toContain('--daynori-keyboard-inset');
    expect(css).toContain('--daynori-vv-height');
    expect(css).toContain('--daynori-banner-bottom');
    expect(css).toContain('daynori-mobile-editor-panel');
    expect(css).toContain('daynori-dialog-actions');
    expect(css).toContain('daynori-calendar-month-grid');
    expect(css).toMatch(/display-mode:\s*standalone/);
  });

  it('compact header source avoids overflow-x scrolling of essentials', () => {
    const header = fs.readFileSync(
      path.join(repoRoot, 'apps/web/src/components/AppHeader.tsx'),
      'utf8'
    );
    expect(header).not.toMatch(/overflowX:\s*['"]auto['"]/);
    expect(header).toContain('global-create-btn');
    expect(header).toContain('global-settings-btn');
    expect(header).toContain('Create');
  });

  it('bottom nav remains registry-driven with labeled destinations', () => {
    const nav = fs.readFileSync(
      path.join(repoRoot, 'apps/web/src/components/AppBottomNav.tsx'),
      'utf8'
    );
    expect(nav).toContain('useFeatureNavigation');
    expect(nav).toContain('primaryTabs');
    expect(nav).toContain('daynori-bottom-nav-label');
  });

  it('task and routine editors use mobile full-screen adapter classes', () => {
    const task = fs.readFileSync(
      path.join(repoRoot, 'packages/ui-web/src/TaskDetailEditor.tsx'),
      'utf8'
    );
    const routine = fs.readFileSync(
      path.join(repoRoot, 'packages/ui-web/src/RoutineDetailEditor.tsx'),
      'utf8'
    );
    expect(task).toContain('daynori-mobile-editor-panel');
    expect(task).toContain('daynori-dialog-actions');
    expect(task).toContain("e.key === 'Escape'");
    expect(routine).toContain('daynori-mobile-editor-panel');
    expect(routine).toContain("e.key === 'Escape'");
  });

  it('visualViewport adapter exports feature-detectable helpers without requiring a window', () => {
    expect(KEYBOARD_VAR).toBe('--daynori-keyboard-inset');
    expect(VV_HEIGHT_VAR).toBe('--daynori-vv-height');
    const insets = getVisualViewportInsets();
    expect(insets.supported).toBe(false);
    expect(insets.keyboardInset).toBe(0);
  });

  it('AppStatusBanners still prioritize Update over Install via shared region', () => {
    const banners = fs.readFileSync(
      path.join(repoRoot, 'apps/web/src/components/AppStatusBanners.tsx'),
      'utf8'
    );
    expect(banners).toContain('hasUnsavedWork');
    expect(banners).toContain('daynori-status-banners');
    expect(banners).toMatch(/waitingWorker|Update/);
  });
});
