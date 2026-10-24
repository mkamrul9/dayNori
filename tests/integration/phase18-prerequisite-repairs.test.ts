import crypto from 'node:crypto';
import 'fake-indexeddb/auto';
import { generateKeyPair, SignJWT, exportJWK, type JSONWebKeySet } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { buildServer, JwtVerifier } from '../../apps/api/src/index.js';
import { createAdminPool, createRuntimePool } from '../../apps/api/src/db/index.js';
import { Migrator } from '../../infra/supabase/migrator.js';
import { createApiClient, DaynoriApiClient } from '@daynori/api-client';

describe('Phase 18 Prerequisite Repairs: Task Query Safety, Concurrency, and Hierarchy', () => {
  let adminPool: Pool;
  let runtimePool: Pool;
  let migrator: Migrator;
  let server: ReturnType<typeof buildServer>;
  let baseUrl: string;

  let keyPair: Awaited<ReturnType<typeof generateKeyPair>>;
  let jwks: JSONWebKeySet;

  const issuer = 'https://auth.daynori.test';
  const audience = 'daynori-api';
  const kid = 'phase18-repairs-key';

  const userAId = crypto.randomUUID();
  let tokenUserA: string;
  let clientA: DaynoriApiClient;
  let workspace1Id: string;
  let workspace2Id: string;

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

    migrator = new Migrator();
    await migrator.migrate();

    keyPair = await generateKeyPair('RS256');
    const publicJwk = await exportJWK(keyPair.publicKey);
    publicJwk.kid = kid;
    publicJwk.alg = 'RS256';
    publicJwk.use = 'sig';
    jwks = { keys: [publicJwk] };

    tokenUserA = await createToken(userAId);

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

    clientA = createApiClient({
      baseUrl,
      token: tokenUserA,
    });

    const admin = await adminPool.connect();
    try {
      await admin.query(`
        INSERT INTO app.profiles (id, display_name) VALUES
          ('${userAId}', 'Repairs Test User')
        ON CONFLICT (id) DO NOTHING;
      `);

      const ws1Res = await admin.query<{ id: string }>(`
        INSERT INTO app.workspaces (name, kind, owner_id) VALUES
          ('Repairs Workspace 1', 'personal', '${userAId}')
        RETURNING id;
      `);
      workspace1Id = ws1Res.rows[0]!.id;

      const ws2Res = await admin.query<{ id: string }>(`
        INSERT INTO app.workspaces (name, kind, owner_id) VALUES
          ('Repairs Workspace 2', 'room', '${userAId}')
        RETURNING id;
      `);
      workspace2Id = ws2Res.rows[0]!.id;

      await admin.query(`
        INSERT INTO app.workspace_memberships (workspace_id, user_id, role) VALUES
          ('${workspace1Id}', '${userAId}', 'owner'),
          ('${workspace2Id}', '${userAId}', 'owner');

        INSERT INTO app.workspace_sync_state (workspace_id, next_change_seq) VALUES
          ('${workspace1Id}', 1),
          ('${workspace2Id}', 1)
        ON CONFLICT (workspace_id) DO NOTHING;
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

  it('rejects invalid userTimezone input in listTasks with 400 Validation Error', async () => {
    await expect(
      clientA.listTasks(workspace1Id, {
        userTimezone: 'Invalid/Malformed_Zone_XYZ',
      })
    ).rejects.toThrow();
  });

  it('strictly scopes Today queries to the authorized workspace even with multiple workspaces', async () => {
    // Seed timed task in Workspace 2 due today
    const now = new Date();
    const taskW2 = await clientA.createTask(workspace2Id, {
      title: 'Workspace 2 Timed Task Due Today',
      priority: 'normal',
      deadline: {
        type: 'timed',
        timestamp: now.toISOString(),
        timezone: 'UTC',
      },
    });

    // Seed timed task in Workspace 1 due today
    const taskW1 = await clientA.createTask(workspace1Id, {
      title: 'Workspace 1 Timed Task Due Today',
      priority: 'high',
      deadline: {
        type: 'timed',
        timestamp: now.toISOString(),
        timezone: 'UTC',
      },
    });

    // Query Workspace 1 with filter=today
    const resW1 = await clientA.listTasks(workspace1Id, { filter: 'today', userTimezone: 'UTC' });
    const idsW1 = resW1.data.map((t) => t.id);

    expect(idsW1).toContain(taskW1.data.id);
    expect(idsW1).not.toContain(taskW2.data.id);

    // Query Workspace 2 with filter=today
    const resW2 = await clientA.listTasks(workspace2Id, { filter: 'today', userTimezone: 'UTC' });
    const idsW2 = resW2.data.map((t) => t.id);

    expect(idsW2).toContain(taskW2.data.id);
    expect(idsW2).not.toContain(taskW1.data.id);
  });

  it('orders deterministically before pagination and supports continuation cursor', async () => {
    const today = new Date().toISOString().slice(0, 10);

    const admin = await adminPool.connect();
    let pWsId: string;
    try {
      const pWsRes = await admin.query<{ id: string }>(`
        INSERT INTO app.workspaces (name, kind, owner_id) VALUES
          ('Pagination Workspace', 'room', '${userAId}')
        RETURNING id;
      `);
      pWsId = pWsRes.rows[0]!.id;
      await admin.query(`
        INSERT INTO app.workspace_memberships (workspace_id, user_id, role) VALUES
          ('${pWsId}', '${userAId}', 'owner');
        INSERT INTO app.workspace_sync_state (workspace_id, next_change_seq) VALUES
          ('${pWsId}', 1)
        ON CONFLICT (workspace_id) DO NOTHING;
      `);
    } finally {
      admin.release();
    }

    // Insert multiple tasks with equal deadlines, mixed priorities, and random titles
    await clientA.createTask(pWsId, {
      title: 'Task Low',
      priority: 'low',
      deadline: { type: 'date', date: today },
    });
    await clientA.createTask(pWsId, {
      title: 'Task Normal',
      priority: 'normal',
      deadline: { type: 'date', date: today },
    });
    await clientA.createTask(pWsId, {
      title: 'Task Urgent',
      priority: 'urgent',
      deadline: { type: 'date', date: today },
    });
    await clientA.createTask(pWsId, {
      title: 'Task High',
      priority: 'high',
      deadline: { type: 'date', date: today },
    });

    // Query page 1 with limit=2, sortBy=deadline
    const page1 = await clientA.listTasks(pWsId, {
      filter: 'today',
      sortBy: 'deadline',
      sortDirection: 'asc',
      limit: 2,
      userTimezone: 'UTC',
    });

    expect(page1.data).toHaveLength(2);
    // Urgent and High should be on page 1
    expect(page1.data[0]!.priority).toBe('urgent');
    expect(page1.data[1]!.priority).toBe('high');
    expect(page1.meta.cursor).toBeDefined();

    // Query page 2 using cursor
    const page2 = await clientA.listTasks(pWsId, {
      filter: 'today',
      sortBy: 'deadline',
      sortDirection: 'asc',
      limit: 2,
      cursor: page1.meta.cursor,
      userTimezone: 'UTC',
    });

    expect(page2.data).toHaveLength(2);
    // Normal and Low should be on page 2
    expect(page2.data[0]!.priority).toBe('normal');
    expect(page2.data[1]!.priority).toBe('low');

    // No overlap between page 1 and page 2
    const p1Ids = page1.data.map((t) => t.id);
    const p2Ids = page2.data.map((t) => t.id);
    for (const id of p1Ids) {
      expect(p2Ids).not.toContain(id);
    }
  });

  it('rejects cross-workspace or mismatched continuation cursor parameters', async () => {
    // Generate valid cursor from workspace 1 with 3 tasks
    const today = new Date().toISOString().slice(0, 10);
    await clientA.createTask(workspace1Id, {
      title: 'Extra Task 1',
      priority: 'normal',
      deadline: { type: 'date', date: today },
    });
    await clientA.createTask(workspace1Id, {
      title: 'Extra Task 2',
      priority: 'normal',
      deadline: { type: 'date', date: today },
    });

    const page1 = await clientA.listTasks(workspace1Id, {
      filter: 'today',
      sortBy: 'deadline',
      limit: 2,
      userTimezone: 'UTC',
    });

    expect(page1.meta.cursor).toBeDefined();

    // Attempt to use cursor for workspace 1 in workspace 2 query
    await expect(
      clientA.listTasks(workspace2Id, {
        filter: 'today',
        sortBy: 'deadline',
        limit: 2,
        cursor: page1.meta.cursor,
        userTimezone: 'UTC',
      })
    ).rejects.toThrow();

    // Attempt to use cursor with mismatched filter
    await expect(
      clientA.listTasks(workspace1Id, {
        filter: 'overdue',
        sortBy: 'deadline',
        limit: 2,
        cursor: page1.meta.cursor,
        userTimezone: 'UTC',
      })
    ).rejects.toThrow();
  });

  it('prevents concurrent updates with the same revision from overwriting each other (forced concurrency)', async () => {
    const task = await clientA.createTask(workspace1Id, {
      title: 'Concurrency Test Task',
      priority: 'normal',
    });

    const currentRev = task.data.revision;

    // Fire two simultaneous updates using the identical baseRevision
    const req1 = clientA.updateTask(workspace1Id, task.data.id, {
      title: 'Update from Client 1',
      baseRevision: currentRev,
    });
    const req2 = clientA.updateTask(workspace1Id, task.data.id, {
      title: 'Update from Client 2',
      baseRevision: currentRev,
    });

    const results = await Promise.allSettled([req1, req2]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    // Exactly one update must succeed, and the second MUST be rejected with conflict
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
  });

  it('rejects subtask hierarchy exceeding 3 levels of depth', async () => {
    // Level 1: Root
    const root = await clientA.createTask(workspace1Id, { title: 'Level 1 Root' });
    // Level 2: Child
    const child = await clientA.createTask(workspace1Id, {
      title: 'Level 2 Child',
      parentId: root.data.id,
    });
    // Level 3: Grandchild
    const grandchild = await clientA.createTask(workspace1Id, {
      title: 'Level 3 Grandchild',
      parentId: child.data.id,
    });

    // Level 4: Great-grandchild should be rejected
    await expect(
      clientA.createTask(workspace1Id, {
        title: 'Level 4 Great-Grandchild',
        parentId: grandchild.data.id,
      })
    ).rejects.toThrow(/SUBTASK_DEPTH_EXCEEDED/);

    // Reparenting a subtree exceeding 3 levels should also be rejected
    const standaloneParent = await clientA.createTask(workspace1Id, {
      title: 'Standalone Parent',
    });
    const _standaloneChild = await clientA.createTask(workspace1Id, {
      title: 'Standalone Child',
      parentId: standaloneParent.data.id,
    });

    // Moving standaloneParent to be child of grandchild would create a 4-level depth
    await expect(
      clientA.updateTask(workspace1Id, standaloneParent.data.id, {
        parentId: grandchild.data.id,
        baseRevision: standaloneParent.data.revision,
      })
    ).rejects.toThrow(/SUBTASK_DEPTH_EXCEEDED/);
  });

  it('replays durable result on duplicate mutation idempotency retry without creating duplicate history', async () => {
    const opId = crypto.randomUUID();
    const task = await clientA.createTask(workspace1Id, { title: 'Idempotency Task' });

    // Complete task with operationId
    const res1 = await clientA.completeTask(
      workspace1Id,
      task.data.id,
      { baseRevision: task.data.revision },
      { headers: { 'x-operation-id': opId } }
    );

    expect(res1.data.status).toBe('completed');
    expect(res1.data.completionHistory).toHaveLength(1);
    const originalCompletedAt = res1.data.completedAt;

    // Retry completion with exact same operationId
    const res2 = await clientA.completeTask(
      workspace1Id,
      task.data.id,
      { baseRevision: task.data.revision },
      { headers: { 'x-operation-id': opId } }
    );

    expect(res2.data.status).toBe('completed');
    expect(res2.data.completedAt).toBe(originalCompletedAt);
    expect(res2.data.completionHistory).toHaveLength(1);
    expect(res2.data.revision).toBe(res1.data.revision);
  });

  it('reconciles task tags with canonical workspace tags in app.tags and app.item_tags', async () => {
    const task = await clientA.createTask(workspace1Id, {
      title: 'Tagged Task',
      tags: ['Engineering', 'Urgent-Fix'],
    });

    const admin = await adminPool.connect();
    try {
      const tagsRes = await admin.query<{ name: string }>(
        `SELECT tg.name FROM app.tags tg
         JOIN app.item_tags it ON it.tag_id = tg.id
         WHERE it.item_id = $1;`,
        [task.data.id]
      );
      const tagNames = tagsRes.rows.map((r) => r.name);
      expect(tagNames).toContain('Engineering');
      expect(tagNames).toContain('Urgent-Fix');
    } finally {
      admin.release();
    }

    // Query by tag using listTasks
    const list = await clientA.listTasks(workspace1Id, { tag: 'Engineering' });
    expect(list.data.map((t) => t.id)).toContain(task.data.id);
  });
});
