import 'fake-indexeddb/auto';
import { afterEach, expect, it, vi } from 'vitest';
import { SyncEngine } from '@daynori/sync';
import {
  IndexedDbLocalRepository,
  setTrustedDeviceConsent,
  clearAllLocalData,
} from '../../apps/web/src/data/indexedDbRepository.js';
import { saveQuickCapture } from '../../apps/mobile/src/data/quickCapture.js';

afterEach(async () => {
  await clearAllLocalData();
  vi.unstubAllGlobals();
});
it('persists typed task, routine, note, and journal captures with pending operations while offline', async () => {
  const entries = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => entries.set(key, value),
    removeItem: (key: string) => entries.delete(key),
  });
  setTrustedDeviceConsent(true);
  const namespace = { userId: crypto.randomUUID(), workspaceId: crypto.randomUUID() };
  const repo = new IndexedDbLocalRepository();
  await repo.initialize(namespace);
  const engine = new SyncEngine({
    namespace,
    repository: repo,
    deviceId: 'phone-capture-test',
    transport: {
      push: async () => {
        throw new Error('Offline');
      },
      pull: async () => {
        throw new Error('Offline');
      },
      bootstrap: async () => {
        throw new Error('Offline');
      },
    },
  });
  try {
    for (const type of ['task', 'routine', 'note', 'journal'] as const) {
      await saveQuickCapture(
        engine,
        namespace.workspaceId,
        { type, title: `Synthetic ${type}`, details: 'Captured offline' },
        'Asia/Dhaka'
      );
    }
    const pending = await repo.getPendingMutations(namespace.workspaceId, namespace.userId);
    expect(pending.map((m) => m.command)).toEqual(
      expect.arrayContaining(['createTask', 'createRoutine', 'createNote', 'createJournalEntry'])
    );
    expect(pending).toHaveLength(4);
    await repo.close();
    await repo.initialize(namespace);
    expect(await repo.getPendingMutations(namespace.workspaceId, namespace.userId)).toHaveLength(4);
    expect(await repo.listTasks(namespace.workspaceId)).toHaveLength(1);
    expect(await repo.listNotes(namespace.workspaceId)).toHaveLength(1);
    expect(await repo.listRoutines(namespace.workspaceId)).toHaveLength(1);
    expect(await repo.listJournalEntries(namespace.workspaceId)).toHaveLength(1);
  } finally {
    await repo.close();
  }
});

it('rejects capture without a workspace rather than claiming a save', async () => {
  await expect(
    saveQuickCapture(null, null, { type: 'task', title: 'Keep draft', details: '' }, 'Asia/Dhaka')
  ).rejects.toThrow('Sign in');
});
