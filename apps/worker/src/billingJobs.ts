/**
 * Phase 57 repair — Durable billing event reconciliation and entitlement expiry.
 * Provider I/O runs outside short claim transactions (via API processBillingEvent).
 */

import { pathToFileURL } from 'node:url';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';
import type { DatabaseClient } from './worker.js';

async function loadBillingModule(): Promise<{
  processBillingEvent: (
    pool: Pool,
    input: { eventId: string; leaseOwner?: string }
  ) => Promise<'skipped' | 'succeeded' | 'failed' | 'dead_letter'>;
  activateBillingAuthority: (client: DatabaseClient) => Promise<void>;
  expireStaleEntitlements: (client: DatabaseClient, limit?: number) => Promise<number>;
  ensureBillingMaintenanceJobs: (client: DatabaseClient) => Promise<void>;
}> {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, '../../api/dist/modules/billing/service.js'),
    join(here, '../../api/src/modules/billing/service.ts'),
  ];
  let lastErr: unknown;
  for (const candidate of candidates) {
    try {
      return (await import(pathToFileURL(candidate).href)) as Awaited<
        ReturnType<typeof loadBillingModule>
      >;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Unable to load billing service module');
}

export async function reconcilePendingBillingEvents(
  client: DatabaseClient,
  pool: Pool,
  options?: { limit?: number }
): Promise<{ claimed: number; succeeded: number; failed: number; deadLetter: number }> {
  const { activateBillingAuthority, processBillingEvent } = await loadBillingModule();
  await activateBillingAuthority(client);
  const limit = options?.limit ?? 20;
  const pending = await client.query<{ id: string }>(
    `SELECT id FROM app.billing_list_pending_events($1)`,
    [limit]
  );

  let claimed = 0;
  let succeeded = 0;
  let failed = 0;
  let deadLetter = 0;

  for (const row of pending.rows) {
    claimed += 1;
    const result = await processBillingEvent(pool, {
      eventId: row.id,
      leaseOwner: `worker-reconcile-${row.id}`,
    });
    if (result === 'succeeded') succeeded += 1;
    else if (result === 'dead_letter') deadLetter += 1;
    else if (result === 'failed') failed += 1;
  }

  return { claimed, succeeded, failed, deadLetter };
}

export async function runBillingExpireEntitlements(
  client: DatabaseClient,
  options?: { limit?: number }
): Promise<{ expired: number }> {
  const { expireStaleEntitlements } = await loadBillingModule();
  const expired = await expireStaleEntitlements(client, options?.limit ?? 50);
  return { expired };
}

export async function scheduleBillingMaintenance(client: DatabaseClient): Promise<void> {
  const { ensureBillingMaintenanceJobs } = await loadBillingModule();
  await ensureBillingMaintenanceJobs(client);
}
