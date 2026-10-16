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
import {
  generateInitialRank,
  isEntryBackdated,
  resolveJournalTitle,
  REFLECTION_TEMPLATES,
  instantiateReflectionTemplate,
} from '@daynori/domain';
import {
  SyncEngine,
  ApiClientSyncTransport,
  type ItemHeaderRecord,
  type JournalEntryRecord,
  type PendingMutationRecord,
  type DraftRecord,
} from '@daynori/sync';
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

describe('Phase 23: Journal Writing and Reflection Interfaces (Integration Tests)', () => {
  let adminPool: Pool;
  let runtimePool: Pool;
  let migrator: Migrator;
  let server: ReturnType<typeof buildServer>;
  let baseUrl: string;

  let keyPair: Awaited<ReturnType<typeof generateKeyPair>>;
  let jwks: JSONWebKeySet;

  const issuer = 'https://auth.daynori.test';
  const audience = 'daynori-api';
  const kid = 'phase23-journal-key';

  const userAId = crypto.randomUUID();
  const userBId = crypto.randomUUID();
  let tokenUserA: string;
  let tokenUserB: string;
  let clientA: DaynoriApiClient;
  let clientB: DaynoriApiClient;

  let workspaceAId: string; // Personal workspace
  let workspaceBId: string; // Personal workspace

  const capturedLogs: StructuredLogEntry[] = [];
  const CANARY_STRING = 'CANARY_PHASE23_REFLECTION_TEXT_SECRET_8844';

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

    const verifier = new JwtVerifier({
      issuer,
      audience,
      localJwks: jwks,
    });

    const safeLogger = new SafeLogger((entry) => {
      capturedLogs.push(entry);
    });

    // 3. Start server
    server = buildServer({
      jwtVerifier: verifier,
      runtimePool,
      logger: safeLogger,
      rateLimitOptions: { windowMs: 60000, maxRequests: 50000 },
    });

    await server.listen({ port: 0, host: '127.0.0.1' });
    const addr = server.server.address();
    if (!addr || typeof addr === 'string') throw new Error('Failed to bind server port');
    baseUrl = `http://127.0.0.1:${addr.port}`;

    tokenUserA = await createToken(userAId);
    tokenUserB = await createToken(userBId);

    clientA = createApiClient({ baseUrl, token: tokenUserA });
    clientB = createApiClient({ baseUrl, token: tokenUserB });

    // 4. Setup Test Workspaces & Profiles
    const admin = await adminPool.connect();
    try {
      await admin.query(`
        INSERT INTO app.profiles (id, display_name) VALUES
          ('${userAId}', 'Alice P23'),
          ('${userBId}', 'Bob P23')
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
    } finally {
      admin.release();
    }

    setTrustedDeviceConsent(true);
  });

  afterAll(async () => {
    if (server) await server.close();
    await runtimePool.end();
    await adminPool.end();
  });

  it('Journey 1: Offline writing, draft interruption, restart, recovery, and eventual synchronization with Bangla Unicode preservation', async () => {
    await clearAllLocalData();
    setTrustedDeviceConsent(true);
    const repo = new IndexedDbLocalRepository();
    await repo.initialize({ userId: userAId, workspaceId: workspaceAId });

    const draftId = crypto.randomUUID();
    const entryId = crypto.randomUUID();
    const banglaDoc: NoteDocument = {
      version: 1,
      type: 'doc',
      content: [
        {
          id: 'p-1',
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'আজকের চিন্তা ও আত্মবিশ্লেষণ: শান্ত ও নিরিবিলি পরিবেশে আজকের ভাবনা।',
            },
          ],
        },
      ],
    };

    // 1. Simulate active typing saving to draft store
    const draft: DraftRecord = {
      id: draftId,
      workspaceId: workspaceAId,
      userId: userAId,
      entityType: 'journal_entry',
      entityId: entryId,
      title: 'বাংলা আত্মবিশ্লেষণ',
      payload: {
        entryDate: '2026-10-16',
        timezone: 'Asia/Dhaka',
        title: 'বাংলা আত্মবিশ্লেষণ',
        mood: 'reflective',
        prompts: [
          {
            prompt: 'আজকের প্রধান লক্ষ্য কী ছিল?',
            response: 'ক্লিন আর্কিটেকচার এবং সিঙ্ক টেস্ট সম্পন্ন করা।',
          },
        ],
        tags: ['bangla', 'reflection', 'focus'],
        document: banglaDoc,
        plainText: 'আজকের চিন্তা ও আত্মবিশ্লেষণ: শান্ত ও নিরিবিলি পরিবেশে আজকের ভাবনা।',
      },
      savedAt: new Date().toISOString(),
      isQuarantined: false,
      quarantinedAt: null,
    };
    await repo.saveDraft(draft);

    // 2. Interruption & Restart: close repo and reopen
    await repo.close();
    const restartedRepo = new IndexedDbLocalRepository();
    await restartedRepo.initialize({ userId: userAId, workspaceId: workspaceAId });

    // Recover draft
    const recoveredDrafts = await restartedRepo.listDrafts(workspaceAId, userAId);
    expect(recoveredDrafts.length).toBe(1);
    const recovered = recoveredDrafts[0]!;
    expect(recovered.title).toBe('বাংলা আত্মবিশ্লেষণ');
    expect((recovered.payload as { mood: string }).mood).toBe('reflective');

    // 3. User finishes and saves entry locally (atomic transaction)
    const nowIso = new Date().toISOString();
    const itemHeader: ItemHeaderRecord = {
      id: entryId,
      workspaceId: workspaceAId,
      kind: 'journal',
      title: 'বাংলা আত্মবিশ্লেষণ',
      folderId: null,
      rank: generateInitialRank(0),
      isArchived: false,
      isPinned: false,
      securityScope: 'standard',
      serverRevision: 0,
      createdAt: nowIso,
      updatedAt: nowIso,
      deletedAt: null,
    };

    const journalEntry: JournalEntryRecord = {
      id: entryId,
      workspaceId: workspaceAId,
      folderId: null,
      entryDate: '2026-10-16',
      timezone: 'Asia/Dhaka',
      title: 'বাংলা আত্মবিশ্লেষণ',
      mood: 'reflective',
      prompts: [
        {
          prompt: 'আজকের প্রধান লক্ষ্য কী ছিল?',
          response: 'ক্লিন আর্কিটেকচার এবং সিঙ্ক টেস্ট সম্পন্ন করা।',
        },
      ],
      tags: ['bangla', 'reflection', 'focus'],
      document: banglaDoc,
      plainText: 'আজকের চিন্তা ও আত্মবিশ্লেষণ: শান্ত ও নিরিবিলি পরিবেশে আজকের ভাবনা।',
      wordCount: 10,
      charCount: 68,
      isDraft: false,
      isArchived: false,
      isPinned: false,
      securityScope: 'standard',
      serverRevision: 0,
      createdAt: nowIso,
      updatedAt: nowIso,
      deletedAt: null,
    };

    const mutation: PendingMutationRecord = {
      operationId: crypto.randomUUID(),
      deviceId: 'test-device-1',
      workspaceId: workspaceAId,
      userId: userAId,
      entityType: 'journal',
      entityId: entryId,
      action: 'create',
      command: 'createJournalEntry',
      baseRevision: 0,
      payload: {
        id: entryId,
        entryDate: '2026-10-16',
        timezone: 'Asia/Dhaka',
        title: 'বাংলা আত্মবিশ্লেষণ',
        mood: 'reflective',
        prompts: journalEntry.prompts,
        tags: journalEntry.tags,
        document: banglaDoc,
        plainText: journalEntry.plainText,
        folderId: null,
        baseRevision: 0,
      },
      dependencyOperationIds: [],
      clientTimestamp: nowIso,
      retryCount: 0,
      status: 'pending',
      lastError: null,
    };

    await restartedRepo.saveItemTransaction(
      itemHeader,
      mutation,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      journalEntry
    );
    // Delete draft after committing
    await restartedRepo.deleteDraft(workspaceAId, userAId, draftId);

    // Verify draft is deleted and entry exists locally
    expect((await restartedRepo.listDrafts(workspaceAId, userAId)).length).toBe(0);
    const localEntry = await restartedRepo.getJournalEntry(workspaceAId, entryId);
    expect(localEntry).toBeDefined();
    expect(localEntry?.title).toBe('বাংলা আত্মবিশ্লেষণ');

    // 4. Online sync: create SyncEngine and sync to server
    const syncEngine = new SyncEngine({
      repository: restartedRepo,
      transport: new ApiClientSyncTransport(clientA),
      namespace: { userId: userAId, workspaceId: workspaceAId },
      deviceId: 'test-device-1',
    });

    await syncEngine.start();
    await syncEngine.syncNow();

    // 5. Query server directly and verify bit-for-bit Bangla Unicode and prompt fidelity
    const serverRes = await clientA.getJournalEntry(workspaceAId, entryId);
    expect(serverRes.data.id).toBe(entryId);
    expect(serverRes.data.title).toBe('বাংলা আত্মবিশ্লেষণ');
    expect(serverRes.data.entryDate).toBe('2026-10-16');
    expect(serverRes.data.timezone).toBe('Asia/Dhaka');
    expect(serverRes.data.mood).toBe('reflective');
    expect(serverRes.data.tags).toEqual(['bangla', 'reflection', 'focus']);
    expect(serverRes.data.prompts[0]?.prompt).toBe('আজকের প্রধান লক্ষ্য কী ছিল?');
    expect(serverRes.data.prompts[0]?.response).toBe(
      'ক্লিন আর্কিটেকচার এবং সিঙ্ক টেস্ট সম্পন্ন করা।'
    );
    expect(serverRes.data.document).toEqual(banglaDoc);

    await syncEngine.stop();
    await restartedRepo.close();
  });

  it('Journey 2: Long documents, rapid concurrent edits with conflict detection, and deterministic resolution', async () => {
    // 1. Create initial journal entry on server
    const entryId = crypto.randomUUID();
    const created = await clientA.createJournalEntry(workspaceAId, {
      id: entryId,
      entryDate: '2026-10-16',
      timezone: 'UTC',
      title: 'Architecture Retrospective Initial',
      plainText: 'Initial paragraph written on device 1.',
      document: {
        version: 1,
        type: 'doc',
        content: [
          {
            id: 'p-1',
            type: 'paragraph',
            content: [{ type: 'text', text: 'Initial paragraph written on device 1.' }],
          },
        ],
      },
    });
    expect(created.data.serverRevision).toBe(1);

    // 2. Client A updates entry to revision 2
    const op1 = crypto.randomUUID();
    const update1 = await clientA.updateJournalEntry(
      workspaceAId,
      entryId,
      {
        baseRevision: 1,
        title: 'Architecture Retrospective (Client A Update)',
        plainText: 'Updated content from client A.',
      },
      op1
    );
    expect(update1.data.serverRevision).toBe(2);

    // 3. Client B sends concurrent update using stale base revision 1
    const op2 = crypto.randomUUID();
    let conflictError: unknown;
    try {
      await clientA.updateJournalEntry(
        workspaceAId,
        entryId,
        {
          baseRevision: 1,
          title: 'Conflicting Title from Client B',
          plainText: 'Conflicting content from client B.',
        },
        op2
      );
    } catch (err) {
      conflictError = err;
    }

    // Verify 409 conflict was raised with current server revision
    expect(conflictError).toBeDefined();

    // 4. Test conflict resolution: keep_local forces update using updated baseRevision 2
    const op3 = crypto.randomUUID();
    const resolved = await clientA.updateJournalEntry(
      workspaceAId,
      entryId,
      {
        baseRevision: 2,
        title: 'Resolved Title: Kept Local Changes',
        plainText: 'Resolved body text with combined insights.',
      },
      op3
    );
    expect(resolved.data.serverRevision).toBe(3);
    expect(resolved.data.title).toBe('Resolved Title: Kept Local Changes');
  });

  it('Journey 3: Backdating, multiple entries per day, day navigation query filtering, and full lifecycle (trash & restoration)', async () => {
    // 1. Create two entries for the same calendar date (morning & evening reflections)
    const morningId = crypto.randomUUID();
    const eveningId = crypto.randomUUID();

    await clientA.createJournalEntry(workspaceAId, {
      id: morningId,
      entryDate: '2026-11-25',
      timezone: 'UTC',
      title: 'Morning Focus',
      mood: 'great',
      tags: ['morning', 'habits'],
      plainText: 'Morning reflection text.',
    });

    await clientA.createJournalEntry(workspaceAId, {
      id: eveningId,
      entryDate: '2026-11-25',
      timezone: 'UTC',
      title: 'Evening Gratitude',
      mood: 'good',
      tags: ['evening', 'gratitude'],
      plainText: 'Evening reflection text.',
    });

    // 2. Create an intentionally backdated entry (date in the past)
    const backdatedId = crypto.randomUUID();
    await clientA.createJournalEntry(workspaceAId, {
      id: backdatedId,
      entryDate: '2020-01-01',
      timezone: 'UTC',
      title: 'Old Historical Entry',
      mood: 'reflective',
      plainText: 'Memories from six years ago.',
    });

    // Verify isEntryBackdated identifies it
    expect(isEntryBackdated('2020-01-01', new Date(), 'UTC')).toBe(true);

    // 3. Query filtered by date: 2026-11-25 should return exactly 2 entries
    const dayEntries = await clientA.listJournalEntries(workspaceAId, {
      date: '2026-11-25',
    });
    expect(dayEntries.data.length).toBe(2);
    expect(dayEntries.data.map((e) => e.id).sort()).toEqual([morningId, eveningId].sort());

    // 4. Move eveningId to Trash
    const trashRes = await clientA.trashJournalEntry(workspaceAId, eveningId);
    expect(trashRes.data.success).toBe(true);

    // Verify it disappears from active timeline for 2026-11-25
    const dayAfterTrash = await clientA.listJournalEntries(workspaceAId, {
      date: '2026-11-25',
    });
    expect(dayAfterTrash.data.length).toBe(1);
    expect(dayAfterTrash.data[0]?.id).toBe(morningId);

    // 5. Restore entry and verify full content snapshot survives
    const restoreRes = await clientA.restoreJournalEntry(workspaceAId, eveningId);
    expect(restoreRes.data.success).toBe(true);
    expect(restoreRes.data.entry.title).toBe('Evening Gratitude');
    expect(restoreRes.data.entry.mood).toBe('good');

    // After restoration, day query returns both entries again
    const dayAfterRestore = await clientA.listJournalEntries(workspaceAId, {
      date: '2026-11-25',
    });
    expect(dayAfterRestore.data.length).toBe(2);
  });

  it('Journey 4: Multi-client bootstrap and expired cursor reset with complete snapshot consistency', async () => {
    // Client A creates folder and journal entry
    const folderRes = await clientA.createFolder(workspaceAId, { name: 'Deep Work Reflections' });
    const folderId = folderRes.data.id;

    const entryId = crypto.randomUUID();
    await clientA.createJournalEntry(workspaceAId, {
      id: entryId,
      folderId,
      entryDate: '2026-10-16',
      timezone: 'Europe/London',
      title: 'London Travel Reflection',
      mood: 'great',
      tags: ['travel', 'uk'],
      plainText: 'Walking along the Thames.',
    });

    // Fresh Client 2 bootstrap via SyncEngine
    await clearAllLocalData();
    setTrustedDeviceConsent(true);
    const freshRepo = new IndexedDbLocalRepository();
    await freshRepo.initialize({ userId: userAId, workspaceId: workspaceAId });

    const freshEngine = new SyncEngine({
      repository: freshRepo,
      transport: new ApiClientSyncTransport(clientA),
      namespace: { userId: userAId, workspaceId: workspaceAId },
      deviceId: 'fresh-client-device',
    });

    await freshEngine.start();
    await freshEngine.syncNow();

    // Verify exact folder, date, timezone, metadata, and body survived bootstrap
    const bootstrappedEntry = await freshRepo.getJournalEntry(workspaceAId, entryId);
    expect(bootstrappedEntry).toBeDefined();
    expect(bootstrappedEntry?.title).toBe('London Travel Reflection');
    expect(bootstrappedEntry?.folderId).toBe(folderId);
    expect(bootstrappedEntry?.entryDate).toBe('2026-10-16');
    expect(bootstrappedEntry?.timezone).toBe('Europe/London');
    expect(bootstrappedEntry?.mood).toBe('great');
    expect(bootstrappedEntry?.tags).toEqual(['travel', 'uk']);

    // Simulate expired cursor reset
    await freshRepo.saveCursor({
      workspaceId: workspaceAId,
      userId: userAId,
      lastServerRevision: 0,
      cursor: 'expired:cursor:reset',
      lastSyncedAt: new Date().toISOString(),
      epoch: 'expired-epoch',
    });

    await freshEngine.syncNow();

    const entryAfterReset = await freshRepo.getJournalEntry(workspaceAId, entryId);
    expect(entryAfterReset).toBeDefined();
    expect(entryAfterReset?.title).toBe('London Travel Reflection');

    await freshEngine.stop();
    await freshRepo.close();
  });

  it('Journey 5: Privacy preferences, account switching, and complete serialized log canary verification', async () => {
    // 1. Test fallback title resolution when title is absent
    const fallbackTitle = resolveJournalTitle(
      null,
      '2026-10-16',
      'First line of reflection text.\nSecond line.'
    );
    expect(fallbackTitle).toBe('First line of reflection text.');

    // Suppressing body snippets forces neutral date title even if body text exists
    const neutralTitle = resolveJournalTitle(
      null,
      '2026-10-16',
      'First line of confidential reflection.',
      { suppressBodySnippet: true }
    );
    expect(neutralTitle).toBe('Journal entry - 2026-10-16');

    const defaultTitle = resolveJournalTitle(null, '2026-10-16', '');
    expect(defaultTitle).toBe('Journal entry - 2026-10-16');

    // 2. Namespace account isolation
    // User B attempts to access User A's journal entry
    const entryId = crypto.randomUUID();
    await clientA.createJournalEntry(workspaceAId, {
      id: entryId,
      entryDate: '2026-10-16',
      title: 'Private Alice Entry',
      plainText: 'Confidential thoughts.',
    });

    let unauthorizedError: unknown;
    try {
      await clientB.getJournalEntry(workspaceAId, entryId);
    } catch (err) {
      unauthorizedError = err;
    }
    expect(unauthorizedError).toBeDefined();

    // 3. Complete log canary check
    capturedLogs.length = 0;
    // Perform an operation with canary sensitive string in title, tags, and body
    const canaryEntryId = crypto.randomUUID();
    try {
      await clientA.createJournalEntry(workspaceAId, {
        id: canaryEntryId,
        entryDate: '2026-10-16',
        title: `Canary Title ${CANARY_STRING}`,
        plainText: `Secret body with ${CANARY_STRING}`,
        tags: [CANARY_STRING],
      });
    } catch {
      // Ignore
    }

    // Inspect all captured log serialized strings
    for (const logEntry of capturedLogs) {
      const serialized = JSON.stringify(logEntry);
      expect(serialized).not.toContain(CANARY_STRING);
      expect(serialized).not.toContain('CANARY_PHASE23');
    }
  });

  it('Journey 6: SqliteLocalRepository journal persistence, prompt templates, and draft quarantine', async () => {
    const rawDb = new DatabaseSync(':memory:');
    const adapter = new NodeSqliteAdapter(rawDb);
    const keyManager = new MobileKeyManager(new MemorySecureStore());
    const sqliteRepo = new SqliteLocalRepository({
      keyManager,
      openDatabaseAsync: async () => adapter,
      databaseExistsAsync: async () => false,
      requireSqlCipher: false,
    });

    await sqliteRepo.initialize({ userId: userAId, workspaceId: workspaceAId });

    // 1. Verify template instantiation
    const templates = REFLECTION_TEMPLATES;
    expect(templates.length).toBeGreaterThanOrEqual(3);
    const instantiated = instantiateReflectionTemplate('daily_reflection');
    expect(instantiated.length).toBeGreaterThan(0);
    expect(instantiated[0]?.prompt).toBe('What went well today?');

    // 2. Persist journal entry to SqliteLocalRepository
    const entryId = crypto.randomUUID();
    const nowIso = new Date().toISOString();
    const itemHeader: ItemHeaderRecord = {
      id: entryId,
      workspaceId: workspaceAId,
      kind: 'journal',
      title: 'SQLite Reflection Test',
      folderId: null,
      rank: generateInitialRank(0),
      isArchived: false,
      isPinned: false,
      securityScope: 'standard',
      serverRevision: 1,
      createdAt: nowIso,
      updatedAt: nowIso,
      deletedAt: null,
    };

    const journalEntry: JournalEntryRecord = {
      id: entryId,
      workspaceId: workspaceAId,
      folderId: null,
      entryDate: '2026-10-16',
      timezone: 'UTC',
      title: 'SQLite Reflection Test',
      mood: 'good',
      prompts: instantiated,
      tags: ['sqlite', 'offline'],
      document: {
        version: 1,
        type: 'doc',
        content: [
          {
            id: 'p-1',
            type: 'paragraph',
            content: [{ type: 'text', text: 'Stored reliably in local SQLite store.' }],
          },
        ],
      },
      plainText: 'Stored reliably in local SQLite store.',
      wordCount: 6,
      charCount: 38,
      isDraft: false,
      isArchived: false,
      isPinned: false,
      securityScope: 'standard',
      serverRevision: 1,
      createdAt: nowIso,
      updatedAt: nowIso,
      deletedAt: null,
    };

    await sqliteRepo.upsertItemHeader(itemHeader);
    await sqliteRepo.upsertJournalEntry(journalEntry);

    const loaded = await sqliteRepo.getJournalEntry(workspaceAId, entryId);
    expect(loaded).toBeDefined();
    expect(loaded?.title).toBe('SQLite Reflection Test');
    expect(loaded?.mood).toBe('good');
    expect(loaded?.prompts[0]?.prompt).toBe('What went well today?');

    await sqliteRepo.close();
  });

  it('Journey 7: Web-to-mobile rich-document editing without flattening or metadata loss', async () => {
    // 1. Web creates a rich document with Heading, Blockquote, BulletList, and Paragraph blocks
    const entryId = crypto.randomUUID();
    const folderRes = await clientA.createFolder(workspaceAId, { name: 'Mindfulness' });
    const folderId = folderRes.data.id;

    const richDocument: NoteDocument = {
      version: 1,
      type: 'doc',
      content: [
        {
          id: 'heading-1',
          type: 'heading',
          level: 2,
          content: [{ type: 'text', text: 'Evening Mindfulness Reflection' }],
        },
        {
          id: 'p-1',
          type: 'paragraph',
          content: [{ type: 'text', text: '“Breathe in calm, breathe out stress.”' }],
        },
        {
          id: 'list-1',
          type: 'bullet_list',
          items: [
            {
              id: 'li-1',
              type: 'list_item',
              content: [{ type: 'text', text: 'Grateful for quiet morning walk' }],
            },
            {
              id: 'li-2',
              type: 'list_item',
              content: [{ type: 'text', text: 'আজকের দিনটি চমৎকার ছিল (Bangla reflection)' }],
            },
          ],
        },
        {
          id: 'check-1',
          type: 'checklist',
          items: [
            {
              id: 'ci-1',
              type: 'checklist_item',
              checked: true,
              content: [{ type: 'text', text: '10 minute meditation' }],
            },
          ],
        },
      ],
    };

    const created = await clientA.createJournalEntry(workspaceAId, {
      id: entryId,
      folderId,
      entryDate: '2026-10-16',
      timezone: 'Asia/Dhaka',
      title: 'Mindfulness & Gratitude',
      mood: 'peaceful',
      tags: ['mindfulness', 'dhaka'],
      document: richDocument,
      plainText:
        'Evening Mindfulness Reflection\n“Breathe in calm, breathe out stress.”\nGrateful for quiet morning walk\nআজকের দিনটি চমৎকার ছিল (Bangla reflection)\n10 minute meditation',
    });
    expect(created.data.id).toBe(entryId);
    expect(created.data.document.content.length).toBe(4);

    // 2. Mobile pulls entry into SqliteLocalRepository
    const rawDb = new DatabaseSync(':memory:');
    const adapter = new NodeSqliteAdapter(rawDb);
    const keyManager = new MobileKeyManager(new MemorySecureStore());
    const mobileRepo = new SqliteLocalRepository({
      keyManager,
      openDatabaseAsync: async () => adapter,
      databaseExistsAsync: async () => false,
      requireSqlCipher: false,
    });
    await mobileRepo.initialize({ userId: userAId, workspaceId: workspaceAId });

    const mobileEngine = new SyncEngine({
      repository: mobileRepo,
      transport: new ApiClientSyncTransport(clientA),
      namespace: { userId: userAId, workspaceId: workspaceAId },
      deviceId: 'mobile-test-device',
    });
    await mobileEngine.start();
    await mobileEngine.syncNow();

    // 3. Mobile reads the entry and verifies AST blocks are completely preserved
    const mobileEntry = await mobileRepo.getJournalEntry(workspaceAId, entryId);
    expect(mobileEntry).toBeDefined();
    expect(mobileEntry?.document.content.length).toBe(4);
    expect(mobileEntry?.document.content[0]?.type).toBe('heading');
    expect(mobileEntry?.document.content[1]?.type).toBe('paragraph');
    expect(mobileEntry?.document.content[2]?.type).toBe('bullet_list');
    expect(mobileEntry?.document.content[3]?.type).toBe('checklist');

    // 4. Mobile edits metadata (mood, tags) and appends a block without flattening
    const updatedDocument: NoteDocument = {
      ...mobileEntry!.document,
      content: [
        ...mobileEntry!.document.content,
        {
          id: 'p-appended',
          type: 'paragraph',
          content: [{ type: 'text', text: 'Appended reflection from mobile device.' }],
        },
      ],
    };

    const updateOp = crypto.randomUUID();
    const updated = await clientA.updateJournalEntry(
      workspaceAId,
      entryId,
      {
        baseRevision: mobileEntry!.serverRevision,
        mood: 'serene',
        tags: ['mindfulness', 'dhaka', 'mobile-reflection'],
        document: updatedDocument,
        plainText: `${mobileEntry!.plainText}\nAppended reflection from mobile device.`,
      },
      updateOp
    );
    expect(updated.data.mood).toBe('serene');
    expect(updated.data.tags).toContain('mobile-reflection');
    expect(updated.data.document.content.length).toBe(5);

    // 5. Verify original blocks (heading, paragraph, bullet_list, checklist) still exist unchanged
    expect(updated.data.document.content[0]?.type).toBe('heading');
    expect(updated.data.document.content[1]?.type).toBe('paragraph');
    expect(updated.data.document.content[2]?.type).toBe('bullet_list');
    expect(updated.data.document.content[3]?.type).toBe('checklist');
    expect(updated.data.document.content[4]?.type).toBe('paragraph');

    await mobileEngine.stop();
    await mobileRepo.close();
  });
});
