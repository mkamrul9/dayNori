import crypto from 'node:crypto';

export interface DatabasePool {
  connect(): Promise<DatabaseClient>;
}

export interface DatabaseClient {
  query<R extends Record<string, unknown> = Record<string, unknown>>(
    queryText: string,
    values?: unknown[]
  ): Promise<{ rows: R[]; rowCount: number | null }>;
  release(): void;
}

export interface JobResult {
  jobId: string;
  status: 'completed' | 'failed';
  processedAt: string;
  error?: string;
  details?: Record<string, unknown>;
}

export interface JobContext {
  jobId: string;
  taskType: 'file_scan' | 'file_orphan_cleanup' | 'file_deletion' | 'smoke' | string;
  payload?: Record<string, unknown>;
  leaseTimeoutMs?: number;
}

export type JobTaskHandler = (
  jobId: string,
  payload?: Record<string, unknown>,
  client?: DatabaseClient
) => Promise<{ details?: Record<string, unknown> } | void>;

export interface StorageServiceContract {
  getObject(bucket: string, objectPath: string): Promise<Buffer | null>;
  deleteObject(bucket: string, objectPath: string): Promise<void>;
  headObject?(
    bucket: string,
    objectPath: string
  ): Promise<{ contentLength: number; contentType: string } | null>;
}

export interface ScannerServiceContract {
  scanBytes(
    bytes: Buffer,
    context: { fileName: string; detectedMime: string }
  ): Promise<{ isClean: boolean; threatName?: string }>;
}

export interface DaynoriWorkerOptions {
  storageService?: StorageServiceContract;
  scannerService?: ScannerServiceContract;
  defaultBucket?: string;
  workerId?: string;
}

export class DaynoriWorker {
  private isRunning: boolean = false;
  private workerId: string;
  private activeLeases = new Map<string, { expiresAt: number; taskType: string }>();
  private pollTimer: NodeJS.Timeout | null = null;
  private pool: DatabasePool | null = null;
  private taskHandlers = new Map<string, JobTaskHandler>();
  private storageService?: StorageServiceContract;
  private scannerService?: ScannerServiceContract;
  private defaultBucket: string = 'files';

  constructor(pool?: DatabasePool, options?: DaynoriWorkerOptions) {
    if (pool) {
      this.pool = pool;
    }
    this.workerId = options?.workerId || `worker-${crypto.randomBytes(4).toString('hex')}`;
    if (options?.storageService) {
      this.storageService = options.storageService;
    }
    if (options?.scannerService) {
      this.scannerService = options.scannerService;
    }
    if (options?.defaultBucket) {
      this.defaultBucket = options.defaultBucket;
    }
  }

  registerHandler(taskType: string, handler: JobTaskHandler): void {
    this.taskHandlers.set(taskType, handler);
  }

  setStorageService(storage: StorageServiceContract): void {
    this.storageService = storage;
  }

  setScannerService(scanner: ScannerServiceContract): void {
    this.scannerService = scanner;
  }

  start(pool?: DatabasePool, options?: { pollIntervalMs?: number }): void {
    this.isRunning = true;
    if (pool) {
      this.pool = pool;
    }
    if (this.pool && options?.pollIntervalMs) {
      this.startPolling(this.pool, options.pollIntervalMs);
    }
  }

  stop(): void {
    this.isRunning = false;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.activeLeases.clear();
  }

  getStatus(): { running: boolean; activeLeasesCount: number; workerId: string } {
    return {
      running: this.isRunning,
      activeLeasesCount: this.activeLeases.size,
      workerId: this.workerId,
    };
  }

  /**
   * Renews lease on a running job to prevent expiration during long tasks.
   */
  async renewLease(client: DatabaseClient, jobId: string, extensionSeconds = 30): Promise<boolean> {
    const res = await client.query(
      `
      UPDATE app.background_jobs
      SET leased_until = now() + ($1 || ' seconds')::interval,
          updated_at = now()
      WHERE id = $2 AND leased_by = $3 AND leased_until > now()
      `,
      [extensionSeconds, jobId, this.workerId]
    );
    return (res.rowCount ?? 0) > 0;
  }

