import crypto from 'node:crypto';
import { generateKeyPair, SignJWT, exportJWK, type JSONWebKeySet } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { buildServer, JwtVerifier } from '../../apps/api/src/index.js';
import { createAdminPool, createRuntimePool } from '../../apps/api/src/db/index.js';
import { Migrator } from '../../infra/supabase/migrator.js';
import { createApiClient, DaynoriApiClient } from '@daynori/api-client';
import { ALLOWED_MIME_TYPES, DOWNLOAD_CAPABILITY_EXPIRY_SECONDS } from '@daynori/contracts';
import {
  computeStorageUsage,
  getFilePreviewKind,
  getOfflineBinaryCacheKey,
  isSafeToPreview,
} from '@daynori/domain';
import {
  MemoryStorageProvider,
  setDefaultStorageProvider,
} from '../../apps/api/src/modules/files/storageAdapter.js';
import {
  PolicyMalwareScanner,
  setDefaultMalwareScanner,
} from '../../apps/api/src/modules/files/scanner.js';
import { OfflineFileCache } from '../../apps/web/src/data/offlineFileCache.js';

describe('Phase 25: Organized Uploads, Safe Document Previews, and Offline Availability (Integration Tests)', () => {
  let adminPool: Pool;
  let runtimePool: Pool;
  let migrator: Migrator;
  let server: ReturnType<typeof buildServer>;
  let baseUrl: string;

  let keyPair: Awaited<ReturnType<typeof generateKeyPair>>;
  let jwks: JSONWebKeySet;

  const issuer = 'https://auth.daynori.test';
  const audience = 'daynori-api';
  const kid = 'phase25-files-key';

  const userAId = crypto.randomUUID();
  const userBId = crypto.randomUUID();
  let tokenUserA: string;
  let tokenUserB: string;
  let clientA: DaynoriApiClient;
  let clientB: DaynoriApiClient;

  let workspaceAId: string;
  let workspaceBId: string;

  let memoryStorage: MemoryStorageProvider;
  let policyScanner: PolicyMalwareScanner;

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

    // 2. Setup Memory Storage Provider and Policy Scanner
    memoryStorage = new MemoryStorageProvider();
    setDefaultStorageProvider(memoryStorage);

    policyScanner = new PolicyMalwareScanner();
    setDefaultMalwareScanner(policyScanner);

    // 3. Setup JWT Key Pair & Tokens
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

    const safeLogger = new (await import('../../apps/api/src/plugins/logger.js')).SafeLogger(
      (entry) => {
        if (
          entry.level === 'error' &&
          !entry.message?.includes('violates row-level security policy')
        ) {
          console.error('SERVER ERROR:', JSON.stringify(entry));
        }
      }
    );

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
    memoryStorage.setBaseUrl(baseUrl);

    tokenUserA = await createToken(userAId);
    tokenUserB = await createToken(userBId);

    clientA = createApiClient({ baseUrl, token: tokenUserA });
    clientB = createApiClient({ baseUrl, token: tokenUserB });

    // 4. Provision profiles and personal workspaces
    const setupClient = await adminPool.connect();
    try {
      await setupClient.query(
        `INSERT INTO app.profiles (id, display_name) VALUES ($1, $2), ($3, $4) ON CONFLICT (id) DO NOTHING`,
        [userAId, 'Alice Phase25', userBId, 'Bob Phase25']
      );

      const wsARes = await setupClient.query<{ id: string }>(
        `INSERT INTO app.workspaces (name, kind, owner_id) VALUES ($1, 'personal', $2) RETURNING id`,
        ['Alice Phase25 Workspace', userAId]
      );
      workspaceAId = wsARes.rows[0]!.id;

      const wsBRes = await setupClient.query<{ id: string }>(
        `INSERT INTO app.workspaces (name, kind, owner_id) VALUES ($1, 'personal', $2) RETURNING id`,
        ['Bob Phase25 Workspace', userBId]
      );
      workspaceBId = wsBRes.rows[0]!.id;

      await setupClient.query(
        `INSERT INTO app.workspace_memberships (workspace_id, user_id, role) VALUES ($1, $2, 'owner'), ($3, $4, 'owner')`,
        [workspaceAId, userAId, workspaceBId, userBId]
      );
    } finally {
      setupClient.release();
    }
  });

  afterAll(async () => {
    if (server) await server.close();
    if (runtimePool) await runtimePool.end();
    if (adminPool) await adminPool.end();
  });

  it('Journey 1: Organized Folder Uploads (Software > Guides and Government jobs > Applications)', async () => {
    // 1. Create hierarchy: "Software" -> "Guides"
    const softwareFolderRes = await clientA.createFolder(workspaceAId, {
      name: 'Software',
      parentId: null,
      icon: '💻',
    });
    const softwareFolderId = softwareFolderRes.data.id;
    expect(softwareFolderId).toBeDefined();

    const guidesFolderRes = await clientA.createFolder(workspaceAId, {
      name: 'Guides',
      parentId: softwareFolderId,
      icon: '📚',
    });
    const guidesFolderId = guidesFolderRes.data.id;
    expect(guidesFolderId).toBeDefined();

    // 2. Create hierarchy: "Government jobs" -> "Applications"
    const govFolderRes = await clientA.createFolder(workspaceAId, {
      name: 'Government jobs',
      parentId: null,
      icon: '🏛️',
    });
    const govFolderId = govFolderRes.data.id;
    expect(govFolderId).toBeDefined();

    const appsFolderRes = await clientA.createFolder(workspaceAId, {
      name: 'Applications',
      parentId: govFolderId,
      icon: '📋',
    });
    const appsFolderId = appsFolderRes.data.id;
    expect(appsFolderId).toBeDefined();

    // 3. Upload a PDF guide into "Software > Guides"
    const validPdfBytes = Buffer.from('%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF');
    const pdfReservation = await clientA.reserveFileUpload(workspaceAId, {
      fileName: 'typescript-guide.pdf',
      declaredMimeType: 'application/pdf',
      declaredBytes: validPdfBytes.length,
      folderId: guidesFolderId,
    });
    expect(pdfReservation.data.reservationId).toBeDefined();

    // Direct HTTP PUT to signed upload URL
    const pdfUploadRes = await fetch(pdfReservation.data.uploadUrl, {
      method: pdfReservation.data.method,
      headers: { 'content-type': 'application/pdf' },
      body: validPdfBytes,
    });
    expect(pdfUploadRes.status).toBe(200);

    // Finalize PDF upload
    const pdfChecksum = crypto.createHash('sha256').update(validPdfBytes).digest('hex');
    const pdfFinalize = await clientA.finalizeFileUpload(
      workspaceAId,
      pdfReservation.data.reservationId,
      { clientChecksum: pdfChecksum }
    );
    expect(pdfFinalize.data.status).toBe('verified');
    expect(pdfFinalize.data.detectedMimeType).toBe('application/pdf');
    expect(pdfFinalize.data.sha256Checksum).toBe(pdfChecksum);

    // Verify metadata reflects the folder link
    const pdfMeta = await clientA.getFileMetadata(workspaceAId, pdfFinalize.data.fileId);
    expect(pdfMeta.data.folderId).toBe(guidesFolderId);
    expect(pdfMeta.data.fileName).toBe('typescript-guide.pdf');

    // 4. Upload a DOCX application into "Government jobs > Applications"
    // PK\x03\x04 signature + word/ subfolder path representing DOCX archive
    const validDocxBytes = Buffer.concat([
      Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00, 0x08, 0x00, 0x00, 0x00]),
      Buffer.from('word/document.xml content here for testing valid docx zip structure'),
    ]);
    const docxReservation = await clientA.reserveFileUpload(workspaceAId, {
      fileName: 'civil-service-application.docx',
      declaredMimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      declaredBytes: validDocxBytes.length,
      folderId: appsFolderId,
    });
    expect(docxReservation.data.reservationId).toBeDefined();

    const docxUploadRes = await fetch(docxReservation.data.uploadUrl, {
      method: docxReservation.data.method,
      headers: {
        'content-type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      },
      body: validDocxBytes,
    });
    expect(docxUploadRes.status).toBe(200);

    const docxChecksum = crypto.createHash('sha256').update(validDocxBytes).digest('hex');
    const docxFinalize = await clientA.finalizeFileUpload(
      workspaceAId,
      docxReservation.data.reservationId,
      { clientChecksum: docxChecksum }
    );
    expect(docxFinalize.data.status).toBe('verified');
    expect(docxFinalize.data.detectedMimeType).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );

    const docxMeta = await clientA.getFileMetadata(workspaceAId, docxFinalize.data.fileId);
    expect(docxMeta.data.folderId).toBe(appsFolderId);
    expect(docxMeta.data.fileName).toBe('civil-service-application.docx');

    // 5. Download capability retrieval & exact byte verification for both files
    const pdfDownloadRes = await clientA.getFileDownloadCapability(
      workspaceAId,
      pdfFinalize.data.fileId
    );
    expect(pdfDownloadRes.data.expiresInSeconds).toBe(DOWNLOAD_CAPABILITY_EXPIRY_SECONDS);
    const pdfDownloaded = await fetch(pdfDownloadRes.data.downloadUrl);
    expect(pdfDownloaded.status).toBe(200);
    const pdfDownloadedBuffer = Buffer.from(await pdfDownloaded.arrayBuffer());
    expect(pdfDownloadedBuffer.equals(validPdfBytes)).toBe(true);

    const docxDownloadRes = await clientA.getFileDownloadCapability(
      workspaceAId,
      docxFinalize.data.fileId
    );
    expect(docxDownloadRes.data.expiresInSeconds).toBe(DOWNLOAD_CAPABILITY_EXPIRY_SECONDS);
    const docxDownloaded = await fetch(docxDownloadRes.data.downloadUrl);
    expect(docxDownloaded.status).toBe(200);
    const docxDownloadedBuffer = Buffer.from(await docxDownloaded.arrayBuffer());
    expect(docxDownloadedBuffer.equals(validDocxBytes)).toBe(true);
  });

  it('Journey 2: Safe Isolated Previews Across Formats (Image, PDF, Office, Unsupported)', async () => {
    // 1. Validate preview kind classification
    expect(getFilePreviewKind('image/png')).toBe('image');
    expect(getFilePreviewKind('image/jpeg')).toBe('image');
    expect(getFilePreviewKind('image/webp')).toBe('image');
    expect(getFilePreviewKind('image/gif')).toBe('image');
    expect(getFilePreviewKind('application/pdf')).toBe('pdf');
    expect(
      getFilePreviewKind('application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    ).toBe('office');
    expect(getFilePreviewKind('application/msword')).toBe('office');
    expect(
      getFilePreviewKind('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    ).toBe('office');
    expect(getFilePreviewKind('application/octet-stream')).toBe('unsupported');

    // 2. Validate safe preview permission rules:
    // Only verified quarantine status can be previewed
    expect(isSafeToPreview('verified', 'image/png')).toBe(true);
    expect(isSafeToPreview('verified', 'application/pdf')).toBe(true);
    expect(isSafeToPreview('verified', 'application/msword')).toBe(true);

    // Quarantined, rejected, or unsupported formats are strictly blocked
    expect(isSafeToPreview('quarantined', 'image/png')).toBe(false);
    expect(isSafeToPreview('rejected', 'image/png')).toBe(false);
    expect(isSafeToPreview('deleted', 'image/png')).toBe(false);
    expect(isSafeToPreview('verified', 'application/octet-stream')).toBe(false);
    expect(isSafeToPreview('verified', undefined)).toBe(false);

    // 3. Upload legacy Word document (.doc with OLE CFB header: D0 CF 11 E0 A1 B1 1A E1)
    const validOleDocBytes = Buffer.from([
      0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00,
    ]);
    const docReservation = await clientA.reserveFileUpload(workspaceAId, {
      fileName: 'legacy_spec.doc',
      declaredMimeType: 'application/msword',
      declaredBytes: validOleDocBytes.length,
    });
    expect(docReservation.data.reservationId).toBeDefined();

    const docUploadRes = await fetch(docReservation.data.uploadUrl, {
      method: docReservation.data.method,
      headers: { 'content-type': 'application/msword' },
      body: validOleDocBytes,
    });
    expect(docUploadRes.status).toBe(200);

    const docFinalize = await clientA.finalizeFileUpload(
      workspaceAId,
      docReservation.data.reservationId
    );
    expect(docFinalize.data.status).toBe('verified');
    expect(docFinalize.data.detectedMimeType).toBe('application/msword');
    expect(ALLOWED_MIME_TYPES).toContain('application/msword');

    // Office preview contract: format classification is 'office' (metadata + download link, no editing claimed)
    expect(getFilePreviewKind(docFinalize.data.detectedMimeType)).toBe('office');
  });

  it('Journey 3: Quarantined and Rejected Files Block Preview and Download Capabilities', async () => {
    // 1. Reserve upload declaring image/png, but upload spoofed/corrupted payload
    const spoofedBytes = Buffer.from('NOT A PNG FILE - THIS IS PLAIN TEXT SPOOFING A PNG IMAGE');
    const reservation = await clientA.reserveFileUpload(workspaceAId, {
      fileName: 'spoofed_photo.png',
      declaredMimeType: 'image/png',
      declaredBytes: spoofedBytes.length,
    });

    const uploadRes = await fetch(reservation.data.uploadUrl, {
      method: reservation.data.method,
      headers: { 'content-type': 'image/png' },
      body: spoofedBytes,
    });
    expect(uploadRes.status).toBe(200);

    // 2. Finalize fails due to sniffing signature mismatch
    await expect(
      clientA.finalizeFileUpload(workspaceAId, reservation.data.reservationId)
    ).rejects.toThrow(/File failed security verification/);

    // 3. Download capability for the unverified/non-existent fileId must be rejected
    await expect(
      clientA.getFileDownloadCapability(workspaceAId, reservation.data.fileId)
    ).rejects.toThrow();

    // 4. Domain preview safety check blocks preview for rejected or quarantined status
    expect(isSafeToPreview('rejected', 'image/png')).toBe(false);
    expect(isSafeToPreview('quarantined', 'image/png')).toBe(false);
  });

  it('Journey 4: Storage Quota Visibility and Exceeded Quota Rejection', async () => {
    // 1. Query workspace storage quota
    const quotaRes = await clientA.getWorkspaceStorageQuota(workspaceAId);
    expect(quotaRes.data.workspaceId).toBe(workspaceAId);
    expect(quotaRes.data.storedBytes).toBeGreaterThan(0);
    expect(quotaRes.data.maxStorageBytes).toBeGreaterThan(0);

    // 2. Test domain storage calculations
    const usage = computeStorageUsage(
      quotaRes.data.storedBytes,
      quotaRes.data.reservedBytes,
      quotaRes.data.maxStorageBytes
    );
    expect(usage.percentUsed).toBeGreaterThanOrEqual(0);
    expect(usage.percentUsed).toBeLessThanOrEqual(100);
    expect(usage.formattedStored).toContain('B');
    expect(usage.formattedMax).toContain('B');

    // 3. Attempting to reserve an upload exceeding maxStorageBytes must fail cleanly
    const massiveByteSize = quotaRes.data.maxStorageBytes + 1;
    const quotaExceedingBytes = Math.min(massiveByteSize, 45 * 1024 * 1024);

    const isExceeding =
      quotaRes.data.storedBytes + quotaExceedingBytes > quotaRes.data.maxStorageBytes;
    if (isExceeding) {
      await expect(
        clientA.reserveFileUpload(workspaceAId, {
          fileName: 'oversized_audio.mp4',
          declaredMimeType: 'audio/mp4',
          declaredBytes: quotaExceedingBytes,
        })
      ).rejects.toThrow();
    }
  });

  it('Journey 5: Upload Cancellation and Retry Handling Without Duplicate Records', async () => {
    const validPngBytes = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44,
      0x52,
    ]);

    // 1. Reserve upload
    const reservation = await clientA.reserveFileUpload(workspaceAId, {
      fileName: 'abandoned_sketch.png',
      declaredMimeType: 'image/png',
      declaredBytes: validPngBytes.length,
    });
    const reservationId = reservation.data.reservationId;

    // 2. Client cancels the upload (simulating user abort or cancellation)
    const cancelRes = await clientA.cancelFileUploadReservation(workspaceAId, reservationId);
    expect(cancelRes.data.status).toBe('cancelled');
    expect(cancelRes.data.reconciled).toBe(true);

    // 3. Verify reservation status is cancelled
    const statusRes = await clientA.getFileUploadStatus(workspaceAId, reservationId);
    expect(statusRes.data.status).toBe('cancelled');

    // 4. Retry with fresh reservation succeeds without duplicate records
    const retryReservation = await clientA.reserveFileUpload(workspaceAId, {
      fileName: 'abandoned_sketch.png',
      declaredMimeType: 'image/png',
      declaredBytes: validPngBytes.length,
    });
    expect(retryReservation.data.reservationId).not.toBe(reservationId);

    const uploadRes = await fetch(retryReservation.data.uploadUrl, {
      method: retryReservation.data.method,
      headers: { 'content-type': 'image/png' },
      body: validPngBytes,
    });
    expect(uploadRes.status).toBe(200);

    const finalizeRes = await clientA.finalizeFileUpload(
      workspaceAId,
      retryReservation.data.reservationId
    );
    expect(finalizeRes.data.status).toBe('verified');
  });

  it('Journey 6: Offline File Availability, Cache Namespacing, and Integrity Eviction', async () => {
    const testAccountId = 'account-alice-001';
    const testWorkspaceId = workspaceAId;
    const testFileId = crypto.randomUUID();
    const testVersion = 1;

    // 1. Verify cache key namespacing format: ${accountId}:${workspaceId}:${fileId}:v${version}
    const cacheKey = getOfflineBinaryCacheKey(
      testAccountId,
      testWorkspaceId,
      testFileId,
      testVersion
    );
    expect(cacheKey).toBe(`${testAccountId}:${testWorkspaceId}:${testFileId}:v${testVersion}`);

    // 2. Save verified binary to OfflineFileCache
    const fileBytes = Buffer.from('Mock binary content for offline document cache');
    const sha256 = crypto.createHash('sha256').update(fileBytes).digest('hex');
    const arrayBuffer = fileBytes.buffer.slice(
      fileBytes.byteOffset,
      fileBytes.byteOffset + fileBytes.byteLength
    );

    const savedEntry = await OfflineFileCache.saveBinary({
      accountId: testAccountId,
      workspaceId: testWorkspaceId,
      fileId: testFileId,
      version: testVersion,
      fileName: 'offline-doc.txt',
      mimeType: 'text/plain',
      expectedSha256: sha256,
      data: arrayBuffer,
    });
    expect(savedEntry.cacheKey).toBe(cacheKey);
    expect(savedEntry.sha256Checksum).toBe(sha256);

    // 3. Verify retrieval & integrity
    const hasBinary = await OfflineFileCache.hasBinary(
      testAccountId,
      testWorkspaceId,
      testFileId,
      testVersion
    );
    expect(hasBinary).toBe(true);

    const retrieved = await OfflineFileCache.getBinary(
      testAccountId,
      testWorkspaceId,
      testFileId,
      testVersion
    );
    expect(retrieved).not.toBeNull();
    expect(retrieved?.fileName).toBe('offline-doc.txt');

    // 4. Test corruption detection and eviction
    const corruptedBuffer = Buffer.from('CORRUPTED BYTES HERE').buffer;
    await expect(
      OfflineFileCache.saveBinary({
        accountId: testAccountId,
        workspaceId: testWorkspaceId,
        fileId: testFileId,
        version: 2,
        fileName: 'offline-doc-corrupted.txt',
        mimeType: 'text/plain',
        expectedSha256: sha256, // mismatch with corruptedBuffer
        data: corruptedBuffer,
      })
    ).rejects.toThrow(/INTEGRITY_CHECK_FAILED/);

    // 5. Clean up on workspace switch
    await OfflineFileCache.clearWorkspace(testWorkspaceId);
    const afterClear = await OfflineFileCache.hasBinary(
      testAccountId,
      testWorkspaceId,
      testFileId,
      testVersion
    );
    expect(afterClear).toBe(false);
  });

  it('Journey 7: Multi-Tenant Workspace Isolation', async () => {
    // 1. User A uploads a private document
    const privateDocBytes = Buffer.from('%PDF-1.7\nAlice private payroll document\n%%EOF');
    const reservation = await clientA.reserveFileUpload(workspaceAId, {
      fileName: 'alice_payroll.pdf',
      declaredMimeType: 'application/pdf',
      declaredBytes: privateDocBytes.length,
    });

    await fetch(reservation.data.uploadUrl, {
      method: reservation.data.method,
      headers: { 'content-type': 'application/pdf' },
      body: privateDocBytes,
    });

    const finalize = await clientA.finalizeFileUpload(workspaceAId, reservation.data.reservationId);
    expect(finalize.data.status).toBe('verified');
    const aliceFileId = finalize.data.fileId;

    // 2. User B in Workspace B attempts to access Alice's file download capability
    await expect(clientB.getFileDownloadCapability(workspaceBId, aliceFileId)).rejects.toThrow();

    // 3. User B attempts to access Alice's file via Alice's workspace ID
    await expect(clientB.getFileDownloadCapability(workspaceAId, aliceFileId)).rejects.toThrow();

    // 4. User B attempts to view Alice's file metadata
    await expect(clientB.getFileMetadata(workspaceAId, aliceFileId)).rejects.toThrow();

    // 5. User B attempts to query Alice's workspace quota
    await expect(clientB.getWorkspaceStorageQuota(workspaceAId)).rejects.toThrow();
  });
});
