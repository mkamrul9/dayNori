export interface KeysetCursor {
  createdAt: Date;
  id: string;
}

export function encodeCursor(createdAt: Date, id: string): string {
  const raw = `${createdAt.toISOString()}|${id}`;
  return Buffer.from(raw, 'utf-8').toString('base64url');
}

export function decodeCursor(cursor: string | undefined): KeysetCursor | null {
  if (!cursor || typeof cursor !== 'string') {
    return null;
  }

  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf-8');
    const [isoStr, id] = raw.split('|');
    if (!isoStr || !id) {
      return null;
    }
    const createdAt = new Date(isoStr);
    if (Number.isNaN(createdAt.getTime())) {
      return null;
    }
    return { createdAt, id };
  } catch {
    return null;
  }
}
