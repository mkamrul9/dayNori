export interface JobResult {
  jobId: string;
  status: 'completed' | 'failed';
  processedAt: string;
}

export class DaynoriWorker {
  private isRunning: boolean = false;

  start(): void {
    this.isRunning = true;
  }

  stop(): void {
    this.isRunning = false;
  }

  getStatus(): { running: boolean } {
    return { running: this.isRunning };
  }

  async processJob(jobId: string, _taskType: string): Promise<JobResult> {
    if (!this.isRunning) {
      throw new Error('Cannot process jobs while worker is stopped');
    }
    // Phase 01 smoke job execution
    return {
      jobId,
      status: 'completed',
      processedAt: new Date().toISOString(),
    };
  }
}
