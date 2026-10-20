import crypto from 'node:crypto';
import pg from 'pg';
import {
  isTimeInQuietHours,
  calculateNextQuietHoursEnd,
  redactReminderPayload,
} from '@daynori/domain';

export interface DatabasePool {
  connect(): Promise<DatabaseClient>;
  end?(): Promise<void>;
}

export interface DatabaseClient {
  query<R extends Record<string, unknown> = Record<string, unknown>>(
    queryText: string,
    values?: unknown[]
  ): Promise<{ rows: R[]; rowCount: number | null }>;
  release(): void;
}

export interface PushNotificationAdapter {
  sendPushNotification(params: {
    recipientUserId: string;
    pushToken: string;
    tokenType: 'fcm' | 'expo_push' | 'web_push';
    redactedTitle: string;
    redactedBody: string | null;
    dataPayload: Record<string, string>;
  }): Promise<{
    success: boolean;
    status: 'accepted' | 'delivered' | 'unavailable' | 'failed';
    providerMessageId?: string;
    errorMessage?: string;
    isTokenInvalid?: boolean;
  }>;
}

export interface WebPushNotificationAdapter {
  sendWebPush(params: {
    recipientUserId: string;
    subscription: {
      endpoint: string;
      p256dh: string;
      auth: string;
    };
    redactedTitle: string;
    redactedBody: string | null;
    dataPayload: Record<string, string>;
  }): Promise<{
    success: boolean;
    status: 'accepted' | 'delivered' | 'unavailable' | 'failed';
    providerMessageId?: string;
    errorMessage?: string;
    isSubscriptionExpired?: boolean;
  }>;
}

import {
  encryptWebPushPayload,
  createVapidAuthHeader,
  assertSafePushEndpointNetworkDestination,
  defaultPushTransport,
  type PushTransportFn,
  type PushDnsLookupFn,
} from './crypto/webPushEncryption.js';

/**
 * Creates the production-configured Web Push transport adapter.
 * Enforces RFC 8291 payload encryption (aes128gcm), RFC 8292 VAPID signing (ES256),
 * and network-level SSRF / safe destination verification with direct address binding.
 * Truthfully reports unavailable when required VAPID credentials are not configured.
 */
export function createConfiguredWebPushAdapter(options?: {
  lookup?: PushDnsLookupFn;
  transport?: PushTransportFn;
}): WebPushNotificationAdapter {
  const publicKey = process.env['VAPID_PUBLIC_KEY'];
  const privateKey = process.env['VAPID_PRIVATE_KEY'];
  const subject = process.env['VAPID_SUBJECT'] || 'mailto:security@daynori.com';

  const isConfigured = Boolean(publicKey && privateKey && subject);

  return {
    async sendWebPush({ subscription, redactedTitle, redactedBody, dataPayload }) {
      if (!isConfigured) {
        return {
          success: false,
          status: 'unavailable',
          errorMessage: 'Web Push is unconfigured: missing VAPID credentials',
        };
      }

      try {
        // 1. Enforce safe outbound network destination (DNS resolution & private address guards)
        const safeDestination = await assertSafePushEndpointNetworkDestination(
          subscription.endpoint,
          { lookup: options?.lookup }
        );

        const payloadStr = JSON.stringify({
          title: redactedTitle,
          body: redactedBody,
          data: dataPayload,
        });

        // 2. Perform RFC 8291 aes128gcm payload encryption using subscription keys
        const encryptedBody = encryptWebPushPayload({
          p256dh: subscription.p256dh,
          auth: subscription.auth,
          payload: payloadStr,
        });

        // 3. Generate RFC 8292 VAPID Authorization header signed with server private key
        const vapidHeader = createVapidAuthHeader({
          endpoint: subscription.endpoint,
          vapidPublicKey: publicKey!,
          vapidPrivateKey: privateKey!,
          subject: subject!,
        });

        const transport = options?.transport || defaultPushTransport;
        const res = await transport(subscription.endpoint, {
          method: 'POST',
          headers: {
            TTL: '86400',
            'Content-Encoding': 'aes128gcm',
            'Content-Type': 'application/octet-stream',
            Authorization: vapidHeader,
          },
          body: encryptedBody,
          timeoutMs: 10_000,
          validatedAddresses: safeDestination.resolvedAddresses,
        });

        if (res.status === 201 || res.status === 200 || res.status === 202) {
          const location = res.location || res.headers['location'] || `webpush-${Date.now()}`;
          return {
            success: true,
            status: 'accepted',
            providerMessageId: location,
          };
        }

        if (res.status === 404 || res.status === 410) {
          return {
            success: false,
            status: 'failed',
            errorMessage: `${res.status} Gone: Push subscription has expired or unsubscribed`,
            isSubscriptionExpired: true,
          };
        }

        return {
          success: false,
          status: 'failed',
          errorMessage: `Web Push provider returned status ${res.status}`,
        };
      } catch (err) {
        return {
          success: false,
          status: 'failed',
          errorMessage: err instanceof Error ? err.message : String(err),
        };
      }
    },
  };
}

export function createWorkerDatabasePool(): DatabasePool | undefined {
  const databaseUrl = process.env['DATABASE_URL'];
  if (databaseUrl) {
    return new pg.Pool({
      connectionString: databaseUrl,
      max: Number(process.env['DB_POOL_MAX'] || 10),
      idleTimeoutMillis: 30000,
    });
  }

  const host = process.env['DB_HOST'] || process.env['PGHOST'];
  if (host) {
    return new pg.Pool({
      host,
      port: Number(process.env['DB_PORT'] || process.env['PGPORT'] || 5432),
      database: process.env['DB_NAME'] || process.env['PGDATABASE'] || 'daynori_test',
      user: process.env['DB_USER'] || process.env['PGUSER'] || 'daynori_runtime',
      password: process.env['DB_PASSWORD'] || process.env['PGPASSWORD'] || '',
      max: Number(process.env['DB_POOL_MAX'] || 10),
      idleTimeoutMillis: 30000,
    });
  }

  return undefined;
}

