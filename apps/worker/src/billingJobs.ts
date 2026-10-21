/**
 * Phase 57 repair — Durable billing event reconciliation and entitlement expiry.
 * Provider I/O runs outside short claim transactions (via API processBillingEvent).
 * Privileged SQL uses the daynori_billing pool (Phase 57 authority repair).
 */

import { pathToFileURL } from 'node:url';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool, PoolClient } from 'pg';
import type { DatabaseClient } from './worker.js';

type BillingServiceModule = {
  processBillingEvent: (
    pool: Pool,
    input: { eventId: string; leaseOwner?: string }
  ) => Promise<'skipped' | 'succeeded' | 'failed' | 'dead_letter'>;
  expireStaleEntitlements: (client: DatabaseClient, limit?: number) => Promise<number>;
  ensureBillingMaintenanceJobs: (client: DatabaseClient) => Promise<void>;
};

type BillingDbModule = {
  getDefaultBillingPool: () => Pool;
};

async function importFirst<T>(candidates: string[]): Promise<T> {
  let lastErr: unknown;
  for (const candidate of candidates) {
    try {
      return (await import(pathToFileURL(candidate).href)) as T;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(`Unable to import ${candidates[0]}`);
}

async function loadBillingModules(): Promise<BillingServiceModule & BillingDbModule> {
  const here = dirname(fileURLToPath(import.meta.url));
  const service = await importFirst<BillingServiceModule>([
    join(here, '../../api/dist/modules/billing/service.js'),
    join(here, '../../api/src/modules/billing/service.ts'),
  ]);
  const db = await importFirst<BillingDbModule>([
    join(here, '../../api/dist/db/client.js'),
    join(here, '../../api/src/db/client.ts'),
  ]);
  return {
    processBillingEvent: service.processBillingEvent,
    expireStaleEntitlements: service.expireStaleEntitlements,
    ensureBillingMaintenanceJobs: service.ensureBillingMaintenanceJobs,
    getDefaultBillingPool: db.getDefaultBillingPool,
  };
}

async function withBillingClient<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const { getDefaultBillingPool } = await loadBillingModules();
  const pool = getDefaultBillingPool();
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

export async function reconcilePendingBillingEvents(
  _client: DatabaseClient,
  pool: Pool,
  options?: { limit?: number }
): Promise<{ claimed: number; succeeded: number; failed: number; deadLetter: number }> {
  const { processBillingEvent } = await loadBillingModules();
  const limit = options?.limit ?? 20;
  const pending = await withBillingClient((billingClient) =>
    billingClient.query<{ id: string }>(`SELECT id FROM app.billing_list_pending_events($1)`, [
      limit,
    ])
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
  _client: DatabaseClient,
  options?: { limit?: number }
): Promise<{ expired: number }> {
  const { expireStaleEntitlements } = await loadBillingModules();
  return withBillingClient(async (billingClient) => {
    const expired = await expireStaleEntitlements(billingClient, options?.limit ?? 50);
    return { expired };
  });
}

export async function scheduleBillingMaintenance(_client: DatabaseClient): Promise<void> {
  const { ensureBillingMaintenanceJobs } = await loadBillingModules();
  await withBillingClient((billingClient) => ensureBillingMaintenanceJobs(billingClient));
}
