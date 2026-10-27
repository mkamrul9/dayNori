#!/usr/bin/env node
/**
 * Updates function-register tourTreatment refs for Phase 80 everyday coverage.
 * Does not mark Phase 81 / gated families as existing.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'docs/roadmap/v2/function-register.json');
const data = JSON.parse(readFileSync(file, 'utf8'));

const map = [
  { match: /^chapter-nav-/, ref: 'tour.navigation / chapter.navigation' },
  { match: /^chapter-find-features$/, ref: 'tour.navigation / chapter.navigation' },
  { match: /^chapter-personalization$/, ref: 'tour.personalization / chapter.navigation' },
  { match: /^chapter-tasks$/, ref: 'tour.tasks + tour.task-create-save / chapter.tasks-routines' },
  { match: /^chapter-routines$/, ref: 'tour.routines / chapter.tasks-routines' },
  { match: /^chapter-calendar$/, ref: 'tour.calendar / chapter.calendar' },
  { match: /^chapter-notes$/, ref: 'tour.notes-library / chapter.notes-library' },
  { match: /^chapter-library$/, ref: 'tour.folders-search / chapter.notes-library' },
  { match: /^chapter-search$/, ref: 'tour.folders-search / chapter.notes-library' },
  { match: /^chapter-journal$/, ref: 'tour.journal / chapter.journal' },
];

let updated = 0;
for (const action of data.actions || []) {
  const tt = action.tourTreatment;
  if (!tt || typeof tt.ref !== 'string') continue;
  // Keep Phase 81 / gated / operator / feedback planned.
  if (
    /files|audio|expenses|custom-sections|offline-portability|reminders|vault|drive|rooms|billing|assistant|feedback|operator|dangerous|account-recovery|session-recovery|offline-search/i.test(
      tt.ref
    )
  ) {
    continue;
  }
  for (const rule of map) {
    if (rule.match.test(tt.ref) || tt.ref === rule.match.source.replace(/[$^]/g, '')) {
      tt.status = 'existing';
      tt.ref = rule.ref;
      updated += 1;
      break;
    }
  }
  // Explicit ID-based everyday actions still planned by family name.
  if (tt.status === 'planned') {
    const id = action.id || '';
    if (/^(nav\.|shell\.|today\.|plan\.open|library\.open|journal\.open|help\.|search\.)/.test(id)) {
      tt.status = 'existing';
      tt.ref = 'tour.navigation / tour.help-return';
      updated += 1;
    } else if (id.startsWith('tasks.') && tt.ref.includes('chapter-tasks')) {
      tt.status = 'existing';
      tt.ref = 'tour.tasks / chapter.tasks-routines';
      updated += 1;
    } else if (id.startsWith('routines.')) {
      tt.status = 'existing';
      tt.ref = 'tour.routines / chapter.tasks-routines';
      updated += 1;
    } else if (id.startsWith('calendar.') || id.startsWith('events.')) {
      tt.status = 'existing';
      tt.ref = 'tour.calendar / chapter.calendar';
      updated += 1;
    } else if (id.startsWith('notes.') || id.startsWith('knowledge.')) {
      tt.status = 'existing';
      tt.ref = 'tour.notes-library / chapter.notes-library';
      updated += 1;
    } else if (id.startsWith('journal.')) {
      tt.status = 'existing';
      tt.ref = 'tour.journal / chapter.journal';
      updated += 1;
    } else if (id.startsWith('folders.') || id.startsWith('search.')) {
      tt.status = 'existing';
      tt.ref = 'tour.folders-search / chapter.notes-library';
      updated += 1;
    } else if (id.startsWith('personalization.') || id.includes('feature-pin') || id.includes('feature-hide')) {
      tt.status = 'existing';
      tt.ref = 'tour.personalization / chapter.navigation';
      updated += 1;
    }
  }
}

writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
console.log(`Updated ${updated} tourTreatment entries`);
