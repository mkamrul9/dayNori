import crypto from 'node:crypto';
import { generateKeyPair, SignJWT, exportJWK, type JSONWebKeySet } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { buildServer, JwtVerifier } from '../../apps/api/src/index.js';
import { createAdminPool, createRuntimePool } from '../../apps/api/src/db/index.js';
import { Migrator } from '../../infra/supabase/migrator.js';
import { createApiClient, DaynoriApiClient } from '@daynori/api-client';
import { compareRanks } from '@daynori/domain';

describe('Phase 15: Folder Browsing and Organization Interfaces (Integration & Contracts)', () => {
  let adminPool: Pool;
  let runtimePool: Pool;
  let migrator: Migrator;
  let server: ReturnType<typeof buildServer>;
  let baseUrl: string;

  let keyPair: Awaited<ReturnType<typeof generateKeyPair>>;
  let jwks: JSONWebKeySet;

  const issuer = 'https://auth.daynori.test';
  const audience = 'daynori-api';
  const kid = 'phase15-org-key';

  const userAId = crypto.randomUUID();
  let tokenUserA: string;
  let clientA: DaynoriApiClient;
  let workspaceAId: string;

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
    const addr = server.server.address();
    if (!addr || typeof addr === 'string') throw new Error('Failed to bind server port');
    baseUrl = `http://127.0.0.1:${addr.port}`;

    clientA = createApiClient({
      baseUrl,
      token: tokenUserA,
    });

    // 4. Setup Test Workspace & Profile for User A
    const admin = await adminPool.connect();
    try {
      await admin.query(`
        INSERT INTO app.profiles (id, display_name) VALUES
          ('${userAId}', 'Alice Library User')
        ON CONFLICT (id) DO NOTHING;
      `);

      const wsARes = await admin.query<{ id: string }>(`
        INSERT INTO app.workspaces (name, kind, owner_id)
        VALUES ('Alice Library Workspace', 'personal', '${userAId}')
        RETURNING id;
      `);
      workspaceAId = wsARes.rows[0]!.id;

      await admin.query(`
        INSERT INTO app.workspace_memberships (workspace_id, user_id, role) VALUES
          ('${workspaceAId}', '${userAId}', 'owner');
      `);
    } finally {
      admin.release();
    }
  });

  afterAll(async () => {
    if (server) await server.close();
    if (adminPool) await adminPool.end();
    if (runtimePool) await runtimePool.end();
  });

  describe('1. Canonical Software and Government Jobs Folder Journeys', () => {
    let softwareFolderId: string;
    let guidesFolderId: string;
    let govJobsFolderId: string;
    let applicationsFolderId: string;

    it('creates top-level Software and Government jobs folders', async () => {
      // Create Software
      const softwareRes = await clientA.createFolder(workspaceAId, {
        name: 'Software',
        parentId: null,
        icon: '💻',
        color: '#3b82f6',
      });
      expect(softwareRes.data.name).toBe('Software');
      expect(softwareRes.data.parentId).toBeNull();
      expect(softwareRes.data.depth).toBe(1);
      softwareFolderId = softwareRes.data.id;

      // Create Government jobs
      const govRes = await clientA.createFolder(workspaceAId, {
        name: 'Government jobs',
        parentId: null,
        icon: '🏛️',
        color: '#f59e0b',
      });
      expect(govRes.data.name).toBe('Government jobs');
      expect(govRes.data.parentId).toBeNull();
      expect(govRes.data.depth).toBe(1);
      govJobsFolderId = govRes.data.id;
    });

    it('creates nested subfolders: Guides under Software, Applications under Government jobs', async () => {
      // Subfolder Guides
      const guidesRes = await clientA.createFolder(workspaceAId, {
        name: 'Guides',
        parentId: softwareFolderId,
        icon: '📚',
        color: '#10b981',
      });
      expect(guidesRes.data.name).toBe('Guides');
      expect(guidesRes.data.parentId).toBe(softwareFolderId);
      expect(guidesRes.data.depth).toBe(2);
      guidesFolderId = guidesRes.data.id;

      // Subfolder Applications
      const appRes = await clientA.createFolder(workspaceAId, {
        name: 'Applications',
        parentId: govJobsFolderId,
        icon: '📋',
        color: '#ec4899',
      });
      expect(appRes.data.name).toBe('Applications');
      expect(appRes.data.parentId).toBe(govJobsFolderId);
      expect(appRes.data.depth).toBe(2);
      applicationsFolderId = appRes.data.id;
    });

    it('organizes mixed item types inside Guides and Applications', async () => {
      // Items in Guides: note, todo
      const item1 = await clientA.createItem(workspaceAId, {
        kind: 'note',
        folderId: guidesFolderId,
      });
      expect(item1.data.folderId).toBe(guidesFolderId);
      expect(item1.data.kind).toBe('note');

      const item2 = await clientA.createItem(workspaceAId, {
        kind: 'todo',
        folderId: guidesFolderId,
      });
      expect(item2.data.folderId).toBe(guidesFolderId);
      expect(item2.data.kind).toBe('todo');

      // Items in Applications: todo and note
      const item3 = await clientA.createItem(workspaceAId, {
        kind: 'todo',
        folderId: applicationsFolderId,
      });
      expect(item3.data.folderId).toBe(applicationsFolderId);

      const item4 = await clientA.createItem(workspaceAId, {
        kind: 'note',
        folderId: applicationsFolderId,
      });
      expect(item4.data.folderId).toBe(applicationsFolderId);

      // Verify mixed item listing in Guides
      const guidesItems = await clientA.listItems(workspaceAId, { folderId: guidesFolderId });
      expect(guidesItems.data.length).toBe(2);
      expect(guidesItems.data.map((i) => i.kind)).toEqual(expect.arrayContaining(['note', 'todo']));

      // Verify mixed item listing in Applications
      const appItems = await clientA.listItems(workspaceAId, { folderId: applicationsFolderId });
      expect(appItems.data.length).toBe(2);
      expect(appItems.data.map((i) => i.kind)).toEqual(expect.arrayContaining(['todo', 'note']));
    });

    it('type-filtering displays matching records without moving or copying content', async () => {
      // Filter by todo (tasks)
      const tasksInGuides = await clientA.listItems(workspaceAId, {
        folderId: guidesFolderId,
        kind: 'todo',
      });
      expect(tasksInGuides.data.length).toBe(1);
      expect(tasksInGuides.data[0].kind).toBe('todo');

      // Filter by note
      const notesInGuides = await clientA.listItems(workspaceAId, {
        folderId: guidesFolderId,
        kind: 'note',
      });
      expect(notesInGuides.data.length).toBe(1);
      expect(notesInGuides.data[0].kind).toBe('note');

      // Invariant check: folderId is unchanged on all records
      expect(tasksInGuides.data[0].folderId).toBe(guidesFolderId);
      expect(notesInGuides.data[0].folderId).toBe(guidesFolderId);
    });
  });

  describe('2. Sibling Reordering and Collection Precondition Conflicts', () => {
    let folder1Id: string;
    let folder2Id: string;
    let folder3Id: string;

    it('creates three sibling folders and rebalances ranks', async () => {
      const f1 = await clientA.createFolder(workspaceAId, { name: 'Alpha', parentId: null });
      const f2 = await clientA.createFolder(workspaceAId, { name: 'Beta', parentId: null });
      const f3 = await clientA.createFolder(workspaceAId, { name: 'Gamma', parentId: null });
      folder1Id = f1.data.id;
      folder2Id = f2.data.id;
      folder3Id = f3.data.id;

      // Rebalance siblings in order: Gamma, Alpha, Beta
      const rebalanceRes = await clientA.rebalanceFolders(workspaceAId, {
        parentId: null,
        siblingIds: [folder3Id, folder1Id, folder2Id],
      });

      expect(rebalanceRes.data.length).toBe(3);
      const sorted = [...rebalanceRes.data].sort((a, b) =>
        compareRanks(a.rank, a.id, b.rank, b.id)
      );
      expect(sorted[0].id).toBe(folder3Id);
      expect(sorted[1].id).toBe(folder1Id);
      expect(sorted[2].id).toBe(folder2Id);
    });

    it('rejects reordering when expectedCollectionRevision does not match current state', async () => {
      // Stale expectedCollectionRevision = 999999
      await expect(
        clientA.rebalanceFolders(workspaceAId, {
          parentId: null,
          siblingIds: [folder1Id, folder2Id, folder3Id],
          expectedCollectionRevision: 999999,
        })
      ).rejects.toThrow();
    });
  });

  describe('3. Subtree Trash and Precise Restoration', () => {
    it('trashes folder subtree and precisely restores affected items upon undo', async () => {
      // 1. Create a parent folder with child folder and items
      const parent = await clientA.createFolder(workspaceAId, {
        name: 'Project Archive Demo',
        parentId: null,
      });
      const child = await clientA.createFolder(workspaceAId, {
        name: 'Child Docs',
        parentId: parent.data.id,
      });

      const itemA = await clientA.createItem(workspaceAId, {
        kind: 'note',
        folderId: parent.data.id,
      });
      const itemB = await clientA.createItem(workspaceAId, {
        kind: 'todo',
        folderId: child.data.id,
      });

      // Pre-delete an item before subtree trash
      const itemC = await clientA.createItem(workspaceAId, {
        kind: 'note',
        folderId: child.data.id,
      });
      await clientA.deleteItem(workspaceAId, itemC.data.id);

      // 2. Trash subtree
      const trashRes = await clientA.trashFolder(workspaceAId, parent.data.id, {
        policy: 'trash_subtree',
        baseRevision: parent.data.revision,
      });
      expect(trashRes.data.policy).toBe('trash_subtree');
      expect(trashRes.data.affectedFoldersCount).toBe(1); // child
      expect(trashRes.data.affectedItemsCount).toBe(2); // itemA, itemB

      // 3. Restore subtree
      const restoreRes = await clientA.restoreFolder(workspaceAId, parent.data.id, {
        baseRevision: trashRes.data.targetRevision ?? parent.data.revision + 1,
        restoreSubtree: true,
      });
      expect(restoreRes.data.id).toBe(parent.data.id);
      expect(restoreRes.data.deletedAt).toBeNull();

      // Verify itemA and itemB are restored, but itemC remains deleted
      const checkA = await clientA.getItem(workspaceAId, itemA.data.id);
      expect(checkA.data.deletedAt).toBeNull();

      const checkB = await clientA.getItem(workspaceAId, itemB.data.id);
      expect(checkB.data.deletedAt).toBeNull();

      const checkC = await clientA.getItem(workspaceAId, itemC.data.id);
      expect(checkC.data.deletedAt).not.toBeNull();
    });
  });

  describe('4. Idempotent Durable REST Operations', () => {
    it('returns identical receipt on replayed x-operation-id folder creation', async () => {
      const opId = crypto.randomUUID();
      const res1 = await clientA.createFolder(
        workspaceAId,
        {
          name: 'Idempotency Folder Test',
          parentId: null,
        },
        {
          headers: { 'x-operation-id': opId },
        }
      );

      const res2 = await clientA.createFolder(
        workspaceAId,
        {
          name: 'Idempotency Folder Test',
          parentId: null,
        },
        {
          headers: { 'x-operation-id': opId },
        }
      );

      expect(res1.data.id).toBe(res2.data.id);
      expect(res1.data.name).toBe(res2.data.name);
    });
  });
});
