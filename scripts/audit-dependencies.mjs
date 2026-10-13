import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let exceptions = [];
const exceptionsPath = path.join(root, '.security-exceptions.json');
if (fs.existsSync(exceptionsPath)) {
  try {
    const raw = JSON.parse(fs.readFileSync(exceptionsPath, 'utf8'));
    exceptions = raw.dependencyVulnerabilityExceptions ?? [];
  } catch (err) {
    console.error('Warning: Failed to parse .security-exceptions.json:', err.message);
  }
}

console.log('Running dependency vulnerability audit via pnpm audit...');
const isWindows = process.platform === 'win32';
const pnpmCmd = isWindows ? 'pnpm.cmd' : 'pnpm';

const auditResult = spawnSync(pnpmCmd, ['audit', '--audit-level=high', '--json'], {
  cwd: root,
  encoding: 'utf8',
  shell: true,
});

if (auditResult.error) {
  console.error('Failed to execute pnpm audit:', auditResult.error.message);
  process.exit(1);
}

// pnpm audit exits with 1 when vulnerabilities are present, and outputs JSON
let output = auditResult.stdout;
if (!output && auditResult.stderr) {
  output = auditResult.stderr;
}

try {
  const json = JSON.parse(output);
  const advisories = json.advisories ?? {};
  const unhandled = [];
  let exceptedCount = 0;

  for (const [id, adv] of Object.entries(advisories)) {
    const severity = adv.severity;
    if (severity === 'high' || severity === 'critical') {
      const isExcepted = exceptions.some((ex) => {
        if (ex.id && String(ex.id) === String(id)) return true;
        if (ex.ghsaId && ex.ghsaId === adv.github_advisory_id) return true;
        if (ex.module && ex.module === adv.module_name) return true;
        return false;
      });

      if (!isExcepted) {
        unhandled.push({
          id,
          module: adv.module_name,
          title: adv.title,
          severity: adv.severity,
          url: adv.url || adv.github_advisory_id,
        });
      } else {
        exceptedCount++;
      }
    }
  }

  if (unhandled.length > 0) {
    console.error(
      `Audit failed: ${unhandled.length} unapproved high/critical vulnerability(ies) found:`
    );
    for (const u of unhandled) {
      console.error(`  - [${u.severity.toUpperCase()}] ${u.module} (${u.title}): ${u.url}`);
    }
    process.exit(1);
  }

  console.log(
    `Dependency audit passed: 0 unapproved vulnerabilities (${exceptedCount} approved high/critical exception(s) documented).`
  );
  process.exit(0);
} catch (e) {
  if (auditResult.status === 0) {
    console.log('Dependency audit passed: clean vulnerability report.');
    process.exit(0);
  } else {
    console.error('Failed to parse pnpm audit output as JSON:', e.message);
    if (output) console.error(output.slice(0, 500));
    process.exit(1);
  }
}
