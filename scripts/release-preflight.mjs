#!/usr/bin/env node
/**
 * Daynori release eligibility preflight (Phase 60).
 *
 * Engineering verification only — a successful local rehearsal MUST NEVER grant
 * human launch authorization or initiate store/publication actions.
 *
 * Exit codes:
 *   0 — engineering checks that were runnable passed; human OA still required separately
 *   1 — fail-closed (missing evidence, contradictions, placeholders, failed checks)
 *   2 — usage / environment error
 *
 * Usage:
 *   node scripts/release-preflight.mjs [--manifest path] [--json-out path] [--allow-partial-local]
 */
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { inspectAndroidTree } from './mobile-android-release-path.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

const DEFAULT_MANIFEST = path.join(
  REPO_ROOT,
  'docs',
  'release',
  'manifest-0.1.0-provisional.json'
);

/** @typedef {{ id: string, status: 'PASS'|'FAIL'|'BLOCKED'|'UNEXECUTED', detail: string }} Check */

function git(args) {
  try {
    return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

function fileSha256(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function isPlaceholder(value) {
  if (value == null) return true;
  const s = String(value);
  return (
    s.length === 0 ||
    /UNRESOLVED|replace_with_|PROVISIONAL|TODO|TBD|pending/i.test(s) ||
    s === 'UNRESOLVED_UNTIL_SIGNED_BUILD'
  );
}

/**
 * Pure eligibility evaluation for tests.
 * @param {{ manifest: object, env: NodeJS.ProcessEnv, gitRevision: string|null, androidInspection: object|null, evidence: Record<string, boolean|string|null>, nodeVersion: string }} input
 */
export function evaluateReleaseEligibility(input) {
  /** @type {Check[]} */
  const checks = [];
  const push = (id, status, detail) => checks.push({ id, status, detail });

  const { manifest, env, gitRevision, androidInspection, evidence, nodeVersion } = input;

  // --- Identity / revision ---
  if (!gitRevision) {
    push('git-revision', 'FAIL', 'Unable to resolve exact source revision');
  } else {
    push('git-revision', 'PASS', `HEAD ${gitRevision}`);
  }

  if (manifest.notAnApprovalToLaunch !== true) {
    push(
      'manifest-not-approval',
      'FAIL',
      'Manifest must set notAnApprovalToLaunch=true; JSON validity alone is not release eligibility'
    );
  } else {
    push('manifest-not-approval', 'PASS', 'Manifest explicitly denies launch approval');
  }

  if (manifest.label === 'local-launch-preparation' || /provisional/i.test(manifest.manifestVersion || '')) {
    push(
      'manifest-provisional',
      'BLOCKED',
      'Provisional/local-preparation manifest cannot become release-eligible without replacing vague evidence and owner OA'
    );
  }

  // --- Versions ---
  const versions = manifest.versions || {};
  for (const key of ['web', 'mobile', 'api', 'monorepo']) {
    if (isPlaceholder(versions[key])) {
      push(`version-${key}`, 'FAIL', `Missing version for ${key}`);
    } else {
      push(`version-${key}`, 'PASS', String(versions[key]));
    }
  }
  if (isPlaceholder(versions.androidVersionCode)) {
    push(
      'android-version-code',
      'BLOCKED',
      'androidVersionCode unresolved until signed build evidence exists'
    );
  } else {
    push('android-version-code', 'PASS', String(versions.androidVersionCode));
  }

  // --- Feature inventory vs gates ---
  const disabled = manifest.disabledInProposedRelease || {};
  for (const [name, meta] of Object.entries(disabled)) {
    if (meta && meta.enabled === true) {
      push(`disabled-inventory-${name}`, 'FAIL', `${name} listed disabled but enabled=true`);
    } else {
      push(`disabled-inventory-${name}`, 'PASS', `${name} disabled in inventory`);
    }
  }

  if (env.NODE_ENV === 'production') {
    if (env.DAYNORI_ROOMS_LOCAL_ENABLED === 'true') {
      push(
        'flag-rooms-prod',
        'FAIL',
        'DAYNORI_ROOMS_LOCAL_ENABLED must not activate rooms in production (gate must ignore it)'
      );
    } else {
      push('flag-rooms-prod', 'PASS', 'Rooms local flag absent or irrelevant under production');
    }
    if (env.DAYNORI_AI_LOCAL_ENABLED === 'true' || env.DAYNORI_AI_LIVE_ENABLED === 'true') {
      push('flag-ai-prod', 'FAIL', 'AI local/live flags must not enable production AI');
    } else {
      push('flag-ai-prod', 'PASS', 'AI flags not enabling production');
    }
    if (
      env.DAYNORI_BILLING_LOCAL_ENABLED === 'true' ||
      env.DAYNORI_BILLING_PRODUCTION_ENABLED === 'true'
    ) {
      push('flag-billing-prod', 'FAIL', 'Billing flags must not enable production charges');
    } else {
      push('flag-billing-prod', 'PASS', 'Billing production activation off');
    }
  } else {
    push(
      'flag-prod-env',
      'UNEXECUTED',
      `NODE_ENV=${env.NODE_ENV ?? 'unset'} — production flag matrix not asserted in this process`
    );
  }

  // Explicit local-test signing must never pass eligibility
  if (env.DAYNORI_ALLOW_DEBUG_RELEASE_SIGNING === 'true') {
    push(
      'debug-release-signing',
      'FAIL',
      'DAYNORI_ALLOW_DEBUG_RELEASE_SIGNING=true → debug-signed artifact is not release-eligible'
    );
  } else {
    push('debug-release-signing', 'PASS', 'Local-test debug release signing flag not set');
  }

  // --- Android signing / SDK inspection ---
  // Workspace android/ may be stale (gitignored). Disposable prebuild evidence is authoritative
  // for local engineering; packaging must use a regenerated tree, never a failing workspace tree.
  const disposableOk = evidence.androidDisposablePrebuildOk === true;
  if (!androidInspection) {
    push(
      'android-tree',
      disposableOk ? 'BLOCKED' : 'UNEXECUTED',
      disposableOk
        ? 'No workspace android tree; disposable prebuild evidence recorded separately'
        : 'No android tree inspection supplied'
    );
  } else if (!androidInspection.ok) {
    push(
      'android-workspace-tree',
      'FAIL',
      (androidInspection.errors || []).join('; ') || 'Workspace android tree failed inspection'
    );
    if (disposableOk) {
      push(
        'android-disposable-prebuild',
        'PASS',
        String(evidence.androidDisposablePrebuildPath || 'disposable prebuild inspection ok')
      );
    } else {
      push(
        'android-disposable-prebuild',
        'BLOCKED',
        'Run: node scripts/mobile-android-release-path.mjs prebuild-disposable'
      );
    }
  } else {
    push(
      'android-tree',
      'PASS',
      `targetSdk=${androidInspection.findings?.targetSdk} compileSdk=${androidInspection.findings?.compileSdk} guard=present`
    );
  }

  // --- Migrations / roles ---
  if (isPlaceholder(manifest.migrationsRequired)) {
    push('migrations', 'FAIL', 'migrationsRequired missing');
  } else {
    push('migrations', 'PASS', String(manifest.migrationsRequired));
  }
  if (!evidence.dbRolesVerified) {
    push('db-roles', 'BLOCKED', 'Required database roles not verified for this candidate');
  } else {
    push('db-roles', 'PASS', String(evidence.dbRolesVerified));
  }

  // --- Evidence inventory (traceable records) ---
  const evidenceRequirements = [
    ['deviceEvidence', 'Physical device / TalkBack / KeyStore evidence (Phase 37)'],
    ['betaEvidence', 'Private beta cohort evidence (Phase 38)'],
    ['accessibilityEvidence', 'Accessibility acceptance evidence'],
    ['backupRecoveryEvidence', 'Backup/recovery drill for matching versions'],
    ['opsEvidence', 'Operational ownership / monitoring / support'],
    ['signedArtifactEvidence', 'Signed AAB/APK hash + signer identity'],
    ['sixteenKbEvidence', '16 KB page-size / native lib alignment on built artifact'],
    ['ownerApproval', 'Owner/operator launch authorization for this exact candidate'],
  ];

  for (const [key, label] of evidenceRequirements) {
    const val = evidence[key];
    if (!val || isPlaceholder(val)) {
      push(`evidence-${key}`, 'BLOCKED', `${label} missing or placeholder`);
    } else {
      push(`evidence-${key}`, 'PASS', String(val));
    }
  }

  // Vague phase-report-only pointers in enabled features → demote
  const enabled = manifest.enabledInProposedRelease || {};
  for (const [name, meta] of Object.entries(enabled)) {
    if (!meta?.enabled) continue;
    const ev = meta.evidence || '';
    if (/prior phase reports|Phases \d+\+ reports|file lifecycle/i.test(ev) && !evidence[`trace-${name}`]) {
      push(
        `evidence-enabled-${name}`,
        'BLOCKED',
        `Enabled feature "${name}" still cites vague evidence ("${ev}"); needs traceable record for candidate`
      );
    } else {
      push(`evidence-enabled-${name}`, 'PASS', ev || 'traceable');
    }
  }

  // --- Runtime ---
  const enginesPath = path.join(REPO_ROOT, 'package.json');
  let wantedNode = null;
  try {
    wantedNode = readJson(enginesPath).engines?.node;
  } catch {
    /* ignore */
  }
  if (wantedNode && nodeVersion) {
    // Soft check: record mismatch as BLOCKED for supported-runtime verification
    const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(nodeVersion);
    const want = /\^?(\d+)\.(\d+)\.(\d+)/.exec(wantedNode);
    if (m && want) {
      const [maj, min, pat] = [Number(m[1]), Number(m[2]), Number(m[3])];
      const [wMaj, wMin, wPat] = [Number(want[1]), Number(want[2]), Number(want[3])];
      const ok =
        maj === wMaj && (min > wMin || (min === wMin && pat >= wPat));
      if (!ok) {
        push(
          'node-engines',
          'BLOCKED',
          `Installed ${nodeVersion} does not satisfy engines.node ${wantedNode}; do not claim supported-runtime verification`
        );
      } else {
        push('node-engines', 'PASS', `${nodeVersion} satisfies ${wantedNode}`);
      }
    }
  }

  // --- Human authorization boundary ---
  push(
    'human-launch-authorization',
    'BLOCKED',
    'Engineering preflight never grants operator approval or initiates publication'
  );

  const failed = checks.filter((c) => c.status === 'FAIL');
  const blocked = checks.filter((c) => c.status === 'BLOCKED');
  const eligible =
    failed.length === 0 &&
    blocked.length === 0 &&
    checks.every((c) => c.status === 'PASS' || c.status === 'UNEXECUTED');

  // UNEXECUTED alone should not grant eligibility for public release
  const unexecutedCritical = checks.filter(
    (c) =>
      c.status === 'UNEXECUTED' &&
      ['android-tree', 'signedArtifactEvidence'].some((x) => c.id.includes(x) || c.id === x)
  );

  return {
    eligible: false, // hard rule: this script never reports release-eligible for provisional local work
    engineeringClear: failed.length === 0,
    wouldBeEligibleIfHumanAndEvidence: eligible && unexecutedCritical.length === 0,
    checks,
    summary: {
      pass: checks.filter((c) => c.status === 'PASS').length,
      fail: failed.length,
      blocked: blocked.length,
      unexecuted: checks.filter((c) => c.status === 'UNEXECUTED').length,
    },
  };
}

function loadDefaultEvidence() {
  const evidenceDir = path.join(REPO_ROOT, 'docs', 'release', 'evidence');
  const pointer = path.join(evidenceDir, 'candidate-evidence.json');
  if (fs.existsSync(pointer)) {
    return readJson(pointer);
  }
  // Pending placeholders — must not silently pass
  return {
    deviceEvidence: null,
    betaEvidence: null,
    accessibilityEvidence: null,
    backupRecoveryEvidence: 'docs/phase-reports/phase-58.md#dr-drill (reuse pending candidate match)',
    opsEvidence: null,
    signedArtifactEvidence: null,
    sixteenKbEvidence: null,
    ownerApproval: null,
    dbRolesVerified: null,
  };
}

function main() {
  const args = process.argv.slice(2);
  const manifestFlag = args.indexOf('--manifest');
  const jsonOutFlag = args.indexOf('--json-out');
  const manifestPath =
    manifestFlag >= 0 && args[manifestFlag + 1]
      ? path.resolve(args[manifestFlag + 1])
      : DEFAULT_MANIFEST;
  const jsonOut =
    jsonOutFlag >= 0 && args[jsonOutFlag + 1]
      ? path.resolve(args[jsonOutFlag + 1])
      : path.join(REPO_ROOT, 'artifacts', 'release', 'preflight-last.json');

  if (!fs.existsSync(manifestPath)) {
    console.error(`[release-preflight] Manifest missing: ${manifestPath}`);
    process.exit(2);
  }

  const manifest = readJson(manifestPath);
  const gitRevision = git(['rev-parse', 'HEAD']);
  const evidence = loadDefaultEvidence();

  let androidInspection = null;
  const androidDir = path.join(REPO_ROOT, 'apps', 'mobile', 'android');
  if (fs.existsSync(androidDir)) {
    androidInspection = inspectAndroidTree(androidDir);
  }

  const disposableReportPath = path.join(
    REPO_ROOT,
    'artifacts',
    'release',
    'android-prebuild-inspection.json'
  );
  if (fs.existsSync(disposableReportPath)) {
    try {
      const disposable = readJson(disposableReportPath);
      if (disposable?.inspection?.ok) {
        evidence.androidDisposablePrebuildOk = true;
        evidence.androidDisposablePrebuildPath = path
          .relative(REPO_ROOT, disposableReportPath)
          .replace(/\\/g, '/');
      }
    } catch {
      /* ignore malformed */
    }
  }

  const result = evaluateReleaseEligibility({
    manifest,
    env: process.env,
    gitRevision,
    androidInspection,
    evidence,
    nodeVersion: process.version,
  });

  const artifactHashes = {
    manifestSha256: fileSha256(manifestPath),
    checklistSha256: fileSha256(
      path.join(REPO_ROOT, 'docs', 'release', 'launch-checklist-0.1.0.md')
    ),
  };

  const report = {
    createdAt: new Date().toISOString(),
    gitRevision,
    manifestPath: path.relative(REPO_ROOT, manifestPath).replace(/\\/g, '/'),
    artifactHashes,
    notHumanAuthorization: true,
    releaseEligible: false,
    engineeringClear: result.engineeringClear,
    summary: result.summary,
    checks: result.checks,
    androidInspection,
  };

  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, JSON.stringify(report, null, 2) + '\n');

  console.log('[release-preflight] Engineering verification (not launch authorization)');
  console.log(JSON.stringify(result.summary, null, 2));
  for (const c of result.checks) {
    console.log(`  [${c.status}] ${c.id}: ${c.detail}`);
  }
  console.log(`[release-preflight] Wrote ${jsonOut}`);
  console.log('[release-preflight] releaseEligible=false (human OA + external blockers remain)');

  // Fail closed when FAIL present, or when called without --allow-partial-local and BLOCKED remain.
  // --allow-partial-local: local rehearsal may continue when the only FAIL is a stale workspace
  // android/ tree AND disposable prebuild evidence PASSed (still not release-eligible).
  const allowPartial = args.includes('--allow-partial-local');
  const fails = result.checks.filter((c) => c.status === 'FAIL');
  const onlyStaleWorkspace =
    fails.length > 0 &&
    fails.every((c) => c.id === 'android-workspace-tree') &&
    evidence.androidDisposablePrebuildOk === true;

  if (fails.length > 0 && !(allowPartial && onlyStaleWorkspace)) {
    process.exit(1);
  }
  if (!allowPartial && result.summary.blocked > 0) {
    process.exit(1);
  }
  process.exit(0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
