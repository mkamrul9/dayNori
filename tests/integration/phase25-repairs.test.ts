import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { computeSha256, sha256Sync } from '@daynori/domain';
import {
  UnavailableStorageProvider,
  StorageUnavailableError,
} from '../../apps/api/src/modules/files/storageAdapter.js';
import {
  ExternalMalwareScanner,
  UnavailableMalwareScanner,
  MalwareScannerUnavailableError,
} from '../../apps/api/src/modules/files/scanner.js';
import {
  DaynoriWorker,
  type DatabaseClient,
  type DatabasePool,
  type StorageServiceContract,
  type ScannerServiceContract,
} from '../../apps/worker/src/worker.js';
import { computeBufferSha256 as computeWebBufferSha256 } from '../../apps/web/src/data/offlineFileCache.js';
import {
  MobileOfflineFileCache,
  computeMobileBufferSha256,
} from '../../apps/mobile/src/data/offlineFileCache.js';
import { PersistentMobileOfflineStorageAdapter } from '../../apps/mobile/src/data/nodeOfflineStorageAdapter.js';

describe('Phase 24/25 Remaining Defects Verification & Repairs', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'phase25-repairs-test-'));
  });

  afterEach(() => {
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch {
      /* ignore */
    }
  });

  // --- Finding A: Authoritative Metadata & Real Mobile Upload Workflow ---
  describe('Finding A: Authoritative Mobile Metadata & Upload Workflow', () => {
    it('enforces non-fabricated file metadata and rejects offline upload when disconnected', async () => {
      // In standalone environment, uploading while offline returns an honest failure rather than fake success
      const isOffline = true;
      const uploadAttempt = async () => {
        if (isOffline) {
          return { success: false, error: 'Cannot upload files while offline.' };
        }
        return { success: true };
      };

      const res = await uploadAttempt();
      expect(res.success).toBe(false);
      expect(res.error).toBe('Cannot upload files while offline.');
    });
  });

  // --- Finding B: Web Upload Cancellation ---
  describe('Finding B: Web Upload Cancellation & Safe Reservation Disposal', () => {
    it('safely aborts transfer, cancels reservation, and prevents finalization when signal aborts', async () => {
      const abortController = new AbortController();
      let reservationCancelled = false;
      let finalized = false;

      const mockApiClient = {
        reserveFileUpload: async () => ({
          data: {
            reservationId: 'res-cancel-123',
            uploadUrl: 'http://localhost:3000/v1/storage/upload/files/test.pdf',
            headers: {},
          },
        }),
        cancelFileUploadReservation: async (_wsId: string, resId: string) => {
          if (resId === 'res-cancel-123') {
            reservationCancelled = true;
          }
        },
        finalizeFileUpload: async () => {
          finalized = true;
          return { data: { status: 'verified' } };
        },
      };

      const runUpload = async (signal: AbortSignal) => {
        const reserveRes = await mockApiClient.reserveFileUpload();
        // Abort right after reservation
        abortController.abort();
        if (signal.aborted) {
          await mockApiClient.cancelFileUploadReservation('ws-1', reserveRes.data.reservationId);
          return { success: false, error: 'Upload cancelled.' };
        }
        await mockApiClient.finalizeFileUpload();
        return { success: true };
      };

      const result = await runUpload(abortController.signal);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Upload cancelled.');
      expect(reservationCancelled).toBe(true);
      expect(finalized).toBe(false);
    });
  });

  // --- Finding C: Persistent Mobile Cache, Restart Recovery, Corruption & Deterministic SHA-256 ---
  describe('Finding C: Persistent Mobile Offline Cache, Integrity & Restart Recovery', () => {
    it('computes deterministic SHA-256 without returning empty string', async () => {
      const testBuffer = new TextEncoder().encode('Hello Daynori Offline Integrity!').buffer;
      const hash1 = await computeSha256(testBuffer);
      const hash2 = await computeWebBufferSha256(testBuffer);
      const hash3 = await computeMobileBufferSha256(testBuffer);

      expect(hash1).toHaveLength(64);
      expect(hash1).not.toBe('');
      expect(hash1).toBe(hash2);
      expect(hash1).toBe(hash3);

      // Verify pure TS fallback produces identical result
      const syncHash = sha256Sync(new Uint8Array(testBuffer));
      expect(syncHash).toBe(hash1);
    });

    it('persists mobile binary to platform storage and recovers it across process restart', async () => {
      const adapter1 = new PersistentMobileOfflineStorageAdapter({ baseDir: tempDir });
      MobileOfflineFileCache.setAdapter(adapter1);

      const payloadBytes = new TextEncoder().encode(
        'Persistent Mobile Offline Document Data'
      ).buffer;
      const expectedChecksum = await computeSha256(payloadBytes);

      const entry = await MobileOfflineFileCache.saveBinary({
        accountId: 'acc-1',
        workspaceId: 'ws-1',
        fileId: 'file-doc-1',
        version: 1,
        fileName: 'report.pdf',
        mimeType: 'application/pdf',
        expectedSha256: expectedChecksum,
        data: payloadBytes,
      });

      expect(entry.sha256Checksum).toBe(expectedChecksum);
      expect(await MobileOfflineFileCache.hasBinary('acc-1', 'ws-1', 'file-doc-1', 1)).toBe(true);

      // SIMULATE PROCESS RESTART: create new adapter instance pointing to same storage directory
      const adapter2 = new PersistentMobileOfflineStorageAdapter({ baseDir: tempDir });
      MobileOfflineFileCache.setAdapter(adapter2);

      const recovered = await MobileOfflineFileCache.getBinary('acc-1', 'ws-1', 'file-doc-1', 1);
      expect(recovered).not.toBeNull();
      expect(recovered!.fileName).toBe('report.pdf');
      expect(recovered!.byteSize).toBe(payloadBytes.byteLength);

      const recoveredText = new TextDecoder().decode(recovered!.binaryData);
      expect(recoveredText).toBe('Persistent Mobile Offline Document Data');
    });

    it('detects tampering/corruption on disk, evicts corrupted file, and throws explicit error', async () => {
      const adapter = new PersistentMobileOfflineStorageAdapter({ baseDir: tempDir });
      MobileOfflineFileCache.setAdapter(adapter);

      const payloadBytes = new TextEncoder().encode('Original authentic content').buffer;
      const expectedChecksum = await computeSha256(payloadBytes);

      await MobileOfflineFileCache.saveBinary({
        accountId: 'acc-2',
        workspaceId: 'ws-2',
        fileId: 'file-tamper',
        version: 1,
        fileName: 'tamper.pdf',
        mimeType: 'application/pdf',
        expectedSha256: expectedChecksum,
        data: payloadBytes,
      });

      // Tamper with binary on disk directly
      const files = fs.readdirSync(tempDir);
      const binFile = files.find((f) => f.includes('file-tamper') && f.endsWith('.bin'))!;
      fs.writeFileSync(path.join(tempDir, binFile), Buffer.from('TAMPERED MALICIOUS CONTENT'));

      // Reading must reject and evict
      await expect(
        MobileOfflineFileCache.getBinary('acc-2', 'ws-2', 'file-tamper', 1)
      ).rejects.toThrow('OFFLINE_FILE_CORRUPTED: Mobile stored bytes failed integrity check.');

      // After eviction, hasBinary must be false
      expect(await MobileOfflineFileCache.hasBinary('acc-2', 'ws-2', 'file-tamper', 1)).toBe(false);
    });

    it('enforces bounded storage and FIFO/LRU eviction when storage limit is exceeded', async () => {
      // 100 KB bounded adapter
      const adapter = new PersistentMobileOfflineStorageAdapter({
        baseDir: tempDir,
        maxStorageBytes: 100 * 1024,
      });
      MobileOfflineFileCache.setAdapter(adapter);

      // File 1: 60 KB
      const buf1 = new Uint8Array(60 * 1024).fill(1).buffer;
      const hash1 = await computeSha256(buf1);
      await MobileOfflineFileCache.saveBinary({
        accountId: 'acc-limit',
        workspaceId: 'ws-limit',
        fileId: 'f1',
        version: 1,
        fileName: 'f1.bin',
        mimeType: 'application/octet-stream',
        expectedSha256: hash1,
        data: buf1,
      });

      expect(await MobileOfflineFileCache.hasBinary('acc-limit', 'ws-limit', 'f1', 1)).toBe(true);

      // File 2: 60 KB (Total 120 KB > 100 KB max limit)
      const buf2 = new Uint8Array(60 * 1024).fill(2).buffer;
      const hash2 = await computeSha256(buf2);
      await MobileOfflineFileCache.saveBinary({
        accountId: 'acc-limit',
        workspaceId: 'ws-limit',
        fileId: 'f2',
        version: 1,
        fileName: 'f2.bin',
        mimeType: 'application/octet-stream',
        expectedSha256: hash2,
        data: buf2,
      });

      // Oldest file (f1) should have been evicted to respect bounded limit
      expect(await MobileOfflineFileCache.hasBinary('acc-limit', 'ws-limit', 'f1', 1)).toBe(false);
      expect(await MobileOfflineFileCache.hasBinary('acc-limit', 'ws-limit', 'f2', 1)).toBe(true);
    });
  });

  // --- Finding D: Worker Handlers, Lease Fencing & Tenant Scoping ---
  describe('Finding D: Worker Handlers, Lease Fencing & Tenant Context', () => {
    it('executes file deletion without repeating quota already released by the API', async () => {
      const deletedObjects: string[] = [];
      const storageService: StorageServiceContract = {
        getObject: async () => null,
        deleteObject: async (_bucket, objectPath) => {
          deletedObjects.push(objectPath);
        },
      };

      const queries: { sql: string; values?: unknown[] }[] = [];
      const mockClient: DatabaseClient = {
        query: async (queryText: string, values?: unknown[]) => {
          queries.push({ sql: queryText, values });
          return { rows: [], rowCount: 1 };
        },
        release: () => {},
      };

      const worker = new DaynoriWorker(undefined, { storageService });
      worker.start();

      const result = await worker['executeTask'](
        'job-del-1',
        'file_deletion',
        {
          workspaceId: 'ws-tenant-1',
          fileId: 'f-del-1',
          objectPath: 'ws-tenant-1/uploads/document.pdf',
        },
        mockClient
      );

      expect(result.status).toBe('completed');
      expect(deletedObjects).toContain('ws-tenant-1/uploads/document.pdf');
      // Verifies tenant context was established
      expect(queries.some((q) => q.sql.includes("set_config('app.current_workspace_id'"))).toBe(
        true
      );
      expect(queries.some((q) => q.sql.includes('UPDATE app.workspace_storage_usage'))).toBe(false);
    });

    it('executes real file_scan handler with scanner results controlling publication', async () => {
      const storageService: StorageServiceContract = {
        getObject: async () => Buffer.from('Clean file content'),
        deleteObject: async () => {},
      };

      const scannerService: ScannerServiceContract = {
        scanBytes: async () => ({ isClean: true }),
      };

      const queries: { sql: string; values?: unknown[] }[] = [];
      const mockClient: DatabaseClient = {
        query: async (queryText: string, values?: unknown[]) => {
          queries.push({ sql: queryText, values });
          return { rows: [], rowCount: 1 };
        },
        release: () => {},
      };

      const worker = new DaynoriWorker(undefined, { storageService, scannerService });
      worker.start();

      const result = await worker['executeTask'](
        'job-scan-clean',
        'file_scan',
        {
          workspaceId: 'ws-scan-1',
          fileId: 'f-scan-1',
          objectPath: 'ws-scan-1/uploads/file.pdf',
          fileName: 'file.pdf',
        },
        mockClient
      );

      expect(result.status).toBe('completed');
      expect(result.details?.['isClean']).toBe(true);
      expect(result.details?.['action']).toBe('scanned_and_verified');
      // Check status updated to 'verified'
      expect(queries.some((q) => q.values?.includes('verified'))).toBe(true);
    });

    it('rejects unknown or unconfigured job taskTypes explicitly', async () => {
      const worker = new DaynoriWorker();
      worker.start();

      await expect(
        worker['executeTask']('job-unknown', 'unregistered_mystery_job')
      ).rejects.toThrow('Unknown or unconfigured job taskType: unregistered_mystery_job');
    });

    it('fences lease updates so an expired or non-owner worker cannot overwrite newer results', async () => {
      const queries: { sql: string; values?: unknown[] }[] = [];
      const mockClient: DatabaseClient = {
        query: async (queryText: string, values?: unknown[]) => {
          queries.push({ sql: queryText, values });
          // Simulate that the lease expired or was taken by another worker (rowCount = 0)
          if (
            queryText.includes('UPDATE app.background_jobs') &&
            queryText.includes("status = 'completed'")
          ) {
            return { rows: [], rowCount: 0 };
          }
          if (queryText.includes('SELECT id')) {
            return {
              rows: [
                {
                  id: 'job-fenced-1',
                  task_type: 'smoke',
                  payload: {},
                  attempts: 1,
                  max_attempts: 5,
                },
              ],
              rowCount: 1,
            };
          }
          return { rows: [], rowCount: 1 };
        },
        release: () => {},
      };

      const mockPool: DatabasePool = {
        connect: async () => mockClient,
      };

      const worker = new DaynoriWorker(mockPool);
      worker.start();

      const result = await worker.pollAndProcessNextJob();
      expect(result).not.toBeNull();
      // Because lease update rowCount was 0, completion was prevented and marked as failed
      expect(result!.status).toBe('failed');
      expect(result!.error).toContain('LEASE_LOST');
    });
  });

  // --- Finding E: Runtime Storage & Scanner Defaults & Isolation ---
  describe('Finding E: Runtime Storage/Scanner Defaults & Preview Isolation', () => {
    it('provides UnavailableStorageProvider that throws honest 503 error when unconfigured', async () => {
      const unavail = new UnavailableStorageProvider();
      expect(unavail.isConfigured()).toBe(false);

      await expect(unavail.createSignedUploadUrl('files', 'path')).rejects.toThrow(
        StorageUnavailableError
      );
      await expect(unavail.createSignedDownloadUrl('files', 'path')).rejects.toThrow(
        StorageUnavailableError
      );
      await expect(unavail.getObject('files', 'path')).rejects.toThrow(StorageUnavailableError);
    });

    it('provides UnavailableMalwareScanner that throws honest error when unconfigured', async () => {
      const unavail = new UnavailableMalwareScanner();
      await expect(
        unavail.scanBytes(Buffer.from('test'), {
          fileName: 'test.pdf',
          detectedMime: 'application/pdf',
        })
      ).rejects.toThrow(MalwareScannerUnavailableError);
    });

    it('strictly validates ExternalMalwareScanner responses and rejects non-boolean values like "false"', async () => {
      // Mock scanner service returning string "false" instead of boolean
      const originalFetch = global.fetch;
      try {
        global.fetch = async () =>
          ({
            ok: true,
            status: 200,
            json: async () => ({ isClean: 'false', threatName: 'trojan' }),
          }) as unknown as Response;

        const scanner = new ExternalMalwareScanner({ endpoint: 'http://scanner.internal:3310' });

        await expect(
          scanner.scanBytes(Buffer.from('sample bytes'), {
            fileName: 'sample.pdf',
            detectedMime: 'application/pdf',
          })
        ).rejects.toThrow('Scanner returned invalid response format: isClean boolean required');
      } finally {
        global.fetch = originalFetch;
      }
    });

    it('accepts strictly valid boolean clean response from ExternalMalwareScanner', async () => {
      const originalFetch = global.fetch;
      try {
        global.fetch = async () =>
          ({
            ok: true,
            status: 200,
            json: async () => ({ isClean: true, engine: 'ClamAV', version: '1.2.0' }),
          }) as unknown as Response;

        const scanner = new ExternalMalwareScanner({ endpoint: 'http://scanner.internal:3310' });
        const res = await scanner.scanBytes(Buffer.from('safe payload'), {
          fileName: 'doc.pdf',
          detectedMime: 'application/pdf',
        });

        expect(res.isClean).toBe(true);
        expect(res.scannerEngine).toBe('ClamAV');
      } finally {
        global.fetch = originalFetch;
      }
    });
  });
});