  /**
   * Acquires a lease on a job to ensure only one worker processes it at a time.
   */
  acquireLease(jobId: string, taskType: string, leaseTimeoutMs = 30000): boolean {
    const now = Date.now();
    const existing = this.activeLeases.get(jobId);
    if (existing && existing.expiresAt > now) {
      return false; // Already leased
    }
    this.activeLeases.set(jobId, { expiresAt: now + leaseTimeoutMs, taskType });
    return true;
  }

  releaseLease(jobId: string): void {
    this.activeLeases.delete(jobId);
  }

  /**
   * Polls app.background_jobs using PostgreSQL FOR UPDATE SKIP LOCKED
   * for cross-process lease ownership, bounded retries, and crash recovery.
   */
  async pollAndProcessNextJob(pool?: DatabasePool): Promise<JobResult | null> {
    const activePool = pool ?? this.pool;
    if (!activePool || !this.isRunning) return null;

    const client = await activePool.connect();
    let jobId: string | null = null;
    let taskType = '';
    let payload: Record<string, unknown> = {};
    let attempts = 0;
    let maxAttempts = 5;

    try {
      await client.query('BEGIN');

      // Atomic lease acquisition with SKIP LOCKED and restart recovery
      const leaseRes = await client.query<{
        id: string;
        task_type: string;
        payload: Record<string, unknown>;
        attempts: number;
        max_attempts: number;
      }>(
        `
        UPDATE app.background_jobs
        SET status = 'running',
            leased_by = $1,
            leased_until = now() + interval '30 seconds',
            attempts = attempts + 1,
            updated_at = now()
        WHERE id = (
            SELECT id
            FROM app.background_jobs
            WHERE (
                status = 'pending' AND run_at <= now()
            ) OR (
                status = 'running' AND leased_until < now()
            )
            ORDER BY run_at ASC
            LIMIT 1
            FOR UPDATE SKIP LOCKED
        )
        RETURNING id, task_type, payload, attempts, max_attempts
        `,
        [this.workerId]
      );

      if (leaseRes.rowCount === 0) {
        await client.query('COMMIT');
        return null;
      }

      const row = leaseRes.rows[0]!;
      jobId = row.id;
      taskType = row.task_type;
      payload = row.payload ?? {};
      attempts = Number(row.attempts);
      maxAttempts = Number(row.max_attempts);

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      client.release();
      throw err;
    }

    if (!jobId) {
      client.release();
      return null;
    }

    // Execute job handler
    let result: JobResult;
    try {
      result = await this.executeTask(jobId, taskType, payload, client);

      // On completion: FENCE update by lease ownership and validity
      const compRes = await client.query(
        `
        UPDATE app.background_jobs
        SET status = 'completed',
            completed_at = now(),
            updated_at = now(),
            leased_by = NULL,
            leased_until = NULL
        WHERE id = $1 AND leased_by = $2 AND leased_until > now()
        `,
        [jobId, this.workerId]
      );

      if (compRes.rowCount === 0) {
        throw new Error(
          `LEASE_LOST: Lease for job ${jobId} expired or was overtaken by another worker`
        );
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const isDeadLetter = attempts >= maxAttempts;
      // Exponential backoff: 2 ^ attempts seconds
      const backoffSeconds = Math.min(300, Math.pow(2, attempts));

      await client.query(
        `
        UPDATE app.background_jobs
        SET status = $2,
            run_at = now() + ($3 || ' seconds')::interval,
            last_error = $4,
            leased_by = NULL,
            leased_until = NULL,
            updated_at = now()
        WHERE id = $1 AND leased_by = $5 AND leased_until > now()
        `,
        [jobId, isDeadLetter ? 'dead_letter' : 'pending', backoffSeconds, errorMsg, this.workerId]
      );

      result = {
        jobId,
        status: 'failed',
        error: errorMsg,
        processedAt: new Date().toISOString(),
      };
    } finally {
      client.release();
    }

    return result;
  }

  private startPolling(pool: DatabasePool, intervalMs: number): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = setInterval(async () => {
      if (!this.isRunning) return;
      try {
        await this.pollAndProcessNextJob(pool);
      } catch {
        // quiet polling error
      }
    }, intervalMs);
  }

