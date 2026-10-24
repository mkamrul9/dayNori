import { describe, expect, it } from 'vitest';
import { runDisasterRecoveryDrill } from '../../scripts/disaster-recovery-drill.mjs';

describe('Real Disposable Disaster Recovery Drill & Deletion Ledger Replay', () => {
  it('executes real database backup, isolated restore, suppression barrier, and verifies zero leaks', async () => {
    const report = await runDisasterRecoveryDrill({ verbose: false });

    expect(report.success).toBe(true);
    expect(report.totalDurationMs).toBeGreaterThan(0);
    expect(report.backupDurationMs).toBeGreaterThan(0);
    expect(report.restoreDurationMs).toBeGreaterThan(0);
    expect(report.commands.pgDump).toContain('pg_dump');
    expect(report.commands.psqlRestore).toContain('daynori_dr_dst_');
    expect(report.disposableTargetDb).toMatch(/^daynori_dr_dst_[a-f0-9]+$/);
    expect(report.disposableSourceDb).toMatch(/^daynori_dr_src_[a-f0-9]+$/);
    expect(report.limitations.length).toBeGreaterThan(0);
  }, 60000);
});
