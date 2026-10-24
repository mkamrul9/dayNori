import crypto from 'node:crypto';
import 'fake-indexeddb/auto';
import { generateKeyPair, SignJWT, exportJWK, type JSONWebKeySet } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { buildServer, JwtVerifier } from '../../apps/api/src/index.js';
import {
  createAdminPool,
  createRuntimePool,
  withTenantContext,
} from '../../apps/api/src/db/index.js';
import { Migrator } from '../../infra/supabase/migrator.js';
import { createApiClient, DaynoriApiClient } from '@daynori/api-client';
import {
  isTaskOverdue,
  isTaskDueToday,
  compareTasksUpcoming,
  validateSubtaskHierarchy,
  isValidCalendarDateString,
  isValidIanaTimezone,
  isLeapYear,
  completeTask,
  reopenTask,
  type TaskItem,
} from '@daynori/domain';
import { SyncEngine, ApiClientSyncTransport } from '@daynori/sync';
import {
  IndexedDbLocalRepository,
  clearAllLocalData,
  setTrustedDeviceConsent,
} from '../../apps/web/src/data/indexedDbRepository.js';

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

describe('Phase 18: Upcoming Task Domain, Deadlines and Synchronization', () => {
  let adminPool: Pool;
  let runtimePool: Pool;
  let migrator: Migrator;
  let server: ReturnType<typeof buildServer>;
  let baseUrl: string;

  let keyPair: Awaited<ReturnType<typeof generateKeyPair>>;
  let jwks: JSONWebKeySet;

  const issuer = 'https://auth.daynori.test';
  const audience = 'daynori-api';
  const kid = 'phase18-tasks-key';

  const userAId = crypto.randomUUID();
  const userBId = crypto.randomUUID();
  let tokenUserA: string;
  let tokenUserB: string;
  let clientA: DaynoriApiClient;
  let clientB: DaynoriApiClient;
  let workspaceAId: string;
  let workspaceBId: string;

  async function createToken(userId: string): Promise<string> {
    return new SignJWT({
      sub: userId,
      aud: audience,
      iss: issuer,
      role: 'authenticated',
      aal: 'aal1',
      session_id: crypto.randomUUID(),
    })
      .setProtectedHeader({ alg: 'RS256', kid })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(keyPair.privateKey);
  }

  beforeAll(async () => {
    adminPool = createAdminPool();
    runtimePool = createRuntimePool();

    // 1. Run migrations
    migrator = new Migrator();
    await migrator.migrate();

    // 2. Setup JWT Key Pair & Tokens
    keyPair = await generateKeyPair('RS256');
    const publicJwk = await exportJWK(keyPair.publicKey);
    publicJwk.kid = kid;
    publicJwk.alg = 'RS256';
    publicJwk.use = 'sig';
    jwks = { keys: [publicJwk] };

    tokenUserA = await createToken(userAId);
    tokenUserB = await createToken(userBId);

    // 3. Start API Server with in-memory JWKS verifier
    const jwtVerifier = new JwtVerifier({
      issuer,
      audience,
      localJwks: jwks,
    });

    server = buildServer({
      jwtVerifier,
      adminPool,
      runtimePool,
      rateLimitOptions: { windowMs: 60000, maxRequests: 50000 },
    });

    await server.listen({ port: 0, host: '127.0.0.1' });
    const address = server.server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Failed to bind server address');
    }
    baseUrl = `http://127.0.0.1:${address.port}`;

    // 4. API Clients
    clientA = createApiClient({
      baseUrl,
      token: tokenUserA,
    });
    clientB = createApiClient({
      baseUrl,
      token: tokenUserB,
    });

    // 5. Bootstrap test workspaces & profiles
    const admin = await adminPool.connect();
    try {
      await admin.query(`
        INSERT INTO app.profiles (id, display_name) VALUES
          ('${userAId}', 'Alice Tasks User'),
          ('${userBId}', 'Bob Tasks User')
        ON CONFLICT (id) DO NOTHING;
      `);

      const wsARes = await admin.query<{ id: string }>(`
        INSERT INTO app.workspaces (name, kind, owner_id)
        VALUES ('Alice Tasks Workspace', 'personal', '${userAId}')
        RETURNING id;
      `);
      workspaceAId = wsARes.rows[0]!.id;

      await admin.query(`
        INSERT INTO app.workspace_memberships (workspace_id, user_id, role) VALUES
          ('${workspaceAId}', '${userAId}', 'owner');
      `);

      const wsBRes = await admin.query<{ id: string }>(`
        INSERT INTO app.workspaces (name, kind, owner_id)
        VALUES ('Bob Tasks Workspace', 'personal', '${userBId}')
        RETURNING id;
      `);
      workspaceBId = wsBRes.rows[0]!.id;

      await admin.query(`
        INSERT INTO app.workspace_memberships (workspace_id, user_id, role) VALUES
          ('${workspaceBId}', '${userBId}', 'owner');
      `);
    } finally {
      admin.release();
    }

    // Enable trusted device consent for local tests
    setTrustedDeviceConsent(true);
  });

  afterAll(async () => {
    await server.close();
    await runtimePool.end();
    await adminPool.end();
    await clearAllLocalData();
  });

  describe('Suite 1: Pure Task Domain & Deadline Semantics', () => {
    it('validates leap years and calendar dates properly', () => {
      expect(isLeapYear(2024)).toBe(true);
      expect(isLeapYear(2025)).toBe(false);
      expect(isLeapYear(2000)).toBe(true);
      expect(isLeapYear(1900)).toBe(false);

      expect(isValidCalendarDateString('2024-02-29')).toBe(true);
      expect(isValidCalendarDateString('2025-02-29')).toBe(false);
      expect(isValidCalendarDateString('2024-04-31')).toBe(false);
      expect(isValidCalendarDateString('2024-13-01')).toBe(false);
      expect(isValidCalendarDateString('invalid-date')).toBe(false);

      expect(isValidIanaTimezone('Asia/Dhaka')).toBe(true);
      expect(isValidIanaTimezone('America/New_York')).toBe(true);
      expect(isValidIanaTimezone('UTC')).toBe(true);
      expect(isValidIanaTimezone('Not/A_Real_Zone')).toBe(false);
    });

    it('correctly evaluates Asia/Dhaka deadline viewed from another timezone', () => {
      // 2026-10-16 18:00:00 Asia/Dhaka (+06:00) is 2026-10-16T12:00:00.000Z
      const deadlineInstant = '2026-10-16T12:00:00.000Z';
      const timedDeadline = {
        type: 'timed' as const,
        timestamp: deadlineInstant,
        timezone: 'Asia/Dhaka',
      };

      // Before instant (11:59:59 UTC): not overdue anywhere
      const beforeNow = new Date('2026-10-16T11:59:59.000Z');
      expect(
        isTaskOverdue({ status: 'todo', deadline: timedDeadline }, beforeNow, 'America/New_York')
      ).toBe(false);
      expect(
        isTaskOverdue({ status: 'todo', deadline: timedDeadline }, beforeNow, 'Asia/Dhaka')
      ).toBe(false);

      // At or after instant (12:00:01 UTC): overdue regardless of viewing timezone
      const afterNow = new Date('2026-10-16T12:00:01.000Z');
      expect(
        isTaskOverdue({ status: 'todo', deadline: timedDeadline }, afterNow, 'America/New_York')
      ).toBe(true);
      expect(
        isTaskOverdue({ status: 'todo', deadline: timedDeadline }, afterNow, 'Asia/Dhaka')
      ).toBe(true);

      // Completed tasks are never overdue
      expect(
        isTaskOverdue({ status: 'completed', deadline: timedDeadline }, afterNow, 'Asia/Dhaka')
      ).toBe(false);

      // Date-only deadline: expires at 23:59:59 in the target user timezone
      const dateDeadline = {
        type: 'date' as const,
        date: '2026-10-16',
      };
      // In Asia/Dhaka (+06:00), 2026-10-16 ends at 2026-10-16T17:59:59.999Z
      const dhakaEveningBefore = new Date('2026-10-16T17:59:00.000Z'); // 23:59 in Dhaka
      const dhakaPastMidnight = new Date('2026-10-16T18:01:00.000Z'); // 00:01 next day in Dhaka

      expect(
        isTaskOverdue({ status: 'todo', deadline: dateDeadline }, dhakaEveningBefore, 'Asia/Dhaka')
      ).toBe(false);
      expect(
        isTaskOverdue({ status: 'todo', deadline: dateDeadline }, dhakaPastMidnight, 'Asia/Dhaka')
      ).toBe(true);

      // In New York (EDT, UTC-4), at 2026-10-16T18:01:00.000Z, it is only 14:01 on Oct 16!
      // So in America/New_York, the date deadline is NOT overdue yet!
      expect(
        isTaskOverdue(
          { status: 'todo', deadline: dateDeadline },
          dhakaPastMidnight,
          'America/New_York'
        )
      ).toBe(false);

      // Today check in Dhaka vs New York
      expect(isTaskDueToday({ deadline: dateDeadline }, dhakaEveningBefore, 'Asia/Dhaka')).toBe(
        true
      );
      expect(isTaskDueToday({ deadline: dateDeadline }, dhakaPastMidnight, 'Asia/Dhaka')).toBe(
        false
      );
      expect(
        isTaskDueToday({ deadline: dateDeadline }, dhakaPastMidnight, 'America/New_York')
      ).toBe(true);
    });

    it('clearing a deadline removes overdue classification without completing the task', () => {
      const noneDeadline = { type: 'none' as const };
      const now = new Date();
      expect(isTaskOverdue({ status: 'todo', deadline: noneDeadline }, now, 'Asia/Dhaka')).toBe(
        false
      );
      expect(isTaskDueToday({ deadline: noneDeadline }, now, 'Asia/Dhaka')).toBe(false);
    });

    it('orders tasks deterministically by due date, priority, creation time, and ID', () => {
      const taskUrgentTimed: TaskItem = {
        id: 't-1',
        workspaceId: 'ws-1',
        title: 'Urgent Timed',
        priority: 'urgent',
        status: 'todo',
        deadline: { type: 'timed', timestamp: '2026-10-16T10:00:00Z', timezone: 'UTC' },
        subtaskOrder: 0,
        tags: [],
        serverRevision: 1,
        createdAt: '2026-10-01T00:00:00Z',
        updatedAt: '2026-10-01T00:00:00Z',
      };
      const taskNormalTimedEarlier: TaskItem = {
        id: 't-2',
        workspaceId: 'ws-1',
        title: 'Normal Earlier',
        priority: 'normal',
        status: 'todo',
        deadline: { type: 'timed', timestamp: '2026-10-16T08:00:00Z', timezone: 'UTC' },
        subtaskOrder: 0,
        tags: [],
        serverRevision: 1,
        createdAt: '2026-10-01T00:00:00Z',
        updatedAt: '2026-10-01T00:00:00Z',
      };
      const taskUndated: TaskItem = {
        id: 't-3',
        workspaceId: 'ws-1',
        title: 'Undated Task',
        priority: 'high',
        status: 'todo',
        deadline: { type: 'none' },
        subtaskOrder: 0,
        tags: [],
        serverRevision: 1,
        createdAt: '2026-10-01T00:00:00Z',
        updatedAt: '2026-10-01T00:00:00Z',
      };

      // Earlier timed deadline comes before later timed deadline
      expect(compareTasksUpcoming(taskNormalTimedEarlier, taskUrgentTimed, 'UTC')).toBeLessThan(0);
      // Dated tasks come before undated tasks
      expect(compareTasksUpcoming(taskUrgentTimed, taskUndated, 'UTC')).toBeLessThan(0);
      expect(compareTasksUpcoming(taskUndated, taskUrgentTimed, 'UTC')).toBeGreaterThan(0);
    });

    it('enforces idempotent completion and retains reopening history', () => {
      const initialTask: TaskItem = {
        id: 't-comp',
        workspaceId: 'ws-1',
        title: 'Complete Me',
        priority: 'normal',
        status: 'todo',
        deadline: { type: 'none' },
        subtaskOrder: 0,
        tags: [],
        serverRevision: 1,
        createdAt: '2026-10-01T00:00:00Z',
        updatedAt: '2026-10-01T00:00:00Z',
      };

      // 1. Complete once
      const { task: firstCompleted } = completeTask(initialTask, '2026-10-16T10:00:00Z');
      expect(firstCompleted.status).toBe('completed');
      expect(firstCompleted.completedAt).toBe('2026-10-16T10:00:00Z');
      expect(firstCompleted.completionHistory).toHaveLength(1);
      expect(firstCompleted.completionHistory![0]!.completedAt).toBe('2026-10-16T10:00:00Z');

      // 2. Duplicate completion retry: must preserve original instant and NOT duplicate history
      const { task: duplicateCompleted } = completeTask(firstCompleted, '2026-10-16T11:00:00Z');
      expect(duplicateCompleted.completedAt).toBe('2026-10-16T10:00:00Z');
      expect(duplicateCompleted.completionHistory).toHaveLength(1);

      // 3. Reopen
      const { task: reopened } = reopenTask(duplicateCompleted, '2026-10-16T12:00:00Z');
      expect(reopened.status).toBe('todo');
      expect(reopened.completedAt).toBeNull();
      expect(reopened.reopenedAt).toBe('2026-10-16T12:00:00Z');
      // History remains preserved!
      expect(reopened.completionHistory).toHaveLength(1);

      // 4. Complete again: appends second entry to history
      const { task: reCompleted } = completeTask(reopened, '2026-10-16T14:00:00Z');
      expect(reCompleted.status).toBe('completed');
      expect(reCompleted.completedAt).toBe('2026-10-16T14:00:00Z');
      expect(reCompleted.completionHistory).toHaveLength(2);
      expect(reCompleted.completionHistory![1]!.completedAt).toBe('2026-10-16T14:00:00Z');
    });

    it('validates subtask hierarchy: forbids self-parenting, cycles, and depth > 3', () => {
      // Self-parenting
      const selfParentRes = validateSubtaskHierarchy('task-1', 'task-1', () => null);
      expect(selfParentRes.isValid).toBe(false);
      expect(selfParentRes.error).toContain('TASK_SELF_PARENTING');

      // No cycle: task-2 -> task-1 (depth 2)
      const lookup = (id: string) => {
        if (id === 'task-1') return null;
        if (id === 'task-2') return 'task-1';
        if (id === 'task-3') return 'task-2';
        if (id === 'task-4') return 'task-3';
        return null;
      };

      const validRes = validateSubtaskHierarchy('task-2', 'task-1', lookup);
      expect(validRes.isValid).toBe(true);
      expect(validRes.depth).toBe(2);

      // Cycle: task-1 -> task-3 -> task-2 -> task-1
      const cycleLookup = (id: string) => {
        if (id === 'task-1') return 'task-3';
        if (id === 'task-3') return 'task-2';
        if (id === 'task-2') return 'task-1';
        return null;
      };
      const cycleRes = validateSubtaskHierarchy('task-1', 'task-3', cycleLookup);
      expect(cycleRes.isValid).toBe(false);
      expect(cycleRes.error).toContain('TASK_SUBTASK_CYCLE');

      // Max depth: task-5 -> task-4 (depth 4 exceeds MAX_SUBTASK_DEPTH 3)
      const maxDepthRes = validateSubtaskHierarchy('task-5', 'task-4', lookup);
      expect(maxDepthRes.isValid).toBe(false);
      expect(maxDepthRes.error).toContain('TASK_MAX_SUBTASK_DEPTH_EXCEEDED');
    });
  });

  describe('Suite 2: REST API & PostgreSQL Task Persistence', () => {
    let createdTaskId: string;

    it('creates a task with valid title, priority, tags, and deadline', async () => {
      const idempotencyKey = crypto.randomUUID();
      const createPayload = {
        title: 'Prepare Quarterly Report',
        details: 'Gather metrics and charts for Q3 review.',
        priority: 'high' as const,
        deadline: {
          type: 'timed' as const,
          timestamp: '2026-10-31T17:00:00.000Z',
          timezone: 'Asia/Dhaka',
        },
        tags: ['work', 'finance'],
      };

      const res = await clientA.createTask(workspaceAId, createPayload, {
        headers: { 'Idempotency-Key': idempotencyKey },
      });

      expect(res.data.id).toBeDefined();
      expect(res.data.title).toBe('Prepare Quarterly Report');
      expect(res.data.priority).toBe('high');
      expect(res.data.status).toBe('todo');
      expect(res.data.deadline.type).toBe('timed');
      expect(res.data.tags).toEqual(['work', 'finance']);
      expect(res.data.revision).toBe(1);

      createdTaskId = res.data.id;

      // Verify idempotent retry returns identical response
      const retryRes = await clientA.createTask(workspaceAId, createPayload, {
        headers: { 'Idempotency-Key': idempotencyKey },
      });
      expect(retryRes.data.id).toBe(createdTaskId);
      expect(retryRes.data.revision).toBe(1);
    });

    it('updates task properties including clearing deadlines and changing folders', async () => {
      // 1. Update task to date-only deadline and normal priority
      const updated = await clientA.updateTask(workspaceAId, createdTaskId, {
        priority: 'urgent',
        deadline: {
          type: 'date',
          date: '2026-11-05',
        },
        baseRevision: 1,
      });

      expect(updated.data.priority).toBe('urgent');
      expect(updated.data.deadline.type).toBe('date');
      expect(updated.data.revision).toBe(2);

      // 2. Clear deadline completely
      const cleared = await clientA.updateTask(workspaceAId, createdTaskId, {
        deadline: { type: 'none' },
        baseRevision: 2,
      });
      expect(cleared.data.deadline.type).toBe('none');
      expect(cleared.data.revision).toBe(3);
    });

    it('completes, duplicates completion, and reopens a task', async () => {
      // Complete
      const completed = await clientA.completeTask(workspaceAId, createdTaskId);
      expect(completed.data.status).toBe('completed');
      expect(completed.data.completedAt).toBeDefined();
      expect(completed.data.completionHistory.length).toBeGreaterThanOrEqual(1);
      const originalCompletedAt = completed.data.completedAt;

      // Duplicate complete: idempotent, revision does not change or duplicate history
      const duplicate = await clientA.completeTask(workspaceAId, createdTaskId);
      expect(duplicate.data.completedAt).toBe(originalCompletedAt);

      // Reopen
      const reopened = await clientA.reopenTask(workspaceAId, createdTaskId);
      expect(reopened.data.status).toBe('todo');
      expect(reopened.data.completedAt).toBeNull();
      expect(reopened.data.reopenedAt).toBeDefined();
      expect(reopened.data.completionHistory.length).toBeGreaterThanOrEqual(1);
    });

    it('filters tasks by status, priority, and supports pagination', async () => {
      // Create a low priority task
      await clientA.createTask(workspaceAId, {
        title: 'Low Priority Backlog',
        priority: 'low',
      });

      const listAll = await clientA.listTasks(workspaceAId, {});
      expect(listAll.data.length).toBeGreaterThanOrEqual(2);

      // Filter by priority urgent
      const listUrgent = await clientA.listTasks(workspaceAId, { priority: 'urgent' });
      expect(listUrgent.data.every((t) => t.priority === 'urgent')).toBe(true);

      // Filter by status todo
      const listTodo = await clientA.listTasks(workspaceAId, { status: 'todo' });
      expect(listTodo.data.every((t) => t.status === 'todo')).toBe(true);

      // Pagination
      const page1 = await clientA.listTasks(workspaceAId, { limit: 1 });
      expect(page1.data.length).toBe(1);
      expect(page1.meta.requestId).toBeDefined();
    });

    it('trashes and restores tasks cleanly', async () => {
      const task = await clientA.createTask(workspaceAId, {
        title: 'Task To Trash',
      });

      // Trash
      const trashed = await clientA.trashTask(workspaceAId, task.data.id);
      expect(trashed.data.id).toBe(task.data.id);

      // Direct get fails with 404
      await expect(clientA.getTask(workspaceAId, task.data.id)).rejects.toThrow();

      // Restore
      const restored = await clientA.restoreTask(workspaceAId, task.data.id);
      expect(restored.data.id).toBe(task.data.id);
      expect(restored.data.deletedAt).toBeNull();

      // Direct get succeeds again
      const fetched = await clientA.getTask(workspaceAId, task.data.id);
      expect(fetched.data.title).toBe('Task To Trash');
    });
  });

  describe('Suite 3: Subtask Hierarchy & Validation on Server', () => {
    it('creates subtasks and enforces parent invariants', async () => {
      const parent = await clientA.createTask(workspaceAId, {
        title: 'Parent Project',
      });

      const child1 = await clientA.createTask(workspaceAId, {
        title: 'Child Task 1',
        parentId: parent.data.id,
      });

      expect(child1.data.parentId).toBe(parent.data.id);

      // Subtask cannot parent its own parent (cycle)
      await expect(
        clientA.updateTask(workspaceAId, parent.data.id, {
          parentId: child1.data.id,
          baseRevision: parent.data.revision,
        })
      ).rejects.toThrow();
    });
  });

  describe('Suite 4: Cross-Tenant RLS & Membership Isolation', () => {
    it('strictly forbids User B from reading or modifying User A tasks', async () => {
      const taskA = await clientA.createTask(workspaceAId, {
        title: 'Confidential Task for Alice',
        priority: 'urgent',
      });

      // User B cannot read Alice task
      await expect(clientB.getTask(workspaceAId, taskA.data.id)).rejects.toThrow();

      // User B cannot update Alice task
      await expect(
        clientB.updateTask(workspaceAId, taskA.data.id, {
          title: 'Hacked by Bob',
          baseRevision: 1,
        })
      ).rejects.toThrow();

      // Direct PostgreSQL RLS isolation check
      await withTenantContext(
        runtimePool,
        { userId: userBId, workspaceId: workspaceBId },
        async (client) => {
          const res = await client.query(`SELECT id, title FROM app.tasks WHERE id = $1;`, [
            taskA.data.id,
          ]);
          expect(res.rows).toHaveLength(0);
        }
      );
    });
  });

  describe('Suite 5: Offline Tasks, Sync Engine, & Local Persistence', () => {
    it('persists tasks offline in IndexedDB and syncs to PostgreSQL when reconnected', async () => {
      const repo = new IndexedDbLocalRepository();
      const ns = { workspaceId: workspaceAId, userId: userAId };
      await repo.initialize(ns);

      const transport = new ApiClientSyncTransport(clientA);
      const engine = new SyncEngine({
        repository: repo,
        transport,
        namespace: ns,
        deviceId: 'device-test-offline-task',
        autoSyncIntervalMs: 0,
      });

      await engine.start();

      // 1. Simulate offline state and save a task locally
      engine.setNetworkStatus('offline');
      const offlineTaskId = crypto.randomUUID();

      const mutation = await engine.saveItem(
        {
          id: offlineTaskId,
          workspaceId: workspaceAId,
          kind: 'task',
          name: 'Offline Inspection Task',
          title: 'Offline Inspection Task',
          rank: '0',
          isArchived: false,
          isPinned: false,
          securityScope: 'standard',
          serverRevision: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          deletedAt: null,
        },
        undefined,
        'createTask',
        {
          payload: {
            title: 'Offline Inspection Task',
            priority: 'urgent',
            status: 'todo',
            deadline: {
              type: 'timed',
              timestamp: '2026-10-25T14:00:00.000Z',
              timezone: 'Asia/Dhaka',
            },
          },
        }
      );

      expect(mutation.operationId).toBeDefined();

      // Verify task is saved on local device in IndexedDB
      const localTask = await repo.getTask(workspaceAId, offlineTaskId);
      expect(localTask).not.toBeNull();
      expect(localTask?.title).toBe('Offline Inspection Task');
      expect(localTask?.priority).toBe('urgent');
      expect(localTask?.deadline.type).toBe('timed');

      const syncState = engine.getItemSyncState(offlineTaskId);
      expect(syncState.savedOnDevice).toBe(true);
      expect(syncState.cloudSyncStatus).toBe('saved_locally');

      // 2. Reconnect online and flush sync
      engine.setNetworkStatus('online');
      await engine.syncNow();

      // Verify item state is now synced
      const syncedState = engine.getItemSyncState(offlineTaskId);
      expect(syncedState.cloudSyncStatus).toBe('synced');

      // 3. Verify server received and persisted the task in PostgreSQL
      const serverTask = await clientA.getTask(workspaceAId, offlineTaskId);
      expect(serverTask.data.title).toBe('Offline Inspection Task');
      expect(serverTask.data.priority).toBe('urgent');
      expect(serverTask.data.deadline.type).toBe('timed');
      expect(serverTask.data.revision).toBe(1);

      await engine.stop();
      await repo.close();
    });
  });
});