  /**
   * Internal executor for real job handlers
   */
  private async executeTask(
    jobId: string,
    taskType: string,
    payload?: Record<string, unknown>,
    client?: DatabaseClient
  ): Promise<JobResult> {
    // 1. Establish tenant context if workspaceId is present in payload
    const workspaceId = payload?.workspaceId as string | undefined;
    if (workspaceId && client) {
      await client.query(`SELECT set_config('app.current_workspace_id', $1, true)`, [workspaceId]);
    }

    // 2. Custom registered task handler
    const customHandler = this.taskHandlers.get(taskType);
    if (customHandler) {
      const customRes = await customHandler(jobId, payload, client);
      return {
        jobId,
        status: 'completed',
        processedAt: new Date().toISOString(),
        details: customRes?.details ?? { taskType },
      };
    }

    // 3. Built-in: Orphan reservation cleanup
    if (taskType === 'file_orphan_cleanup') {
      let deletedStorageObjects = 0;
      let reconciledCount = 0;

      if (client) {
        // Query expired unreconciled reservations
        const expiredRes = await client.query<{
          id: string;
          workspace_id: string;
          declared_bytes: number;
          object_path: string;
          status: string;
        }>(
          `
          SELECT id, workspace_id, declared_bytes, object_path, status
          FROM app.upload_reservations
          WHERE expires_at < now() AND reconciled = false
          LIMIT 50
          FOR UPDATE SKIP LOCKED
          `
        );

        for (const row of expiredRes.rows) {
          // Set tenant context for this row's workspace
          await client.query(`SELECT set_config('app.current_workspace_id', $1, true)`, [
            row.workspace_id,
          ]);

          // Delete from storage if storageService is configured and object path exists
          if (this.storageService && row.object_path) {
            try {
              await this.storageService.deleteObject(this.defaultBucket, row.object_path);
              deletedStorageObjects++;
            } catch {
              /* ignore if object wasn't written to storage */
            }
          }

          // Reconcile quota: decrement reserved bytes
          const bytes = Number(row.declared_bytes) || 0;
          if (bytes > 0) {
            await client.query(
              `
              UPDATE app.workspace_storage_usage
              SET reserved_bytes = GREATEST(0, reserved_bytes - $1),
                  updated_at = now()
              WHERE workspace_id = $2
              `,
              [bytes, row.workspace_id]
            );
          }

          // Mark reservation expired and reconciled
          await client.query(
            `
            UPDATE app.upload_reservations
            SET status = 'expired',
                reconciled = true,
                updated_at = now()
            WHERE id = $1
            `,
            [row.id]
          );
          reconciledCount++;
        }
      }

      return {
        jobId,
        status: 'completed',
        processedAt: new Date().toISOString(),
        details: {
          action: 'reconciled_expired_reservations',
          reconciledCount,
          deletedStorageObjects,
        },
      };
    }

    // 4. Built-in: Physical file deletion and quota reconciliation
    if (taskType === 'file_deletion') {
      const objectPath = (payload?.objectPath || payload?.storagePath) as string | undefined;
      const fileId = payload?.fileId as string | undefined;
      const bucket = (payload?.bucket as string | undefined) || this.defaultBucket;

      // Delete from physical storage if storageService is configured
      if (this.storageService && objectPath) {
        await this.storageService.deleteObject(bucket, objectPath);
      }

      // Reconcile database and storage quota
      if (client && fileId) {
        const fileRes = await client.query<{ byte_size: number; workspace_id: string }>(
          `
          UPDATE app.files
          SET status = 'deleted',
              deleted_at = now(),
              updated_at = now()
          WHERE id = $1
          RETURNING byte_size, workspace_id
          `,
          [fileId]
        );

        if (fileRes.rowCount && fileRes.rowCount > 0) {
          const row = fileRes.rows[0]!;
          const byteSize = Number(row.byte_size) || 0;
          if (byteSize > 0) {
            await client.query(
              `
              UPDATE app.workspace_storage_usage
              SET stored_bytes = GREATEST(0, stored_bytes - $1),
                  updated_at = now()
              WHERE workspace_id = $2
              `,
              [byteSize, row.workspace_id]
            );
          }
        }
      }

      return {
        jobId,
        status: 'completed',
        processedAt: new Date().toISOString(),
        details: { fileId, objectPath, action: 'deleted_from_storage' },
      };
    }

    // 5. Built-in: Malware scan and publication control
    if (taskType === 'file_scan') {
      const reservationId = (payload?.reservationId || payload?.fileId) as string | undefined;
      if (!reservationId) {
        throw new Error('file_scan job requires reservationId in payload');
      }

      const fileId = payload?.fileId as string | undefined;
      const objectPath = (payload?.objectPath || payload?.storagePath) as string | undefined;
      const bucket = (payload?.bucket as string | undefined) || this.defaultBucket;
      const fileName = (payload?.fileName as string | undefined) || 'unnamed-file';
      const detectedMime =
        (payload?.detectedMime as string | undefined) ||
        (payload?.mimeType as string | undefined) ||
        'application/octet-stream';

      let isClean = true;
      let threatName: string | undefined;

      // Perform real malware scan if services and path are present
      if (this.scannerService && this.storageService && objectPath) {
        const bytes = await this.storageService.getObject(bucket, objectPath);
        if (bytes) {
          const scanResult = await this.scannerService.scanBytes(bytes, { fileName, detectedMime });
          isClean = scanResult.isClean === true;
          threatName = scanResult.threatName;
        }
      }

      const newStatus = isClean ? 'verified' : 'rejected';
      const rejectionReason = isClean ? null : threatName || 'Malware detected';

      if (client) {
        if (reservationId) {
          await client.query(
            `
            UPDATE app.upload_reservations
            SET status = $1,
                rejection_reason = $2,
                updated_at = now()
            WHERE id = $3
            `,
            [newStatus, rejectionReason, reservationId]
          );
        }
        if (fileId) {
          await client.query(
            `
            UPDATE app.files
            SET status = $1,
                quarantine_reason = $2,
                verified_at = CASE WHEN $1 = 'verified' THEN now() ELSE NULL END,
                updated_at = now()
            WHERE id = $3
            `,
            [newStatus, rejectionReason, fileId]
          );
        }
      }

      return {
        jobId,
        status: 'completed',
        processedAt: new Date().toISOString(),
        details: {
          reservationId,
          fileId,
          isClean,
          threatName,
          action: isClean ? 'scanned_and_verified' : 'scanned_and_rejected',
        },
      };
    }

    // 6. Built-in smoke / healthcheck / test job
    if (taskType === 'smoke' || taskType.startsWith('test:')) {
      return {
        jobId,
        status: 'completed',
        processedAt: new Date().toISOString(),
        details: { taskType },
      };
    }

    // 7. Unknown or unconfigured taskType must fail explicitly
    throw new Error(`Unknown or unconfigured job taskType: ${taskType}`);
  }

  /**
   * Process a job directly in-memory or by dispatch
   */
  async processJob(
    jobId: string,
    taskType: string,
    payload?: Record<string, unknown>
  ): Promise<JobResult> {
    if (!this.isRunning) {
      throw new Error('Cannot process jobs while worker is stopped');
    }

    const acquired = this.acquireLease(jobId, taskType);
    if (!acquired) {
      return {
        jobId,
        status: 'failed',
        error: `Could not acquire lease for job ${jobId}; already being processed`,
        processedAt: new Date().toISOString(),
      };
    }

    try {
      let client: DatabaseClient | undefined;
      if (this.pool) {
        client = await this.pool.connect();
      }

      try {
        return await this.executeTask(jobId, taskType, payload, client);
      } finally {
        if (client) client.release();
      }
    } catch (err) {
      return {
        jobId,
        status: 'failed',
        error: err instanceof Error ? err.message : String(err),
        processedAt: new Date().toISOString(),
      };
    } finally {
      this.releaseLease(jobId);
    }
  }
}
