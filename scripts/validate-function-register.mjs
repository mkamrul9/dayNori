#!/usr/bin/env node
/**
 * Validates docs/roadmap/v2/function-register.json against Phase 65 schema rules.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const registerPath = path.join(root, 'docs/roadmap/v2/function-register.json');
const planPath = path.join(root, 'docs/roadmap/plan.json');
const errors = [];
const fail = (m) => errors.push(m);

const READY = new Set([
  'unverified',
  'verified_local',
  'verified_staging_provider',
  'verified_physical_device',
  'release_ready',
  'blocked',
  'owner_deferred',
]);
const OBSERVED = new Set(['pass', 'fail', 'unavailable', 'skipped', 'untested']);
const IMPL = new Set(['existing', 'planned', 'gated', 'missing']);
const HELP = new Set(['existing', 'planned', 'missing']);
const SEVERITY = new Set(['critical', 'high', 'medium', 'low']);
const LAYERS = new Set([
  'domain_unit',
  'api_integration',
  'browser_ui',
  'provider_authenticated',
  'emulator',
  'physical_device',
]);
const PLATFORM = new Set(['supported', 'partial', 'unsupported', 'gated', 'unknown']);
const RELEASE = new Set(['available', 'unavailable', 'partial', 'unknown']);

const requiredActionFields = [
  'id',
  'featureFamily',
  'userBenefit',
  'description',
  'implementationStatus',
  'entryPoints',
  'implementationPaths',
  'platforms',
  'releaseCapability',
  'authorization',
  'personalVisibility',
  'readiness',
  'dependencies',
  'owner',
  'acceptanceJourney',
  'validationNegativeCases',
  'offlineRetryConflict',
  'existingTests',
  'observedResult',
  'evidenceRefs',
  'evidenceMeta',
  'repairPhase',
  'helpArticle',
  'tourTreatment',
];

if (!fs.existsSync(registerPath)) {
  console.error('Missing function-register.json');
  process.exit(1);
}

const register = JSON.parse(fs.readFileSync(registerPath, 'utf8'));
const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
const phaseIds = new Set(plan.phases.map((p) => p.id));
const families = new Set(register.featureFamilies || []);

if (register.schemaVersion !== 1) fail('schemaVersion must be 1');
if (!register.baseRevision) fail('baseRevision required');
if (!Array.isArray(register.actions) || !register.actions.length) fail('actions required');
if (!Array.isArray(register.defects)) fail('defects array required');

const actionIds = new Set();
const defectIds = new Set();
const coveredFamilies = new Set();

for (const action of register.actions) {
  for (const field of requiredActionFields) {
    if (!(field in action)) fail(`Action ${action.id || '?'} missing ${field}`);
  }
  if (!action.id || actionIds.has(action.id)) fail(`Duplicate or empty action id: ${action.id}`);
  actionIds.add(action.id);
  if (!families.has(action.featureFamily)) fail(`Unknown family on ${action.id}`);
  coveredFamilies.add(action.featureFamily);
  if (!IMPL.has(action.implementationStatus)) fail(`Bad implementationStatus on ${action.id}`);
  if (!READY.has(action.readiness)) fail(`Bad readiness on ${action.id}`);
  if (!OBSERVED.has(action.observedResult)) fail(`Bad observedResult on ${action.id}`);
  if (!phaseIds.has(action.repairPhase))
    fail(`Unknown repairPhase ${action.repairPhase} on ${action.id}`);
  if (!HELP.has(action.helpArticle?.status)) fail(`Bad helpArticle.status on ${action.id}`);
  if (!HELP.has(action.tourTreatment?.status)) fail(`Bad tourTreatment.status on ${action.id}`);
  if (!LAYERS.has(action.evidenceMeta?.evidenceLayer)) fail(`Bad evidenceLayer on ${action.id}`);
  for (const key of ['web', 'installedPwa', 'android', 'iosNative']) {
    if (!PLATFORM.has(action.platforms?.[key])) fail(`Bad platform ${key} on ${action.id}`);
  }
  for (const key of ['local', 'hostedPreview']) {
    if (!RELEASE.has(action.releaseCapability?.[key]))
      fail(`Bad releaseCapability.${key} on ${action.id}`);
  }
  if (action.readiness === 'release_ready') {
    fail(
      `${action.id}: release_ready forbidden in Phase 65 baseline without full release gates (none expected)`
    );
  }
  if (action.readiness === 'owner_deferred' && !action.ownerDecisionRef) {
    fail(`${action.id}: owner_deferred requires ownerDecisionRef`);
  }
  if (action.readiness === 'blocked' && !action.blockerOrDefect) {
    fail(`${action.id}: blocked readiness requires blockerOrDefect`);
  }
  if (action.blockerOrDefect && !String(action.blockerOrDefect).startsWith('DEF-')) {
    fail(`${action.id}: blockerOrDefect must be DEF-* id`);
  }
  // Declared future help/tour refs may not exist; only check existing status refs that look like paths.
  if (action.helpArticle.status === 'existing' && action.helpArticle.ref.startsWith('docs/')) {
    if (!fs.existsSync(path.join(root, action.helpArticle.ref))) {
      fail(`${action.id}: missing help ref ${action.helpArticle.ref}`);
    }
  }
  for (const ref of action.evidenceRefs || []) {
    if (ref.startsWith('artifacts/local/')) continue; // gitignored working evidence
    if (ref.startsWith('artifacts/web-e2e/')) {
      // Historical sibling captures may exist; warn only via coverage notes if missing.
      continue;
    }
    if (ref.startsWith('docs/') || ref.startsWith('tests/') || ref.startsWith('apps/')) {
      if (!fs.existsSync(path.join(root, ref))) fail(`${action.id}: missing evidence ref ${ref}`);
    }
  }
}

for (const family of families) {
  if (!coveredFamilies.has(family)) fail(`Feature family not covered by any action: ${family}`);
}

for (const defect of register.defects) {
  if (!defect.id || defectIds.has(defect.id)) fail(`Duplicate defect id: ${defect.id}`);
  defectIds.add(defect.id);
  if (!SEVERITY.has(defect.severity)) fail(`Bad severity on ${defect.id}`);
  if (!phaseIds.has(defect.owningPhase)) fail(`Unknown owningPhase on ${defect.id}`);
  for (const aid of defect.affectedActions || []) {
    if (!actionIds.has(aid)) fail(`${defect.id} references unknown action ${aid}`);
  }
  for (const field of [
    'title',
    'userImpact',
    'expected',
    'observed',
    'reproduction',
    'environment',
    'nextAction',
  ]) {
    if (!(field in defect)) fail(`Defect ${defect.id} missing ${field}`);
  }
}

for (const action of register.actions) {
  if (action.blockerOrDefect && !defectIds.has(action.blockerOrDefect)) {
    fail(`${action.id} blockerOrDefect ${action.blockerOrDefect} not in defects`);
  }
}

if (errors.length) {
  console.error(`function-register validation FAILED (${errors.length}):`);
  for (const e of errors) console.error(' - ' + e);
  process.exit(1);
}

console.log(
  `function-register OK: ${actionIds.size} actions, ${defectIds.size} defects, ${families.size} families covered`
);
