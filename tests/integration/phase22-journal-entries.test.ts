import crypto from 'node:crypto';
import 'fake-indexeddb/auto';
import { generateKeyPair, SignJWT, exportJWK, type JSONWebKeySet } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { DatabaseSync } from 'node:sqlite';
import { buildServer, JwtVerifier } from '../../apps/api/src/index.js';
import { createAdminPool, createRuntimePool } from '../../apps/api/src/db/index.js';
import { Migrator } from '../../infra/supabase/migrator.js';
import { createApiClient, DaynoriApiClient } from '@daynori/api-client';
import type { NoteDocument } from '@daynori/domain';
import { isEntryBackdated } from '@daynori/domain';
import { SyncEngine, ApiClientSyncTransport, type JournalEntryRecord } from '@daynori/sync';
import {
  IndexedDbLocalRepository,
  clearAllLocalData,
  setTrustedDeviceConsent,
} from '../../apps/web/src/data/indexedDbRepository.js';
import {
  SqliteLocalRepository,
  type SqliteDatabaseContract,
} from '../../apps/mobile/src/data/sqliteRepository.js';
import { MobileKeyManager } from '../../apps/mobile/src/data/keyManager.js';
import type { SecureStoreContract } from '../../apps/mobile/src/auth/secureStorage.js';
import { SafeLogger, type StructuredLogEntry } from '../../apps/api/src/plugins/logger.js';

// Node.js DatabaseSync adapter for zero-mock testing of SQLite repository
class NodeSqliteAdapter implements SqliteDatabaseContract {
  constructor(private db: DatabaseSync) {}

  async execAsync(source: string): Promise<void> {
    this.db.exec(source);
  }

  async runAsync(
    source: string,
    ...params: unknown[]
  ): Promise<{ changes: number; lastInsertRowId: number }> {
    const stmt = this.db.prepare(source);
    const result = stmt.run(...(params as (string | number | bigint | null | Buffer)[]));
    return {
      changes: Number(result.changes),
      lastInsertRowId: Number(result.lastInsertRowid),
    };
  }

  async getFirstAsync<T = unknown>(source: string, ...params: unknown[]): Promise<T | null> {
    const stmt = this.db.prepare(source);
    const row = stmt.get(...(params as (string | number | bigint | null | Buffer)[]));
    return (row as T) ?? null;
  }

  async getAllAsync<T = unknown>(source: string, ...params: unknown[]): Promise<T[]> {
    const stmt = this.db.prepare(source);
    const rows = stmt.all(...(params as (string | number | bigint | null | Buffer)[]));
    return rows as T[];
  }

  async withTransactionAsync<T>(task: () => Promise<T>): Promise<T> {
    this.db.exec('BEGIN TRANSACTION;');
    try {
      const res = await task();
      this.db.exec('COMMIT;');
      return res;
    } catch (err) {
      this.db.exec('ROLLBACK;');
      throw err;
    }
  }

  async closeAsync(): Promise<void> {
    this.db.close();
  }
}

class MemorySecureStore implements SecureStoreContract {
  private store = new Map<string, string>();
  async getItemAsync(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }
  async setItemAsync(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }
  async deleteItemAsync(key: string): Promise<void> {
    this.store.delete(key);
  }
}

// In-memory localStorage mock for Node test environment
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

