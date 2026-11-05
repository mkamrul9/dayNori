#!/usr/bin/env node
/** Writes public essential Help JSON for offline shell / Cache Storage (public instructional only). */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

// Prefer built dist; fall back to reading catalogData via dynamic import after build.
async function main() {
  let articles;
  try {
    const mod = await import(path.join(root, 'packages/domain/dist/help/index.js').replace(/\\/g, '/'));
    articles = mod.getEssentialOfflineHelp();
  } catch {
    // Generate from catalogData source without full build: parse is heavy; run domain build first.
    console.error('Build @daynori/domain first: pnpm --filter @daynori/domain build');
    process.exit(1);
  }

  const payload = {
    contentVersion: 1,
    generatedAt: new Date().toISOString(),
    note: 'Public instructional subset only. No private HTML/API/user data.',
    articles: articles.map((a) => ({
      id: a.id,
      title: a.title.defaultText,
      summary: a.summary.defaultText,
      steps: a.steps.map((s) => s.instruction.defaultText),
      expectedResult: a.expectedResult.defaultText,
      failures: a.failures.map((f) => ({
        symptom: f.symptom.defaultText,
        recovery: f.recovery.defaultText,
      })),
    })),
  };

  const out = path.join(root, 'apps/web/public/help-essential.json');
  fs.writeFileSync(out, JSON.stringify(payload, null, 2) + '\n');
  console.log(`Wrote ${out} (${payload.articles.length} articles)`);
}

main();
