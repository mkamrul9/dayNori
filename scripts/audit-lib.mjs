import fs from 'node:fs';
import path from 'node:path';

/**
 * Pure policy functions for the dependency audit gate. Kept separate from the
 * CLI so tests can exercise the real logic without spawning `pnpm audit`.
 *
 * Invariant: an exception only suppresses an advisory when GHSA id, module,
 * every installed version, and every dependency path in the report are covered
 * AND a human approval record exists in the repository. Anything unexpected
 * fails closed.
 */

const SEVERITIES = new Set(['info', 'low', 'moderate', 'high', 'critical']);
const BLOCKING = new Set(['high', 'critical']);
// Values that name a role or tool rather than an accountable person.
const PLACEHOLDER_APPROVERS = new Set([
  'security-lead',
  'owner',
  'admin',
  'maintainer',
  'antigravity',
  'ai',
  'agent',
  'bot',
  'tbd',
  'todo',
]);

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
export const normalizePath = (p) => p.replace(/\\/g, '/').replace(/\s+/g, ' ').trim();

/** Validate the exceptions file shape and return every problem found. */
export function validateExceptions(raw, { now = new Date(), root = process.cwd() } = {}) {
  const errors = [];
  if (!isPlainObject(raw) || !Array.isArray(raw.dependencyVulnerabilityExceptions)) {
    return {
      errors: ['exceptions file must contain a "dependencyVulnerabilityExceptions" array'],
      exceptions: [],
    };
  }
  const exceptions = [];
  for (const [i, ex] of raw.dependencyVulnerabilityExceptions.entries()) {
    const label = `exception[${i}]`;
    if (!isPlainObject(ex)) {
      errors.push(`${label} is not an object`);
      continue;
    }
    const problems = [];
    if (typeof ex.ghsaId !== 'string' || !/^GHSA-[a-z0-9-]+$/.test(ex.ghsaId))
      problems.push('invalid ghsaId');
    if (typeof ex.module !== 'string' || !ex.module) problems.push('missing module');
    if (
      !Array.isArray(ex.installedVersions) ||
      ex.installedVersions.length === 0 ||
      !ex.installedVersions.every((v) => typeof v === 'string' && v)
    )
      problems.push('installedVersions must be a non-empty string array');
    if (
      !Array.isArray(ex.paths) ||
      ex.paths.length === 0 ||
      !ex.paths.every((v) => typeof v === 'string' && v)
    )
      problems.push('paths must be a non-empty string array');
    for (const f of ['applicability', 'remediation']) {
      if (typeof ex[f] !== 'string' || ex[f].trim().length < 20)
        problems.push(`${f} must be a substantive string`);
    }
    if (typeof ex.expiresAt !== 'string' || Number.isNaN(Date.parse(ex.expiresAt)))
      problems.push('invalid expiresAt');
    else if (new Date(ex.expiresAt) < now) problems.push(`expired on ${ex.expiresAt}`);

    const ap = ex.approval;
    if (!isPlainObject(ap)) problems.push('missing approval record');
    else {
      const who = typeof ap.approvedBy === 'string' ? ap.approvedBy.trim() : '';
      if (!who || PLACEHOLDER_APPROVERS.has(who.toLowerCase()))
        problems.push('approvedBy must name an accountable person');
      if (typeof ap.evidence !== 'string' || !ap.evidence)
        problems.push('approval.evidence must reference a repository file');
      else {
        const evidencePath = path.resolve(root, ap.evidence);
        const inside = evidencePath.startsWith(path.resolve(root) + path.sep);
        let text = '';
        if (inside && fs.existsSync(evidencePath)) text = fs.readFileSync(evidencePath, 'utf8');
        if (!text) problems.push(`approval evidence file not found: ${ap.evidence}`);
        else if (!text.includes(ex.ghsaId) || !who || !text.includes(who))
          problems.push('approval evidence must name the approver and the advisory');
      }
    }
    if (problems.length) errors.push(`${label} (${ex.ghsaId ?? 'no id'}): ${problems.join('; ')}`);
    else exceptions.push(ex);
  }
  return { errors, exceptions };
}

/** Check how `pnpm audit` terminated. `pnpm audit` exits 1 when it finds vulnerabilities. */
export function checkProcessResult(result) {
  if (result.error) return `failed to execute pnpm audit: ${result.error.message}`;
  if (result.signal) return `pnpm audit was terminated by signal ${result.signal}`;
  if (result.status !== 0 && result.status !== 1)
    return `pnpm audit exited unexpectedly with status ${result.status}`;
  return null;
}

/** Parse and structurally validate an audit report. Returns { report } or { error }. */
export function parseReport(text) {
  const output = (text || '').trim();
  if (!output) return { error: 'audit produced empty output' };
  let report;
  try {
    report = JSON.parse(output);
  } catch (e) {
    return { error: `audit output is not valid JSON: ${e.message}` };
  }
  if (!isPlainObject(report)) return { error: 'audit report is not an object' };
  if (report.error)
    return { error: `registry/audit service error: ${JSON.stringify(report.error)}` };
  if (!isPlainObject(report.advisories))
    return {
      error: 'audit report "advisories" must be an object (not missing, null, or an array)',
    };
  for (const [id, adv] of Object.entries(report.advisories)) {
    const bad = (why) => ({ error: `invalid advisory entry ${id}: ${why}` });
    if (!isPlainObject(adv)) return bad('not an object');
    if (typeof adv.module_name !== 'string' || !adv.module_name) return bad('missing module_name');
    if (typeof adv.severity !== 'string' || !SEVERITIES.has(adv.severity))
      return bad('unknown severity');
    if (
      BLOCKING.has(adv.severity) &&
      (typeof adv.github_advisory_id !== 'string' || !adv.github_advisory_id.startsWith('GHSA-'))
    )
      return bad('missing GHSA id');
    if (!Array.isArray(adv.findings) || adv.findings.length === 0) return bad('missing findings');
    for (const f of adv.findings) {
      if (
        !isPlainObject(f) ||
        typeof f.version !== 'string' ||
        !Array.isArray(f.paths) ||
        f.paths.length === 0 ||
        !f.paths.every((p) => typeof p === 'string')
      )
        return bad('malformed finding');
    }
  }
  return { report };
}

/** Split blocking advisories into unhandled and covered-by-exception. */
export function evaluateAdvisories(report, exceptions) {
  const unhandled = [];
  const excepted = [];
  for (const [id, adv] of Object.entries(report.advisories)) {
    if (!BLOCKING.has(adv.severity)) continue;
    const candidates = exceptions.filter(
      (ex) => ex.ghsaId === adv.github_advisory_id && ex.module === adv.module_name
    );
    const covered = adv.findings.every((f) =>
      candidates.some(
        (ex) =>
          ex.installedVersions.includes(f.version) &&
          f.paths.every((p) => ex.paths.map(normalizePath).includes(normalizePath(p)))
      )
    );
    const record = {
      id,
      ghsaId: adv.github_advisory_id,
      module: adv.module_name,
      severity: adv.severity,
      title: adv.title,
    };
    (covered ? excepted : unhandled).push(record);
  }
  return { unhandled, excepted };
}
