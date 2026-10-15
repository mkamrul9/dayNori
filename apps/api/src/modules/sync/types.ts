import crypto from 'node:crypto';

export interface DecodedSyncCursor {
  v: number;
  ws: string;
  seq: number;
  epoch: string;
  ts: string;
}

export const SUPPORTED_OFFLINE_HORIZON_MS = 90 * 24 * 60 * 60 * 1000; // 90 days in milliseconds

/**
 * Encodes an opaque, URL-safe base64 checkpoint cursor bound to workspace,
 * protocol version, sequence number, and access epoch.
 */
export function encodeSyncCursor(cursor: DecodedSyncCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

/**
 * Decodes and validates an opaque checkpoint cursor.
 * Throws errors if malformed or bound to a different workspace.
 */
export function decodeSyncCursor(encoded: string, expectedWorkspaceId: string): DecodedSyncCursor {
  try {
    const json = Buffer.from(encoded, 'base64url').toString('utf8');
    const parsed = JSON.parse(json);
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof parsed.v !== 'number' ||
      parsed.ws !== expectedWorkspaceId ||
      typeof parsed.seq !== 'number' ||
      typeof parsed.epoch !== 'string' ||
      typeof parsed.ts !== 'string'
    ) {
      throw new Error('MALFORMED_CURSOR');
    }
    return parsed as DecodedSyncCursor;
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'MALFORMED_CURSOR') {
      throw err;
    }
    throw new Error('MALFORMED_CURSOR');
  }
}

/**
 * Computes a deterministic SHA-256 hash of a command's canonical fields and payload.
 * Used for durable idempotency verification.
 */
export function computeCanonicalPayloadHash(cmd: {
  workspaceId: string;
  command: string;
  entityType: string;
  entityId: string;
  baseRevision: number;
  schemaVersion: number;
  payload: Record<string, unknown>;
}): string {
  // Sort payload keys deterministically
  const keys = Object.keys(cmd.payload).sort();
  const sortedObj: Record<string, unknown> = {};
  for (const k of keys) {
    sortedObj[k] = cmd.payload[k];
  }
  const payloadString = JSON.stringify(sortedObj);

  const raw = `${cmd.workspaceId}:${cmd.command}:${cmd.entityType}:${cmd.entityId}:${cmd.baseRevision}:${cmd.schemaVersion}:${payloadString}`;
  return crypto.createHash('sha256').update(raw).digest('hex');
}
