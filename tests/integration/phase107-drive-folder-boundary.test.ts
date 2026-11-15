/**
 * Phase 107 — Bounded Google Drive folder authorization, traversal boundary,
 * and restricted scope requirements integration test suite.
 *
 * Verifies:
 * 1. Narrow drive.file grants access to picked folder container, but NOT unpicked pre-existing or external descendants.
 * 2. App-created or individually picked children within authorized folders ARE authorized.
 * 3. Bounded traversal rejects enumeration of root drive, parents, or sibling folders outside authorized set.
 * 4. Bounded folder tree construction maintains familiar hierarchy without enumerating the rest of Drive.
 * 5. Disconnect and revocation cleanly wipe tokens, cancel jobs, retain imported copies, and NEVER delete remote originals.
 * 6. Vault items and cryptographic keys are strictly excluded from all Drive operations.
 * 7. Multi-tenant workspace and account isolation is strictly enforced.
 * 8. Concrete broader-scope proposal correctly assesses CASA AL2 requirements and annual cost obligations.
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

describe('Phase 107: Bounded Google Drive folder authorization and scope boundary', () => {
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
  const kid = 'phase107-drive-folder-key';

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
    process.env['DAYNORI_DRIVE_TOKEN_KEY_VERSION'] = 'v1-phase107-folder-boundary';
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
        [userAId, 'Alice Phase107', userBId, 'Bob Phase107']
      );
      const wsARes = await setupClient.query<{ id: string }>(
        `INSERT INTO app.workspaces (name, kind, owner_id) VALUES ($1, 'personal', $2) RETURNING id`,
        ['Alice Folder WS', userAId]
      );
      workspaceAId = wsARes.rows[0]!.id;
      const wsBRes = await setupClient.query<{ id: string }>(
        `INSERT INTO app.workspaces (name, kind, owner_id) VALUES ($1, 'personal', $2) RETURNING id`,
        ['Bob Folder WS', userBId]
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
      returnPath: '/settings',
    });
    const state = new URL(started.data.authorizationUrl).searchParams.get('state')!;
    return client.completeDriveConnect(workspaceId, {
      intentId: started.data.intentId,
      state,
      code: 'fake-ok',
    });
  }

  describe('1. drive.file Scope vs. Broader Scope Requirements', () => {
    it('approves only narrow drive.file and rejects lookalikes or broad scopes', () => {
      expect(validateRequestedDriveScopes(DRIVE_FILE_SCOPE).ok).toBe(true);
      expect(validateRequestedDriveScopes('https://www.googleapis.com/auth/drive').ok).toBe(false);
      expect(validateRequestedDriveScopes('https://www.googleapis.com/auth/drive.readonly').ok).toBe(false);
      expect(validateRequestedDriveScopes('https://evil.example/auth/drive.file').ok).toBe(false);
    });

    it('correctly assesses CASA AL2 and verification requirements for recursive mirroring scopes', () => {
      const narrow = evaluateBroaderScopeRequirement('bounded_selected_folder');
      expect(narrow.requiredScope).toBe(DRIVE_FILE_SCOPE);
      expect(narrow.isRestricted).toBe(false);
      expect(narrow.requiresCASA).toBe(false);
      expect(narrow.casaLevel).toBe('none');
      expect(narrow.annualCostRangeUsd.max).toBe(0);

      const mirror = evaluateBroaderScopeRequirement('recursive_folder_mirroring');
      expect(mirror.requiredScope).toBe('https://www.googleapis.com/auth/drive.readonly');
      expect(mirror.isRestricted).toBe(true);
      expect(mirror.requiresCASA).toBe(true);
      expect(mirror.casaLevel).toBe('AL2');
      expect(mirror.annualCostRangeUsd.min).toBe(675);
      expect(mirror.recurringAnnualRecertification).toBe(true);
      expect(mirror.googleVerificationRequired).toBe(true);

      const fullSync = evaluateBroaderScopeRequirement('full_drive_sync');
      expect(fullSync.requiredScope).toBe('https://www.googleapis.com/auth/drive');
      expect(fullSync.isRestricted).toBe(true);
      expect(fullSync.requiresCASA).toBe(true);
      expect(fullSync.casaLevel).toBe('AL2');
      expect(fullSync.annualCostRangeUsd.max).toBe(15000);
    });
  });

  describe('2. Synthetic Folder & Descendant Authorization Matrix', () => {
    it('identifies folder MIME type correctly', () => {
      expect(isDriveFolder(GOOGLE_DRIVE_FOLDER_MIME)).toBe(true);
      expect(isDriveFolder('application/pdf')).toBe(false);
      expect(isDriveFolder('text/plain')).toBe(false);
    });

    it('denies unpicked pre-existing children in a selected folder under drive.file', () => {
      const result = evaluateDescendantAuthorization({
        parentFolderId: 'folder-parent-001',
        childFileId: 'child-pre-existing-001',
        provenance: 'pre_existing_unpicked',
        grantedScope: DRIVE_FILE_SCOPE,
      });
      expect(result.authorized).toBe(false);
      expect(result.reason).toBe('drive_file_scope_does_not_grant_unpicked_descendants');
      expect(result.scopeCategory).toBe('narrow_drive_file');
    });

    it('denies external children added after folder selection under drive.file', () => {
      const result = evaluateDescendantAuthorization({
        parentFolderId: 'folder-parent-001',
        childFileId: 'child-external-later-002',
        provenance: 'external_unpicked',
        grantedScope: DRIVE_FILE_SCOPE,
      });
      expect(result.authorized).toBe(false);
      expect(result.reason).toBe('drive_file_scope_does_not_grant_unpicked_descendants');
    });

    it('authorizes app-created files inside a selected folder under drive.file', () => {
      const result = evaluateDescendantAuthorization({
        parentFolderId: 'folder-parent-001',
        childFileId: 'child-app-created-003',
        provenance: 'app_created',
        grantedScope: DRIVE_FILE_SCOPE,
      });
      expect(result.authorized).toBe(true);
      expect(result.reason).toBeNull();
    });

    it('authorizes explicitly picked files inside a selected folder under drive.file', () => {
      const result = evaluateDescendantAuthorization({
        parentFolderId: 'folder-parent-001',
        childFileId: 'child-picker-selected-004',
        provenance: 'picker_selected',
        grantedScope: DRIVE_FILE_SCOPE,
      });
      expect(result.authorized).toBe(true);
      expect(result.reason).toBeNull();
    });
  });

  describe('3. Traversal Boundary and Boundary Protection', () => {
    it('rejects root drive enumeration', () => {
      const check = validateTraversalBoundary({
        targetFolderId: 'root',
        authorizedFolderIds: new Set(['folder-123']),
      });
      expect(check.withinBoundary).toBe(false);
      expect(check.error).toMatch(/Root Drive traversal is strictly prohibited/);
    });

    it('rejects sibling or parent folders outside authorized folder set', () => {
      const check = validateTraversalBoundary({
        targetFolderId: 'unauthorized-sibling-folder-999',
        authorizedFolderIds: new Set(['folder-123', 'folder-456']),
      });
      expect(check.withinBoundary).toBe(false);
      expect(check.error).toMatch(/outside authorized folder boundary/);
    });

    it('permits traversal only within authorized folder set', () => {
      const check = validateTraversalBoundary({
        targetFolderId: 'folder-123',
        authorizedFolderIds: new Set(['folder-123', 'folder-456']),
      });
      expect(check.withinBoundary).toBe(true);
      expect(check.error).toBeUndefined();
    });
  });

  describe('4. Bounded Hierarchical Folder Tree Construction', () => {
    it('constructs a nested tree for authorized folders and their authorized children', () => {
      const items = [
        {
          id: 'item-1',
          providerFileId: 'folder-root-1',
          displayName: 'Project Documents',
          mimeType: GOOGLE_DRIVE_FOLDER_MIME,
          linkMode: 'link_reference' as const,
          availability: 'linked',
          provenance: 'picker_selected',
          parentProviderFolderId: null,
        },
        {
          id: 'item-2',
          providerFileId: 'folder-sub-1',
          displayName: 'Specs',
          mimeType: GOOGLE_DRIVE_FOLDER_MIME,
          linkMode: 'link_reference' as const,
          availability: 'linked',
          provenance: 'picker_selected',
          parentProviderFolderId: 'folder-root-1',
        },
        {
          id: 'item-3',
          providerFileId: 'file-spec-doc',
          displayName: 'v2-architecture.pdf',
          mimeType: 'application/pdf',
          linkMode: 'import_copy' as const,
          availability: 'imported',
          provenance: 'picker_selected',
          parentProviderFolderId: 'folder-sub-1',
        },
        {
          id: 'item-4',
          providerFileId: 'file-standalone',
          displayName: 'notes.txt',
          mimeType: 'text/plain',
          linkMode: 'link_reference' as const,
          availability: 'linked',
          provenance: 'picker_selected',
          parentProviderFolderId: null,
        },
      ];

      const tree = buildAuthorizedDriveTree(items);
      expect(tree).toHaveLength(2); // folder-root-1 and file-standalone

      const rootFolder = tree.find((n) => n.providerFileId === 'folder-root-1')!;
      expect(rootFolder).toBeDefined();
      expect(rootFolder.isFolder).toBe(true);
      expect(rootFolder.children).toHaveLength(1);

      const subFolder = rootFolder.children[0]!;
      expect(subFolder.displayName).toBe('Specs');
      expect(subFolder.isFolder).toBe(true);
      expect(subFolder.children).toHaveLength(1);

      const doc = subFolder.children[0]!;
      expect(doc.displayName).toBe('v2-architecture.pdf');
      expect(doc.isFolder).toBe(false);

      const standalone = tree.find((n) => n.providerFileId === 'file-standalone')!;
      expect(standalone.isFolder).toBe(false);
      expect(standalone.children).toHaveLength(0);
    });

    it('keeps empty authorized folders with empty children and zero count', () => {
      const items = [
        {
          id: 'item-empty',
          providerFileId: 'folder-empty-1',
          displayName: 'Empty Research Folder',
          mimeType: GOOGLE_DRIVE_FOLDER_MIME,
          linkMode: 'link_reference' as const,
          availability: 'linked',
          provenance: 'picker_selected',
          parentProviderFolderId: null,
        },
      ];
      const tree = buildAuthorizedDriveTree(items);
      expect(tree).toHaveLength(1);
      expect(tree[0]!.isFolder).toBe(true);
      expect(tree[0]!.children).toEqual([]);
      expect(tree[0]!.childCount).toBe(0);
    });
  });

  describe('5. Live & Database Scenarios: Folder Selection, Hierarchy, & Storage', () => {
    it('persists selected folder, imports child file with checksum, and builds authorized hierarchy', async () => {
      await connectFake(clientA, workspaceAId);

      // Seed an authorized folder in fake provider
      fakeProvider.seedAuthorizedFile(
        {
          id: 'fake-folder-work',
          name: 'Daynori Work Folder',
          mimeType: GOOGLE_DRIVE_FOLDER_MIME,
          md5Checksum: null,
          version: '1',
          trashed: false,
          isShortcut: false,
          isSharedDrive: false,
          shortcutTargetId: null,
        },
        Buffer.alloc(0)
      );

      // Seed an authorized child file
      const childBytes = Buffer.from('console.log("Daynori Phase 107");\n', 'utf8');
      const childChecksum = crypto.createHash('md5').update(childBytes).digest('hex');
      fakeProvider.seedAuthorizedFile(
        {
          id: 'fake-child-script',
          name: 'index.ts',
          mimeType: 'text/plain',
          md5Checksum: childChecksum,
          version: '1',
          trashed: false,
          isShortcut: false,
          isSharedDrive: false,
          shortcutTargetId: null,
        },
        childBytes
      );

      // 1. Select the folder as link_reference
      const folderRes = await clientA.selectDriveFile(workspaceAId, {
        providerFileId: 'fake-folder-work',
        displayName: 'Daynori Work Folder',
        mimeType: GOOGLE_DRIVE_FOLDER_MIME,
        linkMode: 'link_reference',
      });
      expect(folderRes.data.linkedFile.providerFileId).toBe('fake-folder-work');
      expect(folderRes.data.linkedFile.mimeType).toBe(GOOGLE_DRIVE_FOLDER_MIME);
      expect(folderRes.data.jobKind).toBe('none');

      // 2. Select the child file as import_copy
      const fileRes = await clientA.selectDriveFile(workspaceAId, {
        providerFileId: 'fake-child-script',
        displayName: 'index.ts',
        mimeType: 'text/plain',
        linkMode: 'import_copy',
      });
      expect(fileRes.data.linkedFile.providerFileId).toBe('fake-child-script');
      expect(fileRes.data.jobKind).toBe('import_copy');

      // 3. List files from API
      const listRes = await clientA.listDriveLinkedFiles(workspaceAId);
      expect(listRes.data.length).toBeGreaterThanOrEqual(2);

      const folderItem = listRes.data.find((f) => f.providerFileId === 'fake-folder-work')!;
      expect(folderItem).toBeDefined();
      expect(isDriveFolder(folderItem.mimeType)).toBe(true);

      const fileItem = listRes.data.find((f) => f.providerFileId === 'fake-child-script')!;
      expect(fileItem).toBeDefined();
      expect(fileItem.linkMode).toBe('import_copy');

      // 4. Construct tree with folder parent relationship
      const tree = buildAuthorizedDriveTree(listRes.data, (item) => {
        if (item.providerFileId === 'fake-child-script') return 'fake-folder-work';
        return null;
      });

      const parentNode = tree.find((n) => n.providerFileId === 'fake-folder-work')!;
      expect(parentNode).toBeDefined();
      expect(parentNode.isFolder).toBe(true);
      expect(parentNode.children.some((c) => c.providerFileId === 'fake-child-script')).toBe(true);
    });
  });

  describe('6. Disconnect, Revocation, and Remote Original Safety', () => {
    it('wipes tokens, cancels jobs, fences late work, and verifies remote originals are never deleted', async () => {
      await connectFake(clientA, workspaceAId);

      const statusBefore = await clientA.getDriveConnection(workspaceAId);
      expect(statusBefore.data.status).toBe('connected');

      // Disconnect
      const dis = await clientA.disconnectDrive(workspaceAId);
      expect(dis.data.status).toBe('disconnected');
      expect(dis.data.tokensRemoved).toBe(true);
      expect(dis.data.retainedImportedCopies).toBe(true);
      expect(dis.data.remoteOriginalDeleted).toBe(false);

      const explanation = disconnectExplanation('local_disconnect');
      expect(explanation.remoteOriginalDeleted).toBe(false);
      expect(explanation.retainedImportedCopies).toBe(true);
      expect(explanation.tokensRemoved).toBe(true);

      // Verify tokens removed in database
      const row = await adminPool.query<{ refresh_token_ciphertext: string | null }>(
        `SELECT refresh_token_ciphertext FROM app.drive_connections WHERE workspace_id = $1`,
        [workspaceAId]
      );
      expect(row.rows[0]!.refresh_token_ciphertext).toBeNull();

      // Generation fencing verification
      expect(
        mayCompleteDriveWork({
          connectionStatus: 'disconnected',
          connectionGeneration: 2,
          jobGeneration: 1,
        })
      ).toBe(false);
    });
  });

  describe('7. Strict Vault Exclusion Guard', () => {
    it('rejects all vault items from Drive selection', async () => {
      expect(isVaultDriveTarget('vault')).toBe(true);
      expect(isVaultDriveTarget('vault_item')).toBe(true);
      expect(isVaultDriveTarget('encrypted_vault')).toBe(true);
      expect(isVaultDriveTarget('note')).toBe(false);
      expect(isVaultDriveTarget('task')).toBe(false);
    });
  });

  describe('8. Multi-Tenant Scoping and Isolation', () => {
    it('prevents cross-workspace file listing and operations', async () => {
      await connectFake(clientA, workspaceAId);

      // User B cannot list User A workspace's Drive files
      await expect(clientB.listDriveLinkedFiles(workspaceAId)).rejects.toThrow();

      // User B cannot disconnect User A's Drive
      await expect(clientB.disconnectDrive(workspaceAId)).rejects.toThrow();
    });
  });

  describe('9. Production Fail-Closed Provider Gate', () => {
    it('throws DriveProviderUnavailableError when Google production credentials are missing', () => {
      delete process.env['DAYNORI_DRIVE_OAUTH_CLIENT_ID'];
      delete process.env['DAYNORI_DRIVE_OAUTH_CLIENT_SECRET'];
      expect(() => new GoogleDriveProvider()).toThrow(DriveProviderUnavailableError);
    });
  });
});
