export class CursorValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CursorValidationError';
  }
}

export interface KeysetCursorOptions {
  workspaceId: string;
  kind?: string;
  createdAt: Date;
  id: string;
}

export interface ExpectedCursorContext {
  workspaceId: string;
  kind?: string;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function encodeCursor(options: KeysetCursorOptions): string {
  const kind = options.kind ?? '';
  const raw = `${options.workspaceId}|${kind}|${options.createdAt.toISOString()}|${options.id}`;
  return Buffer.from(raw, 'utf-8').toString('base64url');
}

export function decodeCursor(
  cursor: string | undefined,
  expectedContext: ExpectedCursorContext
): { createdAt: Date; id: string } | null {
  if (!cursor || typeof cursor !== 'string') {
    return null;
  }

  // Reject oversized cursors (> 256 characters)
  if (cursor.length > 256) {
    throw new CursorValidationError('Pagination cursor exceeds maximum allowed length');
  }

  let raw: string;
  try {
    raw = Buffer.from(cursor, 'base64url').toString('utf-8');
  } catch {
    throw new CursorValidationError('Pagination cursor encoding is invalid');
  }

  const parts = raw.split('|');
  const wsId = parts[0];
  const kind = parts[1];
  const isoStr = parts[2];
  const id = parts[3];

  if (!wsId || kind === undefined || !isoStr || !id) {
    throw new CursorValidationError('Pagination cursor structure is invalid');
  }

  // Bind cursor to requested workspace
  if (wsId !== expectedContext.workspaceId) {
    throw new CursorValidationError('Pagination cursor belongs to a different workspace context');
  }

  // Bind cursor to active filter (kind)
  const expectedKind = expectedContext.kind ?? '';
  if (kind !== expectedKind) {
    throw new CursorValidationError('Pagination cursor does not match the active filter');
  }

  const createdAt = new Date(isoStr);
  if (Number.isNaN(createdAt.getTime())) {
    throw new CursorValidationError('Pagination cursor contains an invalid timestamp');
  }

  if (!UUID_REGEX.test(id)) {
    throw new CursorValidationError('Pagination cursor contains an invalid item identifier');
  }

  return { createdAt, id };
}
