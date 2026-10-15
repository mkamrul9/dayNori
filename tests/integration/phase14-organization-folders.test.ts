import crypto from 'node:crypto';
import { generateKeyPair, SignJWT, exportJWK, type JSONWebKeySet } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { buildServer, JwtVerifier } from '../../apps/api/src/index.js';
import { createAdminPool, createRuntimePool } from '../../apps/api/src/db/index.js';
import { Migrator } from '../../infra/supabase/migrator.js';
import { createApiClient, DaynoriApiClient } from '@daynori/api-client';

describe('Phase 14: Organization, Folders, and Shared Item Metadata', () => {
  let adminPool: Pool;
  let runtimePool: Pool;
  let migrator: Migrator;
  let server: ReturnType<typeof buildServer>;
  let baseUrl: string;

  let keyPair: Awaited<ReturnType<typeof generateKeyPair>>;
  let jwks: JSONWebKeySet;

  const issuer = 'https://auth.daynori.test';
  const audience = 'daynori-api';
  const kid = 'phase14-org-key';

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

    // 1. Ensure migrations are applied
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

    const verifier = new JwtVerifier({
      issuer,
      audience,
      localJwks: jwks,
    });

    server = buildServer({
      runtimePool,
      jwtVerifier: verifier,
      rateLimitOptions: { windowMs: 60000, maxRequests: 50000 },
    });

    await server.listen({ port: 0, host: '127.0.0.1' });
    const addr = server.server.address();
    if (!addr || typeof addr === 'string') throw new Error('Failed to bind server port');
    baseUrl = `http://127.0.0.1:${addr.port}`;

    clientA = createApiClient({ baseUrl, token: tokenUserA });
    clientB = createApiClient({ baseUrl, token: tokenUserB });

    // 3. Setup Test Workspaces & Profiles
    const admin = await adminPool.connect();
    try {
      await admin.query(`
        INSERT INTO app.profiles (id, display_name) VALUES
          ('${userAId}', 'Alice Organizer'),
          ('${userBId}', 'Bob Collaborator')
        ON CONFLICT (id) DO NOTHING;
      `);

      const wsARes = await admin.query<{ id: string }>(`
        INSERT INTO app.workspaces (name, kind, owner_id)
        VALUES ('Alice Hierarchy Workspace', 'personal', '${userAId}')
        RETURNING id;
      `);
      workspaceAId = wsARes.rows[0]!.id;

      const wsBRes = await admin.query<{ id: string }>(`
        INSERT INTO app.workspaces (name, kind, owner_id)
        VALUES ('Bob Cross-Tenant Workspace', 'personal', '${userBId}')
        RETURNING id;
      `);
      workspaceBId = wsBRes.rows[0]!.id;

      await admin.query(`
        INSERT INTO app.workspace_memberships (workspace_id, user_id, role) VALUES
          ('${workspaceAId}', '${userAId}', 'owner'),
          ('${workspaceBId}', '${userBId}', 'owner');
      `);
    } finally {
      admin.release();
    }
  });

  afterAll(async () => {
    if (server) await server.close();
    if (migrator) await migrator.close();
    if (runtimePool) await runtimePool.end();
    if (adminPool) await adminPool.end();
  });

  describe('1. Folder Hierarchy & Maximum Depth Bounds', () => {
    it('creates root folders (depth 1) and subfolders up to max depth 5', async () => {
      // Depth 1: Root folder
      const rootRes = await clientA.createFolder(workspaceAId, {
        name: 'Root Level 1',
        rank: '1000',
      });
      expect(rootRes.data.depth).toBe(1);
      expect(rootRes.data.parentId).toBeNull();
      expect(rootRes.data.name).toBe('Root Level 1');

      // Depth 2
      const d2Res = await clientA.createFolder(workspaceAId, {
        name: 'Child Level 2',
        parentId: rootRes.data.id,
        rank: '2000',
      });
      expect(d2Res.data.depth).toBe(2);
      expect(d2Res.data.parentId).toBe(rootRes.data.id);

      // Depth 3
      const d3Res = await clientA.createFolder(workspaceAId, {
        name: 'Grandchild Level 3',
        parentId: d2Res.data.id,
      });
      expect(d3Res.data.depth).toBe(3);

      // Depth 4
      const d4Res = await clientA.createFolder(workspaceAId, {
        name: 'Great-Grandchild Level 4',
        parentId: d3Res.data.id,
      });
      expect(d4Res.data.depth).toBe(4);

      // Depth 5: Allowed boundary
      const d5Res = await clientA.createFolder(workspaceAId, {
        name: 'Level 5 Max Bound',
        parentId: d4Res.data.id,
      });
      expect(d5Res.data.depth).toBe(5);

      // Attempt Depth 6: MUST FAIL
      await expect(
        clientA.createFolder(workspaceAId, {
          name: 'Illegal Level 6',
          parentId: d5Res.data.id,
        })
      ).rejects.toThrow();
    });

    it('rejects moving a folder if target depth + subtree depth exceeds 5', async () => {
      // Create Tree 1: RootA -> ChildA (depth 2) -> GrandchildA (depth 3)
      const rootA = await clientA.createFolder(workspaceAId, { name: 'Tree1 Root' });
      const childA = await clientA.createFolder(workspaceAId, {
        name: 'Tree1 Child',
        parentId: rootA.data.id,
      });
      const _grandChildA = await clientA.createFolder(workspaceAId, {
        name: 'Tree1 Grandchild',
        parentId: childA.data.id,
      });

      // Create Tree 2: RootB -> ChildB -> GrandchildB (depth 3)
      const rootB = await clientA.createFolder(workspaceAId, { name: 'Tree2 Root' });
      const childB = await clientA.createFolder(workspaceAId, {
        name: 'Tree2 Child',
        parentId: rootB.data.id,
      });
      const grandChildB = await clientA.createFolder(workspaceAId, {
        name: 'Tree2 Grandchild',
        parentId: childB.data.id,
      });

      // Moving rootA (subtree depth 3) under grandChildB (depth 3) would create depth 6 (3 + 3 = 6 > 5)
      await expect(
        clientA.moveFolder(workspaceAId, rootA.data.id, {
          targetParentId: grandChildB.data.id,
          baseRevision: rootA.data.revision,
        })
      ).rejects.toThrow();
    });
  });

  describe('2. Cycle Prevention & Parent Validation', () => {
    it('rejects direct self-parenting', async () => {
      const folder = await clientA.createFolder(workspaceAId, { name: 'Self Parent Test' });
      await expect(
        clientA.moveFolder(workspaceAId, folder.data.id, {
          targetParentId: folder.data.id,
          baseRevision: folder.data.revision,
        })
      ).rejects.toThrow();
    });

    it('rejects indirect cycles (moving ancestor under its descendant)', async () => {
      const parent = await clientA.createFolder(workspaceAId, { name: 'Cycle Parent' });
      const child = await clientA.createFolder(workspaceAId, {
        name: 'Cycle Child',
        parentId: parent.data.id,
      });
      const grandChild = await clientA.createFolder(workspaceAId, {
        name: 'Cycle Grandchild',
        parentId: child.data.id,
      });

      // Moving parent under grandChild must fail
      await expect(
        clientA.moveFolder(workspaceAId, parent.data.id, {
          targetParentId: grandChild.data.id,
          baseRevision: parent.data.revision,
        })
      ).rejects.toThrow();
    });

    it('rejects cross-workspace parent references', async () => {
      const folderInB = await clientB.createFolder(workspaceBId, { name: 'Bob Folder' });

      // Alice attempts to create or move folder in Workspace A with parent in Workspace B
      await expect(
        clientA.createFolder(workspaceAId, {
          name: 'Cross Workspace Child',
          parentId: folderInB.data.id,
        })
      ).rejects.toThrow();
    });

    it('rejects parenting under a deleted folder', async () => {
      const folder = await clientA.createFolder(workspaceAId, { name: 'To Be Deleted Parent' });
      await clientA.trashFolder(workspaceAId, folder.data.id, {
        policy: 'trash_subtree',
        baseRevision: folder.data.revision,
      });

      await expect(
        clientA.createFolder(workspaceAId, {
          name: 'Child of Deleted',
          parentId: folder.data.id,
        })
      ).rejects.toThrow();
    });
  });

  describe('3. Non-Empty Folder Deletion: preserve_to_parent vs trash_subtree', () => {
    it('deletes folder with preserve_to_parent: reparents children and items to parent', async () => {
      const topFolder = await clientA.createFolder(workspaceAId, { name: 'Top Container' });
      const midFolder = await clientA.createFolder(workspaceAId, {
        name: 'Mid To Delete',
        parentId: topFolder.data.id,
      });
      const subFolder = await clientA.createFolder(workspaceAId, {
        name: 'Sub Folder Inside Mid',
        parentId: midFolder.data.id,
      });

      // Create generic item inside midFolder
      const item = await clientA.createItem(workspaceAId, {
        kind: 'note',
        folderId: midFolder.data.id,
      });
      expect(item.data.folderId).toBe(midFolder.data.id);

      // Trash midFolder with preserve_to_parent policy
      const deleteRes = await clientA.trashFolder(workspaceAId, midFolder.data.id, {
        policy: 'preserve_to_parent',
        baseRevision: midFolder.data.revision,
      });

      expect(deleteRes.data.policy).toBe('preserve_to_parent');
      expect(deleteRes.data.affectedFoldersCount).toBe(1); // subFolder
      expect(deleteRes.data.affectedItemsCount).toBe(1); // item
      expect(deleteRes.data.targetParentId).toBe(topFolder.data.id);

      // Verify subFolder has been reparented to topFolder
      const subFolderAfter = await clientA.getFolder(workspaceAId, subFolder.data.id);
      expect(subFolderAfter.data.parentId).toBe(topFolder.data.id);
      expect(subFolderAfter.data.deletedAt).toBeNull();

      // Verify item has been reparented to topFolder
      const itemAfter = await clientA.getItem(workspaceAId, item.data.id);
      expect(itemAfter.data.folderId).toBe(topFolder.data.id);
      expect(itemAfter.data.deletedAt).toBeNull();

      // Verify midFolder is tombstoned
      const midFolderAfter = await clientA.getFolder(workspaceAId, midFolder.data.id);
      expect(midFolderAfter.data.deletedAt).not.toBeNull();
    });

    it('deletes root folder with preserve_to_parent: reparents items to null (Inbox)', async () => {
      const rootFolder = await clientA.createFolder(workspaceAId, { name: 'Root Preserved' });
      const item = await clientA.createItem(workspaceAId, {
        kind: 'todo',
        folderId: rootFolder.data.id,
      });

      const deleteRes = await clientA.trashFolder(workspaceAId, rootFolder.data.id, {
        policy: 'preserve_to_parent',
        baseRevision: rootFolder.data.revision,
      });

      expect(deleteRes.data.targetParentId).toBeNull();

      // Item should now have null folderId (Inbox)
      const itemAfter = await clientA.getItem(workspaceAId, item.data.id);
      expect(itemAfter.data.folderId).toBeNull();
    });

    it('deletes folder with trash_subtree: recursively tombstones all descendants', async () => {
      const root = await clientA.createFolder(workspaceAId, { name: 'Subtree Root' });
      const child = await clientA.createFolder(workspaceAId, {
        name: 'Subtree Child',
        parentId: root.data.id,
      });
      const item = await clientA.createItem(workspaceAId, {
        kind: 'note',
        folderId: child.data.id,
      });

      const deleteRes = await clientA.trashFolder(workspaceAId, root.data.id, {
        policy: 'trash_subtree',
        baseRevision: root.data.revision,
      });

      expect(deleteRes.data.policy).toBe('trash_subtree');
      expect(deleteRes.data.affectedFoldersCount).toBe(1); // child
      expect(deleteRes.data.affectedItemsCount).toBe(1); // item

      // Both folders and item must be tombstoned
      const rootAfter = await clientA.getFolder(workspaceAId, root.data.id);
      expect(rootAfter.data.deletedAt).not.toBeNull();

      const childAfter = await clientA.getFolder(workspaceAId, child.data.id);
      expect(childAfter.data.deletedAt).not.toBeNull();

      const itemAfter = await clientA.getItem(workspaceAId, item.data.id);
      expect(itemAfter.data.deletedAt).not.toBeNull();
    });

    it('restores a deleted folder and safely reparents to root if former parent is deleted', async () => {
      const parent = await clientA.createFolder(workspaceAId, { name: 'Former Parent' });
      const child = await clientA.createFolder(workspaceAId, {
        name: 'Restored Child',
        parentId: parent.data.id,
      });

      // Trash both via subtree delete
      await clientA.trashFolder(workspaceAId, parent.data.id, {
        policy: 'trash_subtree',
        baseRevision: parent.data.revision,
      });

      // Child is tombstoned
      const childBefore = await clientA.getFolder(workspaceAId, child.data.id);
      expect(childBefore.data.deletedAt).not.toBeNull();

      // Restore child: since former parent is deleted, child must be reparented to root (null)
      const restoredChild = await clientA.restoreFolder(workspaceAId, child.data.id, {
        baseRevision: childBefore.data.revision,
      });

      expect(restoredChild.data.deletedAt).toBeNull();
      expect(restoredChild.data.parentId).toBeNull();
      expect(restoredChild.data.depth).toBe(1);
    });
  });

  describe('4. Sibling Ordering, Ranks, and Rebalancing', () => {
    it('supports sparse ranking, reordering, and rebalancing', async () => {
      const f1 = await clientA.createFolder(workspaceAId, { name: 'Folder 1', rank: '1000' });
      const f2 = await clientA.createFolder(workspaceAId, { name: 'Folder 2', rank: '2000' });
      const f3 = await clientA.createFolder(workspaceAId, { name: 'Folder 3', rank: '3000' });

      // Move f3 before f1 by reordering rank to 500
      const reorderedF3 = await clientA.reorderFolder(workspaceAId, f3.data.id, {
        rank: '500',
        baseRevision: f3.data.revision,
      });
      expect(reorderedF3.data.rank).toBe('500');

      // Rebalance siblings
      const rebalanceRes = await clientA.rebalanceFolders(workspaceAId, {
        siblingIds: [f3.data.id, f1.data.id, f2.data.id],
      });

      expect(rebalanceRes.data).toEqual([
        { id: f3.data.id, rank: '10000', revision: expect.any(Number) },
        { id: f1.data.id, rank: '20000', revision: expect.any(Number) },
        { id: f2.data.id, rank: '30000', revision: expect.any(Number) },
      ]);
    });
  });

  describe('5. Workspace Tags & Item-Tag Relations', () => {
    it('creates tags with case-insensitive unique names per workspace', async () => {
      const tag = await clientA.createTag(workspaceAId, {
        name: 'Urgent Work',
        color: '#ff0000',
      });
      expect(tag.data.name).toBe('Urgent Work');

      // Duplicate case-insensitive name in same workspace must fail
      await expect(clientA.createTag(workspaceAId, { name: 'urgent work' })).rejects.toThrow();

      // Same name in Workspace B by Bob must succeed
      const tagB = await clientB.createTag(workspaceBId, { name: 'urgent work' });
      expect(tagB.data.name).toBe('urgent work');
    });

    it('attaches and detaches tags to items without copying body content', async () => {
      const tag = await clientA.createTag(workspaceAId, { name: 'Finance' });
      const item = await clientA.createItem(workspaceAId, { kind: 'note' });

      // Add tag to item
      await clientA.addItemTag(workspaceAId, item.data.id, { tagId: tag.data.id });

      // List item tags
      const itemTags = await clientA.listItemTags(workspaceAId, item.data.id);
      expect(itemTags.data.length).toBe(1);
      expect(itemTags.data[0]!.tagId).toBe(tag.data.id);
      expect(itemTags.data[0]!.tagName).toBe('Finance');

      // Remove tag from item
      await clientA.removeItemTag(workspaceAId, item.data.id, tag.data.id);
      const afterRemoval = await clientA.listItemTags(workspaceAId, item.data.id);
      expect(afterRemoval.data.length).toBe(0);
    });
  });

  describe('6. Item Links (Graph Associations)', () => {
    it('creates links between workspace items and rejects self-links', async () => {
      const item1 = await clientA.createItem(workspaceAId, { kind: 'note' });
      const item2 = await clientA.createItem(workspaceAId, { kind: 'todo' });

      // Self-link rejection
      await expect(
        clientA.createItemLink(workspaceAId, item1.data.id, { targetItemId: item1.data.id })
      ).rejects.toThrow();

      // Valid link
      const link = await clientA.createItemLink(workspaceAId, item1.data.id, {
        targetItemId: item2.data.id,
        linkType: 'related',
      });
      expect(link.data.sourceItemId).toBe(item1.data.id);
      expect(link.data.targetItemId).toBe(item2.data.id);

      // List links from item1
      const links = await clientA.listItemLinks(workspaceAId, item1.data.id);
      expect(links.data.length).toBe(1);

      // Delete link
      await clientA.deleteItemLink(workspaceAId, item1.data.id, item2.data.id, 'related');
      const emptyLinks = await clientA.listItemLinks(workspaceAId, item1.data.id);
      expect(emptyLinks.data.length).toBe(0);
    });
  });

  describe('7. Generic Item Route Guard: Invariant Bypassing Prevention', () => {
    it('rejects setting folderId to a non-folder item or a deleted folder', async () => {
      const normalNote = await clientA.createItem(workspaceAId, { kind: 'note' });

      // Attempt to use normalNote as folderId for another item
      await expect(
        clientA.createItem(workspaceAId, {
          kind: 'todo',
          folderId: normalNote.data.id,
        })
      ).rejects.toThrow();
    });

    it('treats folderId = null as Inbox', async () => {
      const item = await clientA.createItem(workspaceAId, { kind: 'task' });
      expect(item.data.folderId).toBeNull();
    });
  });

  describe('8. Sync Engine Integration: Change Feed, Outbox, and Bootstrap', () => {
    it('records folder operations in change feed and outbox intents', async () => {
      const initialChanges = await clientA.syncPull({
        workspaceId: workspaceAId,
        limit: 100,
      });

      const folder = await clientA.createFolder(workspaceAId, { name: 'Sync Integrated Folder' });

      const newChanges = await clientA.syncPull({
        workspaceId: workspaceAId,
        cursor: initialChanges.data.nextCursor ?? undefined,
        limit: 100,
      });

      const folderChange = newChanges.data.changes.find((c) => c.entityId === folder.data.id);
      expect(folderChange).toBeDefined();
      expect(folderChange?.entityType).toBe('folder');
      expect((folderChange?.data as { name?: string })?.name).toBe('Sync Integrated Folder');
    });

    it('includes active folders in bootstrap snapshots', async () => {
      const snap = await clientA.syncBootstrap({ workspaceId: workspaceAId });
      const folderItem = snap.data.items.find((i) => i.kind === 'folder');
      expect(folderItem).toBeDefined();
    });
  });

  describe('9. Synthetic Hierarchy Performance Benchmark', () => {
    it('indexes and queries synthetic deep & wide hierarchy with EXPLAIN ANALYZE', async () => {
      const admin = await adminPool.connect();
      try {
        const perfWorkspaceRes = await admin.query<{ id: string }>(`
          INSERT INTO app.workspaces (name, kind, owner_id)
          VALUES ('Synthetic Hierarchy Benchmark WS', 'room', '${userAId}')
          RETURNING id;
        `);
        const perfWsId = perfWorkspaceRes.rows[0]!.id;

        await admin.query(`
          INSERT INTO app.workspace_memberships (workspace_id, user_id, role)
          VALUES ('${perfWsId}', '${userAId}', 'owner');
        `);

        // Generate synthetic tree: 10 top-level folders, each with 5 subfolders, each with 5 sub-subfolders (total 310 folders)
        const folderIds: string[] = [];
        const topIds: string[] = [];

        for (let i = 0; i < 10; i++) {
          const topId = crypto.randomUUID();
          topIds.push(topId);
          folderIds.push(topId);
        }

        const childIds: string[] = [];
        for (const _tid of topIds) {
          for (let j = 0; j < 5; j++) {
            const cid = crypto.randomUUID();
            childIds.push(cid);
            folderIds.push(cid);
          }
        }

        const grandChildIds: string[] = [];
        for (const _cid of childIds) {
          for (let k = 0; k < 5; k++) {
            const gcid = crypto.randomUUID();
            grandChildIds.push(gcid);
            folderIds.push(gcid);
          }
        }

        // Bulk insert items and folders
        await admin.query('BEGIN');

        for (const tid of topIds) {
          await admin.query(`
            INSERT INTO app.items (id, workspace_id, folder_id, kind, created_by, updated_by, rank)
            VALUES ('${tid}', '${perfWsId}', NULL, 'folder', '${userAId}', '${userAId}', '1000');
            INSERT INTO app.folders (id, workspace_id, parent_id, name)
            VALUES ('${tid}', '${perfWsId}', NULL, 'Top ${tid.substring(0, 8)}');
          `);
        }

        let childIdx = 0;
        for (const tid of topIds) {
          for (let j = 0; j < 5; j++) {
            const cid = childIds[childIdx++]!;
            await admin.query(`
              INSERT INTO app.items (id, workspace_id, folder_id, kind, created_by, updated_by, rank)
              VALUES ('${cid}', '${perfWsId}', '${tid}', 'folder', '${userAId}', '${userAId}', '2000');
              INSERT INTO app.folders (id, workspace_id, parent_id, name)
              VALUES ('${cid}', '${perfWsId}', '${tid}', 'Child ${cid.substring(0, 8)}');
            `);
          }
        }

        let gchildIdx = 0;
        for (const cid of childIds) {
          for (let k = 0; k < 5; k++) {
            const gcid = grandChildIds[gchildIdx++]!;
            await admin.query(`
              INSERT INTO app.items (id, workspace_id, folder_id, kind, created_by, updated_by, rank)
              VALUES ('${gcid}', '${perfWsId}', '${cid}', 'folder', '${userAId}', '${userAId}', '3000');
              INSERT INTO app.folders (id, workspace_id, parent_id, name)
              VALUES ('${gcid}', '${perfWsId}', '${cid}', 'Grandchild ${gcid.substring(0, 8)}');
            `);
          }
        }

        await admin.query('COMMIT');

        // Measure EXPLAIN (ANALYZE, BUFFERS) for indexed hierarchy resolution
        const explainRes = await admin.query<{ 'QUERY PLAN': string }>(`
          EXPLAIN (ANALYZE, BUFFERS)
          WITH RECURSIVE tree AS (
            SELECT f.id, f.parent_id, f.name, 1 as depth
            FROM app.folders f
            JOIN app.items i ON i.workspace_id = f.workspace_id AND i.id = f.id
            WHERE f.workspace_id = '${perfWsId}' AND f.parent_id IS NULL AND i.deleted_at IS NULL
            UNION ALL
            SELECT f.id, f.parent_id, f.name, t.depth + 1
            FROM app.folders f
            JOIN app.items i ON i.workspace_id = f.workspace_id AND i.id = f.id
            JOIN tree t ON f.parent_id = t.id
            WHERE f.workspace_id = '${perfWsId}' AND i.deleted_at IS NULL
          )
          SELECT * FROM tree ORDER BY depth ASC, name ASC;
        `);

        const planLines = explainRes.rows.map((r) => r['QUERY PLAN']).join('\n');
        expect(planLines).toContain('Execution Time:');

        // Extract execution time
        const execMatch = planLines.match(/Execution Time: ([\d.]+) ms/);
        const execTimeMs = execMatch ? parseFloat(execMatch[1]!) : 0;
        expect(execTimeMs).toBeLessThan(100); // 310 folders resolved in sub-100ms
      } finally {
        admin.release();
      }
    });
  });
});
