import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  checkProcessResult,
  evaluateAdvisories,
  normalizePath,
  parseReport,
  validateExceptions,
} from './audit-lib.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fail = (msg) => {
  console.error(`Audit failed: ${msg}`);
  process.exit(1);
};

const exceptionsPath = path.join(root, '.security-exceptions.json');
if (!fs.existsSync(exceptionsPath)) fail('required .security-exceptions.json is missing.');

let rawExceptions;
try {
  rawExceptions = JSON.parse(fs.readFileSync(exceptionsPath, 'utf8'));
} catch (err) {
  fail(`.security-exceptions.json is not valid JSON: ${err.message}`);
}

const { errors, exceptions } = validateExceptions(rawExceptions, { root });
if (errors.length) {
  // Invalid entries are reported but never honored; the audit still runs so the
  // output shows exactly which advisories are left uncovered.
  console.error('Rejected security exceptions:');
  for (const e of errors) console.error(`  - ${e}`);
}

console.log('Running dependency vulnerability audit via pnpm audit...');
const pnpmCmd = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
// shell is required for .cmd shims on Windows; arguments are static.
const result = spawnSync(pnpmCmd, ['audit', '--audit-level=high', '--json'], {
  cwd: root,
  encoding: 'utf8',
  shell: process.platform === 'win32',
  maxBuffer: 50 * 1024 * 1024,
});

const processProblem = checkProcessResult(result);
if (processProblem) fail(processProblem);

const parsed = parseReport(result.stdout);
if (parsed.error) fail(parsed.error);

const { unhandled, excepted } = evaluateAdvisories(parsed.report, exceptions);
if (process.argv.includes('--print-proposal')) {
  const drafts = unhandled.map((u) => {
    const adv = parsed.report.advisories[u.id];
    return {
      ghsaId: u.ghsaId,
      module: u.module,
      installedVersions: [...new Set(adv.findings.map((f) => f.version))],
      paths: [...new Set(adv.findings.flatMap((f) => f.paths.map(normalizePath)))],
      patchedVersions: adv.patched_versions,
      applicability: 'OWNER TO COMPLETE',
      remediation: 'OWNER TO COMPLETE',
      expiresAt: 'OWNER TO COMPLETE',
      approval: null,
    };
  });
  console.log(JSON.stringify(drafts, null, 2));
}
if (unhandled.length > 0) {
  console.error(`\nAudit failed: ${unhandled.length} unapproved high/critical advisory(ies):`);
  for (const u of unhandled) {
    console.error(
      `  - [${u.severity.toUpperCase()}] ${u.module} (${u.title}): ${u.ghsaId} -> https://github.com/advisories/${u.ghsaId}`
    );
  }
  process.exit(1);
}
if (errors.length) fail('security exception file contains invalid entries.');

console.log(
  `Dependency audit passed: 0 unapproved high/critical advisories (${excepted.length} covered by approved exceptions).`
);
