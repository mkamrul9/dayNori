import crypto from 'node:crypto';
import { generateKeyPair, SignJWT, exportJWK, type JSONWebKeySet } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { buildServer, JwtVerifier } from '../../apps/api/src/index.js';
import { createAdminPool, createRuntimePool } from '../../apps/api/src/db/index.js';
import { Migrator } from '../../infra/supabase/migrator.js';
import { createApiClient, DaynoriApiClient } from '@daynori/api-client';
import {
  UPLOAD_CAPABILITY_EXPIRY_SECONDS,
  DOWNLOAD_CAPABILITY_EXPIRY_SECONDS,
  MAX_CONCURRENT_RESERVATIONS,
} from '@daynori/contracts';
import {
  MemoryStorageProvider,
  setDefaultStorageProvider,
} from '../../apps/api/src/modules/files/storageAdapter.js';
import {
  PolicyMalwareScanner,
  setDefaultMalwareScanner,
} from '../../apps/api/src/modules/files/scanner.js';
import { DaynoriWorker } from '../../apps/worker/src/worker.js';
import { reconcileExpiredReservations } from '../../apps/api/src/modules/files/service.js';

describe('Phase 24: Private Binary Upload Lifecycle (Integration Tests)', () => {
  let adminPool: Pool;
  let runtimePool: Pool;
  let migrator: Migrator;
  let server: ReturnType<typeof buildServer>;
  let baseUrl: string;

  let keyPair: Awaited<ReturnType<typeof generateKeyPair>>;
  let jwks: JSONWebKeySet;

  const issuer = 'https://auth.daynori.test';
  const audience = 'daynori-api';
  const kid = 'phase24-files-key';

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

    // 1. Run migrations including 00020_file_upload_lifecycle_and_quarantine.sql
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
        if (entry.level === 'error') {
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
        [userAId, 'Alice Files', userBId, 'Bob Files']
      );

      const wsARes = await setupClient.query<{ id: string }>(
        `INSERT INTO app.workspaces (name, kind, owner_id) VALUES ($1, 'personal', $2) RETURNING id`,
        ['Alice Files Workspace', userAId]
      );
      workspaceAId = wsARes.rows[0]!.id;

      const wsBRes = await setupClient.query<{ id: string }>(
        `INSERT INTO app.workspaces (name, kind, owner_id) VALUES ($1, 'personal', $2) RETURNING id`,
        ['Bob Files Workspace', userBId]
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

  it('Journey 1: Happy Path Upload Lifecycle (Reservation -> Stored Upload -> Finalize -> Download Capability)', async () => {
    // 1. Reserve upload capability
    const validPngBytes = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44,
      0x52,
    ]);

    const reservationRes = await clientA.reserveFileUpload(workspaceAId, {
      fileName: 'architecture_diagram.png',
      declaredMimeType: 'image/png',
      declaredBytes: validPngBytes.length,
    });

    const reservation = reservationRes.data;
    expect(reservation.reservationId).toBeDefined();
    expect(reservation.fileId).toBeDefined();
    expect(reservation.method).toBe('PUT');
    // Actual provider upload expiry must be exactly 7200 seconds (2 hours)
    expect(reservation.expiresInSeconds).toBe(UPLOAD_CAPABILITY_EXPIRY_SECONDS);
    expect(reservation.expiresInSeconds).toBe(7200);
    expect(reservation.objectPath).toContain(`${workspaceAId}/${reservation.fileId}/1/`);

    // 2. Client transfers binary directly to storage provider via returned signed upload capability
    const uploadRes = await fetch(reservation.uploadUrl, {
      method: reservation.method,
      headers: {
        'content-type': 'image/png',
      },
      body: validPngBytes,
    });
    expect(uploadRes.status).toBe(200);

    // 2b. Verify overwrite prevention with upsert: false over HTTP transport
    const duplicateUploadRes = await fetch(reservation.uploadUrl, {
      method: reservation.method,
      headers: {
        'content-type': 'image/png',
      },
      body: validPngBytes,
    });
    expect([409, 400]).toContain(duplicateUploadRes.status);

    // 3. Finalize upload
    const finalizeRes = await clientA.finalizeFileUpload(workspaceAId, reservation.reservationId);

    expect(finalizeRes.data.status).toBe('verified');
    expect(finalizeRes.data.fileName).toBe('architecture_diagram.png');
    expect(finalizeRes.data.byteSize).toBe(validPngBytes.length);
    expect(finalizeRes.data.detectedMimeType).toBe('image/png');
    expect(finalizeRes.data.sha256Checksum).toBe(
      crypto.createHash('sha256').update(validPngBytes).digest('hex')
    );

    // 4. Request authorized download capability and verify byte transport
    const downloadRes = await clientA.getFileDownloadCapability(
      workspaceAId,
      finalizeRes.data.fileId
    );
    expect(downloadRes.data.downloadUrl).toBeDefined();
    // Download capability expiry must be short-lived (300 seconds)
    expect(downloadRes.data.expiresInSeconds).toBe(DOWNLOAD_CAPABILITY_EXPIRY_SECONDS);
    expect(downloadRes.data.expiresInSeconds).toBe(300);

    const dlRes = await fetch(downloadRes.data.downloadUrl);
    expect(dlRes.status).toBe(200);
    const downloadedBytes = Buffer.from(await dlRes.arrayBuffer());
    expect(downloadedBytes).toEqual(validPngBytes);

    // 5. Without required configuration, return honest 503 rather than fictional URLs
    const { UnavailableStorageProvider } =
      await import('../../apps/api/src/modules/files/storageAdapter.js');
    try {
      setDefaultStorageProvider(new UnavailableStorageProvider('S3 configuration missing'));
      await expect(
        clientA.reserveFileUpload(workspaceAId, {
          fileName: 'unconfigured.png',
          declaredMimeType: 'image/png',
          declaredBytes: 1024,
        })
      ).rejects.toThrowError(/Storage.*unavailable/i);
    } finally {
      setDefaultStorageProvider(memoryStorage);
    }

    // 6. Fetch file metadata
    const metaRes = await clientA.getFileMetadata(workspaceAId, finalizeRes.data.fileId);
    expect(metaRes.data.quarantineStatus).toBe('verified');
    expect(metaRes.data.fileName).toBe('architecture_diagram.png');
  });

  it('Journey 2: Quota Enforcement & Concurrent Reservation Limits', async () => {
    // 1. Check storage quota
    const initialQuota = await clientA.getWorkspaceStorageQuota(workspaceAId);
    expect(initialQuota.data.maxStorageBytes).toBe(104857600); // 100 MiB

    // 2. Genuine concurrent requests and quota limits
    // Per-file limit is 50 MiB. Workspace quota is 100 MiB.
    // Reserve two 45 MiB uploads (total 90 MiB <= 100 MiB quota, each <= 50 MiB per-file limit)
    const reserve1 = await clientA.reserveFileUpload(workspaceAId, {
      fileName: 'large_part_1.bin',
      declaredMimeType: 'application/octet-stream',
      declaredBytes: 45 * 1024 * 1024,
    });
    expect(reserve1.data.reservationId).toBeDefined();

    const reserve2 = await clientA.reserveFileUpload(workspaceAId, {
      fileName: 'large_part_2.bin',
      declaredMimeType: 'application/octet-stream',
      declaredBytes: 45 * 1024 * 1024,
    });
    expect(reserve2.data.reservationId).toBeDefined();

    // Attempt reservation within 50 MiB per-file limit (20 MiB), but exceeding 100 MiB workspace quota (90 + 20 = 110 MiB)
    let quotaError: unknown;
    try {
      await clientA.reserveFileUpload(workspaceAId, {
        fileName: 'overflow_quota.bin',
        declaredMimeType: 'application/octet-stream',
        declaredBytes: 20 * 1024 * 1024, // 20 MiB <= 50 MiB per-file, but 90 + 20 > 100 MiB quota
      });
    } catch (err) {
      quotaError = err;
    }
    expect(quotaError).toBeDefined();
    expect(quotaError instanceof Error ? quotaError.message : String(quotaError)).toMatch(/quota/i);

    // Cancel to free reserved quota
    await clientA.cancelFileUploadReservation(workspaceAId, reserve1.data.reservationId);
    await clientA.cancelFileUploadReservation(workspaceAId, reserve2.data.reservationId);

    // 3. Bound concurrent active reservations
    const reservations: string[] = [];
    for (let i = 0; i < MAX_CONCURRENT_RESERVATIONS; i++) {
      const res = await clientA.reserveFileUpload(workspaceAId, {
        fileName: `concurrent_upload_${i}.pdf`,
        declaredMimeType: 'application/pdf',
        declaredBytes: 1024,
      });
      reservations.push(res.data.reservationId);
    }
    expect(reservations.length).toBe(MAX_CONCURRENT_RESERVATIONS);

    // 4. Attempt reservation beyond max concurrent limit
    let throttleError: unknown;
    try {
      await clientA.reserveFileUpload(workspaceAId, {
        fileName: 'overflow_upload.pdf',
        declaredMimeType: 'application/pdf',
        declaredBytes: 1024,
      });
    } catch (err) {
      throttleError = err;
    }
    expect(throttleError).toBeDefined();

    // Cancel one reservation to free slot
    const toCancel = reservations.pop()!;
    await clientA.cancelFileUploadReservation(workspaceAId, toCancel);

    // Now reservation succeeds again
    const freedRes = await clientA.reserveFileUpload(workspaceAId, {
      fileName: 'freed_slot.pdf',
      declaredMimeType: 'application/pdf',
      declaredBytes: 1024,
    });
    expect(freedRes.data.reservationId).toBeDefined();

    // Clean up remaining reservations
    for (const rId of reservations) {
      await clientA.cancelFileUploadReservation(workspaceAId, rId);
    }
    await clientA.cancelFileUploadReservation(workspaceAId, freedRes.data.reservationId);
  });

  it('Journey 3: Content Verification, MIME Spoofing & Malicious Filenames', async () => {
    // 1. Path traversal in filename must be rejected
    let pathTraversalError: unknown;
    try {
      await clientA.reserveFileUpload(workspaceAId, {
        fileName: '../../etc/passwd',
        declaredMimeType: 'text/plain',
        declaredBytes: 100,
      });
    } catch (err) {
      pathTraversalError = err;
    }
    expect(pathTraversalError).toBeDefined();

    // 2. MIME Spoofing: Declared as image/png, but uploaded bytes are Windows PE executable
    const reserveSpoof = await clientA.reserveFileUpload(workspaceAId, {
      fileName: 'cute_cat.png',
      declaredMimeType: 'image/png',
      declaredBytes: 64,
    });

    const fakeExeBytes = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);
    await memoryStorage.putObject('private_assets', reserveSpoof.data.objectPath, fakeExeBytes, {
      contentType: 'image/png',
      upsert: false,
    });

    let finalizeSpoofError: unknown;
    try {
      await clientA.finalizeFileUpload(workspaceAId, reserveSpoof.data.reservationId);
    } catch (err) {
      finalizeSpoofError = err;
    }
    expect(finalizeSpoofError).toBeDefined();

    // 3. SVG Active Script Injection Vector
    const reserveSvg = await clientA.reserveFileUpload(workspaceAId, {
      fileName: 'vector.svg',
      declaredMimeType: 'text/plain',
      declaredBytes: 128,
    });

    const svgPayload = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(document.cookie)</script></svg>'
    );
    await memoryStorage.putObject('private_assets', reserveSvg.data.objectPath, svgPayload, {
      contentType: 'text/plain',
      upsert: false,
    });

    let finalizeSvgError: unknown;
    try {
      await clientA.finalizeFileUpload(workspaceAId, reserveSvg.data.reservationId);
    } catch (err) {
      finalizeSvgError = err;
    }
    expect(finalizeSvgError).toBeDefined();
  });

  it('Journey 4: Integrity Verification & Client Checksum Validation', async () => {
    const pdfBytes = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF');
    const realHash = crypto.createHash('sha256').update(pdfBytes).digest('hex');
    const wrongHash = '0000000000000000000000000000000000000000000000000000000000000000';

    const reserve = await clientA.reserveFileUpload(workspaceAId, {
      fileName: 'document.pdf',
      declaredMimeType: 'application/pdf',
      declaredBytes: pdfBytes.length,
    });

    await memoryStorage.putObject('private_assets', reserve.data.objectPath, pdfBytes, {
      contentType: 'application/pdf',
      upsert: false,
    });

    // Finalize with mismatched checksum fails
    let checksumError: unknown;
    try {
      await clientA.finalizeFileUpload(workspaceAId, reserve.data.reservationId, {
        clientChecksum: wrongHash,
      });
    } catch (err) {
      checksumError = err;
    }
    expect(checksumError).toBeDefined();

    // Finalize with valid matching checksum succeeds
    const successRes = await clientA.finalizeFileUpload(workspaceAId, reserve.data.reservationId, {
      clientChecksum: realHash,
    });
    expect(successRes.data.status).toBe('verified');
    expect(successRes.data.sha256Checksum).toBe(realHash);
  });

  it('Journey 5: Fail-Closed Malware Scanning Policy & Scanner Outage Handling', async () => {
    // 1. EICAR Antivirus Test Signature
    const eicarPayload = Buffer.from(
      'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'
    );

    const reserveEicar = await clientA.reserveFileUpload(workspaceAId, {
      fileName: 'virus_test.txt',
      declaredMimeType: 'text/plain',
      declaredBytes: eicarPayload.length,
    });

    await memoryStorage.putObject('private_assets', reserveEicar.data.objectPath, eicarPayload, {
      contentType: 'text/plain',
      upsert: false,
    });

    let eicarError: unknown;
    try {
      await clientA.finalizeFileUpload(workspaceAId, reserveEicar.data.reservationId);
    } catch (err) {
      eicarError = err;
    }
    expect(eicarError).toBeDefined();

    // 2. Fail-Closed on Scanner Outage
    policyScanner.setSimulatedFailureMode('outage');

    const reserveOutage = await clientA.reserveFileUpload(workspaceAId, {
      fileName: 'clean_doc.pdf',
      declaredMimeType: 'application/pdf',
      declaredBytes: 64,
    });

    const validPdf = Buffer.from('%PDF-1.4\nClean test content');
    await memoryStorage.putObject('private_assets', reserveOutage.data.objectPath, validPdf, {
      contentType: 'application/pdf',
      upsert: false,
    });

    let outageError: unknown;
    try {
      await clientA.finalizeFileUpload(workspaceAId, reserveOutage.data.reservationId);
    } catch (err) {
      outageError = err;
    }
    expect(outageError).toBeDefined();

    // Restore scanner normal mode
    policyScanner.setSimulatedFailureMode('none');
  });

  it('Journey 6: Idempotent Finalize & Strict Overwrite Prevention', async () => {
    const pngBytes = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x01,
    ]);

    const reserve = await clientA.reserveFileUpload(workspaceAId, {
      fileName: 'idempotent_test.png',
      declaredMimeType: 'image/png',
      declaredBytes: pngBytes.length,
    });

    await memoryStorage.putObject('private_assets', reserve.data.objectPath, pngBytes, {
      contentType: 'image/png',
      upsert: false,
    });

    const firstFinalize = await clientA.finalizeFileUpload(
      workspaceAId,
      reserve.data.reservationId
    );
    expect(firstFinalize.data.status).toBe('verified');

    // Repeated finalize returns identical result idempotently
    const secondFinalize = await clientA.finalizeFileUpload(
      workspaceAId,
      reserve.data.reservationId
    );
    expect(secondFinalize.data.fileId).toBe(firstFinalize.data.fileId);
    expect(secondFinalize.data.sha256Checksum).toBe(firstFinalize.data.sha256Checksum);

    // Overwriting with upsert: false must throw
    await expect(
      memoryStorage.putObject('private_assets', reserve.data.objectPath, pngBytes, {
        upsert: false,
      })
    ).rejects.toThrowError(/upsert is disabled/);

    // Caller-supplied fileId cannot hijack or overwrite an existing item through ON CONFLICT
    let hijackError: unknown;
    try {
      await clientA.reserveFileUpload(workspaceAId, {
        fileId: firstFinalize.data.fileId,
        fileName: 'hijack_test.png',
        declaredMimeType: 'image/png',
        declaredBytes: pngBytes.length,
      });
    } catch (err) {
      hijackError = err;
    }
    expect(hijackError).toBeDefined();
  });

  it('Journey 7: Multi-Tenant Workspace & Actor Isolation', async () => {
    const textBytes = Buffer.from('Alice private journal export');
    const reserveA = await clientA.reserveFileUpload(workspaceAId, {
      fileName: 'alice_secret.txt',
      declaredMimeType: 'text/plain',
      declaredBytes: textBytes.length,
    });

    await memoryStorage.putObject('private_assets', reserveA.data.objectPath, textBytes, {
      contentType: 'text/plain',
      upsert: false,
    });

    const finalizedA = await clientA.finalizeFileUpload(workspaceAId, reserveA.data.reservationId);

    // User B in Workspace B attempts to finalize User A's reservation -> 404
    let crossFinalizeError: unknown;
    try {
      await clientB.finalizeFileUpload(workspaceBId, reserveA.data.reservationId);
    } catch (err) {
      crossFinalizeError = err;
    }
    expect(crossFinalizeError).toBeDefined();

    // User B attempts to download User A's verified file -> 404
    let crossDownloadError: unknown;
    try {
      await clientB.getFileDownloadCapability(workspaceBId, finalizedA.data.fileId);
    } catch (err) {
      crossDownloadError = err;
    }
    expect(crossDownloadError).toBeDefined();

    // User B attempts to access User A's file metadata -> 404
    let crossMetaError: unknown;
    try {
      await clientB.getFileMetadata(workspaceBId, finalizedA.data.fileId);
    } catch (err) {
      crossMetaError = err;
    }
    expect(crossMetaError).toBeDefined();

    // Anonymous request without token -> 401
    const anonClient = createApiClient({ baseUrl, token: 'invalid.token' });
    let anonError: unknown;
    try {
      await anonClient.getFileMetadata(workspaceAId, finalizedA.data.fileId);
    } catch (err) {
      anonError = err;
    }
    expect(anonError).toBeDefined();
  });

  it('Journey 8: Capability Expiry Horizon, Worker Lease & Orphan Storage Reconciliation', async () => {
    // 1. Reserve upload capability and then abandon it (simulate expired reservation)
    const abandonReserve = await clientA.reserveFileUpload(workspaceAId, {
      fileName: 'abandoned.pdf',
      declaredMimeType: 'application/pdf',
      declaredBytes: 2048,
    });

    // Fast-forward expiry in database to past
    const dbClient = await adminPool.connect();
    try {
      await dbClient.query(
        `UPDATE app.upload_reservations SET expires_at = now() - interval '1 hour' WHERE id = $1`,
        [abandonReserve.data.reservationId]
      );
    } finally {
      dbClient.release();
    }

    // 2. DaynoriWorker executes durable jobs with database lease ownership and SKIP LOCKED
    const durableWorker = new DaynoriWorker(runtimePool);
    durableWorker.start();

    // Insert durable background job into app.background_jobs
    const testJobClient = await adminPool.connect();
    let durableJobId: string;
    try {
      await testJobClient.query('DELETE FROM app.background_jobs');
      const insRes = await testJobClient.query<{ id: string }>(
        `INSERT INTO app.background_jobs (task_type, payload) VALUES ('file_orphan_cleanup', '{}'::jsonb) RETURNING id`
      );
      durableJobId = insRes.rows[0]!.id;
    } finally {
      testJobClient.release();
    }

    const jobProcessed = await durableWorker.pollAndProcessNextJob();
    expect(jobProcessed).not.toBeNull();
    expect(jobProcessed?.status).toBe('completed');

    const verifyJobClient = await adminPool.connect();
    try {
      const checkRes = await verifyJobClient.query<{ status: string; completed_at: string }>(
        `SELECT status, completed_at FROM app.background_jobs WHERE id = $1`,
        [durableJobId]
      );
      expect(checkRes.rows[0]?.status).toBe('completed');
      expect(checkRes.rows[0]?.completed_at).toBeDefined();
    } finally {
      verifyJobClient.release();
    }
    durableWorker.stop();

    // 3. Reconcile database expired reservations
    const reconClient = await adminPool.connect();
    try {
      const reconciledCount = await reconcileExpiredReservations(reconClient);
      expect(reconciledCount).toBeGreaterThanOrEqual(1);

      // Verify reservation is marked expired and reconciled
      const checkRes = await reconClient.query<{ status: string; reconciled: boolean }>(
        `SELECT status, reconciled FROM app.upload_reservations WHERE id = $1`,
        [abandonReserve.data.reservationId]
      );
      expect(checkRes.rows[0]?.status).toBe('expired');
      expect(checkRes.rows[0]?.reconciled).toBe(true);
    } finally {
      reconClient.release();
    }

    // 4. File Deletion lifecycle
    const deleteDoc = Buffer.from('%PDF-1.4\nTo be deleted');
    const deleteReserve = await clientA.reserveFileUpload(workspaceAId, {
      fileName: 'temporary.pdf',
      declaredMimeType: 'application/pdf',
      declaredBytes: deleteDoc.length,
    });

    const delUploadRes = await fetch(deleteReserve.data.uploadUrl, {
      method: deleteReserve.data.method,
      headers: { 'content-type': 'application/pdf' },
      body: deleteDoc,
    });
    expect(delUploadRes.ok).toBe(true);

    const finalizedDoc = await clientA.finalizeFileUpload(
      workspaceAId,
      deleteReserve.data.reservationId
    );

    // Delete file
    const deleteRes = await clientA.deleteFile(workspaceAId, finalizedDoc.data.fileId);
    expect(deleteRes.data.success).toBe(true);

    // Verify storage object was purged
    const storedObject = await memoryStorage.getObject(
      'private_assets',
      deleteReserve.data.objectPath
    );
    expect(storedObject).toBeNull();

    // Verify metadata returns 404
    let deletedFetchError: unknown;
    try {
      await clientA.getFileMetadata(workspaceAId, finalizedDoc.data.fileId);
    } catch (err) {
      deletedFetchError = err;
    }
    expect(deletedFetchError).toBeDefined();
  });

  it('Journey 9: File Metadata Projections, Sync Bootstrap & Fresh Client Projection', async () => {
    // 1. Create a folder and upload a verified file into that folder
    const folderRes = await clientA.createFolder(workspaceAId, {
      name: 'Project Assets',
    });
    const folderId = folderRes.data.id;

    const fileBytes = Buffer.from('%PDF-1.4\nSynchronized canonical asset content');
    const reserve = await clientA.reserveFileUpload(workspaceAId, {
      fileName: 'project_spec.pdf',
      declaredMimeType: 'application/pdf',
      declaredBytes: fileBytes.length,
      folderId,
    });

    const putRes = await fetch(reserve.data.uploadUrl, {
      method: reserve.data.method,
      headers: { 'content-type': 'application/pdf' },
      body: fileBytes,
    });
    expect(putRes.ok).toBe(true);

    const finalized = await clientA.finalizeFileUpload(workspaceAId, reserve.data.reservationId);
    expect(finalized.data.status).toBe('verified');

    // 2. Fresh second client connects and performs bootstrap sync
    const clientA2 = createApiClient({ baseUrl, token: tokenUserA });
    const bootstrapRes = await clientA2.syncBootstrap({ workspaceId: workspaceAId });
    expect(bootstrapRes.data.files).toBeDefined();
    expect(bootstrapRes.data.files.length).toBeGreaterThanOrEqual(1);

    const syncedFile = bootstrapRes.data.files.find((f) => f.id === finalized.data.fileId);
    expect(syncedFile).toBeDefined();
    expect(syncedFile?.fileName).toBe('project_spec.pdf');
    expect(syncedFile?.folderId).toBe(folderId);
    expect(syncedFile?.quarantineStatus).toBe('verified');
    // Ensure binary bytes and signed capabilities are strictly omitted from sync metadata
    const rawSynced = syncedFile as unknown as Record<string, unknown>;
    expect(rawSynced['downloadUrl']).toBeUndefined();
    expect(rawSynced['binaryContent']).toBeUndefined();
    expect(rawSynced['bytes']).toBeUndefined();

    // 3. Incremental sync cursor advance and reset
    const watermarkCursor = bootstrapRes.data.watermarkCursor;
    const pullRes = await clientA2.syncPull({
      workspaceId: workspaceAId,
      cursor: watermarkCursor,
      limit: 50,
    });
    expect(pullRes.data.hasMore).toBe(false);
  });

  it('Journey 10: Mobile Snippet Preference Synchronization & Propagation', async () => {
    // 1. Fetch actor profile preferences
    const initialPrefs = await clientA.getUserPreferences();
    expect(initialPrefs.data.preferences).toBeDefined();

    // 2. Update snippet suppression preference
    const updatedPrefs = await clientA.updateUserPreferences({
      preferences: {
        suppressBodySnippets: false,
      },
    });
    expect(updatedPrefs.data.preferences?.suppressBodySnippets).toBe(false);

    // 3. Second device reads the propagated preference
    const clientA2 = createApiClient({ baseUrl, token: tokenUserA });
    const secondDevicePrefs = await clientA2.getUserPreferences();
    expect(secondDevicePrefs.data.preferences?.suppressBodySnippets).toBe(false);

    // 4. Toggle back to true
    await clientA2.updateUserPreferences({
      preferences: {
        suppressBodySnippets: true,
      },
    });
    const finalPrefs = await clientA.getUserPreferences();
    expect(finalPrefs.data.preferences?.suppressBodySnippets).toBe(true);
  });
});