describe('Phase 22: Journal Entries and Privacy Defaults (Integration Tests)', () => {
  let adminPool: Pool;
  let runtimePool: Pool;
  let migrator: Migrator;
  let server: ReturnType<typeof buildServer>;
  let baseUrl: string;

  let keyPair: Awaited<ReturnType<typeof generateKeyPair>>;
  let jwks: JSONWebKeySet;

  const issuer = 'https://auth.daynori.test';
  const audience = 'daynori-api';
  const kid = 'phase22-journal-key';

  const userAId = crypto.randomUUID();
  const userBId = crypto.randomUUID();
  let tokenUserA: string;
  let tokenUserB: string;
  let clientA: DaynoriApiClient;
  let clientB: DaynoriApiClient;

  let workspaceAId: string; // Personal workspace
  let workspaceBId: string; // Personal workspace
  let sharedWorkspaceId: string; // Shared workspace to test isolation

  const capturedLogs: StructuredLogEntry[] = [];
  const CANARY_STRING = 'CANARY_SENSITIVE_JOURNAL_CONTENT_998877';

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

    // 3. Start API Server with in-memory JWKS verifier and log capturing
    const jwtVerifier = new JwtVerifier({
      issuer,
      audience,
      localJwks: jwks,
    });

    const safeLogger = new SafeLogger((entry) => {
      capturedLogs.push(entry);
    });

    server = buildServer({
      jwtVerifier,
      runtimePool,
      logger: safeLogger,
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
          ('${userAId}', 'Alice Journal User'),
          ('${userBId}', 'Bob Journal User')
        ON CONFLICT (id) DO NOTHING;
      `);

      // Personal workspace A
      const wsARes = await admin.query<{ id: string }>(`
        INSERT INTO app.workspaces (name, kind, owner_id)
        VALUES ('Alice Personal Workspace', 'personal', '${userAId}')
        RETURNING id;
      `);
      workspaceAId = wsARes.rows[0]!.id;

      await admin.query(`
        INSERT INTO app.workspace_memberships (workspace_id, user_id, role) VALUES
          ('${workspaceAId}', '${userAId}', 'owner');
      `);

      // Personal workspace B
      const wsBRes = await admin.query<{ id: string }>(`
        INSERT INTO app.workspaces (name, kind, owner_id)
        VALUES ('Bob Personal Workspace', 'personal', '${userBId}')
        RETURNING id;
      `);
      workspaceBId = wsBRes.rows[0]!.id;

      await admin.query(`
        INSERT INTO app.workspace_memberships (workspace_id, user_id, role) VALUES
          ('${workspaceBId}', '${userBId}', 'owner');
      `);

      // Shared workspace (for isolation testing)
      const wsSharedRes = await admin.query<{ id: string }>(`
        INSERT INTO app.workspaces (name, kind, owner_id)
        VALUES ('Shared Team Room', 'room', '${userAId}')
        RETURNING id;
      `);
      sharedWorkspaceId = wsSharedRes.rows[0]!.id;

      await admin.query(`
        INSERT INTO app.workspace_memberships (workspace_id, user_id, role) VALUES
          ('${sharedWorkspaceId}', '${userAId}', 'owner'),
          ('${sharedWorkspaceId}', '${userBId}', 'editor');
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

  describe('Suite 1: Multiple Entries Per Date & Intentional Backdating', () => {
    it('creates and lists multiple entries on the same date without overwriting', async () => {
      const date = '2026-10-16';

      const entry1 = await clientA.createJournalEntry(workspaceAId, {
        title: 'Morning Reflections',
        entryDate: date,
        plainText: 'Started the morning with quiet contemplation.',
        mood: 'calm',
        prompts: [{ prompt: 'Morning intention?', response: 'Stay centered and present.' }],
        tags: ['morning', 'mindfulness'],
      });

      const entry2 = await clientA.createJournalEntry(workspaceAId, {
        title: 'Evening Log',
        entryDate: date,
        plainText: 'Walked in the park at sunset.',
        mood: 'content',
        prompts: [{ prompt: 'What brought you joy?', response: 'The gentle evening breeze.' }],
        tags: ['evening', 'gratitude'],
      });

      expect(entry1.data.id).toBeDefined();
      expect(entry2.data.id).toBeDefined();
      expect(entry1.data.id).not.toBe(entry2.data.id);
      expect(entry1.data.entryDate).toBe(date);
      expect(entry2.data.entryDate).toBe(date);

      // List entries filtered by the specific date
      const listRes = await clientA.listJournalEntries(workspaceAId, { date });
      expect(listRes.data.length).toBeGreaterThanOrEqual(2);

      const ids = listRes.data.map((e) => e.id);
      expect(ids).toContain(entry1.data.id);
      expect(ids).toContain(entry2.data.id);
    });

    it('preserves physical creation instant when intentionally backdating an entry', async () => {
      const pastDate = '2026-09-15';
      const beforeCreate = new Date().toISOString();

      const backdatedEntry = await clientA.createJournalEntry(workspaceAId, {
        title: 'Past Memory',
        entryDate: pastDate,
        timezone: 'America/New_York',
        plainText: 'A memory from last month.',
        tags: ['archive'],
      });

      const afterCreate = new Date().toISOString();

      expect(backdatedEntry.data.entryDate).toBe(pastDate);
      // Physical createdAt is within the actual execution window, NOT September!
      expect(backdatedEntry.data.createdAt >= beforeCreate).toBe(true);
      expect(backdatedEntry.data.createdAt <= afterCreate).toBe(true);

      // Domain check: isEntryBackdated identifies this as backdated
      const isBackdated = isEntryBackdated(
        backdatedEntry.data.entryDate,
        backdatedEntry.data.createdAt,
        backdatedEntry.data.timezone
      );
      expect(isBackdated).toBe(true);
    });
  });

  describe('Suite 2: Bangla / Unicode Round-Trip Preservation', () => {
    it('preserves complex Bengali script bit-for-bit across save, fetch, and search', async () => {
      const banglaTitle = 'সন্ধ্যার ভাবনা ও কিছু স্মৃতি (Evening Musings)';
      const banglaPlainText =
        'আজ সারাদিন বৃষ্টির শব্দে মুখর ছিল। নদীর ধারে শিমুল গাছের পাতা ভিজে স্নিগ্ধ হয়ে আছে।';
      const banglaPrompt = 'আজকের দিনে মনের সবচেয়ে বড় প্রাপ্তি কী?';
      const banglaResponse = 'শান্তি ও একাকীত্ব উপভোগ করার সুযোগ।';
      const banglaTags = ['বৃষ্টি', 'স্মৃতি', 'বাংলা-ডায়েরি'];

      const banglaDoc: NoteDocument = {
        version: 1,
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: banglaPlainText }],
          },
        ],
      };

      const created = await clientA.createJournalEntry(workspaceAId, {
        title: banglaTitle,
        entryDate: '2026-10-16',
        timezone: 'Asia/Dhaka',
        document: banglaDoc,
        plainText: banglaPlainText,
        mood: 'শান্ত (Peaceful)',
        prompts: [{ prompt: banglaPrompt, response: banglaResponse }],
        tags: banglaTags,
      });

      expect(created.data.title).toBe(banglaTitle);
      expect(created.data.plainText).toBe(banglaPlainText);
      expect(created.data.mood).toBe('শান্ত (Peaceful)');
      expect(created.data.prompts[0]?.prompt).toBe(banglaPrompt);
      expect(created.data.prompts[0]?.response).toBe(banglaResponse);
      expect(created.data.tags).toEqual(banglaTags);

      // Fetch via single GET
      const fetched = await clientA.getJournalEntry(workspaceAId, created.data.id);
      expect(fetched.data.title).toBe(banglaTitle);
      expect(fetched.data.plainText).toBe(banglaPlainText);
      expect(fetched.data.mood).toBe('শান্ত (Peaceful)');
      expect(fetched.data.prompts[0]?.response).toBe(banglaResponse);

      // Verify date range filter with Bengali entry
      const listRange = await clientA.listJournalEntries(workspaceAId, {
        startDate: '2026-10-15',
        endDate: '2026-10-17',
      });
      const found = listRange.data.find((e) => e.id === created.data.id);
      expect(found).toBeDefined();
      expect(found?.title).toBe(banglaTitle);
    });
  });

  describe('Suite 3: Personal Workspace Isolation Rejection (403 Forbidden)', () => {
    it('rejects creating or querying journal entries in shared workspaces/rooms', async () => {
      // Alice is owner of sharedWorkspaceId, but journal entries are strictly personal
      await expect(
        clientA.createJournalEntry(sharedWorkspaceId, {
          title: 'Attempted Shared Entry',
          entryDate: '2026-10-16',
          plainText: 'Should be rejected',
        })
      ).rejects.toThrow();

      // Listing journal entries in shared workspace must also be rejected
      await expect(clientA.listJournalEntries(sharedWorkspaceId)).rejects.toThrow();
    });

    it('rejects cross-account access between two personal workspaces', async () => {
      // Bob tries to access Alice's personal workspace
      await expect(clientB.listJournalEntries(workspaceAId)).rejects.toThrow();
    });
  });

  describe('Suite 4: Offline Persistence and Sync Engine Push/Pull (IndexedDB)', () => {
    it('persists offline journal entry and synchronizes via SyncEngine', async () => {
      await clearAllLocalData();
      setTrustedDeviceConsent(true);

      const repo = new IndexedDbLocalRepository();
      await repo.initialize({ userId: userAId, workspaceId: workspaceAId });

      const transport = new ApiClientSyncTransport(clientA);
      const engine = new SyncEngine({
        namespace: { userId: userAId, workspaceId: workspaceAId },
        deviceId: 'device-test-indexeddb',
        repository: repo,
        transport,
        pollIntervalMs: 60000,
      });

      await engine.start();

      let repoB: IndexedDbLocalRepository | null = null;
      let engineB: SyncEngine | null = null;

      try {
        const journalId = crypto.randomUUID();
        const entryRecord: JournalEntryRecord = {
          id: journalId,
          workspaceId: workspaceAId,
          folderId: null,
          entryDate: '2026-10-16',
          timezone: 'UTC',
          title: 'Offline Draft Entry',
          document: {
            version: 1,
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'Written while offline on the subway.' }],
              },
            ],
          },
          plainText: 'Written while offline on the subway.',
          wordCount: 6,
          charCount: 37,
          mood: 'focused',
          prompts: [{ prompt: 'Where are you writing?', response: 'Subway commute.' }],
          tags: ['commute', 'offline'],
          isDraft: false,
          isArchived: false,
          isPinned: false,
          securityScope: 'standard',
          serverRevision: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          deletedAt: null,
        };

        // Save locally through SyncEngine
        await engine.saveJournalEntry(entryRecord, 'createJournalEntry');

        // Verify local storage has it immediately
        const localEntry = await repo.getJournalEntry(workspaceAId, journalId);
        expect(localEntry).not.toBeNull();
        expect(localEntry?.title).toBe('Offline Draft Entry');

        // Push sync to server
        const pushResult = await engine.pushPending();
        expect(pushResult.pushedCount).toBeGreaterThanOrEqual(1);

        // Verify server now has this entry
        const serverEntry = await clientA.getJournalEntry(workspaceAId, journalId);
        expect(serverEntry.data.id).toBe(journalId);
        expect(serverEntry.data.title).toBe('Offline Draft Entry');
        expect(serverEntry.data.serverRevision).toBeGreaterThanOrEqual(1);

        // Verify pull sync into a second clean repository
        repoB = new IndexedDbLocalRepository();
        await repoB.initialize({ userId: userAId, workspaceId: workspaceAId });

        engineB = new SyncEngine({
          namespace: { userId: userAId, workspaceId: workspaceAId },
          deviceId: 'device-test-second-client',
          repository: repoB,
          transport,
          pollIntervalMs: 60000,
        });
        await engineB.start();

        const pullResult = await engineB.pullChanges();
        expect(pullResult.changesCount).toBeGreaterThanOrEqual(1);

        const pulledEntry = await repoB.getJournalEntry(workspaceAId, journalId);
        expect(pulledEntry).not.toBeNull();
        expect(pulledEntry?.title).toBe('Offline Draft Entry');
        expect(pulledEntry?.plainText).toBe('Written while offline on the subway.');
      } finally {
        if (engineB) await engineB.stop();
        if (repoB) await repoB.close();
        await engine.stop();
        await repo.close();
      }
    });
  });

  describe('Suite 5: Concurrency, Revision Conflict Handling, and Recovery Drafts', () => {
    it('detects revision conflict on stale update and enables save_copy recovery', async () => {
      await clearAllLocalData();
      setTrustedDeviceConsent(true);

      // Create initial entry on server
      const created = await clientA.createJournalEntry(workspaceAId, {
        title: 'Original Journal Entry',
        entryDate: '2026-10-16',
        plainText: 'Initial text.',
      });

      const journalId = created.data.id;
      const baseRev = created.data.serverRevision;

      // Client A updates on server directly to revision 2
      const updated = await clientA.updateJournalEntry(workspaceAId, journalId, {
        title: 'Server Updated Journal Entry',
        baseRevision: baseRev,
      });
      expect(updated.data.serverRevision).toBe(baseRev + 1);

      // Local engine with stale base revision attempts update
      const repo = new IndexedDbLocalRepository();
      await repo.initialize({ userId: userAId, workspaceId: workspaceAId });

      const transport = new ApiClientSyncTransport(clientA);
      const engine = new SyncEngine({
        namespace: { userId: userAId, workspaceId: workspaceAId },
        deviceId: 'device-test-conflicts',
        repository: repo,
        transport,
        pollIntervalMs: 60000,
      });
      await engine.start();

      try {
        const staleEntry: JournalEntryRecord = {
          ...created.data,
          title: 'Local Conflicted Modification',
          plainText: 'Local text that conflicts with server update.',
          serverRevision: baseRev, // Stale base revision!
        };

        await engine.saveJournalEntry(staleEntry, 'updateJournalEntry', { autoSync: false });

        // Push should detect 409 conflict
        await engine.pushPending();

        const conflicts = await repo.listConflicts(workspaceAId);
        expect(conflicts.length).toBe(1);
        expect(conflicts[0]?.entityId).toBe(journalId);

        // Resolve via save_copy
        await engine.resolveConflict(conflicts[0]!.id, 'save_copy');
        await engine.syncNow();

        const resolvedConflicts = await repo.listConflicts(workspaceAId);
        expect(resolvedConflicts.length).toBe(0);

        // Both versions now exist on server: original + copied entry
        const listAfter = await clientA.listJournalEntries(workspaceAId, { date: '2026-10-16' });
        expect(listAfter.data.length).toBeGreaterThanOrEqual(2);
      } finally {
        await engine.stop();
        await repo.close();
      }
    });
  });

  describe('Suite 6: Sensitive Data Privacy & SafeLogger Canary Assertion', () => {
    it('guarantees that sensitive journal contents NEVER leak into server logs or logger output', async () => {
      capturedLogs.length = 0; // Clear logs before test

      const canaryEntry = await clientA.createJournalEntry(workspaceAId, {
        title: `Canary Title ${CANARY_STRING}`,
        entryDate: '2026-10-16',
        plainText: `Sensitive personal reflections containing ${CANARY_STRING} deeply private thoughts.`,
        mood: `Moody ${CANARY_STRING}`,
        prompts: [{ prompt: `Prompt ${CANARY_STRING}?`, response: `Response ${CANARY_STRING}.` }],
        tags: ['canary-test'],
      });

      expect(canaryEntry.data.id).toBeDefined();

      // Trigger an error path as well to exercise SafeLogger.error
      try {
        await clientA.updateJournalEntry(workspaceAId, canaryEntry.data.id, {
          title: `Conflicting Canary ${CANARY_STRING}`,
          baseRevision: 999, // Stale revision triggers 409 error
        });
      } catch {
        // Expected conflict error
      }

      // Exercise SafeLogger directly with sensitive journal objects
      const directLoggerEntries: StructuredLogEntry[] = [];
      const canaryLogger = new SafeLogger((e) => directLoggerEntries.push(e));
      canaryLogger.error('req-canary-01', `Error logging journal ${CANARY_STRING}`, {
        journal: { text: CANARY_STRING },
        document: { plainText: CANARY_STRING },
        plainText: CANARY_STRING,
        prompt: CANARY_STRING,
        mood: CANARY_STRING,
      });

      // 1. Assert captured API server logs contain ZERO canary leaks
      for (const log of capturedLogs) {
        const serialized = JSON.stringify(log);
        expect(serialized).not.toContain(CANARY_STRING);
      }

      // 2. Assert direct SafeLogger entries redact sensitive keys
      for (const log of directLoggerEntries) {
        const details = log.details as Record<string, unknown> | undefined;
        if (details) {
          expect(details['journal']).toBe('[REDACTED]');
          expect(details['document']).toBe('[REDACTED]');
          expect(details['plainText']).toBe('[REDACTED]');
          expect(details['prompt']).toBe('[REDACTED]');
          expect(details['mood']).toBe('[REDACTED]');
        }
      }
    });
  });

  describe('Suite 7: Mobile SQLite Repository Integration', () => {
    it('persists, queries, filters, and cleanly erases journal entries in SQLite storage', async () => {
      const db = new DatabaseSync(':memory:');
      const adapter = new NodeSqliteAdapter(db);
      const secureStore = new MemorySecureStore();
      const keyManager = new MobileKeyManager(secureStore);

      const repo = new SqliteLocalRepository({
        keyManager,
        openDatabaseAsync: async () => adapter,
        databaseExistsAsync: async () => false,
        requireSqlCipher: false,
      });

      await repo.initialize({ userId: userAId, workspaceId: workspaceAId });

      const sqliteEntry: JournalEntryRecord = {
        id: crypto.randomUUID(),
        workspaceId: workspaceAId,
        folderId: null,
        entryDate: '2026-10-16',
        timezone: 'Asia/Dhaka',
        title: 'মোবাইলে বাংলা ডায়েরি (Mobile Bangla Diary)',
        document: {
          version: 1,
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'মোবাইল ডিভাইসে অফলাইন সঞ্চয় সফল।' }],
            },
          ],
        },
        plainText: 'মোবাইল ডিভাইসে অফলাইন সঞ্চয় সফল।',
        wordCount: 5,
        charCount: 33,
        mood: 'energized',
        prompts: [{ prompt: 'অভিজ্ঞতা কেমন?', response: 'খুব মসৃণ ও দ্রুত।' }],
        tags: ['sqlite', 'mobile', 'bangla'],
        isDraft: false,
        isArchived: false,
        isPinned: false,
        securityScope: 'standard',
        serverRevision: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      };

      await repo.upsertJournalEntry(sqliteEntry);

      // Verify retrieval
      const fetched = await repo.getJournalEntry(workspaceAId, sqliteEntry.id);
      expect(fetched).not.toBeNull();
      expect(fetched?.title).toBe('মোবাইলে বাংলা ডায়েরি (Mobile Bangla Diary)');
      expect(fetched?.plainText).toBe('মোবাইল ডিভাইসে অফলাইন সঞ্চয় সফল।');
      expect(fetched?.prompts[0]?.response).toBe('খুব মসৃণ ও দ্রুত।');

      // Verify list with date filter
      const listed = await repo.listJournalEntries(workspaceAId, { entryDate: '2026-10-16' });
      expect(listed.length).toBe(1);
      expect(listed[0]?.id).toBe(sqliteEntry.id);

      // Verify complete erasure on clearWorkspaceData
      await repo.clearWorkspaceData(workspaceAId);
      const afterClear = await repo.getJournalEntry(workspaceAId, sqliteEntry.id);
      expect(afterClear).toBeNull();

      await repo.close();
    });
  });
});
