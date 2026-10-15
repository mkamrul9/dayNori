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
 * Safely converts a Postgres bigint string or bigint to a JavaScript number.
 * Throws RangeError if outside safe integer representation bounds.
 */
export function safeBigIntToNumber(val: string | number | bigint, fieldName = 'number'): number {
  const bi = typeof val === 'bigint' ? val : BigInt(val);
  if (bi > BigInt(Number.MAX_SAFE_INTEGER) || bi < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new RangeError(`Value for ${fieldName} exceeds safe integer range: ${val.toString()}`);
  }
  return Number(bi);
}

/**
 * Encodes an opaque, URL-safe base64 checkpoint cursor bound to workspace,
 * protocol version, sequence number, and access epoch.
 */
export function encodeSyncCursor(cursor: DecodedSyncCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

/**
 * Decodes and validates an opaque checkpoint cursor.
 * Enforces structure, version, sequence range, workspace boundary, and timestamps.
 */
export function decodeSyncCursor(encoded: string, expectedWorkspaceId: string): DecodedSyncCursor {
  let parsed: unknown;
  try {
    const json = Buffer.from(encoded, 'base64url').toString('utf8');
    parsed = JSON.parse(json);
  } catch {
    throw new Error('MALFORMED_CURSOR');
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('MALFORMED_CURSOR');
  }

  const c = parsed as Record<string, unknown>;

  // Protocol version check
  if (typeof c['v'] !== 'number' || c['v'] !== 1) {
    throw new Error('SYNC_RESET_REQUIRED: Unsupported sync cursor protocol version.');
  }

  // Workspace binding check
  if (typeof c['ws'] !== 'string' || c['ws'] !== expectedWorkspaceId) {
    throw new Error('MALFORMED_CURSOR');
  }

  // Sequence range check (must be a non-negative safe integer)
  if (
    typeof c['seq'] !== 'number' ||
    !Number.isSafeInteger(c['seq']) ||
    c['seq'] < 0
  ) {
    throw new Error('MALFORMED_CURSOR');
  }

  // Access epoch check
  if (typeof c['epoch'] !== 'string' || c['epoch'].trim().length === 0) {
    throw new Error('MALFORMED_CURSOR');
  }

  // Timestamp check
  if (typeof c['ts'] !== 'string') {
    throw new Error('MALFORMED_CURSOR');
  }
  const timestampMs = Date.parse(c['ts']);
  if (Number.isNaN(timestampMs)) {
    throw new Error('MALFORMED_CURSOR');
  }

  const ageMs = Date.now() - timestampMs;
  if (ageMs > SUPPORTED_OFFLINE_HORIZON_MS) {
    throw new Error('SYNC_RESET_REQUIRED: Cursor expired beyond 90-day offline horizon.');
  }

  return {
    v: c['v'],
    ws: c['ws'],
    seq: c['seq'],
    epoch: c['epoch'],
    ts: c['ts'],
  };
}

/**
 * Deterministically and recursively canonicalizes arbitrary JSON objects and arrays.
 * Sorts all nested object keys while preserving array element order.
 */
export function canonicalizeJson(value: unknown): unknown {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(canonicalizeJson);
  }
  const obj = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = canonicalizeJson(obj[key]);
  }
  return sorted;
}

/**
 * Computes a deterministic SHA-256 hash of a command's immutable semantics and payload.
 * Covers workspaceId, command, commandVersion, schemaVersion, entityType, entityId,
 * baseRevision, dependencyOperationIds, and recursively sorted payload.
 */
export function computeCanonicalPayloadHash(cmd: {
  workspaceId: string;
  command: string;
  commandVersion?: number;
  schemaVersion: number;
  entityType: string;
  entityId: string;
  baseRevision: number;
  dependencyOperationIds?: string[];
  payload: Record<string, unknown>;
}): string {
  const canonicalPayload = JSON.stringify(canonicalizeJson(cmd.payload));
  const deps = Array.isArray(cmd.dependencyOperationIds)
    ? [...cmd.dependencyOperationIds].sort()
    : [];
  const cmdVer = typeof cmd.commandVersion === 'number' ? cmd.commandVersion : 1;

  const raw = [
    cmd.workspaceId,
    cmd.command,
    cmdVer,
    cmd.schemaVersion,
    cmd.entityType,
    cmd.entityId,
    cmd.baseRevision,
    JSON.stringify(deps),
    canonicalPayload,
  ].join(':');

  return crypto.createHash('sha256').update(raw).digest('hex');
}
