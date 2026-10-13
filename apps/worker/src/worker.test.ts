import { describe, expect, it } from 'vitest';
import { DaynoriWorker } from './worker.js';

describe('DaynoriWorker', () => {
  it('starts, processes a smoke job, and stops', async () => {
    const worker = new DaynoriWorker();
    expect(worker.getStatus().running).toBe(false);

    worker.start();
    expect(worker.getStatus().running).toBe(true);

    const result = await worker.processJob('job-1', 'test:ping');
    expect(result.status).toBe('completed');
    expect(result.jobId).toBe('job-1');

    worker.stop();
    expect(worker.getStatus().running).toBe(false);
  });

  it('rejects jobs when stopped', async () => {
    const worker = new DaynoriWorker();
    await expect(worker.processJob('job-2', 'test:ping')).rejects.toThrowError(
      /Cannot process jobs while worker is stopped/
    );
  });
});
