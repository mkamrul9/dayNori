import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

describe('Phase 128: Candidate 2.0.0-rc6 Rebuild, Multi-Dimensional Staging Reconciliation & Owner Package Suite', () => {
  const repoRoot = path.resolve(__dirname, '../..');
  const reviewPackagePath = path.join(repoRoot, 'artifacts/phase128/candidate-rc6-review-package.json');
  const manifestPath = path.join(repoRoot, 'artifacts/release/candidate-2.0.0-rc6-manifest.json');

  it('verifies candidate-rc6-review-package.json exists and conforms to schema', () => {
    expect(fs.existsSync(reviewPackagePath)).toBe(true);
    const pkg = JSON.parse(fs.readFileSync(reviewPackagePath, 'utf8'));

    expect(pkg.schemaVersion).toBe(1);
    expect(pkg.packageVersion).toBe('2.0.0-rc6');
    expect(pkg.operationalStatus).toBe('LAUNCH_PACKAGE_COMPLETE_AWAITING_OWNER_AUTHORIZATION');
    expect(pkg.artifactIdentity.gitCommitSha).toBe('5286df9ef1de8e498cc2cd5b72de936c52f40368');
    expect(pkg.artifactIdentity.nodeEngineRequirement).toBe('^24.21.0');
  });

  describe('Candidate 2.0.0-rc6 Artifact Integrity and Hashes', () => {
    it('verifies candidate-2.0.0-rc6-manifest.json matches packaged artifacts', () => {
      expect(fs.existsSync(manifestPath)).toBe(true);
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

      expect(manifest.candidate).toBe('2.0.0-rc6');
      expect(manifest.gitCommit).toBe('5286df9ef1de8e498cc2cd5b72de936c52f40368');
      expect(manifest.buildId).toBe('whaN7HuVFERNvQiYRlevt');
      expect(manifest.nodeEngineRequirement).toBe('^24.21.0');
      expect(manifest.artifacts).toHaveLength(2);
    });

    it('verifies daynori-web-v2.0.0-rc6.tar.gz cryptographic SHA-256 digest and file size', () => {
      const pkg = JSON.parse(fs.readFileSync(reviewPackagePath, 'utf8'));
      const webTarPath = path.join(repoRoot, pkg.artifactIdentity.web.tarball);

      expect(fs.existsSync(webTarPath)).toBe(true);
      const bytes = fs.readFileSync(webTarPath);
      const computedSha = crypto.createHash('sha256').update(bytes).digest('hex');

      expect(computedSha).toBe(pkg.artifactIdentity.web.sha256);
      expect(bytes.length).toBe(pkg.artifactIdentity.web.sizeBytes);
      expect(computedSha).toBe('8299fc016385ae5120a49e8ab745132bb422b549e320c06cf36490a76b1c299f');
    });

    it('verifies daynori-api-v2.0.0-rc6.tar.gz cryptographic SHA-256 digest and file size', () => {
      const pkg = JSON.parse(fs.readFileSync(reviewPackagePath, 'utf8'));
      const apiTarPath = path.join(repoRoot, pkg.artifactIdentity.api.tarball);

      expect(fs.existsSync(apiTarPath)).toBe(true);
      const bytes = fs.readFileSync(apiTarPath);
      const computedSha = crypto.createHash('sha256').update(bytes).digest('hex');

      expect(computedSha).toBe(pkg.artifactIdentity.api.sha256);
      expect(bytes.length).toBe(pkg.artifactIdentity.api.sizeBytes);
      expect(computedSha).toBe('146f5deb7c1b82fb72950d648e25b405c84df25a9efa031cb427fdb1e45bccda');
    });

    it('verifies Next.js BUILD_ID matches compiled web artifact', () => {
      const pkg = JSON.parse(fs.readFileSync(reviewPackagePath, 'utf8'));
      const buildIdPath = path.join(repoRoot, 'apps/web/.next/BUILD_ID');

      expect(fs.existsSync(buildIdPath)).toBe(true);
      const buildId = fs.readFileSync(buildIdPath, 'utf8').trim();
      expect(buildId).toBe(pkg.artifactIdentity.web.buildId);
      expect(buildId).toBe('whaN7HuVFERNvQiYRlevt');
      expect(pkg.artifactIdentity.web.routesCompiled).toBe(32);
    });

    it('verifies individual public client asset digests match recorded hashes', () => {
      const pkg = JSON.parse(fs.readFileSync(reviewPackagePath, 'utf8'));
      const assets = pkg.artifactIdentity.clientAssets;

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
        expect(hash).toBe(assets[asset.key]);
      }
    });
  });

  describe('Preflight Check Reconciliation', () => {
    it('verifies preflight summary records 0 failures and truthfully reports blocked external gates', () => {
      const pkg = JSON.parse(fs.readFileSync(reviewPackagePath, 'utf8'));
      const preflight = pkg.preflightSummary;

      expect(preflight.failed).toBe(0);
      expect(preflight.passed).toBeGreaterThanOrEqual(20);
      expect(preflight.releaseEligible).toBe(false);
      expect(preflight.blockedGates).toContain('ownerApproval');
      expect(preflight.blockedGates).toContain('human-launch-authorization');
      expect(preflight.blockedGates).toContain('manifest-provisional');
    });
  });

  describe('Four-Dimensional Staging Evidence Reconciliation', () => {
    it('verifies Dimension 1: Multi-user staging journeys & workspace isolation evidence', () => {
      const pkg = JSON.parse(fs.readFileSync(reviewPackagePath, 'utf8'));
      const dim1 = pkg.fourDimensionalStagingEvidence.dimension1_userJourneys;

      expect(dim1.phase).toBe('125');
      expect(dim1.testsPassed).toBe(7);
      expect(dim1.workspaceIsolationProven).toBe(true);
      expect(dim1.crossTenantLeakageObserved).toBe(false);
      expect(dim1.cdpErrorHandlingHardened).toBe(true);
      expect(dim1.disposableAccountsTested).toHaveLength(2);
      expect(dim1.workflowsAutomatedAndPersisted).toContain('account_deletion_soft_purge');
      expect(dim1.workflowsAutomatedAndPersisted).toContain('offline_draft_reconnect_conflict');
    });

    it('verifies Dimension 2: Security proxy trust & anti-spoofing rate limiting evidence', () => {
      const pkg = JSON.parse(fs.readFileSync(reviewPackagePath, 'utf8'));
      const dim2 = pkg.fourDimensionalStagingEvidence.dimension2_securityIngress;

      expect(dim2.phase).toBe('124');
      expect(dim2.testsPassed).toBe(14);
      expect(dim2.proxyTrustCidrsEnforced).toBe(true);
      expect(dim2.trustedCidrCount).toBe(18);
      expect(dim2.untrustedHeaderSpoofingDefeated).toBe(true);
      expect(dim2.sensitiveRouteRateLimit).toBe('10 req/min with 429 response');
    });

    it('verifies Dimension 3: Operations disaster recovery & staffing audit evidence', () => {
      const pkg = JSON.parse(fs.readFileSync(reviewPackagePath, 'utf8'));
      const dim3 = pkg.fourDimensionalStagingEvidence.dimension3_disasterRecoveryAndOperations;

      expect(dim3.phase).toBe('126');
      expect(dim3.testsPassed).toBe(5);
      expect(dim3.databaseRestoreDrill.rtoSeconds).toBeLessThanOrEqual(5.0);
      expect(dim3.databaseRestoreDrill.rpoSeconds).toBe(0);
      expect(dim3.databaseRestoreDrill.survivorDataLossBytes).toBe(0);
      expect(dim3.databaseRestoreDrill.tombstoneResurrections).toBe(0);
      expect(dim3.databaseRestoreDrill.preAccessSuppressionBarrier).toBe(true);
      expect(dim3.operationalStaffingAudit.dnsMxRecordCount).toBe(0);
      expect(dim3.operationalStaffingAudit.assignedOnCallStaff).toBe('PROPOSED_UNCONFIRMED');
    });

    it('verifies Dimension 4: Authenticated transactional capacity envelope evidence', () => {
      const pkg = JSON.parse(fs.readFileSync(reviewPackagePath, 'utf8'));
      const dim4 = pkg.fourDimensionalStagingEvidence.dimension4_capacityEnvelope;

      expect(dim4.phase).toBe('127');
      expect(dim4.testsPassed).toBe(6);
      expect(dim4.tier1_safeEnvelope.concurrency).toBe('30 CCU');
      expect(dim4.tier1_safeEnvelope.serverErrorRate).toBe('0.00%');
      expect(dim4.tier1_safeEnvelope.dbPoolActivePeak).toBeLessThanOrEqual(dim4.tier1_safeEnvelope.dbPoolCap);
      expect(dim4.tier1_safeEnvelope.verdict).toBe('DEMONSTRABLY_SUPPORTED_ON_FREE_TIER');
      expect(dim4.tier2_breakingPoint.concurrency).toBe('150 CCU');
      expect(dim4.tier2_breakingPoint.verdict).toBe('PHYSICAL_BREAKING_POINT_REQUIRES_MANAGED_PAAS');
      expect(dim4.tier3_hardSaturation.concurrency).toBe('300 CCU');
    });
  });

  describe('Owner Approval Presentation & Release Boundaries', () => {
    it('verifies complete decision parameters presented for owner determination', () => {
      const pkg = JSON.parse(fs.readFileSync(reviewPackagePath, 'utf8'));
      const owner = pkg.ownerApprovalPresentation;

      expect(owner.productionDomain).toContain('app.daynori.com');
      expect(owner.monthlyBudgetRangeUsd).toBe('$32–$160/mo');
      expect(owner.initialCohortProposal).toContain('25–50');
      expect(owner.hostingAccountOptions).toHaveLength(2);
      expect(owner.remainingDisabledFeaturesFailClosed.length).toBeGreaterThanOrEqual(7);
      expect(owner.publicationGateDecision).toBe('STRICTLY_BLOCKED_PENDING_EXPLICIT_OWNER_AUTHORIZATION');
    });

    it('verifies operational roles remain clearly marked as pending owner confirmation', () => {
      const pkg = JSON.parse(fs.readFileSync(reviewPackagePath, 'utf8'));
      const roles = pkg.ownerApprovalPresentation.namedOperationalRoles;

      expect(roles.incidentCommander.status).toBe('PENDING_OWNER_CONFIRMATION');
      expect(roles.technicalOperationsLead.status).toBe('PENDING_OWNER_CONFIRMATION');
      expect(roles.securityAndPrivacyOfficer.status).toBe('PENDING_OWNER_CONFIRMATION');
      expect(roles.supportAndCommunicationsLead.status).toBe('PENDING_OWNER_CONFIRMATION');
    });

    it('verifies fail-closed disabled modules list all unreleased feature tracks', () => {
      const pkg = JSON.parse(fs.readFileSync(reviewPackagePath, 'utf8'));
      const disabled = pkg.ownerApprovalPresentation.remainingDisabledFeaturesFailClosed;

      expect(disabled.some(d => d.includes('Vault'))).toBe(true);
      expect(disabled.some(d => d.includes('AI Assistant'))).toBe(true);
      expect(disabled.some(d => d.includes('Rooms'))).toBe(true);
      expect(disabled.some(d => d.includes('Voice'))).toBe(true);
      expect(disabled.some(d => d.includes('Billing'))).toBe(true);
      expect(disabled.some(d => d.includes('Google Drive'))).toBe(true);
      expect(disabled.some(d => d.includes('Native Push'))).toBe(true);
      expect(disabled.some(d => d.includes('Native Android App'))).toBe(true);
    });
  });
});
