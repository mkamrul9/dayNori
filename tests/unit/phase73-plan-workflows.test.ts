import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  completeTask,
  reopenTask,
  generateOccurrencesForDateRange,
  completeOccurrence,
  skipOccurrence,
  type TaskEntity,
  type RoutineTemplateRule,
} from '@daynori/domain';

const repoRoot = path.resolve(import.meta.dirname, '../..');

describe('Phase 73 — required-fields-first editors and canonical calendar links', () => {
  it('web task editor keeps title/deadline primary and nests optional fields under Details', () => {
    const src = fs.readFileSync(
      path.join(repoRoot, 'packages/ui-web/src/TaskDetailEditor.tsx'),
      'utf8'
    );
    expect(src).toContain('id="task-editor-details"');
    expect(src).toContain('Details (optional)');
    const titleIdx = src.indexOf('id="task-title-input"');
    const deadlineIdx = src.indexOf('name="deadline-type"');
    const detailsIdx = src.indexOf('id="task-editor-details"');
    const priorityIdx = src.indexOf('id="task-priority-select"');
    expect(titleIdx).toBeGreaterThan(-1);
    expect(deadlineIdx).toBeGreaterThan(titleIdx);
    expect(detailsIdx).toBeGreaterThan(deadlineIdx);
    expect(priorityIdx).toBeGreaterThan(detailsIdx);
  });

  it('web routine editor nests optional schedule fields under Details', () => {
    const src = fs.readFileSync(
      path.join(repoRoot, 'packages/ui-web/src/RoutineDetailEditor.tsx'),
      'utf8'
    );
    expect(src).toContain('id="routine-editor-details"');
    expect(src).toContain('Details (optional)');
    const titleIdx = src.indexOf('id="routine-title-input"');
    const freqIdx = src.indexOf("handleFrequencyChange('daily')");
    const detailsIdx = src.indexOf('id="routine-editor-details"');
    expect(titleIdx).toBeGreaterThan(-1);
    expect(freqIdx).toBeGreaterThan(titleIdx);
    expect(detailsIdx).toBeGreaterThan(freqIdx);
  });

  it('plan and calendar pages resolve taskId / routineId canonical deep links', () => {
    const plan = fs.readFileSync(path.join(repoRoot, 'apps/web/src/app/plan/page.tsx'), 'utf8');
    const calendar = fs.readFileSync(
      path.join(repoRoot, 'apps/web/src/app/plan/calendar/page.tsx'),
      'utf8'
    );
    const today = fs.readFileSync(
      path.join(repoRoot, 'apps/web/src/components/TodayView.tsx'),
      'utf8'
    );
    expect(plan).toContain("searchParams.get('taskId')");
    expect(plan).toContain("searchParams.get('task')");
    expect(calendar).toContain('/plan?taskId=');
    expect(calendar).toContain('/?routineId=');
    expect(today).toContain("params.get('routineId')");
  });

  it('native PlanView opens calendar items to the same task/routine record', () => {
    const src = fs.readFileSync(
      path.join(repoRoot, 'apps/mobile/src/views/PlanView.tsx'),
      'utf8'
    );
    expect(src).toContain('handleOpenCalendarItem');
    expect(src).toContain('plan-task-details-toggle');
    expect(src).toContain('Details (optional)');
  });
});

describe('Phase 73 — completion invariants (no tomorrow copies; independent occurrences)', () => {
  const baseTask = (overrides: Partial<TaskEntity> = {}): TaskEntity =>
    ({
      id: 'task-1',
      workspaceId: 'ws-1',
      folderId: null,
      title: 'Ship Phase 73',
      details: null,
      priority: 'normal',
      status: 'todo',
      deadline: { type: 'date', date: '2026-10-27' },
      completedAt: null,
      reopenedAt: null,
      completionHistory: [],
      parentId: null,
      subtaskOrder: 0,
      tags: [],
      isFavorite: false,
      isArchived: false,
      securityScope: 'standard',
      revision: 1,
      createdAt: '2026-10-27T08:00:00.000Z',
      updatedAt: '2026-10-27T08:00:00.000Z',
      deletedAt: null,
      ...overrides,
    }) as TaskEntity;

  it('completing a task does not fabricate a tomorrow copy', () => {
    const initial = baseTask();
    const { task: completed } = completeTask(initial, '2026-10-27T12:00:00.000Z');
    expect(completed.status).toBe('completed');
    expect(completed.deadline).toEqual({ type: 'date', date: '2026-10-27' });
    expect(completed.id).toBe(initial.id);
    const { task: reopened } = reopenTask(completed, '2026-10-27T13:00:00.000Z');
    expect(reopened.status).toBe('todo');
    expect(reopened.id).toBe(initial.id);
    expect(reopened.deadline).toEqual({ type: 'date', date: '2026-10-27' });
  });

  it('routine occurrence completion leaves tomorrow independent', () => {
    const routine: RoutineTemplateRule = {
      id: 'r-1',
      workspaceId: 'ws-1',
      folderId: null,
      title: 'Stretch',
      details: null,
      frequency: 'daily',
      weekdays: [],
      timezone: 'Asia/Dhaka',
      scheduledTime: '07:00',
      activeFrom: '2026-10-01',
      activeTo: null,
      effectiveDate: '2026-10-01',
      isPaused: false,
      isArchived: false,
      scheduleRevision: 1,
    };
    const occurrences = generateOccurrencesForDateRange(routine, '2026-10-27', '2026-10-28', []);
    expect(occurrences).toHaveLength(2);
    const today = completeOccurrence(occurrences[0]!, 'usr-1', '2026-10-27T08:00:00.000Z');
    expect(today.status).toBe('done');
    expect(occurrences[1]!.status).toBe('pending');
    const skippedTomorrow = skipOccurrence(occurrences[1]!, 'usr-1', '2026-10-28T08:00:00.000Z');
    expect(skippedTomorrow.status).toBe('skipped');
    expect(today.status).toBe('done');
  });
});
