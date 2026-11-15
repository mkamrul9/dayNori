import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

describe('Phase 122: Production Launch Package, Artifact Identity, and Governance Suite', () => {
  const repoRoot = path.resolve(__dirname, '../..');
  const launchPackagePath = path.join(repoRoot, 'artifacts/phase122/production-launch-package.json');

  it('verifies artifacts/phase122/production-launch-package.json exists and conforms to schema', () => {
    expect(fs.existsSync(launchPackagePath)).toBe(true);
    const pkg = JSON.parse(fs.readFileSync(launchPackagePath, 'utf8'));

    expect(pkg.schemaVersion).toBe(1);
    expect(pkg.packageVersion).toBe('2.0.0-rc5');
    expect(pkg.operationalStatus).toBe('LAUNCH_PACKAGE_COMPLETE_AWAITING_OWNER_AUTHORIZATION');
    expect(pkg.artifactIdentity.gitCommitSha).toBe('f70aa3f9679ae927ea603773daf139b434b59adb');
  });

  describe('Artifact Integrity & Cryptographic Digests', () => {
    it('verifies distributable Web and API tarballs exist and match recorded SHA-256 digests', () => {
      const pkg = JSON.parse(fs.readFileSync(launchPackagePath, 'utf8'));

      // 1. Web Archive
      const webTarPath = path.join(repoRoot, pkg.artifactIdentity.web.tarball);
      expect(fs.existsSync(webTarPath)).toBe(true);
      const webBytes = fs.readFileSync(webTarPath);
      const computedWebSha = crypto.createHash('sha256').update(webBytes).digest('hex');
      expect(computedWebSha).toBe(pkg.artifactIdentity.web.sha256);
      expect(webBytes.length).toBe(pkg.artifactIdentity.web.sizeBytes);

      // 2. API Archive
      const apiTarPath = path.join(repoRoot, pkg.artifactIdentity.api.tarball);
      expect(fs.existsSync(apiTarPath)).toBe(true);
      const apiBytes = fs.readFileSync(apiTarPath);
      const computedApiSha = crypto.createHash('sha256').update(apiBytes).digest('hex');
      expect(computedApiSha).toBe(pkg.artifactIdentity.api.sha256);
      expect(apiBytes.length).toBe(pkg.artifactIdentity.api.sizeBytes);
    });

    it('verifies Next.js Web BUILD_ID matches compiled production output', () => {
      const pkg = JSON.parse(fs.readFileSync(launchPackagePath, 'utf8'));
      const buildIdPath = path.join(repoRoot, 'apps/web/.next/BUILD_ID');
      expect(fs.existsSync(buildIdPath)).toBe(true);
      const actualBuildId = fs.readFileSync(buildIdPath, 'utf8').trim();
      expect(actualBuildId).toBe(pkg.artifactIdentity.web.buildId);
      expect(pkg.artifactIdentity.web.routesCompiled).toBe(32);
    });

    it('verifies individual client-side asset digests', () => {
      const pkg = JSON.parse(fs.readFileSync(launchPackagePath, 'utf8'));
      const clientAssets = pkg.artifactIdentity.clientAssets;

      const assetsToCheck = [
        { key: 'manifestJson', file: 'apps/web/public/manifest.json' },
        { key: 'serviceWorkerJs', file: 'apps/web/public/sw.js' },
        { key: 'offlineShellHtml', file: 'apps/web/public/offline-shell.html' },
        { key: 'offlineShellJs', file: 'apps/web/public/offline-shell.js' },
        { key: 'icon192', file: 'apps/web/public/brand/icon-192.png' },
        { key: 'icon512', file: 'apps/web/public/brand/icon-512.png' },
        { key: 'iconMaskable512', file: 'apps/web/public/brand/icon-maskable-512.png' },
      ];

      for (const asset of assetsToCheck) {
        const fullPath = path.join(repoRoot, asset.file);
        expect(fs.existsSync(fullPath)).toBe(true);
        const bytes = fs.readFileSync(fullPath);
        const hash = crypto.createHash('sha256').update(bytes).digest('hex');
        expect(hash).toBe(clientAssets[asset.key]);
      }
    });
  });

  describe('Public Scope & Fail-Closed Module Gating', () => {
    it('verifies 78 enabled core actions and 31 gated actions across 8 modules', () => {
      const pkg = JSON.parse(fs.readFileSync(launchPackagePath, 'utf8'));
      expect(pkg.publicScope.totalFunctionRegisterActions).toBe(109);
      expect(pkg.publicScope.enabledActionsCount).toBe(78);
      expect(pkg.publicScope.gatedActionsCount).toBe(31);
      expect(pkg.publicScope.gatedModules.length).toBe(8);

      const moduleNames = pkg.publicScope.gatedModules.map((m: { module: string }) => m.module);
      expect(moduleNames).toContain('Zero-Knowledge Vault');
      expect(moduleNames).toContain('Collaborative Rooms & Chat');
      expect(moduleNames).toContain('Live AI Assistant Streaming');
      expect(moduleNames).toContain('Voice Assistant Audio Memory & Capture');
      expect(moduleNames).toContain('Google Drive Sync');
      expect(moduleNames).toContain('In-App Billing & Subscriptions');
      expect(moduleNames).toContain('Native Push Notifications');
      expect(moduleNames).toContain('Native Android Client Container');

      // Verify every gated module has explicit fail-closed behavior
      for (const m of pkg.publicScope.gatedModules) {
        expect(m.status).toMatch(/FAIL_CLOSED/);
        expect(m.standingGates.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Hosted Staging & Security Evidence Reconciliation', () => {
    it('reconciles Phase 119 browser audits and Phase 121 load testing evidence', () => {
      const pkg = JSON.parse(fs.readFileSync(launchPackagePath, 'utf8'));
      expect(pkg.hostedStagingEvidence.stagingUrls.web).toBe('https://daynori-web-preview.onrender.com');
      expect(pkg.hostedStagingEvidence.stagingUrls.api).toBe('https://daynori-api-preview.onrender.com');
      expect(pkg.hostedStagingEvidence.phase119BrowserJourneys.journeysPassed).toBe(10);
      expect(pkg.hostedStagingEvidence.phase121LoadTesting.runs.rampRun).toBeDefined();
      expect(pkg.hostedStagingEvidence.phase121LoadTesting.runs.spikeRun).toBeDefined();
      expect(pkg.hostedStagingEvidence.phase121LoadTesting.runs.soakRun).toBeDefined();

      expect(pkg.securityFindings.auditDimensionsPassed).toBe(13);
      expect(pkg.securityFindings.remediatedVulnerabilities.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe('Capacity Envelope, Operational Roster, and Governance', () => {
    it('verifies capacity envelope boundaries and Little\'s Law queuing principle', () => {
      const pkg = JSON.parse(fs.readFileSync(launchPackagePath, 'utf8'));
      expect(pkg.capacityEnvelopeAndCosts.safeOperatingBoundaries.renderFreeTierSafeLimit).toContain('<= 35 CCU');
      expect(pkg.capacityEnvelopeAndCosts.safeOperatingBoundaries.managedPaasRequired).toContain('150-300 CCU');
      expect(pkg.capacityEnvelopeAndCosts.noExtrapolationPrinciple).toContain("Little's Law");
    });

    it('verifies operational support roster and monitoring alert thresholds', () => {
      const pkg = JSON.parse(fs.readFileSync(launchPackagePath, 'utf8'));
      expect(pkg.supportAndOperations.designatedOperators.incidentCommander).toBe('incident-commander@daynori.com');
      expect(pkg.supportAndOperations.designatedOperators.technicalOperationsLead).toBe('ops@daynori.com');
      expect(pkg.supportAndOperations.designatedOperators.securityPrivacyOfficer).toBe('security@daynori.com');
      expect(pkg.supportAndOperations.designatedOperators.supportCommunicationsLead).toBe('support@daynori.com');

      expect(pkg.monitoringAndObservability.operationalAlertThresholds.originLatencyP95WarningMs).toBe(500);
      expect(pkg.monitoringAndObservability.operationalAlertThresholds.originLatencyP95CriticalMs).toBe(1000);
      expect(pkg.monitoringAndObservability.operationalAlertThresholds.http5xxErrorRateCriticalPercent).toBe(1.0);
    });

    it('verifies staged cohort rollout parameters and explicit owner approval gates', () => {
      const pkg = JSON.parse(fs.readFileSync(launchPackagePath, 'utf8'));
      expect(pkg.stagedCohortRolloutPlan.phase1_smallInvitedCohort.targetSize).toContain('50 - 100 invited users');
      expect(pkg.ownerApprovalGates.status).toBe('AWAITING_OWNER_AUTHORIZATION');

      const gateIds = pkg.ownerApprovalGates.decisionRequired.map((d: { gateId: string }) => d.gateId);
      expect(gateIds).toContain('OWNER-PROD-DNS');
      expect(gateIds).toContain('OWNER-BUDGET-AUTH');
      expect(gateIds).toContain('OWNER-COHORT-SIZE');
      expect(gateIds).toContain('OWNER-RELEASE-AUTH');

      expect(pkg.standingReleaseRule).toContain('Never describe a rehearsal');
    });
  });

  describe('Release Document Consistency & Cross-References', () => {
    it('verifies docs/release/v2-authorized-publication-record.md references Candidate 2.0.0-rc5', () => {
      const pubRecordPath = path.join(repoRoot, 'docs/release/v2-authorized-publication-record.md');
      expect(fs.existsSync(pubRecordPath)).toBe(true);
      const text = fs.readFileSync(pubRecordPath, 'utf8');

      expect(text).toContain('Candidate Label**: `2.0.0-rc5`');
      expect(text).toContain('f70aa3f9679ae927ea603773daf139b434b59adb');
      expect(text).toContain('daynori-web-v2.0.0-rc5.tar.gz');
      expect(text).toContain('daynori-api-v2.0.0-rc5.tar.gz');
      expect(text).toContain('OWNER-RELEASE-AUTH');
    });

    it('verifies artifacts/phase102/publication-review-record.json references Candidate 2.0.0-rc5', () => {
      const reviewRecordPath = path.join(repoRoot, 'artifacts/phase102/publication-review-record.json');
      expect(fs.existsSync(reviewRecordPath)).toBe(true);
      const json = JSON.parse(fs.readFileSync(reviewRecordPath, 'utf8'));

      expect(json.candidateLabel).toBe('2.0.0-rc5');
      expect(json.gitRevision).toBe('f70aa3f9679ae927ea603773daf139b434b59adb');
      expect(json.launchPackagePath).toBe('artifacts/phase122/production-launch-package.json');
    });
  });
});
