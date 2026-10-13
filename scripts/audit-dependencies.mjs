import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// 1. Load and validate security exceptions configuration
const exceptionsPath = path.join(root, '.security-exceptions.json');
let exceptions = [];

if (!fs.existsSync(exceptionsPath)) {
  console.error(
    'Error: Required security configuration file .security-exceptions.json is missing.'
  );
  process.exit(1);
}

try {
  const content = fs.readFileSync(exceptionsPath, 'utf8');
  const raw = JSON.parse(content);
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.dependencyVulnerabilityExceptions)) {
    console.error(
      'Error: .security-exceptions.json must contain a "dependencyVulnerabilityExceptions" array.'
    );
    process.exit(1);
  }
  exceptions = raw.dependencyVulnerabilityExceptions;
} catch (err) {
  console.error('Error: Failed to parse .security-exceptions.json as valid JSON:', err.message);
  process.exit(1);
}

// 2. Validate exception entry contracts and expiration
const now = new Date();
for (const ex of exceptions) {
  if (!ex.ghsaId || typeof ex.ghsaId !== 'string' || !ex.ghsaId.startsWith('GHSA-')) {
    console.error(
      `Error: Exception for module "${ex.module}" is missing a valid "ghsaId" (must start with GHSA-).`
    );
    process.exit(1);
  }
  if (!ex.module || typeof ex.module !== 'string') {
    console.error(`Error: Exception "${ex.ghsaId}" is missing a valid "module" name.`);
    process.exit(1);
  }
  if (!ex.approvedBy || typeof ex.approvedBy !== 'string') {
    console.error(`Error: Exception "${ex.ghsaId}" is missing an accountable "approvedBy" signer.`);
    process.exit(1);
  }
  if (!ex.remediation || typeof ex.remediation !== 'string') {
    console.error(`Error: Exception "${ex.ghsaId}" is missing an actionable "remediation" plan.`);
    process.exit(1);
  }
  if (!ex.expiresAt || isNaN(Date.parse(ex.expiresAt))) {
    console.error(`Error: Exception "${ex.ghsaId}" is missing a valid ISO "expiresAt" date.`);
    process.exit(1);
  }
  if (new Date(ex.expiresAt) < now) {
    console.error(
      `Error: Security exception "${ex.ghsaId}" for module "${ex.module}" expired on ${ex.expiresAt}.`
    );
    process.exit(1);
  }
}

// 3. Execute pnpm audit
console.log('Running dependency vulnerability audit via pnpm audit...');
const isWindows = process.platform === 'win32';
const pnpmCmd = isWindows ? 'pnpm.cmd' : 'pnpm';

const auditResult = spawnSync(pnpmCmd, ['audit', '--audit-level=high', '--json'], {
  cwd: root,
  encoding: 'utf8',
  shell: true,
  maxBuffer: 50 * 1024 * 1024,
});

if (auditResult.error) {
  console.error('Failed to execute pnpm audit process:', auditResult.error.message);
  process.exit(1);
}

// 4. Validate output format and check for process/registry errors
let output = (auditResult.stdout || '').trim();
if (!output && auditResult.stderr) {
  output = auditResult.stderr.trim();
}

if (!output) {
  console.error('Error: pnpm audit produced empty output.');
  process.exit(1);
}

let report;
try {
  report = JSON.parse(output);
} catch (e) {
  console.error('Error: Failed to parse pnpm audit output as JSON:', e.message);
  console.error('Raw audit output snippet:', output.slice(0, 500));
  process.exit(1);
}

if (report.error) {
  console.error('Registry/Audit service error reported by pnpm:', JSON.stringify(report.error));
  process.exit(1);
}

if (!report.advisories || typeof report.advisories !== 'object') {
  console.error('Error: Unexpected audit report format: missing "advisories" object.');
  process.exit(1);
}

// 5. Evaluate advisories against granular exceptions
const advisories = report.advisories;
const unhandled = [];
let exceptedCount = 0;

for (const [id, adv] of Object.entries(advisories)) {
  const severity = adv.severity;
  if (severity === 'high' || severity === 'critical') {
    const ghsaId = adv.github_advisory_id;
    const matchingException = exceptions.find(
      (ex) => ex.ghsaId === ghsaId && ex.module === adv.module_name
    );

    if (!matchingException) {
      unhandled.push({
        id,
        ghsaId: ghsaId || id,
        module: adv.module_name,
        title: adv.title,
        severity: adv.severity,
        url: adv.url || `https://github.com/advisories/${ghsaId}`,
      });
    } else {
      exceptedCount++;
    }
  }
}

if (unhandled.length > 0) {
  console.error(
    `\nAudit failed: ${unhandled.length} unapproved high/critical vulnerability(ies) found:`
  );
  for (const u of unhandled) {
    console.error(
      `  - [${u.severity.toUpperCase()}] ${u.module} (${u.title}): ${u.ghsaId} -> ${u.url}`
    );
  }
  process.exit(1);
}

console.log(
  `Dependency audit passed: 0 unapproved vulnerabilities (${exceptedCount} approved high/critical advisory exception(s) documented).`
);
process.exit(0);
