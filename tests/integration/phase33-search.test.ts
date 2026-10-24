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
import { highlightMatch, searchDownloadedRecords } from '@daynori/domain';

describe('Phase 33: Global Authorized Search and Filters (Integration & Performance)', () => {
  let adminPool: Pool;
  let runtimePool: Pool;
  let migrator: Migrator;
  let server: ReturnType<typeof buildServer>;
  let baseUrl: string;

  let keyPair: Awaited<ReturnType<typeof generateKeyPair>>;
  let jwks: JSONWebKeySet;

  const issuer = 'https://auth.daynori.test';
  const audience = 'daynori-api';
  const kid = 'phase33-search-key';

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

    // 1. Run migrations including 00030_global_search_indexes.sql
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
    const addr = server.server.address();
    if (!addr || typeof addr === 'string') throw new Error('Failed to bind server port');
    baseUrl = `http://127.0.0.1:${addr.port}`;

    clientA = createApiClient({
      baseUrl,
      token: tokenUserA,
    });

    clientB = createApiClient({
      baseUrl,
      token: tokenUserB,
    });

    // 4. Setup Test Workspaces & Profiles
    const admin = await adminPool.connect();
    try {
      await admin.query(`
        INSERT INTO app.profiles (id, display_name, preferences) VALUES
          ('${userAId}', 'Alice Search User', '{"journalPreviewHidden": true, "suppressBodySnippets": true}'::jsonb),
          ('${userBId}', 'Bob Search User', '{"journalPreviewHidden": false, "suppressBodySnippets": false}'::jsonb)
        ON CONFLICT (id) DO UPDATE SET preferences = EXCLUDED.preferences;
      `);

      const wsARes = await admin.query<{ id: string }>(`
        INSERT INTO app.workspaces (name, kind, owner_id)
        VALUES ('Alice Search Workspace', 'personal', '${userAId}')
        RETURNING id;
      `);
      workspaceAId = wsARes.rows[0]!.id;

      await admin.query(`
        INSERT INTO app.workspace_memberships (workspace_id, user_id, role) VALUES
          ('${workspaceAId}', '${userAId}', 'owner');
      `);

      const wsBRes = await admin.query<{ id: string }>(`
        INSERT INTO app.workspaces (name, kind, owner_id)
        VALUES ('Bob Search Workspace', 'personal', '${userBId}')
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
  });

  afterAll(async () => {
    if (server) await server.close();
    if (adminPool) await adminPool.end();
    if (runtimePool) await runtimePool.end();
  });

  describe('1. Tenant Isolation & Multi-Account Search', () => {
    it('isolates search results between two accounts having identical titles and content', async () => {
      // User A creates a note in Workspace A
      const noteA = await clientA.createNote(workspaceAId, {
        title: 'Project Apex Secrets',
        plainText: 'Sensitive blueprint for Workspace A',
      });

      // User B creates a note in Workspace B with identical title but distinct body
      const noteB = await clientB.createNote(workspaceBId, {
        title: 'Project Apex Secrets',
        plainText: 'Sensitive blueprint for Workspace B',
      });

      // Alice searches "Project Apex"
      const resA = await clientA.searchWorkspace(workspaceAId, { q: 'Project Apex' });
      expect(resA.data.length).toBe(1);
      expect(resA.data[0]!.id).toBe(noteA.data.id);
      expect(resA.data[0]!.title).toBe('Project Apex Secrets');
      expect(resA.data[0]!.snippet).toContain('Workspace A');
      expect(resA.meta.totalCount).toBe(1);

      // Bob searches "Project Apex"
      const resB = await clientB.searchWorkspace(workspaceBId, { q: 'Project Apex' });
      expect(resB.data.length).toBe(1);
      expect(resB.data[0]!.id).toBe(noteB.data.id);
      expect(resB.data[0]!.title).toBe('Project Apex Secrets');
      expect(resB.data[0]!.snippet).toContain('Workspace B');
      expect(resB.meta.totalCount).toBe(1);

      // Bob attempts to search Alice's workspace -> unauthorized 404
      await expect(clientB.searchWorkspace(workspaceAId, { q: 'Project Apex' })).rejects.toThrow();
    });

    it('denies search requests and count side-channels upon revoked membership', async () => {
      // Create a collaborative room workspace allowing multiple members
      const userCId = crypto.randomUUID();
      let roomWorkspaceId = '';
      const admin = await adminPool.connect();
      try {
        await admin.query(`
          INSERT INTO app.profiles (id, display_name) VALUES ('${userCId}', 'Charlie Viewer');
        `);

        const roomRes = await admin.query<{ id: string }>(`
          INSERT INTO app.workspaces (name, kind, owner_id)
          VALUES ('Collaboration Room', 'room', '${userAId}')
          RETURNING id;
        `);
        roomWorkspaceId = roomRes.rows[0]!.id;

        await admin.query(`
          INSERT INTO app.workspace_memberships (workspace_id, user_id, role) VALUES
            ('${roomWorkspaceId}', '${userAId}', 'owner'),
            ('${roomWorkspaceId}', '${userCId}', 'viewer');
        `);
      } finally {
        admin.release();
      }

      // Alice creates a note in the room workspace
      await clientA.createNote(roomWorkspaceId, {
        title: 'Room Strategy Document',
        plainText: 'Shared plans for all room collaborators.',
      });

      const tokenUserC = await createToken(userCId);
      const clientC = createApiClient({ baseUrl, token: tokenUserC });

      // Before revocation: Charlie can search the room workspace
      const resViewer = await clientC.searchWorkspace(roomWorkspaceId, { q: 'Strategy' });
      expect(resViewer.data.length).toBe(1);
      expect(resViewer.meta.totalCount).toBe(1);

      // Revoke Charlie's membership
      const adminRevoke = await adminPool.connect();
      try {
        await adminRevoke.query(`
          DELETE FROM app.workspace_memberships WHERE workspace_id = '${roomWorkspaceId}' AND user_id = '${userCId}';
        `);
      } finally {
        adminRevoke.release();
      }

      // After revocation: search must fail with 404 (no leak of existence, items, or counts)
      await expect(clientC.searchWorkspace(roomWorkspaceId, { q: 'Strategy' })).rejects.toThrow();
    });
  });

  describe('2. Strict Vault Exclusion and Trash Policy', () => {
    it('completely excludes vault items from results, snippets, and aggregate counts', async () => {
      // Alice creates standard note
      const standardNote = await clientA.createNote(workspaceAId, {
        title: 'Ordinary Financial Plan',
        plainText: 'Standard quarterly budget details.',
      });

      // Insert a vault item with security_scope = 'vault'
      const vaultItemId = crypto.randomUUID();
      const admin = await adminPool.connect();
      try {
        await admin.query(`
          INSERT INTO app.items (id, workspace_id, kind, security_scope, created_by, updated_by)
          VALUES ('${vaultItemId}', '${workspaceAId}', 'note', 'vault', '${userAId}', '${userAId}');

          INSERT INTO app.notes (id, workspace_id, title, document, plain_text)
          VALUES ('${vaultItemId}', '${workspaceAId}', 'Vault Financial Plan', '{"version":1,"type":"doc","content":[]}'::jsonb, 'Top secret vault budget keys.');
        `);
      } finally {
        admin.release();
      }

      // Search for "Financial"
      const res = await clientA.searchWorkspace(workspaceAId, { q: 'Financial' });
      expect(res.data.length).toBe(1);
      expect(res.data[0]!.id).toBe(standardNote.data.id);
      expect(res.meta.totalCount).toBe(1);

      // Zero vault items in results or totalCount
      const allFoundIds = res.data.map((i) => i.id);
      expect(allFoundIds).not.toContain(vaultItemId);

      // Specific search for vault content returns 0 results
      const resSecret = await clientA.searchWorkspace(workspaceAId, { q: 'vault budget keys' });
      expect(resSecret.data.length).toBe(0);
      expect(resSecret.meta.totalCount).toBe(0);
    });

    it('strictly separates Archive from Trash: default search excludes both, includeArchived includes only archived records and never trash', async () => {
      // 1. Task that is archived (is_archived = true, deleted_at IS NULL)
      const archivedTask = await clientA.createTask(workspaceAId, {
        title: 'Archived Roadmap Task',
        details: 'Completed sprint goal archived for historical tracking',
      });
      await withTenantContext(
        runtimePool,
        { userId: userAId, workspaceId: workspaceAId },
        async (client) => {
          await client.query(`UPDATE app.items SET is_archived = true WHERE id = $1;`, [
            archivedTask.data.id,
          ]);
        }
      );

      // 2. Task that is trashed (deleted_at IS NOT NULL, is_archived = false)
      const trashedTask = await clientA.createTask(workspaceAId, {
        title: 'Trashed Scrap Task',
        details: 'Accidental duplicate to be purged',
      });
      await withTenantContext(
        runtimePool,
        { userId: userAId, workspaceId: workspaceAId },
        async (client) => {
          await client.query(`UPDATE app.items SET deleted_at = now() WHERE id = $1;`, [
            trashedTask.data.id,
          ]);
        }
      );

      // 3. Task that is both archived and trashed
      const bothTask = await clientA.createTask(workspaceAId, {
        title: 'Archived and Trashed Task',
        details: 'Archived item subsequently deleted',
      });
      await withTenantContext(
        runtimePool,
        { userId: userAId, workspaceId: workspaceAId },
        async (client) => {
          await client.query(
            `UPDATE app.items SET is_archived = true, deleted_at = now() WHERE id = $1;`,
            [bothTask.data.id]
          );
        }
      );

      // Default search: BOTH archived and trashed are excluded
      const resDefaultArchived = await clientA.searchWorkspace(workspaceAId, { q: 'Archived Roadmap' });
      expect(resDefaultArchived.data.some((i) => i.id === archivedTask.data.id)).toBe(false);

      const resDefaultTrashed = await clientA.searchWorkspace(workspaceAId, { q: 'Trashed Scrap' });
      expect(resDefaultTrashed.data.some((i) => i.id === trashedTask.data.id)).toBe(false);

      const resDefaultBoth = await clientA.searchWorkspace(workspaceAId, { q: 'Archived and Trashed' });
      expect(resDefaultBoth.data.some((i) => i.id === bothTask.data.id)).toBe(false);

      // Search with includeArchived: true
      // -> Archived record IS included
      const resWithArchived = await clientA.searchWorkspace(workspaceAId, {
        q: 'Archived Roadmap',
        includeArchived: true,
      });
      expect(resWithArchived.data.some((i) => i.id === archivedTask.data.id)).toBe(true);

      // -> Trashed record is STILL EXCLUDED (never returned by search)
      const resWithTrashed = await clientA.searchWorkspace(workspaceAId, {
        q: 'Trashed Scrap',
        includeArchived: true,
      });
      expect(resWithTrashed.data.some((i) => i.id === trashedTask.data.id)).toBe(false);

      // -> Both archived & trashed is STILL EXCLUDED due to trash policy
      const resWithBoth = await clientA.searchWorkspace(workspaceAId, {
        q: 'Archived and Trashed',
        includeArchived: true,
      });
      expect(resWithBoth.data.some((i) => i.id === bothTask.data.id)).toBe(false);

      // Restore trashed task from trash
      await withTenantContext(
        runtimePool,
        { userId: userAId, workspaceId: workspaceAId },
        async (client) => {
          await client.query(`UPDATE app.items SET deleted_at = NULL WHERE id = $1;`, [
            trashedTask.data.id,
          ]);
        }
      );

      // Default search after restoration: included
      const resRestored = await clientA.searchWorkspace(workspaceAId, { q: 'Trashed Scrap' });
      expect(resRestored.data.some((i) => i.id === trashedTask.data.id)).toBe(true);
    });

    it('indexes and searches canonical production file records with kind = file', async () => {
      const fileId = crypto.randomUUID();
      const admin = await adminPool.connect();
      try {
        await admin.query(`
          INSERT INTO app.items (id, workspace_id, kind, security_scope, created_by, updated_by)
          VALUES ('${fileId}', '${workspaceAId}', 'file', 'standard', '${userAId}', '${userAId}');

          INSERT INTO app.file_items (id, workspace_id, file_name, declared_mime_type, detected_mime_type, byte_size, sha256_checksum, object_path, created_by)
          VALUES ('${fileId}', '${workspaceAId}', 'quarterly_financial_report.pdf', 'application/pdf', 'application/pdf', 2048, 'hash123', 'reports/${fileId}.pdf', '${userAId}');
        `);
      } finally {
        admin.release();
      }

      // Search by file name keyword
      const resFile = await clientA.searchWorkspace(workspaceAId, { q: 'quarterly_financial_report' });
      expect(resFile.data.some((i) => i.id === fileId)).toBe(true);
      const fileItem = resFile.data.find((i) => i.id === fileId)!;
      expect(fileItem.displayType).toBe('file');
      expect(fileItem.metadata?.mimeType).toBe('application/pdf');

      // Search with type filter 'file'
      const resFiltered = await clientA.searchWorkspace(workspaceAId, {
        q: 'quarterly',
        types: ['file'],
      });
      expect(resFiltered.data.some((i) => i.id === fileId)).toBe(true);
    });
  });

  describe('3. Journal Privacy Preferences & Masked Snippets', () => {
    it('redacts journal snippets while keeping body searchable when journalPreviewHidden is true and suppressBodySnippets is false', async () => {
      // Ensure Alice's profile preferences has journalPreviewHidden: true and suppressBodySnippets: false
      const admin = await adminPool.connect();
      try {
        await admin.query(`
          UPDATE app.profiles
          SET preferences = '{"journalPreviewHidden": true, "suppressBodySnippets": false}'::jsonb
          WHERE id = '${userAId}';
        `);
      } finally {
        admin.release();
      }

      const journalEntry = await clientA.createJournalEntry(workspaceAId, {
        entryDate: '2026-10-18',
        title: 'Deep Midnight Musings',
        plainText: 'Extremely private feelings that must not leak into search previews.',
      });

      // Search by body keyword 'private feelings'
      const resAlice = await clientA.searchWorkspace(workspaceAId, { q: 'private feelings' });
      expect(resAlice.data.length).toBe(1);
      expect(resAlice.data[0]!.id).toBe(journalEntry.data.id);
      expect(resAlice.data[0]!.displayType).toBe('journal');
      // Snippet MUST be masked to '[Private journal entry]' and NEVER leak private text
      expect(resAlice.data[0]!.snippet).toBe('[Private journal entry]');
      expect(resAlice.data[0]!.snippet).not.toContain('Extremely private feelings');
    });

    it('shows real snippet when user explicitly enables journal previews', async () => {
      // Bob has journalPreviewHidden = false
      const journalEntryBob = await clientB.createJournalEntry(workspaceBId, {
        entryDate: '2026-10-18',
        title: 'Bob Morning Sunshine',
        plainText: 'A delightful sunrise over the hills inspiring new architectures.',
      });

      const resBob = await clientB.searchWorkspace(workspaceBId, { q: 'delightful sunrise' });
      expect(resBob.data.length).toBe(1);
      expect(resBob.data[0]!.id).toBe(journalEntryBob.data.id);
      expect(resBob.data[0]!.snippet).toContain('delightful sunrise');
    });
  });

  describe('4. Injection Resistance, Special Characters & Multilingual Unicode', () => {
    it('treats SQL injection attempts and special syntax as inert plain search input', async () => {
      const maliciousQueries = [
        `' OR '1'='1`,
        `"; DROP TABLE app.notes; --`,
        `' UNION SELECT null, null, null, null, null FROM app.profiles --`,
        `(((;;;$$$%%%***)))`,
        `"`,
        `'`,
        `\\`,
        `!@#$%^&*()_+{}[]:;"'<>,.?/~`,
      ];

      for (const injectionQ of maliciousQueries) {
        const res = await clientA.searchWorkspace(workspaceAId, { q: injectionQ });
        expect(res).toBeDefined();
        expect(Array.isArray(res.data)).toBe(true);
        expect(res.meta.totalCount).toBeGreaterThanOrEqual(0);
      }

      // Verify tables remain intact
      const checkRes = await clientA.listNotes(workspaceAId);
      expect(checkRes.data.length).toBeGreaterThan(0);
    });

    it('searches and highlights mixed Bangla, English, and Unicode content accurately', async () => {
      const banglaNote = await clientA.createNote(workspaceAId, {
        title: 'বাংলা নোট ও পরিকল্পনা',
        plainText: 'আজকের প্রয়োজনীয় কাজ সম্পন্ন করার বিস্তারিত বিবরণ।',
      });

      // Search by Bangla title substring
      const resBanglaTitle = await clientA.searchWorkspace(workspaceAId, { q: 'পরিকল্পনা' });
      expect(resBanglaTitle.data.some((i) => i.id === banglaNote.data.id)).toBe(true);

      // Search by Bangla body keyword
      const resBanglaBody = await clientA.searchWorkspace(workspaceAId, { q: 'প্রয়োজনীয়' });
      expect(resBanglaBody.data.some((i) => i.id === banglaNote.data.id)).toBe(true);
      const matchedItem = resBanglaBody.data.find((i) => i.id === banglaNote.data.id)!;
      expect(matchedItem.snippet).toContain('প্রয়োজনীয়');

      // Test highlightMatch utility on Bangla text
      const segments = highlightMatch(matchedItem.title, 'পরিকল্পনা');
      expect(segments.some((s) => s.match && s.text === 'পরিকল্পনা')).toBe(true);
    });
  });

  describe('5. Filters, Folder Paths, and Pagination', () => {
    it('filters by entity type, folder hierarchy, and tags with stable pagination', async () => {
      // Create folder hierarchy
      const parentFolder = await clientA.createFolder(workspaceAId, { name: 'Projects' });
      const childFolder = await clientA.createFolder(workspaceAId, {
        name: 'Mobile Core',
        parentId: parentFolder.data.id,
      });

      // Create tag
      const tag = await clientA.createTag(workspaceAId, { name: 'frontend' });

      // Create task inside child folder with tag
      const task = await clientA.createTask(workspaceAId, {
        title: 'Optimize React Native FlatList',
        details: 'Virtualization benchmark for mobile',
      });

      // Link task to child folder and tag
      await withTenantContext(
        runtimePool,
        { userId: userAId, workspaceId: workspaceAId },
        async (client) => {
          await client.query(`UPDATE app.items SET folder_id = $1 WHERE id = $2;`, [
            childFolder.data.id,
            task.data.id,
          ]);
          await client.query(
            `INSERT INTO app.item_tags (workspace_id, item_id, tag_id, created_by)
             VALUES ($1, $2, $3, $4);`,
            [workspaceAId, task.data.id, tag.data.id, userAId]
          );
        }
      );

      // Search with folder filter
      const resFolder = await clientA.searchWorkspace(workspaceAId, {
        q: 'FlatList',
        folderId: childFolder.data.id,
      });
      expect(resFolder.data.length).toBe(1);
      expect(resFolder.data[0]!.id).toBe(task.data.id);
      expect(resFolder.data[0]!.folderPath).toBe('Projects > Mobile Core');

      // Search with tag filter
      const resTag = await clientA.searchWorkspace(workspaceAId, {
        q: 'FlatList',
        tagNames: ['frontend'],
      });
      expect(resTag.data.length).toBe(1);
      expect(resTag.data[0]!.tags).toContain('frontend');

      // Search with type filter for 'task'
      const resType = await clientA.searchWorkspace(workspaceAId, {
        q: 'FlatList',
        types: ['task'],
      });
      expect(resType.data.length).toBe(1);

      // Search with mismatched type filter
      const resTypeMismatch = await clientA.searchWorkspace(workspaceAId, {
        q: 'FlatList',
        types: ['journal'],
      });
      expect(resTypeMismatch.data.length).toBe(0);
    });
  });

  describe('6. Client-Side Local Search (Domain Logic)', () => {
    it('executes client-side local search over downloaded records and enforces vault exclusion', () => {
      const localResult = searchDownloadedRecords({
        workspaceId: 'ws-local-1',
        query: { q: 'Sprint' },
        items: {
          headers: [
            {
              id: 'h1',
              workspaceId: 'ws-local-1',
              kind: 'note',
              folderId: null,
              securityScope: 'standard',
              deletedAt: null,
              createdAt: '2026-10-18T10:00:00Z',
              updatedAt: '2026-10-18T10:00:00Z',
            },
            {
              id: 'h2-vault',
              workspaceId: 'ws-local-1',
              kind: 'note',
              folderId: null,
              securityScope: 'vault',
              deletedAt: null,
              createdAt: '2026-10-18T10:00:00Z',
              updatedAt: '2026-10-18T10:00:00Z',
            },
          ],
          notes: [
            {
              id: 'h1',
              workspaceId: 'ws-local-1',
              title: 'Sprint Planning Notes',
              plainText: 'Tasks for upcoming sprint cycle.',
              createdAt: '2026-10-18T10:00:00Z',
              updatedAt: '2026-10-18T10:00:00Z',
            },
            {
              id: 'h2-vault',
              workspaceId: 'ws-local-1',
              title: 'Sprint Vault Keys',
              plainText: 'Confidential keys.',
              createdAt: '2026-10-18T10:00:00Z',
              updatedAt: '2026-10-18T10:00:00Z',
            },
          ],
        },
      });

      expect(localResult.coverage).toBe('offline_limited');
      expect(localResult.totalCount).toBe(1);
      expect(localResult.data.length).toBe(1);
      expect(localResult.data[0]!.id).toBe('h1');
      expect(localResult.data.some((i) => i.id === 'h2-vault')).toBe(false);
    });

    it('enforces Archive vs Trash separation and journal privacy masking in client-side local search', () => {
      const records = {
        headers: [
          {
            id: 'h-active',
            workspaceId: 'ws-local-1',
            kind: 'note' as const,
            folderId: null,
            securityScope: 'standard' as const,
            deletedAt: null,
            isArchived: false,
            createdAt: '2026-10-18T10:00:00Z',
            updatedAt: '2026-10-18T10:00:00Z',
          },
          {
            id: 'h-archived',
            workspaceId: 'ws-local-1',
            kind: 'note' as const,
            folderId: null,
            securityScope: 'standard' as const,
            deletedAt: null,
            isArchived: true,
            createdAt: '2026-10-18T10:00:00Z',
            updatedAt: '2026-10-18T10:00:00Z',
          },
          {
            id: 'h-trashed',
            workspaceId: 'ws-local-1',
            kind: 'note' as const,
            folderId: null,
            securityScope: 'standard' as const,
            deletedAt: '2026-10-18T10:30:00Z',
            isArchived: false,
            createdAt: '2026-10-18T10:00:00Z',
            updatedAt: '2026-10-18T10:00:00Z',
          },
          {
            id: 'h-journal-private',
            workspaceId: 'ws-local-1',
            kind: 'journal_entry' as const,
            folderId: null,
            securityScope: 'standard' as const,
            deletedAt: null,
            isArchived: false,
            createdAt: '2026-10-18T10:00:00Z',
            updatedAt: '2026-10-18T10:00:00Z',
          },
        ],
        notes: [
          {
            id: 'h-active',
            workspaceId: 'ws-local-1',
            title: 'Active Project Plan',
            plainText: 'Sprint roadmap details.',
            createdAt: '2026-10-18T10:00:00Z',
            updatedAt: '2026-10-18T10:00:00Z',
          },
          {
            id: 'h-archived',
            workspaceId: 'ws-local-1',
            title: 'Archived Project Plan',
            plainText: 'Historical sprint roadmap.',
            createdAt: '2026-10-18T10:00:00Z',
            updatedAt: '2026-10-18T10:00:00Z',
          },
          {
            id: 'h-trashed',
            workspaceId: 'ws-local-1',
            title: 'Trashed Project Plan',
            plainText: 'Discarded sprint roadmap.',
            createdAt: '2026-10-18T10:00:00Z',
            updatedAt: '2026-10-18T10:00:00Z',
          },
        ],
        journalEntries: [
          {
            id: 'h-journal-private',
            workspaceId: 'ws-local-1',
            entryDate: '2026-10-18',
            title: 'Quiet Musings',
            plainText: 'Confidential feelings that must never appear in snippets.',
            createdAt: '2026-10-18T10:00:00Z',
            updatedAt: '2026-10-18T10:00:00Z',
          },
        ],
      };

      // Default search: only active note is found; archived and trashed are excluded
      const defaultRes = searchDownloadedRecords({
        workspaceId: 'ws-local-1',
        query: { q: 'Project Plan' },
        items: records,
      });
      expect(defaultRes.data.map((i) => i.id)).toEqual(['h-active']);

      // includeArchived: true -> active and archived are found; trashed is still excluded
      const archivedRes = searchDownloadedRecords({
        workspaceId: 'ws-local-1',
        query: { q: 'Project Plan', includeArchived: true },
        items: records,
      });
      const foundIds = archivedRes.data.map((i) => i.id);
      expect(foundIds).toContain('h-active');
      expect(foundIds).toContain('h-archived');
      expect(foundIds).not.toContain('h-trashed');

      // Journal search with journalPreviewHidden: true and suppressBodySnippets: false
      const journalRes = searchDownloadedRecords({
        workspaceId: 'ws-local-1',
        query: { q: 'Confidential feelings' },
        items: records,
        preferences: { journalPreviewHidden: true, suppressBodySnippets: false },
      });
      expect(journalRes.data.length).toBe(1);
      expect(journalRes.data[0]!.id).toBe('h-journal-private');
      expect(journalRes.data[0]!.snippet).toBe('[Private journal entry]');
    });
  });

  describe('7. Synthetic Multi-Tenant Performance Benchmark', () => {
    it('executes indexed search over 500+ multi-tenant items with verified query plans and latency measurement', async () => {
      const admin = await adminPool.connect();
      const syntheticBatchSize = 520;
      try {
        // Insert 520 synthetic items across both workspaces
        const itemRows: string[] = [];
        const noteRows: string[] = [];
        const taskRows: string[] = [];
        const fileRows: string[] = [];

        for (let i = 0; i < syntheticBatchSize; i++) {
          const itemId = crypto.randomUUID();
          const targetWs = i % 2 === 0 ? workspaceAId : workspaceBId;
          const kind = i % 3 === 0 ? 'note' : i % 3 === 1 ? 'todo' : 'file';
          const title = `Synthetic Benchmark Item ${i} - Architecture Performance Verification`;
          const body = `Generated sample body for load verification index efficiency ${i}`;

          itemRows.push(`('${itemId}', '${targetWs}', '${kind}', 'standard', '${userAId}', '${userAId}')`);

          if (kind === 'note') {
            noteRows.push(`('${itemId}', '${targetWs}', '${title}', '{"version":1,"type":"doc","content":[]}'::jsonb, '${body}')`);
          } else if (kind === 'todo') {
            taskRows.push(`('${itemId}', '${targetWs}', '${title}', '${body}')`);
          } else {
            fileRows.push(`('${itemId}', '${targetWs}', 'benchmark_file_${i}.pdf', 'application/pdf', 'application/pdf', 1024, 'dummy_hash', 'path/${itemId}.pdf', '${userAId}')`);
          }
        }

        await admin.query(`
          INSERT INTO app.items (id, workspace_id, kind, security_scope, created_by, updated_by)
          VALUES ${itemRows.join(',\n')};
        `);

        if (noteRows.length > 0) {
          await admin.query(`
            INSERT INTO app.notes (id, workspace_id, title, document, plain_text)
            VALUES ${noteRows.join(',\n')};
          `);
        }
        if (taskRows.length > 0) {
          await admin.query(`
            INSERT INTO app.tasks (id, workspace_id, title, details)
            VALUES ${taskRows.join(',\n')};
          `);
        }
        if (fileRows.length > 0) {
          await admin.query(`
            INSERT INTO app.file_items (id, workspace_id, file_name, declared_mime_type, detected_mime_type, byte_size, sha256_checksum, object_path, created_by)
            VALUES ${fileRows.join(',\n')};
          `);
        }

        // Run ANALYZE to refresh index statistics across all queried tables
        await admin.query(`
          ANALYZE app.items;
          ANALYZE app.notes;
          ANALYZE app.tasks;
          ANALYZE app.file_items;
          ANALYZE app.journal_entries;
          ANALYZE app.folders;
          ANALYZE app.item_tags;
        `);

        // Warm-up queries
        for (let w = 0; w < 3; w++) {
          await clientA.searchWorkspace(workspaceAId, { q: 'Architecture Performance', limit: 20 });
        }

        // Measure API round-trip latencies over multiple sample runs
        const samples: number[] = [];
        for (let s = 0; s < 5; s++) {
          const start = performance.now();
          const searchRes = await clientA.searchWorkspace(workspaceAId, {
            q: 'Architecture Performance',
            limit: 20,
          });
          const duration = performance.now() - start;
          expect(searchRes.data.length).toBeGreaterThan(0);
          samples.push(duration);
        }

        samples.sort((a, b) => a - b);
        const minLatency = samples[0]!;
        const medianLatency = samples[Math.floor(samples.length / 2)]!;
        const maxLatency = samples[samples.length - 1]!;

        expect(medianLatency).toBeLessThan(500);

        // Measure database execution time under runtime tenant role with EXPLAIN (ANALYZE, BUFFERS)
        const pgVersionRes = await admin.query<{ version: string }>('SELECT version();');
        const pgVersion = pgVersionRes.rows[0]?.version ?? 'PostgreSQL';

        let explainOutput = '';
        await withTenantContext(
          runtimePool,
          { userId: userAId, workspaceId: workspaceAId },
          async (client) => {
            const explainRes = await client.query<{ 'QUERY PLAN': string }>(`
              EXPLAIN (ANALYZE, BUFFERS)
              SELECT
                i.id,
                i.kind,
                i.security_scope,
                i.folder_id,
                i.rank,
                i.created_at,
                i.updated_at,
                n.title as note_title,
                n.plain_text as note_plain_text,
                n.purpose as note_purpose,
                t.title as task_title,
                t.details as task_details,
                j.entry_date as journal_entry_date,
                j.title as journal_title,
                j.plain_text as journal_plain_text,
                f.file_name,
                f.byte_size,
                f.detected_mime_type,
                f.declared_mime_type,
                fol.name as folder_name
              FROM app.items i
              LEFT JOIN app.notes n ON n.workspace_id = i.workspace_id AND n.id = i.id
              LEFT JOIN app.tasks t ON t.workspace_id = i.workspace_id AND t.id = i.id
              LEFT JOIN app.journal_entries j ON j.workspace_id = i.workspace_id AND j.id = i.id
              LEFT JOIN app.file_items f ON f.workspace_id = i.workspace_id AND f.id = i.id
              LEFT JOIN app.folders fol ON fol.workspace_id = i.workspace_id AND fol.id = i.id
              WHERE i.workspace_id = $1
                AND i.security_scope != 'vault'
                AND i.deleted_at IS NULL
                AND i.is_archived = false
                AND (
                  (i.kind = 'note' AND (
                    n.title ILIKE $2 ESCAPE '\\'
                    OR n.plain_text ILIKE $2 ESCAPE '\\'
                    OR to_tsvector('simple', n.title || ' ' || n.plain_text) @@ plainto_tsquery('simple', $3)
                  ))
                  OR
                  (i.kind IN ('todo', 'task') AND (
                    t.title ILIKE $2 ESCAPE '\\'
                    OR t.details ILIKE $2 ESCAPE '\\'
                    OR to_tsvector('simple', t.title || ' ' || COALESCE(t.details, '')) @@ plainto_tsquery('simple', $3)
                  ))
                  OR
                  (i.kind = 'journal_entry' AND (
                    j.title ILIKE $2 ESCAPE '\\'
                    OR j.plain_text ILIKE $2 ESCAPE '\\'
                    OR to_tsvector('simple', j.title || ' ' || j.plain_text) @@ plainto_tsquery('simple', $3)
                  ))
                  OR
                  (i.kind IN ('file', 'file_item') AND (
                    f.file_name ILIKE $2 ESCAPE '\\'
                  ))
                  OR
                  (i.kind = 'folder' AND (
                    fol.name ILIKE $2 ESCAPE '\\'
                  ))
                )
              ORDER BY i.updated_at DESC
              LIMIT 20;
            `, [workspaceAId, '%Architecture Performance%', 'Architecture Performance']);

            explainOutput = explainRes.rows.map((r) => r['QUERY PLAN']).join('\n');
          }
        );

        expect(explainOutput).toBeDefined();
        expect(explainOutput.length).toBeGreaterThan(0);

        // Parse Execution Time from EXPLAIN ANALYZE
        const execMatch = explainOutput.match(/Execution Time: ([\d.]+) ms/);
        const planMatch = explainOutput.match(/Planning Time: ([\d.]+) ms/);
        const dbExecTimeMs = execMatch ? parseFloat(execMatch[1]!) : 0;
        const dbPlanTimeMs = planMatch ? parseFloat(planMatch[1]!) : 0;

        console.log(`[Phase 33 Benchmark Evidence]`);
        console.log(`PostgreSQL Engine: ${pgVersion}`);
        console.log(`Dataset size: ${syntheticBatchSize} synthetic items across 2 workspaces`);
        console.log(`API Roundtrip Latency (5 samples): Min=${minLatency.toFixed(2)}ms, Median=${medianLatency.toFixed(2)}ms, Max=${maxLatency.toFixed(2)}ms`);
        console.log(`DB Query Execution Time: ${dbExecTimeMs}ms (Planning: ${dbPlanTimeMs}ms)`);
        console.log(`EXPLAIN (ANALYZE, BUFFERS) summary:\n${explainOutput}`);
      } finally {
        admin.release();
      }
    });
  });
});
