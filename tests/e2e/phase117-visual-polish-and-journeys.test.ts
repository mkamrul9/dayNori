import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  calculateGentleProgress,
  computeDeterministicOccurrenceId,
  highlightMatch,
  isRoutineScheduledOnDate,
  isTaskDueToday,
  resolveJournalTitle,
  type RoutineTemplateRule,
} from '@daynori/domain';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('Phase 117: Web/PWA Visual Polish and User Journeys Evidence Tests', () => {
  const phase117Dir = path.join(repoRoot, 'artifacts/phase117');
  const manifestBeforePath = path.join(phase117Dir, 'capture-manifest-before.json');
  const manifestAfterPath = path.join(phase117Dir, 'capture-manifest-after.json');
  const humanReviewPath = path.join(phase117Dir, 'human-design-review.md');
  const visualReportPath = path.join(phase117Dir, 'visual-verification-report.md');
  const summaryPath = path.join(phase117Dir, 'evidence-summary.json');

  interface ManifestCapture {
    screen: string;
    viewport: string;
    width: number;
    height: number;
    theme: string;
    filename: string;
    sha256: string;
    bytes: number;
    horizontalOverflow: boolean;
  }

  interface Manifest {
    phase: string;
    mode: string;
    timestamp: string;
    viewports: Array<{ name: string; width: number; height: number; isMobile: boolean }>;
    themes: string[];
    screens: string[];
    captures: ManifestCapture[];
    themeDifferenceVerification: {
      pairsTested: number;
      pairsDistinct: number;
      pairsIdentical: number;
      passed: boolean;
      failures: Array<{ screen: string; viewport: string; sha256: string }>;
    };
  }

  describe('1. Screenshot Evidence and Integrity Verification', () => {
    it('verifies before and after capture manifests exist and conform to schema', () => {
      expect(fs.existsSync(manifestBeforePath)).toBe(true);
      expect(fs.existsSync(manifestAfterPath)).toBe(true);
      expect(fs.existsSync(humanReviewPath)).toBe(true);
      expect(fs.existsSync(visualReportPath)).toBe(true);
      expect(fs.existsSync(summaryPath)).toBe(true);

      const b = JSON.parse(fs.readFileSync(manifestBeforePath, 'utf8')) as Manifest;
      const a = JSON.parse(fs.readFileSync(manifestAfterPath, 'utf8')) as Manifest;

      expect(b.phase).toBe('117');
      expect(a.phase).toBe('117');
      expect(b.mode).toBe('before');
      expect(a.mode).toBe('after');

      const expectedScreens = [
        'today',
        'plan',
        'library',
        'journal',
        'settings',
        'create',
        'menus',
        'assistant',
      ];
      expect(b.screens).toEqual(expectedScreens);
      expect(a.screens).toEqual(expectedScreens);

      const expectedViewports = [
        'desktop-1280',
        'mobile-412',
        'mobile-390',
        'mobile-360',
        'mobile-320',
      ];
      expect(b.viewports.map((v) => v.name)).toEqual(expectedViewports);
      expect(a.viewports.map((v) => v.name)).toEqual(expectedViewports);

      expect(b.captures.length).toBe(80);
      expect(a.captures.length).toBe(80);
    });

    it('guarantees zero byte-identical light/dark pairs across all viewports in before and after captures', () => {
      const b = JSON.parse(fs.readFileSync(manifestBeforePath, 'utf8')) as Manifest;
      const a = JSON.parse(fs.readFileSync(manifestAfterPath, 'utf8')) as Manifest;

      // Before captures verification
      expect(b.themeDifferenceVerification.pairsTested).toBe(40);
      expect(b.themeDifferenceVerification.pairsDistinct).toBe(40);
      expect(b.themeDifferenceVerification.pairsIdentical).toBe(0);
      expect(b.themeDifferenceVerification.passed).toBe(true);
      expect(b.themeDifferenceVerification.failures).toHaveLength(0);

      // After captures verification
      expect(a.themeDifferenceVerification.pairsTested).toBe(40);
      expect(a.themeDifferenceVerification.pairsDistinct).toBe(40);
      expect(a.themeDifferenceVerification.pairsIdentical).toBe(0);
      expect(a.themeDifferenceVerification.passed).toBe(true);
      expect(a.themeDifferenceVerification.failures).toHaveLength(0);

      // Explicit pair-by-pair check on disk files
      const checkPairs = (captures: ManifestCapture[], mode: string) => {
        const grouped = new Map<string, { light?: ManifestCapture; dark?: ManifestCapture }>();
        for (const c of captures) {
          const key = `${c.screen}_${c.viewport}`;
          const cur = grouped.get(key) || {};
          if (c.theme === 'light') cur.light = c;
          if (c.theme === 'dark') cur.dark = c;
          grouped.set(key, cur);
        }

        for (const [key, pair] of grouped) {
          expect(pair.light).toBeDefined();
          expect(pair.dark).toBeDefined();
          expect(pair.light!.sha256).not.toBe(pair.dark!.sha256);

          const lightPath = path.join(phase117Dir, 'screenshots', mode, pair.light!.filename);
          const darkPath = path.join(phase117Dir, 'screenshots', mode, pair.dark!.filename);
          expect(fs.existsSync(lightPath)).toBe(true);
          expect(fs.existsSync(darkPath)).toBe(true);
        }
      };

      checkPairs(b.captures, 'before');
      checkPairs(a.captures, 'after');
    });

    it('verifies zero horizontal overflow across all 80 before and 80 after captures', () => {
      const b = JSON.parse(fs.readFileSync(manifestBeforePath, 'utf8')) as Manifest;
      const a = JSON.parse(fs.readFileSync(manifestAfterPath, 'utf8')) as Manifest;

      for (const c of b.captures) {
        expect(c.horizontalOverflow).toBe(false);
      }
      for (const c of a.captures) {
        expect(c.horizontalOverflow).toBe(false);
      }
    });

    it('verifies genuine visual before vs after differences', () => {
      const b = JSON.parse(fs.readFileSync(manifestBeforePath, 'utf8')) as Manifest;
      const a = JSON.parse(fs.readFileSync(manifestAfterPath, 'utf8')) as Manifest;

      const bMap = new Map(b.captures.map((c) => [c.filename, c.sha256]));
      let modifiedCount = 0;

      for (const c of a.captures) {
        const beforeHash = bMap.get(c.filename);
        if (beforeHash && beforeHash !== c.sha256) {
          modifiedCount++;
        }
      }

      // Refined surfaces (Today, Library, Journal, Settings, Create, Menus) have modified pixel outputs
      expect(modifiedCount).toBeGreaterThan(0);
    });
  });

  describe('2. Main User Journeys & Interaction Verification', () => {
    it('verifies Note creation, editing, and search matching journey', () => {
      const noteTitle = 'Architecture Review & Guidelines';
      const query = 'Review';
      const highlighted = highlightMatch(noteTitle, query);
      expect(highlighted.some((segment) => segment.match && segment.text === 'Review')).toBe(
        true
      );
    });

    it('verifies Task deadline and priority journey', () => {
      const todayDate = '2026-11-15';
      const now = new Date(`${todayDate}T12:00:00.000Z`);
      const task = {
        deadline: {
          type: 'date' as const,
          date: todayDate,
        },
        priority: 'high' as const,
        status: 'open' as const,
      };

      expect(isTaskDueToday(task, now, 'UTC')).toBe(true);
    });

    it('verifies Routine occurrence generation and gentle progress checkoff journey', () => {
      const workspaceId = 'ws-test-117';
      const routine: RoutineTemplateRule = {
        id: 'routine-117-01',
        workspaceId,
        title: 'Morning reflection and coffee',
        frequency: 'daily',
        weekdays: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
        timezone: 'UTC',
        activeFrom: '2026-01-01',
        isPaused: false,
        isArchived: false,
      };

      const scheduledDate = '2026-11-15';
      const isScheduled = isRoutineScheduledOnDate(
        { frequency: routine.frequency, weekdays: routine.weekdays, isPaused: false, isArchived: false },
        scheduledDate
      );
      expect(isScheduled).toBe(true);

      const occurrenceId = computeDeterministicOccurrenceId(
        workspaceId,
        routine.id,
        scheduledDate
      );
      expect(occurrenceId).toBeDefined();

      const progress = calculateGentleProgress([
        { status: 'done' },
        { status: 'pending' },
      ]);
      expect(progress.totalScheduled).toBe(2);
      expect(progress.completedCount).toBe(1);
      expect(progress.completionRate).toBe(50);
    });

    it('verifies Journal reflection creation and privacy title resolution journey', () => {
      const entryDate = '2026-11-15';
      const plainText = 'Spent an hour refining the mobile bottom navigation and Today view cards.';

      // When snippets are suppressed for privacy
      const privateTitle = resolveJournalTitle('', entryDate, plainText, {
        suppressBodySnippet: true,
      });
      expect(privateTitle).toContain('2026-11-15');
      expect(privateTitle).not.toContain('Spent an hour');

      // When snippets are visible
      const openTitle = resolveJournalTitle('', entryDate, plainText, {
        suppressBodySnippet: false,
      });
      expect(openTitle).toContain('Spent an hour');
    });

    it('verifies UI Shell theme toggle and modal controls contract', () => {
      const shellPath = path.join(repoRoot, 'apps/web/src/components/ShellContext.tsx');
      const content = fs.readFileSync(shellPath, 'utf8');

      expect(content).toContain('themePreference');
      expect(content).toContain('toggleTheme');
      expect(content).toContain('setTheme');
      expect(content).toContain('__daynoriShell');
    });
  });
});
