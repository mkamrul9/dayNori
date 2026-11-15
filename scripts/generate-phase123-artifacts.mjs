import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

const outDir = path.join(REPO_ROOT, 'artifacts', 'phase123');
fs.mkdirSync(outDir, { recursive: true });

// 1. Working Tree Inventory
const statusRaw = execSync('git status --porcelain', { cwd: REPO_ROOT, encoding: 'utf8' });
const lines = statusRaw.split('\n').filter(Boolean);
const trackedModified = [];
const untracked = [];

for (const l of lines) {
  const code = l.slice(0, 2);
  const file = l.slice(3).trim();
  if (code.includes('M')) trackedModified.push(file);
  else if (code.includes('?')) untracked.push(file);
}

const trackedByDirectory = {};
for (const f of trackedModified) {
  const top = f.split('/')[0];
  trackedByDirectory[top] = (trackedByDirectory[top] || 0) + 1;
}

const untrackedByDirectory = {};
for (const f of untracked) {
  const top = f.split('/')[0];
  untrackedByDirectory[top] = (untrackedByDirectory[top] || 0) + 1;
}

const dialogDiff = execSync('git diff packages/ui-web/src/Dialog.tsx', { cwd: REPO_ROOT, encoding: 'utf8' });

const inventory = {
  phase: '123',
  title: 'Daynori Dirty Working Tree Inventory and RC5 Delta Audit',
  auditedAt: new Date().toISOString(),
  gitHeadCommit: 'f2af6577af85b13522a7cf8257420d30839141c2',
  rc5PackagingCommit: 'f70aa3f9679ae927ea603773daf139b434b59adb',
  counts: {
    trackedModifiedTotal: trackedModified.length,
    untrackedTotal: untracked.length,
    trackedByTopLevelDirectory: trackedByDirectory,
    untrackedByTopLevelDirectory: untrackedByDirectory,
  },
  filesAbsentOrModifiedRelativeToRc5: [
    {
      file: 'packages/ui-web/src/Dialog.tsx',
      status: 'TRACKED_MODIFIED_UNCOMMITTED',
      natureOfChange: 'Theme-aware modal backdrop color, backdrop blur (3px), border, and shadow adjustments',
      impactOnRc5: 'ABSENT from rc5. The rc5 web archive was compiled from apps/web/.next without these packages/ui-web updates.',
      diffSnippet: dialogDiff.slice(0, 500),
    },
    {
      file: 'infra/supabase/migrations/00077_moderation_takedown_enforcement.sql',
      status: 'TRACKED_MODIFIED_UNCOMMITTED',
      natureOfChange: 'Database migration for automated content moderation takedowns',
      impactOnRc5: 'ABSENT from rc5. Staging Supabase database runs migrations through 00069 only (preflight db-roles check confirms).',
    },
    {
      file: 'assets/brand/nori/nori-geometry.json',
      status: 'TRACKED_MODIFIED_UNCOMMITTED',
      natureOfChange: 'Nori companion icon geometry specifications',
      impactOnRc5: 'ABSENT from rc5. Brand asset updates uncompiled into static web bundle.',
    },
    {
      file: 'scripts/phase83-run-all-journeys.mjs',
      status: 'TRACKED_MODIFIED_UNCOMMITTED',
      natureOfChange: 'Journey test runner script',
      impactOnRc5: 'Developer script; excluded from production tarball.',
    },
    {
      file: 'tests/e2e/phase106-native-android-refinement.test.ts',
      status: 'TRACKED_MODIFIED_UNCOMMITTED',
      natureOfChange: 'Android refinement e2e test suite',
      impactOnRc5: 'Test suite; excluded from release tarballs.',
    },
  ],
  trackedModifiedFileList: trackedModified,
  untrackedSample: untracked.slice(0, 25),
};

fs.writeFileSync(
  path.join(outDir, 'dirty-working-tree-inventory.json'),
  JSON.stringify(inventory, null, 2),
  'utf8'
);

// 2. Preflight Reconciliation Record
execSync('node scripts/release-preflight.mjs --allow-partial-local', { cwd: REPO_ROOT, encoding: 'utf8' });
const preflightJson = JSON.parse(
  fs.readFileSync(path.join(REPO_ROOT, 'artifacts', 'release', 'preflight-last.json'), 'utf8')
);

const preflightRecord = {
  phase: '123',
  title: 'Daynori Candidate Preflight Audit and Gate Reconciliation',
  auditedAt: new Date().toISOString(),
  command: 'node scripts/release-preflight.mjs --allow-partial-local',
  summary: {
    pass: preflightJson.summary.pass,
    blocked: preflightJson.summary.blocked,
    unexecuted: preflightJson.summary.unexecuted,
    fail: preflightJson.summary.fail,
    total: preflightJson.checks.length,
    releaseEligible: preflightJson.releaseEligible,
  },
  blockedGates: preflightJson.checks.filter((r) => r.status === 'BLOCKED'),
  passedGates: preflightJson.checks.filter((r) => r.status === 'PASS'),
  unexecutedGates: preflightJson.checks.filter((r) => r.status === 'UNEXECUTED'),
};

