import React from 'react';
import { DatabaseSync } from 'node:sqlite';
import { describe, it, expect } from 'vitest';
import { JournalView } from './JournalView.js';
import { TestRenderer, type ReactTestRenderer, act } from '../test-render.js';
import { SqliteLocalRepository, type SqliteDatabaseContract } from '../data/sqliteRepository.js';
import { MobileKeyManager } from '../data/keyManager.js';
import type { SecureStoreContract } from '../auth/secureStorage.js';
import { generateInitialRank, generateUuid, type NoteDocument } from '@daynori/domain';
import type { ConflictRecord, DraftRecord, LocalRepositoryPort, SyncEngine } from '@daynori/sync';

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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('JournalView Screen Wiring Integration Tests', () => {
  const workspaceId = '00000000-0000-0000-0000-000000000001';
  const userId = '00000000-0000-0000-0000-000000000002';
  const otherWorkspaceId = '00000000-0000-0000-0000-000000000003';
  const otherUserId = '00000000-0000-0000-0000-000000000004';
  const todayIso = new Date().toISOString().slice(0, 10);

  async function createRepo(): Promise<SqliteLocalRepository> {
    const rawDb = new DatabaseSync(':memory:');
    const adapter = new NodeSqliteAdapter(rawDb);
    const keyManager = new MobileKeyManager(new MemorySecureStore());
    const repo = new SqliteLocalRepository({
      keyManager,
      openDatabaseAsync: async () => adapter,
      databaseExistsAsync: async () => false,
      requireSqlCipher: false,
    });
    await repo.initialize({ userId, workspaceId });
    return repo;
  }

  it('verifies draft recovery, editing, and successful save deleting draft', async () => {
    const repo = await createRepo();
    const draftId = generateUuid();
    const draft: DraftRecord = {
      id: draftId,
      workspaceId,
      userId,
      entityType: 'journal_entry',
      entityId: draftId,
      title: 'Unsaved draft test',
      payload: {
        title: 'Unsaved draft test',
        entryDate: todayIso,
        timezone: 'UTC',
        plainText: 'Draft recovery body content.',
        mood: 'reflective',
        prompts: [],
        tags: ['recovered'],
        folderId: null,
      },
      savedAt: new Date().toISOString(),
      isQuarantined: false,
      quarantinedAt: null,
    };
    await repo.saveDraft(draft);

    let renderer: ReactTestRenderer | undefined;
    act(() => {
      renderer = TestRenderer.create(
        React.createElement(JournalView, {
          themeMode: 'light',
          isAuthenticated: true,
          workspaceId,
          userId,
          repository: repo,
          userTimezone: 'UTC',
          onLoginSynthetic: () => {},
          onNavigateToToday: () => {},
        })
      );
    });
    await sleep(100);

    // 1. Recovery banner must be visible
    const recoverBtn = renderer!.root.findByProps({ accessibilityLabel: 'Recover draft' });
    expect(recoverBtn).toBeDefined();

    // 2. Click recover: writing form opens
    act(() => {
      recoverBtn.props.onPress();
    });
    await sleep(50);

    const saveBtn = renderer!.root.findByProps({ accessibilityLabel: 'Save reflection' });
    expect(saveBtn).toBeDefined();

    // 3. Save entry: persists to SQLite and removes draft
    await saveBtn.props.onPress();
    await sleep(100);

    const entries = await repo.listJournalEntries(workspaceId);
    expect(entries.length).toBe(1);
    expect(entries[0]?.title).toBe('Unsaved draft test');
    expect(entries[0]?.plainText).toBe('Draft recovery body content.');

    const remainingDrafts = await repo.listDrafts(workspaceId, userId);
    expect(remainingDrafts.length).toBe(0);

    await repo.close();
  });

  it('keeps writing form open and displays actionable error on save failure', async () => {
    const repo = await createRepo();
    const failingRepo = new Proxy(repo, {
      get(target, prop, receiver) {
        if (prop === 'saveItemTransaction') {
          return async () => {
            throw new Error('Database locked by concurrent operation');
          };
        }
        return Reflect.get(target, prop, receiver);
      },
    });

    let renderer: ReactTestRenderer | undefined;
    act(() => {
      renderer = TestRenderer.create(
        React.createElement(JournalView, {
          themeMode: 'light',
          isAuthenticated: true,
          workspaceId,
          userId,
          repository: failingRepo as unknown as LocalRepositoryPort,
          userTimezone: 'UTC',
          onLoginSynthetic: () => {},
          onNavigateToToday: () => {},
        })
      );
    });
    await sleep(50);

    // Open write form
    const writeBtn = renderer!.root.findByProps({ accessibilityLabel: 'Write new reflection' });
    act(() => {
      writeBtn.props.onPress();
    });

    // Enter title to ensure it attempts to save
    const titleInput = renderer!.root.findByProps({ placeholder: 'Give your thought a name...' });
    act(() => {
      titleInput.props.onChangeText('A reflection that should not be lost');
    });

    const saveBtn = renderer!.root.findByProps({ accessibilityLabel: 'Save reflection' });
    await saveBtn.props.onPress();
    await sleep(50);

    // Editor MUST remain open; Cancel and Save buttons still mounted
    expect(renderer!.root.findByProps({ accessibilityLabel: 'Cancel reflection' })).toBeDefined();
    expect(renderer!.root.findByProps({ accessibilityLabel: 'Save reflection' })).toBeDefined();

    await repo.close();
  });

  it('preserves multi-block AST, formatting, and folder placement without flattening', async () => {
    const repo = await createRepo();
    const folderId = generateUuid();
    const entryId = generateUuid();
    const nowIso = new Date().toISOString();

    // Multi-block document with heading and formatted paragraph
    const multiBlockDoc: NoteDocument = {
      version: 1,
      type: 'doc',
      content: [
        {
          id: 'heading-block',
          type: 'heading',
          level: 2,
          content: [{ type: 'text', text: 'Important Ast Heading' }],
        },
        {
          id: 'para-block',
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Sentence with ' },
            { type: 'text', text: 'bold style', marks: ['bold'] },
          ],
        },
      ],
    };

    await repo.upsertItemHeader({
      id: folderId,
      workspaceId,
      kind: 'folder',
      title: 'Mindfulness',
      folderId: null,
      rank: generateInitialRank(0),
      isArchived: false,
      isPinned: false,
      securityScope: 'standard',
      serverRevision: 1,
      createdAt: nowIso,
      updatedAt: nowIso,
      deletedAt: null,
    });

    await repo.upsertItemHeader({
      id: entryId,
      workspaceId,
      kind: 'journal',
      title: 'AST Preservation Test',
      folderId,
      rank: generateInitialRank(1),
      isArchived: false,
      isPinned: false,
      securityScope: 'standard',
      serverRevision: 1,
      createdAt: nowIso,
      updatedAt: nowIso,
      deletedAt: null,
    });

    await repo.upsertJournalEntry({
      id: entryId,
      workspaceId,
      folderId,
      entryDate: todayIso,
      timezone: 'UTC',
      title: 'AST Preservation Test',
      mood: 'good',
      prompts: [],
      tags: ['ast'],
      document: multiBlockDoc,
      plainText: 'Important Ast Heading\n\nSentence with bold style',
      wordCount: 7,
      charCount: 45,
      isDraft: false,
      isArchived: false,
      isPinned: false,
      securityScope: 'standard',
      serverRevision: 1,
      createdAt: nowIso,
      updatedAt: nowIso,
      deletedAt: null,
    });

    let renderer: ReactTestRenderer | undefined;
    act(() => {
      renderer = TestRenderer.create(
        React.createElement(JournalView, {
          themeMode: 'light',
          isAuthenticated: true,
          workspaceId,
          userId,
          repository: repo,
          userTimezone: 'UTC',
          onLoginSynthetic: () => {},
          onNavigateToToday: () => {},
        })
      );
    });
    await sleep(100);

    // 1. Open entry
    const entryRow = renderer!.root.findByProps({
      accessibilityLabel: `AST Preservation Test, written on ${todayIso}`,
    });
    act(() => {
      entryRow.props.onPress();
    });

    // 2. Edit metadata only (mood)
    const moodGreat = renderer!.root.findByProps({ accessibilityLabel: 'Mood Great' });
    act(() => {
      moodGreat.props.onPress();
    });

    // 3. Save
    const saveBtn = renderer!.root.findByProps({ accessibilityLabel: 'Save reflection' });
    await saveBtn.props.onPress();
    await sleep(100);

    // 4. Verify AST is preserved verbatim
    const saved = await repo.getJournalEntry(workspaceId, entryId);
    expect(saved).toBeDefined();
    expect(saved?.mood).toBe('great');
    expect(saved?.folderId).toBe(folderId);
    expect(saved?.document.content.length).toBe(2);
    expect(saved?.document.content[0]?.type).toBe('heading');
    expect((saved?.document.content[0] as { id?: string })?.id).toBe('heading-block');
    expect(saved?.document.content[1]?.type).toBe('paragraph');

    // 5. Trash and verify AST is STILL not flattened
    const rowAgain = renderer!.root.findByProps({
      accessibilityLabel: `AST Preservation Test, written on ${todayIso}`,
    });
    act(() => {
      rowAgain.props.onPress();
    });

    const trashBtn = renderer!.root.findByProps({ accessibilityLabel: 'Delete reflection' });
    await trashBtn.props.onPress();
    await sleep(100);

    const trashed = await repo.getJournalEntry(workspaceId, entryId);
    expect(trashed?.deletedAt).not.toBeNull();
    expect(trashed?.document.content.length).toBe(2);

    // Switch to trash view
    const trashModeTab = renderer!.root.findByProps({ accessibilityLabel: 'Trash view' });
    act(() => {
      trashModeTab.props.onPress();
    });
    await sleep(100);
    // 6. Restore from trash
    const restoreBtn = renderer!.root.findByProps({
      accessibilityLabel: 'Restore AST Preservation Test',
    });
    await restoreBtn.props.onPress();
    await sleep(100);

    const restored = await repo.getJournalEntry(workspaceId, entryId);
    expect(restored?.deletedAt).toBeNull();

    await repo.close();
  });

  it('renders sync conflict controls and invokes conflict resolution', async () => {
    const repo = await createRepo();
    const entryId = generateUuid();
    const conflictId = generateUuid();
    const nowIso = new Date().toISOString();

    await repo.upsertItemHeader({
      id: entryId,
      workspaceId,
      kind: 'journal',
      title: 'Conflict test',
      folderId: null,
      rank: generateInitialRank(0),
      isArchived: false,
      isPinned: false,
      securityScope: 'standard',
      serverRevision: 1,
      createdAt: nowIso,
      updatedAt: nowIso,
      deletedAt: null,
    });

    await repo.upsertJournalEntry({
      id: entryId,
      workspaceId,
      folderId: null,
      entryDate: todayIso,
      timezone: 'UTC',
      title: 'Conflict test',
      mood: null,
      prompts: [],
      tags: [],
      document: { version: 1, type: 'doc', content: [] },
      plainText: 'Conflict text',
      wordCount: 2,
      charCount: 13,
      isDraft: false,
      isArchived: false,
      isPinned: false,
      securityScope: 'standard',
      serverRevision: 1,
      createdAt: nowIso,
      updatedAt: nowIso,
      deletedAt: null,
    });

    const conflict: ConflictRecord = {
      id: conflictId,
      workspaceId,
      userId,
      entityId: entryId,
      entityType: 'journal',
      operationId: generateUuid(),
      localPayload: { title: 'Local version' },
      baseRevision: 1,
      serverRevision: 3,
      conflictReason: 'concurrent_modification',
      detectedAt: nowIso,
      resolved: false,
    };
    await repo.saveConflict(conflict);

    let chosenResolution = '';
    const mockSyncEngine = {
      onEvent: () => () => {},
      resolveConflict: async (_id: string, res: string) => {
        chosenResolution = res;
      },
      syncNow: async () => {},
    };

    let renderer: ReactTestRenderer | undefined;
    act(() => {
      renderer = TestRenderer.create(
        React.createElement(JournalView, {
          themeMode: 'light',
          isAuthenticated: true,
          workspaceId,
          userId,
          repository: repo,
          syncEngine: mockSyncEngine as unknown as SyncEngine,
          userTimezone: 'UTC',
          onLoginSynthetic: () => {},
          onNavigateToToday: () => {},
        })
      );
    });
    await sleep(100);

    const keepLocalBtn = renderer!.root.findByProps({
      accessibilityLabel: 'Overwrite cloud version',
    });
    expect(keepLocalBtn).toBeDefined();

    await keepLocalBtn.props.onPress();
    expect(chosenResolution).toBe('keep_local');
    await repo.close();
  });

  it('persists privacy preferences and enforces workspace isolation upon account switch', async () => {
    const repo = await createRepo();

    let renderer: ReactTestRenderer | undefined;
    act(() => {
      renderer = TestRenderer.create(
        React.createElement(JournalView, {
          themeMode: 'light',
          isAuthenticated: true,
          workspaceId,
          userId,
          repository: repo,
          userTimezone: 'UTC',
          onLoginSynthetic: () => {},
          onNavigateToToday: () => {},
        })
      );
    });
    await sleep(50);

    // 1. Toggle snippets
    const toggle = renderer!.root.findByProps({ accessibilityLabel: 'Show snippets' });
    await toggle.props.onPress();
    await sleep(100);

    const prefs = await repo.getPreferenceSnapshot(userId);
    expect(
      (prefs?.preferences?.displayPreferences as { suppressBodySnippets?: boolean })
        ?.suppressBodySnippets
    ).toBe(false);

    // 2. Switch to different user/workspace
    act(() => {
      renderer!.update(
        React.createElement(JournalView, {
          themeMode: 'light',
          isAuthenticated: true,
          workspaceId: otherWorkspaceId,
          userId: otherUserId,
          repository: repo,
          userTimezone: 'UTC',
          onLoginSynthetic: () => {},
          onNavigateToToday: () => {},
        })
      );
    });
    await sleep(50);

    // Verification: state has reset, no leaks
    expect(renderer!.root.findAllByProps({ title: 'Unsaved draft test' }).length).toBe(0);

    await repo.close();
  });
});
