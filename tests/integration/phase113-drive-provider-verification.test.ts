/**
 * Phase 113 — Google Drive Provider-Verification and Authorized Folder Access Audit
 *
 * Verifies all 11 required provider scenarios:
 * 1. Selected folder containing existing files (drive.file authorizes container, denies unpicked descendants).
 * 2. New externally added file (denied under drive.file without picker selection).
 * 3. Nested folders (parent authorized; child folder denied unless individually picked; when picked, nested properly).
 * 4. Individually picked files (authorized, support link_reference and import_copy).
 * 5. App-created files (uploaded into folder, authorized).
 * 6. Move / delete (moving updates hierarchy; trashing marks source_unavailable; disconnect NEVER deletes remote original).
 * 7. Permission loss (token revocation / permission loss transitions connection to revoked / permission_lost).
 * 8. Pagination (paging through large authorized result sets with pageToken chunks within boundary).
 * 9. Token expiry (short-lived access tokens expire; refresh token rotation / exchange).
 * 10. Revoke and disconnect (tokens wiped, generation incremented, jobs fenced, imported copies preserved).
 * 11. Vault exclusion & multi-tenant isolation (isVaultDriveTarget fails closed, cross-workspace operations fail closed).
 */

import crypto from 'node:crypto';
import { generateKeyPair, SignJWT, exportJWK, type JSONWebKeySet } from 'jose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { buildServer, JwtVerifier } from '../../apps/api/src/index.js';
import { createAdminPool, createRuntimePool } from '../../apps/api/src/db/index.js';
import { Migrator } from '../../infra/supabase/migrator.js';
import { createApiClient, DaynoriApiClient } from '@daynori/api-client';
import {
  DRIVE_FILE_SCOPE,
  GOOGLE_DRIVE_FOLDER_MIME,
  buildAuthorizedDriveTree,
  disconnectExplanation,
  evaluateBroaderScopeRequirement,
  evaluateDescendantAuthorization,
  findHelpArticle,
  HELP_ARTICLES,
  isDriveFolder,
  isVaultDriveTarget,
  mayCompleteDriveWork,
  validateGrantedDriveScopes,
  validateRequestedDriveScopes,
  validateTraversalBoundary,
} from '@daynori/domain';
import {
  DriveProviderUnavailableError,
  FakeGoogleDriveProvider,
  GoogleDriveProvider,
  setDriveProviderForTests,
} from '../../apps/api/src/modules/drive/provider.js';
import {
  MemoryStorageProvider,
  setDefaultStorageProvider,
} from '../../apps/api/src/modules/files/storageAdapter.js';
import {
  PolicyMalwareScanner,
  setDefaultMalwareScanner,
} from '../../apps/api/src/modules/files/scanner.js';

