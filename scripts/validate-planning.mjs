import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const fail = (message) => errors.push(message);
const readJSON = (file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const walk = (directory) =>
  fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    // .tools holds portable local Node installs (gitignored) — not planning docs.
    if (['.git', 'node_modules', '.next', '.expo', '.tools', 'artifacts'].includes(entry.name))
      return [];
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(absolute) : [absolute];
  });
const insideRoot = (target) => {
  const relative = path.relative(root, target);
  return relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
};

try {
  const plan = readJSON('docs/roadmap/plan.json');
  const progress = readJSON('docs/roadmap/progress.json');
  const ids = new Set();
  const groups = new Set(plan.groups.map((group) => group.id));
  for (const [index, phase] of plan.phases.entries()) {
    if (phase.id !== String(index).padStart(2, '0'))
      fail('Phase IDs must be sequential: ' + phase.id);
    if (ids.has(phase.id)) fail('Duplicate phase: ' + phase.id);
    if (!groups.has(phase.group)) fail('Unknown group: ' + phase.group);
    for (const dependency of phase.dependsOn) {
      if (!ids.has(dependency))
        fail('Dependency must exist earlier: ' + phase.id + ' -> ' + dependency);
    }
    for (const field of ['scope', 'steps', 'acceptance', 'checks', 'references']) {
      if (!Array.isArray(phase[field]) || !phase[field].length)
        fail('Missing ' + field + ': ' + phase.id);
    }
    if (!/^(docs|chore|feat|fix|test|perf|refactor)\([a-z-]+\): .+/.test(phase.commit))
      fail('Invalid commit target: ' + phase.id);
    for (const reference of phase.references) {
      if (!fs.existsSync(path.join(root, reference))) fail('Missing phase reference: ' + reference);
    }
    ids.add(phase.id);
  }
  const requirements = fs.readFileSync(path.join(root, 'docs/product/requirements.md'), 'utf8');
  const requiredIDs = new Set(
    [...requirements.matchAll(/^### (R-[A-Z]+)\b/gm)].map((match) => match[1])
  );
  const coveredIDs = new Set();
  for (const mapping of plan.featureCoverage) {
    if (!mapping.phases.length) fail('No phases for feature: ' + mapping.feature);
    for (const id of mapping.phases) if (!ids.has(id)) fail('Unknown feature phase: ' + id);
    for (const id of mapping.requirements ?? []) {
      if (!requiredIDs.has(id)) fail('Unknown requirement: ' + id);
      coveredIDs.add(id);
    }
  }
  for (const id of requiredIDs)
    if (!coveredIDs.has(id)) fail('Requirement has no roadmap mapping: ' + id);
  const progressIDs = new Set();
  const statuses = new Set(['planned', 'in_progress', 'complete', 'blocked', 'deferred']);
  for (const phase of progress.phases) {
    if (!ids.has(phase.id) || progressIDs.has(phase.id)) fail('Invalid progress ID: ' + phase.id);
    if (!statuses.has(phase.status)) fail('Invalid phase status: ' + phase.id);
    if (phase.status === 'complete') {
      if (!phase.report || !fs.existsSync(path.join(root, phase.report)))
        fail('Missing evidence report: ' + phase.id);
      const spec = plan.phases.find((entry) => entry.id === phase.id);
      for (const dependency of spec.dependsOn) {
        if (progress.phases.find((entry) => entry.id === dependency)?.status !== 'complete')
          fail('Incomplete dependency for completed phase: ' + phase.id);
      }
    }
    if ((phase.status === 'blocked' || phase.status === 'deferred') && !phase.reason)
      fail('Missing status reason: ' + phase.id);
    progressIDs.add(phase.id);
  }
  if (progressIDs.size !== ids.size) fail('Progress must list every phase exactly once.');
  const activeEntries = progress.phases.filter((phase) => phase.status === 'in_progress');
  if (activeEntries.length > 1) fail('Only one selected phase may be in progress.');
  if (progress.activePhase !== null) {
    const active = progress.phases.find((phase) => phase.id === progress.activePhase);
    if (!active || !['in_progress', 'blocked'].includes(active.status))
      fail('Active phase must be in_progress or blocked.');
    if (activeEntries.length && activeEntries[0].id !== progress.activePhase)
      fail('Active pointer differs from in-progress phase.');
  } else if (activeEntries.length) fail('An in-progress phase needs an active pointer.');
  if (progress.nextPhase !== null) {
    const next = progress.phases.find((phase) => phase.id === progress.nextPhase);
    if (!next || !['planned', 'in_progress'].includes(next.status))
      fail('Next phase must be unstarted or in progress.');
    const nextSpec = plan.phases.find((phase) => phase.id === progress.nextPhase);
    for (const dependency of nextSpec?.dependsOn ?? []) {
      if (progress.phases.find((phase) => phase.id === dependency)?.status !== 'complete')
        fail('Next phase is not ready: ' + dependency);
    }
  } else if (
    !progress.schedulingDecision &&
    progress.phases.some((phase) => phase.status === 'planned')
  )
    fail('Planned work needs a next-phase pointer or a documented scheduling decision.');

  const markdown = walk(root).filter((file) => /\.(md|mdc)$/.test(file));
  for (const file of markdown) {
    const content = fs.readFileSync(file, 'utf8');
    if (!content.endsWith('\n')) fail('Missing final newline: ' + path.relative(root, file));
    if (content.includes('\uFFFD')) fail('Replacement character: ' + path.relative(root, file));
    for (const match of content.matchAll(/\[[^\]\n]*\]\((<?[^)\n]+>?)\)/g)) {
      let target = match[1].replace(/^<|>$/g, '').split(/\s+"/)[0];
      if (/^(https?:|mailto:|app:|codex:|#)/i.test(target)) continue;
      target = decodeURIComponent(target.split('#')[0]);
      if (!target) continue;
      const absolute = path.resolve(path.dirname(file), target);
      if (!insideRoot(absolute))
        fail('Local link escapes repository: ' + path.relative(root, file) + ' -> ' + target);
      else if (!fs.existsSync(absolute))
        fail('Broken local link: ' + path.relative(root, file) + ' -> ' + target);
    }
  }
  const generation = spawnSync(
    process.execPath,
    [path.join(root, 'scripts/build-phase-plans.mjs'), '--check'],
    { encoding: 'utf8' }
  );
  if (generation.status !== 0)
    fail(generation.stderr || generation.error?.message || 'Phase generation check failed.');
  const blueprint = spawnSync(
    process.execPath,
    [path.join(root, 'scripts/build-blueprint.mjs'), '--check'],
    { encoding: 'utf8' }
  );
  if (blueprint.status !== 0)
    fail(blueprint.stderr || blueprint.error?.message || 'Blueprint generation check failed.');
  if (!errors.length) {
    console.log(
      'Planning validation passed: ' +
        ids.size +
        ' phases, ' +
        requiredIDs.size +
        ' mapped requirements, ' +
        markdown.length +
        ' Markdown files, local links and dependency/status checks.'
    );
  }
} catch (error) {
  fail(error.stack ?? error.message);
}
if (errors.length) {
  for (const error of errors) console.error(error);
  process.exitCode = 1;
}
