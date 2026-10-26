import React from 'react';
import { describe, expect, it } from 'vitest';
import { PlanView, SAMPLE_MOBILE_ROUTINES } from './PlanView.js';
import { TestRenderer, type ReactTestRenderer, act } from '../test-render.js';
import type {
  CalendarEventRecord,
  JournalEntryRecord,
  LocalRepositoryPort,
  RoutineOccurrenceRecord,
  RoutineRecord,
  SyncEngine,
  TaskRecord,
} from '@daynori/sync';

type MutableRepo = {
  tasks: TaskRecord[];
  events: CalendarEventRecord[];
  routines: RoutineRecord[];
  occurrences: RoutineOccurrenceRecord[];
  journals: JournalEntryRecord[];
};

function createRoutine(
  overrides: Partial<RoutineRecord> & Pick<RoutineRecord, 'id' | 'workspaceId' | 'title'>
): RoutineRecord {
  const now = new Date().toISOString();
  return {
    folderId: null,
    details: null,
    frequency: 'daily',
    weekdays: [],
    timezone: 'UTC',
    scheduledTime: '09:00',
    activeFrom: '2020-01-01',
    activeTo: null,
    isPaused: false,
    isArchived: false,
    isPinned: false,
    scheduleRevision: 1,
    effectiveDate: '2020-01-01',
    serverRevision: 1,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...overrides,
  };
}

function createMockRepository(store: MutableRepo, boundWorkspaceId: string): LocalRepositoryPort {
  return {
    listTasks: async (workspaceId: string) =>
      store.tasks.filter((t) => t.workspaceId === workspaceId),
    listCalendarEvents: async (workspaceId: string) =>
      store.events.filter((e) => e.workspaceId === workspaceId),
    listRoutines: async (workspaceId: string) =>
      store.routines.filter((r) => r.workspaceId === workspaceId),
    listRoutineOccurrences: async (workspaceId: string) =>
      store.occurrences.filter((o) => o.workspaceId === workspaceId),
    listJournalEntries: async (workspaceId: string) =>
      store.journals.filter((j) => j.workspaceId === workspaceId),
    upsertRoutineOccurrence: async (occ: RoutineOccurrenceRecord) => {
      const idx = store.occurrences.findIndex((o) => o.id === occ.id);
      if (idx >= 0) store.occurrences[idx] = occ;
      else store.occurrences.push(occ);
    },
  } as unknown as LocalRepositoryPort;
}

function createMockSyncEngine(
  workspaceId: string,
  listeners: Array<(evt: { type: string; workspaceId?: string }) => void>
): SyncEngine {
  return {
    getDiagnostics: () => ({
      workspaceId,
      userId: 'user-a',
      deviceId: 'dev-1',
      isLeader: true,
      networkStatus: 'online' as const,
      cloudSyncStatus: 'synced' as const,
      queueLength: 0,
      inFlightCount: 0,
      failedCount: 0,
      lastSyncedAt: null,
      lastSyncSequence: 0,
      accessEpoch: null,
      consecutiveFailures: 0,
      activeConflictsCount: 0,
    }),
    onEvent: (cb: (evt: { type: string; workspaceId?: string }) => void) => {
      listeners.push(cb);
      return () => {
        const i = listeners.indexOf(cb);
        if (i >= 0) listeners.splice(i, 1);
      };
    },
    saveRoutineOccurrence: async () => ({ operationId: 'op-1' }),
  } as unknown as SyncEngine;
}

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

