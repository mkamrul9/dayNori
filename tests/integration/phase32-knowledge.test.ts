import crypto from 'node:crypto';
import { generateKeyPair, SignJWT, exportJWK, type JSONWebKeySet } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { buildServer, JwtVerifier } from '../../apps/api/src/index.js';
import { createAdminPool, createRuntimePool } from '../../apps/api/src/db/index.js';
import { Migrator } from '../../infra/supabase/migrator.js';
import { createApiClient, DaynoriApiClient } from '@daynori/api-client';
import {
  createGuideDocument,
  createCheatsheetDocument,
  extractQuickReferenceSections,
  cleanTextForClipboard,
  matchesKnowledgeFilter,
  formatUnavailableLinkNotice,
  type KnowledgeSavedViewFilter,
} from '@daynori/domain';

describe('Phase 32: Knowledge Guides, Cheatsheets, and Saved Views Suite', () => {
  let adminPool: Pool;
  let runtimePool: Pool;
  let migrator: Migrator;
  let server: ReturnType<typeof buildServer>;
  let baseUrl: string;

  let keyPair: Awaited<ReturnType<typeof generateKeyPair>>;
  let jwks: JSONWebKeySet;

  const issuer = 'https://auth.daynori.test';
  const audience = 'daynori-api';
  const kid = 'phase32-knowledge-key';

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

    // 1. Run migrations to ensure 00028_saved_views_and_knowledge_organization.sql is applied
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
    const address = server.server.address();
    if (typeof address === 'object' && address !== null) {
      baseUrl = `http://127.0.0.1:${address.port}`;
    }

    clientA = createApiClient({ baseUrl, token: tokenUserA });
    clientB = createApiClient({ baseUrl, token: tokenUserB });

    const provA = await clientA.provisionPersonalWorkspace({
      displayName: 'Alice Knowledge Workspace',
      timeZone: 'Europe/London',
      preferredLocale: 'en-GB',
      weekStart: 'monday',
    });
    workspaceAId = provA.data.workspace.id;

    const provB = await clientB.provisionPersonalWorkspace({
      displayName: 'Bob Knowledge Workspace',
      timeZone: 'America/New_York',
      preferredLocale: 'en-US',
      weekStart: 'sunday',
    });
    workspaceBId = provB.data.workspace.id;
  });

  afterAll(async () => {
    await server.close();
    await runtimePool.end();
    await adminPool.end();
  });

  describe('1. Canonical Note Document Presets & Quick-Reference Extraction', () => {
    it('generates a canonical NoteDocument for procedural guides using existing Note format', () => {
      const guideDoc = createGuideDocument({
        title: 'Deploying High-Availability Web Services',
        summary: 'Step-by-step procedure to deploy fault-tolerant containers.',
        steps: [
          'Verify TLS certificates and cluster credentials.',
          'Execute rolling blue-green deployment container rollout.',
          'Verify endpoint latency and error rate metrics.',
        ],
        checklist: [
          'All container pods report healthy',
          'Database migration ledger verified',
          'Canary traffic switched to 100%',
        ],
      });

      expect(guideDoc.version).toBe(1);
      expect(guideDoc.type).toBe('doc');
      expect(Array.isArray(guideDoc.content)).toBe(true);

      // Verify title heading block
      const h1 = guideDoc.content.find((b) => b.type === 'heading' && b.level === 1);
      expect(h1).toBeDefined();
      expect(h1?.content[0].text).toBe('Deploying High-Availability Web Services');

      // Verify summary paragraph
      const summaryPara = guideDoc.content.find(
        (b) => b.type === 'paragraph' && b.content[0].text.includes('Step-by-step procedure')
      );
      expect(summaryPara).toBeDefined();

      // Verify checklist block
      const checklistBlock = guideDoc.content.find((b) => b.type === 'checklist');
      expect(checklistBlock).toBeDefined();
      if (checklistBlock && checklistBlock.type === 'checklist') {
        expect(checklistBlock.items).toHaveLength(3);
        expect(checklistBlock.items[0].content[0].text).toBe('All container pods report healthy');
      }

      // Quick reference extraction
      const sections = extractQuickReferenceSections(guideDoc);
      expect(sections.length).toBeGreaterThan(0);
      const checklistSection = sections.find((s) => s.checklistItems.length > 0);
      expect(checklistSection).toBeDefined();
      expect(checklistSection?.checklistItems).toHaveLength(3);
    });

    it('generates a canonical NoteDocument for cheatsheets with copy-ready syntax', () => {
      const cheatsheetDoc = createCheatsheetDocument({
        title: 'Git Commands Cheatsheet',
        summary: 'Essential Git commands for atomic branching and rebasing.',
        sections: [
          {
            title: 'Branching & Rebasing',
            entries: [
              {
                label: 'Rebase interactive',
                codeOrValue: 'git rebase -i HEAD~5',
                description: 'Reword or squash commits',
              },
              {
                label: 'Cherry-pick',
                codeOrValue: 'git cherry-pick <commit-sha>',
                description: 'Apply specific commit',
              },
            ],
          },
        ],
      });

      expect(cheatsheetDoc.version).toBe(1);
      expect(cheatsheetDoc.type).toBe('doc');

      const sections = extractQuickReferenceSections(cheatsheetDoc);
      const codeSection = sections.find((s) => s.entries.length > 0);
      expect(codeSection).toBeDefined();
      expect(codeSection?.entries[0].label).toBe('Rebase interactive');
      expect(codeSection?.entries[0].codeOrValue).toBe('git rebase -i HEAD~5');

      // Test clean text-only clipboard boundary
      const cleanSnippet = cleanTextForClipboard('```bash\ngit rebase -i HEAD~5\n```');
      expect(cleanSnippet).toBe('git rebase -i HEAD~5');
    });
  });

  describe('2. Custom Topic Folders Organization for Guides & Cheatsheets', () => {
    let topicFolderId: string;
    let guideNoteId: string;

    it('creates topic folders and stores guides within them without secondary stores', async () => {
      // 1. Create a custom topic folder
      const folderRes = await clientA.createFolder(workspaceAId, {
        name: 'Architecture & Guides',
        icon: '📚',
        color: '#3b82f6',
      });
      expect(folderRes.data).toBeDefined();
      topicFolderId = folderRes.data.id;
      expect(folderRes.data.name).toBe('Architecture & Guides');

      // 2. Create a canonical note inside this topic folder
      guideNoteId = crypto.randomUUID();
      const guideDoc = createGuideDocument({
        title: 'Microservices Communication Standards',
        summary: 'RPC and event-driven patterns for services.',
      });

      const noteRes = await clientA.createNote(workspaceAId, {
        id: guideNoteId,
        title: 'Microservices Communication Standards',
        folderId: topicFolderId,
        document: guideDoc,
        plainText: 'Microservices Communication Standards. Overview and steps.',
      });

      expect(noteRes.data).toBeDefined();
      expect(noteRes.data.id).toBe(guideNoteId);
      expect(noteRes.data.folderId).toBe(topicFolderId);

      // Verify the note is retrievable with its canonical document body
      const retrieved = await clientA.getNote(workspaceAId, guideNoteId);
      expect(retrieved.data.title).toBe('Microservices Communication Standards');
      expect(retrieved.data.document.version).toBe(1);
      expect(retrieved.data.folderId).toBe(topicFolderId);
    });

    it('moves a guide to another folder while preserving its exact canonical body', async () => {
      const targetFolderRes = await clientA.createFolder(workspaceAId, {
        name: 'Backend Standards',
        icon: '⚙️',
      });
      const newFolderId = targetFolderRes.data.id;

      // Move note
      await clientA.updateNote(workspaceAId, guideNoteId, {
        folderId: newFolderId,
        title: 'Microservices Communication Standards (Relocated)',
        baseRevision: 1,
      });

      const moved = await clientA.getNote(workspaceAId, guideNoteId);
      expect(moved.data.folderId).toBe(newFolderId);
      expect(moved.data.title).toBe('Microservices Communication Standards (Relocated)');
      // Canonical document AST remains intact
      expect(moved.data.document.version).toBe(1);
      expect(moved.data.document.type).toBe('doc');
    });
  });

  describe('3. Saved Views & Non-Destructive Multi-View Filtering', () => {
    let savedViewId: string;
    let cheatsheetNoteId: string;

    beforeAll(async () => {
      // Create a cheatsheet note
      cheatsheetNoteId = crypto.randomUUID();
      const csDoc = createCheatsheetDocument({
        title: 'Docker Production Cheatsheet',
        summary: 'Commands for production debugging.',
      });
      await clientA.createNote(workspaceAId, {
        id: cheatsheetNoteId,
        title: 'Docker Production Cheatsheet',
        document: csDoc,
        plainText: 'Docker Production Cheatsheet commands.',
      });
    });

    it('creates, lists, and retrieves saved views scoped to workspace', async () => {
      const createRes = await clientA.createSavedView(workspaceAId, {
        name: 'High Priority Cheatsheets',
        description: 'Cheatsheets and quick reference documents',
        entityType: 'knowledge',
        filter: {
          presetKind: 'all',
          searchQuery: 'Cheatsheet',
          isArchived: false,
        },
        isPinned: true,
      });

      expect(createRes.data).toBeDefined();
      savedViewId = createRes.data.id;
      expect(createRes.data.name).toBe('High Priority Cheatsheets');
      expect(createRes.data.isPinned).toBe(true);
      expect(createRes.data.filter.searchQuery).toBe('Cheatsheet');

      // List saved views
      const listRes = await clientA.listSavedViews(workspaceAId);
      expect(listRes.data).toBeDefined();
      const found = listRes.data.find((v) => v.id === savedViewId);
      expect(found).toBeDefined();
      expect(found?.name).toBe('High Priority Cheatsheets');

      // Get single saved view
      const singleRes = await clientA.getSavedView(workspaceAId, savedViewId);
      expect(singleRes.data.id).toBe(savedViewId);
    });

    it('demonstrates one canonical note body matching across multiple saved views', () => {
      const noteItem = {
        title: 'Docker Production Cheatsheet',
        kind: 'knowledge',
        folderId: 'folder-1',
        isPinned: true,
        isArchived: false,
        tags: ['docker', 'cheatsheet'],
      };

      const viewAFilter: KnowledgeSavedViewFilter = {
        presetKind: 'all',
        searchQuery: 'Docker',
      };

      const viewBFilter: KnowledgeSavedViewFilter = {
        isPinned: true,
        tagNames: ['cheatsheet'],
      };

      const viewCFilter: KnowledgeSavedViewFilter = {
        folderId: 'folder-2', // Different folder
      };

      // The exact same item matches View A and View B without body duplication
      expect(matchesKnowledgeFilter(noteItem, viewAFilter)).toBe(true);
      expect(matchesKnowledgeFilter(noteItem, viewBFilter)).toBe(true);
      // Fails View C because folder does not match
      expect(matchesKnowledgeFilter(noteItem, viewCFilter)).toBe(false);
    });

    it('updates and deletes a saved view cleanly', async () => {
      const updateRes = await clientA.updateSavedView(workspaceAId, savedViewId, {
        name: 'Updated Cheatsheets View',
        isPinned: false,
      });
      expect(updateRes.data.name).toBe('Updated Cheatsheets View');
      expect(updateRes.data.isPinned).toBe(false);

      await clientA.deleteSavedView(workspaceAId, savedViewId);

      const listAfter = await clientA.listSavedViews(workspaceAId);
      expect(listAfter.data.some((v) => v.id === savedViewId)).toBe(false);
    });
  });

  describe('4. Item Links, Backlinks, and Honest Unavailable Target Explanations', () => {
    let sourceItemId: string;
    let targetItemId: string;

    beforeAll(async () => {
      sourceItemId = crypto.randomUUID();
      targetItemId = crypto.randomUUID();

      await clientA.createNote(workspaceAId, {
        id: sourceItemId,
        title: 'API Development Guide',
        document: createGuideDocument({ title: 'API Development Guide' }),
      });

      await clientA.createNote(workspaceAId, {
        id: targetItemId,
        title: 'HTTP Status Codes Reference',
        document: createCheatsheetDocument({ title: 'HTTP Status Codes Reference' }),
      });
    });

    it('creates an item link and resolves both forward links and reverse backlinks', async () => {
      // 1. Create link from source to target
      await clientA.createItemLink(workspaceAId, sourceItemId, {
        targetItemId,
        linkType: 'references',
      });

      // 2. Query resolved links on source (should have outgoing target)
      const sourceLinks = await clientA.getItemResolvedLinks(workspaceAId, sourceItemId);
      expect(sourceLinks.data).toBeDefined();
      const outgoing = sourceLinks.data.filter((l) => l.direction === 'outgoing');
      expect(outgoing.length).toBeGreaterThanOrEqual(1);

      const foundTarget = outgoing.find((l) => l.targetId === targetItemId);
      expect(foundTarget).toBeDefined();
      expect(foundTarget?.isAvailable).toBe(true);
      expect(foundTarget?.targetTitle).toBe('HTTP Status Codes Reference');

      // 3. Query resolved links on target (should have incoming backlink from source)
      const targetLinks = await clientA.getItemResolvedLinks(workspaceAId, targetItemId);
      expect(targetLinks.data).toBeDefined();
      const incoming = targetLinks.data.filter((l) => l.direction === 'incoming');
      expect(incoming.length).toBeGreaterThanOrEqual(1);

      const foundBacklink = incoming.find((l) => l.targetId === sourceItemId);
      expect(foundBacklink).toBeDefined();
      expect(foundBacklink?.isAvailable).toBe(true);
      expect(foundBacklink?.targetTitle).toBe('API Development Guide');
    });

    it('honestly reports unavailable targets when an item is deleted', async () => {
      // Soft-delete the target item
      await clientA.trashNote(workspaceAId, targetItemId);

      // Query resolved links on source
      const res = await clientA.getItemResolvedLinks(workspaceAId, sourceItemId);
      const outgoing = res.data.find((l) => l.targetId === targetItemId);

      expect(outgoing).toBeDefined();
      expect(outgoing?.isAvailable).toBe(false);
      expect(outgoing?.unavailableReason).toBe('deleted');

      // formatUnavailableLinkNotice provides honest explanation
      const notice = formatUnavailableLinkNotice('HTTP Status Codes Reference', 'deleted');
      expect(notice).toContain('has been moved to trash or deleted');
    });

    it('honestly reports non-existent targets as not_found', async () => {
      const nonExistentTargetId = crypto.randomUUID();
      // Directly insert dangling link via adminPool with triggers temporarily bypassed to simulate corrupted dangling rows
      await adminPool.query('ALTER TABLE app.item_links DISABLE TRIGGER ALL;');
      try {
        await adminPool.query(
          `INSERT INTO app.item_links (id, workspace_id, source_item_id, target_item_id, link_type, created_by)
           VALUES ($1, $2, $3, $4, 'references', $5);`,
          [crypto.randomUUID(), workspaceAId, sourceItemId, nonExistentTargetId, userAId]
        );
      } finally {
        await adminPool.query('ALTER TABLE app.item_links ENABLE TRIGGER ALL;');
      }

      const res = await clientA.getItemResolvedLinks(workspaceAId, sourceItemId);
      const dangling = res.data.find((l) => l.targetId === nonExistentTargetId);
      expect(dangling).toBeDefined();
      expect(dangling?.isAvailable).toBe(false);
      expect(dangling?.unavailableReason).toBe('not_found');

      const notice = formatUnavailableLinkNotice('Target', 'not_found');
      expect(notice).toContain('could not be found');

      // Cleanup dangling link
      await adminPool.query('DELETE FROM app.item_links WHERE target_item_id = $1;', [
        nonExistentTargetId,
      ]);
    });
  });

  describe('5. Cross-Tenant Isolation & Workspace Boundary Checks', () => {
    it('strictly isolates saved views between workspaces', async () => {
      // User B creates a saved view in Workspace B
      const viewB = await clientB.createSavedView(workspaceBId, {
        name: 'Bob Secret Cheatsheets',
        entityType: 'knowledge',
      });

      // User A lists saved views in Workspace A -> does NOT see Bob's view
      const listA = await clientA.listSavedViews(workspaceAId);
      expect(listA.data.some((v) => v.id === viewB.data.id)).toBe(false);

      // User A attempts to access Bob's saved view directly in Workspace B -> rejected 403
      await expect(clientA.getSavedView(workspaceBId, viewB.data.id)).rejects.toThrow();

      // User A attempts to update Bob's saved view in Workspace A -> not found
      await expect(
        clientA.updateSavedView(workspaceAId, viewB.data.id, { name: 'Hacked View' })
      ).rejects.toThrow();
    });

    it('rejects cross-tenant item links between workspaces', async () => {
      // Create Note in Workspace B
      const bobNoteId = crypto.randomUUID();
      await clientB.createNote(workspaceBId, {
        id: bobNoteId,
        title: 'Bob Internal Architecture',
        document: createGuideDocument({ title: 'Bob Internal Architecture' }),
      });

      // User A attempts to link Note in Workspace A to Bob's Note in Workspace B
      const aliceNoteId = crypto.randomUUID();
      await clientA.createNote(workspaceAId, {
        id: aliceNoteId,
        title: 'Alice Public Overview',
        document: createGuideDocument({ title: 'Alice Public Overview' }),
      });

      // Attempt link creation to item in another workspace -> MUST throw 404 (NotFoundError)
      await expect(
        clientA.createItemLink(workspaceAId, aliceNoteId, {
          targetItemId: bobNoteId,
        })
      ).rejects.toThrow();

      // If a link row was injected across tenants via database corruption, resolved links MUST NOT reveal Bob's title
      await adminPool.query('ALTER TABLE app.item_links DISABLE TRIGGER ALL;');
      try {
        await adminPool.query(
          `INSERT INTO app.item_links (id, workspace_id, source_item_id, target_item_id, link_type, created_by)
           VALUES ($1, $2, $3, $4, 'references', $5);`,
          [crypto.randomUUID(), workspaceAId, aliceNoteId, bobNoteId, userAId]
        );
      } finally {
        await adminPool.query('ALTER TABLE app.item_links ENABLE TRIGGER ALL;');
      }

      const resolved = await clientA.getItemResolvedLinks(workspaceAId, aliceNoteId);
      const crossLink = resolved.data.find((l) => l.targetId === bobNoteId);
      expect(crossLink).toBeDefined();
      expect(crossLink?.isAvailable).toBe(false);
      // Must not leak the title of the cross-tenant item
      expect(crossLink?.targetTitle).toBeNull();
      expect(crossLink?.unavailableReason).toBe('not_found');

      // Cleanup injected link
      await adminPool.query('DELETE FROM app.item_links WHERE target_item_id = $1;', [bobNoteId]);
    });
  });
});
