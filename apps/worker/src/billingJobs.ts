/**
 * Phase 57 — Durable billing event reconciliation (provisional local).
 * Loads API processBillingEvent (same pattern as AI/Drive jobs).
 */

import { pathToFileURL } from 'node:url';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DatabaseClient } from './worker.js';

async function loadProcessBillingEvent(): Promise<{
  processBillingEvent: (
    client: DatabaseClient,
    input: { eventId: string }
  ) => Promise<void>;
}> {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, '../../api/dist/modules/billing/service.js'),
    join(here, '../../api/src/modules/billing/service.ts'),
  ];
  let lastErr: unknown;
  for (const candidate of candidates) {
    try {
      const href = pathToFileURL(candidate).href;
      return (await import(href)) as {
        processBillingEvent: (
          client: DatabaseClient,
          input: { eventId: string }
        ) => Promise<void>;
      };
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error('Unable to load billing processBillingEvent');
}

export async function reconcilePendingBillingEvents(
  client: DatabaseClient,
  options?: { limit?: number }
): Promise<{ claimed: number; succeeded: number; failed: number; deadLetter: number }> {
  const limit = options?.limit ?? 20;
  const pending = await client.query<{ id: string }>(
    `SELECT id FROM app.billing_list_pending_events($1)`,
    [limit]
  );

  const { processBillingEvent } = await loadProcessBillingEvent();
  let claimed = 0;
  let succeeded = 0;
  let failed = 0;
  let deadLetter = 0;

  for (const row of pending.rows) {
    claimed += 1;
    await processBillingEvent(client, { eventId: row.id });
    const status = await client.query<{ processing_status: string }>(
      `SELECT processing_status FROM app.billing_load_event($1)`,
      [row.id]
    );
    const st = status.rows[0]?.processing_status;
    if (st === 'succeeded') succeeded += 1;
    else if (st === 'dead_letter') deadLetter += 1;
    else if (st === 'failed') failed += 1;
  }

  return { claimed, succeeded, failed, deadLetter };
}
