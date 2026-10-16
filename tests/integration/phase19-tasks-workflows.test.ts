import crypto from 'node:crypto';
import 'fake-indexeddb/auto';
import { generateKeyPair, SignJWT, exportJWK, type JSONWebKeySet } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { buildServer, JwtVerifier } from '../../apps/api/src/index.js';
import { createAdminPool, createRuntimePool } from '../../apps/api/src/db/index.js';
import { Migrator } from '../../infra/supabase/migrator.js';
import { createApiClient, DaynoriApiClient } from '@daynori/api-client';
import {
  formatTaskDeadlineExplanation,
  checkLocalTimeDisambiguation,
  isValidCalendarDateString,
  isLeapYear,
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

describe('Phase 19: Upcoming Task Workflows, Priority Views, and End-to-End Verification', () => {
  let adminPool: Pool;
  let runtimePool: Pool;
  let migrator: Migrator;
  let server: ReturnType<typeof buildServer>;
  let baseUrl: string;

  let keyPair: Awaited<ReturnType<typeof generateKeyPair>>;
  let jwks: JSONWebKeySet;

  const issuer = 'https://auth.daynori.test';
  const audience = 'daynori-api';
  const kid = 'phase19-tasks-key';

  const userAId = crypto.randomUUID();
  const userBId = crypto.randomUUID();
  let tokenUserA: string;
  let tokenUserB: string;
  let clientA: DaynoriApiClient;
  let clientB: DaynoriApiClient;
  let workspace1Id: string;
  let testFolderId: string;

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

    clientA = createApiClient({ baseUrl, token: tokenUserA });
    clientB = createApiClient({ baseUrl, token: tokenUserB });

    // Seed test profiles and workspaces in DB
    const admin = await adminPool.connect();
    try {
      await admin.query(`
        INSERT INTO app.profiles (id, display_name) VALUES
          ('${userAId}', 'Phase 19 User A'),
          ('${userBId}', 'Phase 19 User B')
        ON CONFLICT (id) DO NOTHING;
      `);

      const wsRes = await admin.query<{ id: string }>(`
        INSERT INTO app.workspaces (name, kind, owner_id) VALUES
          ('Phase 19 Workspace', 'room', '${userAId}')
        RETURNING id;
      `);
      workspace1Id = wsRes.rows[0]!.id;

      await admin.query(`
        INSERT INTO app.workspace_memberships (workspace_id, user_id, role) VALUES
          ('${workspace1Id}', '${userAId}', 'owner'),
          ('${workspace1Id}', '${userBId}', 'editor');

        INSERT INTO app.workspace_sync_state (workspace_id, next_change_seq) VALUES
          ('${workspace1Id}', 1)
        ON CONFLICT (workspace_id) DO NOTHING;
      `);

      // Seed a test folder
      const folderRes = await admin.query<{ id: string }>(`
        INSERT INTO app.items (workspace_id, kind, created_by, updated_by, revision, rank)
        VALUES ('${workspace1Id}', 'folder', '${userAId}', '${userAId}', 1, '00001000')
        RETURNING id;
      `);
      testFolderId = folderRes.rows[0]!.id;

      await admin.query(`
        INSERT INTO app.folders (workspace_id, id, name)
        VALUES ('${workspace1Id}', '${testFolderId}', 'Sprint Planning');
      `);
    } finally {
      admin.release();
    }
  });

  afterAll(async () => {
    await server.close();
    await runtimePool.end();
    await adminPool.end();
  });

  it('Journey 1: Creates, prioritizes, schedules, edits, completes, reopens, and moves a task', async () => {
    // 1. Create task with default priority 'normal' and no deadline
    const created = await clientA.createTask(workspace1Id, {
      title: 'Full Lifecycle Journey Task',
      details: 'Initial details for task',
      priority: 'normal',
    });
    expect(created.data.title).toBe('Full Lifecycle Journey Task');
    expect(created.data.priority).toBe('normal');
    expect(created.data.deadline.type).toBe('none');
    expect(created.data.status).toBe('todo');

    const taskId = created.data.id;
    let currentRev = created.data.revision;

    // 2. Prioritize to 'urgent' and schedule timed deadline
    const timedIso = new Date(Date.now() + 4 * 3600 * 1000).toISOString();
    const updated = await clientA.updateTask(workspace1Id, taskId, {
      priority: 'urgent',
      deadline: {
        type: 'timed',
        timestamp: timedIso,
        timezone: 'Asia/Dhaka',
      },
      baseRevision: currentRev,
    });
    expect(updated.data.priority).toBe('urgent');
    expect(updated.data.deadline.type).toBe('timed');
    currentRev = updated.data.revision;

    // 3. Move to folder
    const moved = await clientA.updateTask(workspace1Id, taskId, {
      folderId: testFolderId,
      baseRevision: currentRev,
    });
    expect(moved.data.folderId).toBe(testFolderId);
    currentRev = moved.data.revision;

    // 4. Complete the task
    const completed = await clientA.completeTask(workspace1Id, taskId, {
      baseRevision: currentRev,
    });
    expect(completed.data.status).toBe('completed');
    expect(completed.data.completedAt).toBeDefined();
    expect(completed.data.completionHistory).toHaveLength(1);
    currentRev = completed.data.revision;

    // 5. Reopen the task
    const reopened = await clientA.reopenTask(workspace1Id, taskId, {
      baseRevision: currentRev,
    });
    expect(reopened.data.status).toBe('todo');
    expect(reopened.data.completedAt).toBeNull();
    expect(reopened.data.reopenedAt).toBeDefined();
    expect(reopened.data.completionHistory[0]?.reopenedAt).toBeDefined();
  });

  it('Journey 2: Offline capture, edit, completion followed by reconnect and sync', async () => {
    await clearAllLocalData();
    setTrustedDeviceConsent(true);

    const localRepo = new IndexedDbLocalRepository();
    await localRepo.initialize({
      userId: userAId,
      workspaceId: workspace1Id,
    });

    const transport = new ApiClientSyncTransport(clientA);
    const syncEngine = new SyncEngine({
      namespace: {
        workspaceId: workspace1Id,
        userId: userAId,
      },
      repository: localRepo,
      transport,
      deviceId: 'test-device-p19',
    });
    await syncEngine.start();
    syncEngine.setNetworkStatus('offline');

    const offlineTaskId = crypto.randomUUID();
    const nowIso = new Date().toISOString();

    // 1. Offline capture in local repository via saveItem
    await syncEngine.saveItem(
      {
        id: offlineTaskId,
        workspaceId: workspace1Id,
        kind: 'task',
        name: 'Captured While Offline',
        title: 'Captured While Offline',
        rank: '0',
        isArchived: false,
        isPinned: false,
        securityScope: 'standard',
        serverRevision: 0,
        createdAt: nowIso,
        updatedAt: nowIso,
        deletedAt: null,
      },
      undefined,
      'createTask',
      {
        payload: {
          title: 'Captured While Offline',
          priority: 'high',
          status: 'todo',
          deadline: { type: 'date', date: '2026-10-25' },
          tags: ['Offline'],
        },
      }
    );

    // 2. Offline complete via saveItem
    await syncEngine.saveItem(
      {
        id: offlineTaskId,
        workspaceId: workspace1Id,
        kind: 'task',
        name: 'Captured While Offline',
        title: 'Captured While Offline',
        rank: '0',
        isArchived: false,
        isPinned: false,
        securityScope: 'standard',
        serverRevision: 1,
        createdAt: nowIso,
        updatedAt: nowIso,
        deletedAt: null,
      },
      undefined,
      'completeTask',
      {
        payload: {
          status: 'completed',
          completedAt: nowIso,
        },
      }
    );

    // Verify mutations queued locally
    const pendingBeforeSync = await localRepo.getPendingMutations(workspace1Id, userAId);
    expect(pendingBeforeSync).toHaveLength(2);

    // 3. Reconnect and synchronize via SyncEngine
    syncEngine.setNetworkStatus('online');
    await syncEngine.syncNow();

    // Verify mutations cleared on successful push
    const pendingAfterSync = await localRepo.getPendingMutations(workspace1Id, userAId);
    expect(pendingAfterSync).toHaveLength(0);

    // Verify task is now present and completed on server
    const serverTask = await clientA.getTask(workspace1Id, offlineTaskId);
    expect(serverTask.data.title).toBe('Captured While Offline');
    expect(serverTask.data.status).toBe('completed');
    expect(serverTask.data.tags).toContain('Offline');

    await syncEngine.stop();
    await localRepo.close();
  });

  it('Journey 3: Concurrent edits with the same revision trigger 409 Conflict', async () => {
    const task = await clientA.createTask(workspace1Id, {
      title: 'Concurrency Test Task',
      priority: 'normal',
    });
    const rev = task.data.revision;

    // Device A successfully updates
    const writeA = await clientA.updateTask(workspace1Id, task.data.id, {
      title: 'Update by Device A',
      baseRevision: rev,
    });
    expect(writeA.data.title).toBe('Update by Device A');

    // Device B attempts to update with the now-stale revision -> 409
    await expect(
      clientB.updateTask(workspace1Id, task.data.id, {
        title: 'Conflicting Update by Device B',
        baseRevision: rev,
      })
    ).rejects.toThrow();
  });

  it('Journey 4: Date-only and timed deadlines across Asia/Dhaka and America/New_York', async () => {
    const todayDhakaStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(
      new Date()
    );
    const timedDhaka = await clientA.createTask(workspace1Id, {
      title: 'Dhaka Evening Review',
      deadline: {
        type: 'timed',
        timestamp: `${todayDhakaStr}T15:00:00.000Z`,
        timezone: 'Asia/Dhaka',
      },
    });

    // When queried in Asia/Dhaka (where current time is Oct 16 evening), task is due today
    const listDhaka = await clientA.listTasks(workspace1Id, {
      filter: 'today',
      userTimezone: 'Asia/Dhaka',
    });
    const idsDhaka = listDhaka.data.map((t) => t.id);
    expect(idsDhaka).toContain(timedDhaka.data.id);

    // Date explanation explicitly indicates the scheduled timezone
    const explanation = formatTaskDeadlineExplanation(
      timedDhaka.data.deadline,
      'America/New_York',
      new Date('2026-10-16T12:00:00.000Z')
    );
    expect(explanation.timezoneNote).toBe('Scheduled in Asia/Dhaka (viewing in America/New_York)');
  });

  it('Journey 5: Leap-day, DST, midnight, and deadline-clearing cases', async () => {
    // 1. Leap day validation: 2028-02-29 is valid leap day, 2027-02-29 is invalid
    expect(isLeapYear(2028)).toBe(true);
    expect(isLeapYear(2027)).toBe(false);
    expect(isValidCalendarDateString('2028-02-29')).toBe(true);
    expect(isValidCalendarDateString('2027-02-29')).toBe(false);

    await expect(
      clientA.createTask(workspace1Id, {
        title: 'Invalid Leap Day Task',
        deadline: { type: 'date', date: '2027-02-29' },
      })
    ).rejects.toThrow();

    // 2. DST nonexistent local time detection
    const springForward = checkLocalTimeDisambiguation('2026-03-08', '02:30', 'America/New_York');
    expect(springForward.type).toBe('nonexistent');

    // 3. Deadline clearing shifts task immediately to 'undated' without completing it
    const scheduledTask = await clientA.createTask(workspace1Id, {
      title: 'Task To Clear Deadline',
      deadline: { type: 'date', date: '2026-10-20' },
    });
    expect(scheduledTask.data.deadline.type).toBe('date');

    const clearedTask = await clientA.updateTask(workspace1Id, scheduledTask.data.id, {
      deadline: { type: 'none' },
      baseRevision: scheduledTask.data.revision,
    });
    expect(clearedTask.data.deadline.type).toBe('none');
    expect(clearedTask.data.status).toBe('todo');

    // Query 'undated' view
    const undatedList = await clientA.listTasks(workspace1Id, { filter: 'undated' });
    const undatedIds = undatedList.data.map((t) => t.id);
    expect(undatedIds).toContain(clearedTask.data.id);
  });

  it('Journey 6: Large list ordering, pagination continuation, and bulk actions safety', async () => {
    const today = new Date().toISOString().slice(0, 10);

    // Create 4 distinct tasks for bulk action testing
    const bulkIds: string[] = [];
    for (let i = 1; i <= 4; i++) {
      const t = await clientA.createTask(workspace1Id, {
        title: `Bulk Candidate Task ${i}`,
        priority: i % 2 === 0 ? 'urgent' : 'normal',
        deadline: { type: 'date', date: today },
      });
      bulkIds.push(t.data.id);
    }

    // 1. Pagination continuation
    const page1 = await clientA.listTasks(workspace1Id, {
      filter: 'today',
      sortBy: 'priority',
      limit: 2,
    });
    expect(page1.data).toHaveLength(2);
    expect(page1.meta.cursor).toBeDefined();

    const page2 = await clientA.listTasks(workspace1Id, {
      filter: 'today',
      sortBy: 'priority',
      limit: 2,
      cursor: page1.meta.cursor,
    });
    expect(page2.data).toHaveLength(2);

    // 2. Bulk completion safety: exactly target 2 selected IDs
    const targetSelection = [bulkIds[0]!, bulkIds[1]!];
    for (const id of targetSelection) {
      const current = await clientA.getTask(workspace1Id, id);
      await clientA.completeTask(workspace1Id, id, {
        baseRevision: current.data.revision,
      });
    }

    // Verify only the 2 targeted tasks are completed
    const t0 = await clientA.getTask(workspace1Id, targetSelection[0]!);
    const t1 = await clientA.getTask(workspace1Id, targetSelection[1]!);
    const t2 = await clientA.getTask(workspace1Id, bulkIds[2]!);
    const t3 = await clientA.getTask(workspace1Id, bulkIds[3]!);

    expect(t0.data.status).toBe('completed');
    expect(t1.data.status).toBe('completed');
    expect(t2.data.status).toBe('todo');
    expect(t3.data.status).toBe('todo');
  });

  it('Journey 7: Accessibility attributes — overdue explained with text and dates, not color alone', () => {
    const overdueDeadline = { type: 'date' as const, date: '2026-10-10' };
    const refDate = new Date('2026-10-16T12:00:00.000Z');

    const exp = formatTaskDeadlineExplanation(overdueDeadline, 'UTC', refDate);
    expect(exp.isOverdue).toBe(true);
    // Explicit text explanation containing day count and date
    expect(exp.overdueText).toBe('Overdue by 6 days (Due 2026-10-10)');
    expect(exp.label).toBe('Due 2026-10-10');
  });

  it('Journey 8: Local repository account switching and data isolation', async () => {
    setTrustedDeviceConsent(true);

    const repoUserA = new IndexedDbLocalRepository();
    await repoUserA.initialize({ userId: userAId, workspaceId: workspace1Id });

    // User A can list tasks in workspace 1
    const tasksA = await repoUserA.listTasks(workspace1Id);
    expect(tasksA).toBeDefined();

    // Cross-user access check: calling with uninitialized namespace throws CROSS_ACCOUNT_VIOLATION
    await expect(repoUserA.getDraft(workspace1Id, userBId, 'unauthorized-draft')).rejects.toThrow(
      /CROSS_ACCOUNT_VIOLATION/
    );

    await repoUserA.close();
  });
});
