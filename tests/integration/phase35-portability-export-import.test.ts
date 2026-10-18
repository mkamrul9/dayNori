import crypto from 'node:crypto';
import { generateKeyPair, SignJWT, exportJWK, type JSONWebKeySet } from 'jose';
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
  createZipArchive,
  parseZipArchive,
  type ZipEntry,
} from '../../apps/api/src/modules/portability/zipArchive.js';
import {
  issueReauthToken,
  setReauthSecretForTesting,
  setReauthAuthenticator,
  type ReauthAuthenticator,
} from '../../apps/api/src/modules/portability/reauth.js';
import { PRIVATE_ASSETS_BUCKET } from '../../apps/api/src/modules/files/service.js';

describe('Phase 35: Workspace Portability (Export & Import) Integration Tests', () => {
  let adminPool: Pool;
  let runtimePool: Pool;
  let migrator: Migrator;
  let server: ReturnType<typeof buildServer>;
  let baseUrl: string;

  let keyPair: Awaited<ReturnType<typeof generateKeyPair>>;
  let jwks: JSONWebKeySet;

  const issuer = 'https://auth.daynori.test';
  const audience = 'daynori-api';
  const kid = 'phase35-portability-key';

  const userAId = crypto.randomUUID(); // Alice (Exporter)
  const userBId = crypto.randomUUID(); // Bob (Importer)
  const userCId = crypto.randomUUID(); // Eve (Attacker / Cross-account)

  let tokenUserA: string;
  let tokenUserB: string;
  let tokenUserC: string;

  let clientA: DaynoriApiClient;
  let clientB: DaynoriApiClient;
  let clientC: DaynoriApiClient;

  let workspaceAId: string;
  let workspaceBId: string;
  let workspaceCId: string;

  let memoryStorage: MemoryStorageProvider;

  // Track created entity IDs for verification
  let folderParentAId: string;
  let folderChildAId: string;
  let noteAId: string;
  let vaultNoteAId: string;
  let taskAId: string;
  let vaultTaskAId: string;
  let routineAId: string;
  let journalAId: string;
  let calendarAId: string;
  let fileAId: string;

  const samplePngBytes = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
    0x89,
  ]);
  const samplePngSha256 = crypto.createHash('sha256').update(samplePngBytes).digest('hex');

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
      .setExpirationTime('2h')
      .sign(keyPair.privateKey);
  }

  beforeAll(async () => {
    adminPool = createAdminPool();
    runtimePool = createRuntimePool();

    migrator = new Migrator();
    await migrator.migrate();

    memoryStorage = new MemoryStorageProvider();
    setDefaultStorageProvider(memoryStorage);

    keyPair = await generateKeyPair('RS256');
    const publicJwk = await exportJWK(keyPair.publicKey);
    publicJwk.kid = kid;
    publicJwk.alg = 'RS256';
    publicJwk.use = 'sig';
    jwks = { keys: [publicJwk] };

    setReauthSecretForTesting('daynori-reauth-test-secret-with-sufficient-entropy-32-chars');
    class TestReauthAuthenticator implements ReauthAuthenticator {
      async verifyPassword(params: { userId: string; email?: string; password?: string }): Promise<{ success: boolean; error?: string }> {
        if (!params.password) {
          return { success: false, error: 'Password is required for reauthentication' };
        }
        if (params.password === 'CorrectPassword123!') {
          return { success: true };
        }
        return { success: false, error: 'Reauthentication failed: invalid credentials' };
      }
    }
    setReauthAuthenticator(new TestReauthAuthenticator());

    tokenUserA = await createToken(userAId);
    tokenUserB = await createToken(userBId);
    tokenUserC = await createToken(userCId);

    const jwtVerifier = new JwtVerifier({
      issuer,
      audience,
      localJwks: jwks,
    });

    const safeLogger = new (await import('../../apps/api/src/plugins/logger.js')).SafeLogger(
      (entry) => {
        if (entry.level === 'error') {
          console.error('SERVER ERROR:', JSON.stringify(entry));
        }
      }
    );

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
    memoryStorage.setBaseUrl(baseUrl);

    clientA = createApiClient({ baseUrl, token: tokenUserA });
    clientB = createApiClient({ baseUrl, token: tokenUserB });
    clientC = createApiClient({ baseUrl, token: tokenUserC });

    // Setup profiles and workspaces
    const admin = await adminPool.connect();
    try {
      await admin.query(`
        INSERT INTO app.profiles (id, display_name) VALUES
          ('${userAId}', 'Alice Exporter'),
          ('${userBId}', 'Bob Importer'),
          ('${userCId}', 'Eve Attacker')
        ON CONFLICT (id) DO NOTHING;
      `);

      const wsARes = await admin.query<{ id: string }>(`
        INSERT INTO app.workspaces (name, kind, owner_id)
        VALUES ('Alice Portability Workspace', 'personal', '${userAId}')
        RETURNING id;
      `);
      workspaceAId = wsARes.rows[0]!.id;

      const wsBRes = await admin.query<{ id: string }>(`
        INSERT INTO app.workspaces (name, kind, owner_id)
        VALUES ('Bob Portability Workspace', 'personal', '${userBId}')
        RETURNING id;
      `);
      workspaceBId = wsBRes.rows[0]!.id;

      const wsCRes = await admin.query<{ id: string }>(`
        INSERT INTO app.workspaces (name, kind, owner_id)
        VALUES ('Eve Portability Workspace', 'personal', '${userCId}')
        RETURNING id;
      `);
      workspaceCId = wsCRes.rows[0]!.id;

      await admin.query(`
        INSERT INTO app.workspace_memberships (workspace_id, user_id, role) VALUES
          ('${workspaceAId}', '${userAId}', 'owner'),
          ('${workspaceBId}', '${userBId}', 'owner'),
          ('${workspaceCId}', '${userCId}', 'owner');
      `);

      // Initialize storage quota
      await admin.query(`
        INSERT INTO app.workspace_storage_usage (workspace_id, stored_bytes, reserved_bytes, max_storage_bytes)
        VALUES
          ('${workspaceAId}', 0, 0, 104857600),
          ('${workspaceBId}', 0, 0, 104857600),
          ('${workspaceCId}', 0, 0, 104857600)
        ON CONFLICT (workspace_id) DO NOTHING;
      `);

      // Seed Alice's Workspace A with comprehensive entities:
      // 1. Folders (Parent & Child)
      folderParentAId = crypto.randomUUID();
      folderChildAId = crypto.randomUUID();

      await admin.query(`
        INSERT INTO app.items (id, workspace_id, folder_id, kind, created_by, updated_by, security_scope)
        VALUES
          ('${folderParentAId}', '${workspaceAId}', NULL, 'folder', '${userAId}', '${userAId}', 'standard'),
          ('${folderChildAId}', '${workspaceAId}', '${folderParentAId}', 'folder', '${userAId}', '${userAId}', 'standard');
      `);

      await admin.query(`
        INSERT INTO app.folders (id, workspace_id, parent_id, name, color, icon)
        VALUES
          ('${folderParentAId}', '${workspaceAId}', NULL, 'Work Projects কাজ', '#4A90E2', 'folder'),
          ('${folderChildAId}', '${workspaceAId}', '${folderParentAId}', 'Mobile App মোবাইল', '#50E3C2', 'smartphone');
      `);

      // 2. Tags
      await admin.query(`
        INSERT INTO app.tags (id, workspace_id, name, color, created_by) VALUES
          ('${crypto.randomUUID()}', '${workspaceAId}', 'important-জরুরি', '#FF0000', '${userAId}'),
          ('${crypto.randomUUID()}', '${workspaceAId}', 'release-v1', '#00FF00', '${userAId}');
      `);

      // 3. Saved Views
      await admin.query(`
        INSERT INTO app.saved_views (id, workspace_id, user_id, name, icon, color, entity_type, filter, rank, is_pinned)
        VALUES
          ('${crypto.randomUUID()}', '${workspaceAId}', '${userAId}', 'High Priority Tasks', 'star', '#4A90E2', 'knowledge', '{"priority": "high"}'::jsonb, '0', true);
      `);

      // 4. Notes: Standard Note (with Bengali and emoji) & Vault Note (to verify exclusion)
      noteAId = crypto.randomUUID();
      vaultNoteAId = crypto.randomUUID();

      await admin.query(`
        INSERT INTO app.items (id, workspace_id, folder_id, kind, created_by, updated_by, security_scope)
        VALUES
          ('${noteAId}', '${workspaceAId}', '${folderChildAId}', 'note', '${userAId}', '${userAId}', 'standard'),
          ('${vaultNoteAId}', '${workspaceAId}', NULL, 'note', '${userAId}', '${userAId}', 'vault');
      `);

      await admin.query(`
        INSERT INTO app.notes (id, workspace_id, title, document, plain_text, word_count, char_count, purpose)
        VALUES
          ('${noteAId}', '${workspaceAId}', 'Bangla Project Notes বাংলা নোট 🌟', '{"type": "doc", "content": []}'::jsonb, 'আমার সোনার বাংলা, আমি তোমায় ভালোবাসি। Special export test text.', 12, 65, 'guide'),
          ('${vaultNoteAId}', '${workspaceAId}', 'Top Secret Vault Note Encrypted', '{"type": "doc"}'::jsonb, 'THIS VAULT NOTE MUST NEVER BE EXPORTED', 7, 38, 'standard');
      `);

      // 5. Tasks: Standard Task & Vault Task
      taskAId = crypto.randomUUID();
      vaultTaskAId = crypto.randomUUID();

      await admin.query(`
        INSERT INTO app.items (id, workspace_id, folder_id, kind, created_by, updated_by, security_scope)
        VALUES
          ('${taskAId}', '${workspaceAId}', '${folderChildAId}', 'todo', '${userAId}', '${userAId}', 'standard'),
          ('${vaultTaskAId}', '${workspaceAId}', NULL, 'todo', '${userAId}', '${userAId}', 'vault');
      `);

      await admin.query(`
        INSERT INTO app.tasks (id, workspace_id, title, details, priority, status, deadline_type, deadline_date)
        VALUES
          ('${taskAId}', '${workspaceAId}', 'Ship Phase 35 Portability 🚀', 'Implement clean export/import with defense in depth', 'high', 'in_progress', 'date', '2026-10-30'),
          ('${vaultTaskAId}', '${workspaceAId}', 'Vault Classified Mission', 'Should be excluded from export', 'urgent', 'todo', 'none', NULL);
      `);

      // 6. Routine
      routineAId = crypto.randomUUID();
      await admin.query(`
        INSERT INTO app.items (id, workspace_id, folder_id, kind, created_by, updated_by, security_scope)
        VALUES ('${routineAId}', '${workspaceAId}', NULL, 'routine', '${userAId}', '${userAId}', 'standard');
      `);
      await admin.query(`
        INSERT INTO app.routines (id, workspace_id, title, details, frequency, weekdays, timezone, scheduled_time, active_from)
        VALUES ('${routineAId}', '${workspaceAId}', 'Morning Sync & Review', 'Standup routine', 'weekdays', ARRAY[1,2,3,4,5], 'Asia/Dhaka', '09:30', '2026-01-01');
      `);

      // 7. Journal Entry
      journalAId = crypto.randomUUID();
      await admin.query(`
        INSERT INTO app.items (id, workspace_id, folder_id, kind, created_by, updated_by, security_scope)
        VALUES ('${journalAId}', '${workspaceAId}', NULL, 'journal_entry', '${userAId}', '${userAId}', 'standard');
      `);
      await admin.query(`
        INSERT INTO app.journal_entries (id, workspace_id, title, entry_date, timezone, document, plain_text, mood, prompts, tags)
        VALUES ('${journalAId}', '${workspaceAId}', 'Phase 35 Milestone Celebration', '2026-10-18', 'Asia/Dhaka', '{"type":"doc"}'::jsonb, 'Achieved zero-dependency zip engine and complete portable export!', 'accomplished', '["What went well?"]'::jsonb, ARRAY['milestone', 'portability']);
      `);

      // 8. Calendar Event
      calendarAId = crypto.randomUUID();
      await admin.query(`
        INSERT INTO app.items (id, workspace_id, folder_id, kind, created_by, updated_by, security_scope)
        VALUES ('${calendarAId}', '${workspaceAId}', NULL, 'calendar_event', '${userAId}', '${userAId}', 'standard');
      `);
      await admin.query(`
        INSERT INTO app.calendar_events (id, workspace_id, title, details, all_day, start_date, end_date, timezone)
        VALUES ('${calendarAId}', '${workspaceAId}', 'Phase 35 Code Review', 'Reviewing export and import engine', true, '2026-10-19', '2026-10-20', 'Asia/Dhaka');
      `);

      // 9. File Attachment in storage
      fileAId = crypto.randomUUID();
      const objectPath = `workspaces/${workspaceAId}/files/${fileAId}/test_diagram.png`;
      await memoryStorage.putObject(PRIVATE_ASSETS_BUCKET, objectPath, samplePngBytes, {
        contentType: 'image/png',
      });

      await admin.query(`
        INSERT INTO app.items (id, workspace_id, folder_id, kind, created_by, updated_by, security_scope)
        VALUES ('${fileAId}', '${workspaceAId}', '${folderChildAId}', 'file', '${userAId}', '${userAId}', 'standard');
      `);
      await admin.query(`
        INSERT INTO app.file_items (id, workspace_id, folder_id, file_name, declared_mime_type, detected_mime_type, byte_size, sha256_checksum, object_path, quarantine_status, created_by)
        VALUES ('${fileAId}', '${workspaceAId}', '${folderChildAId}', 'test_diagram.png', 'image/png', 'image/png', ${samplePngBytes.length}, '${samplePngSha256}', '${objectPath}', 'verified', '${userAId}');
      `);
    } finally {
      admin.release();
    }
  });

  afterAll(async () => {
    setReauthSecretForTesting(null);
    if (server) await server.close();
    if (adminPool) await adminPool.end();
    if (runtimePool) await runtimePool.end();
  });

  // State shared between tests
  let exportZipBuffer: Buffer;
  let exportDownloadUrl: string;
  let ephemeralExportId: string;

  describe('1. Reauthentication & Protected Export Authorization', () => {
    it('rejects export request when reauthentication token is missing (403 Forbidden)', async () => {
      await expect(
        clientA.createWorkspaceExport(workspaceAId, {
          reauthToken: '',
          includeAttachments: true,
        })
      ).rejects.toThrow();
    });

    it('rejects reauthentication with invalid password (401 Unauthorized)', async () => {
      await expect(
        clientA.reauthenticate({
          purpose: 'protected_export',
          sessionBinding: workspaceAId,
          password: 'WrongPassword123!',
        })
      ).rejects.toThrow(/invalid credentials/i);
    });

    it('rejects reauthentication when password is missing or empty (400 Bad Request)', async () => {
      await expect(
        clientA.reauthenticate({
          purpose: 'protected_export',
          sessionBinding: workspaceAId,
          password: '',
        })
      ).rejects.toThrow(/password is required/i);
    });

    it('rejects export request when reauthentication token is expired (403 Forbidden)', async () => {
      // Create manually expired reauth token (iat and exp in the past)
      const secret = 'daynori-reauth-test-secret-with-sufficient-entropy-32-chars';
      const sessionHash = crypto.createHash('sha256').update(tokenUserA).digest('hex').substring(0, 32);
      const pastClaims = {
        sub: userAId,
        workspaceId: workspaceAId,
        purpose: 'protected_export',
        iat: Math.floor(Date.now() / 1000) - 500,
        exp: Math.floor(Date.now() / 1000) - 100, // expired 100s ago within 10 min window
        sessionHash,
      };
      const claimsB64 = Buffer.from(JSON.stringify(pastClaims), 'utf8').toString('base64url');
      const sig = crypto.createHmac('sha256', secret).update(claimsB64).digest('base64url');
      const expiredToken = `${claimsB64}.${sig}`;

      await expect(
        clientA.createWorkspaceExport(workspaceAId, {
          reauthToken: expiredToken,
          includeAttachments: true,
        })
      ).rejects.toThrow(/expired/i);
    });

    it('rejects export request when reauthentication token belongs to a different user identity', async () => {
      // Reauth token minted for Bob (User B) attempted to be used by Alice on Workspace A
      const { token: bobToken } = issueReauthToken({
        userId: userBId,
        workspaceId: workspaceAId,
        purpose: 'protected_export',
        sessionToken: tokenUserA,
      });

      await expect(
        clientA.createWorkspaceExport(workspaceAId, {
          reauthToken: bobToken,
          includeAttachments: true,
        })
      ).rejects.toThrow(/different user/i);
    });

    it('rejects export request when reauthentication token is bound to a different workspace', async () => {
      // Reauth token minted for Workspace B attempted to be used on Workspace A
      const { token: wsBToken } = issueReauthToken({
        userId: userAId,
        workspaceId: workspaceBId,
        purpose: 'protected_export',
        sessionToken: tokenUserA,
      });

      await expect(
        clientA.createWorkspaceExport(workspaceAId, {
          reauthToken: wsBToken,
          includeAttachments: true,
        })
      ).rejects.toThrow(/bound to another workspace/i);
    });

    it('rejects export when reauth token is presented from a different session (session mismatch)', async () => {
      const differentSession = await createToken(userAId);
      const { token: diffSessionToken } = issueReauthToken({
        userId: userAId,
        workspaceId: workspaceAId,
        purpose: 'protected_export',
        sessionToken: differentSession,
      });

      await expect(
        clientA.createWorkspaceExport(workspaceAId, {
          reauthToken: diffSessionToken,
          includeAttachments: true,
        })
      ).rejects.toThrow(/different session/i);
    });

    it('successfully reauthenticates with valid password and generates a complete workspace export archive', async () => {
      // 1. Request fresh reauthentication ticket
      const reauthRes = await clientA.reauthenticate({
        purpose: 'protected_export',
        sessionBinding: workspaceAId,
        password: 'CorrectPassword123!',
      });

      expect(reauthRes.reauthToken).toBeDefined();
      expect(reauthRes.userId).toBe(userAId);
      expect(reauthRes.workspaceId).toBe(workspaceAId);
      expect(reauthRes.purpose).toBe('protected_export');

      // 2. Generate workspace export
      const exportRes = await clientA.createWorkspaceExport(workspaceAId, {
        reauthToken: reauthRes.reauthToken,
        includeAttachments: true,
      });

      expect(exportRes.status).toBe('completed');
      expect(exportRes.exportId).toBeDefined();
      expect(exportRes.downloadUrl).toContain('/v1/workspaces/');
      expect(exportRes.manifestSummary.foldersCount).toBe(2);
      expect(exportRes.manifestSummary.notesCount).toBe(1); // Standard note only; vault excluded
      expect(exportRes.manifestSummary.tasksCount).toBe(1); // Standard task only; vault excluded
      expect(exportRes.manifestSummary.routinesCount).toBe(1);
      expect(exportRes.manifestSummary.journalCount).toBe(1);
      expect(exportRes.manifestSummary.calendarCount).toBe(1);
      expect(exportRes.manifestSummary.filesCount).toBe(1);
      expect(exportRes.manifestSummary.totalBinaryBytes).toBe(samplePngBytes.length);

      // Verify explicit exclusions documented in manifest response
      expect(exportRes.exclusions.some((e) => e.category === 'vault')).toBe(true);
      expect(exportRes.exclusions.some((e) => e.category === 'external_drive')).toBe(true);

      ephemeralExportId = exportRes.exportId;
      exportDownloadUrl = exportRes.downloadUrl;
    });
  });

  describe('2. Ephemeral Download Link Security & Transport', () => {
    it('downloads the generated export ZIP archive successfully within valid TTL', async () => {
      const response = await fetch(`${baseUrl}${exportDownloadUrl}`, {
        headers: { Authorization: `Bearer ${tokenUserA}` },
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('application/zip');
      expect(response.headers.get('content-disposition')).toContain('attachment; filename=');

      const arrayBuf = await response.arrayBuffer();
      exportZipBuffer = Buffer.from(arrayBuf);
      expect(exportZipBuffer.length).toBeGreaterThan(0);
    });

    it('rejects download if the download token signature has been tampered with', async () => {
      const tamperedUrl = exportDownloadUrl.replace(/token=[a-f0-9]{10}/, 'token=deadbeef00');
      const response = await fetch(`${baseUrl}${tamperedUrl}`, {
        headers: { Authorization: `Bearer ${tokenUserA}` },
      });
      expect([403, 404]).toContain(response.status);
    });

    it('rejects download if the ephemeral link timestamp has expired', async () => {
      // Craft expired URL with valid signature for past timestamp
      const secret = 'daynori-reauth-test-secret-with-sufficient-entropy-32-chars';
      const expiredTime = Date.now() - 10000;
      const expiredToken = crypto
        .createHmac('sha256', secret)
        .update(`${ephemeralExportId}:${workspaceAId}:${userAId}:${expiredTime}`)
        .digest('hex');

      const expiredUrl = `/v1/workspaces/${workspaceAId}/export/download/${ephemeralExportId}?token=${expiredToken}&expires=${expiredTime}`;
      const response = await fetch(`${baseUrl}${expiredUrl}`, {
        headers: { Authorization: `Bearer ${tokenUserA}` },
      });
      expect([403, 404]).toContain(response.status);
    });

    it('rejects download when accessed by a cross-account user (Eve cannot download Alices export)', async () => {
      const response = await fetch(`${baseUrl}${exportDownloadUrl}`, {
        headers: { Authorization: `Bearer ${tokenUserC}` },
      });
      expect([403, 404]).toContain(response.status);
    });
  });

  describe('3. Archive Structure, Content Integrity & Security Exclusions', () => {
    it('unpacks ZIP archive safely and verifies manifest metadata', () => {
      const parsed = parseZipArchive(exportZipBuffer);
      expect(parsed.has('manifest.json')).toBe(true);

      const manifest = JSON.parse(parsed.get('manifest.json')!.toString('utf8'));
      expect(manifest.schemaVersion).toBe(1);
      expect(manifest.exportVersion).toBe('1.0.0');
      expect(manifest.format).toBe('daynori-workspace-export-v1');
      expect(manifest.workspace.name).toBe('Alice Portability Workspace');
      expect(manifest.summary.notesCount).toBe(1);
      expect(manifest.summary.tasksCount).toBe(1);
      expect(manifest.summary.foldersCount).toBe(2);

      // Verify vault and Google Drive exclusion notices
      expect(manifest.exclusions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ category: 'vault' }),
          expect.objectContaining({ category: 'external_drive' }),
        ])
      );
    });

    it('verifies non-vault notes, Bengali unicode, YAML frontmatter markdown, and vault exclusion', () => {
      const parsed = parseZipArchive(exportZipBuffer);

      // 1. notes.json
      expect(parsed.has('notes/notes.json')).toBe(true);
      const notes = JSON.parse(parsed.get('notes/notes.json')!.toString('utf8')) as Array<{
        id: string;
        title: string;
        plainText: string;
      }>;

      // Assert non-vault note is present
      const standardNote = notes.find((n) => n.id === noteAId);
      expect(standardNote).toBeDefined();
      expect(standardNote!.title).toContain('বাংলা নোট 🌟');
      expect(standardNote!.plainText).toContain('আমার সোনার বাংলা');

      // Assert vault note is strictly absent
      const vaultNote = notes.find((n) => n.id === vaultNoteAId);
      expect(vaultNote).toBeUndefined();

      // 2. notes/markdown/*.md
      let mdFound = false;
      for (const [path, content] of parsed.entries()) {
        if (path.startsWith('notes/markdown/') && path.endsWith('.md')) {
          mdFound = true;
          const text = content.toString('utf8');
          expect(text).toContain('---');
          expect(text).toContain('title: "Bangla Project Notes বাংলা নোট 🌟"');
          expect(text).toContain('আমার সোনার বাংলা');
        }
      }
      expect(mdFound).toBe(true);
    });

    it('verifies non-vault tasks, CSV representations, and vault exclusion', () => {
      const parsed = parseZipArchive(exportZipBuffer);

      // 1. tasks.json
      expect(parsed.has('tasks/tasks.json')).toBe(true);
      const tasks = JSON.parse(parsed.get('tasks/tasks.json')!.toString('utf8')) as Array<{
        id: string;
        title: string;
      }>;
      expect(tasks.some((t) => t.id === taskAId)).toBe(true);
      expect(tasks.some((t) => t.id === vaultTaskAId)).toBe(false);

      // 2. tasks.csv
      expect(parsed.has('tasks/tasks.csv')).toBe(true);
      const csv = parsed.get('tasks/tasks.csv')!.toString('utf8');
      expect(csv).toContain('Ship Phase 35 Portability 🚀');
      expect(csv).not.toContain('Vault Classified Mission');
    });

    it('verifies folders JSON and CSV preserve parent/child hierarchy', () => {
      const parsed = parseZipArchive(exportZipBuffer);

      expect(parsed.has('metadata/folders.json')).toBe(true);
      const folders = JSON.parse(parsed.get('metadata/folders.json')!.toString('utf8')) as Array<{
        id: string;
        parentId: string | null;
        name: string;
      }>;

      const parent = folders.find((f) => f.id === folderParentAId);
      const child = folders.find((f) => f.id === folderChildAId);

      expect(parent).toBeDefined();
      expect(parent!.parentId).toBeNull();
      expect(child).toBeDefined();
      expect(child!.parentId).toBe(folderParentAId);

      expect(parsed.has('metadata/folders.csv')).toBe(true);
      const csv = parsed.get('metadata/folders.csv')!.toString('utf8');
      expect(csv).toContain('Work Projects কাজ');
      expect(csv).toContain('Mobile App মোবাইল');
    });

    it('verifies routines, journal, calendar, and attachment binaries with valid SHA-256', () => {
      const parsed = parseZipArchive(exportZipBuffer);

      // Routines
      expect(parsed.has('routines/routines.json')).toBe(true);
      const routines = JSON.parse(parsed.get('routines/routines.json')!.toString('utf8'));
      expect(routines[0].title).toBe('Morning Sync & Review');
      expect(routines[0].weekdays).toEqual([1, 2, 3, 4, 5]);

      // Journal
      expect(parsed.has('journal/journal.json')).toBe(true);
      expect(parsed.has('journal/journal.csv')).toBe(true);
      const journal = JSON.parse(parsed.get('journal/journal.json')!.toString('utf8'));
      expect(journal[0].entryDate).toBe('2026-10-18');
      expect(journal[0].mood).toBe('accomplished');

      // Calendar
      expect(parsed.has('calendar/calendar.json')).toBe(true);
      const cal = JSON.parse(parsed.get('calendar/calendar.json')!.toString('utf8'));
      expect(cal[0].title).toBe('Phase 35 Code Review');

      // Binary Attachment & SHA-256 integrity
      expect(parsed.has('attachments/files.json')).toBe(true);
      const files = JSON.parse(parsed.get('attachments/files.json')!.toString('utf8'));
      expect(files[0].fileName).toBe('test_diagram.png');
      expect(files[0].binaryExported).toBe(true);

      const binaryPath = files[0].binaryPath as string;
      expect(parsed.has(binaryPath)).toBe(true);
      const binaryBytes = parsed.get(binaryPath)!;
      const actualSha256 = crypto.createHash('sha256').update(binaryBytes).digest('hex');
      expect(actualSha256).toBe(samplePngSha256);
    });
  });

  describe('4. Archive Safety, Traversal Defenses & Zip Bomb Rejection', () => {
    it('rejects an archive attempting path traversal with .. segments (400 Bad Request)', async () => {
      // Build a malicious archive with path traversal entry
      const maliciousZip = createZipArchive(
        [
          { path: 'manifest.json', data: JSON.stringify({ schemaVersion: 1, format: 'daynori-workspace-export-v1' }) },
          { path: '../../etc/passwd', data: 'root:x:0:0:root:/root:/bin/bash' },
        ],
        { allowUnsafePathsForTesting: true }
      );

      await expect(
        clientB.previewWorkspaceImport(workspaceBId, {
          archiveBase64: maliciousZip.toString('base64'),
        })
      ).rejects.toThrow();
    });

    it('rejects an archive attempting absolute filesystem paths (400 Bad Request)', async () => {
      const maliciousZip = createZipArchive(
        [
          { path: 'manifest.json', data: JSON.stringify({ schemaVersion: 1, format: 'daynori-workspace-export-v1' }) },
          { path: '/root/exploit.sh', data: '#!/bin/sh\necho hacked' },
        ],
        { allowUnsafePathsForTesting: true }
      );

      await expect(
        clientB.previewWorkspaceImport(workspaceBId, {
          archiveBase64: maliciousZip.toString('base64'),
        })
      ).rejects.toThrow();
    });

    it('rejects corrupted or truncated archive headers (400 Bad Request)', async () => {
      const corruptedBytes = Buffer.from('NOT_A_VALID_ZIP_ARCHIVE_DATA_HEADER');
      await expect(
        clientB.previewWorkspaceImport(workspaceBId, {
          archiveBase64: corruptedBytes.toString('base64'),
        })
      ).rejects.toThrow();
    });

    it('rejects an archive that exceeds safe decompressed byte ceiling (zip bomb defense)', async () => {
      // Test the zip parser directly with a low ceiling to verify defense
      const dummyEntries: ZipEntry[] = [
        { path: 'file1.txt', data: Buffer.alloc(1024 * 50, 0x41) },
      ];
      const zipBuf = createZipArchive(dummyEntries);

      // Should fail if maxTotalBytes option is exceeded
      expect(() =>
        parseZipArchive(zipBuf, { maxTotalBytes: 1024 * 10 })
      ).toThrow(/ZIP_BOMB_DETECTED/);
    });

    it('rejects an archive with duplicate or ambiguous normalized paths', () => {
      const duplicateZip = createZipArchive(
        [
          { path: 'manifest.json', data: '{"first": true}' },
          { path: 'manifest.json', data: '{"second": true}' },
        ],
        { allowUnsafePathsForTesting: true }
      );
      expect(() => parseZipArchive(duplicateZip)).toThrow(/Duplicate or ambiguous normalized path/);
    });

    it('rejects an archive entry with Windows reserved device name', () => {
      const reservedZip = createZipArchive(
        [
          { path: 'manifest.json', data: '{}' },
          { path: 'notes/CON.txt', data: 'reserved device name' },
        ],
        { allowUnsafePathsForTesting: true }
      );
      expect(() => parseZipArchive(reservedZip)).toThrow(/reserved device name/);
    });

    it('rejects an archive entry containing illegal filename characters', () => {
      const illegalZip = createZipArchive(
        [
          { path: 'manifest.json', data: '{}' },
          { path: 'notes/bad:name.txt', data: 'illegal character' },
        ],
        { allowUnsafePathsForTesting: true }
      );
      expect(() => parseZipArchive(illegalZip)).toThrow(/illegal character/);
    });

    it('enforces memory-bounded decompression before allocating excessive output buffer', () => {
      const largeEntry: ZipEntry[] = [
        { path: 'notes/huge.txt', data: Buffer.alloc(1024 * 50, 0x42) },
      ];
      const zipBuf = createZipArchive(largeEntry);
      expect(() =>
        parseZipArchive(zipBuf, { maxSingleEntryBytes: 1024 * 10 })
      ).toThrow(/ARCHIVE_LIMIT_EXCEEDED/);
    });
  });

  describe('5. Controlled Bounded Import Preview & Dry Run Guarantee', () => {
    let previewId: string;

    it('previews export safely in clean target Workspace B without mutating database', async () => {
      // 1. Run preview
      const previewRes = await clientB.previewWorkspaceImport(workspaceBId, {
        archiveBase64: exportZipBuffer.toString('base64'),
      });

      expect(previewRes.isValid).toBe(true);
      expect(previewRes.previewId).toBeDefined();
      expect(previewRes.manifestSummary.foldersCount).toBe(2);
      expect(previewRes.manifestSummary.notesCount).toBe(1);
      expect(previewRes.manifestSummary.tasksCount).toBe(1);
      expect(previewRes.detectedDuplicates).toEqual([]); // Workspace B is completely clean
      expect(previewRes.storageQuota.isQuotaSufficient).toBe(true);
      expect(previewRes.storageQuota.requiredBytes).toBe(samplePngBytes.length);

      previewId = previewRes.previewId;

      // 2. Strict Dry-Run Check: verify NO database mutations occurred in Workspace B during preview
      const admin = await adminPool.connect();
      try {
        const foldersCount = await admin.query<{ count: string }>(
          `SELECT count(*) FROM app.folders WHERE workspace_id = $1;`,
          [workspaceBId]
        );
        const notesCount = await admin.query<{ count: string }>(
          `SELECT count(*) FROM app.notes WHERE workspace_id = $1;`,
          [workspaceBId]
        );
        const tasksCount = await admin.query<{ count: string }>(
          `SELECT count(*) FROM app.tasks WHERE workspace_id = $1;`,
          [workspaceBId]
        );

        expect(Number(foldersCount.rows[0]!.count)).toBe(0);
        expect(Number(notesCount.rows[0]!.count)).toBe(0);
        expect(Number(tasksCount.rows[0]!.count)).toBe(0);
      } finally {
        admin.release();
      }
    });

    it('rejects import execution if attempted by an unauthorized actor (Eve)', async () => {
      await expect(
        clientC.executeWorkspaceImport(workspaceBId, {
          previewId,
          duplicateStrategy: 'create_copy',
        })
      ).rejects.toThrow();
    });
  });

  describe('6. Round-Trip Import into Clean Target Workspace & ID Remapping', () => {
    let importResult: Awaited<ReturnType<typeof clientB.executeWorkspaceImport>>;
    let cleanImportPreviewId: string;

    it('executes import into Workspace B with ID remapping and complete hierarchy preservation', async () => {
      // 1. Preview archive
      const previewRes = await clientB.previewWorkspaceImport(workspaceBId, {
        archiveBase64: exportZipBuffer.toString('base64'),
      });
      cleanImportPreviewId = previewRes.previewId;

      // 2. Execute import
      importResult = await clientB.executeWorkspaceImport(workspaceBId, {
        previewId: previewRes.previewId,
        duplicateStrategy: 'create_copy',
      });

      expect(importResult.success).toBe(true);
      expect(importResult.importedCounts.folders).toBe(2);
      expect(importResult.importedCounts.notes).toBe(1);
      expect(importResult.importedCounts.tasks).toBe(1);
      expect(importResult.importedCounts.routines).toBe(1);
      expect(importResult.importedCounts.journal).toBe(1);
      expect(importResult.importedCounts.calendar).toBe(1);
      expect(importResult.importedCounts.files).toBe(1);
      expect(importResult.copiedCounts).toBe(0);
      expect(importResult.skippedCounts).toBe(0);
    });

    it('verifies all imported items received fresh UUIDs and discarded original actor IDs', async () => {
      const admin = await adminPool.connect();
      try {
        // 1. Verify Folders
        const foldersRes = await admin.query<{
          id: string;
          parent_id: string | null;
          name: string;
        }>(
          `SELECT id, parent_id, name FROM app.folders WHERE workspace_id = $1 ORDER BY name;`,
          [workspaceBId]
        );
        expect(foldersRes.rows.length).toBe(2);

        const parentFolder = foldersRes.rows.find((f) => f.name.includes('Work Projects'));
        const childFolder = foldersRes.rows.find((f) => f.name.includes('Mobile App'));

        expect(parentFolder).toBeDefined();
        expect(childFolder).toBeDefined();

        // Must NOT match original Workspace A IDs
        expect(parentFolder!.id).not.toBe(folderParentAId);
        expect(childFolder!.id).not.toBe(folderChildAId);

        // Child's parent_id must link to the NEW parent folder UUID in Workspace B
        expect(childFolder!.parent_id).toBe(parentFolder!.id);

        // 2. Verify Note
        const notesRes = await admin.query<{
          id: string;
          folder_id: string | null;
          title: string;
          plain_text: string;
          created_by: string;
          purpose: string;
        }>(
          `SELECT n.id, i.folder_id, n.title, n.plain_text, i.created_by, n.purpose
           FROM app.notes n
           JOIN app.items i ON i.id = n.id
           WHERE n.workspace_id = $1;`,
          [workspaceBId]
        );
        expect(notesRes.rows.length).toBe(1);
        const importedNote = notesRes.rows[0]!;

        // ID must be freshly minted
        expect(importedNote.id).not.toBe(noteAId);
        // Created by must be Bob, NOT Alice
        expect(importedNote.created_by).toBe(userBId);
        // Folder must link to child folder in Workspace B
        expect(importedNote.folder_id).toBe(childFolder!.id);
        // Content and Unicode preserved
        expect(importedNote.title).toContain('বাংলা নোট 🌟');
        expect(importedNote.plain_text).toContain('আমার সোনার বাংলা');
        // Purpose preserved as guide
        expect(importedNote.purpose).toBe('guide');

        // 3. Verify Task
        const tasksRes = await admin.query<{
          id: string;
          folder_id: string | null;
          title: string;
          priority: string;
          status: string;
          deadline_date: string;
          created_by: string;
        }>(
          `SELECT t.id, i.folder_id, t.title, t.priority, t.status, t.deadline_date, i.created_by
           FROM app.tasks t
           JOIN app.items i ON i.id = t.id
           WHERE t.workspace_id = $1;`,
          [workspaceBId]
        );
        expect(tasksRes.rows.length).toBe(1);
        const importedTask = tasksRes.rows[0]!;
        expect(importedTask.id).not.toBe(taskAId);
        expect(importedTask.created_by).toBe(userBId);
        expect(importedTask.priority).toBe('high');
        expect(importedTask.status).toBe('in_progress');
        expect(importedTask.title).toContain('Ship Phase 35 Portability 🚀');

        // 4. Verify Routine
        const routinesRes = await admin.query<{
          id: string;
          title: string;
          weekdays: number[];
          timezone: string;
        }>(`SELECT id, title, weekdays, timezone FROM app.routines WHERE workspace_id = $1;`, [
          workspaceBId,
        ]);
        expect(routinesRes.rows.length).toBe(1);
        expect(routinesRes.rows[0]!.id).not.toBe(routineAId);
        expect(routinesRes.rows[0]!.weekdays).toEqual([1, 2, 3, 4, 5]);

        // 5. Verify Journal Entry
        const journalRes = await admin.query<{
          id: string;
          entry_date: string;
          mood: string;
        }>(`SELECT id, entry_date::text, mood FROM app.journal_entries WHERE workspace_id = $1;`, [
          workspaceBId,
        ]);
        expect(journalRes.rows.length).toBe(1);
        expect(journalRes.rows[0]!.id).not.toBe(journalAId);
        expect(journalRes.rows[0]!.entry_date).toBe('2026-10-18');
        expect(journalRes.rows[0]!.mood).toBe('accomplished');

        // 6. Verify Calendar Event
        const calRes = await admin.query<{
          id: string;
          title: string;
          all_day: boolean;
        }>(`SELECT id, title, all_day FROM app.calendar_events WHERE workspace_id = $1;`, [
          workspaceBId,
        ]);
        expect(calRes.rows.length).toBe(1);
        expect(calRes.rows[0]!.all_day).toBe(true);

        // 7. Verify Binary File & Storage Upload
        const filesRes = await admin.query<{
          id: string;
          file_name: string;
          object_path: string;
          byte_size: string;
          sha256_checksum: string;
          created_by: string;
        }>(
          `SELECT f.id, f.file_name, f.object_path, f.byte_size, f.sha256_checksum, f.created_by
           FROM app.file_items f
           WHERE f.workspace_id = $1;`,
          [workspaceBId]
        );
        expect(filesRes.rows.length).toBe(1);
        const importedFile = filesRes.rows[0]!;
        expect(importedFile.id).not.toBe(fileAId);
        expect(importedFile.created_by).toBe(userBId);
        expect(importedFile.file_name).toBe('test_diagram.png');
        expect(importedFile.sha256_checksum).toBe(samplePngSha256);

        // Verify the binary payload exists in storage adapter under Workspace B path
        const storedBytes = await memoryStorage.getObject(
          PRIVATE_ASSETS_BUCKET,
          importedFile.object_path
        );
        expect(storedBytes).not.toBeNull();
        expect(storedBytes!.length).toBe(samplePngBytes.length);
        const storedSha = crypto.createHash('sha256').update(storedBytes!).digest('hex');
        expect(storedSha).toBe(samplePngSha256);

        // 8. Verify Sync Change Feed advanced and recorded canonical imported items
        const syncRes = await admin.query<{ entity_type: string }>(
          `SELECT entity_type FROM app.changes WHERE workspace_id = $1;`,
          [workspaceBId]
        );
        expect(syncRes.rows.length).toBeGreaterThanOrEqual(1);
        const changeTypes = syncRes.rows.map((r) => r.entity_type);
        expect(changeTypes).toContain('note');
        expect(changeTypes).toContain('task');
        expect(changeTypes).toContain('folder');
        expect(changeTypes).toContain('file');
      } finally {
        admin.release();
      }
    });

    it('verifies idempotent retry: duplicate execution returns original authorized result without duplicate mutations', async () => {
      const retryResult = await clientB.executeWorkspaceImport(workspaceBId, {
        previewId: cleanImportPreviewId,
        duplicateStrategy: 'create_copy',
      });
      expect(retryResult.success).toBe(true);
      expect(retryResult.workspaceId).toBe(workspaceBId);
      expect(retryResult.importedCounts).toEqual(importResult.importedCounts);
    });
  });

  describe('7. Duplicate Resolution Strategies (skip, create_copy, overwrite_if_newer)', () => {
    it('detects existing duplicates during preview when items exist in target workspace', async () => {
      // Re-preview Alice's archive in Workspace B (which now has the imported items)
      const previewRes = await clientB.previewWorkspaceImport(workspaceBId, {
        archiveBase64: exportZipBuffer.toString('base64'),
      });

      expect(previewRes.detectedDuplicates.length).toBeGreaterThan(0);
      expect(
        previewRes.detectedDuplicates.some((d) => d.entityType === 'note')
      ).toBe(true);
      expect(
        previewRes.detectedDuplicates.some((d) => d.entityType === 'task')
      ).toBe(true);
    });

    it('strategy "skip" preserves existing records and skips duplicates', async () => {
      const previewRes = await clientB.previewWorkspaceImport(workspaceBId, {
        archiveBase64: exportZipBuffer.toString('base64'),
      });

      const executeRes = await clientB.executeWorkspaceImport(workspaceBId, {
        previewId: previewRes.previewId,
        duplicateStrategy: 'skip',
      });

      expect(executeRes.skippedCounts).toBeGreaterThan(0);

      // Verify total note count in Workspace B did not double
      const admin = await adminPool.connect();
      try {
        const notesCount = await admin.query<{ count: string }>(
          `SELECT count(*) FROM app.notes WHERE workspace_id = $1;`,
          [workspaceBId]
        );
        expect(Number(notesCount.rows[0]!.count)).toBe(1);
      } finally {
        admin.release();
      }
    });

    it('strategy "create_copy" creates a disambiguated copy with suffix', async () => {
      const previewRes = await clientB.previewWorkspaceImport(workspaceBId, {
        archiveBase64: exportZipBuffer.toString('base64'),
      });

      const executeRes = await clientB.executeWorkspaceImport(workspaceBId, {
        previewId: previewRes.previewId,
        duplicateStrategy: 'create_copy',
      });

      expect(executeRes.copiedCounts).toBeGreaterThan(0);

      // Verify note count increased by 1 and the new note has "(Copy)" in title
      const admin = await adminPool.connect();
      try {
        const notesRes = await admin.query<{ title: string }>(
          `SELECT title FROM app.notes WHERE workspace_id = $1 ORDER BY title;`,
          [workspaceBId]
        );
        expect(notesRes.rows.length).toBe(2);
        expect(notesRes.rows.some((r) => r.title.includes('(Copy)'))).toBe(true);
      } finally {
        admin.release();
      }
    });

    it('strategy "overwrite_if_newer" updates record only when imported version is newer', async () => {
      // 1. Update existing note in Workspace B to have an older date (e.g. 2020)
      const admin = await adminPool.connect();
      try {
        await admin.query(
          `UPDATE app.notes SET plain_text = 'Old content before overwrite', updated_at = '2020-01-01T00:00:00Z' WHERE workspace_id = $1;`,
          [workspaceBId]
        );
      } finally {
        admin.release();
      }

      // 2. Preview and execute overwrite_if_newer
      const previewRes = await clientB.previewWorkspaceImport(workspaceBId, {
        archiveBase64: exportZipBuffer.toString('base64'),
      });

      const executeRes = await clientB.executeWorkspaceImport(workspaceBId, {
        previewId: previewRes.previewId,
        duplicateStrategy: 'overwrite_if_newer',
      });

      expect(executeRes.overwrittenCounts).toBeGreaterThan(0);

      // Verify content was overwritten with imported text
      const adminCheck = await adminPool.connect();
      try {
        const notesRes = await adminCheck.query<{ plain_text: string }>(
          `SELECT plain_text FROM app.notes WHERE workspace_id = $1;`,
          [workspaceBId]
        );
        expect(
          notesRes.rows.some((r) => r.plain_text.includes('আমার সোনার বাংলা'))
        ).toBe(true);
      } finally {
        adminCheck.release();
      }
    });
  });

  describe('8. Quota Enforcement During Import', () => {
    it('blocks import preview and execution when workspace storage quota is insufficient', async () => {
      const admin = await adminPool.connect();
      try {
        // Set max_storage_bytes for Workspace C to 5 bytes (less than samplePngBytes length)
        await admin.query(
          `UPDATE app.workspace_storage_usage SET max_storage_bytes = 5, stored_bytes = 0, reserved_bytes = 0 WHERE workspace_id = $1;`,
          [workspaceCId]
        );
      } finally {
        admin.release();
      }

      // 1. Preview reports quota insufficient
      const previewRes = await clientC.previewWorkspaceImport(workspaceCId, {
        archiveBase64: exportZipBuffer.toString('base64'),
      });

      expect(previewRes.storageQuota.isQuotaSufficient).toBe(false);
      expect(previewRes.storageQuota.requiredBytes).toBe(samplePngBytes.length);
      expect(previewRes.storageQuota.availableBytes).toBe(5);
      expect(previewRes.warnings.some((w) => w.includes('STORAGE_QUOTA_EXCEEDED'))).toBe(true);

      // 2. Execution is rejected
      await expect(
        clientC.executeWorkspaceImport(workspaceCId, {
          previewId: previewRes.previewId,
          duplicateStrategy: 'skip',
        })
      ).rejects.toThrow(/STORAGE_QUOTA_EXCEEDED/);

      // 3. Restore quota
      const restoreAdmin = await adminPool.connect();
      try {
        await restoreAdmin.query(
          `UPDATE app.workspace_storage_usage SET max_storage_bytes = 104857600 WHERE workspace_id = $1;`,
          [workspaceCId]
        );
      } finally {
        restoreAdmin.release();
      }
    });
  });
});
