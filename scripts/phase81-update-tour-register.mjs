#!/usr/bin/env node
/**
 * Updates function-register tourTreatment refs for Phase 81 advanced/recovery coverage.
 * Maps available advanced chapters, safe explanatory treatments, and dormant capability-gated definitions.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'docs/roadmap/v2/function-register.json');
const data = JSON.parse(readFileSync(file, 'utf8'));

let updated = 0;

for (const action of data.actions || []) {
  const id = action.id || '';
  const tt = action.tourTreatment;
  if (!tt) continue;

  // Account / First use / Safe treatments
  if (id === 'account.sign-up' || id === 'account.sign-in' || id === 'account.sign-out' || id === 'account.workspace-provision' || id === 'account.privacy-terms') {
    tt.status = 'existing';
    tt.ref = 'tour.account-first-use / chapter.account-first-use';
    updated++;
  } else if (id === 'account.recover-password' || id === 'account.session-refresh') {
    tt.status = 'existing';
    tt.ref = 'tour.recovery-secrets-safe / chapter.account-first-use';
    updated++;
  } else if (id === 'account.account-deletion') {
    tt.status = 'existing';
    tt.ref = 'tour.account-deletion-safe / chapter.account-first-use';
    updated++;
  }
  // Files and audio
  else if (id.startsWith('files.') || id === 'audio.record-attach') {
    tt.status = 'existing';
    tt.ref = 'tour.files-audio / chapter.files-audio';
    updated++;
  }
  // Expenses
  else if (id.startsWith('expenses.')) {
    tt.status = 'existing';
    tt.ref = id === 'expenses.trash-restore'
      ? 'tour.expenses + tour.trash-recovery / chapter.expenses'
      : 'tour.expenses / chapter.expenses';
    updated++;
  }
  // Custom sections
  else if (id.startsWith('sections.')) {
    tt.status = 'existing';
    tt.ref = 'tour.custom-sections / chapter.custom-sections';
    updated++;
  }
  // Offline, sync, portability, search offline
  else if (id.startsWith('sync.') || id.startsWith('portability.') || id.startsWith('offline.') || id === 'search.offline-coverage') {
    tt.status = 'existing';
    tt.ref = 'tour.offline-sync / chapter.offline-sync';
    updated++;
  }
  // Support & Feedback
  else if (id.startsWith('support.')) {
    tt.status = 'existing';
    tt.ref = 'tour.help-return / chapter.help-learning';
    updated++;
  }
  // Dormant capability-gated: Reminders
  else if (id.startsWith('reminders.')) {
    tt.status = 'planned';
    tt.ref = 'tour.reminders-gated (gated Phase 69) / chapter.optional-gated';
    updated++;
  }
  // Dormant capability-gated: Vault
  else if (id.startsWith('vault.')) {
    tt.status = 'planned';
    tt.ref = 'tour.vault-gated (gated Phase 60) / chapter.optional-gated';
    updated++;
  }
  // Dormant capability-gated: Drive
  else if (id.startsWith('drive.')) {
    tt.status = 'planned';
    tt.ref = 'tour.drive-gated (gated DEF-V2-005) / chapter.optional-gated';
    updated++;
  }
  // Rooms: safe sharing existing, live chat gated
  else if (id.startsWith('rooms.')) {
    if (id === 'rooms.chat-message') {
      tt.status = 'planned';
      tt.ref = 'tour.rooms-gated (gated DEF-V2-006) / chapter.optional-gated';
    } else {
      tt.status = 'existing';
      tt.ref = 'tour.sharing-safe + tour.rooms-gated / chapter.optional-gated';
    }
    updated++;
  }
  // Billing: safe overview existing, live charges gated
  else if (id.startsWith('billing.')) {
    tt.status = 'existing';
    tt.ref = 'tour.billing-safe + tour.billing-gated / chapter.optional-gated';
    updated++;
  }
  // Dormant capability-gated: Assistant
  else if (id.startsWith('assistant.')) {
    tt.status = 'planned';
    tt.ref = 'tour.assistant-gated (gated DEF-V2-008) / chapter.optional-gated';
    updated++;
  }
  // Operator tools: excluded from user tour
  else if (id.startsWith('dev.')) {
    tt.status = 'planned';
    tt.ref = 'operator-guide-exclude-from-user-tour';
    updated++;
  }
}

writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
console.log(`Updated ${updated} tourTreatment entries in function-register.json`);
