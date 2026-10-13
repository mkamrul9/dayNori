import { describe, expect, it } from 'vitest';
import type { ClientMutation, MutationReceipt, SyncStoragePort } from './index.js';
import { parseWorkspaceId } from '@daynori/domain';

describe('Sync Protocol Model', () => {
  it('constructs well-typed mutations and receipts', () => {
    const workspaceId = parseWorkspaceId('123e4567-e89b-12d3-a456-426614174000');
    const mutation: ClientMutation<{ title: string }> = {
      id: 'mut-001',
      workspaceId,
      entityType: 'note',
      entityId: 'note-001',
      action: 'create',
      payload: { title: 'First Note' },
      clientTimestamp: '2026-10-13T20:00:00.000Z',
      baseRevision: 0,
    };

    const receipt: MutationReceipt = {
      mutationId: mutation.id,
      workspaceId,
      serverRevision: 1,
      serverTimestamp: '2026-10-13T20:00:01.000Z',
      acknowledged: true,
    };

    expect(mutation.id).toBe('mut-001');
    expect(receipt.acknowledged).toBe(true);
    expect(receipt.serverRevision).toBe(1);
  });

  it('implements an in-memory test port conforming to SyncStoragePort', async () => {
    const workspaceId = parseWorkspaceId('123e4567-e89b-12d3-a456-426614174000');
    const queue: ClientMutation[] = [];

    const inMemoryStorage: SyncStoragePort = {
      getPendingMutations: async (wsId) => queue.filter((m) => m.workspaceId === wsId),
      enqueueMutation: async (m) => {
        queue.push(m);
      },
      markAcknowledged: async (id) => {
        const idx = queue.findIndex((m) => m.id === id);
        if (idx !== -1) queue.splice(idx, 1);
      },
      getCursor: async () => null,
      saveCursor: async () => {},
    };

    await inMemoryStorage.enqueueMutation({
      id: 'm1',
      workspaceId,
      entityType: 'task',
      entityId: 't1',
      action: 'create',
      payload: {},
      clientTimestamp: new Date().toISOString(),
      baseRevision: 0,
    });

    const pending = await inMemoryStorage.getPendingMutations(workspaceId);
    expect(pending.length).toBe(1);
  });
});