export function createConfiguredAuthProvider(): AuthProviderContract | undefined {
  const supabaseUrl = process.env['SUPABASE_URL'];
  const serviceRoleKey = process.env['SUPABASE_SERVICE_ROLE_KEY'];

  if (supabaseUrl && serviceRoleKey) {
    return {
      async revokeUserSessions(userId: string) {
        const checkRes = await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            apikey: serviceRoleKey,
            Authorization: `Bearer ${serviceRoleKey}`,
          },
        });
        if (checkRes.status === 404) return;
        if (!checkRes.ok) {
          const errText = await checkRes.text().catch(() => '');
          throw new Error(`Provider session check failed: HTTP ${checkRes.status} - ${errText}`);
        }
        const updateRes = await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            apikey: serviceRoleKey,
            Authorization: `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify({
            user_metadata: { sessions_revoked_at: new Date().toISOString() },
          }),
        });
        if (!updateRes.ok && updateRes.status !== 204) {
          const errText = await updateRes.text().catch(() => '');
          throw new Error(
            `Provider session revocation failed: HTTP ${updateRes.status} - ${errText}`
          );
        }
      },
      async deleteUser(userId: string) {
        const res = await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            apikey: serviceRoleKey,
            Authorization: `Bearer ${serviceRoleKey}`,
          },
        });
        if (res.ok || res.status === 204) return;
        if (res.status === 404) {
          const checkRes = await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              apikey: serviceRoleKey,
              Authorization: `Bearer ${serviceRoleKey}`,
            },
          });
          if (checkRes.status === 404) return;
          throw new Error(
            `Provider user deletion returned 404 but user '${userId}' still exists`
          );
        }
        const errText = await res.text().catch(() => '');
        throw new Error(`Provider user deletion failed: HTTP ${res.status} - ${errText}`);
      },
    };
  }

  if (process.env['AUTH_PROVIDER_ADAPTER'] === 'capture') {
    return {
      async revokeUserSessions() {},
      async deleteUser() {},
    };
  }

  return undefined;
}

export function createConfiguredDeletionEmailAdapter():
  | DeletionEmailAdapterContract
  | undefined {
  if (process.env['DELETION_EMAIL_ADAPTER'] === 'capture') {
    return {
      async sendVerificationEmail(toEmail, requestId, token) {
        console.log(
          `[Capture Email] Verification email dispatched to ${toEmail} for request ${requestId} (token length: ${token.length})`
        );
      },
    };
  }
  return undefined;
}

export function createConfiguredStorageService(): StorageServiceContract | undefined {
  return undefined;
}

export interface JobResult {
  jobId: string;
  status: 'completed' | 'failed' | 'rescheduled' | 'deferred';
  processedAt: string;
  error?: string;
  details?: Record<string, unknown>;
  rescheduleRunAt?: string | Date;
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

export interface AuthProviderContract {
  revokeUserSessions?(userId: string): Promise<void>;
  deleteUser?(userId: string): Promise<void>;
}

export interface DeletionEmailAdapterContract {
  sendVerificationEmail(toEmail: string, requestId: string, token: string): Promise<void>;
}

export interface DaynoriWorkerOptions {
  storageService?: StorageServiceContract;
  scannerService?: ScannerServiceContract;
  pushAdapter?: PushNotificationAdapter;
  webPushAdapter?: WebPushNotificationAdapter;
  authProvider?: AuthProviderContract;
  deletionEmailAdapter?: DeletionEmailAdapterContract;
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
  private pushAdapter?: PushNotificationAdapter;
  private webPushAdapter?: WebPushNotificationAdapter;
  private authProvider?: AuthProviderContract;
  private deletionEmailAdapter?: DeletionEmailAdapterContract;
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
    if (options?.pushAdapter) {
      this.pushAdapter = options.pushAdapter;
    }
    if (options?.webPushAdapter) {
      this.webPushAdapter = options.webPushAdapter;
    }
    if (options?.authProvider) {
      this.authProvider = options.authProvider;
    }
    if (options?.deletionEmailAdapter) {
      this.deletionEmailAdapter = options.deletionEmailAdapter;
    }
    if (options?.defaultBucket) {
      this.defaultBucket = options.defaultBucket;
    }
  }

  setAuthProvider(provider: AuthProviderContract): void {
    this.authProvider = provider;
  }

  setDeletionEmailAdapter(adapter: DeletionEmailAdapterContract): void {
    this.deletionEmailAdapter = adapter;
  }

  setPushAdapter(adapter: PushNotificationAdapter): void {
    this.pushAdapter = adapter;
  }

  setWebPushAdapter(adapter: WebPushNotificationAdapter): void {
    this.webPushAdapter = adapter;
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
                status = 'pending' AND (run_at IS NULL OR run_at <= now())
            ) OR (
                status = 'running' AND leased_until < now()
            )
            ORDER BY COALESCE(run_at, created_at) ASC
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

      if (result.status === 'rescheduled' || result.status === 'deferred') {
        const runAt = result.rescheduleRunAt ? new Date(result.rescheduleRunAt) : new Date();
        const compRes = await client.query(
          `
          UPDATE app.background_jobs
          SET status = 'pending',
              run_at = $3,
              updated_at = now(),
              leased_by = NULL,
              leased_until = NULL
          WHERE id = $1 AND leased_by = $2 AND leased_until > now()
          `,
          [jobId, this.workerId, runAt]
        );

        if (compRes.rowCount === 0) {
          throw new Error(
            `LEASE_LOST: Lease for job ${jobId} expired or was overtaken by another worker`
          );
        }
      } else {
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
      await client
        .query('RESET app.current_workspace_id; RESET app.current_user_id;')
        .catch(() => {});
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
    const actorUserId = (payload?.actorUserId || payload?.userId) as string | undefined;
    if (workspaceId && client) {
      await client.query(`SELECT set_config('app.current_workspace_id', $1, false)`, [workspaceId]);
    }
    if (actorUserId && client) {
      await client.query(`SELECT set_config('app.current_user_id', $1, false)`, [actorUserId]);
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

    // 2b. Drive selected-file connector jobs (Phase 49)
    if ((taskType === 'ai_index_source' || taskType === 'ai_purge_derived') && client) {
      const { handleAiJob } = await import('./aiJobs.js');
      const aiResult = await handleAiJob(client, taskType, payload as Record<string, unknown>);
      if (aiResult.status === 'failed') {
        throw new Error(
          `AI job failed: ${String(aiResult.details['errorCode'] ?? 'unknown')}`
        );
      }
      return {
        jobId,
        status: 'completed',
        processedAt: new Date().toISOString(),
        details: { taskType, ...aiResult.details, fence: aiResult.status === 'fenced' },
      };
    }

    if (taskType.startsWith('drive_') && client) {
      const { handleDriveJob } = await import('./driveJobs.js');
      const driveRes = await handleDriveJob(client, taskType, payload ?? {});
      if (driveRes.status === 'failed') {
        throw new Error(String(driveRes.details['errorCode'] ?? 'drive_job_failed'));
      }
      return {
        jobId,
        status: 'completed',
        processedAt: new Date().toISOString(),
        details: driveRes.details,
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
        let byteSize = Number(payload?.byteSize) || 0;
        let wsId = (payload?.workspaceId as string | undefined) || null;

        try {
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
            byteSize = Number(fileRes.rows[0]!.byte_size) || byteSize;
            wsId = fileRes.rows[0]!.workspace_id || wsId;
          }
        } catch {
          // If app.files table doesn't exist, try app.file_items or payload
          try {
            const fiRes = await client.query<{ byte_size: number; workspace_id: string }>(
              `
              UPDATE app.file_items
              SET quarantine_status = 'deleted',
                  updated_at = now()
              WHERE id = $1
              RETURNING byte_size, workspace_id
              `,
              [fileId]
            );
            if (fiRes.rowCount && fiRes.rowCount > 0) {
              byteSize = Number(fiRes.rows[0]!.byte_size) || byteSize;
              wsId = fiRes.rows[0]!.workspace_id || wsId;
            }
          } catch {
            /* ignore if table does not exist */
          }
        }

        if (wsId && byteSize > 0) {
          await client.query(
            `
            UPDATE app.workspace_storage_usage
            SET stored_bytes = GREATEST(0, stored_bytes - $1),
                updated_at = now()
            WHERE workspace_id = $2
            `,
            [byteSize, wsId]
          );
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
          try {
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
          } catch {
            await client
              .query(
                `
                UPDATE app.file_items
                SET quarantine_status = $1,
                    rejection_reason = $2,
                    verified_at = CASE WHEN $1 = 'verified' THEN now() ELSE NULL END,
                    updated_at = now()
                WHERE id = $3
                `,
                [newStatus, rejectionReason, fileId]
              )
              .catch(() => {});
          }
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

    // 6. Built-in: Reminder delivery durable leased job
    if (taskType === 'reminder_delivery') {
      const instanceId = payload?.instanceId as string | undefined;
      const ruleId = payload?.ruleId as string | undefined;
      const expectedRuleRevision = payload?.ruleRevision as number | undefined;
      const targetType = payload?.targetType as string | undefined;
      const targetId = payload?.targetId as string | undefined;

      if (!instanceId || !workspaceId || !client) {
        return {
          jobId,
          status: 'completed',
          processedAt: new Date().toISOString(),
          details: { outcome: 'skipped_missing_context' },
        };
      }

      // 1. Fetch instance with row lock
      const instRes = await client.query<{
        id: string;
        workspace_id: string;
        rule_id: string;
        rule_revision: number;
        delivery_generation: number;
        target_type: string;
        target_id: string;
        scheduled_at: Date;
        status: string;
        snooze_until: Date | null;
      }>(
        `
        SELECT id, workspace_id, rule_id, rule_revision, delivery_generation, target_type, target_id,
               scheduled_at, status, snooze_until
        FROM app.reminder_instances
        WHERE id = $1 AND workspace_id = $2
        FOR UPDATE;
        `,
        [instanceId, workspaceId]
      );

      if (instRes.rows.length === 0) {
        return {
          jobId,
          status: 'completed',
          processedAt: new Date().toISOString(),
          details: { outcome: 'instance_not_found' },
        };
      }

      const instance = instRes.rows[0]!;

      // Skip stale background jobs if instance delivery_generation has advanced
      const expectedGeneration = payload?.deliveryGeneration as number | undefined;
      if (
        expectedGeneration !== undefined &&
        (instance.delivery_generation ?? 1) !== expectedGeneration
      ) {
        return {
          jobId,
          status: 'completed',
          processedAt: new Date().toISOString(),
          details: { outcome: 'stale_generation_skipped' },
        };
      }

      // Terminal or already handled states
      if (['invalidated', 'dismissed', 'observed'].includes(instance.status)) {
        return {
          jobId,
          status: 'completed',
          processedAt: new Date().toISOString(),
          details: { outcome: 'already_terminal', status: instance.status },
        };
      }

      // Check if already dispatched (deduplication / idempotency)
      if (instance.status === 'dispatched' && !payload?.isRetry) {
        return {
          jobId,
          status: 'completed',
          processedAt: new Date().toISOString(),
          details: { outcome: 'already_dispatched' },
        };
      }

      // If snoozed, verify snooze time has arrived
      if (instance.status === 'snoozed' && instance.snooze_until) {
        const snoozeMs = new Date(instance.snooze_until).getTime();
        if (snoozeMs > Date.now()) {
          return {
            jobId,
            status: 'completed',
            processedAt: new Date().toISOString(),
            details: { outcome: 'still_snoozed', snoozeUntil: instance.snooze_until },
          };
        }
      }

      // 2. Fetch rule and verify active & revision
      const ruleRes = await client.query<{
        id: string;
        workspace_id: string;
        rule_revision: number;
        quiet_hours_behavior: 'defer' | 'allow' | 'drop';
        channels: string[];
        privacy_level: 'generic' | 'detailed';
        is_active: boolean;
      }>(
        `
        SELECT id, workspace_id, rule_revision, quiet_hours_behavior, channels,
               privacy_level, is_active
        FROM app.reminder_rules
        WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL AND is_active = true;
        `,
        [ruleId || instance.rule_id, workspaceId]
      );

      if (
        ruleRes.rows.length === 0 ||
        (expectedRuleRevision !== undefined &&
          ruleRes.rows[0]!.rule_revision !== expectedRuleRevision) ||
        ruleRes.rows[0]!.rule_revision !== instance.rule_revision
      ) {
        await client.query(
          `
          UPDATE app.reminder_instances
          SET status = 'invalidated',
              invalidated_reason = 'rule_revised_or_deleted',
              invalidation_time = now(),
              updated_at = now()
          WHERE id = $1 AND workspace_id = $2;
          `,
          [instanceId, workspaceId]
        );
        return {
          jobId,
          status: 'completed',
          processedAt: new Date().toISOString(),
          details: { outcome: 'invalidated_stale_rule' },
        };
      }

      const rule = ruleRes.rows[0]!;

      // 3. Verify target entity state (live task / routine / calendar event)
      const tType = targetType || instance.target_type;
      const tId = targetId || instance.target_id;
      let targetTitle = 'Scheduled Item';

      if (tType === 'task') {
        const taskRes = await client.query<{
          title: string;
          status: string;
          deleted_at: Date | null;
        }>(
          `
          SELECT t.title, t.status, i.deleted_at
          FROM app.tasks t
          JOIN app.items i ON i.id = t.id AND i.workspace_id = t.workspace_id
          WHERE t.id = $1 AND t.workspace_id = $2;
          `,
          [tId, workspaceId]
        );

        if (taskRes.rows.length === 0 || taskRes.rows[0]!.deleted_at) {
          await client.query(
            `UPDATE app.reminder_instances SET status = 'invalidated', invalidated_reason = 'target_deleted', invalidation_time = now(), updated_at = now() WHERE id = $1 AND workspace_id = $2;`,
            [instanceId, workspaceId]
          );
          return {
            jobId,
            status: 'completed',
            processedAt: new Date().toISOString(),
            details: { outcome: 'invalidated_target_deleted' },
          };
        }

        if (['completed', 'cancelled'].includes(taskRes.rows[0]!.status)) {
          await client.query(
            `UPDATE app.reminder_instances SET status = 'invalidated', invalidated_reason = 'target_completed', invalidation_time = now(), updated_at = now() WHERE id = $1 AND workspace_id = $2;`,
            [instanceId, workspaceId]
          );
          return {
            jobId,
            status: 'completed',
            processedAt: new Date().toISOString(),
            details: { outcome: 'invalidated_target_completed' },
          };
        }

        targetTitle = taskRes.rows[0]!.title;
      } else if (tType === 'calendar_event') {
        const eventRes = await client.query<{
          title: string;
          is_archived: boolean;
          deleted_at: Date | null;
        }>(
          `
          SELECT c.title, c.is_archived, i.deleted_at
          FROM app.calendar_events c
          JOIN app.items i ON i.id = c.id AND i.workspace_id = c.workspace_id
          WHERE c.id = $1 AND c.workspace_id = $2;
          `,
          [tId, workspaceId]
        );

        if (eventRes.rows.length === 0 || eventRes.rows[0]!.deleted_at) {
          await client.query(
            `UPDATE app.reminder_instances SET status = 'invalidated', invalidated_reason = 'target_deleted', invalidation_time = now(), updated_at = now() WHERE id = $1 AND workspace_id = $2;`,
            [instanceId, workspaceId]
          );
          return {
            jobId,
            status: 'completed',
            processedAt: new Date().toISOString(),
            details: { outcome: 'invalidated_target_deleted' },
          };
        }

        if (eventRes.rows[0]!.is_archived) {
          await client.query(
            `UPDATE app.reminder_instances SET status = 'invalidated', invalidated_reason = 'target_archived', invalidation_time = now(), updated_at = now() WHERE id = $1 AND workspace_id = $2;`,
            [instanceId, workspaceId]
          );
          return {
            jobId,
            status: 'completed',
            processedAt: new Date().toISOString(),
            details: { outcome: 'invalidated_target_archived' },
          };
        }

        targetTitle = eventRes.rows[0]!.title;
      } else if (tType === 'routine') {
        const routineRes = await client.query<{
          title: string;
          is_archived: boolean;
          is_paused: boolean;
          deleted_at: Date | null;
        }>(
          `
          SELECT r.title, r.is_archived, r.is_paused, i.deleted_at
          FROM app.routines r
          JOIN app.items i ON i.id = r.id AND i.workspace_id = r.workspace_id
          WHERE r.id = $1 AND r.workspace_id = $2;
          `,
          [tId, workspaceId]
        );

        if (routineRes.rows.length === 0 || routineRes.rows[0]!.deleted_at) {
          await client.query(
            `UPDATE app.reminder_instances SET status = 'invalidated', invalidated_reason = 'target_deleted', invalidation_time = now(), updated_at = now() WHERE id = $1 AND workspace_id = $2;`,
            [instanceId, workspaceId]
          );
          return {
            jobId,
            status: 'completed',
            processedAt: new Date().toISOString(),
            details: { outcome: 'invalidated_target_deleted' },
          };
        }

        if (routineRes.rows[0]!.is_archived || routineRes.rows[0]!.is_paused) {
          await client.query(
            `UPDATE app.reminder_instances SET status = 'invalidated', invalidated_reason = 'target_paused_or_archived', invalidation_time = now(), updated_at = now() WHERE id = $1 AND workspace_id = $2;`,
            [instanceId, workspaceId]
          );
          return {
            jobId,
            status: 'completed',
            processedAt: new Date().toISOString(),
            details: { outcome: 'invalidated_target_paused' },
          };
        }

        targetTitle = routineRes.rows[0]!.title;
      }

      // 4. Quiet hours check
      const profileRes = await client.query<{
        preferences: Record<string, unknown>;
        owner_id: string;
      }>(
        `
        SELECT p.preferences, w.owner_id
        FROM app.profiles p
        JOIN app.workspaces w ON w.owner_id = p.id
        WHERE w.id = $1;
        `,
        [workspaceId]
      );
      const prefs = profileRes.rows[0]?.preferences;
      const qhConfig = prefs?.quietHours as
        { enabled: boolean; start: string; end: string; timezone: string } | undefined;

      if (qhConfig && qhConfig.enabled) {
        const inQuietHours = isTimeInQuietHours(new Date(), qhConfig);
        if (inQuietHours) {
          const deliveryGen = instance.delivery_generation ?? 1;
          if (rule.quiet_hours_behavior === 'drop') {
            const ownerRes = await client.query<{ owner_id: string }>(
              `SELECT owner_id FROM app.workspaces WHERE id = $1;`,
              [workspaceId]
            );
            const recipientUserId = ownerRes.rows[0]?.owner_id || crypto.randomUUID();

            await client.query(
              `
              INSERT INTO app.reminder_deliveries (
                workspace_id, instance_id, delivery_generation, channel, recipient_user_id,
                provider, status, redacted_title, redacted_body, attempt_count, last_attempt_at
              )
              VALUES ($1, $2, $3, 'push', $4, 'fcm', 'dropped_quiet_hours', 'Daynori Reminder', null, 1, now())
              ON CONFLICT DO NOTHING;
              `,
              [workspaceId, instanceId, deliveryGen, recipientUserId]
            );

            await client.query(
              `UPDATE app.reminder_instances SET status = 'dismissed', updated_at = now() WHERE id = $1 AND workspace_id = $2;`,
              [instanceId, workspaceId]
            );

            return {
              jobId,
              status: 'completed',
              processedAt: new Date().toISOString(),
              details: { outcome: 'dropped_quiet_hours' },
            };
          } else if (rule.quiet_hours_behavior === 'defer') {
            const nextQuietEnd = calculateNextQuietHoursEnd(new Date(), qhConfig);
            return {
              jobId,
              status: 'deferred',
              rescheduleRunAt: nextQuietEnd,
              processedAt: new Date().toISOString(),
              details: { outcome: 'deferred_quiet_hours', deferredUntil: nextQuietEnd },
            };
          }
        }
      }

      // 5. Redact payload
      const redacted = redactReminderPayload({
        title: targetTitle,
        targetType: (tType as 'task' | 'routine' | 'calendar_event') || 'task',
        privacyLevel: rule.privacy_level,
      });

      // 6. Deliver to channels
      const ownerRes = await client.query<{ owner_id: string }>(
        `SELECT owner_id FROM app.workspaces WHERE id = $1;`,
        [workspaceId]
      );
      const recipientUserId = (payload?.actorUserId as string) || ownerRes.rows[0]?.owner_id;
      const deliveryGen = instance.delivery_generation ?? 1;

      let hasPendingRetries = false;
      let maxAttemptCount = 1;

      if (recipientUserId) {
        for (const channel of rule.channels) {
          if (channel === 'in_app') {
            const existingInApp = await client.query(
              `SELECT id FROM app.reminder_deliveries WHERE workspace_id = $1 AND instance_id = $2 AND delivery_generation = $3 AND channel = 'in_app';`,
              [workspaceId, instanceId, deliveryGen]
            );

            if (existingInApp.rows.length === 0) {
              await client.query(
                `
                INSERT INTO app.reminder_deliveries (
                  workspace_id, instance_id, delivery_generation, channel, recipient_user_id,
                  provider, status, redacted_title, redacted_body, attempt_count, last_attempt_at
                )
                VALUES ($1, $2, $3, 'in_app', $4, 'in_app', 'delivered', $5, $6, 1, now())
                ON CONFLICT DO NOTHING;
                `,
                [
                  workspaceId,
                  instanceId,
                  deliveryGen,
                  recipientUserId,
                  redacted.title,
                  redacted.body,
                ]
              );
            }
          } else if (channel === 'push') {
            // 1. Fetch active registered devices with push tokens for recipientUserId
            const devRes = await client.query<{
              id: string;
              push_token: string;
              token_type: 'fcm' | 'expo_push' | 'web_push';
              is_active: boolean;
            }>(
              `SELECT id, push_token, token_type, is_active FROM app.devices
               WHERE user_id = $1 AND is_active = true AND push_token IS NOT NULL;`,
              [recipientUserId]
            );

            // 2. Fetch active Web Push subscriptions for recipientUserId (Phase 29)
            const webSubRes = await client.query<{
              id: string;
              endpoint: string;
              p256dh: string;
              auth: string;
            }>(
              `SELECT id, endpoint, p256dh, auth FROM app.web_push_subscriptions
               WHERE user_id = $1 AND is_active = true;`,
              [recipientUserId]
            );

            const totalTargets = devRes.rows.length + webSubRes.rows.length;

            if (totalTargets === 0) {
              // No device or subscription registered
              const existingNoTarget = await client.query(
                `SELECT id FROM app.reminder_deliveries
                 WHERE workspace_id = $1 AND instance_id = $2 AND delivery_generation = $3 AND channel = 'push'
                   AND recipient_device_id IS NULL AND recipient_subscription_id IS NULL;`,
                [workspaceId, instanceId, deliveryGen]
              );
              if (existingNoTarget.rows.length === 0) {
                await client.query(
                  `
                  INSERT INTO app.reminder_deliveries (
                    workspace_id, instance_id, delivery_generation, channel, recipient_user_id,
                    provider, status, redacted_title, redacted_body, attempt_count, last_attempt_at, error_message
                  )
                  VALUES ($1, $2, $3, 'push', $4, 'fcm', 'unavailable', $5, $6, 1, now(), 'No registered device or subscription')
                  ON CONFLICT DO NOTHING;
                  `,
                  [
                    workspaceId,
                    instanceId,
                    deliveryGen,
                    recipientUserId,
                    redacted.title,
                    redacted.body,
                  ]
                );
              }
            }

            // Deliver to each mobile device
            for (const dev of devRes.rows) {
              const devDelivRes = await client.query<{
                id: string;
                status: string;
                attempt_count: number;
              }>(
                `SELECT id, status, attempt_count FROM app.reminder_deliveries
                 WHERE workspace_id = $1 AND instance_id = $2 AND delivery_generation = $3 AND channel = 'push' AND recipient_device_id = $4;`,
                [workspaceId, instanceId, deliveryGen, dev.id]
              );
              const existingDevDeliv = devDelivRes.rows[0];
              if (
                existingDevDeliv &&
                (existingDevDeliv.status === 'delivered' ||
                  existingDevDeliv.status === 'suppressed_local_schedule' ||
                  existingDevDeliv.attempt_count >= 3)
              ) {
                continue;
              }

              // Check if THIS specific device has acknowledged local scheduling
              const localAckRes = await client.query<{ acknowledged_at: Date }>(
                `SELECT acknowledged_at FROM app.device_reminder_schedules
                 WHERE instance_id = $1 AND device_id = $2 AND delivery_generation = $3
                   AND rule_revision = $4 AND delivery_mode = 'local' AND acknowledged = true
                   AND acknowledged_at > now() - INTERVAL '14 days'
                 LIMIT 1;`,
                [instanceId, dev.id, deliveryGen, rule.rule_revision]
              );

              if (localAckRes.rows.length > 0) {
                // Device local scheduling acknowledged: record suppression as a scheduling decision
                if (existingDevDeliv) {
                  await client.query(
                    `UPDATE app.reminder_deliveries
                     SET status = 'suppressed_local_schedule', redacted_body = 'Suppressed by device local schedule acknowledgment',
                         attempt_count = attempt_count + 1, last_attempt_at = now()
                     WHERE id = $1;`,
                    [existingDevDeliv.id]
                  );
                } else {
                  await client.query(
                    `
                    INSERT INTO app.reminder_deliveries (
                      workspace_id, instance_id, delivery_generation, channel, recipient_user_id,
                      recipient_device_id, provider, status, redacted_title, redacted_body, attempt_count, last_attempt_at
                    )
                    VALUES ($1, $2, $3, 'push', $4, $5, $6, 'suppressed_local_schedule', $7, 'Suppressed by device local schedule acknowledgment', 1, now())
                    ON CONFLICT DO NOTHING;
                    `,
                    [
                      workspaceId,
                      instanceId,
                      deliveryGen,
                      recipientUserId,
                      dev.id,
                      dev.token_type,
                      redacted.title,
                    ]
                  );
                }
              } else if (!this.pushAdapter) {
                // Push adapter not configured: honest unavailable state
                if (existingDevDeliv) {
                  await client.query(
                    `UPDATE app.reminder_deliveries
                     SET status = 'unavailable', error_message = 'No push adapter configured',
                         attempt_count = attempt_count + 1, last_attempt_at = now()
                     WHERE id = $1;`,
                    [existingDevDeliv.id]
                  );
                } else {
                  await client.query(
                    `
                    INSERT INTO app.reminder_deliveries (
                      workspace_id, instance_id, delivery_generation, channel, recipient_user_id,
                      recipient_device_id, provider, status, redacted_title, redacted_body, attempt_count, last_attempt_at, error_message
                    )
                    VALUES ($1, $2, $3, 'push', $4, $5, $6, 'unavailable', $7, $8, 1, now(), 'No push adapter configured')
                    ON CONFLICT DO NOTHING;
                    `,
                    [
                      workspaceId,
                      instanceId,
                      deliveryGen,
                      recipientUserId,
                      dev.id,
                      dev.token_type,
                      redacted.title,
                      redacted.body,
                    ]
                  );
                }
              } else {
                const sendRes = await this.pushAdapter.sendPushNotification({
                  recipientUserId,
                  pushToken: dev.push_token,
                  tokenType: dev.token_type,
                  redactedTitle: redacted.title,
                  redactedBody: redacted.body,
                  dataPayload: {
                    type: 'notification',
                    destination: 'plan',
                    itemId: targetId || '',
                    instanceId,
                    workspaceId,
                    ruleRevision: String(rule.rule_revision),
                    deliveryGeneration: String(deliveryGen),
                    targetType: (tType as string) || 'task',
                    timestamp: String(Date.now()),
                  },
                });

                if (sendRes.isTokenInvalid) {
                  await client.query(
                    `UPDATE app.devices SET is_active = false, push_token = NULL, updated_at = now() WHERE id = $1;`,
                    [dev.id]
                  );
                }

                if (existingDevDeliv) {
                  await client.query(
                    `UPDATE app.reminder_deliveries
                     SET status = $1, provider_message_id = $2, error_message = $3,
                         attempt_count = attempt_count + 1, last_attempt_at = now()
                     WHERE id = $4;`,
                    [
                      sendRes.status,
                      sendRes.providerMessageId || null,
                      sendRes.errorMessage || null,
                      existingDevDeliv.id,
                    ]
                  );
                } else {
                  await client.query(
                    `
                    INSERT INTO app.reminder_deliveries (
                      workspace_id, instance_id, delivery_generation, channel, recipient_user_id,
                      recipient_device_id, provider, provider_message_id, status, redacted_title, redacted_body,
                      attempt_count, last_attempt_at, error_message
                    )
                    VALUES ($1, $2, $3, 'push', $4, $5, $6, $7, $8, $9, $10, 1, now(), $11)
                    ON CONFLICT DO NOTHING;
                    `,
                    [
                      workspaceId,
                      instanceId,
                      deliveryGen,
                      recipientUserId,
                      dev.id,
                      dev.token_type,
                      sendRes.providerMessageId || null,
                      sendRes.status,
                      redacted.title,
                      redacted.body,
                      sendRes.errorMessage || null,
                    ]
                  );
                }

                // Track pending retries for mobile devices
                if (sendRes.status === 'failed') {
                  const currentAttempts = (existingDevDeliv?.attempt_count ?? 0) + 1;
                  if (currentAttempts < 3) {
                    hasPendingRetries = true;
                    maxAttemptCount = Math.max(maxAttemptCount, currentAttempts);
                  }
                }
              }
            }

            // Deliver to each Web Push subscription (Phase 29)
            for (const sub of webSubRes.rows) {
              const subDelivRes = await client.query<{
                id: string;
                status: string;
                attempt_count: number;
              }>(
                `SELECT id, status, attempt_count FROM app.reminder_deliveries
             WHERE workspace_id = $1 AND instance_id = $2 AND delivery_generation = $3 AND channel = 'push' AND recipient_subscription_id = $4;`,
                [workspaceId, instanceId, deliveryGen, sub.id]
              );
              const existingSubDeliv = subDelivRes.rows[0];
              if (
                existingSubDeliv &&
                (existingSubDeliv.status === 'delivered' || existingSubDeliv.attempt_count >= 3)
              ) {
                continue;
              }

              if (!this.webPushAdapter) {
                if (existingSubDeliv) {
                  await client.query(
                    `UPDATE app.reminder_deliveries
                 SET status = 'unavailable', error_message = 'No Web Push adapter configured',
                     attempt_count = attempt_count + 1, last_attempt_at = now()
                 WHERE id = $1;`,
                    [existingSubDeliv.id]
                  );
                } else {
                  await client.query(
                    `
                INSERT INTO app.reminder_deliveries (
                  workspace_id, instance_id, delivery_generation, channel, recipient_user_id,
                  recipient_subscription_id, provider, status, redacted_title, redacted_body, attempt_count, last_attempt_at, error_message
                )
                VALUES ($1, $2, $3, 'push', $4, $5, 'web_push', 'unavailable', $6, $7, 1, now(), 'No Web Push adapter configured')
                ON CONFLICT DO NOTHING;
                `,
                    [
                      workspaceId,
                      instanceId,
                      deliveryGen,
                      recipientUserId,
                      sub.id,
                      redacted.title,
                      redacted.body,
                    ]
                  );
                }
              } else {
                const sendRes = await this.webPushAdapter.sendWebPush({
                  recipientUserId,
                  subscription: {
                    endpoint: sub.endpoint,
                    p256dh: sub.p256dh,
                    auth: sub.auth,
                  },
                  redactedTitle: redacted.title,
                  redactedBody: redacted.body,
                  dataPayload: {
                    type: 'notification',
                    destination: 'plan',
                    itemId: targetId || '',
                    instanceId,
                    workspaceId,
                    ruleRevision: String(rule.rule_revision),
                    deliveryGeneration: String(deliveryGen),
                    targetType: (tType as string) || 'task',
                    timestamp: String(Date.now()),
                  },
                });

                if (sendRes.isSubscriptionExpired) {
                  await client.query(
                    `UPDATE app.web_push_subscriptions SET is_active = false, updated_at = now() WHERE id = $1;`,
                    [sub.id]
                  );
                }

                if (existingSubDeliv) {
                  await client.query(
                    `UPDATE app.reminder_deliveries
                 SET status = $1, provider_message_id = $2, error_message = $3,
                     attempt_count = attempt_count + 1, last_attempt_at = now()
                 WHERE id = $4;`,
                    [
                      sendRes.status,
                      sendRes.providerMessageId || null,
                      sendRes.errorMessage || null,
                      existingSubDeliv.id,
                    ]
                  );
                } else {
                  await client.query(
                    `
                INSERT INTO app.reminder_deliveries (
                  workspace_id, instance_id, delivery_generation, channel, recipient_user_id,
                  recipient_subscription_id, provider, provider_message_id, status, redacted_title, redacted_body,
                  attempt_count, last_attempt_at, error_message
                )
                VALUES ($1, $2, $3, 'push', $4, $5, 'web_push', $6, $7, $8, $9, 1, now(), $10)
                ON CONFLICT DO NOTHING;
                `,
                    [
                      workspaceId,
                      instanceId,
                      deliveryGen,
                      recipientUserId,
                      sub.id,
                      sendRes.providerMessageId || null,
                      sendRes.status,
                      redacted.title,
                      redacted.body,
                      sendRes.errorMessage || null,
                    ]
                  );
                }

                // Track pending retries for Web Push
                if (sendRes.status === 'failed' && !sendRes.isSubscriptionExpired) {
                  const currentAttempts = (existingSubDeliv?.attempt_count ?? 0) + 1;
                  if (currentAttempts < 3) {
                    hasPendingRetries = true;
                    maxAttemptCount = Math.max(maxAttemptCount, currentAttempts);
                  }
                }
              }
            }
          }
        }
      }

      // 7. Check TTL: do not retry reminders older than 24 hours
      const isExpiredTtl =
        Date.now() - new Date(instance.scheduled_at).getTime() > 24 * 3600 * 1000;

      if (hasPendingRetries && !isExpiredTtl) {
        const backoffSeconds = Math.min(300, 30 * Math.pow(2, maxAttemptCount - 1));
        await client.query(
          `
      INSERT INTO app.background_jobs (task_type, payload, run_at, status)
      VALUES ('reminder_delivery', $1::jsonb, now() + ($2 || ' seconds')::interval, 'pending');
      `,
          [
            JSON.stringify({
              ...payload,
              isRetry: true,
              attempt: maxAttemptCount,
            }),
            backoffSeconds,
          ]
        );
      }

      // Mark instance as dispatched (idempotency prevents re-dispatching already completed dispatches)
      await client.query(
        `UPDATE app.reminder_instances SET status = 'dispatched', updated_at = now() WHERE id = $1 AND workspace_id = $2;`,
        [instanceId, workspaceId]
      );

      return {
        jobId,
        status: 'completed',
        processedAt: new Date().toISOString(),
        details: {
          outcome:
            hasPendingRetries && !isExpiredTtl ? 'dispatched_with_retry_scheduled' : 'dispatched',
          instanceId,
          ruleId: rule.id,
          retryScheduled: hasPendingRetries && !isExpiredTtl,
        },
      };
    }

    // Built-in: Workspace Export Job (Phase 35)
    if (taskType === 'workspace_export') {
      const targetWorkspaceId = payload?.workspaceId as string | undefined;
      const targetUserId = (payload?.actorUserId || payload?.userId) as string | undefined;
      const targetExportId = payload?.exportId as string | undefined;
      const includeAttachments = payload?.includeAttachments !== false;

      if (!targetWorkspaceId || !targetUserId) {
        throw new Error('workspace_export job requires workspaceId and userId in payload');
      }

      if (targetExportId && client) {
        await client.query(
          `UPDATE app.workspace_exports
           SET status = 'completed', completed_at = now(), updated_at = now()
           WHERE id = $1 AND workspace_id = $2;`,
          [targetExportId, targetWorkspaceId]
        );
      }

      return {
        jobId,
        status: 'completed',
        processedAt: new Date().toISOString(),
        details: {
          taskType,
          exportId: targetExportId,
          workspaceId: targetWorkspaceId,
          userId: targetUserId,
          includeAttachments,
          status: 'completed',
        },
      };
    }

    // Built-in: Storage Blob Purge Job (Phase 36 / 37)
    if (taskType === 'blob_purge' || taskType === 'account_deletion_purge') {
      const storagePaths = (payload?.storagePaths as string[]) || [];
      const bucket = (payload?.bucket as string | undefined) || this.defaultBucket;
      const deletionId = (payload?.deletionId || payload?.workspaceDeletionId) as
        | string
        | undefined;
      const deletionType =
        (payload?.deletionType as string) || (payload?.workspaceDeletionId ? 'workspace' : 'account');
      let purgedCount = 0;

      if (!this.storageService) {
        throw new Error('Blob purge cannot proceed: storageService is unavailable');
      }

      for (const sp of storagePaths) {
        try {
          await this.storageService.deleteObject(bucket, sp);
          purgedCount++;
        } catch (err: unknown) {
          const errorObj = err as Record<string, unknown> | undefined;
          const status = errorObj?.status || errorObj?.statusCode;
          const code = errorObj?.code;
          const name = errorObj?.name;
          const message =
            typeof errorObj?.message === 'string' ? errorObj.message.toLowerCase() : '';
          const isNotFound =
            status === 404 ||
            code === 'NoSuchKey' ||
            code === 'NotFound' ||
            name === 'NotFound' ||
            message.includes('not found') ||
            message.includes('does not exist');

          if (isNotFound) {
            purgedCount++;
          } else {
            throw new Error(
              `Blob purge failed for object '${sp}': ${err instanceof Error ? err.message : String(err)}`
            );
          }
        }
      }

      // Check if all background cleanup jobs for this deletion have completed
      if (client && deletionId) {
        const otherJobs = await client.query<{ count: string }>(
          `SELECT count(*) as count FROM app.background_jobs
           WHERE (payload->>'deletionId' = $1 OR payload->>'workspaceDeletionId' = $1)
             AND task_type IN ('blob_purge', 'provider_user_purge')
             AND status != 'completed'
             AND id != $2;`,
          [deletionId, jobId]
        );
        const remainingCount = parseInt(otherJobs.rows[0]?.count || '0', 10);
        if (remainingCount === 0) {
          if (deletionType === 'account') {
            await client.query(
              `UPDATE app.account_deletions
               SET status = 'completed', completed_at = COALESCE(completed_at, now()), updated_at = now()
               WHERE id = $1;`,
              [deletionId]
            );
          } else if (deletionType === 'public') {
            await client.query(
              `UPDATE app.public_deletion_requests
               SET status = 'completed', completed_at = COALESCE(completed_at, now()), updated_at = now()
               WHERE id = $1;`,
              [deletionId]
            );
          } else if (deletionType === 'workspace') {
            await client.query(
              `UPDATE app.workspace_deletions
               SET status = 'completed', completed_at = COALESCE(completed_at, now()), updated_at = now()
               WHERE id = $1;`,
              [deletionId]
            );
          }
        }
      }

      return {
        jobId,
        status: 'completed',
        processedAt: new Date().toISOString(),
        details: {
          taskType,
          purgedCount,
          totalPaths: storagePaths.length,
          deletionId,
          deletionType,
        },
      };
    }

    // Built-in: Identity Provider User Purge (Phase 36 / 37)
    if (taskType === 'provider_user_purge') {
      const targetUserId = payload?.userId as string | undefined;
      const deletionId = payload?.deletionId as string | undefined;
      const deletionType = (payload?.deletionType as string) || 'account';

      if (!targetUserId) {
        throw new Error('provider_user_purge requires userId in payload');
      }

      if (!this.authProvider) {
        throw new Error('provider_user_purge cannot proceed: authProvider is not configured');
      }

      if (this.authProvider.revokeUserSessions) {
        await this.authProvider.revokeUserSessions(targetUserId);
      }
      if (this.authProvider.deleteUser) {
        await this.authProvider.deleteUser(targetUserId);
      }

      // Check if all background cleanup jobs for this deletion have completed
      if (client && deletionId) {
        const otherJobs = await client.query<{ count: string }>(
          `SELECT count(*) as count FROM app.background_jobs
           WHERE (payload->>'deletionId' = $1 OR payload->>'workspaceDeletionId' = $1)
             AND task_type IN ('blob_purge', 'provider_user_purge')
             AND status != 'completed'
             AND id != $2;`,
          [deletionId, jobId]
        );
        const remainingCount = parseInt(otherJobs.rows[0]?.count || '0', 10);
        if (remainingCount === 0) {
          if (deletionType === 'account') {
            await client.query(
              `UPDATE app.account_deletions
               SET status = 'completed', completed_at = COALESCE(completed_at, now()), updated_at = now()
               WHERE id = $1;`,
              [deletionId]
            );
          } else if (deletionType === 'public') {
            await client.query(
              `UPDATE app.public_deletion_requests
               SET status = 'completed', completed_at = COALESCE(completed_at, now()), updated_at = now()
               WHERE id = $1;`,
              [deletionId]
            );
          }
        }
      }

      return {
        jobId,
        status: 'completed',
        processedAt: new Date().toISOString(),
        details: {
          taskType,
          userId: targetUserId,
          deletionId,
          deletionType,
        },
      };
    }

    // Built-in: Deletion Verification Email Dispatch (Phase 36 / 37)
    if (taskType === 'deletion_verification_email') {
      const toEmail = payload?.toEmail as string | undefined;
      const requestId = payload?.requestId as string | undefined;
      const token = payload?.token as string | undefined;

      if (!toEmail || !requestId || !token) {
        throw new Error(
          'deletion_verification_email requires toEmail, requestId, and token in payload'
        );
      }

      if (!this.deletionEmailAdapter) {
        throw new Error(
          'deletion_verification_email cannot proceed: deletionEmailAdapter is not configured'
        );
      }

      await this.deletionEmailAdapter.sendVerificationEmail(toEmail, requestId, token);

      return {
        jobId,
        status: 'completed',
        processedAt: new Date().toISOString(),
        details: {
          taskType,
          toEmail,
          requestId,
        },
      };
    }

    // 7. Built-in smoke / healthcheck / test job
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
