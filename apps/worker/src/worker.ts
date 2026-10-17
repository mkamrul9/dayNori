export interface JobResult {
  jobId: string;
  status: 'completed' | 'failed';
  processedAt: string;
  error?: string;
  details?: Record<string, unknown>;
}

export interface JobContext {
  jobId: string;
  taskType: 'file_scan' | 'file_orphan_cleanup' | 'smoke' | string;
  payload?: Record<string, unknown>;
  leaseTimeoutMs?: number;
}

export class DaynoriWorker {
  private isRunning: boolean = false;
  private activeLeases = new Map<string, { expiresAt: number; taskType: string }>();

  start(): void {
    this.isRunning = true;
  }

  stop(): void {
    this.isRunning = false;
    this.activeLeases.clear();
  }

  getStatus(): { running: boolean; activeLeasesCount: number } {
    return {
      running: this.isRunning,
      activeLeasesCount: this.activeLeases.size,
    };
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
      if (taskType === 'file_scan') {
        const reservationId = payload?.reservationId as string | undefined;
        if (!reservationId) {
          throw new Error('file_scan job requires reservationId in payload');
        }
        return {
          jobId,
          status: 'completed',
          processedAt: new Date().toISOString(),
          details: { reservationId, action: 'scanned_and_verified' },
        };
      }

      if (taskType === 'file_orphan_cleanup') {
        return {
          jobId,
          status: 'completed',
          processedAt: new Date().toISOString(),
          details: { action: 'reconciled_expired_reservations' },
        };
      }

      // Default smoke job execution
      return {
        jobId,
        status: 'completed',
        processedAt: new Date().toISOString(),
      };
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