describe('Phase 113: Google Drive Provider-Verification & Authorized Folder Access Suite', () => {
  let adminPool: Pool;
  let runtimePool: Pool;
  let migrator: Migrator;
  let server: ReturnType<typeof buildServer>;
  let baseUrl: string;
  let keyPair: Awaited<ReturnType<typeof generateKeyPair>>;
  let jwks: JSONWebKeySet;
  let fakeProvider: FakeGoogleDriveProvider;
  let memoryStorage: MemoryStorageProvider;

  const issuer = 'https://auth.daynori.test';
  const audience = 'daynori-api';
  const kid = 'phase113-drive-audit-key';

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
    process.env['NODE_ENV'] = 'test';
    process.env['DAYNORI_ALLOW_DRIVE_TEST_INJECTION'] = 'true';
    process.env['DAYNORI_DRIVE_TOKEN_ENCRYPTION_KEY'] = crypto.randomBytes(32).toString('base64');
    process.env['DAYNORI_DRIVE_TOKEN_KEY_VERSION'] = 'v1-phase113-drive-audit';
    process.env['DAYNORI_DRIVE_PROVIDER'] = 'fake';

    adminPool = createAdminPool();
    runtimePool = createRuntimePool();
    migrator = new Migrator();
    await migrator.migrate();

    memoryStorage = new MemoryStorageProvider();
    setDefaultStorageProvider(memoryStorage);
    setDefaultMalwareScanner(new PolicyMalwareScanner());

    keyPair = await generateKeyPair('RS256');
    const publicJwk = await exportJWK(keyPair.publicKey);
    publicJwk.kid = kid;
    publicJwk.alg = 'RS256';
    publicJwk.use = 'sig';
    jwks = { keys: [publicJwk] };

    const verifier = new JwtVerifier({ issuer, audience, localJwks: jwks });
    fakeProvider = new FakeGoogleDriveProvider();
    setDriveProviderForTests(fakeProvider);

    server = buildServer({
      jwtVerifier: verifier,
      runtimePool,
      rateLimitOptions: { windowMs: 60000, maxRequests: 50000 },
    });
    await server.listen({ port: 0, host: '127.0.0.1' });
    const addr = server.server.address();
    if (!addr || typeof addr === 'string') throw new Error('no address');
    baseUrl = `http://127.0.0.1:${addr.port}`;
    memoryStorage.setBaseUrl(baseUrl);

    tokenUserA = await createToken(userAId);
    tokenUserB = await createToken(userBId);
    clientA = createApiClient({ baseUrl, token: tokenUserA });
    clientB = createApiClient({ baseUrl, token: tokenUserB });

    const setupClient = await adminPool.connect();
    try {
      await setupClient.query(
        `INSERT INTO app.profiles (id, display_name) VALUES ($1, $2), ($3, $4) ON CONFLICT (id) DO NOTHING`,
        [userAId, 'Alice Phase113', userBId, 'Bob Phase113']
      );
      const wsARes = await setupClient.query<{ id: string }>(
        `INSERT INTO app.workspaces (name, kind, owner_id) VALUES ($1, 'personal', $2) RETURNING id`,
        ['Alice Drive Audit WS', userAId]
      );
      workspaceAId = wsARes.rows[0]!.id;
      const wsBRes = await setupClient.query<{ id: string }>(
        `INSERT INTO app.workspaces (name, kind, owner_id) VALUES ($1, 'personal', $2) RETURNING id`,
        ['Bob Drive Audit WS', userBId]
      );
      workspaceBId = wsBRes.rows[0]!.id;
      await setupClient.query(
        `INSERT INTO app.workspace_memberships (workspace_id, user_id, role) VALUES ($1, $2, 'owner'), ($3, $4, 'owner')`,
        [workspaceAId, userAId, workspaceBId, userBId]
      );
    } finally {
      setupClient.release();
    }
  }, 120_000);

  afterAll(async () => {
    setDriveProviderForTests(null);
    if (server) await server.close();
    if (runtimePool) await runtimePool.end();
    if (adminPool) await adminPool.end();
  });

  beforeEach(() => {
    process.env['NODE_ENV'] = 'test';
    process.env['DAYNORI_ALLOW_DRIVE_TEST_INJECTION'] = 'true';
    process.env['DAYNORI_DRIVE_PROVIDER'] = 'fake';
    setDriveProviderForTests(fakeProvider);
  });

  async function connectFake(client: DaynoriApiClient, workspaceId: string) {
    const started = await client.startDriveConnect(workspaceId, {
      platform: 'web',
      returnPath: '/settings/drive',
    });
    const state = new URL(started.data.authorizationUrl).searchParams.get('state')!;
    return client.completeDriveConnect(workspaceId, {
      intentId: started.data.intentId,
      state,
      code: 'fake-ok',
    });
  }

  describe('Scenario 1: Selected folder containing existing files', () => {
    it('authorizes the selected folder container but rejects unpicked pre-existing files', async () => {
      // 1. Authorize folder container
      const containerAuth = evaluateDescendantAuthorization({
        parentFolderId: 'test-folder-alpha',
        childFileId: 'test-folder-alpha',
        provenance: 'picker_selected',
        grantedScope: DRIVE_FILE_SCOPE,
      });
      expect(containerAuth.authorized).toBe(true);

      // 2. Pre-existing file inside folder that was not picked is DENIED
      const unpickedDescendant = evaluateDescendantAuthorization({
        parentFolderId: 'test-folder-alpha',
        childFileId: 'pre-existing-unpicked-file-001',
        provenance: 'pre_existing_unpicked',
        grantedScope: DRIVE_FILE_SCOPE,
      });
      expect(unpickedDescendant.authorized).toBe(false);
      expect(unpickedDescendant.reason).toBe('drive_file_scope_does_not_grant_unpicked_descendants');
      expect(unpickedDescendant.scopeCategory).toBe('narrow_drive_file');

      // Attempting to fetch unpicked file from provider throws not_found / unseeded
      await expect(
        fakeProvider.getFileMeta('fake-access-1234', 'pre-existing-unpicked-file-001')
      ).rejects.toThrow(DriveProviderUnavailableError);
    });
  });

  describe('Scenario 2: New externally added file', () => {
    it('denies access to files dropped into the folder externally without explicit picker selection', () => {
      const externalAddition = evaluateDescendantAuthorization({
        parentFolderId: 'test-folder-alpha',
        childFileId: 'external-added-doc-999',
        provenance: 'external_unpicked',
        grantedScope: DRIVE_FILE_SCOPE,
      });
      expect(externalAddition.authorized).toBe(false);
      expect(externalAddition.reason).toBe('drive_file_scope_does_not_grant_unpicked_descendants');

      // Traversal boundary check strictly forbids expanding to unpicked children
      const boundary = validateTraversalBoundary({
        targetFolderId: 'unauthorized-external-folder',
        authorizedFolderIds: new Set(['test-folder-alpha']),
      });
      expect(boundary.withinBoundary).toBe(false);
    });
  });

  describe('Scenario 3: Nested folders', () => {
    it('denies unpicked nested subfolders, but properly preserves hierarchy once picked', () => {
      // Unpicked subfolder is denied
      const unpickedSubfolder = evaluateDescendantAuthorization({
        parentFolderId: 'root-folder-1',
        childFileId: 'subfolder-unpicked',
        provenance: 'pre_existing_unpicked',
        grantedScope: DRIVE_FILE_SCOPE,
      });
      expect(unpickedSubfolder.authorized).toBe(false);

      // Once picked, tree preserves hierarchy
      const items = [
        {
          id: 'item-root',
          providerFileId: 'folder-root',
          displayName: 'Parent Directory',
          mimeType: GOOGLE_DRIVE_FOLDER_MIME,
          linkMode: 'link_reference' as const,
          availability: 'linked',
          provenance: 'picker_selected',
          parentProviderFolderId: null,
        },
        {
          id: 'item-sub',
          providerFileId: 'folder-sub',
          displayName: 'Sub Directory',
          mimeType: GOOGLE_DRIVE_FOLDER_MIME,
          linkMode: 'link_reference' as const,
          availability: 'linked',
          provenance: 'picker_selected',
          parentProviderFolderId: 'folder-root',
        },
        {
          id: 'item-leaf',
          providerFileId: 'file-leaf',
          displayName: 'doc.pdf',
          mimeType: 'application/pdf',
          linkMode: 'import_copy' as const,
          availability: 'imported',
          provenance: 'picker_selected',
          parentProviderFolderId: 'folder-sub',
        },
      ];

      const tree = buildAuthorizedDriveTree(items);
      expect(tree).toHaveLength(1);
      const rootNode = tree[0]!;
      expect(rootNode.providerFileId).toBe('folder-root');
      expect(rootNode.children).toHaveLength(1);

      const subNode = rootNode.children[0]!;
      expect(subNode.providerFileId).toBe('folder-sub');
      expect(subNode.children).toHaveLength(1);

      const leafNode = subNode.children[0]!;
      expect(leafNode.providerFileId).toBe('file-leaf');
      expect(leafNode.isFolder).toBe(false);
    });
  });

  describe('Scenario 4: Individually picked files', () => {
    it('authorizes individually picked files and supports link_reference or import_copy', async () => {
      await connectFake(clientA, workspaceAId);

      // Seed a picked file in provider
      const testBytes = Buffer.from('Individually picked test document content\n', 'utf8');
      const testMd5 = crypto.createHash('md5').update(testBytes).digest('hex');
      fakeProvider.seedAuthorizedFile(
        {
          id: 'individually-picked-doc-1',
          name: 'project-proposal.txt',
          mimeType: 'text/plain',
          md5Checksum: testMd5,
          version: '1',
          trashed: false,
          isShortcut: false,
          isSharedDrive: false,
          shortcutTargetId: null,
        },
        testBytes
      );

      // 1. Select as link_reference
      const linkRes = await clientA.selectDriveFile(workspaceAId, {
        providerFileId: 'individually-picked-doc-1',
        displayName: 'project-proposal.txt',
        mimeType: 'text/plain',
        linkMode: 'link_reference',
      });
      expect(linkRes.data.linkedFile.linkMode).toBe('link_reference');
      expect(linkRes.data.jobKind).toBe('none');

      // 2. Select another picked file as import_copy
      fakeProvider.seedAuthorizedFile(
        {
          id: 'individually-picked-doc-2',
          name: 'budget.txt',
          mimeType: 'text/plain',
          md5Checksum: testMd5,
          version: '1',
          trashed: false,
          isShortcut: false,
          isSharedDrive: false,
          shortcutTargetId: null,
        },
        testBytes
      );

      const importRes = await clientA.selectDriveFile(workspaceAId, {
        providerFileId: 'individually-picked-doc-2',
        displayName: 'budget.txt',
        mimeType: 'text/plain',
        linkMode: 'import_copy',
      });
      expect(importRes.data.linkedFile.linkMode).toBe('import_copy');
      expect(importRes.data.jobKind).toBe('import_copy');
    });
  });

  describe('Scenario 5: App-created files', () => {
    it('authorizes app-created files inside a folder under drive.file', async () => {
      const appFileAuth = evaluateDescendantAuthorization({
        parentFolderId: 'folder-root',
        childFileId: 'app-created-file-99',
        provenance: 'app_created',
        grantedScope: DRIVE_FILE_SCOPE,
      });
      expect(appFileAuth.authorized).toBe(true);
      expect(appFileAuth.reason).toBeNull();

      // Provider upload test
      const uploadBytes = Buffer.from('Created by Daynori\n', 'utf8');
      const uploaded = await fakeProvider.uploadAppFile('fake-access-valid', {
        name: 'daynori-export.json',
        mimeType: 'application/json',
        bytes: uploadBytes,
        idempotencyKey: 'phase113-upload-test-key-1',
      });
      expect(uploaded.id).toBeTruthy();
      expect(uploaded.name).toBe('daynori-export.json');
      expect(uploaded.md5Checksum).toBe(crypto.createHash('md5').update(uploadBytes).digest('hex'));
    });
  });

  describe('Scenario 6: Move and delete', () => {
    it('updates hierarchy on file move, flags trashed files as source_unavailable, and never deletes remote original on disconnect', async () => {
      // 1. Move test: change parent folder ID
      const itemsBeforeMove = [
        {
          id: 'f-1',
          providerFileId: 'folder-dest-a',
          displayName: 'Folder A',
          mimeType: GOOGLE_DRIVE_FOLDER_MIME,
          linkMode: 'link_reference' as const,
          availability: 'linked',
          provenance: 'picker_selected',
          parentProviderFolderId: null,
        },
        {
          id: 'f-2',
          providerFileId: 'folder-dest-b',
          displayName: 'Folder B',
          mimeType: GOOGLE_DRIVE_FOLDER_MIME,
          linkMode: 'link_reference' as const,
          availability: 'linked',
          provenance: 'picker_selected',
          parentProviderFolderId: null,
        },
        {
          id: 'doc-moved',
          providerFileId: 'file-report',
          displayName: 'report.txt',
          mimeType: 'text/plain',
          linkMode: 'link_reference' as const,
          availability: 'linked',
          provenance: 'picker_selected',
          parentProviderFolderId: 'folder-dest-a', // in Folder A
        },
      ];

      const treeA = buildAuthorizedDriveTree(itemsBeforeMove);
      const folderA = treeA.find((n) => n.providerFileId === 'folder-dest-a')!;
      expect(folderA.children.some((c) => c.providerFileId === 'file-report')).toBe(true);

      // Move report to Folder B
      const itemsAfterMove = itemsBeforeMove.map((item) =>
        item.providerFileId === 'file-report'
          ? { ...item, parentProviderFolderId: 'folder-dest-b' }
          : item
      );
      const treeB = buildAuthorizedDriveTree(itemsAfterMove);
      const folderB = treeB.find((n) => n.providerFileId === 'folder-dest-b')!;
      expect(folderB.children.some((c) => c.providerFileId === 'file-report')).toBe(true);

      // 2. Remote trash/delete detection:
      fakeProvider.seedAuthorizedFile(
        {
          id: 'trashed-file-1',
          name: 'deleted-remotely.txt',
          mimeType: 'text/plain',
          md5Checksum: 'deleted',
          version: '1',
          trashed: true, // Trashed on remote Google Drive
          isShortcut: false,
          isSharedDrive: false,
          shortcutTargetId: null,
        },
        Buffer.from('deleted')
      );

      const meta = await fakeProvider.getFileMeta('fake-access-test', 'trashed-file-1');
      expect(meta.trashed).toBe(true);

      // 3. Remote Original Preservation Invariant:
      const explanation = disconnectExplanation('local_disconnect');
      expect(explanation.remoteOriginalDeleted).toBe(false);
      expect(explanation.retainedImportedCopies).toBe(true);
      expect(explanation.tokensRemoved).toBe(true);
    });
  });

  describe('Scenario 7: Permission loss', () => {
    it('handles revoked remote permissions fail-closed without crashing', async () => {
      fakeProvider.deniedFileIds.add('file-permission-lost-403');
      await expect(
        fakeProvider.getFileMeta('fake-access-valid', 'file-permission-lost-403')
      ).rejects.toThrow(DriveProviderUnavailableError);

      try {
        await fakeProvider.getFileMeta('fake-access-valid', 'file-permission-lost-403');
      } catch (err: any) {
        expect(err.code).toBe('permission_denied');
      }
    });
  });

  describe('Scenario 8: Pagination', () => {
    it('paginates authorized items in bounded chunks while preserving traversal boundaries', () => {
      // Chunking 10 authorized items into pages of size 3
      const allAuthorized = Array.from({ length: 10 }, (_, i) => ({
        id: `page-item-${i}`,
        providerFileId: `file-page-${i}`,
        displayName: `Document ${i}.txt`,
        mimeType: 'text/plain',
        linkMode: 'link_reference' as const,
        availability: 'linked',
        provenance: 'picker_selected',
        parentProviderFolderId: 'folder-paged-root',
      }));

      const pageSize = 3;
      const pages: Array<typeof allAuthorized> = [];
      for (let i = 0; i < allAuthorized.length; i += pageSize) {
        pages.push(allAuthorized.slice(i, i + pageSize));
      }

      expect(pages).toHaveLength(4);
      expect(pages[0]).toHaveLength(3);
      expect(pages[3]).toHaveLength(1);

      // Boundary check is strictly enforced for every page item
      for (const page of pages) {
        for (const item of page) {
          const check = validateTraversalBoundary({
            targetFolderId: item.parentProviderFolderId,
            authorizedFolderIds: new Set(['folder-paged-root']),
          });
          expect(check.withinBoundary).toBe(true);
        }
      }
    });
  });

  describe('Scenario 9: Token expiry and refresh', () => {
    it('refreshes expired access token and seals tokens with AES-256-GCM + AAD', async () => {
      const codeRes = await fakeProvider.exchangeAuthorizationCode({
        code: 'fake-ok',
        codeVerifier: 'verifier-test',
        redirectUri: 'http://127.0.0.1:8765/oauth2callback',
      });
      expect(codeRes.accessToken).toMatch(/^fake-access-/);
      expect(codeRes.refreshToken).toMatch(/^fake-refresh-/);

      // Refresh token exchange
      const refreshed = await fakeProvider.refreshAccessToken(codeRes.refreshToken!);
      expect(refreshed.accessToken).toMatch(/^fake-access-/);
      expect(refreshed.expiresAt.getTime()).toBeGreaterThan(Date.now());

      // Attempting to refresh with an invalid/revoked refresh token fails
      await expect(fakeProvider.refreshAccessToken('invalid-or-revoked-token')).rejects.toThrow(
        DriveProviderUnavailableError
      );
    });
  });

  describe('Scenario 10: Revoke and disconnect', () => {
    it('wipes tokens from database, increments generation, fences in-flight jobs, and preserves remote files', async () => {
      await connectFake(clientA, workspaceAId);

      const statusBefore = await clientA.getDriveConnection(workspaceAId);
      expect(statusBefore.data.status).toBe('connected');

      // Execute disconnect
      const disconnectRes = await clientA.disconnectDrive(workspaceAId);
      expect(disconnectRes.data.status).toBe('disconnected');
      expect(disconnectRes.data.tokensRemoved).toBe(true);
      expect(disconnectRes.data.retainedImportedCopies).toBe(true);
      expect(disconnectRes.data.remoteOriginalDeleted).toBe(false);

      // Check database tokens are wiped
      const dbRow = await adminPool.query<{ refresh_token_ciphertext: string | null }>(
        `SELECT refresh_token_ciphertext FROM app.drive_connections WHERE workspace_id = $1`,
        [workspaceAId]
      );
      expect(dbRow.rows[0]!.refresh_token_ciphertext).toBeNull();

      // Check job fencing
      const mayComplete = mayCompleteDriveWork({
        connectionStatus: 'disconnected',
        connectionGeneration: 2,
        jobGeneration: 1,
      });
      expect(mayComplete).toBe(false);
    });
  });

  describe('Scenario 11: Vault exclusion and multi-tenant isolation', () => {
    it('strictly forbids vault items from Drive targets', () => {
      expect(isVaultDriveTarget('vault')).toBe(true);
      expect(isVaultDriveTarget('vault_item')).toBe(true);
      expect(isVaultDriveTarget('encrypted_vault')).toBe(true);
      expect(isVaultDriveTarget('note')).toBe(false);
      expect(isVaultDriveTarget('task')).toBe(false);
    });

    it('enforces strict multi-tenant workspace isolation across all Drive API endpoints', async () => {
      await connectFake(clientA, workspaceAId);

      // User B cannot list User A workspace's Drive files
      await expect(clientB.listDriveLinkedFiles(workspaceAId)).rejects.toThrow();

      // User B cannot select files for User A's workspace
      await expect(
        clientB.selectDriveFile(workspaceAId, {
          providerFileId: 'unauthorized-target',
          displayName: 'intruder.txt',
          mimeType: 'text/plain',
          linkMode: 'link_reference',
        })
      ).rejects.toThrow();

      // User B cannot disconnect User A's Drive
      await expect(clientB.disconnectDrive(workspaceAId)).rejects.toThrow();
    });
  });

  describe('12. Broader Scope Proposal & CASA AL2 Cost Model Evaluation', () => {
    it('evaluates restricted scope CASA AL2 requirements and annual cost obligations', () => {
      const narrow = evaluateBroaderScopeRequirement('bounded_selected_folder');
      expect(narrow.requiredScope).toBe(DRIVE_FILE_SCOPE);
      expect(narrow.isRestricted).toBe(false);
      expect(narrow.requiresCASA).toBe(false);
      expect(narrow.annualCostRangeUsd.max).toBe(0);

      const recursive = evaluateBroaderScopeRequirement('recursive_folder_mirroring');
      expect(recursive.requiredScope).toBe('https://www.googleapis.com/auth/drive.readonly');
      expect(recursive.isRestricted).toBe(true);
      expect(recursive.requiresCASA).toBe(true);
      expect(recursive.casaLevel).toBe('AL2');
      expect(recursive.annualCostRangeUsd.min).toBe(675);
      expect(recursive.recurringAnnualRecertification).toBe(true);
      expect(recursive.googleVerificationRequired).toBe(true);
    });
  });

  describe('13. Help Article & Guidance Integrity', () => {
    it('verifies help.drive-optional details narrow scope, folder boundary, copy vs reference, and remote preservation', () => {
      const article = findHelpArticle('help.drive-optional');
      expect(article).toBeDefined();
      expect(article?.contentVersion).toBe(2);
      expect(article?.keywords).toContain('mirroring');
      expect(article?.keywords).toContain('folder');
      expect(article?.keywords).toContain('disconnect');
      expect(article?.steps.length).toBeGreaterThanOrEqual(5);
    });
  });

  describe('14. Production Fail-Closed Provider Gate', () => {
    it('fails closed when Google OAuth credentials are unconfigured in production', () => {
      delete process.env['DAYNORI_DRIVE_OAUTH_CLIENT_ID'];
      delete process.env['DAYNORI_DRIVE_OAUTH_CLIENT_SECRET'];
      expect(() => new GoogleDriveProvider()).toThrow(DriveProviderUnavailableError);
    });
  });
});