fs.writeFileSync(
  path.join(outDir, 'preflight-reconciliation-record.json'),
  JSON.stringify(preflightRecord, null, 2),
  'utf8'
);

// 3. Claims Reclassification Matrix
const reclassificationMatrix = {
  phase: '123',
  title: 'Daynori Release-Evidence Claims Reclassification Matrix',
  auditedAt: new Date().toISOString(),
  reclassifications: [
    {
      phase: '119',
      claimCategory: 'Staging Browser Verification',
      previousOverclaim:
        '10 real headless Chrome CDP browser journeys exercised (signup, notes, tasks, routines, journal, sync conflicts, account deletion)',
      actualAssertionInScript:
        'scripts/run-phase119-https-staging-verification.mjs lines 509-605 navigated to 10 URLs (/privacy, /settings, /library, /today, /plan, /journal, /account-deletion, /help) and evaluated static DOM selectors (document.title, Boolean(header||nav), Boolean(h1||main), innerText.includes). No authenticated session was established; no notes, tasks, routines, or journals were created; no sync conflicts were triggered with real data; no account deletion was executed.',
      honestReclassifiedClaim:
        '10 unauthenticated page-presence / DOM-inspection checks verifying route reachability (HTTP 200), page titles, and layout containers',
      prohibitedLabels: ['authenticated journeys', 'browser journeys', 'user journeys exercised'],
      approvedLabel: 'unauthenticated page checks',
    },
    {
      phase: '119',
      claimCategory: 'Staging Backup and Recovery',
      previousOverclaim:
        'Staging restore drill verified (BKP-01-STAGING-RESTORE-DRILL: clean restoration of production schema to isolated staging target under RPO < 5m and RTO < 15m)',
      actualAssertionInScript:
        'scripts/run-phase119-https-staging-verification.mjs lines 388-403 executed fs.existsSync(path.join(REPO_ROOT, "docs", "engineering", "backup-and-recovery.md")). No database restoration drill was executed on hosted staging.',
      honestReclassifiedClaim:
        'Documentation and runbook protocol existence verification (docs/engineering/backup-and-recovery.md Section 4.2). Live database restore drill was NOT executed.',
      prohibitedLabels: ['restore drill verified', 'staging restore drill', 'recovery drill passed'],
      approvedLabel: 'runbook documentation verification (evidence-backupRecoveryEvidence remains blocked)',
    },
    {
      phase: '121',
      claimCategory: 'Staging Performance and Capacity',
      previousOverclaim: 'Production-scale load testing and capacity envelope verification for 10,000 users',
      actualAssertionInScript:
        'scripts/run-phase121-load-testing.mjs executed ~140 HTTP GET requests to health endpoints (/health, /v1/health, /api/health) and static assets (/, /offline-shell.html) with simulated delay. No authenticated database queries or transactional writes were executed at scale.',
      honestReclassifiedClaim:
        'Health-endpoint throughput profiling, proxy rate-limiter boundary verification, and mathematical queuing capacity modeling under Bangladesh network conditions (~140 health requests). Transactional database load testing for 10,000 users remains unexecuted.',
      prohibitedLabels: ['proof of 10,000-user capacity', '10,000-user load test', '10k capacity proven'],
      approvedLabel: 'health-request runs and mathematical capacity modeling',
    },
    {
      phase: '122',
      claimCategory: 'Production Launch Package',
      previousOverclaim:
        'Consolidated passing browser journeys, staging restore drill, and 10k capacity proof into launch package',
      actualAssertionInScript:
        'tests/release/phase122-launch-package-and-governance.test.ts asserted presence of launch package and release document reconciliation.',
      honestReclassifiedClaim:
        'Consolidated reclassified evidence: 10 page checks, runbook documentation verification, and health runs with mathematical models. Reconciled release documents to confirm 13 preflight gates remain blocked, including backupRecoveryEvidence and owner launch authorization.',
      prohibitedLabels: ['all staging gates passed', 'restore drill verified in package', 'proven 10k capacity in package'],
      approvedLabel: 'reconciled launch package with transparent blocked gates',
    },
  ],
};

fs.writeFileSync(
  path.join(outDir, 'claims-reclassification-matrix.json'),
  JSON.stringify(reclassificationMatrix, null, 2),
  'utf8'
);

console.log('Phase 123 artifacts generated successfully.');
