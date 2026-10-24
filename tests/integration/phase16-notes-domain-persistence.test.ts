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
import type { NoteDocument } from '@daynori/domain';
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

describe('Phase 16: Typed Note Domain and Persistence (Integration & Contracts)', () => {
  let adminPool: Pool;
  let runtimePool: Pool;
  let migrator: Migrator;
  let server: ReturnType<typeof buildServer>;
  let baseUrl: string;

  let keyPair: Awaited<ReturnType<typeof generateKeyPair>>;
  let jwks: JSONWebKeySet;

  const issuer = 'https://auth.daynori.test';
  const audience = 'daynori-api';
  const kid = 'phase16-notes-key';

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
        INSERT INTO app.profiles (id, display_name) VALUES
          ('${userAId}', 'Alice Notes User'),
          ('${userBId}', 'Bob Collaborator')
        ON CONFLICT (id) DO NOTHING;
      `);

      const wsARes = await admin.query<{ id: string }>(`
        INSERT INTO app.workspaces (name, kind, owner_id)
        VALUES ('Alice Notes Workspace', 'personal', '${userAId}')
        RETURNING id;
      `);
      workspaceAId = wsARes.rows[0]!.id;

      await admin.query(`
        INSERT INTO app.workspace_memberships (workspace_id, user_id, role) VALUES
          ('${workspaceAId}', '${userAId}', 'owner');
      `);

      const wsBRes = await admin.query<{ id: string }>(`
        INSERT INTO app.workspaces (name, kind, owner_id)
        VALUES ('Bob Notes Workspace', 'personal', '${userBId}')
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
    await clearAllLocalData();
  });

  describe('Suite 1: Note Creation, Document AST, and Bangla/Unicode round-trip', () => {
    it('creates a note with complex AST blocks and preserves Bangla Unicode text', async () => {
      const banglaDocument: NoteDocument = {
        version: 1,
        type: 'doc',
        content: [
          {
            type: 'heading',
            level: 1,
            content: [{ type: 'text', text: 'দৈনন্দিন জীবন ও কর্মপরিকল্পনা' }],
          },
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'এটি একটি ' },
              { type: 'text', text: 'গুরুত্বপূর্ণ নোট', marks: ['bold'] },
              { type: 'text', text: ' যা বাংলা যুক্তবর্ণ (ক্ষ, জ্ঞ, ষ্ণ, ক্ত, ত্র) যাচাই করে।' },
            ],
          },
          {
            type: 'checklist',
            items: [
              {
                type: 'checklist_item',
                checked: true,
                content: [{ type: 'text', text: 'সকালের নামাজ ও কোরআন পাঠ সম্পন্ন' }],
              },
              {
                type: 'checklist_item',
                checked: false,
                content: [{ type: 'text', text: 'বাজারের তালিকা প্রস্তুত করা' }],
              },
            ],
          },
          {
            type: 'bullet_list',
            items: [
              {
                type: 'list_item',
                content: [{ type: 'text', text: 'প্রথম বিষয়: অধ্যবসায় ও সততা' }],
              },
              {
                type: 'list_item',
                content: [{ type: 'text', text: 'দ্বিতীয় বিষয়: শারীরিক সুস্থতা' }],
              },
            ],
          },
        ],
      };

      const res = await clientA.createNote(workspaceAId, {
        title: 'দৈনন্দিন জীবন ও কর্মপরিকল্পনা',
        document: banglaDocument,
        isPinned: true,
      });

      expect(res.data.id).toBeDefined();
      expect(res.data.title).toBe('দৈনন্দিন জীবন ও কর্মপরিকল্পনা');
      expect(res.data.isPinned).toBe(true);
      expect(res.data.revision).toBe(1);
      expect(res.data.wordCount).toBeGreaterThan(10);
      expect(res.data.charCount).toBeGreaterThan(50);
      expect(res.data.plainText).toContain('সকালের নামাজ ও কোরআন পাঠ সম্পন্ন');
      expect(res.data.plainText).toContain('বাজারের তালিকা প্রস্তুত করা');

      // Fetch back via API
      const fetched = await clientA.getNote(workspaceAId, res.data.id);
      expect(fetched.data.title).toBe('দৈনন্দিন জীবন ও কর্মপরিকল্পনা');
      expect(fetched.data.document).toEqual(banglaDocument);
      expect(fetched.data.plainText).toBe(res.data.plainText);

      // Verify physical persistence in PostgreSQL via runtimePool
      await withTenantContext(
        runtimePool,
        { userId: userAId, workspaceId: workspaceAId },
        async (client) => {
          const dbRes = await client.query<{
            title: string;
            document: NoteDocument;
            plain_text: string;
            word_count: number;
          }>(
            `SELECT title, document, plain_text, word_count FROM app.notes WHERE workspace_id = $1 AND id = $2;`,
            [workspaceAId, res.data.id]
          );
          expect(dbRes.rows).toHaveLength(1);
          expect(dbRes.rows[0]!.title).toBe('দৈনন্দিন জীবন ও কর্মপরিকল্পনা');
          expect(dbRes.rows[0]!.document).toEqual(banglaDocument);
          expect(dbRes.rows[0]!.plain_text).toBe(res.data.plainText);
        }
      );
    });

    it('creates an empty note with default untitled title when given empty content', async () => {
      const res = await clientA.createNote(workspaceAId, {});
      expect(res.data.title).toBe('Untitled');
      expect(res.data.document.type).toBe('doc');
      expect(res.data.document.content).toHaveLength(0);
      expect(res.data.plainText).toBe('');
      expect(res.data.wordCount).toBe(0);
      expect(res.data.charCount).toBe(0);
    });

    it('creates a note from plain text and correctly infers paragraphs', async () => {
      const text =
        'First line of thoughts.\n\nSecond paragraph with details.\nThird line immediately after.';
      const res = await clientA.createNote(workspaceAId, {
        plainText: text,
      });

      expect(res.data.title).toBe('First line of thoughts.');
      expect(res.data.document.content.length).toBeGreaterThanOrEqual(2);
      expect(res.data.plainText).toBe(text);
      expect(res.data.wordCount).toBe(12);
    });
  });

  describe('Suite 2: Size Limits Enforcement & Inert Script Sanitization', () => {
    it('rejects oversized note documents exceeding 512 KiB limit', async () => {
      const largeText = 'A'.repeat(550 * 1024);
      const oversizedDoc: NoteDocument = {
        version: 1,
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: largeText }],
          },
        ],
      };

      await expect(
        clientA.createNote(workspaceAId, {
          title: 'Too Large Note',
          document: oversizedDoc,
        })
      ).rejects.toThrow();
    });

    it('preserves literal programming examples and code markup as inert text without executing while stripping null bytes', async () => {
      const codeDoc: NoteDocument = {
        version: 1,
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'Hello List<T> <script>alert("pwned")</script> World\0',
              },
            ],
          },
        ],
      };

      const res = await clientA.createNote(workspaceAId, {
        title: 'Literal Preservation Test',
        document: codeDoc,
      });

      // The document text should preserve literal angle brackets and code examples, stripping only null byte
      const plainText = res.data.plainText;
      expect(plainText).toContain('List<T>');
      expect(plainText).toContain('<script>alert("pwned")</script>');
      expect(plainText).toContain('Hello');
      expect(plainText).toContain('World');
      expect(plainText).not.toContain('\0');
    });
  });

  describe('Suite 3: Folder Placement, Move Between Folders, and Tag/Archive/Pin', () => {
    it('places notes inside folders and supports reparenting and sorting', async () => {
      // 1. Create a parent folder
      const folderRes = await clientA.createFolder(workspaceAId, {
        name: 'Work Projects',
      });
      const folderId = folderRes.data.id;

      // 2. Create note in folder
      const noteRes = await clientA.createNote(workspaceAId, {
        title: 'Project Alpha Brief',
        folderId,
        rank: '00001000',
        isPinned: true,
      });
      expect(noteRes.data.folderId).toBe(folderId);
      expect(noteRes.data.isPinned).toBe(true);

      // 3. List notes in folder
      const listInFolder = await clientA.listNotes(workspaceAId, { folderId });
      expect(listInFolder.data.some((n) => n.id === noteRes.data.id)).toBe(true);

      // 4. Move note to root
      const updateRes = await clientA.updateNote(workspaceAId, noteRes.data.id, {
        folderId: null,
        baseRevision: 1,
      });
      expect(updateRes.data.folderId).toBeNull();
      expect(updateRes.data.revision).toBe(2);

      // 5. Verify note no longer in folder
      const listAfterMove = await clientA.listNotes(workspaceAId, { folderId });
      expect(listAfterMove.data.some((n) => n.id === noteRes.data.id)).toBe(false);

      // 6. Archive note
      await clientA.updateNote(workspaceAId, noteRes.data.id, {
        isArchived: true,
        baseRevision: 2,
      });

      // 7. List unarchived does not include it
      const activeNotes = await clientA.listNotes(workspaceAId, { isArchived: false });
      expect(activeNotes.data.some((n) => n.id === noteRes.data.id)).toBe(false);

      // 8. List archived includes it
      const archivedNotes = await clientA.listNotes(workspaceAId, { isArchived: true });
      expect(archivedNotes.data.some((n) => n.id === noteRes.data.id)).toBe(true);
    });

    it('rejects placing a note into a non-existent folder', async () => {
      const nonExistentFolderId = crypto.randomUUID();
      await expect(
        clientA.createNote(workspaceAId, {
          title: 'Invalid Folder Note',
          folderId: nonExistentFolderId,
        })
      ).rejects.toThrow();
    });
  });

  describe('Suite 4: Precondition Revision Check & HTTP 409 Conflict Handling', () => {
    it('detects concurrent edits and returns conflict error on stale baseRevision', async () => {
      const note = await clientA.createNote(workspaceAId, {
        title: 'Conflict Test Note',
        plainText: 'Initial text.',
      });
      expect(note.data.revision).toBe(1);

      // Client 1 updates note with baseRevision: 1 -> succeeds
      const update1 = await clientA.updateNote(workspaceAId, note.data.id, {
        title: 'Updated by Client 1',
        plainText: 'Text version 2.',
        baseRevision: 1,
      });
      expect(update1.data.revision).toBe(2);

      // Client 2 attempts to update note with stale baseRevision: 1 -> rejected with HTTP 409
      await expect(
        clientA.updateNote(workspaceAId, note.data.id, {
          title: 'Updated by Client 2 (stale)',
          plainText: 'Conflicting text.',
          baseRevision: 1,
        })
      ).rejects.toThrow(/REVISION_CONFLICT/);

      // Updating with correct baseRevision: 2 -> succeeds
      const update2 = await clientA.updateNote(workspaceAId, note.data.id, {
        title: 'Updated by Client 2 (rebased)',
        plainText: 'Text version 3.',
        baseRevision: 2,
      });
      expect(update2.data.revision).toBe(3);
      expect(update2.data.title).toBe('Updated by Client 2 (rebased)');
    });
  });

  describe('Suite 5: Multi-Client Sync & Offline Note Creation via SyncEngine', () => {
    it('creates an offline note, persists local draft, and flushes to PostgreSQL on reconnection', async () => {
      setTrustedDeviceConsent(true);

      const repo1 = new IndexedDbLocalRepository();
      await repo1.initialize({ userId: userAId, workspaceId: workspaceAId });

      const transport1 = new ApiClientSyncTransport(clientA, workspaceAId);
      const engine1 = new SyncEngine({
        namespace: { userId: userAId, workspaceId: workspaceAId },
        deviceId: 'device-alice-1',
        repository: repo1,
        transport: transport1,
        initialNetworkStatus: 'offline', // start offline!
      });

      await engine1.start();
      expect(engine1.getNetworkStatus()).toBe('offline');

      // 1. Create offline note
      const offlineNoteId = crypto.randomUUID();
      const offlineDoc: NoteDocument = {
        version: 1,
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Draft written entirely offline in cabin.' }],
          },
        ],
      };

      const pendingMutation = await engine1.saveItem(
        {
          id: offlineNoteId,
          workspaceId: workspaceAId,
          kind: 'note',
          folderId: null,
          rank: '00001000',
          isArchived: false,
          isPinned: false,
          securityScope: 'standard',
          serverRevision: 0,
          title: 'Offline Cabin Journal',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          deletedAt: null,
        },
        {
          id: crypto.randomUUID(),
          workspaceId: workspaceAId,
          userId: userAId,
          entityType: 'note',
          entityId: offlineNoteId,
          title: 'Offline Cabin Journal',
          payload: {
            document: offlineDoc,
            plainText: 'Draft written entirely offline in cabin.',
          },
          savedAt: new Date().toISOString(),
          isQuarantined: false,
          quarantinedAt: null,
        }
      );

      expect(pendingMutation.status).toBe('pending');
      const itemSyncState = engine1.getItemSyncState(offlineNoteId);
      expect(itemSyncState.savedOnDevice).toBe(true);
      expect(itemSyncState.cloudSyncStatus).toBe('saved_locally');

      // 2. Reconnect online and flush sync
      engine1.setNetworkStatus('online');
      await engine1.syncNow();

      // Verify item state is now synced
      const syncedState = engine1.getItemSyncState(offlineNoteId);
      expect(syncedState.cloudSyncStatus).toBe('synced');

      // 3. Verify server received and persisted the note in PostgreSQL
      const serverNote = await clientA.getNote(workspaceAId, offlineNoteId);
      expect(serverNote.data.title).toBe('Offline Cabin Journal');
      expect(serverNote.data.plainText).toBe('Draft written entirely offline in cabin.');
      expect(serverNote.data.revision).toBe(1);

      await engine1.stop();
      await repo1.close();
    });
  });

  describe('Suite 6: Cross-Tenant RLS & Membership Isolation', () => {
    it('strictly forbids User B from reading or modifying User A notes', async () => {
      // 1. Create a private note in User A's workspace
      const noteA = await clientA.createNote(workspaceAId, {
        title: 'Alice Confidential Thoughts',
        plainText: 'Personal reflection.',
      });

      // 2. User B tries to read noteA via API -> HTTP 403 Forbidden
      await expect(clientB.getNote(workspaceAId, noteA.data.id)).rejects.toThrow();

      // 3. User B tries to update noteA via API -> HTTP 403 Forbidden
      await expect(
        clientB.updateNote(workspaceAId, noteA.data.id, {
          title: 'Hacked by Bob',
          baseRevision: 1,
        })
      ).rejects.toThrow();

      // 4. Verify PostgreSQL Row-Level Security directly
      await withTenantContext(
        runtimePool,
        { userId: userBId, workspaceId: workspaceBId },
        async (client) => {
          // Bob cannot see Alice's note in app.notes even if specifying noteA ID
          const res = await client.query(`SELECT id, title FROM app.notes WHERE id = $1;`, [
            noteA.data.id,
          ]);
          expect(res.rows).toHaveLength(0);
        }
      );
    });
  });

  describe('Suite 7: Note Trash and Restoration', () => {
    it('trashes a note and restores it cleanly with revision increments', async () => {
      const note = await clientA.createNote(workspaceAId, {
        title: 'Temporary Scratchpad',
        plainText: 'This will be deleted and restored.',
      });

      // 1. Trash note
      const trashRes = await clientA.trashNote(workspaceAId, note.data.id);
      expect(trashRes.data.id).toBe(note.data.id);
      expect(trashRes.data.revision).toBe(2);

      // 2. getNote returns 404 (in trash)
      await expect(clientA.getNote(workspaceAId, note.data.id)).rejects.toThrow(/not found|trash/i);

      // 3. listNotes excludes trashed note
      const list = await clientA.listNotes(workspaceAId, {});
      expect(list.data.some((n) => n.id === note.data.id)).toBe(false);

      // 4. Restore note
      const restored = await clientA.restoreNote(workspaceAId, note.data.id);
      expect(restored.data.id).toBe(note.data.id);
      expect(restored.data.revision).toBe(3);
      expect(restored.data.deletedAt).toBeNull();

      // 5. getNote succeeds again
      const fetched = await clientA.getNote(workspaceAId, note.data.id);
      expect(fetched.data.title).toBe('Temporary Scratchpad');
      expect(fetched.data.revision).toBe(3);
    });
  });
});
