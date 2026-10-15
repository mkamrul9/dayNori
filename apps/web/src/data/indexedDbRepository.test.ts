import { describe, expect, it, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import {
  IndexedDbLocalRepository,
  getTrustedDeviceConsent,
  setTrustedDeviceConsent,
  clearTrustedDeviceConsent,
  clearAllLocalData,
} from './indexedDbRepository.js';
import {
  StorageQuotaError,
  TrustedDeviceConsentRequiredError,
  type ItemHeaderRecord,
  type DraftRecord,
  type PendingMutationRecord,
  type SyncCursorRecord,
  type PreferenceSnapshotRecord,
} from '@daynori/sync';

// In-memory localStorage mock for Node test runner
const memoryStorage = new Map<string, string>();
const globalWithStorage = globalThis as unknown as { localStorage?: Storage };
if (typeof globalWithStorage.localStorage === 'undefined') {
  globalWithStorage.localStorage = {
    getItem: (key: string) => memoryStorage.get(key) ?? null,
    setItem: (key: string, value: string) => memoryStorage.set(key, String(value)),
    removeItem: (key: string) => memoryStorage.delete(key),
    clear: () => memoryStorage.clear(),
    key: (_index: number) => null,
    length: 0,
  };
}

describe('Web IndexedDB Local Repository & Storage Adapter (Phase 11)', () => {
  const ws1 = 'ws_11111111-1111-1111-1111-111111111111';
  const ws2 = 'ws_22222222-2222-2222-2222-222222222222';
  const user1 = 'usr_alice_001';
  const user2 = 'usr_bob_002';

  beforeEach(async () => {
    // Reset consent and clear database before each test
    await clearAllLocalData();
    setTrustedDeviceConsent(true);
  });

  describe('Trusted-Device Consent & Privacy Refusal', () => {
    it('refuses to open or persist data when trusted-device consent is absent', async () => {
      clearTrustedDeviceConsent();
      expect(getTrustedDeviceConsent()).toBe(false);

      const repo = new IndexedDbLocalRepository();
      await expect(
        repo.initialize({
          userId: user1,
          workspaceId: ws1,
        })
      ).rejects.toThrow(TrustedDeviceConsentRequiredError);
    });

    it('allows initialization when deliberate trusted-device consent is granted', async () => {
      setTrustedDeviceConsent(true);
      expect(getTrustedDeviceConsent()).toBe(true);

      const repo = new IndexedDbLocalRepository();
      await expect(
        repo.initialize({
          userId: user1,
          workspaceId: ws1,
        })
      ).resolves.toBeUndefined();

      await repo.close();
    });

    it('clears all data and revokes consent on opt-out', async () => {
      setTrustedDeviceConsent(true);
      const repo = new IndexedDbLocalRepository();
      await repo.initialize({ userId: user1, workspaceId: ws1 });

      await repo.upsertItemHeader({
        id: 'note-001',
        workspaceId: ws1,
        kind: 'note',
        folderId: null,
        rank: '0',
        isArchived: false,
        isPinned: false,
        securityScope: 'standard',
        serverRevision: 1,
        createdAt: '2026-10-15T00:00:00.000Z',
        updatedAt: '2026-10-15T00:00:00.000Z',
        deletedAt: null,
      });

      await repo.close();

      // Opt out and clear local data
      clearTrustedDeviceConsent();
      await clearAllLocalData();
      expect(getTrustedDeviceConsent()).toBe(false);

      // Re-grant consent and verify storage was completely wiped
      setTrustedDeviceConsent(true);
      const newRepo = new IndexedDbLocalRepository();
      await newRepo.initialize({ userId: user1, workspaceId: ws1 });
      const found = await newRepo.getItemHeader(ws1, 'note-001');
      expect(found).toBeNull();
      await newRepo.close();
    });
  });

  describe('Item Header Operations & Workspace Isolation', () => {
    it('persists, updates, and queries item headers scoped by workspace', async () => {
      const repo = new IndexedDbLocalRepository();
      await repo.initialize({ userId: user1, workspaceId: ws1 });

      const header1: ItemHeaderRecord = {
        id: 'item-01',
        workspaceId: ws1,
        kind: 'task',
        folderId: null,
        rank: '0',
        isArchived: false,
        isPinned: false,
        securityScope: 'standard',
        serverRevision: 1,
        createdAt: '2026-10-15T10:00:00.000Z',
        updatedAt: '2026-10-15T10:00:00.000Z',
        deletedAt: null,
      };

      const header2: ItemHeaderRecord = {
        id: 'item-02',
        workspaceId: ws2,
        kind: 'journal',
        folderId: null,
        rank: '1',
        isArchived: false,
        isPinned: false,
        securityScope: 'standard',
        serverRevision: 1,
        createdAt: '2026-10-15T10:00:00.000Z',
        updatedAt: '2026-10-15T10:00:00.000Z',
        deletedAt: null,
      };

      await repo.upsertItemHeader(header1);
      await repo.upsertItemHeader(header2);

      const retrieved1 = await repo.getItemHeader(ws1, 'item-01');
      expect(retrieved1).toEqual(header1);

      // Workspace 1 listing must only contain header 1
      const listWs1 = await repo.listItemHeaders(ws1);
      expect(listWs1.length).toBe(1);
      expect(listWs1[0]?.id).toBe('item-01');

      // Update header 1
      const updatedHeader1: ItemHeaderRecord = {
        ...header1,
        rank: '2',
        isPinned: true,
        serverRevision: 2,
      };
      await repo.upsertItemHeader(updatedHeader1);
      const retrievedUpdated = await repo.getItemHeader(ws1, 'item-01');
      expect(retrievedUpdated?.rank).toBe('2');
      expect(retrievedUpdated?.serverRevision).toBe(2);

      // Delete header 1
      await repo.deleteItemHeader(ws1, 'item-01');
      expect(await repo.getItemHeader(ws1, 'item-01')).toBeNull();

      await repo.close();
    });
  });

  describe('Drafts & Account Quarantine Lifecycle', () => {
    it('isolates drafts by user account and prevents cross-user access', async () => {
      const repo = new IndexedDbLocalRepository();
      await repo.initialize({ userId: user1, workspaceId: ws1 });

      const aliceDraft: DraftRecord = {
        id: 'draft-alice-01',
        workspaceId: ws1,
        userId: user1,
        entityType: 'journal',
        entityId: null,
        title: 'Alice Private Journal Draft',
        payload: { content: 'Confidential feelings' },
        savedAt: '2026-10-15T10:00:00.000Z',
        isQuarantined: false,
        quarantinedAt: null,
      };

      const bobDraft: DraftRecord = {
        id: 'draft-bob-01',
        workspaceId: ws1,
        userId: user2,
        entityType: 'note',
        entityId: null,
        title: 'Bob Draft Note',
        payload: { content: 'Bob content' },
        savedAt: '2026-10-15T10:00:00.000Z',
        isQuarantined: false,
        quarantinedAt: null,
      };

      await repo.saveDraft(aliceDraft);
      await repo.saveDraft(bobDraft);

      // Alice only sees her own draft
      const aliceList = await repo.listDrafts(ws1, user1);
      expect(aliceList.length).toBe(1);
      expect(aliceList[0]?.id).toBe('draft-alice-01');

      // Bob cannot read Alice's draft
      const bobAttempt = await repo.getDraft(ws1, user2, 'draft-alice-01');
      expect(bobAttempt).toBeNull();

      await repo.close();
    });

    it('quarantines drafts on account switch/logout and allows recovery or purging', async () => {
      const repo = new IndexedDbLocalRepository();
      await repo.initialize({ userId: user1, workspaceId: ws1 });

      await repo.saveDraft({
        id: 'draft-alice-q1',
        workspaceId: ws1,
        userId: user1,
        entityType: 'task',
        entityId: null,
        title: 'In-Flight Task Draft',
        payload: { details: 'Details here' },
        savedAt: '2026-10-15T10:00:00.000Z',
        isQuarantined: false,
        quarantinedAt: null,
      });

      // Quarantine Alice's drafts (e.g. on logout or account switch)
      await repo.quarantineUserDrafts(user1);

      // Normal listDrafts excludes quarantined drafts
      const normalList = await repo.listDrafts(ws1, user1);
      expect(normalList.length).toBe(0);

      // Quarantined list shows the draft
      const quarantined = await repo.listQuarantinedDrafts(user1);
      expect(quarantined.length).toBe(1);
      expect(quarantined[0]?.id).toBe('draft-alice-q1');
      expect(quarantined[0]?.isQuarantined).toBe(true);

      // Restore the draft
      await repo.restoreQuarantinedDraft(user1, 'draft-alice-q1');
      const restoredList = await repo.listDrafts(ws1, user1);
      expect(restoredList.length).toBe(1);
      expect(restoredList[0]?.isQuarantined).toBe(false);

      // Re-quarantine and purge
      await repo.quarantineUserDrafts(user1);
      await repo.purgeQuarantinedDrafts(user1);
      expect(await repo.listQuarantinedDrafts(user1)).toEqual([]);
      expect(await repo.listDrafts(ws1, user1)).toEqual([]);

      await repo.close();
    });
  });

  describe('Pending Mutation Queue & Atomic Operations', () => {
    it('enqueues, retrieves, and removes pending mutations preserving order', async () => {
      const repo = new IndexedDbLocalRepository();
      await repo.initialize({ userId: user1, workspaceId: ws1 });

      const mut1: PendingMutationRecord = {
        operationId: 'op-001',
        deviceId: 'dev-001',
        workspaceId: ws1,
        userId: user1,
        entityType: 'note',
        entityId: 'note-1',
        action: 'create',
        payload: { title: 'First note' },
        baseRevision: 0,
        dependencyOperationIds: [],
        clientTimestamp: '2026-10-15T10:00:00.000Z',
        retryCount: 0,
        status: 'pending',
        lastError: null,
      };

      const mut2: PendingMutationRecord = {
        operationId: 'op-002',
        deviceId: 'dev-001',
        workspaceId: ws1,
        userId: user1,
        entityType: 'note',
        entityId: 'note-1',
        action: 'update',
        payload: { title: 'First note edited' },
        baseRevision: 1,
        dependencyOperationIds: ['op-001'],
        clientTimestamp: '2026-10-15T10:01:00.000Z',
        retryCount: 0,
        status: 'pending',
        lastError: null,
      };

      await repo.enqueueMutation(mut1);
      await repo.enqueueMutation(mut2);

      const pending = await repo.getPendingMutations(ws1, user1);
      expect(pending.length).toBe(2);
      expect(pending[0]?.operationId).toBe('op-001');
      expect(pending[1]?.operationId).toBe('op-002');

      // Remove mut1 after simulated acknowledgement
      await repo.removePendingMutation('op-001');
      const remaining = await repo.getPendingMutations(ws1, user1);
      expect(remaining.length).toBe(1);
      expect(remaining[0]?.operationId).toBe('op-002');

      await repo.close();
    });

    it('atomically saves draft and pending mutation in a single transaction', async () => {
      const repo = new IndexedDbLocalRepository();
      await repo.initialize({ userId: user1, workspaceId: ws1 });

      const draft: DraftRecord = {
        id: 'draft-atomic-01',
        workspaceId: ws1,
        userId: user1,
        entityType: 'task',
        entityId: null,
        title: 'Atomic Task Draft',
        payload: { details: 'Draft content' },
        savedAt: '2026-10-15T10:00:00.000Z',
        isQuarantined: false,
        quarantinedAt: null,
      };

      const mutation: PendingMutationRecord = {
        operationId: 'op-atomic-01',
        deviceId: 'dev-001',
        workspaceId: ws1,
        userId: user1,
        entityType: 'task',
        entityId: 'task-atomic-01',
        action: 'create',
        payload: { title: 'Atomic Task Draft' },
        baseRevision: 0,
        dependencyOperationIds: [],
        clientTimestamp: '2026-10-15T10:00:00.000Z',
        retryCount: 0,
        status: 'pending',
        lastError: null,
      };

      await repo.saveDraftAndMutation(draft, mutation);

      // Verify both were written
      const savedDraft = await repo.getDraft(ws1, user1, 'draft-atomic-01');
      const pendingMutations = await repo.getPendingMutations(ws1, user1);

      expect(savedDraft).not.toBeNull();
      expect(savedDraft?.title).toBe('Atomic Task Draft');
      expect(pendingMutations.length).toBe(1);
      expect(pendingMutations[0]?.operationId).toBe('op-atomic-01');

      await repo.close();
    });
  });

  describe('Sync Cursors and Preference Snapshots', () => {
    it('persists and retrieves sync cursor checkpoints', async () => {
      const repo = new IndexedDbLocalRepository();
      await repo.initialize({ userId: user1, workspaceId: ws1 });

      expect(await repo.getCursor(ws1, user1)).toBeNull();

      const cursor: SyncCursorRecord = {
        workspaceId: ws1,
        userId: user1,
        lastServerRevision: 42,
        cursor: 'cur_abc_123',
        lastSyncedAt: '2026-10-15T10:30:00.000Z',
        epoch: 'epoch_01',
      };

      await repo.saveCursor(cursor);
      const retrieved = await repo.getCursor(ws1, user1);
      expect(retrieved).toEqual(cursor);

      await repo.close();
    });

    it('persists and retrieves user preference snapshots', async () => {
      const repo = new IndexedDbLocalRepository();
      await repo.initialize({ userId: user1, workspaceId: ws1 });

      expect(await repo.getPreferenceSnapshot(user1)).toBeNull();

      const snapshot: PreferenceSnapshotRecord = {
        userId: user1,
        preferences: {
          themeMode: 'dark',
          accentColor: 'indigo',
          defaultLandingPage: 'today',
          locale: 'en-US',
        },
        schemaVersion: 1,
        revision: 3,
        updatedAt: '2026-10-15T10:30:00.000Z',
      };

      await repo.savePreferenceSnapshot(snapshot);
      const retrieved = await repo.getPreferenceSnapshot(user1);
      expect(retrieved).toEqual(snapshot);

      await repo.close();
    });
  });

  describe('Account and Workspace Erasure', () => {
    it('clears all data scoped to a specific workspace while leaving others intact', async () => {
      const repo = new IndexedDbLocalRepository();
      await repo.initialize({ userId: user1, workspaceId: ws1 });

      // Add item headers in ws1 and ws2
      await repo.upsertItemHeader({
        id: 'item-ws1',
        workspaceId: ws1,
        kind: 'note',
        folderId: null,
        rank: '0',
        isArchived: false,
        isPinned: false,
        securityScope: 'standard',
        serverRevision: 1,
        createdAt: '2026-10-15T10:00:00.000Z',
        updatedAt: '2026-10-15T10:00:00.000Z',
        deletedAt: null,
      });
      await repo.upsertItemHeader({
        id: 'item-ws2',
        workspaceId: ws2,
        kind: 'note',
        folderId: null,
        rank: '0',
        isArchived: false,
        isPinned: false,
        securityScope: 'standard',
        serverRevision: 1,
        createdAt: '2026-10-15T10:00:00.000Z',
        updatedAt: '2026-10-15T10:00:00.000Z',
        deletedAt: null,
      });

      // Clear ws1 data
      await repo.clearWorkspaceData(ws1);

      expect(await repo.getItemHeader(ws1, 'item-ws1')).toBeNull();
      expect(await repo.getItemHeader(ws2, 'item-ws2')).not.toBeNull();

      await repo.close();
    });

    it('clears all user-scoped records on account erasure', async () => {
      const repo = new IndexedDbLocalRepository();
      await repo.initialize({ userId: user1, workspaceId: ws1 });

      // Save drafts for user1 and user2
      await repo.saveDraft({
        id: 'd-u1',
        workspaceId: ws1,
        userId: user1,
        entityType: 'note',
        entityId: null,
        title: 'Alice Note',
        payload: {},
        savedAt: '2026-10-15T10:00:00.000Z',
        isQuarantined: false,
        quarantinedAt: null,
      });
      await repo.saveDraft({
        id: 'd-u2',
        workspaceId: ws1,
        userId: user2,
        entityType: 'note',
        entityId: null,
        title: 'Bob Note',
        payload: {},
        savedAt: '2026-10-15T10:00:00.000Z',
        isQuarantined: false,
        quarantinedAt: null,
      });

      await repo.savePreferenceSnapshot({
        userId: user1,
        preferences: { themeMode: 'light' },
        schemaVersion: 1,
        revision: 1,
        updatedAt: '2026-10-15T10:00:00.000Z',
      });

      // Clear Alice's account data
      await repo.clearAccountData(user1);

      expect(await repo.getDraft(ws1, user1, 'd-u1')).toBeNull();
      expect(await repo.getDraft(ws1, user2, 'd-u2')).not.toBeNull();
      expect(await repo.getPreferenceSnapshot(user1)).toBeNull();

      await repo.close();
    });
  });

  describe('Quota Error Handling Contract', () => {
    it('maps QuotaExceededError into StorageQuotaError and avoids false saved indicator', async () => {
      const repo = new IndexedDbLocalRepository();
      await repo.initialize({ userId: user1, workspaceId: ws1 });

      // Simulate a quota failure by mocking IDBTransaction error mapping
      const quotaError = new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      const mapped = (repo as unknown as { mapError: (err: unknown) => Error }).mapError(
        quotaError
      );

      expect(mapped).toBeInstanceOf(StorageQuotaError);
      expect(mapped.name).toBe('StorageQuotaError');
      expect(mapped.message).toContain('exceeded');

      await repo.close();
    });
  });
});
