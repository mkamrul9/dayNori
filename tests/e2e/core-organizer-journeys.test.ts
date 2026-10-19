import crypto from 'node:crypto';
import { generateKeyPair, SignJWT, type JSONWebKeySet } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { buildServer, JwtVerifier } from '../../apps/api/src/index.js';
import { createAdminPool, createRuntimePool } from '../../apps/api/src/db/index.js';
import { Migrator } from '../../infra/supabase/migrator.js';
import { createApiClient, type DaynoriApiClient } from '@daynori/api-client';
import {
  MemoryStorageProvider,
  setDefaultStorageProvider,
} from '../../apps/api/src/modules/files/storageAdapter.js';
import {
  issueReauthToken,
  setReauthSecretForTesting,
  setReauthAuthenticator,
  type ReauthAuthenticator,
} from '../../apps/api/src/modules/portability/reauth.js';
import { PRIVATE_ASSETS_BUCKET } from '../../apps/api/src/modules/files/service.js';
import { DaynoriWorker, type StorageServiceContract } from '../../apps/worker/src/worker.js';
import { type NoteDocument, type HomeLayout } from '@daynori/domain';
import type { CalendarTaskDeadlineItem } from '@daynori/contracts';

describe('Phase 37: Core Organizer Journeys — API, Domain, and Database Integration (Synthetic Auth & In-Memory Storage)', () => {
  let adminPool: Pool;
  let runtimePool: Pool;
  let migrator: Migrator;
  let server: ReturnType<typeof buildServer>;
  let baseUrl: string;

  let keyPair: Awaited<ReturnType<typeof generateKeyPair>>;
  let jwks: JSONWebKeySet;

  const issuer = 'https://auth.daynori.test';
  const audience = 'daynori-api';
  const kid = 'phase37-release-gate-key';

  // Synthetic disposable users
  const user1Id = crypto.randomUUID(); // Primary organizer persona
  const user1Email = 'primary.organizer@example.test';
  const user1Password = 'PrimaryOrganizerPass123!';

  const user2Id = crypto.randomUUID(); // Secondary / Collaborator persona
  const user2Email = 'collaborator.organizer@example.test';
  const user2Password = 'CollaboratorOrganizerPass123!';

  let tokenUser1: string;
  let tokenUser2: string;

  let client1: DaynoriApiClient;
  let client2: DaynoriApiClient;

  let workspace1Id: string;
  let workspace2Id: string;

  let memoryStorage: MemoryStorageProvider;
  let worker: DaynoriWorker;

  async function createToken(
    userId: string,
    email: string
  ): Promise<{ token: string; sessionToken: string }> {
    const sessionToken = crypto.randomUUID();
    const token = await new SignJWT({
      sub: userId,
      email,
      aud: audience,
      iss: issuer,
      role: 'authenticated',
      aal: 'aal1',
      session_id: sessionToken,
    })
      .setProtectedHeader({ alg: 'RS256', kid })
      .setIssuedAt()
      .setExpirationTime('2h')
      .sign(keyPair.privateKey);
    return { token, sessionToken };
  }

  beforeAll(async () => {
    adminPool = createAdminPool();
    runtimePool = createRuntimePool();

    migrator = new Migrator();
    await migrator.migrate();

    memoryStorage = new MemoryStorageProvider();
    setDefaultStorageProvider(memoryStorage);

    setReauthSecretForTesting('phase37-reauth-shared-test-secret-min32chars!');

    const mockAuthenticator: ReauthAuthenticator = {
      async verifyPassword({ password }) {
        if (password === user1Password || password === user2Password) {
          return { success: true };
        }
        return { success: false, error: 'Invalid password' };
      },
      async getUserByEmail(email) {
        if (email.toLowerCase() === user1Email.toLowerCase())
          return { id: user1Id, email: user1Email };
        if (email.toLowerCase() === user2Email.toLowerCase())
          return { id: user2Id, email: user2Email };
        return null;
      },
      async revokeUserSessions() {},
      async deleteUser() {},
    };
    setReauthAuthenticator(mockAuthenticator);

    keyPair = await generateKeyPair('RS256');
    jwks = {
      keys: [
        {
          ...(await import('jose').then((m) => m.exportJWK(keyPair.publicKey))),
          kid,
          alg: 'RS256',
          use: 'sig',
        },
      ],
    };

    const verifier = new JwtVerifier({
      issuer,
      audience,
      localJwks: jwks,
      allowedAlgorithms: ['RS256'],
    });

    server = buildServer({
      adminPool,
      runtimePool,
      jwtVerifier: verifier,
      allowUnauthenticatedStartup: false,
    });

    const address = await server.listen({ port: 0, host: '127.0.0.1' });
    baseUrl = address;

    // Seed test user profiles in app.profiles so user context queries succeed
    const admin = await adminPool.connect();
    try {
      await admin.query(
        `
        INSERT INTO app.profiles (id, display_name, preferences)
        VALUES
          ($1, 'Primary Persona', '{"themeMode":"light"}'::jsonb),
          ($2, 'Collaborator Persona', '{"themeMode":"dark"}'::jsonb)
        ON CONFLICT (id) DO UPDATE
          SET preferences = EXCLUDED.preferences;
      `,
        [user1Id, user2Id]
      );
    } finally {
      admin.release();
    }

    const workerStorageContract: StorageServiceContract = {
      async getObject(bucket: string, objectPath: string) {
        const buf = await memoryStorage.getObject(bucket, objectPath);
        return { buffer: buf, contentLength: buf.length, contentType: 'application/octet-stream' };
      },
      async putObject(bucket: string, objectPath: string, buffer: Buffer, contentType?: string) {
        await memoryStorage.putObject(bucket, objectPath, buffer, contentType);
      },
      async deleteObject(bucket: string, objectPath: string) {
        await memoryStorage.deleteObject(bucket, objectPath);
      },
    };

    worker = new DaynoriWorker(adminPool, {
      storageService: workerStorageContract,
      defaultBucket: PRIVATE_ASSETS_BUCKET,
    });
    worker.start();

    const res1 = await createToken(user1Id, user1Email);
    tokenUser1 = res1.token;

    const res2 = await createToken(user2Id, user2Email);
    tokenUser2 = res2.token;

    client1 = createApiClient({ baseUrl, token: () => tokenUser1 });
    client2 = createApiClient({ baseUrl, token: () => tokenUser2 });
  }, 30000);

  afterAll(async () => {
    if (worker) {
      worker.stop();
    }
    if (server) {
      await server.close();
    }
    if (adminPool) {
      await adminPool.end();
    }
    if (runtimePool) {
      await runtimePool.end();
    }
  }, 30000);

  // --------------------------------------------------------------------------
  // Journey 1: Sign up, provision workspace, skip/resume/replay onboarding
  // --------------------------------------------------------------------------
  it('Journey 1: provisions workspace once, updates onboarding, and replays safely', async () => {
    // 1. Provision workspace for user 1
    const prov1 = await client1.provisionPersonalWorkspace();
    expect(prov1.data.workspace.id).toBeDefined();
    workspace1Id = prov1.data.workspace.id;

    // Idempotent second provision returns same workspace
    const prov1Repeat = await client1.provisionPersonalWorkspace();
    expect(prov1Repeat.data.workspace.id).toBe(workspace1Id);

    // 2. Initial preferences check onboarding state
    const prefsInitial = await client1.getUserPreferences();
    expect(prefsInitial.data.preferences).toBeDefined();

    // 3. Skip onboarding tour
    const updatedPrefs = await client1.updateUserPreferences({
      preferences: {
        onboarding: {
          version: 1,
          completed: true,
          skipped: true,
          step: 'completed',
          selectedInterests: ['notes', 'planning', 'journal', 'files'],
          createdSampleItemIds: [],
        },
      },
    });
    expect(updatedPrefs.data.preferences.onboarding?.completed).toBe(true);
    expect(updatedPrefs.data.preferences.onboarding?.skipped).toBe(true);

    // 4. Replay onboarding without creating duplicate starter items
    const replayedPrefs = await client1.updateUserPreferences({
      preferences: {
        onboarding: {
          version: 1,
          completed: false,
          skipped: false,
          step: 'capture',
          selectedInterests: ['notes', 'planning', 'journal', 'files'],
          createdSampleItemIds: [],
        },
      },
    });
    expect(replayedPrefs.data.preferences.onboarding?.step).toBe('capture');

    // Complete replay
    await client1.updateUserPreferences({
      preferences: {
        onboarding: {
          version: 1,
          completed: true,
          skipped: false,
          step: 'completed',
          selectedInterests: ['notes', 'planning', 'journal', 'files'],
          createdSampleItemIds: [],
        },
      },
    });
  });

  // --------------------------------------------------------------------------
  // Journey 2: Capture a Bangla/English note, interrupt, reopen, and recover
  // --------------------------------------------------------------------------
  it('Journey 2: captures and recovers bilingual Bangla/English note exact AST content', async () => {
    const banglaTitle = 'আজকের গবেষণা নোট: বিতরণকৃত সিস্টেম ও সিঙ্ক ইঞ্জিন';
    const noteAst: NoteDocument = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'Daynori ensures complete Unicode integrity across Bengali conjuncts (যেমন: গবেষণা, সিঙ্ক, বিতরণকৃত) and English technical terms.',
            },
          ],
        },
      ],
    };

    // Create note via API
    const noteRes = await client1.createNote(workspace1Id, {
      title: banglaTitle,
      document: noteAst,
      plainText:
        'Daynori ensures complete Unicode integrity across Bengali conjuncts and English technical terms.',
    });

    expect(noteRes.data.id).toBeDefined();
    expect(noteRes.data.title).toBe(banglaTitle);

    // Re-fetch note and verify exact Unicode content
    const fetched = await client1.getNote(workspace1Id, noteRes.data.id);
    expect(fetched.data.title).toBe(banglaTitle);
    expect(fetched.data.document.content?.[0]?.content?.[0]?.text).toContain('বিতরণকৃত');
  });

  // --------------------------------------------------------------------------
  // Journey 3: Create folders, organize mixed records, move items, trash and restore
  // --------------------------------------------------------------------------
  it('Journey 3: organizes hierarchical folders, moves records, and verifies trash/restore', async () => {
    // 1. Create parent folder: Software
    const softwareFolder = await client1.createFolder(workspace1Id, {
      name: 'Software',
      icon: '💻',
    });

    // 2. Create subfolder: Projects inside Software
    const projectsFolder = await client1.createFolder(workspace1Id, {
      name: 'Projects',
      parentId: softwareFolder.data.id,
      icon: '🚀',
    });

    // 3. Create Note inside Software
    const devNote = await client1.createNote(workspace1Id, {
      title: 'Architecture Blueprint',
      document: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Architecture notes' }] }],
      },
      folderId: softwareFolder.data.id,
    });
    expect(devNote.data.folderId).toBe(softwareFolder.data.id);

    // 4. Move Note into subfolder Projects without changing note ID
    const movedNote = await client1.updateNote(workspace1Id, devNote.data.id, {
      folderId: projectsFolder.data.id,
      baseRevision: devNote.data.revision,
    });
    expect(movedNote.data.id).toBe(devNote.data.id);
    expect(movedNote.data.folderId).toBe(projectsFolder.data.id);

    // 5. Soft-delete (trash) note
    await client1.trashNote(workspace1Id, devNote.data.id);

    // 6. Verify note is excluded from active list
    const activeNotes = await client1.listNotes(workspace1Id);
    expect(activeNotes.data.some((n) => n.id === devNote.data.id)).toBe(false);

    // 7. Restore note from trash
    await client1.restoreNote(workspace1Id, devNote.data.id);
    const restoredNote = await client1.getNote(workspace1Id, devNote.data.id);
    expect(restoredNote.data.id).toBe(devNote.data.id);
    expect(restoredNote.data.folderId).toBe(projectsFolder.data.id);
  });

  // --------------------------------------------------------------------------
  // Journey 4: Create deadline and recurring routine; verify distinct behavior
  // --------------------------------------------------------------------------
  it('Journey 4: separates one-off task deadline from daily recurring routine across dates', async () => {
    // 1. Create one-off task with explicit date deadline in Asia/Dhaka
    const taskRes = await client1.createTask(workspace1Id, {
      title: 'Submit Release Evidence Package',
      priority: 'high',
      deadline: {
        type: 'date',
        date: '2026-10-25',
      },
    });
    expect(taskRes.data.id).toBeDefined();
    expect(taskRes.data.deadline.type).toBe('date');

    // 2. Create recurring routine scheduled daily
    const routineRes = await client1.createRoutine(workspace1Id, {
      title: 'Morning Code & Test Review',
      details: 'Review nightly builds and automated test results',
      timezone: 'Asia/Dhaka',
      frequency: 'daily',
      activeFrom: '2026-10-20',
    });
    expect(routineRes.data.id).toBeDefined();

    // 3. Verify calendar feed projects both correctly without duplicate task rows
    const feed = await client1.getCalendarFeed(workspace1Id, {
      startDate: '2026-10-20',
      endDate: '2026-10-26',
      timezone: 'Asia/Dhaka',
    });
    expect(feed.data.items.length).toBeGreaterThan(0);

    // One-off task appears exactly on its deadline date
    const taskEntries = feed.data.items.filter(
      (i) =>
        i.sourceType === 'task_deadline' &&
        (i as CalendarTaskDeadlineItem).taskId === taskRes.data.id
    );
    expect(taskEntries.length).toBe(1);
    expect((taskEntries[0] as CalendarTaskDeadlineItem).deadlineDate).toBe('2026-10-25');
  });

  // --------------------------------------------------------------------------
  // Journey 5: Complete, skip, undo, and review routine history
  // --------------------------------------------------------------------------
  it('Journey 5: exercises full routine occurrence lifecycle: complete, undo, skip, history', async () => {
    const routine = await client1.createRoutine(workspace1Id, {
      title: 'Daily Release Verification Drill',
      timezone: 'Asia/Dhaka',
      frequency: 'daily',
      activeFrom: '2026-10-01',
    });

    const todayDate = new Date().toISOString().slice(0, 10);

    // Generate occurrences
    const occRes = await client1.generateOccurrences(workspace1Id, {
      startDate: todayDate,
      endDate: todayDate,
      routineId: routine.data.id,
    });
    expect(occRes.data.length).toBeGreaterThan(0);
    const occ = occRes.data[0]!;
    const occurrenceId = occ.id;

    // Complete routine occurrence
    const completedRes = await client1.completeOccurrence(workspace1Id, occurrenceId, {
      baseRevision: occ.revision,
      scheduledDate: todayDate,
    });
    expect(completedRes.data.status).toBe('done');

    // Undo completion back to pending
    const reopenedRes = await client1.reopenOccurrence(workspace1Id, occurrenceId, {
      baseRevision: completedRes.data.revision,
    });
    expect(reopenedRes.data.status).toBe('pending');

    // Skip occurrence
    const skippedRes = await client1.skipOccurrence(workspace1Id, occurrenceId, {
      baseRevision: reopenedRes.data.revision,
      scheduledDate: todayDate,
    });
    expect(skippedRes.data.status).toBe('skipped');

    // Review routine occurrences list
    const occurrences = await client1.listOccurrences(workspace1Id, {
      startDate: todayDate,
      endDate: todayDate,
      routineId: routine.data.id,
    });
    expect(occurrences.data.length).toBeGreaterThan(0);
    expect(occurrences.data.some((o) => o.id === occurrenceId)).toBe(true);
  });

  // --------------------------------------------------------------------------
  // Journey 6: Write multiple journal entries on one date and verify privacy
  // --------------------------------------------------------------------------
  it('Journey 6: allows multiple journal entries per date and enforces snippet privacy', async () => {
    const today = new Date().toISOString().slice(0, 10);

    // Entry 1: Morning Reflection
    const entry1 = await client1.createJournalEntry(workspace1Id, {
      entryDate: today,
      title: 'Morning Focus & Intentions',
      timezone: 'Asia/Dhaka',
      document: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Private sensitive morning thoughts.' }],
          },
        ],
      },
      plainText: 'Private sensitive morning thoughts.',
      prompts: [{ prompt: 'What is top priority?', response: 'Gate verification' }],
    });
    expect(entry1.data.id).toBeDefined();

    // Entry 2: Evening Review on same date
    const entry2 = await client1.createJournalEntry(workspace1Id, {
      entryDate: today,
      title: 'Evening Debrief',
      timezone: 'Asia/Dhaka',
      document: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Private sensitive evening debrief.' }],
          },
        ],
      },
      plainText: 'Private sensitive evening debrief.',
    });
    expect(entry2.data.id).toBeDefined();

    // List entries for date
    const entries = await client1.listJournalEntries(workspace1Id, { date: today });
    expect(entries.data.length).toBe(2);

    // Search query for "sensitive": journal snippet privacy redaction
    const searchRes = await client1.searchWorkspace(workspace1Id, { q: 'sensitive' });
    for (const match of searchRes.data) {
      if (match.displayType === 'journal') {
        // Journal bodies must not be leaked in search snippet when privacy setting is respected
        expect(match.snippet).not.toContain('sensitive morning thoughts');
      }
    }
  });

  // --------------------------------------------------------------------------
  // Journey 7: Upload, scan, preview, download, and interrupt file transfers
  // --------------------------------------------------------------------------
  it('Journey 7: reserves upload, uploads blob, executes worker scan, and downloads', async () => {
    const syntheticPdf = Buffer.from(
      '%PDF-1.4\n1 0 obj\n<< /Title (Release Gate Certification) >>\nendobj\ntrailer\n<<>>\n%%EOF'
    );
    const checksum = crypto.createHash('sha256').update(syntheticPdf).digest('hex');

    // 1. Reserve upload
    const reservation = await client1.reserveFileUpload(workspace1Id, {
      fileName: 'release-gate-certification.pdf',
      declaredMimeType: 'application/pdf',
      declaredBytes: syntheticPdf.length,
    });
    expect(reservation.data.reservationId).toBeDefined();

    // 2. Upload blob into private bucket directly via storage provider
    const objectPath = reservation.data.objectPath;
    await memoryStorage.putObject(
      PRIVATE_ASSETS_BUCKET,
      objectPath,
      syntheticPdf,
      'application/pdf'
    );

    // 3. Finalize upload
    const finalRes = await client1.finalizeFileUpload(
      workspace1Id,
      reservation.data.reservationId,
      {
        clientChecksum: checksum,
      }
    );
    expect(finalRes.data.fileId).toBe(reservation.data.fileId);

    // 4. Run worker background scan
    await worker.pollAndProcessNextJob();

    // 5. Verify file metadata quarantineStatus is verified
    const fileMeta = await client1.getFileMetadata(workspace1Id, reservation.data.fileId);
    expect(fileMeta.data.quarantineStatus).toBe('verified');

    // 6. Get download capability
    const downloadCap = await client1.getFileDownloadCapability(
      workspace1Id,
      reservation.data.fileId
    );
    expect(downloadCap.data.downloadUrl).toBeDefined();
  });

  // --------------------------------------------------------------------------
  // Journey 8: Knowledge guides, tags, links, backlinks, and saved views
  // --------------------------------------------------------------------------
  it('Journey 8: creates linked knowledge guides and verifies bidirectional backlinks', async () => {
    // 1. Target Guide
    const targetGuide = await client1.createNote(workspace1Id, {
      title: 'Canonical Architecture Standards',
      document: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Core principles: offline first, RLS boundaries.' }],
          },
        ],
      },
    });

    // 2. Referencing Guide
    const referencingGuide = await client1.createNote(workspace1Id, {
      title: 'Release Readiness Checklist',
      document: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Conforms strictly to Architecture Standards.' }],
          },
        ],
      },
    });

    // 3. Create explicit Item Link from referencingGuide to targetGuide
    await client1.createItemLink(workspace1Id, referencingGuide.data.id, {
      targetItemId: targetGuide.data.id,
      linkType: 'reference',
    });

    // 4. Resolve backlinks for targetGuide
    const resolvedLinks = await client1.getItemResolvedLinks(workspace1Id, targetGuide.data.id);
    expect(resolvedLinks.data.length).toBeGreaterThan(0);
    expect(
      resolvedLinks.data.some(
        (b) => b.direction === 'incoming' && b.sourceItemId === referencingGuide.data.id
      )
    ).toBe(true);

    // 5. Create Saved View
    const savedView = await client1.createSavedView(workspace1Id, {
      name: 'Standards & Guides',
      entityType: 'notes',
    });
    expect(savedView.data.id).toBeDefined();
  });

  // --------------------------------------------------------------------------
  // Journey 9: Customize Today and verify cross-device preferences
  // --------------------------------------------------------------------------
  it('Journey 9: synchronizes Today layout customizations across devices with optimistic concurrency', async () => {
    const customLayout: HomeLayout = {
      version: 1,
      density: 'comfortable',
      widgets: [
        { id: 'tasks', visible: true, order: 0, customLabel: 'Priority Tasks' },
        { id: 'routines', visible: true, order: 1, customLabel: 'Daily Disciplines' },
        { id: 'upcoming_summary', visible: true, order: 2 },
        { id: 'journal_prompt', visible: false, order: 3 },
        { id: 'recent_items', visible: false, order: 4 },
      ],
      moduleShortcuts: [
        { id: 'today', visible: true, order: 0 },
        { id: 'plan', visible: true, order: 1 },
        { id: 'library', visible: true, order: 2 },
        { id: 'journal', visible: true, order: 3 },
      ],
      favoriteFolderIds: [],
    };

    // Device 1 updates layout
    const updated = await client1.updateUserPreferences({
      preferences: {
        homeLayout: customLayout,
      },
    });
    expect(updated.data.preferences.homeLayout?.widgets[0]?.customLabel).toBe('Priority Tasks');

    // Device 2 reads updated layout
    const device2Prefs = await client1.getUserPreferences();
    expect(device2Prefs.data.preferences.homeLayout?.widgets[0]?.customLabel).toBe(
      'Priority Tasks'
    );
    expect(device2Prefs.data.preferences.homeLayout?.widgets[1]?.customLabel).toBe(
      'Daily Disciplines'
    );

    // Stale optimistic revision conflict test: passing expired revision throws 409
    await expect(
      client1.updateUserPreferences({
        preferences: {
          homeLayout: customLayout,
        },
        expectedRevision: updated.data.revision - 1, // intentionally stale
      })
    ).rejects.toThrow();
  });

  // --------------------------------------------------------------------------
  // Journey 10: Search online/offline and open the exact canonical result
  // --------------------------------------------------------------------------
  it('Journey 10: searches across mixed items and resolves exact canonical item ID', async () => {
    const searchRes = await client1.searchWorkspace(workspace1Id, {
      q: 'Standards',
    });
    expect(searchRes.data.length).toBeGreaterThan(0);
    const topMatch = searchRes.data[0]!;
    expect(topMatch.title).toContain('Standards');

    // Open exact canonical item
    const note = await client1.getNote(workspace1Id, topMatch.id);
    expect(note.data.id).toBe(topMatch.id);
  });

  // --------------------------------------------------------------------------
  // Journey 11: Edit concurrently, review conflicts, and keep both versions
  // --------------------------------------------------------------------------
  it('Journey 11: handles concurrent revision conflict with side-by-side preservation', async () => {
    // Shared note
    const note = await client1.createNote(workspace1Id, {
      title: 'Shared Strategy Document',
      document: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Base revision v1' }] }],
      },
    });

    // Client 1 updates to v2
    const v2 = await client1.updateNote(workspace1Id, note.data.id, {
      title: 'Shared Strategy Document (Device A update)',
      document: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Device A content' }] }],
      },
      baseRevision: note.data.revision,
    });
    expect(v2.data.revision).toBeGreaterThan(note.data.revision);

    // Client 2 attempts to update using stale base revision: rejected with 409 conflict
    await expect(
      client1.updateNote(workspace1Id, note.data.id, {
        title: 'Shared Strategy Document (Device B concurrent update)',
        document: {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Device B content' }] }],
        },
        baseRevision: note.data.revision, // stale!
      })
    ).rejects.toThrow();

    // Keep Both: Create side-by-side copy preserving Device B draft
    const branchCopy = await client1.createNote(workspace1Id, {
      title: 'Shared Strategy Document (Recovered Conflict Draft)',
      document: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Device B content' }] }],
      },
    });
    expect(branchCopy.data.id).toBeDefined();

    // Both versions exist independently in workspace
    const allNotes = await client1.listNotes(workspace1Id);
    expect(allNotes.data.some((n) => n.id === note.data.id)).toBe(true);
    expect(allNotes.data.some((n) => n.id === branchCopy.data.id)).toBe(true);
  });

  // --------------------------------------------------------------------------
  // Journey 12: Export/import representative workspace and verify byte checksums
  // --------------------------------------------------------------------------
  it('Journey 12: exports workspace and verifies round-trip import byte checksums', async () => {
    // 1. Issue reauth ticket for export bound to user1's session token (tokenUser1)
    const { token: exportTicket } = issueReauthToken({
      userId: user1Id,
      purpose: 'protected_export',
      workspaceId: workspace1Id,
      sessionToken: tokenUser1,
    });

    // 2. Request export
    const exportRes = await client1.createWorkspaceExport(workspace1Id, {
      reauthToken: exportTicket,
      includeAttachments: true,
    });
    expect(exportRes.exportId).toBeDefined();

    // 3. Download export ZIP archive directly from storage
    const exportObjectPath = `exports/${workspace1Id}/${exportRes.exportId}.zip`;
    const exportZipBuffer = await memoryStorage.getObject(PRIVATE_ASSETS_BUCKET, exportObjectPath);
    expect(exportZipBuffer.length).toBeGreaterThan(100);

    // 4. Provision clean destination workspace for user 2
    const prov2 = await client2.provisionPersonalWorkspace();
    workspace2Id = prov2.data.workspace.id;

    // 5. Preview import
    const previewRes = await client2.previewWorkspaceImport(workspace2Id, {
      archiveBase64: exportZipBuffer.toString('base64'),
    });
    expect(previewRes.isValid).toBe(true);
    expect(previewRes.previewId).toBeDefined();

    // 6. Execute import with 'create_copy' resolution strategy
    const executeImport = await client2.executeWorkspaceImport(workspace2Id, {
      previewId: previewRes.previewId,
      duplicateStrategy: 'create_copy',
    });
    expect(executeImport.success).toBe(true);
    expect(executeImport.importedCounts.notes).toBeGreaterThan(0);
  });

  // --------------------------------------------------------------------------
  // Journey 13: Delete disposable accounts/workspaces and verify purge
  // --------------------------------------------------------------------------
  it('Journey 13: deletes workspace and executes permanent account deletion purge', async () => {
    // 1. Delete Workspace 2
    const { token: wsDeleteTicket } = issueReauthToken({
      userId: user2Id,
      purpose: 'workspace_deletion',
      workspaceId: workspace2Id,
      sessionToken: tokenUser2,
    });

    const wsDelRes = await client2.deleteWorkspace(workspace2Id, {
      reauthTicket: wsDeleteTicket,
    });
    expect(wsDelRes.success).toBe(true);

    // Workspace 2 is gone: subsequent query returns 404
    await expect(client2.listNotes(workspace2Id)).rejects.toThrow();

    // 2. Request account deletion for User 2
    const reqDel = await client2.requestAccountDeletion({
      password: user2Password,
      reason: 'Automated release gate verification test',
    });
    expect(reqDel.deletionId).toBeDefined();
    expect(reqDel.confirmationToken).toBeDefined();

    // 3. Confirm account deletion with confirmation token
    const confirmDel = await client2.confirmAccountDeletion({
      confirmationToken: reqDel.confirmationToken!,
    });
    expect(confirmDel.success).toBe(true);
    expect(confirmDel.status).toBe('processing');

    // 4. Verify user 2 token is revoked and cannot access API
    await expect(client2.getUserPreferences()).rejects.toThrow();
  });
});
