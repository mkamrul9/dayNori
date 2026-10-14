import type { FastifyRequest, FastifyReply } from 'fastify';

const SENSITIVE_HEADERS = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'x-refresh-token',
]);

const SENSITIVE_KEY_PATTERN = /(?:token|secret|password|bearer|auth|jwt|credential|key)/i;

/**
 * Recursively redacts sensitive values from objects before logging
 */
export function sanitizeLogValue(val: unknown, depth = 0): unknown {
  if (depth > 5 || val === null || val === undefined) {
    return val;
  }

  if (typeof val === 'string') {
    // Redact JWT tokens (ey...)
    if (/^ey[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(val)) {
      return '[REDACTED_JWT]';
    }
    // Redact postgres URLs containing passwords
    if (val.includes('postgres://') || val.includes('postgresql://')) {
      return val.replace(/(:)([^@]+)(@)/, '$1[REDACTED_PASSWORD]$3');
    }
    return val;
  }

  if (Array.isArray(val)) {
    return val.map((item) => sanitizeLogValue(item, depth + 1));
  }

  if (typeof val === 'object') {
    const sanitized: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      if (SENSITIVE_KEY_PATTERN.test(k)) {
        sanitized[k] = '[REDACTED]';
      } else {
        sanitized[k] = sanitizeLogValue(v, depth + 1);
      }
    }
    return sanitized;
  }

  return val;
}

export function sanitizeHeaders(headers: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(headers)) {
    if (SENSITIVE_HEADERS.has(k.toLowerCase()) || SENSITIVE_KEY_PATTERN.test(k)) {
      sanitized[k] = '[REDACTED]';
    } else {
      sanitized[k] = v;
    }
  }
  return sanitized;
}

export interface StructuredLogEntry {
  level: 'info' | 'warn' | 'error';
  timestamp: string;
  requestId: string;
  method?: string;
  url?: string;
  statusCode?: number;
  durationMs?: number;
  message: string;
  actorId?: string;
  details?: unknown;
}

export type LogSink = (entry: StructuredLogEntry) => void;

export class SafeLogger {
  private readonly sink: LogSink;

  constructor(sink?: LogSink) {
    this.sink =
      sink ??
      ((entry) => {
        // Default standard out JSON formatting
        const line = JSON.stringify(entry);
        if (entry.level === 'error') {
          process.stderr.write(line + '\n');
        } else {
          process.stdout.write(line + '\n');
        }
      });
  }

  logRequest(request: FastifyRequest, reply: FastifyReply, durationMs: number): void {
    const entry: StructuredLogEntry = {
      level: reply.statusCode >= 500 ? 'error' : reply.statusCode >= 400 ? 'warn' : 'info',
      timestamp: new Date().toISOString(),
      requestId: request.id,
      method: request.method,
      url: request.routeOptions?.url ?? request.url.split('?')[0],
      statusCode: reply.statusCode,
      durationMs: Math.round(durationMs * 100) / 100,
      message: `${request.method} ${request.routeOptions?.url ?? request.url.split('?')[0]} ${reply.statusCode} (${durationMs.toFixed(1)}ms)`,
      actorId: request.actor?.userId,
    };
    this.sink(entry);
  }

  error(requestId: string, message: string, details?: unknown): void {
    this.sink({
      level: 'error',
      timestamp: new Date().toISOString(),
      requestId,
      message,
      details: sanitizeLogValue(details),
    });
  }
}
