/**
 * Phase 53 repair — durable chat publication recovery.
 * Uses SECURITY DEFINER claim/mark helpers so runtime can drain without a user JWT.
 * published_at means offered to the local publication path — not end-user delivery.
 */

import type { Pool, PoolClient } from 'pg';
import { publishRoomChatEvent } from './localRealtimeBus.js';

export type ChatPublicationRecoveryOptions = {
  batchSize?: number;
  intervalMs?: number;
  logger?: (level: 'info' | 'warn' | 'error', msg: string, meta?: Record<string, unknown>) => void;
};

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

async function withRuntimeTx<T>(
  pool: Pool,
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    throw err;
  } finally {
    client.release();
  }
}

export async function recoverUnpublishedChatEventsBatch(
  pool: Pool,
  batchSize = 100
): Promise<{ recovered: number }> {
  return withRuntimeTx(pool, async (client) => {
    const events = await client.query<{
      event_id: string;
      workspace_id: string;
      server_order: string | number;
      event_type: 'room_message.created' | 'room_message.edited' | 'room_message.deleted';
      message_id: string;
    }>(`SELECT * FROM app.claim_unpublished_room_chat_events($1)`, [batchSize]);

    let recovered = 0;
    for (const ev of events.rows) {
      publishRoomChatEvent({
        roomId: ev.workspace_id,
        serverOrder: Number(ev.server_order),
        eventType: ev.event_type,
        messageId: ev.message_id,
        at: new Date().toISOString(),
      });
      await client.query(`SELECT app.mark_room_chat_event_published($1)`, [ev.event_id]);
      recovered += 1;
    }
    return { recovered };
  });
}

/**
 * Starts a process-local recovery loop once per API/worker process.
 * This is not a member-authorized subscription transport.
 */
export function startChatPublicationRecovery(
  pool: Pool,
  options: ChatPublicationRecoveryOptions = {}
): () => void {
  const intervalMs = options.intervalMs ?? 5000;
  const batchSize = options.batchSize ?? 100;
  const log = options.logger;

  if (timer) {
    return () => stopChatPublicationRecovery();
  }

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const result = await recoverUnpublishedChatEventsBatch(pool, batchSize);
      if (result.recovered > 0) {
        log?.('info', 'Recovered unpublished chat events', result);
      }
    } catch (err) {
      log?.('warn', 'Chat publication recovery tick failed', {
        err: err instanceof Error ? err.message : String(err),
      });
    } finally {
      running = false;
    }
  };

  void tick();
  timer = setInterval(() => {
    void tick();
  }, intervalMs);

  return () => stopChatPublicationRecovery();
}

export function stopChatPublicationRecovery(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  running = false;
}
