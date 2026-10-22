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

  it('keeps a file unverified when storage or scanner is missing', async () => {
    const worker = new DaynoriWorker();
    worker.start();

    const res = await worker.processJob('job-scan-1', 'file_scan', {
      reservationId: '12345678-1234-1234-1234-123456789abc',
    });

    expect(res.status).toBe('failed');
    expect(res.error).toContain('requires configured storage, scanner');
    worker.stop();
  });

  it('fails file_scan job if reservationId is missing', async () => {
    const worker = new DaynoriWorker();
    worker.start();

    const res = await worker.processJob('job-scan-2', 'file_scan', {});
    expect(res.status).toBe('failed');
    expect(res.error).toContain('requires reservationId');
    worker.stop();
  });

  it('processes file_orphan_cleanup job and releases lease on completion', async () => {
    const worker = new DaynoriWorker();
    worker.start();

    const res = await worker.processJob('job-cleanup-1', 'file_orphan_cleanup');
    expect(res.status).toBe('completed');
    expect(res.details?.action).toBe('reconciled_expired_reservations');

    // Lease should be released
    expect(worker.getStatus().activeLeasesCount).toBe(0);
    worker.stop();
  });

  it('prevents concurrent lease collisions on identical jobId', async () => {
    const worker = new DaynoriWorker();
    worker.start();

    const acquired1 = worker.acquireLease('locked-job-1', 'file_scan', 60000);
    expect(acquired1).toBe(true);

    const acquired2 = worker.acquireLease('locked-job-1', 'file_scan', 60000);
    expect(acquired2).toBe(false);

    worker.releaseLease('locked-job-1');
    const acquired3 = worker.acquireLease('locked-job-1', 'file_scan', 60000);
    expect(acquired3).toBe(true);
    worker.stop();
  });
});
