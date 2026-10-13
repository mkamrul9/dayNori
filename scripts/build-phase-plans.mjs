import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Phase specs are derived from the canonical plan. Completion evidence lives separately.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const plan = JSON.parse(fs.readFileSync(path.join(root, 'docs/roadmap/plan.json'), 'utf8'));
const checkOnly = process.argv.includes('--check');
const slug = (title) => title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const fileFor = (phase) => 'docs/roadmap/phases/' + phase.id + '-' + slug(phase.title) + '.md';
const link = (from, to) => path.relative(path.dirname(from), to).replaceAll('\\', '/');
let mismatch = 0;

for (const phase of plan.phases) {
  const filename = fileFor(phase);
  const absolute = path.join(root, filename);
  const dependencies = phase.dependsOn.length
    ? phase.dependsOn.map((id) => {
      const dependency = plan.phases.find((entry) => entry.id === id);
      if (!dependency) throw new Error('Unknown dependency: ' + id);
      return '- [' + id + ' — ' + dependency.title + '](' + link(filename, fileFor(dependency)) + ')';
    }).join('\n')
    : '- No prior phase.';
  const lines = [
    '# Phase ' + phase.id + ' — ' + phase.title,
    '',
    'Group: ' + plan.groups.find((group) => group.id === phase.group).title + '. Status is tracked in [progress](../progress.json), not inferred from this specification.',
    '',
    '> Generated from [the canonical plan](../plan.json). Refine scope there and rebuild plans; record actual results in a separate phase report.',
    '',
    '## Prerequisites', '', dependencies, '',
    'Read prerequisite reports and linked specifications before editing. A planned dependency is not satisfied by its folder or documentation alone.',
    '',
    '## Affected paths', '', ...phase.scope.map((entry) => '- ' + entry), '',
    'Paths identify intended ownership. Phase 01 creates real application/package directories; later phases may refine subdirectories without violating boundaries.',
    '',
    '## Implementation steps', '', ...phase.steps.map((entry, i) => (i + 1) + '. ' + entry), '',
    '## Acceptance', '', ...phase.acceptance.map((entry) => '- ' + entry), '',
    '## Verification and evidence', '', ...phase.checks.map((entry) => '- ' + entry), '',
    'Choose real commands from the current workspace, not guessed script names. Record exact commands, results, manual evidence, and untested platform/environment limits. Failed meaningful checks block completion.',
    '',
    '## Documentation and handoff', '',
    '- Write or update the phase report using [the report template](' + link(filename, 'docs/templates/phase-report.md') + ').',
    '- Update affected specifications, CHANGELOG.md, and progress.json in the same phase commit.',
    '- Record new design/security decisions as ADRs and link any deferred defects.',
    '- State the next ready phase and stop after this phase unless the owner selected further work.',
    '',
    '## Read before implementation', '', ...phase.references.map((entry) => '- [' + entry + '](' + link(filename, entry) + ')'), '',
    '## Commit target', '',
    '`' + phase.commit + '`', '',
    'Use one local commit after review and successful checks. Adapt the subject to the final behavior. External deployments, store approval, and required credentials are separate prerequisites; do not imply completion while they are pending.',
    ''
  ];
  const content = lines.join('\n');
  if (checkOnly) {
    if (!fs.existsSync(absolute) || fs.readFileSync(absolute, 'utf8') !== content) {
      console.error('Stale or missing phase specification: ' + filename);
      mismatch++;
    }
  } else {
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, content);
  }
}
if (mismatch) process.exitCode = 1;
else console.log((checkOnly ? 'Verified ' : 'Generated ') + plan.phases.length + ' phase specifications.');
