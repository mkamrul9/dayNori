import type { FastifyRequest, FastifyReply } from 'fastify';

const SENSITIVE_HEADERS = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'x-refresh-token',
  'x-access-token',
]);

const SENSITIVE_KEY_PATTERN =
  /(?:token|secret|password|bearer|auth|jwt|credential|key|refresh|hash)/i;

/**
 * Redacts secrets, passwords, tokens, and database credentials from string messages and stacks
 */
export function sanitizeLogString(str: string): string {
  if (!str || typeof str !== 'string') {
    return str;
  }

  return (
    str
      // Redact full or partial JWTs
      .replace(/ey[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, '[REDACTED_JWT]')
      // Redact postgres URLs containing passwords
      .replace(/(postgres(?:ql)?:\/\/[^:]+:)([^@]+)(@)/g, '$1[REDACTED_PASSWORD]$3')
      // Redact key-value secrets in messages or query params (e.g. password=xyz, secret: "xyz")
      .replace(
        /(?:password|secret|bearer|token|key|credential|authorization)\s*[:=]\s*["']?([^"'\s,;&]+)["']?/gi,
        (match, secretVal) => match.replace(secretVal, '[REDACTED]')
      )
  );
}

/**
 * Recursively redacts sensitive values from objects before logging
 */
export function sanitizeLogValue(val: unknown, depth = 0): unknown {
  if (depth > 5 || val === null || val === undefined) {
    return val;
  }

  if (typeof val === 'string') {
    return sanitizeLogString(val);
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
        const line = JSON.stringify(entry);
        if (entry.level === 'error') {
          process.stderr.write(line + '\n');
        } else {
          process.stdout.write(line + '\n');
        }
      });
  }

  logRequest(request: FastifyRequest, reply: FastifyReply, durationMs: number): void {
    const rawUrl = request.routeOptions?.url ?? request.url.split('?')[0] ?? '';
    const sanitizedUrl = sanitizeLogString(rawUrl);

    const entry: StructuredLogEntry = {
      level: reply.statusCode >= 500 ? 'error' : reply.statusCode >= 400 ? 'warn' : 'info',
      timestamp: new Date().toISOString(),
      requestId: request.id,
      method: request.method,
      url: sanitizedUrl,
      statusCode: reply.statusCode,
      durationMs: Math.round(durationMs * 100) / 100,
      message: `${request.method} ${sanitizedUrl} ${reply.statusCode} (${durationMs.toFixed(1)}ms)`,
      actorId: request.actor?.userId,
    };
    this.sink(entry);
  }

  error(requestId: string, message: string, details?: unknown): void {
    this.sink({
      level: 'error',
      timestamp: new Date().toISOString(),
      requestId,
      message: sanitizeLogString(message),
      details: sanitizeLogValue(details),
    });
  }
}