describe('PlanView routines data path (Phase 71)', () => {
  it('shows a genuine empty state for an ordinary empty workspace (no sample invent)', async () => {
    const store: MutableRepo = {
      tasks: [],
      events: [],
      routines: [],
      occurrences: [],
      journals: [],
    };
    const repo = createMockRepository(store, 'ws-empty');
    let renderer!: ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(PlanView, {
          themeMode: 'light',
          initialSubView: 'routines',
          workspaceId: 'ws-empty',
          userId: 'user-empty',
          repository: repo,
          isDemo: false,
        })
      );
    });
    await flush();

    expect(renderer.root.findByProps({ testID: 'plan-routines-empty' })).toBeDefined();
    expect(() =>
      renderer.root.findByProps({ testID: `plan-routine-row-${SAMPLE_MOBILE_ROUTINES[0]!.id}` })
    ).toThrow();
    for (const sample of SAMPLE_MOBILE_ROUTINES) {
      expect(() =>
        renderer.root.findByProps({ testID: `plan-routine-row-${sample.id}` })
      ).toThrow();
    }
  });

  it('renders a newly saved routine and opens the canonical record detail', async () => {
    const workspaceId = 'ws-live';
    const routineId = 'routine-canonical-1';
    const store: MutableRepo = {
      tasks: [],
      events: [],
      routines: [],
      occurrences: [],
      journals: [],
    };
    const listeners: Array<(evt: { type: string; workspaceId?: string }) => void> = [];
    const repo = createMockRepository(store, workspaceId);
    const syncEngine = createMockSyncEngine(workspaceId, listeners);
    let renderer!: ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(PlanView, {
          themeMode: 'light',
          initialSubView: 'routines',
          workspaceId,
          userId: 'user-live',
          repository: repo,
          syncEngine,
          isDemo: false,
        })
      );
    });
    await flush();
    expect(renderer.root.findByProps({ testID: 'plan-routines-empty' })).toBeDefined();

    store.routines.push(
      createRoutine({
        id: routineId,
        workspaceId,
        title: 'Canonical morning stretch',
        scheduledTime: '07:30',
      })
    );

    await act(async () => {
      for (const listener of [...listeners]) {
        listener({
          type: 'local_mutation_committed',
          workspaceId,
        });
      }
      await Promise.resolve();
      await Promise.resolve();
    });
    await flush();

    const row = renderer.root.findByProps({ testID: `plan-routine-row-${routineId}` });
    expect(row).toBeDefined();

    const pressable = row.findAllByProps({ accessibilityRole: 'button' })[0];
    expect(pressable).toBeDefined();
    expect(String(pressable!.props.accessibilityLabel)).toContain('Canonical morning stretch');
    await act(async () => {
      pressable!.props.onPress();
    });

    expect(
      renderer.root.findByProps({ testID: `plan-routine-detail-${routineId}` })
    ).toBeDefined();
    expect(renderer.root.findByProps({ testID: 'plan-routine-detail-sheet' })).toBeDefined();
  });

  it('never shows another workspace routine in the authorized list', async () => {
    const workspaceId = 'ws-a';
    const otherWorkspaceId = 'ws-b';
    const store: MutableRepo = {
      tasks: [],
      events: [],
      routines: [
        createRoutine({
          id: 'routine-a',
          workspaceId,
          title: 'Workspace A routine',
        }),
        createRoutine({
          id: 'routine-b',
          workspaceId: otherWorkspaceId,
          title: 'Workspace B secret routine',
        }),
      ],
      occurrences: [],
      journals: [],
    };
    const repo = createMockRepository(store, workspaceId);
    let renderer!: ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(PlanView, {
          themeMode: 'dark',
          initialSubView: 'routines',
          workspaceId,
          userId: 'user-a',
          repository: repo,
          isDemo: false,
        })
      );
    });
    await flush();

    expect(renderer.root.findByProps({ testID: 'plan-routine-row-routine-a' })).toBeDefined();
    expect(() =>
      renderer.root.findByProps({ testID: 'plan-routine-row-routine-b' })
    ).toThrow();
  });

  it('calendar projection does not invent routines when the repository is empty', async () => {
    const store: MutableRepo = {
      tasks: [],
      events: [],
      routines: [],
      occurrences: [],
      journals: [],
    };
    const repo = createMockRepository(store, 'ws-cal');
    let renderer!: ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(PlanView, {
          themeMode: 'light',
          initialSubView: 'calendar',
          workspaceId: 'ws-cal',
          userId: 'user-cal',
          repository: repo,
          isDemo: false,
        })
      );
    });
    await flush();

    const json = JSON.stringify(renderer.toJSON());
    for (const sample of SAMPLE_MOBILE_ROUTINES) {
      expect(json).not.toContain(sample.title);
    }
  });

  it('clears prior workspace display when switching to another workspace', async () => {
    const store: MutableRepo = {
      tasks: [],
      events: [],
      routines: [
        createRoutine({ id: 'routine-ws1', workspaceId: 'ws-1', title: 'Only in WS1' }),
        createRoutine({ id: 'routine-ws2', workspaceId: 'ws-2', title: 'Only in WS2' }),
      ],
      occurrences: [],
      journals: [],
    };
    const repo = createMockRepository(store, 'ws-1');
    let renderer!: ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(PlanView, {
          themeMode: 'light',
          initialSubView: 'routines',
          workspaceId: 'ws-1',
          userId: 'user-1',
          repository: repo,
          isDemo: false,
        })
      );
    });
    await flush();
    expect(renderer.root.findByProps({ testID: 'plan-routine-row-routine-ws1' })).toBeDefined();

    await act(async () => {
      renderer.update(
        React.createElement(PlanView, {
          themeMode: 'light',
          initialSubView: 'routines',
          workspaceId: 'ws-2',
          userId: 'user-1',
          repository: repo,
          isDemo: false,
        })
      );
    });
    await flush();

    expect(() =>
      renderer.root.findByProps({ testID: 'plan-routine-row-routine-ws1' })
    ).toThrow();
    expect(renderer.root.findByProps({ testID: 'plan-routine-row-routine-ws2' })).toBeDefined();
  });
});
