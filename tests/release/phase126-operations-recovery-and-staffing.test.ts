import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve('.');
const RESULTS_FILE = path.join(REPO_ROOT, 'artifacts', 'phase126', 'operations-drill-results.json');
const BACKUP_FILE = path.join(REPO_ROOT, 'artifacts', 'phase126', 'staging-database-backup-t0.json');
const LEDGER_FILE = path.join(REPO_ROOT, 'artifacts', 'phase126', 'independent-suppression-ledger.json');

describe('Phase 126: Operations Recovery, Compatible Rollback & Staffing Audit', () => {
  it('generates well-formed machine-readable operations drill artifacts', () => {
    expect(fs.existsSync(RESULTS_FILE)).toBe(true);
    expect(fs.existsSync(BACKUP_FILE)).toBe(true);
    expect(fs.existsSync(LEDGER_FILE)).toBe(true);

    const data = JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf8'));
    expect(data.phase).toBe('126');
    expect(data.runId).toMatch(/^op126_/);
    expect(data.totalDurationMs).toBeGreaterThan(0);
  });

  it('verifies live staging database backup, isolated restore, measured RTO and zero data loss (RPO = 0s)', () => {
    const data = JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf8'));
    const { drillResults } = data;

    expect(drillResults.passed).toBe(true);
    expect(drillResults.isolatedStagingDatabase).toBe('daynori_restore_drill');
    expect(drillResults.backupDurationMs).toBeGreaterThan(0);
    expect(drillResults.restoreDurationMs).toBeGreaterThan(0);
    expect(drillResults.totalRtoMs).toBeGreaterThan(0);
    expect(drillResults.totalRtoMs).toBeLessThan(15 * 60 * 1000); // RTO strictly within 15m SLO target
    expect(drillResults.measuredRpoSeconds).toBe(0); // Zero data loss for transactions committed prior to T0
    expect(drillResults.survivorDataPreserved).toBe(true);
    expect(drillResults.survivorDataLossBytes).toBe(0);
    expect(drillResults.survivorDataLossRows).toBe(0);
    expect(drillResults.deletedDataResurrected).toBe(false);
    expect(drillResults.resurrectedAccountRows).toBe(0);
    expect(drillResults.resurrectedWorkspaceRows).toBe(0);
    expect(drillResults.resurrectedItemRows).toBe(0);
    expect(drillResults.suppressionTombstonesPreserved).toBeGreaterThanOrEqual(1);
    expect(typeof drillResults.backupArchiveSha256).toBe('string');
  });

  it('demonstrates non-destructive artifact rollback between rc5 and rc4 and verifies offline shell', () => {
    const data = JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf8'));
    const { rollbackResults } = data;

    expect(rollbackResults.passed).toBe(true);
    expect(rollbackResults.currentReleaseCandidate).toBe('2.0.0-rc5');
    expect(rollbackResults.previousCompatibleReleaseCandidate).toBe('2.0.0-rc4');

    expect(rollbackResults.currentArtifacts.web.exists).toBe(true);
    expect(rollbackResults.currentArtifacts.web.sizeBytes).toBeGreaterThan(1_000_000);
    expect(rollbackResults.currentArtifacts.api.exists).toBe(true);
    expect(rollbackResults.currentArtifacts.api.sizeBytes).toBeGreaterThan(500_000);

    expect(rollbackResults.previousArtifacts.web.exists).toBe(true);
    expect(rollbackResults.previousArtifacts.web.sizeBytes).toBeGreaterThan(1_000_000);
    expect(rollbackResults.previousArtifacts.api.exists).toBe(true);
    expect(rollbackResults.previousArtifacts.api.sizeBytes).toBeGreaterThan(500_000);

    expect(rollbackResults.additiveMigrationInvariantVerified).toBe(true);
    expect(rollbackResults.dataForwardBackwardCompatible).toBe(true);
    expect(rollbackResults.dataLossOnRollbackBytes).toBe(0);

    expect(rollbackResults.emergencyOfflineShell.exists).toBe(true);
    expect(rollbackResults.emergencyOfflineShell.httpStatus).toBe(503);
    expect(rollbackResults.emergencyOfflineShell.retryAfterHeader).toBe(300);
  });

  it('empirically verifies DNS MX records, detecting unconfigured support and security mailboxes', () => {
    const data = JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf8'));
    const { staffingResults } = data;

    expect(staffingResults.dnsAudit.domain).toBe('daynori.com');
    expect(Array.isArray(staffingResults.dnsAudit.mxRecordsFound)).toBe(true);
    expect(staffingResults.dnsAudit.hasActiveMxRouting).toBe(false);
    expect(staffingResults.mailboxes.hasActiveMailServer).toBe(false);
    expect(staffingResults.mailboxes.status).toBe('unconfigured_no_mx');
  });

  it('distinguishes configured/tested mechanisms from proposed runbooks and blocks publication', () => {
    const data = JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf8'));
    const { staffingResults, summary } = data;

    expect(staffingResults.automatedAlerting.automatedPagerIntegration).toBe('unconfigured_proposed_runbook');
    expect(staffingResults.operationalStaffing.overallStaffed).toBe(false);
    expect(staffingResults.operationalStaffing.status).toBe('unstaffed_pending_owner_allocation');

    expect(staffingResults.classificationMatrix.configuredAndTested.length).toBeGreaterThanOrEqual(5);
    expect(staffingResults.classificationMatrix.proposedRunbooksUnproven.length).toBeGreaterThanOrEqual(5);

    expect(staffingResults.publicationGateStatus).toBe('BLOCKED');
    expect(summary.publicationAllowed).toBe(false);
  });
});
