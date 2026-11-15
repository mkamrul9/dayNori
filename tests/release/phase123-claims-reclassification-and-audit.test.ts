import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Phase 123: Release-Evidence Claims Reclassification and Preflight Reconciliation Suite', () => {
  const repoRoot = path.resolve(__dirname, '../..');

  describe('1. Phase 119 Staging Checks Reclassification', () => {
    it('verifies Phase 119 browser checks are classified as unauthenticated page checks', () => {
      const resultsPath = path.join(
        repoRoot,
        'artifacts/phase119/staging-verification-results.json'
      );
      expect(fs.existsSync(resultsPath)).toBe(true);
      const results = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));

      expect(results.browserJourneys.length).toBe(10);
      for (const check of results.browserJourneys) {
        expect(check.classification).toBe('unauthenticated-page-presence-check');
      }

      // Verify that backup check is classified as runbook documentation verification
      expect(results.backupRecoveryCheck.id).toBe(
        'BKP-01-RUNBOOK-DOCUMENTATION-VERIFICATION'
      );
      expect(results.backupRecoveryCheck.details.verificationMethod).toContain(
        'no live database restore drill executed'
      );
    });

    it('verifies Phase 119 evidence summary reflects unauthenticated page check classifications', () => {
      const summaryPath = path.join(repoRoot, 'artifacts/phase119/evidence-summary.json');
      expect(fs.existsSync(summaryPath)).toBe(true);
      const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));

      for (const check of summary.browserJourneys) {
        expect(check.classification).toBe('unauthenticated-page-presence-check');
      }
      expect(summary.observabilityAndRollback.backupRestoreDrill.verificationType).toBe(
        'runbook-documentation-verification'
      );
      expect(
        summary.observabilityAndRollback.backupRestoreDrill.liveRestoreDrillExecuted
      ).toBe(false);
    });
  });

  describe('2. Phase 120 Security Review Backup Reclassification', () => {
    it('verifies Phase 120 findings document backup recovery as runbook verification with live drill unexecuted', () => {
      const findingsPath = path.join(
        repoRoot,
        'artifacts/phase120/security-review-findings.json'
      );
      expect(fs.existsSync(findingsPath)).toBe(true);
      const findings = JSON.parse(fs.readFileSync(findingsPath, 'utf8'));

      const backupDim = findings.auditedDimensions.find(
        (d: { dimension: string }) => d.dimension === 'backups-and-recovery'
      );
      expect(backupDim).toBeDefined();
      expect(backupDim.mechanism).toContain('Live database restoration drill unexecuted');
      expect(backupDim.unresolvedRisks.length).toBeGreaterThan(0);
      expect(backupDim.unresolvedRisks[0]).toContain('evidence-backupRecoveryEvidence');
    });
  });

  describe('3. Phase 121 Load Testing Reclassification', () => {
    it('verifies Phase 121 load results are reclassified as health runs and capacity modeling', () => {
      const loadResultsPath = path.join(
        repoRoot,
        'artifacts/phase121/load-test-results.json'
      );
      expect(fs.existsSync(loadResultsPath)).toBe(true);
      const loadResults = JSON.parse(fs.readFileSync(loadResultsPath, 'utf8'));

      expect(loadResults.title).toContain('Health-Probe Throughput Profiling');
      expect(loadResults.reclassificationNotice).toBeDefined();
      expect(loadResults.reclassificationNotice.classification).toBe(
        'health-request-runs-and-capacity-modeling'
      );
      expect(loadResults.reclassificationNotice.clarification).toMatch(
        /not proof of 10,000-user transactional capacity/i
      );
    });
  });

  describe('4. Phase 122 Production Launch Package Reclassification', () => {
    it('verifies launch package hosted staging and backup proof sections reflect reclassified claims', () => {
      const pkgPath = path.join(
        repoRoot,
        'artifacts/phase122/production-launch-package.json'
      );
      expect(fs.existsSync(pkgPath)).toBe(true);
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

      // 1. Phase 119 browser journeys reclassification
      expect(pkg.hostedStagingEvidence.phase119BrowserJourneys.classification).toBe(
        'unauthenticated-page-presence-checks'
      );
      expect(
        pkg.hostedStagingEvidence.phase119BrowserJourneys.reclassificationNotice
      ).toContain('Did not perform authenticated logins');

      // 2. Phase 121 load testing reclassification
      expect(pkg.hostedStagingEvidence.phase121LoadTesting.classification).toBe(
        'health-request-runs-and-capacity-modeling'
      );
      expect(
        pkg.hostedStagingEvidence.phase121LoadTesting.reclassificationNotice
      ).toContain('Not proof of 10,000-user transactional capacity');

      // 3. Backup and restore proof reclassification
      expect(pkg.backupAndRestoreProof.stagingRestoreDrillEvidence).toContain(
        'Live database restoration drill was NOT executed'
      );
      expect(pkg.backupAndRestoreProof.stagingRestoreDrillEvidence).toContain(
        'evidence-backupRecoveryEvidence'
      );
    });
  });

  describe('5. Dirty Working Tree Inventory & RC5 Delta', () => {
    it('verifies dirty-working-tree-inventory.json accurately catalogs working tree modifications', () => {
      const invPath = path.join(
        repoRoot,
        'artifacts/phase123/dirty-working-tree-inventory.json'
      );
      expect(fs.existsSync(invPath)).toBe(true);
      const inv = JSON.parse(fs.readFileSync(invPath, 'utf8'));

      expect(inv.phase).toBe('123');
      expect(inv.counts.trackedModifiedTotal).toBeGreaterThanOrEqual(100);
      expect(inv.counts.untrackedTotal).toBeGreaterThanOrEqual(2000);

      // Verify Dialog.tsx is recognized as absent from rc5
      const dialogEntry = inv.filesAbsentOrModifiedRelativeToRc5.find(
        (f: { file: string }) => f.file === 'packages/ui-web/src/Dialog.tsx'
      );
      expect(dialogEntry).toBeDefined();
      expect(dialogEntry.impactOnRc5).toContain('ABSENT from rc5');
    });
  });

  describe('6. Preflight Reconciliation & Gate Invariants', () => {
    it('verifies preflight-reconciliation-record.json records exact preflight invariant counts', () => {
      const pfPath = path.join(
        repoRoot,
        'artifacts/phase123/preflight-reconciliation-record.json'
      );
      expect(fs.existsSync(pfPath)).toBe(true);
      const pf = JSON.parse(fs.readFileSync(pfPath, 'utf8'));

      expect(pf.summary.pass).toBe(20);
      expect(pf.summary.fail).toBe(0);
      expect(pf.summary.blocked).toBe(13);
      expect(pf.summary.unexecuted).toBe(1);
      expect(pf.summary.releaseEligible).toBe(false);

      // Verify evidence-backupRecoveryEvidence is explicitly among blocked gates
      const backupGate = pf.blockedGates.find(
        (g: { id: string }) => g.id === 'evidence-backupRecoveryEvidence'
      );
      expect(backupGate).toBeDefined();
      expect(backupGate.status).toBe('BLOCKED');

      // Verify evidence-ownerApproval is explicitly among blocked gates
      const ownerGate = pf.blockedGates.find(
        (g: { id: string }) => g.id === 'evidence-ownerApproval'
      );
      expect(ownerGate).toBeDefined();
      expect(ownerGate.status).toBe('BLOCKED');
    });

    it('verifies claims-reclassification-matrix.json records all 4 phase reclassifications', () => {
      const matrixPath = path.join(
        repoRoot,
        'artifacts/phase123/claims-reclassification-matrix.json'
      );
      expect(fs.existsSync(matrixPath)).toBe(true);
      const matrix = JSON.parse(fs.readFileSync(matrixPath, 'utf8'));

      expect(matrix.phase).toBe('123');
      expect(matrix.reclassifications.length).toBe(4);

      const phases = matrix.reclassifications.map((r: { phase: string }) => r.phase);
      expect(phases).toContain('119');
      expect(phases).toContain('121');
      expect(phases).toContain('122');
    });
  });
});
