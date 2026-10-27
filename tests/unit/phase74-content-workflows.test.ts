import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  resolveLocalPersistenceLabel,
  resolveCloudPersistenceLabel,
  LOCAL_PERSISTENCE_LABEL,
  CLOUD_PERSISTENCE_LABEL,
  shouldRedactJournalSnippet,
  searchDownloadedRecords,
  type ItemHeader,
} from '@daynori/domain';

const repoRoot = path.resolve(import.meta.dirname, '../..');

describe('Phase 74 — persistence status vocabulary', () => {
  it('maps dirty/failed/local/cloud to canonical labels', () => {
    expect(resolveLocalPersistenceLabel({ dirty: true })).toBe(LOCAL_PERSISTENCE_LABEL.unsaved);
    expect(resolveLocalPersistenceLabel({ failed: true })).toBe(LOCAL_PERSISTENCE_LABEL.failed);
    expect(resolveLocalPersistenceLabel({ raw: 'Saved locally' })).toBe(
      LOCAL_PERSISTENCE_LABEL.saved_on_device
    );
    expect(resolveCloudPersistenceLabel('Syncing...')).toBe(CLOUD_PERSISTENCE_LABEL.waiting);
    expect(resolveCloudPersistenceLabel('Synced')).toBe(CLOUD_PERSISTENCE_LABEL.synchronized);
    expect(resolveCloudPersistenceLabel('Sync error')).toBe(CLOUD_PERSISTENCE_LABEL.failed);
    expect(resolveCloudPersistenceLabel('Offline — saved locally')).toBe(
      CLOUD_PERSISTENCE_LABEL.offline
    );
  });

  it('note editors render canonical status testids / labels', () => {
    const web = fs.readFileSync(path.join(repoRoot, 'packages/ui-web/src/NoteEditor.tsx'), 'utf8');
    const mobile = fs.readFileSync(
      path.join(repoRoot, 'packages/ui-mobile/src/MobileNoteEditor.tsx'),
      'utf8'
    );
    expect(web).toContain('resolveLocalPersistenceLabel');
    expect(web).toContain('displayLocalSaveStatus');
    expect(mobile).toContain('resolveLocalPersistenceLabel');
    expect(mobile).toContain('displayLocalSaveStatus');
  });
});

describe('Phase 74 — search privacy and vault exclusion', () => {
  it('redacts journal snippets by default', () => {
    expect(shouldRedactJournalSnippet(undefined)).toBe(true);
    expect(shouldRedactJournalSnippet({ journalPreviewHidden: false, suppressBodySnippets: false })).toBe(
      false
    );
  });

  it('never returns vault-scoped headers from ordinary downloaded search', () => {
    const headers: ItemHeader[] = [
      {
        id: 'n1',
        workspaceId: 'ws-a',
        kind: 'note',
        folderId: null,
        rank: 'a0',
        isArchived: false,
        isPinned: false,
        securityScope: 'standard',
        serverRevision: 1,
        createdAt: '2026-10-27T00:00:00.000Z',
        updatedAt: '2026-10-27T00:00:00.000Z',
        deletedAt: null,
      },
      {
        id: 'v1',
        workspaceId: 'ws-a',
        kind: 'note',
        folderId: null,
        rank: 'a1',
        isArchived: false,
        isPinned: false,
        securityScope: 'vault',
        serverRevision: 1,
        createdAt: '2026-10-27T00:00:00.000Z',
        updatedAt: '2026-10-27T00:00:00.000Z',
        deletedAt: null,
      },
    ];
    const res = searchDownloadedRecords({
      workspaceId: 'ws-a',
      query: { q: 'Shared', types: ['note'], limit: 20, offset: 0 },
      items: {
        headers,
        notes: [
          {
            id: 'n1',
            workspaceId: 'ws-a',
            title: 'Shared title',
            plainText: 'body a',
            document: { version: 1, type: 'doc', content: [] },
            folderId: null,
            revision: 1,
            createdAt: '2026-10-27T00:00:00.000Z',
            updatedAt: '2026-10-27T00:00:00.000Z',
            deletedAt: null,
          } as never,
          {
            id: 'v1',
            workspaceId: 'ws-a',
            title: 'Shared title',
            plainText: 'secret vault',
            document: { version: 1, type: 'doc', content: [] },
            folderId: null,
            revision: 1,
            createdAt: '2026-10-27T00:00:00.000Z',
            updatedAt: '2026-10-27T00:00:00.000Z',
            deletedAt: null,
          } as never,
        ],
        tasks: [],
        journalEntries: [],
        files: [],
      },
      preferences: { journalPreviewHidden: true },
    });
    expect(res.data.every((r) => r.id !== 'v1')).toBe(true);
    expect(res.data.some((r) => r.id === 'n1')).toBe(true);
  });

  it('mobile SearchSheet honors journalPreviewHidden prop instead of hardcoding', () => {
    const src = fs.readFileSync(
      path.join(repoRoot, 'apps/mobile/src/views/SearchSheet.tsx'),
      'utf8'
    );
    expect(src).toContain('journalPreviewHidden');
    expect(src).toContain('preferences: { journalPreviewHidden, suppressBodySnippets }');
  });
});

describe('Phase 74 — library filter scope copy', () => {
  it('explains that filters do not move ownership', () => {
    const src = fs.readFileSync(path.join(repoRoot, 'apps/web/src/app/library/page.tsx'), 'utf8');
    expect(src).toContain('does not move items');
    expect(src).toContain('Clear filters');
  });
});
